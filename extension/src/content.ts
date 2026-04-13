chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.action !== 'collectPageInfo') return false;
  sendResponse(collectPageInfo());
  return true;
});

function collectPageInfo() {
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
