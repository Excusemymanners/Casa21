# ⚡ Quick Start - Overview App

## 💻 System Requirements

- **Windows 7+** or Mac/Linux
- **Docker Desktop** installed and running
- **At least 2GB RAM**
- **300MB free disk space**

## 🚀 Start Using the App

### 1️⃣ Install Docker
If you don't have Docker, download and install:
👉 https://www.docker.com/products/docker-desktop

### 2️⃣ Run the App
- **Option A (Recommended):** Run installer
  - Download: `Overview Setup 0.1.0.exe`
  - Double-click to install
  - App creates Desktop shortcut automatically
  
- **Option B (Portable):** No installation needed
  - Download: `Overview 0.1.0.exe`
  - Run directly or create shortcut

### 3️⃣ First Launch
When you run the app for the first time:
- Docker starts PostgreSQL database
- Database gets set up automatically
- App opens in a window

### 4️⃣ Login
Default credentials:
- **Email:** admin@overview.local
- **Password:** password123

⚠️ **Important:** Change these immediately in production!

## 📱 Access on Phone/Other Device

1. Find your computer's IP address:
   - Open Command Prompt
   - Type: `ipconfig`
   - Look for "IPv4 Address" (e.g., 192.168.1.216)

2. On phone/device, open browser:
   - http://YOUR_IP_ADDRESS:3000
   - Scan QR code from login screen

## 🐛 Troubleshooting

### "Docker not found"
→ Install Docker Desktop: https://www.docker.com

### "Port 3000 already in use"
→ Close other apps or restart computer

### "Can't connect to database"
→ Make sure Docker is running

### "Blank screen on startup"
→ Wait 30 seconds for database to start
→ Check that Docker container is running

## 📁 Where to Find Settings

Config file: (if needed)
```
.env.local
```

Database data: (persists between restarts)
```
Docker volume: overview-db-data
```

## ❌ Uninstall

**Via Installer:**
- Control Panel → Programs → Uninstall Program
- Select "Overview" → Uninstall

**Docker Cleanup:**
```bash
docker stop overview-db
docker rm overview-db
docker volume rm overview-db-data
```

## 🆘 Need Help?

Check the full guide:
→ BUILD-EXECUTABLE.md

---

**Questions?** Check the main README file.
