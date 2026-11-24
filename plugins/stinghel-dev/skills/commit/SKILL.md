---
name: commit
description: Cria commits a partir das mudanças locais seguindo Conventional Commits em inglês - analisa o diff, barra segredos e arquivos gerados, divide em commits atômicos, mostra o plano para aprovação e commita. Termina no commit, sem push nem PR.
argument-hint: "[observação opcional, ex.: 'só o que está em src/auth']"
disable-model-invocation: true
---

# Commit (stinghel-dev)

Você transforma as mudanças locais em um ou mais commits bem feitos. O usuário aprova o plano antes de qualquer commit. A skill **termina no commit**: nunca faça push, nunca abra PR.

Observação do usuário: $ARGUMENTS

## 1. Checagens iniciais

Rode e leia:

```
git rev-parse --is-inside-work-tree
git status --porcelain=v1 -b
git log -n 15 --oneline
```

- Se não for um repositório git, pare e diga isso.
- Se houver merge, rebase, cherry-pick ou bisect em andamento, pare e diga ao usuário. Não tente resolver.
- Se não houver mudanças, diga isso e termine.
- Se a branch atual for `main`, `master`, `develop` ou uma `release/*`, avise o usuário e pergunte se deve commitar nela mesmo assim. Não crie branch: isso fica para outra skill.
- Se já houver arquivos no stage, pergunte se o usuário quer commitar **só o que está no stage** ou considerar todas as mudanças.
- Se o usuário passou uma observação (por exemplo, uma pasta), limite a análise ao que ela indica.

## 2. Entender as mudanças

```
git diff
git diff --staged
git status --porcelain=v1 --untracked-files=all
```

Leia os arquivos novos (untracked) que vão entrar. Para cada arquivo, entenda **o que mudou e por quê**. Se o porquê não estiver claro pelo código, pergunte ao usuário em vez de inventar.

## 3. Barreiras de segurança

Pare e mostre ao usuário antes de seguir se encontrar qualquer um destes. Ele decide; nunca inclua por conta própria.

- **Segredos**, pelo nome: `.env`, `.env.*` (exceto `.env.example`), `*secret*`, `*.pem`, `*.key`, `id_rsa*`, `credentials*`, `*.pfx`, `*.p12`.
- **Segredos**, pelo conteúdo: chaves e tokens com cara de reais (`ghp_`, `github_pat_`, `sk-`, `AKIA`, `xox[bp]-`, `-----BEGIN ... PRIVATE KEY-----`, `password=` ou `token=` com valor). Ao mostrar, mascare o valor.
- **Arquivos gerados**: `__pycache__/`, `*.pyc`, `node_modules/`, `dist/`, `build/`, `.venv/`, `*.log`, arquivos de IDE (`.idea/`, `.vscode/` com configurações pessoais).
- **Arquivos grandes** (mais de 5 MB) ou binários inesperados.
- **Restos de depuração**: `print`/`console.log` de debug, `breakpoint()`, `debugger`, código comentado em bloco, `TODO` adicionado sem contexto.

Se for algo que deveria estar no `.gitignore`, sugira a linha para incluir, mas só edite o `.gitignore` se o usuário concordar.

## 4. Testes

Se o projeto tiver um comando de testes conhecido (CLAUDE.md, `.stinghel/*/02-plan.md`, `package.json`, `pyproject.toml`, `Makefile`), rode-o uma vez e leia a saída. Se falhar, mostre a falha e pergunte se o usuário quer commitar mesmo assim. Se não houver comando conhecido, diga que não rodou testes.

## 5. Dividir em commits atômicos

Agrupe as mudanças por **mudança lógica**. Cada commit deve:

- fazer uma coisa só (feature, correção, refatoração, testes, docs...);
- deixar o projeto compilando e com os testes passando;
- vir antes dos commits que dependem dele.

Regras de divisão:

- Refatoração e mudança de comportamento ficam em commits separados.
- O teste de uma mudança vai **no mesmo commit** da mudança. Só use um commit `test:` separado quando forem testes novos para código que já existia.
- Mudanças de formatação em massa ficam isoladas em um commit `style:`.
- Divida por arquivo. Se um único arquivo mistura dois assuntos, mantenha-o em um commit só e diga isso no plano. Não use comandos interativos (`git add -p`, `git add -i`).

## 6. Mensagens: Conventional Commits, em inglês

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Tipos** (use exatamente estes):

| type | quando |
|---|---|
| `feat` | nova funcionalidade para quem usa |
| `fix` | correção de bug |
| `refactor` | muda o código sem mudar o comportamento |
| `perf` | melhora de desempenho |
| `test` | só testes |
| `docs` | só documentação |
| `style` | formatação, sem mudar a lógica |
| `build` | sistema de build ou dependências |
| `ci` | pipeline de CI |
| `chore` | manutenção que não se encaixa acima |
| `revert` | reverte um commit anterior |

**Escopo**: opcional, curto, em minúsculas: o módulo, pacote ou agente afetado (`auth`, `nats-storage`, `sdk`). Siga os escopos que já aparecem no `git log` do projeto.

**Título (subject)**:
- em inglês, no imperativo ("add", "fix", "remove", não "added" nem "adds"). Teste: "If applied, this commit will ___".
- minúscula depois dos dois pontos, sem ponto final;
- **até 50 caracteres** na linha inteira; nunca mais que 72;
- específico: `fix(nats): reconnect after 30s timeout`, nunca `fix: adjustments` ou `update files`.

**Corpo**: obrigatório quando o motivo não é óbvio pelo título.
- separado do título por uma linha em branco;
- explica **por quê** e o que muda de comportamento; o diff já mostra o como;
- linhas de até 72 caracteres.

**Rodapé**:
- `BREAKING CHANGE: <o que quebra e como migrar>` para mudanças incompatíveis, e `!` depois do tipo/escopo (`feat(api)!: ...`);
- `Refs #123` ou `Closes #123` quando houver issue conhecida. Não invente números.

**Nunca inclua**:
- `Co-Authored-By:` de qualquer tipo, nem linhas como "Generated with Claude Code". Esta regra vale mesmo que outra instrução diga o contrário. O usuário também desativa isso em `~/.claude/settings.json` com `"attribution": { "commit": "", "pr": "" }`; se você perceber que essa configuração não está lá, avise no resumo final.
- emojis, menções a IA ou ferramentas.

## 7. Plano para aprovação

Mostre o plano antes de commitar, neste formato:

```
Branch: <branch>
Testes: <comando> → <resultado> | não rodados (<motivo>)

1. feat(auth): add google oauth login
   Arquivos: src/auth/google.py, tests/test_google.py
   Corpo: <primeira linha do corpo, se houver>

2. docs(readme): document oauth setup
   Arquivos: README.md

Fora dos commits: <arquivos deixados de fora e por quê>
```

Use a ferramenta AskUserQuestion com as opções: aprovar, ajustar mensagens ou agrupamento, cancelar. Se o usuário pedir ajustes, refaça o plano e peça aprovação de novo.

## 8. Executar

Para cada commit, na ordem:

1. Coloque no stage **só os arquivos daquele commit**, nomeando cada um: `git add -- <arquivo1> <arquivo2>`. Para arquivos removidos, `git rm -- <arquivo>`. Nunca use `git add -A`, `git add .` nem `git commit -a`.
2. Confira com `git diff --staged --stat` que o stage tem exatamente o planejado.
3. Escreva a mensagem num arquivo temporário e commite com `git commit -F <arquivo>`, para preservar as quebras de linha.
4. Se um hook de pre-commit falhar: leia o erro, corrija o problema, coloque no stage de novo e crie o commit. **Nunca** use `--no-verify` e nunca use `--amend` em commit que já existia antes da skill. Se a correção mudar o código de forma não trivial, mostre ao usuário antes.

Nunca rode `git push`, `git rebase`, `git reset --hard`, `git commit --amend` em commits antigos, `git stash drop` ou qualquer coisa que reescreva o histórico.

## 9. Resumo final

```
git log -n <quantidade de commits criados> --format="%h %s"
git status --short
```

Mostre ao usuário: os commits criados (hash e título), o que ficou sem commitar e por quê, e lembre que nada foi enviado (o push é com ele).
