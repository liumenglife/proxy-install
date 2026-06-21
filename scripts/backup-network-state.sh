#!/bin/bash
# 在部署 TUN 透明代理前执行，保存网络状态供恢复脚本使用
# sudo bash scripts/backup-network-state.sh

if [ "$(id -u)" -ne 0 ]; then
    echo "必须用 root 或 sudo 执行"
    exit 1
fi

BACKUP_FILE="/etc/sing-box/network-state-backup.txt"
mkdir -p /etc/sing-box 2>/dev/null

echo "# Network state backup - $(date)" > "$BACKUP_FILE"
echo "DEFAULT_IFACE=$(ip -4 route show default | head -1 | awk '{print $5}')" >> "$BACKUP_FILE"
echo "DEFAULT_GW=$(ip -4 route show default | head -1 | awk '{print $3}")" >> "$BACKUP_FILE"
echo "IP_ADDR=$(ip -4 addr show | grep -oP '(?<=inet )\d+\.\d+\.\d+\.\d+' | grep -v 127.0.0.1 | head -1)" >> "$BACKUP_FILE"

echo "网络状态已备份:"
cat "$BACKUP_FILE"

# 同时保存一份到项目目录
cp "$BACKUP_FILE" /home/lm/soft-install/proxy-install/network-state-backup.txt 2>/dev/null || true
chmod 644 /home/lm/soft-install/proxy-install/network-state-backup.txt 2>/dev/null || true
