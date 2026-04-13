import { checkBackend } from '../utils/api.js';
import { getLastDetectionResult, getSettings } from '../utils/storage.js';
import type { DetectionResult } from '../utils/storage.js';

const currentUrlElement = document.getElementById('current-url');
const resultCard = document.getElementById('result-card');
const scanButton = document.getElementById('scan-button') as HTMLButtonElement | null;
const reportButton = document.getElementById('report-button') as HTMLButtonElement | null;
const optionsButton = document.getElementById('options-button') as HTMLButtonElement | null;
const connectionStatus = document.getElementById('connection-status');

let lastResult: DetectionResult | null = null;
let currentTabUrl = '';

void init();

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
  optionsButton?.addEventListener('click', () => chrome.runtime.openOptionsPage());
}

function setConnection(online: boolean) {
  if (!connectionStatus) return;
  connectionStatus.textContent = online ? '后端已连接' : '后端离线';
  connectionStatus.className = `status ${online ? 'connected' : 'disconnected'}`;
}

async function scanCurrentTab() {
  if (!resultCard || !scanButton) return;
  scanButton.disabled = true;
  resultCard.innerHTML = '<p class="muted">正在采集页面特征并请求 WebGuard 后台...</p>';
  chrome.runtime.sendMessage({ action: 'scan' }, (response: DetectionResult | null) => {
    scanButton.disabled = false;
    lastResult = response;
    renderResult(response);
  });
}

function renderResult(result: DetectionResult | null) {
  if (!resultCard) return;
  if (!result) {
    resultCard.innerHTML = '<p class="muted">暂无检测结果，可点击下方按钮扫描当前网页。</p>';
    return;
  }
  const labelText = { safe: '安全', suspicious: '可疑', malicious: '恶意', unknown: '未知' }[result.label] || '未知';
  const barClass = `bar-${result.label}`;
  resultCard.innerHTML = `
    <div class="result-head">
      <div>
        <span class="status ${result.label}">${labelText}</span>
        <p class="risk-title">当前网页${labelText}</p>
      </div>
      <div class="score">${result.risk_score.toFixed(1)}</div>
    </div>
    <div class="bar"><div class="${barClass}" style="width: ${Math.min(result.risk_score, 100)}%"></div></div>
    <p class="explanation">${escapeHtml(firstLine(result.explanation))}</p>
    <p class="recommendation">${escapeHtml(result.recommendation || '建议保持谨慎访问。')}</p>
  `;
}

async function openReport() {
  const settings = await getSettings();
  const id = lastResult?.record_id;
  const url = id ? `${settings.frontendBaseUrl}/reports/${id}` : `${settings.frontendBaseUrl}/report/latest`;
  await chrome.tabs.create({ url });
}

function firstLine(value?: string) {
  return (value || '暂无检测解释').split('\n').find(Boolean) || '暂无检测解释';
}

function escapeHtml(value: string) {
  const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return value.replace(/[&<>"']/g, (char) => entities[char] || char);
}
