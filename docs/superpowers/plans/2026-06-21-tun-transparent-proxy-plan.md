# TUN 透明代理实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Ubuntu Server 22.04 上通过 Docker 部署 sing-box（v1.13.13）+ MetaCubeXD + sub-store，分两阶段实现 TUN 透明代理。

**架构：** sing-box 为核心引擎（host 网络模式 + NET_ADMIN），MetaCubeXD 为独立 Web UI（:9091），sub-store 为订阅转换器（:9001）。配置持久化到 `/etc/sing-box/`，订阅输出挂载为 JSON 供 sing-box 引用。

**Tech Stack:** sing-box v1.13.13, MetaCubeXD, sub-store, Docker Compose, nftables

**前置条件（已就绪）：**
- `scripts/backup-network-state.sh` ✓
- `recovery.sh`（三级恢复 + snapshot + last-resort + drill）✓
- `docs/superpowers/specs/2026-06-21-tun-transparent-proxy-spec.md` ✓

---

### Task 1：项目目录 + Docker Compose + 环境变量

**Files:**
- Create: `docker-compose.yml`
- Create: `.env`
- Create: `configs/sing-box/.gitkeep`
- Create: `configs/sub-store/.gitkeep`

- [ ] **Step 1: 创建目录结构**

```bash
mkdir -p configs/sing-box configs/sub-store scripts
```

- [ ] **Step 2: 创建 `.env`**

写入 `/home/lm/soft-install/proxy-install/.env`：

```bash
SING_BOX_IMAGE=ghcr.io/sagernet/sing-box:v1.13.13
METACUBEXD_IMAGE=ghcr.io/metacubex/metacubexd:latest
SUB_STORE_IMAGE=xream/sub-store:latest
SING_BOX_CONFIG_DIR=/etc/sing-box
SUB_STORE_DATA_DIR=/etc/sub-store
MY_IP=192.168.100.135
```

- [ ] **Step 3: 创建 `docker-compose.yml`**

写入 `/home/lm/soft-install/proxy-install/docker-compose.yml`：

```yaml
services:
  sing-box:
    image: ${SING_BOX_IMAGE}
    container_name: sing-box
    restart: unless-stopped
    network_mode: "host"
    cap_add:
      - NET_ADMIN
    devices:
      - /dev/net/tun
    volumes:
      - ${SING_BOX_CONFIG_DIR}:/etc/sing-box
      - ${SUB_STORE_DATA_DIR}:/etc/sub-store:ro
    environment:
      - TZ=Asia/Shanghai

  sub-store:
    image: ${SUB_STORE_IMAGE}
    container_name: sub-store
    restart: unless-stopped
    ports:
      - "9001:9001"
    volumes:
      - ${SUB_STORE_DATA_DIR}:/opt/sub-store
    environment:
      - TZ=Asia/Shanghai

  metacubexd:
    image: ${METACUBEXD_IMAGE}
    container_name: metacubexd
    restart: unless-stopped
    ports:
      - "9091:80"
    environment:
      - TZ=Asia/Shanghai
```

- [ ] **Step 4: 创建 gitkeep 占位**

```bash
touch configs/sing-box/.gitkeep configs/sub-store/.gitkeep
```

- [ ] **Step 5: 验证 Compose 文件语法**

```bash
docker compose config 2>&1 | head -20
```
预期输出：无错误，显示解析后的配置。

- [ ] **Step 6: Commit**

```bash
git add -A && git -c user.name="liumenglife" -c user.email="liumeng@163.com" commit -m "feat: Docker Compose 编排 + 环境变量"
```

---

### Task 2：sing-box 第一阶段 mixed 配置

**Files:**
- Create: `configs/sing-box/mixed.json`

- [ ] **Step 1: 创建 mixed.json**

写入 `/home/lm/soft-install/proxy-install/configs/sing-box/mixed.json`：

```json
{
  "log": {
    "level": "info",
    "timestamp": true
  },
  "dns": {
    "servers": [
      {
        "tag": "dns-remote",
        "address": "https://1.1.1.1/dns-query",
        "detour": "proxy"
      },
      {
        "tag": "dns-local",
        "address": "223.5.5.5",
        "detour": "direct"
      }
    ],
    "rules": [
      {
        "outbound": "any",
        "server": "dns-local"
      }
    ],
    "final": "dns-remote",
    "strategy": "prefer_ipv4",
    "independent_cache": true
  },
  "inbounds": [
    {
      "type": "mixed",
      "tag": "mixed-in",
      "listen": "::",
      "listen_port": 7890,
      "set_system_proxy": false
    }
  ],
  "outbounds": [
    { "type": "direct", "tag": "direct" },
    { "type": "block", "tag": "block" },
    { "type": "dns", "tag": "dns-out" },
    { "type": "urltest", "tag": "全部聚合/自动组", "outbounds": [], "interval": "20s" },
    { "type": "selector", "tag": "全部聚合/手动组", "outbounds": [] }
  ],
  "route": {
    "rules": [
      {
        "protocol": "dns",
        "outbound": "dns-out"
      },
      {
        "rule_set": "geosite-cn",
        "outbound": "direct"
      },
      {
        "port": 22,
        "outbound": "direct"
      }
    ],
    "rule_set": [
      {
        "tag": "geosite-cn",
        "type": "remote",
        "url": "https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-cn.srs",
        "download_detour": "direct"
      }
    ],
    "final": "全部聚合/自动组",
    "auto_detect_interface": true
  },
  "experimental": {
    "cache_file": {
      "enabled": true,
      "store_fakeip": true
    },
    "clash_api": {
      "external_controller": "0.0.0.0:9090",
      "default_mode": "rule"
    }
  }
}
```

关键约束：
- `route.final` 默认指向 `"全部聚合/自动组"`（urltest），用户切换组时后端自动更新
- `outbounds` 骨架只定义全部聚合组，`按机场/*` 和 `按地区/*` 组由 `scripts/group-nodes.sh` 生成并注入
- `cache_file.enabled: true` ——Web UI 选择重启后持久化
- `set_system_proxy: false` ——mixed 模式不修改系统代理，留待 TUN 接管
- 自动组设置 `"interval": "20s"`，20 秒批量测延迟，接近准实时

- [ ] **Step 2: 验证 JSON 语法**

```bash
python3 -m json.tool configs/sing-box/mixed.json > /dev/null && echo "语法正确"
```
预期输出：`语法正确`

- [ ] **Step 3: Commit**

```bash
git add -A && git -c user.name="liumenglife" -c user.email="liumeng@163.com" commit -m "feat: sing-box 第一阶段 mixed 配置"
```

---

### Task 3：sing-box 第二阶段 TUN 增量配置

**Files:**
- Create: `configs/sing-box/tun-inbound.json`

TUN 入站片段，部署脚本将其合并到 mixed.json 中启用 TUN 模式。

- [ ] **Step 1: 创建 tun-inbound.json**

写入 `/home/lm/soft-install/proxy-install/configs/sing-box/tun-inbound.json`：

```json
{
  "inbounds_add": [
    {
      "type": "tun",
      "tag": "tun-in",
      "interface_name": "tun0",
      "address": "172.19.0.1/30",
      "mtu": 1500,
      "auto_route": true,
      "auto_redirect": true,
      "strict_route": true,
      "sniff": true,
      "sniff_override_destination": true
    }
  ]
}
```

部署脚本会通过 `jq` 将 merged config 中的 inbounds 数组和本片段合并写入实际使用的 `config.json`。

- [ ] **Step 2: 验证 JSON 语法**

```bash
python3 -m json.tool configs/sing-box/tun-inbound.json > /dev/null && echo "语法正确"
```

- [ ] **Step 3: Commit**

```bash
git add -A && git -c user.name="liumenglife" -c user.email="liumeng@163.com" commit -m "feat: TUN 入站增量配置"
```

---

### Task 4：分组后处理脚本

**Files:**
- Create: `scripts/group-nodes.sh`

- [ ] **Step 1: 创建 group-nodes.sh**

写入 `/home/lm/soft-install/proxy-install/scripts/group-nodes.sh`：

```bash
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

# 读取所有节点, 提取 tag
NODES=$(jq -c '.outbounds[] | select(.type != "direct" and .type != "block" and .type != "dns" and .type != "urltest" and .type != "selector")' "$NODES_FILE")
TAGS=$(echo "$NODES" | jq -r '.tag')

# 提取地区前缀（tag 第一段，如 香港-xxx → 香港）
REGIONS=$(echo "$TAGS" | sed 's/-.*//' | sort -u)

# 提取机场信息（tag 第二段，如 香港-机场A-节点1 → 机场A）
AIRPORTS=$(echo "$TAGS" | awk -F- '{print $2}' | sort -u)

# 按节点列表生成全部节点 tag 数组
ALL_TAGS=$(echo "$TAGS" | jq -R -s 'split("\n") | map(select(length > 0))')

# 构建分组 outbounds
jq -n \
  --argjson all_tags "$ALL_TAGS" \
  --arg regions "$REGIONS" \
  --arg airports "$AIRPORTS" \
  '[
    # 全部聚合
    { "type": "urltest", "tag": "全部聚合/自动组", "outbounds": $all_tags, "interval": "20s" },
    { "type": "selector", "tag": "全部聚合/手动组", "outbounds": $all_tags },

    # 按机场
    ($airports | split("\n") | map(select(length > 0)) | .[] | 
      { "type": "urltest", "tag": ("按机场/" + . + "/自动组"), "outbounds": [], "interval": "20s" },
      { "type": "selector", "tag": ("按机场/" + . + "/手动组"), "outbounds": [] }
    ),

    # 按地区
    ($regions | split("\n") | map(select(length > 0)) | .[] | 
      { "type": "urltest", "tag": ("按地区/" + . + "/自动组"), "outbounds": [], "interval": "20s" },
      { "type": "selector", "tag": ("按地区/" + . + "/手动组"), "outbounds": [] }
    )
  ]' > /tmp/groups.json

# 将节点分配到对应的机场组和地区组
# 这里使用简单的 tag 前缀匹配
echo "$NODES" | while read -r node; do
    TAG=$(echo "$node" | jq -r '.tag')
    REGION=$(echo "$TAG" | sed 's/-.*//')
    AIRPORT=$(echo "$TAG" | awk -F- '{print $2}')

    # 分配到机场组
    jq --arg tag "$TAG" --arg airport "$AIRPORT" \
      '(.[] | select(.tag == "按机场/" + $airport + "/自动组" or .tag == "按机场/" + $airport + "/手动组") | .outbounds) += [$tag]' \
      /tmp/groups.json > /tmp/groups2.json && mv /tmp/groups2.json /tmp/groups.json

    # 分配到地区组
    jq --arg tag "$TAG" --arg region "$REGION" \
      '(.[] | select(.tag == "按地区/" + $region + "/自动组" or .tag == "按地区/" + $region + "/手动组") | .outbounds) += [$tag]' \
      /tmp/groups.json > /tmp/groups2.json && mv /tmp/groups2.json /tmp/groups.json
done

cat /tmp/groups.json
```

- [ ] **Step 2: 设置可执行权限**

```bash
chmod +x scripts/group-nodes.sh
```

- [ ] **Step 3: 验证语法**

```bash
bash -n scripts/group-nodes.sh && echo "语法正确"
```

- [ ] **Step 4: Commit**

```bash
git add -A && git -c user.name="liumenglife" -c user.email="liumeng@163.com" commit -m "feat: 分组后处理脚本 group-nodes.sh"
```

---

### Task 5：一键部署脚本

**Files:**
- Create: `scripts/deploy.sh`

- [ ] **Step 1: 创建 deploy.sh**

写入 `/home/lm/soft-install/proxy-install/scripts/deploy.sh`：

```bash
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
SING_BOX_CONFIG_DIR="/etc/sing-box"
TARGET_CONFIG="$SING_BOX_CONFIG_DIR/config.json"
SUB_STORE_DATA_DIR="/etc/sub-store"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

if [ "$(id -u)" -ne 0 ]; then
    echo "必须用 root 或 sudo 执行"
    exit 1
fi

# 检查依赖
check_deps() {
    for cmd in docker jq python3; do
        if ! command -v "$cmd" &>/dev/null; then
            echo "缺少依赖: $cmd"
            exit 1
        fi
    done
}

# 加载环境变量
load_env() {
    if [ -f "$ENV_FILE" ]; then
        set -a
        source "$ENV_FILE"
        set +a
    fi
}

# 检查并创建目录
ensure_dirs() {
    for d in "$SING_BOX_CONFIG_DIR" "$SUB_STORE_DATA_DIR"; do
        [ -d "$d" ] || mkdir -p "$d"
    done
}

# ========================================
# 第一阶段: mixed 模式
# ========================================
phase1() {
    echo ""
    echo "========== 第一阶段: mixed 模式 =========="
    echo ""

    # 1. 备份网络状态
    echo "[1] 备份当前网络状态..."
    bash "$BASE_DIR/scripts/backup-network-state.sh"
    if [ $? -ne 0 ]; then
        echo -e "${RED}网络备份失败，终止部署${NC}"
        exit 1
    fi

    # 2. 复制 mixed 配置到目标位置
    echo "[2] 复制 mixed 配置到 $TARGET_CONFIG"
    cp "$MIXED_CONFIG" "$TARGET_CONFIG"
    chmod 644 "$TARGET_CONFIG"

    # 3. 启动 Docker Compose
    echo "[3] 启动 Docker Compose..."
    cd "$BASE_DIR" && docker compose up -d
    sleep 3

    # 4. 验证容器状态
    echo "[4] 验证容器状态..."
    for name in sing-box sub-store metacubexd; do
        if docker ps --format '{{.Names}}' | grep -q "$name"; then
            echo -e "  ${GREEN}$name 运行中${NC}"
        else
            echo -e "  ${RED}$name 未启动${NC}"
            docker logs "$name" 2>/dev/null | tail -5
        fi
    done

    # 5. 等待 sing-box 就绪
    echo "[5] 等待 sing-box API 就绪..."
    for i in $(seq 1 10); do
        if curl -s --connect-timeout 2 "http://127.0.0.1:9090/configs" &>/dev/null; then
            echo -e "  ${GREEN}API 就绪${NC}"
            break
        fi
        sleep 2
    done

    # 6. 输出验证指引
    echo ""
    echo "========== 部署完成 =========="
    echo ""
    echo "请完成以下验证:"
    echo ""
    echo "  Web UI:       http://192.168.100.135:9091"
    echo "  sub-store:    http://192.168.100.135:9001"
    echo "  Mixed 代理:   socks5://192.168.100.135:7890"
    echo ""
    echo "  验证步骤:"
    echo "  1. 打开 sub-store, 添加你的机场订阅"
    echo "  2. 配置输出格式为 sing-box, 保存到 /etc/sub-store/output.json"
    echo "  3. 修改 /etc/sing-box/config.json, 在 outbounds 中引用节点"
    echo "  4. docker restart sing-box"
    echo "  5. 打开 Web UI, 确认节点列表加载"
    echo "  6. 选择节点 → curl ipinfo.io 验证出口 IP"
    echo ""
    echo "  详细验证清单见 spec 第 6.1 节"
}

# ========================================
# 第二阶段: TUN 模式
# ========================================
phase2() {
    echo ""
    echo "========== 第二阶段: TUN 模式 =========="
    echo ""

    # 1. 检查第一阶段就绪
    if [ ! -f "$TARGET_CONFIG" ]; then
        echo -e "${RED}未检测到 config.json，请先执行 --phase1${NC}"
        exit 1
    fi
    if ! docker ps --format '{{.Names}}' | grep -q "sing-box"; then
        echo -e "${RED}sing-box 容器未运行，请先执行 --phase1${NC}"
        exit 1
    fi

    # 2. 快照备份（自动）
    echo "[1] 自动快照备份..."
    bash "$BASE_DIR/recovery.sh" --snapshot
    if [ $? -ne 0 ]; then
        echo -e "${RED}快照备份失败，终止部署${NC}"
        exit 1
    fi

    # 3. 物理快照提示（停顿点）
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

    # 4. 强制演练检查
    echo ""
    echo "[2] 检查演练是否通过..."
    echo "  开 TUN 前必须通过: sudo bash recovery.sh --drill"
    echo ""
    echo -n "  演练已通过？输入 yes 继续，no 取消: "
    read -r drill_ok
    if [ "$drill_ok" != "yes" ]; then
        echo -e "${YELLOW}请先完成演练: sudo bash recovery.sh --drill${NC}"
        exit 0
    fi

    # 5. 合并 TUN 配置
    echo "[3] 合并 TUN 入站配置..."
    jq -s '.[0].inbounds += .[1].inbounds_add | .[0]' \
        "$MIXED_CONFIG" "$TUN_INBOUND" > "$TARGET_CONFIG"
    echo "  已合并 TUN 入站到 $TARGET_CONFIG"

    # 6. 重启容器
    echo "[4] 重启 sing-box 容器..."
    docker restart sing-box
    sleep 3

    # 7. 验证
    echo "[5] 验证..."
    for i in $(seq 1 10); do
        if curl -s --connect-timeout 2 "http://127.0.0.1:9090/configs" &>/dev/null; then
            echo -e "  ${GREEN}sing-box API 就绪${NC}"
            break
        fi
        sleep 2
    done

    # 8. TUN 网卡检查
    echo ""
    echo "  TUN 网卡:"
    ip link show tun0 2>/dev/null && echo -e "  ${GREEN}tun0 已创建${NC}" || echo -e "  ${YELLOW}tun0 未检测到（可忽略）${NC}"

    echo ""
    echo "========== TUN 部署完成 =========="
    echo ""
    echo "  验证步骤:"
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
    echo "    recovery.sh --level1  →  recovery.sh --level2"
    echo "    → recovery.sh --level3 →  recovery.sh --last-resort"
}

# ========================================
check_deps
load_env
ensure_dirs

case "${1:-}" in
    --phase1) phase1 ;;
    --phase2) phase2 ;;
    *)
        echo "用法: sudo bash $0 --phase1  |  --phase2"
        echo "  --phase1  第一阶段: mixed 模式（不碰路由表）"
        echo "  --phase2  第二阶段: TUN 模式（需要先完成 phase1）"
        ;;
esac
```

- [ ] **Step 2: 设置可执行权限**

```bash
chmod +x scripts/deploy.sh
```

- [ ] **Step 3: 验证脚本语法**

```bash
bash -n scripts/deploy.sh && echo "语法正确"
```

- [ ] **Step 4: Commit**

```bash
git add -A && git -c user.name="liumenglife" -c user.email="liumeng@163.com" commit -m "feat: deploy.sh 一键部署脚本（--phase1 / --phase2）"
```

---

### Task 6：README + 术语表

**Files:**
- Create: `README.md`

- [ ] **Step 1: 创建 README.md**

写入 `/home/lm/soft-install/proxy-install/README.md`：

```markdown
# sing-box TUN 透明代理

在 Ubuntu Server 22.04 上通过 Docker 部署 sing-box 透明代理，接管宿主机全部流量，通过 Web UI 管理节点选择。

## 目录

- [架构](#架构)
- [快速开始](#快速开始)
- [节点分组](#节点分组)
- [使用说明](#使用说明)
- [灾难恢复](#灾难恢复)
- [术语表](#术语表)

## 架构

三个 Docker 容器协同工作：

| 容器 | 职责 | 端口 |
|------|------|------|
| sing-box | 流量路由核心（TUN + 代理） | 7890(mixed) / 9090(API) |
| sub-store | 机场订阅管理/转换 | 9001 |
| MetaCubeXD | Web UI 控制面板 | 9091 |

## 快速开始

### 前置条件

- Ubuntu Server 22.04，静态 IP 192.168.100.135
- Docker + Docker Compose 已安装
- 至少一个机场订阅链接

### 第一阶段：mixed 模式（不修改路由表）

```bash
sudo bash scripts/deploy.sh --phase1
```

部署完成后：
1. 打开 http://192.168.100.135:9001 配置 sub-store，添加订阅
2. 配置输出格式为 sing-box，保存输出文件
3. 运行分组脚本生成 outbounds
4. 重启 sing-box 容器
5. 打开 http://192.168.100.135:9091 验证节点加载

### 第二阶段：TUN 模式（接管全部流量）

开 TUN 前必须完成：
1. `sudo bash recovery.sh --drill` → 输出 PASS
2. 虚拟机管理面板创建物理快照

```bash
sudo bash scripts/deploy.sh --phase2
```

## 节点分组

所有代理组平级并列，不支持嵌套。

### 分组维度

| 维度 | 说明 |
|------|------|
| 全部聚合 | 全局视角，自动/手动选全部节点 |
| 按机场 | 按订阅来源分组（如机场A、机场B） |
| 按地区 | 按节点地区分组（如香港、日本、新加坡、美国） |

### 代理选择器（Web UI 顶部）

**自动分组选择器**（下拉框，可操作）：
- 列出所有自动组（urltest）
- 默认选中：全部聚合/自动组
- 切换后 route.final 自动更新

**实际路由标签**（只读显示）：
- 自动模式：`全部聚合/自动组 → 香港-节点3`
- 手动模式：`按地区/香港/手动组 → 香港-节点2`

### 操作方式

自动模式：在自动分组选择器选一个自动组即可
手动模式：打开任意手动组，点选具体节点，路由自动切换

## 术语表

| 术语 | 说明 |
|------|------|
| **机场** | 提供代理节点订阅服务的平台 |
| **订阅** | 机场提供的节点配置链接（URL），包含多个节点信息 |
| **节点** | 一台代理服务器，有地址/端口/协议/密码等参数 |
| **sing-box** | 通用代理核心程序，负责流量路由和转发 |
| **sub-store** | 订阅管理工具，合并多机场订阅，输出 sing-box 格式配置 |
| **MetaCubeXD** | Web 控制面板，管理节点选择和路由切换 |
| **TUN** | 虚拟网卡模式，接管宿主机所有流量，无需逐应用配置 |
| **mixed 模式** | SOCKS5 + HTTP 混合代理端口模式，不修改路由表 |
| **urltest** | 自动测速分组，每 20 秒测试延迟，自动选最快节点 |
| **selector** | 手动选择分组，用户点选具体节点 |
| **route.final** | 默认出口，无规则匹配的流量走这个分组 |
| **urltest 间隔** | 每 20 秒批量测试一次全部节点延迟，接近实时 |
| **出口 IP** | 代理服务器显示的 IP 地址，用来验证代理是否生效 |
| **延迟测试** | 测试节点响应时间，单位 ms，越低越快 |

## 灾难恢复

```bash
sudo bash recovery.sh --level1    # 网络恢复（SSH 断连时用）
sudo bash recovery.sh --level2    # 回退 mixed 模式
sudo bash recovery.sh --level3    # 从快照完全还原
sudo bash recovery.sh --last-resort  # 最后手段（禁用容器+重启）
```
```

- [ ] **Step 2: Commit**

```bash
git add -A && git -c user.name="liumenglife" -c user.email="liumeng@163.com" commit -m "docs: README + 术语表"
```

---

### Task 7：自检 + 提交 Plan

验证计划覆盖率：

| Spec 章节 | 对应 Task | 状态 |
|-----------|-----------|------|
| 2. 功能需求 F1-F8 | Task 2 (mixed.json) + Task 3 (TUN) | ✓ |
| 3. N1 Docker 隔离 | Task 1 (compose, host network) | ✓ |
| 3. N2 SSH 安全 | Task 2 (端口 22 直连) + Task 5 (deploy.sh phase2 停顿点) | ✓ |
| 3. N3 机场兼容 | Task 5 (deploy.sh phase1 验证指引) | ✓ |
| 3. N4 节点保留 | Task 4 (group-nodes.sh 自动保留) | ✓ |
| 3. N5 Web UI 可用 | Task 1 (MetaCubeXD 独立容器) | ✓ |
| 3. N6 恢复能力 | 前置 recovery.sh (已就绪) | ✓ |
| 3. N7 快照备份 | Task 5 (deploy.sh phase2 自动 snapshot) | ✓ |
| 5.1 Docker Compose | Task 1 | ✓ |
| 5.2 sing-box 配置 | Task 2 + Task 3 | ✓ |
| 5.3 MetaCubeXD | Task 1 (独立容器 :9091) | ✓ |
| 5.4 订阅管理 | Task 1 (sub-store 容器) + Task 4 | ✓ |
| 9. 节点分组策略 | Task 4 (group-nodes.sh 三层分组) | ✓ |
| 9.7 分组后处理脚本 | Task 4 | ✓ |
| 6.1 Phase 1 | Task 5 (phase1) | ✓ |
| 6.2 先决条件 | Task 5 (phase2 演练检查) | ✓ |
| 6.3 Phase 2 | Task 5 (phase2) | ✓ |
| 7. SSH 保护 | Task 2 (端口 22 规则) | ✓ |
| 8. 灾难恢复 | 前置 recovery.sh (已就绪) | ✓ |
| 10.3/10.4 分组+路由验收 | Task 4 + Task 5 | ✓ |
| 术语表 | Task 6 (README) | ✓ |

- [ ] **Step 1: 检查 placeholder**

搜索以下关键词：TBD、TODO、implement later、后续、待定。确保没有漏网。

```bash
rg -n "TBD|TODO|implement later|后续|待定" docs/superpowers/plans/2026-06-21-tun-transparent-proxy-plan.md || echo "无问题"
```

- [ ] **Step 2: 确认文件路径一致性**

确保所有在 Task 中创建的路径和 deploy.sh 中引用的路径一致。

- [ ] **Step 3: 提交 Plan 文档**

```bash
git add -A && git -c user.name="liumenglife" -c user.email="liumeng@163.com" commit -m "docs: 实施计划 plan"
```

---

## 执行依赖关系

```
Task 1 (Compose + .env)
    │
    ├──── 可并行 ──── Task 2 (mixed.json)
    │                     
    ├──── 可并行 ──── Task 3 (tun-inbound.json)
    │
    ▼
Task 4 (group-nodes.sh) ── 依赖 Task 2 的输出格式
    │
    ▼
Task 5 (deploy.sh) ── 依赖 Task 1/2/3/4
    │
    ▼
Task 6 (README) ── 可并行于 4/5
    │
    ▼
Task 7 (自检 + 提交)
```

- Task 2 和 Task 3 可并行
- Task 4 依赖 Task 2（需要理解输出格式）
- Task 5 依赖 Task 1/2/3/4
- Task 6 可与其他 Task 并行
