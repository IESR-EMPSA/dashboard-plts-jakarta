# Production deployment and local delivery

## Recorded deployment

The owner supplied these production details during the repository audit on 2026-10-27:

| Item | Value |
|---|---|
| Frontend | [dashboard-plts-jakarta.vercel.app](https://dashboard-plts-jakarta.vercel.app/) |
| Production branch | `main` |
| Frontend hosting | Vercel static frontend |
| Building hosting | Cloudflare R2, bucket `iesr-plts-rooftop` |
| PMTiles URL | [Repaired z13–18 archive](https://tiles.luthfanadli.my.id/buildings_eligible_dki_z13-18_repaired.pmtiles) |
| Public environment variable | `VITE_BUILDINGS_PMTILES_URL` |

Manual UAT/deployment are owner-confirmed. This audit only reads public endpoints and runs local checks. It does not edit Vercel/R2/DNS/CORS credentials/settings or initiate deployment.

## Build and configuration

The owner-authorized source publication to the IESR-EMPSA organization was completed on 2026-10-28 with all 11 commits through `13f909f` preserved. Adding a Git remote or changing a local branch's upstream does not migrate the Vercel Git connection or R2 settings. The existing production integration was not changed or recertified by that push; remote labels are local checkout configuration, not application configuration.

The repository builds with `pnpm build`, emitting static files to `dist/`. Tested local tools are Node 24.19.0 and pnpm 12.4.1. Exact Vercel dashboard overrides/runtime settings were not inspected.

```dotenv
VITE_BUILDINGS_PMTILES_URL=https://tiles.luthfanadli.my.id/buildings_eligible_dki_z13-18_repaired.pmtiles
```

Vite embeds this public URL at build time. A subsequent environment change would require another build/deployment; none is part of cleanup. No credential belongs in `VITE_*`. The existing `.env.example` stays empty to support local delivery by default.

The app navigates page anchors and does not use client-side route paths. No new rewrite, header, cache policy or `vercel.json` was added. [Vercel's Vite documentation](https://vercel.com/docs/frameworks/frontend/vite) describes platform behavior, not this project's private dashboard settings.

## Local fallback and preview

- In `pnpm dev`, a nonempty public URL takes precedence.
- Clearing it and restarting Vite selects `/_local/buildings-z13-18-repaired.pmtiles`, backed by ignored `data/processed/buildings_eligible_dki_z13-18_repaired.pmtiles`.
- The development middleware serves bounded Range responses; it never copies the archive to public/build assets.
- Preview/production has no local archive endpoint and needs a public URL in its build.
- There is no automatic remote-to-local failover.

## Independent read-only observations

On 2026-10-27, through normal HTTPS/TLS validation:

- Frontend `GET /` returned **200**.
- All **17 baseline dist files**, **11,791,702 uncompressed bytes** including nine publication files, were fetched from production and matched their local SHA-256 fingerprints.
- PMTiles `Range: bytes=0-16383` returned **206**, exactly **16,384 bytes**, with `Content-Range: bytes 0-16383/1667964549`.
- With `Origin: https://dashboard-plts-jakarta.vercel.app`, the response allowed that exact origin and exposed `Content-Range`, `Content-Length`, `Accept-Ranges` and `ETag`.

The archive was not fully downloaded. This prefix probe is not a new whole-object checksum; earlier authenticated readback evidence stays in [R2 integration](R2_LOCAL_INTEGRATION.md). It does not test every CORS origin, browser interaction, CDN cache condition, device or sustained-network budget.

Ignored evidence: `data/processed/qa/repository-cleanup/production-static-files.json`, `production-index.html`, `production-range-headers.txt` and the 16 KiB sample. Future deployments may naturally differ from this dated snapshot.

## Operational considerations

Preserve the Polygon predicate, source layer/zooms, static-summary separation and publication/archive provenance. Historical r2.dev traces in [localhost integration](R2_LOCAL_INTEGRATION.md) do not measure the custom domain. Dense geometry, memory/bandwidth budgets, external basemaps and original model/rights evidence remain documented in [decisions and risks](DECISIONS_AND_RISKS.md).

Commit, push and deployment are separate owner actions. This cleanup changes no production services or Git integration.
