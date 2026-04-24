from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from .config import settings


engine_options = {
    "pool_pre_ping": True,
    "pool_recycle": 3600,
}
if settings.sqlalchemy_database_url.startswith("sqlite"):
    engine_options["connect_args"] = {"check_same_thread": False}
elif settings.sqlalchemy_database_url.startswith("postgresql"):
    engine_options["connect_args"] = {"connect_timeout": 5}

engine = create_engine(settings.sqlalchemy_database_url, **engine_options)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
