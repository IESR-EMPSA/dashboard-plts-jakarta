# Codex context pack — how to use

The existing Vue 3 + TypeScript + Vite/pnpm project is initialized; preserve it. The audit, preprocessing, archive QA, frontend data layer and local WebGIS/dashboard are complete. Run `pnpm.cmd dev` and open **http://localhost:5173/**. The official PMTiles protocol now reads the GeoPackage-verified z13–18 repaired archive from the user's Cloudflare R2 public development URL, configured in ignored `.env.local`. Clearing that value restores the preserved Vite-only local Range endpoint. See `docs/R2_LOCAL_INTEGRATION.md` for current delivery, performance and DNS evidence, and `docs/ARCHIVE_REPAIR_REPORT.md` for repair/rollback provenance. No frontend deployment has occurred.

## Initial prompt to paste into Codex

> Read `AGENTS.md` and all files referenced in it. Inspect the existing repository, including `package.json`, lockfile, `src/`, and Vite configuration. For this first task, **do not modify any files**. Summarize the project mission, authoritative datasets, data limitations, required map and dashboard features, architecture, risks, and any conflicts with the current codebase. Then propose a milestone-by-milestone implementation plan with deliverables and testable acceptance criteria. Identify what data files or endpoints I must provide. Wait for my approval before starting phase 1.

## Prompt for a single approved phase

> Read `AGENTS.md`, `docs/IMPLEMENTATION_PLAN.md`, and the most relevant specs. Implement only milestone **[NUMBER / NAME]**. Before editing, state which files you will touch and what success looks like. Use existing repo conventions, minimize scope, run the available verification commands, show observed results, and stop after this milestone. Do not deploy or push unless I request it.

## Review / fix prompt

> Review the changes from milestone **[NUMBER]** against `docs/PRD.md` and `docs/DATA_CONTRACT.md`. Focus on wrong numbers, null handling, MapLibre tile behavior, filter consistency, type safety, and mobile layout. Reproduce and fix verified issues without adding features. Report evidence and any residual risks.

## Rules for sharing data with Codex
- Share **schema and small representative samples** of the QGIS export before sharing the full 1.47-million-feature dataset.
- For all external data, explicitly state: `not ready`, `sample`, or `validated production`.
- The repaired PMTiles is already uploaded to Cloudflare R2; localhost integration uses a public URL only. Never expose storage credentials. Further uploads or deployment require separate instructions.
- `data/raw/` contains six CSVs, two administrative GeoJSONs and the 793,317,376-byte MBTiles archive. Keep these immutable/ignored. They are file-validated exports; publication rights and original model QA remain unverified.
- The original eligible-building GeoPackage is now available at `data/raw/buildings_eligible_pvout.gpkg`. It verified the narrowly scoped attribute corrections in the separate repaired z13–18 archive. The supplied new MBTiles and its initial PMTiles remain unchanged under `data/processed/`; see the repair report for exact paths and safeguards. This does not authorize changes to the statistical publication.
- Reviewable mappings live in `data/crosswalks/`; small generated derivatives belong in `public/data/`; archives/QA artifacts belong in ignored `data/processed/`. Project-local CLI files belong in ignored `.tools/`.
- Keep one decision register in `docs/DECISIONS_AND_RISKS.md`; update it when the scope changes.
- After finishing a phase, start a new Codex conversation if context becomes cluttered, and instruct it to re-read `AGENTS.md` and the current milestone.

## Current handoff
The local demo includes authoritative KPIs, all 6 regions / 44 districts, 7 building types, choropleths, scoped charts and real building details. Combined administrative × type KPIs stay unsupported. Manual functional UAT is approved; do not repeat the full functional suite for the technical follow-up. All 62 tests pass, including two bounded-render-query regression tests. See `docs/TECHNICAL_QA_REPORT.md` for continuous hardware/software stress, observed memory/bandwidth tradeoffs and remaining production blockers, alongside `docs/IMPLEMENTATION_PLAN.md` and `docs/ARCHIVE_REPAIR_REPORT.md`.

On Windows use `pnpm.cmd` if PowerShell blocks `pnpm.ps1`; do not change execution policy. The current `.env.local` activates R2; with an empty value, development uses the validated local archive. Preview/production needs a public URL at build time. Normal Windows DNS/DoH and certificate-verified Range requests pass; isolated Chrome QA uses the Windows resolver, with no IP override or system setting changes. Separate browser DNS settings can still follow an intercepted ISP path. Stop after localhost verification: no further upload, deployment, commit or push is authorized.
