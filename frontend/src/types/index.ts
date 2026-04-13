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
  matched: boolean;
  raw_score: number;
  weighted_score: number;
  detail?: string;
}

export interface ScanResult {
  label: RiskLabel;
  risk_score: number;
  rule_score: number;
  model_safe_prob: number;
  model_suspicious_prob: number;
  model_malicious_prob: number;
  hit_rules: HitRule[];
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
  description?: string;
  weight: number;
  threshold: number;
  enabled: boolean;
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
  model_probs: {
    safe: number;
    suspicious: number;
    malicious: number;
  };
  hit_rules: HitRule[];
  matched_rules: HitRule[];
  explanation?: string;
  recommendation?: string;
  conclusion: string;
  evidence: ReportEvidence[];
  raw_features: Record<string, unknown>;
  created_at: string;
}
