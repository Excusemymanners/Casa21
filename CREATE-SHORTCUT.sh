#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESKTOP_DIR="${XDG_DESKTOP_DIR:-$HOME/Desktop}"
SHORTCUT_PATH="$DESKTOP_DIR/Overview.desktop"

mkdir -p "$DESKTOP_DIR"

cat > "$SHORTCUT_PATH" <<EOF
[Desktop Entry]
Type=Application
Name=Overview
Comment=Pornește aplicația Overview
Exec=$APP_DIR/launch-overview.sh
Path=$APP_DIR
Terminal=false
StartupNotify=true
Categories=Office;Utility;
EOF

chmod +x "$SHORTCUT_PATH" "$APP_DIR/launch-overview.sh"

echo "Shortcut creat: $SHORTCUT_PATH"
echo "Dublu-click pe Overview de pe Desktop pentru a porni aplicația."
