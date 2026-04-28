import { analyzeCurrentPage, ensurePluginBootstrapFresh, syncPluginEvent } from './utils/api.js';
import { resolveDetectionDecision } from './utils/detection.js';
import { buildWarningPageUrl } from './utils/navigation.js';
import {
  consumeTemporaryBypass,
  createRuntimeError,
  getSettings,
  hostFromUrl,
  isBlockedByPolicy,
  isHostPaused,
  isHttpUrl,
  isTrustedHost,
  setTabState,
  stateFromRiskLabel,
  tabStateKey,
} from './utils/storage.js';
import type { DetectionResult, PageInfo, RuntimeError, TabRiskRecord } from './utils/storage.js';

type ScanTrigger = 'auto' | 'manual';

interface ScanResponse {
  ok: boolean;
  record: TabRiskRecord | null;
  error?: RuntimeError;
}

interface ScanMessage {
  type: 'WEBGUARD_SCAN_TAB';
  tabId?: number;
}

interface GetStateMessage {
  type: 'WEBGUARD_GET_TAB_STATE';
  tabId?: number;
  url?: string;
}

interface OpenWarningMessage {
  type: 'WEBGUARD_OPEN_WARNING';
  tabId?: number;
  result?: DetectionResult;
}

type RuntimeMessage = ScanMessage | GetStateMessage | OpenWarningMessage;

const activeScans = new Set<string>();

chrome.runtime.onInstalled.addListener(() => {
  logInfo('Installed. Syncing platform bootstrap.');
  void ensurePluginBootstrapFresh(true);
});

chrome.runtime.onStartup.addListener(() => {
  logInfo('Startup. Syncing platform bootstrap.');
  void ensurePluginBootstrapFresh(true);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  const url = tab.url;
  if (!url) return;
  if (isExtensionPageUrl(url)) {
    void setTabState(tabId, url, 'idle');
    return;
  }
  if (!isHttpUrl(url)) return;

  void getSettings()
    .then(async (settings) => {
      if (isPlatformUrl(url, settings.apiBaseUrl, settings.webBaseUrl)) {
        await setTabState(tabId, url, 'idle');
        return;
      }
      if (settings.autoDetect) {
        await scheduleScan(tabId, url, 'auto');
      } else {
        await setTabState(tabId, url, 'idle');
      }
    })
    .catch((error) => logError('Auto scan scheduling failed.', error));
});

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  void handleRuntimeMessage(message)
    .then((response) => sendResponse(response))
    .catch((error) => {
      logError('Message handling failed.', error);
      sendResponse({
        ok: false,
        record: null,
        error: createRuntimeError(errorMessage(error), undefined, 'message_failed'),
      } satisfies ScanResponse);
    });
  return true;
});

async function handleRuntimeMessage(message: unknown): Promise<unknown> {
  if (isLegacyScanMessage(message) || isScanMessage(message)) {
    const tab = await resolveTargetTab(isScanMessage(message) ? message.tabId : undefined);
    if (!tab?.id || !tab.url) {
      return {
        ok: false,
        record: null,
        error: createRuntimeError('无法读取当前标签页。', undefined, 'tab_unavailable'),
      } satisfies ScanResponse;
    }
    return scheduleScan(tab.id, tab.url, 'manual');
  }

  if (isGetStateMessage(message)) {
    const tab = await resolveTargetTab(message.tabId);
    const tabId = message.tabId ?? tab?.id;
    const url = message.url ?? tab?.url;
    if (!tabId || !url) return null;
    return getStoredState(tabId, url);
  }

  if (isOpenWarningMessage(message)) {
    const tab = await resolveTargetTab(message.tabId);
    if (!tab?.id || !message.result) return false;
    await redirectToWarning(tab.id, message.result, 'manual_open');
    return true;
  }

  return null;
}

async function scheduleScan(tabId: number, url: string, trigger: ScanTrigger): Promise<ScanResponse> {
  if (isExtensionPageUrl(url)) {
    const record = await setTabState(tabId, url, 'idle');
    return { ok: true, record };
  }

  if (!isHttpUrl(url)) {
    const error = createRuntimeError('当前页面不是可扫描的 http/https 页面。', url, 'unsupported_url');
    const record = await setTabState(tabId, url, 'error', undefined, error);
    return { ok: false, record, error };
  }

  const key = tabStateKey(tabId, url);
  if (activeScans.has(key)) {
    return { ok: true, record: await getStoredState(tabId, url) };
  }

  activeScans.add(key);
  logInfo(`Scan started. trigger=${trigger} tab=${tabId} url=${url}`);

  try {
    await setTabState(tabId, url, 'scanning');
    const settings = await getSettings();
    if (isPlatformUrl(url, settings.apiBaseUrl, settings.webBaseUrl)) {
      const record = await setTabState(tabId, url, 'idle');
      return { ok: true, record };
    }
    await ensurePluginBootstrapFresh();

    if (await consumeTemporaryBypass(url)) {
      const record = await setTabState(tabId, url, 'idle');
      await syncPluginEvent({
        event_type: 'bypass',
        action: 'continue_once_consumed',
        url,
        domain: hostFromUrl(url),
        summary: '一次性继续访问已消耗，本次扫描跳过。',
      });
      return { ok: true, record };
    }

    const host = hostFromUrl(url);
    if (await isBlockedByPolicy(host)) {
      const blockedResult = createLocalDecisionResult(url, 'malicious', '当前站点命中平台下发的阻止策略。');
      const record = await handleDetectionResult(tabId, url, blockedResult);
      await syncPluginEvent({
        event_type: 'scan',
        action: 'local_policy_blocked',
        url,
        domain: host,
        risk_level: 'malicious',
        risk_score: blockedResult.risk_score,
        summary: blockedResult.summary,
      });
      return { ok: true, record };
    }

    if (await isTrustedHost(host)) {
      const trustedResult = createLocalDecisionResult(url, 'safe', '当前站点命中平台下发的信任策略，本次未调用后端扫描。');
      const record = await setTabState(tabId, url, 'safe', trustedResult);
      await syncPluginEvent({
        event_type: 'scan',
        action: 'local_policy_trusted',
        url,
        domain: host,
        risk_level: 'safe',
        risk_score: 0,
        summary: trustedResult.summary,
      });
      return { ok: true, record };
    }

    if (await isHostPaused(host)) {
      const record = await setTabState(tabId, url, 'idle');
      await syncPluginEvent({
        event_type: 'bypass',
        action: 'temporary_trust_active',
        url,
        domain: host,
        summary: '当前站点已暂时信任，本次扫描已跳过。',
      });
      return { ok: true, record };
    }

    const pageInfo = await collectPageInfo(tabId);
    const result = await analyzeCurrentPage(pageInfo);
    const record = await handleDetectionResult(tabId, url, result);
    return { ok: true, record };
  } catch (error) {
    const runtimeError = createRuntimeError(errorMessage(error), url, 'scan_failed');
    const record = await setTabState(tabId, url, 'error', undefined, runtimeError);
    await syncPluginEvent({
      event_type: 'error',
      action: 'scan_failed',
      url,
      domain: hostFromUrl(url),
      summary: runtimeError.message,
      metadata: { code: runtimeError.code },
    });
    logError(`Scan failed. tab=${tabId} url=${url}`, error);
    return { ok: false, record, error: runtimeError };
  } finally {
    activeScans.delete(key);
  }
}

function isPlatformUrl(url: string, apiBaseUrl: string, webBaseUrl: string): boolean {
  const host = hostFromUrl(url);
  if (!host) return false;
  return [apiBaseUrl, webBaseUrl].some((baseUrl) => hostFromUrl(baseUrl) === host);
}

function isExtensionPageUrl(url: string): boolean {
  return url.startsWith(chrome.runtime.getURL(''));
}

async function handleDetectionResult(tabId: number, originalUrl: string, result: DetectionResult): Promise<TabRiskRecord> {
  const state = stateFromRiskLabel(result.label);
  const record = await setTabState(tabId, originalUrl, state, result);
  const settings = await getSettings();
  const decision = resolveDetectionDecision(result);

  logInfo(`Scan finished. tab=${tabId} state=${state} score=${result.risk_score} action=${decision.action}`);

  if (decision.shouldWarn && result.label === 'suspicious' && settings.notifySuspicious) {
    notifyRisk('WebGuard 可疑站点提醒', `风险评分 ${result.risk_score.toFixed(1)}：${result.summary}`);
  }

  if (decision.shouldWarn && result.label === 'malicious') {
    notifyRisk('WebGuard 安全警告', `检测到高风险站点，风险评分 ${result.risk_score.toFixed(1)}`);
  }

  if (decision.shouldBlock && settings.autoBlockMalicious) {
    await redirectToWarning(tabId, result, 'auto_block');
  }

  return record;
}

async function redirectToWarning(tabId: number, result: DetectionResult, action: string): Promise<void> {
  const warningUrl = buildWarningPageUrl(result);
  logInfo(`Redirecting to warning page. tab=${tabId} url=${result.url}`);
  await syncPluginEvent({
    event_type: 'warning',
    action,
    url: result.url,
    domain: hostFromUrl(result.url),
    risk_label: result.label,
    risk_score: result.risk_score,
    summary: result.summary || result.explanation,
    scan_record_id: result.report_id || result.record_id,
  });
  await chrome.tabs.update(tabId, { url: warningUrl });
}

async function collectPageInfo(tabId: number): Promise<PageInfo> {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: 'WEBGUARD_COLLECT_PAGE_INFO' });
    if (isPageInfo(response)) return response;
    throw new Error('页面内容脚本返回了无效数据。');
  } catch (error) {
    throw new Error(`无法读取页面内容，请刷新页面后重试：${errorMessage(error)}`);
  }
}

async function resolveTargetTab(tabId?: number): Promise<chrome.tabs.Tab | null> {
  if (typeof tabId === 'number') {
    try {
      return await chrome.tabs.get(tabId);
    } catch {
      return null;
    }
  }
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] ?? null;
}

async function getStoredState(tabId: number, url: string): Promise<TabRiskRecord | null> {
  const { getTabRiskRecord } = await import('./utils/storage.js');
  return getTabRiskRecord(tabId, url);
}

function createLocalDecisionResult(url: string, label: 'safe' | 'malicious', summary: string): DetectionResult {
  return {
    url,
    label,
    risk_score: label === 'malicious' ? 100 : 0,
    summary,
    action: label === 'malicious' ? 'BLOCK' : 'ALLOW',
    should_warn: label === 'malicious',
    should_block: label === 'malicious',
    timestamp: Date.now(),
  };
}

function notifyRisk(title: string, message: string): void {
  chrome.notifications.create(
    {
      type: 'basic',
      iconUrl: 'icons/128.png',
      title,
      message,
    },
    () => {
      if (chrome.runtime.lastError) {
        logError('Notification failed.', chrome.runtime.lastError);
      }
    },
  );
}

function isScanMessage(message: unknown): message is ScanMessage {
  return isRecord(message) && message.type === 'WEBGUARD_SCAN_TAB';
}

function isLegacyScanMessage(message: unknown): boolean {
  return isRecord(message) && message.action === 'scan';
}

function isGetStateMessage(message: unknown): message is GetStateMessage {
  return isRecord(message) && message.type === 'WEBGUARD_GET_TAB_STATE';
}

function isOpenWarningMessage(message: unknown): message is OpenWarningMessage {
  return isRecord(message) && message.type === 'WEBGUARD_OPEN_WARNING';
}

function isPageInfo(value: unknown): value is PageInfo {
  return (
    isRecord(value)
    && typeof value.url === 'string'
    && typeof value.title === 'string'
    && typeof value.visible_text === 'string'
    && Array.isArray(value.button_texts)
    && Array.isArray(value.input_labels)
    && Array.isArray(value.form_action_domains)
    && typeof value.has_password_input === 'boolean'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function logInfo(message: string): void {
  console.info(`[WebGuard] ${message}`);
}

function logError(message: string, error: unknown): void {
  console.error(`[WebGuard] ${message}`, error);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '未知错误';
}
