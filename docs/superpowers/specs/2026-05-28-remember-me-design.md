# 记住我复选框

## 概述

在现有登录页面（`src/login.html`）的密码框与登录按钮之间，插入一个纯静态「记住我」复选框。无 JavaScript，无任何行为逻辑，仅视觉呈现。

## 父需求

扩展自：`docs/superpowers/specs/2026-05-28-login-page-design.md`

## 范围

**包含：**
- `<input type="checkbox">` + `<label>` 组合，语义正确
- 水平行内布局（flexbox），左对齐
- 与现有页面字号、间距风格一致

**不包含：**
- JavaScript 状态处理
- localStorage 持久化
- 自定义 CSS 复选框样式

## 修改文件

```
src/login.html   # 唯一修改文件
```

## HTML 变更

在 `<input type="password">` 和 `<button>` 之间插入：

```html
<div class="remember">
  <input type="checkbox" id="remember">
  <label for="remember">记住我</label>
</div>
```

## CSS 变更

在现有 `<style>` 末尾追加：

```css
.remember {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  font-size: 14px;
  color: #555;
}
```

注意：`.remember input` 不设 `width: 100%`，避免被父级 `input` 选择器覆盖，需在 CSS 中显式覆盖：

```css
.remember input[type="checkbox"] {
  width: auto;
  margin-bottom: 0;
}
```

## 验收标准

- [ ] 「记住我」复选框位于密码框和登录按钮之间
- [ ] 点击 label 可切换复选框勾选状态（原生行为，无需 JS）
- [ ] 复选框不受父级 `input { width: 100% }` 影响，尺寸正常
- [ ] 无外部依赖，无控制台错误
