# Local editor acceptance

**GP passed on November 18, 2026**, at implementation revision `b83daa29efbd1474a8c64173ca81720b593126f6` in fresh `/tmp/openrocket-poc-gp`. The checkout was clean before and after acceptance. [Machine-readable evidence](poc-evidence.json) records source/artifact hashes, Chromium version, complete relevant desktop states, archive preservation and the retained underfit failure. [Start/demo/build/test instructions](../../web/app/README.md) reproduce the result. Stop POC implementation here for user demo review; G1 remains held for the broader product.

The local commits are `a1a6e4492` (P01 visible real-archive editor), `3985bfc5c` (P02 Java Worker edits/SVG), `dc741aa5b` (P03 UI download and desktop round trip), and `b83daa29e` (P04 automated acceptance). The final documentation checkpoint records this evidence without changing the application. No engine, codec, authenticated Workers proof or desktop source was changed for this POC.

## What was exercised

Chromium **149.0.7827.55** opened the production Vite build with no account, backend or credentials. It selected the real sample tree, renamed with XML escaping, changed explicit radius, observed Java intrinsic dimensions/mass/local CG and updated SVG, exercised keyboard selection/submission, exported through actual browser downloads and reimported those files. No-op name/radius edits retained bytes/statuses. Empty/NaN/zero/negative/oversized numbers, an automatic-radius graph, unsupported component, preservation-only version and malformed replacement were exercised. Rejected edits and replacement imports retained the last accepted measurements and downloadable archive bytes; no page errors occurred.

The simplest three-component sample passed headless pinned desktop load/setter/full serialization/save/reload. Two rich desktop-generated fixtures (explicit/preset and automatic ring) each retained **13 components, two decals, five motor assignments, six simulations and 3,014 stored points**. Name and radius UI downloads passed the existing desktop oracles. Relevant Java state and full desktop XML matched; desktop re-saves reopened in Chromium too. Independent annular-cylinder mass and centroid expectations passed. Lexical assertions protect every XML byte outside the permitted name/radius/wall/preset/status spans, unknown/script XML, all attachment hashes, IDs/relationships, configuration/motor references and stored series. Six loaded result statuses became outdated on each rich physical edit; no series or simulation was executed.

The explicit-hole underfit was refused in Chromium, after which download was byte-identical to the accepted archive and a subsequent fitting edit succeeded. The independent desktop-only control still classifies the failure: shrinking the tube to `0.0005` m leaves the live ring automatic with zero outer radius and a `0.006` m hole; reload sets outer radius to `0.006` m and disables automation. Its existing committed failure/diff remain untouched. The POC adds neither a workaround nor an acceptance exception.

## Commands and observed outcomes

Commands below ran from `/tmp/openrocket-poc-gp` unless stated otherwise. Java was 17.0.21; Node was 26.13.1. The full commands and first-time setup are in the run guide.

| Command | Observed result |
| --- | --- |
| `git submodule update --init core/resources-src/datafiles/openrocket-database` | Pinned `c2e7c291c06b4a9c2ed7cf8179bc70856e8bfe64` initialized successfully. |
| `npm ci --prefix web --cache /tmp/openrocket-npm-cache` | Lockfile install succeeded; tracked tree remained clean. |
| `node web/engine-adapter/scripts/build.mjs` | Source pin, exact two reviewed I/O hashes, engine generation and original/adapted JVM transcript equality passed. Reducer: 1,894,542 bytes, SHA-256 `796b52a23b73073e063dab7de4546c683a4fe1f8bb6d230184da82eaa82e9ecb`. |
| `./gradlew -I web/packages/ork-format/jvm/classpath.gradle :core:orkProofClasspath -Dork.proof.classpath=/tmp/openrocket-poc-gp-classpath.txt --no-daemon` | Desktop test classpath generated successfully. |
| `PLAYWRIGHT_BROWSERS_PATH=/tmp/openrocket-g1-browsers npm exec --prefix web -- playwright install chromium` | Succeeded using the existing Chromium cache; Playwright used its Ubuntu fallback for this host. |
| `ORK_PROOF_CLASSPATH="$(cat /tmp/openrocket-poc-gp-classpath.txt)" PLAYWRIGHT_BROWSERS_PATH=/tmp/openrocket-g1-browsers npm run test:app --prefix web` | TypeScript/Vite build, loopback production preview, Chromium interactions/downloads, 136 digest vectors/preset factory checks and pinned desktop comparisons passed; `gp.json` reports passed. |
| `npm run dev:app --prefix web` | Source/artifact precheck passed; Vite served HTTP 200 on port 5174 because an owned prior server occupied 5173. |
| `npm run build:app --prefix web` | Passed during increment verification; the same app build also passed inside clean GP. |
| `npm run preview --prefix web --workspace @openrocket/local-editor` | Static preview served HTTP 200 on port 4173. |
| `npm test --prefix web` | Two contract tests, seven fixture manifests, 46 codec tests and 12 platform tests passed, including existing authenticated local Workers proofs. |

The following focused desktop command passed all **47 tests** in the first isolated `/tmp/openrocket-local-poc` worktree, with the same pinned core sources:

```sh
./gradlew :core:test --tests 'info.openrocket.core.file.openrocket.OpenRocketSaverTest' --tests 'info.openrocket.core.file.motor.TestMotorLoader' --tests 'info.openrocket.core.file.openrocket.importt.MotorHandlerTest' --tests 'info.openrocket.core.motor.MotorDigestTest' --no-daemon
```

Generated evidence stays in `/tmp/openrocket-poc-gp/web/app/build/gp/`: `gp.json`, `interactions.json`, `roundtrip.json`, actual UI downloads, desktop re-saves/reports/logs and screenshots `explicit-editor.png`, `ring-editor.png`, `underfit-rejected.png`, `read-only.png`. The compact committed JSON preserves the important observations/hashes; the test runner regenerates the larger artifacts. Review included the full source/lockfile diff and the rendered screenshots.

## Limits and handoff

Only the existing codec/Java input subset is advertised; see the run guide for exact bounds and known presets/dependencies. The SVG uses local coordinates for the selected supported tube and optional ring, omitting unsupported shapes. Mass/CG are intrinsic, excluding overrides/motors and whole-rocket totals. Files remain local and in memory until download; export feedback is not durable save confirmation. The user archive is not a fixture or dependency. Its SHA-256 remains `e862a60191b1d13306cb9de0263ce6e60bed347293a03d50338551aa9b4363dc` and it remains untracked.

Verification is Chromium on Linux and headless desktop JVM code, not Swing GUI, broad browser/platform certification, the full G1 corpus or hosted benchmarks. Simulations, accounts/auth, backend integration, collaboration/history, structural editing, undo, 3D and full compatibility remain deferred. Existing auth, source/preset/motor digest checks, immutable preferences and unsafe-edit evidence are unchanged. Nothing was pushed, deployed or published.

Initial environment failures were resolved without changing scope: sandboxed Gradle needed cache/socket permission and the first worktree lacked its component-resource prerequisite. A clean pinned database copy was used there after inspecting the older worktree's actual HEAD/dirty state; none of its uncommitted implementation work was reused or overwritten. The final checkout initialized the pinned submodule normally. Two round-trip test expectations were corrected for the fixture's starting radius and the codec's existing wall-number serialization; no engine/codec fix was needed. Current GitHub issue/PR discovery remained partial (filtered pages failed to fetch); no duplicate local POC implementation was found and no maintainer was contacted.

AI assistance: Codex using GPT-6 (runtime-supplied family; exact variant unavailable), without subagents, implemented/reviewed the POC and ran these checks. The Sites skill supplied only its local frontend workflow; no Site was registered or deployed. A human contributor remains responsible for understanding and reviewing every change before any future PR.
