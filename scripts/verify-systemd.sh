#!/usr/bin/env bash
# Structural verification only. Never installs units or starts a service.
set -euo pipefail
root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
node_binary="${NODE_BINARY:-$(command -v node)}"
caddy_binary="${CADDY_BINARY:-$root/tmp/tools/caddy/2.11.9/linux/caddy}"
test -x "$node_binary"
test -x "$caddy_binary"
unit_dir="$(mktemp -d /tmp/doctor-tracker-unit-XXXXXXXX)"
cleanup() {
  case "$unit_dir" in /tmp/doctor-tracker-unit-*) rm -rf -- "$unit_dir" ;; *) exit 1 ;; esac
}
trap cleanup EXIT
for source_unit in "$root"/deploy/systemd/*.service; do
  target_unit="$unit_dir/$(basename -- "$source_unit")"
  sed -e "s|/usr/bin/node |$node_binary |" -e "s|/usr/local/bin/caddy |$caddy_binary |" "$source_unit" > "$target_unit"
  chmod 0644 "$target_unit"
done
systemd-analyze verify --man=no "$unit_dir"/*.service
printf '%s\n' 'systemd unit syntax verified; no services installed or started.'
