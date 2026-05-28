# ezwrite MCP Server

Connect your AI assistants (Claude, Codex, ChatGPT) to your ezwrite notebooks.

## Quick start

```bash
# 1. Install dependencies
cd mcp && bun install

# 2. Start the server
bun run start
```

You'll see:

```
  ✦ ezwrite MCP server running

  Paste this URL into your LLM's MCP settings:

  http://localhost:3157/mcp
```

## Connect your AI assistant

Just paste the URL `http://localhost:3157/mcp` into your LLM's MCP/server settings.

### Claude Desktop

**Settings → Developer → Edit Config**, then add:

```json
{
  "mcpServers": {
    "ezwrite": {
      "url": "http://localhost:3157/mcp"
    }
  }
}
```

### Cursor

**Settings → MCP**, add:

```json
{
  "mcpServers": {
    "ezwrite": {
      "url": "http://localhost:3157/mcp"
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
      "url": "http://localhost:3157/mcp"
    }
  }
}
```

### Any MCP client

URL: `http://localhost:3157/mcp`

That's it. One link.

## Sync with ezwrite

1. Open ezwrite in your browser
2. Go to **Settings → Storage → AI Sync**
3. Toggle **Enable MCP Sync**
4. Click **Push → Server** to send your current notebooks to the MCP server

When your AI assistant makes changes, click **← Pull from Server** to bring them into ezwrite.

## What your AI can do

| Tool | Description |
|------|-------------|
| `list_projects` | List all notebooks with titles and page counts |
| `get_project` | Get full notebook content (all pages + scratchpad) |
| `get_page` | Get a specific page's content |
| `get_scratchpad` | Get a notebook's scratchpad |
| `create_project` | Create a new notebook |
| `update_page` | Replace a page's content |
| `add_page` | Add a new page to a notebook |
| `append_to_page` | Append text to a page |
| `update_scratchpad` | Replace scratchpad content |
| `append_to_scratchpad` | Append text to the scratchpad |
| `rename_project` | Rename a notebook |
| `delete_project` | Delete a notebook |
| `search_notes` | Search across all notebooks |

## Config

| Variable | Default | Description |
|----------|---------|-------------|
| `EZWRITE_MCP_PORT` | `3157` | Port for the MCP server |

## Data

Notebook data is stored in `~/.ezwrite/store.json`.
