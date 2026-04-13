// 页面信息提取工具

interface PageInfo {
  url: string;
  title: string;
  visible_text: string;
  button_texts: string[];
  input_labels: string[];
  form_action_domains: string[];
  has_password_input: boolean;
}

// 提取页面信息
export function extractPageInfo(): PageInfo {
  const url = window.location.href;
  const title = document.title || '';
  
  // 提取可见文本（截断避免过长）
  let visibleText = '';
  const textNodes = document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, span, div');
  textNodes.forEach(node => {
    if (node.textContent && node.textContent.trim()) {
      visibleText += node.textContent.trim() + ' ';
    }
  });
  // 截断文本，最多 1000 字符
  visibleText = visibleText.trim().substring(0, 1000);
  
  // 提取按钮文本
  const buttonTexts: string[] = [];
  const buttons = document.querySelectorAll('button, input[type="button"], input[type="submit"]');
  buttons.forEach(button => {
    if (button.textContent && button.textContent.trim()) {
      buttonTexts.push(button.textContent.trim());
    } else if ((button as HTMLInputElement).value && (button as HTMLInputElement).value.trim()) {
      buttonTexts.push((button as HTMLInputElement).value.trim());
    }
  });
  
  // 提取输入标签文本
  const inputLabels: string[] = [];
  const labels = document.querySelectorAll('label');
  labels.forEach(label => {
    if (label.textContent && label.textContent.trim()) {
      inputLabels.push(label.textContent.trim());
    }
  });
  
  // 提取表单 action 域名
  const formActionDomains: string[] = [];
  const forms = document.querySelectorAll('form');
  forms.forEach(form => {
    const action = form.getAttribute('action');
    if (action) {
      try {
        const url = new URL(action, window.location.origin);
        formActionDomains.push(url.hostname);
      } catch (e) {
        // 忽略无效 URL
      }
    }
  });
  
  // 检查是否存在密码输入
  const hasPasswordInput = document.querySelectorAll('input[type="password"]').length > 0;
  
  return {
    url,
    title,
    visible_text: visibleText,
    button_texts: buttonTexts,
    input_labels: inputLabels,
    form_action_domains: formActionDomains,
    has_password_input: hasPasswordInput
  };
}