# G1 feasibility evidence

Recorded November 17, 2026 (America/Chicago). The desktop reference remains `33bdb6d3062a6d9ef44a00d1ff865f962136e9e9`, 26.11.beta.01. The initial checkout was clean on `web` at planning commit `f181e8c5f`; implementation uses `web-g1-feasibility` with isolated engine, file, platform and integration worktrees. No desktop production sources or dependencies were changed. These executable proofs implement the first investigation milestone; **G1 is not passed**, and T04–T13 remain outside this task.

The four proofs now run, including a hosted platform smoke. Their bounded success does not satisfy every named G1 exit criterion. In particular, trusted edits have not established complete flight-configuration/preset effects or mutable preference isolation, the engine excludes real catalogs/document/extension initialization, general numerical tolerances are unapproved, and browser/Worker heap usage is unmeasured. Full desktop parity remains the target. No Containers, external compute service, production deployment, account-plan change, push or PR was used.

Local implementation checkpoints: `f3227a363` (contracts/fixtures), `ee529854c` (archive/browser/desktop proof), `8904955dd` (local platform/auth and lockfile), `1f0d105df` (hosted smoke and cleanup), and `5fb6bd2d9` (engine/reducer). The final handoff commit contains this gate assessment and contract alignment. Use `git log --oneline f181e8c5f..HEAD` for the complete local series.

## Contracts and provenance

The [minimum T00 contracts and fixture selection](g1-contracts.md), executable `web/packages/contracts`, and `web/fixtures/baseline.json` establish version 1 negotiation, project/branch/epoch command boundaries, lexical archive preservation, sidecar identity and immutable completed-result provenance. Two contract tests check that changing any relevant input makes an old result stale and reject incomplete manifests. The same provenance functions execute in workerd. Saved-result upload/sharing is not implemented; these remain attributed browser results bound to their exact inputs, not server-certified calculations.

The initial public issue/PR search and the old TeaVM port evaluation are recorded beside those contracts and in the engine ledger. No maintainer discussion was fabricated. This authorized local feasibility contribution does not substitute for upstream discussion of the eventual broad feature. Full screen/action discovery remains incomplete; existing parity rows retain their owners and gates.

## Observed proofs

| Proof | Executed behavior and evidence | Remaining G1 limitation |
| --- | --- | --- |
| Engine | Current core compiled with TeaVM 0.15.0; real Chromium 149 Web Worker ran atmosphere, seeded wind, mass/CG/CP and single-stage seeded RK4/RK6 flights. All 716/733 captured rows, ten events, warnings and scalar metrics were compared with JVM. Algebraic gas/cylinder/motor expectations passed. Main-page responsiveness and terminating an active flight passed. [Engine observations and patch ledger](../../web/engine-adapter/README.md). | One synthetic geometry/curve, shared bounded startup/document holder, no real catalog lookup or extension initialization, approximate collation, no browser heap measurement. Numerical differences remain. |
| Trusted editing | Separate smaller generated Java reducer ran in local workerd. JVM transcript comparison, real radius setter/thickness/automatic-neighbor/component-listener effects, stage move, rejected inputs, deduplication and interleaved two-project isolation passed. | Fixed documents and immutable fixture preferences; preset starts absent; full flight-configuration listeners and arbitrary compatible graph cycles are not established. Strict sequence rejection is narrower than independent-edit concurrency. No durable application endpoint or reducer→XML transaction integration exists. |
| Files | 28 Node tests passed. Fifteen official examples import/edit/export; one absolute-path archive is intentionally rejected. Chromium and headless desktop loader/saver round trips preserved IDs, two decals, three embedded curves/five motor assignments, five simulations and 2,751 stored points. Full JVM saver XML comparisons and asset hashes passed. Generated current format-1.11 RK6/fixed-seed settings survived both directions. A small GZIP/XML→edit→ZIP opaque-data path passed in workerd. [File evidence](../../web/packages/ork-format/README.md). | Name editing only; historical/missing IDs are preservation-only; desktop sidecar reconciliation, safe absolute-resource handling, image decoding and whole-corpus Workers budgets remain open. Desktop Swing UI was not exercised. |
| Platform/auth | Twelve integrated tests across three files passed in local workerd, including real D1 migrations, Better Auth/Drizzle/admin, private R2, SQLite DOs, hibernating-socket eviction/reconstruction, reconnect, session revocation, hostile origins and malformed/oversized traffic. TypeScript and bundle dry-run passed. Hosted staging passed 28 checks. [Platform evidence](../../web/platform-proof/README.md). | Hosted forced hibernation/load, isolate heap, all revocation races, production bootstrap/recovery/audit and last-admin/owner protections remain unproved. The transport counter is not the domain reducer. |

The generated format-1.11 fixture retains imported historical results while changing the first simulation's options to RK6/fixed seed 8447. It proves preservation of settings and data, not that those historical results belong to the new options. Imported results need provenance classification during later model integration.

## Numerical differences and runtime boundaries

Atmosphere, seeded wind and captured mass/CG/CP matched JVM exactly for the fixture. Browser flights did not. Maximum corresponding-row altitude differences were approximately 0.043072 m (RK4) and 0.00117566 m (RK6); corresponding-row times differed by 0.000426543 s and 0.000015062 s. Maximum-altitude summary errors were 0.000037270 m and 0.000001538 m; apogee-time errors were 0.000142136 s and 0.000007393 s. Row differences include the effect of different sample times. Per-quantity maxima, relative errors, events, limits and their basis are preserved in `engine-adapter/evidence/observed.json` and asserted by the runner. The provisional bounds are regression criteria for this fixture, not general scientific acceptance.

The diagnostic adapted-JVM run matches the original JVM for every captured value, including full flight series. This narrows this fixture's remaining difference to execution as JavaScript; it does not rule out collection-order effects in other geometries. The next numerical investigation is to compare adaptive-step intermediate states and vary TeaVM arithmetic/library implementations, then extend to stage/cluster/recovery fixtures. No physics algorithm was replaced by a TypeScript approximation or the old port's 24.12 numerical core.

The startup shim keeps diagnostic safety checks disabled, matching the desktop default without its debug property; it does not prove debug SafetyMutex/Invalidator behavior. The root-ancestor rejection fixture also has an incompatible parent type, so compatible-type graph-cycle rejection still needs a separate fixture. The bounded move operation only selects between two fixed stages and cannot construct that cycle.

MMRocket Sim `80e8df455e447b98fc94acc15dd4c04ffedc3357` supplied audited GPL startup/API bridge patterns and fixture inspiration; its full harness and claims were not accepted as this baseline's evidence. The adapter retains GPL text, lists reused paths and records every classfile transformation. Native/JAR plugin loading, Guice/ClassGraph discovery and Graal `HostAccess.ALL` do not have a proven closed-world/capability-safe equivalent. Built-in listeners and expressions are classified individually in the ledger. Preserving their XML is not execution parity, and no requirement exception was granted.

Hosted Worker startup measured 112 ms. Cloudflare tail reported 524 ms CPU/2295 ms wall for setup with three default password hashes; login CPU samples were 166, 119 and 117 ms. This proves hosted hashing on the selected account and **does not establish compatibility with a 10 ms CPU budget**. No plan or hash work factor changed. Local Miniflare process RSS and process CPU are separately labeled; they are not isolate heap or production-request measurements. Browser and reducer bundle hashes/sizes are in the engine manifest; the integrated ordinary Worker dry-run measured about 2098.67 KiB / gzip 387.35 KiB.

## Failures preserved and cleanup

Initial TeaVM attempts failed on UUID/concurrent queue/locale APIs, then collation/AWT/concurrent-map APIs. Narrow adaptations resolved those cases. An adapted-JVM diagnostic exposed an incorrect class-to-interface invocation in the key-set rewrite; changing the invocation kind resolved it. All three failure logs are retained beside the final engine observations.

The first hosted attempt passed storage provisioning, migration, upload, health and assets but failed protected setup. Its HTTP status/body were not captured, so its cause remains unclassified. The successful fresh attempt added authenticated secret/version readiness, setup phase/status diagnostics and sanitized tail measurements. This does not retroactively prove a cause for the first failure.

Both disposable namespaces were deleted: direct exact Worker, D1 and R2 API lookups returned 404; complete DO namespace enumeration found no owned namespaces. Sanitized evidence contains no account IDs, tokens, cookies or generated passwords. Existing/production resources and account plans were untouched. Remote reproduction requires explicit staging-account selection and creates/deletes fresh resources; it is not part of the default local suite.

Other observed setup limitations: the main checkout rejects npm workspace symlinks (`ENOTSUP`), so integrated validation used `/tmp` worktrees; an initial desktop invocation used a main-only classpath and failed to resolve `OpenRocketSaverTest`, then passed with the documented core test classpath. Sandbox-denied localhost listeners were rerun with socket access. npm audit reports six high findings in the shared test chain; `--omit=dev` still reports five through Better Auth's optional Vitest peer. The Worker bundle contains none of the Vitest/picomatch/tinyglobby module paths, but no clean production dependency audit is claimed. These findings remain a dependency blocker before delivery.

## Reproduce locally

Use Java 17, the repository Gradle wrapper, Node 22.12+ (observed 26.13.1), and npm (observed 12.2.2). Commands below need local socket access; initial installs/builds need network. If the checkout filesystem cannot create symlinks, first create a detached `/tmp` worktree at the implementation revision and run there. Generated outputs stay ignored or under `/tmp`.

```sh
cd web
npm ci
npm test
npm run typecheck --workspace @openrocket/platform-proof
npm run build --workspace @openrocket/platform-proof
npm run build --workspace @openrocket/engine-proof
PLAYWRIGHT_BROWSERS_PATH=/tmp/openrocket-g1-browsers npx playwright install chromium
PLAYWRIGHT_BROWSERS_PATH=/tmp/openrocket-g1-browsers npm test --workspace @openrocket/engine-proof
PLAYWRIGHT_BROWSERS_PATH=/tmp/openrocket-g1-browsers npm run test:browser --workspace @openrocket/ork-format
cd ..
./gradlew -I web/packages/ork-format/jvm/classpath.gradle :core:orkProofClasspath -Dork.proof.classpath=/tmp/ork-proof-classpath.txt --no-daemon
ORK_PROOF_CLASSPATH="$(cat /tmp/ork-proof-classpath.txt)" npm run test:desktop --prefix web/packages/ork-format
```

The engine build checks baseline source identity, generates both artifacts, runs original/adapted JVM oracles and asserts exact agreement between those JVM transcripts. Browser/workerd runners compare their outputs with that fresh reference. Desktop commands compare actual loader/saver state rather than merely asserting that a document loaded. Package READMEs contain fixture details, metrics, and the separately authorized hosted reproduction command. No full desktop JUnit suite, Firefox/WebKit/mobile rendering or OpenGL tests were run; the production Java application is unchanged.

## Gate decision and next investigation

A subsequent user-supplied `example rocket.ork` adds a real-world failing fixture without changing this gate decision. Its optional Node run passed 29 tests and Chromium preserved the name edit, IDs, six simulations/5,540 stored points and all five embedded curves. The headless desktop resave loses a typed deployment warning's speed; an unchanged desktop-only control reproduces it. Two embedded motors also fail digest resolution with the test catalogs. See the [fixture findings and commands](../../web/packages/ork-format/README.md#user-supplied-example). The original file is unchanged and remains user-owned; only test support and concise evidence were committed.

**Hold G1.** There is executable evidence for all four proof areas, including actual hosted Workers compatibility, but the strict G1 acceptance list is not complete. Continue the existing T01–T03 work packets: establish preset and full flight-configuration effects and request-local preference policy; compare complete relevant state for those inputs; connect accepted effects to the loss-aware archive; investigate numerical divergence and stage/cluster cases; prove catalog/extension boundaries and heap/budget bounds. T02 must resolve or explicitly classify the official absolute-resource archive and identity reconciliation. Dependency advisories need resolution without an untested downgrade. These are concrete investigations within feasibility, not authorization for later editor, history or release phases.

AI assistance: Codex using GPT-6 (runtime-supplied family; exact variant unavailable) coordinated three agents inheriting that identity. AI helped implement and review the proofs and prepare the evidence; executable JVM, Chromium, workerd and hosted checks supplied validation. No human contributor declaration or PR was submitted.
