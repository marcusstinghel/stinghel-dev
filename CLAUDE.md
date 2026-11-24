# stinghel-dev: regras do repositório

Este repositório é um marketplace local (`.claude-plugin/marketplace.json`) com um plugin em `plugins/stinghel-dev/`.

## Convenções

- Instruções de agentes e skills em **português**.
- Mensagens de commit deste repositório seguem a skill `commit`: Conventional Commits em inglês, título até 50 caracteres, sem `Co-Authored-By`.
- Agentes em `plugins/stinghel-dev/agents/<nome>.md`. Frontmatter: `name`, `description` (escrita como gatilho: quando usar), `tools` (o mínimo necessário), `model`, `color`. Revisores nunca recebem Write/Edit.
- Skills em `plugins/stinghel-dev/skills/<nome>/SKILL.md`. Skills que disparam fluxos longos usam `disable-model-invocation: true`.
- Fluxo de skills: `feature` chama `setup` no início e sugere `commit` no fim. Push e PR ficam fora de todas (serão outra skill).
- Padrão de branches do usuário: `main` + `develop` (Git Flow). Projetos com `development` ou `master` são aceitos, nunca renomeados.
- Scripts de diagnóstico (como `repo-state.js`) são só leitura e devolvem JSON; a decisão fica com a skill.
- Hooks em `plugins/stinghel-dev/hooks/hooks.json`, scripts em `plugins/stinghel-dev/scripts/` em Node (roda igual no Windows e no WSL). Hooks nunca podem quebrar a edição por erro próprio: em erro, `exit 0`.
- Plugins não suportam `hooks`, `mcpServers` nem `permissionMode` no frontmatter de agentes.
- Todo agente devolve um formato de saída fixo, com status ou veredito, para o orquestrador decidir sem interpretar texto livre.
- Saídas de agentes que viram arquivos seguem a numeração de `.stinghel/<slug>/` descrita na skill `feature`.

## Ao mudar algo

1. Ao renomear agentes, atualize a tabela de `subagent_type` em `skills/feature/SKILL.md` e o README.
2. Suba `version` em `plugins/stinghel-dev/.claude-plugin/plugin.json` (semver).
3. Rode `node tests/run.js` antes de commitar.
4. O `name` do plugin (`stinghel-dev`) não deve mudar.
