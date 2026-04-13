from typing import Any, Dict, List

from fastapi import APIRouter, Depends
from sqlalchemy import desc
from sqlalchemy.orm import Session

from ..core import get_db
from ..models import ScanRecord as ScanRecordModel
from ..schemas import ApiResponse


router = APIRouter(prefix="/api/v1/reports", tags=["reports"])


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
