#!/bin/bash
# ========================================
#  sing-box TUN 透明代理一键部署脚本
# ========================================
# 使用方式:
#   sudo bash scripts/deploy.sh --phase1    第一阶段: mixed 模式
#   sudo bash scripts/deploy.sh --phase2    第二阶段: TUN 模式
# ========================================

export PATH="/usr/sbin:/usr/bin:/sbin:/bin"

BASE_DIR="/home/lm/soft-install/proxy-install"
ENV_FILE="$BASE_DIR/.env"
COMPOSE_FILE="$BASE_DIR/docker-compose.yml"
MIXED_CONFIG="$BASE_DIR/configs/sing-box/mixed.json"
TUN_INBOUND="$BASE_DIR/configs/sing-box/tun-inbound.json"
GROUP_SCRIPT="$BASE_DIR/scripts/group-nodes.sh"
DOCKER_DAEMON_JSON="${DOCKER_DAEMON_JSON:-/etc/docker/daemon.json}"
# SING_BOX_CONFIG_DIR / SUB_STORE_DATA_DIR 在 load_env 后设 fallback

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

if [ "${DEPLOY_LIB_ONLY:-0}" != "1" ] && [ "$(id -u)" -ne 0 ]; then
    echo "必须用 root 或 sudo 执行"
    exit 1
fi

check_deps() {
    for cmd in docker jq; do
        if ! command -v "$cmd" &>/dev/null; then
            echo "缺少依赖: $cmd"
            exit 1
        fi
    done
}

load_env() {
    if [ -f "$ENV_FILE" ]; then
        set -a
        source "$ENV_FILE"
        set +a
    fi
}

env_init() {
    SING_BOX_CONFIG_DIR="${SING_BOX_CONFIG_DIR:-/etc/sing-box}"
    SUB_STORE_DATA_DIR="${SUB_STORE_DATA_DIR:-/etc/sub-store}"
    TARGET_CONFIG="$SING_BOX_CONFIG_DIR/config.json"
}

ensure_dirs() {
    for d in "$SING_BOX_CONFIG_DIR" "$SUB_STORE_DATA_DIR"; do
        [ -d "$d" ] || mkdir -p "$d"
    done
}

# ========================================
# 第一阶段: mixed 模式
# ========================================
remove_daocloud_mirror() {
    local daemon_json="$1"
    local tmp_file

    tmp_file="$(mktemp)"
    if ! jq '."registry-mirrors" = ((."registry-mirrors" // []) | map(select(contains("docker.m.daocloud.io") | not)))' \
        "$daemon_json" > "$tmp_file"; then
        rm -f "$tmp_file"
        return 1
    fi
    mv "$tmp_file" "$daemon_json"
}

daemon_has_daocloud_mirror() {
    local daemon_json="$1"

    [ -f "$daemon_json" ] || return 1
    jq -e '((."registry-mirrors" // []) | any(contains("docker.m.daocloud.io")))' \
        "$daemon_json" >/dev/null 2>&1
}

repair_daocloud_mirror() {
    local daemon_json="$1"
    local backup_file

    backup_file="${daemon_json}.bak.$(date +%Y%m%d%H%M%S)"
    echo ""
    echo -e "${YELLOW}检测到 Docker daemon 配置包含失效 mirror: https://docker.m.daocloud.io${NC}"
    echo "脚本将自动备份 $daemon_json 到 $backup_file，移除该 mirror，并重启 Docker 后重试拉取镜像。"

    cp -a "$daemon_json" "$backup_file"
    if ! remove_daocloud_mirror "$daemon_json"; then
        echo -e "${RED}修改 Docker daemon 配置失败，已保留备份: $backup_file${NC}"
        return 1
    fi

    echo "正在重启 Docker..."
    if command -v systemctl >/dev/null 2>&1; then
        systemctl restart docker
    else
        service docker restart
    fi
}

pull_images_attempt() {
    local failed=""

    if ! cd "$BASE_DIR"; then
        echo -e "${RED}无法进入目录: $BASE_DIR${NC}"
        exit 1
    fi
    for img in "${SING_BOX_IMAGE}" "${SUB_STORE_IMAGE}" "${METACUBEXD_IMAGE}"; do
        echo "  拉取 $img ..."
        if docker pull "$img" 2>&1; then
            echo -e "    ${GREEN}完成${NC}"
        else
            echo -e "    ${RED}失败${NC}"
            failed="$failed $img"
        fi
    done
    PULL_IMAGES_FAILED="$failed"
}

print_pull_images_failed() {
    local failed="$1"

    echo ""
    echo -e "${RED}以下镜像拉取失败:${NC}"
    for f in $failed; do echo "  - $f"; done
}

pull_images() {
    local repaired_daocloud=0

    echo "[1] 拉取 Docker 镜像..."
    pull_images_attempt

    if [ -n "$PULL_IMAGES_FAILED" ] && daemon_has_daocloud_mirror "$DOCKER_DAEMON_JSON"; then
        if ! repair_daocloud_mirror "$DOCKER_DAEMON_JSON"; then
            echo -e "${RED}自动修复 Docker mirror 失败，终止部署${NC}"
            exit 1
        fi
        repaired_daocloud=1
        echo "重新拉取 Docker 镜像..."
        pull_images_attempt
    fi

    if [ -n "$PULL_IMAGES_FAILED" ]; then
        print_pull_images_failed "$PULL_IMAGES_FAILED"
        echo ""
        if [ "$repaired_daocloud" -eq 1 ]; then
            echo "已完成自动 mirror 修复尝试；镜像仍拉取失败，终止部署。"
        else
            echo "未检测到可自动移除的 daocloud mirror；镜像拉取失败，终止部署。"
        fi
        echo "请检查 Docker Hub 网络连通性、镜像名称或其他 registry mirror 配置。"
        exit 1
    fi
}

phase1() {
    echo ""
    echo "========== 第一阶段: mixed 模式 =========="
    echo ""

    # 1. 拉取镜像
    pull_images

    # 2. 备份网络状态
    echo "[2] 备份当前网络状态..."
    bash "$BASE_DIR/scripts/backup-network-state.sh"
    if [ $? -ne 0 ]; then
        echo -e "${RED}网络备份失败，终止部署${NC}"
        exit 1
    fi

    # 3. 复制 mixed 配置到目标位置
    echo "[3] 复制 mixed 配置到 $TARGET_CONFIG"
    cp "$MIXED_CONFIG" "$TARGET_CONFIG"
    chmod 644 "$TARGET_CONFIG"

    # 4. 启动容器
    echo "[4] 启动容器..."
    if ! cd "$BASE_DIR" || ! docker compose up -d; then
        echo -e "${RED}容器启动失败，终止部署${NC}"
        exit 1
    fi

    # 5. 等待容器就绪
    echo "[5] 等待容器就绪..."
    for name in sing-box sub-store metacubexd; do
        for i in $(seq 1 10); do
            if docker ps --format '{{.Names}}' | grep -q "$name"; then
                echo -e "  ${GREEN}$name 运行中${NC}"
                break
            fi
            sleep 1
        done
        if ! docker ps --format '{{.Names}}' | grep -q "$name"; then
            echo -e "  ${RED}$name 启动超时${NC}"
            docker logs "$name" 2>/dev/null | tail -5
        fi
    done

    # 6. 等待 sing-box API 就绪
    echo "[6] 等待 sing-box API 就绪..."
    for i in $(seq 1 10); do
        if curl -s --connect-timeout 2 "http://127.0.0.1:9090/configs" &>/dev/null; then
            echo -e "  ${GREEN}API 就绪${NC}"
            break
        fi
        sleep 2
    done

    # 7. 输出后续指引
    echo ""
    echo "========== 第一阶段部署完成 =========="
    echo ""
    echo "后续手动步骤:"
    echo ""
    echo "  1. 打开 http://192.168.100.135:9001 配置 sub-store"
    echo "     - 添加你的机场订阅链接"
    echo "     - 配置输出格式为 sing-box"
    echo "     - 保存输出文件到 /etc/sub-store/nodes.json"
    echo ""
    echo "  2. 运行分组脚本生成 outbounds:"
    echo "     sudo bash $GROUP_SCRIPT /etc/sub-store/nodes.json > /tmp/outbounds.json"
    echo ""
    echo "  3. 合并 outbounds 到配置:"
    echo "     jq -s '.[0].outbounds = .[1] | .[0]' \\"
    echo "       $TARGET_CONFIG /tmp/outbounds.json > /tmp/config-merged.json"
    echo "     sudo mv /tmp/config-merged.json $TARGET_CONFIG"
    echo ""
    echo "  4. 重启容器: docker restart sing-box"
    echo ""
    echo "  5. 打开 Web UI: http://192.168.100.135:9091"
    echo "     验证节点加载和切换"
    echo ""
    echo "  6. 验收检查:"
    echo "     - 自动分组选择器默认显示: 全部聚合/自动组"
    echo "     - 切一个自动组 → curl ipinfo.io 验证出口"
    echo "     - 选手动组节点 → 路由标签自动更新"
    echo "     - 自动组点节点 → 弹出不可选提示"
    echo "     - 刷新页面后状态保持"
}

# ========================================
# 第二阶段: TUN 模式
# ========================================
phase2() {
    echo ""
    echo "========== 第二阶段: TUN 模式 =========="
    echo ""

    # 1. 确保目标目录存在
    ensure_dirs

    # 2. 检查第一阶段就绪
    if [ ! -f "$TARGET_CONFIG" ]; then
        echo -e "${RED}未检测到 config.json，请先执行 --phase1${NC}"
        exit 1
    fi
    if ! docker ps --format '{{.Names}}' | grep -q "sing-box"; then
        echo -e "${RED}sing-box 容器未运行，请先执行 --phase1${NC}"
        exit 1
    fi

    # 3. 自动快照备份
    echo "[3] 自动快照备份..."
    bash "$BASE_DIR/recovery.sh" --snapshot
    if [ $? -ne 0 ]; then
        echo -e "${RED}快照备份失败，终止部署${NC}"
        exit 1
    fi

    # 4. 物理快照提示 — 停顿等待用户确认
    echo ""
    echo "================================================================"
    echo "  请去 Ubuntu Server 管理面板（Proxmox/VMware/其他）"
    echo "  创建虚拟机级别物理快照。"
    echo ""
    echo "  为什么要物理快照？"
    echo "  recovery.sh 只能恢复软件层面（路由/nftables/DNS/配置），"
    echo "  无法应对: 内核崩溃、磁盘损坏、Docker 版本升级不兼容、误删文件。"
    echo "  物理快照是最后一道物理防线。"
    echo ""
    echo -n "  物理快照已完成？输入 yes 继续，输入 no 取消: "
    read -r confirm
    if [ "$confirm" != "yes" ]; then
        echo -e "${YELLOW}已取消第二阶段部署${NC}"
        exit 0
    fi

    # 5. 强制演练检查
    echo ""
    echo "[5] 检查演练是否通过..."
    echo "  开 TUN 前必须通过: sudo bash recovery.sh --drill"
    echo ""
    echo -n "  演练已通过？输入 yes 继续，no 取消: "
    read -r drill_ok
    if [ "$drill_ok" != "yes" ]; then
        echo -e "${YELLOW}请先完成演练: sudo bash recovery.sh --drill${NC}"
        exit 0
    fi

    # 6. 合并 TUN 配置到现有 config.json
    echo "[6] 合并 TUN 入站配置..."
    jq -s '.[0].inbounds += .[1].inbounds_add | .[0]' \
        "$TARGET_CONFIG" "$TUN_INBOUND" > /tmp/config-tmp.json
    mv /tmp/config-tmp.json "$TARGET_CONFIG"
    echo "  已合并 TUN 入站到 $TARGET_CONFIG"

    # 7. 重启容器
    echo "[7] 重启 sing-box 容器..."
    docker restart sing-box
    for i in $(seq 1 10); do
        if docker ps --format '{{.Names}}' | grep -q "sing-box"; then
            echo -e "  ${GREEN}sing-box 运行中${NC}"
            break
        fi
        sleep 1
    done

    # 8. 验证 API
    echo "[8] 验证 API..."
    for i in $(seq 1 10); do
        if curl -s --connect-timeout 2 "http://127.0.0.1:9090/configs" &>/dev/null; then
            echo -e "  ${GREEN}sing-box API 就绪${NC}"
            break
        fi
        if [ "$i" -eq 10 ]; then
            echo -e "  ${YELLOW}API 未就绪，可稍后手动检查${NC}"
        fi
        sleep 2
    done

    # 9. TUN 网卡检查
    echo ""
    echo "  TUN 网卡:"
    ip link show tun0 2>/dev/null && echo -e "  ${GREEN}tun0 已创建${NC}" || echo -e "  ${YELLOW}tun0 未检测到（可忽略）${NC}"

    echo ""
    echo "========== TUN 部署完成 =========="
    echo ""
    echo "  验证:"
    echo "  1. SSH 是否保持连接（当前会话）"
    echo "  2. curl ipinfo.io 显示代理出口 IP"
    echo "  3. curl baidu.com 正常"
    echo "  4. Web UI 可操作 http://192.168.100.135:9091"
    echo ""
    echo "  如果 SSH 断开:"
    echo "  1. 通过 IPMI/控制台登录"
    echo "  2. 执行: sudo bash recovery.sh --level1"
    echo ""
    echo "  全部恢复手段按序尝试:"
    echo "    --level1 → --level2 → --level3 → --last-resort"
}

# ========================================
if [ "${DEPLOY_LIB_ONLY:-0}" != "1" ]; then
    check_deps
    load_env
    env_init
    ensure_dirs

    case "${1:-}" in
        --phase1) phase1 ;;
        --phase2) phase2 ;;
        *)
            echo "用法: sudo bash $0 --phase1  |  --phase2"
            echo "  --phase1  第一阶段: mixed 模式（不碰路由表）"
            echo "  --phase2  第二阶段: TUN 模式（需先完成 phase1）"
            ;;
    esac
fi
