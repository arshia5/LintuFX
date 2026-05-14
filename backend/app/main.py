from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .api import public_router, router
from .auth import require_house_user
from .config import get_settings


settings = get_settings()
allowed_ips = settings.allowed_ip_set
cors_allowed_origins = settings.cors_allowed_origin_list
cors_allowed_origin_regex = settings.resolved_cors_allowed_origin_regex

app = FastAPI(
    title="FX Ledger API",
    version="0.1.0",
    description=(
        "Tracks FX obligations through orders, actual money movements through "
        "journal entries, and house-only treasury exchanges."
    ),
)

if cors_allowed_origins or cors_allowed_origin_regex:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_allowed_origins,
        allow_origin_regex=cors_allowed_origin_regex,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["Content-Disposition"],
    )


@app.middleware("http")
async def allowed_ip_middleware(request: Request, call_next):
    if allowed_ips and request.client and request.client.host not in allowed_ips:
        return JSONResponse(status_code=403, content={"detail": "IP not allowed"})
    return await call_next(request)


app.include_router(public_router)
app.include_router(router, dependencies=[Depends(require_house_user)])
