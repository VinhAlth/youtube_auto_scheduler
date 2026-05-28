#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="youtube-auto-scheduler"
PUBLIC_HEALTH_URL="${PUBLIC_HEALTH_URL:-http://127.0.0.1:3001/api/health}"
LOCAL_HEALTH_URL="http://127.0.0.1:3001/api/health"

run_systemctl() {
  if [ "$(id -u)" -eq 0 ]; then
    systemctl "$@"
  else
    sudo systemctl "$@"
  fi
}

wait_for_health() {
  local url="$1"
  local label="$2"

  for attempt in $(seq 1 30); do
    if curl -fsS "${url}" 2>/dev/null; then
      return 0
    fi
    if [ "${attempt}" -eq 30 ]; then
      echo
      echo "${label} health check failed after ${attempt} attempts."
      return 1
    fi
    sleep 1
  done
}

echo "Restarting ${SERVICE_NAME}..."
run_systemctl restart "${SERVICE_NAME}"

echo
echo "Service status:"
run_systemctl status "${SERVICE_NAME}" --no-pager

echo
echo "Local health:"
wait_for_health "${LOCAL_HEALTH_URL}" "Local"

echo
echo
echo "Public health:"
wait_for_health "${PUBLIC_HEALTH_URL}" "Public"
echo
