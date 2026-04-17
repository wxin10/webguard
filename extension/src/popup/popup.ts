import { pauseSite, syncPluginBootstrap, syncPluginEvent, testBackendConnection, trustSite } from '../utils/api.js';
import { buildReportUrl } from '../utils/navigation.js';
import {
  getSettings,
  getTabRiskRecord,
  hostFromUrl,
  isHostPaused,
  isHttpUrl,
  isTrustedHost,
} from '../utils/storage.js';
import type { RuntimeError, TabRiskRecord, TabRiskState } from '../utils/storage.js';

interface ScanResponse {
  ok: boolean;
  record: TabRiskRecord | null;
  error?: RuntimeError;
}

const currentUrlElement = document.getElementById('current-url');
const backendStatusElement = document.getElementById('backend-status');
const riskBadgeElement = document.getElementById('risk-badge');
const statusTextElement = document.getElementById('status-text');
const riskScoreElement = document.getElementById('risk-score');
const riskBarElement = document.getElementById('risk-bar');
const scanTimeElement = document.getElementById('scan-time');
const riskLabelElement = document.getElementById('risk-label');
const riskSummaryElement = document.getElementById('risk-summary');
const pageMessageElement = document.getElementById('page-message');

const scanButton = document.getElementById('scan-button') as HTMLButtonElement | null;
const warningButton = document.getElementById('warning-button') as HTMLButtonElement | null;
const reportButton = document.getElementById('report-button') as HTMLButtonElement | null;
const pauseButton = document.getElementById('pause-button') as HTMLButtonElement | null;
const trustButton = document.getElementById('trust-button') as HTMLButtonElement | null;
const optionsButton = document.getElementById('options-button') as HTMLButtonElement | null;

let currentTab: chrome.tabs.Tab | null = null;
let currentRecord: TabRiskRecord | null = null;

void init().catch((error) => {
  console.error('[WebGuard] Popup init failed.', error);
  showMessage(`插件初始化失败：${errorMessage(error)}`, true);
});

async function init(): Promise<void> {
  bindEvents();
  void syncPluginBootstrap();

  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tabs[0] ?? null;
  const currentUrl = currentTab?.url ?? '';

  setText(currentUrlElement, currentUrl || '无法读取当前页面 URL');

  if (!currentTab?.id || !currentUrl) {
    setActionAvailability(false);
    renderEmptyState('无法读取当前标签页。');
    return;
  }

  if (!isHttpUrl(currentUrl)) {
    setActionAvailability(false);
    reportButton?.removeAttribute('disabled');
    renderEmptyState('当前页面不是 http/https 页面，WebGuard 不会扫描浏览器内部页、扩展页或本地文件。');
    return;
  }

  setActionAvailability(true);
  await renderBackendStatus();
  currentRecord = await getTabRiskRecord(currentTab.id, currentUrl);
  await renderRecordWithDecisions(currentRecord);
}

function bindEvents(): void {
  scanButton?.addEventListener('click', () => void scanCurrentTab());
  warningButton?.addEventListener('click', () => void openWarningPage());
  reportButton?.addEventListener('click', () => void openReport());
  pauseButton?.addEventListener('click', () => void pauseCurrentSite());
  trustButton?.addEventListener('click', () => void trustCurrentSite());
  optionsButton?.addEventListener('click', () => void chrome.runtime.openOptionsPage());
}

async function renderBackendStatus(): Promise<void> {
  const health = await testBackendConnection();
  if (!backendStatusElement) return;
  backendStatusElement.textContent = health.ok ? '后端在线' : '后端不可达';
  backendStatusElement.className = `badge ${health.ok ? 'connected' : 'disconnected'}`;
  if (!health.ok) {
    showMessage(`后端不可达：${health.message}`, true);
  }
}

async function renderRecordWithDecisions(record: TabRiskRecord | null): Promise<void> {
  if (!currentTab?.url || !isHttpUrl(currentTab.url)) return;
  const host = hostFromUrl(currentTab.url);

  if (!record) {
    if (await isTrustedHost(host)) {
      renderEmptyState('当前站点已在主平台信任策略中，自动扫描会跳过。', 'safe');
      return;
    }
    if (await isHostPaused(host)) {
      renderEmptyState('当前站点处于临时信任期，保护将在到期后恢复。', 'idle');
      return;
    }
    renderEmptyState('暂无当前页面检测结果。可以点击重新扫描。');
    return;
  }

  renderRecord(record);
}

function renderRecord(record: TabRiskRecord): void {
  const state = record.state;
  const result = record.result;
  const labelText = result ? riskLabelText(result.label) : stateText(state);
  const score = result ? result.risk_score : null;
  const summary = record.error?.message ?? result?.summary ?? stateSummary(state);

  setText(riskBadgeElement, labelText);
  setClass(riskBadgeElement, `badge ${state}`);
  setText(statusTextElement, stateText(state));
  setText(riskScoreElement, score === null ? '--' : score.toFixed(1));
  setText(scanTimeElement, new Date(record.updatedAt).toLocaleString());
  setText(riskLabelElement, labelText);
  setText(riskSummaryElement, summary);
  updateRiskBar(score ?? 0, state);

  currentRecord = record;
  warningButton?.toggleAttribute('disabled', !(record.result?.label === 'suspicious' || record.result?.label === 'malicious'));
  reportButton?.removeAttribute('disabled');
}

function renderEmptyState(message: string, state: TabRiskState = 'idle'): void {
  setText(riskBadgeElement, stateText(state));
  setClass(riskBadgeElement, `badge ${state}`);
  setText(statusTextElement, stateText(state));
  setText(riskScoreElement, '--');
  setText(scanTimeElement, '--');
  setText(riskLabelElement, '--');
  setText(riskSummaryElement, message);
  updateRiskBar(0, state);
  warningButton?.setAttribute('disabled', 'true');
  currentRecord = null;
}

async function scanCurrentTab(): Promise<void> {
  if (!currentTab?.id || !currentTab.url || !isHttpUrl(currentTab.url)) return;
  scanButton?.setAttribute('disabled', 'true');
  clearMessage();
  renderRecord({
    tabId: currentTab.id,
    url: currentTab.url,
    state: 'scanning',
    updatedAt: Date.now(),
  });

  try {
    const response = await sendRuntimeMessage<unknown>({
      type: 'WEBGUARD_SCAN_TAB',
      tabId: currentTab.id,
    });
    if (!isScanResponse(response)) throw new Error('后台返回了无效扫描结果。');
    if (response.record) renderRecord(response.record);
    if (!response.ok && response.error) showMessage(response.error.message, true);
  } catch (error) {
    showMessage(`扫描失败：${errorMessage(error)}`, true);
  } finally {
    scanButton?.removeAttribute('disabled');
    await renderBackendStatus();
  }
}

async function openWarningPage(): Promise<void> {
  if (!currentTab?.id || !currentRecord?.result) {
    showMessage('当前页面还没有可用于 warning 的检测结果。', true);
    return;
  }
  if (currentRecord.result.label !== 'suspicious' && currentRecord.result.label !== 'malicious') {
    showMessage('当前检测结果不是可疑或恶意状态，无需打开 warning 页面。', true);
    return;
  }
  await sendRuntimeMessage<unknown>({
    type: 'WEBGUARD_OPEN_WARNING',
    tabId: currentTab.id,
    result: currentRecord.result,
  });
  window.close();
}

async function openReport(): Promise<void> {
  const settings = await getSettings();
  const reportId = currentRecord?.result?.report_id || currentRecord?.result?.record_id;
  const reportUrl = buildReportUrl(settings.webBaseUrl, reportId);
  if (currentTab?.url) {
    await syncPluginEvent({
      event_type: 'scan',
      action: 'open_report_from_popup',
      url: currentTab.url,
      domain: hostFromUrl(currentTab.url),
      risk_label: currentRecord?.result?.label,
      risk_score: currentRecord?.result?.risk_score,
      summary: currentRecord?.result?.summary,
      scan_record_id: reportId,
    });
  }
  await chrome.tabs.create({ url: reportUrl });
}

async function pauseCurrentSite(): Promise<void> {
  const host = hostFromCurrentTab();
  if (!host) {
    showMessage('当前页面无法临时信任。', true);
    return;
  }

  pauseButton?.setAttribute('disabled', 'true');
  try {
    const status = await pauseSite(host, 30);
    showMessage(status === 'synced'
      ? `${host} 已临时信任 30 分钟，并同步到主平台。`
      : `${host} 已写入本地临时信任 30 分钟；后端恢复后请在主平台确认。`);
  } catch (error) {
    showMessage(`临时信任失败：${errorMessage(error)}`, true);
  } finally {
    pauseButton?.removeAttribute('disabled');
  }
}

async function trustCurrentSite(): Promise<void> {
  const host = hostFromCurrentTab();
  if (!host) {
    showMessage('当前页面无法加入永久信任。', true);
    return;
  }

  trustButton?.setAttribute('disabled', 'true');
  try {
    await trustSite(host);
    showMessage(`${host} 已永久信任，并同步到主平台。`);
  } catch (error) {
    showMessage(`永久信任需要写入主平台，目前失败：${errorMessage(error)}`, true);
  } finally {
    trustButton?.removeAttribute('disabled');
  }
}

function setActionAvailability(enabled: boolean): void {
  for (const button of [scanButton, warningButton, pauseButton, trustButton]) {
    button?.toggleAttribute('disabled', !enabled);
  }
}

function updateRiskBar(score: number, state: TabRiskState): void {
  if (!riskBarElement) return;
  riskBarElement.style.width = `${Math.max(0, Math.min(100, score))}%`;
  riskBarElement.className = state;
}

function hostFromCurrentTab(): string {
  return currentTab?.url ? hostFromUrl(currentTab.url) : '';
}

function riskLabelText(label: string): string {
  if (label === 'safe') return '安全';
  if (label === 'suspicious') return '可疑';
  if (label === 'malicious') return '恶意';
  return '未知';
}

function stateText(state: TabRiskState): string {
  const labels: Record<TabRiskState, string> = {
    idle: '待扫描',
    scanning: '扫描中',
    safe: '安全',
    suspicious: '可疑',
    malicious: '恶意',
    error: '错误',
  };
  return labels[state];
}

function stateSummary(state: TabRiskState): string {
  const summaries: Record<TabRiskState, string> = {
    idle: '暂无当前页面检测结果。',
    scanning: '正在读取页面内容并请求后端检测。',
    safe: '当前页面未发现明显风险。',
    suspicious: '当前页面存在可疑信号，请谨慎操作。',
    malicious: '当前页面命中高风险检测规则，建议立即离开。',
    error: '检测失败，请检查后端服务或刷新页面后重试。',
  };
  return summaries[state];
}

function showMessage(message: string, isError = false): void {
  if (!pageMessageElement) return;
  pageMessageElement.textContent = message;
  pageMessageElement.className = `message ${isError ? 'error' : 'success'}`;
}

function clearMessage(): void {
  if (!pageMessageElement) return;
  pageMessageElement.textContent = '';
  pageMessageElement.className = 'message';
}

function setText(element: HTMLElement | null, value: string): void {
  if (element) element.textContent = value;
}

function setClass(element: HTMLElement | null, value: string): void {
  if (element) element.className = value;
}

function sendRuntimeMessage<T>(message: Record<string, unknown>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: T) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

function isScanResponse(value: unknown): value is ScanResponse {
  return isRecord(value)
    && typeof value.ok === 'boolean'
    && 'record' in value
    && (value.record === null || isTabRiskRecord(value.record));
}

function isTabRiskRecord(value: unknown): value is TabRiskRecord {
  return isRecord(value)
    && typeof value.tabId === 'number'
    && typeof value.url === 'string'
    && typeof value.state === 'string'
    && typeof value.updatedAt === 'number';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '未知错误';
}
