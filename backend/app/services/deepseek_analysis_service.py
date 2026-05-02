from __future__ import annotations

import json
import re
import socket
from typing import Any, Callable
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse
from urllib.request import Request, urlopen

from ..core import settings


VALID_AI_LABELS = {"safe", "suspicious", "malicious"}
SENSITIVE_QUERY_KEYS = {"token", "code", "session", "auth", "key", "password", "secret", "access_token", "refresh_token"}
AI_TRIGGER_RULE_KEYS = {
    "password_field",
    "cross_domain_form",
    "brand_impersonation",
    "brand_login_mismatch_combo",
    "credential_exfiltration_combo",
    "payment_urgency_combo",
    "wallet_secret_combo",
    "suspicious_redirect_combo",
}
SENSITIVE_TEXT_TERMS = {
    "验证码",
    "银行卡",
    "支付",
    "付款",
    "转账",
    "钱包",
    "私钥",
    "助记词",
    "verification code",
    "bank card",
    "payment",
    "pay",
    "wallet",
    "private key",
    "seed phrase",
    "mnemonic",
}


Transport = Callable[[str, dict[str, Any], dict[str, str], int], dict[str, Any]]
_UNSET = object()


class DeepSeekAnalysisService:
    def __init__(
        self,
        *,
        api_key: str | None | object = _UNSET,
        base_url: str | None = None,
        model: str | None = None,
        enabled: str | bool | None = None,
        timeout_seconds: int | None = None,
        transport: Transport | None = None,
    ):
        resolved_api_key = settings.DEEPSEEK_API_KEY if api_key is _UNSET else api_key
        self.api_key = str(resolved_api_key) if resolved_api_key else None
        self.base_url = (base_url or settings.DEEPSEEK_BASE_URL).rstrip("/")
        self.model = model or settings.DEEPSEEK_MODEL
        self.enabled = enabled if enabled is not None else settings.DEEPSEEK_ENABLED
        self.timeout_seconds = int(timeout_seconds or settings.DEEPSEEK_TIMEOUT_SECONDS or 20)
        self.transport = transport or self._default_transport

    def analyze(
        self,
        *,
        features: dict[str, Any],
        behavior_score: float,
        behavior_signals: list[dict[str, Any]],
        threat_intel_hit: bool = False,
    ) -> dict[str, Any]:
        trigger_reasons = self._trigger_reasons(features, behavior_score, behavior_signals, threat_intel_hit)
        if not trigger_reasons:
            return self._fallback("not_triggered", "AI analysis was not triggered for this low-risk page.", trigger_reasons)

        enabled_state = self._enabled_state()
        if enabled_state == "disabled":
            return self._fallback("disabled", "DeepSeek analysis is disabled by configuration.", trigger_reasons)
        if not self.api_key:
            return self._fallback("no_api_key", "DEEPSEEK_API_KEY is not configured.", trigger_reasons)

        ai_input = self.build_analysis_input(features, behavior_score, behavior_signals, threat_intel_hit)
        payload = self._build_request_payload(ai_input)
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        try:
            response = self.transport(f"{self.base_url}/chat/completions", payload, headers, self.timeout_seconds)
            content = self._extract_content(response)
            parsed = self._parse_model_json(content)
            analysis = self._normalize_model_result(parsed)
            analysis.update(
                {
                    "status": "used",
                    "provider": "deepseek",
                    "model": self.model,
                    "error": None,
                    "trigger_reasons": trigger_reasons,
                }
            )
            return analysis
        except (TimeoutError, socket.timeout) as exc:
            return self._fallback("timeout", "DeepSeek request timed out.", trigger_reasons, error=str(exc))
        except ValueError as exc:
            return self._fallback("error", "DeepSeek returned an invalid analysis response.", trigger_reasons, error=self._safe_error(exc))
        except (HTTPError, URLError, OSError) as exc:
            return self._fallback("error", "DeepSeek request failed.", trigger_reasons, error=self._safe_error(exc))
        except Exception as exc:
            return self._fallback("error", "DeepSeek analysis failed.", trigger_reasons, error=self._safe_error(exc))

    def build_analysis_input(
        self,
        features: dict[str, Any],
        behavior_score: float,
        behavior_signals: list[dict[str, Any]],
        threat_intel_hit: bool = False,
    ) -> dict[str, Any]:
        raw_features = features.get("raw_features") or {}
        visible_text = self._sanitize_text(raw_features.get("visible_text") or "", max_length=1800)
        button_texts = [self._sanitize_text(item, max_length=120) for item in (raw_features.get("button_texts") or [])[:30]]
        input_labels = [self._sanitize_text(item, max_length=120) for item in (raw_features.get("input_labels") or [])[:30]]
        signals = [self._compact_signal(signal) for signal in behavior_signals[:12]]
        return {
            "url": self._sanitize_url(raw_features.get("url") or ""),
            "domain": raw_features.get("domain") or features.get("domain") or "",
            "title": self._sanitize_text(raw_features.get("title") or "", max_length=256),
            "visible_text_summary": visible_text,
            "button_texts": button_texts,
            "input_labels": input_labels,
            "has_password_input": bool(features.get("has_password_input", raw_features.get("has_password_input", False))),
            "form_action_domains": list(raw_features.get("form_action_domains") or [])[:30],
            "behavior_score": float(behavior_score or 0.0),
            "behavior_signals": signals,
            "threat_intel_hit": bool(threat_intel_hit),
            "risk_signal_summary": [signal.get("reason") for signal in signals if signal.get("reason")][:8],
        }

    def _trigger_reasons(
        self,
        features: dict[str, Any],
        behavior_score: float,
        behavior_signals: list[dict[str, Any]],
        threat_intel_hit: bool,
    ) -> list[str]:
        if threat_intel_hit:
            return []
        reasons: list[str] = []
        if behavior_score >= 25:
            reasons.append("behavior_score>=25")
        matched_keys = {str(signal.get("rule_key")) for signal in behavior_signals if signal.get("matched", True)}
        for rule_key in sorted(AI_TRIGGER_RULE_KEYS & matched_keys):
            reasons.append(f"matched_rule:{rule_key}")
        raw_features = features.get("raw_features") or {}
        searchable = " ".join(
            [
                str(raw_features.get("title") or ""),
                str(raw_features.get("visible_text") or ""),
                " ".join(raw_features.get("button_texts") or []),
                " ".join(raw_features.get("input_labels") or []),
            ]
        ).lower()
        sensitive_hits = sorted(term for term in SENSITIVE_TEXT_TERMS if term.lower() in searchable)
        if sensitive_hits:
            reasons.append("sensitive_terms:" + ",".join(sensitive_hits[:5]))
        if behavior_score < 20 and not reasons:
            return []
        return reasons

    def _enabled_state(self) -> str:
        value = self.enabled
        if isinstance(value, bool):
            return "enabled" if value else "disabled"
        normalized = str(value or "auto").strip().lower()
        if normalized in {"false", "0", "off", "disabled", "no"}:
            return "disabled"
        if normalized in {"auto", ""}:
            return "enabled"
        return "enabled"

    def _build_request_payload(self, ai_input: dict[str, Any]) -> dict[str, Any]:
        return {
            "model": self.model,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are a web security risk analyzer. Analyze structured page features for phishing, scam, "
                        "brand impersonation, credential theft, verification-code theft, payment fraud, wallet "
                        "authorization abuse, private-key theft, and seed-phrase theft. Return JSON only."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        "Return only this JSON shape without markdown: "
                        '{"label":"safe|suspicious|malicious","risk_score":0-100,'
                        '"risk_types":["phishing","scam","brand_impersonation","credential_theft"],'
                        '"reasons":["reason1"],"recommendation":"user safety advice","confidence":0-1}\n'
                        "Structured page features:\n"
                        + json.dumps(ai_input, ensure_ascii=False)
                    ),
                },
            ],
            "temperature": 0.1,
            "response_format": {"type": "json_object"},
        }

    def _default_transport(self, url: str, payload: dict[str, Any], headers: dict[str, str], timeout: int) -> dict[str, Any]:
        request = Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
        with urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8", errors="replace"))

    def _extract_content(self, response: dict[str, Any]) -> str:
        choices = response.get("choices")
        if not isinstance(choices, list) or not choices:
            raise ValueError("missing choices")
        message = choices[0].get("message") if isinstance(choices[0], dict) else None
        content = message.get("content") if isinstance(message, dict) else None
        if not isinstance(content, str) or not content.strip():
            raise ValueError("missing message content")
        return content.strip()

    def _parse_model_json(self, content: str) -> dict[str, Any]:
        cleaned = content.strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
            cleaned = re.sub(r"\s*```$", "", cleaned)
        try:
            parsed = json.loads(cleaned)
        except json.JSONDecodeError as exc:
            match = re.search(r"\{.*\}", cleaned, flags=re.DOTALL)
            if not match:
                raise ValueError("response is not JSON") from exc
            parsed = json.loads(match.group(0))
        if not isinstance(parsed, dict):
            raise ValueError("response JSON is not an object")
        return parsed

    def _normalize_model_result(self, parsed: dict[str, Any]) -> dict[str, Any]:
        label = parsed.get("label")
        if label not in VALID_AI_LABELS:
            raise ValueError("invalid label")
        risk_score = self._clamp_float(parsed.get("risk_score"), 0.0, 100.0)
        confidence = self._clamp_float(parsed.get("confidence", 0.0), 0.0, 1.0)
        risk_types = parsed.get("risk_types") if isinstance(parsed.get("risk_types"), list) else []
        reasons = parsed.get("reasons") if isinstance(parsed.get("reasons"), list) else []
        recommendation = parsed.get("recommendation") if isinstance(parsed.get("recommendation"), str) else ""
        return {
            "label": label,
            "risk_score": risk_score,
            "risk_types": [str(item)[:80] for item in risk_types[:8] if str(item).strip()],
            "reasons": [str(item)[:300] for item in reasons[:5] if str(item).strip()],
            "recommendation": recommendation[:500],
            "confidence": confidence,
        }

    def _sanitize_url(self, url: str) -> str:
        if not url:
            return ""
        parsed = urlparse(url)
        query_pairs = []
        for key, value in parse_qsl(parsed.query, keep_blank_values=True):
            if key.lower() in SENSITIVE_QUERY_KEYS or any(token in key.lower() for token in SENSITIVE_QUERY_KEYS):
                query_pairs.append((key, "[REDACTED]"))
            else:
                query_pairs.append((key, self._sanitize_text(value, max_length=120)))
        return urlunparse(parsed._replace(query=urlencode(query_pairs, doseq=True)))

    def _sanitize_text(self, value: Any, max_length: int) -> str:
        text = re.sub(r"\s+", " ", str(value or "")).strip()
        text = re.sub(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+", "[REDACTED_EMAIL]", text)
        text = re.sub(r"(?<!\d)(?:\d[ -]?){15,19}\d(?!\d)", "[REDACTED_ID_OR_CARD]", text)
        text = re.sub(r"(?<!\d)(?:\+?\d[\d\s-]{9,}\d)(?!\d)", "[REDACTED_PHONE]", text)
        text = re.sub(r"\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b", "[REDACTED_TOKEN]", text)
        text = re.sub(r"\b[A-Za-z0-9+/=_-]{32,}\b", "[REDACTED_TOKEN]", text)
        return text[:max_length]

    def _compact_signal(self, signal: dict[str, Any]) -> dict[str, Any]:
        return {
            "rule_key": signal.get("rule_key"),
            "rule_name": signal.get("rule_name"),
            "severity": signal.get("severity"),
            "category": signal.get("category"),
            "score": signal.get("score"),
            "reason": self._sanitize_text(signal.get("reason") or "", max_length=300),
        }

    def _clamp_float(self, value: Any, lower: float, upper: float) -> float:
        try:
            numeric = float(value)
        except (TypeError, ValueError) as exc:
            raise ValueError("invalid numeric value") from exc
        return max(lower, min(upper, numeric))

    def _fallback(
        self,
        status: str,
        reason: str,
        trigger_reasons: list[str],
        *,
        error: str | None = None,
    ) -> dict[str, Any]:
        return {
            "status": status,
            "provider": "deepseek",
            "model": self.model,
            "risk_score": None,
            "label": None,
            "risk_types": [],
            "reasons": [],
            "recommendation": "",
            "confidence": 0.0,
            "error": error,
            "reason": reason,
            "trigger_reasons": trigger_reasons,
        }

    def _safe_error(self, exc: Exception) -> str:
        message = str(exc)
        if self.api_key:
            message = message.replace(self.api_key, "[REDACTED]")
        message = re.sub(r"sk-[A-Za-z0-9_-]{8,}", "sk-[REDACTED]", message)
        message = re.sub(r"Bearer\s+[A-Za-z0-9._~+/=-]{8,}", "Bearer [REDACTED]", message, flags=re.IGNORECASE)
        return message[:300]
