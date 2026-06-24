#!/bin/bash
set -euo pipefail

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

NET_DIR="$TMP_DIR/sys/class/net"
BIN_DIR="$TMP_DIR/bin"
LIB_FILE="$TMP_DIR/recovery-functions.sh"
BACKUP_FILE_TEST="$TMP_DIR/network-state-backup.txt"
BACKUP_FILE_LOCAL_TEST="$TMP_DIR/local-network-state-backup.txt"

mkdir -p "$NET_DIR" "$BIN_DIR"
touch "$NET_DIR/br-240ae4de6f92" "$NET_DIR/docker0" "$NET_DIR/ens33" "$NET_DIR/lo" "$NET_DIR/tun0" "$NET_DIR/vethabc" "$NET_DIR/virbr0"

cat > "$BIN_DIR/id" <<'STUB'
#!/bin/bash
if [ "${1:-}" = "-u" ]; then
    printf '0\n'
else
    /usr/bin/id "$@"
fi
STUB
chmod +x "$BIN_DIR/id"

cat > "$BIN_DIR/ip" <<'STUB'
#!/bin/bash
if [ "${1:-}" = "-4" ] && [ "${2:-}" = "addr" ] && [ "${3:-}" = "show" ]; then
    case "${4:-}" in
        br-240ae4de6f92|docker0|ens33|vethabc|virbr0)
            printf '2: %s: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500\n' "$4"
            printf '    inet 192.168.100.135/24 brd 192.168.100.255 scope global %s\n' "$4"
            exit 0
            ;;
        *) exit 1 ;;
    esac
fi

if [ "${1:-}" = "route" ] && [ "${2:-}" = "show" ] && [ "${3:-}" = "default" ]; then
    printf 'default via 192.168.100.1 dev ens33 proto dhcp\n'
    exit 0
fi

exit 1
STUB
chmod +x "$BIN_DIR/ip"

cat > "$BIN_DIR/ping" <<'STUB'
#!/bin/bash
target="${@: -1}"
if [ "$target" = "${PING_SUCCESS_TARGET:-}" ]; then
    exit 0
fi
exit 1
STUB
chmod +x "$BIN_DIR/ping"

cat > "$BIN_DIR/curl" <<'STUB'
#!/bin/bash
printf '200'
STUB
chmod +x "$BIN_DIR/curl"

awk -v net_dir="$NET_DIR/" '
    /^find_interface\(\)/ { in_functions = 1 }
    /^case "\$\{1:-\}" in/ { exit }
    in_functions { gsub("/sys/class/net/", net_dir); print }
' "$BASE_DIR/recovery.sh" > "$LIB_FILE"

export PATH="$BIN_DIR:$PATH"
source "$LIB_FILE"
BACKUP_FILE="$BACKUP_FILE_TEST"
BACKUP_FILE_LOCAL="$BACKUP_FILE_LOCAL_TEST"

assert_equals() {
    local expected="$1"
    local actual="$2"
    local message="$3"

    if [ "$actual" != "$expected" ]; then
        printf '失败: %s\n期望: %s\n实际: %s\n' "$message" "$expected" "$actual" >&2
        exit 1
    fi
}

cat > "$BACKUP_FILE_TEST" <<'EOF_BACKUP'
DEFAULT_IFACE=ens33
DEFAULT_GW=192.168.100.1
EOF_BACKUP

assert_equals "ens33" "$(find_interface)" "find_interface 应优先使用备份中的物理网卡，不应选择 br-/docker/veth/tun/virbr"

cat > "$BACKUP_FILE_TEST" <<'EOF_BACKUP'
DEFAULT_IFACE=br-240ae4de6f92
DEFAULT_GW=192.168.100.1
EOF_BACKUP

assert_equals "ens33" "$(find_interface)" "备份网卡不可用或为虚拟网卡时，应回退枚举并排除虚拟网卡"

set +e
PING_SUCCESS_TARGET="223.5.5.5" verify_connectivity >/dev/null
verify_status=$?
set -e
assert_equals "0" "$verify_status" "verify_connectivity 在任一目标 ping 成功时应返回 0"

set +e
PING_SUCCESS_TARGET="" verify_connectivity >/dev/null
verify_status=$?
set -e
if [ "$verify_status" -eq 0 ]; then
    printf '失败: verify_connectivity 在所有目标 ping 失败时应返回非 0\n' >&2
    exit 1
fi

echo "通过: recovery.sh 物理网卡识别逻辑正确"
