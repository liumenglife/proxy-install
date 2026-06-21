# sing-box TUN 透明代理

基于 sing-box 的 Docker 透明代理方案，支持多机场多协议节点管理与 Web UI 操作。

## 目录结构

    .
    ├── docker-compose.yml          # 3 服务编排（sing-box + sub-store + MetaCubeXD）
    ├── .env                        # 环境变量（镜像版本、端口、路径）
    ├── configs/
    │   └── sing-box/
    │       ├── mixed.json          # 第一阶段 mixed 模式配置骨架
    │       └── tun-inbound.json    # 第二阶段 TUN 入站增量配置
    ├── scripts/
    │   ├── deploy.sh               # 一键部署脚本（--phase1 / --phase2）
    │   ├── group-nodes.sh          # 分组后处理脚本（三层分组）
    │   ├── backup-network-state.sh # 网络状态备份
    │   └── ...
    ├── recovery.sh                 # 三级灾难恢复脚本
    └── README.md                   # 本文件

## 快速开始

### 第一阶段：mixed 模式（安全上架）

    sudo bash scripts/deploy.sh --phase1

部署完成后：

1. 打开 http://192.168.100.135:9001 配置 sub-store
2. 添加机场订阅，输出格式选 sing-box
3. 保存输出文件到 /etc/sub-store/nodes.json
4. 运行分组脚本：`sudo bash scripts/group-nodes.sh /etc/sub-store/nodes.json > /tmp/outbounds.json`
5. 合并到 sing-box 配置：`jq -s '.[0].outbounds = .[1] | .[0]' /etc/sing-box/config.json /tmp/outbounds.json > /tmp/config-merged.json && sudo mv /tmp/config-merged.json /etc/sing-box/config.json`
6. 重启容器：`docker restart sing-box`
7. 打开 http://192.168.100.135:9091 使用 Web UI

### 第二阶段：TUN 模式（透明代理）

满足以下条件后执行：

- 第一阶段稳定运行 24 小时以上
- 节点可用率 ≥ 60%
- 核心地区（香港/日本/新加坡/美国）每个至少一个稳定节点
- 已通过物理快照验收

执行：

1. `sudo bash recovery.sh --drill` 演练恢复流程
2. `sudo bash scripts/deploy.sh --phase2`
3. 跟随提示完成物理快照

## 分组架构

三层分组并列，无嵌套：

| 维度 | 自动组 (urltest, 20s) | 手动组 (selector) |
|------|----------------------|-------------------|
| 全部聚合 | 全部聚合/自动组 | 全部聚合/手动组 |
| 按机场 | 按机场/{名称}/自动组 | 按机场/{名称}/手动组 |
| 按地区 | 按地区/{名称}/自动组 | 按地区/{名称}/手动组 |

代理选择器规则：

- **自动分组选择器**（读写）：只列出所有自动组，不支持直接选节点
- **实际路由标签**（只读）：显示当前完整路径（组→节点）
- 手动组选节点后自动更新路由标签和 route.final

## 节点标签命名规范

节点 tag 格式：`{地区}-{机场}-{节点名}`（节点名来自订阅，不做预定）

示例格式说明：`香港-机场A-{节点名}`、`日本-机场B-{节点名}`

分组脚本按连字符分段解析：

- 第一段 → 地区（Region）
- 第二段 → 机场（Airport）
- 剩余 → 节点名称

## 恢复方案

详细说明参考 `recovery.sh`，三级恢复 + snapshot + last-resort：

| 级别 | 操作 | RTO |
|------|------|-----|
| level1 | 重启容器 + 恢复基本路由 | ~5 分钟 |
| level2 | 停 TUN + 清 nftables + 恢复原始 DNS | ~10 分钟 |
| level3 | 完全拆除 TUN 环境 + 停 sing-box | ~15 分钟 |
| snapshot | 从备份快照恢复网络配置 | ~10 分钟 |
| last-resort | 重建 Docker + 全量恢复 | ~30 分钟 |

## 验收标准

1. Web UI 能加载节点列表
2. 自动分组选择器默认显示：全部聚合/自动组
3. 切换自动组 → curl ipinfo.io 验证出口变化
4. 手动组选节点 → 路由标签自动更新
5. 自动组内点节点 → 弹提示"请去手动组选择"
6. 刷新页面后状态保持
7. 核心地区（香港/日本/新加坡/美国）可用节点比例 ≥ 60%
8. SSH 在 Phase 1 期间持续可用
9. Phase 2 前演练通过
10. 无需 MetaCubeXD 也能通过 mixed 端口使用 HTTP/SOCKS5 代理

## 端口分配

| 端口 | 服务 | 说明 |
|------|------|------|
| 7890 | sing-box mixed | HTTP/SOCKS5 代理入口 |
| 9090 | sing-box API | Clash API，供 MetaCubeXD 连接的后端接口 |
| 9091 | MetaCubeXD | Web UI（独立容器，映射容器 80 端口） |
| 9001 | sub-store UI | 订阅管理面板（容器 3001） |
| 9002 | sub-store API | sub-store 后端接口（容器 3000） |

MetaCubeXD 不使用 9090，因为 9090 已由 sing-box 的 Clash API 占用。MetaCubeXD 是前端 Web UI，浏览器访问 9091；它再连接 9090 读取和切换 sing-box 代理组。

## Web UI 登录与连接

### MetaCubeXD

- 后端地址：`http://192.168.100.135:9090`
- 密码/Secret：留空

当前 sing-box Clash API 未配置 `secret`，所以 MetaCubeXD 连接时不需要密码。

### sub-store

- 前端地址：`http://192.168.100.135:9001`
- 后端地址：`http://192.168.100.135:9002`

compose 已设置 `SUB_STORE_FRONTEND_BACKEND_PATH=/`，9001 前端会同源代理到后端接口。正常情况下不需要手动填写后端地址。
