# Harness Template

Claude Code 项目模板，集成 [Superpowers](https://github.com/anthropics/claude-code-superpowers) 插件，通过自动化 hooks 和文档体系实现需求全生命周期追溯。

## 核心价值

- **需求可追溯**：PRD → Spec → Plan → CHANGELOG 四层关联，每个变更都能回溯到原始需求
- **自动化同步**：Stop hook 自动扫描 Superpowers 产物，维护索引和变更记录
- **边界保护**：Spec 和 Plan 文件只读，防止 AI 误改技术规范
- **TDD 友好**：红灯阶段不记录 CHANGELOG，绿灯/refactor 完成后才标记工作单元完成

## 文档体系

本模板采用四层文档追溯链，每个需求从提出到落地都有完整记录：

| 层级 | 文件 | 职责 | 写入者 |
|------|------|------|--------|
| Why | `docs/PRD.md` | 需求索引，记录"要什么、为什么" | Stop hook 自动 |
| What | `docs/superpowers/specs/*.md` | 技术规范，定义"是什么" | Superpowers 生成 |
| How | `docs/superpowers/plans/*.md` | 实施计划，规划"怎么做" | Superpowers 生成 |
| Done | `docs/CHANGELOG.md` | 变更记录，关联 REQ-ID | Stop hook 自动 |

### REQ-ID 规则

- 格式：`REQ-XXX`（三位数字递增，如 REQ-001、REQ-002）
- 每个需求在 PRD.md 中有唯一条目，包含 Spec 和 Plan 路径引用
- 已废弃需求标记 `[Deprecated]`，移至"已废弃"区，不删除

### 追溯链示例

```
PRD.md (REQ-042: 用户登录)
  └→ Spec: docs/superpowers/specs/2026-05-27-user-auth-design.md
  └→ Plan: docs/superpowers/plans/2026-05-27-user-auth-impl.md
  └→ CHANGELOG: "实现 JWT 认证 (REQ-042)"
```

## 自动化机制

本模板通过 Claude Code hooks 实现文档自动同步，无需手动维护索引。

### Stop Hook：文档同步

每轮对话结束时，自动执行以下流程：

1. **扫描 Superpowers 产物**
   - 检测 `docs/superpowers/specs/` 和 `docs/superpowers/plans/` 下的新增文件
   - 读取文件标题和摘要

2. **更新 PRD 索引**
   - 新 Spec → 在 `docs/PRD.md` 追加 REQ 条目（自动生成 REQ-ID）
   - 新 Plan → 关联到对应 REQ 条目
   - 无法关联的产物 → 移至"待整理"区等待人工处理

3. **记录代码变更**
   - 检测 `git diff` 中的生产代码变更
   - 在 `docs/CHANGELOG.md` 对应分类追加条目，关联 REQ-ID
   - 仅测试文件变更（红灯阶段）→ 跳过 CHANGELOG，记录到 TDD 日志

### SessionStart Hook：状态提示

会话开始时显示协作模式状态：

```
📋 PRD 索引同步 + 🦸 Superpowers 协作模式 已启用
```

### 快照机制

每轮结束自动保存：
- `git diff` 补丁文件
- `git status` 状态文件
- 受保护路径变更告警日志

所有快照存储在 `.claude/snapshots/`（已 gitignore）。

## 协作规则

### 文件所有权边界

| 路径 | 权限 | 说明 |
|------|------|------|
| `docs/superpowers/specs/` | **只读** | Superpowers 生成的技术规范，禁止手动修改 |
| `docs/superpowers/plans/` | **只读** | Superpowers 生成的实施计划，禁止手动修改 |
| `docs/PRD.md` | 可写 | Stop hook 自动维护，人工可编辑 |
| `docs/CHANGELOG.md` | 可写 | Stop hook 自动维护，人工可编辑 |

> 受保护路径的所有变更都会触发告警日志（`.claude/snapshots/protected-paths.log`）。

### TDD 集成

本模板对测试驱动开发有明确的阶段感知：

| 阶段 | 代码变更 | CHANGELOG 行为 |
|------|----------|----------------|
| 红灯 | 仅测试文件 | **不写** CHANGELOG，记录到 `tdd-progress.log` |
| 绿灯 | 生产代码 + 测试 | 写 CHANGELOG，标记工作单元完成 |
| 重构 | 代码结构调整 | 写 CHANGELOG，code-reviewer 通过后视为完成 |

**测试文件识别规则**：匹配 `*.test.*`、`*_test.*`、`tests/`、`spec/`、`__tests__/` 模式的文件视为测试文件。

### REQ-ID 关联规则

- 所有 CHANGELOG 条目必须关联 REQ-ID
- 无法找到 REQ-ID 的变更标记为 `[需求待补]`
- Stop hook 会自动在 PRD.md 的"待整理"区推断条目，等待人工正式化

## 审查命令

### /review

执行文档一致性审查，检查四层文档的健康状态。

**检查项目：**

| 检查类型 | 说明 |
|----------|------|
| 孤儿 Spec | Spec 文件存在但无 REQ 引用 |
| 孤儿 Plan | Plan 文件存在但无 REQ 引用 |
| 悬空 REQ | REQ 状态非"已废弃"但 Spec 文件不存在 |
| 久未实施 | 创建超过 7 天仍为"待实施" |
| 无 REQ 变更 | CHANGELOG 中标 `[需求待补]` 的条目 |
| 待整理需求 | PRD.md 的"待整理"区所有条目 |

**使用方式：**

```
/review
```

**输出：**
- 列出所有异常项
- 对每个异常给出处理建议
- **不自动修复**，等待用户确认

> 注意：审查过程中绝不修改 `docs/superpowers/specs/` 和 `docs/superpowers/plans/` 下的任何文件。
