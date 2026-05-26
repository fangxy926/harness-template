#!/bin/bash
# 每轮结束做快照,同时监控受保护路径是否被越界修改
mkdir -p .claude/snapshots
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
git diff HEAD > ".claude/snapshots/diff_${TIMESTAMP}.patch" 2>/dev/null
git status --porcelain > ".claude/snapshots/status_${TIMESTAMP}.txt" 2>/dev/null

# 受保护路径正则
PROTECTED_REGEX="^(docs/superpowers/specs/|docs/superpowers/plans/|\.claude/plugins/|\.claude/skills/)"

if git diff --name-only HEAD 2>/dev/null | grep -E "$PROTECTED_REGEX" > /dev/null; then
  echo "[$(date)] WARN: 受保护路径出现变更,请人工核查" >> .claude/snapshots/protected-paths.log
  git diff --name-only HEAD | grep -E "$PROTECTED_REGEX" >> .claude/snapshots/protected-paths.log
fi
exit 0
