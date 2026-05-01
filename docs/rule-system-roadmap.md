# WebGuard 规则系统现状审计与改造路线图

本文档记录当前仓库中规则系统的真实状态，并给出后续分阶段改造路线。本文档只描述现状和计划，不改变后端接口、前端页面或插件代码。

## 1. 当前规则系统架构

### 1.1 默认规则在哪里定义

默认规则定义在 `backend/app/services/rule_engine.py` 的 `DEFAULT_RULES` 常量中。当前默认规则包括 URL 长度、直接使用 IP、可疑子域名、高风险路径词、密码输入框、跨域表单、高风险关键词、品牌冒充、标题域名不匹配、可疑跳转提示等。

规则启动时由 `RuleEngine.__init__()` 调用 `ensure_default_rules(db)` 写入或补全 `rule_configs` 表。`ensure_default_rules()` 的行为是：

- 如果默认 `rule_key` 不存在，则新增 `RuleConfig`。
- 如果已有规则缺少 `category`、`severity`、`description`、`rule_name`，则用默认值补齐。
- 不会把数据库中的权重、阈值、启停状态强制覆盖回默认值。

这意味着当前规则系统的真实执行入口不是数据库中任意规则内容，而是 `RuleEngine.execute_rules()` 内部的硬编码 checker 映射。

### 1.2 检测流程如何调用规则

当前主链路在 `backend/app/services/detector.py`：

1. `ScanService.scan_url()` 或 `ScanService.scan_page()` 调用 `Detector`。
2. `Detector.detect_url()` / `Detector.detect_page()` 先通过 `FeatureExtractor` 生成特征。
3. `Detector._check_domain_lists()` 先检查用户站点策略、全局黑名单、全局白名单；命中时直接短路为安全或恶意。
4. 未命中名单时，`Detector._run_detection_pipeline()` 调用 `RuleEngine.execute_rules(features)`。
5. `RuleEngine.execute_rules()` 把特征整理为 `context`，再按 `rule.rule_key` 在本地 `checkers` 字典中查找对应函数。
6. 找到 checker 的规则会执行硬编码检测逻辑；找不到 checker 的规则只会返回一条“规则配置存在，但后端尚未实现对应执行逻辑”的规则详情，不会贡献分数。
7. 规则结果和 DeepSeek 语义研判结果交给 `Detector` 生成最终风险分；DeepSeek 未使用时直接采用规则引擎分。
8. 检测记录和报告通过 `ScanRecord`、`Report` 持久化。

### 1.3 规则分和 DeepSeek 分如何融合

规则分在 `RuleEngine.execute_rules()` 中计算：

- 每条规则命中且启用时，贡献 `rule.weight`。
- 禁用规则即使命中也不贡献分数。
- `rule_score_total` 是所有已应用规则贡献之和。
- `enabled_weight_total` 是所有启用规则的权重和。
- `rule_score = rule_score_total / enabled_weight_total * 100`，再限制到 0 到 100。

DeepSeek 分在 `Detector` 中按状态参与融合：

- DeepSeek 成功返回 `used` 时：`risk_score = behavior_score * 0.45 + deepseek_score * 0.55`。
- DeepSeek 未触发、未配置、超时或异常时：`risk_score = behavior_score`。
- 判定阈值：
  - `malicious`：`risk_score >= 70`，或 `rule_score >= 65 且 malicious_prob >= 0.45`，或 `malicious_prob >= 0.75`。
  - `suspicious`：`risk_score >= 40`，或 `rule_score >= 35`，或 `suspicious_prob >= 0.5`。
  - 其他为 `safe`。

当前融合权重和判定阈值是代码常量，不是可配置策略。

### 1.4 管理员规则接口有哪些

当前有两组规则相关接口。

`backend/app/api/rules.py` 提供偏检测配置视角的接口：

- `GET /api/v1/rules/stats`：返回近 7 天规则命中统计。
- `GET /api/v1/rules`：返回规则列表，并附加统计信息。
- `PUT /api/v1/rules/{rule_id}`：更新规则的 `weight`、`threshold`、`enabled`、`rule_name/name`、`description`、`severity`、`category`。

`backend/app/api/admin.py` 提供管理后台视角的接口：

- `GET /api/v1/admin/rules`：管理员规则列表。
- `POST /api/v1/admin/rules`：新增规则配置。
- `PATCH /api/v1/admin/rules/{rule_id}`：更新规则配置。
- `DELETE /api/v1/admin/rules/{rule_id}`：软删除，实际是把 `status` 置为 `disabled` 并把 `enabled` 置为 `False`。

前端 `frontend/src/pages/Rules.tsx` 通过 `frontend/src/services/adminRulesService.ts` 调用 `/api/v1/admin/rules` 系列接口，表单主要维护 `name`、`type`、`scope`、`version`、`pattern`、`content`，并支持启停和删除。

### 1.5 普通用户策略接口有哪些

当前普通用户拥有的是站点策略和插件执行策略，不是个人可执行规则。

`backend/app/api/my.py`：

- `GET /api/v1/my/domains`：读取用户域名策略。
- `POST /api/v1/my/domains`：新增用户域名策略，`list_type` 支持 `trusted`、`blocked`、`temp_bypass`。
- `PATCH /api/v1/my/domains/{item_id}`：更新用户域名策略。
- `DELETE /api/v1/my/domains/{item_id}`：禁用用户域名策略。
- `GET /api/v1/my/policy`：读取用户插件执行策略。
- `PATCH /api/v1/my/policy`：更新 `auto_detect`、`auto_block_malicious`、`notify_suspicious`、`bypass_duration_minutes`、`plugin_enabled`。

`backend/app/api/user.py` 还保留了一组兼容站点策略接口：

- `GET /api/v1/user/strategies`
- `POST /api/v1/user/trusted-sites`
- `POST /api/v1/user/blocked-sites`
- `POST /api/v1/user/site-actions/pause`
- `POST /api/v1/user/site-actions/resume`
- 删除 trusted/blocked 策略的接口

这些接口本质上都是域名信任、阻断、暂停保护策略，不能新增个人检测规则。

### 1.6 插件目前同步了哪些策略

插件通过 `GET /api/v1/plugin/bootstrap` 同步策略快照，后端由 `PolicyService.plugin_bootstrap()` 组装。当前同步内容包括：

- `user_policy`：自动检测、恶意自动阻断、可疑提醒、临时绕过时长、插件启用状态。
- `trusted_hosts` / `blocked_hosts`：用户和全局合并后的信任与阻断域名。
- `temp_bypass_records` / `temporary_trusted_domains`：临时信任记录。
- `whitelist_domains`：用户、全局、合并白名单。
- `blacklist_domains`：用户、全局、合并黑名单。
- `plugin_default_config`：插件默认 API 地址、Web 地址、自动检测、自动阻断、提醒、事件上传开关。
- `policy_version`、`config_version`、`current_rule_version`、`updated_at`、`generated_at`。

扩展侧 `extension/src/utils/api.ts` 的 `parsePluginBootstrapSnapshot()` 会把这些数据转换为 `PluginPolicySnapshot`。`extension/src/utils/storage.ts` 保存 `ruleVersion`、`policyVersion`、`configVersion`、黑白名单、临时信任和默认设置。`extension/src/background.ts` 会在远程扫描前先本地检查阻断名单、信任名单、临时信任和一次性绕过。

插件当前没有同步可执行规则内容，也没有在本地执行规则 DSL。它只保存了规则版本号，并用黑白名单做轻量预处理。

## 2. 当前规则系统存在的问题

### 2.1 管理员新增规则为什么大概率不能真正执行

管理员新增规则会写入 `rule_configs` 表，但 `RuleEngine.execute_rules()` 只根据 `rule_key` 在硬编码 `checkers` 字典里找函数。新增规则通常没有对应的 Python checker，因此会进入未实现分支：

- 规则会出现在列表中。
- 规则会出现在检测解释中。
- 规则不会匹配真实特征。
- 规则不会贡献风险分。

当前 `pattern` 和 `content` 没有被解析为可执行条件，`type` 也没有触发不同解释器或执行器。因此管理后台看起来可以新增规则，但新增规则并没有真正进入检测判定。

### 2.2 RuleConfig 字段哪些没有被充分使用

`RuleConfig` 当前字段使用情况如下：

| 字段 | 当前状态 |
|---|---|
| `rule_key` | 真正用于执行分发。只有命中硬编码 checker 的 key 才能执行。 |
| `rule_name` | 用于展示和解释。 |
| `description` | 用于展示和解释，不参与执行。 |
| `type` | 管理接口可写，返回给前端，但规则引擎不按类型选择执行器。 |
| `scope` | 管理接口可写，但检测时不按 `global/user/plugin` 过滤，也没有用户归属字段配合。 |
| `status` | 管理接口用它同步 `enabled`，但规则引擎主要看 `enabled`；其他状态语义不存在。 |
| `version` | 管理接口可写，但没有不可变发布版本、草稿版本、回滚版本；插件只拿聚合的 `rule_version` 字符串。 |
| `pattern` | 新增规则时常被当作 `rule_key` 来源或展示字段，但不参与匹配执行。 |
| `content` | 可以保存文本，但没有 DSL 解析、校验、测试或运行时解释。 |
| `category` | 用于分类展示和解释。 |
| `severity` | 用于展示、解释和统计，不直接影响判定。 |
| `weight` | 对已实现 checker 有效，命中且启用时贡献规则分。 |
| `threshold` | 对已实现 checker 有效，含义由各 checker 自行解释。 |
| `enabled` | 规则引擎真正使用，决定命中后是否计分。 |
| `created_at` / `updated_at` | 用于展示和生成聚合版本号。 |

因此，当前 `type/scope/pattern/content/version/status` 主要是配置外壳，还没有形成完整规则生命周期和执行语义。

### 2.3 普通用户为什么目前不能新增个人规则

普通用户当前只能新增域名策略，不能新增个人检测规则，原因是：

- `/api/v1/my/domains` 只支持 `trusted`、`blocked`、`temp_bypass`。
- `/api/v1/my/policy` 只支持插件行为开关和临时绕过时长。
- 兼容的 `/api/v1/user/*` 接口也只是 trusted、blocked、paused 站点策略。
- 没有用户级规则创建、更新、测试、启停接口。
- `RuleConfig.scope="user"` 虽然可由管理员接口写入，但规则适用用户集合仍需进一步收敛。
- `RuleEngine` 执行时只加载全量 `RuleConfig`，不按当前用户、插件实例或租户过滤。

所以当前“用户策略”是域名名单策略，不是个人规则系统。

### 2.4 插件为什么只同步 rule_version 和黑白名单，没有同步可执行规则内容

`PolicyService.plugin_bootstrap()` 只返回聚合版本号和名单策略，没有返回规则 AST、规则 DSL、轻量执行计划或签名后的规则包。插件侧 `PluginPolicySnapshot` 也没有字段用于保存可执行规则内容。

当前设计符合“插件保持轻量、后端是可信判定中心”的原则，但带来两个限制：

- 插件无法离线执行新增规则，只能依赖后端扫描。
- `ruleVersion` 只能提示后端规则集变化，不能让插件知道变化内容。

在没有规则 DSL、安全沙箱、规则包签名、兼容版本控制和执行限额之前，不应该把后端 Python 规则逻辑直接搬到插件。

### 2.5 规则发布机制为什么不完整

当前 `PolicyService.rule_version()` 通过规则总数和最大 `updated_at` 拼出类似 `rules-{total}-{timestamp}` 的字符串。这只能表示“规则配置表有变化”，不能表示一次完整发布。

缺失能力包括：

- 草稿、审核、发布、废弃、回滚状态。
- 不可变的发布版本记录。
- 发布版本与规则明细快照的绑定。
- 发布前测试和影响评估。
- 插件可消费的规则包内容。
- 版本兼容范围，例如后端版本、插件版本、DSL 版本。
- 发布审计记录和发布人信息。
- 灰度发布、按用户或插件实例分批发布。

因此当前规则发布更接近“配置更新时间戳”，不是生产级发布机制。

## 3. 后续改造路线

### 阶段 1：实现安全规则 DSL，让新增规则真正参与检测

修改范围：

- 定义后端可解释的安全 DSL，只覆盖有限能力：字符串包含、正则白名单、数值比较、布尔特征判断、列表命中计数。
- 为 `RuleConfig.content` 或结构化 JSON 字段建立 DSL schema。
- 在后端实现 DSL 解析、校验、编译和执行。
- 让管理员新增的规则在校验通过后能进入 `RuleEngine.execute_rules()`。
- 保留现有默认硬编码规则，逐步迁移，不一次性删除。

涉及文件：

- `backend/app/services/rule_engine.py`
- `backend/app/services/admin_rule_service.py`
- `backend/app/models/rule_config.py`
- `backend/app/schemas/rule.py`
- `backend/app/api/admin.py`
- `backend/app/api/rules.py`
- `backend/app/services/detector.py`
- `docs/api-contract.md`
- Alembic migration files
- 后端规则引擎测试文件

验收标准：

- 管理员新增一条 DSL 规则后，检测结果中能看到该规则真实匹配或未匹配。
- 命中 DSL 规则会按 `weight` 贡献规则分。
- DSL 规则校验失败时不能保存为可执行状态，并返回明确错误。
- 未知字段、危险表达式、无限循环、动态代码执行均被拒绝。
- 现有默认规则行为保持兼容。
- 后端测试覆盖 DSL 校验、执行、错误处理、规则分计算。

风险点：

- DSL 过宽会引入代码执行风险。
- 正则表达式可能造成 ReDoS。
- 规则内容和特征字段命名不稳定会导致规则不可维护。
- 新旧规则并行时，解释字段可能不一致。

不应该做什么：

- 不要允许管理员直接写 Python、JavaScript 或 SQL。
- 不要把前端传入的 `content` 当代码执行。
- 不要一次性重写整个检测管线。
- 不要让插件先执行未签名、未限权的规则内容。

### 阶段 2：完善管理员规则编辑、测试、启停、权重阈值配置

修改范围：

- 管理后台区分规则草稿和启用规则。
- 增加规则测试接口，可输入 URL 或页面特征样本，返回命中详情和分数影响。
- 完善权重、阈值、严重级别、分类的校验和说明。
- 明确 `status` 状态机，例如 `draft`、`active`、`disabled`、`archived`。
- 保证 `status` 和 `enabled` 语义收敛，避免双字段冲突。
- 增加规则编辑审计记录。

涉及文件：

- `frontend/src/pages/Rules.tsx`
- `frontend/src/services/adminRulesService.ts`
- `frontend/src/types/index.ts`
- `backend/app/api/admin.py`
- `backend/app/services/admin_rule_service.py`
- `backend/app/schemas/rule.py`
- `backend/app/services/rule_engine.py`
- `backend/app/models/rule_config.py`
- `docs/api-contract.md`
- `docs/rule-system-roadmap.md`
- Alembic migration files

验收标准：

- 管理员能创建草稿规则并测试，不影响线上检测。
- 只有发布或启用后的规则参与检测。
- 启停操作在检测结果中立即生效，且规则解释显示启停状态。
- 权重和阈值配置错误会被后端拒绝。
- 前端不需要理解规则执行细节，只展示后端返回的校验和测试结果。

风险点：

- 管理页面可能误导用户认为草稿已经生效。
- 启停和发布状态混用会造成线上行为不可预测。
- 权重配置过大可能导致规则分过高，降低 DeepSeek 语义研判的增量价值。

不应该做什么：

- 不要只做前端表单，不做后端校验。
- 不要让前端自行计算最终风险分作为权威结果。
- 不要在 route handler 中塞入规则执行测试逻辑。
- 不要把删除做成物理删除，至少发布前应保留审计和回滚信息。

### 阶段 3：增加普通用户个人规则

修改范围：

- 区分普通用户“域名名单策略”和“个人检测规则”。
- 为个人规则增加归属字段，例如 `owner_type`、`owner_user_id`，或单独建表。
- 增加用户级规则 CRUD、测试、启停接口。
- `RuleEngine` 执行时按当前用户加载全局规则和个人规则，并处理优先级。
- 明确个人规则不能削弱平台安全底线，例如不能覆盖全局恶意阻断。

涉及文件：

- `backend/app/api/my.py`
- `backend/app/services/policy_service.py`
- `backend/app/services/rule_engine.py`
- `backend/app/services/detector.py`
- `backend/app/models/rule_config.py` 或新增用户规则模型
- `backend/app/schemas/rule.py`
- `frontend/src/pages/*` 中用户策略页面
- `frontend/src/services/*` 中用户规则服务
- `docs/api-contract.md`
- Alembic migration files

验收标准：

- 普通用户可以新增、测试、启停自己的个人规则。
- 用户 A 的个人规则不会影响用户 B。
- 检测记录能标明命中的是全局规则还是个人规则。
- 个人规则不能绕过全局黑名单和强制阻断策略。
- 插件和 Web 发起的同一用户检测能应用同一套个人规则。

风险点：

- 用户自定义规则可能产生大量误报。
- 用户规则数量过多会影响检测性能。
- 个人规则和全局规则冲突时，如果优先级不清楚，会导致解释混乱。

不应该做什么：

- 不要把普通用户规则混进全局规则而没有归属信息。
- 不要允许用户禁用平台强制规则。
- 不要把个人规则只存在浏览器本地。
- 不要复用管理员接口绕过用户权限边界。

### 阶段 4：增加规则发布版本

修改范围：

- 增加规则版本模型，例如 `rule_releases` 和 `rule_release_items`。
- 建立草稿规则集、发布规则集、历史规则集的边界。
- 生成不可变发布快照，记录发布人、发布时间、DSL 版本、兼容插件版本、规则列表 hash。
- `PolicyService.rule_version()` 改为读取当前已发布版本。
- 检测时默认使用当前发布版本，可支持回放历史检测时使用历史版本。

涉及文件：

- `backend/app/models/rule_config.py` 或新增发布模型文件
- `backend/app/services/admin_rule_service.py`
- `backend/app/services/rule_engine.py`
- `backend/app/services/policy_service.py`
- `backend/app/api/admin.py`
- `backend/app/api/rules.py`
- `backend/app/schemas/rule.py`
- `frontend/src/pages/Rules.tsx`
- `frontend/src/services/adminRulesService.ts`
- `docs/api-contract.md`
- Alembic migration files

验收标准：

- 管理员可以从草稿生成发布版本。
- 发布版本不可变，后续编辑会进入新的草稿或新版本。
- 插件 bootstrap 返回真实发布版本号。
- 检测记录保存规则发布版本，便于审计和复盘。
- 可以回滚到上一个发布版本。

风险点：

- 发布快照和当前配置混用会导致检测不可复现。
- 回滚如果不处理缓存，会出现插件和后端版本短暂不一致。
- 规则发布会影响线上风险判断，需要审计和权限控制。

不应该做什么：

- 不要继续用 `count + max(updated_at)` 代替发布版本。
- 不要让修改数据库行等同于发布。
- 不要在没有测试结果的情况下自动发布。
- 不要让插件只靠时间戳判断规则兼容性。

### 阶段 5：插件同步并执行轻量规则

修改范围：

- 只同步适合插件执行的轻量规则子集，例如 URL、host、path、简单关键词规则。
- 后端生成签名或 hash 校验的规则包。
- 插件保存规则包版本、内容、过期时间和兼容 DSL 版本。
- 插件本地执行轻量规则只作为预警、预阻断或减少请求的优化，最终权威仍以后端为准。
- 插件在规则包缺失、过期、解析失败时安全降级为后端扫描。

涉及文件：

- `backend/app/services/policy_service.py`
- `backend/app/api/plugin.py`
- `backend/app/schemas/plugin.py`
- `backend/app/services/rule_engine.py`
- `extension/src/utils/api.ts`
- `extension/src/utils/storage.ts`
- `extension/src/background.ts`
- 插件本地规则执行工具文件
- `docs/api-contract.md`
- `docs/extension-release-checklist.md`

验收标准：

- 插件 bootstrap 能获取当前轻量规则包。
- 插件能在本地执行允许的轻量规则，并产生可解释命中结果。
- 插件本地规则命中恶意时仍能上传事件，且后端可复核。
- 规则包版本变化后插件能刷新缓存。
- 插件离线或规则包失效时不崩溃、不无限重试。

风险点：

- 插件执行规则可能被误认为最终权威。
- 规则包过大影响插件性能和审核。
- DSL 在后端和插件双实现可能出现语义漂移。
- 本地规则内容如果没有签名和版本约束，容易被篡改或误用。

不应该做什么：

- 不要把完整后端规则引擎搬进插件。
- 不要同步包含敏感内部策略或 DeepSeek 提示词细节的规则。
- 不要让插件本地安全判定覆盖后端强制策略。
- 不要在没有缓存过期和兼容检查的情况下长期使用旧规则包。

### 阶段 6：增加审计、命中统计、误报反馈闭环

修改范围：

- 扩展规则命中统计，按规则版本、规则来源、用户、插件实例、风险标签聚合。
- 将反馈案件与规则命中、发布版本、检测记录关联。
- 建立误报、漏报处理流程，支持管理员标记原因、调整规则、发布修复版本。
- 增加规则质量指标，例如命中率、误报率、恶意确认率、最近命中时间。
- 对规则创建、编辑、测试、发布、回滚、启停做审计。

涉及文件：

- `backend/app/services/rule_engine.py`
- `backend/app/services/report_service.py`
- `backend/app/services/feedback_service.py`
- `backend/app/services/plugin_event_service.py`
- `backend/app/api/admin.py`
- `backend/app/api/rules.py`
- `backend/app/api/plugin.py`
- `backend/app/models/*` 中反馈、事件、规则、审计相关模型
- `frontend/src/pages/Rules.tsx`
- `frontend/src/pages/Stats.tsx`
- `frontend/src/services/*`
- `docs/operations.md`
- `docs/production-runbook.md`

验收标准：

- 每条检测记录能追溯命中的规则、规则版本、DeepSeek 使用状态和最终融合结果。
- 管理员能看到规则近 7 天或更长周期的命中与误报趋势。
- 用户或插件提交误报反馈后，管理员能定位相关规则。
- 规则调整和发布能关联到反馈关闭结果。
- 审计日志能回答谁在什么时候改了什么规则、为什么发布、影响哪些版本。

风险点：

- 统计口径不稳定会误导规则调优。
- 反馈数据可能包含 URL 和页面信息，需要隐私控制。
- 过度依赖命中率可能导致规则只追求数量而非质量。
- 审计数据量增长需要归档策略。

不应该做什么：

- 不要只统计总命中数而不区分误报和确认恶意。
- 不要在日志中保存完整访问令牌、密码或敏感页面内容。
- 不要把反馈关闭当成自动改规则。
- 不要让统计查询拖慢在线检测链路。

## 4. 总结

当前 WebGuard 规则系统已经有规则配置表、默认规则、规则分解释、管理员规则页面、规则统计、插件策略同步和用户域名策略闭环，但它仍然是“硬编码规则引擎 + 配置外壳”的阶段。

下一步最关键的不是继续扩展表单字段，而是先定义安全 DSL 和执行边界，让新增规则在受控、安全、可测试的前提下真正参与检测。随后再补齐管理员生命周期、用户个人规则、发布版本、插件轻量执行和反馈审计闭环。
