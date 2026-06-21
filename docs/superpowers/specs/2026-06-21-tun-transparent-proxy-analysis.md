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
1. 协议全覆盖
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

### 安全配置详解

**为什么之前会弄坏 SSH？**
- 你之前的方案：直接在本机安装 sing-box，auto_route 修改了默认路由
- 默认路由指向 TUN → 所有出站流量进 TUN → SSH 响应包出不去 → 连接断开
- 且没有排除规则保护 SSH 端口和代理节点 IP

**正确防护措施（缺一不可）：**
- 措施一：auto_redirect: true —— 使用 nftables 做流量标记而非直接改默认路由
- 措施二：auto_detect_interface: true —— 自动识别物理出口网卡
- 措施三：route_exclude_address_set —— 将宿主机 SSH 端口、代理节点 IP、局域网网段排除在 TUN 之外
- 措施四：路由规则中 SSH 流量走 direct —— rule_set 匹配 SSH 端口时直接放行
- 措施五：bind_interface —— 强制 sing-box 自身连接走物理网卡而非 TUN

**兜底方案：**
- 配置 crontab 每 5 分钟检测 sing-box 是否异常，异常则重启并恢复直连
- 如果宿主机有 IPMI/BMC/iDRAC，作为备用管理通道
- 首次部署先用 mixed 端口模式验证配置，再切换 TUN 模式

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

## 6. 最终推荐方案

### 推荐组合

后端：sing-box（最新稳定版，当前 v1.13+）
前端：MetaCubeXD（ghcr.io/metacubex/metacubexd）
部署：双容器 Docker，sing-box 用 network=host

### 理由总结

- 协议全覆盖：唯一支持全部八种协议的后端
- Docker TUN 最成熟：auto_redirect 原生解决桥接冲突
- 前后端同步已解决：cache_file 持久化确保选择不丢失
- 手动选择保证生效：Selector + final 指向正确的双保险
- 架构安全隔离：容器内运行，不修改宿主机系统文件
- Web UI 独立部署：MetaCubeXD 作为独立容器，与 sing-box 解耦

### 下一步

如果确认此方案，将进入规格设计阶段，内容包括：
- Docker Compose 编排文件
- sing-box 完整配置模板（TUN + DNS + 路由 + 出站 + 订阅）
- 订阅转换方案（Sub-Store 或 sing-box-subscribe）
- 安全防护规则（SSH 排除 / 节点 IP 排除 / crontab 兜底）
- 容器网络和防火墙规划
