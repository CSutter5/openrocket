# G1 contracts and selected inputs

These are version 1 feasibility boundaries for T01–T03, not an application schema or a claim of complete T00 discovery. The pinned desktop source is `33bdb6d3062a6d9ef44a00d1ff865f962136e9e9` (26.11.beta.01). Java source changes after that revision must be reviewed separately. No production resources or external compute are needed by these proofs.

## Shared boundaries

`web/packages/contracts` defines protocol/model version 1, the initial command envelope, diagnostics, archive and identity representations, and completed-result provenance. Rocket dimensions use SI, angles use radians, desktop IDs remain strings. XML and archive entries plus a versioned identity sidecar are authoritative; projections are reconstructible. The proof packages may have narrower local entry points; an unintegrated command example is not a claim that the collaboration protocol works.

A command includes project/branch, epoch, operation ID, observed sequence and expected values for the reducer's complete read/write effect set. The authenticated server supplies its author and accepted sequence. It cannot trust a submitted replacement snapshot. Setters execute on request-local Java documents; process-global preferences cannot be swapped between projects. Each reducer must publish its supported operations and reject everything else. Bound effects include automatic dimensions, thickness, presets, listeners and graph/configuration changes where applicable. Until that effect set is established, concurrent acceptance is unproven.

Independent edits use separate entity/field preconditions and may succeed with an older observed sequence when all expectations still match. Two edits expecting the same old value conflict after the first acceptance. A reconnect supplies epoch and last sequence; a changed epoch or missing tail requires `resync`, never blind replay. Unsupported protocol negotiation fails explicitly. This milestone specifies these examples; durable collaborative implementation remains T07.

An archive codec imports bytes into exact ordered entries and keeps original bytes. Unchanged download returns the original. Edited ZIP output places `rocket.ork` first and excludes web metadata. The file proof specifies its concrete API and bounds beside its tests. Unknown XML/attachments remain intact, and editing that cannot preserve their meaning is refused or limited to preservation mode. Desktop component/configuration IDs are retained; web simulation identities are separate from configuration IDs. Reimport without the sidecar must not silently merge ambiguous simulations.

A simulation input manifest binds exact archive-tree and sidecar hashes, configuration/simulation IDs, options, seed, integrator, engine, motor/material catalogs and extension set. The contract hashes a domain-separated fixed-order encoding; it does not normalize XML. Completed output is attributed to a browser client and remains attached to that immutable input. A late completion cannot become a result of a newer input. Reading a saved result requires project authorization independently of knowing its hash. The contract tests cover stale classification; result upload/sharing is outside this milestone.

## Fixtures and coverage

`web/scripts/fixture-inventory.py` records source SHA-256, transport, XML version and structural counts without modifying runtime examples. `web/fixtures/baseline.json` is its checked-in output. Existing repository inputs have the repository's license and their original paths; generated interoperability fixtures live in the file proof's test tree with generation commands.

| Selected input | Purpose / independent expectation | Owner |
| --- | --- | --- |
| A simple model rocket | Single-stage tree/configuration/settings baseline; differential JVM oracle, not an independent physics truth | T01/T02 |
| Three stage low power rocket | Ordered stages and configuration references | T01/T02 |
| Clustered motors | Shared configuration IDs and multiple mounts | T01/T02 |
| Dual parachute deployment | Recovery configuration and stored simulation structure | T01/T02 |
| Simulation extensions; Simulation scripting | Preserve configuration without executing imported scripts; classify runtime mechanisms | T01/T02 |
| Pods--powered with recovery deployment | Pod/parallel graph and recovery semantics | T01/T02 |
| Generated current saver fixture | Format 1.11, embedded motor/decals/results, stable IDs and exact asset hashes; semantic oracle from desktop loader/saver | T02 |
| Analytic tube fixture | Mass = density × π × (outer radius² − inner radius²) × length; centroid at half length for a uniform tube | T01 |

An input's selection does not mean its proof passed. Existing examples do not cover all current format-1.11 fields, and a generated current fixture is required. Every component class and desktop action remains mapped to T06/T10/T11/T12 and G5/G6 by the parity matrix. Full screen/action discovery remains incomplete; these minimum contracts unblock feasibility only.

The browser feasibility policy is an actual headless Chromium run, version recorded by the runner; Firefox, WebKit, mobile, graphics and accessibility support remain untested. Local `workerd` supplies Worker evidence, not remote deployment or paid-plan CPU evidence. Remote staging is pending; no deployment is authorized here.

## Duplicate work and decisions

On 2026-11-17 public GitHub issue search queries `repo:openrocket/openrocket is:open browser`, `repo:openrocket/openrocket is:open web application`, and `repo:openrocket/openrocket is:open TeaVM` returned respectively 2, 1 and 0 results. Returned issues #3285/#797 and PR #3295 did not duplicate these proofs. This is a bounded search, not evidence that no other work exists. No maintainers were contacted; upstream broad-feature discussion remains pending. The user authorized this isolated feasibility implementation.

The existing [MMRocket Sim port](https://github.com/mtnmanak/mmrocket-sim/tree/80e8df455e447b98fc94acc15dd4c04ffedc3357) is evaluated at that exact revision by T01. Its old baseline cannot replace the current pinned core. Source reuse and adaptations require provenance and license retention beside the engine proof. Dependency pins and compatibility date follow executed tests rather than the original plan's suggested versions.
