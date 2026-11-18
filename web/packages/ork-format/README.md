# Expanded ORK feasibility proof

This package runs a bounded desktop-compatible archive edit in the browser without replacing the desktop loader. It retains the original upload and exact ordered entry bytes, strictly parses UTF-8 XML, and replaces only a selected component's name text after checking its UUID and previous name. All other XML bytes, including unknown subtrees, namespaces, numeric precision, configuration references, scripts, expressions, document preferences and stored flight series, remain untouched. Imported scripts are never executed. The package uses SI values only indirectly through preserved XML; it does not reinterpret numerical fields or validate a complete component graph.

`importArchive(Uint8Array, optionalSidecar)` returns an expanded archive, editable/preservation mode, diagnostics, and an identity sidecar. `componentNames` exposes the bounded editing projection. `renameComponent(archive, componentId, expectedName, name)` returns a new archive or an explicit conflict. `exportArchive` returns `{bytes, identity}`; unchanged imports return original bytes, changed exports use deterministic ZIP ordering/compression/timestamps with `rocket.ork` first. The sidecar is never inserted into desktop files. These package APIs are narrower than the shared future codec contract; uppercase error codes are package-local diagnostics.

Simulation identities are generated UUIDs in the sidecar, distinct even when names/configurations repeat. A sidecar is accepted only for its exact archive hash, supported schema, simulation count and unique valid UUIDs. App edits retain the mapping. A desktop re-save changes the archive hash: `SIDECAR_RECONCILIATION_REQUIRED` reports the loss and creates fresh identities, without guessing by name or configuration. Component names can still be edited independently of those mappings. Cross-desktop identity reconciliation is not implemented.

## Reproduce

From the repository root, after installing the locked web workspace dependencies:

```sh
npm test --prefix web/packages/ork-format
./gradlew -I web/packages/ork-format/jvm/classpath.gradle :core:orkProofClasspath -Dork.proof.classpath=/tmp/ork-proof-classpath.txt
ORK_PROOF_CLASSPATH="$(cat /tmp/ork-proof-classpath.txt)" node web/packages/ork-format/test/desktop-proof.mjs
CHROMIUM_EXECUTABLE=/path/to/chrome node web/packages/ork-format/test/browser-proof.mjs
```

Java 17, Gradle 9.8.2, Node 26.13.1, Playwright 1.61.1 and esbuild 0.28.2 were used. Java and the Node HTTP harness are development-only. The browser codec bundle has no Node imports. The desktop bridge reuses the existing `OpenRocketSaverTest.setup()` injector with its small motor database; the three example motor curves must therefore resolve from the embedded RSE data when absent in that database. The bridge runs actual desktop Java loader/saver code headlessly. No Swing GUI or production deployment was exercised. Browser and desktop commands create only local `/tmp/openrocket-ork-*-proof` artifacts by default.

## Observed evidence

The 28 Node tests passed, including all 16 baseline examples: 15 import/edit/export successfully, while `Parallel booster staging.ork` is an expected rejection because it contains `/datafiles/textures/balsa.jpg` as an absolute archive path. Tests compare every preserved attachment hash and the entire XML string outside the edited name span, all component UUIDs, simulation counts, deterministic changed exports and unchanged byte identity. Focused inputs cover plain XML/GZIP, namespaces/unknown XML/comments, opaque files, Unicode/escaping/BOM/CRLF, duplicate/missing IDs, future format preservation, precondition conflicts and sidecar ambiguity. Unsafe path aliases, malformed XML/ZIP, entities, depth/upload/entry/expansion bounds, corrupt CRCs and deliberately understated ZIP expansion are rejected. Numeric opaque filenames retain order behind `rocket.ork`.

The [desktop report](evidence/desktop.json) records a round trip of baseline `A simple model rocket.ork`: 13 components, two decals, five motor assignments using three embedded curves, five simulations and 2,751 stored flight points. The bridge compares the complete JVM saver XML of the web-edited file against the original loaded model with the same Java name setter applied, then compares again after desktop save/load. Both comparisons passed with no load warnings; every decal/RSE hash survived desktop re-export and web reimport. Desktop ZIP hashes include desktop-generated timestamps and are observations, not reproducibility assertions. The fixture and input hash are recorded in the report; no new runtime Java resources were added.

The [browser report](evidence/browser.json) records actual Chromium 149 import/edit/export/reimport of the same fixture, checking component/name/UUID, all attachment hashes, five simulations and identity continuity. Timing is an end-to-end local observation, not a Workers CPU or memory budget measurement. The coordinator also exercised a small GZIP/XML → edit → ZIP/opaque-XML round trip in local workerd via `platform-proof/test/codec.test.js`; whole-corpus Workers CPU/memory budgets remain unmeasured.

## Boundaries and remaining work

The corpus maximum is 898,630 uploaded bytes, 2,769,418 XML bytes and 11 entries. G1 limits provide bounded headroom: 4 MiB upload, 16 MiB expanded total, 8 MiB per entry, 64 entries, depth 64, 100,000 XML elements and 1,024-character names/paths. Central/local ZIP headers and data descriptors, file order, bounds, paths, compression and CRCs are checked before use. Deflate/GZIP input is fed in 1 KiB chunks; decompressed bytes are checked before retaining output. A lying declared ZIP size fails during inflation rather than allocating an unbounded result. CPU and peak memory at these limits remain unmeasured.

ZIP64, multidisk, encrypted/non-deflate ZIP, directory entries, non-UTF-8 XML and ambiguous legacy filename encodings are explicitly unsupported. Historical/future formats and missing/ambiguous component IDs can be preserved/downloaded but cannot be edited; legacy ID allocation is deferred. Unknown XML and files survive the supported name edit, but no structural/numeric/asset-replacement editing API is provided. Arbitrary unknown content has no execution parity claim. Images remain opaque and are never rendered: dimensions and image-decoder safety need proof before display. Import warnings for broken motor/decal references and full numerical/graph validation are deferred to the model integration. An unsupported absolute path in an existing official example remains a concrete compatibility limitation; investigate a safe opaque archive-path representation before relaxing rejection.

The [generated format-1.11 report](evidence/format111.json) repeats the JVM/web round trip after the current desktop saver enables RK6 and fixed seed 8447 on the first simulation. Those settings survive both directions. This fixture deliberately retains the imported historical flight data; it does not certify those results as runs of the changed options. The generator and assertions run automatically with `test:desktop`. Review also added preservation-only handling for comments/processing instructions inside a component name, so an edit cannot silently discard them.

The file proof establishes this bounded edit path, not full T02 or desktop parity. Next investigations are archive-safe absolute-resource handling, historical ID allocation/reconciliation, model-command effect application into XML, and codec memory/CPU measurements in workerd. Full G1 assessment belongs to the coordinator's combined evidence record.

## User-supplied example

`ORK_PROOF_INPUT` optionally selects a local `.ork` for the Node corpus, browser runner and desktop runner. The original remains untouched; generated copies go to the output directory argument. Custom inputs are no longer mistaken for the internally generated RK6/fixed-seed fixture, and browser expectations derive from the imported fixture rather than assuming five simulations. For example, after installing dependencies and generating the test classpath as above, run from the repository root:

```sh
export ORK_PROOF_INPUT='/home/colin/rocketry/openrocket/example rocket.ork'
npm test --prefix web/packages/ork-format
PLAYWRIGHT_BROWSERS_PATH=/tmp/openrocket-g1-browsers node web/packages/ork-format/test/browser-proof.mjs /tmp/openrocket-user-example-browser-proof
ORK_PROOF_CLASSPATH="$(cat /tmp/ork-proof-classpath.txt)" node web/packages/ork-format/test/desktop-proof.mjs /tmp/openrocket-user-example-desktop-proof
```

The supplied file has SHA-256 `e862a60191b1d13306cb9de0263ce6e60bed347293a03d50338551aa9b4363dc`, format 1.11, 17 components, six stored simulations with 5,540 points, five embedded motor curves and 23 expressions. Its XML is 3,261,148 bytes, larger than the bundled corpus maximum but within the existing limits. It has no decal entries. The source file is user-owned and was not added to the commit.

The optional Node run passed **29 tests**. Actual Chromium 149 import/name-edit/export/reimport passed with exact unchanged download, deterministic edited output, all IDs, simulation count, sidecar and attachment hashes preserved, plus exact XML preservation outside the name span. See [browser evidence](evidence/user-example-browser.json).

The headless desktop proof **fails**, with diagnostics retained in [desktop evidence](evidence/user-example-desktop.json) and the [warning diff](evidence/user-example-warning.diff). The loaded web edit matches applying the Java name setter to the original, but desktop save/reload changes `RecoveryHighSpeedDeployment` into `Other` and drops speed `25.638137572014113`. An unchanged desktop-only control reproduces this downgrade. `OpenRocketSaver` writes the warning's class simple name, while `importt/WarningHandler` recognizes `HighSpeedDeployment`; this is a concrete pinned-desktop mismatch, not a passing compatibility result. The next fix needs a focused warning save/load regression accepting both historical and current names.

The test catalogs also report no matching parachute preset, and the embedded J135W/J800T curves fail digest matching; only three motor assignments resolve and the desktop resave keeps three curves. This does not establish the behavior of a fully populated desktop installation. The next motor investigation is to compare the embedded builders' current/historical digests with the saved references. Web export retains all five original curves and references exactly. No simulation was rerun, and Swing GUI interaction remains untested.

On desktop comparison failure the runner writes `report.json`, `desktop.log`, `expected.xml` and `actual.xml` under its output directory and exits nonzero. The full XML/logs remain local; the committed evidence contains the concise failure and relevant diff. The original bundled desktop test, generated RK6/fixed-seed test and bundled browser test still pass.

AI assistance: Codex using GPT-6 (runtime-supplied family; exact variant unavailable) implemented this proof and reviewed its source; executable Node, Chromium and JVM checks supplied the evidence above.
