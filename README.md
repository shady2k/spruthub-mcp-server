# Spruthub MCP Server

A Model Context Protocol (MCP) server for controlling [Sprut.hub](https://spruthub.ru/) smart home devices. This server provides Claude and other MCP-compatible clients with dynamic access to the complete Sprut.hub JSON-RPC API through schema autodiscovery.

## Features

- **Dynamic API Discovery** - Automatically discovers and exposes all available Spruthub JSON-RPC methods
- **Schema Validation** - Built-in parameter validation and documentation for all API methods
- **Full API Coverage** - Access to all Spruthub functionality including devices, rooms, scenarios, and system administration
- **WebSocket Connection** - Secure connection to Spruthub server with authentication
- **Method Categories** - Organized API methods by category (hub, accessory, scenario, room, system)
- **Real-time Schema Updates** - Schema information updated with spruthub-client library versions
- **Structured Responses** - JSON-formatted responses optimized for AI integration

## Installation

```bash
npm install
```

## Usage

### As an MCP Server

Add this server to your MCP client configuration. For Claude Desktop, add to your `claude_desktop_config.json`:

#### Using npm package (recommended):
```json
{
  "mcpServers": {
    "spruthub-mcp-server": {
      "command": "npx",
      "args": [
        "spruthub-mcp-server@1.3.8"
      ],
      "env": {
        "SPRUTHUB_WS_URL": "ws://192.168.0.100/spruthub",
        "SPRUTHUB_EMAIL": "your_email@example.com",
        "SPRUTHUB_PASSWORD": "your_password",
        "SPRUTHUB_SERIAL": "AAABBBCCCDDDEEEF"
      }
    }
  }
}
```

#### For local development:
```json
{
  "mcpServers": {
    "spruthub-mcp-server": {
      "command": "node",
      "args": ["/path/to/spruthub-mcp-server/src/index.js"],
      "env": {
        "SPRUTHUB_WS_URL": "ws://192.168.0.100/spruthub",
        "SPRUTHUB_EMAIL": "your_email@example.com", 
        "SPRUTHUB_PASSWORD": "your_password",
        "SPRUTHUB_SERIAL": "AAABBBCCCDDDEEEF"
      }
    }
  }
}
```

**Note:** Replace the environment variables with your actual Spruthub server details:
- `SPRUTHUB_WS_URL`: WebSocket URL of your Spruthub server
- `SPRUTHUB_EMAIL`: Your Spruthub account email  
- `SPRUTHUB_PASSWORD`: Your Spruthub account password
- `SPRUTHUB_SERIAL`: Your Spruthub hub serial number

**Security Best Practice:** For sensitive values like `SPRUTHUB_PASSWORD`, consider using your system's environment variables instead of hardcoding them in the config file:

```json
{
  "mcpServers": {
    "spruthub-mcp-server": {
      "command": "npx",
      "args": ["spruthub-mcp-server@1.3.8"],
      "env": {
        "SPRUTHUB_WS_URL": "ws://192.168.0.100/spruthub",
        "SPRUTHUB_EMAIL": "your_email@example.com",
        "SPRUTHUB_PASSWORD": "$SPRUTHUB_PASSWORD",
        "SPRUTHUB_SERIAL": "AAABBBCCCDDDEEEF"
      }
    }
  }
}
```

Then set the password in your system environment:
```bash
export SPRUTHUB_PASSWORD="your_actual_password"
```

### Available Tools

This server provides three core tools that give you access to the complete Spruthub JSON-RPC API:

#### `spruthub_list_methods`
Discover all available Spruthub API methods with their descriptions and categories.

Parameters:
- `category` (optional): Filter methods by category (`hub`, `accessory`, `scenario`, `room`, `system`)

**Example usage:** Start here to explore what's available in your Spruthub system.

#### `spruthub_get_method_schema`
Get detailed schema information for any API method, including parameters, return types, and examples.

Parameters:
- `methodName` (required): The method name to get schema for (e.g., `accessory.search`, `characteristic.update`)

**Important:** Always call this tool before using `spruthub_call_method` to understand the exact parameter structure required.

#### `spruthub_call_method`
Execute any Spruthub JSON-RPC API method with the provided parameters.

Parameters:
- `methodName` (required): The API method to call
- `parameters` (optional): Method parameters as defined in the method's schema

**Critical:** You MUST call `spruthub_get_method_schema` first to understand the parameter structure. Never guess parameters.

### Common Workflows

1. **Explore your system:**
   ```
   spruthub_list_methods → spruthub_get_method_schema → spruthub_call_method
   ```

2. **Control devices:**
   ```
   spruthub_get_method_schema(methodName: "characteristic.update")
   → spruthub_call_method(methodName: "characteristic.update", parameters: {...})
   ```

3. **Browse by category:**
   ```
   spruthub_list_methods(category: "accessory") → Get device-related methods
   spruthub_list_methods(category: "scenario") → Get automation methods
   ```

## Efficient API Usage

The schema-based approach provides efficient access to Spruthub functionality:

### Recommended Workflow
1. **Discovery Phase**: Use `spruthub_list_methods` to explore available functionality
2. **Schema Phase**: Use `spruthub_get_method_schema` to understand method requirements  
3. **Execution Phase**: Use `spruthub_call_method` with proper parameters

### Best Practices
- **Filter by category** when exploring: Use `category` parameter in `spruthub_list_methods`
- **Always get schema first**: Never guess API parameters - use `spruthub_get_method_schema`
- **Use specific methods**: The API provides targeted methods for efficient operations
- **Check method categories**: 
  - `hub` - Hub management and status
  - `accessory` - Device discovery and control  
  - `scenario` - Automation and scenes
  - `room` - Room management
  - `system` - System administration

### Schema-Driven Development
Each API method includes:
- Complete parameter specifications
- Return type definitions  
- Usage examples
- REST API mapping (where available)
- Category classification

## Development

```bash
# Install dependencies
npm install

# Run in development mode with auto-reload
npm run dev

# Run linting
npm run lint

# Fix linting issues
npm run lint:fix
```

## Environment Variables

### Connection Settings
- `LOG_LEVEL`: Set logging level (default: 'info')
- `SPRUTHUB_WS_URL`: WebSocket URL for Spruthub server (required if auto-connecting)
- `SPRUTHUB_EMAIL`: Email for authentication (required if auto-connecting)
- `SPRUTHUB_PASSWORD`: Password for authentication (required if auto-connecting)
- `SPRUTHUB_SERIAL`: Device serial number (required if auto-connecting)

### Logging Settings  
- `LOG_LEVEL`: Set logging level (`info`, `debug`, `warn`, `error`) (default: 'info')

## License

MIT