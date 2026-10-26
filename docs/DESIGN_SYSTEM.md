# Design system — research-grade map-first UI

## Principles
- Credible research dashboard, not a generic SaaS admin console.
- Map is the primary canvas. Statistics are supporting evidence.
- Clean, spacious, professional; information hierarchy over decorative widgets.
- Consistent units and readable numeric formatting (Indonesian locale optional; choose one locale consistently).
- Distinguish missing/uncertain PVOUT from zero and from ineligible buildings.

## Layout
**Desktop:** top header (brand/title + methodology + reset), four KPI cards beneath, side filter/analytics pane (approximately 300–380 px, collapsible), main MapLibre map, clear legend and selection detail panel.

**Mobile:** compact KPI carousel/two-column blocks, full width map, filters as drawer, building details as bottom sheet, charts beneath or in tabs. The map must remain usable under touch.

## Components
- `KpiCards`: Capacity GWp, Covered Generation TWh/year, Eligible Count, Eligibility Rate; secondary PVOUT coverage.
- `AdminFilters`: region and district dropdown, sensible dependent behavior; type only when cross-filter semantics are explicit.
- `SolarMap`: admin polygons/choropleth, district outlines, eligible footprints; scale/control and attributions.
- `BuildingDetails`: field name, source, type, location, area, modeled usable area, kWp, specific PVOUT, modeled energy, explicit no-data state.
- `MapLegend`: active metric color scale and missing PVOUT meaning.
- `RegionComparison`: sortable bar chart for 6 regions; toggle MWp vs GWh (do not overlay incomparable scales without a toggle).
- `TypeBreakdown`: 7 types, capacity/generation/eligible counts. "Tidak diketahui" displayed, not silently dropped.
- `PvoutCoverage`: availability by building count and MWp; warn for Kepulauan Seribu.
- `MethodologyPanel`: GIS methods, numeric assumptions, source citation/license, limitations and update date after verified.

## Recommended UX details
- Non-eligible polygons **not shown** in map v1, but eligibility rate uses full denominator and should be labelled appropriately.
- Hover lightweight tooltip; click opens full detail. Popup and chart interaction keyboard-accessible.
- Analyzing a district moves map to its bounds; one reset returns to full DKI.
- Loading and no-data view must not use fake zeroes.
- Default map background light neutral; analytical color ramps must be accessible and legible against basemap. Colors are implementation choice until real visual design is approved.
- Avoid false precision: GWp and TWh rounded to 2 decimals for KPI, with more precise units available in detail.
- Show energy coverage footnote next to generation KPI, not buried in methodology.
- Label chart scope explicitly: DKI-wide type values remain DKI-wide under administrative selection until an exact intersection aggregate exists. A map-only type filter cannot imply filtered KPIs.
- Show canonical type labels. Detail `usable_m2` adapts raw `useable_m2`; omitted tile energy displays unavailable. These adapters do not change the model.

## Implementation status
Milestone 3 implements a local Indonesian-language research UI: light paper surfaces, dark green text, teal capacity footprints, amber missing-PVOUT footprints, four KPI cards, compact filter/coverage sidebar, primary map, scoped analytical charts and methodology dialog. Number formatting uses id-ID; GWp/TWh KPIs use two decimal places and precise source-unit values remain accessible.

Desktop prioritizes the map with a 230 px sidebar (244 px on wide screens and 216 px on medium desktops). Compact header, title, KPI and caption spacing gives the map more vertical room while keeping the overview within one screen. Mobile uses two-column KPIs, inline stacked filters, full-width map and a scrollable building bottom sheet. A filter drawer/collapsible desktop sidebar remains a possible later refinement. Native controls, focus outlines, skip link, keyboard inspection, Escape dismissal and reduced-motion behavior are implemented. Chromium screenshots and automated interaction checks cover desktop and 390 px mobile; physical touch and broader accessibility audits remain pending.

Regional comparison toggles GWp/TWh and follows the selected parent region; its scope is explicit. The seven-category capacity chart stays DKI-wide in MWp. Eligibility and PVOUT count coverage follow supported KPI scope; unsupported intersections show an explanation. No chart substitutes zero for NULL energy.

Vintage, rights, full source-model verification and production device/network performance remain release gates. See LOCAL_DEMO.md.

## Approved visual follow-up

The desktop map/KPI overview now fits one viewport. Its flex/grid rows reserve space for the actual title, KPI cards and coverage caption; the map fills the remainder. Sidebar filters/coverage scroll independently and cannot stretch the map. A compact layout covers shorter laptop screens. Charts remain below the overview, and the map navigation returns to the entire overview. At narrow widths the inline filters remain above a map sized to fit below the sticky header once reached. Detail panels scroll within the visible map, and native/pseudo fullscreen keeps its full height.

The user requested a quieter page: remove the top research eyebrow/tagline/scope strip, the technical-potential caption, quick-location map strip, closing CTA, two specified methodology paragraphs and right footer link. Scope remains visible in the map, filters and chart footers; PVOUT missingness and supported-scope semantics remain explicit.

Basemap choices are OpenFreeMap and Google Imagery. The automatic neutral failure background remains available without a menu button. Native fullscreen expands the entire map panel. Full-DKI initial/reset views include Kepulauan Seribu and southern mainland and refit on viewport changes; detail views preserve navigation.

Icon-only buttons reset native padding and line height, with block SVGs centered in their fixed-size grid. Extent uses a framing/bounding-box symbol and retains its descriptive DKI tooltip/accessible name. Browser QA measures horizontal/vertical centering for extent and close buttons on desktop/mobile. The user-requested source/status table and technical data-version identifier are removed from the methodology UI; release compatibility remains enforced internally by the data services.

## Example semantic labels
- `Estimated rooftop PV capacity`
- `Modelled annual generation (PVOUT-covered buildings)`
- `Eligible building footprints`
- `Eligibility rate of analyzed footprints`
- `PVOUT unavailable`
- `Unknown building type`
- `Technical potential estimate; not installed capacity`
