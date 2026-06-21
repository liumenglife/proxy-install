# 术语表

| 术语 | 含义 |
|------|------|
| mixed 模式 | sing-box 的 HTTP + SOCKS5 代理模式，不修改路由表 |
| TUN 模式 | 通过虚拟网卡 tun0 拦截所有流量，实现透明代理 |
| urltest | sing-box 出站类型，自动测速选择延迟最低节点 |
| selector | sing-box 出站类型，手动选择节点 |
| outbound | sing-box 中的出站连接定义 |
| inbound | sing-box 中的入站连接定义 |
| route.final | 出站路由策略，当没有规则匹配时的默认出口 |
| 自动分组选择器 | MetaCubeXD 中用于选择自动组的下拉框（读写） |
| 实际路由标签 | MetaCubeXD 中显示当前完整路径的标签（只读） |
| 全部聚合 | 第一层分组，包含所有节点 |
| 按机场 | 第二层分组，按订阅来源分类 |
| 按地区 | 第三层分组，按节点地理位置分类 |
| sub-store | 订阅管理工具，转换节点格式 |
| MetaCubeXD | sing-box Web UI 面板（独立容器） |
| 物理快照 | 虚拟机级别整机快照，最后一道防线 |
| recovery.sh | 三级灾难恢复脚本 |
| backrun.out | 后台日志输出文件，由 Docker 映射或脚本生成 |
