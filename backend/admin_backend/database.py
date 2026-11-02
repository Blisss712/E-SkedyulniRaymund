from contextlib import contextmanager
from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

class Base(DeclarativeBase):
    pass

class Database:
    def __init__(self, url: str):
        if not url:
            raise RuntimeError("DATABASE_URL is required.")
        self.engine = create_engine(url, pool_pre_ping=True)
        self.factory = sessionmaker(bind=self.engine, autoflush=False, expire_on_commit=False)

    def create_tables(self) -> None:
        from . import models
        Base.metadata.create_all(self.engine)

    @contextmanager
    def session(self) -> Iterator[Session]:
        session = self.factory()
        try:
            yield session
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    def dispose(self) -> None:
        self.engine.dispose()
