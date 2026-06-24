# sing-box TUN 透明代理

在 Ubuntu Server 22.04 上通过 Docker 部署 sing-box 透明代理，接管宿主机全部流量，通过自研 Web UI（proxy-ui）管理节点选择。

## 现状

TUN 模式已部署并稳定运行：

- **sing-box** `v1.13.13` — 核心代理引擎，TUN 入站接管全部流量
- **proxy-ui** — 自研 Web UI（:9091），支持自动组选择、手动节点切换、延时测试、代理开关
- **sub-store** — 订阅管理，4 个机场 342 个真实节点
- **TUN 网卡** `tun0=UP`，透明代理出口已验证可用

## 功能

### 代理管理

| 功能 | 说明 |
|------|------|
| 透明代理 | TUN 模式接管宿主机全部流量，无需逐应用配置代理 |
| 自动组选择 | 卡片式自动组选择器，点击即可切换（`全部聚合/按机场/按地区`） |
| 手动节点选择 | 按地区/机场分组，展开卡片点选具体节点，支持延时排序 |
| 延时测试 | 单组或全部节点批量延时测试，结果同步刷新节点 badge |
| 代理开关 | 一键关闭代理（切换为 direct），再次点击恢复上次代理组 |
| 内核重启 | 一键重启 sing-box 容器 |
| 全局展开/收起 | Command+K 展开全部手动组，Command+L 收起 |
| 实际路由标签 | 顶部三段式路由标签显示当前路径（组→机场→节点），节点段附带延时徽章 |

### 节点分组

三层分组并列，无嵌套：

| 维度 | 自动组 (urltest, 20s) | 手动组 (selector) |
|------|----------------------|-------------------|
| 全部聚合 | 全部聚合/自动组 | 全部聚合/手动组 |
| 按机场 | 按机场/{名称}/自动组 | 按机场/{名称}/手动组 |
| 按地区 | 按地区/{名称}/自动组 | 按地区/{名称}/手动组 |

地区覆盖：香港、台湾、澳门、美国、日本、英国、法国、德国、韩国、新加坡、泰国、菲律宾、马来西亚、印尼、越南、巴基斯坦、印度、土耳其、沙特、阿曼、巴林、卡塔尔、伊拉克、俄罗斯、乌克兰、荷兰、加拿大、澳大利亚、巴西、智利、埃及、柬埔寨、墨西哥、阿根廷、新西兰，其余归入"其他"且永远排在最后。

### 节点标签命名

格式：`{地区}-{机场}-{节点名}`

系统自动解析并生成对应分组：地区维度取第一段，机场维度取第二段。

## 端口分配

| 端口 | 服务 | 说明 |
|------|------|------|
| 7890 | sing-box mixed | HTTP/SOCKS5 代理入口 |
| 9090 | sing-box Clash API | proxy-ui 后端接口 |
| 9091 | proxy-ui Web UI | 自研控制面板 |
| 9001 | sub-store UI | 订阅管理面板 |
| 9002 | sub-store API | sub-store 后端接口 |

## 导出并应用订阅

在 sub-store 配置好机场订阅后：

```bash
# 预览导出
bash scripts/export-substore-singbox.sh

# 验证导出结构
bash scripts/test-export-substore-singbox.sh

# 应用到运行配置并重启 sing-box
sudo bash scripts/export-substore-singbox.sh --apply
```

## 灾难恢复

TUN 模式会修改宿主机网络配置。如果 TUN 出问题导致 SSH 断开或 Web UI 不可访问，按以下步骤恢复。

### 你只需记住一句

```bash
cd /home/lm/soft-install/proxy-install && sudo bash recovery.sh
```

会打开交互菜单：

```text
1) 一级恢复（网络恢复）        ← SSH 断开时选这个
2) 二级恢复（回退到 mixed 模式）
3) 三级恢复（从快照完全还原）
4) 演练模式
5) 快照备份
6) 最后手段（禁用容器 + 重启）
7) 退出
```

### 常见故障场景与应对

| 场景 | 现象 | 操作 |
|------|------|------|
| SSH 断开 | 无法远程登录 | 从虚拟机控制台登录，运行 `sudo bash recovery.sh`，选 `1` |
| 网络异常但 SSH 在 | 代理不通 / 国内国外都断 | 运行 `sudo bash recovery.sh`，选 `2` |
| TUN 配置损坏 | sing-box 无法启动 | 运行 `sudo bash recovery.sh`，选 `2` |
| 系统网络彻底乱了 | 恢复菜单无效 | 运行 `sudo bash recovery.sh`，选 `6` 禁用容器并重启 |

### 恢复后重新部署

一级恢复后网络已通，但 TUN 被移除。如需重新开启：

```bash
sudo bash scripts/export-substore-singbox.sh --apply   # 确保配置最新
sudo bash scripts/deploy.sh --phase2                    # 重新部署 TUN
```

## 日常运维

```bash
# 重建 proxy-ui（UI 代码更新后）
docker compose up -d --build proxy-ui

# 重新生成并应用订阅配置
sudo bash scripts/export-substore-singbox.sh --apply

# 查看部署状态
docker ps --format 'table {{.Names}}\t{{.Status}}'

# 验证 TUN 是否工作
curl ip.sb                    # 应显示代理出口 IP

# 验证 Web UI
curl http://192.168.100.135:9091
```

## 测试

```bash
# 全量单元测试
node --test tests/

# 导出结构测试
bash scripts/test-export-substore-singbox.sh

# 恢复脚本接口测试
bash scripts/test-recovery-interface.sh
```

## 容器架构

```
Ubuntu Server 22.04 (192.168.100.135)
  ├── sing-box (network_mode: host, NET_ADMIN, /dev/net/tun)
  │     ├── tun0: 172.19.0.1/30 (透明代理入口)
  │     ├── mixed-in: ::7890 (HTTP/SOCKS5 备用)
  │     └── Clash API: 0.0.0.0:9090
  │
  ├── proxy-ui (bridge, :9091→80)
  │     └── → host.docker.internal:9090 (sing-box API)
  │
  ├── sub-store (bridge, :9001→3001, :9002→3000)
  │     └── 订阅管理 + sing-box 格式导出
  │
  └── control-agent (bridge, expose 3000)
        └── → host.docker.internal:9090 (重启 sing-box)
```
