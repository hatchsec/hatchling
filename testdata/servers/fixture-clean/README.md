# fixture-clean

A minimal, well-behaved MCP server used as a positive control in `hatchling`'s test suite.

## Tool

- **`echo(message)`** — returns `message` unchanged.

That's it. No filesystem access, no network, no shell, no environment reads.

## Why it exists

When `hatchling` scans this server, it should produce zero security findings. If it produces any findings, either the rules have a false positive or the fixture has drifted from its claims — both bugs.
