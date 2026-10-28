# Repository maintenance review — 2026-10-28

Baseline: 13f909f on main; the worktree was clean. Manual UAT and deployment were already owner-approved. This pass covers documentation corrections and demonstrably unused internal code. No stage, commit, push, upload, deployment or production-configuration change is performed.

The [2026-10-27 review](archive/PROJECT_REVIEW_2026-10-27.md) remains preserved. Its byte-identical shipping comparison applies to that older snapshot.

## Outcome

The approved content, layout, English-first/saved-locale behavior, filters, charts, details, map settings, opacity and numerical/null semantics are retained. No component, data service, model calculation, dependency or publication dataset is removed or replaced.

All 63 tests, TypeScript, publication checks and production build pass before and after cleanup. Focused actual-app Chrome checks match before/after, with zero exceptions or critical console errors. Compared desktop header/title/metrics and mobile navbar pixels are identical. All 15 GIS source/archive hashes and protected publication/configuration/producer fingerprints are unchanged.

## Code audit

- The inventory covers 51 TS/JS/Vue files and 267 import declarations. Every application module remains reachable, including the async map. No unused whole component/module was established.
- Remove App.vue's empty title span and the orphan colour selector in src/style.css. The title's period had already been removed by the owner; this maintenance does not change its text.
- Remove only the unused expand, check and eye paths from AppIcon.vue. All 14 remaining paths and the info fallback are unchanged. The sole dynamic icon expression is card.icon; its four KPI values are retained.
- Update a selector comment that still described the implemented building filter as future work. Its emitted logic is unchanged.
- qa-app.mjs still expected a period in its full-route heading assertion. Match the approved title and check it at common startup so focused runs cover it too. Product behavior is unchanged.
- TypeScript unused-local/parameter checks pass. All 13 JS/MJS files pass syntax checks; no unused JS import candidate was found.
- Keep the dynamically selected error.network/error.http/error.timeout messages, internal/public contract types, constants used within their own modules, the dev-only map hook and error diagnostics.
- All 10 direct dependencies remain required: three runtime, seven development. No dependency install/removal/upgrade or package/lockfile change. A fresh registry vulnerability audit was not performed.
- Keep historical conversion, geometry and repair scripts and their diagnostic HTML/JS for reproducibility.

## Documentation

Current guides now distinguish implemented data/map services from historical milestone handoffs, describe the five test files, label original 55/41-test snapshots, identify all three building rendering layers and separate source publication from hosting configuration.

The data contract records the prior read-only research review's area sums and 143 modeled-usable-area/post-setback cases. Its GeoPackage fingerprint matches the current source. This pass reuses that evidence without rerunning GIS processing or changing formulas/statistics. Exact PVOUT raster vintage, temporal aggregation and sampling remain unverified; a 2019 reference does not establish the missing raster's version.

README, the supplied pipeline illustration and the design guide were already consistent and remain unchanged. Historical numerical/QA observations are retained; old no-deployment/zoom statements are not relabeled as current checks.

| Action | Files | Reason |
|---|---|---|
| Modify | src/App.vue, src/style.css | Remove empty title markup and its unused selector |
| Modify | src/components/AppIcon.vue | Remove three proven unused icon paths |
| Comment only | src/selectors/dashboard.ts | Describe the current filter consumer |
| Modify | scripts/qa-app.mjs | Match and verify the approved heading |
| Modify | AGENTS.md, docs/IMPLEMENTATION_PLAN.md | Current maintenance boundary and completed earlier approvals |
| Modify | docs/ARCHITECTURE.md, docs/FRONTEND_DATA_LAYER.md | Current integration, API and test-command responsibilities |
| Modify | docs/LOCALIZATION.md | Current suite versus original feature-stage acceptance |
| Modify | docs/DEPLOYMENT.md | Completed organization publication; no implied hosting migration |
| Modify | docs/DATA_CONTRACT.md, docs/DECISIONS_AND_RISKS.md | Source-verification limits and research observations |
| Modify | docs/PROJECT_REVIEW.md, docs/README.md | Current review and evidence index |
| Add archive | docs/archive/PROJECT_REVIEW_2026-10-27.md | Preserve the former report with relocated links/banner |

No whole source file is deleted. Raw data, archive/rollback files, publication outputs, crosswalks, producer files, HTML metadata, message catalog, images, dependencies, Vite/TypeScript settings, environment and Git remotes/upstream are retained.

## Before / after checks

| Check | Before | After |
|---|---|---|
| pnpm test | 63 passed, 0 failed | 63 passed, 0 failed |
| pnpm typecheck | Three projects pass | Three projects pass |
| pnpm data:check | Nine outputs, original release | Same outputs and release |
| pnpm build | Pass; existing MapLibre size advisory | Pass; same advisory |
| Focused Chrome | ID/EN, 320/390/1440 px, real building 386807 | Identical checks/ID; no exceptions or critical console errors |
| Pixel comparison | Six baseline screenshots | Zero changed bytes: desktop first 220 rows, mobile first 50 rows |
| Protected fingerprints | Baseline captured | 40 unchanged, including publication/producer/config/environment and branding |
| Original/processed GIS | 15 files, 9,225,542,159 bytes | All 15 SHA-256 values unchanged |
| JS/MJS | 13 syntax checks pass; no unused import candidate | Retained scripts pass |
| Markdown/archive | Initial link scan passes | Final local-link/anchor and archived-text checks recorded separately |

The protected set includes the public release, raw/crosswalk/processed GIS, package/lock/workspace, Vite/TypeScript configuration, .env.local, source logo and three publication-producer inputs. GIS files are fingerprinted, not regenerated. Data version remains dki-solar-2edaec0ca52d964b: 1,747,249 analyzed, 1,470,399 eligible, 1,466,275 covered and 4,124 missing-PVOUT buildings.

Shipping JS/CSS hashes change because unused icon data, markup and CSS were removed; Vite rewrites chunk import references. This review does not claim byte-identical builds. Public data, branding, the MapLibre worker and map-specific CSS retain their bytes. Before/after assertions and bounded pixel comparisons provide the presentation/interaction evidence.

## Limits and retained debt

- This is focused local Chrome/software-WebGL coverage. Asynchronous map/provider pixels are not compared; ordinary canceled imagery requests occur during switches. Full UAT, stress, physical devices, remote performance and accessibility certification are not repeated.
- No production endpoint or hosting dashboard is recertified. Credentials, DNS, CORS and hosting settings are untouched. The earlier organization push did not migrate the Vercel Git connection; a local build does not establish deployed release contents.
- Historical qa-r2-integration.mjs retains its r2.dev target and is labeled accordingly. Current custom-domain configuration is preserved.
- Dense tiles, large MapLibre/worker chunks, boundary transfer and device/network budgets remain documented. No caching, geometry, layering or network optimization is attempted.
- Source topology/overlap, vintage/rights, exact PVOUT metadata and physical/grid/economic suitability remain research questions. The 143 area-reference cases are not silently fixed.
- Producer source/publication types participate in data versioning. Their stage-oriented comments are preserved to avoid an unauthorized release change.
- No broad refactoring, compressed-CSS reformatting, runtime API narrowing, Git history rewrite or dependency upgrade.

## Reproduction and handoff

Use the existing pnpm test, pnpm typecheck, pnpm data:check and pnpm build commands. The standard focused browser entry remains node scripts/qa-app.mjs --layer-controls-only. It uses the preserved local archive and an isolated server, without replacing the user's main Vite server or environment file.

Ignored evidence is isolated at data/processed/qa/maintenance-20261028/: before/after logs/fingerprints, static inventory, cleanup-evidence.json, research-evidence.json, browser-before/, browser-after/, pixel comparison, preservation and final documentation checks. Temporary drivers stay under ignored .tools/. Earlier QA directories are not overwritten.

Only reviewed source/script/documentation changes belong in a future commit. Exclude private inputs, QA output, tools, environment and builds. No stage, commit, push, upload or deployment is performed.

Suggested message:

    chore: remove unused presentation code and refresh maintenance documentation

    - Remove empty title markup, an orphan style and unused icon paths
    - Align browser QA with the approved heading
    - Refresh current data, localization and deployment guides
    - Preserve prior audit evidence and clarify research verification limits
    - Verify unchanged data/archive fingerprints and before/after checks
