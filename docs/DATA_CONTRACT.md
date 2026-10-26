# Data contract and modeling semantics

## Key invariants (export arithmetic validated 2026-10-26; original GIS/model QA pending)
| Metric | Expected value |
|---|---:|
| Total building polygons (all statuses) | 1,747,249 |
| Eligible polygons in PV map | 1,470,399 |
| Ineligible buildings (only in denominator/source; not on map) | 276,850 |
| Eligibility rate | approximately 84.16% |
| Modeled installable capacity | 18,627.76699292319 MWp (approximately 18.627767 GWp) |
| Modeled annual energy **where PVOUT exists** | 25,117.47645231979 GWh/year (approximately 25.117476 TWh/year) |
| Eligible buildings with PVOUT | 1,466,275 |
| Eligible buildings without PVOUT | 4,124 |
| Kab/kota | 6 |
| Kecamatan | 44 |
| Building type groups | 7 |

The 4,124 missing-PVOUT buildings are in Kepulauan Seribu in the current data. The absence of PVOUT **does not imply zero annual generation**. Region-wide coverage by MWp is higher than coverage within Kepulauan Seribu. Coverage ratios have distinct denominators (buildings vs MWp): label them correctly.

## Source datasets and generated publication artifacts
| Input (QGIS export) | Geometry / rows | Purpose | Generated output |
|---|---|---|---|
| `data/raw/buildings_eligible_pvout.mbtiles` | 793,317,376 bytes; gzip MVT; 2,659 tiles, z14–16 | Existing building delivery source | Ignored `data/processed/buildings_eligible_dki.pmtiles`, outside public/Git |
| `data/raw/buildings_eligible_pvout.gpkg` | 899,366,912 bytes; 1,470,399 unique eligible IDs; Polygon Z declaration, EPSG:32748 | Authoritative per-building attributes for approved delivery repair; all affected fields verified exactly | Immutable/private; see ARCHIVE_REPAIR_REPORT.md |
| Original all-building GeoPackage | Not present in repository | Original denominator/model QA | Do not expose raw files |
| `data/processed/buildings_eligible_pvout_z13_z18.mbtiles` | Supplied z13–18 archive; 37,710 tiles | Original replacement, with documented source MVT attribute defects | Preserved unchanged with its initial PMTiles conversion |
| `data/processed/buildings_eligible_pvout_z13_z18_repaired.mbtiles` | Separate attribute-only derivative, same geometry/IDs/zooms | GeoPackage-verified delivery; 76 reported issues restored | Active ignored `data/processed/buildings_eligible_dki_z13-18_repaired.pmtiles` |
| `data/raw/admin_kabkot_dki.geojson` | 6 MultiPolygons; 4,780,245 bytes | Kab/kota map + labels | `public/data/admin_kabkot.geojson` |
| `data/raw/admin_kecamatan_dki.geojson` | 44 MultiPolygons; 7,139,786 bytes | District boundaries | `public/data/admin_kecamatan.geojson` |
| `summary_eligibility_dki` | 6 records | Counts, eligible rate | `summary_wilayah.json` (merged) |
| `summary_capacity_dki` | 6 records | MWp | `summary_wilayah.json` (merged) |
| `summary_generation_dki` | 6 records | GWh | `summary_wilayah.json` (merged) |
| `summary_pvout_coverage` | 7 records | Available vs NoData by city and MWp | `summary_pvout_coverage.json` |
| `summary_kecamatan_dashboard` | 44 records | District KPIs | `summary_kecamatan.json` |
| `summary_jenis_dashboard` | 7 records | Type KPIs | `summary_jenis.json` |
| Future `summary_kecamatan_jenis` | <=308 combinations if all types in all 44 districts | Exact combined district + type filters | `summary_kecamatan_jenis.json` only when created |

All six summary inputs in this table exist as `.csv` files under `data/raw/`. Output generation status is tracked in `IMPLEMENTATION_PLAN.md`; public contracts and provenance are documented in `DATA_PIPELINE.md`. Raw files are immutable. JSON statistics never come from vector tiles.

## Building tile fields
Desired properties (map detail features):
- `building_uid`: string in the existing archive; retain as identity and verify future MapLibre promoteId behavior. Raw `fid` mixes strings/numbers.
- `WADMKK`, `WADMKC`: administrative names; consider normalized IDs later.
- `jenis_group`: one of `Hunian`, `Non Hunian`, `Tidak diketahui`, `Pemerintahan`, `Kelistrikan`, `Masjid`, `Mushola`.
- `area_m2`, raw **`useable_m2`**: modeled footprint and usable area, m². Explicitly map raw `useable_m2` to normalized detail `usable_m2`, without recalculating values.
- `capacity_kwp`, optional `capacity_mwp`: estimated peak capacity.
- `pvout_1`: specific PV energy yield in kWh/kWp/year; omitted in the current MVT when NoData; normalize to null.
- `annual_kwh`, `annual_gwh`: modeled electricity; omitted when PVOUT missing; normalize to null, never zero.
- optional `pvout_status`: `Available` or `NoData`.

Do not blindly copy all GeoPackage fields; keep tile attributes small. Confirm the actual property names in the archive, its zoom coverage, and whether 1,470,399 features remain represented at tested high zoom. MVT can clip features across tile boundaries: never derive unique totals from tile geometries.

Observed source-layer is `buildings_eligible_pvout`, metadata CRS EPSG:3857, bounds `106.484,-6.3739,106.974,-5.6473`. z16 audit found 1,470,399 distinct string IDs, all eligible and polygon-type represented, plus 14,803 type-0 instances across 14,426 also-polygon IDs. Sample geometry decoding throws `feature has no geometry`. See `GEOMETRY_QA.md`; conversion must preserve contents and does not repair geometry.

Raw type labels also include `HUNIAN`, `NON HUNIAN`, `PEMERINTAHAN`; map these explicitly to Hunian, Non Hunian, Pemerintahan using `data/crosswalks/building-types.json`. The seven summary categories are already canonical. Optional raw fields include JENBANG, NAMBANG and jenis_std; OBJECTID and administrative labels are strings; area/capacity/eligible measurements are numeric.

## Modeling for user-facing methodology (display only)
- Eligibility determined during QGIS preprocessing (1 m inward setback and minimum available rooftop area threshold of 28 m², per agreed method; ensure precise recorded algorithm before publishing).
- RUF = 0.33 **applied to original eligible building footprint** to derive `usable_m2`.
- Area conversion assumption = 4.8 m²/kWp.
- `capacity_kwp = usable_m2 / 4.8` for eligible features.
- `capacity_mwp = capacity_kwp / 1,000`.
- `annual_kwh = capacity_kwp × pvout_1` where PVOUT exists.
- `annual_gwh = annual_kwh / 1,000,000` where PVOUT exists.
- Annual generation is a **model estimate**, not metered production.
- Solar resource: Global Solar Atlas PVOUT GeoTIFF currently based on 2019 dataset; verify year, version, licensing, and metadata in publication docs.

## Summary JSON schemas — use normalized public contracts
`summary_wilayah.json` example shape (values omitted intentionally):
```json
{
  "metadata": { "coverage": "DKI Jakarta", "unitCapacity": "MWp", "unitEnergy": "GWh/year" },
  "regions": [
    { "id": "<stable-id>", "wilayah": "<name>", "total_buildings": null, "eligible_buildings": null, "eligibility_rate": null, "capacity_mwp": null, "annual_gwh": null, "pvout_available": null, "pvout_missing": null }
  ]
}
```
`summary_kecamatan.json` record:
```json
{
  "wilayah": "<kabkot>",
  "kecamatan": "<district>",
  "join_key": "<wilayah>|<kecamatan>",
  "total_buildings": null,
  "eligible_buildings": null,
  "eligibility_rate": null,
  "capacity_mwp": null,
  "annual_gwh": null,
  "pvout_available": null,
  "pvout_missing": null,
  "pvout_coverage": null
}
```
Example values are **schema placeholders**, not valid measurement values. Actual values must come from verified QGIS tables. Where no generation data exists, keep numeric `null` and convey missingness separately.

## Validation / invariants
- Sum `total_buildings` across district summaries = 1,747,249.
- Sum `eligible_buildings` = 1,470,399.
- Sum `pvout_available` = 1,466,275; sum `pvout_missing` = 4,124.
- Sum `capacity_mwp` ≈ 18,627.766993; sum covered `annual_gwh` ≈ 25,117.476452. Reference and cross-export tolerance: 0.000001 in the stated units; counts exact. Actual export totals reconcile within 1e-9. Never round intermediate calculations.
- Exactly 44 district records, no missing admin names; special district with unavailable PVOUT should retain `annual_gwh: null`, not 0.
- Exactly 7 building-type records with valid totals and category names.
- `pvout_coverage` from existing district/type summary is **count-weighted** (`pvout_available / eligible_buildings`), while capacity-weighted coverage must be computed from `summary_pvout_coverage` MWp sums.
- Distinct building `building_uid` is stable and unique in source export. Test representative tile attr/feature completeness, do not assume tiling preserves one global unique geometry per tile.

## Actual CSV schemas and null semantics
Regional eligibility/capacity/generation columns: `fid,WADMKK,count,unique,min,max,range,sum,mean,median,stddev,minority,majority,q1,q3,iqr`. Coverage adds text `pvout_status` (Available/NoData). Names/status are strings; row IDs/counts are integers; measurements are finite numbers. CSV itself is untyped; parse quoted fields correctly. `unique` counts distinct measurement values, not buildings.

| Table | `count` | `sum` | `mean` |
|---|---|---|---|
| Eligibility | All analyzed | Eligible | Eligibility ratio |
| Capacity | Eligible | MWp | MWp per eligible building |
| Generation | Covered eligible | Covered GWh/year | GWh per covered building |
| Coverage | Eligible in region/status | MWp in region/status | MWp per status building |

District CSV columns: `fid,kecamatan,wilayah,total_buildings,eligible_buildings,eligibility_rate,join_key,capacity_mwp,pvout_available,annual_gwh,pvout_missing,pvout_coverage`. Type columns are the same measurements with `jenis_group`, without district/region/join_key. Ratios are 0–1, never pre-scaled percentages.

The only blank numeric cell is annual GWh for Kepulauan Seribu Utara: 2,742 eligible, 26.9989513380793 MWp, zero PVOUT-covered buildings, annual GWh **null**. Selatan has 1,757 eligible, 375 covered, 1,382 missing and 5.10158899331824 covered GWh/year. Missing capacity across Seribu is 40.1519982674474 MWp. Overall coverage is approximately 99.719532% by count and 99.784451% by capacity. Null-aware energy rollups with no covered observations remain null; real zero generation remains zero.

## Administrative crosswalk and normalized geometry
Both GeoJSONs are CRS84 / WGS84 longitude-latitude degrees, XYZ with Z=0; all features are MultiPolygon. Structural checks passed; full topology/overlap and original spatial-assignment QA remain pending. Raw ring exteriors are clockwise. No top-level feature IDs exist. String codes `KDPKAB` (region) and `KDCPUM` (district) are unique within these exports; independent code certification is pending.

Explicit six-region crosswalk: the five `Kota Administrasi Jakarta ...` names map to `Jakarta ...`; `Administrasi Kepulauan Seribu` maps to `Kepulauan Seribu`. Do not use `WIADKK`: Seribu contains an unrelated Jakarta Utara label there. District joins use region plus these five aliases:

| Raw geometry district | Canonical summary district |
|---|---|
| Pal Merah | Palmerah |
| Setiabudi | Setia Budi |
| Pulogadung | Pulo Gadung |
| Kramatjati | Kramat Jati |
| Kepulauan Seribu Selatan. | Kepulauan Seribu Selatan |

All 6 regions/44 districts join one-to-one after explicit mapping. Reject unknown labels, duplicate codes/keys and ambiguous matches; no fuzzy matching. Normalize publication derivatives to code feature IDs, minimal properties, 2D coordinates and counterclockwise exteriors, without simplification/reprojection. Preserve raw geometry files. Administrative Shape_Area/Shape_Length attributes are not building m². Raw kab/kota uses Shape_* spelling, district uses SHAPE_*; unused fields contain spaces or nulls. Metadata suggests mixed boundary vintages; do not infer one source date from file timestamps.

## Public contract and filter limits
Data-only types live in `src/types/solar.ts`; `DATA_PIPELINE.md` documents the nine generated envelopes/hashes. Counts and capacity are nonnullable; annual GWh is nullable. Preserve units. Deterministic outputs use content/transform hashes, not wall-clock generation timestamps. Production data contains no fixtures.

Exact DKI, region-only, district-only and DKI type-only statistics are supported. Region × type and district × type require a new all-building-source aggregate (at most 308 district/type combinations) with all/eligible counts, capacity, covered generation, PVOUT counts and preferably available/missing MWp. Capacity-range statistics require additional aggregates. District/type summaries do not explicitly provide status-specific MWp. Do not estimate intersections from marginal proportions.

## Required decisions before publication
- Are both data boundary layers cleared and published with rights to redistribute?
- Exact field schema, source layer names, geometry validity and actual contents of PMTiles.
- Should annual GWh have explicit coverage footnote for every relevant visualization?
- Are administrative names enough, or should we add stable codes for accurate joins?
