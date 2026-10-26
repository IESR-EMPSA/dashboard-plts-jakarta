# Cloudflare R2 integration with the localhost dashboard

## Result and scope

The repaired zoom 13–18 PMTiles is active in the existing localhost dashboard through `VITE_BUILDINGS_PMTILES_URL` in the ignored `.env.local`. The existing official PMTiles protocol and MapLibre layers required no application-code change. Normal Windows DNS, certificate validation, HTTP Range/206, browser CORS, native zooms, representative building inspections and summary-backed filters pass. This is a localhost delivery acceptance, not a production deployment approval.

The previously completed local comparison is reused. The full functional UAT, archive conversion, repair, exhaustive payload audit and private full-object SHA-256 readback were not repeated. No dataset, bucket policy, CORS policy, credential, Windows DNS setting or approved dashboard behavior was changed. There was no upload, deployment, commit or push during this integration stage.

## Active configuration and fallback

- Bucket: `iesr-plts-rooftop`.
- Object: `buildings_eligible_dki_z13-18_repaired.pmtiles`.
- Size: **1,667,964,549 bytes**.
- Local SHA-256, unchanged: `efa8073bafd6ebfec85911d7052b00ef49ccfea97d56502a28a12ac2b25d7d52`.
- The earlier upload receipt records an identical full authenticated remote readback SHA-256. This integration does not infer a file checksum from the multipart ETag.

```dotenv
VITE_BUILDINGS_PMTILES_URL=https://pub-780258dd404b45ddaec3dc7bd19afed1.r2.dev/buildings_eligible_dki_z13-18_repaired.pmtiles
```

The running source is `pmtiles://` followed by that exact HTTPS URL. The remote comparison recorded 50 PMTiles GET attempts to that URL and **zero** GETs to the local archive endpoint. Responses identify Cloudflare; the browser recorded the remote IPv6 address `2606:4700:311b::6812:3222`. No S3 profile or storage credential is read by the frontend or this QA script.

To restore local development delivery, set `VITE_BUILDINGS_PMTILES_URL=` in `.env.local` and restart Vite. The existing `src/map/protocol.ts` then selects `/_local/buildings-z13-18-repaired.pmtiles`, backed by the preserved `data/processed/buildings_eligible_dki_z13-18_repaired.pmtiles`. Restore the public URL and restart to return to R2. This is an explicit configuration fallback, not automatic failover. `.env.local` remains ignored; `.env.example` retains an empty default. Preview/production needs a public URL supplied at build time.

## Connection, TLS and CORS evidence

For each of `http://localhost:5173` and `http://127.0.0.1:5173`, a normal Windows-DNS request with `Origin` and `Range: bytes=0-16383` returned:

```http
206 Partial Content
Content-Length: 16384
Content-Range: bytes 0-16383/1667964549
Accept-Ranges: bytes
Access-Control-Allow-Origin: <the requesting origin>
Access-Control-Expose-Headers: Content-Range,Content-Length,Accept-Ranges,ETag
ETag: "b7895341f41b1372ad37de58e60d0784-25"
```

Each 16,384-byte body exactly equals the local archive prefix. Real localhost JavaScript can read `Content-Range` and `ETag` and receive the bounded body. TLS certificate checks remain enabled in Node, Windows curl and Chrome. HEAD returns the full object length without downloading its body. No HTTP 403, 404 or 429, CORS rejection, or unexpected transport failure occurred in the accepted R2 run.

All 46 completed browser GETs returned 206 with exact matching request/response offsets, byte lengths, total archive length and the expected ETag. The other four attempts were canceled by navigation/filter changes before a response, which is normal MapLibre behavior. The largest response in this route was 10,672,976 bytes. No unbounded archive GET or whole-file download was performed.

### Resolved network diagnosis and remaining browser consideration

Initially the first ISP resolved the R2 hostname to Internet Positif. The hotspot then returned a Telkomsel filtering address and an unrelated certificate. The user configured Cloudflare DoH in Windows and flushed DNS. Subsequent normal Windows lookups returned Cloudflare addresses `104.18.50.34` and `104.18.54.45`; Node and Windows certificate-verified curl then succeeded without IP overrides.

A fresh QA Chrome profile still used its own plaintext DNS client. Its network log proves it received `202.3.218.137`/`::1` and the certificate for `internetbaik.telkomsel.com`. The accepted Chrome run uses `--disable-features=AsyncDns` **only in the isolated QA process** so resolution follows the user's normal Windows resolver and DoH configuration. The resulting log records a system-resolver task; no IP mapping, TLS exception, DNS-system edit, CORS bypass or proxy was used. The final QA script rejects `--resolve-ip` entirely. Earlier ignored direct-IP diagnostic evidence is historical and is not used for final acceptance.

This setting is not delivered to users by the frontend. A browser configured to use a separate intercepted DNS path can still fail on this network; it must use a functioning resolver/Secure DNS. The application cannot correct that network setting. Do not disable certificate validation to work around it.

A later check reproduced Internet Positif resolution after the connection changed back to the earlier network. The user restored the successful hotspot. The final lightweight `final-hotspot-probe` passes normal Windows DNS, TLS, both-origin 16 KiB Range/CORS and the actual localhost browser request; no successful map route was repeated. Network switching can therefore reintroduce this external blocker even though the application configuration is correct.

The existing Vite server is reachable at `http://localhost:5173` (IPv6 loopback), but not at `http://127.0.0.1:5173` in this session. An optional browser-page probe at the latter address failed to connect to Vite; no binding was changed. R2's CORS header policy for that origin passes the explicit Origin-header tests. Use `localhost:5173` for the accepted application; an end-to-end browser page on the IPv4 address was not certified.

### Interrupted approval review

The previous `Command declined by auto-review` affected the normal Windows DNS lookup followed by `node scripts/qa-r2-integration.mjs --mode=probe --label=normal-dns-probe`. The approval service reported an exhausted usage limit and explicitly said it had not determined the action unsafe. The command was not executed then. After the user resumed, it was submitted through the ordinary approval path and ran; no approval mechanism was bypassed.

## Map and statistical acceptance

The accepted run uses the actual Vue application, MapLibre and official PMTiles protocol, with no mocked tile requests or intercepted replacement payloads.

- The ten-stop route covers dense Cengkareng at every native tile zoom 13, 14, 15, 16, 17 and 18; an eastern Jakarta z18 location; Kepulauan Seribu at z16/z18; and return to the cached urban view. After camera updates, QA waits until all renderable canonical building tile IDs have the intended zoom.
- Real mouse clicks open three details: UID `1261080` (available PVOUT), `1746193` (NoData), and `157806` (available). Identity is checked against the real polygon at the click; normalized capacity and annual-energy displays match its properties. The island building retains `annual_kwh: null` and displays `Tidak tersedia`.
- DKI, Jakarta Barat, Cengkareng, Kepulauan Seribu, Kepulauan Seribu Utara and restored-DKI KPI displays reconcile with authoritative JSON. Capacity comparison rows and all seven DKI-wide type values reconcile at every checked scope. The all-null district's annual generation remains unavailable.
- These are focused delivery checks. The previously accepted full 6-region/44-district/7-type UAT is not replayed. Automated selectors still cover all supported scopes and reject unsupported administrative × type KPI intersections.
- There are zero JavaScript exceptions, console errors, critical map errors or WebGL context losses in the accepted comparison. The Polygon/eligible predicates, styling, attributes, geometry, filter behavior and static-summary sources are unchanged.

## Local versus R2 measurements

Both cases use Chrome 155, default GPU, a fresh isolated browser profile, 1440 × 900 CSS pixels, the same ten `jumpTo` stops, inspections and representative filter changes. The earlier passing `local-comparison` is reused at the user's request; the remote run uses the Windows resolver as explained above. The local archive is loopback-delivered, so its tile requests do not depend on public DNS. OS disk caches, remote infrastructure caches, background system load and the network were not reset or controlled; these are observed single-run comparisons, not a statistically controlled benchmark or an SLA.

| Observation | Local PMTiles | R2 PMTiles |
|---|---:|---:|
| Initial map/layer readiness | 1.621 s | 2.119 s |
| First dense z13 view settled | 5.148 s | 8.001 s |
| Navigation median / p95 | 0.125 / 5.148 s | 1.137 / 8.001 s |
| Range GET attempts | 54 | 50 |
| Completed / canceled attempts | 46 / 8 | 46 / 4 |
| Completed response bytes, including measured HTTP overhead | 55,155,628 | 55,163,356 |
| Completed archive payload bytes | 55,139,536 | 55,139,536 |
| TTFB p95 | 7.634 ms | 559.140 ms |
| HTTP errors | 0 | 0 |

Readiness covers map/layer initialization, not every future viewport tile. Navigation includes a 100 ms update wait and 200 ms polling intervals. Transfer numbers cover completed responses; partial bytes from canceled attempts are not measured. Advertised Content-Length totals include canceled responses and must not be treated as actual transfer. Request-count differences come from asynchronous cancellation during filters, not a demonstrated reduction in required tile data. The approximately 55.16 MB completed transfer per case is not a download of the 1.67 GB object.

The dense z13 response remains the slowest observed stop. Existing decoded-cache limits and the installed PMTiles Windows/Chrome `no-store` behavior remain unchanged. Production bandwidth, repeated-view and target-device budgets remain open; the earlier stress evidence remains in [TECHNICAL_QA_REPORT.md](TECHNICAL_QA_REPORT.md).

## Final checks and evidence

- All **62/62 automated tests** and all three TypeScript projects pass.
- Production build passes with the public R2 URL embedded. The existing large map-chunk warning remains; no archive or QA browser hook is bundled.
- All nine publication files and the active PMTiles retain their pre-integration SHA-256 values. The data publication remains `dki-solar-2edaec0ca52d964b`; the existing `data:check` result and final tests preserve the numerical/null invariants.
- No new dependency was installed. Changed runtime configuration is confined to ignored `.env.local`; repository changes are the QA script, credential-free environment guidance and status/documentation updates.

Ignored evidence under `data/processed/qa/r2-integration/`: `local-comparison/report.json`, `remote-comparison/report.json`, their screenshots, `comparison.json`, `windows-resolver-probe/report.json` and `chrome-netlog.json`, `final-hotspot-probe/report.json`, `integrity.json`, `acceptance.json`, and the earlier diagnostic/failure reports. The accepted reports explicitly distinguish the reused local run and final remote run from failed network and harness-development attempts.

For future focused verification, with the existing server running and remote `.env.local` active:

```powershell
node scripts/qa-r2-integration.mjs --mode=probe --label=connection
node scripts/qa-r2-integration.mjs --mode=remote --label=remote
```

For a new local comparison, first clear the environment value and restart Vite, then run `node scripts/qa-r2-integration.mjs --mode=local --label=local`. Restore the remote value afterward. Use distinct labels to preserve previous evidence. `--browser-resolver=default --netlog` reproduces Chrome's separate resolver path for diagnosis. The default Windows-resolver mode retains normal certificate and CORS enforcement.

## Remaining production gates

- Replace the development `r2.dev` delivery URL with an approved production custom domain and verify access on intended user networks. Cloudflare documents `r2.dev` as development-only with variable rate limits; custom-domain caching and access features are separate. See [Cloudflare public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/).
- Add and test the actual approved frontend origin in R2 CORS before production browser use. Current acceptance covers the two localhost origins; it does not certify a Vercel origin. See [Cloudflare CORS](https://developers.cloudflare.com/r2/buckets/cors/).
- Agree network/device/memory budgets and a cache strategy appropriate to this archive's size. These single-run measurements do not close the earlier stress/performance limitations.
- Complete the outstanding source rights, vintage, model/topology and basemap-publication review. Local delivery QA does not certify those matters.
- Vercel deployment requires a separate user instruction. Stop at the verified localhost integration.
