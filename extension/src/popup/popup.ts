import { checkBackend } from '../utils/api.js';
import { addTrustedSite, getLastDetectionResult, getSettings, hostFromUrl, pauseHostProtection } from '../utils/storage.js';
import type { DetectionResult } from '../utils/storage.js';

const currentUrlElement = document.getElementById('current-url');
const resultCard = document.getElementById('result-card');
const scanButton = document.getElementById('scan-button') as HTMLButtonElement | null;
const reportButton = document.getElementById('report-button') as HTMLButtonElement | null;
const trustButton = document.getElementById('trust-button') as HTMLButtonElement | null;
const pauseButton = document.getElementById('pause-button') as HTMLButtonElement | null;
const optionsButton = document.getElementById('options-button') as HTMLButtonElement | null;
const connectionStatus = document.getElementById('connection-status');

let lastResult: DetectionResult | null = null;
let currentTabUrl = '';

void init().catch((error) => {
  console.error('WebGuard popup init failed', error);
  if (currentUrlElement) currentUrlElement.textContent = '无法读取当前网址';
  setConnection(false, '插件初始化失败');
  renderMessage('插件初始化失败，请重新加载扩展后再试。');
});

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTabUrl = tab.url || '';
  if (currentUrlElement) currentUrlElement.textContent = currentTabUrl || '无法读取当前网址';

  const online = await checkBackend();
  setConnection(online);

  const storedResult = await getLastDetectionResult();
  lastResult = storedResult?.url === currentTabUrl ? storedResult : null;
  renderResult(lastResult);

  scanButton?.addEventListener('click', scanCurrentTab);
  reportButton?.addEventListener('click', openReport);
  trustButton?.addEventListener('click', trustCurrentSite);
  pauseButton?.addEventListener('click', pauseCurrentSite);
  optionsButton?.addEventListener('click', () => chrome.runtime.openOptionsPage());
}

function setConnection(online: boolean, text?: string) {
  if (!connectionStatus) return;
  connectionStatus.textContent = text || (online ? '后端已连接' : '后端离线');
  connectionStatus.className = `status ${online ? 'connected' : 'disconnected'}`;
}

async function scanCurrentTab() {
  if (!resultCard || !scanButton) return;
  scanButton.disabled = true;
  renderMessage('正在扫描当前页面...');
  chrome.runtime.sendMessage({ action: 'scan' }, (response: DetectionResult | null) => {
    scanButton.disabled = false;
    if (chrome.runtime.lastError) {
      console.error('WebGuard scan message failed', chrome.runtime.lastError);
      lastResult = null;
      renderMessage('扫描请求未完成，请确认后台服务与扩展后台脚本已运行。');
      return;
    }
    lastResult = response;
    renderResult(response);
  });
}

function renderResult(result: DetectionResult | null) {
  if (!result) {
    renderMessage('暂无当前网页结果。点击扫描后，可在 Web 平台查看完整报告。');
    return;
  }
  const labelText = { safe: '安全', suspicious: '可疑', malicious: '恶意', unknown: '未知' }[result.label] || '未知';
  const barClass = `bar-${result.label}`;
  if (!resultCard) return;
  resultCard.innerHTML = `
    <div class="result-head">
      <div>
        <span class="status ${result.label}">${labelText}</span>
        <p class="risk-title">${labelText}</p>
      </div>
      <div class="score">${result.risk_score.toFixed(1)}</div>
    </div>
    <div class="bar"><div class="${barClass}" style="width: ${Math.min(result.risk_score, 100)}%"></div></div>
    <p class="explanation">${escapeHtml(firstLine(result.explanation))}</p>
  `;
}

function renderMessage(message: string) {
  if (resultCard) resultCard.innerHTML = `<p class="muted">${escapeHtml(message)}</p>`;
}

async function openReport() {
  const settings = await getSettings();
  const id = lastResult?.record_id;
  const url = id ? `${settings.frontendBaseUrl}/app/reports/${id}` : `${settings.frontendBaseUrl}/app/report/latest`;
  await chrome.tabs.create({ url });
}

async function trustCurrentSite() {
  const host = hostFromUrl(currentTabUrl);
  if (!host) {
    renderMessage('当前页面无法加入信任列表。');
    return;
  }
  await addTrustedSite(host);
  const settings = await getSettings();
  renderMessage(`${host} 已在插件侧加入信任列表。完整策略请到 Web 平台维护。`);
  await chrome.tabs.create({ url: `${settings.frontendBaseUrl}/app/my-domains?domain=${encodeURIComponent(host)}` });
}

async function pauseCurrentSite() {
  const host = hostFromUrl(currentTabUrl);
  if (!host) {
    renderMessage('当前页面无法临时忽略。');
    return;
  }
  await pauseHostProtection(host, 30);
  renderMessage(`${host} 已临时忽略 30 分钟。`);
}

function firstLine(value?: string) {
  return (value || '暂无检测解释').split('\n').find(Boolean) || '暂无检测解释';
}

function escapeHtml(value: string) {
  const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return value.replace(/[&<>"']/g, (char) => entities[char] || char);
}
