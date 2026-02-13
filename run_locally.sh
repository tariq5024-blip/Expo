#!/bin/bash

# Expo Stores - Local Single-Tier Run Script

echo "🚀 Setting up Expo Stores for local single-tier execution..."

# 1. Install Dependencies
echo "📦 Installing dependencies..."
npm run install:all

# 2. Check for .env in server
if [ ! -f "server/.env" ]; then
    echo "⚙️ Creating server/.env..."
    echo "MONGO_URI=mongodb://127.0.0.1:27017/expo-stores" > server/.env
    echo "JWT_SECRET=local_dev_secret" >> server/.env
    echo "PORT=5000" >> server/.env
    echo "NODE_ENV=development" >> server/.env
    echo "CORS_ORIGIN=http://localhost:5173" >> server/.env
fi

# 3. Build Client (Optional if running dev, but good for testing prod mode)
# echo "🏗️ Building client..."
# npm run build

# 4. Start Development Mode (Client + Server)
echo "▶️ Starting in Development Mode..."
npm run dev
