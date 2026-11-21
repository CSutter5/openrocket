# Browser editor, accounts and shared rockets

Flight simulations → Plot provides the desktop's nine presets, X/Y variables and units, left/right/automatic axes, series colors/styles, add/remove controls and flight event markers. Appearance defaults are session-only. See the [plot controls and verification record](../../docs/web-app/plot-controls.md).

Open Preferences in the signed-in account navigation for UI and Units. Draft changes have a local preview; Apply saves to the account, Cancel discards the remaining draft and OK saves/returns. Theme, font/scale/tracking and unit defaults follow the account across browsers without changing a shared rocket. Unit defaults apply on the next rocket/component open; unavailable desktop quantities are marked. Run `npm run test:preferences --prefix web`; see the [preferences contract](../../docs/web-app/preferences.md).

Run `npm run build:app --prefix web`, then `npm run preview:cloudflare --prefix web` from the repository root. Open `http://127.0.0.1:8787`, create an account and create a rocket. Accounts own multiple rockets at URLs such as `/alice/alpha/`. New rockets are Restricted. Use Share from the library or editor to choose Public viewing, grant existing usernames Viewer/Editor access, control downloads, remove access or transfer ownership. Public viewing never grants editing. Transfer preserves the share URL and gives the former owner Editor access with downloads. Download settings control the app's export feature; they cannot retrieve copies or prevent extracting data already received by a browser. See the [sharing contract and verification](../../docs/web-app/sharing.md), or run `npm run test:sharing --prefix web`.

Use either the Start from scratch card or the Upload a rocket card, which accepts a selected or dropped file. Enter a name; the URL is generated automatically. Uploads preserve the existing archive and its attachments. Owners can delete their rockets after confirming the popup. Account forms and the directory replace the earlier username prompt.

Production accounts, sessions and ownership metadata use Cloudflare D1; each rocket's current archive lives in its own Cloudflare Durable Object. The dedicated remote `openrocket-accounts` database is created/migrated. Preview and automated tests use Wrangler's isolated Cloudflare emulation. The preview helper supplies a temporary process-only auth secret unless `AUTH_SECRET` is set, so sign in again after restarting it. No application-managed SQL file or database daemon is used.

The one-time migration creates username `admin` with temporary password `admin`. Sign in on the home page and set a new password of at least eight characters before using the account. Then open Admin panel or `/admin/` to list users/rockets, delete either, or revoke ordinary users' sessions. Only this protected administrator account can access the panel. Later migrations/previews never reset its password. See the [administrator and deletion contract](../../docs/web-app/admin-and-deletion.md).

Owners can Rename rocket from its library entry or editor header; existing share links remain valid. Account settings lets any signed-in user change their password using the current password and signs out their other sessions. Run `npm run test:account-settings --prefix web` for these browser and authorization checks; see the [name/password contract](../../docs/web-app/account-settings.md).

To use a tube as a motor mount, edit a body or inner tube, open Motor, and enable This component is a motor mount. Set overhang and default ignition if needed, then OK or Apply and open Motors & Configuration. The enabled tube is available in the catalog's Motor mount selector. See the [mount editing and desktop verification record](../../docs/web-app/motor-mount-controls.md).

The [account run and verification record](../../docs/web-app/accounts-and-rockets.md) describes auth, URLs, concurrency, storage and deployment setup. Run `npm run test:accounts --prefix web`, `npm run test:coediting --prefix web`, `npm run test:management --prefix web` or `npm run test:cloudflare --prefix web` for their separate checks. Deployment now requires a stable `AUTH_SECRET` and `OPENROCKET_ORIGIN`; `./deploy-cloudflare.sh --dry-run` still stops before remote changes. No app deployment was performed for this increment. Plain Vite retains the local-only workflow below.

`./deploy-cloudflare.sh` loads those settings from the ignored `.env` beside the script, with exported values taking precedence. Use `.env.example` and `chmod 600 .env` once for each checkout. The [deployment settings guide](../../docs/web-app/cloudflare-deployment.md#persistent-deployment-settings) explains setup; never regenerate the auth secret for routine deployments.

## Browser-local workflow

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

The workspace fits the current browser height. Long lists, filters and editor contents scroll within their panels; the drawing, toolbar and status stay in the window. Short landscape windows place the editor and drawing beside each other. Dialogs stay within the viewport, with motor selection actions kept visible.

Select a component and choose **Edit**, or double-click it in the tree or drawing. The component editor applies each field with its own **Apply** button. **Close** or Escape dismisses it and discards unapplied drafts. The window is modeless, allowing selection, units, file operations and simulation controls to remain available. The component palette and structural tools are disabled until their editing support exists.

**Motors & Configuration** lists the document’s motor configurations. **Select motor** opens only the full bundled catalog: 1942 curves with search, manufacturer, impulse, diameter, length, mount-fit, already-used, production and similar-curve filters. Choose a mount, motor and ejection delay, then OK to save the assignment and embedded curve in the document. Only linked stored results become outdated. **New configuration** opens the same catalog with a configuration name; **Create configuration** adds the configuration and a linked saved simulation together. **Rename configuration** changes its name. **Delete configuration** removes it and all linked simulations after a dialog showing what will be removed. Cancel leaves the file unchanged. New configurations activate every direct axial stage and require an existing motor mount. Assign a motor to each stage’s mount separately. **Stage settings** edits active stages, separation and motor ignition for the selected configuration with atomic OK/Cancel; at least one stage must remain active.

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

The existing one-ring subset is retained: one direct centered TOP single-instance automatic-outer CenteringRing, with explicit hole or the already-proven single explicit InnerTube sibling and required nose/configuration prefix. Unknown or ambiguous dependencies/positioning refuse editing. An explicit ring hole that would exceed its parent's inner radius rejects, because desktop reload would disable automation. This POC does not broaden those proofs. Other component properties are read-only, and unsupported shapes are omitted with an explanation. The prominent SVG depicts the supported exterior of a single axial stage: Java nose/transition profiles, body tubes and uncanted trapezoidal fins. Automatic shell radii and positions come from Java. Clickable outlines and keyboard controls select components. Unsupported/interior shapes are listed as omitted; pods and explicit shell offsets remain outside this drawing path. Multistage axial designs use native reconstructed geometry, selected active stages and supported fin outlines; see [the multistage record](../../docs/web-app/multistage.md). The original selected-tube schematic remains available in a disclosure.

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

Flights reconstruct the accepted archive in Java, including internals; the SVG drawing is not a simulation model. Imported format-1.11 designs support bounded axial multistage graphs, up to 64 components and 1–16 configurations with an explicit default. Each configuration has explicit stage flags; multiple mounts, native separation/ignition settings, freeform fins, fin tabs and optional recovery are supported. At least one active stage must have a resolved motor. Graphs show every named flight branch. Unknown physics fields, ambiguous positions, missing inputs, unsupported components, pods/parallel boosters/clusters and extensions/scripts refuse explicitly. See [saved settings and input bounds](../../docs/web-app/saved-simulations-and-motors.md). The drawing toolbar’s **Flight configuration** choice changes the drawing/motor-editor selection only; a simulation row always uses its own archived link.

Motor references resolve to verified embedded curves or matching bundled catalog records. The J135W/J800T legacy references retain their established handling. Unknown/mismatching digests refuse. Imported settings, stored series, custom expressions and assets remain preserved; expressions and imported scripts are never evaluated. Catalog changes explicitly edit the archive. New configurations save a real linked simulation with deterministic initial settings; existing simulations retain their own saved settings.

A run shows progress, completion/failure or termination-based **Cancel flight**. Starting another run terminates the preceding job and rejects late replies. Captured results stay with their own row and become outdated after document changes. Units convert presentation without changing inputs. New results are discarded on reload and never replace stored data in `.ork` downloads. G1/G5 and general desktop parity remain unclaimed.

The existing build/test commands now include the workflow. A focused rerun, with a production preview already running on port 4173, is:

```sh
ORK_PROOF_CLASSPATH="$(cat /tmp/openrocket-simulation-classpath.txt)" PLAYWRIGHT_BROWSERS_PATH=/tmp/openrocket-g1-browsers ORK_POC_URL=http://127.0.0.1:4173 node --experimental-strip-types web/app/test/simulation.mjs
```

The test regenerates native saved rows using the original synthetic profile settings, compares both steppers and an actual UI-edited variant against the JVM, tests independent motor impulse/interpolation and tube mass/CG, and exercises real UI cancellation, responsiveness, row switching, replacement/restart races and failure recovery. Run `saved-flights.mjs` before the dependent `imported-flight.mjs`, `configurations.mjs` and `desktop-ui.mjs` modules; the acceptance runner orders these automatically. `motor-filters.mjs` covers desktop filter boundaries and native metadata relationships. `simulation-jobs.mjs` tests message races separately. Reports, raw series, reference XML, UI downloads and a screenshot stay under the ignored acceptance output directory.


The [import follow-up record](../../docs/web-app/imported-browser-simulation.md) covers the user-reported saved-simulation refusal, independent multi-component fixtures and the separate read-only check of `example rocket.ork`. The latter is never a regression fixture or modified. Its RK6 trace uses a different adaptive grid from JVM; the recorded numerical differences are not general parity certification.


The [saved simulation and bundled motor record](../../docs/web-app/saved-simulations-and-motors.md) documents the current row selection, graph, supported settings and explicit motor-assignment behavior. `test/saved-flights.mjs` is included in acceptance: native desktop options are the oracle for two distinct saved conditions and a new catalog motor. It also verifies all 1942 exported curves with the actual desktop RSE loader, exact curve asset hashes, targeted stored-result invalidation, preserved settings/series/attachments, damaged-asset rejection and missing-configuration refusal. Catalog outputs are regenerated from the bundled database at predev/prebuild and are not checked in. Active multilevel wind and other unrepresented saved settings refuse explicitly; stored graphs remain viewable.


## Creating components and displaying stability

Use File → New for an empty rocket, or select a component in an imported design and choose a compatible part in Add new component. The web palette uses native defaults/compatibility for all 21 types. Body parts offer insert-after/end when appropriate; the new component opens in the editor's General tab. Native CG/CP markers follow the selected configuration where the static model is supported. Axial multistage designs and bounded freeform fins now have native centers; pods/parallel boosters and unrepresented fields show unavailable centers. See [the creation/stability record](../../docs/web-app/component-creation.md) for the preserved archive contract and limits.

Simulation units and Graph altitude units offer mm, cm, m, km, in, ft, yd and mi. The drawing and dimension controls follow the same selection. Changes convert presentation and leave archive bytes and calculated results intact. The normal app build now also generates native component defaults into ignored `build/components/`; no extra dependency or runtime JVM is required.


## Editing component values and structure

Under Advanced, the Imported properties panel edits every displayed scalar and its existing attributes. It expands automatically for parts outside the explicit-tube quick controls, including newly created automatic BodyTubes. Each measured field has a unit selector, and exports retain native SI/degrees. Apply each Advanced property separately. Enumeration/boolean selectors and numeric validation use the native field definitions. Component IDs and nested XML remain protected. Existing drawing/flight support limits still apply to a design after raw archive edits.

Move up/down reorders adjacent siblings, Duplicate appends a copy including children with fresh IDs, and Delete removes the selected subtree. The rocket root and last axial stage are protected. Configuration stage flags track stage identities; stage zero is activated if deletion would leave no active stage, matching desktop reload. Saved series, settings and assets stay preserved. See [the editing and deletion verification record](../../docs/web-app/component-editing.md).

The default component editor now follows the supplied desktop screenshots: General, Shoulder/Fin tabs where applicable, Override, Appearance and Comment. Each measured input has its own unit selector; selectors do not alter the file or other fields. OK saves all tab/name changes together and Cancel discards them. Advanced retains Imported properties and the earlier explicit-tube controls, also with independent units and individual Apply. The parts library is omitted. See [the dialog/unit record](../../docs/web-app/component-dialogs.md) for behavior, validation and remaining limits.
