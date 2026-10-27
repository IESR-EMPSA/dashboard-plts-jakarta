# Implementation status and maintenance boundary

## Current state

The owner confirms manual UAT is complete and the frontend is deployed on **Vercel**, production branch **main**, with repaired native z13–18 PMTiles served by the **Cloudflare R2 custom domain**. See [deployment](DEPLOYMENT.md) for URLs and independent read-only checks.

The zero-change repository cleanup is complete. A subsequent owner-approved local follow-up sets English as the first-visit/default language and retains valid saved ID/EN preferences. This is the only newly authorized functional change; preserve all other UI/behavior, measurements, publication/archive contents and production configuration. Do not commit, push, upload or deploy. Earlier byte-identical cleanup findings remain historical evidence, not a claim that the English-default build equals the old build.

## Completed milestones

| Stage | Result / evidence |
|---|---|
| Project/data audit | Actual schemas, counts, units, joins and defects in [data contract](DATA_CONTRACT.md) |
| Preprocessing | Nine deterministic outputs, all 6/44 joins, original units and null generation; [pipeline](DATA_PIPELINE.md) |
| Original conversion/geometry QA | Sources retained; Polygon predicate established; [geometry QA](GEOMETRY_QA.md) |
| Frontend data services | Typed validated/cached loaders, selectors, dependent filters and adapters; [API guide](FRONTEND_DATA_LAYER.md) |
| Dashboard/map | Choropleths, static-summary metrics/charts, real details, basemaps and fullscreen |
| ID/EN and UI refinements | Persistent locale, chart navigation, map framing, 80% initial opacity and IESR branding; [design](DESIGN_SYSTEM.md), [localization](LOCALIZATION.md) |
| z13–18 repair | 76 reported issues / 78 field instances verified against GeoPackage; geometry/IDs preserved; [repair](ARCHIVE_REPAIR_REPORT.md) |
| Post-UAT technical QA | Historical hardware/software navigation, memory and bandwidth evidence; [report](TECHNICAL_QA_REPORT.md) |
| R2 upload/integration | Earlier whole-object checksum and localhost Range/CORS evidence; [report](R2_LOCAL_INTEGRATION.md) |
| Deployment | Owner-confirmed Vercel/R2 custom domain; static-file and bounded Range checks in [deployment record](DEPLOYMENT.md) |
| Repository maintenance | Latest baseline, cleanup and preservation in [review](PROJECT_REVIEW.md) |

Detailed milestone handoffs are preserved in [implementation history](archive/IMPLEMENTATION_HISTORY.md). Older test counts, zooms and deployment restrictions there are stage-specific evidence.

## Remaining constraints

- Tiles are eligible-only visualization. Denominators/totals come from unchanged summary publications.
- Missing PVOUT/annual generation is unavailable, never zero.
- Exact administrative area × type and capacity-range statistics require separately supplied aggregates.
- Deployment does not establish original model/topology/vintage/rights certification or device/network budgets; see [decisions and risks](DECISIONS_AND_RISKS.md).
- Features, modeling, archive regeneration, production settings and deployment need separately agreed work.
