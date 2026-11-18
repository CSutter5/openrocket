# Local editor acceptance

P01–P04 are implemented. The complete production-build Chromium/JVM acceptance command passed in `/tmp/openrocket-local-poc`; the final clean-checkout rerun is pending. This record will be finalized with that run's commit and evidence. G1 remains held, and no hosted resources, imported scripts or application simulations are run.

The [local run/demo guide](../../web/app/README.md) supplies the working setup, start, build and GP commands, supported-input bounds and evidence paths. P01 is `a1a6e4492`, P02 is `3985bfc5c`, and P03 is `dc741aa5b`. The bundled desktop-valid explicit tube and generated rich explicit/preset/automatic-ring files pass UI download/reimport and pinned desktop state/serialization/save/reload checks. Unsupported graphs, invalid inputs, failed replacement imports and the explicit-hole underfit preserve the accepted document.

Focused desktop compatibility checks used the documented test-runtime classpath and this command:

```sh
./gradlew :core:test --tests 'info.openrocket.core.file.openrocket.OpenRocketSaverTest' --tests 'info.openrocket.core.file.motor.TestMotorLoader' --tests 'info.openrocket.core.file.openrocket.importt.MotorHandlerTest' --tests 'info.openrocket.core.motor.MotorDigestTest' --no-daemon
```

All 47 tests passed. `npm test --prefix web` passed both contract tests, seven fixture manifests, 46 codec tests and 12 platform tests. The pinned engine build and its original/adapted JVM transcript comparison passed. The first sandboxed Gradle attempt needed its existing cache permissions and missing component-resource prerequisite; validation used the clean pinned database revision `c2e7c291c06b4a9c2ed7cf8179bc70856e8bfe64` copied from an inspected older worktree. Its uncommitted implementation changes were left untouched. Initial round-trip test expectations were corrected to grow the rich fixture from its existing 0.03 m radius and permit the codec's existing wall-number serialization; no engine/codec change was needed.

AI assistance: Codex using GPT-6 (runtime-supplied family; exact variant unavailable), without subagents, implemented and reviewed the POC and ran the executable checks. The Sites skill was used only for its local frontend workflow; no Site was registered or deployed.
