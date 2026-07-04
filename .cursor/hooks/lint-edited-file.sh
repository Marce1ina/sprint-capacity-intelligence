#!/bin/bash

# postToolUse hook — run ESLint on agent-edited files and report failures to the agent.
# Input: { "tool_name": "Write", "tool_input": { "file_path": "..." }, ... }

input=$(cat)

file_path=$(echo "$input" | jq -r '.tool_input.file_path // .tool_input.path // .file_path // empty')
tool_name=$(echo "$input" | jq -r '.tool_name // empty')
write_content=$(echo "$input" | jq -r '.tool_input.content // .tool_input.contents // empty')

if [[ -z "$file_path" ]]; then
  exit 0
fi

case "$file_path" in
  *.ts | *.tsx | *.astro) ;;
  *) exit 0 ;;
esac

eslint="./node_modules/.bin/eslint"

run_eslint() {
  if [[ "$tool_name" == "Write" && -n "$write_content" ]]; then
    "$eslint" --stdin --stdin-filename "$file_path" <<< "$write_content" 2>&1
  elif [[ -f "$file_path" ]]; then
    "$eslint" --fix "$file_path" 2>&1
  else
    return 0
  fi
}

if output=$(run_eslint); then
  exit 0
fi

lint_message=$(jq -n --arg fp "$file_path" --arg out "$output" \
  '"ESLint failed after editing \($fp). Fix these issues before continuing:\n\n\($out)"')

cat << EOF
{
  "additional_context": $(echo "$lint_message" | jq -Rs .)
}
EOF
exit 2
