import logging

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1 import auth, companies, employees, positions, products
from app.core.config import get_settings

logger = logging.getLogger(__name__)

app = FastAPI(title="Local Management Application API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().allowed_origins_list,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(companies.router, prefix="/api/v1")
app.include_router(positions.router, prefix="/api/v1")
app.include_router(employees.router, prefix="/api/v1")
app.include_router(products.router, prefix="/api/v1")
app.include_router(auth.router, prefix="/api/v1")


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    if isinstance(exc.detail, dict) and "code" in exc.detail and "message" in exc.detail:
        code, message = exc.detail["code"], exc.detail["message"]
    else:
        code, message = "HTTP_ERROR", str(exc.detail)
    return JSONResponse(
        status_code=exc.status_code,
        content={"success": False, "data": None, "error": {"code": code, "message": message}},
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
    logger.exception("Unhandled exception on %s", request.url.path)
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
