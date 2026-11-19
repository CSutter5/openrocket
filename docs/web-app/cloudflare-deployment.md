# Cloudflare browser editor hosting

The November 19, 2026 request authorizes preparing the existing browser editor for Cloudflare, with an explicit stop before deployment. This is the static hosting slice of T04 described in ADR-19. The app still owns one in-memory document per browser; imports, edits and flight jobs run locally. Hosting does not add accounts, cloud saves, collaboration or server simulation. G1 and the broader release gates remain held.

## Prepare without deploying

Use Java 17, Node 22.12+ and npm. Keep the repository's Git history available: the engine build checks the pinned desktop baseline with `git diff`, so a shallow checkout missing that commit cannot build it. Initialize the component database submodule. The main checkout's filesystem does not support npm workspace symlinks; use a fresh `/tmp` worktree, or another filesystem that does:

```sh
git worktree add --detach /tmp/openrocket-cloudflare HEAD
cd /tmp/openrocket-cloudflare
git submodule update --init core/resources-src/datafiles/openrocket-database
npm ci --prefix web
WRANGLER_SEND_METRICS=false npm run prepare:cloudflare --prefix web
```

`prepare:cloudflare` builds the pinned Java/TeaVM engine, checks the engine/source/catalog manifest, typechecks and builds the Vite app, then runs `wrangler deploy --dry-run`. The command stops after local validation. It needs no Cloudflare login, account ID, token or remote resources. The build may download npm/Gradle dependencies; Java and Node are build tools only.

The deployable assets are in `web/app/dist/`, including both generated browser workers and the bundled sample archives. The dry-run output is ignored under `web/app/build/cloudflare/`. [The app's Wrangler config](../../web/app/wrangler.jsonc) names `openrocket-browser-editor` and serves only `dist/`; there is no server entry point, API or storage binding. Keep the existing authenticated `web/platform-proof/` configurations separate.

## Exercise Cloudflare locally

After preparation, preview with:

```sh
WRANGLER_SEND_METRICS=false npm run preview:cloudflare --prefix web
```

Open `http://127.0.0.1:8787`. Wrangler uses its local Workers runtime; it does not deploy. Stop the preview with Ctrl-C before running the automated smoke check on the same port:

```sh
PLAYWRIGHT_BROWSERS_PATH=/tmp/openrocket-g1-browsers npm exec --prefix web -- playwright install chromium
PLAYWRIGHT_BROWSERS_PATH=/tmp/openrocket-g1-browsers WRANGLER_SEND_METRICS=false npm run test:cloudflare --prefix web
```

Alternatively, set `CHROMIUM_EXECUTABLE` to an installed Chromium executable. `test:cloudflare` rebuilds/typechecks the app, dry-runs Wrangler and starts/stops its own local runtime. It checks exact asset bytes, JavaScript/CSS MIME types, missing-resource 404s, real browser worker loading, rename/radius/download/reimport, and an archive-preserving flight. It requires no desktop test classpath; the existing [GP and numerical tests](../../web/app/README.md) retain their independent JVM comparisons. This smoke check verifies hosting integration, not new numerical parity.

## Later deployment — not performed

After deployment is separately authorized, select the target Cloudflare account and review the Worker name. Use the same verified local build; a Cloudflare-managed build is not configured because this engine requires Java/Gradle and pinned Git history. Make the matching source and required license notices available when distributing the application.

From the prepared checkout, run the following commands only at that later deployment step:

```sh
cd web/app
npm exec -- wrangler login
npm exec -- wrangler whoami
WRANGLER_SEND_METRICS=false npm exec -- wrangler deploy
```

Select the intended account explicitly with `CLOUDFLARE_ACCOUNT_ID` if the login can access several accounts. The deployment publishes the static editor at the returned `workers.dev` URL. It does not provision D1, R2 or Durable Objects and needs no application secrets. Custom domains and automatic deploys are not configured. Future updates repeat preparation and the explicit deployment command; rollback can rebuild and redeploy a previously verified source commit with its pinned lockfile and engine inputs. There is no cloud application data to migrate or restore in this slice.

This preparation created no Cloudflare resources and performed no Cloudflare login, deployment, DNS changes or Git pushes. Remote hosting remains unverified until a separately authorized deployment and smoke check.

The configuration follows Cloudflare's [Workers Static Assets documentation](https://developers.cloudflare.com/workers/static-assets/); the preparation command uses Wrangler's [deployment dry-run option](https://developers.cloudflare.com/workers/wrangler/commands/#deploy).

## Preparation evidence

On November 19, 2026, validation used the existing isolated `/tmp/openrocket-editor-next` worktree at `89de55b72` plus these preparation changes, with its initialized database submodule and installed dependencies. Its unrelated untracked `.wrangler/` directory was retained. Java 17.0.21, Node 26.13.1, npm 12.2.2, Wrangler 4.164.0 and Chromium 149.0.7827.55 were actually exercised.

- `npm install --package-lock-only --ignore-scripts --offline --no-audit --no-fund` in `web/` passed. The lockfile adds only the app's direct reference to the already-pinned Wrangler; no package versions changed.
- `WRANGLER_SEND_METRICS=false npm run prepare:cloudflare` in `web/` passed: pinned core/catalog checks, Java/TeaVM builds, original/adapted JVM transcript equality, TypeScript/Vite and Wrangler dry-run. Wrangler reported no bindings and exited without deploying.
- `PLAYWRIGHT_BROWSERS_PATH=/tmp/openrocket-g1-browsers WRANGLER_SEND_METRICS=false npm run test:cloudflare` in `web/` passed all asset, 404 and actual Chromium edit/export/reimport/flight checks, with no page errors or off-origin page requests observed.
- `WRANGLER_SEND_METRICS=false npm run preview:cloudflare` in `web/` served HTTP 200 on loopback port 8787 and was stopped with Ctrl-C after verification.
- The complete intended diff and `git diff --check` were reviewed. The user-owned untracked `example rocket.ork` was left untouched.

Initial sandboxed attempts could not write the home Gradle cache/Wrangler logs or start the local runtime; reruns with the required local filesystem/socket permissions passed. No remote deployment, fresh dependency installation, full GP/desktop regression suite or broader numerical/production certification was run. This task changes hosting setup and adds a hosting smoke check; it does not change the editor, codec or engine implementation. A public issue/PR discovery search found no matching hosting change, but that indexed search was not exhaustive. The next step is user review and separate deployment authorization.

AI assistance: Codex using GPT-6 (runtime-supplied family; exact variant unavailable), without subagents, prepared the configuration, commands, hosting test and documentation. The checks above describe actual verification; the human contributor remains responsible for reviewing the changes.
