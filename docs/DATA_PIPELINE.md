# Reproducible publication data

Current building delivery is a separate GeoPackage-verified z13–18 derivative; see [ARCHIVE_REPAIR_REPORT.md](ARCHIVE_REPAIR_REPORT.md). The original statistical preprocessing inputs, producer and all nine publication outputs below are unchanged. Delivery-only repair fingerprints and per-field provenance are recorded separately; they do not replace the original publication manifest.

## Commands and environment
Use the existing Node 24.19.0 runtime and pnpm installation. Scripts use Node's native TypeScript support and built-in test/crypto/filesystem APIs; no preprocessing dependency was installed. This is offline preparation, not an application backend.

```text
pnpm.cmd data:prepare
pnpm.cmd data:check
pnpm.cmd test
pnpm.cmd typecheck
pnpm.cmd build
```

`data:prepare` validates every input and compiles all outputs in memory before writing `public/data/`. `data:check` recompiles, validates the exact output inventory and compares bytes without writing. Run from any working directory; script paths resolve against the repository. Invalid input stops processing with context. No raw file is modified.

## Inputs and crosswalks
Eight source CSV/GeoJSON files and the building MBTiles reside under ignored `data/raw/`. Only CSVs provide statistics. The archive is fingerprinted for release compatibility and is never used to calculate summary totals.

- `data/crosswalks/admin.json`: six explicit raw-region/code/canonical-name mappings and five region-scoped district-name aliases. District codes come from the supplied geometry; all 44 code/name joins are emitted for review. These codes are unique in the supplied files, not independently certified against an official register.
- `data/crosswalks/building-types.json`: seven canonical category IDs/names with explicit accepted raw labels, including HUNIAN, NON HUNIAN and PEMERINTAHAN. Unknown/ambiguous labels fail; no fuzzy matching.
- Raw `useable_m2` → normalized detail `usable_m2` is implemented by `src/services/normalization.ts` and consumed by milestone 3 building details. Preprocessing does not recalculate building attributes or rewrite tiles.

## Generated files and schemas
Data-only TypeScript interfaces are in `src/types/solar.ts`. All JSON measurements are real export values. Counts are integers; capacity is MWp, generation is GWh/year, and ratios are 0–1. `annual_gwh` is nullable; zero is retained when it is a known value.

| Output in public/data | Shape / record count |
|---|---|
| summary_wilayah.json | metadata, overall, regions[6] |
| summary_kecamatan.json | metadata, districts[44] |
| summary_jenis.json | metadata, types[7] |
| summary_pvout_coverage.json | metadata, overall, regions[6]; merges the seven source status rows |
| admin_kabkot.geojson | FeatureCollection, metadata, 6 code-ID MultiPolygons |
| admin_kecamatan.geojson | FeatureCollection, metadata, 44 code-ID MultiPolygons |
| admin_crosswalk.json | metadata, regions[6], district_aliases[5], districts[44] |
| building_type_crosswalk.json | metadata, categories[7] with accepted raw_labels |
| data_manifest.json | metadata, validation results, hashes/sizes/counts of the eight other outputs |

Summary measures: total_buildings, eligible_buildings, eligibility_rate, capacity_mwp, annual_gwh, pvout_available, pvout_missing, pvout_coverage. Region and overall records additionally provide capacity_with_pvout_mwp, capacity_without_pvout_mwp and pvout_capacity_coverage from the coverage CSV. District/type records deliberately do not invent those MWp breakdowns.

Region IDs are KDPKAB strings. District IDs are KDCPUM strings, with region_id, canonical names and `wilayah|kecamatan` join_key. Type IDs are explicit stable slugs. Boundary properties contain only IDs, canonical names and (for districts) join_key; properties such as WIADKK are not carried into publication derivatives.

Boundaries preserve every position and polygon part. The transformation removes zero Z coordinates and the legacy CRS member, normalizes exterior/interior winding, and removes unused properties. It does not simplify, reproject, repair topology or change statistical assignment. Tests compare complete position multisets against raw inputs.

## Determinism and provenance
Each output carries schema_version, data_version, producer name/version/hash, units, generation scope, verification limits and source fingerprints. Every fingerprint records relative path, byte size, SHA-256 and role. The building archive's role is visualization only. No credentials, absolute user paths or wall-clock timestamps are published.

The data version hashes ordered input/crosswalk fingerprints and the producer fingerprint. The producer fingerprint covers preprocessing source, CLI source and publication types. Identical input/transform bytes produce identical output bytes. Crosswalk changes also change the version. The manifest hashes every other output; it excludes itself to avoid recursive hashing.

Do not edit generated files by hand. Change reviewed inputs/mappings/code only in an approved data stage, then regenerate and validate. The completed PMTiles conversion report records the MBTiles hash and data version so the separately stored archive can be matched to these summaries; see GEOMETRY_QA.md and the ignored `data/processed/qa/archive-report.json`.

## Validation and limits
Checks cover exact schemas/counts, safe nonnegative integers, strict finite numerics, valid quantiles/statistic means, explicit status values, null/PVOUT consistency, denominator ratios, six-region/five-alias crosswalk completeness, 44 unambiguous district joins, code parents, geometry structure/coordinates, independent district→region/type→DKI reconciliation and reference totals. Tolerance is 0.000001 MWp/GWh; counts are exact.

Confirmed totals: 1,747,249 all analyzed, 1,470,399 eligible, 1,466,275 with PVOUT and 4,124 missing; 18,627.76699292319 MWp and 25,117.47645231979 covered GWh/year. Kepulauan Seribu Utara retains null annual GWh. Aggregate ratios use summed counts, not mean percentages; all-null generation remains null.

Sixteen automated tests exercise actual exports, null versus zero, malformed CSV/numerics, aliases, complete geometry-position preservation, invalid schemas/CRS, duplicate/unknown joins, inconsistent totals and deterministic output hashes. Artificial mutations are in-memory test cases and never become public data.

File-side validation does not validate the original solar model, full geometry topology, source vintage/rights or browser rendering. Exact region/district × type and capacity-range statistics need additional aggregates; see DATA_CONTRACT.md. Publication remains gated separately.
