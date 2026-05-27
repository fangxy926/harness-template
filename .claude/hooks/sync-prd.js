#!/usr/bin/env node
/**
 * sync-prd.js — PostToolUse hook
 * 监听 Edit/Write/NotebookEdit，当 docs/superpowers/specs/ 或 plans/ 下有新文件时，
 * 自动同步 docs/PRD.md 的 REQ 索引。
 *
 * 输入：从 stdin 读取 Claude Code 的 hook JSON
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = process.cwd();
const DEBUG_LOG = path.join(PROJECT_ROOT, '.claude', 'hook-debug.log');

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

function handleSpec(filePath, prdContent) {
  const fileName = path.basename(filePath);
  dbg('handleSpec fileName=' + fileName);

  // 去重：已存在就跳过
  if (prdContent.includes(fileName)) {
    dbg('SKIP: already in PRD');
    return null;
  }

  let specContent;
  try {
    specContent = readFile(filePath);
  } catch (e) {
    dbg('ERROR reading spec:', e.message);
    return null;
  }

  const title = extractTitle(specContent);
  const summary = extractSummary(specContent);
  const num = nextReqNum(prdContent);
  const anchor = '<!-- REQ 条目自动追加于此 -->';

  dbg('title=' + title + ' num=' + num + ' anchor_found=' + prdContent.includes(anchor));

  if (!prdContent.includes(anchor)) {
    dbg('ERROR: anchor not found in PRD');
    return null;
  }

  const entry = `\n### REQ-${num}: ${title}\n- **Spec**: ${filePath}\n- **状态**: 待实施\n- **创建**: ${today()}\n- **摘要**: ${summary}\n`;

  return prdContent.replace(anchor, anchor + entry);
}

function handlePlan(filePath, prdContent) {
  dbg('handlePlan filePath=' + filePath);

  // 已存在就跳过
  if (prdContent.includes(`**Plan**: ${filePath}`)) {
    dbg('SKIP: plan already in PRD');
    return null;
  }

  let planContent;
  try {
    planContent = readFile(filePath);
  } catch (e) {
    dbg('ERROR reading plan:', e.message);
    return null;
  }

  const head = planContent.split('\n').slice(0, 80).join('\n');
  const specMatch = head.match(/docs\/superpowers\/specs\/([\w\-\.]+\.md)/);
  if (!specMatch) {
    dbg('SKIP: no spec reference in plan');
    return null;
  }

  const specFileName = specMatch[1];
  dbg('referenced spec=' + specFileName);

  const specLineRe = new RegExp(
    `(\\- \\*\\*Spec\\*\\*: docs/superpowers/specs/${specFileName.replace(/\./g, '\\.')}[^\\n]*)`,
    'm'
  );

  if (!specLineRe.test(prdContent)) {
    // 找不到对应 REQ，追加到待整理区
    const anchor = '<!-- 无法关联到 spec 的推断需求,等待人工正式化 -->';
    if (!prdContent.includes(anchor)) return null;
    const entry = `\n- **Plan 孤儿**: ${filePath}（未找到对应 spec: ${specFileName}）\n`;
    dbg('adding orphan plan entry');
    return prdContent.replace(anchor, anchor + entry);
  }

  dbg('adding plan to REQ entry');
  return prdContent.replace(specLineRe, `$1\n- **Plan**: ${filePath}`);
}

// ─── main ────────────────────────────────────────────────────────────────────

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => (raw += chunk));
process.stdin.on('end', () => {
  try {
    dbg('--- hook fired, cwd=' + process.cwd());

    // 去除 BOM（Windows PowerShell 可能添加）
    const cleaned = raw.replace(/^﻿/, '');
    const data = JSON.parse(cleaned);

    // 绝对路径转相对路径（Claude Code 传入的是绝对路径）
    let rawPath = ((data.tool_input || {}).file_path || '').replace(/\\/g, '/');
    const rootNorm = PROJECT_ROOT.replace(/\\/g, '/');
    // Windows 盘符可能大小写不一致，用小写比较
    if (rawPath.toLowerCase().startsWith(rootNorm.toLowerCase() + '/')) {
      rawPath = rawPath.slice(rootNorm.length + 1);
    }
    const filePath = rawPath;

    dbg('tool=' + data.tool_name + ' filePath=' + filePath);

    // 快速短路
    if (
      !filePath ||
      filePath === 'docs/PRD.md' ||
      filePath === 'docs/CHANGELOG.md' ||
      filePath.includes('.claude/') ||
      !filePath.includes('docs/superpowers/')
    ) {
      dbg('SHORT_CIRCUIT for ' + filePath);
      process.exit(0);
    }

    const prdPath = 'docs/PRD.md';
    let prdContent;
    try {
      prdContent = readFile(prdPath);
    } catch (e) {
      dbg('ERROR reading PRD:', e.message);
      process.exit(0);
    }

    let newContent = null;

    if (filePath.includes('docs/superpowers/specs/') && filePath.endsWith('.md')) {
      newContent = handleSpec(filePath, prdContent);
    } else if (filePath.includes('docs/superpowers/plans/') && filePath.endsWith('.md')) {
      newContent = handlePlan(filePath, prdContent);
    }

    if (newContent && newContent !== prdContent) {
      dbg('WRITING updated PRD');
      writeFile(prdPath, newContent);
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
