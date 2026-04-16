export type UserRole = 'admin' | 'user';
export type RiskLabel = 'safe' | 'suspicious' | 'malicious' | 'unknown';

export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

export interface DevelopmentUser {
  username: string;
  role: UserRole;
  display_name: string;
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
}

export interface RuleStats {
  rule_id?: number;
  rule_key: string;
  recent_hits_7d: number;
  recent_hit_rate_7d: number;
  risk_hits_7d: number;
  suspicious_hits_7d: number;
  malicious_hits_7d: number;
  false_positive_feedback_7d: number;
  last_hit_at?: string;
  false_positive_tendency: string;
}

export interface RuleStatsList {
  total: number;
  stats: RuleStats[];
}

export interface ModelBreakdown {
  safe_prob: number;
  suspicious_prob: number;
  malicious_prob: number;
  dominant_label: RiskLabel;
  model_score: number;
  contribution: number;
  contribution_summary: string;
}

export interface ScoreBreakdown {
  rule_score_total: number;
  rule_score_raw_total?: number;
  enabled_rule_weight_total?: number;
  model_score_total: number;
  final_score: number;
  label: RiskLabel;
  fusion_summary: string;
  rules: HitRule[];
  model: ModelBreakdown;
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
}

export interface ScanResult {
  label: RiskLabel;
  risk_score: number;
  rule_score: number;
  model_safe_prob: number;
  model_suspicious_prob: number;
  model_malicious_prob: number;
  hit_rules: HitRule[];
  score_breakdown?: ScoreBreakdown;
  explanation: string;
  recommendation: string;
  record_id: number;
}

export interface ScanRecordList {
  total: number;
  records: ScanRecordItem[];
}

export interface ScanRecordItem {
  id: number;
  url: string;
  domain: string;
  title?: string;
  source: string;
  label: RiskLabel;
  risk_score: number;
  rule_score: number;
  model_safe_prob: number;
  model_suspicious_prob: number;
  model_malicious_prob: number;
  has_password_input?: boolean;
  hit_rules_json?: HitRule[];
  raw_features_json?: Record<string, unknown>;
  explanation?: string;
  recommendation?: string;
  created_at: string;
}

export interface RuleConfig {
  id: number;
  rule_key: string;
  rule_name: string;
  name?: string;
  description?: string;
  category?: string;
  weight: number;
  threshold: number;
  enabled: boolean;
  severity?: 'low' | 'medium' | 'high' | 'critical' | string;
  stats?: RuleStats;
  created_at?: string;
  updated_at?: string;
}

export interface RuleConfigList {
  total: number;
  rules: RuleConfig[];
}

export interface DomainList<T> {
  total: number;
  items: T[];
}

export interface WhitelistItem {
  id: number;
  domain: string;
  reason?: string;
  added_at: string;
}

export interface BlacklistItem {
  id: number;
  domain: string;
  reason?: string;
  risk_type?: string;
  added_at: string;
}

export interface UserSiteStrategyItem {
  id: number;
  username: string;
  domain: string;
  strategy_type: 'trusted' | 'blocked' | 'paused';
  reason?: string;
  source?: string;
  expires_at?: string;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

export interface UserStrategyOverview {
  trusted_sites: UserSiteStrategyItem[];
  blocked_sites: UserSiteStrategyItem[];
  paused_sites: UserSiteStrategyItem[];
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

export interface ModelVersion {
  id: number;
  version: string;
  name: string;
  path: string;
  accuracy?: number;
  precision?: number;
  recall?: number;
  f1_score?: number;
  is_active: boolean;
  created_at: string;
}

export interface ModelVersionList {
  total: number;
  versions: ModelVersion[];
}

export interface ModelStatus {
  active_model: ModelVersion | null;
  model_count: number;
  model_type?: string;
  loaded_model_dir?: string;
  metadata?: Record<string, unknown>;
}

export interface StatsOverview {
  total_scans: number;
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

export interface ReportEvidence {
  title: string;
  summary: string;
  items: Array<Record<string, unknown>>;
}

export interface AnalysisReport {
  id: number;
  url: string;
  domain: string;
  title?: string;
  source: string;
  label: RiskLabel;
  label_text: string;
  risk_score: number;
  rule_score: number;
  model_score?: number;
  model_probs: {
    safe: number;
    suspicious: number;
    malicious: number;
  };
  model_breakdown?: ModelBreakdown;
  score_breakdown?: ScoreBreakdown;
  hit_rules: HitRule[];
  matched_rules: HitRule[];
  applied_rules?: HitRule[];
  explanation?: string;
  recommendation?: string;
  conclusion: string;
  evidence: ReportEvidence[];
  raw_features: Record<string, unknown>;
  created_at: string;
}
