# 真实 DSH 隔离集成验收

从项目根运行：

```powershell
node scripts/integration-launcher.mjs
```

默认使用已安装的 `G:\DeepSeek Harness\DeepSeek Harness.exe`，通过 `ELECTRON_RUN_AS_NODE=1 --expose-internals` 获得 Electron 的 ASAR 文件系统能力。普通 Node 只负责 launcher；不复制、安装或改写 DSH 依赖。

可显式覆盖测试目标：

```powershell
$env:DSH_INTEGRATION_ELECTRON = 'G:\DeepSeek Harness\DeepSeek Harness.exe'
$env:DSH_INTEGRATION_ROOT = 'G:\DeepSeek Harness\resources\app.asar\dsh'
$env:DSH_INTEGRATION_PLUGIN = 'G:\an-isolated-unpacked-package\package'
node scripts/integration-launcher.mjs
```

`DSH_INTEGRATION_PLUGIN` 只接受绝对入口文件或插件目录；目录使用其 `src/index.js`。不设置时使用当前项目入口。所有验收均经过这个可选入口，适用于解包后的分发产物。

## 安全与真实性

- 每次运行新建临时 HOME、DSH_HOME、DSH_AGENTS_HOME 和平台 TEMP；结束后删除准确的本次临时根。
- 不挂载 profile、真实 credentials 或外部 LLM provider；受控模型是已安装 `LlmAdapter` 的本地实现。
- 使用已安装的真实 Context、AgentLoop、LLM、Tools、SystemPrompt、SessionProjection、WorkingDirectory 和 filesystem tools。权限验收另外挂载真实 sandbox policy / sandbox filesystem。
- cold resume 使用真实 JSONL persistence；不改用户会话存储。
- 路由验收使用真实 Connection 的 exact Fetch registry 和显式 in-process owner/non-owner Peer；不监听端口，也不启动另一个 GUI。它验证 owner gate，不宣称验证浏览器 cookie 登录或视觉表现。
- shell 验收使用真实 pwsh tool schema，末端 `tools/execute` tripwire 记录任何未拦截调用并拒绝执行，确保安全回归失败时也不会启动 shell。
- launcher 使用 `stdio: 'inherit'`，避免 Windows pipe 限制；120 秒总截止后终止并收集 child exit。

## 插件启用回归（0.1.1）

```powershell
node scripts/integration-launcher.mjs --activation-only
```

原0.1.0测试包装了 `apply()` 并吞掉其返回值，导致普通对象返回值触发的 Cordis `Invalid effect` 未被发现。现已删除包装：所有测试直接执行 `ctx.plugin(plugin, input)`，从实际 `fiber.config` 读取配置，并通过 `getController(ctx)` 取得控制器。

新增默认关闭、开启及带真实Connection的三个直接启用/卸载用例，且纳入完整验收；不能再用“测试内部行为通过”替代“分发入口可启用”。

## 已约定的测试 seam

插件公开 `Config` / `apply` / `getController(ctx)`；真实 Agent 的 create/followup/whenIdle/dispose/resume；实际模型请求与工具结果；公开 controller.drain/inspect；真实文件产物；Connection Fetch routes。

覆盖默认关闭、volatile 开关与会话冻结、索引冻结和新会话加载、后台真实工具写入和新会话读取、前后台错误/取消、卸载与异步 materialization 竞态、权限 gate、read-only/workspace-write、custom scope、普通 child 隔离、冷恢复、Windows 路径别名、后台工作目录冻结、shell fail-closed、opaque replay metadata / reasoning。

这不是 live GUI 或真实 provider 质量评测。执行结果以测试进程报告为准；不将静态检查当作运行证明。
