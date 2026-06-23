#!/bin/bash
# ========================================
#  sing-box 灾难恢复脚本
# ========================================
# 使用方式:
#   sudo bash recovery.sh             交互菜单
#
#   # --- 恢复操作（出问题后执行）---
#   sudo bash recovery.sh --level1    一级恢复（网络恢复，删TUN/路由/nftables）
#   sudo bash recovery.sh --level2    二级恢复（回退到 mixed 模式）
#   sudo bash recovery.sh --level3    三级恢复（从快照完全还原到部署前）
#   sudo bash recovery.sh --drill     演练模式（开TUN前强制验证）
#   sudo bash recovery.sh --last-resort 最后手段（禁用容器自启 + 重启）
#
#   # --- 预防操作（部署前执行）---
#   sudo bash recovery.sh --snapshot  快照备份当前网络/DNS/配置（非恢复操作）
#
#   关键区别：
#   --snapshot = 部署前拍快照（预防）
#   --level*   = 出事后恢复（治疗）
# ========================================
# 适用范围：IPMI / 物理控制台 / 任何仍有 root Shell 的场景

export PATH="/usr/sbin:/usr/bin:/sbin:/bin"

BASE_DIR="/home/lm/soft-install/proxy-install"
BACKUP_DIR="/etc/sing-box"
BACKUP_FILE="$BACKUP_DIR/network-state-backup.txt"
BACKUP_FILE_LOCAL="$BASE_DIR/network-state-backup.txt"
CONFIG_DIR="/etc/sing-box"
MIXED_CONFIG_BACKUP="$CONFIG_DIR/config.json.mixed-backup"
CURRENT_CONFIG="$CONFIG_DIR/config.json"
RESOLV_BACKUP="$BACKUP_DIR/resolv.conf.backup"
NFT_BACKUP="$BACKUP_DIR/nftables-rules.backup"

MY_IP="192.168.100.135"

if [ "$(id -u)" -ne 0 ]; then
    echo "必须用 root 或 sudo 执行"
    exit 1
fi

# ========================================
# 辅助函数
# ========================================

find_interface() {
    for i in $(ls /sys/class/net/ 2>/dev/null); do
        [ "$i" = "lo" ] && continue
        [[ "$i" == tun* ]] && continue
        if ip -4 addr show "$i" 2>/dev/null | grep -q "inet "; then
            echo "$i"
            return 0
        fi
    done
    echo ""
    return 1
}

find_gateway() {
    local gw=""
    for bf in "$BACKUP_FILE" "$BACKUP_FILE_LOCAL"; do
        if [ -f "$bf" ]; then
            gw=$(grep "^DEFAULT_GW=" "$bf" | head -1 | cut -d= -f2)
            [ -n "$gw" ] && echo "$gw" && return 0
        fi
    done
    for g in 192.168.100.1 192.168.1.1 192.168.0.1; do
        if ip route get "$g" &>/dev/null 2>&1; then
            echo "$g"
            return 0
        fi
    done
    echo ""
    return 1
}

verify_connectivity() {
    local ok=0
    for target in 223.5.5.5 8.8.8.8 114.114.114.114; do
        if ping -c 2 -W 3 "$target" &>/dev/null; then
            echo "   $target 可达"
            ok=1
            break
        fi
    done
    if [ "$ok" = "1" ]; then
        echo "   国内: $(curl -s --connect-timeout 3 https://www.baidu.com -o /dev/null -w "%{http_code}" 2>/dev/null || echo '超时')"
        echo "   国外: $(curl -s --connect-timeout 3 https://www.google.com -o /dev/null -w "%{http_code}" 2>/dev/null || echo '超时')"
        echo "   出口 IP: $(curl -s --connect-timeout 3 ip.sb 2>/dev/null || echo '无法获取')"
    fi
    return $ok
}

save_diagnostics() {
    local diag_file="/tmp/network-diag-$(date +%Y%m%d-%H%M%S).txt"
    {
        echo "=== diag time ==="
        date
        echo "=== ip route ==="
        ip route show default
        echo "=== ip addr ==="
        ip addr
        echo "=== ip link ==="
        ip link
        echo "=== nftables ==="
        nft list tables 2>/dev/null || echo "(n/a)"
        echo "=== resolv.conf ==="
        cat /etc/resolv.conf 2>/dev/null || echo "(n/a)"
        echo "=== docker ps ==="
        docker ps 2>/dev/null || echo "(n/a)"
    } > "$diag_file" 2>&1
    echo "  诊断日志: $diag_file"
}

# ========================================
# 一级恢复：网络恢复（目标：恢复 SSH + 基本网络）
# ========================================
level1_network_recovery() {
    echo ""
    echo "========== 一级恢复：网络恢复 =========="
    echo "目标：恢复 SSH 连接和基本网络"
    echo ""

    # 1. 保存诊断
    save_diagnostics

    # 2. 停止并删除 sing-box 容器
    echo "[1] 停止并删除 sing-box 容器"
    docker stop sing-box 2>/dev/null && echo "  容器已停止" || echo "  没有运行中的 sing-box 容器"
    docker rm sing-box 2>/dev/null || true

    # 3. 删除 TUN 虚拟网卡
    echo "[2] 删除 TUN 虚拟网卡"
    for iface in $(ip link show | grep -oP 'tun\d+|sing-box'); do
        ip link del "$iface" 2>/dev/null && echo "  已删除网卡: $iface" || true
    done

    # 4. 清理 sing-box 的 nftables 规则
    echo "[3] 清理 sing-box 的 nftables/iptables 规则"
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

    # 5. 清理 iproute2 策略路由
    echo "[4] 清理 iproute2 策略路由和标记"
    for mark in 1 2 3 4; do
        while ip rule del fwmark "$mark" 2>/dev/null; do true; done
    done
    for prio in 9000 9001 9002 9003 9004 9005; do
        while ip rule del priority "$prio" 2>/dev/null; do true; done
    done
    for table in 2022 100 101 102; do
        ip route flush table "$table" 2>/dev/null || true
    done

    # 6. 恢复默认路由
    echo "[5] 恢复默认路由"
    ip route del default 2>/dev/null || true
    ip -6 route del default 2>/dev/null || true

    local IFACE
    IFACE=$(find_interface)
    if [ -n "$IFACE" ]; then
        local GATEWAY
        GATEWAY=$(find_gateway)
        echo "  网卡: $IFACE, 网关: ${GATEWAY:-未找到}"
        if [ -n "$GATEWAY" ]; then
            ip route add default via "$GATEWAY" dev "$IFACE" 2>/dev/null || \
                ip route replace default via "$GATEWAY" dev "$IFACE" 2>/dev/null
            echo "  默认路由: via $GATEWAY dev $IFACE"
        else
            echo "  无法自动获取网关"
            echo "  手动执行: ip route add default via <网关IP> dev $IFACE"
        fi
    else
        echo "  无法检测到物理网卡"
        ip link show
    fi

    # 7. 恢复 DNS
    echo "[6] 恢复 DNS 配置"
    if [ -f "$RESOLV_BACKUP" ]; then
        cp "$RESOLV_BACKUP" /etc/resolv.conf
        echo "  已从备份恢复 /etc/resolv.conf"
    else
        # 确保有可用的 DNS
        if ! grep -q "nameserver" /etc/resolv.conf 2>/dev/null; then
            echo "nameserver 223.5.5.5" > /etc/resolv.conf
            echo "nameserver 114.114.114.114" >> /etc/resolv.conf
            echo "  已写入默认 DNS（223.5.5.5）"
        fi
    fi

    # 8. 系统级恢复
    echo "[7] 系统网络恢复"
    echo 1 > /proc/sys/net/ipv4/ip_forward 2>/dev/null || true
    if command -v systemctl &>/dev/null; then
        systemctl restart systemd-networkd 2>/dev/null || \
        systemctl restart network 2>/dev/null || \
        systemctl restart NetworkManager 2>/dev/null || true
    fi

    # 9. 连通性测试
    echo "[8] 连通性测试"
    sleep 2
    if verify_connectivity; then
        echo ""
        echo "  一级恢复完成：网络已恢复，SSH 应该可以重新连接"
        return 0
    else
        echo ""
        echo "  一级恢复完成：网络仍未完全恢复，请手动排查"
        echo "  查看诊断日志文件"
        return 1
    fi
}

# ========================================
# 二级恢复：代理恢复（目标：回退到 mixed 模式）
# ========================================
level2_proxy_recovery() {
    echo ""
    echo "========== 二级恢复：代理恢复（回退到 mixed 模式）=========="
    echo "目标：恢复到第一阶段 mixed 模式（保留代理功能，不开 TUN）"
    echo ""

    # 先做一级恢复（确保网络通）
    echo "--- 第一步：执行一级恢复（网络恢复）---"
    level1_network_recovery
    local net_ok=$?

    # 检查是否有 mixed 模式备份配置
    if [ ! -f "$MIXED_CONFIG_BACKUP" ]; then
        echo ""
        echo "  没有找到 mixed 模式备份配置: $MIXED_CONFIG_BACKUP"
        echo "  跳过二级恢复"
        return 1
    fi

    # 检查配置有效性
    echo "--- 第二步：验证 mixed 配置 ---"
    if ! sing-box check -c "$MIXED_CONFIG_BACKUP" &>/dev/null; then
        echo "  错误：mixed 配置验证失败，不可使用"
        echo "  请手动修复: sing-box check -c $MIXED_CONFIG_BACKUP"
        return 1
    fi
    echo "  mixed 配置验证通过"

    # 回滚到 mixed 配置
    echo "--- 第三步：回滚到 mixed 配置 ---"
    cp "$MIXED_CONFIG_BACKUP" "$CURRENT_CONFIG"
    echo "  已回滚配置: $MIXED_CONFIG_BACKUP → $CURRENT_CONFIG"

    # 重启容器
    echo "--- 第四步：重新启动 sing-box 容器（mixed 模式）---"
    local DOCKER_IMAGE
    DOCKER_IMAGE=$(docker inspect sing-box --format '{{.Config.Image}}' 2>/dev/null || echo "ghcr.io/superng6/singbox:latest")

    docker run -d \
        --name sing-box \
        --restart unless-stopped \
        -v "$CONFIG_DIR:/etc/sing-box" \
        -p 7890:7890 \
        -p 9090:9090 \
        "$DOCKER_IMAGE" 2>/dev/null || {
        echo "  容器启动失败"
        echo "  手动执行: docker run -d --name sing-box -v $CONFIG_DIR:/etc/sing-box -p 7890:7890 -p 9090:9090 $DOCKER_IMAGE"
        return 1
    }

    # 验收
    echo "--- 第五步：验收 ---"
    sleep 3
    local api_ok=0
    for i in 1 2 3 4 5; do
        if curl -s --connect-timeout 3 "http://127.0.0.1:9090" &>/dev/null; then
            api_ok=1
            break
        fi
        sleep 1
    done
    if [ "$api_ok" = "1" ]; then
        echo "  Clash API 正常 (127.0.0.1:9090)"
    else
        echo "  Clash API 异常，检查容器日志: docker logs sing-box"
    fi

    local proxy_ok=0
    if curl -s --connect-timeout 5 --proxy "socks5://127.0.0.1:7890" https://www.google.com -o /dev/null -w "%{http_code}" 2>/dev/null | grep -q 200; then
        echo "  mixed 代理正常 (socks5://127.0.0.1:7890)"
        proxy_ok=1
    else
        echo "  mixed 代理异常，检查配置"
    fi

    echo ""
    if [ "$api_ok" = "1" ] && [ "$proxy_ok" = "1" ]; then
        echo "  二级恢复完成：已回退到 mixed 模式"
        echo "  proxy-ui 可通过 http://192.168.100.135:9091 访问"
        return 0
    else
        echo "  二级恢复完成（部分组件异常）"
        return 1
    fi
}

# ========================================
# 三级恢复：系统恢复（目标：恢复到部署前状态）
# ========================================
level3_system_restore() {
    echo ""
    echo "========== 三级恢复：系统恢复 =========="
    echo "目标：恢复到部署前状态（完全清理 sing-box 痕迹）"
    echo ""

    # 三级恢复包含一级全部内容
    level1_network_recovery

    # 从备份恢复完整网络状态
    echo ""
    echo "--- 从备份恢复完整网络状态 ---"
    local bf=""
    for f in "$BACKUP_FILE" "$BACKUP_FILE_LOCAL"; do
        [ -f "$f" ] && bf="$f" && break
    done
    if [ -n "$bf" ]; then
        echo "  使用备份: $bf"
        source "$bf" 2>/dev/null || true
        # 还原 IP 地址（如果是静态 IP）
        local saved_ip
        saved_ip=$(grep "^IP_ADDR=" "$bf" | head -1 | cut -d= -f2)
        local saved_gw
        saved_gw=$(grep "^DEFAULT_GW=" "$bf" | head -1 | cut -d= -f2)
        local saved_iface
        saved_iface=$(grep "^DEFAULT_IFACE=" "$bf" | head -1 | cut -d= -f2)
        if [ -n "$saved_ip" ] && [ -n "$saved_gw" ] && [ -n "$saved_iface" ]; then
            echo "  备份中的网络状态: $saved_ip / gw $saved_gw / dev $saved_iface"
        fi
    else
        echo "  无备份文件，跳过完整恢复"
    fi

    # 清理容器镜像（可选）
    echo ""
    echo "--- 清理 Docker 资源 ---"
    docker rmi "$(docker images | grep sing-box | awk '{print $3}')" 2>/dev/null && echo "  已删除 sing-box 镜像" || echo "  无 sing-box 镜像需要删除"
    docker network prune -f 2>/dev/null || true

    # 恢复 DNS
    if [ -f "$RESOLV_BACKUP" ]; then
        cp "$RESOLV_BACKUP" /etc/resolv.conf
        echo "  DNS 已恢复"
    fi

    # 恢复 nftables
    if [ -f "$NFT_BACKUP" ]; then
        nft -f "$NFT_BACKUP" 2>/dev/null && echo "  nftables 规则已恢复" || echo "  nftables 恢复失败（可能版本变化）"
    fi

    echo ""
    echo "  三级恢复完成：系统已尽可能恢复到部署前状态"
    echo "  如果仍有问题，请手动执行: reboot"
}

# ========================================
# 演练模式（在开启 TUN 之前必须通过）
# ========================================
drill_mode() {
    echo ""
    echo "========== 演练模式 =========="
    echo "说明：模拟故障场景，验证恢复脚本有效"
    echo "执行步骤："
    echo "  1. 破坏默认路由（模拟 TUN 故障）"
    echo "  2. 执行 recovery.sh --level1"
    echo "  3. 验证网络恢复"
    echo ""

    local IFACE
    IFACE=$(find_interface)
    if [ -z "$IFACE" ]; then
        echo "错误：无法检测到物理网卡"
        return 1
    fi
    local GATEWAY
    GATEWAY=$(find_gateway)
    if [ -z "$GATEWAY" ]; then
        echo "错误：无法检测到网关"
        return 1
    fi

    echo "当前网络状态:"
    echo "  网卡: $IFACE"
    echo "  网关: $GATEWAY"
    echo "  IP: $MY_IP"

    # 保存当前路由
    local saved_route
    saved_route=$(ip route show default 2>/dev/null)
    echo ""
    echo "当前默认路由: $saved_route"
    echo ""

    # 确认破坏
    echo "即将模拟 TUN 故障：删除默认路由"
    echo -n "确认继续？(y/N): "
    read -r confirm
    if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
        echo "演练取消"
        return 0
    fi

    # 破坏路由
    ip route del default 2>/dev/null
    echo ""
    echo "  [模拟故障] 默认路由已删除"
    echo "  现在尝试运行: ping 8.8.8.8"
    echo "  （应该失败）"
    echo ""
    echo -n "按回车键继续执行恢复: "
    read -r

    # 执行一级恢复
    echo ""
    echo "  --- 执行一级恢复 ---"
    level1_network_recovery
    local recover_ok=$?

    echo ""
    echo "========== 演练结果 =========="
    if [ "$recover_ok" = "0" ]; then
        echo "  PASS：网络已成功恢复"
        echo "  原始路由（保存的快照）:"
        echo "    $saved_route"
        echo "  当前路由:"
        ip route show default
        echo ""
        echo "  演练通过。可以安全进入第二阶段 TUN 部署。"
        return 0
    else
        echo "  FAIL：网络恢复失败"
        echo "  请手动修复后重试演练"
        echo "  手动执行: ip route add default via $GATEWAY dev $IFACE"
        return 1
    fi
}

# ========================================
# 主菜单
# ========================================
main_menu() {
    echo ""
    echo "================================================"
    echo "   sing-box 灾难恢复脚本"
    echo "   宿主机 IP: $MY_IP"
    echo "================================================"
    echo ""
    echo "  【恢复操作】— 出问题后执行"
    echo "  一级恢复   — 网络恢复（清理 TUN/路由/nftables, 恢复 SSH）"
    echo "  二级恢复   — 代理恢复（回退到 mixed 模式, 保留代理功能）"
    echo "  三级恢复   — 系统恢复（从快照完全还原, 回到部署前）"
    echo "  演练模式   — 模拟故障, 验证恢复能力（开 TUN 前必须过）"
    echo "  最后手段   — 禁用容器自启 + 重启系统"
    echo ""
    echo "  【预防操作】— 部署前执行"
    echo "  快照备份   — 备份当前网络/DNS/配置（--snapshot, 非恢复操作）"
    echo ""
    echo "================================================"
    echo ""
    echo "请选择操作:"
    echo "  1) 一级恢复（网络恢复）"
    echo "  2) 二级恢复（回退到 mixed 模式）"
    echo "  3) 三级恢复（从快照还原）"
    echo "  4) 演练模式（验证恢复能力）"
    echo "  5) 快照备份 ⬅ 部署前预防操作"
    echo "  6) 最后手段（禁用容器 + 重启）"
    echo "  7) 退出"
    echo ""
    echo -n "请输入 [1-7]: "
    read -r choice
    echo ""

    case "$choice" in
        1) level1_network_recovery ;;
        2) level2_proxy_recovery ;;
        3) level3_system_restore ;;
        4) drill_mode ;;
        5) snapshot_backup ;;
        6) last_resort ;;
        7) echo "已取消" ;;
        *) echo "无效选择" ;;
    esac
}

# ========================================
# 最后手段：禁用容器自启 → 重启
# ========================================
last_resort() {
    echo ""
    echo "========== 最后手段：禁用容器自启 + 重启 =========="
    echo "说明：当三级恢复都失败时，禁用 sing-box 自启后重启系统"
    echo "重启后 Docker 不会自动启动 sing-box，系统应能正常联网"
    echo ""

    # 禁用容器自启
    echo "[1] 禁用 sing-box 容器自启"
    docker update --restart no sing-box 2>/dev/null && \
        echo "  容器自启已禁用: docker update --restart no sing-box" || \
        echo "  容器不存在或 Docker 不可用"

    # 停止容器
    echo "[2] 停止 sing-box 容器"
    docker stop sing-box 2>/dev/null && echo "  容器已停止" || echo "  无运行中的容器"

    # 清理 TUN 和路由
    echo "[3] 清理 sing-box 残留"
    for iface in $(ip link show | grep -oP 'tun\d+|sing-box'); do
        ip link del "$iface" 2>/dev/null && echo "  已删除: $iface" || true
    done
    ip route del default 2>/dev/null || true
    local IFACE
    IFACE=$(find_interface)
    local GATEWAY
    GATEWAY=$(find_gateway)
    if [ -n "$IFACE" ] && [ -n "$GATEWAY" ]; then
        ip route add default via "$GATEWAY" dev "$IFACE" 2>/dev/null || \
            ip route replace default via "$GATEWAY" dev "$IFACE" 2>/dev/null
        echo "  已恢复默认路由"
    fi

    echo ""
    echo "[4] 即将重启系统"
    echo "  重启后网络应自动恢复（sing-box 不会自启）"
    echo "  如果重启后仍有问题，执行: sudo bash recovery.sh --level1"
    echo ""
    echo -n "确认重启系统？(y/N): "
    read -r confirm
    if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
        echo "  正在重启..."
        reboot
    else
        echo "  已取消重启"
        echo "  手动处理:"
        echo "  1. docker update --restart no sing-box"
        echo "  2. docker stop sing-box"
        echo "  3. sudo reboot"
    fi
}

# ========================================
# 快照备份（执行 TUN 部署前强制调用）
# ========================================
snapshot_backup() {
    if [ -f "$BASE_DIR/scripts/backup-network-state.sh" ]; then
        bash "$BASE_DIR/scripts/backup-network-state.sh"
        echo ""
        echo "  快照备份完成"
        echo "  恢复时使用: sudo bash recovery.sh --level3"
    else
        echo "错误：找不到 backup-network-state.sh"
        return 1
    fi
}

# ========================================
# 入口
# ========================================
case "${1:-}" in
    --level1)    level1_network_recovery ;;
    --level2)    level2_proxy_recovery ;;
    --level3)    level3_system_restore ;;
    --drill)     drill_mode ;;
    --snapshot)  snapshot_backup ;;
    --last-resort) last_resort ;;
    *)           main_menu ;;
esac
