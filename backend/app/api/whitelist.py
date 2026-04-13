from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from ..core import get_db
from ..schemas import DomainWhitelist, DomainWhitelistCreate, DomainList, ApiResponse
from ..models import DomainWhitelist as DomainWhitelistModel

router = APIRouter(prefix="/api/v1/whitelist", tags=["whitelist"])


@router.get("", response_model=ApiResponse[DomainList])
def get_whitelist(
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(10, ge=1, le=100, description="每页数量"),
    db: Session = Depends(get_db)
):
    """获取白名单列表"""
    # 计算偏移量
    offset = (page - 1) * page_size
    
    # 查询总记录数
    total = db.query(DomainWhitelistModel).count()
    
    # 查询记录
    items = db.query(DomainWhitelistModel).offset(offset).limit(page_size).all()
    
    # 转换为响应模型
    item_list = [DomainWhitelist.model_validate(item) for item in items]
    
    return {
        "code": 0,
        "message": "success",
        "data": {
            "total": total,
            "items": item_list
        }
    }


@router.post("", response_model=ApiResponse[DomainWhitelist])
def add_whitelist(request: DomainWhitelistCreate, db: Session = Depends(get_db)):
    """添加白名单"""
    # 检查是否已存在
    existing = db.query(DomainWhitelistModel).filter(DomainWhitelistModel.domain == request.domain).first()
    if existing:
        return {
            "code": 400,
            "message": "域名已在白名单中",
            "data": None
        }
    
    # 创建新记录
    whitelist = DomainWhitelistModel(
        domain=request.domain,
        reason=request.reason
    )
    db.add(whitelist)
    db.commit()
    db.refresh(whitelist)
    
    return {
        "code": 0,
        "message": "success",
        "data": DomainWhitelist.model_validate(whitelist)
    }


@router.delete("/{whitelist_id}", response_model=ApiResponse[dict])
def delete_whitelist(whitelist_id: int, db: Session = Depends(get_db)):
    """删除白名单"""
    whitelist = db.query(DomainWhitelistModel).filter(DomainWhitelistModel.id == whitelist_id).first()
    if not whitelist:
        return {
            "code": 404,
            "message": "白名单记录不存在",
            "data": None
        }
    
    db.delete(whitelist)
    db.commit()
    
    return {
        "code": 0,
        "message": "删除成功",
        "data": None
    }
