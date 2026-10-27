# Milestone 3 — Local WebGIS implementation and verification

> Historical milestone-3 local-demo evidence. Old archive paths, zooms and run instructions below are not current setup. For current setup/deployment and the latest checks, use [README](../README.md), [deployment](DEPLOYMENT.md) and [repository review](PROJECT_REVIEW.md).

Current archive update: the application now uses the separate GeoPackage-verified repaired z13–18 PMTiles. See [ARCHIVE_REPAIR_REPORT.md](ARCHIVE_REPAIR_REPORT.md) for current paths, source verification, exact corrections, browser checks and rollback. The milestone-3 z14–16 archive measurements below are historical evidence.

The approved local demo is implemented in the existing Vue project. This stage includes the administrative map, KPIs/charts, building details and basic responsive refinement from the earlier milestone 4–7 breakdown. It stops before remote publication.

## Run and explore

The usage and QA observations below describe the original z14–16 local-demo stage. The subsequent repaired native z13–18 archive is already integrated and deployed. Use the root README for current setup rather than treating the historical paths below as active configuration.

```powershell
pnpm.cmd dev
# Open http://localhost:5173/
```

The server binds localhost, uses strict port 5173, and requires the existing ignored archive at `data/processed/buildings_eligible_dki.pmtiles`. No environment variable is needed locally. If a server is already running, use it rather than starting another instance on a different port.

- Start with the four DKI KPIs; choose any of the six regions and its dependent districts.
- Select Jakarta Barat → Cengkareng for a dense urban district, or Kepulauan Seribu and one of its districts for island coverage. Zoom/pan to inspect buildings from z14; the z16 archive supports overzoom. Demo shortcut buttons have been removed.
- Hover and click real footprints. The keyboard-accessible **Inspeksi** button selects a real feature near the viewport center. Close details with the close button or Escape.
- Use **Layer** to toggle buildings, choropleth, region/district outlines and the **OpenFreeMap / Google Imagery** basemap. The choropleth selector offers capacity, covered annual energy and eligibility rate.
- Use **Reset semua filter** to restore DKI statistics and fit all administrative geometries, including the islands. The extent button fits DKI without changing statistical filters.
- Charts compare regions, or the selected region's districts. Toggle capacity/energy; click a comparison bar to select its administrative unit. Category statistics remain explicitly DKI-wide.
- The fullscreen control expands the entire map panel, keeping its layer menu, legend and building details available. Full DKI remains in frame during responsive/fullscreen resizes; manual detail navigation is preserved.
- **Metodologi** opens assumptions and coverage. The source/status table and internal release identifier were removed at the user's request. Both external basemaps retain provider attribution. A neutral background remains an automatic failure fallback, rather than a basemap choice.

## Statistical behavior

All dashboard calculations use the unchanged milestone 2 services, selectors, crosswalks and shared store. No KPI is computed from visible vector features. Eligibility always uses all analyzed buildings, including ineligible buildings absent from the map.

| DKI indicator | Original value | Primary display |
|---|---:|---:|
| Eligible buildings | 1,470,399 of 1,747,249 analyzed | 1.470.399 |
| Modeled capacity | 18,627.76699292319 MWp | 18,63 GWp |
| Covered annual generation | 25,117.47645231979 GWh/year | 25,12 TWh/tahun |
| Eligibility | 1,470,399 / 1,747,249 | 84,16% |
| PVOUT available / missing | 1,466,275 / 4,124 eligible buildings | Count coverage 99,72% |

Source units and precision are retained; conversions and rounding happen only for presentation. District/type capacity coverage is shown only when the data contract supports it. Missing PVOUT and annual generation display **Tidak tersedia**. Kepulauan Seribu Utara's all-null annual generation remains unavailable in its KPI and comparison bar. The internal `data_version` identifies matching source/crosswalk/producer bytes; it is still validated for compatibility but is no longer displayed as “Versi ringkasan” in the methodology panel.

Type-only KPIs are supported across DKI. Administrative × type intersections are not available: the map applies the requested filter, KPI cards show unavailable placeholders, and the page explains the missing aggregate. Comparison/category charts continue to identify their actual marginal scopes. Enabling joint KPIs requires an exact all-building-source aggregate with eligibility denominators, capacity, covered generation and PVOUT counts; no frontend approximation is used.

## Map and delivery implementation

- Official `pmtiles` 4.5.0 protocol is registered once. `maplibre-gl` 6.15.0 uses its separate worker through Vite `?worker&url` and `setWorkerUrl`.
- Actual source-layer: `buildings_eligible_pvout`. `building_uid` provides stable hover/selection identity across clipped instances.
- Both building fill and outline retain `["==", ["geometry-type"], "Polygon"]`, the tested workaround for the source's empty type-0 instances. Eligibility, crosswalk-based administrative names and all category aliases are composed into this filter. The archive is unchanged.
- The existing tile adapter normalizes raw `useable_m2` to `usable_m2`, canonicalizes labels and keeps omitted PVOUT/energy as null. Building details display real archive attributes.
- Administrative sources are renderer-owned copies of the validated GeoJSON. Choropleth properties join directly to the precomputed summaries by stable ID. Null annual energy uses gray rather than the zero end of the ramp.
- `/_local/buildings.pmtiles` is a **development-only** Vite middleware reading one fixed archive. Single bounded/suffix ranges up to 16 MiB return 206, Content-Range, Accept-Ranges and ETag. Missing/oversized ranges return 416; mismatched If-Match returns 412; unsupported methods return 405; alternative archive paths, including encoded extensions, return 403. HEAD reports size without sending the body.
- Vite excludes raw/processed archives, QA browser profiles and local tools from its watcher. This fixes a reproduced Windows EBUSY crash on Chrome's locked Cookies file during QA.
- A public `VITE_BUILDINGS_PMTILES_URL`, when deliberately configured, overrides the dev endpoint. `vite preview`/production do not serve the local archive: without a public URL, administrative maps remain available with an explicit archive-configuration notice. No credentials belong in `VITE_*`.

## Changed application files

| Files | Responsibility |
|---|---|
| `src/App.vue`, `src/main.ts`, `src/style.css`, `index.html` | Shared store provisioning, page composition, asynchronous map loading, Indonesian metadata and responsive visual system |
| `src/components/AppIcon.vue` | Small native SVG icon set |
| `src/components/dashboard/{KpiCards,CoverageCard,AnalyticalCharts}.vue` | Authoritative KPIs, PVOUT counts/capacity coverage, scoped bar/donut charts and unavailable states |
| `src/components/filters/AdminFilters.vue` | Existing store-backed region/district/type controls, resets and scope explanation |
| `src/components/map/{SolarMap,MapLoading,BuildingDetails}.vue` | Interactive map, layers/legend/navigation, loading/error/empty states, real hover/click/keyboard details |
| `src/components/methodology/MethodologyPanel.vue` | Native modal with assumptions, sources and limitations |
| `src/map/{mapModel,protocol,basemap}.ts` | Typed expressions/navigation, protocol/worker setup, public/dev URL selection and basemap fallback |
| `src/utils/presentation.ts` | id-ID display formatting and compact region labels, reusing existing unit helpers |
| `scripts/dev/pmtilesPlugin.ts`, `vite.config.ts` | Local fixed-archive Range middleware, strict local server and watcher exclusions |
| `tests/map-integration.test.ts`, `scripts/qa-app.mjs`, `package.json` | Six new automated tests, reproducible actual-app browser regression and test command |
| `package.json`, `pnpm-lock.yaml` | Sole new application dependency: official PMTiles client |
| `README.md`, `AGENTS.md`, `START_HERE.md`, implementation/architecture/design/product/decision docs | Current setup, approved boundary, evidence and remaining gates |

Milestone 2 types, data services/selectors/store/composable and the original 41 tests are retained. Raw data, generated publication bytes, crosswalk sources, modeling scripts and both archives are preserved. The subsequent repository screening removes the unused HelloWorld component and its starter assets; see PROJECT_REVIEW.md. The project/tooling was not replaced.

## Verification and evidence

```powershell
pnpm.cmd data:check
pnpm.cmd test
pnpm.cmd typecheck
pnpm.cmd build
# With the development server running; requires an installed Chrome:
node scripts/qa-app.mjs
```

All 48 automated tests pass: the original 41 plus seven cases for every composed Polygon/eligibility filter, raw type aliases, island navigation bounds, all real DKI administrative extent coordinates, Indonesian/null formatting, byte-range parsing and real HTTP middleware behavior. TypeScript checks cover the Vue app, Vite config and strict data/tests project. Data freshness passes for all nine original output files and data version `dki-solar-2edaec0ca52d964b`. Production build passes. No lint tool/script is configured.

The browser helper uses an existing Chrome installation, real localhost application, official protocol and CDP mouse/keyboard input. It writes ignored artifacts under `data/processed/qa/ui-refinement/` and cleans only its own isolated browser profile. Set `CHROME_PATH` if Chrome is installed elsewhere. It does not replace the earlier isolated geometry diagnostic or regenerate any tile archive.

Actual Chrome 155 / software WebGL checks passed:

- DKI KPI reconciliation; every six-region, 44-district and seven-type selection compared against its published summary; dependent region reset.
- Explicitly unsupported joint filters; scoped charts and seven category rows; all-null district energy remains unavailable.
- Dense urban and island Polygon rendering; real mouse hover/click returns building `291296` and its capacity 6.921195907448419 kWp. Selection feature state is verified. Rendered feature counts are diagnostic clipped instances, never building totals.
- Real island building `1744773` displays 5,10 kWp and unavailable PVOUT/annual generation through the archive-property adapter, with no model recalculation.
- z18.3 rendering over the z16 source; choropleth property changes; building visibility and neutral-basemap controls; methodology modal/Escape.
- 390 × 844 mobile layout without horizontal overflow, a real building detail sheet, full reset, and desktop screenshots inspected visually.
- Deliberately blocked external basemap: neutral fallback notice appears, local buildings still render, and no main-app error occurs.
- Deliberately blocked summary JSON: the data error is visible with unavailable KPI placeholders; unblocking and pressing retry restores the real dashboard and map.
- No runtime exceptions or critical console errors; every observed archive response uses Range/206. Canceled requests during rapid selection and the intentionally blocked provider are recorded separately as expected network events.

Latest report: `data/processed/qa/viewport-layout/app-report.json`. Screenshots `01-overview.png` through `12-laptop-map-without-page-scroll.png` cover the real app, including unsupported scope, charts, mobile and the complete laptop map. Earlier UI-refinement artifacts are retained separately. Local request counts/byte totals and development paint/map-ready timings are recorded in that report; they vary with cache, provider/network and rapid navigation. They are not production performance guarantees.

The PMTiles SHA256 remains `622e785b2dae369530976a1a0a7c1671b3f51589e4ef9c56abbfd47f3eecdb02` (790,567,834 bytes). No MBTiles/PMTiles file is included in the production build.

## Requested visual refinement

The follow-up removes the quick-location strip, top scope row, research eyebrow/tagline, technical-potential caption, closing CTA, two specified methodology paragraphs and the right footer link. Data sources/assumptions, the generation coverage caption, unsupported-filter explanation and provider attribution remain available.

The old hardcoded maxBounds constrained MapLibre's minimum camera scale: after the old extent action, the visible latitude span was approximately -6.2061 to -5.3694, clipping both DKI extremes (-6.3726 to -5.2025). The camera now derives initial/reset bounds from all six validated administrative geometries, resets bearing/pitch and reserves edge padding. The restrictive maxBounds is removed; minimum zoom 5 also supports short landscape fullscreen. Resize handling refits a full-DKI view but preserves a user-navigated detail view.

Google Imagery uses the user-specified XYZ URL over HTTPS: `https://mt0.google.com/vt/lyrs=s&hl=en&x={x}&y={y}&z={z}`. It is a raster layer below the research layers; switching basemaps does not replace the style, summaries or building feature state. Provider failures have an explicit fallback. No dependency was added.

The browser regression validates real Google image responses/attribution and switching back to OpenFreeMap, native fullscreen enter/exit, full-region bounds projected within desktop/mobile/landscape viewports, removal of the requested elements, plus the existing statistical/rendering checks. All 48 unit/integration tests, data freshness, TypeScript and production build pass. The large map-chunk warning remains.

## Viewport layout

Viewport-height follow-up: the map previously inherited the combined height of the filter/coverage sidebar, forcing page scrolling through the canvas. The desktop overview now uses the available viewport height; the sidebar scrolls independently, charts remain below, and the map navigation restores the overview. Responsive/short-screen sizing and detail-panel bounds keep both map edges visible. The browser helper checks 1440×900, 1366×768, 1280×720, 1280×600 and 1920×1080 at pageScroll=0, plus sidebar independence, unsupported-filter layout, mobile and fullscreen. At 1366×768 the map panel is now about 507 px high (previously 448 px) and ends at y=756, leaving a 12 px screen margin. The standard sidebar is 230 px wide (previously 258 px); wide desktops use 244 px and medium desktops 216 px. Tighter header/title/KPI spacing supplies the extra map height without page scrolling. All 48 tests, TypeScript and build pass; no data or archive was changed.

## Remaining work and release gates

- Cloudflare R2 remains preferred but unconfigured. No remote URL, cross-origin Range/CORS, costs or CDN/cache behavior has been verified; no upload or deployment was performed.
- The WebGL module is separately loaded: the main built JS is about 115 kB (43 kB gzip); the map chunk remains about 1.11 MB (307 kB gzip) plus a 517 kB worker. Vite's large map-chunk warning remains visible. The two unchanged administrative GeoJSON files total about 9.52 MB uncompressed. Establish production transfer/GPU budgets before release; any future simplified derivatives require their own QA and approval.
- Browser QA is representative headless/software-WebGL coverage. Physical touch devices, other browser engines, screen-reader review, contrast certification, exhaustive tile pan/zoom and production network/GPU performance remain unverified.
- Original model assumptions, topology/assignment, source vintage, licensing/redistribution and QGIS sample review remain research/publication gates. Existing source type-0 artifacts are filtered at render time, not repaired.
- Exact geographic × building-type aggregates are still missing. CSV/GeoJSON/PMTiles production statistics were not invented or altered.
- No commit, push, upload or deployment occurred. Further release work requires a new approved scope.
