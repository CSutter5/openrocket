# Local rocket editor

This implements the bounded P01–P04 editor from [the POC plan](../../docs/web-app/poc-plan.md). It runs in one browser with one in-memory archive, without login, credentials or a backend. React/TypeScript/Vite supplies the UI; the pinned Java reducer and archive codec run in a dedicated browser Web Worker. Java and Node are development/build tools, not physics services.

## Start locally

Use Java 17 and Node 22.12+ with npm. On the main checkout's filesystem, npm workspace symlinks are unsupported: install, build and test in an isolated `/tmp` worktree. From the repository root, choose a new worktree path:

```sh
git worktree add --detach /tmp/openrocket-poc-demo HEAD
cd /tmp/openrocket-poc-demo
git submodule update --init core/resources-src/datafiles/openrocket-database
npm ci --prefix web
node web/engine-adapter/scripts/build.mjs
npm run dev:app --prefix web
```

Open the printed loopback URL, normally `http://127.0.0.1:5173`. The app's predev/prebuild check refuses missing or stale engine artifacts, adapter sources, catalog hashes or pinned core sources. Rebuild the engine after an adapter change. The build retains the two exact reviewed I/O corrections and immutable preference policy.

For a production build and local preview:

```sh
npm run build:app --prefix web
npm run preview --prefix web --workspace @openrocket/local-editor
```

Vite serves static files; neither start command starts a JVM, API, storage service or simulation. Runtime assets and the bundled sample are included in `web/app/dist/`.

## Demo

1. The app opens a desktop-valid rocket sample with a nose, body and three fins. Click a part in the drawing or component tree to select it. **Open explicit tube sample** retains the original minimal fixture. Tab/Enter also selects tree buttons and submits labeled forms.
2. Rename it, for example to `Local & desktop <tube>`, and apply the name. Change outer radius to `0.03` m. The selected BodyTube also has **length** and **wall thickness** controls; try `0.55` m and `0.002` m. Observe the intrinsic radius, wall, mass/local CG and labeled SVG. These exclude overrides/motors and are not whole-rocket properties.
3. Enter `NaN`, `0` or a negative value. The accepted measurements and downloadable archive remain unchanged. A valid radius of `0.0005` m demonstrates Java's thickness clamp in this sample.
4. Choose **Download .ork**, then open the downloaded file with **Open local .ork**. Export feedback means a download was prepared; check browser downloads for the actual file. It does not confirm durable disk/cloud saving.

Opening another file or reloading discards the session. Changes since import/export are labeled in text. The original upload stays in memory for unchanged export and preservation; it is never overwritten on disk. Rejected replacement imports and rejected edits retain the last accepted archive. Imported scripts are data and never run. No cloud autosave, structural edits, undo, simulation, stability, 3D, account or collaboration feature is provided.

## Length units

Use **Length units** in the file toolbar to choose **Meters (m)** or **Inches (in)**. Radius, length, wall thickness, local CG, supported ring dimensions and both drawing labels follow this selection. Inputs accept the selected unit; requests to Java and exported archives stay in SI (1 inch = 0.0254 metres). Switching units preserves unsubmitted drafts and does not mark the document changed. The choice lasts for the current browser session and defaults to meters on reload. Mass stays in kg, density in kg/m³, and raw imported properties are displayed as stored.

`test:app` also runs `test/units.mjs`: repeated switches and untouched inch submissions preserve exact archive bytes/presets/results, invalid drafts retain accepted state, and inch-based length/radius/wall downloads match the pinned desktop setters and save/reload. It writes `units-report.json` and `inches-editor.png` alongside the other acceptance evidence.

## Supported inputs

The bundled `public/explicit-tube.ork` is the simplest existing three-component explicit-tube proof fixture, stored as desktop-supported XML. Local imports reuse the existing bounded XML/GZIP/ZIP codec (4 MiB upload, 16 MiB expanded total, 8 MiB per entry, 64 entries). Unsafe/ambiguous archives reject explicitly. Preservation-only versions/identities can be inspected and downloaded unchanged; their controls are read-only.

Names use the codec's supported component/identity projection. Radius editing uses `tubeRadiusInput`, `applyTubeRadius`, the existing Java facade and existing stored-result invalidation. BodyTube length must be `(0,100]` m, radius/new radius `(0,1]` m, wall `[0,radius]` and bulk density `(0,50000]` kg/m³. Filled tubes retain their filled token. Only the exact `G1 proof` G1-A/G1-B preset records and digests are known; a changed radius clears their preset. Unknown presets and automatic BodyTube radii are read-only. The user-requested extension adds BodyTube length `(0,100]` m and wall thickness `[0,1]` m for explicit tubes without automatic descendant geometry. Java clamps wall thickness to the radius and switches a filled tube to hollow. Length edits retain a known preset; wall edits clear it. Java functional events, including events whose final wall value is unchanged after clamping, invalidate affected stored results. Density and material-catalog editing remain read-only.

The existing one-ring subset is retained: one direct centered TOP single-instance automatic-outer CenteringRing, with explicit hole or the already-proven single explicit InnerTube sibling and required nose/configuration prefix. Unknown or ambiguous dependencies/positioning refuse editing. An explicit ring hole that would exceed its parent's inner radius rejects, because desktop reload would disable automation. This POC does not broaden those proofs. Other component properties are read-only, and unsupported shapes are omitted with an explanation. The prominent SVG depicts the supported exterior of a single axial stage: Java nose/transition profiles, body tubes and uncanted trapezoidal fins. Automatic shell radii and positions come from Java. Clickable outlines and keyboard controls select components. Unsupported/interior shapes are listed as omitted; multistage/pod graphs and explicit shell offsets are not drawn. The original selected-tube schematic remains available in a disclosure.

Stored series and opaque XML/attachments remain preserved. Physical edits mark supported stored-result statuses outdated; no-op edits retain original bytes/statuses. Imported series remain unverified. Full desktop/component compatibility and the broader G1 gate remain deferred/held.

## Reproduce GP

After the setup above, stop the development server if it is not needed. Generate the existing desktop test classpath and install Playwright Chromium (or set `CHROMIUM_EXECUTABLE` to an existing Chromium executable):

```sh
./gradlew -I web/packages/ork-format/jvm/classpath.gradle :core:orkProofClasspath -Dork.proof.classpath=/tmp/openrocket-poc-classpath.txt --no-daemon
PLAYWRIGHT_BROWSERS_PATH=/tmp/openrocket-g1-browsers npm exec --prefix web -- playwright install chromium
ORK_PROOF_CLASSPATH="$(cat /tmp/openrocket-poc-classpath.txt)" PLAYWRIGHT_BROWSERS_PATH=/tmp/openrocket-g1-browsers npm run test:app --prefix web
```

`test:app` builds/typechecks, starts the production preview on loopback port 4173, drives actual Chromium interactions/downloads, runs the existing JVM fixture generators and name/radius oracles against those downloads, checks the whole-rocket drawing and length/wall edits, and stops its preview. Tests use Node’s type-stripping flag for the small shared drawing projection (included by the npm script). It tests the bundled explicit fixture plus rich explicit/preset and automatic-ring fixtures derived from the desktop simple rocket. Each rich case has 13 components, two decals, five motor assignments, six historical simulations and 3,014 stored points. Independent annular-cylinder mass and centroid expectations supplement the JVM comparisons. The existing explicit-hole desktop-only reload failure is retained as an expected rejection control.

Evidence goes to ignored `web/app/build/gp/` (override with `ORK_POC_OUTPUT`): `gp.json`, `interactions.json`, `roundtrip.json`, downloaded `.ork` files, desktop re-saves/reports/logs and `explicit-editor.png`, `ring-editor.png`, `underfit-rejected.png`, `read-only.png`, `rocket-drawing.png`, `expanded-properties.png`. Lexical checks cover all XML except permitted name/radius/wall/preset/status spans, all attachment hashes, IDs/references and every stored series; desktop checks cover complete relevant state, full serialization and save/reload. Reopening those desktop re-saves is also exercised in the browser. No user archive is required.

The existing workspace regressions run separately with `npm test --prefix web`; focused desktop I/O/digest regressions are listed in [the acceptance evidence](../../docs/web-app/poc-acceptance.md). Broader simulation/browser/platform certification and hosted benchmarks are outside GP.

AI assistance: Codex using GPT-6 (runtime-supplied family; exact variant unavailable), without subagents, implemented and reviewed the POC. TypeScript/Vite, actual Chromium interactions/downloads, lexical preservation checks and existing pinned desktop oracles provide verification. The human contributor remains responsible for reviewing all changes.

User-requested drawing extension: `EditorDrawing` reconstructs the bounded exterior scene with events enabled and emits polygons from current-core geometry getters. `drawing.mjs` checks all SVG vertices against the actual desktop-loaded sample and rich fixture, plus independently specified sample extents and mouse/keyboard selection. The normal engine source/digest checks and production build passed. The same user follow-up also authorizes length/wall controls; their desktop and preservation checks run in `properties.mjs`. See [extension evidence](../../docs/web-app/editor-extension.md) for results and limits.
