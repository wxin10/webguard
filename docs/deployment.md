# WebGuard 部署架构参考

本文是 WebGuard 的部署架构参考，不是完整生产上线操作手册。强制检查项以 `docs/deployment-checklist.md` 为准；实际运行、排障和恢复以 `docs/production-runbook.md` 为准。当前项目已有生产配置草案、部署 checklist 和 runbook，但尚未完成真实生产部署。

## 部署拓扑

### 本地开发 / 答辩演示

```text
┌─────────────────┐     ┌─────────────────┐
│ 浏览器插件       │     │ Web 前端         │
└────────┬────────┘     └────────┬────────┘
         │                       │
         │                       │
┌────────┴───────────────────────┴────────┐
│ FastAPI 后端：检测、策略、报告、鉴权、持久化 │
└──────────────────┬─────────────────────┘
                   │
           ┌───────┴───────┐
           │ PostgreSQL     │
           └───────────────┘
```

本地环境中，Web 平台是主产品入口，浏览器插件是轻量辅助执行端，FastAPI 后端是可信边界。

### 生产目标架构

```text
┌─────────────────┐
│ 负载均衡器       │
└────────┬────────┘
         │
┌────────┴────────┐     ┌─────────────────┐
│ HTTPS 反向代理   │<───>│ FastAPI 服务集群 │
└────────┬────────┘     └────────┬────────┘
         │                       │
┌────────┴────────┐      ┌───────┴────────┐
│ Web 静态资源     │      │ PostgreSQL      │
└─────────────────┘      └────────────────┘
```

生产目标中，浏览器插件通过正式发布后的 extension origin 与后端通信，Web 静态资源和 API 均应走 HTTPS。CORS、extension ID、secret 注入、证书、反向代理和备份策略需要在真实环境中落地。

## PostgreSQL 参数建议

以下参数仅作为中小规模部署的起点，不能替代真实压测和数据库运维评估：

```conf
# postgresql.conf
max_connections = 100
shared_buffers = 256MB
effective_cache_size = 768MB
work_mem = 4MB
maintenance_work_mem = 64MB
min_wal_size = 80MB
max_wal_size = 1GB
checkpoint_completion_target = 0.9
random_page_cost = 4
effective_io_concurrency = 200
```

建议关注：

- 连接数、慢查询和锁等待。
- 表和索引膨胀。
- 存储空间、水位线和 WAL 增长。
- Alembic migration 前后的备份和回滚窗口。

## HTTPS / Reverse Proxy 架构建议

生产部署应满足：

- Web 前端通过 HTTPS 访问。
- 后端 API 通过 HTTPS 暴露，或位于可信 HTTPS 反向代理之后。
- 反向代理正确传递 host、scheme、client IP 和 request id。
- `REFRESH_TOKEN_COOKIE_SECURE=true` 只在 HTTPS 环境启用。
- CORS 使用精确 allowlist，包括 Web origin 和正式 extension origin。
- 反向代理层实现合理的请求体大小限制、超时、限流和健康检查。

常见职责划分：

- 静态资源：由 Web 静态托管或反向代理提供。
- API 代理：由反向代理转发到 FastAPI 服务。
- 后端：负责检测、策略、报告、鉴权、插件绑定、DeepSeek 配置和持久化。
- 数据库：PostgreSQL 作为目标运行数据库，Schema 演进使用 Alembic。

## 备份与灾备概要

建议至少覆盖：

- PostgreSQL 定期全量备份。
- WAL 或增量备份，满足目标恢复点。
- DeepSeek / 火山方舟配置和密钥轮换记录的安全备份。
- 环境配置、反向代理配置和发布包版本记录。
- 关键升级前的手动备份点。

灾备策略应包含：

- 异地备份保存。
- 备份恢复演练。
- 数据库故障切换方案。
- 应用版本回滚方案。
- Alembic migration 失败时的恢复步骤。

## 和其他部署文档的关系

- `docs/deployment-checklist.md`：发布前必须逐项检查的强制项。
- `docs/production-runbook.md`：本地/准生产运行、排障和恢复流程。
- `docs/extension-release-checklist.md`：浏览器插件发布、权限、隐私和商店材料检查。

本文只保留架构参考和运维设计建议，不声明 WebGuard 已完成真实生产上线或浏览器商店发布。
