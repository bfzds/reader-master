# 阅读器异步副作用契约

本文档约束阅读器的数据写入、Worker 和 EPUB 资源加载。后续可靠性测试及实现以本文为准。

## KeyedWriteQueue

当前实现入口为 `enqueueKeyed(key, operation)`。它返回 `operation` 的结果 Promise。

- key 使用稳定的资源标识。书籍写入使用 `book:<id>`；配置写入使用配置 key。
- 相同 key 的操作按调用顺序执行。不同 key 之间不互相等待。
- 前一个操作失败后，后一个操作仍会执行；前一个调用拿到自己的 reject，不会被后续操作吞掉。
- 队列只负责提交顺序，不合并状态，也不做防抖。阅读 cursor 的 350ms 防抖继续留在 `ReadPage` 调用层。
- 调用方在入队前构造本次提交需要的快照。高频写入需要最后一次状态时，调用层必须合并或替换待提交快照，不能依赖旧 Promise 的完成顺序。

`file.setMeta()`、`file.setIndex()` 和完整书籍更新都必须使用同一书籍 key。这样目录、书签、元数据和正文的写入不会出现旧快照覆盖新快照。

## Worker Runner

Worker runner 使用以下参数：`url`、`message`、`fallback`、`timeoutMs` 和可选 `workerFactory`。`timeoutMs` 的生产默认值为 10,000ms。

- runner 返回一个只会 settle 一次的 Promise。Worker 的第一条有效 `message` 返回原始消息数据；创建失败、`error`、`messageerror` 或超时都返回调用方提供的 `fallback`。
- settle 时必须清理 timer，并在已创建 Worker 时调用 `terminate()`。超时后的迟到消息和错误不得改变结果或再次清理资源。
- runner 不定义业务 fallback。中文转换把原文作为 fallback；目录识别把“没有目录”作为 fallback。`text.js` 负责把返回结果转换为各自的业务行为。
- Worker 降级会写入包含业务上下文的 warning，但不会把可降级失败升级为持久化错误。

## EPUB 资源租约

`createEpubResourceLoader()` 管理 EPUB Blob URL，并暴露 `acquire(resource)` 与 `destroy()`。

- 同一路径的并发 `acquire()` 共享同一个加载过程。成功时每个调用取得独立、幂等的 `release()` 租约。
- `release()` 只能减少自己的引用一次；仍有引用的 URL 不得 revoke。
- 读取或解压失败时，加载器记录 warning、删除失败 entry，并返回 `null`。下一次 `acquire()` 可以重新尝试。
- 空闲淘汰只能释放无引用且非 pending 的 entry。`destroy()` 阻止新的 acquire，并释放所有已经创建且可释放的 Blob URL。

## 错误边界

数据完整性与可降级读取必须分开处理。

- IndexedDB 的 request、transaction error、abort 和 action 抛错都必须 reject 到持久化调用方。事务只有触发 `complete` 后才算成功。
- 调用层可以记录持久化失败并向界面报告，但不能把失败转换成成功，也不能让一次失败阻塞同 key 后续保存。
- Worker、EPUB 资源和其他可替代的读取失败使用 warning 加 fallback 或 `null`。这些路径不得写入半成品数据。
- adapter 负责资源生命周期和底层错误归一化；队列负责顺序；业务调用层负责防抖、快照选择、面向用户的状态和带上下文的日志。
