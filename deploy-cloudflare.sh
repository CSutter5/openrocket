#!/usr/bin/env bash
set -euo pipefail

usage() {
    printf 'Usage: %s [--dry-run]\nBuild the latest local commit and deploy it to Cloudflare.\nDeployment settings are loaded from .env beside this script; exported values take precedence.\n' "$0"
}

dry_run=false
if (( $# > 1 )); then
    usage >&2
    exit 2
fi
case "${1:-}" in
    '') ;;
    --dry-run) dry_run=true ;;
    --help|-h) usage; exit 0 ;;
    *) usage >&2; exit 2 ;;
esac

repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
for command in git npm node java; do
    command -v "$command" >/dev/null || { printf 'Required command not found: %s\n' "$command" >&2; exit 1; }
done
if ! "$dry_run"; then
    if [[ -f "$repo_dir/.env" ]]; then
        deploy_origin_override=${OPENROCKET_ORIGIN:-}
        deploy_secret_override=${AUTH_SECRET:-}
        set -a
        # This is the operator's local shell environment file, never committed or copied to the build worktree.
        source "$repo_dir/.env"
        set +a
        if [[ -n "$deploy_origin_override" ]]; then export OPENROCKET_ORIGIN="$deploy_origin_override"; fi
        if [[ -n "$deploy_secret_override" ]]; then export AUTH_SECRET="$deploy_secret_override"; fi
        unset deploy_origin_override deploy_secret_override
    fi
    if ! node "$repo_dir/web/app/scripts/deploy-cloudflare.mjs" --check; then
        printf 'Save these settings in %s/.env (see .env.example), or export them before deploying.\n' "$repo_dir" >&2
        exit 1
    fi
fi
if ! git -C "$repo_dir" diff --quiet HEAD --; then
    printf 'Commit your tracked changes before deploying. This script builds the latest local commit.\n' >&2
    exit 1
fi
revision=$(git -C "$repo_dir" rev-parse --verify HEAD)
deploy_dir=$(mktemp -d /tmp/openrocket-cloudflare-deploy.XXXXXX)
registered=false
cleanup() {
    if "$registered"; then
        git -C "$repo_dir" worktree remove --force "$deploy_dir" || printf 'Could not remove build worktree: %s\n' "$deploy_dir" >&2
    else
        rmdir "$deploy_dir"
    fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

git -C "$repo_dir" worktree add --detach "$deploy_dir" "$revision"
registered=true
printf 'Building commit %s in %s\n' "$revision" "$deploy_dir"
git -C "$deploy_dir" submodule update --init core/resources-src/datafiles/openrocket-database
cd -- "$deploy_dir"
export WRANGLER_SEND_METRICS=false
npm ci --prefix web
npm run prepare:cloudflare --prefix web

if "$dry_run"; then
    printf 'Dry run complete. Nothing was deployed.\n'
else
    cd web/app
    node scripts/deploy-cloudflare.mjs
fi
