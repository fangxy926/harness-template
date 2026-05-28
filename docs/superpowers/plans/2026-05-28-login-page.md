# 登录页面 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 创建一个纯静态 HTML + CSS 登录页面，单文件，可直接在浏览器打开。

**Architecture:** 单个 `src/login.html` 文件，内嵌 `<style>` 标签，无外部依赖。使用 flexbox 居中卡片布局。

**Tech Stack:** HTML5, CSS3（内嵌），无 JavaScript，无构建工具。

---

## 文件一览

| 路径 | 操作 | 说明 |
|------|------|------|
| `src/login.html` | 新建 | 唯一交付物，包含 HTML 结构和内嵌 CSS |

---

### Task 1: 创建登录页面 HTML 文件

**Files:**
- Create: `src/login.html`

- [ ] **Step 1: 创建 `src/` 目录**

```bash
mkdir src
```

- [ ] **Step 2: 写入 `src/login.html`**

完整内容如下，一次写入：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>登录</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background: #f0f2f5;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      font-family: sans-serif;
    }

    .card {
      background: #fff;
      width: 360px;
      padding: 40px;
      border-radius: 8px;
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
    }

    h1 {
      font-size: 24px;
      margin-bottom: 24px;
      color: #333;
    }

    input {
      display: block;
      width: 100%;
      padding: 10px 12px;
      margin-bottom: 16px;
      border: 1px solid #d9d9d9;
      border-radius: 4px;
      font-size: 14px;
      outline: none;
    }

    input:focus {
      border-color: #1677ff;
    }

    button {
      display: block;
      width: 100%;
      padding: 10px;
      background: #1677ff;
      color: #fff;
      border: none;
      border-radius: 4px;
      font-size: 14px;
      cursor: pointer;
    }

    button:hover {
      background: #0958d9;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>登录</h1>
    <input type="text" placeholder="用户名">
    <input type="password" placeholder="密码">
    <button type="button">登录</button>
  </div>
</body>
</html>
```

- [ ] **Step 3: 在浏览器验证**

用文件管理器或命令行打开 `src/login.html`：

```bash
# Windows
start src/login.html
```

预期效果：
- 页面背景为灰色（`#f0f2f5`）
- 居中白色卡片，有阴影
- 卡片内含标题"登录"、两个输入框、一个蓝色按钮
- 浏览器控制台无错误，无网络请求

- [ ] **Step 4: Commit**

```bash
git add src/login.html
git commit -m "feat: add static login page (HTML + CSS)"
```
