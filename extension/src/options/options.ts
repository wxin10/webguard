import { testBackendConnection, testPluginBootstrapConnection } from '../utils/api.js';
import {
  DEFAULT_SETTINGS,
  clearRuntimeCache,
  getSettings,
  normalizeBaseUrl,
  resetSettings,
  saveSettings,
} from '../utils/storage.js';

const apiBaseUrlInput = document.getElementById('api-base-url') as HTMLInputElement | null;
const webBaseUrlInput = document.getElementById('web-base-url') as HTMLInputElement | null;
const accessTokenInput = document.getElementById('access-token') as HTMLInputElement | null;
const pluginInstanceIdInput = document.getElementById('plugin-instance-id') as HTMLInputElement | null;
const autoDetectCheckbox = document.getElementById('auto-detect') as HTMLInputElement | null;
const autoBlockCheckbox = document.getElementById('auto-block') as HTMLInputElement | null;
const notifySuspiciousCheckbox = document.getElementById('notify-suspicious') as HTMLInputElement | null;

const testButton = document.getElementById('test-button') as HTMLButtonElement | null;
const clearCacheButton = document.getElementById('clear-cache-button') as HTMLButtonElement | null;
const resetSettingsButton = document.getElementById('reset-settings-button') as HTMLButtonElement | null;
const saveButton = document.getElementById('save-button') as HTMLButtonElement | null;

const messageElement = document.getElementById('message');
const testMessageElement = document.getElementById('test-message');

void init().catch((error) => {
  console.error('[WebGuard] Options init failed.', error);
  showMessage(`设置页初始化失败：${errorMessage(error)}`, true);
});

async function init(): Promise<void> {
  await renderSettings();
  saveButton?.addEventListener('click', () => void saveOptions());
  testButton?.addEventListener('click', () => void testConnection());
  clearCacheButton?.addEventListener('click', () => void clearCache());
  resetSettingsButton?.addEventListener('click', () => void resetOptions());
}

async function renderSettings(): Promise<void> {
  const settings = await getSettings();
  if (apiBaseUrlInput) apiBaseUrlInput.value = settings.apiBaseUrl;
  if (webBaseUrlInput) webBaseUrlInput.value = settings.webBaseUrl;
  if (accessTokenInput) accessTokenInput.value = settings.accessToken || '';
  if (pluginInstanceIdInput) pluginInstanceIdInput.value = settings.pluginInstanceId || '';
  if (autoDetectCheckbox) autoDetectCheckbox.checked = settings.autoDetect;
  if (autoBlockCheckbox) autoBlockCheckbox.checked = settings.autoBlockMalicious;
  if (notifySuspiciousCheckbox) notifySuspiciousCheckbox.checked = settings.notifySuspicious;
}

async function saveOptions(): Promise<void> {
  try {
    const apiBaseUrl = readRequiredUrl(apiBaseUrlInput, DEFAULT_SETTINGS.apiBaseUrl);
    const webBaseUrl = readRequiredUrl(webBaseUrlInput, DEFAULT_SETTINGS.webBaseUrl);
    await saveSettings({
      apiBaseUrl,
      webBaseUrl,
      accessToken: accessTokenInput?.value.trim() || undefined,
      pluginInstanceId: pluginInstanceIdInput?.value.trim() || undefined,
      autoDetect: Boolean(autoDetectCheckbox?.checked),
      autoBlockMalicious: Boolean(autoBlockCheckbox?.checked),
      notifySuspicious: Boolean(notifySuspiciousCheckbox?.checked),
    });
    showMessage('设置已保存。');
  } catch (error) {
    showMessage(errorMessage(error), true);
  }
}

async function testConnection(): Promise<void> {
  const apiBaseUrl = readRequiredUrl(apiBaseUrlInput, DEFAULT_SETTINGS.apiBaseUrl);
  const webBaseUrl = readRequiredUrl(webBaseUrlInput, DEFAULT_SETTINGS.webBaseUrl);
  testButton?.setAttribute('disabled', 'true');
  showTestMessage('正在测试后端连接...');
  try {
    await saveSettings({
      apiBaseUrl,
      webBaseUrl,
      accessToken: accessTokenInput?.value.trim() || undefined,
      pluginInstanceId: pluginInstanceIdInput?.value.trim() || undefined,
      autoDetect: Boolean(autoDetectCheckbox?.checked),
      autoBlockMalicious: Boolean(autoBlockCheckbox?.checked),
      notifySuspicious: Boolean(notifySuspiciousCheckbox?.checked),
    });
    const health = await testBackendConnection(apiBaseUrl);
    if (health.ok) {
      await testPluginBootstrapConnection();
      await renderSettings();
    }
    showTestMessage(
      health.ok
        ? `连接正常，耗时 ${health.latencyMs ?? 0}ms。已尝试同步主平台 bootstrap。`
        : `连接失败：${health.message}`,
      !health.ok,
    );
  } catch (error) {
    showTestMessage(`连接测试失败：${errorMessage(error)}`, true);
  } finally {
    testButton?.removeAttribute('disabled');
  }
}

async function clearCache(): Promise<void> {
  await clearRuntimeCache();
  showMessage('本地运行态缓存已清空。');
}

async function resetOptions(): Promise<void> {
  await resetSettings();
  await renderSettings();
  showMessage('插件设置已恢复默认值。');
}

function readRequiredUrl(input: HTMLInputElement | null, fallback: string): string {
  const raw = input?.value.trim() || fallback;
  const normalized = normalizeBaseUrl(raw, '');
  if (!normalized) {
    throw new Error('请输入合法的 http/https 地址。');
  }
  return normalized;
}

function showMessage(text: string, isError = false): void {
  if (!messageElement) return;
  messageElement.textContent = text;
  messageElement.className = isError ? 'error' : '';
  window.setTimeout(() => {
    messageElement.textContent = '';
    messageElement.className = '';
  }, 2600);
}

function showTestMessage(text: string, isError = false): void {
  if (!testMessageElement) return;
  testMessageElement.textContent = text;
  testMessageElement.className = `message${isError ? ' error' : ''}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '未知错误';
}
