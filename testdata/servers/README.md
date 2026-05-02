# Fixture MCP Servers

Three local MCP servers used for both:

1. **Integration tests** — `hatchling` spawns these to verify discovery and protocol inspection work end-to-end.
2. **Local dogfooding** — install them in your own Claude Code config so `hatchling` has something to scan when run on your machine.

## The fixtures

| Name | Purpose | Should score |
|---|---|---|
| `fixture-clean` | Single tool that does exactly what it says. Pinned dep, clean source. | All green |
| `fixture-noisy` | README claims weather lookup. Source has shell exec, fs writes, env reads, and 3 undocumented tools. | High risk (MCP004, MCP005, MCP006, MCP011) |
| `fixture-broken` | Exits immediately with non-zero. Used to test inspect/ error handling. | N/A — should fail gracefully |

## Setup

```bash
cd testdata/servers
./install-all.sh
```

This runs `npm install` in each fixture directory. Takes ~30 seconds.

## Install in Claude Code (for dogfooding)

After running setup, edit `~/.claude.json` to add the `mcpServers` entries from `claude-code-config-snippet.json`. Adjust the absolute paths if your repo lives somewhere other than `~/Documents/hatchsec/hatchling/`.

Restart Claude Code. The fixtures will load (one will fail to load — that's `fixture-broken`, which is the point).

To remove later: delete the three entries from `~/.claude.json` and restart Claude Code.

## What each fixture exercises

**`fixture-clean`** validates the happy path. `hatchling inspect fixture-clean` should successfully connect, enumerate one `echo` tool with a matching description, and report no findings.

**`fixture-noisy`** is the demo target. `hatchling inspect fixture-noisy` should surface multiple findings:
- `run_shell` tool exposes shell exec but README only mentions weather
- `write_log` writes to filesystem outside any declared scope
- `read_token` reads `GITHUB_TOKEN` env var — credentials access not documented
- Tool count (4) exceeds README claims (1)

**`fixture-broken`** validates graceful degradation. `hatchling scan` should not panic, hang, or skip the server — it should surface a clear "could not inspect" finding and continue with the others.

## Notes

- These are deliberately plain Node.js (no TypeScript build step) to keep test setup fast. Real-world MCP servers are usually TypeScript.
- The package.json files are `private: true` and never published.
- The dependency surface is minimal — only `@modelcontextprotocol/sdk`.
