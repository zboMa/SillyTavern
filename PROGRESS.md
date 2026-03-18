# 前端重写进度（Vue 3 / Vite）

本项目当前策略：**仅重写前端为 Vue 3**，后端沿用现有 Node/Express 端点；**目标是与原版前端功能完全对齐，不做简化版**，并采用 **Vue3-native 的插件/扩展架构**。执行方式：**按模块逐个对齐**（先把一个模块做到原版级，再进入下一个）。

## 已完成（已落地到代码库）

### 基础架构（Core）

- **工程结构**：`app/web`（Vue 3 + Vite + TS），pnpm workspace 脚本已配置
- **事件与基础能力**
  - `EventBus`（typed events）
  - `ApiClient`：`getJson` / `postJson` / `postSse`，包含 CSRF token 处理与 SSE 流解析

### 插件系统（Vue3-native）

- **Plugin Manager / Capabilities / UI Slots**：`app/web/src/plugins/*`
- **能力注册**：commands/settings/storage/capability registry
- **内置插件注册入口**：`app/web/src/plugins/registerBuiltins.ts`

### 核心能力（Capabilities）

- **Chat**
  - session/message CRUD：新建、重命名、删除、清空、复制；消息编辑/删除
  - 流式生成状态：`streaming/ok/error/aborted`
  - swipes（多候选）/选择 swipe
- **Characters**
  - 列表/搜索/收藏/复制/删除
  - JSON 导入导出（本重写格式）与 Tavern v2 JSON / PNG 导入导出
  - 头像：URL + 本地上传转 dataURL
  - 与 chat session 绑定（选中角色确保有可用对话）
- **WorldInfo**
  - Lorebook/Entry CRUD + 全局选择
  - 已开始引擎化：从原版 `public/scripts/world-info.js` 迁移核心扫描/递归/最小激活等逻辑（见“进行中”）
- **Connections**
  - 连接配置（source/model/proxy/reasoning/logprobs）CRUD + ping
- **Tokens**
  - tokenizer 选择 + 计数（后端 encode API，失败回退估算）
- **Backups**
  - 本地导出/导入（chat+characters 合并包）
  - 服务器备份文件列表/下载/删除（对接后端 `/api/backups/chat/*`）
- **Slash / Macros / PromptPipeline**
  - `/` 命令解析与执行框架
  - 宏渲染（`{{char}}` 等）
  - Prompt pipeline：系统提示（集成 WI/Macros/Regex），用户输入（Macros/Regex）
- **Regex / QuickReply**
  - 规则/按钮 CRUD + 与 ChatPanel 集成（QuickReply 按钮执行）

### UI（Features）

- `ChatPanel.vue`：会话管理、消息工具条（复制/编辑/删除）、swipe 导航、再生成/继续、token 计数、QuickReply
- `CharacterPanel.vue`：角色 CRUD、导入/导出（JSON/PNG）、标签、头像上传、**WorldInfo 绑定下拉选择**
- `WorldInfoPanel.vue`：Lorebook/Entry 编辑、settings 区、Last build explain（命中解释）
- 其他：Connections/Backups/Regex/QuickReply 管理面板已落地

## 进行中（正在对齐，未到“原版完全一致”）

### WorldInfo（P0）

当前状态：已经有独立引擎 `app/web/src/core/worldinfo/engine.ts`，并接入 capability 与 UI explain，但仍有多处需要继续复刻原版行为。

- **已补齐**（本阶段关键点）
  - selectiveLogic：`NOT_ANY / NOT_ALL` 分支
  - `minActivations` 与 `maxRecursionSteps` 互斥行为
  - settings/entry 多字段补齐 + UI 编辑 + explain 视图
  - generation/promptPipeline 传入会话 messages 供 WI 扫描使用

- **仍缺口**
  - 预算/插入策略（character-first/global-first/evenly）完整对齐
  - 更多 entry extensions 字段：概率、分组权重、延迟递归、阻止递归、排除递归等
  - 更接近原版的 explain（命中 key、depth、递归链路、预算占用细节、来源标注）

### Characters（P0）

当前状态：已把原版 v2 角色常用字段补齐进 `CharacterCard`，并保证 Tavern v2 JSON/PNG 导入导出不丢字段；UI 已补齐多项编辑。

- **已补齐**
  - `alternate_greetings / post_history_instructions / creator / talkativeness / world / depth_prompt / regex_scripts`
  - `character_book` 导入：导入时自动写入 WorldInfo 并绑定 `worldInfoId`（避免丢角色自带世界书）
  - UI：多问候语、post history、creator、talkativeness、world、depth prompt 编辑

- **仍缺口**
  - 文件夹/分组/更多筛选维度（对齐原版 tags/folders 体验）
  - `regex_scripts` 的**执行逻辑与管理 UI**（目前仅保留数据结构）
  - v1/杂项非标准字段更完整兼容（导入时的宽容性与字段映射）
  - 角色卡与世界书来源标注（手动导入/角色卡绑定导入等）

### Parity Matrix（P0）

正在持续维护 “原版 vs Vue3 重写” 的缺口表（WorldInfo / Characters / Presets），用于按模块逐一清零差异。

## 后续待执行（按优先级逐模块清零差异）

### P0：WorldInfo 完全对齐（优先）

- **扫描/递归/预算/插入策略**：按 `public/scripts/world-info.js` 数据流逐段复刻
- **Entry extensions 全量字段**：probability、group scoring、recursion controls、display_index 等
- **Explain 视图增强**：命中 key、depth、递归链、预算占用、来源标注（global/character/import）

### P0：Characters 完全对齐（紧随其后）

- **导入兼容性增强**：v1/v2/CCv3/非标准字段的更完整映射与容错
- **regex_scripts 原版行为**：作用范围/触发点/与 prompt 输出链路对齐
- **标签/文件夹/排序/过滤**：对齐原版角色管理体验

### P0：Presets 完全对齐

- **preset 管理器**：对齐 `public/scripts/preset-manager.js`
- **按后端(source)差异化参数**：不同 completion source 的参数面板与默认值
- **导入导出/自动选择/联动**：切换连接配置时预设联动等

### P1-P3：其余已迁移模块继续原版级对齐

- Regex / QuickReply：scope/conditions/actions/与 preset/角色/聊天联动全量对齐
- Chat：继续完善 regenerateFrom 等“截断/回滚”行为（目前有 best-effort 实现）
- 其他原版功能模块按 parity matrix 逐个补齐

## 目录索引（主要实现位置）

- **新前端**：`app/web/src`
  - core：`app/web/src/core/*`
  - features：`app/web/src/features/*`
  - plugins/capabilities：`app/web/src/plugins/capabilities/*`
- **原版参考脚本**
  - WorldInfo：`public/scripts/world-info.js`
  - Characters：`public/scripts/char-data.js`
  - Presets：`public/scripts/preset-manager.js`
