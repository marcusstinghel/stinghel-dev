#!/usr/bin/env node
// repo-state: diagnóstico somente leitura do repositório git, em JSON.
// Usado pela skill setup. Não faz fetch, não altera nada.
//
// Uso: node repo-state.js [caminho-do-projeto]
//
// Classificação de cada branch local (campo "status"):
//   base       main, master, develop, development, release/*, hotfix/* (nunca apagar)
//   current    branch em uso
//   merged     commits já estão numa branch base -> pode apagar com git branch -d
//   gone       upstream sumiu e os commits já estão no remoto -> pode apagar
//   unpushed   tem commits que não existem em nenhum remoto -> perguntar
//   synced     tem upstream e está em dia, mas não foi integrada -> perguntar

const { execFileSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const cwd = path.resolve(process.argv[2] || process.cwd());

function git(args, opts = {}) {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch (e) {
    if (opts.allowFail) return null;
    throw e;
  }
}
const lines = (s) => (s ? s.split("\n").filter(Boolean) : []);

const BASE_EXACT = ["main", "master", "develop", "development"];
const isBase = (b) => BASE_EXACT.includes(b) || b.startsWith("release/") || b.startsWith("hotfix/");

function main() {
  const state = { path: cwd, isRepo: false };

  if (!fs.existsSync(cwd)) {
    state.error = "pasta não existe";
    return state;
  }
  if (git(["rev-parse", "--is-inside-work-tree"], { allowFail: true }) !== "true") {
    state.hasFiles = fs.readdirSync(cwd).filter((f) => f !== ".git").length > 0;
    return state;
  }

  state.isRepo = true;
  state.root = git(["rev-parse", "--show-toplevel"]);
  const gitDir = path.resolve(cwd, git(["rev-parse", "--git-dir"]));

  state.identity = {
    name: git(["config", "user.name"], { allowFail: true }),
    email: git(["config", "user.email"], { allowFail: true }),
  };

  const ops = [];
  if (fs.existsSync(path.join(gitDir, "MERGE_HEAD"))) ops.push("merge");
  if (fs.existsSync(path.join(gitDir, "rebase-merge")) || fs.existsSync(path.join(gitDir, "rebase-apply"))) ops.push("rebase");
  if (fs.existsSync(path.join(gitDir, "CHERRY_PICK_HEAD"))) ops.push("cherry-pick");
  if (fs.existsSync(path.join(gitDir, "BISECT_LOG"))) ops.push("bisect");
  state.operationInProgress = ops;

  const head = git(["symbolic-ref", "--short", "-q", "HEAD"], { allowFail: true });
  state.currentBranch = head || null;
  state.detached = !head;
  state.hasCommits = git(["rev-parse", "--verify", "-q", "HEAD"], { allowFail: true }) !== null;

  state.remotes = lines(git(["remote"], { allowFail: true }));
  const originHead = git(["symbolic-ref", "--short", "-q", "refs/remotes/origin/HEAD"], { allowFail: true });
  state.defaultBranch = originHead ? originHead.replace(/^origin\//, "") : null;

  const porcelain = lines(git(["status", "--porcelain=v1"], { allowFail: true }));
  state.workingTree = {
    clean: porcelain.length === 0,
    staged: porcelain.filter((l) => l[0] !== " " && l[0] !== "?").length,
    modified: porcelain.filter((l) => l[1] === "M" || l[1] === "D").length,
    untracked: porcelain.filter((l) => l.startsWith("??")).length,
    files: porcelain.slice(0, 50).map((l) => l.slice(3)),
  };

  state.stashes = lines(git(["stash", "list", "--format=%gd %s"], { allowFail: true }));
  state.worktrees = lines(git(["worktree", "list", "--porcelain"], { allowFail: true }))
    .filter((l) => l.startsWith("worktree "))
    .map((l) => l.slice(9));

  const remoteBranches = lines(git(["for-each-ref", "--format=%(refname:short)", "refs/remotes"], { allowFail: true }))
    .filter((r) => !r.endsWith("/HEAD"));
  state.remoteBranches = remoteBranches;

  const localBases = lines(git(["for-each-ref", "--format=%(refname:short)", "refs/heads"], { allowFail: true })).filter(isBase);
  const remoteBases = remoteBranches.filter((r) => isBase(r.replace(/^[^/]+\//, "")));
  const allBaseRefs = [...new Set([...localBases, ...remoteBases])];

  const names = [...new Set(remoteBases.map((r) => r.replace(/^[^/]+\//, "")).concat(localBases))];
  state.baseBranches = {
    main: names.includes("main") ? "main" : names.includes("master") ? "master" : null,
    integration: names.includes("develop") ? "develop" : names.includes("development") ? "development" : null,
    releases: names.filter((n) => n.startsWith("release/")),
    hotfixes: names.filter((n) => n.startsWith("hotfix/")),
  };
  if (names.includes("development")) {
    state.warnings = (state.warnings || []).concat("projeto usa 'development' em vez do padrão 'develop'");
  }

  const fmt = "%(refname:short)|%(upstream:short)|%(upstream:track)|%(committerdate:iso8601)";
  state.branches = lines(git(["for-each-ref", `--format=${fmt}`, "refs/heads"], { allowFail: true })).map((row) => {
    const [name, upstream, track, date] = row.split("|");
    const b = { name, upstream: upstream || null, lastCommit: date };
    b.gone = track === "[gone]";
    const ahead = /ahead (\d+)/.exec(track || "");
    const behind = /behind (\d+)/.exec(track || "");
    b.ahead = ahead ? Number(ahead[1]) : 0;
    b.behind = behind ? Number(behind[1]) : 0;
    b.notOnAnyRemote = remoteBranches.length
      ? lines(git(["rev-list", name, "--not", "--remotes"], { allowFail: true })).length
      : lines(git(["rev-list", name], { allowFail: true })).length;
    b.mergedInto = allBaseRefs.filter(
      (base) => base !== name && git(["merge-base", "--is-ancestor", name, base], { allowFail: true }) !== null
    );

    if (isBase(name)) b.status = "base";
    else if (name === state.currentBranch) b.status = "current";
    else if (b.mergedInto.length > 0) b.status = "merged";
    else if (b.notOnAnyRemote > 0) b.status = "unpushed";
    else if (b.gone) b.status = "gone";
    else b.status = "synced";
    return b;
  });

  return state;
}

let out;
try {
  out = main();
} catch (e) {
  out = { path: cwd, error: String(e.message || e) };
}
process.stdout.write(JSON.stringify(out, null, 2) + "\n");
