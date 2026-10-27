# Jakarta Rooftop Solar Potential WebGIS

A research dashboard for exploring **modeled technical rooftop solar PV potential in DKI Jakarta**. Eligible building footprints appear on the map; key metrics and charts use validated statistical summaries. This visualizes existing GIS analysis, rather than an inventory of installed PV capacity.

- **Dashboard:** [dashboard-plts-jakarta.vercel.app](https://dashboard-plts-jakarta.vercel.app/).
- **Hosting:** Vercel frontend; Cloudflare R2 PMTiles through `tiles.luthfanadli.my.id`.
- **Guides:** [documentation index](docs/README.md), [deployment](docs/DEPLOYMENT.md), [latest repository review](docs/PROJECT_REVIEW.md).

Manual UAT and successful deployment are owner-confirmed. The latest review records independent read-only delivery checks, distinct from GIS/model/rights certification. No deployment or production setting was changed during cleanup.

## Application

Vue 3 + TypeScript + Vite, MapLibre GL JS and the official PMTiles client; no application backend or PostGIS. Features include native building zooms **13–18**, administrative choropleths/filters, summary-backed metrics/charts, building details, OpenFreeMap/Google Imagery, fullscreen and building opacity. Six regions, 44 districts and seven building categories are supported.

English is the default for new visitors; a valid saved ID/EN preference is restored. The navbar **ID / EN** switch translates the interface, numbers, controls, tooltips, details and methodology while preserving selections. See [localization](docs/LOCALIZATION.md) and the [design system](docs/DESIGN_SYSTEM.md).

## Setup and development

Tested with **Node.js 24.19.0** and **pnpm 12.4.1**. Node 24 supplies native TypeScript/SQLite support for data/archive scripts. Keep the committed lockfile.

Replace `<repository-url>` with the Git URL of your repository:

```sh
git clone "<repository-url>" dashboard-plts-jakarta
cd dashboard-plts-jakarta
pnpm install --frozen-lockfile
```

Choose one building source:

1. **Public R2:** copy [`.env.example`](.env.example) to ignored `.env.local` and set the URL below.
2. **Local archive:** leave the variable empty and provide `data/processed/buildings_eligible_dki_z13-18_repaired.pmtiles`. Validated local GIS inputs/archives are private and are not included in a clone.

```dotenv
VITE_BUILDINGS_PMTILES_URL=https://tiles.luthfanadli.my.id/buildings_eligible_dki_z13-18_repaired.pmtiles
```

```sh
pnpm dev
```

Open **http://localhost:5173/**. The port is strict; reuse a running server. Restart Vite after environment changes. On Windows use `pnpm.cmd` if PowerShell blocks `pnpm.ps1`.

A configured public URL takes precedence. There is no automatic remote-to-local failover. `VITE_*` values are public browser configuration: never supply tokens or credentials.

## Checks and build

```sh
pnpm typecheck
pnpm test
pnpm data:check
pnpm build
```

| Check | Requirements |
|---|---|
| `pnpm typecheck`, `pnpm build` | Checkout and installed dependencies; no private datasets |
| `node --test tests/frontend-data.test.ts tests/map-integration.test.ts tests/localization.test.ts` | Committed `public/data/`; no private GIS inputs |
| `pnpm test`, `pnpm data:check` | Original eight CSV/GeoJSON inputs and original MBTiles under `data/raw/`; see [pipeline](docs/DATA_PIPELINE.md) |
| `node scripts/qa-app.mjs --layer-controls-only` | Chrome and repaired local archive; isolated Vite server on port 5175 |
| `node scripts/qa-app.mjs --chart-navigation-only` or `--map-framing-only` | Chrome and repaired local archive; isolated server on port 5174 |

See the [script inventory](docs/README.md#script-inventory) for retained diagnostics. Browser reports/profiles/screenshots stay in ignored `data/processed/qa/`. `CHROME_PATH` overrides the default Windows Chrome path. No linter is configured.

`data:check` validates without writing. **`pnpm data:prepare` writes publication data** and requires separately approved data-processing work. Even cosmetic edits to producer files/publication types can change provenance; see [pipeline](docs/DATA_PIPELINE.md).

```sh
pnpm build
pnpm preview
```

Preview serves `dist/` at Vite's printed URL. Preview/production needs the public PMTiles URL **at build time**; the local Range middleware is development-only. Archives are never bundled. The existing MapLibre bundle-size advisory is documented in the repository review.

## Data semantics

- **1,747,249 analyzed buildings** form the denominator; the map contains only **1,470,399 eligible buildings**.
- **1,466,275** eligible buildings have PVOUT; **4,124** do not. Missing annual generation stays `null`, never zero.
- Source summaries use MWp and GWh/year; GWp/TWh conversions are for display.
- Totals never come from visible tiles. Exact administrative area × building-type aggregates are unavailable; combined statistical selections remain explicitly unsupported.
- Preserve the nine compatible, manifest-validated files in `public/data/`. Do not hand-edit or regenerate them during application cleanup.

See [data contract](docs/DATA_CONTRACT.md), [frontend data APIs](docs/FRONTEND_DATA_LAYER.md) and [verified archive repair](docs/ARCHIVE_REPAIR_REPORT.md).

## Repository structure

```text
src/                  Components, i18n, data services, store, selectors, map
src/assets/           Bundled IESR branding
public/data/          Nine versioned runtime publication files
public/favicon.svg    Solar favicon
data/crosswalks/      Reviewed source mappings
scripts/              Preprocessing, local middleware, retained QA tools
tests/                Data, frontend, map, localization and repair safeguards
docs/                 Current guides, technical evidence and review
docs/archive/         Superseded milestone/review snapshots
data/raw/             Ignored original GIS inputs; preserved locally
data/processed/       Ignored archives, rollback copies and QA evidence
```

## Deployment and Git hygiene

The frontend is already deployed on Vercel from `main`; PMTiles is delivered separately through R2's custom domain. [Deployment documentation](docs/DEPLOYMENT.md) records the URLs, environment/build expectations and verification limits. Hosting settings are managed outside this checkout; the current page-anchor navigation does not need new route rewrites.

Track code, tests, lockfile, crosswalks, public publication files and reviewed docs/assets. Keep raw GIS data, large archives, credentials, local environment/provider state, builds and QA output out of Git. Ignore rules protect future additions and do not remove local files. Commit, push, upload and deployment require separate authorization.
