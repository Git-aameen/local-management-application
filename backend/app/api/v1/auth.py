from fastapi import APIRouter

router = APIRouter(prefix="/auth", tags=["auth"])

# Endpoints not implemented yet — skeleton only. Authentication is handled entirely by
# Auth0's hosted Universal Login (Authorization Code + PKCE) on the frontend; this backend
# only verifies the resulting access tokens (see CLAUDE.md § Authentication & Authorization).
