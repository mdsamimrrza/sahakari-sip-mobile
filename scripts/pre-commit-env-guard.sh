#!/usr/bin/env bash
# ============================================================
# SahakariSIP — pre-commit guard: never let a .env file enter
# git history. Install once per clone:
#   cp scripts/pre-commit-env-guard.sh .git/hooks/pre-commit
#   chmod +x .git/hooks/pre-commit
# ============================================================
set -euo pipefail

staged=$(git diff --cached --name-only --diff-filter=ACM)
bad=0
for f in $staged; do
  case "$f" in
    .env|.env.*)
      echo "pre-commit: blocked - '$f' looks like an environment file." >&2
      bad=1
      ;;
  esac
done

if [ "$bad" -ne 0 ]; then
  echo "Use .env.example for documentation; keep real values out of git." >&2
  exit 1
fi