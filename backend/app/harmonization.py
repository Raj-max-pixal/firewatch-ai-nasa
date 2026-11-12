from __future__ import annotations

import hashlib
from typing import Any
import pandas as pd

CANONICAL = ["id", "latitude", "longitude", "acquired", "satellite", "confidence", "frp", "region", "source"]


def _confidence(value: Any) -> float:
    if pd.isna(value):
        return 0.0
    levels = {"l": 30, "low": 30, "n": 60, "nominal": 60, "h": 90, "high": 90}
    text = str(value).strip().lower()
    if text in levels:
        return float(levels[text])
    try:
        return max(0.0, min(100.0, float(value)))
    except (TypeError, ValueError):
        return 0.0


def harmonize(frame: pd.DataFrame, sensor: str | None = None, source: str = "NASA FIRMS", grid_size: float = 0.1) -> pd.DataFrame:
    """Normalize source records while retaining sensor provenance and traceability."""
    data = frame.copy()
    aliases = {
        "acq_date": "date", "acq_time": "time",
    }
    data = data.rename(columns={k: v for k, v in aliases.items() if k in data.columns})
    if "acquired" not in data:
        dates = data.get("date", "1970-01-01").astype(str)
        times = data.get("time", "0000").astype(str).str.zfill(4)
        data["acquired"] = pd.to_datetime(dates + " " + times.str[:2] + ":" + times.str[2:], utc=True, errors="coerce")
    else:
        data["acquired"] = pd.to_datetime(data["acquired"], utc=True, errors="coerce")
    data["latitude"] = pd.to_numeric(data.get("latitude"), errors="coerce")
    data["longitude"] = pd.to_numeric(data.get("longitude"), errors="coerce")
    data = data[data.latitude.between(-90, 90) & data.longitude.between(-180, 180) & data.acquired.notna()].copy()
    if sensor:
        data["satellite"] = sensor.upper()
    else:
        raw = data.get("satellite", data.get("instrument", "VIIRS")).astype(str).str.upper()
        data["satellite"] = raw.map(lambda x: "MODIS" if x in {"T", "A", "MODIS", "TERRA", "AQUA"} else "VIIRS")
    confidence = data["confidence"] if "confidence" in data else pd.Series(0, index=data.index)
    frp = data["frp"] if "frp" in data else pd.Series(0, index=data.index)
    region = data["region"] if "region" in data else pd.Series("Selected area", index=data.index)
    data["confidence"] = confidence.map(_confidence)
    data["frp"] = pd.to_numeric(frp, errors="coerce").fillna(0)
    data["region"] = region.fillna("Selected area")
    data["source"] = source
    if "id" not in data:
        data["id"] = [hashlib.sha1(f"{r.latitude}|{r.longitude}|{r.acquired}|{r.satellite}".encode()).hexdigest()[:12] for r in data.itertuples()]
    data["grid_lat"] = (data.latitude // grid_size * grid_size).round(4)
    data["grid_lon"] = (data.longitude // grid_size * grid_size).round(4)
    data["grid_cell"] = data.grid_lat.astype(str) + ":" + data.grid_lon.astype(str)
    data["utc_day"] = data.acquired.dt.strftime("%Y-%m-%d")
    # Possible overlap is informational only. Source records are never removed.
    data["overlap_key"] = data.grid_cell + ":" + data.acquired.dt.floor("30min").astype(str)
    data["possible_overlap"] = data.duplicated("overlap_key", keep=False)
    return data


def aggregate_activity(data: pd.DataFrame) -> list[dict[str, Any]]:
    grouped = data.groupby(["utc_day", "grid_cell", "satellite"], observed=True).agg(
        detections=("id", "count"), mean_confidence=("confidence", "mean"), total_frp=("frp", "sum")
    ).reset_index()
    return grouped.round(2).to_dict(orient="records")


def records(data: pd.DataFrame) -> list[dict[str, Any]]:
    out = data.copy()
    out["acquired"] = out.acquired.dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    return out[[*CANONICAL, "grid_cell"]].to_dict(orient="records")
