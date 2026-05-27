# 项目协作规则

## 文档体系
- `docs/PRD.md`:产品需求索引(要什么、为什么),通过 REQ-ID 关联到下游
- `docs/superpowers/specs/`:Superpowers 产出的技术规范详情(怎么实现),只读
- `docs/superpowers/plans/`:Superpowers 产出的实施计划,只读
- `docs/CHANGELOG.md`:代码变更记录,关联 REQ-ID
- 追溯链:PRD(为什么)→ Spec(是什么)→ Plan(怎么做)→ CHANGELOG(做了什么)

## REQ-ID 规则
- 格式:REQ-XXX(三位数字递增)
- 已废弃需求标记 [Deprecated],移到 ## 已废弃 区,不删除

## 文件所有权边界

### 收保护的文件(严禁修改)
- docs/superpowers/specs/ 下所有文件
- docs/superpowers/plans/ 下所有文件

### 本项目拥有
- docs/PRD.md
- docs/CHANGELOG.md

## TDD 与 CHANGELOG
- 红灯阶段(仅测试文件变更)不写 CHANGELOG
- 绿灯/refactor 阶段且 code-reviewer 通过后,视为完成工作单元

## 维护流程
- PRD/CHANGELOG 由 `.claude/settings.json` 的 PostToolUse hook(挂在 Edit/Write/NotebookEdit 上)调度的文档同步 agent 自动维护
- 该 agent 仅在文件实际变更后触发,brainstorming 等纯对话轮次不会跑
- 红灯阶段(仅测试文件)不触发任何记录,等绿灯阶段一次性写入 CHANGELOG