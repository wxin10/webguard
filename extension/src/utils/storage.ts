export type RiskLabel = 'safe' | 'suspicious' | 'malicious' | 'unknown';
export type TabRiskState = 'idle' | 'scanning' | 'safe' | 'suspicious' | 'malicious' | 'error';

export interface PageInfo {
  url: string;
  title: string;
  visible_text: string;
  button_texts: string[];
  input_labels: string[];
  form_action_domains: string[];
  has_password_input: boolean;
}

export interface DetectionResult {
  url: string;
  label: RiskLabel;
  risk_score: number;
  summary: string;
  reason?: string;
  explanation?: string;
  recommendation?: string;
  record_id?: number;
  rule_score?: number;
  model_safe_prob?: number;
  model_suspicious_prob?: number;
  model_malicious_prob?: number;
  hit_rules?: Array<Record<string, unknown>>;
  timestamp: number;
}

export interface ExtensionSettings {
  apiBaseUrl: string;
  webBaseUrl: string;
  autoDetect: boolean;
  autoBlockMalicious: boolean;
  notifySuspicious: boolean;
}

export interface RuntimeError {
  message: string;
  code?: string;
  url?: string;
  timestamp: number;
}

export interface TabRiskRecord {
  tabId: number;
  url: string;
  state: TabRiskState;
  updatedAt: number;
  result?: DetectionResult;
  error?: RuntimeError;
}

export interface RuntimeCache {
  tabRiskStates: Record<string, TabRiskRecord>;
  lastScanResult: DetectionResult | null;
  lastError: RuntimeError | null;
  policySnapshot: PluginPolicySnapshot | null;
}

export interface TrustedHostRecord {
  host: string;
  addedAt: number;
}

export interface PausedHostRecord {
  host: string;
  addedAt: number;
  expiresAt: number;
}

export interface TemporaryBypassRecord {
  id: string;
  url: string;
  host: string;
  createdAt: number;
  expiresAt: number;
  used: boolean;
}

export interface UserDecisions {
  trustedHosts: TrustedHostRecord[];
  pausedHosts: PausedHostRecord[];
  temporaryBypassRecords: TemporaryBypassRecord[];
}

export interface PluginPolicySnapshot {
  username: string;
  pluginVersion: string;
  ruleVersion: string;
  userTrustedHosts: string[];
  userBlockedHosts: string[];
  userPausedHosts: PausedHostRecord[];
  globalTrustedHosts: string[];
  globalBlockedHosts: string[];
  syncedAt: number;
}

interface StoredSettingsV1 {
  apiBaseUrl?: unknown;
  webBaseUrl?: unknown;
  frontendBaseUrl?: unknown;
  autoDetect?: unknown;
  autoBlockMalicious?: unknown;
  notifySuspicious?: unknown;
}

interface LocalStorageShape {
  settings?: StoredSettingsV1;
  runtimeCache?: Partial<RuntimeCache>;
  userDecisions?: Partial<UserDecisions>;
  apiBaseUrl?: unknown;
  frontendBaseUrl?: unknown;
  lastDetectionResult?: unknown;
  trustedSites?: unknown;
  pausedHosts?: unknown;
  webguardBypassUrl?: unknown;
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  apiBaseUrl: 'http://127.0.0.1:8000',
  webBaseUrl: 'http://127.0.0.1:5173',
  autoDetect: true,
  autoBlockMalicious: true,
  notifySuspicious: true,
};

const DEFAULT_RUNTIME_CACHE: RuntimeCache = {
  tabRiskStates: {},
  lastScanResult: null,
  lastError: null,
  policySnapshot: null,
};

const DEFAULT_USER_DECISIONS: UserDecisions = {
  trustedHosts: [],
  pausedHosts: [],
  temporaryBypassRecords: [],
};

const MAX_TAB_STATE_RECORDS = 120;
const TEMPORARY_BYPASS_TTL_MS = 10 * 60 * 1000;

export async function getSettings(): Promise<ExtensionSettings> {
  const stored = await chrome.storage.local.get(['settings', 'apiBaseUrl', 'frontendBaseUrl']) as LocalStorageShape;
  const settings = stored.settings ?? {};

  return {
    ...DEFAULT_SETTINGS,
    apiBaseUrl: normalizeBaseUrl(firstString(settings.apiBaseUrl, stored.apiBaseUrl), DEFAULT_SETTINGS.apiBaseUrl),
    webBaseUrl: normalizeBaseUrl(
      firstString(settings.webBaseUrl, settings.frontendBaseUrl, stored.frontendBaseUrl),
      DEFAULT_SETTINGS.webBaseUrl,
    ),
    autoDetect: firstBoolean(settings.autoDetect, DEFAULT_SETTINGS.autoDetect),
    autoBlockMalicious: firstBoolean(settings.autoBlockMalicious, DEFAULT_SETTINGS.autoBlockMalicious),
    notifySuspicious: firstBoolean(settings.notifySuspicious, DEFAULT_SETTINGS.notifySuspicious),
  };
}

export async function saveSettings(settings: Partial<ExtensionSettings>): Promise<ExtensionSettings> {
  const current = await getSettings();
  const next: ExtensionSettings = {
    ...current,
    ...settings,
    apiBaseUrl: normalizeBaseUrl(settings.apiBaseUrl, current.apiBaseUrl),
    webBaseUrl: normalizeBaseUrl(settings.webBaseUrl, current.webBaseUrl),
  };
  await chrome.storage.local.set({ settings: next });
  return next;
}

export async function resetSettings(): Promise<ExtensionSettings> {
  await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  return DEFAULT_SETTINGS;
}

export async function getRuntimeCache(): Promise<RuntimeCache> {
  const stored = await chrome.storage.local.get(['runtimeCache', 'lastDetectionResult']) as LocalStorageShape;
  const cache = stored.runtimeCache ?? {};
  const legacyResult = isDetectionResult(stored.lastDetectionResult) ? stored.lastDetectionResult : null;

  return {
    tabRiskStates: isRecordOfTabStates(cache.tabRiskStates) ? cache.tabRiskStates : {},
    lastScanResult: isDetectionResult(cache.lastScanResult) ? cache.lastScanResult : legacyResult,
    lastError: isRuntimeError(cache.lastError) ? cache.lastError : null,
    policySnapshot: isPluginPolicySnapshot(cache.policySnapshot) ? cache.policySnapshot : null,
  };
}

export async function saveRuntimeCache(cache: RuntimeCache): Promise<void> {
  await chrome.storage.local.set({ runtimeCache: cache });
}

export async function updateRuntimeCache(updater: (cache: RuntimeCache) => RuntimeCache): Promise<RuntimeCache> {
  const current = await getRuntimeCache();
  const next = updater(current);
  await saveRuntimeCache(next);
  return next;
}

export async function clearRuntimeCache(): Promise<void> {
  await chrome.storage.local.set({ runtimeCache: DEFAULT_RUNTIME_CACHE });
}

export async function getUserDecisions(): Promise<UserDecisions> {
  const stored = await chrome.storage.local.get(['userDecisions', 'trustedSites', 'pausedHosts', 'webguardBypassUrl']) as LocalStorageShape;
  const decisions = stored.userDecisions ?? {};

  return pruneUserDecisions({
    trustedHosts: normalizeTrustedHosts(decisions.trustedHosts, stored.trustedSites),
    pausedHosts: normalizePausedHosts(decisions.pausedHosts, stored.pausedHosts),
    temporaryBypassRecords: normalizeBypassRecords(decisions.temporaryBypassRecords, stored.webguardBypassUrl),
  });
}

export async function saveUserDecisions(decisions: UserDecisions): Promise<void> {
  await chrome.storage.local.set({ userDecisions: pruneUserDecisions(decisions) });
}

export async function updateUserDecisions(updater: (decisions: UserDecisions) => UserDecisions): Promise<UserDecisions> {
  const current = await getUserDecisions();
  const next = pruneUserDecisions(updater(current));
  await saveUserDecisions(next);
  return next;
}

export async function resetAllLocalData(): Promise<void> {
  await chrome.storage.local.set({
    settings: DEFAULT_SETTINGS,
    runtimeCache: DEFAULT_RUNTIME_CACHE,
    userDecisions: DEFAULT_USER_DECISIONS,
  });
  await chrome.storage.local.remove([
    'apiBaseUrl',
    'frontendBaseUrl',
    'lastDetectionResult',
    'trustedSites',
    'pausedHosts',
    'webguardBypassUrl',
    'userStrategyCache',
  ]);
}

export async function saveTabRiskState(record: TabRiskRecord): Promise<void> {
  await updateRuntimeCache((cache) => {
    const key = tabStateKey(record.tabId, record.url);
    const nextStates = pruneTabStates({
      ...cache.tabRiskStates,
      [key]: record,
    });
    return {
      ...cache,
      tabRiskStates: nextStates,
      lastScanResult: record.result ?? cache.lastScanResult,
      lastError: record.error ?? cache.lastError,
    };
  });
}

export async function setTabState(
  tabId: number,
  url: string,
  state: TabRiskState,
  result?: DetectionResult,
  error?: RuntimeError,
): Promise<TabRiskRecord> {
  const record: TabRiskRecord = {
    tabId,
    url,
    state,
    updatedAt: Date.now(),
    ...(result ? { result } : {}),
    ...(error ? { error } : {}),
  };
  await saveTabRiskState(record);
  return record;
}

export async function getTabRiskRecord(tabId: number, url: string): Promise<TabRiskRecord | null> {
  const cache = await getRuntimeCache();
  return cache.tabRiskStates[tabStateKey(tabId, url)] ?? null;
}

export async function saveLastScanResult(result: DetectionResult): Promise<void> {
  await updateRuntimeCache((cache) => ({ ...cache, lastScanResult: result }));
}

export async function saveLastError(error: RuntimeError): Promise<void> {
  await updateRuntimeCache((cache) => ({ ...cache, lastError: error }));
}

export async function savePluginPolicySnapshot(policy: PluginPolicySnapshot): Promise<void> {
  await updateRuntimeCache((cache) => ({ ...cache, policySnapshot: policy }));
  await updateUserDecisions((decisions) => ({
    ...decisions,
    trustedHosts: mergeTrustedHosts(decisions.trustedHosts, policy.userTrustedHosts),
    pausedHosts: mergePausedHosts(decisions.pausedHosts, policy.userPausedHosts),
  }));
}

export async function getPluginPolicySnapshot(): Promise<PluginPolicySnapshot | null> {
  const cache = await getRuntimeCache();
  return cache.policySnapshot;
}

export async function isBlockedByPolicy(host: string): Promise<boolean> {
  const normalizedHost = normalizeHost(host);
  if (!normalizedHost) return false;
  const policy = await getPluginPolicySnapshot();
  if (!policy) return false;
  return [...policy.userBlockedHosts, ...policy.globalBlockedHosts].some((item) => normalizeHost(item) === normalizedHost);
}

export async function isTrustedHost(host: string): Promise<boolean> {
  const normalizedHost = normalizeHost(host);
  if (!normalizedHost) return false;
  const decisions = await getUserDecisions();
  return decisions.trustedHosts.some((record) => record.host === normalizedHost);
}

export async function addTrustedHost(host: string): Promise<void> {
  const normalizedHost = normalizeHost(host);
  if (!normalizedHost) return;
  await updateUserDecisions((decisions) => ({
    ...decisions,
    trustedHosts: upsertTrustedHost(decisions.trustedHosts, normalizedHost),
  }));
}

export async function getTrustedHosts(): Promise<TrustedHostRecord[]> {
  const decisions = await getUserDecisions();
  return decisions.trustedHosts;
}

export async function isHostPaused(host: string): Promise<boolean> {
  const normalizedHost = normalizeHost(host);
  if (!normalizedHost) return false;
  const decisions = await getUserDecisions();
  return decisions.pausedHosts.some((record) => record.host === normalizedHost && record.expiresAt > Date.now());
}

export async function pauseHostProtection(host: string, minutes = 30): Promise<void> {
  const normalizedHost = normalizeHost(host);
  if (!normalizedHost) return;
  const now = Date.now();
  await updateUserDecisions((decisions) => ({
    ...decisions,
    pausedHosts: upsertPausedHost(decisions.pausedHosts, {
      host: normalizedHost,
      addedAt: now,
      expiresAt: now + minutes * 60 * 1000,
    }),
  }));
}

export async function resumeHostProtection(host: string): Promise<void> {
  const normalizedHost = normalizeHost(host);
  if (!normalizedHost) return;
  await updateUserDecisions((decisions) => ({
    ...decisions,
    pausedHosts: decisions.pausedHosts.filter((record) => record.host !== normalizedHost),
  }));
}

export async function createTemporaryBypass(url: string, ttlMs = TEMPORARY_BYPASS_TTL_MS): Promise<TemporaryBypassRecord | null> {
  if (!isHttpUrl(url)) return null;
  const host = hostFromUrl(url);
  if (!host) return null;
  const now = Date.now();
  const record: TemporaryBypassRecord = {
    id: createRecordId(),
    url,
    host: normalizeHost(host),
    createdAt: now,
    expiresAt: now + ttlMs,
    used: false,
  };
  await updateUserDecisions((decisions) => ({
    ...decisions,
    temporaryBypassRecords: [...decisions.temporaryBypassRecords, record],
  }));
  return record;
}

export async function consumeTemporaryBypass(url: string): Promise<boolean> {
  if (!isHttpUrl(url)) return false;
  let consumed = false;
  await updateUserDecisions((decisions) => {
    const now = Date.now();
    return {
      ...decisions,
      temporaryBypassRecords: decisions.temporaryBypassRecords
        .filter((record) => record.expiresAt > now)
        .map((record) => {
          if (!consumed && !record.used && record.url === url) {
            consumed = true;
            return { ...record, used: true };
          }
          return record;
        }),
    };
  });
  return consumed;
}

export function tabStateKey(tabId: number, url: string): string {
  return `${tabId}:${url}`;
}

export function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

export function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/^www\./, '');
}

export function isHttpUrl(url: string): boolean {
  try {
    const protocol = new URL(url).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

export function createRuntimeError(message: string, url?: string, code?: string): RuntimeError {
  return {
    message,
    ...(code ? { code } : {}),
    ...(url ? { url } : {}),
    timestamp: Date.now(),
  };
}

export function stateFromRiskLabel(label: RiskLabel): TabRiskState {
  if (label === 'safe' || label === 'suspicious' || label === 'malicious') return label;
  return 'error';
}

export function normalizeBaseUrl(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) return fallback;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return fallback;
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return fallback;
  }
}

function firstString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === 'string' && value.trim().length > 0);
}

function firstBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeTrustedHosts(value: unknown, legacy: unknown): TrustedHostRecord[] {
  const primary = Array.isArray(value) ? value : [];
  const legacySites = Array.isArray(legacy) ? legacy : [];
  const records = [...primary, ...legacySites]
    .map((item) => {
      if (isRecord(item) && typeof item.host === 'string') {
        return { host: normalizeHost(item.host), addedAt: numberOrNow(item.addedAt) };
      }
      if (typeof item === 'string') {
        return { host: normalizeHost(item), addedAt: Date.now() };
      }
      return null;
    })
    .filter((item): item is TrustedHostRecord => Boolean(item?.host));

  return uniqueByHost(records);
}

function normalizePausedHosts(value: unknown, legacy: unknown): PausedHostRecord[] {
  const records: PausedHostRecord[] = [];
  if (Array.isArray(value)) {
    for (const item of value) {
      if (!isRecord(item) || typeof item.host !== 'string') continue;
      const expiresAt = numberOrZero(item.expiresAt);
      if (expiresAt > Date.now()) {
        records.push({ host: normalizeHost(item.host), addedAt: numberOrNow(item.addedAt), expiresAt });
      }
    }
  }
  if (isRecord(legacy)) {
    for (const [host, expiresAt] of Object.entries(legacy)) {
      const normalizedHost = normalizeHost(host);
      const numericExpiresAt = numberOrZero(expiresAt);
      if (normalizedHost && numericExpiresAt > Date.now()) {
        records.push({ host: normalizedHost, addedAt: Date.now(), expiresAt: numericExpiresAt });
      }
    }
  }
  return uniqueByHost(records);
}

function normalizeBypassRecords(value: unknown, legacyBypassUrl: unknown): TemporaryBypassRecord[] {
  const now = Date.now();
  const records: TemporaryBypassRecord[] = [];
  if (Array.isArray(value)) {
    for (const item of value) {
      if (!isRecord(item) || typeof item.url !== 'string' || !isHttpUrl(item.url)) continue;
      const expiresAt = numberOrZero(item.expiresAt);
      if (expiresAt <= now) continue;
      records.push({
        id: typeof item.id === 'string' ? item.id : createRecordId(),
        url: item.url,
        host: typeof item.host === 'string' ? normalizeHost(item.host) : normalizeHost(hostFromUrl(item.url)),
        createdAt: numberOrNow(item.createdAt),
        expiresAt,
        used: Boolean(item.used),
      });
    }
  }
  if (typeof legacyBypassUrl === 'string' && isHttpUrl(legacyBypassUrl)) {
    records.push({
      id: createRecordId(),
      url: legacyBypassUrl,
      host: normalizeHost(hostFromUrl(legacyBypassUrl)),
      createdAt: now,
      expiresAt: now + TEMPORARY_BYPASS_TTL_MS,
      used: false,
    });
  }
  return records;
}

function pruneUserDecisions(decisions: UserDecisions): UserDecisions {
  const now = Date.now();
  return {
    trustedHosts: uniqueByHost(decisions.trustedHosts).filter((record) => Boolean(record.host)),
    pausedHosts: uniqueByHost(decisions.pausedHosts).filter((record) => record.host && record.expiresAt > now),
    temporaryBypassRecords: decisions.temporaryBypassRecords
      .filter((record) => record.url && record.expiresAt > now)
      .slice(-60),
  };
}

function upsertTrustedHost(records: TrustedHostRecord[], host: string): TrustedHostRecord[] {
  if (records.some((record) => record.host === host)) return records;
  return [...records, { host, addedAt: Date.now() }];
}

function upsertPausedHost(records: PausedHostRecord[], next: PausedHostRecord): PausedHostRecord[] {
  return [...records.filter((record) => record.host !== next.host), next];
}

function mergeTrustedHosts(records: TrustedHostRecord[], hosts: string[]): TrustedHostRecord[] {
  let next = records;
  for (const host of hosts.map(normalizeHost).filter(Boolean)) {
    next = upsertTrustedHost(next, host);
  }
  return next;
}

function mergePausedHosts(records: PausedHostRecord[], pausedHosts: PausedHostRecord[]): PausedHostRecord[] {
  let next = records;
  for (const paused of pausedHosts) {
    if (!paused.host || paused.expiresAt <= Date.now()) continue;
    next = upsertPausedHost(next, paused);
  }
  return next;
}

function uniqueByHost<T extends { host: string }>(records: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const record of records) {
    if (!record.host || seen.has(record.host)) continue;
    seen.add(record.host);
    result.push(record);
  }
  return result;
}

function pruneTabStates(states: Record<string, TabRiskRecord>): Record<string, TabRiskRecord> {
  return Object.fromEntries(
    Object.entries(states)
      .sort(([, left], [, right]) => right.updatedAt - left.updatedAt)
      .slice(0, MAX_TAB_STATE_RECORDS),
  );
}

function isRecordOfTabStates(value: unknown): value is Record<string, TabRiskRecord> {
  if (!isRecord(value)) return false;
  return Object.values(value).every(isTabRiskRecord);
}

function isTabRiskRecord(value: unknown): value is TabRiskRecord {
  return isRecord(value)
    && typeof value.tabId === 'number'
    && typeof value.url === 'string'
    && isTabRiskState(value.state)
    && typeof value.updatedAt === 'number';
}

function isDetectionResult(value: unknown): value is DetectionResult {
  return isRecord(value)
    && typeof value.url === 'string'
    && isRiskLabel(value.label)
    && typeof value.risk_score === 'number'
    && typeof value.timestamp === 'number';
}

function isRuntimeError(value: unknown): value is RuntimeError {
  return isRecord(value)
    && typeof value.message === 'string'
    && typeof value.timestamp === 'number';
}

function isPluginPolicySnapshot(value: unknown): value is PluginPolicySnapshot {
  return isRecord(value)
    && typeof value.username === 'string'
    && typeof value.pluginVersion === 'string'
    && typeof value.ruleVersion === 'string'
    && Array.isArray(value.userTrustedHosts)
    && Array.isArray(value.userBlockedHosts)
    && Array.isArray(value.userPausedHosts)
    && Array.isArray(value.globalTrustedHosts)
    && Array.isArray(value.globalBlockedHosts)
    && typeof value.syncedAt === 'number';
}

function isRiskLabel(value: unknown): value is RiskLabel {
  return value === 'safe' || value === 'suspicious' || value === 'malicious' || value === 'unknown';
}

function isTabRiskState(value: unknown): value is TabRiskState {
  return value === 'idle'
    || value === 'scanning'
    || value === 'safe'
    || value === 'suspicious'
    || value === 'malicious'
    || value === 'error';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function numberOrNow(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : Date.now();
}

function numberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function createRecordId(): string {
  const random = new Uint32Array(2);
  crypto.getRandomValues(random);
  return `${Date.now().toString(36)}-${random[0].toString(36)}${random[1].toString(36)}`;
}
