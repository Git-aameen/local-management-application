import jwt
from fastapi import HTTPException
from jwt import PyJWKClient

from app.core.config import get_settings

# Auth0 custom claims (configured via an Auth0 Action/Rule on login) carrying our
# tenant-scoping and RBAC data. Auth0 requires custom claim names to be namespaced URIs.
COMPANY_ID_CLAIM = "https://localmanagementapp.com/company_id"
ROLE_CLAIM = "https://localmanagementapp.com/role"

_settings = get_settings()
_ISSUER = f"https://{_settings.auth0_domain}/"
_JWKS_URL = f"https://{_settings.auth0_domain}/.well-known/jwks.json"

# PyJWKClient fetches Auth0's signing keys (JWKS) over HTTPS and caches them in memory,
# automatically refetching only if a token references a key id it hasn't seen before.
_jwks_client = PyJWKClient(_JWKS_URL, cache_keys=True)


def verify_access_token(token: str) -> dict:
    """Verify an Auth0-issued access token's signature, expiration, audience, and issuer.

    Returns the decoded claims on success. Raises HTTPException(401) if the token is
    missing, malformed, expired, signed by an unknown key, or has the wrong audience/issuer.
    """
    try:
        signing_key = _jwks_client.get_signing_key_from_jwt(token)
        return jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            audience=_settings.auth0_audience,
            issuer=_ISSUER,
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=401,
            detail={"code": "INVALID_TOKEN", "message": f"Invalid or expired access token: {exc}"},
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
