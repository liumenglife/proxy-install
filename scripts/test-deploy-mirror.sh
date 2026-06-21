#!/bin/bash
set -euo pipefail

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_LIB_ONLY=1 source "$BASE_DIR/scripts/deploy.sh"

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

daemon_json="$tmp_dir/daemon.json"

cat > "$daemon_json" <<'JSON'
{
  "registry-mirrors": [
    "https://docker.m.daocloud.io",
    "https://docker.m.daocloud.io/",
    "http://docker.m.daocloud.io",
    "https://docker.m.daocloud.io/v2",
    "https://mirror.example.com"
  ],
  "log-driver": "json-file"
}
JSON

if ! daemon_has_daocloud_mirror "$daemon_json"; then
    echo "失败: 未检测到包含 docker.m.daocloud.io 的 registry mirror" >&2
    exit 1
fi

remove_daocloud_mirror "$daemon_json"

jq empty "$daemon_json"

if jq -e '."registry-mirrors" | any(contains("docker.m.daocloud.io"))' "$daemon_json" >/dev/null; then
    echo "失败: 包含 docker.m.daocloud.io 的 mirror 未被移除" >&2
    exit 1
fi

if [ "$(jq -r '."registry-mirrors"[0]' "$daemon_json")" != "https://mirror.example.com" ]; then
    echo "失败: 其他 registry mirror 未保留" >&2
    exit 1
fi

if [ "$(jq -r '."log-driver"' "$daemon_json")" != "json-file" ]; then
    echo "失败: 其他 daemon 配置未保留" >&2
    exit 1
fi

single_mirror_json="$tmp_dir/single-daemon.json"
cat > "$single_mirror_json" <<'JSON'
{
  "registry-mirrors": ["https://docker.m.daocloud.io"]
}
JSON

remove_daocloud_mirror "$single_mirror_json"
jq empty "$single_mirror_json"

if [ "$(jq -r '."registry-mirrors" | length' "$single_mirror_json")" -ne 0 ]; then
    echo "失败: 单一 daocloud mirror 未被移除为空数组" >&2
    exit 1
fi

variant_only_json="$tmp_dir/variant-only-daemon.json"
cat > "$variant_only_json" <<'JSON'
{
  "registry-mirrors": ["https://docker.m.daocloud.io/"]
}
JSON

if ! daemon_has_daocloud_mirror "$variant_only_json"; then
    echo "失败: 未检测到尾斜杠 daocloud mirror" >&2
    exit 1
fi

no_daocloud_json="$tmp_dir/no-daocloud-daemon.json"
cat > "$no_daocloud_json" <<'JSON'
{
  "registry-mirrors": ["https://mirror.example.com"]
}
JSON

if daemon_has_daocloud_mirror "$no_daocloud_json"; then
    echo "失败: 错误检测到不存在的 daocloud mirror" >&2
    exit 1
fi

echo "通过: daemon.json 移除 daocloud mirror 后仍为合法 JSON"
