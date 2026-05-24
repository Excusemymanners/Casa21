# 🚀 Build Overview App as Windows Executable

## Prerequisites

1. **Node.js 22.x** - [Download](https://nodejs.org)
2. **Docker** - [Download](https://www.docker.com)
3. **Windows 7+** (for the executable)

## Quick Build (Windows Command Prompt)

```bash
# Clone or navigate to project
cd path\to\overview2

# Run builder script
npm install
npm run electron-pack
```

## Manual Build Steps

### Step 1: Setup Environment
```bash
cp .env.example .env.local
# Edit .env.local with your settings
```

### Step 2: Install Dependencies
```bash
npm install
```

### Step 3: Build React App
```bash
npm run build
```

### Step 4: Create Executable
```bash
npm run electron-pack
```

## Output Files

After build, you'll find in `dist/` folder:

- **Overview Setup 0.1.0.exe** - Installer (recommended)
  - Creates Start Menu shortcuts
  - Creates Desktop shortcut
  - Easy uninstall
  
- **Overview 0.1.0.exe** - Portable executable
  - No installation needed
  - Run directly from USB or folder

## Installation

### Option 1: Installer
1. Download `Overview Setup 0.1.0.exe`
2. Run it
3. Follow installer wizard
4. Creates Desktop shortcut automatically

### Option 2: Portable
1. Download `Overview 0.1.0.exe`
2. Run it directly
3. Or create shortcut manually

## First Run

When you run the executable:

1. ✅ Automatically starts Docker Postgres database
2. ✅ Runs database migrations
3. ✅ Seeds initial data
4. ✅ Starts API server (port 3001)
5. ✅ Opens app in window (port 3000)

## Troubleshooting

### Docker not found
- Install Docker Desktop for Windows
- Make sure Docker service is running

### Database connection error
- Check `.env.local` has correct DATABASE_URL
- Verify Docker is running
- Check firewall settings

### Port already in use
- Change PORT in `.env.local`
- Or close other applications using port 3000/3001

## Creating Desktop Shortcut Manually

If installer didn't create one:

1. Right-click on Desktop
2. Select "New" → "Shortcut"
3. Location: `C:\Program Files\Overview\Overview.exe`
4. Name: "Overview"
5. Click "Finish"
6. Right-click shortcut → Properties → "Pin to Taskbar"

## Distribution

You can distribute these files:

```
📦 Overview App
├── Overview Setup 0.1.0.exe     ← For users (recommended)
├── .env.example                  ← Show users what to configure
└── README.md                      ← Setup instructions
```

## Customization

Edit `package.json` build section to customize:
- App name
- Version
- Installer appearance
- File associations

## Advanced: Building on Mac/Linux

For Mac:
```bash
npm run electron-pack -- --mac
```

For Linux:
```bash
npm run electron-pack -- --linux
```

---

**Questions?** Check the main README or create an issue on GitHub.
