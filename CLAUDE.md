# 项目协作规则

## 文档体系
- `docs/PRD.md`:产品需求索引(要什么、为什么),通过 REQ-ID 关联到下游
- `docs/specs/`:Superpowers 产出的技术规范详情(怎么实现),只读
- `docs/plans/`:Superpowers 产出的实施计划,只读
- `docs/CHANGELOG.md`:代码变更记录,关联 REQ-ID
- 追溯链:PRD(为什么)→ Spec(是什么)→ Plan(怎么做)→ CHANGELOG(做了什么)

## REQ-ID 规则
- 格式:REQ-XXX(三位数字递增)
- 已废弃需求标记 [Deprecated],移到 ## 已废弃 区,不删除

## 文件所有权边界

### Superpowers 拥有(严禁修改)
- docs/specs/ 下所有文件
- docs/plans/ 下所有文件
- .claude/plugins/、.claude/skills/ 下所有内容

### 本工作流拥有
- docs/PRD.md
- docs/CHANGELOG.md
- .claude/settings.json、.claude/hooks/、.claude/commands/

## 主对话期间的行为约定

1. **新功能开场**:主动建议用 /brainstorming,而非直接编码
2. **写代码前**:必须声明对应 REQ-ID;若用户未指明且无法从 docs/PRD.md 匹配,停下来询问"这对应哪个 REQ?要不要先 /brainstorming?"
3. **看完整需求**:从 docs/PRD.md 找到 Spec 路径后读原文件,不要从 REQ 索引推断
4. **修改 Superpowers 产物**:绝不主动修改 docs/specs/、docs/plans/ 下文件;若用户要求调整,提示用 Superpowers 自己的命令重新生成

## TDD 与 CHANGELOG
- 红灯阶段(仅测试文件变更)不写 CHANGELOG
- 绿灯/refactor 阶段且 code-reviewer 通过后,视为完成工作单元

## 自动化说明
Stop hook 在每轮对话结束自动同步 docs/PRD.md 和 docs/CHANGELOG.md。
你(Claude)在主对话中仍应主动询问 REQ 归属,而不是依赖 hook 兜底。
