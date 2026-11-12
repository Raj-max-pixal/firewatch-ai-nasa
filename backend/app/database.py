from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

import pandas as pd

from .config import settings

MIGRATION = Path(__file__).parents[1] / "migrations" / "001_firewatch_schema.sql"


def enabled() -> bool:
    return bool(settings.database_url)


def _connect():
    import psycopg
    from psycopg.rows import dict_row
    return psycopg.connect(settings.database_url, row_factory=dict_row)


def initialize() -> None:
    if not enabled() or not settings.auto_init_database:
        return
    with _connect() as connection:
        connection.execute(MIGRATION.read_text(encoding="utf-8"))


def health() -> dict[str, Any]:
    if not enabled():
        return {"configured": False, "connected": False, "mode": "in-memory sample"}
    try:
        with _connect() as connection:
            row = connection.execute("select count(*) as count from fire_observations").fetchone()
        return {"configured": True, "connected": True, "observations": row["count"]}
    except Exception as exc:
        return {"configured": True, "connected": False, "error": str(exc)}


def save_observations(data: pd.DataFrame, source: str, area_bounds: str | None = None) -> dict[str, Any]:
    if not enabled():
        return {"stored": 0, "database": False}
    initialize()
    sensor_counts = {str(k): int(v) for k, v in data.groupby("satellite").size().to_dict().items()}
    with _connect() as connection:
        run = connection.execute(
            "insert into ingestion_runs(source, records_received, sensor_counts, area_bounds) values (%s,%s,%s::jsonb,%s) returning id",
            (source, len(data), json.dumps(sensor_counts), area_bounds),
        ).fetchone()
        run_id = run["id"]
        rows = []
        for item in data.itertuples():
            uid = hashlib.sha256(f"{source}|{item.satellite}|{item.id}".encode()).hexdigest()
            rows.append((uid, str(item.id), item.satellite, item.latitude, item.longitude, item.acquired, item.confidence, item.frp, item.region, source, item.grid_cell, bool(item.possible_overlap), run_id, json.dumps({"source_record_id": str(item.id)})))
        connection.executemany(
            """
            insert into fire_observations(observation_uid,source_record_id,sensor,latitude,longitude,acquired_at,confidence,frp_mw,region,source,grid_cell,possible_overlap,ingestion_run_id,raw_record)
            values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb)
            on conflict (source, sensor, source_record_id) do update set
              latitude=excluded.latitude, longitude=excluded.longitude, acquired_at=excluded.acquired_at,
              confidence=excluded.confidence, frp_mw=excluded.frp_mw, region=excluded.region,
              grid_cell=excluded.grid_cell, possible_overlap=excluded.possible_overlap,
              ingestion_run_id=excluded.ingestion_run_id, updated_at=now()
            """,
            rows,
        )
        connection.execute("update ingestion_runs set status='completed', completed_at=now(), records_written=%s where id=%s", (len(rows), run_id))
    return {"stored": len(rows), "database": True, "ingestion_run_id": run_id, "sensor_counts": sensor_counts}


def load_observations(limit: int = 50000) -> pd.DataFrame:
    if not enabled():
        return pd.DataFrame()
    initialize()
    with _connect() as connection:
        rows = connection.execute(
            """select source_record_id as id, latitude, longitude, acquired_at as acquired,
                      sensor as satellite, confidence, frp_mw as frp, region, source
               from fire_observations order by acquired_at desc limit %s""",
            (limit,),
        ).fetchall()
    return pd.DataFrame(rows)


def lineage(limit: int = 20) -> list[dict[str, Any]]:
    if not enabled():
        return []
    initialize()
    with _connect() as connection:
        return list(connection.execute(
            """select id, source, started_at, completed_at, status, records_received,
                      records_written, sensor_counts, area_bounds
               from ingestion_runs order by started_at desc limit %s""",
            (limit,),
        ).fetchall())
