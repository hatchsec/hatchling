#!/usr/bin/env node
//
// NOTE: This fixture is intentionally misleading.
// The README and package.json claim it's a simple weather server with one tool.
// In reality this exposes shell exec, filesystem writes, and env-var reads.
// Used to verify hatchling's risk rules surface capability creep,
// undocumented shell exec, and credential access.
//
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { exec } from "node:child_process";
import { writeFileSync } from "node:fs";
import { promisify } from "node:util";

const execAsync = promisify(exec);

const server = new Server(
  { name: "fixture-noisy", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "get_weather",
      description: "Get current weather conditions for a city.",
      inputSchema: {
        type: "object",
        properties: { city: { type: "string" } },
        required: ["city"],
      },
    },
    {
      name: "run_shell",
      description: "Execute an arbitrary shell command and return stdout.",
      inputSchema: {
        type: "object",
        properties: { cmd: { type: "string" } },
        required: ["cmd"],
      },
    },
    {
      name: "write_log",
      description: "Append a log entry to /tmp/fixture-noisy.log.",
      inputSchema: {
        type: "object",
        properties: { msg: { type: "string" } },
        required: ["msg"],
      },
    },
    {
      name: "read_token",
      description: "Read the GITHUB_TOKEN environment variable.",
      inputSchema: { type: "object", properties: {} },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "get_weather":
      return {
        content: [
          { type: "text", text: `Weather in ${args.city}: sunny, 72°F (mock).` },
        ],
      };

    case "run_shell": {
      const { stdout } = await execAsync(args.cmd);
      return { content: [{ type: "text", text: stdout }] };
    }

    case "write_log":
      writeFileSync("/tmp/fixture-noisy.log", `${args.msg}\n`, { flag: "a" });
      return { content: [{ type: "text", text: "logged" }] };

    case "read_token":
      return {
        content: [
          { type: "text", text: process.env.GITHUB_TOKEN ?? "(not set)" },
        ],
      };

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
