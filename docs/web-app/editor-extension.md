# Rocket drawing and additional properties

The user reviewed GP and requested a rocket drawing and more editable properties. This authorizes the bounded exterior drawing and BodyTube length/wall extension; accounts, backend integration, simulations, structural edits, full catalogs and broad compatibility remain deferred. The original [GP evidence](poc-acceptance.md) remains a historical checkpoint, and G1 stays held.

The editor opens a desktop-valid nose/body/fin sample immediately. The prominent SVG shows the supported exterior of one axial stage: nose cones, transitions, body tubes and uncanted trapezoidal fins. Curves, automatic radii, positions and fin instance geometry come from current-core Java methods in the dedicated browser Worker. TypeScript only scales the returned vertices for display. Clicking or keyboard-activating a part selects its property panel. Unsupported/interior parts are listed as omitted; multistage/pod graphs, flipped noses and explicit shell offsets have clear drawing limitations. The original local tube schematic remains in a disclosure.

Alongside component name and outer radius, explicit BodyTubes without automatic descendant geometry gain length and wall-thickness controls. Length changes retain the two known presets; wall changes clear a preset, clamp through the actual setter, and make filled tubes hollow. Functional change comes from the Java rocket modification ID, preserving correct stored-result invalidation even when a clamped wall value ends unchanged. Existing automatic-ring radius editing and explicit-hole refusal are retained. The codec changes only the accepted scalar/preset/status spans and preserves opaque XML, assets, IDs/references and series.

Density remains read-only. Actual desktop testing showed that a density-only edit can lose implicit material metadata and the previous document-material catalog entry. No density setter is exposed or committed as working; supporting material history/catalog semantics is separate work. Other component types retain their current read-only numeric properties.

The [run guide](../../web/app/README.md) documents setup and controls. Validation runs in `/tmp/openrocket-editor-next`; the complete production-build Chromium/JVM acceptance command passed, including the original GP workflow, every supported drawing vertex, pointer/keyboard selection and six additional property edits. The workspace regressions passed two contract tests, seven fixture manifests, 49 codec tests and 12 platform tests. The final rerun passed on clean committed source `592ca7fee` before and after execution. [Machine-readable evidence](editor-extension-evidence.json) records hashes, states and outcomes. The drawing checkpoint is `9f11ad652`. A first drawing attempt exposed disabled component events (body positioned at the nose origin); enabling ordinary Java events corrected it and the actual-desktop vertex comparison passed. A development hot reload reset a later in-progress property test, so final acceptance uses a static production preview.

AI assistance: Codex using GPT-6 (runtime-supplied family; exact variant unavailable), without subagents, implemented and reviewed this extension. Chromium, pinned desktop oracles and codec regressions provide executable validation. No resources were deployed or commits pushed.


Reproduce from the prepared `/tmp/openrocket-editor-next` checkout:

```sh
npm run dev:app --prefix web
npm run build:app --prefix web
ORK_PROOF_CLASSPATH="$(cat /tmp/openrocket-editor-classpath.txt)" ORK_POC_OUTPUT=/tmp/openrocket-editor-next/web/app/build/extension-acceptance PLAYWRIGHT_BROWSERS_PATH=/tmp/openrocket-g1-browsers npm run test:app --prefix web
npm test --prefix web
```

All build/acceptance/regression commands passed. Stop the dev server or use another terminal for acceptance; it launches and stops its own static preview. Engine artifacts were regenerated with `node web/engine-adapter/scripts/build.mjs`, preserving source/digest pins and original/adapted JVM transcript equality. The desktop classpath uses the unchanged documented `:core:orkProofClasspath` task with output `/tmp/openrocket-editor-classpath.txt`. Evidence and screenshots are under `web/app/build/extension-acceptance/` in that checkout; no generated archive or screenshot is needed in the source tree.

A separate read-only check opened the user-owned archive in Chromium and compared all seven exterior polygons to the pinned desktop model with zero screen-coordinate error. Its BodyTube length/wall controls are enabled. That optional check does not modify the archive or make the app/tests depend on it. Its SHA-256 remains `e862a60191b1d13306cb9de0263ce6e60bed347293a03d50338551aa9b4363dc`. No NAS move was required; /tmp quota was resolved by removing reproducible dependencies/build outputs from the older owned scratch checkout and a disposable npm download cache, preserving source changes and round-trip evidence.
