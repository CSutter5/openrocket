# Parity and validation

This is the acceptance framework for the [web application plan](README.md), not a completed parity report. The user has explicitly deferred 100% compatibility, accounts and auth until after the local editor POC. The [POC plan and GP gate](poc-plan.md#gp--poc-acceptance-gate) control that milestone; the full capability matrix and G1/G2–G7 below remain post-POC product requirements. Existing G1 evidence is preserved, and G1 remains held without blocking the bounded POC.

## GP: immediate local editor acceptance

Run only the finite [POC acceptance workflow](poc-plan.md#gp--poc-acceptance-gate): actual Chromium import/tree/selection, validated name/radius edits and SVG feedback, rejected-edit preservation, download/reimport and pinned desktop state/serialization checks. Keep relevant codec/source/digest regressions. GP does not require accounts, hosted services, simulations, arbitrary components, broad cross-browser coverage or complete G1 closure. Correctness and opaque-data preservation for supported edits remain mandatory. Record unsupported inputs as explicit limitations rather than silently accepting or rewriting them. GP is currently unrun.

## Desktop baseline and evidence

Use checkout `33bdb6d3062a6d9ef44a00d1ff865f962136e9e9` (`26.11.beta.01`) as the initial reference. Record engine source revision, generated artifact hash, motor/material catalog hashes, browser/runtime, codec version, and fixture provenance for comparisons. A new desktop baseline requires an explicit delta review. Do not rely solely on `docs/source/introduction/features.rst`: its older feature list does not describe all current implementation, including landing dispersion.

## Capability matrix

The paths below are relative to the repository root. Package names abbreviate `core/src/main/java/info/openrocket/core/` and `swing/src/main/java/info/openrocket/swing/` where marked core or Swing. Each category needs a complete sub-inventory; this table is a starting map, not evidence that every menu action is already captured.

| Capability | Desktop evidence / starting point | Browser acceptance | Owner / gate |
| --- | --- | --- | --- |
| Rocket tree and all component classes | Core `rocketcomponent/`; Swing `gui/configdialog/`, `gui/main/BasicFrame.java` | Same supported components, order/parent rules, dimensions, automatic values, stage/pod/cluster behavior, copy/paste, overrides, undo and redo | T06/T12, G3/G6 |
| Units, materials, presets and catalogs | Core `unit/`, `material/`, `preset/`, `database/`; Swing dialogs | Numeric values retain precision and units; presets/materials reproduce relevant mass/geometry; user data persists at the proper account/document scope | T06/T10/T12, G6 |
| Mass, stability and aerodynamics | Core `masscalc/`, `aerodynamics/`, `componentanalysis/` | Mass/CG/CP/stability and detailed analysis match reference cases; indicators have labels and units | T01/T10/T12, G1/G6 |
| Flight configurations and motors | Core `motor/`, `rocketcomponent/FlightConfiguration*`, motor databases | Multiple configurations, mounts, clusters, ignition/staging, recovery deployment, motor data and embedded curves preserve meaning | T02/T06/T10, G3/G5 |
| Simulation setup and execution | Core `simulation/`, `document/Simulation.java`; Swing `gui/main/SimulationPanel.java`, simulation dialogs | Options, RK4/RK6, seeds, wind models, atmosphere/geodesy, events, warnings, cancel/rerun and stored data match covered cases | T01/T10, G1/G5/G6 |
| Plots, tables, expressions and CSV | Core `simulation/customexpression/`; Swing plot and simulation panels | Equivalent axes, units, data types, events, custom expressions and CSV content; usable result inspection | T10/T12, G5/G6 |
| Optimization | Core `optimization/`; Swing `gui/dialogs/optimization/` | Same goals/parameters/constraints and meaningful convergence on reference designs; progress and cancel | T12, G6 |
| Landing dispersion / Monte Carlo | Core `simulation/montecarlo/`; Swing landing-dispersion classes; `docs/source/dev_guide/landing_dispersion_analysis.rst` | Seeded sampling, distributions, run controls, plots/map/results and saved settings; statistically appropriate comparisons | T12, G6 |
| Built-in extensions and scripts | Core `simulation/extension/`, `scripting/`; `docs/source/user_guide/simulation_extensions.rst` | Each built-in extension and supported script mechanism has equivalent behavior, safe execution, saved configuration and explicit errors | T01/T12, G1/G6 |
| Third-party plugins / native and local integrations | Core `plugin/`, service discovery and script engines; Swing plugin/startup behavior | Inventory actual mechanisms and prove an equivalent under strict runtime; opaque XML preservation alone does not pass | T01/T12, G1 classification / G6 completion |
| 2D and interactive 3D | Swing `gui/scalefigure/`, `gui/figure3d/`; architecture/3D docs | Geometry, component selection, stages, views, appearance, decals, labels and usable frame rate across supported browsers | T11, G5/G6 |
| Photo Studio and image output | Swing Photo Studio and renderer; file photostudio settings | Equivalent camera/lighting/appearance controls and useful image/transparent export; preserve settings on round trip | T11, G6 |
| Printing, templates and reports | Swing `gui/print/` and print dialogs | Correct physical scale and dimensions for fin templates/guides/parts; equivalent report and PDF/download workflows | T11, G6 |
| ORK and alternate formats | Core `file/openrocket/`, `rocksim/`, `rasaero/`, `wavefrontobj/`, `svg/`; Swing `BasicFrame` export actions | ORK two-way compatibility including assets/results; match supported alternate import/export behavior, units and warnings | T02/T11, G1/G6 |
| Preferences, localization and accessibility | Core `preferences/`, `l10n/`; Swing preferences/shortcuts | Document/account/device settings have explicit scopes; translations, locale-sensitive input, keyboard actions and non-color cues work | T06/T12, G6 |
| Desktop application workflows | Swing file/document actions, command-line argument docs, user guide | Map file-open/save/recent designs, multiple documents, local files, print dialogs and applicable CLI workflows to browser actions; record any mechanism that cannot be equivalent | T00/T12, G6 |
| Accounts and admin management (new) | Web-specific requirement | Login/logout/settings/recovery; user/role/session management; audited admin changes; no privilege escalation | T03/T05, G1/G2 |
| Sharing and live collaboration (new) | Web-specific requirement | Owner/editor/viewer policy, simultaneous edits, explicit conflicts, presence, reconnect, durable acknowledgment and undo | T05/T07, G2/G3 |
| Git-style version management (new) | Web-specific requirement | Commits, branch graph, semantic diffs, three-way merge, conflict resolution, revert/restore and revision download | T08/T09, G4 |
| Workers deployment (new) | User clarified no Containers/external compute | Fresh Worker/assets and storage deployment; production has no JVM/native service dependency; migration and recovery evidence | T03/T04/T13, G1/G7 |

Desktop-specific mechanisms may need browser equivalents. Record the proposed behavior, how it meets the user outcome, and any unavoidable difference before marking the capability complete. Literal compatibility with arbitrary native plugins cannot currently be promised. The user-approved exception defers these capabilities for GP only; it does not mark them implemented or remove the later parity goal.

## Gate G1: broader product feasibility after the POC

G1 is held for the recorded gaps. ADR-15 authorizes only the bounded local editor before closure; hosted/shared and broader product work still need the appropriate gates. Do not continue general G1 investigations before P01 unless they directly unblock its supported path. After the POC review, close the missing evidence in these four proofs and review them together:

1. **Engine:** Build the pinned Java algorithms into a browser artifact, run representative calculations/seeded flights, and compare against JVM output. Include current RK6 and format-1.11-era behavior instead of relying on a 24.12 port. Inventory all runtime adaptation and extension gaps. Benchmark browser responsiveness and cancellation.
2. **Trusted editing:** Run the bounded reducer in Workers. Demonstrate setter side effects, auto dimensions, tree moves, flight configuration listeners and invalid graph rejection. Compare complete relevant resulting state with the JVM. Interleave different projects/users to expose shared singleton/preference leakage. Accepting a client-generated snapshot is not a proof.
3. **Files:** Import/edit/export representative archives, including decals and embedded motors; compare with desktop in both directions. Preserve original and opaque data. Prove stable IDs/sidecars and deterministic serialization on supported content. Reject unsafe imports explicitly.
4. **Platform/auth:** Run the selected Worker, DO, D1, R2, session/password/admin flow and hibernation recovery in the intended runtime. Measure CPU/memory/startup. Document remote staging availability; local tests do not establish remote deployment success.

Record failing inputs and measurements, not only a yes/no assessment. If strict hosting and complete parity conflict, update the plan with evidence and an explicit pending decision. Do not introduce a hidden compute dependency or redefine the reference desktop release.

## Interoperability corpus

Start with existing examples under `core/src/main/resources/datafiles/examples/` and tests under `core/src/test/resources/` and `swing/src/test/resources/`, adding focused fixtures where coverage is missing. Runtime examples are inputs to inspect; new test fixtures belong in test resources, not application resources. Store editable/high-resolution artwork in `artwork/` when needed.

Include plain XML, GZIP and ZIP; historical and current formats; every component; configurations with shared IDs; simulations sharing a flight configuration; embedded motors; decals/appearances; custom materials; extension settings; expressions; document preferences; stored flight data; no-result files; missing motors/assets; unknown parameters/elements; and future format samples. Distinguish a supported editable file from an opaque preserved file. Add malformed XML/ZIP, ambiguous entries/IDs, large inputs, decompression/path/entity attacks, invalid numbers and references.

Check unchanged import/download against original bytes. For changed exports, compare semantic properties and asset hashes, including order, precision, configuration links, simulation settings/results, and warnings. ZIP byte identity is unnecessary after recompression. Assert the XML entry is first and web metadata is absent. Open/export again in desktop and reimport in web. Existing load/save tests that only assert a non-null document are insufficient evidence.

## Numerical verification

Use JVM-versus-browser differential testing to detect adaptation changes, and independent expectations to detect shared mistakes. Simple component mass/centroid can be hand-computed; isolated integration/ballistic cases can have analytic expectations when the model permits; published motor/geometry and aerodynamic reference cases need recorded provenance and assumptions. Preserve reference fixtures and expected values separately from the code being tested.

Fix seeds, time-step/integrator options, motor/catalog versions and environmental inputs. Compare events/stages/recovery order, termination conditions, warnings, key scalar metrics and relevant time series. Establish absolute/relative tolerances per quantity based on model sensitivity and numerical analysis. Do not adopt one blanket epsilon, assert universal bit identity, or regenerate golden outputs from the new implementation without review. Explain any acceptable interpolation, floating-point or stochastic differences. Optimization and Monte Carlo need convergence/statistical criteria as well as deterministic seeded checks.

## Collaboration, history and authorization verification

Use independent browser contexts and adversarial protocol clients. Cover simultaneous independent and conflicting changes, cyclic moves, deletion races, pending optimistic edits, duplicate/reordered delivery, abrupt disconnect, stale epoch/sequence, compaction, hibernation, rollout, and rejected undo. After recovery, all clients must converge on the same accepted semantic state; no acknowledged command may disappear or apply twice.

Fault-inject each history boundary: before/after durable command acknowledgment, during R2 object upload, between prepare/ref publication and response, and during D1 projection updates. Test branch races, dirty shared drafts, merge target movement, restore epochs, corrupt/missing blobs, abandoned prepares and garbage collection. A ref must never expose a tree with missing objects.

Exercise authentication and authorization through every transport. Attempt cross-project lookup by known IDs/content hashes; stale/suspended sessions; admin role escalation; forged command authors; direct asset/result access; WebSocket origin spoofing; oversized traffic; and ACL removal with open sockets. Verify revocation races against the documented acknowledgment point. Include data isolation across reused Worker isolates and Java engine globals. Failures must be reproducible without relying on hidden UI state.

## UI, deployment and recovery verification

Exercise actual browser interactions for changed UI. Establish supported browsers/devices in T00, then test component input/units, keyboard focus/shortcuts, validation/conflicts, reconnect banners, history merge resolution, plots, print scaling and 3D rendering there. Compare geometry and appearances against desktop reference scenes. Use colorblind-safe choices plus text/shapes; screenshots alone do not validate numeric values or physical print scale. Java live-OpenGL tests require `@Tag("requires-live-opengl")` under repository policy.

Test fresh local setup and fresh staging provision with documented commands. Run protocol/schema migrations while clients are connected, then exercise rollback with retained data. Restore D1, repository objects, and R2 to an application-consistent state and verify ownership, acknowledged drafts, refs and assets. Measure end-to-end edit latency, room fanout, slow-client queues, validator CPU/memory/startup, largest corpus files and history growth. Choose workload limits, retention, recovery objectives and cost forecasts from this evidence; do not invent an unsupported user-count promise.

## Evidence and completion rule

For every capability record the implementing revision, fixture/input, expected result and its basis, exact commands or manual steps, runtime/browser, observed outcome, and reviewer. Record skipped checks and environment limitations separately. Relevant tools include existing Gradle/JUnit tests, [Vitest's Workers integration](https://developers.cloudflare.com/workers/testing/vitest-integration/), and multi-context browser tests; proposed tool use is not a claim those checks ran.

GP requires only the explicitly scoped local editor workflow; its completion must not be reported as G1/G6/G7 completion. G6 requires all baseline capability rows to be implemented and verified or a further explicit user-approved requirement change. G7 additionally requires deployment, recovery, isolation and measured workload evidence. The isolated G1 proofs establish neither gate, a production application, nor general numerical/desktop parity.
