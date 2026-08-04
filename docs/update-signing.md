# 更新签名准备

当前仓库尚未配置真实 updater endpoint 或签名公钥，因此本阶段不生成私钥、不写入占位公钥，也不创建会发布无效更新元数据的 release workflow。

正式接入前必须由发布负责人提供：

- HTTPS updater endpoint；
- 与 updater 私钥匹配的公开 key；
- CI secret 中保存的私钥内容；
- 版本回退、断网和签名不匹配时的处理策略。

私钥只能作为 CI secret 使用，不能写入仓库、文档、构建产物或日志。Windows Authenticode 证书是另一条链路，可独立于 updater 包签名处理。
