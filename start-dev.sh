#!/bin/bash

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Starting Overview App (Dev Mode)${NC}"
echo ""

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo -e "${RED}❌ ERROR: DATABASE_URL is not set!${NC}"
  echo "Please set DATABASE_URL in .env or .env.local"
  exit 1
fi

# Check if JWT_SECRET is set
if [ -z "$JWT_SECRET" ]; then
  echo -e "${RED}❌ ERROR: JWT_SECRET is not set!${NC}"
  echo "Please set JWT_SECRET in .env or .env.local"
  exit 1
fi

echo -e "${GREEN}✓ Environment variables OK${NC}"
echo ""

# Function to handle cleanup
cleanup() {
  echo -e "${YELLOW}Stopping servers...${NC}"
  kill $API_PID $WEB_PID 2>/dev/null
  exit 0
}

trap cleanup SIGINT SIGTERM

echo -e "${BLUE}📱 Starting API Server (port 3001)...${NC}"
node server/server.js &
API_PID=$!
sleep 2

echo -e "${BLUE}💻 Starting React Dev Server (port 3000)...${NC}"
HOST=0.0.0.0 PORT=3000 DANGEROUSLY_DISABLE_HOST_CHECK=true BROWSER=none npm start &
WEB_PID=$!

echo ""
echo -e "${GREEN}✅ Servers started!${NC}"
echo ""
echo -e "${YELLOW}📍 Access points:${NC}"
echo -e "  Browser:  ${BLUE}http://192.168.1.216:3000${NC}"
echo -e "  API:      ${BLUE}http://192.168.1.216:3001/api/health${NC}"
echo ""
echo -e "${YELLOW}📱 QR Code will show:${NC}"
echo -e "  ${BLUE}http://192.168.1.216:3000/#/${NC}"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop${NC}"

wait
