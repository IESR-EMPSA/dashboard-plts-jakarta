# Milestone 2 — frontend data services and filter semantics

This is the milestone 2 handoff. The data APIs remain unchanged and are now consumed by the milestone 3 application; see LOCAL_DEMO.md for current UI, map, browser evidence and release gates.

## Status and scope
Implemented and verified against the existing generated release `dki-solar-2edaec0ca52d964b`. No dependencies were installed. Vue 3 reactivity/provide/inject, fetch, Web Crypto and the existing Node test runner are sufficient. The starter UI, original publication contracts, generated data, raw inputs, MBTiles and PMTiles remain unchanged.

This milestone creates no application map, layer, PMTiles protocol integration, backend or dashboard component. Milestone 3 remains separately approved work; its required Polygon predicate and worker-delivery checks remain in GEOMETRY_QA.md.

## Implemented files
| File | Responsibility |
|---|---|
| src/types/dashboard.ts | Readonly dataset, service, filter, scope, KPI/coverage result and normalized building types; reuses src/types/solar.ts unchanged |
| src/services/solarDataService.ts | Typed release loading, in-flight deduplication, successful-response cache, failed-request eviction, request timeout and lazy boundaries |
| src/services/dataValidation.ts | Runtime schemas/units, provenance compatibility, count/rate/null consistency, summary reconciliation, crosswalk joins, category aliases and normalized geometry checks |
| src/services/dataError.ts | Structured network, HTTP, timeout, parse, integrity, version, validation, filter and building errors |
| src/services/normalization.ts | Exact crosswalk resolution and future tile-property adapter |
| src/services/boundaryGeoJson.ts | Mutable renderer-owned GeoJSON copy with stable feature IDs; keeps cached data immutable |
| src/selectors/dashboard.ts | DKI/region/district/type KPIs, explicitly scoped marginal charts and raw category labels for future tile filtering |
| src/stores/dashboard.ts | Per-app centralized Vue state, resource states, filter actions, retry/refresh and stale-request protection |
| src/composables/useDashboard.ts | Typed injection key and consumer composable |
| src/utils/format.ts | Null-safe display conversion and consistent numeric formatting |
| tests/frontend-data.test.ts | 25 tests against actual publication files, plus isolated negative cases |
| package.json | Runs both test files; original dependencies/lockfile preserved |

## Loading and release integrity
`createSolarDataService()` defaults to `/data/`. Supply `baseUrl` for another public directory or a Vite base path; supply fetch/requestTimeoutMs for controlled testing. Timeout defaults to 15 seconds per request. Browser checksum validation requires Web Crypto on HTTPS or localhost.

`loadSummaries()` fetches the manifest first, then the four summary files and two crosswalks. It exposes the snapshot only after runtime validation and independent district→region, region→DKI, type→DKI and coverage reconciliation. There are no hardcoded production totals in the frontend implementation; expected totals in tests come from the validated reference contract.

`loadBoundaries('region' | 'district')` loads the requested collection on demand and checks its IDs, names, parents and join keys against the summary release. It validates normalized 2D MultiPolygon structure/coordinates and closed rings; it is not a source-side topology test. The other boundary collection is not downloaded implicitly.

Each publication file must match its manifest byte size and SHA-256. Every envelope must have compatible schema, units, generation scope, data version, producer and provenance. This detects stale/mixed assets; it does not authenticate a maliciously replaced manifest. No raw dataset or tile archive is fetched to derive statistics.

Concurrent requests share promises. Validated snapshots are deeply frozen and remain cached for this service instance. Rejections are evicted so load can retry. There is no automatic background refresh or percentage-derived statistic. `clearCache()` invalidates the service cache; use store.refresh() when shared reactive state must also be cleared atomically.

## Resource states and errors
The store exposes readonly data/status/error refs for summaries and independently for each boundary level. Status is idle/loading/ready/error; unavailable data is null. `load()` and `loadBoundaries()` return Promise<boolean>, capture errors for UI presentation and deduplicate requests. `refresh()` clears summaries/boundaries and service caches, loads the release again, and prevents superseded requests from publishing stale results. Compatible filters survive refresh; IDs absent from the new release reset.

An error does not expose partially validated data or fabricated zero KPIs. Structured SolarDataError values carry a code and, where relevant, resource/HTTP status. On a mixed-release error refresh the complete release after the deployment assets are consistent. Low-level service calls reject; store actions expose errors and return false.

## Statistical scopes
| Filter selection | KPI behavior |
|---|---|
| None | Exact DKI summary |
| Region only | Exact region summary, including MWp coverage |
| Region + district | Exact district summary; count coverage available, status-specific MWp unavailable |
| Type only | Exact DKI-wide type summary; count coverage available, status-specific MWp unavailable |
| Region + type, optionally district | status=unsupported; requiredAggregate=summary_kecamatan_jenis; no fallback KPI data |
| Unknown ID or district without its parent | status=invalid in pure selectors; store setters throw invalid-filter |

An available result contains scope and data. Its data retains MWp/GWh and counts, derives eligibility from all analyzed buildings, and distinguishes complete/partial/unavailable generation. Count and capacity coverage have separately labeled fields. Capacity coverage is explicitly unsupported for district/type scopes because no corresponding MWp breakdown exists; no proportional estimate is made.

Regional and type chart selectors explicitly advertise DKI scope. District comparisons advertise DKI or the selected parent region. These marginal charts do not imply support for an administrative × type intersection. Unknown administrative comparison IDs return invalid, not a misleading empty chart.

The type selection can remain combined with administrative filters for future map-only exploration, but combined KPIs have no data. `selectBuildingTypeLabels()` supplies every explicit raw label, including uppercase aliases, for a future tile filter; it does not build a layer/expression. Null type means no category predicate, not an empty matching set.

## Filter actions
Call setters after summaries are ready. The public filter object is readonly.

```ts
dashboard.setRegion(regionId)          // preserves a compatible district, clears an incompatible one
dashboard.setDistrict(districtId)      // must belong to the selected parent
dashboard.setBuildingType(typeId)      // canonical category ID, e.g. from typeOptions
dashboard.resetFilters()              // returns to DKI
```

Region/type options contain validated records; district options are empty until a parent is selected and then contain only that parent's districts. Choosing a type does not silently discard administrative selection to make statistics appear supported.

## Crosswalk and future tile adapter
`createNormalizers(data)` resolves region codes/raw/canonical names, parent-scoped district codes/raw/canonical names, and type IDs/raw labels. Unknown/ambiguous matches resolve to null; no fuzzy matching or invented code is used.

`adaptBuildingProperties(raw, data)` validates eligibility, string building_uid, administrative/type identities, finite numeric measurements and PVOUT consistency. It maps raw useable_m2 to usable_m2, assigns stable region_id/district_id/type_id, and normalizes omitted NoData yield/energy fields to null. Available zero yield/energy remains zero. Contradictory status/fields, numeric-string measurements, unknown categories and inconsistent parents are rejected. It does not recalculate areas, capacity or solar output and does not inspect/repair geometry.

Use `copyBoundaryGeoJson(boundaries)` once when handing data to a renderer. It returns mutable, MapLibre-compatible GeoJSON without the publication envelope metadata, preserving IDs and coordinates. Renderer mutations cannot affect cached geometry. Actual source/layer creation belongs to milestone 3.

## Vue consumption example (documentation only)
Provide a single store for the app. This data API example is now used by milestone 3 src/main.ts (with the Vite base URL supplied to the service):

```ts
import { createApp } from 'vue'
import App from './App.vue'
import { dashboardKey } from './composables/useDashboard'
import { createDashboardStore } from './stores/dashboard'
import { createSolarDataService } from './services/solarDataService'

const app = createApp(App)
const service = createSolarDataService({ baseUrl: `${import.meta.env.BASE_URL}data/` })
app.provide(dashboardKey, createDashboardStore(service))
app.mount('#app')
```

A future component can use the shared loading/filter state without owning another cache:

```vue
<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useDashboard } from '../composables/useDashboard'
import { formatNumber, mwpToGwp } from '../utils/format'

const { load, status, error, kpis } = useDashboard()
onMounted(() => { void load() })
const capacityGwp = computed(() => kpis.value.status === 'available'
  ? formatNumber(mwpToGwp(kpis.value.data.capacity_mwp))
  : null)
</script>

<template>
  <p v-if="status === 'idle' || status === 'loading'">Loading data…</p>
  <p v-else-if="status === 'error'">{{ error?.message }}</p>
  <p v-else-if="kpis.status === 'unsupported'">An exact aggregate is unavailable for this filter combination.</p>
  <p v-else-if="kpis.status === 'available'">{{ capacityGwp }} GWp modeled rooftop capacity</p>
</template>
```

For generation, use gwhToTwh and preserve null. Every future generation visualization still needs its PVOUT coverage caption. Format only at display time; selectors retain original measurement units and precision.

## Verification and handoff
- 41/41 tests pass: the original 16 plus 25 frontend tests. Cases cover real totals/all administrative and type records, integrity/version/schema errors, null/zero, ratios, lazy loading/caching/retries/timeouts, supported scopes, parent reset, Vue injection/isolation, refresh races, aliases, tile adaptation and renderer-owned geometry.
- Existing Vue, Vite configuration and strict data/test TypeScript checks pass.
- pnpm.cmd data:check passes with the original data version and output bytes; production build passes.
- Real fetch loading was verified through a temporary loopback Vite server, including 44 district geometries and null generation. That server was closed.
- An additional in-memory Vite browser bundle of the data/store/composable/adapter/format entry points passes, with Vue external and no output files written. This exercises code not yet imported by the starter app.
- Lint is not configured. No map/protocol, device interaction or remote Range/CORS test is claimed for this milestone.

Next: milestone 3 MapLibre and PMTiles integration, using the existing validated archive, an explicit Polygon predicate on every building rendering layer, correct worker delivery, and local HTTP Range tests. Source rights/model/topology, production performance and remote hosting remain separate gates. No archive regeneration, upload, deployment, commit or push occurred.
