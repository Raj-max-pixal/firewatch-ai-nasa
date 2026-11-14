import pytest

from backend.app import auth


def test_password_hash_is_salted_and_verifiable():
    first = auth._password_hash("strong-password")
    second = auth._password_hash("strong-password")
    assert first != second
    assert auth._password_matches("strong-password", first)
    assert not auth._password_matches("wrong-password", first)


def test_registration_validation_normalizes_identity():
    name, email = auth.validate_registration("  Firewatch   Analyst  ", " USER@Example.COM ", "12345678")
    assert name == "Firewatch Analyst"
    assert email == "user@example.com"


def test_registration_rejects_short_password():
    with pytest.raises(ValueError, match="Password"):
        auth.validate_registration("Firewatch Analyst", "user@example.com", "short")
