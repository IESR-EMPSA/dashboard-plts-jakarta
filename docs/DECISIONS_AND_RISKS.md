# Decisions, assumptions and open questions

## Confirmed design decisions
1. Research dashboard covers DKI Jakarta; first map displays **eligible rooftops only**.
2. QGIS GeoPackage outputs are authoritative analysis data; frontend does not repeat GIS potential calculations.
3. Frontend uses existing Vue 3 + TypeScript + Vite project with MapLibre.
4. Intended hosting uses Vercel frontend and static JSON/PMTiles, **no PostGIS**. The repaired archive is uploaded to Cloudflare R2 and its public development URL is accepted for localhost integration. Production custom-domain/origin/cost and frontend deployment gates remain; no additional upload or deployment is authorized.
5. Tiles are delivery/visualization medium; aggregates come from QGIS summary tables.
6. Site-level `pvout_1` can be null. `annual_gwh` also null where no yield, but eligible capacity remains available.
7. V1 uses 6 kab/kota, 44 kecamatan, 7 building types.
8. The active building-tile zoom range is **13–18**, using a separate GeoPackage-verified attribute-only repair. The original sources, initial converted file, prior z14–16 archives and QA records are preserved. See ARCHIVE_REPAIR_REPORT.md for the exact 76-issue ledger and rollback.
9. Manual functional UAT is approved. Subsequent work is technical QA and confirmed-issue fixes only. Bounded visual existence checks and two-level decoded cache retention preserve the approved UI/data behavior. Continuous local runs and 62 automated tests pass, but remote hosting and target-device memory/bandwidth sign-off remain required; see TECHNICAL_QA_REPORT.md.

## Local demo decisions (approved milestone 3)

- Official `pmtiles` 4.5.0 is the sole added application dependency. Vue state/data services are reused; charts use native HTML/SVG.
- Local development serves the fixed ignored archive with Vite-only bounded HTTP Range/206 middleware. It does not create a deployed backend or copy the archive to public assets.
- Basemap choices are OpenFreeMap Positron and Google Imagery via the user's HTTPS XYZ endpoint. Both retain provider attribution; the neutral background is an automatic fallback. Basemap switches preserve research layers and filter state. No key/API session or new dependency was introduced.
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
| PMTiles generated | Current separate repaired z13–18 archive: 1,667,964,549 bytes; official CLI verify passes; 33 samples include all repaired tiles | Original archives preserved; remote hosting pending; see ARCHIVE_REPAIR_REPORT.md |
| Source-layer name | buildings_eligible_pvout in both archives | Actual layer used in both application building layers |
| Source size/zoom | Supplied z13–18 MBTiles: 1,697,189,888 bytes; 37,710 tiles; source attribute defects verified against the original GeoPackage | Separate repaired derivative changes only 78 field instances in three tiles; geometry/identity/zoom preservation checked; production budgets pending |
| Source attribute verification | GeoPackage now present; all 76 reported issues verified by building_uid, including fields outside detail panels | Zero unresolved attribute mismatches in the repaired derivative; exact exporter implementation remains unknown |
| Remote CORS and Range 206 | R2 object uploaded and localhost integration verified; bounded 206, both localhost origins and real remote MapLibre pass | Production custom-domain/origin/cost remain separate gates; see R2_LOCAL_INTEGRATION.md |
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
- R2 custom-domain/Range/CORS/cost/latency and cacheable-object limits require review before public launch. The largest compressed tile is now 11,485,765 bytes at z13; the unchanged z14 maximum is 3,970,317 bytes. Conversion alone is not a speed guarantee. Dense-view sustained-session and physical-device performance remain release gates.
- Normal Windows DNS/DoH and TLS now reach R2, but a separate Chrome plaintext resolver received ISP filtering responses in the fresh QA profile. Accepted isolated Chrome uses the normal Windows resolver, with no IP mapping or TLS exceptions. Browser/network DNS configuration and an appropriate production domain remain delivery considerations. No Windows DNS settings were changed by the integration; see R2_LOCAL_INTEGRATION.md.
- Source schema differs from desired details (useable_m2; omitted energy; mixed fid; uppercase categories). Use explicit adapters. Administrative WIADKK is unsuitable for joining Seribu, and metadata suggests mixed vintages.
- Vector tiling can clip or simplify geometry; no inference of all-building counts from tiles.
- The original-cache AMD stress run became unresponsive after 140 stops. A reduced-cache run completes 150 stops over 5.4 minutes, but the earlier timeout's exact cause is not conclusively established. Final stress private commit peaks near 2.43 GiB and completed archive responses total about 1.04 GB. This is a measured deployment-budget concern, not proof of an unbounded leak or permission to change geometries. Broader remote/device technical verification remains a release gate.
- Dataset versions must be pinned together. A replacement archive may reuse summaries only after validating its IDs, measurements and missingness against the existing publication. A verified delivery-only repair or zoom extension does not require rewriting unchanged statistics; changes to the modeled population or measurements require a compatible new statistical publication. The current delivery has separate source/output fingerprints and repair provenance.

## Change log
- 2026-10-26: Resumed approved R2-to-localhost integration after a usage-limit approval-service failure; ordinary approvals were used throughout. The public URL is active in ignored `.env.local`; no app source, dataset or credential change. Normal Windows-DNS/TLS and both-origin Range/CORS pass; actual remote native z13–18, real details and representative summary filters pass. The preserved local baseline and remote route transfer the same completed payload bytes; performance observations, browser-resolver diagnosis, 62 tests/typechecks/build and production gates are recorded in R2_LOCAL_INTEGRATION.md. No additional upload or frontend deployment.
- 2026-10-26: User-approved post-UAT technical QA, with no UI redesign/full functional UAT replay. Measured full-viewport empty checks replaced by bounded existence queries (approximately 96% lower query time in the paired test); decoded cache bounded to two zoom levels after hardware responsiveness/memory concerns. Final hardware soak, Range/data integrity, 62 tests, typechecks and build pass. Prior failed attempt retained; remote hosting and performance/publication gates remain open. See TECHNICAL_QA_REPORT.md.
- 2026-10-26: User-approved surgical z13–18 delivery repair after original GeoPackage became available. All 76 reported source MVT issues were verified against exact source values; 78 clipped field instances across 45 IDs and three tiles restored in separate archives. All geometry/ID/type and unrelated records retained, 37,707 other compressed tiles unchanged, original inputs fingerprint-preserved and application rollback captured. Shared viewer/endpoint settings use native z13–18; statistics and publication provenance remain unchanged. See ARCHIVE_REPAIR_REPORT.md and ARCHIVE_ATTRIBUTE_REPAIRS.csv.
- 2026-10-26: User-approved Indonesian/English interface with a persistent navbar language switch; modeled-data badge removed. Existing Vue reactivity and a typed paired catalog cover all components, map controls, tooltips/details, number/null formatting, methodology and recovery messages. Statistical datasets, canonical IDs and archive geometry remain unchanged. See LOCALIZATION.md.
- 2026-10-26: User-requested visual cleanup and map refinement: specified decorative/text elements removed; full-DKI extent corrected by removing the restrictive camera bounds; native fullscreen and Google Imagery added. All 48 tests, typechecks/build, data freshness and updated desktop/mobile/landscape browser checks pass. No production data/archive modifications or publication actions.
- 2026-10-26: Expanded milestone 3 local demo completed: official PMTiles protocol, local Range/206, geometry-safe map, administrative filters/choropleths, KPI/chart scopes, real building details and responsive UI. All 47 tests, typechecks, data freshness, production build and actual-app Chrome regression pass. Raw/public data and archives remain unchanged; no upload/deployment/commit/push. See LOCAL_DEMO.md.
- 2026-10-26: Initial Codex context pack drafted from project discussion, awaiting repo and exported-data validation.
- 2026-10-26: Read-only audit reconciled actual summary totals and all administrative joins; inspected real MBTiles and identified schema/geometry differences. Original model/source/license QA remains pending.
- 2026-10-26: User approved documentation → real-data preprocessing → local conversion/geometry investigation → checks, stopping before application MapLibre integration. Storage/fixture decisions revised with reasons above.
- 2026-10-26: Approved stage completed: CSV-derived data/boundaries, full joins, official local conversion, all-zoom empty-instance scan and isolated Chrome rendering/interaction comparison. Tests/typechecks/build pass. No archive content was repaired/dropped, no app map/UI was added, and no upload/deployment occurred. See DATA_STAGE_REPORT.md.
- 2026-10-26: Separately approved milestone 2 completed with existing Vue APIs and no added dependency. Manifest/provenance/runtime checks, lazy immutable geometry, scoped KPIs, explicit unsupported intersections, dependent filters, retry/refresh protection and future tile normalization are implemented. All 41 tests, typechecks/build and HTTP/browser-bundle smoke checks pass. Publication files/contracts and archives are preserved; milestone 3 has not started. See FRONTEND_DATA_LAYER.md.
