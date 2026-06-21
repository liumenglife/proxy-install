#!/bin/bash
# 在部署 TUN 透明代理前执行，保存网络状态供恢复脚本使用
# sudo bash scripts/backup-network-state.sh

if [ "$(id -u)" -ne 0 ]; then
    echo "必须用 root 或 sudo 执行"
    exit 1
fi

BASE_DIR="/home/lm/soft-install/proxy-install"
BACKUP_DIR="/etc/sing-box"
BACKUP_FILE="$BACKUP_DIR/network-state-backup.txt"
RESOLV_BACKUP="$BACKUP_DIR/resolv.conf.backup"
NFT_BACKUP="$BACKUP_DIR/nftables-rules.backup"
ROUTE_BACKUP="$BACKUP_DIR/route-table.backup"
IP_BACKUP="$BACKUP_DIR/ip-addr.backup"
MIXED_CONFIG_BACKUP="$BACKUP_DIR/config.json.mixed-backup"

mkdir -p "$BACKUP_DIR" 2>/dev/null

echo ""
echo "===== 备份网络状态 ====="
echo ""

# ---------- 基础网络状态 ----------
echo "--- 网络参数 ---"
{
echo "# Network state backup - $(date)"
echo "DEFAULT_IFACE=$(ip -4 route show default | head -1 | awk '{print $5}')"
echo "DEFAULT_GW=$(ip -4 route show default | head -1 | awk '{print $3}')"
echo "IP_ADDR=$(ip -4 addr show | grep -oP '(?<=inet )\d+\.\d+\.\d+\.\d+' | grep -v 127.0.0.1 | head -1)"
} > "$BACKUP_FILE"
cat "$BACKUP_FILE"

# ---------- 备份 resolv.conf ----------
echo ""
echo "--- DNS 配置 ---"
cp /etc/resolv.conf "$RESOLV_BACKUP"
echo "已备份: $RESOLV_BACKUP"
cat /etc/resolv.conf

# ---------- 备份 nftables ----------
echo ""
echo "--- nftables 规则 ---"
if command -v nft &>/dev/null; then
    nft list ruleset > "$NFT_BACKUP" 2>/dev/null
    echo "已备份: $NFT_BACKUP ($(wc -l < "$NFT_BACKUP") lines)"
else
    echo "nftables 不可用，跳过" > "$NFT_BACKUP"
fi

# ---------- 备份当前路由表 ----------
echo ""
echo "--- 路由表 ---"
ip route show > "$ROUTE_BACKUP"
ip -6 route show >> "$ROUTE_BACKUP" 2>/dev/null
echo "已备份: $ROUTE_BACKUP ($(wc -l < "$ROUTE_BACKUP") lines)"

# ---------- 备份 IP 地址 ----------
echo ""
echo "--- IP 地址 ---"
ip addr > "$IP_BACKUP"
echo "已备份: $IP_BACKUP"

# ---------- 保存当前 config.json（如果存在）作为 mixed 模式备份 ----------
echo ""
echo "--- sing-box 配置备份 ---"
if [ -f "$BACKUP_DIR/config.json" ]; then
    # 只备份没有 TUN 入站的版本（即 mixed 模式）
    if grep -q '"tun"' "$BACKUP_DIR/config.json" 2>/dev/null; then
        echo "当前配置包含 TUN，不覆盖 mixed 备份"
    else
        cp "$BACKUP_DIR/config.json" "$MIXED_CONFIG_BACKUP"
        echo "当前配置已保存为 mixed 模式备份: $MIXED_CONFIG_BACKUP"
    fi
else
    echo "没有 config.json，跳过"
fi

# ---------- 同步到项目目录 ----------
cp "$BACKUP_FILE" "$BASE_DIR/network-state-backup.txt" 2>/dev/null || true
chmod 644 "$BASE_DIR/network-state-backup.txt" 2>/dev/null || true

echo ""
echo "===== 备份完成 ====="
echo "备份文件: $BACKUP_DIR/"
echo "  - network-state-backup.txt"
echo "  - resolv.conf.backup"
echo "  - nftables-rules.backup"
echo "  - route-table.backup"
echo "  - ip-addr.backup"
echo "  - config.json.mixed-backup（如有不含 TUN 的配置）"
