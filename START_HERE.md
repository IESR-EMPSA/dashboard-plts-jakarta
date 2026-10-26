# Codex context pack — how to use

The existing Vue 3 + TypeScript + Vite/pnpm project is initialized; preserve it. The audit, preprocessing, archive QA, milestone 2 data layer and approved milestone 3 local WebGIS/dashboard are complete. Run `pnpm.cmd dev` and open **http://localhost:5173/**. The official PMTiles protocol reads the unchanged ignored archive through a Vite-only Range endpoint; nothing is uploaded. See `docs/LOCAL_DEMO.md` for setup, QA evidence, file inventory and limitations.

## Initial prompt to paste into Codex

> Read `AGENTS.md` and all files referenced in it. Inspect the existing repository, including `package.json`, lockfile, `src/`, and Vite configuration. For this first task, **do not modify any files**. Summarize the project mission, authoritative datasets, data limitations, required map and dashboard features, architecture, risks, and any conflicts with the current codebase. Then propose a milestone-by-milestone implementation plan with deliverables and testable acceptance criteria. Identify what data files or endpoints I must provide. Wait for my approval before starting phase 1.

## Prompt for a single approved phase

> Read `AGENTS.md`, `docs/IMPLEMENTATION_PLAN.md`, and the most relevant specs. Implement only milestone **[NUMBER / NAME]**. Before editing, state which files you will touch and what success looks like. Use existing repo conventions, minimize scope, run the available verification commands, show observed results, and stop after this milestone. Do not deploy or push unless I request it.

## Review / fix prompt

> Review the changes from milestone **[NUMBER]** against `docs/PRD.md` and `docs/DATA_CONTRACT.md`. Focus on wrong numbers, null handling, MapLibre tile behavior, filter consistency, type safety, and mobile layout. Reproduce and fix verified issues without adding features. Report evidence and any residual risks.

## Rules for sharing data with Codex
- Share **schema and small representative samples** of the QGIS export before sharing the full 1.47-million-feature dataset.
- For all external data, explicitly state: `not ready`, `sample`, or `validated production`.
- Cloudflare R2 is the preferred storage candidate, pending confirmation. No upload is authorized. The frontend eventually receives a public URL only; never storage credentials.
- `data/raw/` contains six CSVs, two administrative GeoJSONs and the 793,317,376-byte MBTiles archive. Keep these immutable/ignored. They are file-validated exports; publication rights and original model QA remain unverified.
- Reviewable mappings live in `data/crosswalks/`; small generated derivatives belong in `public/data/`; archives/QA artifacts belong in ignored `data/processed/`. Project-local CLI files belong in ignored `.tools/`.
- Keep one decision register in `docs/DECISIONS_AND_RISKS.md`; update it when the scope changes.
- After finishing a phase, start a new Codex conversation if context becomes cluttered, and instruct it to re-read `AGENTS.md` and the current milestone.

## Current handoff
The local demo includes authoritative KPIs, all 6 regions / 44 districts, 7 building types, choropleths, scoped charts and real building details. Combined administrative × type KPIs stay unsupported. The original 41 tests plus 6 map/range tests pass. See `docs/IMPLEMENTATION_PLAN.md` and `docs/LOCAL_DEMO.md` for remaining release gates.

On Windows use `pnpm.cmd` if PowerShell blocks `pnpm.ps1`; do not change execution policy. No environment variable is needed locally when the validated archive exists. Production preview requires a verified public archive URL; remote storage is still unconfigured. No deployment, upload, commit or push is authorized.
