import { markReportFalsePositive, pauseSite, submitFeedback } from '../utils/api.js';
import { getSettings, hostFromUrl, pauseHostProtection } from '../utils/storage.js';
import type { DetectionResult } from '../utils/storage.js';

const params = new URLSearchParams(window.location.search);
const targetUrl = params.get('url') || '';
const resultParam = params.get('result') || '';
const result = parseResult(resultParam);

const title = document.getElementById('warning-title');
const urlElement = document.getElementById('warning-url');
const scoreElement = document.getElementById('risk-score');
const reasonElement = document.getElementById('risk-reason');
const recommendationElement = document.getElementById('recommendation');
const backButton = document.getElementById('back-button');
const continueButton = document.getElementById('continue-button');
const reportButton = document.getElementById('report-button');
const falsePositiveButton = document.getElementById('false-positive-button');
const feedbackComment = document.getElementById('feedback-comment') as HTMLTextAreaElement | null;
const feedbackMessage = document.getElementById('feedback-message');

render();

backButton?.addEventListener('click', () => {
  window.location.href = 'about:blank';
});

continueButton?.addEventListener('click', () => {
  void continueAccess();
});

reportButton?.addEventListener('click', () => {
  void openReport();
});

falsePositiveButton?.addEventListener('click', () => {
  void submitFalsePositive();
});

function render() {
  if (title) title.textContent = result?.label === 'suspicious' ? '检测到可疑网站' : '检测到恶意网站';
  if (urlElement) urlElement.textContent = targetUrl;
  if (scoreElement) scoreElement.textContent = result ? result.risk_score.toFixed(1) : '--';
  if (reasonElement) reasonElement.textContent = firstLine(result?.explanation) || '该页面命中高风险检测策略。';
  if (recommendationElement) recommendationElement.textContent = result?.recommendation || '建议返回安全页面，不要输入账号、密码或支付信息。';
}

function parseResult(value: string): DetectionResult | null {
  try {
    return value ? JSON.parse(value) as DetectionResult : null;
  } catch {
    return null;
  }
}

function firstLine(value?: string) {
  return (value || '').split('\n').find(Boolean) || '';
}

async function openReport() {
  const settings = await getSettings();
  const reportUrl = result?.record_id ? `${settings.frontendBaseUrl}/app/reports/${result.record_id}` : `${settings.frontendBaseUrl}/app/report/latest`;
  window.open(reportUrl, '_blank');
}

async function submitFalsePositive() {
  if (!targetUrl) return;
  const comment = feedbackComment?.value || '';
  if (result?.record_id) {
    await markReportFalsePositive(result.record_id, comment);
  } else {
    await submitFeedback({
      url: targetUrl,
      feedback_type: 'false_positive',
      comment,
    });
  }
  if (feedbackMessage) feedbackMessage.textContent = '误报反馈已写入 Web 平台处理队列。';
}

async function continueAccess() {
  if (!targetUrl) return;
  const host = hostFromUrl(targetUrl);
  if (host) {
    try {
      await pauseSite(host, 30);
    } catch {
      await pauseHostProtection(host, 30);
    }
  }
  await chrome.storage.local.set({ webguardBypassUrl: targetUrl });
  window.location.href = targetUrl;
}
