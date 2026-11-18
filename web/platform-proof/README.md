# Workers feasibility proof (T03)

This isolated proof executes Hono, Better Auth with its Drizzle SQLite adapter, D1, a private R2 binding, static assets, and SQLite-backed Durable Objects in local `workerd`. It is not the production foundation or an editing engine. The `increment` command is a bounded transport/persistence probe; it cannot validate a rocket graph or establish the T01 trusted-edit gate.

From the repository root after the coordinator's workspace integration:

```sh
cd web
npm ci
WRANGLER_LOG_PATH=/tmp/openrocket-g1-wrangler.log WRANGLER_SEND_METRICS=false npm test --workspace @openrocket/platform-proof -- --reporter=verbose
npm run typecheck --workspace @openrocket/platform-proof
WRANGLER_LOG_PATH=/tmp/openrocket-g1-build.log WRANGLER_SEND_METRICS=false npm run build --workspace @openrocket/platform-proof
npm run measure:local --workspace @openrocket/platform-proof
```

`build` uses Wrangler's `--dry-run`; it does not deploy. `measure:local` starts and terminates its own local dev process, uses ports 8789/9239, checks `/health` and real static assets, and samples Linux `/proc`/`ps`. The tests require permission to open local sockets. Bindings in Wrangler are explicitly local/test-only names and placeholder D1 IDs. No remote resource was created or deployed. `nodejs_compat` is explicit in Wrangler rather than relying on the test plugin to inject it.

## Executed evidence

On November 17, 2026 (America/Chicago), Node 26.13.1, Linux x86_64, workerd 1.20261117.1, Wrangler 4.164.0, Vitest 4.1.12 and `@cloudflare/vitest-plugin` 1.8.4:

- Nine package-local tests passed in [platform-tests.log](evidence/platform-tests.log), including D1 migrations applied twice, password hashing/verification through Better Auth, explicit operator provisioning, secure HTTP-only SameSite cookies, login/logout, expiration, concurrent admin role/password mutations, user listing, suspension and session revocation. Wrong passwords, public signup, forged roles, unauthenticated admin calls, hostile origins and impersonation are rejected.
- The owner can download private R2 bytes; anonymous callers, another project member and a global admin without project membership are denied. Known project IDs and file names confer no access.
- A socket receives sequence 1 only after the SQLite transaction. `evictDurableObject()` destroys the instance while preserving the socket; the next message reconstructs a different instance and returns the original acknowledgment for a duplicate operation. A second operation advances to sequence 2. A reconnect sees sequence 2, a different project starts at 0, cross-project commands reject, and client-supplied author IDs have no authority. Unknown project handshakes return 403.
- Existing sockets close with 1008 after logout, suspension or project membership removal. The latter test changes the SQLite membership directly through the runtime test helper; it is not evidence of a product ACL management route. The code rechecks D1 session/account status and project membership before each message. It does not yet proactively close all sockets at revocation acknowledgment or serialize all revocation races.
- The shared contracts' `simulationInputHash` and `resultIsCurrent` execute with Workers Web Crypto. Changes to tree, options, seed or integrator make a completed browser-attributed result stale. This is a provenance proof, not an implemented result upload/share service.
- `tsc --noEmit` passed. [build.log](evidence/build.log) records a successful production-format bundle dry-run: 2095.94 KiB / gzip 387.25 KiB. The artifact SHA-256 was `a8108f6d976270583e9aa1e291358843a992bd94cd3daca42809af763b992bc2` before coordinator integration; path/source changes alter it.
- [local-runtime.json](evidence/local-runtime.json) records measured CLI-ready time, request wall time, Linux workerd process CPU and RSS. The sampled CLI startup was 1.666 s, first health response 50.49 ms, and 100 health calls took 381.43 ms wall / 260 ms summed workerd-process CPU. RSS was 93524 and 161196 KiB across two dev-service processes. These process numbers include local Miniflare machinery; they are not Cloudflare isolate heap/CPU measurements. Authentication measurements were 102 ms wall for bootstrap/hash and 60–87 ms wall for initial logins, including D1 operations. No production budget is certified by those timings.

The default Better Auth scrypt implementation and parameters are retained; no custom hash or reduced work factor was introduced. Tested packages are Better Auth and its separate adapter 1.7.25, Drizzle 0.45.4, Hono 4.13.19. An npm audit at installation reported six high **development dependency** findings through `picomatch <=4.0.7` (Vite/Vitest/tinyglobby chain), with no production dependency finding in that standalone installation. The combined workspace audit also reports five high findings with `--omit=dev`, because Better Auth declares Vitest as an optional peer and npm classifies the shared test chain as production. The dry-run Worker bundle contains none of the Vitest/picomatch/tinyglobby module paths. These findings remain unresolved; a zero-vulnerability production audit is not claimed. Do not apply the suggested incompatible downgrade automatically; reassess the root workspace lockfile before release.

## Boundaries and remaining evidence

The initial test invocation failed because the sandbox denied a localhost listener; rerunning with local socket access passed. The documentation's `/config` import for `readD1Migrations` does not exist in the installed plugin; the actual package exports it from the main module. An initial close handler echoed reserved WebSocket code 1005, producing runtime exceptions; it now normalizes reserved codes and the corrected run has no unhandled exceptions. The earliest attempted Workers-types date did not exist; the tested version is pinned in `package.json`. These failures did not establish parity or platform incompatibility.

`bootstrapOperator()` is an imported test/operator function with no HTTP route. It explicitly creates the chosen account and records a one-time marker. Its check/create/marker sequence is **not safe for concurrent operators**; production requires a serialized authenticated operator ceremony, last-admin protection, audit records, and recovery authorization. Admin-issued password replacement is exercised; short-lived single-use recovery tokens and a user-facing recovery flow are not implemented. Site-admin project access is deliberately absent. Public signup and impersonation are disabled. No production authentication secret is checked in; the test secret is injected only by Vitest configuration.

A read-only `wrangler whoami` confirmed existing OAuth access and **two available accounts**. There is no selected staging `account_id`, and the environment has no account override. Account choice is therefore ambiguous. Remote provisioning/deployment and hosted D1/R2/DO behavior remain pending; this is not a claim that credentials are absent. No account identifiers, OAuth tokens or secret values are recorded here. A remote smoke proof also needs a dedicated, authenticated one-time bootstrap harness; exposing the test function as a public route would be unsafe.

Coordinator integration additionally passed the malformed/oversized socket regression and the codec round trip in `test/codec.test.js` (11 tests across two files), plus the typecheck. Remote evidence is recorded separately; the account-selection status above describes the original local handoff.

G1 platform assessment: the selected stack works for these local runtime operations. Remote hosted compatibility, auth CPU/isolate memory limits, real network hibernation/load, full revocation linearization, admin recovery/audit/last-admin invariants, and production deployment remain unproven. T04 and later delivery phases are outside this contribution.

Primary references consulted: [Cloudflare Vitest setup](https://developers.cloudflare.com/workers/testing/vitest-integration/write-your-first-test/), [runtime test helpers and eviction](https://developers.cloudflare.com/workers/testing/vitest-integration/test-apis/), [Better Auth Drizzle adapter](https://better-auth.com/docs/adapters/drizzle), [Better Auth admin API](https://better-auth.com/docs/plugins/admin). Package source/types were checked when the documentation differed from the installed release.
