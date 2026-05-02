# fixture-broken

An MCP server that exits immediately with a non-zero status. Used to verify that `hatchling` handles unresponsive / failed servers without panicking, hanging, or skipping the rest of the scan.

## Tools

None — the process never gets that far.

## Expected behavior under hatchling

- `hatchling list` should still discover this server (it's in the config).
- `hatchling inspect fixture-broken` should report a clear "could not connect" finding within the timeout window.
- `hatchling scan` should not be derailed by this server — other fixtures should still be analyzed.
