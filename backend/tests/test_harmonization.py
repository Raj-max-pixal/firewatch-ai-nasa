import pandas as pd
from backend.app.harmonization import harmonize
from backend.app import database
from backend.app.config import settings


def test_harmonize_keeps_sensor_identity_and_source_rows():
    source = pd.DataFrame([
        {"latitude": 11.01, "longitude": 76.95, "acq_date": "2026-11-12", "acq_time": 421, "confidence": "h", "frp": 18},
        {"latitude": 11.02, "longitude": 76.96, "acq_date": "2026-11-12", "acq_time": 425, "confidence": "nominal", "frp": 12},
    ])
    result = harmonize(source, sensor="VIIRS")
    assert len(result) == 2
    assert set(result.satellite) == {"VIIRS"}
    assert result.acquired.dt.tz is not None
    assert result.possible_overlap.all()


def test_invalid_coordinates_are_rejected():
    source = pd.DataFrame([
        {"latitude": 91, "longitude": 77, "acquired": "2026-11-12T00:00:00Z"},
        {"latitude": 11, "longitude": 77, "acquired": "2026-11-12T00:00:00Z"},
    ])
    assert len(harmonize(source, sensor="MODIS")) == 1


def test_modis_brightness_columns_do_not_collide():
    source = pd.DataFrame([{
        "latitude": 11,
        "longitude": 77,
        "acq_date": "2026-11-12",
        "acq_time": 421,
        "brightness": 320,
        "bright_t31": 290,
    }])
    result = harmonize(source, sensor="MODIS")
    assert result.columns.is_unique
    assert len(result) == 1


def test_database_has_safe_disabled_mode(monkeypatch):
    monkeypatch.setattr(settings, "database_url", "")
    assert database.enabled() is False
    assert database.health()["mode"] == "in-memory sample"
