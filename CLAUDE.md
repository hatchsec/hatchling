# hatchling

Security posture scanner for MCP (Model Context Protocol) servers configured on a developer's machine. Open-source CLI, Go, MIT licensed, distributed via Homebrew and GitHub releases.

## Source of truth

Always read `docs/mcp-audit-design.md` before starting non-trivial work. It contains: architecture, project layout, module responsibilities, CLI UX, risk rules, v0 scope, resolved decisions, starter prompts. If anything in this CLAUDE.md conflicts with the design doc, the design doc wins.

## Tech stack

- **Language:** Go 1.23+
- **CLI framework:** `github.com/spf13/cobra`
- **TTY rendering:** `github.com/charmbracelet/lipgloss`
- **Testing:** stdlib `testing` + `github.com/stretchr/testify`
- **Lint:** `golangci-lint`
- **Build / release:** GoReleaser
- **Module path:** `github.com/hatchsec/hatchling`
- **Binary name:** `hatchling`

## Build & test commands

```bash
go build ./...                              # build everything
go test ./...                               # run all tests
go test -run TestName ./internal/discover   # run one test
go vet ./...                                # static checks
golangci-lint run                           # full lint
go run ./cmd/hatchling -- --help            # run from source
```

## Project conventions

- Layout follows design doc section 5. Don't restructure without a reason.
- Standard Go formatting: `gofmt -s -w .` before commit.
- Test files live next to source: `foo.go` + `foo_test.go`.
- Use stdlib where reasonable. Every dependency is an attack vector — this is a security tool.
- Pin all dependencies; no `latest` ever.
- Lowercase filenames, `snake_case` for multi-word filenames, `CamelCase` for Go identifiers per Go convention.
- Comments on exported identifiers per `golint` rules.
- Errors: return `error`, don't panic except in `main` for unrecoverable startup issues.
- Logging: stdlib `log/slog`. No third-party logger.

## Workflow

- **Every change goes through a PR.** Direct push to `main` is blocked.
- **Commits must be signed.** SSH commit signing is configured globally on this machine; if a commit isn't signed, the push will reject.
- **Branch naming:** `feature/<short-description>`, `fix/<short-description>`, `chore/<short-description>`.
- **Scope per PR:** one logical change. Smaller is better. The starter prompts in the design doc are sized to be one PR each.
- **Self-merge after CI passes.** No approval requirement (solo project).
- **Branch cleanup:** delete the local + remote branch after merge.

## Scope discipline (read this before adding anything)

The v0 scope is intentionally narrow. Do not exceed it without an explicit conversation:

- ✅ stdio MCP servers only (HTTP/SSE deferred to v0.2)
- ✅ Claude Code + Cursor discovery only (others deferred)
- ✅ npm + GitHub metadata enrichment only (PyPI deferred)
- ✅ Risk rules MCP001, MCP002, MCP003, MCP009, MCP011 in v0
- ✅ Text + JSON output only
- ❌ NO daemon, NO runtime proxy, NO `watch` mode (deferred to v0.2/0.3)
- ❌ NO telemetry. Ever. No phone-home, no anonymous metrics, no error reporting.
- ❌ NO web UI, NO hosted dashboard, NO auth, NO cloud anything
- ❌ NO source AST analysis (`--deep`) until v0.2
- ❌ NO custom configuration files yet (defaults only)

If a feature feels useful but isn't in the v0 list above or design doc section 8, it goes in a `BACKLOG.md` entry instead of getting built.

## Security posture (we ship a security tool — act like it)

- Minimize dependency count. Justify each new one in the PR description.
- All third-party API calls (npm, GitHub) cached on disk for 24h to reduce footprint.
- All network calls have explicit timeouts (5s default) and respect context cancellation.
- No execution of MCP server code beyond protocol exchange (`initialize`, `tools/list`, etc.). We don't sandbox-execute servers in v0.
- 90-day responsible disclosure for any vulnerable MCP servers we find in the wild.
- `SECURITY.md` documents the disclosure policy.

## File and directory pointers

- `docs/mcp-audit-design.md` — full design (read first)
- `docs/assets/` — logos and brand assets
- `cmd/hatchling/` — CLI entry point (Cobra commands)
- `internal/discover/` — find MCP configs across editors
- `internal/inspect/` — speak MCP protocol to a server
- `internal/enrich/` — fetch metadata from npm/GitHub
- `internal/risk/` — scoring rules
- `internal/report/` — text/JSON output
- `internal/model/` — shared types
- `testdata/servers/` — fixture MCP servers (TypeScript) for integration tests
- `testdata/protocol/` — captured MCP JSON-RPC fixtures for unit tests

## Cache, config, and runtime locations (XDG-compliant)

- Cache: `~/.cache/hatchling/` (24h TTL on metadata fetches)
- Config (v0.2+): `~/.config/hatchling/config.toml`
- Logs: stderr only; no log files written by default

## Things that should never appear in this codebase

- `localStorage`, `sessionStorage`, browser APIs (this is a CLI)
- `panic()` outside `main`
- Hard-coded API keys, secrets, tokens of any kind
- TODO comments without a corresponding GitHub issue link
- `time.Sleep()` outside test code
- Goroutines without context cancellation
- HTTP requests without explicit timeouts

## When in doubt

1. Read `docs/mcp-audit-design.md`
2. Prefer smaller PRs over bigger ones
3. Don't add a dependency without strong justification
4. Ask before exceeding v0 scope
5. If a starter prompt produces too much code, stop and split it

## Working with Claude Code on this repo

- Run starter prompts from `docs/mcp-audit-design.md` section 13 one at a time, in fresh sessions, reviewing each diff carefully before merging.
- Use `/clear` between unrelated tasks to keep context fresh.
- Use plan mode (Tab to toggle) for any prompt that touches more than ~3 files.
- Use the verification checklist at the end of each session: `go build ./...`, `go test ./...`, `golangci-lint run` should all pass before opening the PR.
