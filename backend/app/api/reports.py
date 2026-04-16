from __future__ import annotations

from typing import Any, Dict, List

from fastapi import APIRouter, Depends, Header
from sqlalchemy import desc
from sqlalchemy.orm import Session

from ..core import get_db
from ..models import (
    DomainBlacklist as DomainBlacklistModel,
    DomainWhitelist as DomainWhitelistModel,
    FeedbackCase as FeedbackCaseModel,
    ReportAction as ReportActionModel,
    RuleConfig as RuleConfigModel,
    ScanRecord as ScanRecordModel,
)
from ..schemas import ApiResponse, ReportActionCreate, ReportActionItem, ScanRecord, ScanRecordList, UserSiteStrategyCreate
from ..services import Detector
from ..services.rule_engine import build_model_breakdown, build_score_breakdown, ensure_default_rules
from .user import normalize_domain, upsert_strategy


router = APIRouter(prefix="/api/v1/reports", tags=["reports"])


def _actor(username: str | None, role: str | None):
    return (username or "platform-user").strip() or "platform-user", (role or "user").strip() or "user"


def _risk_text(label: str) -> str:
    return {"safe": "安全", "suspicious": "可疑", "malicious": "恶意"}.get(label, "未知")


def _model_score_from_record(record: ScanRecordModel) -> float:
    return float(record.model_malicious_prob or 0) * 100.0 + float(record.model_suspicious_prob or 0) * 50.0


def _raw_feature_summary(record: ScanRecordModel) -> Dict[str, Any]:
    raw_features = record.raw_features_json or {}
    return {
        "url": raw_features.get("url") or record.url,
        "domain": raw_features.get("domain") or record.domain,
        "title": raw_features.get("title") or record.title or "",
        "has_password_input": bool(raw_features.get("has_password_input", record.has_password_input)),
        "form_action_domains": raw_features.get("form_action_domains") or [],
        "button_texts": raw_features.get("button_texts") or [],
        "input_labels": raw_features.get("input_labels") or [],
        "visible_text_length": len(raw_features.get("visible_text") or ""),
        "text_length": len(" ".join(
            [
                str(raw_features.get("title") or ""),
                str(raw_features.get("visible_text") or ""),
                " ".join(raw_features.get("button_texts") or []),
                " ".join(raw_features.get("input_labels") or []),
            ]
        )),
    }


def _normalize_rule_detail(rule: Dict[str, Any], current_config: Any = None) -> Dict[str, Any]:
    name = rule.get("name") or rule.get("rule_name") or rule.get("rule_key") or "未命名规则"
    if current_config is not None:
        name = current_config.rule_name or name
    weight = float(rule.get("weight", rule.get("weighted_score", 0)) or 0)
    contribution = float(rule.get("contribution", rule.get("weighted_score", 0)) or 0)
    return {
        "id": rule.get("id"),
        "rule_key": rule.get("rule_key", ""),
        "rule_name": name,
        "name": name,
        "description": getattr(current_config, "description", None) if current_config is not None else rule.get("description"),
        "matched": bool(rule.get("matched")),
        "enabled": bool(getattr(current_config, "enabled", rule.get("enabled", True))),
        "applied": bool(rule.get("applied", bool(rule.get("matched")) and bool(rule.get("enabled", True)))),
        "weight": float(getattr(current_config, "weight", weight) or 0),
        "threshold": float(getattr(current_config, "threshold", rule.get("threshold", 0)) or 0),
        "contribution": contribution,
        "weighted_score": contribution,
        "raw_score": float(rule.get("raw_score", 1.0 if rule.get("matched") else 0.0) or 0),
        "reason": rule.get("reason") or rule.get("detail") or "历史报告未记录命中原因",
        "detail": rule.get("detail") or rule.get("reason") or "历史报告未记录命中原因",
        "category": getattr(current_config, "category", None) or rule.get("category") or "legacy",
        "severity": getattr(current_config, "severity", None) or rule.get("severity") or "medium",
        "raw_feature": rule.get("raw_feature") or {},
        "observed_value": rule.get("observed_value"),
    }


def _build_score_breakdown_from_record(record: ScanRecordModel, db: Session) -> Dict[str, Any]:
    ensure_default_rules(db)
    rule_keys = [rule.get("rule_key") for rule in (record.hit_rules_json or []) if rule.get("rule_key")]
    configs_by_key = {
        rule.rule_key: rule
        for rule in db.query(RuleConfigModel).filter(RuleConfigModel.rule_key.in_(rule_keys)).all()
    } if rule_keys else {}
    rules = [_normalize_rule_detail(rule, configs_by_key.get(rule.get("rule_key"))) for rule in (record.hit_rules_json or [])]
    model_result = {
        "safe_prob": record.model_safe_prob,
        "suspicious_prob": record.model_suspicious_prob,
        "malicious_prob": record.model_malicious_prob,
    }
    model_score = _model_score_from_record(record)
    raw_rule_total = sum(float(rule.get("contribution") or 0) for rule in rules if rule.get("enabled", True))
    enabled_weight_total = sum(float(rule.get("weight") or 0) for rule in rules if rule.get("enabled", True)) or None
    fusion_summary = (
        f"最终风险分 = 规则分 {record.rule_score:.1f} x 40% + 模型风险分 {model_score:.1f} x 60%。"
        f" 当前报告最终分为 {record.risk_score:.1f}，标签为 {record.label}。"
    )
    return build_score_breakdown(
        rules=rules,
        rule_score=float(record.rule_score or 0),
        rule_score_total=raw_rule_total,
        enabled_weight_total=float(enabled_weight_total or 0),
        model_result=model_result,
        model_score=model_score,
        final_score=float(record.risk_score or 0),
        label=record.label,
        raw_feature_summary=_raw_feature_summary(record),
        fusion_summary=fusion_summary,
    )


def _build_report(record: ScanRecordModel, db: Session) -> Dict[str, Any]:
    score_breakdown = _build_score_breakdown_from_record(record, db)
    all_rules: List[Dict[str, Any]] = score_breakdown.get("rules") or []
    matched_rules = [rule for rule in all_rules if rule.get("matched")]
    applied_rules = [rule for rule in all_rules if rule.get("applied")]
    raw_features = record.raw_features_json or {}

    if record.label == "malicious":
        conclusion = "该网址被判定为恶意，主要依据是规则命中、模型概率和融合评分共同指向高风险。"
    elif record.label == "suspicious":
        conclusion = "该网址被判定为可疑，建议人工核验域名、页面来源和敏感输入场景。"
    else:
        conclusion = "当前未发现足够高的风险信号，但仍建议保持基础安全检查。"

    evidence = [
        {
            "title": "规则评分",
            "summary": f"参与展示 {len(all_rules)} 条规则，命中 {len(matched_rules)} 条，实际计分 {len(applied_rules)} 条，规则分 {record.rule_score:.1f}。",
            "items": all_rules,
        },
        {
            "title": "模型评分",
            "summary": score_breakdown["model"]["contribution_summary"],
            "items": [score_breakdown["model"]],
        },
        {
            "title": "原始特征",
            "summary": "报告保留 URL、标题、表单 action、按钮/输入标签、密码框等关键特征，便于复盘规则命中原因。",
            "items": [score_breakdown["raw_features"]],
        },
    ]

    return {
        "id": record.id,
        "url": record.url,
        "domain": record.domain,
        "title": record.title,
        "source": record.source,
        "label": record.label,
        "label_text": _risk_text(record.label),
        "risk_score": record.risk_score,
        "rule_score": record.rule_score,
        "model_score": score_breakdown["model_score_total"],
        "model_probs": {
            "safe": record.model_safe_prob,
            "suspicious": record.model_suspicious_prob,
            "malicious": record.model_malicious_prob,
        },
        "model_breakdown": build_model_breakdown(
            {
                "safe_prob": record.model_safe_prob,
                "suspicious_prob": record.model_suspicious_prob,
                "malicious_prob": record.model_malicious_prob,
            },
            score_breakdown["model_score_total"],
        ),
        "score_breakdown": score_breakdown,
        "hit_rules": all_rules,
        "matched_rules": matched_rules,
        "applied_rules": applied_rules,
        "explanation": record.explanation,
        "recommendation": record.recommendation,
        "conclusion": conclusion,
        "evidence": evidence,
        "raw_features": raw_features,
        "created_at": record.created_at,
    }


def _get_record_or_none(db: Session, report_id: int):
    return db.query(ScanRecordModel).filter(ScanRecordModel.id == report_id).first()


def _save_action(
    db: Session,
    report_id: int,
    username: str,
    role: str,
    action_type: str,
    request: ReportActionCreate,
):
    action = ReportActionModel(
        report_id=report_id,
        actor=username,
        actor_role=role,
        action_type=action_type,
        status=request.status or "submitted",
        note=request.note,
    )
    db.add(action)
    db.commit()
    db.refresh(action)
    return action


def _ensure_global_whitelist(db: Session, domain: str, reason: str | None):
    existing = db.query(DomainWhitelistModel).filter(DomainWhitelistModel.domain == domain).first()
    if existing:
        return existing
    item = DomainWhitelistModel(domain=domain, reason=reason)
    db.add(item)
    db.commit()
    return item


def _ensure_global_blacklist(db: Session, domain: str, reason: str | None):
    existing = db.query(DomainBlacklistModel).filter(DomainBlacklistModel.domain == domain).first()
    if existing:
        return existing
    item = DomainBlacklistModel(domain=domain, reason=reason, risk_type="report_review")
    db.add(item)
    db.commit()
    return item


@router.get("/actions/recent", response_model=ApiResponse[list[ReportActionItem]])
def get_recent_actions(db: Session = Depends(get_db)):
    actions = db.query(ReportActionModel).order_by(desc(ReportActionModel.created_at)).limit(50).all()
    return {
        "code": 0,
        "message": "success",
        "data": [ReportActionItem.model_validate(action) for action in actions],
    }


@router.get("/latest", response_model=ApiResponse[dict])
def get_latest_report(db: Session = Depends(get_db)):
    record = db.query(ScanRecordModel).order_by(desc(ScanRecordModel.created_at)).first()
    if not record:
        return {"code": 404, "message": "暂无检测报告", "data": None}
    return {"code": 0, "message": "success", "data": _build_report(record, db)}


@router.get("/{report_id}", response_model=ApiResponse[dict])
def get_report(report_id: int, db: Session = Depends(get_db)):
    record = db.query(ScanRecordModel).filter(ScanRecordModel.id == report_id).first()
    if not record:
        return {"code": 404, "message": "报告不存在", "data": None}
    return {"code": 0, "message": "success", "data": _build_report(record, db)}


@router.get("/{report_id}/domain-history", response_model=ApiResponse[ScanRecordList])
def get_domain_history(report_id: int, db: Session = Depends(get_db)):
    record = _get_record_or_none(db, report_id)
    if not record:
        return {"code": 404, "message": "报告不存在", "data": None}
    records = db.query(ScanRecordModel).filter(
        ScanRecordModel.domain == record.domain,
        ScanRecordModel.id != record.id,
    ).order_by(desc(ScanRecordModel.created_at)).limit(20).all()
    return {
        "code": 0,
        "message": "success",
        "data": {
            "total": len(records),
            "records": [ScanRecord.model_validate(item) for item in records],
        },
    }


@router.post("/{report_id}/trust-domain", response_model=ApiResponse[ReportActionItem])
def trust_domain(
    report_id: int,
    request: ReportActionCreate,
    db: Session = Depends(get_db),
    x_webguard_user: str | None = Header(default=None),
    x_webguard_role: str | None = Header(default=None),
):
    record = _get_record_or_none(db, report_id)
    if not record:
        return {"code": 404, "message": "报告不存在", "data": None}
    username, role = _actor(x_webguard_user, x_webguard_role)
    reason = request.note or f"来自报告 #{report_id}"
    if role == "admin" or request.scope == "global":
        _ensure_global_whitelist(db, normalize_domain(record.domain), reason)
    else:
        upsert_strategy(db, username, "trusted", UserSiteStrategyCreate(domain=record.domain, reason=reason, source="report"))
    action = _save_action(db, report_id, username, role, "trust_domain", request)
    return {"code": 0, "message": "success", "data": ReportActionItem.model_validate(action)}


@router.post("/{report_id}/block-domain", response_model=ApiResponse[ReportActionItem])
def block_domain(
    report_id: int,
    request: ReportActionCreate,
    db: Session = Depends(get_db),
    x_webguard_user: str | None = Header(default=None),
    x_webguard_role: str | None = Header(default=None),
):
    record = _get_record_or_none(db, report_id)
    if not record:
        return {"code": 404, "message": "报告不存在", "data": None}
    username, role = _actor(x_webguard_user, x_webguard_role)
    reason = request.note or f"来自报告 #{report_id}"
    if role == "admin" or request.scope == "global":
        _ensure_global_blacklist(db, normalize_domain(record.domain), reason)
    else:
        upsert_strategy(db, username, "blocked", UserSiteStrategyCreate(domain=record.domain, reason=reason, source="report"))
    action = _save_action(db, report_id, username, role, "block_domain", request)
    return {"code": 0, "message": "success", "data": ReportActionItem.model_validate(action)}


@router.post("/{report_id}/mark-false-positive", response_model=ApiResponse[ReportActionItem])
def mark_false_positive(
    report_id: int,
    request: ReportActionCreate,
    db: Session = Depends(get_db),
    x_webguard_user: str | None = Header(default=None),
    x_webguard_role: str | None = Header(default=None),
):
    record = _get_record_or_none(db, report_id)
    if not record:
        return {"code": 404, "message": "报告不存在", "data": None}
    username, role = _actor(x_webguard_user, x_webguard_role)
    feedback = FeedbackCaseModel(
        username=username,
        report_id=report_id,
        url=record.url,
        domain=record.domain,
        feedback_type="false_positive",
        status=request.status or "pending_review",
        comment=request.note,
        source="report",
    )
    db.add(feedback)
    action = _save_action(db, report_id, username, role, "mark_false_positive", request)
    return {"code": 0, "message": "success", "data": ReportActionItem.model_validate(action)}


@router.post("/{report_id}/review", response_model=ApiResponse[ReportActionItem])
def review_report(
    report_id: int,
    request: ReportActionCreate,
    db: Session = Depends(get_db),
    x_webguard_user: str | None = Header(default=None),
    x_webguard_role: str | None = Header(default=None),
):
    if not _get_record_or_none(db, report_id):
        return {"code": 404, "message": "报告不存在", "data": None}
    username, role = _actor(x_webguard_user, x_webguard_role)
    action = _save_action(db, report_id, username, role, "review", request)
    return {"code": 0, "message": "success", "data": ReportActionItem.model_validate(action)}


@router.post("/{report_id}/recheck", response_model=ApiResponse[dict])
def recheck_report(
    report_id: int,
    request: ReportActionCreate,
    db: Session = Depends(get_db),
    x_webguard_user: str | None = Header(default=None),
    x_webguard_role: str | None = Header(default=None),
):
    record = _get_record_or_none(db, report_id)
    if not record:
        return {"code": 404, "message": "报告不存在", "data": None}
    username, role = _actor(x_webguard_user, x_webguard_role)
    detector = Detector(db)
    result = detector.detect_url(record.url, source="recheck", username=username)
    action = _save_action(db, report_id, username, role, "recheck", request)
    return {
        "code": 0,
        "message": "success",
        "data": {
            "action": ReportActionItem.model_validate(action),
            "result": result,
        },
    }
