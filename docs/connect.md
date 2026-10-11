---
title: Connect your AI
description: Copy-paste setup for Claude Code, Claude Desktop, claude.ai, the Claude API, Codex, ChatGPT, Gemini CLI, Cursor, VS Code, Windsurf, Zed, Cline, Goose and Continue.
order: 6
---

# Connect your AI

One URL, no key, no sign-in:

```
{{MCP_URL}}
```

It is a remote, read-only MCP server over Streamable HTTP. Every client below takes that URL. Names are examples: use any label you like. Syntax was checked against each vendor's current documentation.

## Claude Code

```bash
claude mcp add --transport http papertrade-analytics {{MCP_URL}}
```

Add `--scope user` to make it available in every project, or `--scope project` to write it to a shared `.mcp.json`. Run `/mcp` inside Claude Code to confirm it is connected.

## Claude Desktop and claude.ai

Open **Settings, Connectors, Add custom connector**, name it `Papertrade Analytics`, paste the URL and save. Custom connectors sync across claude.ai, Claude Desktop and mobile. Leave any authentication fields empty.

For a Claude Desktop that predates remote connectors, bridge it over stdio with [`mcp-remote`](https://www.npmjs.com/package/mcp-remote) in `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "papertrade-analytics": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "{{MCP_URL}}"]
    }
  }
}
```

## Claude API (MCP connector)

The Messages API can call a remote MCP server directly. The connector is a beta: send the `anthropic-beta: mcp-client-2025-11-20` header, declare the server in `mcp_servers` and enable it with an `mcp_toolset` entry in `tools`.

```bash
curl https://api.anthropic.com/v1/messages \
  -H "content-type: application/json" \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "anthropic-beta: mcp-client-2025-11-20" \
  -d '{
    "model": "claude-sonnet-5-5",
    "max_tokens": 1000,
    "messages": [{"role": "user", "content": "What is the Papertrade TVL and open interest skew right now?"}],
    "mcp_servers": [
      {"type": "url", "url": "{{MCP_URL}}", "name": "papertrade-analytics"}
    ],
    "tools": [
      {"type": "mcp_toolset", "mcp_server_name": "papertrade-analytics"}
    ]
  }'
```

## OpenAI Codex CLI and IDE extension

Add the server from the command line:

```bash
codex mcp add papertrade-analytics --url {{MCP_URL}}
```

or edit `~/.codex/config.toml` (shared by the CLI and the IDE extension):

```toml
[mcp_servers.papertrade-analytics]
url = "{{MCP_URL}}"
```

Run `codex mcp list` to confirm it, or `/mcp` inside Codex.

## OpenAI Responses API

```json
{
  "model": "gpt-5",
  "tools": [
    {
      "type": "mcp",
      "server_label": "papertrade_analytics",
      "server_url": "{{MCP_URL}}",
      "require_approval": "never"
    }
  ],
  "input": "Summarize Papertrade's open interest skew and PAPER mint rate."
}
```

Every tool here is read-only, so `require_approval: "never"` is safe. Use `"allowed_tools"` to import a subset.

## ChatGPT

Available where ChatGPT supports custom apps over MCP (Plus, Pro, Business, Enterprise and Edu; an admin may need to allow them first).

1. **Settings, Apps, Advanced settings**: turn on **Developer mode**.
2. **Create app**. Name: `Papertrade Analytics`. MCP server URL: `{{MCP_URL}}`. Authentication: **No authentication**.
3. In a new chat choose **Developer mode** from the **+** menu and enable the app.

## Gemini CLI

```bash
gemini mcp add --transport http papertrade-analytics {{MCP_URL}}
```

or in `~/.gemini/settings.json` (note `httpUrl`, not `url`, for Streamable HTTP):

```json
{
  "mcpServers": {
    "papertrade-analytics": {
      "httpUrl": "{{MCP_URL}}"
    }
  }
}
```

## Cursor

`.cursor/mcp.json` in a project, or `~/.cursor/mcp.json` for all projects:

```json
{
  "mcpServers": {
    "papertrade-analytics": {
      "url": "{{MCP_URL}}"
    }
  }
}
```

## VS Code (GitHub Copilot agent mode)

`.vscode/mcp.json`:

```json
{
  "servers": {
    "papertrade-analytics": {
      "type": "http",
      "url": "{{MCP_URL}}"
    }
  }
}
```

or from a terminal:

```bash
code --add-mcp '{"name":"papertrade-analytics","type":"http","url":"{{MCP_URL}}"}'
```

## Windsurf

`~/.codeium/windsurf/mcp_config.json` (Windsurf uses `serverUrl`):

```json
{
  "mcpServers": {
    "papertrade-analytics": {
      "serverUrl": "{{MCP_URL}}"
    }
  }
}
```

## Zed

In `settings.json`:

```json
{
  "context_servers": {
    "papertrade-analytics": {
      "url": "{{MCP_URL}}"
    }
  }
}
```

## Cline

Edit `cline_mcp_settings.json` (MCP Servers panel, **Configure MCP Servers**). Set the transport explicitly: without `type`, Cline assumes the legacy SSE transport.

```json
{
  "mcpServers": {
    "papertrade-analytics": {
      "type": "streamableHttp",
      "url": "{{MCP_URL}}"
    }
  }
}
```

## Goose

Run `goose configure`, choose **Add Extension**, then **Remote Extension (Streamable HTTP)**, name it `papertrade-analytics` and paste the URL.

## Continue

`.continue/mcpServers/papertrade-analytics.yaml`:

```yaml
name: Papertrade Analytics
version: 0.0.1
schema: v1
mcpServers:
  - name: Papertrade Analytics
    type: streamable-http
    url: {{MCP_URL}}
```

## Any other agent framework

If a framework speaks MCP, give it the URL above. If it only does function calling or OpenAPI tools (LangChain, LlamaIndex, custom GPT Actions, n8n and similar), import [`{{SITE}}/openapi.json`]({{SITE}}/openapi.json): `GET /api/metrics` returns everything the MCP tools read. Agents that discover tools by URL can start from [`/.well-known/mcp/server-card.json`](/.well-known/mcp/server-card.json), [`/.well-known/agent-card.json`](/.well-known/agent-card.json) or [`/llms.txt`](/llms.txt).

## Verify a connection

```bash
npx @modelcontextprotocol/inspector --cli {{MCP_URL}} --transport http --method tools/list
```

If a client reports no tools, check that it is using the Streamable HTTP transport (not SSE) and that the URL ends in `/mcp`. See [Security and limits](security.md) for rate limits.
