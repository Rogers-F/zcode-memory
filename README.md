# ZCode Memory Unified — v0.3.0

统一并增强 ZCode 风格的长期记忆。保留 PI-Desktop 管理面板、DSH 设置页及原生权限链，新增 Claude Code CLI、Codex CLI、Pi CLI、Kimi CLI 适配。六个宿主使用同一套 Markdown 事实、增量提取、维护、迁移和召回核心，各宿主默认拥有独立数据空间。ZCode 官方仅作为行为和来源参照，本项目不替换其内建记忆。

这是可运行的首版实现。自动提取默认关闭；没有配置模型接口时使用本地中文/英文规则筛选，绝不自行寻找账户或调用模型。PI-Desktop、DSH 在用户明确开启后台提取、独立的语义召回开关或手动 Dream 后可使用宿主已选模型。语义召回默认也关闭，默认 BM25 路径无模型调用和推理费用。**本地存储不等于本地推理**：这些调用会把相关对话和记忆传给模型提供商，消耗额度并可能产生费用。

## 项目与运行环境

```text
src/core/           Markdown/YAML、可靠存储、提取、Dream、BM25、迁移
src/protocol/       宿主服务、12 个工具、MCP stdio、CLI hooks
adapters/           pi-desktop / dsh / claude-code / codex-cli / pi-cli / kimi-cli
bin/                独立 CLI、MCP server、hook runner
scripts/            测试、配置生成、构建、打包、隔离宿主验收
test/               核心、适配器、集成、scripted model 与真实宿主测试
dist/               构建输出（可重新生成）
artifacts/          六宿主分发包（可重新生成）
```

核心、CLI 和构建已在 Node **22.23.2** 上运行；要求 Node >=22.19。DSH 插件自身仍要求 **Node >=24、DSH 0.2.1-rc.2**，不因核心支持 Node 22 而放宽。运行时核心只依赖 `yaml`；DSH 保留 `marked` 和可选 `unbash`，浏览器 React 由宿主提供。不引入向量数据库、网络服务或常驻后台守护进程。

```sh
npm install --ignore-scripts
npm run check
npm test
npm run test:integration
npm run build
npm run pack
npm run test:package
```

源码树内原插件的测试/资料保留为来源与回归参考；标准命令运行 `test/` 中统一版本的测试，不声称原插件全部历史测试都适用于修改后的实现。构建打包及包验收使用系统 tar/unzip（macOS 已内置）。安装依赖需要包源可用；分发包已携带 `yaml`，DSH 包另携带 `marked`，CLI 核心可以离线启动。

可选真实宿主检查（仅临时 HOME、配置、工作区与 scripted provider，所有输出在 `.work/native/`；不登录、不读取真实账户）：

```sh
npm run test:hosts   # 已安装的 DSH Electron/Node 24 及其公共原生包
npm run test:pi      # 已安装的 Pi CLI
npm run test:cli     # Claude manifest、Codex hooks/list、隔离 Kimi ACP 初始化/认证边界
npm run test:lifecycle # 原生 marketplace / Pi 包管理的持久启停、升级、移除
npm run benchmark    # 1000 条合成事实，5 个新进程，本地 BM25
```

可用 `DSH_INTEGRATION_ELECTRON`、`DSH_INTEGRATION_ROOT`、`PI_CLI_PACKAGE`、`CLAUDE_CLI_EXECUTABLE`、`CODEX_CLI_EXECUTABLE`、`KIMI_CLI_EXECUTABLE` 指向待测安装。测试进程仅继承白名单环境，不继承真实模型密钥。

## 实际能力与安装矩阵

| 宿主 | 交付物与接入 | 保存/读取/遗忘、召回 | 新会话注入与自动提取 | 本机验收范围 |
| --- | --- | --- | --- | --- |
| PI-Desktop | `.piplug`；`main.js`、agent extension、保留的管理面板 | 面板手动操作；宿主提供 `registerTool` 时另注册原生工具；受控 ToolRunner 与归档恢复 | 统一按需 BM25 / 可选宿主模型召回；完成回合后按开关提取；手动 Dream 保留 | 面板后端、ToolRunner、会话注入契约；未找到可运行的 PI-Desktop 安装，未做真实 GUI 验收 |
| DSH | npm `.tgz`、Cordis patch、设置/预览页、12 个原生工具 | 实际 DSH 工具注册与工具权限链；原生 Read/Write/Edit 桥接共享存储 | 索引/正文共用预算，按需 BM25 / 可选宿主模型；显式 `extractionEnabled` 后在完成回合提取 | 已安装 DSH 的真实 Context/AgentLoop/FS/Sandbox/LLM 包，scripted model；未验浏览器页面渲染或远程客户端 |
| Claude Code CLI | Git marketplace 正式插件源；离线 `.tgz`，包含 manifest/MCP/hooks/完整运行时 | MCP stdio 工具；手动命令同源 | SessionStart / UserPromptSubmit 注入；Stop 后按开关增量提取；钩子被禁用时降级为手动 MCP | Claude 2.1.316 隔离原生 marketplace 安装、启停、版本更新/卸载与离线 MCP；未做 Claude 模型会话 |
| Codex CLI | Git marketplace、原生 plugin/MCP/hooks/skills 与 AGENTS.md；持久启停/更新桥接 | MCP stdio 工具；AGENTS.md 提示显式调用 | 0.164.0 可识别 SessionStart / UserPromptSubmit / Stop；需在原生 UI 审阅并信任钩子；旧版本或未信任时使用手动 MCP | Codex 0.164.0 原生 app-server `hooks/list` 识别 3 个钩子、无解析错误；隔离原生安装/更新/移除，禁用后 hooks 为零；保持 untrusted，未执行原生模型回合 |
| Pi CLI | 主 npm `.tgz`，`pi.extensions` 入口 `index.ts`、原生扩展事件；可选原生 MCP 注册 | 12 个原生工具、`/memory` 命令；可选 MCP | before_agent_start 选择，随后每次 context 重发会话记忆；completed settlement 才提取，取消不提交；默认本地规则 | Pi 1.4.0 正式包安装/资源启停/更新/移除，真实 CLI/RPC、连续回合、scripted provider；不依赖账户 |
| Kimi CLI | 官方格式插件目录/`.zip`；`kimi.plugin.json`、systemPrompt、命令、MCP 与扁平 hooks | 12 个 MCP 工具，每次显式传当前工作区绝对 `project`；保留共享修复/迁移与权限边界 | UserPromptSubmit 纯文本首轮有界索引/按需正文，持久回执；Stop 本地提取需开启；PostCompact 重建，resume 去重，Interrupt/StopFailure 取消 | 2.4.1 隔离 ACP initialize；TUI 正式管理器安装/启停/更新/移除（sandbox fs.watch EMFILE 时记录测试 stub）；真实 stdin/MCP/ZIP 契约；未调用 Kimi 模型 |

手动选择安装以下构建产物；构建和测试**不会**自动写入真实宿主配置。

### 正式安装与生命周期

下列 v0.3.0 Release URL 在维护者完成发布后可用；源码验收本身不创建 tag、Release 或上传包。不要把仓库根作为 Kimi 插件安装。Claude/Codex 的 Git marketplace 则直接使用本仓库受版本控制的 `bin/`、`src/` 和 `vendor/yaml/`，无需 `dist` 或安装时运行 npm。

**Claude Code CLI**（终端；安装默认启用）：

```sh
claude plugin marketplace add Rogers-F/zcode-memory
claude plugin install zcode-memory@zcode-memory --scope user
claude plugin disable zcode-memory@zcode-memory --scope user
claude plugin enable zcode-memory@zcode-memory --scope user
claude plugin marketplace update zcode-memory
claude plugin update zcode-memory@zcode-memory --scope user
claude plugin uninstall zcode-memory@zcode-memory --scope user
```

变更后新建会话或运行 `/reload-plugins`。在已启用状态重复 enable，本机 Claude 会报告 already_in_goal_state。第三方 marketplace 默认不自动更新；保持该选项关闭，需要更新时手动执行上述两条更新命令。宿主负责 MCP/插件权限。

**Codex CLI**（终端；安装默认启用）：

```sh
codex plugin marketplace add Rogers-F/zcode-memory
codex plugin add zcode-memory@zcode-memory
codex plugin list --marketplace zcode-memory --json
zcode-memory host disable --host codex-cli
zcode-memory host enable --host codex-cli
zcode-memory host update --host codex-cli
codex plugin remove zcode-memory@zcode-memory
```

Codex 0.164.0 没有原生插件 enable/disable 动词。上面的统一控制命令调用原生 app-server `config/read` / `config/value/write`，按原生版本做乐观并发检查，持久设置 `[plugins."zcode-memory@zcode-memory"].enabled`，不伪造命令、不编辑 TOML 字符串。它使用 `$CODEX_HOME/config.toml`；项目或管理策略可能覆盖用户状态，异常会明确报错。安装此控制命令一次：

```sh
npm install -g https://github.com/Rogers-F/zcode-memory/releases/download/v0.3.0/zcode-memory-0.3.0.tgz
zcode-memory host status --host codex-cli
```

变更后启动新 Codex 会话。禁用插件使原生插件 hooks 和 MCP 不再加载；已有会话和已经写入 transcript 的文本不会被倒删。启用不等于信任 hooks：需在 Codex 原生界面审阅当前内容哈希，更新后可能需重新信任。测试保持 untrusted，没有绕过信任。`host update` 调用原生 marketplace upgrade/plugin add 后恢复原启用状态；直接 plugin add 会重新启用已禁用插件。恢复仅还原配置，不降级插件缓存。控制命令的私有备份、版本和事务在 `~/.zcode-memory/lifecycle/<host>`；失败后按提示运行 `zcode-memory host recover --host codex-cli`，外部再改写时拒绝覆盖。

**Pi CLI**（终端，正式 Git 包，稳定 source 保留在用户 settings）：

```sh
pi install git:github.com/Rogers-F/zcode-memory
pi list
pi config
# 在 config 中取消 / 勾选该包的 extension；新会话或 /reload 生效。
pi update git:github.com/Rogers-F/zcode-memory
pi remove git:github.com/Rogers-F/zcode-memory
```

`pi update` 只在你执行时拉取该 source 的新版。若需要钉版本，可安装 `git:github.com/Rogers-F/zcode-memory@v0.3.0`；标签不会被 update 移动，升级时执行 `pi install` 指定新标签，同仓库身份替换原声明并保留资源过滤。Pi 的 Git 安装由原生包管理器安装声明的依赖。脚本化用户也可用 `zcode-memory host disable|enable --host pi-cli --source <pi-list中的source>`：按官方 `packages[].extensions/skills/prompts/themes` 过滤配置原子更新，恢复原选择，其他设置保留。普通用户使用 `pi config` 即可。`ZCODE_MEMORY_PI_MCP=1` 可另开原生 MCP，默认使用原生记忆工具。

**Kimi CLI**（在 Kimi 输入，正式版本化 ZIP URL）：

```text
/plugins install https://github.com/Rogers-F/zcode-memory/releases/download/v0.3.0/zcode-memory-kimi-cli-0.3.0.zip
/plugins list
/plugins disable zcode-memory
/plugins enable zcode-memory
/plugins info zcode-memory
/plugins remove zcode-memory
/reload
```

安装、启停、更新、移除后运行 `/reload` 或 `/new`；MCP 在重载/新会话生效。更新在 `/plugins` 管理器选择该插件的可用更新，或明确安装新版本的 ZIP URL；也可用 `/plugins marketplace https://raw.githubusercontent.com/Rogers-F/zcode-memory/main/marketplaces/kimi.json` 浏览本项目目录再确认更新。插件为用户级；hooks 必须在宿主允许。不要把本地 `.zip` 直接交给 `/plugins install`，本机只接受解压后的目录；离线步骤见 [Kimi README](adapters/kimi-cli/README.md)。无显式模型桥接时 `semanticAvailable:false`，不查账号。

离线安装也使用同一持久管理器：终端执行 `unzip /absolute/zcode-memory-kimi-cli-0.3.0.zip -d /absolute/kimi-memory-plugin`，再在 Kimi 执行 `/plugins install /absolute/kimi-memory-plugin` 和 `/reload`；后续启停/移除命令相同。

**DSH**：从 [v0.3.0 Release](https://github.com/Rogers-F/zcode-memory/releases/tag/v0.3.0) 下载 `zcode-memory-dsh-0.3.0.tgz` → DSH 插件管理器导入/安装 → 配置 ID `zcode-memory-unified`，包名 `@local/zcode-memory-dsh`。在管理器启用/禁用插件；插件设置页的工作区记忆开关另控 `enabled`（默认 false）。升级时导入同一包名的新版确认替换，保留原配置，不先删除数据；卸载使用管理器 Remove，不选择清数据。后台提取 `extractionEnabled` 和语义 `semanticRecallEnabled` 仍分别默认关闭。当前会话的扩展效果在卸载/重载后停止，既有历史不撤回。

**PI-Desktop**：同一 Release 下载 `local.zcode-memory-unified-0.3.0.piplug` → 插件管理器导入 → ID `local.zcode-memory-unified` → 启用。禁用使用管理器的插件开关，更新导入同 ID 新版并确认替换，卸载使用 Remove/Uninstall，默认保留 `~/.pi-desktop/zcode-memory-unified` 与项目数据。主进程卸载停止后台任务，宿主管理扩展运行器卸载；可打开命令 `zcode-memory-unified.open` 检查设置与版本。本机没有 PI-Desktop GUI，完整 GUI 生命周期未实机验收。

所有宿主 remove 默认只移除插件/配置声明，保留独立记忆及其设置；宿主提供的“删除数据”选项不要勾选。禁用不改变自动提取等用户选择，重新启用恢复；正在运行的会话按宿主重载语义生效。升级不迁移到其他宿主、不打开共享写入。旧 v0.2.0 手工 MCP/hooks/extension 声明应由用户在原宿主删除后再装正式插件，避免两份入口；记忆目录不改动。`scripts/configure.cjs` 仅保留旧配置诊断/离线审阅用途，普通安装不依赖手动合并文件。

发布者更新与六包检查见 [发布流程](docs/RELEASING.md)。

CLI/MCP 通过 `--host` 强制选择宿主。`--home` / `ZCODE_MEMORY_HOME` 指向新的数据根，`--project` / `ZCODE_MEMORY_PROJECT` 绑定项目，`--identity` / `ZCODE_MEMORY_WORKSPACE_ID` 为移动项目提供明确身份。`--read-only` / `ZCODE_MEMORY_READ_ONLY=1` 拒绝记忆写入。对 PI-Desktop/DSH 原生目录做迁移或导出时，另传 `--root /absolute/native-project-memory-dir`；否则 CLI 使用自己的 host 命名空间，不会猜测或扫描原生目录。此 root 只能绑定选定宿主，不支持跨宿主共用。

## 日常操作

以下示例使用专门的演示根；不会扫描旧宿主或查找凭据。也可以在六宿主中调用同名 `memory_*` 工具。工具参数都支持 `scope:personal|project|agent`，agent 另需 `agent` 名称，可选择 `agentScope:user|project|local`。

```sh
node bin/zcode-memory.cjs --host pi-cli --home ./demo-data --project /work/example save '{"path":"release.md","body":"以后项目发布先经过 staging，再由负责人审批。","type":"project"}'
node bin/zcode-memory.cjs --host pi-cli --home ./demo-data --project /work/example recall '{"query":"发布审批","maxChars":1500,"maxItems":3,"maxTokens":500}'
node bin/zcode-memory.cjs --host pi-cli --home ./demo-data --project /work/example settings '{"autoExtract":true,"recall":{"maxChars":6000,"maxItems":5,"maxTokens":2000}}'
node bin/zcode-memory.cjs --host pi-cli --home ./demo-data --project /work/example stats '{}'
node bin/zcode-memory.cjs --host pi-cli --home ./demo-data --project /work/example dream '{}'
node bin/zcode-memory.cjs --host pi-cli --home ./demo-data --project /work/example forget '{"path":"release.md"}'
```

工具包括 `memory_save/read/list/recall/forget/restore/repair/dream/stats/settings/import/export`。读取返回 revision；明确更新必须附 `expectedRevision`。取代其他事实需要 `relation:"supersedes"`、`relatedPath` 和 `expectedRelatedRevision`。不带更新授权的同名异内容写为冲突文件，原文保留。`memory_list` 列出来源与可恢复 archiveId；`memory_restore` 恢复旧版本，有现存异内容时同样保留冲突。遗忘默认留下可恢复归档。`memory_forget({"path":"release.md","purge":true})` 显式永久删除该路径及共享核心归档，PI-Desktop 还清理匹配的旧管理归档；个人记忆的默认路径查找、修复、恢复和 purge 同样可用。purge 不清除旧插件来源、已导出副本、宿主转录、备份或存储介质残留，不是磁盘安全擦除。

`memory_dream` 默认仅预览；`{"apply":true}` 才归档清理精确重复。近似/语义相似只列出待判断组合，避免把不同约定静默合并。可注入可测试的 `model.extract()` / `model.maintain()`，配合 `modelEnabled:true` 使用结构化语义判断；核心和四个 CLI 默认均未配置外部模型。PI-Desktop 另保留宿主模型 Dream、DSH 保留原生受限工具提取流程。

## 模型与预算边界

- 本地提取支持无空格中文词/句边界、稳定标记与临时聊天排除，规则等价、语言/包管理器及一般同句否定的冲突识别；这不是通用语义理解或嵌入模型。复杂否定、隐含偏好与混合语言需要用户审阅或显式提供模型。
- 增量游标与内容摘要跟随事实一起提交；重试、同一边界重复事件、取消后恢复不会重复建档。摘要保留最近 1000 条，操作去重保留最近 2000 笔；更老输入仍受内容哈希和语义去重约束。
- `settings.extraction` 可配置 `maxInputChars`（默认 24000）、`maxExistingChars`（12000）、`maxFacts`（30、最高 50）、`maxModelCalls`（0 或 1）。长消息/日志优先保留稳定指令，按预算跳过其余部分，推进原消息的游标和摘要；`extractionSkippedChars/extractionTruncatedMessages/extractionRejectedSensitive` 可查询，下一轮不重扫旧日志。极小预算（小于 16 字符）仍明确拒绝。核心每次模型提取/维护最多一次模型请求，尝试次数含失败/取消，统计可查询。
- PI-Desktop 的宿主 completion 队列仍受其每分钟 8 次上限约束；旧 Dream 有单独的最多 50 轮限制。DSH 原生工具提取使用宿主模型，开启时 modelEnabled 同步为 true；显式设置 modelEnabled:false 会关闭原生自动提取，不能把它当成本地规则模式。PI-Desktop 的原生模型/自动开关由面板管理，原生工具遇到该类设置会明确引导到面板，而不写一个不生效的核心开关。DSH 原生工具循环仍采用原引擎的回合/输出限制，而不是核心结构化模型的单请求接口；它会记录每次实际请求到统一统计和 DSH 审计日志。请分别控制宿主原生流程和核心预算。
- 召回使用中文有效双字与英文词项 BM25，单个汉字和常见虚词不能建立相关度，结合时间、重要性及 scope 权重。先查缓存元信息，再读取选中正文；默认最多 5 条、6000 字符、2000 token-like 单位。token-like 是启发式估计而非提供商 tokenizer，不能作为账单精确计数。
- `MEMORY.md` 最多 200 行 / 25000 字符；超出部分仍可搜索，遗漏数可查询。默认按查询读取选中正文，启动索引片段最多 2500 字符且受统一预算限制。普通查询没有相关结果时不增加正文；Claude/Codex 无命中 hook stdout 为零字节。DSH/Pi/PI 每次请求仍重发有界索引和本会话已选事实，供临时上下文使用。每次请求复核活动 revision，保存/更新/取代/遗忘/恢复/导入均使旧附件和语义缓存失效；不继续使用冻结旧索引。核心注入计入 JSON 和提示包装预算，索引与正文共用预算。

Kimi 的 SessionStart（startup/resume）仅观察，stdout 不作为注入。UserPromptSubmit 每次可用时检查活动 revision，首次提交发送有界索引；索引回执与正文回执分离，后续相关查询可获得正文。同会话后续进程不会重复发送已交付事实，受累计字符/token-like 预算控制；PostCompact 清空回执，在下一次 UserPromptSubmit 重建。中断/StopFailure/SessionEnd 丢弃未提取用户输入；只从插件自身 UserPromptSubmit 捕获的用户文本提取，兼容字符串与真实的文本分片数组；非文本/工具/附件不作用户文本，不解析 Kimi 转录中的工具或压缩摘要。TurnStarted 仅观察，Stop 只消费已解析缓冲，不从自身 payload 再捕获偏好。已写入宿主 transcript 的旧内容无法由 forget 撤回，遗忘后不再新增注入，可用宿主新会话清除历史。

Kimi 插件 MCP 的 cwd 为插件根，因此其 12 个工具 schema 均要求额外的绝对 `project` 参数（当前会话工作区），缺失/相对路径会明确拒绝，不猜测“最近项目”。例如 `memory_save({"project":"/work/example","body":"以后用中文回答","type":"user"})`，随后 `memory_settings({"project":"/work/example","autoExtract":true})` 可显式开启本地提取；个人偏好跨本宿主项目继承，项目/agent 硬隔离。systemPrompt 与 `/zcode-memory:memory` 只教模型使用这些真实工具。插件接口依据 [Kimi 官方插件文档](https://www.kimi.com/code/docs/en/kimi-code-cli/customization/plugins.html)、[hooks](https://www.kimi.com/code/docs/en/kimi-code-cli/customization/hooks.html) 与 [MCP](https://www.kimi.com/code/docs/en/kimi-code-cli/customization/mcp.html)。

## 可选模型语义召回

共享核心新增独立 `recall.semantic.enabled:false`，与自动提取互不绑定。可用 `memory_settings` 设置；其默认目标是宿主级 personal 配置，新项目继承；`scope:"project"` 可显式覆盖，未覆盖的新项目不必重复开启。原有配置的明确选择保留。PI-Desktop 由面板 `semanticRecall` 控制并复用已选模型；DSH 由原生 `semanticRecallEnabled` 或 `memory_settings` 控制并复用宿主 provider/model。PI 的旧选择器不再与新链重复运行。四个 CLI 未提供显式 `model.recall` 桥接时只走本地、报告 `semanticAvailable:false`，不搜索凭据。独立 CLI/MCP 没有加载 provider 的隐式配置；嵌入式调用可给 `HostMemory({model})` 或 `core.recall(store, query, {model})` 传桥接对象。

```json
{"recall":{"semantic":{"enabled":true,"maxCandidates":64,"maxInputChars":12000,"maxOutputTokens":512,"timeoutMs":5000,"minRelevance":0.7}}}
```

模型接口只做选择，不写事实或执行工具：

```js
// input.signal 必须转交宿主；不在接口里查找账户或自行重试。
model.recall = async ({ version, system, query, candidates, limits, maxCalls, signal }) => {
  // candidates: [{id, revision, type, title, summary}]
  // limits: {maxSelections, maxOutputTokens}; maxCalls === 1
  return {version: 1, matches: [{id: 'm0', relevance: 0.98, evidence: '候选标题/摘要中的原文'}]};
};
```

候选从完整活动目录选取，包含词法零匹配及 MEMORY.md 第 200 行之外的记忆；排除归档、冲突、已取代条目。最多优先保留前 8 个词法候选，其余使用随查询变化的确定性分散取样，全部受候选数/序列化字符预算限制。只发送短标题/摘要和查询，不读取全部正文；摘要不含相关信息可能漏召回。diagnostics 提供 `candidateCount/totalActive/coverageComplete/inputChars/estimatedInputTokens`，预算不足时不宣称全库语义搜索。

先要求 relevance >= 0.7，再以语义 0.65、BM25 饱和分 0.25、重要性 0.06、时间 0.04 融合排序。有效 `matches:[]` 或全部低于门槛即零新增正文，不用 BM25 补满；临时宿主已选会话记忆与启动索引仍按下述策略重发。英文事实 “Always run staging before release.” 对中文 “发布前要做什么” 的 scripted model 回归已覆盖；这验证接入和控制链，不代替真实模型质量测量。

每次查询执行至多一次外部请求，超时/非法 JSON/未知 ID/重复 ID/无效证据/限流回退本地 BM25；有效空结果不回退。取消直接终止，不注入；忽略迟到响应，并在结果提交前复核 revision。候选、字符、输出、超时均有预算；DSH 转交原生 maxOutputTokens，PI completion API 通过请求提示与返回验证控制输出，**不能保证提供商硬性停止生成或取消计费**。模型可能需要读取候选摘要；本地文件也会发送到所选提供商并计费。

缓存最多 128 项、5 分钟，键含宿主根/作用域/agent、活动 path+revision、模型标识、规范化查询、预算与阈值。写操作改变活动指纹即失效；统计写不改变指纹。统计提供 `recallModelCalls/recallModelSuccess/recallCacheHits/recallFallbacks/recallTimeouts/recallErrors/recallCancelled`。这些召回计数先保留进程内快照、随下一笔真实写入持久化；纯读进程退出时可能丢失，统计故障不阻断召回。宿主事件另用小文件原子发布最近触发时间与实际降级，属 best effort，不声称未发生的事件已经成功。

只有 **Claude/Codex** 使用持久注入回执，因为 hook 内容留在宿主 transcript。按会话记录索引与正文各自的 revision 指纹、已处理查询和累计预算；仅发送过索引不会阻止随后读取完整正文。连续新进程同问只注入一次，resume 不重新灌入旧内容；`SessionStart source=compact` 清除旧回执并重建有界索引，后续查询重新补正文。有 compaction_id/event_id/hook_id 时同一压缩通知也去重。默认每次压缩区间累计 24000 字符 / 8000 token-like，保留最近 128 个会话、各 2048 个正文和索引指纹/128 个查询；超出保留窗口后去重不再永久保证。回执提交后若宿主在收到输出前崩溃，系统无法证明该次内容已被宿主消费。

**DSH、Pi CLI、PI-Desktop** 的注入仅作用于当次模型请求，不写历史，因此不写持久回执。各会话维护粘滞集合：首个真实模型请求附有界索引，查询按需增补正文，之后每个模型步骤（含同回合工具续步）都重发仍有效的集合。`maxChars/maxTokens/maxItems` 限制每请求，`maxSessionChars/maxSessionTokens` 另限制常驻集合；重发不消耗累计投递次数。重复查询复用选择结果和正文缓存，context/pre-step 复核元数据，不每轮读全部正文。revision 变化即移除旧正文并重建索引，forget 后下一模型请求不再包含对应路径/描述/正文。原生 compaction 事件清除会话集合，下一请求重建索引，按后续查询重选正文；会话间互不复用选择集合，进程重启不持久保存它。内存至多保留 128 个会话及每会话 128 个查询。

Pi 按实际 `before_agent_start → context` 顺序预取后重发，PI 的旧选择链在共享模式关闭。PI 主进程 IPC 只返回候选选择/正文，不登记投递；扩展最多等待 5.5 秒，过期或会话 epoch 改变的结果不进入模型，也不留下回执。失败降级本地；同一模型回合不重复选择，下一用户回合可重试。

## 存储、隔离与恢复

CLI 默认：`~/.zcode-memory/hosts/<host>/memories/projects/<slug>-<hash>/memory/`。personal、project、agent 分目录。user/feedback 显式类型的手动保存、共享核心的偏好提取默认进入该宿主 personal，跨项目可见；项目事实只在当前项目可见，agent 需明确作用域。未声明 type 的手动保存默认 project，不自动把项目内容提升为个人偏好。旧数据导入保留明确的目标 scope，不自动扩大到所有项目；需全局偏好时明确导入 personal。PI-Desktop 面板提供“个人偏好（跨项目）”列表，面板保存 user/feedback 与原生工具使用相同 personal 空间。PI-Desktop 保留自己的项目布局但使用新根 `~/.pi-desktop/zcode-memory-unified`；DSH 使用 `$DSH_HOME/zcode-memory-unified`。项目身份优先显式 workspaceIdentity，否则使用规范化绝对路径；不默认合并不同 worktree 或设备路径。

事实是普通 Markdown，含兼容的 `name/description/metadata.type/metadata.originSessionId`；四类为 user、feedback、project、reference。未知旧 YAML 字段保留，`unified` 追加宿主、项目、作用域、代理、会话、时间、内容来源、更新/取代关系。`.unified/state.json` 是可重建的检索/控制状态，`.unified/archive/` 保存旧文，journal 保存未完成事务。

所有受支持的写入口通过本地文件系统 Bakery 互斥协议、同目录临时文件、fsync、原子 rename 与 redo journal。唯一 UUID 写者声明避免独立恢复锁再次崩溃造成的锁死；进程死亡后下一访问会清理声明并重放日志。取消在 journal 持久化前没有事实效果；持久化后事务必须完成或由恢复重放，调用方取消不等于回滚已承诺事务。写事务使用互斥；正常读以原子状态发布和 WAL 检查读取一致快照，遇未完成事务再恢复重试。召回从缓存检索元信息并验证文件状态，只读选中正文，不为统计做全量事务。

只读访问不修改事实、索引或配置；没有未完成事务时正常读不创建锁声明、不 fsync。Claude/Codex/Kimi 自动注入依赖持久回执，在只读模式降级为空；临时上下文宿主可重发内存集合，手动 read/recall 仍可用。未完成 journal 需可写元数据恢复。这不承诺挂载为物理只读的文件系统可用。拒绝目录穿越、符号链接、危险文件名和大小写别名；未知外部改写按单条隔离；单事实上限 5 MiB。协议适用本地文件系统，**不承诺 NFS/网盘同步目录可靠性或恶意同用户进程下的无竞态隔离**。事实被外部修改、删除或写坏 YAML 后，`list/recall/export` 的 issues/skipped 会列出该文件，其余条目继续可用。核心不覆盖外部字节；对坏条目 forget 只解除跟踪并保留外部文件。请使用下述明确修复操作，不删除整个状态文件。

显式处理外部改动：

```sh
# 审阅外部文件后，采用它的新版本（仍检查 YAML、敏感信息、路径、revision）
node bin/zcode-memory.cjs --host pi-cli --project /work/example repair '{"path":"release.md","action":"reimport"}'
# 解除跟踪、隔离外部文件；保留原始字节。再次保存同名仍拒绝覆盖该外部文件。
node bin/zcode-memory.cjs --host pi-cli --project /work/example repair '{"path":"release.md","action":"detach"}'
```

所有写入口（本地/模型提取、手动保存、原生工具、导入）统一筛查密码/token/API key 赋值、自然语言口令及常见密钥格式，返回 `SENSITIVE_CONTENT` 和原因，错误不回显凭据。模型输出同样不能绕过。密码使用 bcrypt 哈希存储、token 定时刷新或按字计费等描述性知识允许保存/重导入；带引号值、明确赋值或同句后续真实秘密仍拒绝。这是保守规则过滤，不是能识别任意机密的 DLP。工具输出/网页/压缩摘要的来源标记被排除，疑问（含无问号）、临时赞美和假设不按本地稳定偏好保存。自动写入带 extracted 来源，不能取代或遗忘 manual/imported 事实；冲突条目保留供审阅且不默认注入。未知旧字段保留，manual/extracted/imported 记录在来源链中。

**首版不开跨宿主实时共享写入。** 各宿主即使指向相同 home 也自动带 host 命名空间；显式配置不同适配器共用同一物理 root 属于不支持的配置。跨宿主交换是单向快照复制，目标独立写入，不回写来源，不做双向冲突自动合并。

## 从两个旧插件迁移

先备份旧数据并关闭旧插件的后台写入，再显式指定源 memory 目录、旧项目身份、目标宿主及新项目。导入工具只读源，不扫描真实用户目录，不移动、不改名、不删除源文件。

```sh
node bin/zcode-memory.cjs --host pi-cli --home /new-memory --project /new-project import '{"sourceDir":"/old-plugin/memories/projects/old-key/memory","sourceHost":"pi-desktop","sourceProject":"/old-project","settings":{"autoExtract":false}}'
node bin/zcode-memory.cjs --host pi-cli --home /new-memory --project /new-project export '{}' > exchange.json
node bin/zcode-memory.cjs --host claude-code --home /other-memory --project /new-project exchange-import < mapped-exchange.json
```

最后一条的 JSON 形状为 `{"sourceProject":"/new-project","bundle":<exchange.json 内容>}`。导出快照含哈希；单文件哈希损坏、YAML 错误、敏感内容或不安全路径逐文件跳过并给出原因，其余继续导入。整个交换封套或项目映射无效仍拒绝；成功条目重复导入幂等，同名异内容写冲突文件，目标索引重建。旧 `originSessionId`、未知字段与来源链保留。等价内容的后续来源追加到来源链并归档前一版本，来自其他旧文件的原始字段随该来源保留。不同路径的同内容事实复用已有文件，不为重复内容额外创建文件。

DSH 原生导入工具只允许当前工作区内的源目录；外部旧插件目录应通过独立 CLI 显式授权导入，避免绕过原生工作区权限。

旧设置只有在参数 `settings` 明确传入时迁移：PI 的 `autoExtract` 优先；DSH 的 `enabled:false` 保持关闭，否则保留明确的 `extractionEnabled`，只有旧 enabled 选择时按旧语义保留它。此过程不会读取或更改宿主真实配置；DSH/PI 的原生开关也需用户按所选值配置，不能仅凭核心设置声称已经开启宿主事件。

## 验收与未覆盖项

标准测试覆盖中文稳定/临时句子、去重、授权更新、冲突、恢复、预算、项目/宿主/代理隔离、只读、路径保护、迁移幂等、独立进程竞争、SIGKILL 后日志恢复、取消、合并调度、迟到模型响应。集成测试包含真实 MCP stdio 子进程，以及“旧 DSH 导入 → DSH 导出 → Claude 复制导入 → 新会话 hook 注入 → 召回 → 遗忘”的完整流程；来源保持不变。

本轮顺序回归通过真实扩展入口执行 Pi/PI `before_agent_start → context` 连续两轮与工具续步，并覆盖压缩、跨会话和遗忘；PI IPC 实际等待 5.5 秒再释放迟到脚本响应。已安装 DSH 的 AgentLoop 和 Pi 1.4.0 的同进程 RPC 另证明临时记忆每次模型步骤仍在、原生 forget 后下一步移除。Claude/Codex 每宿主五个新 hook 进程仍只注入一次，另验证启动索引不占正文回执、resume 去重和 compact 后重新注入。具体测试名与日志见验证记录。

1000 条合成记忆基准通过 `npm run benchmark` 复现，结果见 `.work/benchmark/report.json`，最终命令/测试数字与分发 SHA256 见 `.work/verification/final.json`。每个样本都是新 Node 进程，操作系统文件缓存仍可能命中；测量包含模块加载。断言选中一条只读取一条正文、零 fsync/零统计 rename；不宣称磁盘冷读、万条规模或真实 tokenizer。

v0.2.0 新增 Kimi 五个新 hook 进程、原生 stdin 纯文本/零字节、resume/PostCompact、Stop/取消、默认 HOME、显式 MCP 项目隔离与六包离线验证；原五宿主回归仍保留。Kimi 2.4.1 ACP initialize 成功，但隔离 session/new 返回 Authentication required，未执行原生 install/info；证据见 `.work/native/cli/kimi/report.json`。没有真实模型回合、权限 UI 或原生压缩注入验收。

v0.3.0 新增正式 marketplace/持久包生命周期。隔离原生命令覆盖 Claude/Codex/Pi 的安装、启停、0.2.0→0.3.0 更新、移除与数据/设置保留；版本更新使用当前源码的旧版本元数据 fixture，不冒充历史二进制迁移。Codex 禁用时 hooks/list 为零，更新桥接保留禁用状态；Pi 通过原生包声明加载 scripted provider 与插件，禁用后真实请求无记忆工具/上下文，恢复后再次出现。Kimi 原生 TUI 验证 install/info/enable/disable、更新保留禁用/MCP 选择、失败安装与 remove；标准 ACP 的认证边界不变。未修改的 TUI 在 sandbox 报 fs.watch EMFILE，测试记录原始失败后仅为管理器验证加入测试 watcher stub，并走正常信任确认；未验证原生监听、模型、hook 权限或 /reload 后的真实模型投递。DSH 使用真实 Cordis 卸载/重载并确认工具消失、恢复、数据保留；PI-Desktop 主进程停止轮询并解绑事件，重建恢复设置。GUI 安装/升级与远程 Release URL 下载仍需发布后验收。测试数字和六包 SHA 以本轮 final.json 为准。

真实 DSH/Pi 的 scripted model 测试验证宿主 API，而不是依靠 manifest 宣称兼容。Claude/Codex 的原生管理命令和离线插件 MCP 已测，其权限确认、真实模型会话、GUI 与不同版本/操作系统仍需后续实机验收。PI-Desktop 的 `registerTool`、Task 同参数对象行为未获本机证实，不承诺子代理自动记忆。CLI 子代理自动提取首版不提供；第三方若复用父配置启动独立 CLI，适配器无法推断其父子关系，应显式隔离 agent 空间或禁用该进程提取。agent 空间可手动使用，DSH 仅对明确配置的自定义代理作用域注入。

可选 `unbash` 未随离线首版包打入，未安装时后台 POSIX shell 分类保守拒绝，原生 Read/Write/Edit 与受控虚拟 shell 可用；不回退为执行未解析命令。Windows、网络文件系统、断电级 durability、超过本次 1000 条规模的性能与真实远程模型的语义质量/费用未在本机验收。

许可证与来源见 [LICENSE](LICENSE)、[NOTICE.md](NOTICE.md)、[sources.json](sources.json)。保留上游署名，不宣称 Z.ai、DeepSeek、Anthropic、OpenAI、Moonshot 或 Pi 官方背书。
