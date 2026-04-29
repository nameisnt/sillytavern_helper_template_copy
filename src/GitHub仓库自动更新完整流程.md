# GitHub 仓库自动更新完整流程

本文记录如何把酒馆助手模板作为 GitHub 仓库使用，并实现自动打包、自动更新脚本。

## 1. 创建新仓库

推荐直接在 GitHub 上点击模板仓库的 `Use this template` 创建新仓库。

仓库可见性建议：

- 想通过 `jsdelivr` 远程加载脚本或界面，优先用公开仓库
- 只想自己本地使用，可以用私有仓库

## 2. 配置 GitHub Actions 权限

新仓库创建后，进入：

`Settings -> Actions -> General`

将以下选项打开：

- `Workflow permissions` 设为 `Read and write permissions`
- 勾选 `Allow GitHub Actions to create and approve pull requests`

## 3. 首次检查工作流

进入仓库的 `Actions` 页面，确认以下工作流存在：

- `bundle`
- `bump_deps`
- `sync_template`

手动运行方法：

1. 进入 `Actions`
2. 点击左侧某个具体工作流
3. 点击 `Run workflow`
4. 分支选择 `main`
5. 再点击一次 `Run workflow`

建议首次手动运行顺序：

1. `bump_deps`
2. `bundle`
3. `sync_template`

说明：

- `bundle` 负责打包 `src` 到 `dist`
- `bump_deps` 负责自动更新依赖和参考文件
- `sync_template` 负责同步上游模板更新

只要 `bundle` 和 `bump_deps` 为绿色，仓库通常就已经可以正常使用。  
`sync_template` 失败时，不影响你先开发和打包。

## 4. Windows 本地克隆前的 Git 设置

如果你在 Windows 上本地使用，先执行：

```powershell
git config --global core.symlinks true
git config --global merge.ours.driver true
```

作用：

- `core.symlinks=true`：让模板里的链接文件正常工作
- `merge.ours.driver=true`：减少 `dist/` 目录合并冲突

如果系统不能创建符号链接：

- 尽量开启 Windows 开发者模式
- 或使用管理员身份运行终端
- 如果仍不行，再考虑手动复制少数链接文件内容替代

## 5. 克隆仓库

```powershell
git clone https://github.com/你的用户名/你的仓库名.git
cd 你的仓库名
```

建议执行：

```powershell
git update-index --skip-worktree .vscode/launch.json
```

这样可以避免把你本地的酒馆地址提交到仓库。

## 6. 安装依赖并本地测试

先安装依赖：

```powershell
pnpm install
```

再测试构建：

```powershell
pnpm build
```

如果需要边改边看：

```powershell
pnpm watch
```

## 7. 编写脚本或界面

主要在 `src/` 中编写自己的内容。

常见做法：

- 写脚本：在 `src/某个目录/` 中放脚本入口
- 写前端界面：在 `src/某个目录/` 中放页面和相关资源

如无必要，不要随便改：

- `.github/`
- `package.json`
- `pnpm-lock.yaml`

## 8. 提交并推送源码

推荐只提交你真正写的源码和配置，不要手动提交本地产生的 `dist/`。

常用流程：

```powershell
git status
git add src
git add webpack.config.ts
git add tavern_sync.yaml
git commit -m "add script source"
git push origin main
```

说明：

- `webpack.config.ts` 只有在你改过时才提交
- `tavern_sync.yaml` 只有在你改过时才提交
- `dist/` 通常交给 GitHub Actions 自动生成和提交

## 9. 等待 bundle 自动生成 dist

推送到 `main` 后，GitHub 会自动触发 `bundle` 工作流。

它会自动：

- 安装依赖
- 构建项目
- 生成 `dist/`
- 把 `dist/` 提交回仓库

检查方法：

1. 打开 GitHub 仓库
2. 进入 `Actions`
3. 查看最新的 `bundle` 是否成功
4. 成功后进入仓库文件页，确认 `dist/` 已生成

## 10. 拼接 jsdelivr 自动更新链接

当 `dist/` 中已经出现打包结果后，就可以拼接远程链接。

格式：

```text
https://testingcf.jsdelivr.net/gh/你的GitHub用户名/你的仓库名/dist/文件路径
```

例如，若产物路径是：

```text
dist/资源导入导出/index.js
```

则脚本引用链接为：

```js
import 'https://testingcf.jsdelivr.net/gh/你的GitHub用户名/你的仓库名/dist/资源导入导出/index.js'
```

如果是前端页面，通常指向 `index.html`。

## 11. 常见报错处理

### 11.1 `webpack` 不是内部或外部命令

原因：没有安装依赖。

解决：

```powershell
pnpm install
```

### 11.2 `SyntaxError: Expected double-quoted property name in JSON`

原因：`package.json` 被改坏了，常见是合并冲突标记没删干净。

例如以下内容必须删除：

```text
<<<<<<< HEAD
=======
>>>>>>> commit-id
```

### 11.3 `sync_template` 失败

这通常不影响脚本开发和自动打包。

只要：

- `bundle` 绿色
- `bump_deps` 绿色

通常就可以先继续开发。

## 12. 最终最短流程

如果只看最短版本，顺序如下：

1. 用模板创建 GitHub 仓库
2. 配好 Actions 权限
3. 手动跑一次 `bump_deps` 和 `bundle`
4. Windows 本地执行 `git config --global core.symlinks true`
5. 克隆仓库
6. 执行 `pnpm install`
7. 在 `src/` 编写脚本或界面
8. `git add`、`git commit`、`git push`
9. 等 `bundle` 自动生成 `dist/`
10. 用 `jsdelivr` 链接引用 `dist/` 中的目标文件

## 13. 本次实践结论

本次已经确认：

- 新仓库创建成功
- `bundle` 工作流可正常运行
- `bump_deps` 工作流可正常运行
- Windows 下 `symlink` 已正常生效
- `dist/` 已能生成脚本产物

因此，这个仓库已经可以用于制作自动更新脚本。
