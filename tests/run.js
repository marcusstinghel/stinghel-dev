#!/usr/bin/env node
// Validação estrutural do plugin e testes do hook plan-guard.
// Uso: node tests/run.js

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const PLUGIN = path.join(ROOT, "plugins", "stinghel-dev");
let failures = 0;

function check(cond, msg) {
  console.log(`${cond ? "ok  " : "FAIL"}  ${msg}`);
  if (!cond) failures++;
}

function json(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    return { __error: e.message };
  }
}

function frontmatter(file) {
  const text = fs.readFileSync(file, "utf8");
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const fm = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([\w-]+):\s*(.*)$/);
    if (kv) fm[kv[1]] = kv[2].replace(/^"(.*)"$/, "$1");
  }
  return fm;
}

// --- manifestos
const market = json(path.join(ROOT, ".claude-plugin", "marketplace.json"));
check(!market.__error, "marketplace.json é JSON válido");
check(market.name && market.owner && market.owner.name && Array.isArray(market.plugins), "marketplace.json tem name, owner.name e plugins");
for (const p of market.plugins || []) {
  check(p.source && p.source.startsWith("./") && fs.existsSync(path.join(ROOT, p.source)), `source do plugin ${p.name} existe`);
}
const manifest = json(path.join(PLUGIN, ".claude-plugin", "plugin.json"));
check(!manifest.__error && manifest.name === "stinghel-dev", "plugin.json válido com name stinghel-dev");
check(/^\d+\.\d+\.\d+$/.test(manifest.version || ""), "plugin.json tem version semver");
const hooks = json(path.join(PLUGIN, "hooks", "hooks.json"));
check(!hooks.__error && hooks.hooks && hooks.hooks.PreToolUse, "hooks.json válido com PreToolUse");

// --- agentes
const MODELS = ["sonnet", "opus", "haiku", "fable", "inherit"];
const COLORS = ["red", "blue", "green", "yellow", "purple", "orange", "pink", "cyan"];
const IGNORED = ["hooks", "mcpServers", "permissionMode"];
const agentNames = [];
for (const f of fs.readdirSync(path.join(PLUGIN, "agents")).filter((f) => f.endsWith(".md"))) {
  const fm = frontmatter(path.join(PLUGIN, "agents", f));
  check(!!fm, `${f}: tem frontmatter`);
  if (!fm) continue;
  agentNames.push(fm.name);
  check(fm.name === f.replace(/\.md$/, ""), `${f}: name igual ao arquivo`);
  check(!fm.name.includes(":"), `${f}: name sem ':'`);
  check((fm.description || "").length >= 40, `${f}: description descreve quando usar`);
  check(MODELS.includes(fm.model), `${f}: model válido (${fm.model})`);
  check(!fm.color || COLORS.includes(fm.color), `${f}: color válida`);
  check(!IGNORED.some((k) => k in fm), `${f}: sem campos ignorados em plugins`);
  if (/reviewer/.test(fm.name)) {
    check(!/\b(Write|Edit)\b/.test(fm.tools || ""), `${f}: revisor sem Write/Edit em tools`);
  }
}

// --- skills
const skillNames = fs.readdirSync(path.join(PLUGIN, "skills"));
for (const dir of skillNames) {
  const file = path.join(PLUGIN, "skills", dir, "SKILL.md");
  const fm = fs.existsSync(file) && frontmatter(file);
  check(!!fm, `skill ${dir}: SKILL.md com frontmatter`);
  if (!fm) continue;
  check((fm.description || "").length >= 40, `skill ${dir}: tem description`);
  check(fm.name === dir, `skill ${dir}: name igual à pasta`);
  const body = fs.readFileSync(file, "utf8");
  const refs = [...body.matchAll(/stinghel-dev:([a-z-]+)/g)].map((m) => m[1]);
  for (const r of new Set(refs)) {
    check(agentNames.includes(r) || skillNames.includes(r), `skill ${dir}: referência stinghel-dev:${r} existe`);
  }
}

// --- hook plan-guard
const GUARD = path.join(PLUGIN, "scripts", "plan-guard.js");
function runGuard(project, file, env = {}) {
  const r = spawnSync("node", [GUARD], {
    input: JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Edit", cwd: project, tool_input: { file_path: file } }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: project, ...env },
    encoding: "utf8",
  });
  let out = null;
  try { out = r.stdout ? JSON.parse(r.stdout) : null; } catch { out = "INVALID"; }
  return { code: r.status, out };
}
function project(states, config) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stinghel-test-"));
  if (states) {
    for (const [slug, state] of Object.entries(states)) {
      fs.mkdirSync(path.join(dir, ".stinghel", slug), { recursive: true });
      fs.writeFileSync(path.join(dir, ".stinghel", slug, "state.json"), JSON.stringify(state));
    }
    if (config) fs.writeFileSync(path.join(dir, ".stinghel", "config.json"), JSON.stringify(config));
  }
  return dir;
}
const src = (d) => path.join(d, "src", "app.py");

let d = project(null);
let r = runGuard(d, src(d));
check(r.code === 0 && r.out === null, "hook: sem .stinghel não faz nada");

d = project({ login: { feature: "login", phase: "spec", plan_approved: false } });
r = runGuard(d, src(d));
check(r.code === 0 && r.out && r.out.systemMessage && r.out.hookSpecificOutput.additionalContext && !r.out.hookSpecificOutput.permissionDecision, "hook: warn avisa sem bloquear");

r = runGuard(d, path.join(d, ".stinghel", "login", "01-spec.md"));
check(r.code === 0 && r.out === null, "hook: edição dentro de .stinghel é livre");

r = runGuard(d, path.join(os.tmpdir(), "fora-do-projeto.txt"));
check(r.code === 0 && r.out === null, "hook: arquivo fora do projeto é ignorado");

d = project({ login: { feature: "login", phase: "implement", plan_approved: true } });
r = runGuard(d, src(d));
check(r.code === 0 && r.out === null, "hook: plano aprovado libera");

d = project({ old: { feature: "old", phase: "done", plan_approved: false } });
r = runGuard(d, src(d));
check(r.code === 0 && r.out === null, "hook: feature done é ignorada");

d = project({ login: { feature: "login", phase: "plan", plan_approved: false } }, { mode: "strict" });
r = runGuard(d, src(d));
check(r.code === 0 && r.out && r.out.hookSpecificOutput.permissionDecision === "deny", "hook: strict bloqueia");

d = project({ login: { feature: "login", phase: "plan", plan_approved: false } }, { mode: "off" });
r = runGuard(d, src(d));
check(r.code === 0 && r.out === null, "hook: off desliga");

d = project({ login: { feature: "login", phase: "plan" } });
fs.writeFileSync(path.join(d, ".stinghel", "login", "state.json"), "{ quebrado");
r = runGuard(d, src(d));
check(r.code === 0 && r.out === null, "hook: state.json inválido não quebra");

const bad = spawnSync("node", [GUARD], { input: "nao e json", encoding: "utf8" });
check(bad.status === 0, "hook: stdin inválido sai com 0");

console.log(failures ? `\n${failures} falha(s)` : "\nTudo certo.");
process.exit(failures ? 1 : 0);
