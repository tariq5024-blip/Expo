# Local Single-Tier Setup

This setup allows you to run the Frontend, Backend, and MongoDB on a single Linux machine without VMs.

## Prerequisites
- Node.js (v18+)
- MongoDB (running locally on port 27017)

## Quick Start

1. **Install & Run (Development Mode)**
   This runs React (Vite) on port 5173 and Node API on port 5000.
   ```bash
   chmod +x run_locally.sh
   ./run_locally.sh
   ```
   Or manually:
   ```bash
   npm run install:all
   npm run dev
   ```

2. **Run in Production Mode (Monolithic)**
   This builds the React app and serves it from the Node server on port 5000.
   ```bash
   npm run build
   npm start
   ```
   Access the app at: http://localhost:5000

## Configuration
- The backend connects to `mongodb://127.0.0.1:27017/expo-stores` by default.
- Configuration is in `server/.env`.

## Notes
- The `deploy/` folder contains legacy VM deployment scripts and can be ignored.
