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

- `LOG_LEVEL`: Set logging level (default: 'info')

## License

MIT