#!/usr/bin/env node
/**
 * sync-changelog.js — PostToolUse hook（CHANGELOG 维护）
 *
 * 职责：将 git commit 信息写入 docs/CHANGELOG.md
 *
 * 触发：Bash 工具执行后
 *
 * 处理规则：
 *  - 非 git commit 命令跳过
 *  - 比对 HEAD hash 判断本次提交是否成功（避免依赖 tool_response 格式）
 *  - commit subject 作为变更描述，conventional commit 前缀决定区块
 *  - 通过 git show 取变更文件列表，匹配 plan → PRD 需求
 *  - spec/plan/.claude/ 等内部文件不计入变更文件
 */

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_ROOT = process.cwd();
const DEBUG_LOG    = path.join(PROJECT_ROOT, '.claude', 'hook-debug.log');
const STATE_FILE   = '.claude/hook-state.json';

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

function nowTimestamp() {
  const d   = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function run(cmd) {
  return execSync(cmd, { cwd: PROJECT_ROOT, encoding: 'utf8' }).trim();
}

// ─── 状态管理（持久化跨 session）──────────────────────────────────────────────

function loadState() {
  try { return JSON.parse(readFile(STATE_FILE)); } catch (e) { return {}; }
}

function saveState(state) {
  try { writeFile(STATE_FILE, JSON.stringify(state, null, 2)); } catch (e) { dbg('ERROR saving state:', e.message); }
}

// ─── CHANGELOG 区块 ────────────────────────────────────────────────────────────

/**
 * 根据 conventional commit 前缀决定写入哪个区块，直接对应类型名。
 * 未知类型回退到 ### chore。
 */
function getSection(subject) {
  const type  = (subject.match(/^(\w+)[\(:!]/) || [])[1] || '';
  const valid = ['feat','fix','docs','style','refactor','perf','test','chore'];
  return `### ${valid.includes(type) ? type : 'chore'}`;
}

/**
 * 若 section 不存在，将其插入 ## [Unreleased] 块尾（下一个 ## 之前）。
 */
function ensureSection(changelog, section) {
  if (changelog.includes(section)) return changelog;
  const unrelIdx = changelog.indexOf('## [Unreleased]');
  if (unrelIdx === -1) return changelog + `\n${section}\n`;
  const nextH2 = changelog.indexOf('\n## ', unrelIdx + 1);
  const ins     = nextH2 > -1 ? nextH2 : changelog.length;
  return changelog.slice(0, ins) + `\n${section}\n` + changelog.slice(ins);
}

// ─── 变更文件过滤 ──────────────────────────────────────────────────────────────

function isProductionFile(file) {
  if (!file) return false;
  if (file.includes('docs/superpowers/')) return false;
  if (file === 'docs/PRD.md' || file === 'docs/CHANGELOG.md') return false;
  // 跳过 .claude/ 下的配置/状态文件，但保留 hooks/ 脚本（有意义的代码变更）
  if (file.startsWith('.claude/') && !file.startsWith('.claude/hooks/')) return false;
  if (/(\.(test|spec)\.[^.]+$|[/\\](tests?|__tests?__|spec)[/\\])/i.test(file)) return false;
  return true;
}

function getChangedFiles() {
  const output = run('git show --name-status --format= HEAD');
  return output.split('\n').filter(Boolean).map(line => {
    const parts = line.split('\t');
    const status = parts[0].trim()[0]; // A / M / D / R
    const file   = parts[parts.length - 1].trim().replace(/\\/g, '/');
    return { status, file };
  }).filter(({ file }) => isProductionFile(file));
}

// ─── PRD 需求匹配 ──────────────────────────────────────────────────────────────

function extractSpecPath(block) {
  const m = block.match(/\*\*Spec\*\*:\s*(\S+)/);
  return m ? m[1] : null;
}

function findFirstReq(prdContent) {
  const match = /### (\d{4}-\d{2}-\d{2}-.+)/.exec(prdContent);
  if (!match) return null;
  const title      = match[1].trim();
  const blockStart = prdContent.indexOf('### ' + title);
  const blockEnd   = prdContent.indexOf('\n### ', blockStart + 1);
  const block      = blockEnd > -1 ? prdContent.slice(blockStart, blockEnd) : prdContent.slice(blockStart);
  return { id: title, specPath: extractSpecPath(block) };
}

function findReqByFiles(files, prdContent) {
  const plansDir = path.join(PROJECT_ROOT, 'docs', 'superpowers', 'plans');
  let planFiles = [];
  try { planFiles = fs.readdirSync(plansDir).filter(f => f.endsWith('.md')); } catch (e) {}

  // 收集所有「plan 文件内容提及任一变更文件」的候选项
  const candidates = [];
  for (const planFile of planFiles) {
    let planContent = '';
    try { planContent = fs.readFileSync(path.join(PROJECT_ROOT, 'docs/superpowers/plans', planFile), 'utf8'); } catch (e) { continue; }

    const mentioned = files.some(({ file }) =>
      planContent.includes(file) || planContent.includes(path.basename(file))
    );
    if (!mentioned) continue;

    const planRef     = `docs/superpowers/plans/${planFile}`;
    const planLineIdx = prdContent.indexOf(`**Plan**: ${planRef}`);
    if (planLineIdx === -1) continue;

    const before   = prdContent.slice(0, planLineIdx);
    const headings = [...before.matchAll(/### (\d{4}-\d{2}-\d{2}-[^\n]+)/g)];
    if (!headings.length) continue;

    const reqTitle   = headings[headings.length - 1][1].trim();
    const blockStart = prdContent.lastIndexOf('### ' + reqTitle, planLineIdx);
    const blockEnd   = prdContent.indexOf('\n### ', blockStart + 1);
    const block      = blockEnd > -1 ? prdContent.slice(blockStart, blockEnd) : prdContent.slice(blockStart);
    candidates.push({ planFile, planRef, reqTitle, specPath: extractSpecPath(block) });
  }

  if (candidates.length === 0) {
    dbg('findReqByFiles: no match, fallback to first REQ');
    return findFirstReq(prdContent);
  }

  if (candidates.length === 1) {
    dbg(`findReqByFiles: single match → ${candidates[0].reqTitle}`);
    return { id: candidates[0].reqTitle, specPath: candidates[0].specPath };
  }

  // 多个候选：取 plan 文件最近一次 git commit 时间戳最大的那个
  const withDates = candidates.map(c => {
    let commitTime = 0;
    try { commitTime = parseInt(run(`git log -1 --format=%ct -- "${c.planRef}"`), 10) || 0; } catch (e) {}
    return { ...c, commitTime };
  });
  withDates.sort((a, b) => b.commitTime - a.commitTime);
  const winner = withDates[0];
  dbg(`findReqByFiles: ${candidates.length} candidates, newest plan commit → ${winner.reqTitle} (${winner.planFile})`);
  return { id: winner.reqTitle, specPath: winner.specPath };
}


// ─── main ────────────────────────────────────────────────────────────────────

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => (raw += chunk));
process.stdin.on('end', () => {
  try {
    dbg('--- hook fired, cwd=' + process.cwd());
    const data = JSON.parse(raw.replace(/^﻿/, ''));

    if (data.tool_name !== 'Bash') { dbg('SKIP: not Bash'); process.exit(0); }

    const cmd = (data.tool_input?.command || '').trim();
    dbg('cmd=' + cmd.slice(0, 120));

    if (!/\bgit\b.*\bcommit\b/.test(cmd) || /--dry-run/.test(cmd)) {
      dbg('SKIP: not a git commit command');
      process.exit(0);
    }

    // ── 通过 HEAD hash 变化判断提交是否成功 ──────────────────────────────────
    let currentHash;
    try { currentHash = run('git log -1 --format=%H'); } catch (e) {
      dbg('SKIP: git log failed:', e.message); process.exit(0);
    }

    const state = loadState();
    if (state.lastProcessedCommit === currentHash) {
      dbg('SKIP: commit already processed: ' + currentHash.slice(0, 8));
      process.exit(0);
    }

    // ── 取 commit 信息 ────────────────────────────────────────────────────────
    const subject = run('git log -1 --format=%s');
    dbg('commit: ' + currentHash.slice(0, 8) + ' ' + subject);

    // ── 取变更的生产文件 ──────────────────────────────────────────────────────
    const changedFiles = getChangedFiles();
    dbg('changedFiles: ' + changedFiles.map(f => f.status + ':' + f.file).join(', '));

    if (!changedFiles.length) {
      dbg('SKIP: no production files in this commit');
      state.lastProcessedCommit = currentHash;
      saveState(state);
      process.exit(0);
    }

    // ── 读 CHANGELOG / PRD ────────────────────────────────────────────────────
    let changelogContent, prdContent;
    try { changelogContent = readFile('docs/CHANGELOG.md'); } catch (e) { dbg('ERROR reading CHANGELOG:', e.message); process.exit(0); }
    try { prdContent       = readFile('docs/PRD.md');       } catch (e) { dbg('WARN: PRD not readable, req link skipped'); prdContent = ''; }

    const section   = getSection(subject);
    const shortHash = currentHash.slice(0, 7);

    // ── 查找 PRD 需求 ─────────────────────────────────────────────────────────
    const activeReq = findReqByFiles(changedFiles, prdContent);
    dbg('activeReq=' + (activeReq ? activeReq.id : 'none'));

    // ── 构建 CHANGELOG 条目 ───────────────────────────────────────────────────
    const reqSuffix = activeReq
      ? (activeReq.specPath
          ? ` ([${activeReq.id}](${activeReq.specPath}))`
          : ` (${activeReq.id})`)
      : '';

    const fileLabel = changedFiles.length === 1
      ? `\`${path.basename(changedFiles[0].file)}\``
      : `\`${path.basename(changedFiles[0].file)}\` 等 ${changedFiles.length} 个文件`;

    const entry = `- ${nowTimestamp()} \`${shortHash}\` ${subject} (${fileLabel})${reqSuffix}`;

    const withSection  = ensureSection(changelogContent, section);
    const newChangelog = withSection.replace(section, `${section}\n${entry}`);
    dbg('WRITING entry: ' + entry);
    writeFile('docs/CHANGELOG.md', newChangelog);
    dbg('CHANGELOG updated');

    // ── 持久化已处理 hash ─────────────────────────────────────────────────────
    state.lastProcessedCommit = currentHash;
    saveState(state);

    process.exit(0);
  } catch (e) {
    dbg('UNCAUGHT ERROR:', e.message, e.stack);
    process.exit(0);
  }
});
