import { getSettings } from './storage.js';
import type { DetectionResult } from './storage.js';

export interface AnalyzeRequest {
  url: string;
  title: string;
  visible_text: string;
  button_texts: string[];
  input_labels: string[];
  form_action_domains: string[];
  has_password_input: boolean;
}

export interface FeedbackRequest {
  url: string;
  feedback_type: string;
  comment: string;
}

export async function analyzeCurrentPage(data: AnalyzeRequest): Promise<DetectionResult> {
  const settings = await getSettings();
  const response = await fetch(`${settings.apiBaseUrl}/api/v1/plugin/analyze-current`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) throw new Error(`API request failed: ${response.status}`);
  const result = await response.json();
  return result.data;
}

export async function checkBackend(): Promise<boolean> {
  try {
    const settings = await getSettings();
    const response = await fetch(`${settings.apiBaseUrl}/health`, { method: 'GET' });
    return response.ok;
  } catch {
    return false;
  }
}

export async function submitFeedback(data: FeedbackRequest): Promise<void> {
  const settings = await getSettings();
  const response = await fetch(`${settings.apiBaseUrl}/api/v1/plugin/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error(`API request failed: ${response.status}`);
}
