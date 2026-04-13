from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """应用配置类"""
    # 应用配置
    APP_NAME: str = "WebGuard"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True
    
    # 数据库配置
    DATABASE_URL: str = "sqlite:///./webguard.db"
    
    # 模型配置
    MODEL_DIR: str = "./models"
    MODEL_NAME: str = "text_classifier"
    
    class Config:
        env_file = ".env"
        case_sensitive = True


# 创建配置实例
settings = Settings()
