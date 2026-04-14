from typing import Any, Dict, List

from fastapi import APIRouter, Depends, Header
from sqlalchemy import desc
from sqlalchemy.orm import Session

from ..core import get_db
from ..models import (
    DomainBlacklist as DomainBlacklistModel,
    DomainWhitelist as DomainWhitelistModel,
    ReportAction as ReportActionModel,
    ScanRecord as ScanRecordModel,
)
from ..schemas import ApiResponse, ReportActionCreate, ReportActionItem, ScanRecord, ScanRecordList, UserSiteStrategyCreate
from ..services import Detector
from .user import normalize_domain, upsert_strategy


router = APIRouter(prefix="/api/v1/reports", tags=["reports"])


def _actor(username: str | None, role: str | None):
    return (username or "platform-user").strip() or "platform-user", (role or "user").strip() or "user"


def _risk_text(label: str) -> str:
    return {"safe": "安全", "suspicious": "可疑", "malicious": "恶意"}.get(label, "未知")


def _build_report(record: ScanRecordModel) -> Dict[str, Any]:
    hit_rules: List[Dict[str, Any]] = record.hit_rules_json or []
    matched_rules = [rule for rule in hit_rules if rule.get("matched")]
    raw_features = record.raw_features_json or {}

    if record.label == "malicious":
        conclusion = "该网址存在较高风险，建议立即停止访问并避免输入账号、密码或支付信息。"
    elif record.label == "suspicious":
        conclusion = "该网址存在可疑信号，建议人工核验域名、证书和页面来源后再继续访问。"
    else:
        conclusion = "当前未发现明显恶意特征，但仍建议保持基本安全习惯。"

    evidence = [
        {
            "title": "规则引擎",
            "summary": f"命中 {len(matched_rules)} 条规则，规则综合评分 {record.rule_score:.2f}。",
            "items": matched_rules[:8],
        },
        {
            "title": "模型推理",
            "summary": (
                f"安全概率 {record.model_safe_prob:.2f}，"
                f"可疑概率 {record.model_suspicious_prob:.2f}，"
                f"恶意概率 {record.model_malicious_prob:.2f}。"
            ),
            "items": [],
        },
        {
            "title": "页面特征",
            "summary": "系统提取 URL、标题、可见文本、按钮、输入框、表单 action 等特征进行综合判断。",
            "items": [
                {"name": "页面标题", "value": raw_features.get("title") or record.title or "未采集"},
                {"name": "是否存在密码框", "value": "是" if record.has_password_input else "否"},
                {"name": "表单提交域名", "value": ", ".join(raw_features.get("form_action_domains") or []) or "未发现"},
            ],
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
        "model_probs": {
            "safe": record.model_safe_prob,
            "suspicious": record.model_suspicious_prob,
            "malicious": record.model_malicious_prob,
        },
        "hit_rules": hit_rules,
        "matched_rules": matched_rules,
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
    return {"code": 0, "message": "success", "data": _build_report(record)}


@router.get("/{report_id}", response_model=ApiResponse[dict])
def get_report(report_id: int, db: Session = Depends(get_db)):
    record = db.query(ScanRecordModel).filter(ScanRecordModel.id == report_id).first()
    if not record:
        return {"code": 404, "message": "报告不存在", "data": None}
    return {"code": 0, "message": "success", "data": _build_report(record)}


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
    if not _get_record_or_none(db, report_id):
        return {"code": 404, "message": "报告不存在", "data": None}
    username, role = _actor(x_webguard_user, x_webguard_role)
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
