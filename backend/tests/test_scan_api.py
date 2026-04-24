from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from app.main import app
from app.core.database import Base
from app.core import get_db

# 创建共享的 SQLite 内存测试数据库
engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 创建测试表
Base.metadata.create_all(bind=engine)

# 依赖覆盖函数
def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()

# 应用依赖覆盖
app.dependency_overrides[get_db] = override_get_db

# 测试客户端
client = TestClient(app)


def test_scan_url():
    """测试扫描URL接口"""
    response = client.post(
        "/api/v1/scan/url",
        json={"url": "https://www.baidu.com"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["code"] == 0
    assert data["message"] == "success"
    assert "data" in data
    assert "label" in data["data"]
    assert "risk_score" in data["data"]
    assert "record_id" in data["data"]


def test_scan_page():
    """测试扫描页面接口"""
    response = client.post(
        "/api/v1/scan/page",
        json={
            "url": "https://www.baidu.com",
            "title": "百度一下，你就知道",
            "visible_text": "百度搜索",
            "button_texts": ["搜索"],
            "input_labels": ["搜索框"],
            "form_action_domains": ["baidu.com"],
            "has_password_input": False
        }
    )
    assert response.status_code == 200
    data = response.json()
    assert data["code"] == 0
    assert data["message"] == "success"
    assert "data" in data
    assert "label" in data["data"]
    assert "risk_score" in data["data"]
    assert "record_id" in data["data"]


def test_scan_url_empty():
    """测试空URL参数"""
    response = client.post(
        "/api/v1/scan/url",
        json={"url": ""}
    )
    assert response.status_code == 400
    data = response.json()
    assert data["code"] == 40002
    assert data["message"] == "URL不能为空"
    assert data["data"] is None


def test_scan_page_empty_url():
    """测试空URL参数"""
    response = client.post(
        "/api/v1/scan/page",
        json={
            "url": "",
            "title": "百度一下，你就知道",
            "visible_text": "百度搜索",
            "button_texts": ["搜索"],
            "input_labels": ["搜索框"],
            "form_action_domains": ["baidu.com"],
            "has_password_input": False
        }
    )
    assert response.status_code == 400
    data = response.json()
    assert data["code"] == 40002
    assert data["message"] == "URL不能为空"
    assert data["data"] is None


def test_scan_url_validation_error():
    """测试请求校验错误响应契约"""
    response = client.post("/api/v1/scan/url", json={})
    assert response.status_code == 400
    data = response.json()
    assert data == {
        "code": 40002,
        "message": "invalid parameter",
        "data": None,
    }
