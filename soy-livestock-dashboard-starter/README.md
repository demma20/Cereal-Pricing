
# Soy & Livestock Prices Dashboard — Starter (Option A)

This starter sets up:
- **/site/**: Static dashboard hosted on **GitHub Pages**
- **/data/**: JSON the dashboard reads (`latest.json`)
- **/etl/**: Python scripts to fetch/normalize prices to **price_per_kg**
- **/.github/workflows/update.yml**: GitHub Actions workflow to refresh `/data/latest.json` on a schedule

## Quick start (10–15 min)

1. **Create a new GitHub repo** (public is easiest for free Pages; you can keep a separate private repo for ETL if desired).
2. **Upload these files** to the repo (or push via git).
3. **Enable GitHub Pages**: Settings → Pages → Build and deployment → Source: **Deploy from a branch** → Branch: `main` (or `master`) → Folder: `/root` (or `/docs` if you prefer; this starter assumes root).
4. Visit the Pages URL (pattern: `https://<user>.github.io/<repo>/site/index.html`). It should load with sample data.
5. **Optional (Squarespace)**: Create a password-protected page → Add a **Code** block with:
   ```html
   <iframe src="https://<user>.github.io/<repo>/site/index.html"
           style="width:100%;height:85vh;border:0;" loading="lazy"></iframe>
   ```

### Scheduled updates (free)
- This repo includes `.github/workflows/update.yml` which:
  - Installs Python
  - Runs `etl/main.py`
  - Commits refreshed `/data/latest.json` back to the repo using the built-in `GITHUB_TOKEN`
- Two schedules are included:
  - **Daily 06:00 UTC** (for India daily → later you can resample in code)
  - **Weekly Monday 06:00 UTC** (EU/TH/CN typical cadence)
- Adjust the cron lines in the workflow as you like.

---

## Files to edit later

- `etl/sources/eu.py`, `india.py`, `thailand.py`, `china.py`: Replace the placeholder extractors with real calls to official APIs/pages.
- `etl/sources/normalize.py`: Keep the schema stable; convert to **price_per_kg**.
- `etl/main.py`: Orchestrates all sources and writes `/data/latest.json`.

> Start with the placeholders; the dashboard will still render using generated sample data. Once you wire in real sources, the same JSON shape will feed the charts.

## JSON schema (`/data/latest.json`)
Each record:
```
date, country, source, commodity, product_form, market_level,
price_per_kg, currency, unit_raw, frequency, notes
```
- `commodity`: soy, soybean_meal, soy_protein_isolate (proxy), chicken, beef, pork
- `market_level`: wholesale, farmgate, retail, carcass

## Squarespace embed
Use the `<iframe>` above on a **private page**. Squarespace handles the access control; GitHub Pages serves the dashboard file.

## Local dev
Open `site/index.html` in a local server (e.g. `python -m http.server`) so that `fetch('../data/latest.json')` works.
