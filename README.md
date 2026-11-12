# FIREWATCH AI

**From Satellite Signals to Faster Fire Response.**

FIREWATCH AI is a full-stack geospatial intelligence application for the NASA Space Apps 2026 challenge **Harmonization of MODIS and VIIRS Hot Spots**. It places MODIS and VIIRS observations on a common UTC time and geographic-grid index while keeping source records and sensor-specific statistics intact.

## What the demo proves

```text
MODIS records ─┐
               ├─ normalize fields + UTC + coordinates
VIIRS records ─┘                 │
                                 ▼
                   shared grid-cell / UTC-day index
                                 │
             ┌───────────────────┴──────────────────┐
             ▼                                      ▼
    sensor-specific statistics          unified activity calendar
```

- Interactive Leaflet map with observation popups and sensor styling
- Harmonized fire calendar, activity trends and sensor comparison
- Explainable anomaly signal based on recent daily activity
- Alerts, CSV export and backend PDF reports
- NASA FIRMS integration using a server-only environment key
- PostgreSQL persistence with ingestion-run lineage and idempotent upserts
- Clearly labelled offline demonstration data when FIRMS is unavailable
- Responsive dashboard with working filters and navigation

## Quick start

### Frontend

```powershell
npm install
npm run dev
```

Open `http://localhost:5173`.

### Backend

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
uvicorn backend.app.main:app --reload
```

The API runs at `http://localhost:8000`; interactive API docs are at `/docs`.

The production Docker image serves both the compiled React frontend and FastAPI from one public service, which avoids cross-origin and split-deployment failures during judging.

## NASA FIRMS configuration

Copy `.env.example` to `.env`, then add a FIRMS MAP key:

```env
FIRMS_MAP_KEY=your_map_key
FIRMS_AREA=74,8,81,14
FIRMS_DAY_RANGE=10
DATABASE_URL=postgresql://user:password@host:5432/firewatch
```

The default bounding box covers southern India. The key is read only by FastAPI and is never sent to browser code. With no key, the backend loads `data/sample_fires.csv` and every response identifies the source as `sample`.

## Harmonization methodology

1. Source columns are mapped to a canonical schema.
2. Acquisition date and time are parsed as timezone-aware UTC timestamps.
3. Invalid latitude, longitude and timestamp values are rejected.
4. Sensor identity, source identifier, confidence and FRP are preserved.
5. Records receive a configurable `0.1° × 0.1°` grid-cell index and UTC day.
6. Potential spatial and temporal overlap is flagged in 30-minute cell windows. Records are not deleted.
7. Aggregations keep MODIS and VIIRS counts separate alongside the shared activity index.

Raw counts are not treated as directly comparable measurements. VIIRS and MODIS differ in nominal pixel size, detection behavior, overpass timing and algorithm characteristics.

## API routes

- `GET /api/health`
- `GET /api/fires`
- `GET /api/fires/modis`
- `GET /api/fires/viirs`
- `GET /api/analytics/overview`
- `GET /api/analytics/history`
- `GET /api/calendar`
- `GET /api/anomalies`
- `GET /api/alerts`
- `GET /api/data-lineage`
- `POST /api/ingest`
- `POST /api/analysis`
- `POST /api/reports`

## Database model and traceability

The migration at `backend/migrations/001_firewatch_schema.sql` creates:

- `fire_observations`: canonical source records with sensor identity, acquisition time, grid cell, FRP, confidence and overlap flag.
- `ingestion_runs`: an audit trail of every import, its source, record counts, sensor counts and completion state.
- `fire_activity_daily`: a sensor-preserving UTC-day and grid-cell aggregation view.

Upserts use `source + sensor + source_record_id`, so rerunning ingestion refreshes a source record instead of silently duplicating it. Nearby records are retained; the overlap flag remains informational.

## One-click Render deployment

The included `render.yaml` provisions a Docker web service and PostgreSQL database in Singapore. The Docker image builds React, installs FastAPI and serves the entire application from one URL.

1. Push this repository to GitHub.
2. In Render, choose **New → Blueprint** and select the repository.
3. Render reads `render.yaml` and proposes `firewatch-ai` plus `firewatch-postgres`.
4. Set `FIRMS_MAP_KEY` in the service environment before the final demo.
5. Open `/api/health` and confirm `database.connected` and `firms_configured` are both `true`.

The optional `vercel.json` is included for teams that want Vercel for the frontend and Render for the API. Replace its placeholder Render hostname before using it. The single Render service is the more reliable hackathon configuration.

## Judge demonstration sequence

1. Show the data-mode banner and `/api/data-lineage` to establish provenance.
2. Filter the same area by VIIRS and MODIS to show sensor identity is preserved.
3. Open the calendar and click the unusually active day.
4. Explain the shared grid/time index and why raw sensor counts are not treated as equivalent.
5. Ask the analyst to summarize the visible observations.
6. Export the evidence as CSV or PDF.

## Tests

```powershell
pytest backend\tests
```

## Scientific and operational limitations

Active-fire observations are thermal detections, not burned-area estimates, fire perimeters or unique-fire counts. Cloud, viewing geometry, overpass timing, land cover and sensor resolution affect detection. An anomaly describes statistical deviation from an available reference period; it is not a verified fire-risk probability or an ignition prediction. FIREWATCH AI supports research and situational awareness and should not replace official emergency information.
