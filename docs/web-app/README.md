# OpenRocket web application plan

Status: bounded local editor POC and GP passed, November 18, 2026. The user subsequently authorized the drawing/units extension and the bounded local [browser simulation workflow](browser-simulation.md); see ADR-16/17. See [acceptance evidence](poc-acceptance.md) and the [local run guide](../../web/app/README.md). The user has deferred accounts, authentication and 100% desktop feature compatibility until after the POC. Follow the [POC scope, ordered packets and GP acceptance gate](poc-plan.md). Existing G1 proofs are reusable evidence; G1 remains held for the broader product and does not block this explicitly authorized POC slice.

## Scope and constraints

The immediate deliverable is a single-user local browser editor: sample/file import, component tree/selection, name and supported BodyTube radius edits, an SVG schematic, and `.ork` download/reopen. Use browser memory and local files; skip backend integration, accounts/auth, collaboration/history, simulations, 3D, broad catalogs/component editing and advanced features. The [POC plan](poc-plan.md) defines the finite finish line and deferred owners. Correctness and preservation remain required for the supported edits.

After the POC, build a multiuser browser application with user accounts, administrator management, simultaneous editing of the same design, Git-style history, desktop-compatible `.ork` import/export, and desktop feature parity. The user clarified that deployment may use **Cloudflare Workers and storage, but no Containers or external compute**. Java and Node may run during development and CI; production must not depend on a JVM service. Browser computation is part of the proposed solution.

The desktop reference is this checkout at `33bdb6d3062a6d9ef44a00d1ff865f962136e9e9`, reporting `26.11.beta.01` in `core/src/main/resources/build.properties`. Pin this baseline for initial comparisons. Updating it requires a capability and format delta review; an older browser port cannot establish parity with this version.

Start future work here, then read:

1. [General agent guide](agent-guide.md): project context, local commit/no-push rules, and handoff conventions.
2. [Architecture and decision records](architecture.md): stack, alternatives, reasoning, data ownership, and protocol boundaries.
3. [Agent work plan](agent-work-plan.md): dependencies, individual assignments, integration rules, and exit criteria.
4. [Parity and validation](parity-and-validation.md): capability inventory, test strategy, release gates, and known feasibility risks.

## Selected stack

The POC uses React/TypeScript/Vite, SVG, the existing browser-compatible Java reducer exports and archive codec. Retain the tested pins. The backend, accounts, collaboration, simulation and 3D selections below describe the post-POC product; their remaining feasibility work is not a prerequisite to the local editor.

| Area | Selection | Reason |
| --- | --- | --- |
| Browser application | TypeScript, React, Vite; semantic HTML and CSS | Complex component editors and reusable panels; static assets avoid a server-rendering requirement. |
| Edge API | TypeScript, Hono, Cloudflare Workers | Web-standard request handling and explicit Workers deployment. |
| Rocket engine | Existing Java core, adapted at build time with TeaVM to JavaScript; run simulations in a browser Web Worker | Preserve numerical algorithms and avoid prohibited production JVM compute. JavaScript is the first target; Wasm is an evaluated alternative, not an assumed prerequisite. |
| Trusted editing | Shared, bounded command reducer and validation kernel usable in Workers and browsers | The server must validate changes independently of an untrusted client; full simulations stay outside collaboration rooms. |
| Collaboration | Native Durable Objects with SQLite storage and hibernating WebSockets | A single authority per design can order edits, persist them, and coordinate branch references. |
| Accounts | Better Auth with its Drizzle SQLite adapter and admin plugin; D1 | Application-owned accounts and user management without a separate authentication server. Integration and hashing must be proven in Workers. |
| Metadata | D1 with Drizzle schema/migrations | Account/session records and searchable project metadata. |
| File and revision storage | Private R2, immutable content-addressed expanded archive trees | Preserve XML and embedded assets; deduplicate blobs without diffing compressed ZIP bytes. |
| 2D / 3D | SVG for 2D and templates; Three.js with WebGL2 for interactive 3D | Browser-native rendering; desktop LWJGL/AWT rendering needs a new frontend. |
| Validation | Existing JUnit/Gradle plus Vitest in the Workers runtime and Playwright browser tests | Retain desktop regression coverage and exercise real server/browser behavior. |
| Build/deployment | Existing Gradle build plus an isolated npm workspace under `web/`, lockfile, Wrangler, GitHub Actions | Keep desktop builds usable; reproducible Worker/assets deployment. |

Avoid choosing exact package versions from this document. At G1, pin tested compatible releases, a Wrangler compatibility date, and engine/catalog hashes. Recheck current platform documentation rather than copying old limits.

## Delivery sequence

| Phase | Result | Exit gate |
| --- | --- | --- |
| 0: Evidence and scope | Desktop capability inventory, duplicate-work evaluation, baseline fixtures, maintainer discussion record for upstream work | G0: inventory and scope traceable to the checkout; no unsupported claim of full parity. |
| POC: GP passed | Local sample/file → tree/selection → name/radius edits → SVG schematic → desktop-compatible export for supported inputs | GP: execute P01–P04 and the finite [POC acceptance checks](poc-plan.md#gp--poc-acceptance-gate); no accounts/auth or full G1 prerequisite. |
| 1: Remaining feasibility, after POC | Broader engine/graph/catalog/isolation/file and hosted-budget evidence using the existing proofs | G1: close the recorded gaps before the broader hosted/shared product. GP does not pass G1. |
| 2: Foundation | Local and staging deployment, accounts, admin management, private projects and access checks | G2: two users and an administrator exercise allowed and denied actions. |
| 3: Shared design | Component tree/editor, import/export, persisted concurrent commands, reconnect and undo | G3: two browsers edit one design, reconnect without losing acknowledged changes, and open the export in desktop. |
| 4: Version management | Named commits, branches, semantic diffs, three-way merge, revert and restore | G4: divergent edits merge or report conflicts; refs survive retries and crashes. |
| 5: Simulation and presentation | Browser simulation, plots, 2D/3D, catalogs, provenance-bound shared results | G5: numerical and rendering comparisons pass for the covered capabilities. |
| 6: Complete parity | Advanced analysis, optimization, dispersion, printing/export, expressions, scripting and extension strategy | G6: every baseline capability has evidence; unresolved plugin/runtime gaps remain release blockers. |
| 7: Release readiness | Load and recovery evidence, restore exercise, migrations/rollback, deployment instructions | G7: a fresh deployment and recovery rehearsal pass; parity evidence reviewed. |

The POC route is a user-approved sequencing exception to the original G1-before-editor plan. P01–P04 and GP are complete for the recorded inputs; stop here for a user demo review and deferred-work prioritization. T04/T05 are not POC prerequisites. The later phases retain their full product gates; estimates for the bounded editor must not wait for extension or complete-parity research.

## Main feasibility risk

The core already separates much of the physics from Swing, but it still depends on Java desktop APIs, reflection, scripting, and SQLite/JNI. TeaVM does not automatically make those dependencies browser-compatible. Arbitrary desktop Java plugins and native integrations also have no established browser equivalent. Full parity under the strict hosting constraint is therefore an objective with explicit gates, not a verified promise. Do not add a JVM service, silently drop features, or replace physics with approximations when a gate fails. Record the failure and propose a reasoned decision within the constraint.

The independent [MMRocket Sim repository](https://github.com/mtnmanak/mmrocket-sim) describes a TeaVM port of OpenRocket 24.12 and a differential validation harness. Evaluate its adaptations, licensing, and tests before duplicating that work. Its published claims have not been executed or validated in this planning task, and its baseline differs from this checkout. Upstream issue/PR discovery was partial; repeat the searches before each implementation issue. No maintainer has been contacted by this task.

## Decisions future agents must preserve

- Keep the production runtime within Workers and permitted storage services. Do not introduce Containers, external simulation servers, or remote desktop streaming.
- Keep desktop files standard. Store collaboration identifiers, membership, commits, and browser-only state outside exported rocket XML.
- Version the expanded archive, including attachments and motor data. Keep original imported bytes for recovery.
- Use validated commands for shared structured edits. Real-time autosave and deliberate commits have different meanings.
- Preserve unknown file data or refuse an unsafe edit with an explanation. Loading successfully is insufficient evidence of a safe round trip.
- Treat numerical results computed by clients as attributed client results. The server does not certify their physics correctness.
- Measure parity against the pinned current desktop baseline and independent numerical references.

## Planning verification and provenance

The original planning task inspected repository architecture, build/module dependencies, loader/saver behavior, format documentation, and desktop feature entry points. Primary Cloudflare, TeaVM, Hono, Better Auth, and Drizzle documentation informed the choices; supporting links are in the companion documents. Three research agents examined engine feasibility, file/collaboration behavior, and parity/reuse independently. That planning task ran no application/runtime tests; the subsequent [G1 record](g1-feasibility.md) contains the actual implementation checks and remaining gaps.

AI assistance: Codex using GPT-6 (runtime-supplied family; exact variant unavailable) prepared and reviewed these planning documents with three agents inheriting that runtime model. Human contributors remain responsible for reviewing decisions and verifying implementation. Any future PR must use the repository template and report its actual checks and model identities.

POC-first revision, November 18, 2026: Codex using GPT-6 (runtime-supplied family; exact variant unavailable), without subagents, revised scope and scheduling at the user's request. Documentation links, consistency and the complete diff are checked; no application implementation or runtime verification is claimed for this documentation change.
