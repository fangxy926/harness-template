#!/usr/bin/env node
/**
 * sync-prd.js — PostToolUse hook（PRD 维护）
 *
 * 职责：维护 docs/PRD.md 的 REQ 注册表
 *
 * 触发：Edit / Write / NotebookEdit 工具执行后
 *
 * 只处理两类文件（其他文件立即退出）：
 *  1. docs/superpowers/specs/*.md  → 在 PRD 追加新 REQ 条目
 *  2. docs/superpowers/plans/*.md  → 在对应 REQ 条目关联 Plan 字段
 *
 * 输入：从 stdin 读取 Claude Code 的 hook JSON
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = process.cwd();
const DEBUG_LOG = path.join(PROJECT_ROOT, '.claude', 'hook-debug.log');

// ─── 工具函数 ──────────────────────────────────────────────────────────────────

function dbg(...args) {
  const line = new Date().toISOString() + ' [prd] ' + args.join(' ') + '\n';
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

// ─── 处理函数 ──────────────────────────────────────────────────────────────────

/** 处理新 spec 文件 → 在 PRD 追加需求条目 */
function handleSpec(filePath, prdContent) {
  const fileName = path.basename(filePath);
  dbg('handleSpec fileName=' + fileName);

  if (prdContent.includes(fileName)) {
    dbg('SKIP: already in PRD');
    return null;
  }

  let specContent;
  try { specContent = readFile(filePath); }
  catch (e) { dbg('ERROR reading spec:', e.message); return null; }

  const title = extractTitle(specContent);
  const summary = extractSummary(specContent);
  const reqHeading = today() + '-' + title;   // e.g. 2026-05-27-登录页面设计文档
  const anchor = '<!-- REQ 条目自动追加于此 -->';

  dbg('reqHeading=' + reqHeading + ' anchor_found=' + prdContent.includes(anchor));

  if (!prdContent.includes(anchor)) {
    dbg('ERROR: anchor not found in PRD');
    return null;
  }

  const entry = `\n### ${reqHeading}\n- **Spec**: ${filePath}\n- **摘要**: ${summary}\n`;
  return prdContent.replace(anchor, anchor + entry);
}

/**
 * 根据 plan 文件名自动匹配对应 spec 文件。
 *
 * 命名约定（brainstorming skill）：
 *   spec → YYYY-MM-DD-<topic>-design.md
 *   plan → YYYY-MM-DD-<topic>.md
 *
 * 匹配优先级（同一日期有多个 spec 时）：
 *   1. 精确匹配：spec 去掉已知设计后缀（-design/-spec/-requirements）后 === plan 主体名
 *   2. 前缀匹配：spec 主体名以 plan 主体名开头（兼容未带后缀的 spec）
 *   3. 以上均无匹配 → 返回 null（记为孤儿 plan）
 */
const DESIGN_SUFFIXES = ['-design', '-spec', '-requirements'];

function stripDesignSuffix(name) {
  for (const suf of DESIGN_SUFFIXES) {
    if (name.endsWith(suf)) return name.slice(0, -suf.length);
  }
  return name;
}

function findMatchingSpec(planFilePath) {
  const planBase = path.basename(planFilePath, '.md'); // e.g. "2026-05-28-login-page"
  const dateMatch = planBase.match(/^(\d{4}-\d{2}-\d{2})-(.+)$/);
  if (!dateMatch) { dbg('findMatchingSpec: no date in plan filename'); return null; }

  const [, date, planTopic] = dateMatch; // planTopic = "login-page"
  const specsDir = path.join(PROJECT_ROOT, 'docs', 'superpowers', 'specs');

  let specFiles;
  try { specFiles = fs.readdirSync(specsDir).filter(f => f.endsWith('.md')); }
  catch (e) { dbg('ERROR reading specs dir:', e.message); return null; }

  const sameDateSpecs = specFiles.filter(f => f.startsWith(date + '-'));
  dbg('sameDateSpecs=' + sameDateSpecs.join(','));

  if (sameDateSpecs.length === 0) return null;
  if (sameDateSpecs.length === 1) return sameDateSpecs[0];

  // 精确匹配：去掉 -design 等后缀后 topic 完全一致
  const exact = sameDateSpecs.find(f => {
    const specTopic = stripDesignSuffix(path.basename(f, '.md').slice(date.length + 1));
    dbg(`  exact check: specTopic=${specTopic} planTopic=${planTopic}`);
    return specTopic === planTopic;
  });
  if (exact) { dbg('matched (exact): ' + exact); return exact; }

  // 前缀匹配（兼容 spec 无标准后缀的情况）
  const prefix = sameDateSpecs.find(f => {
    const specTopic = path.basename(f, '.md').slice(date.length + 1);
    return specTopic.startsWith(planTopic);
  });
  if (prefix) { dbg('matched (prefix): ' + prefix); return prefix; }

  dbg('no match found among same-date specs');
  return null;
}

/** 处理新 plan 文件 → 在对应 REQ 条目追加 Plan 字段 */
function handlePlan(filePath, prdContent) {
  dbg('handlePlan filePath=' + filePath);

  if (prdContent.includes(`**Plan**: ${filePath}`)) {
    dbg('SKIP: plan already in PRD');
    return null;
  }

  const specFileName = findMatchingSpec(filePath);
  if (!specFileName) {
    dbg('SKIP: no matching spec found for plan');
    const anchor = '<!-- 无法关联到 spec 的推断需求,等待人工正式化 -->';
    if (!prdContent.includes(anchor)) return null;
    const entry = `\n- **Plan 孤儿**: ${filePath}（无法匹配对应 spec）\n`;
    dbg('adding orphan plan entry');
    return prdContent.replace(anchor, anchor + entry);
  }

  dbg('matched spec=' + specFileName);

  const specLineRe = new RegExp(
    `(\\- \\*\\*Spec\\*\\*: docs/superpowers/specs/${specFileName.replace(/\./g, '\\.')}[^\\n]*)`,
    'm'
  );

  if (!specLineRe.test(prdContent)) {
    dbg('SKIP: spec not found in PRD content');
    return null;
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

    const cleaned = raw.replace(/^﻿/, ''); // 去 BOM
    const data = JSON.parse(cleaned);

    // 绝对路径 → 相对路径（Windows 盘符大小写不敏感）
    let rawPath = ((data.tool_input || {}).file_path || '').replace(/\\/g, '/');
    const rootNorm = PROJECT_ROOT.replace(/\\/g, '/');
    if (rawPath.toLowerCase().startsWith(rootNorm.toLowerCase() + '/')) {
      rawPath = rawPath.slice(rootNorm.length + 1);
    }
    const filePath = rawPath;

    dbg('tool=' + data.tool_name + ' filePath=' + filePath);

    // 只处理 spec 和 plan 文件，其他立即退出
    const isSpec = filePath.includes('docs/superpowers/specs/') && filePath.endsWith('.md');
    const isPlan = filePath.includes('docs/superpowers/plans/') && filePath.endsWith('.md');
    if (!isSpec && !isPlan) {
      dbg('NOT a spec/plan file, skip');
      process.exit(0);
    }

    // 读取 PRD
    let prdContent;
    try { prdContent = readFile('docs/PRD.md'); }
    catch (e) { dbg('ERROR reading PRD:', e.message); process.exit(0); }

    const newPrdContent = isSpec
      ? handleSpec(filePath, prdContent)
      : handlePlan(filePath, prdContent);

    if (newPrdContent && newPrdContent !== prdContent) {
      dbg('WRITING updated PRD');
      writeFile('docs/PRD.md', newPrdContent);
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
