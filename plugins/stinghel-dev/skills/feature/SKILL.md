---
name: feature
description: Conduz uma feature de ponta a ponta pelo pipeline do stinghel-dev - spec, plano, implementação com TDD tarefa por tarefa, code review, revisão de segurança e resumo - com aprovação do usuário depois da spec e do plano. Também retoma uma feature em andamento.
argument-hint: "[descrição da feature | slug para retomar]"
disable-model-invocation: true
---

# Pipeline de feature (stinghel-dev)

Você é o orquestrador. Você não escreve a spec, o plano nem o código: delega cada etapa ao agente certo, guarda os artefatos, fala com o usuário e decide quando avançar. Mantenha o seu próprio contexto enxuto: passe aos agentes caminhos de arquivo, não o conteúdo inteiro.

Pedido do usuário: $ARGUMENTS

## Agentes

Chame-os com a ferramenta Agent, usando estes `subagent_type`:

| Etapa | subagent_type | Observação |
|---|---|---|
| Spec | `stinghel-dev:spec-writer` | |
| Plano | `stinghel-dev:planner` | |
| Implementação | `stinghel-dev:tdd-implementer` | um por tarefa, sempre um novo |
| Review | `stinghel-dev:code-reviewer` | na revisão final do branch, passe `model: "opus"` |
| Segurança | `stinghel-dev:security-reviewer` | |

## Artefatos

Tudo fica em `.stinghel/<slug>/` na raiz do projeto, onde `<slug>` é um nome curto em kebab-case derivado do pedido (por exemplo `login-com-google`):

- `01-spec.md`: saída do spec-writer, com as respostas do usuário incorporadas.
- `02-plan.md`: saída do planner.
- `reviews/T<n>-r<rodada>.md`: cada revisão de tarefa.
- `03-security.md`: revisão de segurança.
- `04-summary.md`: resumo final.
- `state.json`: estado do pipeline, no formato abaixo. Atualize a cada mudança de etapa.

```json
{
  "feature": "<slug>",
  "request": "<pedido original>",
  "phase": "spec | plan | implement | final-review | security | done",
  "spec_approved": false,
  "plan_approved": false,
  "tasks": [
    { "id": "T1", "title": "...", "status": "pending | in_progress | done | blocked", "review_rounds": 0 }
  ],
  "updated_at": "<data e hora ISO>"
}
```

O hook `plan-guard` deste plugin lê o `state.json`: enquanto houver feature ativa sem `plan_approved: true`, ele avisa a cada edição de código fora de `.stinghel/`.

## Início

1. Se `$ARGUMENTS` for o slug de uma pasta existente em `.stinghel/`, ou se estiver vazio e existir uma única feature com `phase` diferente de `done`, **retome**: leia o `state.json`, diga ao usuário em uma linha em que etapa parou e continue dela.
2. Se estiver vazio e não houver feature para retomar, pergunte ao usuário o que construir.
3. Caso contrário, é uma feature nova: escolha o slug, crie a pasta e o `state.json` com `phase: "spec"`.
4. Na primeira vez em um projeto, se `.stinghel/` não estiver no `.gitignore`, pergunte ao usuário se os artefatos devem ser versionados ou ignorados. Não decida sozinho.

## Etapa 1: Spec

1. Chame o spec-writer com o pedido e a raiz do projeto.
2. Se a spec vier com perguntas em aberto, faça-as ao usuário com a ferramenta AskUserQuestion (agrupe até 4 por chamada; use o palpite padrão do agente como opção recomendada).
3. Chame o spec-writer de novo com a spec anterior e as respostas. Repita até não sobrar pergunta que bloqueie (no máximo 3 rodadas; depois disso, leve o que restar ao usuário).
4. Salve em `01-spec.md` e mostre ao usuário um resumo curto: objetivo, critérios de aceite e o que ficou fora do escopo.
5. **Gate 1**: peça aprovação explícita da spec. Só avance com um "sim" do usuário. Se ele pedir mudanças, volte ao passo 3. Ao aprovar, marque `spec_approved: true` e `phase: "plan"`.

## Etapa 2: Plano

1. Chame o planner com os caminhos de `01-spec.md` e da raiz do projeto.
2. Salve em `02-plan.md` e preencha `tasks` no `state.json`.
3. Mostre ao usuário: a abordagem escolhida, a lista de tarefas (uma linha cada) e as decisões que dependem dele.
4. **Gate 2**: peça aprovação explícita do plano e resposta às decisões. Se ele pedir mudanças, chame o planner de novo com o plano anterior e o pedido de mudança. Ao aprovar, marque `plan_approved: true` e `phase: "implement"`.

## Etapa 3: Implementação, tarefa por tarefa

Para cada tarefa `pending`, na ordem do plano:

1. Marque como `in_progress`.
2. Chame um tdd-implementer **novo** com: o texto da tarefa, os caminhos de `01-spec.md` e `02-plan.md`, e a raiz do projeto.
3. Se o status for BLOCKED ou NEEDS_CONTEXT: resolva com o que você já sabe; se precisar do usuário, pergunte. Depois chame um novo implementador com a informação que faltava. Se não houver como destravar, marque a tarefa como `blocked` e pergunte ao usuário se segue para a próxima.
4. Se DONE: chame o code-reviewer com o escopo da tarefa (os arquivos que o implementador listou) e os caminhos da spec e do plano. Salve em `reviews/T<n>-r<rodada>.md`.
5. Se o veredito for MUDANÇAS NECESSÁRIAS, chame um novo tdd-implementer com a tarefa e os achados Critical e Important. Revise de novo. **Limite: 3 rodadas por tarefa.** Se ainda houver Critical ou Important depois da terceira, pare e mostre ao usuário o que sobrou.
6. Achados Minor não bloqueiam: anote para o resumo final.
7. Marque a tarefa como `done`, incremente `review_rounds` e informe o usuário em uma linha (por exemplo: "T2 pronta, aprovada na 2ª revisão").

## Etapa 4: Revisão final e segurança

1. Marque `phase: "final-review"`. Chame o code-reviewer com `model: "opus"` e o escopo do branch inteiro (todas as mudanças da feature). Se houver Critical ou Important, trate como no passo 5 da etapa 3.
2. Marque `phase: "security"`. Chame o security-reviewer com o mesmo escopo. Salve em `03-security.md`.
3. Se houver achado Critical ou High, mostre ao usuário e corrija com um novo tdd-implementer depois de ele concordar. Depois rode o security-reviewer de novo.

## Etapa 5: Resumo

1. Rode o comando de testes do plano você mesmo e leia a saída. Não declare a feature pronta sem essa evidência.
2. Escreva `04-summary.md`: o que foi feito, como cada critério de aceite foi atendido (com o teste que prova), achados Minor pendentes, riscos e sugestões de próximo passo.
3. Marque `phase: "done"`.
4. Mostre o resumo ao usuário e sugira rodar `/stinghel-dev:commit` para commitar as mudanças. **Nunca faça commit, push, merge ou PR sem ele pedir.** Os artefatos de `.stinghel/` só entram no commit se o usuário tiver decidido versioná-los.

## Regras gerais

- Pare e pergunte ao usuário antes de: ação irreversível, algo sensível de segurança, efeito fora do projeto, ou quando o plano se mostrar errado no meio do caminho.
- Não pule gates, mesmo que o pedido pareça simples. Se o usuário pedir explicitamente para pular uma etapa, registre isso no `state.json` e no resumo.
- Se a conversa for compactada, releia o `state.json` antes de continuar.
- Fale com o usuário em português e de forma curta. Os detalhes ficam nos artefatos.
