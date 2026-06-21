#!/bin/bash
set -euo pipefail

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_FILE="$(mktemp)"
SERVICE_FILE="$(mktemp)"
trap 'rm -f "$CONFIG_FILE" "$SERVICE_FILE"' EXIT

cd "$BASE_DIR"
docker compose config > "$CONFIG_FILE"

extract_service() {
    local service="$1"
    awk -v service="$service" '
        $0 == "  " service ":" { in_service = 1; print; next }
        in_service && $0 ~ /^  [^ ].*:/ { exit }
        in_service { print }
    ' "$CONFIG_FILE"
}

assert_contains() {
    local file="$1"
    local expected="$2"

    if ! grep -F -- "$expected" "$file" >/dev/null; then
        echo "失败: 未找到配置项: $expected" >&2
        exit 1
    fi
}

assert_port_pair() {
    local service="$1"
    local published="$2"
    local target="$3"

    extract_service "$service" > "$SERVICE_FILE"
    if ! awk -v published="$published" -v target="$target" '
        $1 == "target:" && $2 == target { saw_target = 1; next }
        saw_target && $1 == "published:" && $2 == "\"" published "\"" { found = 1 }
        $1 == "-" && $2 == "mode:" { saw_target = 0 }
        END { exit found ? 0 : 1 }
    ' "$SERVICE_FILE"; then
        echo "失败: $service 缺少端口映射 ${published}:${target}" >&2
        exit 1
    fi
}

assert_contains "$BASE_DIR/.env" "SUB_STORE_IMAGE=xream/sub-store:2.31.0-http-meta"

extract_service "sing-box" > "$SERVICE_FILE"
assert_contains "$SERVICE_FILE" "    image: ghcr.io/sagernet/sing-box:v1.13.13"
assert_contains "$SERVICE_FILE" "      - run"
assert_contains "$SERVICE_FILE" "      - -c"
assert_contains "$SERVICE_FILE" "      - /etc/sing-box/config.json"
assert_contains "$SERVICE_FILE" "    network_mode: host"
assert_contains "$SERVICE_FILE" "      - NET_ADMIN"
assert_contains "$SERVICE_FILE" "      - source: /dev/net/tun"
assert_contains "$SERVICE_FILE" "        target: /dev/net/tun"
assert_contains "$SERVICE_FILE" "        target: /etc/sing-box"
assert_contains "$SERVICE_FILE" "        target: /etc/sub-store"

extract_service "sub-store" > "$SERVICE_FILE"
assert_contains "$SERVICE_FILE" "    image: xream/sub-store:2.31.0-http-meta"
assert_port_pair "sub-store" "9001" "3001"
assert_port_pair "sub-store" "9002" "3000"

extract_service "metacubexd" > "$SERVICE_FILE"
assert_port_pair "metacubexd" "9091" "80"

echo "通过: docker compose 渲染后的关键字段正确"
