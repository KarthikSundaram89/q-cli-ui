# Q CLI Web UI

A web-based interface for Amazon Q CLI that provides an intuitive chat interface for interacting with Q CLI agents.

## Features

- 🌐 **Web Interface** - Access Q CLI through your browser
- 💬 **Persistent Conversations** - Maintains context across messages
- 👤 **User Icons** - Visual distinction between user and assistant messages
- 🕐 **Timestamps** - Date and time for each message
- 🔄 **Loading Indicators** - Visual feedback during processing
- 💾 **Auto-Save** - Conversations automatically saved to JSON files
- 🛠️ **Tool Support** - Handles Q CLI tool usage with proper timing

## Quick Start

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Start Server**
   ```bash
   npm start
   ```

3. **Access UI**
   - Local: http://localhost:8080
   - External: http://your-server-ip:8080

## Files

- `index.html` - Web interface
- `server.js` - Node.js backend server
- `package.json` - Dependencies
- `conversation-*.json` - Saved conversations

## Requirements

- Node.js 16+
- Amazon Q CLI installed and authenticated
- Port 8080 available

## Configuration

### Firewall (OCI)
```bash
# Add iptables rule
sudo iptables -I INPUT 6 -p tcp --dport 8080 -j ACCEPT

# Update OCI Security List to allow port 8080
```

### Q CLI Authentication
```bash
# Login to Q CLI (one-time setup)
q login

# Check status
q whoami
```

## Usage

1. **Send Messages** - Type in the input field and press Enter
2. **View History** - Scroll through previous messages
3. **Tool Usage** - Q CLI tools work automatically with proper timing
4. **Conversations** - Auto-saved every 5 messages and on server shutdown

## Conversation Logs

Conversations are automatically saved as JSON files:
```json
[
  {
    "timestamp": "2025-11-30T04:27:09.563Z",
    "user": "what can you do",
    "assistant": "I can help you with AWS resources, code, files..."
  }
]
```

## Troubleshooting

### Port Issues
```bash
# Check if port is in use
ss -tlnp | grep :8080

# Kill existing process
pkill -f "node server.js"
```

### Q CLI Issues
```bash
# Check Q CLI status
q whoami

# Re-login if needed
q login
```

### Server Logs
```bash
# Run server with logs
node server.js
```

## Architecture

```
Browser ←→ Express Server ←→ Q CLI Process
   ↓              ↓              ↓
Web UI      JSON API      Persistent Chat
```

## Security Notes

- Server runs on localhost by default
- Q CLI authentication required
- Conversations stored locally
- No external dependencies for core functionality

## Development

### Start Development Server
```bash
node server.js
```

### Modify UI
Edit `index.html` for frontend changes

### Modify Backend
Edit `server.js` for server logic changes

## License

This project follows the same licensing as Amazon Q CLI.
