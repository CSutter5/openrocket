# Local editor POC

P01 supplies real archive import, a selectable component tree and read-only properties. P02 adds name/radius edits through a dedicated Java Web Worker and a labeled local SVG. Work continues sequentially through P03–P04 in [the authoritative POC plan](../../docs/web-app/poc-plan.md). No backend or credentials are used.

Install and run only in an isolated `/tmp` worktree on this filesystem:

```sh
npm ci --prefix web
node web/engine-adapter/scripts/build.mjs
npm run dev:app --prefix web
npm run build:app --prefix web
PLAYWRIGHT_BROWSERS_PATH=/tmp/openrocket-g1-browsers node web/app/test/p02.mjs
```

The last command expects the development server on port 5173 and an installed Playwright Chromium. Chromium opened the actual bundled three-component explicit-tube archive, selected the tube and checked its imported radius. The production build passed. The bundled sample reuses the explicit fixture in `platform-proof/vitest.radius.config.ts`; desktop round-trip acceptance follows in P03.

AI assistance: Codex using GPT-6 (runtime identity; exact variant unavailable), without subagents, implemented and inspected this increment. TypeScript/Vite and actual Chromium supplied the verification above.

P02 validation: the pinned engine build and adapted-JVM comparison, TypeScript/Vite build, and Chromium edit workflow passed. Chromium checked a dedicated Worker, escaped rename, radius growth and thickness clamping, updated intrinsic mass/local CG and SVG, no-op, empty/NaN/zero/negative/oversized numbers, keyboard component selection, read-only stage and malformed replacement recovery. Codec regressions remain passing. Export/reimport and explicit-hole underfit browser acceptance follow in P03/P04.

P03 validation: `ORK_PROOF_CLASSPATH="$(cat /tmp/openrocket-poc-classpath.txt)" PLAYWRIGHT_BROWSERS_PATH=/tmp/openrocket-g1-browsers node web/app/test/roundtrip.mjs` passed against the running local app. This downloads files through the UI and passes those exact paths to the existing name/radius desktop oracles. The sample and rich explicit/preset and automatic-ring fixtures passed complete relevant state, full desktop serialization, save/reload and browser reimport. Each rich case retained 13 components, two decals, five motor assignments, six simulations and 3,014 stored points. Lexical checks protect all XML outside the allowed spans, unknown/script content, attachments, IDs/references and every stored series. Loaded results became outdated on the radius edit. Chromium refused the explicit-hole underfit and downloaded the unchanged prior archive; the existing desktop control still reproduces reload drift. Evidence and screenshots are generated under `web/app/build/gp/` in the isolated worktree. GP awaits the P04 clean-checkout acceptance run.
