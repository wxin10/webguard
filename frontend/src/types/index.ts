export type UserRole = 'admin' | 'user';
export type RiskLabel = 'safe' | 'suspicious' | 'malicious' | 'unknown';

export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T | null;
}

export interface DevelopmentUser {
  id?: number;
  username: string;
  email?: string | null;
  role: UserRole;
  display_name: string;
  is_active?: boolean;
  access_token?: string;
  token_type?: string;
  expires_in?: number;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  password: string;
  email?: string | null;
  display_name?: string | null;
}

export interface AuthTokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  user?: DevelopmentUser | null;
}

export interface AdminUserItem {
  id: number;
  username: string;
  email?: string | null;
  display_name: string;
  role: UserRole;
  is_active: boolean;
  created_at?: string | null;
  updated_at?: string | null;
  last_login_at?: string | null;
}

export interface AdminUserList {
  total: number;
  items: AdminUserItem[];
}

export interface AdminUserCreateRequest {
  username: string;
  password: string;
  email?: string | null;
  display_name?: string | null;
  role: UserRole;
}

export interface AdminUserPatchRequest {
  email?: string | null;
  display_name?: string | null;
  role?: UserRole;
  is_active?: boolean;
}

export interface PluginBindingChallenge {
  challenge_id: string;
  plugin_instance_id: string;
  status: string;
  expires_at?: string | null;
  confirmed_at?: string | null;
  consumed_at?: string | null;
}

export interface PluginBindingConfirmResponse {
  plugin_instance_id: string;
  status: string;
  challenge_id: string;
}

interface PluginInstanceItem {
  plugin_instance_id: string;
  display_name?: string | null;
  plugin_version?: string | null;
  status: string;
  bound_at?: string | null;
  revoked_at?: string | null;
  last_seen_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface PluginInstanceList {
  total: number;
  items: PluginInstanceItem[];
}

export interface UrlScanRequest {
  url: string;
}

export interface PageScanRequest {
  url: string;
  title: string;
  visible_text: string;
  button_texts: string[];
  input_labels: string[];
  form_action_domains: string[];
  has_password_input: boolean;
  source: string;
}

export interface HitRule {
  rule_key: string;
  rule_name: string;
  name?: string;
  description?: string;
  matched: boolean;
  enabled?: boolean;
  applied?: boolean;
  weight?: number;
  threshold?: number;
  contribution?: number;
  raw_score: number;
  weighted_score: number;
  detail?: string;
  reason?: string;
  category?: string;
  severity?: string;
  raw_feature?: Record<string, unknown>;
  observed_value?: number;
  evidence?: Record<string, unknown>;
  caution?: boolean;
  false_positive_note?: string;
}

export interface PolicyHit {
  hit?: boolean;
  scope?: string | null;
  list_type?: string | null;
  source?: string | null;
  reason?: string | null;
}

export interface ThreatIntelMatch {
  domain?: string;
  source?: string;
  risk_type?: string | null;
  reason?: string | null;
}

export interface BehaviorSignal {
  rule_key?: string;
  rule_name?: string;
  matched?: boolean;
  severity?: string | null;
  category?: string | null;
  score?: number;
  evidence?: Record<string, unknown>;
  reason?: string | null;
  caution?: boolean;
  false_positive_note?: string | null;
}

export interface AIAnalysis {
  status?: string;
  provider?: string | null;
  model?: string | null;
  risk_score?: number | null;
  label?: string | null;
  risk_types?: string[];
  reasons?: string[];
  recommendation?: string;
  confidence?: number;
  error?: string | null;
  trigger_reasons?: string[];
  reason?: string | null;
}

export interface AIStatus {
  provider: 'deepseek' | string;
  enabled: boolean;
  configured: boolean;
  base_url: string;
  model: string;
  timeout_seconds: number;
  api_key_masked?: string | null;
  mode: string;
  source?: 'database' | 'env' | string;
  message?: string | null;
}

export interface AIConfig extends AIStatus {
  source: 'database' | 'env' | string;
  last_test_status?: string | null;
  last_test_message?: string | null;
  last_test_at?: string | null;
}

export interface AIConfigUpdateRequest {
  enabled: boolean;
  base_url: string;
  model: string;
  timeout_seconds: number;
  api_key?: string | null;
}

export interface AIConfigTestRequest {
  enabled?: boolean;
  base_url?: string;
  model?: string;
  timeout_seconds?: number;
  api_key?: string | null;
  title?: string;
  visible_text?: string;
  url?: string;
  has_password_input?: boolean;
  button_texts?: string[];
  input_labels?: string[];
  form_action_domains?: string[];
}

export interface AITestRequest {
  title: string;
  visible_text: string;
  url: string;
  has_password_input: boolean;
  button_texts?: string[];
  input_labels?: string[];
  form_action_domains?: string[];
}

export interface AITestResponse {
  status: string;
  analysis: AIAnalysis;
  provider: 'deepseek' | string;
}

export interface AIConfigTestResponse extends AITestResponse {}

export interface ScoreBreakdown {
  rule_score_total: number;
  rule_score_raw_total?: number;
  enabled_rule_weight_total?: number;
  behavior_score?: number;
  behavior_signals?: BehaviorSignal[];
  ai_provider?: string;
  ai_score?: number | null;
  ai_analysis?: AIAnalysis;
  ai_fusion_used?: boolean;
  fallback?: string | null;
  final_score: number;
  label: RiskLabel;
  fusion_summary: string;
  rules: HitRule[];
  raw_features: {
    url?: string;
    domain?: string;
    title?: string;
    has_password_input?: boolean;
    form_action_domains?: string[];
    button_texts?: string[];
    input_labels?: string[];
    visible_text_length?: number;
    text_length?: number;
    [key: string]: unknown;
  };
  threat_intel_hit?: boolean;
  threat_intel_matches?: ThreatIntelMatch[];
  policy_hit?: PolicyHit;
  [key: string]: unknown;
}

export interface ScanResult {
  url: string;
  domain: string;
  label: RiskLabel;
  risk_score: number;
  summary: string;
  reason_summary?: string[];
  action: 'ALLOW' | 'WARN' | 'BLOCK';
  should_warn: boolean;
  should_block: boolean;
  rule_score: number;
  model_safe_prob: number;
  model_suspicious_prob: number;
  model_malicious_prob: number;
  hit_rules: HitRule[];
  score_breakdown?: ScoreBreakdown;
  explanation: string;
  recommendation: string;
  record_id: number;
  report_id?: number;
  policy_hit?: PolicyHit;
  threat_intel_hit?: boolean;
  threat_intel_matches?: ThreatIntelMatch[];
  behavior_score?: number;
  behavior_signals?: BehaviorSignal[];
  ai_score?: number | null;
  ai_analysis?: AIAnalysis;
  ai_fusion_used?: boolean;
  fallback?: string | null;
}

export interface ScanRecordList {
  total: number;
  records: ScanRecordItem[];
}

export interface ScanRecordItem {
  id: number;
  user_id?: number;
  report_id?: number;
  url: string;
  domain: string;
  host?: string;
  title?: string;
  source: string;
  label: RiskLabel;
  risk_level?: RiskLabel;
  risk_score: number;
  rule_score: number;
  model_safe_prob: number;
  model_suspicious_prob: number;
  model_malicious_prob: number;
  has_password_input?: boolean;
  hit_rules_json?: HitRule[];
  raw_features_json?: Record<string, unknown>;
  explanation?: string;
  summary?: string;
  recommendation?: string;
  created_at: string;
}

export interface DomainListItem {
  id: number;
  owner_type: 'global' | 'user';
  owner_id?: number;
  host: string;
  list_type: 'trusted' | 'blocked' | 'temp_bypass';
  source: 'manual' | 'plugin' | 'system' | string;
  status?: string;
  reason?: string;
  expires_at?: string;
  created_at: string;
  updated_at?: string;
}

export interface DomainListItemList {
  total: number;
  items: DomainListItem[];
}

export interface PluginDefaultConfig {
  api_base_url: string;
  web_base_url: string;
  auto_detect: boolean;
  auto_block_malicious: boolean;
  notify_suspicious: boolean;
  event_upload_enabled: boolean;
}

export interface PluginPolicyBundle {
  username: string;
  plugin_version: string;
  rule_version: string;
  defaults: PluginDefaultConfig;
  user_trusted_hosts: string[];
  user_blocked_hosts: string[];
  user_paused_hosts: Array<{ domain: string; expires_at?: string; reason?: string }>;
  global_trusted_hosts: string[];
  global_blocked_hosts: string[];
  generated_at: string;
}

interface UserPolicy {
  id: number;
  user_id: number;
  username: string;
  auto_detect: boolean;
  auto_block_malicious: boolean;
  notify_suspicious: boolean;
  bypass_duration_minutes: number;
  plugin_enabled: boolean;
  updated_at: string;
}

export interface PluginBootstrap {
  user_policy: UserPolicy;
  trusted_hosts: string[];
  blocked_hosts: string[];
  temp_bypass_records: Array<{ domain: string; expires_at?: string; reason?: string }>;
  whitelist_domains?: {
    user: string[];
    global: string[];
    all: string[];
  };
  blacklist_domains?: {
    user: string[];
    global: string[];
    all: string[];
  };
  temporary_trusted_domains?: Array<{ domain: string; expires_at?: string; reason?: string }>;
  plugin_default_config: PluginDefaultConfig;
  policy_version?: string;
  config_version?: string;
  current_rule_version: string;
  updated_at?: string;
  generated_at: string;
}

export interface PluginSyncEventItem {
  id: number;
  user_id?: number;
  username: string;
  event_type: 'scan' | 'warning' | 'bypass' | 'trust' | 'temporary_trust' | 'feedback' | 'error' | string;
  action?: string;
  url?: string;
  host?: string;
  domain?: string;
  risk_level?: RiskLabel;
  risk_label?: RiskLabel;
  risk_score?: number;
  summary?: string;
  scan_record_id?: number;
  plugin_version?: string;
  source?: string;
  payload?: Record<string, unknown>;
  metadata_json?: Record<string, unknown>;
  created_at: string;
}

export interface PluginSyncEventList {
  total: number;
  events: PluginSyncEventItem[];
}

export interface PluginEventStats {
  total_events: number;
  scan_events: number;
  warning_events: number;
  bypass_events: number;
  trust_events: number;
  feedback_events: number;
  malicious_events: number;
  suspicious_events: number;
}

export interface FeedbackCaseItem {
  id: number;
  user_id?: number;
  username: string;
  report_id?: number;
  related_report_id?: number;
  related_event_id?: number;
  url?: string;
  domain?: string;
  feedback_type: string;
  status: string;
  content?: string;
  comment?: string;
  source: string;
  created_at: string;
  updated_at?: string;
}

export interface FeedbackCaseList {
  total: number;
  cases: FeedbackCaseItem[];
}

export interface ReportActionItem {
  id: number;
  report_id: number;
  actor: string;
  actor_role: UserRole;
  action_type: string;
  status?: string;
  note?: string;
  created_at: string;
}

export interface StatsOverview {
  total_scans: number;
  high_risk_count?: number;
  plugin_event_count?: number;
  warning_count?: number;
  bypass_count?: number;
  trust_count?: number;
  feedback_count?: number;
  source_distribution?: Record<string, number>;
  today_scans: number;
  safe_count: number;
  suspicious_count: number;
  malicious_count: number;
}

export interface TrendPoint {
  date: string;
  count: number;
  safe_count: number;
  suspicious_count: number;
  malicious_count: number;
}

export interface TrendStats {
  trend: TrendPoint[];
}

export interface RiskDistributionResponse {
  safe: number;
  suspicious: number;
  malicious: number;
  distribution: Record<string, number>;
}

interface ReportEvidence {
  title: string;
  summary: string;
  items: Array<Record<string, unknown>>;
}

export interface AnalysisReport {
  id: number;
  scan_record_id?: number;
  record_id?: number;
  url: string;
  domain: string;
  host?: string;
  title?: string;
  source: string;
  label: RiskLabel;
  risk_level?: RiskLabel;
  label_text: string;
  risk_score: number;
  rule_score: number;
  model_score?: number | null;
  model_probs?: {
    safe: number;
    suspicious: number;
    malicious: number;
  };
  model_breakdown?: Record<string, unknown> | null;
  score_breakdown?: ScoreBreakdown;
  hit_rules: HitRule[];
  matched_rules: HitRule[];
  applied_rules?: HitRule[];
  reason_summary?: string[];
  policy_hit?: PolicyHit;
  threat_intel_hit?: boolean;
  threat_intel_matches?: ThreatIntelMatch[];
  behavior_score?: number;
  behavior_signals?: BehaviorSignal[];
  ai_score?: number | null;
  ai_analysis?: AIAnalysis;
  ai_fusion_used?: boolean;
  fallback?: string | null;
  explanation?: string;
  summary?: string;
  reasons?: Record<string, unknown>[];
  recommendation?: string;
  conclusion: string;
  evidence: ReportEvidence[];
  raw_features: Record<string, unknown>;
  actions?: ReportActionItem[];
  plugin_events?: PluginSyncEventItem[];
  created_at: string;
}

export interface AdminRuleItem {
  id: number;
  name: string;
  rule_name?: string;
  rule_key: string;
  type: string;
  scope: 'global' | 'user' | 'plugin' | string;
  status: 'active' | 'disabled' | string;
  version: string;
  pattern?: string;
  content?: string;
  description?: string;
  category?: string;
  severity?: string;
  enabled?: boolean;
  weight?: number;
  threshold?: number;
  created_at?: string;
  updated_at?: string;
}

export interface AdminRuleList {
  total: number;
  rules: AdminRuleItem[];
}

export interface AdminRuleCreateRequest {
  rule_key?: string | null;
  name: string;
  type: string;
  scope: 'global' | 'user' | 'plugin' | string;
  status: 'active' | 'disabled';
  enabled?: boolean | null;
  version: string;
  pattern?: string | null;
  content?: string | null;
  description?: string | null;
  category?: string | null;
  severity: 'low' | 'medium' | 'high' | 'critical';
  weight: number;
  threshold: number;
}

export interface AdminRulePatchRequest {
  rule_key?: string | null;
  name?: string;
  type?: string;
  scope?: 'global' | 'user' | 'plugin' | string;
  status?: 'active' | 'disabled';
  enabled?: boolean | null;
  version?: string;
  pattern?: string | null;
  content?: string | null;
  description?: string | null;
  category?: string | null;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  weight?: number;
  threshold?: number;
}

interface AdminRuleTestSample {
  url: string;
  title: string;
  visible_text: string;
  button_texts: string[];
  input_labels: string[];
  form_action_domains: string[];
  has_password_input: boolean;
}

export interface AdminRuleTestRequest {
  rule: AdminRuleCreateRequest;
  sample: AdminRuleTestSample;
}

export interface AdminRuleTestResponse {
  matched: boolean;
  applied: boolean;
  enabled: boolean;
  contribution: number;
  reason: string;
  raw_feature: Record<string, unknown>;
  observed_value: number;
  rule_result: Record<string, unknown>;
}

export interface AdminPluginConfig {
  config: PluginDefaultConfig;
  rule_version: string;
  stats: PluginEventStats;
}

export interface SourceDistributionResponse {
  manual: number;
  plugin: number;
  web: number;
  recheck: number;
  unknown: number;
  distribution: Record<string, number>;
}

export interface FeedbackTrendPoint {
  date: string;
  count: number;
  resolved_count: number;
}

export interface FeedbackTrend {
  trend: FeedbackTrendPoint[];
}
