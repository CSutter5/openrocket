# Workers feasibility proof (T03)

This isolated proof executes Hono, Better Auth with its Drizzle SQLite adapter, D1, a private R2 binding, static assets, and SQLite-backed Durable Objects in local `workerd`. It is not the production foundation. The original `increment` command is a bounded transport/persistence probe; it cannot validate a rocket graph. The separately configured [imported radius proof](#authenticated-imported-radius-proof) connects authentication and durable archives to the actual Java setter.

From the repository root after the coordinator's workspace integration:

```sh
cd web
npm ci
WRANGLER_LOG_PATH=/tmp/openrocket-g1-wrangler.log WRANGLER_SEND_METRICS=false npm test --workspace @openrocket/platform-proof -- --reporter=verbose
npm run typecheck --workspace @openrocket/platform-proof
WRANGLER_LOG_PATH=/tmp/openrocket-g1-build.log WRANGLER_SEND_METRICS=false npm run build --workspace @openrocket/platform-proof
npm run measure:local --workspace @openrocket/platform-proof
```

`build` uses Wrangler's `--dry-run`; it does not deploy. `measure:local` starts and terminates its own local dev process, uses ports 8789/9239, checks `/health` and real static assets, and samples Linux `/proc`/`ps`. The tests require permission to open local sockets. Bindings in Wrangler are explicitly local/test-only names and placeholder D1 IDs. No production resource was created or deployed; the separately authorized disposable hosted investigation is described below. `nodejs_compat` is explicit in Wrangler rather than relying on the test plugin to inject it.

## Executed evidence

On November 17, 2026 (America/Chicago), Node 26.13.1, Linux x86_64, workerd 1.20261117.1, Wrangler 4.164.0, Vitest 4.1.12 and `@cloudflare/vitest-plugin` 1.8.4:

- Nine tests passed in [platform-tests.log](evidence/platform-tests.log), including D1 migrations applied twice, password hashing/verification through Better Auth, explicit operator provisioning, secure HTTP-only SameSite cookies, login/logout, expiration, concurrent admin role/password mutations, user listing, suspension and session revocation. Wrong passwords, public signup, forged roles, unauthenticated admin calls, hostile origins and impersonation are rejected.
- The owner can download private R2 bytes; anonymous callers, another project member and a global admin without project membership are denied. Known project IDs and file names confer no access.
- A socket receives sequence 1 only after the SQLite transaction. `evictDurableObject()` destroys the instance while preserving the socket; the next message reconstructs a different instance and returns the original acknowledgment for a duplicate operation. A second operation advances to sequence 2. A reconnect sees sequence 2, a different project starts at 0, cross-project commands reject, and client-supplied author IDs have no authority. Unknown project handshakes return 403.
- Existing sockets close with 1008 after logout, suspension or project membership removal. The latter test changes the SQLite membership directly through the runtime test helper; it is not evidence of a product ACL management route. The code rechecks D1 session/account status and project membership before each message. It does not yet proactively close all sockets at revocation acknowledgment or serialize all revocation races.
- The shared contracts' `simulationInputHash` and `resultIsCurrent` execute with Workers Web Crypto. Changes to tree, options, seed or integrator make a completed browser-attributed result stale. This is a provenance proof, not an implemented result upload/share service.
- `tsc --noEmit` passed. [build.log](evidence/build.log) records a successful production-format bundle dry-run: 2095.94 KiB / gzip 387.25 KiB. The artifact SHA-256 was `a8108f6d976270583e9aa1e291358843a992bd94cd3daca42809af763b992bc2` before coordinator integration; path/source changes alter it.
- [local-runtime.json](evidence/local-runtime.json) records measured CLI-ready time, request wall time, Linux workerd process CPU and RSS. The sampled CLI startup was 1.666 s, first health response 50.49 ms, and 100 health calls took 381.43 ms wall / 260 ms summed workerd-process CPU. RSS was 93524 and 161196 KiB across two dev-service processes. These process numbers include local Miniflare machinery; they are not Cloudflare isolate heap/CPU measurements. Authentication measurements were 102 ms wall for bootstrap/hash and 60–87 ms wall for initial logins, including D1 operations. No production budget is certified by those timings.

The default Better Auth scrypt implementation and parameters are retained; no custom hash or reduced work factor was introduced. Tested packages are Better Auth and its separate adapter 1.7.25, Drizzle 0.45.4, Hono 4.13.19. An npm audit at installation reported six high **development dependency** findings through `picomatch <=4.0.7` (Vite/Vitest/tinyglobby chain), in the standalone installation. The integrated workspace audit also reports development-tool advisories through Better Auth optional peers under production-omit; consult the coordinator’s lockfile audit rather than inferring a clean production dependency graph from this standalone install. Do not apply the suggested incompatible downgrade automatically; reassess the root workspace lockfile before release.

## Boundaries and remaining evidence

The initial test invocation failed because the sandbox denied a localhost listener; rerunning with local socket access passed. The documentation's `/config` import for `readD1Migrations` does not exist in the installed plugin; the actual package exports it from the main module. An initial close handler echoed reserved WebSocket code 1005, producing runtime exceptions; it now normalizes reserved codes and the corrected run has no unhandled exceptions. The earliest attempted Workers-types date did not exist; the tested version is pinned in `package.json`. These failures did not establish parity or platform incompatibility.

`bootstrapOperator()` is an imported test/operator function with no HTTP route. It explicitly creates the chosen account and records a one-time marker. Its check/create/marker sequence is **not safe for concurrent operators**; production requires a serialized authenticated operator ceremony, last-admin protection, audit records, and recovery authorization. Admin-issued password replacement is exercised; short-lived single-use recovery tokens and a user-facing recovery flow are not implemented. Site-admin project access is deliberately absent. Public signup and impersonation are disabled. No production authentication secret is checked in; the test secret is injected only by Vitest configuration.

Read-only `wrangler whoami` confirmed existing OAuth access and two accounts. The user then selected the intended account; read-only matching resolved a unique account and the coordinator reviewed an isolated hosted proof before resource creation. No account identifiers, OAuth tokens or secret values are recorded here. The separate remote harness and observed results are documented below.

Platform G1 assessment: the selected stack works for the covered local and hosted operations. Hosted heap usage, full revocation linearization, admin recovery/audit/last-admin invariants and broader production load/recovery remain unproven. T04 and later delivery phases are outside this contribution.

Primary references consulted: [Cloudflare Vitest setup](https://developers.cloudflare.com/workers/testing/vitest-integration/write-your-first-test/), [runtime test helpers and eviction](https://developers.cloudflare.com/workers/testing/vitest-integration/test-apis/), [Better Auth Drizzle adapter](https://better-auth.com/docs/adapters/drizzle), [Better Auth admin API](https://better-auth.com/docs/plugins/admin). Package source/types were checked when the documentation differed from the installed release.

## Isolated hosted investigation

After the user selected the staging account, read-only discovery resolved a unique match. The coordinator reviewed the exact new-resource plan before provisioning. Two disposable namespaces were exercised on that selected account; no existing resources, production resources, custom domains, account plan, or hash parameters were changed. [remote-attempt1.json](evidence/remote-attempt1.json) preserves the initial failed setup attempt: upload, hosted health and assets passed, but setup returned non-200. Its HTTP status/body were not captured, so its cause remains unclassified. All resources were deleted and absence verified.

A fresh attempt added a protected, read-only readiness endpoint to establish that both secrets and the configured origin had reached the current deployment before submitting one-time setup. It also added setup status/error-phase capture, table existence checks, aggregate D1 diagnostics on failure, and sanitized hosted tail measurements. These changes improve observation; they do not prove the first failure's cause.

The fresh hosted run passed **28 covered checks**, recorded in [remote-runtime.json](evidence/remote-runtime.json): D1 migrations and one-time setup, actual Worker/static assets, three password logins with secure cookies, private R2 owner download and anonymous/cross-project/global-admin denial, role escalation and authenticated hostile-origin rejection, SQLite DO acknowledgment, WebSocket reconnect/deduplication, admin suspension, rejection of the suspended user's existing socket, and logout. The hosted Worker startup measurement was **112 ms**. Cloudflare tail reported setup **524 ms CPU / 2295 ms wall** for three password hashes and initialization; the three login requests consumed **166, 119, and 117 ms CPU** (362, 253, and 256 ms wall). Their tail outcomes were `ok`, with no exceeded-CPU or memory-limit outcome in this sample. This demonstrates actual hosted hashing, and does not establish free-tier CPU compatibility or justify reducing the default hash work factor. The selected account's plan was not changed. Hosted isolate heap usage remains unmeasured.

Both namespaces were cleaned up: exact Worker deletion, private fixture object/bucket deletion and D1 deletion succeeded; D1/R2 listings showed the created names absent, and authenticated direct read-only lookups returned **404 for each exact deleted D1 ID and R2 bucket name**. The Worker returned 404/error 10007. Namespace enumeration returned zero rows (below the explicit 100-row page limit), so pagination was complete and there were **zero remaining DO namespaces owned by either exact script name**. Local forced eviction of a live hibernating socket is separately proven by the local suite; the hosted test proves reconnect/revocation and does not claim forced hosted hibernation or production load/recovery.

For reproduction, select an account explicitly and provide a private JSON file containing only `{"accountId":"<selected account id>"}`:

```sh
cd web/platform-proof
node scripts/remote-smoke.mjs /path/to/private-selected-account.json
```

This command **creates and then deletes isolated remote resources**; use it only with authorization for the selected staging account. It generates an unpredictable `g1-feasibility-` namespace and configuration, uses the separate `src/remote-smoke.ts` entry point, applies the standard auth and extra setup-marker migrations, sends random secrets through stdin, runs the smoke, and attempts cleanup in `finally`. It never deploys the ordinary app to production. Secrets, account identifiers, raw tail and CLI logs are excluded from Git; generated secrets/raw tail are removed after verified cleanup. `ws` 8.21.0 is a direct development dependency for the hosted WebSocket client. The remote-only wrapper was tested locally in workerd along with the original nine tests: **10/10 passed**, and TypeScript passed; see [remote-harness-local.log](evidence/remote-harness-local.log).

Platform G1 has successful local and hosted evidence for the covered stack; release still requires admin bootstrap/recovery/audit/last-admin safeguards, full revocation race semantics, hosted heap/budget analysis and broader recovery/load evidence. Later delivery phases remain outside this proof.

Coordinator integration additionally passed 12 tests across three files, including malformed/oversized socket commands and a GZIP/XML edit/export with opaque XML in workerd. The shared workspace audit reports six high findings (five with `--omit=dev` through Better Auth’s optional Vitest peer); the dry-run Worker bundle contains none of the Vitest/picomatch/tinyglobby module paths.

## Authenticated imported radius proof

`src/radius-index.ts`, `RadiusRoom` and `wrangler.radius.jsonc` form a separate local integration proof. The regular transport Worker and remote harness remain separate. The original integration proof exercises `setOuterRadius` on an explicitly sized BodyTube without a preset; the next subsection extends that same endpoint. The server imports preserved bytes, derives the bounded projection itself, and invokes the generated `ImportedTubeProof` Java export. Client snapshots, XML replacements and effects are rejected; client author IDs have no authority. The API uses the shared protocol/model/project/branch/epoch/operation/precondition envelope, with `main`, epoch 1, exact sequence and complete intrinsic inputs plus automatic/preset expectations and the whole source archive hash. This conservative conflict rule also protects unknown document content and simulation statuses; independent-field concurrency remains unproved.

The original import and accepted revisions are immutable private R2 blobs. After asynchronous parsing, Java execution, ZIP encoding, R2 writes and D1 session revalidation, the DO rechecks membership and the exact source sequence/hash. A synchronous SQLite transaction stores the authoritative archive bytes, identity sidecar, sequence and original acknowledgment before returning it. A conflict can leave an unreachable private blob, but cannot publish partial state. There is one import, one branch, and a 32-operation retry window; this is not the T07 history/compaction implementation. No public setup route exists: test setup uses trusted DO bindings. Export authorization is independent of knowing the hash. The imported result data has no verified web provenance; the state labels it unverified, then stale after edits. No server simulation runs.

The actual local workerd test passed two owner sessions/projects, 26 denied requests, exact retry after forced object eviction, simultaneous identical retries, persisted XML/sidecar/acknowledgment, R2 export bytes, client-author forgery, both directions of isolation and competing asynchronous commands (one acceptance, one conflict). Whole XML comparisons mask only radius/thickness and simulation status spans; attachments, component UUIDs, sidecar identities and raw `flightdata` remain exact. An independent annular-cylinder mass calculation also passes. TypeScript, the existing 12 platform tests, 36 codec tests (37 with the supplied file), both contract tests and all seven fixture manifests pass. The existing Java workerd transcript still passes. The radius Worker bundle dry-run reports 3760.97 KiB / gzip 665.75 KiB, without deploying.

With the supplied `example rocket.ork`, normal radius `0.03` m and stress radius `0.0005` m pass actual desktop document-setter comparisons, desktop save/reload and motor-curve checks. Shrinking clamps thickness to `0.0005` m. All 17 components, five motor assignments, six simulations and 5,540 stored points survive. Two current simulation statuses become outdated; their stored results remain unchanged. Intrinsic masses are respectively `0.29793458815144097` and `0.0011071757909413827` kg; the document's mass/CG overrides remain intact. The original rounded motor curves still require the exact bundled catalog for this desktop oracle. Its empty component-preset database still reports missing Top Flight PAR-36. No Swing interaction or flight rerun is claimed.

The first codec-only comparison failed because it changed two numeric fields without invalidating results. [Failure evidence](evidence/radius-initial-failures.json) and its [status diff](evidence/radius-status-failure.diff) preserve that finding. An initial eviction test also failed because unread RPC response streams retained the DO; draining responses fixed the harness. Final review also exposed simultaneous identical requests returning `[200,409]`: both passed the initial duplicate lookup before either committed. A workerd barrier regression reproduced this; rechecking the operation inside the SQL publication transaction now returns the same acknowledgment twice (`[200,200]`), with one sequence increment. The final [integrated result](evidence/radius-user-example.json) contains source/artifact hashes and both desktop reports. Raw archives/logs remain in `/tmp/g1-radius-user-integrated`; `normal.ork` is the ordinary test edit and `shrink.ork` is the thickness stress case. The original upload remains untouched. Local wall times in the report are not hosted CPU or heap measurements.

From a checkout with installed workspace dependencies, Java 17 and local socket permission (use a `/tmp` worktree if this filesystem rejects workspace symlinks):

```sh
./gradlew -I web/packages/ork-format/jvm/classpath.gradle :core:orkProofClasspath -Dork.proof.classpath=/tmp/ork-radius-classpath.txt --no-daemon
cd web
npm run build --workspace @openrocket/engine-proof
ORK_RADIUS_INPUT='/home/colin/rocketry/openrocket/example rocket.ork' \
ORK_RADIUS_OUTPUT=/tmp/openrocket-radius-proof \
ORK_PROOF_CLASSPATH="$(cat /tmp/ork-radius-classpath.txt)" \
ORK_PROOF_MOTOR_CATALOG="$PWD/../core/src/main/resources/datafiles/thrustcurves/initial_motors.db" \
npm run proof:radius --workspace @openrocket/platform-proof
```

Omit `ORK_RADIUS_INPUT` and `ORK_PROOF_MOTOR_CATALOG` for the generated three-component fixture; that complete workerd/JVM path also passes without the user's file. The runner checks the reducer and facade against the engine build manifest, writes exported archives and reports through a Node test reporter, and compiles the desktop oracle with the supplied test-runtime classpath. Node/JVM are development tools only. The Worker imports neither filesystem APIs nor a JVM service. The user's archive is not added to Git.

G1 remains held: this proves one imported numerical command, not full imported-model construction, presets/configuration listeners, mutable preference isolation, arbitrary graphs/extensions, full provenance/upload/sharing, or hosted domain-reducer CPU/heap bounds. The next investigation is an actual preset-backed/configuration-dependent import with the same full-document comparison and runtime budgets. No new remote resource, production deployment, or later delivery phase was started.

## Imported preset and configuration proof

`npm run proof:effects` reuses `RadiusRoom`, its authenticated `/radius/:project/...` endpoints, generated Java reducer, private R2 revisions and SQLite publication transaction. It adds exact catalog-backed radius inputs and `resetDeploymentConfiguration` for one identified parachute/configuration. The transaction-level deduplication recheck remains before the source-revision check. One branch/epoch and 32 accepted operations remain the proof limits. Unsupported projections appear explicitly in the state response and refuse commands. Per-simulation statuses reflect the preserved XML; accepted no-ops alone do not mark the imported results stale.

The [evidence artifact](evidence/imported-effects.json) records ten complete relevant JVM/Workers state comparisons, full desktop serialization equality, desktop export/reopen/save/reload, and exact lexical/attachment checks. Both generated fixtures have 13 components, two decals, five motor assignments, six historical simulations and 3,014 stored points. One duplicated simulation shares a configuration with another, so a real reset must stale both while leaving four others current. The two projects use different preset geometry/density and deployment defaults. Rocket and per-configuration modification-ID changes are compared too; independent annular-cylinder mass and centroid checks cover both presets. Equal-radius edits retain the attached preset; shrinking to `0.0005` m clears it and clamps thickness. Removing an override equal to the default emits no functional event, and inherited resets preserve original bytes.

The fixture generator uses the actual desktop `ComponentPresetFactory`, registers digest-matched records in the test DAO, attaches them, and saves standard archives derived from `A simple model rocket.ork`. A test-only catalog bridge is checked against the factory. The generator then adds unknown namespaced XML, an opaque attachment, a throwing imported script and a shared-configuration simulation. Historical result statuses are deliberately set to `loaded` to exercise invalidation; no claim of fresh result provenance or simulation execution is made. Desktop import disables the script through its normal trust behavior. The Worker treats it only as XML data. Full desktop comparisons cover the desktop's semantic projection; separate lexical comparisons cover unknown data that desktop ignores.

The workerd test passes interleaved projects, 28 rejected requests, unchanged exports after unsupported imports/commands, stale sequence/catalog preconditions, exact retry after forced eviction, simultaneous identical requests (`[200,200]`, one sequence increment), and competing commands (`[200,409]`). A barrier puts both racing requests after their initial deduplication lookup. Every winning export, including the race winner, is compared with the actual desktop action. Sidecar identities persist outside the desktop ZIP. All original attachment bytes and `flightdata` remain unchanged. The old generated-radius and user-file radius proofs also pass; the user's file remains unmodified and untracked.

The final reducer is **1,775,189 bytes**, SHA-256 `55f72cb21b58d80e876d8b7b1d08a64ae0b347f63f8738749b4d8f6f6066eb4d`. The browser artifact remains the previously tested 2,580,479-byte artifact with SHA-256 `64aebc15f1c7178e563bd037856054a36709a4fd140b8a80d89cc92778340421`; no browser-reachable behavior changed and Chromium was not rerun in this follow-up. The integrated dry-run bundle is **4130.35 KiB / gzip 732.34 KiB**. Eight observed local authenticated command wall times ranged from **108 to 348 ms**; the workerd test including setup and preservation assertions took **28.258 s**. These host-clock measurements include authorization, archive processing and local storage. They are neither hosted CPU nor isolate heap measurements. Hosted domain-command CPU, isolate heap, process CPU/RSS, worst-case input budgets and production latency remain unmeasured here.

From the repository root in an isolated `/tmp` worktree at the implementation revision (Java 17, Node 22.12+, npm and local socket permission):

```sh
npm ci --prefix web
./gradlew -I web/packages/ork-format/jvm/classpath.gradle :core:orkProofClasspath -Dork.proof.classpath=/tmp/g1-effects-classpath.txt --no-daemon
npm run build --prefix web --workspace @openrocket/engine-proof
ORK_PROOF_CLASSPATH="$(cat /tmp/g1-effects-classpath.txt)" \
ORK_EFFECTS_OUTPUT=/tmp/g1-imported-effects \
npm run proof:effects --prefix web --workspace @openrocket/platform-proof
npm test --prefix web
npm run typecheck --prefix web --workspace @openrocket/platform-proof
npm run test:workerd --prefix web --workspace @openrocket/engine-proof
cd web/platform-proof
npx wrangler deploy --dry-run --config wrangler.radius.jsonc --outdir build/effects-bundle
```

The runner produces `evidence.json` (deduplicated relevant snapshots, hashes, outcomes and measurements), `integrated.json` (full raw comparisons), standard `.ork` exports, each desktop re-save and per-stage logs. Initial failures are retained in [the failure record](evidence/imported-effects-failures.json) and the linked compiler/catalog logs. Existing checks passed: 41 codec tests, two contract tests, seven fixture manifests, 12 platform tests, the original reducer transcript and 66 relevant core tests in the four I/O/digest classes plus `BodyTubeComponentTests` and `BodyTubePresetTests`. No full desktop suite, Swing interaction, browser rerun, simulation rerun, hosted command or deployment was performed.

G1 remains held. This closes one actual preset load/clear path and one configuration-dependent reset, with explicit rejection boundaries. General preset catalogs, automatic geometry dependencies, broader flight configurations/listeners, arbitrary graphs/extensions, mutable preference isolation, numerical divergence, heap/budget evidence, absolute-resource handling, desktop identity reconciliation and existing dependency advisories remain open. Process-global preferences remain immutable; explicit density/deployment values do not establish arbitrary per-user defaults. Next investigate an imported automatic neighbor/ring dependency and its complete derived state, using these same archive/JVM comparisons, before broadening command acceptance. T04–T13 remain gated. Nothing was deployed or pushed.

AI assistance for this follow-up: Codex using GPT-6 (runtime-supplied family; exact variant unavailable) implemented and reviewed the proof. No subagents were used. Executable workerd, JVM and Node checks supplied verification; no human contributor declaration or PR was submitted.

## Automatic centering-ring proof

The same `proof:effects` runner accepts `ORK_EFFECTS_AUTOMATIC_RING=1`. It generates the two existing desktop-valid preset fixtures with one direct child centering ring whose outer radius is automatic and whose explicit hole, material density, length and TOP offset differ between projects. It reuses the authenticated endpoint, Java reducer, preserved archive, private R2 and atomic SQLite publication. The command envelope stays `setOuterRadius`; preconditions gain the ring relationship/inputs and configuration IDs. The ring's derived geometry is returned under its own component identity. Its XML, including the `auto` token, stays exact.

The automatic run checks 11 accepted actions against complete relevant JVM state, full desktop XML and desktop save/reload. It covers equal-radius preset retention, growth/preset clearing, fitting shrinkage after the preset is gone, configuration result invalidation, both directions of project isolation, stale ring preconditions, unsupported inputs, forced eviction/exact retry, simultaneous identical requests and competing radius commands. The retry race still goes through the transaction-level deduplication recheck. Attachments, IDs, sidecar simulation identities, stored series and unknown/script XML are preserved; no script or simulation is executed. Independent expectations check annular-cylinder mass/CG/inertia and bounds. Repeated core reads are primed before the edit and checked after the ordinary event path.

The runner also preserves a desktop-only failed round trip as `underfit/report.json`, `expected.xml`, `actual.xml` and `underfit.ork`. With tube radius `0.0005` m and ring hole `0.006` m, the live model has automatic ring outer radius zero; reopen instead sets it to `0.006` m and disables automation. This is an explicit rejection boundary in the endpoint, not a repaired input. The committed [control](../packages/ork-format/evidence/automatic-ring-underfit.json) and [diff](../packages/ork-format/evidence/automatic-ring-underfit.diff) reproduce the finding. Fitting shrink to `0.012` m succeeds. The core baseline, exact two reviewed I/O fixes, preset factory/digest verification and motor checks remain unchanged.

After the classpath/build setup in the preceding section, run from the repository root of the isolated `/tmp` worktree:

```sh
ORK_PROOF_CLASSPATH="$(cat /tmp/g1-effects-classpath.txt)" \
ORK_EFFECTS_AUTOMATIC_RING=1 ORK_EFFECTS_OUTPUT=/tmp/g1-automatic-ring \
npm run proof:effects --prefix web --workspace @openrocket/platform-proof
```

For optional local process measurements on systems with Python's `os.wait4`, replace the npm command with `python3 web/platform-proof/scripts/measure-imported-effects.py` and keep those environment variables. The wrapper retains `process-runner.log` and `local-process.json`, including per-child OS `wait4` user/system CPU and maximum reported process RSS. Historical artifacts from the previous wrapper retain their `RUSAGE_CHILDREN` labels. These values cover the development process tree, including javac, Java desktop oracles, Vitest and workerd; they are neither per-request hosted CPU nor isolate heap. Current artifacts, measured values, exact checks and skipped budgets are retained in `evidence/automatic-ring.json` and `evidence/automatic-ring-validation.json`.

Local reducer/codec/oracle checkpoint: `15cc000ed`. G1 remains held for broader automatic graphs (including sibling-dependent automatic inner radii), the underfit reload gap, mutable preference isolation, general catalogs/configurations/extensions, numerical parity, unmeasured hosted CPU/heap, absolute archive resources, desktop identity reconciliation and dependency advisories. The next bounded investigation is the ring's automatic inner-radius dependency on overlapping sibling InnerTubes; keep rejecting that input until its full read/effect set and desktop reload behavior are established. T04–T13 remain gated. No resources were deployed or commits pushed.

AI assistance: Codex using GPT-6 (runtime-supplied family; exact variant unavailable), without subagents, implemented and reviewed this follow-up. Executable workerd, JVM and Node checks supplied verification; no human contributor declaration or PR was submitted.

## Sibling-dependent automatic inner radius

The existing `proof:effects` runner accepts `ORK_EFFECTS_SIBLING_RING=overlap`, `apart-before`, `apart-after`, `partial`, `contact-start` or `contact-end`. These generate desktop-valid both-automatic rings and explicitly sized sibling InnerTubes with different geometry/materials in the two authenticated projects. Exact contact uses binary-exact offsets and lengths; the test asserts actual Java relative endpoints equal zero or the sibling length and independently expects contact to count. Separated fixtures independently expect no hole. Independent annular-cylinder formulas check ring/sibling mass, local CG/CG weight, inertias and bounds, including zero-mass capped rings.

All geometry runs in the pinned Java methods in workerd. The [contract](../../docs/web-app/g1-contracts.md#sibling-dependent-automatic-inner-radius) records sibling selection, absolute/relative positions, instances, outer-radius dependencies and the cap, including the necessary preceding nose-cone length. Only the supported graph is editable. The same endpoint, private R2 preservation and SQLite publication/deduplication transaction are reused. Imported scripts and simulations are never run. Both automatic tokens, sibling/descendant XML, IDs/parents, configuration and motor references, attachments, unknown XML, historical series and sidecar identities remain exact.

Each interval run compares accepted commands with complete relevant actual-document JVM state, primed/repeated geometry reads, event/configuration effects, full desktop serialization and export/reopen/save/reload. It exercises equal-radius preset retention, growth/preset clearing, subsequent shrinkage, binding/nonbinding/zero caps, different interleaved projects, stale sibling preconditions, unsupported imports/commands, eviction and exact retry of both configuration and zero-cap radius commands, simultaneous identical retries and competing radius commands. Rejected commands publish no revision; the transaction-level duplicate recheck still returns two successes with one sequence increment. The older explicit-hole proof is run separately and must continue rejecting underfit edits while retaining its desktop reload failure.

From the isolated `/tmp` worktree, after the documented classpath and engine build:

```sh
for sibling_case in overlap apart-before apart-after partial contact-start contact-end; do
  ORK_PROOF_CLASSPATH="$(cat /tmp/g1-inner-classpath.txt)" \
  ORK_EFFECTS_SIBLING_RING="$sibling_case" \
  ORK_EFFECTS_OUTPUT="/tmp/g1-sibling-$sibling_case" \
  python3 web/platform-proof/scripts/measure-imported-effects.py || exit 1
done
ORK_PROOF_CLASSPATH="$(cat /tmp/g1-inner-classpath.txt)" \
ORK_EFFECTS_AUTOMATIC_RING=1 ORK_EFFECTS_OUTPUT=/tmp/g1-explicit-hole-regression \
python3 web/platform-proof/scripts/measure-imported-effects.py
```

Create `/tmp/g1-inner-classpath.txt` using `:core:orkProofClasspath` as shown above; the filename is only a development output. Each output directory contains the generated archives, accepted exports, desktop re-saves, full raw comparisons, compact evidence and local process measurements. No hosted resources are used. Request wall times include authentication/archive/storage work; process CPU/RSS include javac/JVM/Vitest/workerd. They do not measure hosted command CPU or isolate heap. G1 remains held for the documented broader parity, preference, interoperability, dependency and budget gaps; no T04–T13 work is authorized by these proofs.

The measurement wrapper now collects the specific Node child with `os.wait4`, excluding usage inherited from earlier shell children. The [initial-failure record](evidence/sibling-ring-initial-failures.json) retains the misleading aggregate control and a two-child probe demonstrating the distinction. Corrected CPU/RSS conclusions use only `wait4` observations; request wall times remain separate.
