#!/bin/bash
set -euo pipefail

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$(mktemp -d)"
trap 'rm -rf "$OUT_DIR"' EXIT

bash "$BASE_DIR/scripts/export-substore-singbox.sh" --output-dir "$OUT_DIR"

COMBINED_NODES="$OUT_DIR/substore-singbox-nodes.json"
OUTBOUNDS="$OUT_DIR/outbounds.json"
CONFIG="$OUT_DIR/config.json"

jq -e '.outbounds | type == "array" and length > 0' "$COMBINED_NODES" >/dev/null
jq -e 'type == "array" and length > 0' "$OUTBOUNDS" >/dev/null
jq -e '.outbounds | type == "array" and length > 0' "$CONFIG" >/dev/null

REAL_NODE_COUNT=$(jq '[.outbounds[] | select(.type != "direct" and .type != "block" and .type != "dns" and .type != "urltest" and .type != "selector")] | length' "$COMBINED_NODES")
if [ "$REAL_NODE_COUNT" -le 0 ]; then
    echo "失败: 真实节点数必须大于 0" >&2
    exit 1
fi

jq -e 'any(.[]; .tag == "全部聚合/自动组")' "$OUTBOUNDS" >/dev/null
jq -e 'any(.[]; .tag == "全部聚合/手动组")' "$OUTBOUNDS" >/dev/null
jq -e 'any(.[]; (.tag | startswith("按机场/")))' "$OUTBOUNDS" >/dev/null
jq -e 'any(.[]; (.tag | startswith("按地区/")))' "$OUTBOUNDS" >/dev/null

jq -e '.route.final == "代理选择标签"' "$CONFIG" >/dev/null
jq -e 'any(.outbounds[]; .type == "selector" and .tag == "代理选择标签")' "$CONFIG" >/dev/null
jq -e '
  (.outbounds[] | select(.type == "selector" and .tag == "代理选择标签") | .outbounds) as $choices |
  ($choices | index("全部聚合/自动组")) and
  ($choices | index("全部聚合/手动组")) and
  any($choices[]; startswith("按机场/") and endswith("/自动组")) and
  any($choices[]; startswith("按机场/") and endswith("/手动组")) and
  any($choices[]; startswith("按地区/") and endswith("/自动组")) and
  any($choices[]; startswith("按地区/") and endswith("/手动组"))
' "$CONFIG" >/dev/null
jq -e '
  (.outbounds[] | select(.type == "selector" and .tag == "GLOBAL") | .outbounds) == ["代理选择标签"]
' "$CONFIG" >/dev/null

jq -e '[.outbounds[] | select(.type != "direct" and .type != "block" and .type != "dns" and .type != "urltest" and .type != "selector") | .tag | test("^[^-]+-[^-]+-.+"; "n")] | all' "$CONFIG" >/dev/null

echo "通过: sub-store sing-box 导出结构、分组和节点数验证通过，真实节点数: $REAL_NODE_COUNT"
