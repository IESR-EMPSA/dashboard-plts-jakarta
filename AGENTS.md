# AGENTS.md — Jakarta Rooftop Solar Potential WebGIS

## Mission
Build a research-grade, map-centric WebGIS showing **modeled rooftop solar PV potential for eligible buildings in DKI Jakarta**. This repository is a visualization and exploration app, **not** a new rooftop-potential modeling pipeline.

## Required reading
Before planning or editing, read in this order:
1. `docs/PRD.md` — product behavior and acceptance criteria.
2. `docs/DATA_CONTRACT.md` — datasets, units, null semantics, and numerical invariants.
3. `docs/ARCHITECTURE.md` — hosting, PMTiles, Vue architecture, data loading.
4. `docs/DESIGN_SYSTEM.md` — visual direction and responsive behavior.
5. `docs/IMPLEMENTATION_PLAN.md` — milestones, gates, and checks.
6. `docs/DECISIONS_AND_RISKS.md` — fixed decisions and unresolved issues.

## Non-negotiable constraints
- Inspect the existing repository before changing code. **Do not reinitialize, overwrite, or replace its tooling/configurations** unless requested and justified.
- Default stack: Vue 3, TypeScript, Vite, MapLibre GL JS, `pmtiles`, static JSON; use existing UI/state/chart libraries where sensible. Prefer `pnpm` if that is the established package manager.
- Intended hosting: Vercel frontend; Cloudflare R2 is the preferred PMTiles candidate, **not finalized/configured**. The superseded Blob preference and reason are recorded in `docs/DECISIONS_AND_RISKS.md`. No application backend/database by default.
- Visible building layer is **eligible buildings only** (1,470,399 polygons) from `buildings_eligible_pvout` (verify geometry and export before use). The total building denominator (1,747,249) comes from authoritative summaries, not the tiles.
- Do not recompute solar modeling in frontend or derive global totals from currently loaded vector tiles.
- Preserve units: `capacity_kwp`, `capacity_mwp`, `annual_kwh`, `annual_gwh`, `pvout_1` in kWh/kWp/year.
- Distinguish **zero potential** from **missing PVOUT / missing annual generation**. 4,124 eligible buildings lack PVOUT. Never show NULL `annual_gwh` as 0.
- Never claim a filtered global KPI is exact unless an aggregate supporting that filter combination exists. See data contract for limits.
- Never insert storage tokens/access keys or any secret into client code. `VITE_*` may contain public URLs only. Keep raw and processed archives outside `public/` and Git; never modify `data/raw/`.
- Treat filenames, URL paths, internal PMTiles source-layer names, available admin geometries, and library APIs as **to be verified**; do not invent them.
- Use explicit administrative/type crosswalks. Raw `useable_m2` maps to normalized `usable_m2`; omitted tile energy means null. See the data contract for actual schemas.
- Current MBTiles: `buildings_eligible_pvout`, z14–16; type-0 instances require QA. Conversion is not geometry repair. Respect publication rights and attribution.

## Engineering behavior
- Before each phase: inspect current files, summarize changes and any blockers, and propose a small plan.
- Complete approved stages sequentially and stop at the user's approved boundary. No unrequested commits, pushes, uploads, deployments, or external writes. The latest approval covers milestone 3 local WebGIS/dashboard implementation, browser verification and documentation, including administrative maps, KPIs/charts, building details and basic responsive refinement. Stop after the local demo; no publication or external writes are authorized.
- Favor typed data models, small Vue components, explicit loading/error/empty states, accessibility, and a responsive map-first UI.
- Add validation/tests for transformations and filter behavior. Run existing typecheck, lint, tests and build where available; report which checks actually ran.
- Leave a brief handoff: changed files, behavior, evidence of validation, known gaps, next milestone.

## Sources of truth
- Export arithmetic is file-validated in `docs/DATA_CONTRACT.md`; original GIS/model/topology and licensing checks remain pending. Detailed evidence belongs in `docs/`, not this guide.
- The real repository is authoritative for package versions, scripts, and directory structure.
- External `docs/*.md` specifications guide intent; where they conflict with actual exported schemas, stop and document the mismatch before adapting.
