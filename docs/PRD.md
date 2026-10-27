# Product requirements — Jakarta Rooftop Solar Potential Explorer

## Purpose
Deliver an interactive research WebGIS for exploring **modeled rooftop photovoltaic potential in DKI Jakarta**, with comparison of administrative areas, building categories, and building-level potential. It communicates a modeled **technical potential**, not existing installed PV and not guaranteed site feasibility.

## Audience and priorities
- Research/energy analysts and policy stakeholders examining district-level spatial distribution.
- Public or internal viewers exploring the map; release permissions remain to be confirmed.
- Optimize for a clear desktop research workflow but support tablet/mobile use.

## Geographic and dataset scope
- DKI Jakarta: 6 kabupaten/kota including Kepulauan Seribu; 44 kecamatan.
- Map **only eligible building footprints** at detail zoom in V1: 1,470,399 polygons.
- Summaries use the full denominator of 1,747,249 buildings, including ineligible features absent from map tiles.
- Existing QGIS processing is source of truth; WebGIS does not run setback, RUF, panel-capacity or PVOUT modeling.

## Primary screens
**Single map-centric dashboard**:
- Header: IESR symbol/product name, section navigation, ID/EN switch and methodology button. Source-vintage certification remains a separate documentation question.
- Four primary KPI cards: total estimated PV capacity (GWp), modeled annual energy (TWh/year; partial coverage notice), eligible building count, eligibility rate.
- PVOUT coverage and number of missing buildings displayed in secondary QA indicator.
- Filters: kabupaten/kota, kecamatan (dependent on selected city), jenis_group; future capacity-range filters only with a reliable pre-aggregation/query plan.
- Interactive MapLibre map: basemap, kabupaten/kota polygon outlines and choropleth, 44 kecamatan boundaries (both exports now present; explicit crosswalks required), eligible building polygon layer at high zoom, hover/highlight, clickable building details, legend, zoom and reset controls.
- Charts: switchable capacity/generation comparison by region or district, DKI-wide building-type capacity distribution, eligibility and PVOUT coverage. Generation/count variants of the type chart are not current UI features. Do not claim cross-filtering unless data supports it.
- Side detail panel on feature click with IDs, building type, geographic labels, footprint, modeled usable area, capacity kWp, PVOUT and modeled annual kWh; descriptive NA states when missing.
- Methodology panel: data sources, assumptions, coverage, known exclusions, uncertainty/disclaimer.

## Behavioral specification
### Interface language
- Provide Indonesian and English through an ID/EN switch in the top navbar; remove the modeled-data badge.
- Default to English for a new browser and restore a valid locally saved selection, including Indonesian. Missing/invalid or inaccessible storage falls back to English; storage restrictions must not prevent language switching.
- Translate all interface components, including detail panels, live tooltips, methodology, map controls, loading/error/empty states and accessible labels. Update document language/title and numeric/year-unit formatting together.
- Preserve filters, statistical scope, selected buildings and the map camera when switching. Data IDs, canonical names, source measurements, null semantics and unsupported filter combinations remain unchanged.

### KPI sources
- Overall and admin-unit KPIs come from static summary files, **never from the viewport's vector tiles**.
- Formatting: MWp to GWp divide by 1,000; GWh to TWh divide by 1,000; percentages from ratio ×100. Do not silently round intermediate calculations.
- Do not show modeled annual generation as total energy for buildings without PVOUT. Label energy as 'modelled generation (covered buildings)' until coverage is resolved.
- `annual_gwh = null` means unavailable; show `Data unavailable`, not `0`.

### Filters — staged behavior
- **V1 required:** select an administrative region or kecamatan; update map extent, highlighted boundary, KPI, and charts backed by corresponding summaries.
- Building-type chart can show DKI-wide values from `summary_jenis_dashboard`.
- Label the type chart DKI-wide under administrative selection until an exact intersection aggregate exists. Type-only statistics are supported; region × type and district × type statistics are not.
- **Combined filter** (e.g. Kecamatan Tebet + Non Hunian): requires precomputed `summary_kecamatan_jenis.json` or another exact aggregate. Until provided, do not invent combined sums; disable cross-dimensional KPI recalculation and explain limitation.
- Building layer style filters may apply locally to fetched tiles, but that never becomes the denominator of global summary calculations.
- Selecting a kab/kota excludes districts outside the selection, and district choice resets if user changes parent.
- The comparison chart provides Back to the parent administrative scope (district → region → DKI) and Reset area to clear both administrative selections directly. Actions share a stable single-row toolbar with the metric switcher; their slots remain visible and disabled at DKI scope. Actions preserve the chart metric and building-type filter, use shared dashboard state, and retain keyboard focus. Responsive labels, tooltips and accessible names support Indonesian and English.

### Building map
- Open on the five mainland Jakarta cities with modest context, matching the approved reference. The extent control fits the exact combined bounds of all six published administrative geometries, including Kepulauan Seribu, with a small symmetric margin. Resizing/fullscreen retains the active fitted view; manual navigation keeps its camera.
- The current building-tile zoom range is **13–18**, using a separate GeoPackage-verified repaired archive. The original z14–16 archive and QA remain preserved baseline/rollback evidence; see ARCHIVE_REPAIR_REPORT.md.
- Never request all building polygons as one GeoJSON.
- MapLibre loads repaired PMTiles MVT through HTTP Range requests from the Cloudflare R2 custom domain; the frontend is deployed on Vercel. The preserved local archive remains a development configuration alternative, without automatic failover. See [deployment](DEPLOYMENT.md) for current delivery and [R2 localhost integration](R2_LOCAL_INTEGRATION.md) for historical evidence.
- At low zoom display admin choropleth. Enable individual footprints at a tested higher zoom; exact thresholds based on performance testing.
- Buildings are eligible; do not display a misleading 'not eligible' layer in V1.
- Style available vs missing PVOUT distinctly if appropriate. Missing PVOUT buildings still show available modeled capacity.
- Use `building_uid` as feature identifier if preserved in tile attributes; verify `source-layer` and stable IDs after conversion.
- Current source layer: `buildings_eligible_pvout`, z13–18. Normalize raw `useable_m2`, category aliases and omitted NoData energy using the data contract. Known type-0 instances retain the Polygon predicate. The approved attribute-only repair does not modify geometry; conversion itself is not repair.

### Visual and quality states
- Loading skeletons, offline errors, missing JSON errors, empty selection and no PVOUT states.
- Clear visible notice for Kepulauan Seribu PVOUT incompleteness.
- Technical-versus-installed capacity and the detailed PVOUT/missing-energy explanation are consolidated in the methodology modal. Keep the compact generation-card PVOUT label and explicit unavailable values in context; remove the former sidebar research note and overview energy-caption strip.
- Source and attribution visible on basemap and exported reports.
- Hover accessible alternative via click/tap, keyboard-accessible controls and readable contrast.

## Out of scope for initial release
- User accounts, editing QGIS results, calculating new PV output, rooftop segmentation, public user uploads, live changes to source, dynamic spatial query server, download of full raw footprints, and search of 1.47 million features server-side.

## Acceptance criteria
- Main KPIs match exported authoritative values within display rounding.
- All 44 district records and 7 types display with appropriate counts; one district has NULL generation but remains present.
- Building popups show correct kWp/MWh and null semantics for a validated sample.
- No mismatch between map filter labels and KPI scope.
- Real PMTiles loads from the approved storage endpoint with verified 206 Range requests and browser CORS; known geometry issues have an evidenced rendering/interaction strategy.
- Tested desktop and mobile UI, no console errors, passing typecheck/build.
- Both languages reconcile all 6/44/7 statistical selections, preserve active interactions and remain usable without horizontal overflow on mobile. See LOCALIZATION.md.

## Current implementation status
The dashboard is implemented, manual UAT is approved, and the owner confirms Vercel production deployment with the repaired archive served through the R2 custom domain. See [deployment](DEPLOYMENT.md) and [current status](IMPLEMENTATION_PLAN.md). Historical stage-specific tests, local delivery and repair evidence remain in the [documentation index](README.md). This repository audit changes no features, UI, data, performance or production configuration. Original model/topology/vintage/rights certification and device/network budgets remain separate evidence questions.
