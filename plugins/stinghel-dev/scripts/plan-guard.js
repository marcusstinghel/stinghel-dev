#!/usr/bin/env node
// plan-guard: avisa (ou bloqueia, no modo strict) edições de código enquanto
// existir uma feature do pipeline stinghel-dev sem plano aprovado.
//
// Só age em projetos que têm a pasta .stinghel/. Em qualquer erro, sai em
// silêncio (exit 0) para nunca atrapalhar a edição.
//
// Modo: .stinghel/config.json -> { "mode": "warn" | "strict" | "off" }
// Padrão: "warn".

const fs = require("fs");
const path = require("path");

function readStdin() {
  try {
    return fs.readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function norm(p) {
  const r = path.resolve(p);
  return process.platform === "win32" ? r.toLowerCase() : r;
}

function isInside(child, parent) {
  const rel = path.relative(norm(parent), norm(child));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function main() {
  const input = JSON.parse(readStdin() || "{}");
  const filePath = input.tool_input && input.tool_input.file_path;
  if (!filePath) return;

  const projectDir = process.env.CLAUDE_PROJECT_DIR || input.cwd;
  if (!projectDir) return;

  const stinghelDir = path.join(projectDir, ".stinghel");
  if (!fs.existsSync(stinghelDir)) return;

  const target = path.resolve(projectDir, filePath);
  if (!isInside(target, projectDir)) return;
  if (isInside(target, stinghelDir)) return;

  const config = readJson(path.join(stinghelDir, "config.json")) || {};
  const mode = config.mode || "warn";
  if (mode === "off") return;

  const pending = [];
  for (const entry of fs.readdirSync(stinghelDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const state = readJson(path.join(stinghelDir, entry.name, "state.json"));
    if (!state) continue;
    if (state.phase !== "done" && state.plan_approved !== true) {
      pending.push(state.feature || entry.name);
    }
  }
  if (pending.length === 0) return;

  const list = pending.join(", ");
  const rel = path.relative(projectDir, target);

  if (mode === "strict") {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason:
            `stinghel-dev (modo strict): a feature "${list}" ainda não tem plano aprovado. ` +
            `Termine a spec e o plano (/stinghel-dev:feature) antes de editar ${rel}, ` +
            `ou mude o modo em .stinghel/config.json.`,
        },
      })
    );
    return;
  }

  process.stdout.write(
    JSON.stringify({
      systemMessage: `stinghel-dev: editando ${rel} sem plano aprovado para "${list}".`,
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        additionalContext:
          `Aviso do stinghel-dev: existe a feature "${list}" em andamento sem plano aprovado. ` +
          `Se esta edição faz parte dela, pare e conclua a spec e o plano com o usuário antes. ` +
          `Se a edição não tem relação com a feature, siga normalmente.`,
      },
    })
  );
}

try {
  main();
} catch {
  // nunca bloquear por erro do próprio hook
}
process.exit(0);
