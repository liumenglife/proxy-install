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
  (.outbounds[] | select(.type == "selector" and .tag == "代理选择标签")) as $selector |
  $selector.default == "全部聚合/自动组" and
  $selector.outbounds[0] == "全部聚合/自动组" and
  (($selector.outbounds | index("direct")) != null)
' "$CONFIG" >/dev/null
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

jq -e '
  def macau: test("澳门|澳門|🇲🇴|\\bMO\\b|Macau|Macao"; "i");
  [
    .outbounds[]
    | select(.tag == "按地区/澳大利亚/自动组" or .tag == "按地区/澳大利亚/手动组")
    | .outbounds[]?
    | select(macau)
  ] | length == 0
' "$CONFIG" >/dev/null
jq -e '
  def macau: test("澳门|澳門|🇲🇴|\\bMO\\b|Macau|Macao"; "i");
  any(.outbounds[]; (.tag == "按地区/澳门/自动组" or .tag == "按地区/澳门/手动组") and any(.outbounds[]?; macau))
' "$CONFIG" >/dev/null

for spec in \
    '泰国|泰国|泰國|🇹🇭|\\bTH\\b|Thailand' \
    '菲律宾|菲律宾|菲律賓|🇵🇭|\\bPH\\b|Philippines' \
    '马来西亚|马来西亚|馬來西亞|🇲🇾|\\bMY\\b|Malaysia' \
    '越南|越南|🇻🇳|\\bVN\\b|Vietnam' \
    '巴基斯坦|巴基斯坦|🇵🇰|\\bPK\\b|Pakistan' \
    '阿曼|阿曼|🇴🇲|\\bOM\\b|Oman' \
    '巴林|巴林|🇧🇭|\\bBH\\b|Bahrain' \
    '卡塔尔|卡塔尔|卡塔爾|🇶🇦|\\bQA\\b|Qatar' \
    '伊拉克|伊拉克|🇮🇶|\\bIQ\\b|Iraq' \
    '乌克兰|乌克兰|烏克蘭|🇺🇦|\\bUA\\b|Ukraine' \
    '荷兰|荷兰|荷蘭|🇳🇱|\\bNL\\b|Netherlands' \
    '智利|智利|🇨🇱|\\bCL\\b|Chile' \
    '沙特|沙特阿拉伯|沙特|🇸🇦|\\bSA\\b|Saudi' \
    '埃及|埃及|🇪🇬|\\bEG\\b|Egypt' \
    '柬埔寨|柬埔寨|🇰🇭|\\bKH\\b|Cambodia' \
    '墨西哥|墨西哥|🇲🇽|\\bMX\\b|Mexico' \
    '阿根廷|阿根廷|🇦🇷|\\bAR\\b|Argentina' \
    '新西兰|新西兰|新西蘭|🇳🇿|\\bNZ\\b|New ?Zealand'; do
    region="${spec%%|*}"
    pattern="${spec#*|}"
    if jq -e --arg pattern "$pattern" '[.outbounds[] | select(.type != "direct" and .type != "block" and .type != "dns" and .type != "urltest" and .type != "selector") | select(.tag | test($pattern; "i"))] | length > 0' "$CONFIG" >/dev/null; then
        jq -e --arg region "$region" 'any(.outbounds[]; .tag == ("按地区/" + $region + "/自动组"))' "$CONFIG" >/dev/null
        jq -e --arg region "$region" 'any(.outbounds[]; .tag == ("按地区/" + $region + "/手动组"))' "$CONFIG" >/dev/null
    fi
done

jq -e '
  def known_region_node:
    test("泰国|🇹🇭|\\bTH\\b|Thailand|巴林|🇧🇭|\\bBH\\b|Bahrain|智利|🇨🇱|\\bCL\\b|Chile|乌克兰|烏克蘭|🇺🇦|\\bUA\\b|Ukraine|菲律宾|菲律賓|🇵🇭|\\bPH\\b|Philippines|马来西亚|馬來西亞|🇲🇾|\\bMY\\b|Malaysia|越南|🇻🇳|\\bVN\\b|Vietnam|巴基斯坦|🇵🇰|\\bPK\\b|Pakistan|阿曼|🇴🇲|\\bOM\\b|Oman|卡塔尔|卡塔爾|🇶🇦|\\bQA\\b|Qatar|伊拉克|🇮🇶|\\bIQ\\b|Iraq|荷兰|荷蘭|🇳🇱|\\bNL\\b|Netherlands|埃及|🇪🇬|\\bEG\\b|Egypt|柬埔寨|🇰🇭|\\bKH\\b|Cambodia|墨西哥|🇲🇽|\\bMX\\b|Mexico|阿根廷|🇦🇷|\\bAR\\b|Argentina|新西兰|新西蘭|🇳🇿|\\bNZ\\b|New ?Zealand"; "i");
  [
    .outbounds[]
    | select(.tag == "按地区/其他/自动组" or .tag == "按地区/其他/手动组")
    | .outbounds[]?
    | select(known_region_node)
  ] | length == 0
' "$CONFIG" >/dev/null

jq -e '
  [.[].tag | select(startswith("按地区/"))] as $region_tags |
  ($region_tags | index("按地区/其他/自动组")) as $other_idx |
  $other_idx == ($region_tags | length - 2)
' "$OUTBOUNDS" >/dev/null

echo "通过: sub-store sing-box 导出结构、分组和节点数验证通过，真实节点数: $REAL_NODE_COUNT"
