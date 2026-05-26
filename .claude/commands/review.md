---
description: 审查 PRD、Spec、Plan、CHANGELOG 的四层一致性
---

请按以下步骤审查项目文档健康度:

## 1. 读取索引
- docs/PRD.md
- docs/CHANGELOG.md
- 列出 docs/superpowers/specs/ 和 docs/superpowers/plans/ 下所有文件(只读)

## 2. 一致性检查
对每条 REQ:
- Spec 路径指向的文件是否存在
- 若状态=实施中或已实现,Plan 路径是否存在且文件存在
- CHANGELOG 中是否有关联条目

## 3. 异常清单
- **孤儿 spec**:docs/superpowers/specs/ 中存在但无 REQ 引用
- **孤儿 plan**:docs/superpowers/plans/ 中存在但无 REQ 引用
- **悬空 REQ**:状态非"已废弃"但 Spec 文件不存在
- **久未实施**:创建超过 7 天仍为"待实施"
- **无 REQ 变更**:CHANGELOG 中标 [需求待补] 的条目
- **待整理需求**:docs/PRD.md 的 ## 待整理 区所有条目

## 4. 建议
对每个异常给出处理建议,**不自动修复**,等用户确认。

特别注意:绝不修改 docs/superpowers/specs/、docs/superpowers/plans/ 下任何文件。
