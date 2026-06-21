# sing-box TUN 透明代理 — 设计规格

## 1. 项目概述

在 Ubuntu Server 22.04（静态 IP 192.168.100.135）上，通过 Docker 部署 sing-box 作为透明代理网关，接管宿主机全部流量进行路由/加速，同时通过 Web UI（MetaCubeXD）在局域网内管理节点选择。

## 2. 功能需求

| ID | 需求 | 优先级 | 说明 |
|----|------|--------|------|
| F1 | 透明代理 | P0 | 宿主机所有流量经 sing-box 路由，无需逐应用配置代理 |
| F2 | 多协议订阅 | P0 | 支持 Shadowsocks / VMess / VLESS / Trojan / Hysteria2 / anytls / TUIC / WireGuard |
| F3 | 多机场订阅 | P0 | 支持同时加载多个机场订阅链接，自动合并节点列表 |
| F4 | 手动节点选择 | P0 | Web UI 上选中一个节点后，流量实际走选定节点（route.final 指向 selector） |
| F5 | 节点延迟测试 | P1 | Web UI 显示节点延迟，支持按延迟排序 |
| F6 | 代理开关 | P1 | Web UI 一键启用/停用代理 |
| F7 | 节点筛选 | P2 | 按协议类型/机场来源/延迟范围筛选节点 |
| F8 | 配置热重载 | P2 | 修改配置后无需重启容器，通过 API 重载 |

## 3. 非功能需求

| ID | 需求 | 要求 |
|----|------|------|
| N1 | Docker 隔离 | 所有组件运行在 Docker 中，宿主机不安装 sing-box/mihomo 二进制 |
| N2 | SSH 安全 | 正常部署流程下不应中断。第一阶段 mixed 模式期间 SSH 必须可用；第二阶段 TUN 前必须通过恢复演练；出现网络故障时必须存在恢复路径；RTO ≤ 5 分钟 |
| N3 | 机场兼容 | 核心地区（香港/日本/新加坡/美国）每个至少一个稳定可用节点；可用节点比例 ≥ 60%；否则进入兼容性评估流程 |
| N4 | 节点保留 | urltest 标记不可用的节点不删除，保留在 outbounds 列表供手动重试 |
| N5 | Web UI 可用 | 局域网内任意设备可访问 Web UI |
| N6 | 恢复能力 | 具备三级恢复能力，失败时有最后手段（禁用容器自启 + 重启） |
| N7 | 快照备份 | 部署脚本在应用 TUN 配置前自动执行 `recovery.sh --snapshot`，保存完整网络状态快照；支持从快照完全还原 |

## 4. 系统架构

```
┌─────────────────────────────────────────────────────────┐
│                   Ubuntu Server 22.04                   │
│                   192.168.100.135                        │
│                                                          │
│  ┌────────────────── Docker ──────────────────────────┐ │
│  │                                                      │ │
│  │  ┌──────────────┐   ┌──────────────┐               │ │
│  │  │   sing-box    │   │  sub-store   │               │ │
│  │  │   (核心引擎)   │   │ (订阅管理)    │               │ │
│  │  │               │   │ port:9000    │               │ │
│  │  │  port:7890    │   └──────┬───────┘               │ │
│  │  │  port:9090    │          │ 生成 sing-box 配置    │ │
│  │  └──────┬───────┘          │                        │ │
│  │         │                  ▼                        │ │
│  │         │           ┌──────────┐                    │ │
│  │         │           │ /etc/sing-box/outbounds.json  │ │
│  │         │           └──────────┘                    │ │
│  │         │                                           │ │
 │  │                                                       │ │
│  │            ┌──────────┐                                │ │
│  │            │MetaCubeXD│                                │ │
│  │            │(Web UI)  │                                │ │
│  │            │port:9091 │                                │ │
│  │            └──────────┘                                │ │
│  │  ┌──────────▼──────┐                                   │ │
│  │  │  宿主机网络栈     │                                   │ │
│  │  │  (nftables)      │                                   │ │
│  │  └─────────────────┘                                   │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  局域网 ←──── 192.168.100.135:9091 (MetaCubeXD)              │
│           ←──── 192.168.100.135:7890 (mixed 模式)            │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 4.1 组件职责

**sing-box**：流量路由核心。接收 TUN 入站（所有流量）或 mixed 入站（SOCKS5/HTTP），按规则集匹配出站协议，转发到目标服务器。

**MetaCubeXD**：Web 控制面板。通过 sing-box Clash API（:9090）获取节点列表、切换节点、查看延迟。独立容器运行。

**sub-store**：订阅管理。Web GUI 管理多机场订阅、合并输出 sing-box 格式配置。独立容器运行。

**Docker**：运行环境。`--network host` 共享宿主机网络栈 + `--cap-add NET_ADMIN` 操作路由/nftables。

### 4.2 数据流

```
用户请求 ──► TUN 虚拟网卡 ──► sing-box 路由引擎
                                    │
                          ┌─────────┴──────────┐
                          ▼                     ▼
                  匹配规则集             未匹配（final）
                          │                     │
                          ▼                     ▼
                   selector 组 ──► 选中的节点    选择器组 ──► 手动选中的节点
                          │                     │
                          ▼                     ▼
                     目标服务器 ───────────── 目标服务器
```

## 5. 组件设计

### 5.1 Docker Compose

```yaml
version: "3.8"
services:
  sing-box:
    image: ghcr.io/sagernet/sing-box:v1.13.13
    container_name: sing-box
    restart: unless-stopped
    network_mode: "host"
    cap_add:
      - NET_ADMIN
    devices:
      - /dev/net/tun
    volumes:
      - /etc/sing-box:/etc/sing-box
    environment:
      - TZ=Asia/Shanghai
```

- 版本锁定：`v1.13.13`（当前最新稳定版），禁止使用 `latest`
- `network_mode: host`：共享宿主机网络栈，sing-box 可直接操作路由和 nftables
- `cap_add NET_ADMIN`：允许容器修改网络配置（路由表、nftables）
- `/dev/net/tun`：TUN 虚拟网卡设备
- 卷挂载：配置持久化到 `/etc/sing-box`

### 5.2 sing-box 配置设计

#### 第一阶段（mixed 模式）

```json
{
  "log": { "level": "info" },
  "dns": {
    "servers": [
      { "tag": "dns-remote", "address": "https://1.1.1.1/dns-query", "detour": "proxy" },
      { "tag": "dns-local", "address": "223.5.5.5", "detour": "direct" }
    ],
    "rules": [ { "outbound": "any", "server": "dns-local" } ],
    "final": "dns-remote",
    "strategy": "prefer_ipv4"
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
    // 订阅转换后自动生成的节点列表，每个节点有唯一 tag
    // 至少包含一个 selector 类型的"手动选择"组
    { "type": "selector", "tag": "select", "outbounds": ["auto", "节点A", "节点B", ...] },
    { "type": "urltest", "tag": "auto", "outbounds": ["节点A", "节点B", ...] },
    { "type": "direct", "tag": "direct" },
    { "type": "block", "tag": "block" }
  ],
  "route": {
    "rules": [
      { "rule_set": ["geosite-cn"], "outbound": "direct" }
    ],
    "rule_set": [
      { "tag": "geosite-cn", "type": "remote", "url": "https://...", "download_detour": "direct" }
    ],
    "final": "select",
    "auto_detect_interface": true
  },
  "experimental": {
    "cache_file": { "enabled": true },
    "clash_api": {
      "external_controller": "0.0.0.0:9090",
      "external_ui": "ui",
      "default_mode": "rule"
    }
  }
}
```

关键约束：
- `route.final` 必须指向 `"select"`（selector），不能指向 `"auto"`（urltest）。指向 auto 时手动选节点不生效。
- `cache_file.enabled: true`：持久化 Web UI 的选择和配置，重启后保留上次选择的节点。
- `set_system_proxy: false`：mixed 模式时不修改系统代理设置（TUN 模式接管全部流量）。

#### 第二阶段增量（TUN 模式）

在 mixed 配置基础上，inbounds 中新增 TUN 入站：

```json
{
  "inbounds": [
    {
      "type": "tun",
      "tag": "tun-in",
      "interface_name": "tun0",
      "address": "172.19.0.1/30",
      "mtu": 1500,
      "auto_route": true,
      "auto_redirect": true,
      "strict_route": true,
      "sniff": true
    },
    // 保留 mixed 入站作为备用入口
    { "type": "mixed", "tag": "mixed-in", "listen": "::", "listen_port": 7890 }
  ]
}
```

`auto_route: true` + `auto_redirect: true`：自动创建路由规则和 nftables 重定向规则。这是 sing-box 官方推荐的 TUN 配置方式。

**注意**：`strict_route: true` 时 sing-box 会删除默认路由并用自己的策略路由替代。这是 SSH 中断风险的主要来源。通过 route_exclude_address_set + SSH 端口规则保护 SSH。

### 5.3 MetaCubeXD（独立容器）

Web UI 组件，以独立容器运行。

```yaml
  metacubexd:
    image: ghcr.io/metacubex/metacubexd:latest
    container_name: metacubexd
    restart: unless-stopped
    ports:
      - "9091:80"
```

- 独立容器：升级独立、调试独立、UI 损坏不影响核心代理
- 不设 `network_mode: host`，通过 bridge 网络映射端口
- 访问方式：`http://192.168.100.135:9091`
- MetaCubeXD 前端连接 `http://192.168.100.135:9090`（sing-box API）
- 不再使用 sing-box 的 `external_ui` 机制
- **端口分配**：sing-box API → 9090，MetaCubeXD UI → 9091

### 5.4 订阅管理

**架构选型：sub-store**

对比结论：

| 方案 | 部署方式 | 优势 | 劣势 |
|------|----------|------|------|
| sub-store | Docker 独立容器 | 可视化管理、多订阅合并、支持输出 sing-box 格式 | 多一个组件需维护 |
| subconverter | Docker 独立容器 | 成熟稳定、配置灵活 | 无 GUI、API 较原始 |
| 机场自带转换 | 无部署 | 零维护 | 格式/协议受限、无法合并多订阅 |
| sing-box provider | 内置 | 零额外组件 | provider 语法在不同版本间不稳定、调试困难 |

**推荐方案：sub-store（Docker 独立容器）**

原因：
- 提供 Web GUI 管理订阅（添加/更新/删除）
- 支持合并多个订阅到同一个输出
- 直接输出 sing-box 格式，无需二次转换
- 更新订阅后 sing-box 可通过 API 热重载

**数据流**：

```
机场 A 订阅 ──┐
机场 B 订阅 ──┼──► sub-store ──► sing-box 格式 JSON ──► sing-box
机场 C 订阅 ──┘                    │
                                   ▼
                             挂载到 /etc/sing-box/
                             作为 outbounds 源
```

**更新策略**：
- sub-store 定时拉取机场原始订阅（可配置，建议每 6 小时）
- sub-store 生成 sing-box 格式配置后写入持久化卷
- sing-box 的 `outbounds` 通过 `!include` 引用 sub-store 生成的文件
- 需要手动更新时：sub-store Web UI 点击更新 → sing-box API 重载

## 6. 部署策略（分阶段）

### 6.1 第一阶段：mixed 模式

**目标**：验证所有功能，但不碰路由表。

**步骤**：
1. 部署前快照：`sudo bash scripts/backup-network-state.sh`
2. 创建 Docker Compose + sing-box mixed 配置
3. 启动容器
4. 验证功能

**验证清单**：
- [ ] Web UI 可访问（http://192.168.100.135:9091）
- [ ] Clash API 正常（curl http://127.0.0.1:9090/configs）
- [ ] 节点列表完整加载
- [ ] 手动选择节点 → curl ipinfo.io 确认出口 IP 变化
- [ ] 切换三个不同地区（香港/日本/美国）确认 IP 变化
- [ ] 国内流量直连（curl baidu.com 延迟 < 50ms）
- [ ] DNS 解析正常（dig google.com）
- [ ] 容器重启后状态保持（docker restart sing-box → Web UI 恢复上次选择）
- [ ] 订阅更新正常（点击更新按钮）

**决策门**：
```
核心地区（香港/日本/新加坡/美国）每个地区至少一个稳定节点？
且 可用节点比例 >= 60% ？
  → 是：继续使用 sing-box，进入第二阶段
  → 否：进入兼容性评估流程（评估切换后端为 Mihomo 或其他方案）
```

### 6.2 先决条件（第二阶段之前必须完成）

- [ ] 第一阶段所有验证项通过
- [ ] 强制演练通过：`sudo bash recovery.sh --drill` → 输出 PASS
- [ ] 快照备份：`sudo bash recovery.sh --snapshot`
- [ ] 演练不通过 → 不开 TUN，修复重试

### 6.3 第二阶段：TUN 模式

**目标**：接管宿主机全部流量。

**步骤**：
1. `sudo bash recovery.sh --snapshot`（确保此刻有完整快照）
2. 应用 TUN 配置（在 mixed 配置基础上增加 TUN 入站）
3. 重启容器：`docker restart sing-box`
4. 验证 TUN 功能

**验证清单**：
- [ ] SSH 不断连
- [ ] curl ipinfo.io 显示代理出口 IP
- [ ] curl baidu.com 正常
- [ ] dig google.com 有 A 记录
- [ ] 局域网其他设备可访问 Web UI
- [ ] 手动切节点 → curl ipinfo.io 确认 IP 变化

## 7. SSH 保护设计

### 7.1 防护策略（按优先级）

| 优先级 | 防护措施 | 原理 |
|--------|----------|------|
| 1 | SSH 端口 22 路由规则直连 | `{ "port": 22, "outbound": "direct" }`，SSH 流量不经过代理 |
| 2 | 局域网排除 | `route_exclude_address_set` 排除 `192.168.0.0/16`，宿主机 IP 在范围内 |
| 3 | `bind_interface` | sing-box 自身流量走物理网卡，避免回环 |
| 4 | 分阶段上线 | 第一阶段不碰路由表，零风险 |
| 5 | 强制演练 | 开 TUN 前模拟故障验证恢复 |
| 6 | 三级恢复 + 最后手段 | 任何故障都有修复路径 |

### 7.2 不采用的方案（及原因）

| 方案 | 不采用原因 |
|------|-----------|
| 动态排除节点 IP | 机场节点 IP 使用 CDN，动态变化，维护成本高且不可靠 |
| 为 SSH 走独立物理网卡 | 宿主机仅单网卡，无硬件支持 |
| 串口/带外管理 | 当前环境无 IPMI/串口 |

## 8. 灾难恢复

### 8.1 备份机制

部署前执行 `scripts/backup-network-state.sh`，保存：

| 备份项 | 路径 | 用途 |
|--------|------|------|
| 网关/网卡/IP | `network-state-backup.txt` | 恢复默认路由 |
| DNS 配置 | `resolv.conf.backup` | 恢复 DNS |
| nftables 规则集 | `nftables-rules.backup` | 恢复 nftables |
| 完整路由表 | `route-table.backup` | 恢复路由 |
| IP 地址 | `ip-addr.backup` | 恢复地址 |
| mixed 模式 config | `config.json.mixed-backup` | 回退到 mixed 模式 |

### 8.2 三级恢复 + 最后手段

| 级别 | 命令 | 目标 | 场景 |
|------|------|------|------|
| 一级 | `recovery.sh --level1` | 恢复 SSH | TUN 导致网络中断，SSH 断开 |
| 二级 | `recovery.sh --level2` | 回退 mixed | TUN 有问题但需要保留代理功能 |
| 三级 | `recovery.sh --level3` | 系统还原 | 完全清理 sing-box，回退到部署前 |
| 最后手段 | `recovery.sh --last-resort` | 重启恢复 | 以上全部失败，禁用容器自启 + reboot |

### 8.3 恢复顺序

```
网络中断
  └─► recovery.sh --level1（网络恢复）
       ├─► SSH 恢复 ✓ → 结束
       └─► SSH 未恢复 ✗
            └─► recovery.sh --last-resort（禁用容器 → 重启）
                 └─► 系统重启后 → 网络正常
                      └─► 可选：recovery.sh --level1 清理残留
```

```
代理异常但网络正常
  └─► recovery.sh --level2（回退 mixed 模式）
       ├─► Web UI + API 正常 ✓ → 结束
       └─► 仍有问题 ✗
            └─► recovery.sh --level3（从快照完全还原）
                 └─► OK ✓ / 仍有问题 → --last-resort
```

## 9. 节点管理策略

### 9.1 节点来源

- 订阅链接 → 经订阅转换器（sub-store / subconverter）转为 sing-box 格式
- 转换结果合并到 outbounds 数组
- 每个节点有唯一 tag

### 9.2 不可用节点处理

- urltest 标记不可用的节点保留在 outbounds 列表中
- 原因：机场节点可能因 GWF 封锁暂时不可用，下午/晚上可能恢复
- 用户可通过 Web UI 手动尝试切换

### 9.3 节点选择机制

```
route.final = "select" (selector)
                    │
          ┌─────────┴──────────┐
          ▼                    ▼
    手动选择节点          urltest 不可用时
    流量走选定节点        显示不可用但保留
```

## 10. 验收标准

### 10.1 功能验收

- [ ] Web UI 可访问，节点列表完整显示
- [ ] 手动切换节点后出口 IP 实际变化
- [ ] 国内网站直连，延迟 < 100ms
- [ ] 国外网站走代理，延迟 < 500ms
- [ ] HTTPS 网站正常访问（无证书错误）
- [ ] DNS 解析无泄漏

### 10.2 安全验收

- [ ] 第一阶段 mixed 模式部署期间 SSH 全程可用
- [ ] `sudo bash recovery.sh --drill` → PASS
- [ ] 容器异常停止后不影响 SSH
- [ ] 配置错误时 recovery.sh 可在 5 分钟内恢复网络（RTO ≤ 5 min）

### 10.3 兼容性验收

- [ ] 核心地区（香港/日本/新加坡/美国）每个至少一个稳定可用节点
- [ ] 可用节点比例 ≥ 60%
- [ ] 至少 3 种协议类型节点正常工作
- [ ] 订阅更新后新节点自动生效

## 11. 部署文件清单

| 文件 | 用途 |
|------|------|
| `docker-compose.yml` | Docker Compose 编排（sing-box + MetaCubeXD + sub-store） |
| `configs/sing-box/mixed.json` | 第一阶段 mixed 配置 |
| `configs/sing-box/tun.json` | 第二阶段 TUN 增量配置 |
| `configs/sub-store/sub-store.conf` | sub-store 配置文件 |
| `scripts/backup-network-state.sh` | 网络状态快照备份 |
| `recovery.sh` | 三级灾难恢复脚本 |
| `scripts/deploy.sh` | 一键部署脚本 |

## 12. 开放问题

- sing-box 版本升级策略：锁定 `v1.13.13`，升级需在开发环境验证后再更新
- sub-store 与 sing-box 配置合并方式：`!include` vs 模板渲染，Plan 阶段决定
- sub-store 持久化卷路径及权限设计
