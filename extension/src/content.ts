interface WebGuardPageInfo {
  url: string;
  title: string;
  visible_text: string;
  button_texts: string[];
  input_labels: string[];
  form_action_domains: string[];
  has_password_input: boolean;
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!isRecord(message) || message.type !== 'WEBGUARD_COLLECT_PAGE_INFO') return false;
  sendResponse(collectPageInfo());
  return true;
});

function collectPageInfo(): WebGuardPageInfo {
  const textParts = Array.from(document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, span, button, label, a'))
    .map((node) => node.textContent?.trim() || '')
    .filter(Boolean)
    .slice(0, 220);

  const buttonTexts = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"]'))
    .map((node) => node.textContent?.trim() || (node as HTMLInputElement).value?.trim() || '')
    .filter(Boolean)
    .slice(0, 30);

  const inputLabels = Array.from(document.querySelectorAll('label, input[placeholder], textarea[placeholder]'))
    .map((node) => {
      if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) {
        return node.placeholder.trim();
      }
      return node.textContent?.trim() || '';
    })
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
    .filter(Boolean)
    .slice(0, 30);

  return {
    url: window.location.href,
    title: document.title || '',
    visible_text: textParts.join(' ').slice(0, 2000),
    button_texts: buttonTexts,
    input_labels: inputLabels,
    form_action_domains: [...new Set(formActionDomains)],
    has_password_input: document.querySelectorAll('input[type="password"]').length > 0,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
