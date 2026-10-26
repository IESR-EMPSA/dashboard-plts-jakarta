# Decisions, assumptions and open questions

## Confirmed design decisions
1. Research dashboard covers DKI Jakarta; first map displays **eligible rooftops only**.
2. QGIS GeoPackage outputs are authoritative analysis data; frontend does not repeat GIS potential calculations.
3. Frontend uses existing Vue 3 + TypeScript + Vite project with MapLibre.
4. Intended hosting uses Vercel frontend and static JSON/PMTiles, **no PostGIS**. Cloudflare R2 is the preferred archive-storage candidate, not finalized/configured; no upload/deployment is authorized.
5. Tiles are delivery/visualization medium; aggregates come from QGIS summary tables.
6. Site-level `pvout_1` can be null. `annual_gwh` also null where no yield, but eligible capacity remains available.
7. V1 uses 6 kab/kota, 44 kecamatan, 7 building types.

## Superseded decisions and reasons
- The original public Vercel Blob (`jakarta-rooftop-solar`, SIN1) preference is superseded because the user's audit request and follow-up explicitly prefer R2 pending confirmation. No store/public URL was independently verified. Static frontend/summary/archive architecture is unchanged.
- Fixture-first implementation is replaced with actual CSV preprocessing because the exports now exist and reconcile. Synthetic validation cases must stay out of production outputs.
- Explicit crosswalks now resolve six region names, five district-name differences and uppercase type aliases. Raw useable_m2 maps to public usable_m2; omitted energy maps to null without recalculation.

## Confirmations needed before calling release production-ready
| Item | Current state | Consequence |
|---|---|---|
| PMTiles generated | Complete: 790,567,834 bytes; v3 MVT; official CLI 1.31.2 show/verify pass; 28 sampled tiles byte-identical | Application protocol/Range integration later |
| Source-layer name | buildings_eligible_pvout in both archives | Use actual layer in future integration |
| Source size/zoom | 793,317,376 bytes; 2,659 gzip MVT tiles, z14–16 | Final PMTiles size and browser performance still to measure |
| Remote CORS and Range 206 | No remote endpoint verified/uploaded | Separate hosting gate |
| Normalized JSON | Nine generated files; 16 tests and freshness check pass | Frontend services not yet implemented |
| Administrative polygons | 6 regions + 44 districts present; joins resolve explicitly | Full topology/assignment/source rights pending |
| Type-0 geometry instances | Empty instances at every zoom; browser reproduces tile failures and validates polygon filtering | Keep source unchanged; use tested future layer predicate or seek approval for clean re-export |
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
- 2026-10-26: Initial Codex context pack drafted from project discussion, awaiting repo and exported-data validation.
- 2026-10-26: Read-only audit reconciled actual summary totals and all administrative joins; inspected real MBTiles and identified schema/geometry differences. Original model/source/license QA remains pending.
- 2026-10-26: User approved documentation → real-data preprocessing → local conversion/geometry investigation → checks, stopping before application MapLibre integration. Storage/fixture decisions revised with reasons above.
- 2026-10-26: Approved stage completed: CSV-derived data/boundaries, full joins, official local conversion, all-zoom empty-instance scan and isolated Chrome rendering/interaction comparison. Tests/typechecks/build pass. No archive content was repaired/dropped, no app map/UI was added, and no upload/deployment occurred. See DATA_STAGE_REPORT.md.
