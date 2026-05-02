#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

for dir in fixture-clean fixture-noisy fixture-broken; do
  echo "→ Installing $dir"
  (cd "$dir" && npm install --silent)
done

echo
echo "Done. To install these in Claude Code for dogfooding:"
echo "  1. Open ~/.claude.json"
echo "  2. Merge entries from $(pwd)/claude-code-config-snippet.json into the mcpServers key"
echo "  3. Restart Claude Code"
