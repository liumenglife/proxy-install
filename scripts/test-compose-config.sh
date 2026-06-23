#!/bin/bash
set -euo pipefail

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_FILE="$(mktemp)"
SERVICE_FILE="$(mktemp)"
trap 'rm -f "$CONFIG_FILE" "$SERVICE_FILE"; rm -rf "${DOCKER_STUB_DIR:-}"' EXIT

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

assert_not_contains() {
    local file="$1"
    local unexpected="$2"

    if grep -F -- "$unexpected" "$file" >/dev/null; then
        echo "失败: 不应包含配置项: $unexpected" >&2
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

assert_contains "$BASE_DIR/.env" "SUB_STORE_IMAGE=proxy-install/sub-store:2.31.0-http-meta"
assert_contains "$BASE_DIR/.env" "SUB_STORE_BASE_IMAGE=xream/sub-store:2.31.0-http-meta"
assert_contains "$BASE_DIR/.env" "PROXY_UI_IMAGE=proxy-install/proxy-ui:latest"

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
assert_contains "$SERVICE_FILE" "    dockerfile: Dockerfile.sub-store"
assert_contains "$SERVICE_FILE" "        BASE_IMAGE: xream/sub-store:2.31.0-http-meta"
assert_contains "$SERVICE_FILE" "        SUB_STORE_PUBLIC_API: http://192.168.100.135:9002"
assert_contains "$SERVICE_FILE" "    image: proxy-install/sub-store:2.31.0-http-meta"
assert_port_pair "sub-store" "9001" "3001"
assert_port_pair "sub-store" "9002" "3000"
assert_contains "$SERVICE_FILE" "      SUB_STORE_DATA_BASE_PATH: /opt/app/data"
assert_contains "$SERVICE_FILE" "      SUB_STORE_FRONTEND_BACKEND_PATH: /"
assert_contains "$SERVICE_FILE" "        target: /opt/app/data"

extract_service "proxy-ui" > "$SERVICE_FILE"
assert_contains "$SERVICE_FILE" "    dockerfile: Dockerfile.proxy-ui"
assert_contains "$SERVICE_FILE" "    image: proxy-install/proxy-ui:latest"
assert_contains "$SERVICE_FILE" "      - host.docker.internal=host-gateway"
assert_port_pair "proxy-ui" "9091" "80"

extract_service "control-agent" > "$SERVICE_FILE"
assert_contains "$SERVICE_FILE" "    dockerfile: Dockerfile.control-agent"
assert_contains "$SERVICE_FILE" "    image: proxy-install/control-agent:latest"
assert_contains "$SERVICE_FILE" "    expose:"
assert_contains "$SERVICE_FILE" "      - \"3000\""

DOCKER_STUB_DIR="$(mktemp -d)"
DOCKER_STUB_LOG="$DOCKER_STUB_DIR/docker.log"
cat > "$DOCKER_STUB_DIR/docker" <<'STUB'
#!/bin/bash
printf '%s\n' "$*" >> "$DOCKER_STUB_LOG"
if [ "$1 $2" = "ps -a" ]; then
    printf 'abc123\tmetacubexd\tghcr.io/metacubex/metacubexd:latest\t0.0.0.0:9091->80/tcp\n'
    printf 'def456\tproxy-ui\tghcr.io/metacubex/metacubexd:latest\t0.0.0.0:9091->80/tcp\n'
    printf 'ghi789\tproxy-ui\tghcr.io/metacubex/metacubexd:latest\t0.0.0.0:9091->80/tcp\n'
    printf 'jkl012\tmetacubexd\tghcr.io/metacubex/metacubexd:latest\t0.0.0.0:8080->80/tcp\n'
elif [ "$1" = "inspect" ] && [ "$2" = "--format" ]; then
    case "$4" in
        abc123) printf '\n' ;;
        def456) printf 'proxy-ui\n' ;;
        ghi789) printf '\n' ;;
        jkl012) printf '\n' ;;
    esac
fi
STUB
chmod +x "$DOCKER_STUB_DIR/docker"
(
    export DEPLOY_LIB_ONLY=1
    export DOCKER_STUB_LOG
    source "$BASE_DIR/scripts/deploy.sh"
    export PATH="$DOCKER_STUB_DIR:$PATH"
    hash -r
    cleanup_legacy_metacubexd_for_proxy_ui
)
assert_contains "$DOCKER_STUB_LOG" "stop abc123"
assert_contains "$DOCKER_STUB_LOG" "rm abc123"
assert_contains "$DOCKER_STUB_LOG" "stop ghi789"
assert_contains "$DOCKER_STUB_LOG" "rm ghi789"
assert_not_contains "$DOCKER_STUB_LOG" "stop def456"
assert_not_contains "$DOCKER_STUB_LOG" "rm def456"
assert_not_contains "$DOCKER_STUB_LOG" "stop jkl012"
assert_not_contains "$DOCKER_STUB_LOG" "rm jkl012"

assert_contains "$BASE_DIR/recovery.sh" "proxy-ui 可通过 http://192.168.100.135:9091 访问"
assert_not_contains "$BASE_DIR/recovery.sh" "MetaCubeXD 可通过"
assert_not_contains "$BASE_DIR/recovery.sh" "9090/ui 访问"

echo "通过: docker compose 渲染后的关键字段正确"
