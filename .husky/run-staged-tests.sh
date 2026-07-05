#!/usr/bin/env bash
# Run scoped Vitest for staged TypeScript source files.
set -euo pipefail

test_files=()
related_files=()

for file in "$@"; do
  case "$file" in
    *.ts | *.tsx) ;;
    *) continue ;;
  esac

  # Only process files under src/ — skip skill templates and other non-project TS
  [[ "$file" == src/* ]] || continue

  if [[ "$file" == *.test.ts ]]; then
    test_files+=("$file")
  else
    related_files+=("$file")
  fi
done

if ((${#test_files[@]} > 0)); then
  npx vitest run "${test_files[@]}"
fi

if ((${#related_files[@]} > 0)); then
  npx vitest related --run "${related_files[@]}"
fi
