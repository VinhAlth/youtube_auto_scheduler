#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_NAME="youtube-auto-scheduler"
PUBLIC_URL="${PUBLIC_URL:-http://127.0.0.1:3001/}"

run_systemctl() {
  if [ "$(id -u)" -eq 0 ]; then
    systemctl "$@"
  else
    sudo systemctl "$@"
  fi
}

wait_for_health() {
  local url="$1"
  for attempt in $(seq 1 30); do
    if curl -fsS "${url}" 2>/dev/null; then
      return 0
    fi
    if [ "${attempt}" -eq 30 ]; then
      echo
      echo "Health check failed after ${attempt} attempts: ${url}"
      return 1
    fi
    sleep 1
  done
}

echo "Building frontend for /youtube_auto_schedule/..."
cd "${PROJECT_DIR}/frontend"
VITE_BASE_PATH=/youtube_auto_schedule/ VITE_APP_BASE_PATH=/youtube_auto_schedule npm run build

echo
echo "Starting/restarting ${SERVICE_NAME}..."
run_systemctl restart "${SERVICE_NAME}"
run_systemctl enable "${SERVICE_NAME}" >/dev/null

echo
echo "Service status:"
run_systemctl status "${SERVICE_NAME}" --no-pager

echo
echo "Server URL: ${PUBLIC_URL}"
wait_for_health "${PUBLIC_URL}api/health"
echo
