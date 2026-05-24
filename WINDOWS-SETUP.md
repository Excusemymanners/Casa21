# Overview App - Windows Setup Guide

## Quick Start

Your application is ready to run on Windows! Follow these steps:

### Prerequisites
- **Docker** - Download from https://www.docker.com/products/docker-desktop
- **Node.js 22.x** - Download from https://nodejs.org
- **Git** (optional) - Download from https://git-scm.com

### Option 1: Run with Batch Script (Recommended)

1. Copy the entire project folder to your Windows machine
2. Double-click **RUN-APP.bat**
3. The script will:
   - Check for Docker and Node.js
   - Start the PostgreSQL database in Docker
   - Start the application
   - Open http://localhost:3000 in your browser

### Option 2: Run Manually

1. Open Command Prompt or PowerShell in the project folder
2. Start the database:
   ```bash
   docker volume create overview-db-data
   docker run --name overview-db -e POSTGRES_PASSWORD=pass -e POSTGRES_DB=overview -p 5432:5432 -v overview-db-data:/var/lib/postgresql/data -d postgres:15
   ```
3. Install dependencies (first time only):
   ```bash
   npm install
   ```
4. Start the application:
   ```bash
   npm start
   ```
5. Open http://localhost:3000 in your browser

### Option 3: Run the Electron Executable (Desktop App)

The executable is located at: `dist\win-unpacked\Overview.exe`

This will launch the application as a desktop app that automatically:
- Starts Docker/database
- Starts the backend API
- Loads the frontend

### Accessing from Other Devices

To access the app from other devices on your network:
1. Find your computer's local IP address
2. Use `http://<YOUR_IP>:3000` on other devices (e.g., `http://192.168.1.100:3000`)

### Default Login

```
Username: admin
Password: admin
```

### Environment Configuration

Create a `.env.local` file in the project root to customize settings:

```env
DATABASE_URL=postgresql://postgres:pass@localhost:5432/overview
JWT_SECRET=your-super-secret-key
API_PORT=3001
```

### Troubleshooting

**Docker container won't start:**
- Make sure Docker Desktop is running
- Check that port 5432 is not in use: `netstat -ano | findstr :5432`

**App won't open on port 3000:**
- Kill the existing process: `npx kill-port 3000`
- Or change the port in `npm start`

**Database connection error:**
- Wait 5-10 seconds for the database to start
- Check database is running: `docker ps`

### Need Help?

Check the README.md file in the project root for more information.
