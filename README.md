# Jakarta Rooftop Solar Potential WebGIS

A Vue 3 + TypeScript research dashboard for modeled rooftop PV potential in DKI Jakarta. MapLibre and PMTiles show eligible building footprints; validated static summaries supply every KPI and chart.

```powershell
pnpm.cmd dev
```

Open **http://localhost:5173/**. The existing validated archive must be at `data/processed/buildings_eligible_dki.pmtiles` (ignored by Git). Vite serves bounded HTTP Range requests locally; it never copies the archive into public assets. Use **Cengkareng** or **Pulau Tidung** to explore real buildings.

```powershell
pnpm.cmd data:check
pnpm.cmd test
pnpm.cmd typecheck
pnpm.cmd build
# Actual application browser QA, with dev server and installed Chrome:
node scripts/qa-app.mjs
```

See [local demo and verification](docs/LOCAL_DEMO.md), [data layer APIs](docs/FRONTEND_DATA_LAYER.md), [data contract](docs/DATA_CONTRACT.md), and [implementation plan](docs/IMPLEMENTATION_PLAN.md).

Annual generation without PVOUT is unavailable, never zero. Eligibility uses all analyzed buildings. Administrative × building-type KPIs remain unsupported until exact aggregates exist. This dashboard shows modeled technical potential, not installed capacity or site feasibility.

Remote hosting is unconfigured. Production requires a verified public `VITE_BUILDINGS_PMTILES_URL`; credentials never belong in client variables. No backend, upload or deployment is part of the local demo. Source-model, rights, topology and production performance checks remain release gates.
