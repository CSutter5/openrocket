# Configurable flight plots

The November 20, 2026 request adds the desktop plot configuration controls shown in the supplied screenshot to the existing browser flight graph. This is a bounded plotting follow-up to the browser simulation and multistage work; broader G1/G5/G6 parity remains open. Nothing is deployed or pushed.

## Decision and data contract

Expose each native `FlightDataBranch` channel as an additive `channels` map keyed by `FlightDataType.getSaveKey()`. Keep the existing four-column `series`, summaries, events, provenance, job cancellation and freshness contracts intact. The adapter only serializes recorded values; it does not calculate replacement flight quantities. Missing and nonfinite samples become `null` without shifting other channels' indexes. Every branch retains its own name and events.

Read every stored `.ork` data column and flight event, accepting the stable save keys and historical English type names. Retain the existing finite time/altitude `points` projection for its callers. Loading, plotting, styling and session runs preserve the original archive, including stored data and opaque entries. No shared command, server compute, schema migration, engine-global preferences or new dependency is added.

Export built-in channel categories, labels, units, affine conversions, event labels and all four line styles from desktop classes during the existing component metadata build. The nine presets mirror `SimulationPlotConfiguration.DEFAULT_CONFIGURATIONS`. Port the desktop two-axis range fitting and automatic-axis goodness weights into presentation code. These choices avoid deriving velocities or accelerations from altitude, duplicating the flight engine, or maintaining an independent unit table. Preserve the earlier graph's small length-unit choices alongside desktop distance units.

## Controls and limits

The graph opens with Vertical motion vs. time. It provides all nine presets and Custom, grouped X/Y variables, independent units, up to 15 Y series, Auto/Left/Right axes, add/remove, color, Solid/Dashed/Dotted/Dash-dotted, Set as default and Reset. Event controls include individual selections, All/None, vertical lines and numbered icons with textual event descriptions. For non-time X axes, samples stay in flight order and event positions interpolate from branch time. Gaps split rendered lines. Empty/constant ranges remain finite. A live graph follows the controls; Plot moves focus to it. Legends name each quantity, branch, unit and axis, supplementing the colorblind-safe palette and line samples.

Unavailable built-in quantities and absent event types remain visible but disabled; selecting a preset with missing data reports the missing quantities. Historical custom columns remain accessible as recorded values without adding custom expression evaluation. Appearance defaults last for the current mounted flight-panel session and are labeled accordingly; they do not persist to account settings or native `<plotappearance>` entries. Graph configuration and appearance edits remain local presentation state. This implements the screenshot's controls, not every desktop chart-window action or persistent plot preference.

## Verification

`web/app/test/plot-controls.mjs` generates its fixture with the native loader/simulator/saver. It checks every stored column against the raw native XML (71 channels in this fixture), independently known feet/G/minutes/freezing-point conversions, sparse/constant/nonmonotonic inputs, every preset, units, axes, appearance/default/reset, event controls, the 1–15 series limit, Plot focus, 760×640 and 360×640 viewports and unchanged download bytes. It runs a real browser flight and compares its channel schema and initial physical values with an independently loaded JVM flight. Computation time is excluded from cross-runtime equality because it measures actual execution duration; its data shape and finite/null representation are still checked. The unchanged four legacy columns are checked against their corresponding new channels.

Run with the documented desktop classpath and an existing production preview:

```bash
ORK_PROOF_CLASSPATH="$(cat /tmp/openrocket-simulation-classpath.txt)" PLAYWRIGHT_BROWSERS_PATH=/tmp/openrocket-g1-browsers ORK_POC_URL=http://127.0.0.1:4175 node --experimental-strip-types web/app/test/plot-controls.mjs
```

The native engine build, app build/typechecks and focused plot check passed with Chromium 149.0.7827.55. The initial sandbox blocked Gradle cache writes and Chromium launch; approved reruns completed. The first interaction run also exposed an incorrect computation-time equality assertion, corrected as explained above. Evidence is generated under ignored `web/app/build/gp/plot-controls-report.json` and `plot-controls.png`. The focused test is included in the aggregate acceptance runner; running it alone does not establish a full acceptance run.

Existing `simulation.mjs` (including job races and both saved steppers), `saved-flights.mjs` (including all 1,942 catalog assets), `multistage.mjs`, `layout.mjs` and `components.mjs` all emitted success reports. The ad hoc combined process subsequently exited 143; its individual JSON reports and output record the completed checks. A standalone focused run exited 0. A subsequent 360-pixel check exposed an overflowing X selector, fixed with a constrained mobile grid; both phone and tablet checks then passed. The local preview also stopped with signal 143 and was restarted after one connection-refused attempt. No full aggregate acceptance run, account/server integration test or deployment is claimed for this change.
