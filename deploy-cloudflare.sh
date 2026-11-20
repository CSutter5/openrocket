#!/usr/bin/env bash
set -euo pipefail

usage() {
    printf 'Usage: %s [--dry-run]\nBuild the latest local commit and deploy it to Cloudflare.\n' "$0"
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

if ! "$dry_run" && { [[ -z "${OPENROCKET_ORIGIN:-}" ]] || [[ -z "${AUTH_SECRET:-}" ]]; }; then
    printf 'Set OPENROCKET_ORIGIN to the deployed HTTPS origin and AUTH_SECRET to a stable secret before deploying accounts.\n' >&2
    exit 1
fi

repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
for command in git npm node java; do
    command -v "$command" >/dev/null || { printf 'Required command not found: %s\n' "$command" >&2; exit 1; }
done
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
