# Repository screening and cleanup

> Archived 2026-10-26 review; superseded by the [latest repository review](../PROJECT_REVIEW.md).


The review covered specifications, configuration/tooling, the frontend import graph, components and data/filter flows, preprocessing/provenance, QA tools, tracked/ignored files, and test/build/browser results. Cleanup preserved the validated architecture and datasets.

## Findings and actions

| Finding | Action |
|---|---|
| The starter component was unreachable from `src/main.ts` | Remove `src/components/HelloWorld.vue` |
| Three assets were used only by the starter component | Remove `src/assets/hero.png`, `src/assets/vue.svg`, and `src/assets/vite.svg` |
| The starter component was the only reference to the default sprite | Remove `public/icons.svg` |
| The application HTML did not reference the Vite favicon | Remove `public/favicon.svg` |
| README lacked setup, private-input requirements, and the distinction between checkout-only and pipeline tests | Rewrite README with environment, configuration, commands, structure, and Git policy |
| Ignore rules missed GIS exports elsewhere in the repository, caches/reports, and local provider state | Extend `.gitignore`; allow only `crosswalks/` under the root `data/` directory |
| No environment configuration example existed | Add `.env.example` with an empty URL and no credentials |
| `aria-labelledby="analytics-title"` referred to a removed chart element | Assign the ID to the existing visible chart label, preserving appearance and statistics |

The six deleted files were tracked starter files unused by the application. Dependencies, lockfiles, tooling, production statistics, and geometries were unchanged. Every remaining frontend file was reachable through the application import graph, including dynamic and type-only imports. Public asset references were also checked in HTML, CSS, and application code.

## Files that remain necessary

- Nine `public/data/` files support runtime loading and tests. The two GeoJSON files are the largest Git payloads, approximately 9.52 MB combined, and provide administrative boundaries and navigation extents.
- Two `data/crosswalks/` source files provide administrative/category normalization and preprocessing provenance.
- All tests and preprocessing scripts validate denominators, units, NULL semantics, aliases, hashes, and compatible releases.
- `qa-archive.mjs`, `qa-browser.mjs`, and `scripts/qa/browser.{html,js}` are CLI diagnostics and geometry regression controls, despite not being frontend imports.
- `pnpm-lock.yaml`, `pnpm-workspace.yaml`, and Vite/TypeScript configuration support reproducibility and the existing esbuild permission.
- Documentation, `AGENTS.md`, `START_HERE.md`, and `.vscode/extensions.json` provide project context and shared extension recommendations. Earlier stage reports remain historical evidence.

The private `data/raw/`, `data/processed/`, `.tools/`, and installed dependencies were not destructively cleaned. Existing archives and QA evidence were preserved.

## Git policy after cleanup

Ignored files include dependencies/caches/builds, test reports, all root `data/` content except `crosswalks/`, CLI binaries, MBTiles/PMTiles/GeoPackage archives, GIS rasters and compressed QGIS projects, local environments/credentials, Vercel/Wrangler state, personal workspace configuration, and temporary/backup files.

Source, scripts, tests, documentation, lockfiles/workspace configuration, crosswalks, frontend data under `public/data/`, `.env.example`, and the Vue extension recommendation remain eligible for tracking. No blanket rule excludes all CSV/JSON/GeoJSON files or application images.

A `git check-ignore --no-index --stdin` check verified that **29** sample local/generated paths were ignored and **16** required source/data paths remained allowed. `git ls-files -ci --exclude-standard` returned no files: no tracked private/generated files required removal from the index. No staging, commit, push, upload, or deployment was performed.

## Verification results

- `pnpm.cmd data:check`: all nine outputs remained identical, with data version `dki-solar-2edaec0ca52d964b`.
- `pnpm.cmd test`: **48/48** passed, including 16 pipeline tests and 32 frontend/map tests.
- `pnpm.cmd typecheck`: Vue, Vite configuration, and TypeScript scripts/tests passed.
- `pnpm.cmd build`: passed. No GIS archives or deleted starter assets were present in `dist/`.
- `node scripts/qa-app.mjs`: passed against the local application. Accessible labels, all 6/44/7 statistical selections, Range/206, Polygon filtering, real building clicks, NULL energy, Google imagery, fullscreen, viewport/mobile layout, and error/retry behavior remained functional. No runtime exceptions or critical console errors occurred. Intentionally blocked providers were part of fallback testing.
- The import graph contained no missing relative imports or unreachable remaining frontend files. Local Markdown links were checked after adding this report.
- `pnpm.cmd audit --json`: the npm registry reported **0 advisories** for the audited dependencies at screening time. This was read-only, without `--fix`; package versions and lockfiles were unchanged.
- A basic pattern check of tracked code found no private-key, GitHub-token, or AWS access-key-ID signatures. This was not a comprehensive security certification or a scan of the full Git history.
- No linter or CI workflow was configured; these checks ran locally.

Archive SHA256 values matched the earlier QA evidence:

| Local archive | SHA256 |
|---|---|
| Source MBTiles | `abba6b0ceac927a9f8bba8cbd866b913e5ffc502399217d242467952704880eb` |
| Validated PMTiles | `622e785b2dae369530976a1a0a7c1671b3f51589e4ef9c56abbfd47f3eecdb02` |

## Follow-up work

- The map bundle is approximately 1.11 MB, with a worker around 517 kB; Vite still emits a large-chunk warning. Administrative GeoJSON was not simplified because geometry changes require separate QA.
- Deployment, remote CORS/Range, hosting costs, and publication permissions remain unverified. R2 is still an unconfigured storage candidate.
- Original model verification, topology, data vintage/redistribution, physical devices, and comprehensive accessibility remain publication gates.
- Exact administrative area × building-type statistics require an additional aggregate. No substitute statistics or estimated intersections were created.
- The requested next building-tile zoom range is **13–18**. Archive replacement, metadata checks, viewer alignment, and geometry/browser QA for that range remain pending; the checksums above describe the previously validated archives.

The dependency audit is a registry snapshot, not a guarantee against newly discovered vulnerabilities. `.gitignore` protects new files from ordinary staging; already tracked files and files forced with `git add -f` still require review before committing.
