from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, JSON
from sqlalchemy.sql import func
from ..core.database import Base


class TrainingRun(Base):
    """训练运行模型"""
    __tablename__ = "training_runs"
    
    id = Column(Integer, primary_key=True, index=True)
    model_version_id = Column(Integer, ForeignKey("model_versions.id"))
    start_time = Column(DateTime(timezone=True), server_default=func.now())
    end_time = Column(DateTime(timezone=True))
    status = Column(String(20), nullable=False)
    parameters = Column(JSON)
    metrics = Column(JSON)
