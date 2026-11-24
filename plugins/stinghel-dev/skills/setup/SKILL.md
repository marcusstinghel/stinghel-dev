---
name: setup
description: Prepara o ambiente git antes de começar um trabalho - cria o repositório se o projeto for novo, limpa branches locais já integradas, atualiza com o remoto e cria a branch certa (feature, fix, hotfix, release...) a partir da base certa, alinhando cada passo com o usuário. Use quando o usuário pedir para preparar o ambiente ou começar um trabalho novo, e sempre que a skill stinghel-dev:feature mandar.
argument-hint: "[o que vai ser feito, ex.: 'corrigir timeout do nats']"
---

# Setup de ambiente (stinghel-dev)

Você prepara o repositório para um trabalho novo. Tudo que altera algo (criar repositório, apagar branch, trocar de branch, criar branch) só acontece **depois que o usuário aprova o plano**. Esta skill não faz push: termina com a branch pronta localmente.

Pedido: $ARGUMENTS

Se o pedido começar com `modo feature:`, você foi chamada pela skill `stinghel-dev:feature`. O resto do texto é a feature a ser feita. Siga o mesmo fluxo e, no fim, devolva o controle para ela (passo 7).

## Padrões do usuário

- Branch principal: `main` (aceite `master` em projetos antigos).
- Branch de integração: **`develop`**. Se o projeto usar `development`, use a que existe, avise uma vez que o padrão é `develop` e **não renomeie** nada.
- Prefixos e bases:

| Escopo | Prefixo | Base |
|---|---|---|
| Funcionalidade nova | `feature/` | `develop`; se não existir, a principal |
| Correção normal | `fix/` | igual a feature |
| Refatoração, docs, manutenção | `refactor/`, `docs/`, `chore/` | igual a feature |
| Correção urgente em produção | `hotfix/` | a principal; se o bug for numa `release/*` em andamento, essa release |
| Preparar uma versão | `release/x.y.z` | `develop` |

- Nome da branch: prefixo + descrição curta em kebab-case, em inglês, com o número da issue na frente quando houver (`feature/123-google-login`, `fix/nats-reconnect-timeout`). No máximo ~40 caracteres depois do prefixo.

## 1. Diagnóstico

O script de diagnóstico fica na raiz do plugin, em `scripts/repo-state.js`. A raiz do plugin é **dois níveis acima** da pasta base desta skill (informada quando a skill carrega). Primeiro atualize as referências remotas, se houver remoto; depois rode o script:

```
git fetch --all --prune
node "<raiz do plugin>/scripts/repo-state.js" "<raiz do projeto>"
```

O script é só leitura e devolve um JSON com: identidade do git, operação em andamento, branch atual, branch padrão, branches base, estado da working tree, stashes, worktrees e a classificação de cada branch local.

Se o `fetch` falhar (sem rede, sem permissão), diga isso e continue com o que há localmente, avisando que o estado remoto pode estar desatualizado.

Se houver remoto mas `defaultBranch` vier `null` (comum em repositórios criados pelo `gh` e enviados com o primeiro push), rode `git remote set-head origin --auto` e rode o script de novo. Se continuar `null`, use `baseBranches.main`.

## 2. Checagens

Pare e resolva com o usuário antes de seguir se:

- `operationInProgress` não estiver vazio (merge, rebase, cherry-pick, bisect em andamento). Não tente concluir nem abortar sozinho.
- `identity.email` estiver vazio. Se ele não for o e-mail que o usuário costuma usar nos commits (veja o `git log` recente), mostre e pergunte se está certo.
- Houver `stashes` ou mais de uma entrada em `worktrees`: só liste e avise. Nunca apague.
- `warnings` tiver avisos: mostre.

Se o `gh` CLI existir, rode `gh auth status` e avise se não estiver logado.

## 3. Projeto novo

Se `isRepo` for `false`, ou se for repositório sem nenhum remoto:

1. Pergunte ao usuário o **nome**, a **visibilidade** (pública ou privada; sempre pergunte, nunca assuma) e a **descrição** do repositório.
2. Crie o repositório remoto, nesta ordem de preferência:
   1. `gh repo create <dono>/<nome> --<public|private> --description "<descrição>"`, se o `gh` estiver logado.
   2. Pelo navegador do app, se você tiver as ferramentas do navegador nesta sessão: abra `https://github.com/new`, preencha nome, descrição e visibilidade, e mostre o formulário ao usuário antes de clicar em criar. Se pedir login ou aprovação de site, peça ao usuário para fazer no painel.
   3. Sem nenhum dos dois: peça ao usuário para criar o repositório e mandar o link.
3. Localmente: `git init -b main` (se ainda não for repositório) e `git remote add origin <url>`.
4. Ofereça os arquivos base que estiverem faltando, e crie só os que o usuário aceitar: `.gitignore` para a linguagem do projeto, `.gitattributes` com `* text=auto eol=lf`, `README.md`, `LICENSE` MIT (padrão do usuário) e `CLAUDE.md`.
5. Não crie a `develop` sozinho: pergunte se o projeto vai usar Git Flow (`main` + `develop`) ou só `main`. A `develop` nasce depois do primeiro commit na `main`, a partir dela.

O primeiro commit é feito com `stinghel-dev:commit`, não por esta skill.

## 4. Mudanças em andamento

Se `workingTree.clean` for `false`, mostre os arquivos e pergunte o que fazer antes de trocar de branch:

- **commitar** (rode a skill `stinghel-dev:commit` e volte aqui depois);
- **guardar em stash** (`git stash push -u -m "setup: <branch> <data>"`);
- **levar para a branch nova** (as mudanças não commitadas vão junto no `git switch -c`);
- **descartar**: só com confirmação explícita, listando os arquivos que serão perdidos, e avisando que não tem volta.

## 5. Limpeza de branches

Monte a lista a partir do campo `status` de cada branch:

| status | ação proposta |
|---|---|
| `base` | manter, nunca apagar |
| `current` | manter (é a branch em uso) |
| `merged` | apagar com `git branch -d`; diga em qual base ela já está |
| `gone` | apagar com `git branch -d`; o upstream foi removido e os commits estão no remoto |
| `unpushed` | **perguntar**: manter, ou apagar e perder N commits |
| `synced` | **perguntar**: está no remoto mas não foi integrada; manter ou apagar só a cópia local |

Mostre a lista inteira de uma vez, agrupada por ação. Use `git branch -d` sempre. `git branch -D` só para uma branch `unpushed` que o usuário mandou apagar explicitamente, depois de dizer quantos commits serão perdidos. Nunca apague branch remota.

## 6. Atualizar e escolher a branch

### 6a. A branch atual serve?

Se a branch atual **não** for base e o pedido fizer sentido no escopo dela (o nome e os commits recentes, `git log -n 10 --oneline`, tratam do mesmo assunto), proponha **continuar nela**:

- se tiver upstream e estiver atrás (`behind > 0`): `git pull --ff-only`;
- se tiver divergido (ahead e behind ao mesmo tempo): **pare e pergunte** (rebase, merge ou seguir assim). Nunca faça reset nem force.

Se tiver dúvida se o pedido cabe na branch atual, pergunte em uma frase.

### 6b. Branch nova

Se a branch atual for base ou o pedido não fizer sentido nela:

1. Classifique o escopo pela tabela de padrões e escolha a base pelas branches que existem (`baseBranches`).
2. Proponha prefixo, nome e base, e alinhe com o usuário. Se houver mais de uma `release/*` ou `hotfix/*` aberta, pergunte qual.
3. Atualize a base: `git switch <base>` e `git pull --ff-only`. Se a base local divergiu do remoto, **pare e pergunte**.
4. Crie a branch: `git switch -c <prefixo>/<nome>`.

Se a branch base não existir localmente mas existir no remoto, `git switch <base>` já cria o rastreamento.

## Plano para aprovação

Antes de executar os passos 3 a 6, mostre um plano único:

```
Projeto: <caminho> | Branch atual: <branch> | Padrão: <branch padrão>
Identidade: <nome> <e-mail>
Mudanças em andamento: <nenhuma | N arquivos -> ação escolhida>

Limpeza:
  apagar (já integradas): feature/a (em develop), fix/b (em main)
  perguntar: feature/c (3 commits só locais)
Atualizar: develop (atrás 4), main (em dia)
Branch: criar feature/google-login a partir de develop | continuar em fix/x (atualizar 2 commits)
Avisos: <stash, worktrees, development em vez de develop...>
```

Use a ferramenta AskUserQuestion para aprovar, ajustar ou cancelar. As perguntas sobre branches `unpushed` e `synced` e sobre mudanças em andamento podem ir na mesma chamada (até 4 perguntas). Só execute depois da aprovação.

## 7. Resumo

```
git status -sb
git branch -vv
```

Mostre: em que branch o usuário está, a partir de qual base, o que foi apagado e o que ficou para depois. Lembre que nada foi enviado ao remoto.

Se veio do `modo feature:`, termine dizendo a branch em uso e devolva o controle à skill `stinghel-dev:feature` para ela seguir com a spec.

## Nunca

- `git push`, `git push --force`, apagar branch remota.
- `git reset --hard`, `git clean -fd`, `git checkout -- .` ou `git stash drop` sem confirmação explícita do usuário para aquele caso.
- Renomear branches existentes (`develop`/`development`, `master`/`main`).
- Criar repositório remoto sem confirmar nome e visibilidade.
