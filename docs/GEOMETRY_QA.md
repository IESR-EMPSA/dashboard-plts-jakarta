# Building archive geometry QA

> Historical geometry investigation. Original z14–16 measurements and isolation constraints below are preserved. For current setup/deployment and the latest checks, use [README](../README.md), [deployment](DEPLOYMENT.md) and [repository review](PROJECT_REVIEW.md).

Current delivery note: the separate z13–18 attribute repair is verified against the original GeoPackage in [ARCHIVE_REPAIR_REPORT.md](ARCHIVE_REPAIR_REPORT.md). It preserves every original MVT geometry byte, including empty type-0 instances, and retains the proven Polygon predicate. The z14–16 investigations below remain historical evidence and have not been relabeled as measurements of the new archive.

This document preserves the stage-C isolated archive diagnostic. The later milestone 3 application now uses its Polygon predicate on both building layers and has separate official-protocol/Range/browser evidence in LOCAL_DEMO.md. Remote hosting and source-geometry repair remain outside the completed local scope.

## Audit baseline and scope
Immutable source: `data/raw/buildings_eligible_pvout.mbtiles`, 793,317,376 bytes, 2,659 gzip MVT tiles, z14–16, source-layer `buildings_eligible_pvout`.

The read-only z16 audit found 1,968,491 feature instances and 1,470,399 distinct string building IDs, all eligible. There are 14,803 type-0 instances across 14,426 IDs; all affected IDs also have polygon-type instances. Sample geometry loading throws `feature has no geometry`. This alone establishes neither lost buildings nor safe renderer behavior.

## Approved investigation
Inspect encoded geometry, compare MBTiles/PMTiles tile content, and reproduce installed MapLibre behavior with an isolated local diagnostic where feasible. Record evidence/limitations. Do not add a map to the Vue app, silently drop instances, alter source, or retile. Conversion is a container change, not geometry repair. Present evidence and a proposal before any GeoPackage re-export.

## Conversion results
The official [Protomaps Windows x86_64 release v1.31.2](https://github.com/protomaps/go-pmtiles/releases/tag/v1.31.2) was obtained from the official repository into ignored `.tools/pmtiles/`. The download's SHA-256 matched GitHub's release-asset digest:

```text
a658baa4d7e55020aef6ca17bd9ff9faa1582671266b36f58c52db0ac8e785a1
```

CLI reports `pmtiles 1.31.2`, commit `a3e4951ea6a0477b784c27c1dcbfd9c130878c5a`. No system-wide installation or application dependency change was made. The local release record and full QA report record executable/source/output hashes.

Commands actually executed:

```text
.tools\pmtiles\pmtiles.exe convert data/raw/buildings_eligible_pvout.mbtiles data/processed/buildings_eligible_dki.pmtiles
.tools\pmtiles\pmtiles.exe show data/processed/buildings_eligible_dki.pmtiles
.tools\pmtiles\pmtiles.exe show data/processed/buildings_eligible_dki.pmtiles --header-json
.tools\pmtiles\pmtiles.exe show data/processed/buildings_eligible_dki.pmtiles --metadata
.tools\pmtiles\pmtiles.exe verify data/processed/buildings_eligible_dki.pmtiles
node scripts/qa-archive.mjs
node scripts/qa-browser.mjs
```

The existing output should be verified rather than overwritten blindly. The browser diagnostic uses the existing user-local Chrome, or CHROME_PATH, and creates/removes only its own ignored QA profile. It serves only an isolated diagnostic and extracted MVT on loopback; it does not integrate a map into Vue.

Output: **790,567,834 bytes / 753.9442386627197 MiB**, outside public/Git. PMTiles specification v3, MVT, gzip tile/internal compression, clustered, 2,659 addressed tiles/entries/contents, z14–16, unchanged bounds and source-layer. Header/metadata and official verify passed. Verify checks archive structure, not MVT geometry validity.

Source SHA-256: `abba6b0ceac927a9f8bba8cbd866b913e5ffc502399217d242467952704880eb`.

Output SHA-256: `622e785b2dae369530976a1a0a7c1671b3f51589e4ef9c56abbfd47f3eecdb02`.

All **28 representative compressed tile payloads** compared byte-for-byte equal, including all zooms, each region/coverage scope, largest tiles and affected identities. Native IDs and sampled attributes match too. Data version: `dki-solar-2edaec0ca52d964b`. The raw archive fingerprint still matches preprocessing provenance.

## All-zoom geometry investigation

| Zoom | Tiles | Feature instances | Distinct IDs | Type-0 instances | Affected IDs also having polygons |
|---|---:|---:|---:|---:|---:|
| 14 | 161 | 1,895,756 | 1,470,399 | 14,353 | 13,995 |
| 15 | 541 | 1,919,177 | 1,470,399 | 14,542 | 14,157 |
| 16 | 1,957 | 1,968,491 | 1,470,399 | 14,803 | 14,426 |

Every type-0 instance lacks the encoded geometry field. No polygon-type instance lacked that field. Every affected ID has a polygon-type instance at the same zoom; there are no unknown-only IDs. The complete ID count matches at each zoom. These are delivery QA counts, never dashboard statistics or proof of full geometry fidelity.

For example, UID `1742057` has no geometry in XYZ tile `16/52154/33825`, while polygon copies occur in `16/52154/33824` and `16/52155/33824`. Their shared bounding box lies outside the empty tile's interior. UIDs `1743468` and `1741673` show the same adjacent-copy/outside-interior pattern. This supports a clipping/buffer/export artifact explanation. The actual exporter algorithm and original GeoPackage are unavailable, so the precise originating cause is an inference, not proven history.

## Browser rendering and feature interaction
Tested installed **MapLibre 6.15.0**, **Chrome 155.0.8059.85**, software WebGL, fixed island and dense-Jakarta views at z16. No external basemap or production endpoint was used. The PMTiles branch extracts unchanged MVT through the official CLI; the MBTiles branch reads SQLite in read-only mode.

| Diagnostic view | Geometry style | Geometry errors | Distinct visible IDs | Hover / click |
|---|---|---:|---:|---|
| Island MBTiles | Unfiltered | 6 | 8 | Only remaining rendered features |
| Island PMTiles | Unfiltered | 6 | 8 | Same restricted result |
| Island MBTiles | Explicit Polygon predicate | 0 | 1,034 | Passed, affected UID 1742057 |
| Island PMTiles | Explicit Polygon predicate | 0 | 1,034 | Passed, same UID/attributes |
| Dense PMTiles | Unfiltered | 9 | 0 | No rendered target |
| Dense PMTiles | Explicit Polygon predicate | 0 | 5,260 | Passed, Available UID 265864 |

Unfiltered fill layers emit `feature has no geometry`; affected tile rendering fails. This hides buildings and prevents their selection, even though polygon copies exist in the archive. Conversion does not resolve it.

The tested diagnostic predicate is:

```json
["==", ["geometry-type"], "Polygon"]
```

It filters rendering explicitly before geometry loading; **it does not modify/drop archive contents**. With it, island MBTiles/PMTiles visible identity hashes and screenshot SHA-256 hashes match. DOM mouse events through MapLibre handlers exercise hover feature-state and click selection. Affected UID 1742057 retains 10.294087270364981 kWp, NoData and null generation; dense Available UID 265864 retains 8.970119480881841 kWp and 0.012433698105555037 GWh. Filtered cases have no map errors, page exceptions or missing assets. Screenshots were inspected.

## Future integration strategy and optional re-export proposal
Apply an explicit Polygon predicate to every building rendering layer, composed with administrative/type predicates. Use string building_uid and geometry-safe interactions on filtered rendered features. At stage C this was an isolated strategy. Milestone 3 now implements it on both building fill and outline and verifies actual application interaction without changing the archive; see LOCAL_DEMO.md.

For a clean source archive, first inspect the original exporter/GeoPackage, reproduce a boundary example, and change the tile export to omit only empty clipped geometries while preserving every eligible source identity and real polygon. Re-export to a new versioned file, then compare identity sets, geometry fidelity, attributes and summary compatibility at all zooms. This proposal needs approval; no re-export, tile regeneration or record removal has occurred.

## Evidence and limits
- Ignored `data/processed/qa/archive-report.json`: CLI/release hashes, header/metadata, full scan counts, adjacent-copy evidence and 28 payload comparisons.
- Ignored `data/processed/qa/browser-report.json`: browser/library versions, source/archive hashes, six cases, errors, image hashes and interaction evidence.
- Ignored `data/processed/qa/*-polygon.png` / `*-unfiltered.png`: diagnostic screenshots; scripts are retained to reproduce them.
- Human touch/accessibility review, exhaustive visual/topological fidelity, source-model validation and production performance remain pending. Synthetic DOM interaction is not a human usability test.
- The PMTiles JavaScript protocol, actual HTTP byte-range loading and remote CORS/hosting are **not** tested by this extracted-MVT diagnostic. No cloud upload or application MapLibre integration was performed.
