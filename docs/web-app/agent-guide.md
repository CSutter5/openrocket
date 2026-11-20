# General guidance for future agents

This file is the starting handoff for OpenRocket web application work. It collects stable project context and working rules; detailed decisions and task acceptance criteria live in the linked documents. Follow the user's latest instructions and repository contribution guidance when they change this context.

The latest deployment-error fix adds [persistent local deployment settings](cloudflare-deployment.md#persistent-deployment-settings). The root helper loads ignored `.env` before its clean worktree build and validates settings early. This checkout has the user's supplied Workers origin and a newly generated private stable secret saved with mode 0600. Preserve that file and never print or commit its secret. No app deployment is included in this fix.

The latest follow-up adds [tube motor-mount controls](motor-mount-controls.md) (ADR-31), replacing the link-only Motor tab with native mount/overhang/ignition editing. Read its per-flight inheritance and atomic save boundaries before changing the reducer. The same request adds [owner rocket renaming and account password settings](account-settings.md) (ADR-30), preserving public URLs and using the existing Better Auth/D1 stack.

The preceding follow-up adds [two creation cards, confirmed owner deletion and a protected administrator](admin-and-deletion.md) (ADR-29). The user requested a new `admin` login with temporary password `admin`, requiring a change before any writes or management operations. Read the singleton bootstrap, session-reset race, immutable deletion ID and D1/DO cleanup boundaries before changing these flows. No app deployment is included.

The preceding creation follow-up removes path fields from New rocket and adds validated `.ork` upload as a newly owned rocket (ADR-28). Read [the creation/upload publication contract](accounts-and-rockets.md#creation-and-upload-follow-up) before changing creation: uploaded bytes are persisted before public D1 metadata appears, and duplicate names get internal URL suffixes.

The subsequent November 20 request adds [accounts and multiple public owned rockets](accounts-and-rockets.md) (ADR-27). All signed-in accounts may coedit any rocket; visitors are readers. Account/ownership metadata uses a real Cloudflare D1 binding, with one Durable Object per rocket. The remote D1 database is created/migrated, but the app is not deployed. Read the new run/secret setup and old-singleton migration limits before changing account or route behavior.

The November 20 follow-up authorizes [one shared-file coediting POC](coediting-poc.md) (ADR-26), with username prompts and no accounts, logging or version history. Use the app's Wrangler preview for collaboration; plain Vite remains local. Read its conservative concurrency, current-draft persistence and stale-dialog limits before changing transport. This supersedes earlier local-only deferrals for this bounded slice.

The latest screenshot-guided follow-up adds [desktop-style component dialogs and individual field units](component-dialogs.md) (ADR-25), with atomic OK/Cancel and the existing scalar editor under Advanced. The parts library is excluded. Read its units, optional-field and native-verification boundaries before changing the dialogs.

The preceding follow-up enables [editable imported properties and component tree actions](component-editing.md) (ADR-24), and reduces/unletters the CG/CP symbols. Read its raw-field, stage-reference and desktop-deletion verification boundaries before changing editor commands.

The preceding follow-up enables [component creation, CG/CP markers and simulation units](component-creation.md) (ADR-23). All palette types can be created; detailed component editors, drawings and static calculations retain the explicit limits in that record. Read it before changing structural commands or stability projection.

The latest layout follow-up makes the app fit the browser viewport with internal panel scrolling. Read [the viewport fitting record](desktop-ui.md#viewport-fitting) before changing workspace heights or dialog overflow.

The latest configuration follow-up removes the manual/session simulation UI, makes motor selection catalog-only with native-style filters, and adds atomic configuration creation (including a saved simulation), rename and deletion. Read [the configuration controls record](configuration-controls.md) and ADR-22 before changing these contracts. Earlier manual-flight UI descriptions are historical; the engine proof path remains available internally.

The latest November 19 follow-up adds [selected saved simulations and the complete bundled motor picker](saved-simulations-and-motors.md) (ADR-21). Saved rows use their archived motor configuration and supported launch/weather settings; graph dialogs and explicit catalog assignments are now available. Earlier catalog/settings deferrals do not block this authorized slice.

The November 19 UI follow-up adds the [desktop-style browser workspace](desktop-ui.md). It preserves the existing local editor and simulation boundaries; component creation and full catalog editing remain unsupported.

The November 19 follow-up adds [session motor-configuration selection](motor-configuration-selection.md). Development now uses the user-moved local checkout `/home/colin/Documents/openrocket`; the old NAS and `/tmp` checkout paths are historical.

## Start a task

1. Read the root [AGENTS.md](../../AGENTS.md) and [CONTRIBUTING.md](../../CONTRIBUTING.md), then any closer directory instructions.
2. Read the [project plan](README.md), [architecture decisions](architecture.md), [agent work packets](agent-work-plan.md), and [parity requirements](parity-and-validation.md).
3. Inspect the current branch, working tree, recent local commits, and relevant implementation. Preserve existing changes and identify which work belongs to you. The checkout's current state takes precedence over an old handoff's progress claims.
4. Choose the next authorized work packet whose prerequisites are satisfied. Identify its owned paths, expected behavior, checks, and handoff before editing. Do not start every packet at once.

The November 19 request authorizes [Cloudflare static hosting preparation](cloudflare-deployment.md), stopping before any deployment. ADR-19 bounds this T04 slice to the current browser editor, an independent assets-only Wrangler config, build/dry-run commands and local hosting checks. Earlier hosted-work deferrals do not block this preparation. Cloudflare resource creation, deployment, DNS changes and Git pushes remain outside the authorization.

The user-reported refusal for `example rocket.ork` is addressed by the bounded [imported-flight follow-up](imported-browser-simulation.md). Preserve the user archive; regression fixtures are independently generated.

The preceding user follow-up explicitly authorizes a bounded archive-bound browser simulation slice of T10. Earlier simulation/GP deferrals do not block it. Read [the simulation record](browser-simulation.md) and ADR-17; keep broader G1/G5 held.

Previous user follow-up: the [rocket drawing and length/wall extension](editor-extension.md) builds on the completed POC. The user explicitly requested these additions after GP review; earlier stop-at-GP wording does not block this bounded extension. Other deferred work still needs separate prioritization.

POC handoff, November 18, 2026: P01–P04 and GP are complete for the [bounded local editor](poc-plan.md). Read the [acceptance record](poc-acceptance.md) and [run/demo guide](../../web/app/README.md), then review the demo with the user before starting deferred work. The user explicitly deferred accounts, authentication and 100% feature compatibility until after this POC. This temporary scope decision supersedes old blanket T04–T13 holds for the specified early T06/SVG slice only. Do not continue general G1 geometry proofs before delivering the visible editor unless a concrete POC blocker requires one. G1 remains held for the broader product; GP is a separate gate passed only for the recorded POC inputs. The [G1 evidence record](g1-feasibility.md) remains historical evidence, not production infrastructure.

## Product context to retain

The local POC uses one browser, one in-memory document and local import/download. No account, backend, remote storage or deployment is needed; keep existing authenticated proofs intact rather than disabling their checks. The bullets below describe the retained post-POC product goals. File preservation, source/digest checks, immutable preferences, no imported script execution and the existing unsafe-edit refusals still apply to the POC.

- Production uses Cloudflare Workers and storage services. The user explicitly excluded Containers and external compute. Java/Node are allowed for development and build-time tooling; production must not require a JVM service.
- Build a custom browser UI around adapted OpenRocket design and physics logic. The proposed UI stack is React/TypeScript/Vite with SVG and Three.js. TeaVM JavaScript is the first engine adaptation to investigate, not an already verified solution.
- Users share a project's design and simulation setup. A user runs a simulation in their browser, and saved completed results are available to collaborators without each collaborator rerunning it. Bind results to the exact input snapshot, settings, engine, catalogs, and author. Changes make older results visibly stale. Browser jobs require the running browser to remain available.
- The proposed backend uses Hono/Workers, Better Auth with D1/Drizzle for accounts and admin management, SQLite-backed Durable Objects for trusted commands and collaboration, and private R2 for files/revisions. Prove compatibility before treating these choices as established infrastructure.
- Keep `.ork` files compatible with desktop OpenRocket. An expanded archive includes XML, images/decals, embedded motor curves, and other preserved entries. Web membership, history, and identity sidecars stay outside exported desktop files. Keep originals for recovery and write `rocket.ork` first in ZIP exports.
- Use server-validated commands for shared edits. Preserve structural constraints and setter side effects; untrusted client snapshots are not authority. Autosaved shared drafts and deliberate history commits are separate concepts.
- Git-style project history means commits, branches, semantic diffs, three-way merges, conflicts, and revert/restore. This application feature is separate from agents committing source changes in this repository.
- Feature parity targets the pinned desktop baseline in the plan. An early editor demo is an increment. Arbitrary Java plugins, scripting, native integrations, and browser numerical behavior remain explicit feasibility risks; do not silently exclude them or introduce prohibited compute to work around them.

## Commit locally as work progresses; do not push

The user explicitly wants agents to make local commits as often as needed and **not push**. Routine local commits within the authorized task do not need another permission question.

- Make a focused commit whenever a coherent, reviewable change is ready and its appropriate checks have run. Commit useful completed steps before switching tasks or handing work to another agent; do not accumulate an entire workstream into one final commit.
- Keep code, relevant regression tests, and necessary documentation together when they describe one change. Split unrelated changes. Each implementation commit should remain buildable; keep experiments isolated and clearly describe incomplete or failing work rather than claiming it passes.
- Before committing, inspect `git status`, review the complete intended diff, run appropriate checks and `git diff --check`, and stage only owned paths or hunks. Review `git diff --cached` so another person's changes are not accidentally included. Avoid blanket staging in a shared dirty checkout.
- Use descriptive commit messages naming the change and its purpose. Include a real issue number only when one exists. Record meaningful checks, limitations, and decisions in the handoff or relevant project document; never fabricate test results.
- Work on a dedicated feature branch. Do not commit directly on `unstable`. Do not amend another contributor's commits, reset or rewrite shared history, bypass required hooks/signing, or change repository identity/configuration to force a commit through. If a commit fails, diagnose it and report the actual blocker.
- Do not run `git push`, publish branches/tags, or otherwise upload commits. Opening/publishing PRs is also outside this local workflow unless the user later requests it. Local commit permission does not grant permission to contact maintainers or deploy infrastructure.

When multiple agents are involved, prefer separate worktrees/branches. If agents share a checkout, one coordinating agent owns index/commit operations; others hand over owned changes and evidence. Do not run concurrent Git mutations or commit unreviewed files from another active agent. The coordinator should still commit completed contributions promptly.

## Decisions, verification, and handoff

Keep changes scoped to the selected packet. Read the relevant implementation before adapting it; maintain desktop build behavior and existing numerical semantics. Record a new or superseding architecture decision when evidence changes a stack choice, contract, data representation, or runtime boundary. Include context, alternatives, reasoning, consequences, and validation. Do not make a speculative abstraction merely to prepare for later packets.

Run checks appropriate to the actual change. Numerical work needs JVM/browser comparisons and independently justified expectations. File work needs semantic and asset comparisons through desktop/web round trips. Collaboration/history need concurrency and recovery cases. Account changes need server-side authorization and isolation checks. UI changes need the affected browser interaction where possible. Report environment limitations and skipped or failed checks plainly. Follow repository rules for live OpenGL tests, resource placement, accessible colors, and AI attribution.

At handoff, state what changed and why, local commit hashes, exact checks and outcomes, decisions/contracts updated, unresolved blockers, and the next ready packet. Link to durable files and fixtures rather than relying on chat history. Confirm whether the working tree is clean and explicitly state that nothing was pushed. A later agent must be able to continue without guessing which changes are complete.
