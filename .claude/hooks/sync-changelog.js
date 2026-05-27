#!/usr/bin/env node
/**
 * sync-changelog.js — PostToolUse hook（CHANGELOG 维护）
 *
 * 职责：追踪所有生产代码变更，维护 docs/CHANGELOG.md
 *
 * 触发：Edit / Write / NotebookEdit 工具执行后
 *
 * 处理规则：
 *  - 测试文件（*.test.*, *_test.*, tests/, __tests__/）跳过
 *  - spec/plan/PRD/CHANGELOG/.claude/ 文件跳过（由 sync-prd.js 或保护机制处理）
 *  - Write  → CHANGELOG ### Added（新建文件）
 *  - Edit   → CHANGELOG ### Changed（修改文件，含 bug fix、需求变更等）
 *  - 同一 Claude Code session 内同文件+同动作去重（防批量编辑重复追加）
 *  - 新 session（如第二天修 bug）自动重置去重状态，正常写入新条目
 *  - 首次写入代码时将对应 PRD REQ 状态从"待实施"更新为"实施中"
 *
 * 输入：从 stdin 读取 Claude Code 的 hook JSON
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = process.cwd();
const DEBUG_LOG = path.join(PROJECT_ROOT, '.claude', 'hook-debug.log');
const STATE_FILE = '.claude/hook-state.json';

// ─── 工具函数 ──────────────────────────────────────────────────────────────────

function dbg(...args) {
  const line = new Date().toISOString() + ' [changelog] ' + args.join(' ') + '\n';
  fs.appendFileSync(DEBUG_LOG, line, 'utf8');
}

function readFile(relPath) {
  return fs.readFileSync(path.join(PROJECT_ROOT, relPath), 'utf8');
}

function writeFile(relPath, content) {
  fs.writeFileSync(path.join(PROJECT_ROOT, relPath), content, 'utf8');
}

function today() {
  return new Date().toISOString().split('T')[0];
}

// ─── Session 级去重 ────────────────────────────────────────────────────────────

/**
 * 读取 session 级去重状态。
 * 结构：{ sessionId: string, processed: { "fileName:verb": true } }
 * 当 sessionId 变化时（新的 Claude Code 会话），自动清空 processed。
 */
function loadState(sessionId) {
  try {
    const state = JSON.parse(readFile(STATE_FILE));
    if (state.sessionId === sessionId) return state;
  } catch (e) { /* 文件不存在或格式错误，重新初始化 */ }
  return { sessionId, processed: {} };
}

function saveState(state) {
  try { writeFile(STATE_FILE, JSON.stringify(state)); }
  catch (e) { dbg('ERROR saving hook state:', e.message); }
}

// ─── 变更描述提取 ──────────────────────────────────────────────────────────────

/**
 * 从 tool_input 自动提取简要变更描述，用于 CHANGELOG 条目。
 *
 * Write（新文件）：
 *   - HTML → 提取 <title> 内容
 *   - 其他 → 提取首行有意义的注释或代码行
 *
 * Edit（修改）：
 *   - 1 行新增、0 行删除 → "+新增内容"
 *   - 0 行新增、1 行删除 → "-删除内容"
 *   - 1 行新增、1 行删除 → "旧 → 新"
 *   - 多行变化            → "+N 行 -M 行"
 */
function extractChangeDescription(toolName, toolInput) {
  try {
    if (toolName === 'Write') {
      const content = toolInput.content || '';
      // HTML：提取 <title>
      const titleMatch = content.match(/<title>([^<]+)<\/title>/i);
      if (titleMatch) return titleMatch[1].trim().slice(0, 60);
      // 首行有意义的注释或代码
      for (const raw of content.split('\n')) {
        const t = raw.trim();
        if (!t || t.length < 4) continue;
        if (/^(<!DOCTYPE|<html|<head|<body|\{|\}|\/\*\*?\s*$|\*\/|\*\s*$)/i.test(t)) continue;
        const fromComment = t.match(/^(?:\/\/|#|\/\*+)\s*(.{3,})/);
        if (fromComment) return fromComment[1].replace(/\*+\/$/, '').trim().slice(0, 60);
        return t.slice(0, 60);
      }
      return `新建 ${content.split('\n').length} 行`;
    }

    if (toolName === 'Edit') {
      const oldSet = new Set(
        (toolInput.old_string || '').split('\n').map(l => l.trim()).filter(l => l.length > 2)
      );
      const newArr = (toolInput.new_string || '').split('\n').map(l => l.trim()).filter(l => l.length > 2);
      const newSet = new Set(newArr);

      const added   = newArr.filter(l => !oldSet.has(l));
      const removed = [...oldSet].filter(l => !newSet.has(l));

      // 过滤掉纯符号行（括号、分号等）
      const isMere = l => /^[{}();,\[\]<>/!]+$/.test(l);
      const sigA = added.filter(l => !isMere(l));
      const sigR = removed.filter(l => !isMere(l));
      const a = sigA.length || added.length;
      const r = sigR.length || removed.length;
      const aFirst = (sigA[0] || added[0] || '').slice(0, 50);
      const rFirst = (sigR[0] || removed[0] || '').slice(0, 30);

      if (a === 1 && r === 0) return `+${aFirst}`;
      if (a === 0 && r === 1) return `-${rFirst}`;
      if (a === 1 && r === 1) return `${rFirst} → ${aFirst}`;
      const parts = [];
      if (a > 0) parts.push(`+${a} 行`);
      if (r > 0) parts.push(`-${r} 行`);
      return parts.join(' ') || '结构/格式调整';
    }
  } catch (e) { dbg('extractDesc error:', e.message); }
  return '';
}

// ─── PRD 工具函数 ──────────────────────────────────────────────────────────────

/**
 * 从 PRD 内容中找第一个处于"待实施"或"实施中"状态的需求。
 * 标题格式：### YYYY-MM-DD-<需求简要描述>
 * 返回 { id: 'YYYY-MM-DD-标题', status: '待实施' } 或 null。
 */
function findActiveReq(prdContent) {
  const reqHeaderRe = /### (\d{4}-\d{2}-\d{2}-.+)/g;
  let match;
  while ((match = reqHeaderRe.exec(prdContent)) !== null) {
    const reqTitle = match[1].trim();
    const block = prdContent.slice(match.index, prdContent.indexOf('\n###', match.index + 1) >>> 0 || undefined);
    const statusMatch = block.match(/\*\*状态\*\*:\s*(待实施|实施中)/);
    if (statusMatch) {
      return { id: reqTitle, status: statusMatch[1] };
    }
  }
  return null;
}

/**
 * 将 PRD 中指定需求的状态从"待实施"改为"实施中"。
 * 返回更新后的 PRD 内容，若无需更新则返回 null。
 */
function promotePrdStatus(prdContent, activeReq) {
  if (!activeReq || activeReq.status !== '待实施') return null;

  const reqBlockStart = prdContent.indexOf('### ' + activeReq.id);
  const reqBlockEnd = prdContent.indexOf('\n### ', reqBlockStart + 1);
  const reqBlock = reqBlockEnd > -1
    ? prdContent.slice(reqBlockStart, reqBlockEnd)
    : prdContent.slice(reqBlockStart);
  const updatedBlock = reqBlock.replace('- **状态**: 待实施', '- **状态**: 实施中');
  const newPrdContent = reqBlockEnd > -1
    ? prdContent.slice(0, reqBlockStart) + updatedBlock + prdContent.slice(reqBlockEnd)
    : prdContent.slice(0, reqBlockStart) + updatedBlock;

  dbg('REQ status: 待实施 → 实施中 for ' + activeReq.id);
  return newPrdContent;
}

// ─── main ────────────────────────────────────────────────────────────────────

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => (raw += chunk));
process.stdin.on('end', () => {
  try {
    dbg('--- hook fired, cwd=' + process.cwd());

    const cleaned = raw.replace(/^﻿/, ''); // 去 BOM
    const data = JSON.parse(cleaned);

    // 绝对路径 → 相对路径（Windows 盘符大小写不敏感）
    let rawPath = ((data.tool_input || {}).file_path || '').replace(/\\/g, '/');
    const rootNorm = PROJECT_ROOT.replace(/\\/g, '/');
    if (rawPath.toLowerCase().startsWith(rootNorm.toLowerCase() + '/')) {
      rawPath = rawPath.slice(rootNorm.length + 1);
    }
    const filePath = rawPath;
    const sessionId = data.session_id || 'unknown';

    dbg('tool=' + data.tool_name + ' filePath=' + filePath + ' session=' + sessionId);

    // ── 跳过不属于本脚本处理范围的文件 ────────────────────────────────────────
    if (!filePath) { dbg('SKIP: empty filePath'); process.exit(0); }

    // 跳过 PRD/CHANGELOG 自身（防循环）
    if (filePath === 'docs/PRD.md' || filePath === 'docs/CHANGELOG.md') {
      dbg('SKIP: PRD/CHANGELOG self-update guard');
      process.exit(0);
    }

    // 跳过 spec/plan 文件（由 sync-prd.js 处理）
    if (
      filePath.includes('docs/superpowers/specs/') ||
      filePath.includes('docs/superpowers/plans/')
    ) {
      dbg('SKIP: spec/plan file (handled by sync-prd.js)');
      process.exit(0);
    }

    // 跳过 .claude/ 内部文件（配置、hook 自身等）
    if (filePath.includes('.claude/')) {
      dbg('SKIP: .claude/ internal file');
      process.exit(0);
    }

    // 跳过测试文件
    const isTest = /(\.(test|spec)\.[^.]+$|[/\\](tests?|__tests?__|spec)[/\\])/i.test(filePath);
    if (isTest) {
      dbg('SKIP: test file');
      process.exit(0);
    }

    // ── 确定变更类型 ────────────────────────────────────────────────────────────
    const fileName = path.basename(filePath);
    const isNewFile = (data.tool_name === 'Write');
    const section = isNewFile ? '### Added' : '### Changed';
    const verb = isNewFile ? '新增' : '更新';

    // ── Session 级去重 ──────────────────────────────────────────────────────────
    const state = loadState(sessionId);
    const processKey = fileName + ':' + verb;
    if (state.processed[processKey]) {
      dbg('SKIP (session dedup): ' + processKey + ' already processed this session');
      process.exit(0);
    }

    // ── 读取 CHANGELOG ──────────────────────────────────────────────────────────
    let changelogContent;
    try { changelogContent = readFile('docs/CHANGELOG.md'); }
    catch (e) { dbg('ERROR reading CHANGELOG:', e.message); process.exit(0); }

    if (!changelogContent.includes(section)) {
      dbg('SKIP: section ' + section + ' not found in CHANGELOG');
      process.exit(0);
    }

    // ── 读取 PRD（获取活跃 REQ）────────────────────────────────────────────────
    let prdContent;
    try { prdContent = readFile('docs/PRD.md'); }
    catch (e) { dbg('ERROR reading PRD:', e.message); process.exit(0); }

    const activeReq = findActiveReq(prdContent);
    dbg('activeReq=' + (activeReq ? activeReq.id : 'none'));

    // ── 写入 CHANGELOG ──────────────────────────────────────────────────────────
    // 格式：- YYYY-MM-DD 动作 `文件名`：<简要描述> (需求标题)
    //       有关联需求时才加括号；无法提取描述时省略冒号部分
    const desc = extractChangeDescription(data.tool_name, data.tool_input || {});
    const descStr  = desc ? `：${desc}` : '';
    const reqSuffix = activeReq ? ` (${activeReq.id})` : '';
    const newChangelogContent = changelogContent.replace(
      section,
      `${section}\n- ${today()} ${verb} \`${fileName}\`${descStr}${reqSuffix}`
    );
    dbg('WRITING CHANGELOG: ' + today() + ' ' + verb + ' ' + fileName + descStr + reqSuffix);
    writeFile('docs/CHANGELOG.md', newChangelogContent);
    dbg('CHANGELOG updated successfully');

    // 标记本 session 已处理，防止同一批编辑重复追加
    state.processed[processKey] = true;
    saveState(state);
    dbg('session state updated: ' + processKey);

    // ── 更新 PRD REQ 状态：待实施 → 实施中 ─────────────────────────────────────
    const newPrdContent = promotePrdStatus(prdContent, activeReq);
    if (newPrdContent) {
      dbg('WRITING updated PRD');
      writeFile('docs/PRD.md', newPrdContent);
      dbg('PRD updated successfully');
    } else {
      dbg('no PRD status update needed');
    }

    process.exit(0);
  } catch (e) {
    dbg('UNCAUGHT ERROR:', e.message, e.stack);
    process.exit(0);
  }
});
