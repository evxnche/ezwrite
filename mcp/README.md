# ezwrite MCP Server

Connect your AI assistants (Claude, Cursor, Codex, ChatGPT) to your ezwrite notebooks.

## How it works

Your ezwrite app exports notebooks to a folder on your computer. This MCP server reads from that same folder. Your LLM gets a URL — paste it into your LLM's settings, and it can read and write your notebooks.

No cloud. No hosting costs. Your data stays on your laptop.

## Quick start

```bash
cd mcp && bun install && bun run start
```

You'll see:

```
  ✦ ezwrite MCP server running

  Reading from: /Users/you/ezwrite-data

  Paste this URL into your LLM's MCP settings:

  http://localhost:3157/mcp?token=abc123...
```

Copy that URL. Paste it into your LLM. Done.

## Connect your LLM

### Claude Desktop

**Settings → Developer → Edit Config**:

```json
{
  "mcpServers": {
    "ezwrite": {
      "url": "http://localhost:3157/mcp?token=YOUR_TOKEN_HERE"
    }
  }
}
```

### Cursor

**Settings → MCP → Add**:

```json
{
  "mcpServers": {
    "ezwrite": {
      "url": "http://localhost:3157/mcp?token=YOUR_TOKEN_HERE"
    }
  }
}
```

### Codex (OpenAI)

**~/.codex/mcp.json**:

```json
{
  "mcpServers": {
    "ezwrite": {
      "url": "http://localhost:3157/mcp?token=YOUR_TOKEN_HERE"
    }
  }
}
```

### Any MCP client

Just paste the full URL from the terminal. One link.

## ezwrite setup

1. Open ezwrite → **Settings → Storage**
2. Pick a save folder (or use the default)
3. Toggle **AI Sync → Enable MCP Sync**
4. ezwrite generates a token and shows your URL — copy it
5. Paste into your LLM's MCP settings

Your LLM now reads and writes the same markdown files ezwrite uses.

## What your AI can do

| Tool | Description |
|------|-------------|
| `list_projects` | List all notebooks |
| `get_project` | Get full notebook (all pages + scratchpad) |
| `get_page` | Get a specific page |
| `get_scratchpad` | Get a notebook's scratchpad |
| `create_project` | Create a new notebook |
| `update_page` | Replace a page's content |
| `add_page` | Add a page |
| `append_to_page` | Append text to a page |
| `update_scratchpad` | Replace scratchpad |
| `append_to_scratchpad` | Append to scratchpad |
| `rename_project` | Rename a notebook |
| `delete_project` | Delete a notebook |
| `search_notes` | Search across all notebooks |

## Config

| Variable | Default | Description |
|----------|---------|-------------|
| `EZWRITE_MCP_PORT` | `3157` | Port for the MCP server |
| `EZWRITE_EXPORT_DIR` | auto-detected | Directory to read/write notebooks |

The server auto-discovers your ezwrite folder by looking for `.ezwrite/mcp.json` in common locations (`~/Documents`, `~/Desktop`, `~/ezwrite-data`).

## Data format

Notebooks are stored as plain markdown files:

```
~/ezwrite-data/
  .ezwrite/
    mcp.json          ← your token
  project-abc/
    project.json      ← metadata
    page-001.md       ← page content (markdown)
    page-002.md
    scratchpad.md     ← scratchpad (markdown)
```

Your LLM reads and writes markdown. ezwrite reads and writes markdown. No lock-in.
