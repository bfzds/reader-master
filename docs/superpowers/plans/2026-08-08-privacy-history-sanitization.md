# 隐私数据脱敏实施计划

> **供自动化执行器使用：** 必须逐项执行本计划，并在每个任务后检查结果。

**目标：** 从公开仓库的当前版本和 Git 历史中清除本机路径与个人邮箱。

**方案：** 在独立的本地 Git 镜像副本中执行。当前版本停止跟踪本机 Claude 配置，并将文档中的本机路径替换为占位符；随后在镜像中使用 Git 的历史重写功能更新全部可访问分支，最后强制推送并扫描验证。

**技术栈：** Git、PowerShell、Node.js 项目测试。

## 全局约束

- 不删除当前主工作区中的本机 `.claude/settings.local.json` 文件。
- 不修改当前主工作区已有的暂存或未跟踪改动。
- 不下载额外工具；使用 Git 自带的 `filter-branch` 完成历史重写。
- 强制推送前必须完成当前文件和全部可访问提交的隐私扫描。

---

### 任务 1：建立隔离工作区

**文件：**
- 修改：`.gitignore`
- 创建：`.worktrees/privacy-rewrite-mirror.git/`
- 创建：`.worktrees/privacy-history-rewrite/`

- [ ] **步骤 1：忽略项目内工作区目录**

在 `.gitignore` 添加：

```gitignore
.worktrees/
```

- [ ] **步骤 2：只提交忽略规则**

运行：

```powershell
git add -- .gitignore
git commit --only -m "chore: ignore local worktrees" -- .gitignore
```

- [ ] **步骤 3：创建隔离镜像和重写工作区**

运行：

```powershell
$remoteUrl = git remote get-url origin
git clone --mirror . .worktrees/privacy-rewrite-mirror.git
git --git-dir=.worktrees/privacy-rewrite-mirror.git remote set-url origin $remoteUrl
git --git-dir=.worktrees/privacy-rewrite-mirror.git worktree add .worktrees/privacy-history-rewrite codex/privacy-history-sanitization
```

预期：镜像拥有当前已提交的全部分支；历史重写只影响镜像，当前主工作区的分支引用不会被直接改写。

- [ ] **步骤 4：获取远程引用并检查基线**

运行：

```powershell
git fetch origin --prune
npm test
```

预期：远程引用更新成功；若测试失败，记录失败后继续仅执行与隐私文件相关的验证。

### 任务 2：脱敏当前版本

**文件：**
- 修改：`.gitignore`
- 修改：`docs/archive/project-technical-doc-2026-07-30.md`
- 停止跟踪：`.claude/settings.local.json`

- [ ] **步骤 1：替换归档文档中的本机路径**

将路径前缀替换为：

```text
<USER_HOME>
```

- [ ] **步骤 2：停止跟踪本机 Claude 配置**

运行：

```powershell
git rm --cached -- .claude/settings.local.json
```

预期：文件继续留在磁盘上，但从 Git 索引中移除。

- [ ] **步骤 3：验证当前文件**

运行：

```powershell
git grep -I -n -E '[A-Za-z]:\\Users\\|[A-Za-z0-9._%+-]+@qq\.com' -- . ':!src-tauri/Cargo.lock'
git check-ignore -v .claude/settings.local.json
Test-Path .claude/settings.local.json
```

预期：敏感模式没有匹配；配置文件被忽略且仍存在。

- [ ] **步骤 4：提交当前版本脱敏结果**

运行：

```powershell
git add -- .gitignore docs/archive/project-technical-doc-2026-07-30.md
git commit -m "chore: sanitize tracked workstation data"
```

### 任务 3：重写 Git 历史

**文件：**
- 历史变更：所有本地分支、远程跟踪分支和标签

- [ ] **步骤 1：创建临时内容脱敏脚本**

在系统临时目录创建 `treader-history-sanitizer.cjs`，内容如下：

```javascript
const fs = require('node:fs');

const file = 'docs/archive/project-technical-doc-2026-07-30.md';
if (fs.existsSync(file)) {
  const original = fs.readFileSync(file, 'utf8');
  const sanitized = original.replaceAll(process.env.USERPROFILE, '<USER_HOME>');
  if (sanitized !== original) {
    fs.writeFileSync(file, sanitized);
  }
}
```

此脚本仅在历史重写期间使用，完成后删除。

- [ ] **步骤 2：重写提交身份、文档内容和本机配置跟踪记录**

运行：

```powershell
$env:HISTORY_SANITIZER = Join-Path $env:TEMP 'treader-history-sanitizer.cjs'
$env:FILTER_BRANCH_SQUELCH_WARNING = '1'
$env:PERSONAL_EMAIL = git log --all --format='%ae%n%ce' | Sort-Object -Unique | Where-Object { $_ -like '*@qq.com' } | Select-Object -First 1
if (-not $env:PERSONAL_EMAIL) { throw '未找到待脱敏的个人邮箱。' }
git filter-branch --force `
  --env-filter 'if [ "$GIT_AUTHOR_EMAIL" = "$PERSONAL_EMAIL" ]; then GIT_AUTHOR_NAME="tReader Contributor"; GIT_AUTHOR_EMAIL="contributor@users.noreply.github.com"; fi; if [ "$GIT_COMMITTER_EMAIL" = "$PERSONAL_EMAIL" ]; then GIT_COMMITTER_NAME="tReader Contributor"; GIT_COMMITTER_EMAIL="contributor@users.noreply.github.com"; fi; export GIT_AUTHOR_NAME GIT_AUTHOR_EMAIL GIT_COMMITTER_NAME GIT_COMMITTER_EMAIL' `
  --tree-filter 'rm -f .claude/settings.local.json; node "$HISTORY_SANITIZER"' `
  -- --all
```

- [ ] **步骤 3：删除重写备份引用并回收不可达对象**

运行：

```powershell
git for-each-ref --format="%(refname)" refs/original/ | ForEach-Object { git update-ref -d $_ }
git reflog expire --expire=now --all
git gc --prune=now
```

### 任务 4：验证并推送

**文件：**
- 验证：全部可访问 Git 历史、当前工作区、项目测试

- [ ] **步骤 1：扫描全部历史**

运行：

```powershell
$revisions = git rev-list --all
foreach ($revision in $revisions) {
  git grep -I -n -E '[A-Za-z]:\\Users\\|[A-Za-z0-9._%+-]+@qq\.com' $revision -- 2>$null
}
```

预期：没有匹配。

- [ ] **步骤 2：运行项目测试**

运行：

```powershell
npm test
```

- [ ] **步骤 3：强制推送重写分支**

运行：

```powershell
$remoteBranches = git for-each-ref --format='%(refname:strip=3)' refs/remotes/origin/ | Where-Object { $_ -and $_ -ne 'HEAD' }
foreach ($branch in $remoteBranches) {
  git push --force origin "+refs/remotes/origin/$branch:refs/heads/$branch"
}
git push --force --all origin
git push --force --tags origin
```

- [ ] **步骤 4：确认远程引用与本地一致**

运行：

```powershell
git fetch origin --prune
git status --short --branch
```
