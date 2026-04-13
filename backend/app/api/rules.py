from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from ..core import get_db
from ..schemas import RuleConfig, RuleConfigUpdate, RuleConfigList, ApiResponse
from ..models import RuleConfig as RuleConfigModel

router = APIRouter(prefix="/api/v1/rules", tags=["rules"])


@router.get("", response_model=ApiResponse[RuleConfigList])
def get_rules(
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(10, ge=1, le=100, description="每页数量"),
    db: Session = Depends(get_db)
):
    """获取规则列表"""
    # 计算偏移量
    offset = (page - 1) * page_size
    
    # 查询总记录数
    total = db.query(RuleConfigModel).count()
    
    # 查询记录
    rules = db.query(RuleConfigModel).offset(offset).limit(page_size).all()
    
    # 转换为响应模型
    rule_list = [RuleConfig.model_validate(rule) for rule in rules]
    
    return {
        "code": 0,
        "message": "success",
        "data": {
            "total": total,
            "rules": rule_list
        }
    }


@router.put("/{rule_id}", response_model=ApiResponse[RuleConfig])
def update_rule(rule_id: int, request: RuleConfigUpdate, db: Session = Depends(get_db)):
    """更新规则"""
    rule = db.query(RuleConfigModel).filter(RuleConfigModel.id == rule_id).first()
    if not rule:
        return {
            "code": 404,
            "message": "规则不存在",
            "data": None
        }
    
    # 更新字段
    if request.weight is not None:
        rule.weight = request.weight
    if request.threshold is not None:
        rule.threshold = request.threshold
    if request.enabled is not None:
        rule.enabled = request.enabled
    
    db.commit()
    db.refresh(rule)
    
    return {
        "code": 0,
        "message": "success",
        "data": RuleConfig.model_validate(rule)
    }
