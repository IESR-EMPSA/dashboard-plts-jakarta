# Building archive update: zoom 13–18

> Historical unrepaired conversion/discovery. Its activation blocker was resolved by the separate GeoPackage-verified repair. For current setup/deployment and the latest checks, use [README](../README.md), [deployment](DEPLOYMENT.md) and [repository review](PROJECT_REVIEW.md).

This document preserves the **initial unrepaired conversion and discovery**. The later user-approved repair is verified against the original GeoPackage and activates a separate z13–18 derivative. See [ARCHIVE_REPAIR_REPORT.md](ARCHIVE_REPAIR_REPORT.md) and [the exact correction ledger](ARCHIVE_ATTRIBUTE_REPAIRS.csv) for the current outcome. The unrepaired archive below remains unchanged and inactive.

## Outcome and activation gate

Initial local conversion completed. The unrepaired PMTiles has the requested zoom range and passes the official CLI's container verification. **That unrepaired file is not active in the application:** the supplied MBTiles has invalid numeric properties for 45 building IDs; 31 affect measurements consumed by building details. Activating the unrepaired file would make some inspections fail validation.

At the initial discovery gate, the previous archive, local endpoint and viewer zoom settings remained unchanged. The later verified derivative is documented separately. Nothing was uploaded, deployed, committed or pushed. No dependency was added, and no original source archive, public statistic, crosswalk or manifest was rewritten.

`AGENTS.md` requires documenting actual schema conflicts before adapting. Resolve this gate with either a corrected MBTiles export, or explicit approval for a separately derived repair using validated baseline attributes. Do not silently coerce the invalid strings, change dashboard totals, or overwrite the supplied source.

## Conversion and fingerprints

The source was supplied under `data/processed/`; it was read directly in that location rather than moved into or substituted for `data/raw/`.

| File | Bytes | SHA-256 |
|---|---:|---|
| `data/processed/buildings_eligible_pvout_z13_z18.mbtiles` | 1,697,189,888 | `c967856fb98f1b6d2cd3e3ab3c7c2166c78f0b8c72500dc9fda1ff13f4298fc1` |
| `data/processed/buildings_eligible_dki_z13-18.pmtiles` | 1,667,964,034 | `3a040bfe24e76678195d398704b33de4f82a1314cb67be2d2fdf2efd3d9ad474` |
| Previous input: `data/raw/buildings_eligible_pvout.mbtiles` | 793,317,376 | `abba6b0ceac927a9f8bba8cbd866b913e5ffc502399217d242467952704880eb` |
| Active output: `data/processed/buildings_eligible_dki.pmtiles` | 790,567,834 | `622e785b2dae369530976a1a0a7c1671b3f51589e4ef9c56abbfd47f3eecdb02` |

Official local CLI: **pmtiles 1.31.2**, commit `a3e4951ea6a0477b784c27c1dcbfd9c130878c5a`. The conversion wrote a separate output without an overwrite flag:

```powershell
.tools/pmtiles/pmtiles.exe convert data/processed/buildings_eligible_pvout_z13_z18.mbtiles data/processed/buildings_eligible_dki_z13-18.pmtiles
.tools/pmtiles/pmtiles.exe show data/processed/buildings_eligible_dki_z13-18.pmtiles --header-json
.tools/pmtiles/pmtiles.exe verify data/processed/buildings_eligible_dki_z13-18.pmtiles
node scripts/qa-archive-update.mjs
```

Do not rerun conversion over an existing output. The audit reads both inputs with SQLite `readOnly: true`, checks the original source fingerprint against the existing publication manifest, checks the previous PMTiles fingerprint, and verifies that the replacement source hash remains unchanged after scanning. It writes only ignored diagnostic output. A nonzero audit result is expected while the compatibility defects below remain.

Confirmed delivery metadata: gzip MVT, source layer `buildings_eligible_pvout`, minimum zoom 13, maximum zoom 18, bounds `[106.484, -6.3739, 106.974, -5.6473]`. The MBTiles declares EPSG:3857; the PMTiles header bounds are longitude/latitude. Attributes, attribution and vector-layer metadata are preserved. SQLite `quick_check` and official PMTiles `verify` pass.

## Exhaustive source compatibility checks

All **2,659** compressed tiles at overlapping zooms 14–16 are byte-identical to the previous MBTiles, including tile inventory. Every feature instance at added zooms 13, 17 and 18 was checked against the original z16 building registry. Canonical administrative/type IDs use the existing validated crosswalks; counts, PVOUT statuses and missingness are exact.

| Zoom | Tiles | Distinct building IDs | IDs with polygon geometry | Empty type-0 instances | IDs with property issues | Of these, IDs affecting the app |
|---|---:|---:|---:|---:|---:|---:|
| 13 | 63 | 1,470,399 | 1,470,399 | 14,204 | 0 | 0 |
| 14 | 161 | Unchanged baseline | Unchanged baseline | Historical QA | 0 added changes | 0 added changes |
| 15 | 541 | Unchanged baseline | Unchanged baseline | Historical QA | 0 added changes | 0 added changes |
| 16 | 1,957 | Unchanged baseline | Unchanged baseline | Historical QA | 0 added changes | 0 added changes |
| 17 | 7,340 | 1,470,399 | 1,470,399 | 15,039 | 45 | 31 |
| 18 | 27,648 | 1,470,399 | 1,470,399 | 15,595 | 1 | 1 |

There are 37,710 tiles in total. The affected z18 ID is also affected at z17: **45 unique affected buildings overall**, of which **31** have invalid application measurements. One valid z17 tile contains no features. Every added zoom preserves all 4,124 missing-PVOUT building IDs, with omitted energy remaining unavailable.

Offline distinct-building capacity and covered-energy checks agree with the authoritative summaries within `0.000001` MWp/GWh at each added zoom. These checks validate delivery compatibility only. Dashboard metrics continue to come exclusively from the unchanged static summaries in release `dki-solar-2edaec0ca52d964b`.

The largest compressed tile is 11,485,765 bytes at z13, below the existing 16 MiB development Range limit. This does not establish browser performance: rendering, memory, actual Range requests and zoom transitions still need browser QA after the source issue is resolved.

### Numeric precision and accepted aliases

Building `63749` has `area_m2: 64.54270761273801` in the original z16 tile and `64.54270761269436` in the new z13 tile, approximately `4.37e-11` m² apart. Building `98812` uses raw category `HUNIAN` at z16 and `Hunian` at z13; both are declared aliases for the same canonical category. These source observations do not require attribute rewriting.

The audit compares finite numeric measurements using the greater of absolute `1e-9` and relative `1e-12` tolerance; it records maximum differences per field. IDs, eligibility, canonical labels, PVOUT status and nullness remain exact checks. No measurements are rounded or recalculated. The cause of cross-zoom floating-point differences is not established.

## Blocking source attribute defects

All detected invalid numeric values are the **string `"17"`**, despite metadata declaring the properties numeric. At z17 they occur in XYZ tile `17/104473/67795`. The z18 example is `18/208947/135589`.

| Zoom | Field | Distinct affected IDs | Affected feature instances |
|---|---|---:|---:|
| 17 | `area_m2` | 28 | 28 |
| 17 | `useable_m2` | 3 | 3 |
| 17 | `Shape_Area` | 28 | 28 |
| 17 | `setback_m2` | 13 | 13 |
| 17 | `Shape_Length` | 2 | 2 |
| 18 | `area_m2` | 1 | 2 |
| 18 | `Shape_Area` | 1 | 2 |

Counts overlap between fields and zooms. The audit records 76 distinct zoom/ID/field issues across 78 field instances. `area_m2` and raw `useable_m2` are required by the existing building adapter; the other affected fields are not currently displayed.

Concrete example: building **`1097775`**, Cakung, Jakarta Timur, has original z16 `area_m2: 128.27499098191038` (number), but z17/z18 contain `area_m2: "17"` and `Shape_Area: "17"` (strings). Its `NAMBANG` is also the string `"17"`; that observation does not establish the export error's cause. Converting `"17"` to numeric `17` would still give an incorrect area.

An independent Protobuf wire-level inspection using only Node built-ins confirms the invalid strings in the supplied MBTiles. Compressed bytes extracted from the converted PMTiles for the example tiles match the source exactly. The conversion preserved this defect; it did not introduce or repair it. The existing strict frontend adapter is retained.

## Evidence and checks

Ignored local evidence:

- `data/processed/qa/archive-z13-18/archive-report.json`: full property issues with original/replacement values, per-zoom inventories, canonical groups, maximum differences, fingerprints and CLI results.
- `data/processed/qa/archive-z13-18/source-attribute-examples.json`: independent wire-level inspection and exact source/output payload comparisons for example tiles.
- Thirty representative converted tiles across all six zooms have byte-identical compressed payloads; sampled valid polygons decode, and sampled valid properties pass the existing adapter.

Application regression checks: **55/55 tests pass**, TypeScript checks pass, production build passes, and `data:check` confirms all nine publication outputs are unchanged. Vite retains its existing large-map-chunk warning. No new-archive browser integration is claimed; the viewer remains on the prior validated archive. No lint script is configured.

## Next action after source resolution

Prefer a corrected MBTiles export, retaining stable building IDs, modeled measurements, PVOUT missingness and the zoom 13–18 geometries. If a derived repair is explicitly approved instead, preserve both supplied archives, restore only verified bad attributes from the matching validated building IDs in a separate output, record every changed field, and repeat the compatibility audit. Do not infer values from solar formulas or substitute regional averages.

Only after the archive passes compatibility: update the local archive path and cache identity, PMTiles source min/max zoom, all zoom-dependent visibility/instruction text, and browser QA. Verify native z13/z18 tiles, overzoom, urban/island inspections, missing PVOUT, filters, Range/206 and both languages. Keep the proven Polygon predicate on both building layers. Conversion does not repair existing empty geometry instances; original GIS/topology and publication-rights checks remain separate gates.
