# 记住我复选框 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `src/login.html` 密码框与登录按钮之间插入一个纯静态「记住我」复选框。

**Architecture:** 修改单一文件 `src/login.html`，在 HTML 结构中插入 checkbox+label 组合，并在内嵌 `<style>` 末尾追加两条 CSS 规则。无新增文件，无 JavaScript。

**Tech Stack:** HTML5, CSS3（内嵌），无外部依赖。

---

## 文件一览

| 路径 | 操作 | 说明 |
|------|------|------|
| `src/login.html` | 修改 | 插入 HTML 结构 + 追加 CSS |

---

### Task 1: 插入「记住我」复选框

**Files:**
- Modify: `src/login.html`

- [ ] **Step 1: 在密码框和按钮之间插入 HTML**

找到以下内容（`src/login.html` 第 73-74 行附近）：

```html
    <input type="password" placeholder="密码">
    <button type="button">登录</button>
```

替换为：

```html
    <input type="password" placeholder="密码">
    <div class="remember">
      <input type="checkbox" id="remember">
      <label for="remember">记住我</label>
    </div>
    <button type="button">登录</button>
```

- [ ] **Step 2: 在 `<style>` 末尾追加 CSS**

找到 `</style>` 标签，在其前面插入：

```css
    .remember {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 16px;
      font-size: 14px;
      color: #555;
    }

    .remember input[type="checkbox"] {
      width: auto;
      margin-bottom: 0;
    }
```

- [ ] **Step 3: 在浏览器验证**

```bash
# Windows
start src/login.html
```

逐项核对：
- [ ] 「记住我」复选框出现在密码框正下方、登录按钮正上方
- [ ] 点击「记住我」文字可切换勾选状态（原生行为）
- [ ] 复选框大小正常，未被拉伸至全宽
- [ ] 浏览器控制台无错误

- [ ] **Step 4: Commit（使用 git-commit-helper skill）**

IMPORTANT: 必须使用 git-commit-helper skill 提交，不要直接运行 git commit。
调用方式：Skill tool，skill="git-commit-helper"
