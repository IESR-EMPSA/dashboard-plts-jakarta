# Decisions, assumptions and open questions

## Confirmed design decisions
1. Research dashboard covers DKI Jakarta; first map displays **eligible rooftops only**.
2. QGIS GeoPackage outputs are authoritative analysis data; frontend does not repeat GIS potential calculations.
3. Frontend uses existing Vue 3 + TypeScript + Vite project with MapLibre.
4. Intended hosting uses Vercel frontend and static JSON/PMTiles, **no PostGIS**. Cloudflare R2 is the preferred archive-storage candidate, not finalized/configured; no upload/deployment is authorized.
5. Tiles are delivery/visualization medium; aggregates come from QGIS summary tables.
6. Site-level `pvout_1` can be null. `annual_gwh` also null where no yield, but eligible capacity remains available.
7. V1 uses 6 kab/kota, 44 kecamatan, 7 building types.

## Local demo decisions (approved milestone 3)

- Official `pmtiles` 4.5.0 is the sole added application dependency. Vue state/data services are reused; charts use native HTML/SVG.
- Local development serves the fixed ignored archive with Vite-only bounded HTTP Range/206 middleware. It does not create a deployed backend or copy the archive to public assets.
- OpenFreeMap Positron supplies a no-key light basemap with its attribution. A neutral local background is a tested fallback; the app remains useful without that external provider.
- The WebGL component loads asynchronously; the main data/dashboard bundle stays smaller. Large MapLibre/worker chunks and 9.52 MB of unsimplified administrative GeoJSON still need production network/device budgeting.
- Mobile refinement uses inline filters and a scrollable detail sheet; a drawer and a full accessibility audit are deferred.
- The current approval ends at a verified local demo. It does not authorize uploads, deployment, commits or pushes.

## Superseded decisions and reasons
- The original public Vercel Blob (`jakarta-rooftop-solar`, SIN1) preference is superseded because the user's audit request and follow-up explicitly prefer R2 pending confirmation. No store/public URL was independently verified. Static frontend/summary/archive architecture is unchanged.
- Fixture-first implementation is replaced with actual CSV preprocessing because the exports now exist and reconcile. Synthetic validation cases must stay out of production outputs.
- Explicit crosswalks now resolve six region names, five district-name differences and uppercase type aliases. Raw useable_m2 maps to public usable_m2; omitted energy maps to null without recalculation.

## Confirmations needed before calling release production-ready
| Item | Current state | Consequence |
|---|---|---|
| PMTiles generated | Complete: 790,567,834 bytes; v3 MVT; official CLI 1.31.2 show/verify pass; 28 sampled tiles byte-identical | Local application protocol/Range now verified; remote hosting pending |
| Source-layer name | buildings_eligible_pvout in both archives | Actual layer used in both application building layers |
| Source size/zoom | 793,317,376 bytes; 2,659 gzip MVT tiles, z14–16 | PMTiles 790,567,834 bytes; representative local browser QA complete, production budgets pending |
| Remote CORS and Range 206 | No remote endpoint verified/uploaded | Separate hosting gate |
| Normalized JSON/frontend services | Original nine files retained; manifest/runtime-validated services and filter semantics implemented; 41 tests pass | Local map/dashboard now implemented; production release gates remain |
| Administrative polygons | 6 regions + 44 districts present; joins resolve explicitly | Full topology/assignment/source rights pending |
| Type-0 geometry instances | Empty instances at every zoom; browser reproduces tile failures and validates polygon filtering | Keep source unchanged; both app building layers use the tested Polygon predicate; clean re-export needs separate approval |
| Data age/source and redistribution license | To verify | Public release legal/data attribution risk |
| Compound district × type aggregate | Not produced | Combined filter KPIs unsupported until precomputed |
| Overlap and outlier QA | Deferred in QGIS workflow | Results need methods caveat and later QA report |
| Source-code repository state | Existing local repo; inspect first | Avoid reinitializing or breaking environment |

## Release notes / risks
- Data coverage caveat: approximately 40.15 MWp in Kepulauan Seribu has no PVOUT in currently aggregated dataset; annual generation excludes that part.
- Precision caveat: model uses footprint-based assumptions and specific yield, not individual roof shading, pitch, orientation, structural capacity or connection constraints.
- R2 custom-domain/Range/CORS/cost/latency and cacheable-object limits require review before public launch. Largest current z14 compressed tile is 3,970,317 bytes; conversion alone is not a speed guarantee.
- Source schema differs from desired details (useable_m2; omitted energy; mixed fid; uppercase categories). Use explicit adapters. Administrative WIADKK is unsuitable for joining Seribu, and metadata suggests mixed vintages.
- Vector tiling can clip or simplify geometry; no inference of all-building counts from tiles.
- Dataset versions must be pinned together. A new PMTiles alone without recomputing JSON creates inconsistent dashboard results.

## Change log
- 2026-10-26: Expanded milestone 3 local demo completed: official PMTiles protocol, local Range/206, geometry-safe map, administrative filters/choropleths, KPI/chart scopes, real building details and responsive UI. All 47 tests, typechecks, data freshness, production build and actual-app Chrome regression pass. Raw/public data and archives remain unchanged; no upload/deployment/commit/push. See LOCAL_DEMO.md.
- 2026-10-26: Initial Codex context pack drafted from project discussion, awaiting repo and exported-data validation.
- 2026-10-26: Read-only audit reconciled actual summary totals and all administrative joins; inspected real MBTiles and identified schema/geometry differences. Original model/source/license QA remains pending.
- 2026-10-26: User approved documentation → real-data preprocessing → local conversion/geometry investigation → checks, stopping before application MapLibre integration. Storage/fixture decisions revised with reasons above.
- 2026-10-26: Approved stage completed: CSV-derived data/boundaries, full joins, official local conversion, all-zoom empty-instance scan and isolated Chrome rendering/interaction comparison. Tests/typechecks/build pass. No archive content was repaired/dropped, no app map/UI was added, and no upload/deployment occurred. See DATA_STAGE_REPORT.md.
- 2026-10-26: Separately approved milestone 2 completed with existing Vue APIs and no added dependency. Manifest/provenance/runtime checks, lazy immutable geometry, scoped KPIs, explicit unsupported intersections, dependent filters, retry/refresh protection and future tile normalization are implemented. All 41 tests, typechecks/build and HTTP/browser-bundle smoke checks pass. Publication files/contracts and archives are preserved; milestone 3 has not started. See FRONTEND_DATA_LAYER.md.
