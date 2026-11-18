# Local editor POC

P01 supplies real archive import, a selectable component tree and read-only properties. Work continues sequentially through P02–P04 in [the authoritative POC plan](../../docs/web-app/poc-plan.md). No backend or credentials are used.

Install and run only in an isolated `/tmp` worktree on this filesystem:

```sh
npm ci --prefix web
npm run dev:app --prefix web
npm run build:app --prefix web
PLAYWRIGHT_BROWSERS_PATH=/tmp/openrocket-g1-browsers node web/app/test/p01.mjs
```

The last command expects the development server on port 5173 and an installed Playwright Chromium. Chromium opened the actual bundled three-component explicit-tube archive, selected the tube and checked its imported radius. The production build passed. The bundled sample reuses the explicit fixture in `platform-proof/vitest.radius.config.ts`; desktop round-trip acceptance follows in P03.

AI assistance: Codex using GPT-6 (runtime identity; exact variant unavailable), without subagents, implemented and inspected this increment. TypeScript/Vite and actual Chromium supplied the verification above.
