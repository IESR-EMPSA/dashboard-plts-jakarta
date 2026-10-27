# GeoPackage-verified building archive repair

> Preserved repair/source-verification evidence. No-upload/no-deployment statements describe the repair stage. For current setup/deployment and the latest checks, use [README](../README.md), [deployment](DEPLOYMENT.md) and [repository review](PROJECT_REVIEW.md).

Follow-up: manual functional UAT is approved. Current technical performance/stress findings, confirmed-issue fixes, 62-test verification and remaining production blockers are in [TECHNICAL_QA_REPORT.md](TECHNICAL_QA_REPORT.md). The archive and the repair evidence below remain unchanged; no new source/statistical correction was performed during technical QA.

## Result

The supplied zoom 13–18 archive has a separately repaired derivative. All 76 reported zoom/ID/field mismatches were verified against the original GeoPackage, rather than assuming that the previous tiles were correct. The application now points to the repaired PMTiles and uses native building zooms 13–18. Original sources, the initial converted archive and the previous working archive remain unchanged.

There are **74 unique building/attribute pairs**, represented by **76 zoom/building/attribute issues** and **78 clipped feature-field instances** across **45 buildings and three tiles**. The per-issue values and authoritative source columns are recorded in [ARCHIVE_ATTRIBUTE_REPAIRS.csv](ARCHIVE_ATTRIBUTE_REPAIRS.csv). This ledger is diagnostic documentation, not a dashboard statistics source.

The full browser regression passes, including real inspections of every affected building in both languages. No upload, deployment, commit or push is authorized or performed.

## Authoritative source verification

The user supplied `data/raw/buildings_eligible_pvout.gpkg` after the initial investigation. Read-only inspection found one eligible building feature layer:

| Property | Observed value |
|---|---|
| Layer | `buildings_eligible_pvout` |
| File bytes | 899,366,912 |
| SHA-256 | `a7670ecaafe53accc44f1457167295a0632228472167da9cbf9e71a370f4a6e8` |
| Geometry declaration | Polygon, Z enabled, EPSG:32748; no reprojection or geometry edit performed |
| Building identity | Integer `building_uid` in GeoPackage; corresponding exact decimal string in MVT |
| Rows / distinct IDs / eligible rows | 1,470,399 / 1,470,399 / 1,470,399 |
| Missing PVOUT | 4,124 |
| Capacity / covered annual generation | 18,627.76699292329 MWp / 25,117.476452319883 GWh; within the existing 0.000001 comparison tolerance |

SQLite `quick_check` passes. The five affected columns are declared `REAL`. Every replacement is an exact match to the GeoPackage record selected by `building_uid`, including fields that did not break the detail panel. IDs are validated as safe positive integers when joining to the GeoPackage; tile IDs remain strings and are not rewritten.

Before repair, every numeric instance of each affected attribute was inspected across the old z14/z15/z16 tiles and the new z13/z17/z18 tiles. All intact numeric values match the GeoPackage exactly, and every affected pair also has an intact z17 or z18 witness in the new archive. Thus the old archive is corroborating evidence, not the sole authority. No replacement was inferred from formulas, summary totals, geometry areas or averages.

The GeoPackage is an eligible-building source. It does not replace the authoritative all-building denominator or the existing CSV-derived statistical publication. Original model, topology and rights certification remain separate questions.

## Where the defect occurs

The invalid text `"17"` is already encoded in the new MBTiles MVT payloads. An independent Protobuf wire reader and MapLibre's installed vector-tile decoder agree on every affected feature. The corresponding payloads extracted from the original converted PMTiles are byte-identical to those in the supplied MBTiles. The GeoPackage contains numeric values at those IDs/columns.

This establishes a delivery defect between the authoritative source and the supplied MVT content, before PMTiles conversion. It rules out PMTiles conversion and MapLibre decoding as the cause of these mismatches. The precise exporter code, encoding step or archive-assembly step responsible cannot be identified without the original export workflow; no specific exporter bug is claimed.

The string dictionary entry `"17"` also has legitimate uses such as `NAMBANG`. It is not globally replaced or coerced to numeric 17.

## Exact repair scope

| Attribute | z17 field instances | z18 field instances | Total changed instances |
|---|---:|---:|---:|
| `area_m2` | 28 | 2 | 30 |
| `Shape_Area` | 28 | 2 | 30 |
| `setback_m2` | 13 | 0 | 13 |
| `useable_m2` | 3 | 0 | 3 |
| `Shape_Length` | 2 | 0 | 2 |

Changed XYZ tiles: `17/104473/67795`, `18/208947/135589`, `18/208948/135589`. Example: UID `1097775`, `area_m2`, is restored from string `"17"` to the authoritative numeric value `128.27499098191038`.

The repair copies the supplied MBTiles to a new exclusive output, appends verified double values to the existing MVT value dictionaries, and changes only the approved feature-tag value references. Existing keys/values are retained, preserving other features that refer to the legitimate string. The editor checks the expected feature index, exact string UID, column, prior string value, unique repair target and finite replacement before editing.

All geometry wire bytes, feature ID/type fields and unknown feature fields in the changed tiles are retained. Every unrelated feature remains byte-identical, and **all 37,707 other compressed tile payloads remain byte-identical**. Tile inventory, source layer, bounds, metadata and zoom coverage are unchanged. No geometry was regenerated, simplified, repaired or retiled.

## Output and rollback artifacts

| File | Bytes | SHA-256 |
|---|---:|---|
| `data/processed/buildings_eligible_pvout_z13_z18_repaired.mbtiles` | 1,697,239,040 | `6096b3b7f5cba2ac2182c59131fff0794543964ed065080ccb5a906e2742c6a0` |
| `data/processed/buildings_eligible_dki_z13-18_repaired.pmtiles` | 1,667,964,549 | `efa8073bafd6ebfec85911d7052b00ef49ccfea97d56502a28a12ac2b25d7d52` |

The original GeoPackage, original z14–16 MBTiles/PMTiles, supplied z13–18 MBTiles and initial unrepaired PMTiles have identical before/after SHA-256 fingerprints. The originals are not renamed, overwritten or deleted. Their fingerprints are in the ignored `repair-report.json`; the initial conversion evidence remains in [ARCHIVE_Z13_18.md](ARCHIVE_Z13_18.md).

An 84-file pre-activation application snapshot is preserved at `data/processed/qa/archive-z13-18/dashboard-rollback/`, with a `rollback-manifest.json` of file hashes. It includes application sources, public data, scripts/tests, docs, package/lock/config files and a credential-free environment example, without dependencies or private environment files. The previous working PMTiles remains `data/processed/buildings_eligible_dki.pmtiles`.

To roll back the viewer, restore the snapshot versions of `src/map/mapModel.ts`, `src/map/protocol.ts`, `src/components/map/SolarMap.vue`, and `scripts/dev/pmtilesPlugin.ts`; the old endpoint and z14–16 settings then reference the preserved previous archive. Restore the matching QA/test files if running its historical checks, and restart Vite. The complete snapshot is also available; no rollback has been executed.

## Validation

- Original and repaired SQLite checks and official PMTiles `verify` pass. The repaired output has gzip MVT, the original source layer and bounds, and native zooms 13–18.
- All 2,659 overlapping z14–16 tiles are unchanged. Exhaustive scans at added zooms 13, 17 and 18 preserve all 1,470,399 distinct IDs and polygon-represented IDs, with all 4,124 missing-PVOUT IDs and their unavailable energy fields retained.
- All ten measured numeric attributes, eligibility, canonical labels and PVOUT missingness pass the compatibility audit. There are zero remaining source attribute issues under the documented comparison tolerances. Thirty-three converted tile samples include the three repaired tiles and all repaired feature indices; compressed bytes match the repaired MBTiles.
- All 78 corrected field instances read from the repaired PMTiles equal their authoritative GeoPackage values exactly. All eleven numeric fields (including eligibility) on the affected feature instances also agree with the GeoPackage within the existing numerical tolerance.
- An additional exhaustive comparison through the official PMTiles JavaScript reader verifies **all 37,710 addressed MVT payloads**, byte for byte after decompression, against the repaired MBTiles. Together with the MBTiles preservation check, this covers all delivered geometry/identity/attribute bytes rather than relying solely on representative samples.
- Five new tests cover shared dictionary references, exact double precision/zero, opaque geometry and uint64 identity preservation, unrelated features/layers, stale/ambiguous repair requests, intact-numeric overwrite refusal and malformed wire data. **60/60 tests**, TypeScript, production build and `data:check` pass. All nine public outputs retain data version `dki-solar-2edaec0ca52d964b`. No dependency was installed; the existing Vite map-chunk size warning remains.
- Actual-app Chrome 155 browser QA passes: **46 real mouse inspections across all 45 affected IDs**, at z17.3 plus the affected z18 ID at z18.3, with source-matched numeric properties and correctly formatted Indonesian/English details. All 6 region, 44 district and 7 type summary selections reconcile in both languages. Unsupported intersections, null generation, islands, basemaps/fallback, fullscreen, mobile, responsive layouts and retry states also pass. There are zero JavaScript exceptions or console errors; the two failed requests are intentionally blocked basemap/summary recovery tests.
- The final full run records **75 bounded Range/206 responses**, totaling 40,140,888 response bytes across these representative tests. Every Content-Range references the repaired archive's exact 1,667,964,549-byte length. This is a test trace, not a production bandwidth benchmark. Statistical selections are explicitly tested with buildings hidden, then map and detail tests restore them.
- A separate focused run waits until all renderable canonical tile IDs are actually z13 or z18: native z13 renders 57,091 selected-area features and native z18 renders 547, with no runtime errors and 15 successful bounded Range responses. These viewport counts are diagnostic only. Observed wait times were approximately 6.1 s and 1.4 s under local software WebGL; they are not performance guarantees.

Earlier continuous software-WebGL runs encountered CDP timeouts. The final repaired-building interaction cases use a fresh page every 15 cases, as isolated browser cases, and the fullscreen test waits for its actual control transition. This verifies each interaction and complete functional regression; it is not a sustained-session or physical-device performance certification. The source repair and payload-preservation checks do not depend on those browser timings.

Source archives and QA remain ignored by Git. New frontend delivery configuration is centralized in `src/map/buildingArchive.ts`; the versioned local URL `/_local/buildings-z13-18-repaired.pmtiles` prevents reuse of the old local archive identity. The Vite plugin, source min/max zoom and visibility/instruction thresholds use the same settings. The Polygon/eligible predicates and static-summary data services are retained.

## Reproduction and evidence

These commands use the existing Node runtime, installed MapLibre decoder dependencies and local official CLI; no new GIS dependency is required:

```powershell
node scripts/investigate-archive-attributes.mjs
node scripts/repair-archive-attributes.mjs
node scripts/repair-archive-attributes.mjs --apply
node scripts/qa-archive-update.mjs --repaired
node scripts/qa-repaired-attributes.mjs
node scripts/qa-pmtiles-payloads.mjs
node scripts/qa-app.mjs --archive-update
node scripts/qa-app.mjs --archive-zooms-only
```

The repair script defaults to planning only and refuses to overwrite either repaired output. Do not rerun `--apply` on existing outputs. Original conversion QA evidence is required; the source GeoPackage must be available for verification. All source inputs are opened read-only and fingerprinted before/after the repair.

Local ignored evidence under `data/processed/qa/archive-z13-18/`: `attribute-investigation.json`, `repair-plan.json`, `repair-report.json`, `archive-repaired-report.json`, `repaired-source-check.json`, `payload-preservation-report.json`, `browser/app-report.json`, `browser-native-zooms/app-report.json`, final `delivery-acceptance.json` and screenshots. The focused zoom test checks renderable canonical tile IDs from the installed MapLibre 6.15 tile manager, ruling out temporarily retained parent/child tiles. `repair-report.json` records the repair creation phase, each of the 78 instances, before/after values, tile/index, dictionary reference changes and authoritative file/layer/ID/column; the later acceptance report records successful activation gates. The CSV ledger groups duplicate clipped instances into the original 76 reported issues.

Remaining limitations: exact exporter root cause remains unavailable; original solar-model/topology/rights checks and remote hosting are not certified. Existing empty type-0 geometry instances are preserved and excluded by the proven Polygon predicate. Dense z13 tiles remain relatively large; software-WebGL local checks do not certify physical-device or production-network performance.
