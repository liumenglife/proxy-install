#!/bin/bash
# ========================================
#  从 sub-store 导出 sing-box 节点并生成三层分组配置
#  默认只写入仓库内 generated/substore-singbox/
# ========================================

set -euo pipefail

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SUBSTORE_URL="http://127.0.0.1:9001"
OUTPUT_DIR="$BASE_DIR/generated/substore-singbox"
TEMPLATE_CONFIG="$BASE_DIR/configs/sing-box/mixed.json"
APPLY=0

usage() {
    cat >&2 <<'USAGE'
用法: bash scripts/export-substore-singbox.sh [选项]

选项:
  --substore-url URL   sub-store API 地址，默认 http://127.0.0.1:9001
  --output-dir DIR     输出目录，默认 generated/substore-singbox
  --template FILE      默认合并模板，默认 configs/sing-box/mixed.json
  --apply              写入 /etc/sing-box/config.json 并重启 sing-box
  -h, --help           显示帮助

默认输出:
  substore-singbox-nodes.json  标准化 tag 后的真实节点
  groups.json                  scripts/group-nodes.sh 生成的三层分组
  outbounds.json               direct/block + 真实节点 + 三层分组
  config.json                  合并 outbounds 后的 sing-box 配置
USAGE
}

while [ "$#" -gt 0 ]; do
    case "$1" in
        --substore-url)
            SUBSTORE_URL="${2:-}"
            shift 2
            ;;
        --output-dir)
            OUTPUT_DIR="${2:-}"
            shift 2
            ;;
        --template)
            TEMPLATE_CONFIG="${2:-}"
            shift 2
            ;;
        --apply)
            APPLY=1
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "未知参数: $1" >&2
            usage
            exit 1
            ;;
    esac
done

if [ -z "$SUBSTORE_URL" ] || [ -z "$OUTPUT_DIR" ] || [ -z "$TEMPLATE_CONFIG" ]; then
    usage
    exit 1
fi

require_cmd() {
    if ! command -v "$1" >/dev/null 2>&1; then
        echo "缺少命令: $1" >&2
        exit 1
    fi
}

download() {
    curl -fsSL "$1" 2>/dev/null
}

restart_sing_box() {
    if command -v docker >/dev/null 2>&1 && docker ps --format '{{.Names}}' | grep -Fxq sing-box; then
        docker restart sing-box >/dev/null
        return
    fi

    if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files sing-box.service >/dev/null 2>&1; then
        systemctl restart sing-box
        return
    fi

    echo "未找到可重启的 sing-box 容器或 systemd 服务" >&2
    exit 1
}

require_cmd curl
require_cmd jq

mkdir -p "$OUTPUT_DIR"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

SUBS_JSON="$TMP_DIR/subs.json"
NODES_NDJSON="$TMP_DIR/nodes.ndjson"
COMBINED_NODES="$OUTPUT_DIR/substore-singbox-nodes.json"
GROUPS_JSON="$OUTPUT_DIR/groups.json"
OUTBOUNDS_JSON="$OUTPUT_DIR/outbounds.json"
CONFIG_JSON="$OUTPUT_DIR/config.json"
DOWNLOAD_DIR="$TMP_DIR/downloads"
mkdir -p "$DOWNLOAD_DIR"

if ! download "$SUBSTORE_URL/api/subs" > "$SUBS_JSON"; then
    echo "无法获取订阅列表" >&2
    exit 1
fi

SUB_COUNT=$(jq '.data | length' "$SUBS_JSON")
if [ "$SUB_COUNT" -le 0 ]; then
    echo "sub-store 未返回任何订阅" >&2
    exit 1
fi

: > "$NODES_NDJSON"

jq -c '.data[] | {name, displayName: (.displayName // .["display-name"] // .name)}' "$SUBS_JSON" |
while read -r sub; do
    NAME=$(jq -r '.name' <<<"$sub")
    AIRPORT=$(jq -r '.displayName' <<<"$sub")
    ENCODED_NAME=$(jq -rn --arg v "$NAME" '$v | @uri')
    RAW_FILE="$DOWNLOAD_DIR/$NAME.json"

    if ! download "$SUBSTORE_URL/download/$ENCODED_NAME?target=sing-box" > "$RAW_FILE" 2>/dev/null; then
        echo "跳过 $NAME（下载失败）" >&2
        rm -f "$RAW_FILE"
        continue
    fi

    jq -c --arg airport "$AIRPORT" '
      def real_node:
        .type != "direct" and .type != "block" and .type != "dns" and .type != "urltest" and .type != "selector";
      def region($tag):
        if $tag | test("香港|港|HK|Hong ?Kong"; "i") then "香港"
        elif $tag | test("台湾|台灣|台|TW|Taiwan"; "i") then "台湾"
        elif $tag | test("澳门|澳門|🇲🇴|\\bMO\\b|Macau|Macao"; "i") then "澳门"
        elif $tag | test("日本|日|JP|Japan|Tokyo|Osaka"; "i") then "日本"
        elif $tag | test("新加坡|狮城|獅城|SG|Singapore"; "i") then "新加坡"
        elif $tag | test("泰国|泰國|🇹🇭|\\bTH\\b|Thailand|Bangkok"; "i") then "泰国"
        elif $tag | test("菲律宾|菲律賓|🇵🇭|\\bPH\\b|Philippines|Manila|马尼拉|馬尼拉"; "i") then "菲律宾"
        elif $tag | test("马来西亚|馬來西亞|🇲🇾|\\bMY\\b|Malaysia"; "i") then "马来西亚"
        elif $tag | test("印尼|印度尼西亚|印度尼西亞|🇮🇩|\\bID\\b|Indonesia|Jakarta"; "i") then "印尼"
        elif $tag | test("越南|🇻🇳|\\bVN\\b|Vietnam"; "i") then "越南"
        elif $tag | test("巴基斯坦|🇵🇰|\\bPK\\b|Pakistan"; "i") then "巴基斯坦"
        elif $tag | test("印度|🇮🇳|\\bIN\\b|India|Mumbai"; "i") then "印度"
        elif $tag | test("土耳其|土|🇹🇷|\\bTR\\b|Turkey|Istanbul"; "i") then "土耳其"
        elif $tag | test("沙特阿拉伯|沙特|🇸🇦|\\bSA\\b|Saudi"; "i") then "沙特"
        elif $tag | test("阿曼|🇴🇲|\\bOM\\b|Oman"; "i") then "阿曼"
        elif $tag | test("巴林|🇧🇭|\\bBH\\b|Bahrain"; "i") then "巴林"
        elif $tag | test("卡塔尔|卡塔爾|🇶🇦|\\bQA\\b|Qatar"; "i") then "卡塔尔"
        elif $tag | test("伊拉克|🇮🇶|\\bIQ\\b|Iraq"; "i") then "伊拉克"
        elif $tag | test("美国|美國|美|US|USA|United ?States|America|洛杉矶|洛杉磯|纽约|紐約|硅谷|西雅图|西雅圖"; "i") then "美国"
        elif $tag | test("韩国|韓國|韩|韓|KR|Korea|Seoul"; "i") then "韩国"
        elif $tag | test("英国|英國|英|UK|United ?Kingdom|Britain|London"; "i") then "英国"
        elif $tag | test("德国|德國|德|DE|Germany|Frankfurt"; "i") then "德国"
        elif $tag | test("法国|法國|法|FR|France|Paris"; "i") then "法国"
        elif $tag | test("俄罗斯|俄羅斯|俄|RU|Russia|Moscow|莫斯科"; "i") then "俄罗斯"
        elif $tag | test("乌克兰|烏克蘭|🇺🇦|\\bUA\\b|Ukraine"; "i") then "乌克兰"
        elif $tag | test("荷兰|荷蘭|🇳🇱|\\bNL\\b|Netherlands"; "i") then "荷兰"
        elif $tag | test("加拿大|加|CA|Canada|Toronto|Vancouver"; "i") then "加拿大"
        elif $tag | test("澳大利亚|澳大利亞|澳洲|\\bAU\\b|Australia|Sydney"; "i") then "澳大利亚"
        elif $tag | test("巴西|🇧🇷|\\bBR\\b|Brazil"; "i") then "巴西"
        elif $tag | test("智利|🇨🇱|\\bCL\\b|Chile"; "i") then "智利"
        elif $tag | test("埃及|🇪🇬|\\bEG\\b|Egypt"; "i") then "埃及"
        elif $tag | test("柬埔寨|🇰🇭|\\bKH\\b|Cambodia"; "i") then "柬埔寨"
        elif $tag | test("墨西哥|🇲🇽|\\bMX\\b|Mexico"; "i") then "墨西哥"
        elif $tag | test("阿根廷|🇦🇷|\\bAR\\b|Argentina"; "i") then "阿根廷"
        elif $tag | test("新西兰|新西蘭|🇳🇿|\\bNZ\\b|New ?Zealand"; "i") then "新西兰"
        else "其他"
        end;
      .outbounds[]? | select(real_node) |
      (.tag // "未命名节点") as $tag |
      .tag = (region($tag) + "-" + $airport + "-" + $tag)
    ' "$RAW_FILE" >> "$NODES_NDJSON"
done

jq -s '{outbounds: .}' "$NODES_NDJSON" > "$COMBINED_NODES"

REAL_NODE_COUNT=$(jq '.outbounds | length' "$COMBINED_NODES")
if [ "$REAL_NODE_COUNT" -le 0 ]; then
    echo "导出后真实节点数为 0" >&2
    exit 1
fi

bash "$BASE_DIR/scripts/group-nodes.sh" "$COMBINED_NODES" > "$GROUPS_JSON"

CONFIG_SOURCE="$TEMPLATE_CONFIG"
if [ "$APPLY" -eq 1 ] && [ -f /etc/sing-box/config.json ]; then
    CONFIG_SOURCE="/etc/sing-box/config.json"
fi

jq -s '
  def builtin_outbounds:
    ([.[0].outbounds[]? | select(.tag == "direct" or .tag == "block")] | unique_by(.tag)) as $builtins |
    if ($builtins | length) >= 2 then $builtins else [{"type":"direct","tag":"direct"},{"type":"block","tag":"block"}] end;
  (.[1].outbounds) as $nodes |
  (.[2]) as $groups |
  ($groups | map(select((.type == "urltest" or .type == "selector") and (.tag | test("^(全部聚合|按机场/|按地区/)"))) | .tag)) as $group_choices |
  ($group_choices | map(select(. != "全部聚合/自动组"))) as $other_group_choices |
  (["全部聚合/自动组"] + $other_group_choices + ["direct"] | reduce .[] as $item ([]; if index($item) then . else . + [$item] end)) as $proxy_choices |
  ([
    {"type":"selector","tag":"代理选择标签","outbounds":$proxy_choices,"default":"全部聚合/自动组"},
    {"type":"selector","tag":"GLOBAL","outbounds":["代理选择标签"]}
  ]) as $top_selectors |
  (builtin_outbounds + $nodes + $top_selectors + $groups)
' "$CONFIG_SOURCE" "$COMBINED_NODES" "$GROUPS_JSON" > "$OUTBOUNDS_JSON"

jq -s '.[0] as $config | .[1] as $outbounds | $config | .outbounds = $outbounds | .route.final = "代理选择标签"' "$CONFIG_SOURCE" "$OUTBOUNDS_JSON" > "$CONFIG_JSON"

jq -e '.outbounds | type == "array" and length > 0' "$COMBINED_NODES" >/dev/null
jq -e 'type == "array" and any(.[]; .tag == "全部聚合/自动组") and any(.[]; (.tag | startswith("按机场/"))) and any(.[]; (.tag | startswith("按地区/")))' "$GROUPS_JSON" >/dev/null
jq -e '.outbounds | type == "array" and length > 0' "$CONFIG_JSON" >/dev/null

if [ "$APPLY" -eq 1 ]; then
    install -m 0644 "$CONFIG_JSON" /etc/sing-box/config.json
    restart_sing_box
fi

echo "完成: 订阅数 $SUB_COUNT，真实节点数 $REAL_NODE_COUNT"
echo "输出目录: $OUTPUT_DIR"
if [ "$APPLY" -eq 1 ]; then
    echo "已应用到 /etc/sing-box/config.json 并重启 sing-box"
fi
