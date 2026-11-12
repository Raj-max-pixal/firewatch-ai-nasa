from __future__ import annotations

from io import BytesIO, StringIO
import json
import statistics
from contextlib import asynccontextmanager
from pathlib import Path
import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from .config import settings
from .firms import fetch_firms
from .harmonization import aggregate_activity, harmonize, records
from . import database


@asynccontextmanager
async def lifespan(_: FastAPI):
    if database.enabled():
        database.initialize()
    yield


app = FastAPI(title="FIREWATCH AI API", version="1.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[v.strip() for v in settings.allowed_origins.split(",")],
    allow_methods=["*"],
    allow_headers=["*"],
)


def sample_data() -> pd.DataFrame:
    return harmonize(pd.read_csv(settings.sample_path), source="sample")


def observations(refresh: bool = False) -> tuple[pd.DataFrame, str]:
    if database.enabled() and not refresh:
        stored = database.load_observations()
        if not stored.empty:
            stored_source = str(stored.source.iloc[0])
            return harmonize(stored, source=stored_source), stored_source
    if settings.firms_map_key:
        try:
            data, source = fetch_firms(), "NASA FIRMS"
        except Exception:
            if refresh:
                raise
            data, source = sample_data(), "sample"
    else:
        data, source = sample_data(), "sample"
    if database.enabled():
        database.save_observations(data, source, settings.firms_area)
    return data, source


def filtered(data: pd.DataFrame, sensor: str | None, region: str | None) -> pd.DataFrame:
    if sensor and sensor.upper() in {"MODIS", "VIIRS"}:
        data = data[data.satellite == sensor.upper()]
    if region and region.lower() != "global":
        data = data[data.region.str.contains(region, case=False, na=False)]
    return data


@app.get("/api/health")
def health():
    db = database.health()
    return {"status": "healthy" if not db.get("configured") or db.get("connected") else "degraded", "firms_configured": bool(settings.firms_map_key), "database": db}


@app.post("/api/ingest")
def ingest():
    try:
        data, source = observations(refresh=True)
    except Exception as exc:
        raise HTTPException(502, f"Ingestion failed: {exc}") from exc
    return {"status": "completed", "source": source, "records": len(data), "database": database.health()}


@app.get("/api/data-lineage")
def data_lineage():
    return {"database_configured": database.enabled(), "runs": database.lineage()}


@app.get("/api/fires")
def fires(sensor: str | None = None, region: str | None = None, refresh: bool = False):
    try:
        data, source = observations(refresh)
    except Exception as exc:
        raise HTTPException(502, f"NASA FIRMS retrieval failed: {exc}") from exc
    data = filtered(data, sensor, region)
    return {"source": source, "demo": source == "sample", "count": len(data), "fires": records(data)}


@app.get("/api/fires/modis")
def modis(region: str | None = None):
    data, source = observations()
    data = filtered(data, "MODIS", region)
    return {"source": source, "count": len(data), "fires": records(data)}


@app.get("/api/fires/viirs")
def viirs(region: str | None = None):
    data, source = observations()
    data = filtered(data, "VIIRS", region)
    return {"source": source, "count": len(data), "fires": records(data)}


@app.get("/api/analytics/overview")
def overview(region: str | None = None):
    data, source = observations()
    data = filtered(data, None, region)
    return {
        "source": source,
        "total": len(data),
        "modis": int((data.satellite == "MODIS").sum()),
        "viirs": int((data.satellite == "VIIRS").sum()),
        "high_confidence": int((data.confidence >= 80).sum()),
        "mean_frp": round(float(data.frp.mean()), 2) if len(data) else 0,
        "harmonized_cells": int(data.grid_cell.nunique()),
    }


@app.get("/api/analytics/history")
def history(region: str | None = None):
    data, source = observations()
    data = filtered(data, None, region)
    daily = data.groupby(["utc_day", "satellite"]).size().unstack(fill_value=0).reset_index()
    return {"source": source, "days": daily.to_dict(orient="records"), "cells": aggregate_activity(data)}


@app.get("/api/calendar")
def calendar(region: str | None = None):
    data, source = observations()
    data = filtered(data, None, region)
    daily = data.groupby("utc_day").agg(total=("id", "count"), modis=("satellite", lambda s: int((s == "MODIS").sum())), viirs=("satellite", lambda s: int((s == "VIIRS").sum())), total_frp=("frp", "sum")).reset_index()
    return {"source": source, "days": daily.round(2).to_dict(orient="records")}


def anomaly_payload(data: pd.DataFrame) -> dict:
    daily = data.groupby("utc_day").size().sort_index()
    if daily.empty:
        return {"current": 0, "baseline": 0, "percent_difference": 0, "z_score": 0, "classification": "insufficient data"}
    current = int(daily.iloc[-1])
    prior = daily.iloc[:-1].tolist()
    baseline = statistics.mean(prior) if prior else current
    deviation = statistics.pstdev(prior) if len(prior) > 1 else 0
    z_score = (current - baseline) / deviation if deviation else 0
    percent = ((current - baseline) / baseline * 100) if baseline else 0
    return {"current": current, "baseline": round(baseline, 2), "percent_difference": round(percent, 1), "z_score": round(z_score, 2), "classification": "unusual" if z_score >= 2 else "within recent range", "meaning": "Descriptive statistical signal; not a fire-risk probability."}


@app.get("/api/anomalies")
def anomalies(region: str | None = None):
    data, source = observations()
    return {"source": source, **anomaly_payload(filtered(data, None, region))}


@app.get("/api/alerts")
def alerts(region: str | None = None):
    data, source = observations()
    data = filtered(data, None, region)
    anomaly = anomaly_payload(data)
    items = []
    if anomaly["classification"] == "unusual":
        items.append({"type": "unusual_activity", "severity": "review", "title": "Activity above recent baseline", "detail": anomaly})
    for row in data[data.confidence >= 90].sort_values("acquired", ascending=False).head(5).itertuples():
        items.append({"type": "high_confidence", "severity": "elevated", "title": f"High-confidence {row.satellite} observation", "observation_id": row.id, "acquired": row.acquired.isoformat()})
    return {"source": source, "alerts": items}


class AnalysisRequest(BaseModel):
    question: str
    region: str = "Selected area"


@app.post("/api/analysis")
def analysis(request: AnalysisRequest):
    data, source = observations()
    data = filtered(data, None, request.region.split(",")[0])
    stats = anomaly_payload(data)
    answer = (
        f"The selected view contains {len(data)} {source} observations: "
        f"{int((data.satellite == 'VIIRS').sum())} VIIRS and {int((data.satellite == 'MODIS').sum())} MODIS. "
        f"Mean reported FRP is {data.frp.mean():.1f} MW. The latest day has {stats['current']} detections "
        f"against a recent daily baseline of {stats['baseline']}. This is descriptive analysis of satellite "
        "thermal detections, not a fire prediction or verified incident assessment."
    )
    return {"answer": answer, "source": source, "ai_generated": False, "question": request.question}


class ReportRequest(BaseModel):
    region: str = "Selected area"
    format: str = "csv"


@app.post("/api/reports")
def reports(request: ReportRequest):
    data, source = observations()
    data = filtered(data, None, request.region.split(",")[0])
    if request.format.lower() == "csv":
        output = StringIO()
        data[[*data.columns]].to_csv(output, index=False)
        return Response(output.getvalue(), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=firewatch-report.csv"})
    if request.format.lower() != "pdf":
        raise HTTPException(400, "format must be csv or pdf")
    output = BytesIO()
    pdf = canvas.Canvas(output, pagesize=A4)
    pdf.setTitle("FIREWATCH AI report")
    pdf.drawString(48, 800, "FIREWATCH AI · Observation Report")
    pdf.drawString(48, 780, f"Area: {request.region} · Source: {source}")
    pdf.drawString(48, 760, f"Records: {len(data)} · MODIS: {(data.satellite == 'MODIS').sum()} · VIIRS: {(data.satellite == 'VIIRS').sum()}")
    pdf.drawString(48, 735, "Method: UTC normalization + 0.1 degree daily grid; per-sensor statistics retained.")
    pdf.drawString(48, 715, "Limit: detections are not perimeters, predictions, or verified incident reports.")
    pdf.save()
    return Response(output.getvalue(), media_type="application/pdf", headers={"Content-Disposition": "attachment; filename=firewatch-report.pdf"})


frontend = Path(__file__).parents[2] / "dist"
if frontend.exists():
    app.mount("/", StaticFiles(directory=frontend, html=True), name="frontend")
