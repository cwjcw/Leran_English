from pathlib import Path

from fastapi import FastAPI, Response, status
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from app.api import audio, auth, points, scenario, story, users, words
from app.core.config import get_settings
from app.db.models import Base
from app.db.session import engine
from sqlalchemy import text


settings = get_settings()


def create_app() -> FastAPI:
    app = FastAPI(title=settings.app_name)
    static_dir = Path(__file__).resolve().parent / "static"

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(auth.router, prefix=settings.api_prefix)
    app.include_router(users.router, prefix=settings.api_prefix)
    app.include_router(points.router, prefix=settings.api_prefix)
    app.include_router(words.router, prefix=settings.api_prefix)
    app.include_router(audio.router, prefix=settings.api_prefix)
    app.include_router(scenario.router, prefix=settings.api_prefix)
    app.include_router(story.router, prefix=settings.api_prefix)

    app.mount("/static", StaticFiles(directory=static_dir), name="static")

    @app.on_event("startup")
    def on_startup() -> None:
        Base.metadata.create_all(bind=engine)
        if settings.database_url.startswith("sqlite"):
            with engine.begin() as conn:
                reward_columns = [row[1] for row in conn.execute(text("PRAGMA table_info(rewards)")).fetchall()]
                if reward_columns and "image_url" not in reward_columns:
                    conn.execute(text("ALTER TABLE rewards ADD COLUMN image_url VARCHAR(500)"))
                word_columns = [row[1] for row in conn.execute(text("PRAGMA table_info(words)")).fetchall()]
                for column_name, column_type in [
                    ("textbook", "VARCHAR(120)"),
                    ("grade", "VARCHAR(40)"),
                    ("unit", "VARCHAR(80)"),
                    ("lesson", "VARCHAR(80)"),
                ]:
                    if word_columns and column_name not in word_columns:
                        conn.execute(text(f"ALTER TABLE words ADD COLUMN {column_name} {column_type}"))

    @app.get("/health")
    def health_check() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/")
    def root() -> FileResponse:
        return FileResponse(static_dir / "index.html")

    @app.get("/favicon.ico", include_in_schema=False)
    def favicon() -> Response:
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    return app


app = create_app()
