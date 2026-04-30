import { pauseSite, syncPluginEvent, trustSite } from '../utils/api.js';
import { buildReportUrl, parseWarningPageParams } from '../utils/navigation.js';
import { createTemporaryBypass, getSettings, hostFromUrl, isHttpUrl } from '../utils/storage.js';

const params = parseWarningPageParams(window.location.search);

const titleElement = document.getElementById('warning-title');
const urlElement = document.getElementById('warning-url');
const riskLabelElement = document.getElementById('risk-label');
const riskScoreElement = document.getElementById('risk-score');
const detectedAtElement = document.getElementById('detected-at');
const summaryElement = document.getElementById('risk-summary');
const sourceBadgesElement = document.getElementById('source-badges');
const sourceExplanationElement = document.getElementById('source-explanation');
const messageElement = document.getElementById('action-message');

const backButton = document.getElementById('back-button') as HTMLButtonElement | null;
const continueOnceButton = document.getElementById('continue-once-button') as HTMLButtonElement | null;
const trustTemporaryButton = document.getElementById('trust-temporary-button') as HTMLButtonElement | null;
const trustPermanentButton = document.getElementById('trust-permanent-button') as HTMLButtonElement | null;
const reportButton = document.getElementById('report-button') as HTMLButtonElement | null;

render();
bindEvents();

function render(): void {
  if (!params) {
    setText(titleElement, 'WebGuard 警告信息无效');
    setText(urlElement, '缺少原始地址');
    setText(riskLabelElement, '--');
    setText(riskScoreElement, '--');
    setText(detectedAtElement, '--');
    setText(summaryElement, '当前安全预警页面缺少必要参数。请关闭此页，并从浏览器助手弹窗重新扫描。');
    setText(sourceExplanationElement, '检测来源参数不可用。');
    disableRiskActions();
    return;
  }

  setText(titleElement, params.label === 'suspicious' ? '检测到可疑网站' : '检测到恶意网站');
  setText(urlElement, params.url);
  setText(riskLabelElement, riskLabelText(params.label));
  setText(riskScoreElement, params.riskScore.toFixed(1));
  setText(detectedAtElement, new Date(params.detectedAt).toLocaleString());
  setText(summaryElement, params.summary);
  renderSourceExplanation();
}

function bindEvents(): void {
  backButton?.addEventListener('click', () => void leavePage());
  continueOnceButton?.addEventListener('click', () => void continueOnce());
  trustTemporaryButton?.addEventListener('click', () => void trustTemporarily());
  trustPermanentButton?.addEventListener('click', () => void trustPermanently());
  reportButton?.addEventListener('click', () => void openReport());
}

async function leavePage(): Promise<void> {
  if (window.history.length > 1) {
    window.history.back();
    return;
  }

  try {
    const currentTab = await chrome.tabs.getCurrent();
    if (currentTab?.id) {
      await chrome.tabs.remove(currentTab.id);
      return;
    }
  } catch {
    // Some browsers do not allow closing the current extension page here.
  }

  window.location.replace('about:blank');
}

async function continueOnce(): Promise<void> {
  if (!params || !isHttpUrl(params.url)) {
    showMessage('原始地址无效，无法继续访问。', true);
    return;
  }

  setBusy(continueOnceButton, true);
  try {
    await createTemporaryBypass(params.url);
    await syncPluginEvent({
      event_type: 'bypass',
      action: 'continue_once',
      url: params.url,
      domain: hostFromUrl(params.url),
      risk_label: params.label,
      risk_score: params.riskScore,
      summary: params.summary,
      scan_record_id: params.reportId,
    });
    window.location.replace(params.url);
  } catch (error) {
    showMessage(`继续访问失败：${errorMessage(error)}`, true);
  } finally {
    setBusy(continueOnceButton, false);
  }
}

async function trustTemporarily(): Promise<void> {
  if (!params) return;
  const host = hostFromUrl(params.url);
  if (!host) {
    showMessage('无法识别当前站点域名。', true);
    return;
  }

  setBusy(trustTemporaryButton, true);
  try {
    const status = await pauseSite(host, 30);
    await syncPluginEvent({
      event_type: 'temporary_trust',
      action: 'warning_temporary_trust',
      url: params.url,
      domain: host,
      risk_label: params.label,
      risk_score: params.riskScore,
      summary: params.summary,
      scan_record_id: params.reportId,
    });
    showMessage(status === 'synced'
      ? '已暂时信任此网站 30 分钟，并同步到主平台。'
      : '平台暂不可用，已暂时信任此网站 30 分钟。');
    await createTemporaryBypass(params.url);
    window.setTimeout(() => window.location.replace(params.url), 450);
  } catch (error) {
    showMessage(`暂时信任失败：${errorMessage(error)}`, true);
  } finally {
    setBusy(trustTemporaryButton, false);
  }
}

async function trustPermanently(): Promise<void> {
  if (!params) return;
  const host = hostFromUrl(params.url);
  if (!host) {
    showMessage('无法识别当前站点域名。', true);
    return;
  }

  setBusy(trustPermanentButton, true);
  try {
    await trustSite(host);
    await syncPluginEvent({
      event_type: 'trust',
      action: 'warning_permanent_trust',
      url: params.url,
      domain: host,
      risk_label: params.label,
      risk_score: params.riskScore,
      summary: params.summary,
      scan_record_id: params.reportId,
    });
    showMessage('已信任此网站，并同步到主平台。');
    await createTemporaryBypass(params.url);
    window.setTimeout(() => window.location.replace(params.url), 450);
  } catch (error) {
    showMessage(`信任操作需要写入主平台，目前失败：${errorMessage(error)}`, true);
  } finally {
    setBusy(trustPermanentButton, false);
  }
}

async function openReport(): Promise<void> {
  const settings = await getSettings();
  const reportUrl = buildReportUrl(settings.webBaseUrl, params?.reportId);
  if (params) {
    await syncPluginEvent({
      event_type: 'warning',
      action: 'open_report',
      url: params.url,
      domain: hostFromUrl(params.url),
      risk_label: params.label,
      risk_score: params.riskScore,
      summary: params.summary,
      scan_record_id: params.reportId,
    });
  }
  await chrome.tabs.create({ url: reportUrl });
}

function disableRiskActions(): void {
  continueOnceButton?.setAttribute('disabled', 'true');
  trustTemporaryButton?.setAttribute('disabled', 'true');
  trustPermanentButton?.setAttribute('disabled', 'true');
}

function setBusy(button: HTMLButtonElement | null, busy: boolean): void {
  if (button) button.disabled = busy;
}

function setText(element: HTMLElement | null, value: string): void {
  if (element) element.textContent = value;
}

function showMessage(message: string, isError = false): void {
  if (!messageElement) return;
  messageElement.textContent = message;
  messageElement.className = `message${isError ? ' error' : ''}`;
}

function riskLabelText(label: string): string {
  if (label === 'malicious') return '恶意';
  if (label === 'suspicious') return '可疑';
  if (label === 'safe') return '安全';
  return '未知';
}

function renderSourceExplanation(): void {
  if (!params || !sourceBadgesElement || !sourceExplanationElement) return;
  sourceBadgesElement.textContent = '';
  const badges = params.sourceBadges.length ? params.sourceBadges : ['base'];
  for (const badge of badges) {
    const element = document.createElement('span');
    element.className = `source-badge ${badge}`;
    element.textContent = sourceBadgeText(badge);
    sourceBadgesElement.appendChild(element);
  }
  sourceExplanationElement.textContent = warningSourceSummary();
}

function warningSourceSummary(): string {
  if (!params) return '检测来源参数不可用。';
  if (params.threatIntelHit) return '命中外部恶意网站规则库，当前站点属于已知风险来源。';
  if (params.aiStatus === 'used') return 'AI 语义研判发现风险，请在完整报告中查看风险类型、原因和建议。';
  if (params.aiStatus === 'not_triggered') return '当前结果来自基础检测；本次未触发 AI 语义研判。';
  if (isAiFallbackStatus(params.aiStatus)) return 'AI 语义研判暂不可用，当前结果来自基础检测。';
  return '当前结果来自基础检测和页面行为风险信号。';
}

function sourceBadgeText(value: string): string {
  const labels: Record<string, string> = {
    policy: '策略',
    threat_intel: '外部规则库',
    behavior: '行为规则',
    ai: 'AI',
    base: '基础检测',
  };
  return labels[value] || value;
}

function isAiFallbackStatus(status: string | undefined): boolean {
  return status === 'disabled'
    || status === 'no_api_key'
    || status === 'timeout'
    || status === 'error'
    || status === 'invalid_response';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '未知错误';
}
