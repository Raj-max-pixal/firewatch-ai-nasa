from __future__ import annotations

from io import StringIO
import httpx
import pandas as pd
from .config import settings
from .harmonization import harmonize

SOURCES = {"VIIRS": "VIIRS_SNPP_NRT", "MODIS": "MODIS_NRT"}


def fetch_firms() -> pd.DataFrame:
    if not settings.firms_map_key:
        raise RuntimeError("FIRMS_MAP_KEY is not configured")
    frames: list[pd.DataFrame] = []
    with httpx.Client(timeout=30) as client:
        for sensor, product in SOURCES.items():
            url = f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{settings.firms_map_key}/{product}/{settings.firms_area}/{settings.firms_day_range}"
            response = client.get(url)
            response.raise_for_status()
            raw = pd.read_csv(StringIO(response.text))
            raw["region"] = settings.firms_region_label
            frames.append(harmonize(raw, sensor=sensor))
    return pd.concat(frames, ignore_index=True)
