import { getSettings, saveSettings } from '../utils/storage.js';

const apiBaseUrlInput = document.getElementById('api-base-url') as HTMLInputElement | null;
const frontendBaseUrlInput = document.getElementById('frontend-base-url') as HTMLInputElement | null;
const autoDetectCheckbox = document.getElementById('auto-detect') as HTMLInputElement | null;
const autoBlockCheckbox = document.getElementById('auto-block') as HTMLInputElement | null;
const saveButton = document.getElementById('save-button') as HTMLButtonElement | null;
const messageElement = document.getElementById('message');

void init();

async function init() {
  const settings = await getSettings();
  if (apiBaseUrlInput) apiBaseUrlInput.value = settings.apiBaseUrl;
  if (frontendBaseUrlInput) frontendBaseUrlInput.value = settings.frontendBaseUrl;
  if (autoDetectCheckbox) autoDetectCheckbox.checked = settings.autoDetect;
  if (autoBlockCheckbox) autoBlockCheckbox.checked = settings.autoBlockMalicious;
  saveButton?.addEventListener('click', saveOptions);
}

async function saveOptions() {
  await saveSettings({
    apiBaseUrl: apiBaseUrlInput?.value.trim() || 'http://127.0.0.1:8000',
    frontendBaseUrl: frontendBaseUrlInput?.value.trim() || 'http://127.0.0.1:5173',
    autoDetect: Boolean(autoDetectCheckbox?.checked),
    autoBlockMalicious: Boolean(autoBlockCheckbox?.checked),
  });
  showMessage('设置已保存');
}

function showMessage(text: string) {
  if (!messageElement) return;
  messageElement.textContent = text;
  window.setTimeout(() => {
    messageElement.textContent = '';
  }, 2500);
}
