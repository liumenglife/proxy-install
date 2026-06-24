#!/bin/bash
# ========================================
#  分组后处理脚本
#  输入：sub-store 输出的节点列表 JSON
#  输出：sing-box outbounds 配置片段（含三层分组）
#  用法: bash scripts/group-nodes.sh <节点列表.json> > outbounds.json
# ========================================

set -euo pipefail

NODES_FILE="${1:-}"
if [ -z "$NODES_FILE" ] || [ ! -f "$NODES_FILE" ]; then
    echo "用法: $0 <节点列表.json>" >&2
    exit 1
fi

# 读取所有节点（排除内置出站类型）
NODES=$(jq -c '.outbounds[] | select(.type != "direct" and .type != "block" and .type != "dns" and .type != "urltest" and .type != "selector")' "$NODES_FILE")
TAGS=$(echo "$NODES" | jq -r '.tag')

# 提取地区前缀（tag 第一段，连字符前，如 香港-xxx → 香港），其他永远排最后
REGIONS=$(echo "$TAGS" | sed 's/-.*//' | sort -u | grep -v '^其他$' | sort -u; echo "$TAGS" | sed 's/-.*//' | grep '^其他$' | head -1)

# 提取机场信息（tag 第二段，如 香港-机场A-{节点名} → 机场A）
AIRPORTS=$(echo "$TAGS" | awk -F- '{print $2}' | sort -u)

# 全部节点 tag 数组
ALL_TAGS=$(echo "$TAGS" | jq -R -s 'split("\n") | map(select(length > 0))')

GROUPS_JSON=$(mktemp)
GROUPS2_JSON=$(mktemp)
trap 'rm -f "$GROUPS_JSON" "$GROUPS2_JSON"' EXIT

# 生成分组骨架
jq -n \
  --argjson all_tags "$ALL_TAGS" \
  --arg regions "$REGIONS" \
  --arg airports "$AIRPORTS" \
  '[
    { "type": "urltest", "tag": "全部聚合/自动组", "outbounds": $all_tags, "interval": "20s" },
    { "type": "selector", "tag": "全部聚合/手动组", "outbounds": $all_tags }
  ] + (
    ($airports | split("\n") | map(select(length > 0))) as $ap_list |
    [ $ap_list[] | { "type": "urltest", "tag": ("按机场/" + . + "/自动组"), "outbounds": [], "interval": "20s" },
      { "type": "selector", "tag": ("按机场/" + . + "/手动组"), "outbounds": [] } ]
  ) + (
    ($regions | split("\n") | map(select(length > 0))) as $rg_list |
    [ $rg_list[] | { "type": "urltest", "tag": ("按地区/" + . + "/自动组"), "outbounds": [], "interval": "20s" },
      { "type": "selector", "tag": ("按地区/" + . + "/手动组"), "outbounds": [] } ]
  )
' > "$GROUPS_JSON"

# 将节点分配到对应的机场组和地区组
echo "$NODES" | while read -r node; do
    TAG=$(echo "$node" | jq -r '.tag')
    REGION=$(echo "$TAG" | sed 's/-.*//')
    AIRPORT=$(echo "$TAG" | awk -F- '{print $2}')

    # 分配到机场组（自动+手动）
    jq --arg tag "$TAG" --arg airport "$AIRPORT" \
      '(.[] | select(.tag == "按机场/" + $airport + "/自动组" or .tag == "按机场/" + $airport + "/手动组") | .outbounds) += [$tag]' \
      "$GROUPS_JSON" > "$GROUPS2_JSON" && mv "$GROUPS2_JSON" "$GROUPS_JSON"

    # 分配到地区组（自动+手动）
    jq --arg tag "$TAG" --arg region "$REGION" \
      '(.[] | select(.tag == "按地区/" + $region + "/自动组" or .tag == "按地区/" + $region + "/手动组") | .outbounds) += [$tag]' \
      "$GROUPS_JSON" > "$GROUPS2_JSON" && mv "$GROUPS2_JSON" "$GROUPS_JSON"
done

cat "$GROUPS_JSON"
