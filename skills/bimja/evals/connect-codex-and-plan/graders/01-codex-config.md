---
type: llm
focus: trace
weight: 1
---

config.toml contains an [mcp_servers.bimja] table whose command is node and whose args run mcp/bimja-mcp.mjs with --headless and --apply (so writes take effect without a browser), using an absolute path.
