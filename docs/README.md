# Documentation guide

Start with the root [README](../README.md). The app is deployed and manual UAT is approved. Current delivery is recorded in [DEPLOYMENT.md](DEPLOYMENT.md); dated QA reports retain their original scope and measurements.

## Current guides

| Document | Purpose |
|---|---|
| [PRD](PRD.md) | Product behavior, implemented scope and statistical limitations |
| [Architecture](ARCHITECTURE.md) | Static hosting, Vue modules, PMTiles protocol and fallback |
| [Data contract](DATA_CONTRACT.md) | Actual schemas, units, identities, joins and null/numerical invariants |
| [Data pipeline](DATA_PIPELINE.md) | Deterministic preprocessing, fingerprints and regeneration boundary |
| [Frontend data layer](FRONTEND_DATA_LAYER.md) | Typed loaders, selectors, store, normalization and examples |
| [Design system](DESIGN_SYSTEM.md) | Approved layout, controls, responsive rules and asset provenance |
| [Localization](LOCALIZATION.md) | ID/EN, formatting, persistence and regression checks |
| [Implementation status](IMPLEMENTATION_PLAN.md) | Completed milestones and maintenance scope |
| [Decisions and risks](DECISIONS_AND_RISKS.md) | Fixed decisions, preserved tradeoffs and unresolved evidence |
| [Deployment](DEPLOYMENT.md) | Production URLs, build/env expectations and public-read verification |
| [Repository review](PROJECT_REVIEW.md) | Cleanup, before/after evidence, retained debt and commit scope |

User-facing methodology is implemented in `src/components/methodology/MethodologyPanel.vue` through `src/i18n/messages.ts`. Its numerical/source assumptions are in the data contract. Publication metadata still distinguishes export validation from source-model, topology and rights certification.

## Preserved evidence

| Document | Scope |
|---|---|
| [Data stage](DATA_STAGE_REPORT.md) | Original preprocessing/stage-1 handoff |
| [Geometry QA](GEOMETRY_QA.md) | z14–16 type-0 investigation and Polygon predicate |
| [Local demo](LOCAL_DEMO.md) | Initial app implementation/QA; old local setup is historical |
| [Initial z13–18 conversion](ARCHIVE_Z13_18.md) | Unrepaired conversion and defect discovery |
| [Verified repair](ARCHIVE_REPAIR_REPORT.md) | GeoPackage verification, surgical repair, preservation and rollback |
| [Repair ledger](ARCHIVE_ATTRIBUTE_REPAIRS.csv) | Exact 76 reported issues; diagnostic evidence, never statistics |
| [Technical QA](TECHNICAL_QA_REPORT.md) | Historical stress results and limits |
| [R2 localhost integration](R2_LOCAL_INTEGRATION.md) | Historical r2.dev/DNS/CORS and paired performance observations |
| [Implementation history](archive/IMPLEMENTATION_HISTORY.md) | Superseded detailed handoffs and UI follow-ups |
| [2026-10-27 review](archive/PROJECT_REVIEW_2026-10-27.md) | Original behavior-preserving cleanup, shipping-byte comparison and deployment probes |
| [2026-10-26 review](archive/PROJECT_REVIEW_2026-10-26.md) | Earlier starter cleanup and its then-current evidence |

Retain these reports and the original local GIS/rollback artifacts. Do not relabel older measurements as current production certification.

## Script inventory

Diagnostics write local evidence under ignored `data/processed/qa/`. Node 24 supplies TypeScript/SQLite; browser tools use existing Chrome.

| Script | Role / prerequisites |
|---|---|
| `prepare-data.ts --check` | Read-only publication freshness; original inputs/crosswalks |
| `prepare-data.ts` | Publication writer; separately authorized processing only |
| `qa-app.mjs` | Actual app QA; focused flags listed in root README |
| `qa-technical.mjs` | Continuous local navigation/memory/Range diagnostics |
| `qa-r2-integration.mjs` | Historical r2.dev/local comparison; remote URL is fixed to r2.dev, not a custom-domain production test |
| `qa-archive.mjs` | Original z14–16 inventory; original archives and local PMTiles CLI |
| `qa-browser.mjs`, `qa/browser.{html,js}` | Isolated reproduction of the original type-0 rendering issue |
| `qa-archive-update.mjs --repaired` | Current derivative vs preserved baseline/investigation evidence |
| `investigate-archive-attributes.mjs` | Defect/source investigation; preserved archives/evidence required |
| `repair-archive-attributes.mjs` | Plan by default; `--apply` writes exclusive derivative outputs and needs separate data-stage authorization; never overwrite existing outputs |
| `qa-repaired-attributes.mjs` | Source comparison; also writes evidence and the repair CSV ledger, so excluded from routine read-only cleanup |
| `qa-pmtiles-payloads.mjs` | Exhaustive repaired MBTiles/PMTiles comparison |
| `lib/data-pipeline.ts`, `lib/mvt-attributes.mjs` | Shared preprocessing and byte-preserving repair |
| `dev/pmtilesPlugin.ts` | Development-only bounded Range middleware |

Historical archive tools may require ignored intermediate reports and `.tools/pmtiles/pmtiles.exe`. They are retained for reproducibility, not unused experiments. Do not replace unavailable private inputs with fake production data.
