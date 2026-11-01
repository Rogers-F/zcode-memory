# ZCode Memory Unified for PI-Desktop

统一记忆的 PI-Desktop 适配，保留管理面板、模型队列、语义选择器、Dream、旧归档查看与受控工具。事实修改接入新的 journal/互斥/索引/归档核心，自动提取默认关闭。面板新增保存、遗忘和统一归档恢复。

Run build, tests and packaging from the project root. Import the generated `.piplug` using the host plugin manager. The source adapter folder alone needs `../../src` and root dependencies; the generated package includes `unified/` and YAML, so it stands alone. No command here installs the plugin into a real profile automatically.

New ID: `local.zcode-memory-unified`; data: `~/.pi-desktop/zcode-memory-unified`. Native memory tools require the host to expose `registerTool`; the management panel supplies manual actions when it does not. Task mutation is version dependent and is not claimed to be subagent API compatibility. The local test suite exercises panel/event/tool contracts; an installed PI-Desktop GUI has not been verified. Model extraction, semantic recall and Dream can transmit relevant content to the selected provider and incur charges. See the root README capability matrix and retained NOTICE.md for precise boundaries and provenance.

可选语义召回已统一为共享 model.recall 选择链，旧选择器不再重复运行；使用面板 semanticRecall 显式开启。before_agent_start 选择后，context 每次请求（含工具续步及后续回合）重发有界索引与本会话仍有效的正文，不写持久“只注入一次”回执。重复查询使用缓存，revision/forget 在下一次 context 移除旧内容；compaction 清空集合后重建。主进程 IPC 只准备召回结果，扩展 5.5 秒超时后不接纳迟到结果，下一用户回合可重试。宿主模型可能计费；输出限制在该 completion API 中为提示/验证限制。前台修改请使用 memory_save/forget/repair，直接 Write/Edit/rm 会被拦截，共享核心维护索引。连续回合与超时使用真实扩展入口/IPC 和脚本模型验证，未宣称 PI-Desktop 实机验收。详见根 README。
