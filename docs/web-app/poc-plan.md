# Local editor POC

Status: P01–P04 complete; GP passed in a clean isolated checkout on November 18, 2026. See the [acceptance record](poc-acceptance.md) and [local run/demo guide](../../web/app/README.md). The user has explicitly prioritized the fastest useful POC and deferred accounts, authentication and 100% desktop feature compatibility until after it. This plan controls the immediate work sequence; it supersedes earlier blanket instructions to finish G1 or hold all T04–T13 work before starting any editor. The exception covers only this local POC slice of T06 and a small SVG slice of T11. G1 remains held for the later product.

## Finish line

A person starts the app locally, opens a bundled desktop-valid sample or a supported local `.ork`, selects a component in its tree, changes its name and a supported BodyTube outer radius, sees the updated values and a simple 2D schematic, downloads an edited `.ork`, and reopens it in the app and pinned desktop code. No account, login, Cloudflare credentials or cloud storage is needed. The supported examples and edits must be named in the UI and run instructions. Stop expanding scope when the acceptance gate below passes.

## In scope

| Area | Minimum POC behavior |
| --- | --- |
| Session | One person, one open rocket, in-memory state; sample and local file picker. Opening another file or reloading can discard changes, so make that clear. |
| Editor | Component tree, selection and component-name editing using the existing codec. Edit outer radius only for BodyTube inputs already accepted by the existing Java facade and archive projection. Other properties and unsupported components are read-only with a reason. No raw XML editor. |
| Feedback | Labeled SI inputs, validation messages, changed-since-export state, and current supported intrinsic dimensions/mass/local CG from Java. Distinguish intrinsic component values from whole-rocket or overridden values. |
| Preview | A labeled SVG side schematic for the supported sample geometry, updated after accepted edits. Omit unsupported shapes with an explanation; do not invent their geometry. No Three.js or 3D prerequisite. |
| Files | Bounded `.ork` import and download through the existing archive codec. Preserve originals, component IDs/references, unknown XML, attachments and stored series. Mark affected stored results stale using the proven effects; do not run them. |
| Runtime | Existing pinned Java-to-JavaScript functions run in a dedicated browser Web Worker. React/TypeScript/Vite serves the local UI. Java/Node may generate artifacts and desktop references during development/build; the app needs no JVM or Node physics service. |

Reuse `componentNames`, `renameComponent`, `importArchive` and `exportArchive` in `web/packages/ork-format/src/index.js`; `tubeRadiusInput`, `applyTubeRadius` and simulation-status effects in `radius.js`; the pure request-local exports in `proof/ReducerFacade.java`; and the current desktop oracles/fixture generators. Keep the proof's explicit/preset/automatic-ring input bounds. The first sample should use the simplest already-proven explicit tube graph; existing automatic-ring fixtures provide regression coverage, not a new prerequisite research program. A new component dependency or physics operation is outside this POC unless it is necessary for this exact finish line.

## Deferred until after the POC

These capabilities remain product goals. Deferral is a user-approved milestone scope change, not a claim that they work.

| Deferred capability | Later owner / gate |
| --- | --- |
| Accounts, authentication, admin UI, permissions and private projects | T03 remaining budget/race evidence; T04/T05, G2 |
| Worker APIs, D1/R2/Durable Object app integration, hosted deployment, hosted CPU/heap and production operations | T03/T04/T13, G1/G7 |
| Sharing, simultaneous editing, presence, reconnect and durable shared autosave | T05/T07, G3 |
| Git-style history, branches, diff, merge, revert and cloud recovery | T08/T09, G4 |
| New/blank rocket creation; component add/remove/move/copy; undo/redo; every component/property; multistage/pod/cluster editing; multiple sibling dependencies | Remaining T01/T06/T12, G1/G3/G6 |
| Simulation execution/setup, CP/stability analysis, plots, result upload/sharing and broad numerical parity | Remaining T01/T10, G1/G5/G6 |
| Motor/material/preset catalog browsers and editing, general configuration editing, arbitrary user preferences/defaults | Remaining T01/T06/T10/T12, G1/G6 |
| 3D, appearance/texture rendering, Photo Studio, print/PDF and alternate format exports | T11, G5/G6 |
| Optimization, dispersion, expressions, scripts and plugins | T12, G6 |
| Autosave across reloads, multiple projects/tabs, offline/PWA, localization, multiple unit systems, mobile and broad cross-browser coverage | T06/T12/T13, later acceptance |

No POC prerequisite asks agents to finish those features or to continue the two-sibling ring investigation. Fix only a concrete blocker in the supported browser import/edit/export path. Existing dependency advisories remain recorded; resolve issues affecting the POC path as needed, and complete the broader dependency review before hosted delivery.

## Rules that still apply

Use the pinned core baseline and the two exact reviewed I/O fixes; retain source-pin, preset-digest and motor-digest checks. Do not rewrite physics in TypeScript, silently fix imported geometry, mutate process-global preferences or execute imported scripts/plugins. Keep existing XML/ZIP bounds and refusal behavior. Unsupported imports/edits must explain the limit and retain the prior document; preservation-only files must not become editable by bypassing the codec. Keep the explicit-hole underfit rejection and its failure evidence.

Skipping authentication means local files and local memory only. Do not remove or bypass authentication in the existing Workers proofs, expose unauthenticated project/blob APIs, or deploy a writable anonymous service. Those proofs remain intact for later reuse. Any eventual production runtime still uses Workers/Cloudflare storage and browser computation, with no Containers or external compute. No deployment, push or PR is authorized by this plan.

Keep basic keyboard operation, labeled controls, visible errors and non-color-only status cues. Broad platform/accessibility certification can follow later. The user-owned `example rocket.ork` remains untracked and unchanged; no POC sample or acceptance case may require committing or modifying it.

## Ordered work and stop conditions

| Packet | Deliverable | Complete when |
| --- | --- | --- |
| P01 — visible editor | Minimal `web/app/` React/TypeScript/Vite app; real bundled sample/local import, component tree, selection and read-only properties. | A browser opens a real archive and selects its components without login or backend credentials. Deliver this before broadening engine work. |
| P02 — supported edits and preview | Browser Web Worker bridge to the existing pure Java exports; rename/radius controls, errors and updated SVG schematic/measurements. | Valid edits update real state and preview; invalid/unsupported edits leave the last accepted document intact. Reuse the current bounds and explicit-hole rejection. |
| P03 — export and round trip | Download, app reimport and existing desktop-oracle integration for the supported edits. | An edited sample reopens with matching IDs/values in browser and desktop; opaque XML/assets/series remain preserved and affected results are stale. |
| P04 — POC acceptance and handoff | Focused browser interaction regression and a short local run/demo guide, exact commands and recorded limitations. | GP below passes on a clean isolated `/tmp` validation checkout and the next agent can reproduce the demo. |

P01–P04 were delivered as sequential verified local commits, without subagents. The next action is user demo review; stop expanding this POC after GP. T01/T02 fixes may be folded into the packet they directly unblock. No new backend abstraction, deployment foundation, generic model importer or additional geometry proof is required before P01. Reuse the existing workspace/pins and generate engine artifacts only when needed. On the main filesystem, install/build/test in an isolated `/tmp` worktree because npm workspace symlinks are unsupported. Inspect any reused worktree's actual HEAD and dirty state; leave unrelated work intact.

## GP — POC acceptance gate

1. Document and execute the local start/build commands; open the UI in Chromium without accounts, auth configuration, a Workers backend or Cloudflare credentials. Scripts mentioned in the eventual run guide must actually exist and work.
2. Through the UI, open a known supported archive, select and rename a component, change an explicit BodyTube radius, and observe Java-derived state and the SVG schematic update. Check labels, keyboard use and changed-since-export feedback.
3. Exercise a no-op, an invalid number, an unsupported component/graph and the explicit-hole underfit rejection. Rejections preserve the last accepted file/state. A failed replacement import must not erase the current document.
4. Download and reimport an edited `.ork`; run the pinned desktop oracle on that exported file and verify complete relevant state/serialization plus opaque XML, attachments, IDs/references and stored series/statuses. Existing name/radius preservation and engine source/digest regressions remain passing for the paths touched.
5. Record the implementing commits, actual commands, screenshots or browser observations, supported-input list and failures/skipped checks. State that simulations, accounts, collaboration and full compatibility are deferred. A successful download request is not proof of durable cloud or disk saving.

GP does not require the whole G1 corpus, hosted benchmarks, arbitrary graphs or every desktop feature to pass. It does require correctness and file preservation for the advertised POC operations. GP passed for the named supported inputs; the [record and executable evidence](poc-acceptance.md) document actual Chromium downloads/reimports and pinned desktop comparisons. After GP, review the demo with the user and prioritize the deferred work. G1/G2–G7 remain the gates for the broader product; completion of this POC cannot be presented as production readiness or 100% compatibility.

AI assistance: Codex using GPT-6 (runtime-supplied family; exact variant unavailable), without subagents, prepared this user-authorized sequencing and scope revision. Documentation links, cross-document consistency and the complete diff are checked for this change; application/browser acceptance is required during implementation.
