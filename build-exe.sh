#!/bin/bash

# Color output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}🚀 Overview App - Executable Builder${NC}"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed!${NC}"
    echo "Please install Node.js 22.x from https://nodejs.org"
    exit 1
fi

echo -e "${GREEN}✓ Node.js found: $(node --version)${NC}"
echo ""

# Check if Docker is installed (for database)
if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}⚠️  Docker is not installed${NC}"
    echo "Docker is required to run the database."
    echo "Please install Docker from https://www.docker.com"
    echo ""
fi

# Check if .env.local exists
if [ ! -f .env.local ]; then
    echo -e "${YELLOW}📝 Creating .env.local from .env.example${NC}"
    cp .env.example .env.local
    echo -e "${YELLOW}⚠️  Please edit .env.local with your database credentials!${NC}"
    echo ""
fi

# Install dependencies
echo -e "${BLUE}📦 Installing dependencies...${NC}"
npm install
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Failed to install dependencies${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}🔨 Building executable...${NC}"
npm run electron-pack

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✅ Build complete!${NC}"
    echo ""
    echo -e "${BLUE}📍 Installer location:${NC}"
    echo "   dist/Overview Setup *.exe"
    echo ""
    echo -e "${BLUE}📍 Portable executable:${NC}"
    echo "   dist/Overview *.exe"
    echo ""
    echo -e "${YELLOW}ℹ️  Next steps:${NC}"
    echo "   1. Run the installer or portable executable"
    echo "   2. The app will auto-start with Docker + database"
    echo "   3. Create a shortcut on Desktop for easy access"
else
    echo -e "${RED}❌ Build failed${NC}"
    exit 1
fi
