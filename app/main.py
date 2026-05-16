from pathlib import Path

from fastapi import FastAPI, Response, status
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from app.api import audio, scenario, story, users, words
from app.core.config import get_settings
from app.db.models import Base
from app.db.session import engine


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

    app.include_router(users.router, prefix=settings.api_prefix)
    app.include_router(words.router, prefix=settings.api_prefix)
    app.include_router(audio.router, prefix=settings.api_prefix)
    app.include_router(scenario.router, prefix=settings.api_prefix)
    app.include_router(story.router, prefix=settings.api_prefix)

    app.mount("/static", StaticFiles(directory=static_dir), name="static")

    @app.on_event("startup")
    def on_startup() -> None:
        Base.metadata.create_all(bind=engine)

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
