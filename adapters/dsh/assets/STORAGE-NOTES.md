# Storage / Prompts 移植交接（task-1）

## 范围与来源

- 主实现：[storage.js](../src/storage.js)、[prompts.js](../src/prompts.js)。只修改本 task 的 storage/prompts、assets、test/storage、test/prompts 范围；没有修改源 ZCode、安装 profile 或 DSH 安装目录。
- 源快照包版本为 **3.16.1**。源目录没有 `.git`，因此**不宣称某个 commit**。
- [source-manifest.json](source-manifest.json) 记录 29 个上游文件的原始字节 SHA256，含上游 [LICENSE](upstream/LICENSE)、[NOTICE.md](upstream/NOTICE.md)、[package.json](upstream/package.json)、实现及 golden fixtures。复制资产不修改；两个移植模块均保留版权并有显著 `MODIFIED for DSH` 注释。
- [port-upstream.mjs](port-upstream.mjs) 是可重复素材提取脚本：只读显式传入的源快照，生成完整 prompt 模块及来源资产。最终根 LICENSE/NOTICE 由 lead 处理。

## 冻结 Interface

```js
import {
  createMemoryStorage, createMemoryCatalog,
  resolveProjectMemoryRoot, resolvePersistentAgentMemoryRoot,
  memoryFileRelativePath, resolveContainedMemoryFilePath, resolveSafeMemoryFilePath,
} from '../src/storage.js';

const storage = createMemoryStorage({
  storageRoot, workspacePath, workspaceIdentity, sessionId,
  // rootDir 可显式覆盖，用于自定义 agent 三 scope；从不猜测真实 profile。
});
await storage.ensure({ signal });
const index = await storage.loadIndexOnce({ signal });
// index = {raw, rawContent, content, indexPath, filePath, readState, indexError?}
const isolatedReadState = storage.createReadState(index.readState);
const read = await storage.read(filePath, { readState: isolatedReadState, signal, offset: 1, limit: 200 });
// offset 始终 1-based；limit 为行数。read.revisionId/revision.id 是稳定文件版本。
await storage.write(filePath, content, { readState: isolatedReadState, signal, sessionId });
await storage.edit(filePath, oldString, newString, { readState: isolatedReadState, signal, replaceAll: false });
await storage.remove(filePath, { signal });
// write/edit 返回 path/content/revision... 及 before/after/operation(create|update)。
const manifest = await storage.manifest({ signal });
const recalled = await storage.readRecalledMemories({ entries: manifest, nowMs, signal });

const catalog = createMemoryCatalog({ storageRoot, remote: false });
const workspaces = await catalog.listWorkspaces({ query: '', signal });
// [{id,label,updatedAt,files:[{name,kind:'index'|'item',size,updatedAt}]}]
const preview = await catalog.readFile(workspaceId, fileName, { signal });
// {content,updatedAt}。updatedAt 固定 epoch milliseconds，size 是 bytes。
```

### 状态、安全和错误

- 构造时冻结 root，后续 shell cwd 不会改变实例 root；构造函数本身无 FS 副作用。
- `loadIndexOnce()` 缓存第一次 Promise，包括首次找不到或不可读索引；非 abort 读取错误降级为空 context 并可附 `indexError`，空 format 或失败均不给 read state；abort 仍抛出。新建另一实例表示新会话/冷恢复。
- 主索引按源 lexer 清洗前置 frontmatter 和顶层 HTML 注释；list/blockquote/paragraph/code 内注释保留。200 行、25,000 **JS 字符**，warning 文本与源完全一致。
- Read state 是调用方拥有的 Map；背景任务须 clone，不能接受模型提供的 state。Write/Edit 必须有同版本 Read。按源语义，显式 offset/limit 是 range view（`isRangeView`），不是 partial view，允许后续 Write/Edit；清洗/截断导致真实显示不完整的索引或召回是 `isPartialView:true`，任何 Write/Edit 都拒绝，必须先重新 Read。冻结索引保留 raw content 做版本观测，同时 raw 与 format content 不同就标 partial。
- 每次稳定 Read 比较 `dev/ino/size/mtimeNs/ctimeNs`，版本还绑定正文 SHA256，阻止简单 ABA。通过已验证句柄读取；前后复查目录、路径和文件快照，限制 5 MiB。
- Mutation 先异步准备/fsync 临时同目录文件，再在极短同步 commit 内检查 signal、路径与版本并 rename/unlink；因此同一 event loop 中取消回调不能插进 final guard 和提交之间。完成的取消前写入不能撤销。
- 拒绝遍历、大小写别名、ADS/设备名/尾空格句点、敏感路径段、符号链接/junction；只要求 `.md` 扩展名小写，`Title.md` 等大小写 basename 在精确匹配磁盘名称时允许，`MEMORY.md` 是索引。catalog 只读、不创建目录，remote 模式 list 直接返回空且 read 拒绝。
- viewer catalog 仅枚举 memory 根目录顶层文件，不展示空或只有嵌套文件的 workspace；readFile 只接受 basename，任意分隔符拒绝。manifest 仍递归，与 viewer 的刻意分工保持源行为。
- viewer 约定错误码：`FILE_TOO_LARGE`、`FILE_CHANGED`、`FILE_NOT_FOUND`、`INVALID_PATH`；写入另有 `READ_REQUIRED`、`EDIT_MATCH`、`INVALID_EDIT`、`INVALID_RANGE`。取消传播 AbortError。
- manifest 只解析预览前 30 行元数据，mtime 降序取 200，索引不入 manifest；扫描失败按源返回空，取消不吞掉。sticky 非空缓存由 engine 负责。
- recall 正文按源 200 行、4,096 UTF8 bytes，仅保留完整行，保留原 warning/stale header/limit/revision 形状；顺序由输入保留。61,440 会话字符预算由 engine 管理。

## Prompt 导出

- `buildMemoryContent(root, branch='default-index')`、`buildMemorySection(root, branch)`：固定规则不混入索引文件正文。
- `buildPersistentAgentMemoryPrompt({indexContent,rootDir,scope})`：完整四类型、Why/How、排除项、遗忘/去重/验证、plan/tasks 分工、三 scope 指导及索引截断。
- `buildMemoryExtractionPrompt({manifest,messageCount})`、`buildMemoryDreamPrompt({memoryRoot,sessionIds,transcriptRoot})`：保留完整源工具循环提示词。
- `buildMemorySelectorRequest({query,state})`、`MEMORY_SELECTOR_SYSTEM_PROMPT`、`MEMORY_SELECTOR_RESPONSE_SCHEMA`、`formatMemoryManifest`。
- `formatRelevantMemoryAttachment`、`formatProjectMemoryUpdate`、`formatMemoryUpdateAttachment`。
- `buildProjectMemoryIndexAttachment({memoryRoot,content,indexPath?})`：有来源、明确非指令的背景上下文，不复制上游 agentsMd 的权限提升文案。
- `mapMemoryToolNames(prompt,names)` 只对固定 prompt 做显式 Read/Write/Edit/Grep/Glob/Bash 专名映射；不要对用户正文调用。

## Dream 与 custom scopes

- storage 暴露 `readDreamLastConsolidatedAt(memoryRoot)`、`acquireDreamLock({memoryRoot,nowMs?,pid?,signal?})`、`restoreDreamLockAfterFailure({memoryRoot,priorMtimeMs})`，并提供实例 bound 方法。
- **源默认成功路径保留 PID 与 lock mtime，不调用 release**。额外 `releaseDreamLock` 是供显式维护使用的 primitive，不是 engine 默认成功动作，不增加定时入口。
- user scope 使用显式 storageRoot 下 agent-memory；project/local scope 改为 workspace 下 `.dsh/agent-memory` / `.dsh/agent-memory-local`。没有 `.zcode` profile 读取或迁移。
- `loadPersistentAgentMemory` 只有 profile 明确声明 memory scope 且 enabled 才返回；普通子 agent 不隐式继承主记忆。

## 与源的显式差异 / 尚未验证

1. TypeScript 移植为 ESM；合并为两个深 Module，DSH host/engine 经上述 Interface 调用。
2. `.zcode` 自定义 scope 目录换成 `.dsh`；默认 storageRoot 由 host 显式注入。
3. 上游主索引 `agentsMd` wrapper 声称覆盖默认指令。本插件故意不继承该权限提升，只发送有来源的背景上下文。
4. 文件访问统一收紧：symlink/junction 不跟随、精确大小写、敏感 Windows 别名拒绝；5 MiB 不仅约束 viewer，也约束普通 memory Read/Write 和 manifest 所扫描事实。这意味着超大事实文件会被 manifest 忽略；不是声称上游所有超大文件行为完全等价。basename 本身不强制小写，仅扩展名 `.md` 必须小写，保持源行为。
5. manifest 取消传播 AbortError 而非伪装空扫描；普通扫描错误仍按源返回空。
6. engine 已向 lead 报告：源 semantic recall 把截断预览标为 `isPartialView:false`，可能赋予整文件覆盖能力。lead 已选择安全收紧为 true，作为明确差异记录；此分支仍默认关闭。
7. Windows 实机未提供文件 symlink 创建权限，因此 file-symlink 子场景打印 diagnostic；**目录 junction/祖先 junction 穿越拒绝实际通过**。POSIX/macOS 未实机运行。
8. Windows 不允许测试在打开的验证句柄上原子替换路径（EPERM），测试验证了该 OS 防护；同 inode 原地写竞态则实际验证触发 `FILE_CHANGED`。这不是跨平台并发/恶意管理员竞态的形式化证明。
9. 以独立测试目录验证，没有连接真实 provider，也没有安装 profile；host Context、真实工具 middleware、模型循环集成由 lead/engine 负责。
10. 上游按空白切分的中文触发局限、scheduler、semantic sticky/state、Dream gates 和 50 请求循环由 engine 保留/报告，不由 storage 偷改。
11. 记忆文件保存在指定本地目录，不意味着相关上下文永不外发；索引/提取会发往所选模型 provider。

## 实际测试结果

运行环境：`load_workspace_dependencies` 提供的 Windows Node >=24；yaml/marked 由 lead 安装。测试仅在本 task 的 `test/storage/.case-*` 下创建临时目录并自动清理。

```powershell
& 'C:\Users\Administrator.DESKTOP-BR3KL51\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe' --test test/storage/storage.test.js test/prompts/prompts.test.js
```

最终结果：**34 tests，34 pass，0 fail，0 skipped，约 5.6 秒**。覆盖 root/hash/Windows、三 scopes、UTF16 emoji agent key 源函数对照、索引源函数逐字比较、origin YAML/CRLF 源函数比较、冻结索引/失败降级/空索引无授权/格式化 partial 状态、range≠partial 与精确文件名、read state/ABA/并发覆盖、提交前取消、5 MiB、顶层 catalog/空workspace隐藏/目录 junction、稳定句柄竞态、manifest 200/30/取消、recall UTF8 完整行与 stale warning、PID 锁恢复，以及全部 prompt golden/源函数和 29 文件来源 hash。

首次执行 26/27 通过，唯一失败为测试假定 Windows 可 rename 已打开句柄；改为同时验收 Windows 的 OS 阻止路径与 POSIX 的 FILE_CHANGED 路径后，加入更多回归及 lead review 的 parity 修正后最终 34/34。`stripTypeScriptTypes` 的 ExperimentalWarning 只出现在源 fixture 对照测试/再生成脚本，不影响正式运行。
