# Local rocket editor

This implements the bounded P01–P04 editor from [the POC plan](../../docs/web-app/poc-plan.md). It runs in one browser with one in-memory archive, without login, credentials or a backend. React/TypeScript/Vite supplies the UI; the pinned Java reducer and archive codec run in a dedicated browser Web Worker. Java and Node are development/build tools, not physics services.

## Start locally

Use Java 17 and Node 22.12+ with npm. Install, build and test directly in the local checkout, currently `/home/colin/Documents/openrocket`. The older NAS filesystem rejects npm workspace symlinks; use an isolated local worktree only if working from that filesystem. From the local repository root:

```sh
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

Vite serves static files; neither start command starts a JVM, API or storage service. Flights run only after **Run flight**, in a separate browser Worker. Runtime assets and the bundled sample are included in `web/app/dist/`.

For Cloudflare hosting preparation, use the [build, dry-run and local Workers preview guide](../../docs/web-app/cloudflare-deployment.md). `npm run prepare:cloudflare --prefix web` builds the engine and app and validates the hosting config without deploying. Deployment is a separate manual step.

## Desktop-style workspace

The UI follows the dark desktop OpenRocket layout. Use **Rocket design**, **Motors & Configuration** and **Flight simulations** to switch workspaces; Left/Right and Home/End work when a tab is focused. The rocket view stays below every tab. Its zoom buttons change the view only; **Fit** restores the initial scale. Choose samples from **File**, or use **Open local .ork** and **Download .ork** in the toolbar.

Select a component and choose **Edit**, or double-click it in the tree or drawing. The component editor applies each field with its own **Apply** button. **Close** or Escape dismisses it and discards unapplied drafts. The window is modeless, allowing selection, units, file operations and simulation controls to remain available. The component palette and structural tools are disabled until their editing support exists.

**Motors & Configuration** lists the document’s motor configurations. **Select motor** opens only the full bundled catalog: 1942 curves with search, manufacturer, impulse, diameter, length, mount-fit, already-used, production and similar-curve filters. Choose a mount, motor and ejection delay, then OK to save the assignment and embedded curve in the document. Only linked stored results become outdated. **New configuration** opens the same catalog with a configuration name; **Create configuration** adds the configuration and a linked saved simulation together. **Rename configuration** changes its name. **Delete configuration** removes it and all linked simulations after a dialog showing what will be removed. Cancel leaves the file unchanged. New configurations require a single axial stage and an existing motor mount.

**Flight simulations** contains only actual simulations from the document, with Run flight, Plot and Cancel flight controls. Select a row and run it using its archived motor configuration and supported launch/weather settings. Unsupported settings show a reason. Double-click a row or choose Plot to open its stored or new altitude/time graph. Switching tabs retains the flight and its result. New browser results remain in memory and do not overwrite archived stored data. See [configuration controls and validation](../../docs/web-app/configuration-controls.md).

## Demo

1. The app opens a desktop-valid rocket sample with a nose, body and three fins. Choose samples from File. Click a part in the drawing or component tree to select it, then choose Edit (or double-click the part). **Open explicit tube sample** retains the original minimal fixture. Tab/Enter also selects tree buttons and submits labeled forms.
2. Rename it, for example to `Local & desktop <tube>`, and apply the name. Change outer radius to `0.03` m. The selected BodyTube also has **length** and **wall thickness** controls; try `0.55` m and `0.002` m. Observe the intrinsic radius, wall, mass/local CG and labeled SVG. These exclude overrides/motors and are not whole-rocket properties.
3. Enter `NaN`, `0` or a negative value. The accepted measurements and downloadable archive remain unchanged. A valid radius of `0.0005` m demonstrates Java's thickness clamp in this sample.
4. Choose **Download .ork**, then open the downloaded file with **Open local .ork**. Export feedback means a download was prepared; check browser downloads for the actual file. It does not confirm durable disk/cloud saving.

Opening another file or reloading discards the session. Changes since import/export are labeled in text. The original upload stays in memory for unchanged export and preservation; it is never overwritten on disk. Rejected replacement imports and rejected edits retain the last accepted archive. Imported scripts are data and never run. No cloud autosave, structural edits, undo, general stability analysis, 3D, account or collaboration feature is provided.

## Length units

Use **Length units** in the drawing toolbar to choose **Meters (m)** or **Inches (in)**. Radius, length, wall thickness, local CG, supported ring dimensions and both drawing labels follow this selection. Inputs accept the selected unit; requests to Java and exported archives stay in SI (1 inch = 0.0254 metres). Switching units preserves unsubmitted drafts and does not mark the document changed. The choice lasts for the current browser session and defaults to meters on reload. Mass stays in kg, density in kg/m³, and raw imported properties are displayed as stored.

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

`test:app` builds/typechecks, starts the production preview on loopback port 4173 (or `ORK_POC_PORT`), drives actual Chromium interactions/downloads, runs the existing JVM fixture generators and name/radius oracles against those downloads, checks the whole-rocket drawing and length/wall edits, and stops its preview. Tests use Node’s type-stripping flag for the small shared drawing projection (included by the npm script). It tests the bundled explicit fixture plus rich explicit/preset and automatic-ring fixtures derived from the desktop simple rocket. Each rich case has 13 components, two decals, five motor assignments, six historical simulations and 3,014 stored points. Independent annular-cylinder mass and centroid expectations supplement the JVM comparisons. The existing explicit-hole desktop-only reload failure is retained as an expected rejection control.

Evidence goes to ignored `web/app/build/gp/` (override with `ORK_POC_OUTPUT`): `gp.json`, `interactions.json`, `roundtrip.json`, downloaded `.ork` files, desktop re-saves/reports/logs and `explicit-editor.png`, `ring-editor.png`, `underfit-rejected.png`, `read-only.png`, `rocket-drawing.png`, `expanded-properties.png`. Lexical checks cover all XML except permitted name/radius/wall/preset/status spans, all attachment hashes, IDs/references and every stored series; desktop checks cover complete relevant state, full serialization and save/reload. Reopening those desktop re-saves is also exercised in the browser. No user archive is required.

The existing workspace regressions run separately with `npm test --prefix web`; focused desktop I/O/digest regressions are listed in [the acceptance evidence](../../docs/web-app/poc-acceptance.md). Broader simulation/browser/platform certification and hosted benchmarks are outside GP.

AI assistance: Codex using GPT-6 (runtime-supplied family; exact variant unavailable), without subagents, implemented and reviewed the POC. TypeScript/Vite, actual Chromium interactions/downloads, lexical preservation checks and existing pinned desktop oracles provide verification. The human contributor remains responsible for reviewing all changes.

User-requested drawing extension: `EditorDrawing` reconstructs the bounded exterior scene with events enabled and emits polygons from current-core geometry getters. `drawing.mjs` checks all SVG vertices against the actual desktop-loaded sample and rich fixture, plus independently specified sample extents and mouse/keyboard selection. The normal engine source/digest checks and production build passed. The same user follow-up also authorizes length/wall controls; their desktop and preservation checks run in `properties.mjs`. See [extension evidence](../../docs/web-app/editor-extension.md) for results and limits.


## Bounded local flight simulation

Open a document with saved simulations, select a row in **Flight simulations**, and choose **Run flight**. Each row uses its archived configuration, motor, integrator and supported launch/weather settings. The tab has no manual settings or “Session flight” row. To try a new flight, choose **File → Open flight-ready sample**, then **Motors & Configuration → New configuration**. Select an Estes C6 catalog curve and a 3-second delay, create the configuration, then run its new simulation row. The sample’s original synthetic curve stays in its original archived configuration; the catalog chooser offers catalog motors only.

Flights reconstruct the accepted archive in Java, including internals; the SVG drawing is not a simulation model. Imported format-1.11 designs support the existing bounded single-stage graph, up to 64 components, 1–16 configurations with an explicit default, one active motor mount and one or two parachutes. Unknown physics fields, ambiguous positions, missing inputs, unsupported components, pods/clusters/stages and extensions/scripts refuse explicitly. See [saved settings and input bounds](../../docs/web-app/saved-simulations-and-motors.md). The drawing toolbar’s **Flight configuration** choice changes the drawing/motor-editor selection only; a simulation row always uses its own archived link.

Motor references resolve to verified embedded curves or matching bundled catalog records. The J135W/J800T legacy references retain their established handling. Unknown/mismatching digests refuse. Imported settings, stored series, custom expressions and assets remain preserved; expressions and imported scripts are never evaluated. Catalog changes explicitly edit the archive. New configurations save a real linked simulation with deterministic initial settings; existing simulations retain their own saved settings.

A run shows progress, completion/failure or termination-based **Cancel flight**. Starting another run terminates the preceding job and rejects late replies. Captured results stay with their own row and become outdated after document changes. Units convert presentation without changing inputs. New results are discarded on reload and never replace stored data in `.ork` downloads. G1/G5 and general desktop parity remain unclaimed.

The existing build/test commands now include the workflow. A focused rerun, with a production preview already running on port 4173, is:

```sh
ORK_PROOF_CLASSPATH="$(cat /tmp/openrocket-simulation-classpath.txt)" PLAYWRIGHT_BROWSERS_PATH=/tmp/openrocket-g1-browsers ORK_POC_URL=http://127.0.0.1:4173 node --experimental-strip-types web/app/test/simulation.mjs
```

The test regenerates native saved rows using the original synthetic profile settings, compares both steppers and an actual UI-edited variant against the JVM, tests independent motor impulse/interpolation and tube mass/CG, and exercises real UI cancellation, responsiveness, row switching, replacement/restart races and failure recovery. Run `saved-flights.mjs` before the dependent `imported-flight.mjs`, `configurations.mjs` and `desktop-ui.mjs` modules; the acceptance runner orders these automatically. `motor-filters.mjs` covers desktop filter boundaries and native metadata relationships. `simulation-jobs.mjs` tests message races separately. Reports, raw series, reference XML, UI downloads and a screenshot stay under the ignored acceptance output directory.


The [import follow-up record](../../docs/web-app/imported-browser-simulation.md) covers the user-reported saved-simulation refusal, independent multi-component fixtures and the separate read-only check of `example rocket.ork`. The latter is never a regression fixture or modified. Its RK6 trace uses a different adaptive grid from JVM; the recorded numerical differences are not general parity certification.


The [saved simulation and bundled motor record](../../docs/web-app/saved-simulations-and-motors.md) documents the current row selection, graph, supported settings and explicit motor-assignment behavior. `test/saved-flights.mjs` is included in acceptance: native desktop options are the oracle for two distinct saved conditions and a new catalog motor. It also verifies all 1942 exported curves with the actual desktop RSE loader, exact curve asset hashes, targeted stored-result invalidation, preserved settings/series/attachments, damaged-asset rejection and missing-configuration refusal. Catalog outputs are regenerated from the bundled database at predev/prebuild and are not checked in. Active multilevel wind and other unrepresented saved settings refuse explicitly; stored graphs remain viewable.
