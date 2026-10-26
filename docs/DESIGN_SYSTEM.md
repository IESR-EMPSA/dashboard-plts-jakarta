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
This is the target design. Starter components/CSS do not implement it yet. The approved data/archive stage adds no dashboard UI or application map. Vintage, rights and production map performance remain release gates.

## Example semantic labels
- `Estimated rooftop PV capacity`
- `Modelled annual generation (PVOUT-covered buildings)`
- `Eligible building footprints`
- `Eligibility rate of analyzed footprints`
- `PVOUT unavailable`
- `Unknown building type`
- `Technical potential estimate; not installed capacity`
