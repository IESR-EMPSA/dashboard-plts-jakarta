# Repository audit and behavior-preserving cleanup

> Scope note: this report records the cleanup snapshot before the subsequent owner-approved English-first language change. Its byte-identical build/pre-commit findings apply to that cleanup stage. Current source behavior is documented in [localization](LOCALIZATION.md); the English default is a separate intentional functional change and has not been deployed by this follow-up.

Date: 2026-10-27. Baseline commit: `76096bc` (`main`); the worktree was clean before this audit. Manual UAT and successful Vercel/R2 custom-domain deployment are owner-confirmed.

## Outcome and boundary

Cleanup is limited to demonstrably unused internal code, one existing test's formatter target, Git ignore protection and documentation. No component/template, style, catalog, map algorithm, dataset, producer, package/lockfile, Vite/environment or hosting configuration was changed. No commit, stage, push, upload, deployment or history rewrite was performed.

The strongest preservation check is **byte-identical shipping output**: all 17 `dist/` files retain their baseline SHA-256 hashes. The same 17 baseline files were independently read from production and matched local bytes. All nine publications and 15 original/processed GIS files also retain their hashes. This preserves the deployed JavaScript, styles, worker, branding and data rather than relying on a claim based only on passing unit tests.

## Audit findings and cleanup

- The source/import audit covered 52 initial TS/JS/Vue files across application, scripts and tests, including 268 static/dynamic import declarations. Every Vue component is reachable, including the async map and loading/error components. After cleanup all remaining application modules are reachable through the app graph.
- `src/utils/presentation.ts` was outside the application graph. Its `shortRegionName` had no consumers; `numberId` was used only by a legacy test. Remove this obsolete module and point the existing four formatting assertions at the actual `createI18n().n` API. All 63 tests remain.
- `solarDataService.ts` re-exported `asDataError` without any consumer of that re-export. Remove the redundant import/export; the real implementation and its direct consumers in `dataError.ts` remain unchanged.
- TypeScript's unused-local/parameter checks pass. A conservative scan of all 13 JS/MJS files found no unused import candidates; syntax checks pass. Candidate exported types/constants used within their own modules or documented contracts are retained.
- Dev-only `window.__SOLAR_MAP__`, dynamically chosen icons/catalog keys, runtime error logging and renderer/fallback components are intentional. Historical archive diagnostics and their HTML/JS pages are referenced by evidence and are retained, not deleted as experiments.
- Extend ignores for GeoPackage journals, QGIS/shapefile sidecars and private key/certificate bundles. Existing raw/processed data, local environments, provider state, dependencies, build output and QA artifacts were already ignored. No local GIS input/archive was deleted or moved.
- No currently tracked file is ignored; no original GIS archive, private environment, provider credential directory or build output is tracked. A limited current-tree credential-pattern scan found no recognizable access-key/private-key patterns. This is not a full historical secret-forensics certification.

## Documentation review

The root README is the setup/development/testing/deployment entry point; START_HERE now directs readers there. New deployment documentation records the owner-provided production URLs and measured read-only checks, without inventing private Vercel settings. The index distinguishes current guides from historical evidence and lists script requirements/write boundaries.

Current guides now describe the deployed custom domain, three building layers, 80% initial opacity, actual component ownership, inline mobile filters, current provider setup and supported chart/filter scopes. The obsolete placeholder JSON in DATA_CONTRACT was replaced with actual envelope/type references. The data contracts and producer code themselves are untouched.

The large milestone handoff history and previous review are archived with relative links repaired. Original statistical/repair/geometry/QA values remain intact. Dated reports receive explicit scope notices so earlier "not deployed", old zooms or test counts are not mistaken for current status. Model/topology/vintage/rights limitations are retained rather than silently declared resolved by deployment.

## File changes / commit manifest

| Action | Path(s) | Reason |
|---|---|---|
| Delete | `src/utils/presentation.ts` | Obsolete test-only formatter wrapper and unused name helper |
| Modify | `src/services/solarDataService.ts` | Remove unused re-export/import only |
| Modify | `tests/map-integration.test.ts` | Preserve four assertions using the real app formatter |
| Modify | `.gitignore` | Protect future local GIS sidecars and private keys |
| Comment only | `.env.example` | Point readers to the active deployment guide; the environment value remains empty |
| Modify | `AGENTS.md` | Replace stale localhost-only scope with deployed, zero-change maintenance boundary |
| Rewrite | `README.md`, `START_HERE.md` | One clear entry point and accurate setup/test/deployment guidance |
| Add | `docs/README.md` | Guide/evidence index and retained script inventory |
| Add | `docs/DEPLOYMENT.md` | Actual production record and bounded verification limits |
| Replace with current status | `docs/IMPLEMENTATION_PLAN.md` | Concise completed milestones and current maintenance constraints |
| Archive former plan | `docs/archive/IMPLEMENTATION_HISTORY.md` | Preserve detailed stage/UI history rather than duplicate it in current guides |
| Replace with current review | `docs/PROJECT_REVIEW.md` | This report, evidence, file manifest and commit proposal |
| Archive former review | `docs/archive/PROJECT_REVIEW_2026-10-26.md` | Retain previous cleanup evidence with a clear date/scope |
| Update | `docs/ARCHITECTURE.md` | Actual runtime modules, deployed delivery, masking/highlight layers and fallback |
| Update | `docs/DATA_CONTRACT.md` | Correct schema documentation and distinguish verified exports from remaining certification |
| Update | `docs/DECISIONS_AND_RISKS.md` | Deployment is complete; evidence/budget/source risks remain distinct |
| Update | `docs/DESIGN_SYSTEM.md` | Actual components/layout instead of proposed nonexistent components/features |
| Update | `docs/PRD.md` | Current header/chart scope and deployed status, no new product requirements |
| Update | `docs/FRONTEND_DATA_LAYER.md` | Current adapter use/provider example, labeled milestone-2 evidence |
| Scope notice | `docs/LOCALIZATION.md` | Separate current guide from original feature-stage verification counts |
| Scope notice | `docs/DATA_STAGE_REPORT.md`, `docs/GEOMETRY_QA.md` | Preserve original preparation/type-0 investigations as dated evidence |
| Scope notice / clarify old setup | `docs/LOCAL_DEMO.md` | Remove contradictory "z13–18 pending" guidance while preserving original demo observations |
| Scope notice | `docs/ARCHIVE_Z13_18.md`, `docs/ARCHIVE_REPAIR_REPORT.md` | Keep conversion/repair evidence and resolved activation chronology |
| Scope notice | `docs/TECHNICAL_QA_REPORT.md`, `docs/R2_LOCAL_INTEGRATION.md` | Historical readiness/r2.dev measurements are not current deployment or custom-domain benchmarks |

`docs/DATA_PIPELINE.md`, the repair CSV ledger, publication files, crosswalks and producer files remain unchanged. `.tools/` audit helpers, `data/processed/qa/` evidence, `dist/` and local environments are ignored and **not commit candidates**.

## Before / after verification

| Check | Before cleanup | After cleanup |
|---|---|---|
| `pnpm test` | 63 passed, 0 failed | 63 passed, 0 failed |
| `pnpm typecheck` | All three projects passed | All three projects passed |
| `pnpm data:check` | Nine files, original release | Same nine files and release |
| `pnpm build` | Passed; existing MapLibre size advisory | Passed; same advisory and shipping bytes |
| Browser `--layer-controls-only` | Passed ID/EN, 320/390/1440 px | Same checks and inspected building ID; no critical errors |
| Dist/publication/config preservation | SHA-256 baseline recorded | 53 protected fingerprints unchanged |
| Original/processed GIS preservation | 15 files, 9,225,542,159 bytes fingerprinted | All 15 hashes unchanged; no source/rollback deletion |
| Navbar visual comparison | Six screenshots recorded | First 50 pixel rows identical in all six comparisons |
| Dependency audit | All 10 direct dependencies required; 0 reported advisories | Package/lock/workspace files unchanged |
| Markdown links / Git whitespace | No broken local file links in initial tree | Final local file-link/whitespace checks pass |

Validated release remains `dki-solar-2edaec0ca52d964b`: 1,747,249 analyzed buildings, 1,470,399 eligible, 1,466,275 with PVOUT and 4,124 without. Exact source totals and units remain in DATA_CONTRACT; no statistics were regenerated.

Additional checks: all 13 retained JS/MJS files pass `node --check`; dynamic imports remain present; ignore-rule examples protect private files without ignoring public data, favicon/logo or `.env.example`. Production frontend returns 200; a 16 KiB PMTiles request returns 206 with matching local prefix bytes and exact production-origin CORS. See [deployment](DEPLOYMENT.md) for details.

## Limits and retained technical debt

- Focused Chrome/software-WebGL checks were run before/after; full functional UAT, archive conversion/repair, exhaustive model/topology QA and a new stress/performance certification were not repeated. Software/browser timing differences are not claimed as performance changes.
- Visual pixel comparison covers only the first 50 rows of the six screenshots. Whole-map screenshots can differ with asynchronous external basemap/tile loading. Shipping JS/CSS/worker/data bytes are identical; all focused check results match. Ordinary canceled imagery requests occur during basemap switches; browser exceptions/critical console errors are zero.
- The MapLibre lazy chunk/worker and dense z13 tiles remain relatively large; historical memory/bandwidth observations are retained. No chunk splitting, cache, geometry or network-policy optimization was performed.
- Large map/QA files, compressed CSS and duplication between standalone diagnostic harnesses remain possible future readability work. Restructuring them was avoided under the strict zero-change/output boundary.
- `qa-r2-integration.mjs` still targets the historical r2.dev host in remote mode. It is documented as a retained historical tool, not advertised as testing the custom production domain. Changing its CLI/default requires separate work; production settings were not changed to accommodate it.
- Node/pnpm versions are documented but not newly pinned through package/config changes. No dependency was removed because all were required, and none was installed/upgraded. The registry audit's zero findings are a dated result, not a permanent security guarantee.
- Producer files (`scripts/prepare-data.ts`, `scripts/lib/data-pipeline.ts`, `src/types/solar.ts`) participate in publication fingerprints. Even cosmetic changes can require a new compatible data release; no such changes were made.
- Original solar-model/topology/source-vintage/rights certification, wider device/accessibility/network budgets and private hosting dashboard settings remain outside what this cleanup verifies. Successful deployment does not overwrite the publication's verification metadata.

## Evidence and commit preparation

Ignored evidence lives under `data/processed/qa/repository-cleanup/`: before/after fingerprints, preservation result, production static-file hashes/Range headers, dependency audit, static import/link audits, after-check logs, before/after browser reports/screenshots and browser comparison. Helpers used solely to collect/compare this audit stay under ignored `.tools/`; routine reproduction commands are the checked-in commands listed above.

Only the paths in the file-change table should enter the proposed maintenance commit. Keep all private GIS/QA/environment files ignored. No commit or production action has been performed.

```text
chore(repo): remove unused helpers and refresh project documentation

- Remove obsolete presentation helpers and an unused service re-export
- Keep existing formatting coverage on the application i18n API
- Document deployed Vercel/R2 delivery and archive historical handoffs
- Extend ignore rules while preserving GIS sources and published data
- Verify unchanged build/data fingerprints and before/after checks
```
