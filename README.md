# Spruthub MCP Server

A Model Context Protocol (MCP) server for controlling Spruthub smart home devices. This server provides Claude and other MCP-compatible clients with the ability to interact with Spruthub devices through a WebSocket connection.

## Features

- Connect to Spruthub server via WebSocket
- Execute device commands (update characteristics)
- Get server version information
- Proper connection management with authentication

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

#### `spruthub_connect`
Connect to a Spruthub server.

Parameters:
- `wsUrl`: WebSocket URL of the Spruthub server
- `sprutEmail`: Authentication email
- `sprutPassword`: Authentication password
- `serial`: Device serial number

#### `spruthub_execute`
Execute a command on a Spruthub device.

Parameters:
- `command`: Command to execute (currently only "update" is supported)
- `accessoryId`: ID of the accessory to control
- `serviceId`: ID of the service within the accessory
- `characteristicId`: ID of the characteristic to update
- `value`: Boolean value to set for the characteristic

#### `spruthub_version`
Get Spruthub server version information.

#### `spruthub_disconnect`
Disconnect from the Spruthub server.

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