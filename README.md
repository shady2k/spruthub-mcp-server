# Spruthub MCP Server

A Model Context Protocol (MCP) server for controlling Spruthub smart home devices. This server provides Claude and other MCP-compatible clients with the ability to interact with Spruthub devices through a WebSocket connection.

## Features

- Connect to Spruthub server via WebSocket
- List and manage rooms in your smart home system
- List and monitor Spruthub hubs
- Browse smart home accessories/devices with filtering options
- Get detailed device information
- Execute device commands (update characteristics)
- Get server version information
- Proper connection management with authentication
- Structured data output for better AI integration
- **Token consumption protection** - Automatic response size limiting and truncation to prevent excessive token usage

## Installation

```bash
npm install
```

## Usage

### As an MCP Server

Add this server to your MCP client configuration. For Claude Desktop, add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "spruthub": {
      "command": "node",
      "args": ["/path/to/spruthub-mcp-server/src/index.js"]
    }
  }
}
```

### Available Tools

#### `spruthub_list_rooms`
List all rooms in the Spruthub system with their IDs and visibility status.

No parameters required.

#### `spruthub_list_hubs`
List all Spruthub hubs with their status and version information.

No parameters required.

#### `spruthub_list_accessories`
List smart home accessories/devices with optional filtering for better performance.

Parameters:
- `roomId` (optional): Filter devices by specific room ID
- `controllableOnly` (optional): Only return devices with controllable characteristics (default: false)
- `summary` (optional): Return summarized info instead of full details (default: true for performance)

#### `spruthub_get_device_info`
Get detailed information for a specific device, including all its controllable characteristics.

Parameters:
- `accessoryId`: ID of the accessory to get detailed info for

#### `spruthub_execute`
Execute a command on a Spruthub device (turn lights on/off, control switches, etc.).

Parameters:
- `command`: Command to execute (currently only "update" is supported)
- `accessoryId`: ID of the accessory to control
- `serviceId`: ID of the service within the accessory
- `characteristicId`: ID of the characteristic to update
- `value`: Boolean value to set for the characteristic (true = on/open, false = off/closed)

#### `spruthub_version`
Get Spruthub server version information.

No parameters required.

#### `spruthub_usage_guide`
Get token-efficient usage recommendations and current system statistics. **Use this tool first** to understand your system size and get specific recommendations for efficient usage.

No parameters required.

## Token Consumption Protection

This server includes built-in protection against excessive token usage:

### Automatic Response Limiting
- Responses are automatically monitored for size
- Large responses (>30k characters by default) trigger warnings
- Responses exceeding the limit (50k characters by default) are automatically truncated
- Truncated responses include clear warnings and suggestions

### Smart Defaults (Auto-enabled)
- **>10 devices**: Summary mode automatically enabled
- **>50 devices**: Page size reduced to 10 items automatically
- **>100 devices**: MetaOnly mode forced to prevent token overuse
- Device listings are limited to 20 items per page by default
- Use the `spruthub_count_accessories` tool for minimal token usage

### Intelligent Filtering
- Always prefer specific filters over full listings
- Use `roomId` to limit scope to specific rooms
- Use `controllableOnly=true` to focus on actionable devices
- Use `nameFilter`, `manufacturerFilter` for targeted searches

### Recommended Claude Desktop Workflow
1. **Start with**: `spruthub_usage_guide` - Get system overview and specific recommendations
2. **Count first**: `spruthub_count_accessories` with filters to understand scope
3. **Explore efficiently**: Use `spruthub_list_accessories` with `metaOnly=true` for large systems
4. **Filter aggressively**: Always use `roomId`, `nameFilter`, or `controllableOnly` when possible
5. **Get details last**: Use `spruthub_get_device_info` only for specific devices you need to control

### Configuration
Configure protection limits via environment variables:
```bash
# Override defaults for even more aggressive token savings
export SPRUTHUB_MAX_RESPONSE_SIZE=15000
export SPRUTHUB_MAX_DEVICES_PER_PAGE=10
export SPRUTHUB_WARN_THRESHOLD=10000
export SPRUTHUB_AUTO_SUMMARY_THRESHOLD=5
```

### Disabling Smart Defaults
If you prefer manual control over response formatting:
```bash
export SPRUTHUB_FORCE_SMART_DEFAULTS=false
```

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

### Token Protection Settings
- `SPRUTHUB_MAX_RESPONSE_SIZE`: Maximum response size in characters (default: 50000)
- `SPRUTHUB_MAX_DEVICES_PER_PAGE`: Maximum devices per page in listings (default: 20) 
- `SPRUTHUB_WARN_THRESHOLD`: Response size threshold for warnings (default: 30000)
- `SPRUTHUB_ENABLE_TRUNCATION`: Enable response truncation when over limit (default: true)
- `SPRUTHUB_FORCE_SMART_DEFAULTS`: Auto-enable efficiency features (default: true)
- `SPRUTHUB_AUTO_SUMMARY_THRESHOLD`: Device count to auto-enable summary mode (default: 10)

## License

MIT