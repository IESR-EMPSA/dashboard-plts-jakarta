# Technical QA and production-readiness assessment

> Historical post-UAT technical assessment. Its then-pending hosting status has been superseded by deployment; benchmark limitations still apply. For current setup/deployment and the latest checks, use [README](../README.md), [deployment](DEPLOYMENT.md) and [repository review](PROJECT_REVIEW.md).

Date: 2026-10-26. Manual functional UAT is approved by the user. This follow-up did **not** replay the full functional UAT or redesign the interface.

## Assessment

**Local correctness/build gates pass. Public production deployment remains blocked by hosting integration and performance/publication sign-off.** The final hardware stress run completes without a critical rendering, transport or sampled-data failure. However, dense z13 data remains expensive, a previous continuous hardware run became unresponsive, and the memory/bandwidth tradeoff requires validation on the intended deployment and devices. This is not an unconditional performance certification.

No deployment, upload, commit, push, dependency installation, statistical regeneration or archive modification was performed.

## Confirmed issues and changes

### Expensive empty-map checks

The previous idle handler queried every visible building just to determine whether the view was empty. Instrumentation measured 60 full-viewport queries over a 20-stop baseline, including repeated hover/selection repainting. Individual results reached 101,551 features; total query time was 13,238.7 ms and the slowest query took 1,128.5 ms.

`src/map/renderedFeatures.ts` now checks center-first 128 px screen cells and stops on the first match. For an empty view, the cells cover the full viewport, including partial edge cells. `SolarMap.vue` invalidates the existence check on viewport/content/appearance changes rather than repeating it for unchanged repaints. This changes only the cost of the existing empty-state decision; it does not calculate dashboard metrics from tiles.

| Same 20-stop software-WebGL scenario | Before | After query fix |
|---|---:|---:|
| Full-viewport queries | 60 | 0 |
| Existence-query time, entire run | 13,238.7 ms | 527.7 ms |
| Largest individual existence query | 1,128.5 ms | 266.8 ms |
| Sampled peak main-thread JS heap | 818.2 MiB | 165.1 MiB |
| Total run duration | 90.6 s | 84.9 s |

The measured query-time reduction is approximately **96%**. These are single local before/after runs, not a universal speed guarantee. The remaining cold tile decoding/rendering cost is distinct from this fixed allocation problem.

Two new automated tests verify sparse/tiny matches at every viewport edge, fractional viewport dimensions, empty/hidden views, bounded query areas and early termination. Technical browser checks verify a real empty-water view, return to a populated view, and zero rescans during ten unchanged repaints.

### Native cache retention and hardware responsiveness

With the query fix but the original dynamically sized cache, a continuous AMD/D3D11 run stopped responding to a `Runtime.evaluate` probe for more than 20 s at the fifteenth dense-z13 visit, after 140 completed stops. The last cycle retained 60 building tiles with approximately 2.59 GiB aggregate browser private commit. No JavaScript exception or MapLibre source error had been recorded, but the renderer was too unresponsive to collect a final probe. This attempt is **not** counted as a pass.

`maxTileCacheZoomLevels: 2` now bounds viewport-based retention. This parameter controls the cache-size estimate, not which zoom levels are available. At the tested desktop size the per-source cache limit becomes 24 tiles instead of 60. Source zooms 13–18, geometry, IDs, filters and approved UI behavior remain unchanged. The final five-minute hardware run completes 150 stops and rapid-navigation recovery without reproducing that stall.

This is an observed mitigation, not proof that cache retention was the sole cause of the earlier timeout or that every GPU/driver is certified. Smaller decoded caches also increase refetching; the bandwidth consequence below is part of the release assessment.

## Stress method and evidence

Dedicated harness: `scripts/qa-technical.mjs`, using the existing Chrome installation, Node, CDP and Windows PowerShell. No browser dependency was added. It visits dense western Jakarta at z13/14/16, repaired Cakung at z17/18, central/southern districts, Kepulauan Seribu at z16/18 and the overview. It sends real hover events, then 24 rapid camera changes and recovery/empty-state checks.

There are **no page reloads and no forced garbage collections during navigation**. One diagnostic main-thread GC runs after the workload. Main-thread JS heap, isolated browser-process memory, cache occupancy, timer drift, long tasks, WebGL loss, source errors, actual Range requests and sampled property validity are recorded. Other personal browser processes are not inspected or modified.

Environment: Windows, Chrome 155, Node 24.19.0, 8 logical CPUs, 15.29 GiB system memory. Available memory varied substantially between runs, approximately 0.36–1.95 GiB at startup. The software run explicitly uses SwiftShader. The hardware run reports **AMD Radeon 820M / ANGLE Direct3D11**, with WebGL enabled.

| Completed continuous run | Software/query fix, original cache | Final AMD/D3D11, bounded cache |
|---|---:|---:|
| Elapsed time including setup/final probes | 335.8 s | 322.6 s |
| Planned navigation stops | 120 | 150 |
| Rapid camera changes afterward | 24 | 24 |
| Navigation settle p95 | 1,422 ms | 4,283 ms |
| CDP responsiveness probe p95 | 22 ms | 2 ms |
| Main-thread 100 ms timer drift p95 | 57.9 ms | 13.7 ms |
| Longest recorded main-thread long task | 1,149 ms | 277 ms |
| Sampled peak main-thread JS heap | 197.9 MiB | 175.5 MiB |
| Final diagnostic-GC JS heap | 134.5 MiB | 43.3 MiB |
| Sampled peak aggregate browser private commit | 1,892.1 MiB | 2,488.7 MiB |
| Final aggregate private commit | 1,580.9 MiB | 1,836.1 MiB |
| Observed cached building tiles | 35–42 after warm-up | 24 at the configured limit |
| Runtime / MapLibre / WebGL-context-loss errors | 0 / 0 / 0 | 0 / 0 / 0 |
| Validated runtime property samples | 96, including 24 NoData | 120, including 30 NoData |

These are different renderers/cache configurations, not an apples-to-apples GPU performance comparison. The software soak preceded the final cache reduction; the final configuration's extended run is the hardware column. Camera-settle time includes a 300 ms animation and polling with a 400 ms initial wait; it is not pure HTTP latency. CDP probe time is not an INP/Core Web Vitals measurement.

No sustained unbounded memory growth was observed within the completed runs. Hardware cache occupancy stays at 24; main-thread heap rises and falls with natural GC, while native/driver/process memory fluctuates. This does not prove absence of all long-lived leaks. Private commit includes workers, GPU/renderer and utility-process allocations and is not resident RAM or JS heap. Working-set sums may count shared pages more than once; unavailable/zero OS samples are excluded from comparisons.

## HTTP Range and tile loading

All observed archive GET responses are bounded **206** responses with a stable ETag and the accepted 1,667,964,549-byte file length in `Content-Range`. No whole-file GET, unexpected transport error or ETag mismatch was recorded. Maximum observed Range lengths remain below the 16 MiB local limit. The dataset's largest compressed tile is 11,485,765 bytes at z13.

| Range observation | Software soak | Final bounded hardware soak |
|---|---:|---:|
| Archive responses | 208 | 1,670 |
| Local TTFB p95 | 88.4 ms | 4.4 ms |
| Completed response wire bytes, including HTTP overhead | 61,725,837 | 1,042,143,698 |
| Advertised Content-Length sum | 136,237,249 | 1,064,205,144 |
| Canceled responses (`net::ERR_ABORTED`) | 78 | 172 |
| Unexpected archive failures | 0 | 0 |

Advertised lengths include aborted requests and must **not** be described as actual transferred bytes. Completed-wire totals exclude partially transferred canceled responses, so are not a complete accounting of all network bytes. Rapid navigation intentionally cancels obsolete requests.

The final hardware run contains 1,440 exact repeated ranges, approximately 980.9 MB of advertised repeated content. Bounded decoded-cache retention trades native memory for refetching. Installed `pmtiles` 4.5.0 `FetchSource` deliberately selects `cache: 'no-store'` on Windows Chromium, independently of server freshness headers; this policy was verified in the installed source and left intact. Repeated requests are therefore not evidence of a broken 206 endpoint by themselves, but **the measured bandwidth is a real production-budget concern**. No CDN/browser-cache efficiency claim is made for an unconfigured remote host.

## Data and final automated verification

- The active repaired PMTiles SHA-256 remains `efa8073bafd6ebfec85911d7052b00ef49ccfea97d56502a28a12ac2b25d7d52`; official container verification passes. Its unchanged fingerprint retains the earlier exhaustive 37,710-payload and exact GeoPackage-repair evidence in [ARCHIVE_REPAIR_REPORT.md](ARCHIVE_REPAIR_REPORT.md). Those repairs were not rerun or rewritten.
- Runtime samples pass the existing typed adapter, with NoData generation remaining null. The proven Polygon/eligible predicate is retained on both building layers.
- **62/62 automated tests**, all configured TypeScript checks, `data:check` and the production build pass. All nine published outputs remain unchanged at data version `dki-solar-2edaec0ca52d964b`.
- No lint script is configured. Vite retains the existing large-chunk warning: the lazy map chunk is approximately 1,111.32 kB / 308.09 kB gzip, with a separate 516.71 kB map worker. This warning alone is not treated as a failed build.
- Build/artifact inspection excludes private GIS archives, QA output and development-only map diagnostics from release assets. The instrumentation runs only in the QA browser, not in product code.

## Remaining production gates

1. **Remote archive integration:** confirm the storage candidate and a versioned public PMTiles URL, set the build-time `VITE_BUILDINGS_PMTILES_URL`, and validate frontend-origin CORS, strong/stable ETags, correct partial responses, content length/encoding and caching behavior. The local Vite endpoint is development-only and is absent in preview/production. No remote URL or deployment was tested.
2. **Network/memory budgets and broader technical verification:** agree target devices, browser/GPU coverage and acceptable cold/warm latency, memory and bandwidth. Test the final bounded cache over the intended remote network, including constrained/mobile devices and longer/repeated sessions. The earlier unexplained hardware timeout, approximately 2.43 GiB private-commit peak and approximately 1.04 GB of completed responses in the final stress scenario prevent unconditional performance sign-off. Full functional UAT remains approved and need not be repeated for this gate.
3. **Publication clearance:** existing source vintage, redistribution/imagery rights and original GIS/model/topology verification remain documented external gates. Delivery-byte integrity and the repaired attributes pass; source-model certification is not implied by this technical QA.

The specific original MVT-export defect remains a future regeneration concern; its verified repair is not an unresolved numerical error in the active archive.

## Reproduction and changed files

Use a new label to retain prior evidence:

```powershell
node scripts/qa-technical.mjs --label=verify-hardware --cycles=4 --minutes=5 --gpu=default
node scripts/qa-technical.mjs --label=verify-software --cycles=4 --minutes=5 --gpu=software
pnpm.cmd typecheck
pnpm.cmd test
pnpm.cmd data:check
pnpm.cmd build
```

Technical runtime changes: `src/components/map/SolarMap.vue`, new `src/map/renderedFeatures.ts`. Tests: `tests/map-integration.test.ts`. New harness: `scripts/qa-technical.mjs`. README, agent instructions, architecture, implementation status and decision notes record this technical follow-up. Existing unrelated working-tree edits are preserved.

Ignored evidence: `data/processed/qa/technical/{baseline,optimized,soak,default-gpu,hardware-bounded}/report.json`, failed `hardware-soak/failure.json` and checkpoints, plus `integrity.json`. The baseline records the pre-fix application; running the current code under that label would not reproduce the historical baseline. The failed original-cache hardware attempt is deliberately retained.
