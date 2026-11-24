# stinghel-dev

Plugin pessoal do Claude Code com um pipeline de desenvolvimento focado em qualidade:

**spec → plano → TDD por tarefa → code review → revisão final → segurança → resumo**

Tem dois pontos de aprovação: depois da spec e depois do plano. Commit, push e PR só acontecem quando você pede.

## O que tem

| Tipo | Nome | Modelo | Papel |
|---|---|---|---|
| Skill | `/stinghel-dev:feature` | (sessão) | Orquestra o pipeline inteiro e retoma features em andamento |
| Skill | `/stinghel-dev:commit` | (sessão) | Commits atômicos em Conventional Commits (inglês), com barreira de segredos e aprovação do plano; termina no commit, sem push |
| Agente | `spec-writer` | opus | Pedido → spec com critérios de aceite testáveis e perguntas em aberto |
| Agente | `planner` | opus | Spec → plano com tarefas pequenas e verificáveis |
| Agente | `tdd-implementer` | sonnet | Implementa uma tarefa por vez: red → green → refactor |
| Agente | `code-reviewer` | sonnet (opus na revisão final) | Conformidade com a spec e qualidade, só achados com confiança ≥ 80 |
| Agente | `security-reviewer` | opus | Vulnerabilidades com cenário de exploração concreto |
| Hook | `plan-guard` | — | Avisa quando há edição de código com feature sem plano aprovado |

## Como usar

```
/stinghel-dev:feature adicionar login com Google
/stinghel-dev:feature login-com-google     # retoma pelo slug
/stinghel-dev:feature                      # retoma a única feature em andamento
```

```
/stinghel-dev:commit                       # analisa tudo, propõe os commits e pede aprovação
/stinghel-dev:commit só o que está em src/auth
```

Para tirar o `Co-Authored-By` e a assinatura dos PRs em todas as sessões, adicione ao `~/.claude/settings.json`:

```json
"attribution": { "commit": "", "pr": "" }
```

Os artefatos ficam em `.stinghel/<slug>/` no projeto: `01-spec.md`, `02-plan.md`, `reviews/`, `03-security.md`, `04-summary.md` e `state.json`.

### Modo do hook

Crie `.stinghel/config.json` no projeto:

```json
{ "mode": "warn" }
```

- `warn` (padrão): avisa você e o Claude, mas deixa editar.
- `strict`: bloqueia edições de código até o plano ser aprovado.
- `off`: desliga.

O hook só age em projetos que têm a pasta `.stinghel/`.

## Instalação

Este repositório é também um marketplace (`stinghel`). Escolha uma das formas abaixo e adicione ao seu `~/.claude/settings.json` (no Windows, `%USERPROFILE%\.claude\settings.json`).

### Pelo GitHub (uso normal)

```json
{
  "extraKnownMarketplaces": {
    "stinghel": {
      "source": { "source": "github", "repo": "marcusstinghel/stinghel-dev" }
    }
  },
  "enabledPlugins": {
    "stinghel-dev@stinghel": true
  }
}
```

### De uma pasta local (para desenvolver o plugin)

Clone o repositório e aponte para a pasta do clone:

```json
{
  "extraKnownMarketplaces": {
    "stinghel": {
      "source": { "source": "directory", "path": "<caminho absoluto do clone>" }
    }
  },
  "enabledPlugins": {
    "stinghel-dev@stinghel": true
  }
}
```

Exemplos de caminho: `C:\\caminho\\para\\stinghel-dev` no Windows (com barras duplas no JSON) ou `/home/<usuario>/projects/stinghel-dev` no Linux e no WSL.

Com a pasta local, as edições valem na próxima sessão ou depois de `/reload-plugins`, sem reinstalar.

## Requisitos

- Node.js no PATH (para o hook).
