#!/usr/bin/env node
/**
 * sync-prd.js — PostToolUse hook
 *
 * 触发：Edit / Write / NotebookEdit 工具执行后
 *
 * 处理三类文件：
 *  1. docs/superpowers/specs/*.md  → 更新 PRD.md（新增 REQ 条目）
 *  2. docs/superpowers/plans/*.md  → 更新 PRD.md（关联 Plan 字段）
 *  3. 生产代码文件（其他路径）      → 更新 CHANGELOG.md + PRD.md REQ 状态
 *
 * 输入：从 stdin 读取 Claude Code 的 hook JSON
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = process.cwd();
const DEBUG_LOG = path.join(PROJECT_ROOT, '.claude', 'hook-debug.log');

// ─── 工具函数 ──────────────────────────────────────────────────────────────────

function dbg(...args) {
  const line = new Date().toISOString() + ' ' + args.join(' ') + '\n';
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

function extractTitle(content) {
  const m = content.match(/^#\s+(.+)/m);
  return m ? m[1].trim() : '未命名';
}

function extractSummary(content) {
  const lines = content.split('\n');
  let buf = '';
  let started = false;
  for (const line of lines) {
    if (line.startsWith('#')) continue;
    if (line.trim() === '') {
      if (started) break;
      continue;
    }
    started = true;
    buf += line + ' ';
    if (buf.length > 150) break;
  }
  return buf.trim().slice(0, 150);
}

function nextReqNum(prdContent) {
  const matches = prdContent.match(/REQ-(\d+)/g) || [];
  const max = matches.reduce((m, r) => {
    const n = parseInt(r.slice(4));
    return n > m ? n : m;
  }, 0);
  return String(max + 1).padStart(3, '0');
}

/**
 * 从 PRD 内容中找第一个处于"待实施"或"实施中"状态的 REQ-ID。
 * 返回 { id: 'REQ-001', status: '待实施' } 或 null。
 */
function findActiveReq(prdContent) {
  const reqHeaderRe = /### (REQ-\d+):/g;
  let match;
  while ((match = reqHeaderRe.exec(prdContent)) !== null) {
    const reqId = match[1];
    // 取这个 REQ 块（到下一个 ### 或文末）
    const block = prdContent.slice(match.index, prdContent.indexOf('\n###', match.index + 1) >>> 0 || undefined);
    const statusMatch = block.match(/\*\*状态\*\*:\s*(待实施|实施中)/);
    if (statusMatch) {
      return { id: reqId, status: statusMatch[1] };
    }
  }
  return null;
}

// ─── 三类处理函数 ──────────────────────────────────────────────────────────────

/** 处理新 spec 文件 → 在 PRD 追加 REQ 条目 */
function handleSpec(filePath, prdContent) {
  const fileName = path.basename(filePath);
  dbg('handleSpec fileName=' + fileName);

  if (prdContent.includes(fileName)) {
    dbg('SKIP: already in PRD');
    return { prdUpdate: null };
  }

  let specContent;
  try { specContent = readFile(filePath); }
  catch (e) { dbg('ERROR reading spec:', e.message); return { prdUpdate: null }; }

  const title = extractTitle(specContent);
  const summary = extractSummary(specContent);
  const num = nextReqNum(prdContent);
  const anchor = '<!-- REQ 条目自动追加于此 -->';

  dbg('title=' + title + ' num=' + num + ' anchor_found=' + prdContent.includes(anchor));

  if (!prdContent.includes(anchor)) {
    dbg('ERROR: anchor not found in PRD');
    return { prdUpdate: null };
  }

  const entry = `\n### REQ-${num}: ${title}\n- **Spec**: ${filePath}\n- **状态**: 待实施\n- **创建**: ${today()}\n- **摘要**: ${summary}\n`;
  return { prdUpdate: prdContent.replace(anchor, anchor + entry) };
}

/** 处理新 plan 文件 → 在对应 REQ 条目追加 Plan 字段 */
function handlePlan(filePath, prdContent) {
  dbg('handlePlan filePath=' + filePath);

  if (prdContent.includes(`**Plan**: ${filePath}`)) {
    dbg('SKIP: plan already in PRD');
    return { prdUpdate: null };
  }

  let planContent;
  try { planContent = readFile(filePath); }
  catch (e) { dbg('ERROR reading plan:', e.message); return { prdUpdate: null }; }

  const specMatch = planContent.match(/docs\/superpowers\/specs\/([\w\-\.]+\.md)/);
  if (!specMatch) {
    dbg('SKIP: no spec reference in plan');
    return { prdUpdate: null };
  }

  const specFileName = specMatch[1];
  dbg('referenced spec=' + specFileName);

  const specLineRe = new RegExp(
    `(\\- \\*\\*Spec\\*\\*: docs/superpowers/specs/${specFileName.replace(/\./g, '\\.')}[^\\n]*)`,
    'm'
  );

  if (!specLineRe.test(prdContent)) {
    const anchor = '<!-- 无法关联到 spec 的推断需求,等待人工正式化 -->';
    if (!prdContent.includes(anchor)) return { prdUpdate: null };
    const entry = `\n- **Plan 孤儿**: ${filePath}（未找到对应 spec: ${specFileName}）\n`;
    dbg('adding orphan plan entry');
    return { prdUpdate: prdContent.replace(anchor, anchor + entry) };
  }

  dbg('adding plan to REQ entry');
  return { prdUpdate: prdContent.replace(specLineRe, `$1\n- **Plan**: ${filePath}`) };
}

const STATE_FILE = '.claude/hook-state.json';

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

/**
 * 处理生产代码文件 → 更新 CHANGELOG.md + PRD REQ 状态
 *
 * 规则：
 *  - 测试文件（*.test.*, *_test.*, tests/, __tests__/）跳过
 *  - 同一 Claude Code session 内，同文件+同动作去重（防止批量编辑重复追加）
 *  - 新 session（如第二天修 bug）总是写入新条目
 *  - Write  → CHANGELOG ### Added
 *  - Edit   → CHANGELOG ### Changed
 *  - 首次写入时将对应 REQ 状态从"待实施"改为"实施中"
 */
function handleCodeChange(filePath, toolName, prdContent, sessionId) {
  const fileName = path.basename(filePath);
  dbg('handleCodeChange fileName=' + fileName + ' tool=' + toolName);

  // 排除测试文件
  const isTest = /(\.(test|spec)\.[^.]+$|[/\\](tests?|__tests?__|spec)[/\\])/i.test(filePath);
  if (isTest) {
    dbg('SKIP: test file');
    return { prdUpdate: null, changelogUpdate: null };
  }

  // 确定变更类型（放到去重检查前，processKey 需要 verb）
  const isNewFile = (toolName === 'Write');
  const section = isNewFile ? '### Added' : '### Changed';
  const verb = isNewFile ? '新增' : '更新';

  // Session 级去重：同一 session 内同文件+同动作只记录一次
  const state = loadState(sessionId);
  const processKey = fileName + ':' + verb;
  if (state.processed[processKey]) {
    dbg('SKIP (session dedup): ' + processKey + ' already processed this session');
    return { prdUpdate: null, changelogUpdate: null };
  }

  // 读取 CHANGELOG
  let changelogContent;
  try { changelogContent = readFile('docs/CHANGELOG.md'); }
  catch (e) { dbg('ERROR reading CHANGELOG:', e.message); return { prdUpdate: null, changelogUpdate: null }; }

  // 找当前活跃的 REQ
  const activeReq = findActiveReq(prdContent);
  const reqId = activeReq ? activeReq.id : '[需求待补]';
  dbg('activeReq=' + reqId);

  if (!changelogContent.includes(section)) {
    dbg('SKIP: section ' + section + ' not found in CHANGELOG');
    return { prdUpdate: null, changelogUpdate: null };
  }

  // 插入 CHANGELOG 条目（在 section 标题后紧接）
  const newChangelogContent = changelogContent.replace(
    section,
    `${section}\n- ${verb} \`${fileName}\` (${reqId})`
  );
  dbg('WRITING CHANGELOG: ' + verb + ' ' + fileName + ' (' + reqId + ')');
  writeFile('docs/CHANGELOG.md', newChangelogContent);
  dbg('CHANGELOG updated successfully');

  // 标记本 session 已处理，防止同一批编辑重复追加
  state.processed[processKey] = true;
  saveState(state);
  dbg('session state updated: ' + processKey);

  // 更新 PRD 中 REQ 状态：待实施 → 实施中
  let newPrdContent = null;
  if (activeReq && activeReq.status === '待实施') {
    // 只更新该 REQ 块内的第一个"待实施"
    const reqBlockStart = prdContent.indexOf('### ' + activeReq.id + ':');
    const reqBlockEnd = prdContent.indexOf('\n### ', reqBlockStart + 1);
    const reqBlock = reqBlockEnd > -1
      ? prdContent.slice(reqBlockStart, reqBlockEnd)
      : prdContent.slice(reqBlockStart);
    const updatedBlock = reqBlock.replace('- **状态**: 待实施', '- **状态**: 实施中');
    newPrdContent = reqBlockEnd > -1
      ? prdContent.slice(0, reqBlockStart) + updatedBlock + prdContent.slice(reqBlockEnd)
      : prdContent.slice(0, reqBlockStart) + updatedBlock;
    dbg('REQ status: 待实施 → 实施中 for ' + activeReq.id);
  }

  return { prdUpdate: newPrdContent, changelogUpdate: newChangelogContent };
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

    // 快速短路：不处理 PRD/CHANGELOG/配置文件 本身（防止循环）
    if (
      !filePath ||
      filePath === 'docs/PRD.md' ||
      filePath === 'docs/CHANGELOG.md' ||
      filePath.includes('.claude/')
    ) {
      dbg('SHORT_CIRCUIT for ' + filePath);
      process.exit(0);
    }

    // 读取 PRD（所有分支都需要）
    let prdContent;
    try { prdContent = readFile('docs/PRD.md'); }
    catch (e) { dbg('ERROR reading PRD:', e.message); process.exit(0); }

    let result;

    if (filePath.includes('docs/superpowers/specs/') && filePath.endsWith('.md')) {
      result = handleSpec(filePath, prdContent);
    } else if (filePath.includes('docs/superpowers/plans/') && filePath.endsWith('.md')) {
      result = handlePlan(filePath, prdContent);
    } else {
      // 生产代码文件
      result = handleCodeChange(filePath, data.tool_name, prdContent, sessionId);
    }

    // 写回 PRD（如有更新）
    if (result.prdUpdate && result.prdUpdate !== prdContent) {
      dbg('WRITING updated PRD');
      writeFile('docs/PRD.md', result.prdUpdate);
      dbg('PRD updated successfully');
    } else {
      dbg('no PRD update needed');
    }

    process.exit(0);
  } catch (e) {
    dbg('UNCAUGHT ERROR:', e.message, e.stack);
    process.exit(0);
  }
});
