import hmac

from fastapi import Depends, HTTPException, Security
from fastapi.security import APIKeyHeader

from app.config import Settings, get_settings

# The Next.js gateway owns end-user authentication (Supabase JWTs).
# This service only ever talks to trusted internal callers, identified by
# a shared secret header.
api_key_header = APIKeyHeader(name="X-Internal-Api-Key", auto_error=False)


def verify_internal_api_key(
    api_key: str | None = Security(api_key_header),
    settings: Settings = Depends(get_settings),
) -> None:
    if not api_key or not hmac.compare_digest(
        api_key, settings.internal_api_key
    ):
        raise HTTPException(status_code=401, detail="Invalid internal API key")
