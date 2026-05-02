# hatchling — Design Doc (v0)

> Tool name: **`hatchling`**. Org / brand: **`hatchsec`**.
> A security posture scanner for MCP servers configured on a developer's machine.
> Module path: `github.com/hatchsec/hatchling`. Binary name: `hatchling`.

---

## 1. Problem

The Model Context Protocol (MCP) lets developers extend AI coding agents (Claude Code, Cursor, Cline, Continue, Windsurf, etc.) with third-party tools. Each MCP server is granted broad scopes — filesystem access, shell exec, network calls, environment variables — and runs in the same trust boundary as the user's local agent.

There is currently no `npm audit` equivalent for MCP. Developers install servers from random GitHub repos and have no way to answer:

- What MCP servers are configured on my machine?
- What can each one actually do?
- Who maintains it, and is the project alive?
- Does it do what it claims, or is it asking for capabilities it doesn't need?
- Has anyone vetted it for malicious behavior?

This is a brand-new attack surface (~18 months old at scale) with a rapidly growing installed base and effectively zero tooling.

## 2. Goal & Non-Goals

### Goal
A single-binary CLI tool that, in under 10 seconds and with zero configuration, gives a developer an honest assessment of the MCP security posture on their machine.

### Non-Goals (v0)
- Not a runtime monitor (deferred to v0.2 `watch` mode).
- Not a cloud service. No account, no telemetry, no upload.
- Not a malware sandbox. We do static + metadata analysis, not dynamic behavioral analysis.
- Not a vulnerability database. We flag patterns of risk; we don't maintain a CVE-style feed.
- Not enterprise. No org dashboards, no SSO, no policy enforcement (deferred to vNext).

### Tone
Useful, honest, opinionated, fast. The output should feel like advice from a paranoid friend, not a compliance tool.

## 3. Audience

Primary: individual developers using Claude Code, Cursor, Cline, etc. who installed a few MCP servers and have a vague unease about what they did.

Secondary (later): security-conscious dev teams who want a CI check on `.mcp.json` files in repos.

Distribution channels: GitHub, Homebrew, HN/Lobsters launch post, Claude Code & Cursor community Discords, `awesome-mcp` lists.

## 4. Architecture Overview

```
                    ┌─────────────────┐
                    │    discover     │  Find MCP configs across editors
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │   normalize     │  → []ServerConfig (uniform shape)
                    └────────┬────────┘
                             │
                ┌────────────┴────────────┐
                ▼                         ▼
        ┌──────────────┐          ┌──────────────┐
        │   inspect    │          │    enrich    │
        │ (MCP proto)  │          │  (metadata)  │
        └──────┬───────┘          └──────┬───────┘
               │                         │
               └────────────┬────────────┘
                            ▼
                    ┌──────────────┐
                    │     score    │  Apply risk rules
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
                    │    report    │  text | json | ci
                    └──────────────┘
```

Pure local execution. No daemon. Stateless between runs (cache only for metadata fetches).

## 5. Project Layout

```
hatchling/
├── cmd/
│   └── hatchling/
│       └── main.go                    # entry point, Cobra commands
├── internal/
│   ├── discover/
│   │   ├── discover.go                # orchestrator
│   │   ├── claude_code.go             # ~/.claude.json + project .mcp.json
│   │   ├── cursor.go                  # ~/.cursor/mcp.json
│   │   ├── cline.go                   # VSCode extension storage
│   │   ├── continue_dev.go
│   │   └── windsurf.go
│   ├── model/
│   │   └── server.go                  # ServerConfig, Capability, Finding types
│   ├── inspect/
│   │   ├── inspect.go                 # connect to server via stdio
│   │   └── protocol.go                # minimal MCP JSON-RPC client
│   ├── enrich/
│   │   ├── npm.go                     # registry.npmjs.org metadata
│   │   ├── pypi.go                    # pypi.org metadata
│   │   ├── github.go                  # repos, last commit, issues
│   │   ├── source.go                  # light AST scan (TS/JS/Python)
│   │   └── cache.go                   # 24h disk cache
│   ├── risk/
│   │   ├── rules.go                   # scoring rules
│   │   └── score.go
│   ├── report/
│   │   ├── text.go                    # pretty TTY output (lipgloss)
│   │   ├── json.go
│   │   └── ci.go                      # exit codes for CI use
│   └── version/
│       └── version.go                 # build-time version info
├── testdata/                          # fixture configs for unit tests
├── .github/
│   └── workflows/
│       ├── ci.yml                     # test, lint, vet
│       └── release.yml                # GoReleaser → GitHub releases + Homebrew
├── go.mod
├── go.sum
├── .goreleaser.yaml
├── LICENSE                            # MIT
├── README.md
├── SECURITY.md                        # disclosure policy
└── CHANGELOG.md
```

## 6. Module Responsibilities

### `discover/`
Knows the on-disk locations and config schemas for each supported editor. Produces a uniform `[]ServerConfig` regardless of source. Tolerates missing files (most users won't have all editors).

### `model/`
Shared types. Keep narrow; this is the contract between modules.

```go
type ServerConfig struct {
    Name      string
    Source    string            // "claude-code", "cursor", etc.
    Transport Transport         // stdio | sse | http
    Command   string            // for stdio
    Args      []string
    Env       map[string]string
    Package   *PackageRef       // npm | pypi | github | local
}

type Capability struct {
    Tools     []ToolDef
    Resources []ResourceDef
    Prompts   []PromptDef
}

type Finding struct {
    Severity  Severity          // info | low | medium | high | critical
    Code      string            // "MCP001", etc. — stable identifiers
    Message   string
    Server    string
    Evidence  string
}
```

### `inspect/`
Speak MCP protocol. For stdio servers: spawn the process, send `initialize`, then `tools/list` / `resources/list` / `prompts/list`, terminate. Capture what the server *actually* exposes vs. what it claims in its README.

Protocol is JSON-RPC 2.0 over stdin/stdout — ~200 lines of Go.

### `enrich/`
Per-package metadata enrichment. For npm packages: fetch from `https://registry.npmjs.org/<pkg>`. For PyPI: `https://pypi.org/pypi/<pkg>/json`. For GitHub-hosted: GitHub REST API (anonymous tier is fine for v0).

Light source analysis is optional and gated behind `--deep` flag. For TS/JS: walk the source tree, look for `child_process`, `fs.write*`, outbound `fetch`/`http` to non-declared hosts, `process.env` reads. For Python: similar with `subprocess`, `os.system`, `requests`, `os.environ`.

Cache responses on disk (`~/.cache/hatchling/`) for 24h to be a good registry citizen.

### `risk/`
Pure functions over `(ServerConfig, Capability, EnrichedMetadata)` → `[]Finding`. No I/O. Easy to unit test.

Starter rule set (each gets a stable code so reports can suppress / explain):

| Code   | Severity | Rule |
|--------|----------|------|
| MCP001 | high     | Server uses `latest` version specifier (no pinning) |
| MCP002 | medium   | Package not updated in >12 months |
| MCP003 | low      | Package <30 days old or <100 weekly downloads |
| MCP004 | high     | Source executes `child_process`/`subprocess` but tool description doesn't mention shell |
| MCP005 | high     | Source writes to filesystem outside its declared scope |
| MCP006 | medium   | Server requests env vars containing "TOKEN", "KEY", "SECRET" not declared in docs |
| MCP007 | medium   | Outbound network calls to hosts not mentioned in README |
| MCP008 | low      | No SECURITY.md or vulnerability disclosure policy in repo |
| MCP009 | high     | Repo archived or maintainer inactive >18 months |
| MCP010 | critical | Package name typosquats a known popular MCP server |
| MCP011 | info     | Tool capabilities exceed what README advertises (capability creep) |

Rules should be data-driven where possible (YAML or Go struct literals) so contributors can add them without rewiring scoring logic.

### `report/`
Three output modes:
- **`text`** (default): pretty per-server cards with color, severity emoji, finding details, and remediation hints. Use `lipgloss` or `pterm`.
- **`json`**: stable schema for tool consumers / CI.
- **`ci`**: minimal text + non-zero exit code on findings ≥ threshold (configurable).

## 7. CLI UX

```
hatchling                              # default: scan all discovered, print text report
hatchling scan                         # explicit form
hatchling scan --json                  # machine-readable
hatchling scan --ci --fail-on=high     # for CI
hatchling scan --source=cursor         # limit to one editor
hatchling scan --config=./.mcp.json    # explicit file
hatchling scan --deep                  # include source AST analysis (slower)
hatchling list                         # just enumerate, no analysis
hatchling inspect <name>               # detailed dive on one server
hatchling version
```

### Sample output (mocked)

```
$ hatchling
Scanning MCP configurations…
  Claude Code: 4 servers
  Cursor:      2 servers (1 duplicate skipped)
  Cline:       0 servers

5 unique servers · 2 issues found

▼ filesystem (npm: @modelcontextprotocol/server-filesystem@2025.10.4)
  ✓ Verified publisher · 2.3M weekly downloads · updated 3 days ago
  Capabilities: 11 tools · file read/write within /Users/you/projects
  Risk: low

▼ github-mcp (npm: random-author/github-mcp@latest)
  ⚠ Pinned to "latest" — version drift risk          [MCP001 · high]
  ⚠ Source contains child_process.exec but README    [MCP004 · high]
    only describes read-only GitHub queries.
    Evidence: src/tools/repo.ts:142
  Capabilities: 6 tools · network · shell exec
  Risk: high

▼ weather (npm: weather-mcp@1.2.0)
  Capabilities: 1 tool · network (api.weather.gov)
  Risk: low

Summary
  Total servers:  5
  Findings:       2 high, 0 medium, 0 low
  Recommendation: review github-mcp before next session.

Full report: hatchling scan --json > report.json
```

## 8. v0 Scope

In v0:
- Discover configs from Claude Code and Cursor (the two biggest installs)
- Connect to stdio MCP servers and enumerate capabilities
- Fetch metadata from npm and GitHub
- Apply rules MCP001–MCP011 (above)
- Render text + JSON reports
- Ship as a single binary via Homebrew tap and GitHub releases
- README, SECURITY.md, MIT license, GoReleaser CI

Out of v0 (don't build yet):
- Cline / Continue / Windsurf discovery (add post-launch as adoption signal warrants)
- PyPI enrichment
- Source AST scan (`--deep`)
- HTTP/SSE remote server support
- Diff mode
- `watch` runtime proxy mode
- Curated registry / known-good lookups
- Web-based scanner

## 9. Roadmap

**v0.1** — broaden coverage: PyPI, Cline, Continue, Windsurf. Stabilize JSON schema.
**v0.2** — `--deep` source AST analysis. `diff` mode (compare to previous scan).
**v0.3** — `watch` mode (runtime proxy that tails actual MCP traffic).
**v0.4** — `inspect` deep dive UI (interactive TUI).
**v1.0** — public registry of vetted MCP servers (community-curated).
**vNext (paid)** — hosted dashboard for teams: cross-machine fleet view, policy enforcement, CI/CD integration. PLG only — no sales motion.

## 10. Tech Stack & Dependencies

- **Language**: Go 1.23+
- **CLI framework**: `github.com/spf13/cobra`
- **TTY rendering**: `github.com/charmbracelet/lipgloss` (clean, modern)
- **HTTP**: stdlib `net/http` (no client lib needed)
- **JSON-RPC**: hand-rolled (~200 lines, pinned to MCP spec version)
- **Testing**: stdlib `testing` + `github.com/stretchr/testify`
- **Build/release**: GoReleaser
- **Lint**: `golangci-lint`

Keep dependency surface small — this is a security tool. Every dep is an attack vector. No transitive surprises.

## 11. Distribution

- **Primary**: Homebrew tap (`brew install yourname/tap/hatchling`)
- **Secondary**: GitHub releases (signed binaries for darwin/linux/windows × amd64/arm64)
- **Tertiary**: `go install github.com/yourname/hatchling/cmd/hatchling@latest`
- **No npm.** Deliberately. We are a security tool; we will not ship via the most-attacked package ecosystem.

## 12. Launch Plan

1. **Build v0.** ~2–3 weekends with Claude Code.
2. **Dogfood.** Run on your own machine, your friends', any MCP-using devs you can find.
3. **Scan the wild.** Pull the top ~200 published MCP servers from the public registries / awesome lists. Run analysis. Identify the worst offenders.
4. **Coordinate disclosure.** For anything actually exploitable, contact maintainers, give 30–90 days.
5. **Write the post.** "I scanned 1,000 MCP servers. Here's what I found." Publish on personal blog + cross-post HN, Lobsters, /r/cybersecurity, Bluesky.
6. **Seed communities.** Post in Claude Code, Cursor, MCP Discord. Submit to awesome-mcp lists.
7. **Listen.** What do early users actually want? Build that next, not what the roadmap says.

## 13. Starter Prompts for Claude Code

These are scoped, sequential prompts to drive the build commit-by-commit. Run each in a fresh Claude Code session, review the diff, commit, move on. Don't let it freelance across multiple stages.

### Prompt 1 — Scaffold
> "Set up a new Go project for a CLI tool called `hatchling`. Use Go 1.23+, Cobra for CLI, and the layout described in `hatchling-design-doc.md` section 5. Create `go.mod`, the directory tree, an empty `main.go` that wires up Cobra with `scan`, `list`, `inspect`, and `version` subcommands, a basic README, MIT LICENSE, SECURITY.md, .gitignore, and a `golangci-lint` config. The subcommands should print 'not implemented yet' for now. Make sure `go build ./...` and `go test ./...` both pass."

### Prompt 2 — Discovery (Claude Code)
> "Implement `internal/discover/claude_code.go`. It should locate Claude Code's MCP configuration: `~/.claude.json` (top-level `mcpServers` key) and any `.mcp.json` in the current working directory or its parents (walk up to the git root or filesystem root). Parse them into `model.ServerConfig` values. Handle missing files gracefully (return empty slice, not error). Include unit tests with fixture files in `testdata/`."

### Prompt 3 — Discovery (Cursor)
> "Implement `internal/discover/cursor.go`. Cursor stores MCP config at `~/.cursor/mcp.json`. Same shape and handling as the Claude Code discoverer. Add fixture and tests."

### Prompt 4 — Discovery orchestrator
> "Implement `internal/discover/discover.go` that runs all registered discoverers, deduplicates servers (same command + args), and returns a unified `[]ServerConfig` with provenance (which editor(s) registered each). Wire it into the `list` subcommand so `hatchling list` prints a table of discovered servers."

### Prompt 5 — MCP protocol client
> "Implement `internal/inspect/protocol.go` — a minimal MCP JSON-RPC 2.0 client that can spawn a stdio MCP server, send `initialize`, then `tools/list`, `resources/list`, `prompts/list`, and shut down cleanly. Use only stdlib. Pin to MCP spec version 2025-06-18. Include a 5-second timeout per request and clean process termination on context cancel. Add tests using a fake stdio server fixture."

### Prompt 6 — npm enrichment
> "Implement `internal/enrich/npm.go` that, given a package name, fetches metadata from `https://registry.npmjs.org/<name>` and returns publish date of latest version, weekly downloads (from `https://api.npmjs.org/downloads/point/last-week/<name>`), maintainers, and repository URL. Add disk cache at `~/.cache/hatchling/npm/<name>.json` with 24h TTL. Tests with httptest server."

### Prompt 7 — Risk rules
> "Implement `internal/risk/` with the rule set described in section 6 of the design doc, codes MCP001–MCP011. Each rule is a pure function `(ServerConfig, Capability, EnrichedMetadata) -> []Finding`. Implement only MCP001, MCP002, MCP003, MCP009, MCP011 in this pass — they need no source analysis. Comprehensive table-driven tests."

### Prompt 8 — Report
> "Implement `internal/report/text.go` using `lipgloss` to produce the output shown in section 7 of the design doc. Also implement `json.go` with a stable schema. Wire both into the `scan` subcommand with `--json` flag. Snapshot test the text output."

### Prompt 9 — Release pipeline
> "Set up GoReleaser config and a GitHub Actions release workflow that, on tag push, builds binaries for darwin/linux/windows on amd64/arm64, signs them, creates a GitHub Release, and updates a Homebrew tap repo. Also add a CI workflow for PRs that runs `go test`, `go vet`, and `golangci-lint`."

### Prompt 10 — README polish
> "Write a final README.md modeled on Trivy's: hero badge row, one-paragraph pitch, install instructions for brew/go install/manual, a runnable example with output, scope/non-goals, contributing notes, security disclosure policy, license. Make it good — first impressions matter for OSS."

## 14. Resolved Decisions

| Question | Decision |
|---|---|
| Tool name | `hatchling` |
| Org / brand | `hatchsec` (GitHub org, eventual company name) |
| Go module path | `github.com/hatchsec/hatchling` |
| Binary name | `hatchling` |
| License | MIT (tool + all assets — no split licensing) |
| Cache location | XDG: `~/.cache/hatchling/` (override via `XDG_CACHE_HOME`) |
| Config location | XDG: `~/.config/hatchling/config.toml` (optional, for v0.2+) |
| Telemetry | None. Period. Document this prominently. |
| GitHub API auth | Anonymous by default; `GITHUB_TOKEN` env override |
| Disclosure policy | 90-day responsible disclosure, documented in SECURITY.md |
| MCP transport in v0 | stdio only (HTTP/SSE deferred) |
| Editor coverage in v0 | Claude Code + Cursor only |
| Domain to register | `hatchsec.dev` (primary), `hatchsec.io` (defensive) |
| Business entity | Defer. No LLC needed pre-revenue. Revisit if hosted tier ships. |

## 15. Pre-Flight Checklist (do these before first `git commit`)

- [ ] Create GitHub org `hatchsec`
- [ ] Register `hatchsec.dev` (Cloudflare or Porkbun, ~$15/yr)
- [ ] Register `hatchsec.io` defensively
- [ ] Create empty repo `hatchsec/hatchling` (public, MIT, no template)
- [ ] Push this design doc to `hatchsec/hatchling/docs/design.md` as first commit
- [ ] Verify current MCP spec version (was 2025-06-18 at design time; check spec repo)
- [ ] Verify current Claude Code config path (`~/.claude.json` is correct as of last check, but Anthropic moves things)
- [ ] Verify current Cursor config path (`~/.cursor/mcp.json`)
- [ ] Reserve `hatchling` package name on Homebrew tap (`hatchsec/homebrew-tap`)
- [ ] Decide: GitHub Sponsors enabled from day one, or off until launch?

## 16. Things That Need Verification at Start (not decisions, just facts to confirm)

These were correct as of the design doc but the ecosystem moves fast:

1. **MCP spec version** to pin to. Check https://spec.modelcontextprotocol.io for current.
2. **Claude Code MCP config path.** Verify `~/.claude.json` still holds `mcpServers`, or whether it's moved to `~/.claude/settings.json` or similar.
3. **Cursor MCP config path and schema.** Verify shape.
4. **MCP TS SDK package name** (for spawning test fixtures). Was `@modelcontextprotocol/sdk`.

Have Claude Code do a 10-minute reconnaissance pass at the start of session 1 to confirm these, before writing any code.

## 15. Risks / Things That Could Go Wrong

- **Low adoption.** MCP is hot but installed base is still in the hundreds of thousands, not millions. Mitigation: launch content matters more than features.
- **MCP spec churn.** Spec is still evolving. Mitigation: pin to spec version, gate breaking changes behind detection.
- **Maintainer pushback.** Some MCP authors will be annoyed by your scoring. Mitigation: be precise, evidence-based, and offer suppression mechanism (`# hatchling: ignore MCP001 reason="bla"`).
- **You get bored.** Mitigation: ship small, ship often, don't pre-build the SaaS. Treat OSS adoption as the win condition for v0.

## 17. Testing & Fixture Strategy

You don't run any MCP servers locally. That's actually an opportunity: the *first thing you build* is your test fixture suite, which doubles as your dogfood-installation set. Two kinds of test assets:

### Fixture MCP servers (live, runnable)

Tiny servers that live in `testdata/servers/` and are spawned by integration tests. Also installable into your real Claude Code config so `hatchling` finds them when you scan your own machine.

**Build at minimum these four** (TypeScript, ~50 lines each, using `@modelcontextprotocol/sdk`):

1. **`fixture-clean`** — well-behaved, single capability. Declares one tool (`echo`) that does exactly what its description says. Pinned version. Active maintainer (you). Should score green across the board.
2. **`fixture-noisy`** — trips MCP004, MCP005, MCP011. Advertises itself as a "weather lookup" but the source executes shell commands and writes to `/tmp`. Capabilities exceed README claims.
3. **`fixture-stale`** — manifests as installed via `latest`, last-published date forged-old in test metadata. Trips MCP001 + MCP002.
4. **`fixture-broken`** — crashes during `initialize`. Used to verify graceful degradation in `inspect/`.

These are also your demo material. The launch blog post can show real `hatchling` output against `fixture-noisy` to illustrate findings.

### Protocol fixtures (golden files, no execution)

For unit tests of `inspect/protocol.go`, capture real MCP JSON-RPC exchanges as static JSON files in `testdata/protocol/`:
- `initialize_request.json` / `initialize_response.json`
- `tools_list_response_simple.json`
- `tools_list_response_complex.json`
- `error_response_method_not_found.json`

The protocol parser reads these without spawning processes. Fast, deterministic, no flakes.

### Beta testing with your devs

Your dev team running multiple MCPs is a gold-mine resource. Don't squander it on premature feedback. Use them in two waves:

**Wave 1 (after v0 ships locally on your machine):** Send 2–3 trusted devs the binary. Ask one question: *"Does it find your servers correctly? Paste the `--json` output."* That gives you real-world config diversity and confirms discovery works outside fixtures.

**Wave 2 (after risk rules feel right):** Ask the same group: *"Look at the findings on your machine — do any feel like false positives? Any obvious risks it missed?"* Iterate the rules from real signal, not imagined.

Don't ask devs to install via `go install` — give them a prebuilt binary or Homebrew tap. Friction kills feedback loops.

### Anti-patterns to avoid

- **Don't run real third-party MCP servers as test dependencies.** Slow, flaky, network-dependent, security risk. Fixtures only.
- **Don't fetch live npm/GitHub data in unit tests.** Mock with `httptest`. Reserve live calls for one or two opt-in integration tests.
- **Don't aim for 100% coverage on v0.** Aim for confidence on the protocol parser, discovery, and risk rules. Reports and CLI plumbing can be lighter.

---

*Working doc — iterate as you learn. The scope discipline matters more than any specific decision here.*
