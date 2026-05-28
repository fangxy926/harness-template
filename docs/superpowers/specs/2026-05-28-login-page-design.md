# 登录页面

## 概述

一个纯静态的 HTML + CSS 登录页面，无 JavaScript，无外部依赖，单文件交付。用于验证项目 hook 工作流闭环。

## 目标

- 提供视觉完整的登录表单
- 单文件，可直接在浏览器打开
- 无任何运行时依赖

## 范围

**包含：**
- 用户名输入框
- 密码输入框
- 登录按钮
- 居中卡片布局（灰色背景 + 白色卡片 + 阴影）

**不包含：**
- 表单提交逻辑
- JavaScript 校验
- 响应式媒体查询
- 外部 CSS 框架

## 文件结构

```
src/
  login.html   # 唯一交付物
```

## UI 结构

```
<body>  background: #f0f2f5
  <div class="card">  白色, 圆角, box-shadow, 宽 360px, 垂直水平居中
    <h1>登录</h1>
    <input type="text"     placeholder="用户名">
    <input type="password" placeholder="密码">
    <button type="button">登录</button>
  </div>
```

## 样式规格

| 属性 | 值 |
|------|-----|
| body 背景 | `#f0f2f5` |
| 卡片宽度 | `360px` |
| 卡片内边距 | `40px` |
| 卡片圆角 | `8px` |
| 卡片阴影 | `0 2px 12px rgba(0,0,0,0.1)` |
| 输入框宽度 | `100%`（box-sizing: border-box）|
| 按钮颜色 | `#1677ff`（蓝色）|

## 布局方案

body 使用 `display: flex; justify-content: center; align-items: center; min-height: 100vh` 实现垂直水平居中。

## 验收标准

- [ ] 在浏览器直接打开 `src/login.html` 可见居中登录卡片
- [ ] 包含用户名、密码两个输入框和一个登录按钮
- [ ] 无控制台错误
- [ ] 无外部网络请求
