import { analyzeCurrentPage, getUserStrategies } from './utils/api.js';
import { getSettings, hostFromUrl, isHostPaused, isTrustedHost, saveDetectionResult } from './utils/storage.js';
import type { DetectionResult } from './utils/storage.js';

interface PageInfo {
  url: string;
  title: string;
  visible_text: string;
  button_texts: string[];
  input_labels: string[];
  form_action_domains: string[];
  has_password_input: boolean;
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' || !tab.url?.startsWith('http')) return;
  void getSettings().then((settings) => {
    if (settings.autoDetect) void checkPage(tabId, tab.url || '');
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.action !== 'scan') return false;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab?.id || !tab.url) {
      sendResponse(null);
      return;
    }
    void checkPage(tab.id, tab.url).then(sendResponse);
  });
  return true;
});

async function checkPage(tabId: number, originalUrl: string): Promise<DetectionResult | null> {
  try {
    const bypass = await chrome.storage.local.get('webguardBypassUrl');
    if (bypass.webguardBypassUrl === originalUrl) {
      await chrome.storage.local.remove('webguardBypassUrl');
      return null;
    }

    const host = hostFromUrl(originalUrl);
    await getUserStrategies().catch(() => undefined);
    if (await isTrustedHost(host)) return null;
    if (await isHostPaused(host)) return null;

    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      func: collectPageInfoFromTab,
    });
    const pageInfo = injection?.result as PageInfo | undefined;
    if (!pageInfo) return null;

    const analysis = await analyzeCurrentPage(pageInfo);
    const result: DetectionResult = {
      ...analysis,
      url: pageInfo.url,
      timestamp: Date.now(),
    };
    await saveDetectionResult(result);

    if (analysis.label === 'malicious') {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/128.png',
        title: 'WebGuard 安全警告',
        message: `检测到恶意网站，风险评分 ${analysis.risk_score.toFixed(1)}`,
      });

      const settings = await getSettings();
      if (settings.autoBlockMalicious) {
        const warningUrl = chrome.runtime.getURL('dist/warning/warning.html');
        await chrome.tabs.update(tabId, {
          url: `${warningUrl}?url=${encodeURIComponent(originalUrl)}&result=${encodeURIComponent(JSON.stringify(result))}`,
        });
      }
    }

    return result;
  } catch (error) {
    console.error('WebGuard scan failed', error);
    return null;
  }
}

function collectPageInfoFromTab(): PageInfo {
  const textParts = Array.from(document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, span, button, label'))
    .map((node) => node.textContent?.trim() || '')
    .filter(Boolean);
  const buttonTexts = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"]'))
    .map((node) => node.textContent?.trim() || (node as HTMLInputElement).value?.trim() || '')
    .filter(Boolean)
    .slice(0, 30);
  const inputLabels = Array.from(document.querySelectorAll('label'))
    .map((node) => node.textContent?.trim() || '')
    .filter(Boolean)
    .slice(0, 30);
  const formActionDomains = Array.from(document.querySelectorAll('form'))
    .map((form) => form.getAttribute('action'))
    .filter((action): action is string => Boolean(action))
    .map((action) => {
      try {
        return new URL(action, window.location.origin).hostname;
      } catch {
        return '';
      }
    })
    .filter(Boolean);

  return {
    url: window.location.href,
    title: document.title || '',
    visible_text: textParts.join(' ').slice(0, 1500),
    button_texts: buttonTexts,
    input_labels: inputLabels,
    form_action_domains: formActionDomains,
    has_password_input: document.querySelectorAll('input[type="password"]').length > 0,
  };
}
