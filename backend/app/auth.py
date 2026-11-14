from __future__ import annotations

import hashlib
import hmac
import re
import secrets
from datetime import datetime, timedelta, timezone

from .database import _connect, initialize

PASSWORD_ITERATIONS = 310_000
SESSION_DAYS = 7
EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def _password_hash(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PASSWORD_ITERATIONS)
    return f"pbkdf2_sha256${PASSWORD_ITERATIONS}${salt.hex()}${digest.hex()}"


def _password_matches(password: str, encoded: str) -> bool:
    try:
        algorithm, iterations, salt, expected = encoded.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        digest = hashlib.pbkdf2_hmac(
            "sha256", password.encode(), bytes.fromhex(salt), int(iterations)
        ).hex()
        return hmac.compare_digest(digest, expected)
    except (TypeError, ValueError):
        return False


def validate_registration(name: str, email: str, password: str) -> tuple[str, str]:
    clean_name = " ".join(name.strip().split())
    clean_email = email.strip().lower()
    if len(clean_name) < 2 or len(clean_name) > 80:
        raise ValueError("Name must be between 2 and 80 characters.")
    if not EMAIL_PATTERN.match(clean_email) or len(clean_email) > 254:
        raise ValueError("Enter a valid email address.")
    if len(password) < 8 or len(password) > 128:
        raise ValueError("Password must be between 8 and 128 characters.")
    return clean_name, clean_email


def create_user(name: str, email: str, password: str) -> dict:
    initialize()
    name, email = validate_registration(name, email, password)
    with _connect() as connection:
        existing = connection.execute(
            "select id from app_users where email = %s", (email,)
        ).fetchone()
        if existing:
            raise ValueError("An account with this email already exists.")
        row = connection.execute(
            """insert into app_users(name, email, password_hash)
               values (%s, %s, %s) returning id, name, email, created_at""",
            (name, email, _password_hash(password)),
        ).fetchone()
    return dict(row)


def authenticate(email: str, password: str) -> dict | None:
    initialize()
    with _connect() as connection:
        row = connection.execute(
            """select id, name, email, password_hash, created_at
               from app_users where email = %s""",
            (email.strip().lower(),),
        ).fetchone()
        if not row or not _password_matches(password, row["password_hash"]):
            return None
        connection.execute("update app_users set last_login_at = now() where id = %s", (row["id"],))
    return {key: row[key] for key in ("id", "name", "email", "created_at")}


def create_session(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    expires_at = datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS)
    with _connect() as connection:
        connection.execute("delete from auth_sessions where expires_at <= now()")
        connection.execute(
            "insert into auth_sessions(user_id, token_hash, expires_at) values (%s, %s, %s)",
            (user_id, token_hash, expires_at),
        )
    return token


def user_for_session(token: str | None) -> dict | None:
    if not token:
        return None
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    with _connect() as connection:
        row = connection.execute(
            """select u.id, u.name, u.email, u.created_at
               from auth_sessions s join app_users u on u.id = s.user_id
               where s.token_hash = %s and s.expires_at > now()""",
            (token_hash,),
        ).fetchone()
    return dict(row) if row else None


def delete_session(token: str | None) -> None:
    if not token:
        return
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    with _connect() as connection:
        connection.execute("delete from auth_sessions where token_hash = %s", (token_hash,))
