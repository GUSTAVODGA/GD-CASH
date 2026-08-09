# Testes do Avenco

Esta pasta existe por causa de um incidente concreto: várias suítes E2E viviam
apenas no diretório de trabalho de uma sessão e desapareceram quando o
container foi trocado. Não foi culpa do `.gitignore` — ele sempre ignorou só
artefatos (`test-results/`, `playwright-report/`, `node_modules/`). Os specs
simplesmente nunca haviam sido versionados.

Nada aqui altera o produto. Nenhum arquivo servido ao usuário
(`app.js`, `index.html`, `style.css`, `sw.js`, `manifest.json`) é tocado pelos
testes.

## Como rodar

```bash
npm ci                 # uma vez (instala o Playwright a partir do lockfile)
npx playwright install chromium   # uma vez (browser do tier E2E)

npm test               # regressão completa: unitário + E2E
npm run test:unit      # gate rápido, sem browser e sem dependências
npm run test:e2e       # só os fluxos de browser
```

`npm run test:unit` roda com Node puro (`node:test`, embutido no Node 22) e não
precisa de `npm ci`. É o gate para usar a cada mudança; o E2E é o que se roda
antes de publicar.

Em CI, os dois gates rodam separados em `.github/workflows/ci.yml`, a cada push
e a cada pull request.

## Os dois tiers, e por que são dois

**`tests/unit/` — verdade financeira.** Os motores (`_movementNature`,
`_periodMovementSummary`, `monthAggregate`, o cronograma de dívidas) são funções
puras, e é neles que mora a corretude que importa: se o caixa erra, tudo erra.
Testá-los por browser custaria segundos por caso para provar menos. Aqui roda em
menos de um segundo, sem instalar nada.

**`tests/e2e/` — comportamento e tela.** Playwright cobre o que só o browser
prova: renderização, o texto do donut que truncava, navegação, o formulário de
lançamento gravando a natureza correta.

## Como o tier unitário carrega o app

O `app.js` é um script clássico, sem `export`. Transformá-lo em módulo ES só
para poder importar as funções seria alterar produto — então o
`_loader.mjs` avalia o arquivo publicado dentro de um contexto `vm` com stubs
mínimos de DOM, `localStorage` e Firebase, e expõe os motores.

O contrato do loader é explícito, e ele quebra ruidosamente se for violado:

1. `app.js` é um script clássico (se virar módulo ES, o loader falha com
   mensagem dizendo isso);
2. os motores são declarações de função no escopo global do script;
3. o epílogo injetado alcança os bindings léxicos (`D`).

**O loader nunca engole exceção.** Se o `app.js` não inicializar — por stub
faltando, por exemplo — a suíte falha com a exceção original preservada em
`cause`, e a mensagem diz textualmente que aquilo *não* é "função ausente". Um
loader tolerante produziria suítes verdes sobre funções que jamais rodaram, que
é pior do que não ter teste. Esse comportamento é testado em
`loader-failfast.test.mjs`.

Precisou de uma API de DOM que não está no stub? Acrescente o stub mínimo em
`_loader.mjs`. Não capture o erro.

## Determinismo

**Relógio.** O app lê a data em 44 pontos (`new Date()`) e 26 (`Date.now()`), e
Home, Semana e Mês derivam disso. No tier unitário, `_clock.mjs` injeta um
`Date` congelado antes de o `app.js` avaliar; no E2E, `page.clock.install()`
fixa a data antes da navegação. Toda suíte de calendário declara seu instante.

Os instantes são escritos **sem fuso e ao meio-dia** (`'2026-03-31T12:00:00'`),
de propósito: assim a data civil é a mesma em qualquer TZ e a suíte não depende
de variável de ambiente para passar na sua máquina e no CI.

Bordas cobertas: fim de mês (30 e 31), virada de ano, fevereiro comum e 29/02
em ano bissexto.

**Aleatoriedade.** A única fonte além do relógio é `Math.random()`, usada num
único ponto (`uid()`). O loader injeta um PRNG semeado.

**Sem espera arbitrária.** Não existe `sleep` nos testes. O tour do modo demo é
agendado por `setTimeout(startTour, 600)`; o helper substitui `startTour` por um
no-op **antes** de chamar `startDemo()`, então o agendamento já nasce inofensivo.
Isso importa porque `closeTour()` chama `exitDemo()` — "fechar o tour"
derrubaria o modo demo e traria a tela de login de volta.

**Zero retries no E2E**, deliberadamente. Um teste que só passa na segunda
tentativa tem um não-determinismo para investigar; reexecutar apenas o
esconderia.

## Fixtures

Regra inegociável: **o repositório é público** e servido pelo GitHub Pages.
Nenhum dado pessoal entra aqui — sem nomes de pessoas, credores reais, placas,
modelos de veículo reais ou valores copiados de produção. Os nomes são genéricos
("Bem Teste", "Banco Teste", "Plataforma Teste").

Quando um fixture reproduz um bug histórico, ele reproduz a **aritmética** do
bug, nunca os dados originais. `dividaComParcelaResidual` é o exemplo: total
6500 com parcela de 200 força o resolvedor a derivar 33 parcelas
(32 × 200 + 1 × 100).

No E2E, os dados vêm de `startDemo()` / `buildDemoData()` — o gerador sintético
que já existe no produto — e cada spec semeia o que precisa com `semearDados`.

## Hermetismo do E2E

Nenhuma requisição sai da máquina. O `index.html` referencia o SDK do Firebase
e as fontes do Google; ambos são interceptados e servidos por stub local. Um
spec do smoke falha se aparecer qualquer host externo além desses.

Service workers ficam bloqueados no contexto de teste: o `index.html` recarrega
a página quando o SW assume o controle (`controllerchange` → `location.reload()`),
o que destruiria o contexto de execução no meio de um fluxo. O cache do PWA não
é objeto desta suíte.

## Suítes permanentes (core regression)

| Suíte | O que trava |
|---|---|
| `loader-failfast` | a fundação falha quando deve falhar |
| `movement-nature` | as 22 regras de natureza e suas precedências |
| `period-summary` | caixa × consumo; aquisição e dívida fora do consumo |
| `month-aggregate` | resumo não move o caixa; bordas de calendário |
| `debt-schedule` | total derivado, parcela residual, saldo, vencimentos |
| `debt-projection` | invariantes de projeção + caracterização do P2 |
| `date-keys` | normalização de data local sem shift de fuso |
| `reconcile` | marcador órfão some; dinheiro real nunca some |
| `smoke` (E2E) | app sobe, sem erro de console, sem rede externa |
| `apresentacao` (E2E) | donut sem truncar; "Venda de patrimônio" |
| `lancamento` (E2E) | criar, editar e reclassificar pelo formulário real |
| `home-mes` (E2E) | a tela mostra o que o motor calcula |
| `dividas-patrimonio` (E2E) | cronograma na UI e ciclo de vida do bem |

## Caracterização do P2 (dívida técnica conhecida)

`debt-projection.test.mjs` termina com dois testes marcados
`P2 [caracterização, não especificação]`. Eles documentam que
`_debtPrevistoDoMes` chama `_debtVencimentosNoPeriodo(null, to)` sem limite
inferior, e por isso "A vencer no mês" enumera todo o backlog histórico.

**Isso não é a regra desejada — é uma fotografia do comportamento atual.**
Quando o P2 for corrigido, esses testes devem ser reescritos para expressar a
regra correta. A falha deles no commit do corretivo é o sinal de que ele
funcionou.

## Variáveis de ambiente

| Variável | Para quê |
|---|---|
| `AVENCO_TEST_PORT` | porta do servidor estático de teste (padrão 4173) |
| `AVENCO_CHROMIUM_PATH` | usar um Chromium já instalado, em vez de baixar outro |

`AVENCO_CHROMIUM_PATH` serve a sandboxes e imagens de CI que já trazem um
browser. Em uso normal ela não é definida e o Playwright usa o browser que ele
mesmo instalou.
