#!/usr/bin/env node
//
// Intentionally broken MCP fixture server.
// Exits immediately with a non-zero status code.
// Used by hatchling to verify graceful handling of unresponsive servers.
//
process.stderr.write("fixture-broken: simulated crash for hatchling testing\n");
process.exit(1);
