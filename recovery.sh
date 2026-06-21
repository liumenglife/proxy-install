#!/bin/bash
# sing-box 灾难恢复脚本
# 功能：当 TUN 透明代理导致宿主机网络中断或 SSH 断开时，一键恢复网络
# 使用方法：sudo bash /home/lm/soft-install/proxy-install/recovery.sh
# 适用范围：IPMI / 物理控制台 / 任何仍有 root Shell 的场景

export PATH="/usr/sbin:/usr/bin:/sbin:/bin"

if [ "$(id -u)" -ne 0 ]; then
    echo "必须用 root 或 sudo 执行"
    exit 1
fi

echo ""
echo " sing-box 灾难恢复脚本"
echo " 如果网络已断，你可能需要通过 IPMI 或物理控制台执行"
echo ""

# -------------------- 第1步：保存当前网络状态（供后续排查） --------------------
echo "[1] 保存当前网络状态到 /tmp/network-diag.txt"
{
    echo "=== ip route show default ==="
    ip route show default
    echo ""
    echo "=== ip addr ==="
    ip addr
    echo ""
    echo "=== ip link ==="
    ip link
    echo ""
    echo "=== nft list tables ==="
    nft list tables 2>/dev/null || echo "(nftables 不可用)"
    echo ""
    echo "=== docker ps ==="
    docker ps 2>/dev/null || echo "(docker 不可用)"
} > /tmp/network-diag.txt 2>&1

# -------------------- 第2步：停掉 sing-box 容器 --------------------
echo "[2] 停止并删除 sing-box 容器"
docker stop sing-box 2>/dev/null && echo "  容器已停止" || echo "  没有运行中的 sing-box 容器"
docker rm sing-box 2>/dev/null && echo "  容器已删除" || true

# -------------------- 第3步：删除 TUN 虚拟网卡 --------------------
echo "[3] 删除 TUN 虚拟网卡"
for iface in $(ip link show | grep -oP '(?<=^)\d+: tun\d+|(?<=: )sing-box|tun0|tun1|tun2'); do
    iface="${iface%%@*}"
    iface="${iface##*: }"
    [ -z "$iface" ] && continue
    ip link del "$iface" 2>/dev/null && echo "  已删除网卡: $iface" || true
done

# -------------------- 第4步：清理 sing-box 的 nftables 规则 --------------------
echo "[4] 清理 sing-box 的 nftables/iptables 规则"
if command -v nft &>/dev/null; then
    for table in $(nft list tables 2>/dev/null | grep -i 'sing' || true); do
        nft delete table "$table" 2>/dev/null && echo "  已删除 nftable: $table" || true
    done
fi
if command -v iptables &>/dev/null; then
    for chain in SING_BOX SING_BOX_SELF SING_BOX_OUTPUT; do
        iptables -t mangle -F "$chain" 2>/dev/null || true
        iptables -t mangle -X "$chain" 2>/dev/null || true
    done
fi

# -------------------- 第5步：清理 iproute2 策略路由 --------------------
echo "[5] 清理 iproute2 策略路由和标记"
# 删 fwmark 规则（sing-box 默认用 1）
for mark in 1 2 3 4; do
    while ip rule del fwmark "$mark" 2>/dev/null; do true; done
done
# 删特定优先级的 sing-box 规则
for prio in 9000 9001 9002 9003 9004 9005; do
    while ip rule del priority "$prio" 2>/dev/null; do true; done
done
# 清空 sing-box 使用的路由表
for table in 2022 100 101 102; do
    ip route flush table "$table" 2>/dev/null || true
done

# -------------------- 第6步：恢复默认路由 --------------------
echo "[6] 恢复默认路由"
# 先删除所有 default 路由，再重新添加
ip route del default 2>/dev/null || true
ip -6 route del default 2>/dev/null || true

# 找物理网卡（有 IP 的第一个非 lo 接口）
IFACE=""
MY_IP="192.168.100.135"
for i in $(ls /sys/class/net/ 2>/dev/null); do
    [ "$i" = "lo" ] && continue
    [[ "$i" == tun* ]] && continue
    if ip -4 addr show "$i" 2>/dev/null | grep -q "inet "; then
        IFACE="$i"
        break
    fi
done

if [ -n "$IFACE" ]; then
    echo "  检测到物理网卡: $IFACE / IP: $MY_IP"
    # 尝试从备份文件读取网关
    GATEWAY=""
    for bf in /etc/sing-box/network-state-backup.txt /home/lm/soft-install/proxy-install/network-state-backup.txt; do
        if [ -f "$bf" ]; then
            GATEWAY=$(grep "^DEFAULT_GW=" "$bf" | head -1 | cut -d= -f2)
            [ -n "$GATEWAY" ] && echo "  从备份读取到网关: $GATEWAY" && break
        fi
    done
    # 无备份时常用网关列表
    if [ -z "$GATEWAY" ]; then
        for gw in 192.168.100.1 192.168.1.1 192.168.0.1; do
            if ip route get "$gw" &>/dev/null 2>&1; then
                GATEWAY="$gw"
                echo "  自动探测到网关: $GATEWAY"
                break
            fi
        done
    fi
    # 添加默认路由
    if [ -n "$GATEWAY" ]; then
        ip route add default via "$GATEWAY" dev "$IFACE" 2>/dev/null && \
            echo "  默认路由已添加: via $GATEWAY dev $IFACE" || \
            ip route replace default via "$GATEWAY" dev "$IFACE" 2>/dev/null && \
            echo "  默认路由已替换: via $GATEWAY dev $IFACE"
    else
        echo "  无法自动获取网关，请手动执行:"
        echo "  ip route add default via <网关IP> dev $IFACE"
        echo "  (你的是静态IP 192.168.100.135，网关通常是 192.168.100.1)"
    fi
    echo "  IP $MY_IP 保持不变（静态IP不需要DHCP）"
else
    echo "  错误：无法检测到物理网卡"
    ip link show
fi

# -------------------- 第7步：系统级网络恢复 --------------------
echo "[7] 确保 IP 转发开启"
echo 1 > /proc/sys/net/ipv4/ip_forward 2>/dev/null || true

# -------------------- 第8步：连通性测试 --------------------
echo "[8] 网络连通性测试"
sleep 2
OK=0
for target in 223.5.5.5 8.8.8.8; do
    if ping -c 2 -W 3 "$target" &>/dev/null; then
        echo "  $target 可达"
        OK=1
        break
    fi
done

echo ""
if [ "$OK" = "1" ]; then
    echo " 网络已恢复，SSH 应该可以正常连接"
    echo " 如果之前 SSH 断开，请重新连接"
else
    echo " 网络仍未恢复，请手动排查："
    echo "   检查网卡状态: ip link show"
    echo "   查看默认路由: ip route show default"
    echo "   诊断日志保存于: /tmp/network-diag.txt"
    echo "   如果完全无法恢复，尝试: reboot"
fi
echo ""
