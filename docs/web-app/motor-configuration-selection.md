# Session motor configuration selection

On November 19, 2026, the user requested selection of an existing motor configuration for a browser flight. This extends the [bounded imported-flight workflow](imported-browser-simulation.md), without adding a motor/configuration editor or changing its physical input limits. ADR-20 records the decision. Development and validation used the user-moved local Btrfs checkout at `/home/colin/Documents/openrocket`, initially clean at `568b56d6b` except the untracked user archive. The old NAS checkout and existing temporary worktrees were not modified.

Choose **Motor configuration** in the flight panel. Each option shows the archived configuration name when present, motor designation, ejection delay, short ID and archived-default marker. A new import selects its archived default. Physical edits, exports and unit-only changes retain the session selection. A selected configuration with no configured motor visibly refuses simulation; selecting a valid configuration recovers. Unknown IDs and ambiguous configuration fields are rejected. The one-stage, one-mount, one/two-parachute, at-most-16-configuration boundary remains in force. All existing references are still reconstructed and verified; this does not make unsupported stages, clusters, extensions or unresolved motors runnable.

The document Worker owns the session choice separately from the accepted archive. Its snapshot action verifies the expected archive and selected ID. That ID travels through provenance and the simulation Worker's independent reimport/binding into the Java model. Native configuration setters reconstruct optional archived names and selected configuration state. Java still resolves the selected mount, ignition/ejection and per-configuration recovery settings, mass and aerodynamics. No physics was added to TypeScript or server endpoints. Source pin `33bdb6d3062a6d9ef44a00d1ff865f962136e9e9`, the two reviewed I/O exceptions, exact digest checks and immutable preferences remain unchanged.

Result freshness includes configuration ID, archive/sidecar hashes and stepper. Changing selection during a flight retains that job's captured input and labels an older completion stale. Starting a new flight supersedes the old worker; late replies cannot replace the newer result. The result displays the configuration that actually ran. Selection changes no archive bytes, archived default, dirty state or stored-result status. New session flights remain absent from exported files.

Production Chromium 149.0.7827.55 passed the actual selector workflow with an independently desktop-generated fixture containing five configurations, named J800T and default J135W cases, differing ejection/recovery settings and an empty-motor configuration. The test checks selection retention across edits/units, import reset, genuine old-input completion after a selection change, superseded completion rejection, real cancellation, unsupported-to-supported recovery and exact original/edited downloads. It compares the complete desktop-loaded/reconstructed rocket and configuration serialization before flight, plus relevant inputs, curves, event order/times, warnings, summaries and every series row. The reference selects the requested ID independently of the reconstructed model. Acceptance has no dependency on the user archive.

| Independent case | Browser/JVM rows | Maximum row time error (s) | Altitude (m) | Speed (m/s) | Acceleration (m/s²) |
| --- | ---: | ---: | ---: | ---: | ---: |
| Default J135W RK4 | 566/566 | 3.67e-12 | 3.64e-11 | 1.48e-12 | 2.43e-10 |
| Default J135W RK6 | 566/566 | 1.51e-12 | 1.39e-11 | 1.65e-12 | 2.30e-10 |
| Selected J800T RK4 | 904/904 | 2.92e-13 | 2.96e-12 | 2.77e-12 | 8.88e-12 |
| Selected J800T RK6 | 912/912 | 4.21e-8 | 1.13e-6 | 1.91e-7 | 2.02e-7 |
| Edited selected J800T RK6 | 908/908 | 1.13e-7 | 2.11e-5 | 6.53e-6 | 5.12e-6 |

All five comparisons pass the unchanged fixture limits: row/event time 0.001 s; row altitude 0.12 m, speed 0.25 m/s and acceleration 3 m/s²; summary altitude 0.001 m, speed 0.000001 m/s and apogee/duration 0.001 s. Maximum observed summary errors across these cases are 8.32e-9 m altitude, 1.63e-10 m/s speed, 3.30e-8 s apogee and 2.20e-9 s duration; maximum event time error is 3.30e-8 s. No tolerance was widened. These remain fixture-specific regressions, not general numerical certification. The prior user-file RK6 limitations remain recorded in the imported-flight evidence. Raw reports and JVM/reference XML stay under ignored `web/app/build/configuration-complete/`.

A separate read-only production UI check ran all five configurations of the user's `example rocket.ork` with RK4: J135W, J800T, J540R, J415W and J1799N. Each completed with its own requested configuration ID and distinct results; the first had zero warnings and the other four each reported one engine warning. The UI retains those warnings. This smoke check does not claim JVM numerical parity for all five user configurations. Downloaded bytes matched the input exactly. The source file remained untracked with SHA-256 `e862a60191b1d13306cb9de0263ce6e60bed347293a03d50338551aa9b4363dc`; no user archive or model data is checked in.

Commands actually run from `/home/colin/Documents/openrocket`:

```sh
npm ci --prefix web
./gradlew -I web/packages/ork-format/jvm/classpath.gradle :core:orkProofClasspath -Dork.proof.classpath=/tmp/openrocket-config-classpath.txt --no-daemon
node web/engine-adapter/scripts/build.mjs
npm run build:app --prefix web
ORK_PROOF_CLASSPATH="$(cat /tmp/openrocket-config-classpath.txt)" PLAYWRIGHT_BROWSERS_PATH=/tmp/openrocket-g1-browsers ORK_POC_OUTPUT=/home/colin/Documents/openrocket/web/app/build/configuration-complete npm run test:app --prefix web
npm test --prefix web
PLAYWRIGHT_BROWSERS_PATH=/tmp/openrocket-g1-browsers node web/engine-adapter/scripts/browser.mjs
node web/engine-adapter/scripts/workerd.mjs
PLAYWRIGHT_BROWSERS_PATH=/tmp/openrocket-g1-browsers WRANGLER_SEND_METRICS=false npm run test:cloudflare --prefix web
npm run preview --workspace @openrocket/local-editor --prefix web -- --port 4173 --strictPort
```

These commands passed (the final preview served the production editor on loopback). The full app suite retained editor, geometry, units, archive/desktop round trips, original sample flights and job/failure/cancellation races. Workspace regressions passed 2 contract tests, 7 fixture manifests, 49 codec tests and 12 authenticated platform tests. The original browser proof retained its numerical limits, recorded 93 page heartbeat ticks and no completion after worker termination. The reducer-only workerd proof and assets-only local Cloudflare dry-run/smoke also passed; no Cloudflare resource, login or deployment was created. The engine artifact is 2,997,968 bytes, SHA-256 `5de3f4476ec863b07e766fd14bedffee81855257e00738454fcaf28e67d7919a`. OpenJDK 17.0.21 and Node 26.13.1 were used. A focused test initially asserted the unsupported indicator before the asynchronous selection was accepted; waiting for the accepted selection fixed the test without changing application behavior or numerical limits.

No task blocker remains. G1/G5, broad numerical/desktop compatibility, other browsers/platforms and hosted performance remain unclaimed. Nothing was pushed or deployed. AI assistance: Codex using GPT-6 (runtime-supplied family; exact variant unavailable), without subagents, implemented/reviewed the selector and ran the checks; the human contributor remains responsible for review.
