#!/bin/bash

# postToolUse hook — scoped Vitest for security-critical risk area edits.
# Highest risk in test-plan.md: #1 (calendar assignee row, High×High) — Phase 3.
# Phase 1 (implementing) covers #2 token leakage, #3 auth gates, #5 RLS isolation.
# Input: { "tool_name": "Write", "tool_input": { "file_path": "..." }, ... }

input=$(cat)

file_path=$(echo "$input" | jq -r '.tool_input.file_path // .tool_input.path // .file_path // empty')

if [[ -z "$file_path" ]]; then
  exit 0
fi

case "$file_path" in
  *.ts | *.tsx) ;;
  *) exit 0 ;;
esac

# Risk area gate — Phase 1 security-critical paths (risks #2, #3, #5)
case "$file_path" in
  */src/middleware.ts | */src/middleware.*) ;;
  */src/pages/api/*) ;;
  */src/lib/*) ;;
  */src/test/*) ;;
  */src/**/*.test.ts) ;;
  *) exit 0 ;;
esac

vitest="./node_modules/.bin/vitest"

if [[ "$file_path" == *.test.ts ]]; then
  run_tests=( env AI_AGENT=1 "$vitest" run "$file_path" )
else
  run_tests=( env AI_AGENT=1 "$vitest" related --run "$file_path" )
fi

if output=$("${run_tests[@]}" 2>&1); then
  exit 0
fi

test_message=$(jq -n --arg fp "$file_path" --arg out "$output" \
  '"Scoped tests failed after editing \($fp). Fix these issues before continuing:\n\n\($out)"')

cat << EOF
{
  "additional_context": $(echo "$test_message" | jq -Rs .)
}
EOF
exit 2
