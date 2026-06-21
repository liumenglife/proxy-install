# TUN 透明代理方案分析报告

## 1. 后端方案对比

### 候选方案：sing-box / Xray-core / Mihomo

**协议支持（最关键的差异）：**

- sing-box 支持 SS / VMess / VLESS / Trojan / Hysteria2 / anytls / TUIC / WireGuard —— 全部八种，全角色
- Xray-core 缺少：Hysteria2、TUIC、anytls
- Mihomo 缺少：anytls

**架构与活跃度：**

- sing-box：从零用 Go 重写，2025-2026 最活跃的代理内核
- Xray-core：从 V2Ray fork 而来，协议创新多但缺少 QUIC 系协议
- Mihomo：从 Clash fork，规则生态最成熟，但核心代码历史包袱重

**TUN 透明代理能力：**

- sing-box：原生 TUN 入站 + auto_route 自动路由 + auto_redirect（nftables 优化）
- Xray-core：需配合 iptables TPROXY 手动配置
- Mihomo：支持 TUN，但 Docker 下兼容性不如 sing-box

**Docker 生态：**

- sing-box：官方提供 Dockerfile，文档有 Docker 章节
- Xray-core：社区 Docker 镜像多
- Mihomo：MetaCubeX 维护官方 Docker 镜像

**结论：sing-box 胜出。** 只有它同时满足：
1. 协议全覆盖（但注意：协议覆盖 ≠ 机场兼容。机场实现差异、配置参数、订阅转换问题都可能影响实际可用性）
2. 原生 TUN 模式
3. auto_redirect 解决 Docker bridge 冲突
4. 2026 年仍在高速迭代

---

## 2. Web UI 方案对比

### 候选方案：MetaCubeXD / Zashboard / Yacd-meta

**MetaCubeXD（推荐首选）：**
- GitHub 3.8k stars，Mihomo 官方 Dashboard
- 功能完整：实时流量 / 节点选择 / 连接管理 / 规则查看 / 日志流式
- Docker 官方支持：ghcr.io/metacubex/metacubexd
- 支持 sing-box 的 Clash API
- 开发最活跃，更新最频繁

**Zashboard（推荐备选）：**
- GitHub 2.9k stars
- 功能与 MetaCubeXD 相当
- 独有：PWA 支持（可添加到手机主屏当原生应用）
- 右键测速节点组
- Docker 支持：ghcr.io/zephyruso/zashboard

**Yacd-meta（不推荐新部署）：**
- 经典但功能偏基础
- 维护节奏慢
- 无官方 Docker 镜像

**结论：MetaCubeXD 首选 + Zashboard 备选。** 两个都通过独立 Docker 容器部署，与 sing-box 解耦。

---

## 3. Docker TUN 部署方案

### 核心警示：Docker 不是隔离，是在容器中操作宿主机网络栈

```
容器参数:
  network_mode: host     → 共享宿主机网络命名空间
  cap_add: NET_ADMIN     → 允许修改路由表
  devices: /dev/net/tun  → 允许创建 TUN 虚拟网卡
```

这三个参数加起来的效果：**sing-box 虽然在 Docker 容器里运行，但它有权限操作宿主机的路由表、nftables 规则和网络接口。**

与直接在本机安装的区别：
- 优点：容器化便于管理（启动/停止/更新），不污染宿主机文件系统
- 缺点：一旦 auto_route 改了路由表，效果和直接安装一样——SSH 照样会断
- 所以：**不要认为"Docker = 安全"，安全来自于配置正确，而非部署形式**

### 架构总览

宿主机（Ubuntu 22.04）运行两个容器：
- sing-box 容器：network=host 模式，创建 TUN 网卡接管流量，暴露 Clash API 在 9090 端口
- metacubexd 容器：映射 80 端口，连接 sing-box 的 9090 API，供局域网浏览器访问

### Docker 运行关键要求

sing-box 容器：
- 必须 --network host（共享宿主机网络栈，否则 TUN 无法接管宿主机流量）
- 必须 --cap-add NET_ADMIN（创建 TUN 网卡、修改路由表需要）
- 必须 --device /dev/net/tun（挂载 TUN 设备文件）
- 必须 auto_redirect: true（防 Docker bridge 冲突 + 防流量回环）
- 必须 route.auto_detect_interface: true（自动识别物理网卡）

### SSH 保护措施与局限性

**为什么不能100%保证 SSH 不被吃？**

理由一：机场节点 IP 会变（排除规则绑的是 IP，机场换 IP 后规则失效）
理由二：CDN 回源 IP 变化（Cloudflare 等 CDN 的 IP 会动态调整）
理由三：配置写错（字段 typo，route_exclude_address_set 拼错，SSH 直接断）

**三道防护（按强度排序）：**

第一道：正确配置排除规则
- route_exclude_address_set 排除局域网网段（192.168.0.0/16）
- 路由规则 SSH 端口（22）直连 direct 出站
- bind_interface 强制 sing-box 自身流量走物理网卡
- 不依赖节点 IP 排除（机场 CDN 动态 IP 变化太快，维护成本高且不可靠）

第二道：恢复脚本复原（三级恢复 + 最后手段）
recovery.sh 具备三级恢复能力，覆盖从 SSH 中断到系统完全回滚的所有场景：

| 级别 | 目标 | 恢复内容 | 验收标准 |
|------|------|----------|----------|
| 一级 | 恢复 SSH | 删 TUN / 删路由 / 清 nftables / 恢复网关 / 恢复 DNS | SSH 可连, curl 百度成功 |
| 二级 | 回退 mixed | 一级 + 回滚 config.json + 重启容器 mixed 模式 | MetaCubeXD + API + 代理正常 |
| 三级 | 系统还原 | 二级 + 导入备份快照 / 恢复 resolv.conf / nftables / 路由 / 清 Docker | 网络状态与部署前一致 |
| 最后手段 | 重启恢复 | 禁用容器自启 → 停止容器 → 恢复路由 → 重启系统 | 重启后系统正常，sing-box 不自启 |
- 部署前运行 scripts/backup-network-state.sh（保存网关/网卡/DNS/nftables/路由表/当前配置）
- recovery.sh 放置于 /home/lm/soft-install/proxy-install/recovery.sh
- 可通 IPMI/物理控制台执行 sudo bash recovery.sh 一键恢复
- **最后手段用法**：`sudo bash recovery.sh --last-resort`，适用于三级恢复全部失败的情况

第三道：开 TUN 前强制演练
- 在第二阶段部署 TUN 之前，必须先做一次灾难演练
- 演练流程：人工删除默认路由（模拟 TUN 故障）→ 执行 recovery.sh --level1 → 验证 SSH + 网络恢复
- **演练不通过，不允许进入 TUN 阶段**

第四道：分阶段上线（最重要的一道）
- 第一阶段不开 TUN，只用 mixed 端口模式——完全不碰路由表
- 确认所有功能正常后，第二阶段再加 TUN
- 详见下文"强制分阶段上线策略"

---

## 4. 前后端同步问题分析（你的核心痛点）

### 诊断：手动节点选择不生效的根因

**原因一：出站类型配置错误**
- 手动节点选择依赖 Selector 类型出站
- 如果你忘记在 outbounds 中给节点设置 tag，Web UI 虽能显示但无法选中
- Selector 的 outbounds 数组必须包含目标节点的 tag

**原因二：路由 final 指向了 auto 组而非 select 组**
- 这是最隐蔽的问题：Web UI 上看起来选了节点，但路由规则根本不走 select 组
- 路由的 final 字段决定了"不匹配任何规则的流量走哪个出站组"
- 如果 final 指向 urltest（auto）组，那你在 UI 上手动选的节点根本没被路由到

**原因三：store_selected 未开启**
- sing-box v1.8 之前的版本 store_selected 默认关闭
- 这意味着：Web UI 中选中的节点仅保存在内存中，重启 sing-box 后丢失
- v1.8+ 只要 cache_file.enabled: true，store_selected 默认开启

**原因四：Web UI 连接的不是同一个后端**
- 之前的 sing-box + Yacd 架构中，Yacd 可能连到了不同的 sing-box 实例
- 或者 Yacd 配置的 API 地址/端口与 sing-box 实际暴露的不一致

### 正确配置示例

experimental 部分：
- cache_file.enabled: true —— 开启持久化（store_selected 自动生效）
- clash_api.external_controller: "0.0.0.0:9090" —— 监听所有接口
- clash_api.access_control_allow_private_network: true —— 允许局域网访问
- clash_api.external_ui: "metacubexd" —— 指定前端面板

outbounds 部分（关键）：
- 用一个 Selector 类型出站（tag: "select"）作为用户手动选择的入口
- 在 select 的 outbounds 数组中包含各节点 tag 和 auto 组 tag
- 把 urltest 类型出站作为 select 的一个子选项，而不是路由的 final

route 部分：
- route.final 必须指向 "select"（即 Selector 出站的 tag）
- 只有这样，Web UI 上手动的节点选择才会实际生效

---

## 5. 协议支持详细清单

### 重要提示：协议支持 ≠ 机场兼容

sing-box 协议全不代表所有机场都能用。机场实现差异：
- 同样的 VLESS + WS + TLS，机场 A 能用、机场 B 不能
- 订阅链接返回的节点参数（path、host、encryption 等）各机场不同
- 订阅转换环节（机场订阅 → sing-box 配置）可能引入问题

所以协议支持清单只说明"sing-box 能理解这个协议"，不保证"所有此协议的机场都能用"。

### 支持细节

sing-box 对八种协议的支持，按版本分类：

**v1.0 起就支持（稳定成熟）：**
- Shadowsocks（含 2022 版）
- VMess
- VLESS（含 Reality）
- Trojan
- Hysteria2（QUIC 系）
- TUIC（QUIC 系）
- WireGuard（出站）

**v1.12.0+ 新增：**
- anytls（最新 TLS 填充协议，抗检测）

**其他内置支持：**
- ShadowTLS（TLS 伪装）
- SOCKS/HTTP（传统代理）
- SSH/Tor（出站）
- NaiveProxy（入站）

**新协议扩展性：**
sing-box 的模块化架构是 adapter 模式，添加新协议只需新增 adapter 文件，不动核心。历史记录显示，任何新协议（Hysteria2 → TUIC → anytls）总是 sing-box 最先支持。未来有新增协议时，sing-box 也是首个支持的平台。

---

## 6. 强制分阶段上线策略（最高优先级的防灾措施）

这是整个方案中最重要的部分，绝不可以跳过。

### 决策门：本方案的真正目标是最大化机场兼容性，而非协议覆盖率

整个方案的隐含优先级是：
1. **机场兼容率 > 协议覆盖率**（压倒性优先）
2. 90% 以上的机场节点在 sing-box 上正常工作
3. 如果 sing-box 不行，允许换后端

下面的第一阶段结束时有一个硬性决策门。

---

### 第一阶段：mixed 端口模式（第 1-3 天）

目标：完全不动路由表，验证所有核心功能

配置：
- 只开 mixed 入站（SOCKS5 + HTTP 代理，7890 端口）
- 不开 TUN，不开 auto_route
- Clash API + MetaCubeXD 正常开启

验证清单（每项都必须确认通过才能进入下一阶段）：

**一、路由与配置验证**
- Selector 组配置正确，route.final 指向 select 而非 urltest
- cache_file 持久化生效，重启容器后手动选择仍保留

**二、route.final = select 的实际生效验证（这是最重要的验证）**
```
在 MetaCubeXD 切换到"香港"节点:
  curl ipinfo.io   → 确认 IP 在香港
在 MetaCubeXD 切换到"日本"节点:
  curl ipinfo.io   → 确认 IP 在日本
在 MetaCubeXD 切换到"美国"节点:
  curl ipinfo.io   → 确认 IP 在美国
```
如果切换节点后出口 IP 没变 → route.final 没有指向 select，配置有误

**三、多协议验证**
- 所有的协议节点至少有一个能正常工作

**四、网络工具验证**
```
curl -x socks5://127.0.0.1:7890 https://www.google.com   → 200 OK
curl ip.sb                                                      → 出口 IP
curl ipinfo.io                                                  → 位置信息
dig @8.8.8.8 google.com                                         → DNS 解析正常
ping -c 3 8.8.8.8                                               → 延迟正常
```

**五、订阅管理**
- 多机场订阅能正常导入和更新
- MetaCubeXD 能正确显示节点列表

关于节点可用性的重要说明：
- 第一次导入订阅后，总有一些节点显示不可用——这很正常
- GWF 封锁严重，节点可能只是"当前时刻"被干扰，下午/晚上/第二天可能恢复
- 订阅转换和 urltest 自动测速的"不可用"结论是暂时的，不要据此删除节点
- 方案中不会设置"连续失败 N 次自动移除"之类的规则
- 不可用节点保留在 outbounds 列表中，方便你在 MetaCubeXD 上随时手动重试

SSH 状态：完全不受影响（没有改任何路由）

**第一阶段结束后触发的决策门：**

```
统计可用节点数 / 总节点数 >= 90% ？
  → 是：继续使用 sing-box，进入第二阶段
  → 否：召开设计评审，评估切换后端为 Mihomo
```

Mihomo 虽缺少 anytls 协议，但机场兼容性在某些场景下高于 sing-box。
切换后协议覆盖减少，但机场可用性可能提升。

这个决策门确保不会过早锁死 sing-box。

### 第二阶段：TUN 透明代理（第 4 天起）

目标：接管宿主机全部流量

先决条件（每项必须满足）：
- [ ] 第一阶段所有验证项通过
- [ ] 演练模式通过：sudo bash recovery.sh --drill → 输出 PASS
- [ ] 执行快照备份：sudo bash recovery.sh --snapshot
- [ ] recovery.sh 已验证可执行

流程：
1. 执行 sudo bash recovery.sh --snapshot（此刻起有一份完整快照）
2. 应用 TUN 配置（覆盖 config.json）
3. 重启 Docker 容器
4. 验证 TUN 功能

配置变化：
- 在 inbounds 中新增 TUN 入站
- 开启 auto_route + auto_redirect
- 保留 mixed 入站作为备用入口
- route_exclude_address_set 排除局域网（192.168.0.0/16，含你宿主机 192.168.100.135）
- 路由规则 SSH 22 端口直连
- 不依赖节点 IP 排除（机场 CDN 动态 IP 变化太快，维护成本高且不可靠）

验证：
- 先小范围确认（curl 验证出口 IP 与 MetaCubeXD 显示一致）
- 确认 SSH 不断连
- 全部正常后再投入正式使用

SSH 风险：已降低到最低，但理论上仍存在（机场换 IP、配置 typo）
恢复手段（按顺序尝试）：
1. recovery.sh --level1（网络恢复）
2. recovery.sh --level2（回退 mixed 模式）
3. recovery.sh --level3（从快照完全还原）
4. recovery.sh --last-resort（禁用容器自启 + 重启——最后手段）

---

## 7. 最终推荐方案

### 推荐组合

后端：sing-box（最新稳定版，当前 v1.13+）
前端：MetaCubeXD（ghcr.io/metacubex/metacubexd）
部署：双容器 Docker，sing-box 用 network=host
上线方式：强制分两阶段（先 mixed 后 TUN）
前置条件：先执行 backup-network-state.sh + 确认 recovery.sh 可用

### 核心设计要点（优先级排序）

第一优先：配置架构（解决你之前的问题）
- Selector 出站 + route.final = select（手动选择才能生效）
- cache_file.enabled = true（选择持久化，重启不丢失）
- MetaCubeXD 独立容器部署，不依赖 sing-box 内置服务

第二优先：安全防护（防止再弄坏 SSH）
- 分阶段上线（关键中的关键）
- auto_redirect + auto_detect_interface + bind_interface
- 恢复脚本前置（部署前先备份，出事一键恢复）

第三优先：协议兼容（not 协议覆盖 = 机场兼容）
- sing-box 协议全不代表所有机场都能用
- 订阅转换方案需要单独评估（Sub-Store / sing-box-subscribe）
- 机场实现差异可能导致配置参数需要微调

### 与之前方案的关键差异

你之前的方案：sing-box + Yacd（本机直接安装 + TUN）
- 路由 final 指向 urltest → 手动选择不生效
- 无排除规则 → SSH 被吃
- 无恢复手段 → 重装系统

本方案的关键改进：
- route.final = select → 手动选择生效
- 分阶段上线 → 即使 TUN 翻车，SSH 还在
- 前置备份 + recovery.sh → 不用重装系统
- MetaCubeXD（独立容器）→ UI 不与后端状态耦合

### 下一步

如果确认此方案，将进入实施计划阶段，内容包括：
- Docker Compose 编排文件
- 第一阶段 sing-box 配置模板（mixed 模式）
- 第二阶段 TUN 增量配置
- 订阅转换方案
- 一键部署脚本
- 恢复流程文档
