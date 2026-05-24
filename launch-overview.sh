#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"

if [[ -f .env.example && ! -f .env.local ]]; then
  cp .env.example .env.local
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js lipsește. Instalează Node.js 22.x și reîncearcă."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm lipsește. Instalează Node.js complet și reîncearcă."
  exit 1
fi

if [[ ! -d node_modules ]]; then
  echo "Instalez dependențele..."
  npm install
fi

if [[ ! -f build/index.html ]]; then
  echo "Construiesc interfața..."
  npm run build
fi

exec ./node_modules/.bin/electron .
