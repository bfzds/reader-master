# 删除无意义设置入口设计

## 目标

从设置页移除截图中不需要的入口：

- 帮助分组中的 `Open Source Credits`、`Privacy Policy` 和 `关于`。
- 安装分组及“安装网页应用”按钮。

## 方案

修改 `app_unpacked/src/js/data/options.js` 的设置选项注册表，删除对应的帮助项和 `app_install` 安装项。页面由注册表动态生成，因此入口、分组标题和相关交互会一起消失。

保留 `app_unpacked/src/help/` 下的静态页面及 Service Worker 资源清单，不删除文件，不改变已有页面内容，避免扩大变更范围。

## 验证

- 检查选项注册表不再包含这些入口。
- 运行活跃 JavaScript 语法检查。
- 运行现有 Node 回归测试。
