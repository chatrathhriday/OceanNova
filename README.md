# OCEANNOVA

Ocean anomaly detection from real NASA PACE satellite data, with a short-range forecast of where each detected patch is heading.

- **Web app** (Next.js 16, React 19): landing page, a live anomaly map at `/model`, and a scientific workspace at `/model?view=scientific`.
- **ML service** (FastAPI, scikit-learn): scores PACE OCI L2 spectra with a novelty-detection ensemble trained on 51,000 real PACE spectra, and builds forecast zones by carrying detected patches forward with forecast ocean currents.

## What the forecast is, and is not

Each forecast zone is a patch of anomalous water the satellite actually observed. It is moved forward with Open-Meteo surface-current forecasts and widened by an assumed 10 km/day position error. Every forecast is logged and checked against later satellite passes; the running track record is shown in the app.

It does not predict anomalies that have not been observed yet, and the cause labels (algal bloom, river runoff, sediment) come from a model trained on rule-based labels, not water samples.

## Running locally

Requirements: Node 20+, Python 3.10+, a free [NASA Earthdata](https://urs.earthdata.nasa.gov) token, and optionally a [Gemini API key](https://aistudio.google.com/apikey).

```bash
npm install --legacy-peer-deps
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt   # macOS/Linux: .venv/bin/python
```

Create `.env.local` in the project root (it is git-ignored):

```
EARTHDATA_TOKEN=...
GEMINI_API_KEY=...
ML_SERVICE_URL=http://127.0.0.1:8000
PACE_REAL_MAX_GRANULES=2
PACE_REAL_MAX_GRANULE_MB=260
EARTHDATA_DOWNLOAD_TIMEOUT_SECONDS=900
REAL_DATA_TTL_SECONDS=10800
```

Start both servers:

```bash
.venv/Scripts/python -m uvicorn ml_service.main:app --port 8000 --env-file .env.local
npm run dev
```

The first satellite refresh downloads a few hundred MB of PACE data. To fill every watch region at once (with the ML service stopped):

```bash
.venv/Scripts/python -m ml_service.fetch_watch_regions
```

## Useful commands

| Command | What it does |
|---|---|
| `python -m ml_service.train_real --input data/processed/pace_real_dataset.npz` | Retrain the ensemble; writes `data/processed/pace_training_report.json` |
| `python -m ml_service.backtest_forecast --bbox 120 -20 137 -4 --start 2026-10-08 --days 5 --max-mb 260` | Backtest the forecast on consecutive real passes |
| `python -m ml_service.ingest_passes <folder>` | Score PACE granules already on disk into the live store |

## Data sources

NASA PACE OCI L2 AOP (Earthdata), NOAA NDBC and CO-OPS buoys, Open-Meteo Marine API (currents, CC BY 4.0), Google Gemini for written explanations.

## How this was built

Built with AI assistance (Claude) for implementation speed; the idea, design decisions, testing and final calls are mine.
