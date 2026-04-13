from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from ..core import get_db
from ..schemas import DomainBlacklist, DomainBlacklistCreate, DomainList, ApiResponse
from ..models import DomainBlacklist as DomainBlacklistModel

router = APIRouter(prefix="/api/v1/blacklist", tags=["blacklist"])


@router.get("", response_model=ApiResponse[DomainList])
def get_blacklist(
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(10, ge=1, le=100, description="每页数量"),
    db: Session = Depends(get_db)
):
    """获取黑名单列表"""
    # 计算偏移量
    offset = (page - 1) * page_size
    
    # 查询总记录数
    total = db.query(DomainBlacklistModel).count()
    
    # 查询记录
    items = db.query(DomainBlacklistModel).offset(offset).limit(page_size).all()
    
    # 转换为响应模型
    item_list = [DomainBlacklist.model_validate(item) for item in items]
    
    return {
        "code": 0,
        "message": "success",
        "data": {
            "total": total,
            "items": item_list
        }
    }


@router.post("", response_model=ApiResponse[DomainBlacklist])
def add_blacklist(request: DomainBlacklistCreate, db: Session = Depends(get_db)):
    """添加黑名单"""
    # 检查是否已存在
    existing = db.query(DomainBlacklistModel).filter(DomainBlacklistModel.domain == request.domain).first()
    if existing:
        return {
            "code": 400,
            "message": "域名已在黑名单中",
            "data": None
        }
    
    # 创建新记录
    blacklist = DomainBlacklistModel(
        domain=request.domain,
        reason=request.reason,
        risk_type=request.risk_type
    )
    db.add(blacklist)
    db.commit()
    db.refresh(blacklist)
    
    return {
        "code": 0,
        "message": "success",
        "data": DomainBlacklist.model_validate(blacklist)
    }


@router.delete("/{blacklist_id}", response_model=ApiResponse[dict])
def delete_blacklist(blacklist_id: int, db: Session = Depends(get_db)):
    """删除黑名单"""
    blacklist = db.query(DomainBlacklistModel).filter(DomainBlacklistModel.id == blacklist_id).first()
    if not blacklist:
        return {
            "code": 404,
            "message": "黑名单记录不存在",
            "data": None
        }
    
    db.delete(blacklist)
    db.commit()
    
    return {
        "code": 0,
        "message": "删除成功",
        "data": None
    }
