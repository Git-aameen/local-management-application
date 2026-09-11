import logging
import uuid

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1 import auth, companies, employees, me, positions, products
from app.core.config import get_settings
from app.core.dependencies import get_current_employee_context
from app.core.security import COMPANY_ID_CLAIM, EMAIL_CLAIM

logger = logging.getLogger(__name__)

app = FastAPI(title="Local Management Application API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().allowed_origins_list,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    """Tags every request with a short id so a single failure can be traced through the
    logs (and back to the client, via the response header) even without company_id/email
    context — e.g. a crash before auth runs (CLAUDE.md § Error Handling & Logging).
    """
    request.state.request_id = uuid.uuid4().hex[:12]
    response = await call_next(request)
    response.headers["X-Request-Id"] = request.state.request_id
    return response

# get_current_employee_context is a REQUIRED gate (see its docstring): every non-super_admin
# token must have a matching Employee record, or every route below rejects it with 403
# ACCOUNT_NOT_PROVISIONED before its own handler ever runs — reading data requires a
# provisioned account too, not just writing it (CLAUDE.md § Multi-Tenant Rules). Declaring it
# once per include_router() call (rather than on every individual endpoint) is what makes
# "ALL protected endpoints" actually true here; FastAPI resolves/caches it once per request
# regardless of how many places reference it, so this doesn't cost an extra DB query on the
# write endpoints that also depend on it directly via require_position_permission().
_require_provisioned_account = [Depends(get_current_employee_context)]

app.include_router(companies.router, prefix="/api/v1", dependencies=_require_provisioned_account)
app.include_router(positions.router, prefix="/api/v1", dependencies=_require_provisioned_account)
app.include_router(employees.router, prefix="/api/v1", dependencies=_require_provisioned_account)
app.include_router(products.router, prefix="/api/v1", dependencies=_require_provisioned_account)
app.include_router(auth.router, prefix="/api/v1")
app.include_router(me.router, prefix="/api/v1", dependencies=_require_provisioned_account)


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    if isinstance(exc.detail, dict) and "code" in exc.detail and "message" in exc.detail:
        code, message = exc.detail["code"], exc.detail["message"]
    else:
        code, message = "HTTP_ERROR", str(exc.detail)
    return JSONResponse(
        status_code=exc.status_code,
        content={"success": False, "data": None, "error": {"code": code, "message": message}},
        # Forward any headers the raiser attached to the exception (e.g. WWW-Authenticate
        # on a 401) — building a fresh JSONResponse here instead of letting FastAPI's
        # default handler run means those are otherwise silently dropped.
        headers=exc.headers,
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    details = []
    for err in exc.errors():
        loc = ".".join(str(part) for part in err["loc"] if part != "body")
        details.append(f"{loc}: {err['msg']}" if loc else err["msg"])
    message = "; ".join(details) or "Invalid request data."
    return JSONResponse(
        status_code=400,
        content={"success": False, "data": None, "error": {"code": "VALIDATION_ERROR", "message": message}},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    # claims is only present once get_current_claims has run for this request (see
    # app/core/dependencies.py) — absent for e.g. a crash before auth, or on the public
    # /api/v1/auth routes, so every lookup here is best-effort via .get()/getattr().
    claims = getattr(request.state, "claims", {})
    logger.exception(
        "Unhandled exception on %s [request_id=%s company_id=%s user=%s]",
        request.url.path,
        getattr(request.state, "request_id", None),
        claims.get(COMPANY_ID_CLAIM),
        claims.get(EMAIL_CLAIM),
    )
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "data": None,
            "error": {"code": "INTERNAL_ERROR", "message": "An unexpected error occurred."},
        },
    )


@app.get("/health")
async def health() -> dict:
    return {"success": True, "data": {"status": "ok"}, "error": None}
