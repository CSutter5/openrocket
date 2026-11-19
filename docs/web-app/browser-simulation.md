# Bounded local browser simulation

The November 18, 2026 user request authorizes one local browser simulation workflow after `83be8bf50`. It does not close G1/G5 or authorize hosted/backend compute, general catalogs/configuration editing, extensions or broad compatibility. [ADR-17](architecture.md#adr-17-add-one-archive-bound-browser-flight-profile-in-a-separate-worker) records the runtime boundary. The [app guide](../../web/app/README.md#bounded-local-flight-simulation) gives controls and precise supported inputs.

The source fixture generator is `web/app/test/SimulationDesktopProof.java`. It uses the actual desktop model/saver and the proven `FlightProof` geometry, with explicit 950 kg/m³ bulk materials, 0.067 kg/m² canopy and 0.0005 kg/m cord. The embedded eight-point synthetic C6 curve has core motor digest `7488ddc81508bcd347794b6c6bb01caf` and RSE SHA-256 `eb12c5e9867ad085f65dbff49ae7bad400f1ac8fd982ef49072203a8be897a86`. It is synthetic, not a certified measurement. The runtime requires the exact curve bytes and independently recomputes the pinned Java functional digest before flight. No catalog lookup substitution occurs.

`simulation/input.ts` checks every rocket node, ordered child and attribute against a desktop-generated profile, including fixed IDs/configuration links, explicit materials/positioning, absence of overrides/presets, full fin geometry, ignition and recovery setup. Only names and explicit BodyTube dimensions vary. It transports complete scalar inputs, names, IDs, materials and resolved motor data to `ImportedFlight`. The Java class reconstructs all seven components and executes Java automatic line length/CD and the real physics engine. Unsupported/imported simulation/extension behavior refuses visibly without changing the archive. This deliberately strict profile is the supported input contract, not arbitrary reconstruction.

Each job binds the exact accepted archive SHA-256 (the existing contract's `archiveTreeHash` field holds the exact exported-byte hash here), identity sidecar, transported model hash, settings, seed, stepper, engine JS and material/motor hashes. The simulation Worker reimports/rechecks this binding. Result publication requires the active worker, job token and input hash. Cancellation and restart terminate only the flight Worker. Accepted edits/replacement imports do not accept a returned older document; old results are visibly stale. Unit switches preserve input hashes and canonical SI data. Results remain browser-client/session-only and never enter exports or replace imported stored results.

The combined production-build Chromium acceptance passed on November 18, 2026, alongside the retained GP/drawing/property/units/desktop round trips. [Compact evidence](browser-simulation-evidence.json) records the runtime source/artifact hashes, complete comparisons and observed lifecycle behavior. The acceptance harness records raw browser/JVM series and compact comparisons under `web/app/build/gp/` (or `ORK_POC_OUTPUT`). It compares the desktop-loaded archive with the reconstructed complete rocket/configuration serialization before running. Document-only material catalog history is excluded from simulation inputs and never rewritten; running never calls a Java archive saver in production.

Both steppers retain the existing fixture-specific limits: row/event time 0.001 s, row altitude 0.12 m, speed 0.25 m/s, acceleration 3 m/s²; summary altitude 0.001 m, speed 0.000001 m/s, apogee/flight time 0.001 s; structure mass 1e-12 kg and CG/CP 1e-10 m. The original proof bases the row bounds on propagation over 1 ms at roughly 120 m/s, 250 m/s² and 3000 m/s³, including the 120 N/s thrust slope at about 0.04 kg launch mass. This sample retains that geometry/curve and similar mass/speed scales. These are provisional per-fixture regression bounds, not approved general numerical parity. No limit is widened for this increment. Independent trapezoid/linear motor checks expect 10.4 N·s, 6 N at 0.05 s and 9 N at 0.2 s; independent annular-cylinder mass and midpoint CG check the UI-edited body.

AI assistance: Codex using GPT-6 (runtime-supplied family; exact variant unavailable), without subagents, implements/reviews the bounded workflow and runs the checks. No PR is published. A human contributor remains responsible for review.


All four comparisons have ten matching events and zero warnings. Structure mass, CG and CP match exactly. With the body length changed in the UI from 0.30 m to 0.35 m, the RK6 peak changes from 329.7594638599455 m to 322.8763300201796 m and both corresponding JVM references pass. The complete desktop-loaded rocket/configuration serialization matches the reconstructed model before simulation, including materials, fin geometry, positions, motor references and recovery. Motor curves, relevant inputs, warning lists, event order/times, summaries and every time/altitude/speed/acceleration row are compared.

| Input / stepper | Rows | Maximum row time error (s) | Maximum row altitude error (m) | Maximum row speed error (m/s) | Maximum row acceleration error (m/s²) |
| --- | ---: | ---: | ---: | ---: | ---: |
| Sample RK4 | 689 | 6.139e-9 | 3.996e-7 | 2.196e-7 | 2.524e-7 |
| Sample RK6 | 706 | 7.029e-5 | 0.00483637 | 0.00273238 | 0.00231367 |
| Edited RK4 | 653 | 1.507e-11 | 9.612e-10 | 5.268e-10 | 4.201e-10 |
| Edited RK6 | 667 | 1.957e-9 | 1.648e-7 | 1.060e-7 | 7.288e-7 |

The largest summary errors are 4.445e-6 m altitude, 1.862e-7 m/s speed, 2.001e-5 s apogee time and 9.113e-8 s duration. Maximum event-time error is 9.113e-8 s. These are observations for these fixtures, not bit identity or general numerical certification.

The page recorded 68 and 81 ten-millisecond heartbeat ticks while the two sample Java flights computed. Chromium acknowledged a computing flight, clicked the actual Cancel button, observed no genuine completion for 200 ms and rejected an injected late completion. The document Worker was never terminated. Active-run restart with a different stepper also rejects the superseded Worker's late result. Actual accepted edits and replacement import during computation retain the current document and label the older completion stale. A deliberately failed worker startup recovers on rerun. Unit-only switches retain the input hash/current marker. Run/cancel exports preserve exact accepted bytes, including an inert XML comment and opaque binary attachment; richer existing fixtures retain their opaque XML, scripts-as-data, assets, IDs/references and stored series through the original round trips.

Reproduce from `/tmp/openrocket-editor-next` (Java 17, Node 22.12+, tested here with Node 26.13.1 and Chromium 149.0.7827.55):

```sh
npm ci --prefix web --offline --cache /tmp/openrocket-editor-npm-cache
node web/engine-adapter/scripts/build.mjs
./gradlew -I web/packages/ork-format/jvm/classpath.gradle :core:orkProofClasspath -Dork.proof.classpath=/tmp/openrocket-simulation-classpath.txt --no-daemon
npm run build:app --prefix web
ORK_PROOF_CLASSPATH="$(cat /tmp/openrocket-simulation-classpath.txt)" PLAYWRIGHT_BROWSERS_PATH=/tmp/openrocket-g1-browsers ORK_POC_OUTPUT=/tmp/openrocket-editor-next/web/app/build/complete-simulation-acceptance npm run test:app --prefix web
npm test --prefix web
PLAYWRIGHT_BROWSERS_PATH=/tmp/openrocket-g1-browsers node web/engine-adapter/scripts/browser.mjs
node web/engine-adapter/scripts/workerd.mjs
npm run dev:app --prefix web
```

All commands above succeeded. The dev smoke served HTTP 200 on port 5174 because an existing server used 5173; the smoke instance was then stopped and the existing server was preserved. The build preserves source/preset/motor checks and original/adapted JVM transcript equality. Workspace regressions pass 2 contract tests, 7 fixture manifests, 49 codec tests and 12 authenticated local platform tests. The original browser proof still passes its 716/733-row flights and existing numerical limits; the reducer-only workerd proof also passes. After adding the already-used internal contracts dependency to the app manifest, clean offline installation and rebuild produce byte-identical production assets to those used by the combined acceptance. The final acceptance harness also links the separate simulation report from the GP record; GP remains the finite editor gate.

Initial development failures were resolved: the existing MD5 bridge lacked the incremental calls used by `MotorDigest`; a generic scalar bound rejected the known fillet shear modulus; one test compared Buffer/Uint8Array prototypes despite equal bytes. Expanding the refusal matrix caused rapid-download timeouts despite successful app preparation; spacing test downloads by 250 ms resolves the observed timeout, consistent with browser burst-download throttling. No application workaround or numerical tolerance widening was used. npm reported blocked esbuild/workerd postinstall scripts; their installed platform binaries nevertheless passed the actual builds and workerd tests. Gradle/cache and loopback browser checks required sandbox escalation; no approval remained blocked.

The main NAS checkout was never used for npm installation and no checkout was relocated. The prepared worktree started clean at the expected checkpoint. The last measured available `/tmp` space was about 2.7 GiB, so no unrelated source/evidence or outputs were cleaned. A limited public GitHub [issue](https://github.com/openrocket/openrocket/issues)/[PR](https://github.com/openrocket/openrocket/pulls) index search did not identify duplicate work for this local slice; it was not exhaustive and no maintainer was contacted. The user archive remains untracked and SHA-256 `e862a60191b1d13306cb9de0263ce6e60bed347293a03d50338551aa9b4363dc` is unchanged. Nothing was pushed, deployed or published.

No bounded-workflow blocker remains. Swing GUI, live OpenGL, other browsers/platforms, broad input/numerical compatibility, hosted benchmarks and the wider T10/G1/G5 gates were not exercised or claimed. Stop at this local increment.
