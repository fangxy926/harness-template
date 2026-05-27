# Harness Template

Claude Code 项目模板，集成 [Superpowers](https://github.com/anthropics/claude-code-superpowers) 插件，通过自动化 PostToolUse hooks 和四层文档体系实现需求全生命周期追溯。

## 核心价值

- **需求可追溯**：PRD → Spec → Plan → CHANGELOG 四层关联，每个变更都能回溯到原始需求
- **即时自动同步**：每次文件写入后立即触发 hook，PRD 和 CHANGELOG 实时更新，无需等待对话结束
- **边界保护**：Spec 和 Plan 文件只读，防止 AI 误改技术规范
- **TDD 友好**：测试文件变更不记录 CHANGELOG，仅生产代码写入才触发

## 文档体系

本模板采用四层文档追溯链，每个需求从提出到落地都有完整记录：

| 层级 | 文件 | 职责 | 写入者 |
|------|------|------|--------|
| Why  | `docs/PRD.md` | 需求索引，记录"要什么、为什么" | PostToolUse hook 自动 |
| What | `docs/superpowers/specs/*.md` | 技术规范，定义"是什么" | Superpowers 生成 |
| How  | `docs/superpowers/plans/*.md` | 实施计划，规划"怎么做" | Superpowers 生成 |
| Done | `docs/CHANGELOG.md` | 变更记录，关联需求标题 | PostToolUse hook 自动 |

### 需求标题规则

- 格式：`YYYY-MM-DD-<需求简要描述>`（如 `2026-05-27-登录页面设计文档`）
- 每个需求在 PRD.md 中有唯一条目，包含 Spec 和 Plan 路径引用
- 已废弃需求标记 `[Deprecated]`，移至"已废弃"区，不删除

### 追溯链示例

```
docs/PRD.md
  └── ### 2026-05-27-用户登录
        Spec: docs/superpowers/specs/2026-05-27-user-auth-design.md
        Plan: docs/superpowers/plans/2026-05-27-user-auth-impl.md

docs/CHANGELOG.md
  └── - 2026-05-27 新增 `auth.js`：JWT 认证核心逻辑 (2026-05-27-用户登录)
```

## 自动化 Hooks

本模板在 `.claude/settings.json` 注册两个 **PostToolUse** hook，在 Claude Code 每次调用 `Edit` / `Write` / `NotebookEdit` 工具后**立即触发**（不是对话结束后，而是每次文件操作后）。两个脚本职责分离，互不干扰。

```
Edit / Write / NotebookEdit 工具调用
          │
          ├──▶ sync-prd.js        只处理 spec/plan 文件
          │                       其他文件立即退出
          │
          └──▶ sync-changelog.js  只处理生产代码文件
                                  spec/plan/PRD/CHANGELOG/.claude/ 立即退出
```

### sync-prd.js — PRD 维护

**触发条件**：操作文件路径包含 `docs/superpowers/specs/` 或 `docs/superpowers/plans/`

| 文件类型 | 行为 |
|---------|------|
| 新 Spec（`specs/*.md`） | 在 PRD.md 的 `## 当前需求` 下追加条目，标题为 `YYYY-MM-DD-<Spec 首个 # 标题>` |
| 新 Plan（`plans/*.md`） | 找到对应 Spec 的 REQ 条目，写入 Plan 路径引用 |
| 找不到对应 Spec 的 Plan | 写入 PRD.md 的 `## 待整理` 区，等待人工关联 |
| 其他任何文件 | 立即退出，不做任何处理 |

### sync-changelog.js — CHANGELOG 维护

**触发条件**：操作文件不属于以下任一类别（否则立即退出）：
- `docs/superpowers/specs/` 或 `docs/superpowers/plans/`（交由 sync-prd.js 处理）
- `docs/PRD.md` 或 `docs/CHANGELOG.md`（防止循环写入）
- `.claude/` 下任意文件（hook 自身、配置等）
- 测试文件（匹配 `*.test.*`、`*_test.*`、`tests/`、`__tests__/`、`spec/`）

满足触发条件时执行：

| 工具 | CHANGELOG 区块 | 描述 |
|------|---------------|------|
| `Write`（新建文件） | `### Added` | 新增条目 |
| `Edit`（修改文件）  | `### Changed` | 变更条目 |

**CHANGELOG 条目格式：**

```
- YYYY-MM-DD 动作 `文件名`：简要描述 (需求标题)
```

- **日期**：条目写入当天日期
- **简要描述**：从工具输入自动提取
  - 单行改动 → 显示 `旧值 → 新值`（如 `placeholder="旧" → placeholder="新"`）
  - 单行新增 → 显示 `+新增内容`
  - 多行改动 → 显示 `+N 行 -M 行`
  - 新建 HTML → 提取 `<title>` 内容
  - 新建其他文件 → 提取首行有意义的注释
- **需求标题**：读取 PRD.md 中第一个"待实施"或"实施中"状态的需求标题；无活跃需求时省略括号
- **PRD 状态流转**：首次写入生产代码时，同步将 PRD 对应需求的"待实施"改为"实施中"

**Session 去重机制：**

同一 Claude Code 会话内，同文件 + 同动作（新增/修改）只写入一次，防止批量编辑产生重复条目。新会话（如第二天修 bug）自动重置去重状态，可正常追加新条目。状态持久化至 `.claude/hook-state.json`（已 gitignore）。

### SessionStart Hook：状态提示

会话开始时显示：

```
📋 PRD 索引同步 + 🦸 Superpowers 协作模式 已启用
```

## 协作规则

### 文件所有权边界

| 路径 | 权限 | 说明 |
|------|------|------|
| `docs/superpowers/specs/` | **只读** | Superpowers 生成，禁止手动修改 |
| `docs/superpowers/plans/` | **只读** | Superpowers 生成，禁止手动修改 |
| `docs/PRD.md` | 可写 | PostToolUse hook 自动维护，人工可补充编辑 |
| `docs/CHANGELOG.md` | 可写 | PostToolUse hook 自动维护，人工可补充编辑 |

### TDD 集成

| 阶段 | 变更内容 | CHANGELOG 行为 |
|------|---------|---------------|
| 红灯 | 仅测试文件 | **不写**，hook 直接退出 |
| 绿灯 | 生产代码（含配套测试） | 写 `### Added` / `### Changed` |
| 重构 | 代码结构调整 | 写 `### Changed` |

### 无关联需求的变更

无活跃需求时，CHANGELOG 条目省略括号（而非写 `[需求待补]`）。可手动在 PRD.md 的 `## 待整理` 区补充需求说明，等待正式化后重新关联。
