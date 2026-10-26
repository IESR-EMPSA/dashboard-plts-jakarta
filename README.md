# Jakarta Rooftop Solar Potential WebGIS

A research dashboard for exploring **modeled technical rooftop solar PV potential in DKI Jakarta**. Eligible building footprints appear on the map, while key metrics and charts use validated statistical summaries. The application visualizes existing GIS analysis results rather than an inventory of installed PV capacity.

## Features and architecture

- MapLibre visualization of eligible building polygons delivered through PMTiles.
- **Building-tile zoom range: 13–18.** The active archive is a separate derivative with source attributes verified against the original GeoPackage. See the [repair and validation report](docs/ARCHIVE_REPAIR_REPORT.md).
- Filters for 6 administrative regions, 44 districts, and 7 building categories, including Kepulauan Seribu.
- Key metrics for capacity, PVOUT-covered annual generation, eligible building count, and eligibility rate.
- Choropleths, region/district comparisons, building-category charts, and PVOUT coverage.
- Building details, fullscreen, OpenFreeMap/Google Imagery basemaps, and a responsive layout.
- Indonesian and English throughout the interface, with an **ID / EN** switch in the top navbar. The selected language is remembered in the browser; numbers, map controls, tooltips, building details, and methodology update together. See [localization](docs/LOCALIZATION.md).

Stack: **Vue 3 + TypeScript + Vite, MapLibre GL JS, and PMTiles**. Statistics and administrative boundaries are static files in `public/data/`. There is no application backend or PostGIS. The Vite middleware for local archive byte-range delivery runs only during development.

## Setup and local development

Tested environment: **Node.js 24.19.0**, **pnpm 12.4.1**, and Chrome with WebGL. Dependency versions are recorded in `pnpm-lock.yaml`.

```sh
pnpm install
```

For local building visualization, provide the validated archive at:

```text
data/processed/buildings_eligible_dki_z13-18_repaired.pmtiles
```

```sh
pnpm dev
```

Open **http://localhost:5173/**. The port is fixed; use the existing development server if it is already running. Select a region/district and zoom in to inspect buildings. In Windows PowerShell, use `pnpm.cmd` if `pnpm.ps1` is blocked.

### Public archive configuration

Development does not require an `.env` file when the local archive is available. To use a public URL, copy [`.env.example`](.env.example) to `.env.local`, set `VITE_BUILDINGS_PMTILES_URL`, and restart Vite. The URL must support HTTP Range/206 and appropriate CORS. Values in `VITE_*` are visible in the browser; provide public URLs only.

```sh
pnpm build
pnpm preview
```

Open the preview URL printed by Vite. Preview/production does not expose the local archive endpoint; building visualization requires a public URL configured at build time. Without that URL, the administrative map remains available with an archive configuration notice.

## Data and interpretation

- Eligibility denominator: **1,747,249 analyzed buildings**, of which **1,470,399** are eligible for the building layer.
- **1,466,275** eligible buildings have PVOUT; **4,124** do not. Unavailable annual generation remains `null` and is never replaced with zero.
- Source measurements use MWp for capacity and GWh/year for generation. GWp/TWh conversions happen only for display.
- Key metrics are never calculated from visible tiles. Exact **administrative area × building type** statistics are unavailable and explicitly marked unsupported. Building-category charts retain their DKI-wide scope.
- Do not edit generated `public/data/` files manually. The manifest, crosswalks, statistics, and geometries must belong to a compatible processing release.

Private inputs for preprocessing and the full test suite must be available in `data/raw/`:

```text
admin_kabkot_dki.geojson          admin_kecamatan_dki.geojson
summary_capacity_dki.csv         summary_eligibility_dki.csv
summary_generation_dki.csv       summary_jenis_dashboard.csv
summary_kecamatan_dashboard.csv  summary_pvout_coverage.csv
buildings_eligible_pvout.mbtiles
```

This directory is ignored by Git. See the [data contract](docs/DATA_CONTRACT.md) and [data pipeline](docs/DATA_PIPELINE.md) for schemas, units, crosswalks, and provenance.

## Validation and tests

| Command | Purpose | Required data/tools |
|---|---|---|
| `pnpm typecheck` | Check Vue, Vite configuration, scripts, and TypeScript tests | No private data required |
| `pnpm build` | Build the static frontend into `dist/` | Checkout and dependencies; archives are not bundled |
| `node --test tests/frontend-data.test.ts tests/map-integration.test.ts tests/localization.test.ts` | Run 41 data-service, filter, renderer, middleware, and localization tests | `public/data/`; no private inputs |
| `pnpm test` | Run all 62 tests, including the data pipeline and surgical attribute-repair safeguards | Original preprocessing inputs in `data/raw/` and crosswalks |
| `pnpm data:check` | Check all nine generated outputs without rewriting them | All `data/raw/` inputs and crosswalks |
| `pnpm data:prepare` | Validate inputs and regenerate public outputs | Approved data-processing work only |
| `node scripts/qa-app.mjs` | Test the actual browser app: both languages, map, Range, filters, key metrics, layout, and icons | Development server, local PMTiles, Chrome |
| `node scripts/qa-app.mjs --archive-update` | Also inspect all 45 repaired building IDs with real mouse clicks and GeoPackage-verified values | Repaired archive and source-check evidence; see the repair report |
| `node scripts/qa-technical.mjs --label=local --minutes=5 --gpu=default` | Continuous technical navigation, memory, responsiveness, Range and rendering checks; does not replay functional UAT | Development server, repaired archive, local acceptance evidence, Windows Chrome/PowerShell |

Application QA uses an existing Chrome installation; `CHROME_PATH` can point to another location. The default browser path follows the Windows Chrome installation. JSON reports, screenshots, and temporary profiles are written under `data/processed/qa/` and remain outside Git. No linter is configured.

The `qa-archive.mjs`, `qa-browser.mjs`, and `scripts/qa/` diagnostic pages preserve the earlier geometry investigations. They require the original archives and the CLI at `.tools/pmtiles/pmtiles.exe`; the browser diagnostic also requires the historical archive QA report. See [geometry QA](docs/GEOMETRY_QA.md) for limitations. `node scripts/qa-archive-update.mjs --repaired` audits the active zoom 13–18 derivative. The [repair report](docs/ARCHIVE_REPAIR_REPORT.md) records source verification, exact corrections and rollback paths. The original GeoPackage and all archives remain private, immutable and outside Git/public assets.

## Repository structure and Git policy

```text
src/                  Components, data services, selectors, store, types, and map
public/data/          Nine validated outputs required by the frontend
data/crosswalks/      Reviewed source-name and category mappings
data/raw/             Private inputs; ignored by Git
data/processed/       Local PMTiles and QA artifacts; ignored by Git
scripts/              Preprocessing, development middleware, and QA tools
tests/                Real-data tests and in-memory negative cases
docs/                 Specifications, decisions, and validation evidence
.tools/               Local CLI binaries; ignored by Git
```

**Keep in Git:** source code, tests, QA scripts, documentation, configuration, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `data/crosswalks/`, all `public/data/` files, and a credential-free `.env.example`.

**Ignored by Git:** dependencies, builds, caches, test reports, private GIS inputs/outputs, large archives and rasters, local environment configuration, Vercel/Wrangler state, personal workspace settings, and temporary/backup files. Share `.vscode/extensions.json` for the Vue extension recommendation.

Before committing, inspect `git status --short`, `git diff --stat`, and `git diff --cached --stat`. Ignore rules protect untracked files; they do not automatically stop tracking files already committed. The repository screening found no tracked private archives, builds, or environment files requiring removal from the index.

## Status and documentation

Manual functional UAT is approved. The [technical QA report](docs/TECHNICAL_QA_REPORT.md) records continuous GPU/software stress, memory and Range measurements, confirmed performance fixes, and current production blockers. Local automated/build/data-integrity gates pass; remote archive integration and target-device/network budgets still require sign-off.

The local demo is implemented. Vercel frontend hosting and Cloudflare R2 archive storage remain planned; remote URLs, CORS, costs, publication rights, and source-model/topology/vintage verification are still pending. No upload or deployment was performed during local implementation. The large map bundle and approximately 9.52 MB of administrative GeoJSON still require production performance budgets.

- [Repository screening and cleanup](docs/PROJECT_REVIEW.md)
- [Local demo usage and QA evidence](docs/LOCAL_DEMO.md)
- [Frontend data-service APIs](docs/FRONTEND_DATA_LAYER.md)
- [Data contract](docs/DATA_CONTRACT.md) and [preprocessing pipeline](docs/DATA_PIPELINE.md)
- [Architecture](docs/ARCHITECTURE.md), [implementation plan](docs/IMPLEMENTATION_PLAN.md), and [decisions and risks](docs/DECISIONS_AND_RISKS.md)

No redistribution license is assumed. Confirm source-data, imagery, and publication rights before a public release.
