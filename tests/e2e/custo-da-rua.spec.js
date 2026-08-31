// O custo da rua — a correção da linha que dava permissão para parar cedo.
//
// Até a v83 a linha do dia era só o custo de EXISTIR: gastos fixos e parcelas
// de dívida. Faltava o que o trabalho consome para acontecer — gasolina,
// comida na rua, manutenção, pedágio.
//
// O efeito não era acadêmico. Com só o fixo, a linha nascia muito abaixo do
// que um dia de fato precisa render, e o placar da semana chegou a dizer, na
// tela de um usuário real:
//
//     "Faltam 5 dias e R$ 224,20 — dá R$ 44,84 por dia"
//
// depois de um único dia de R$ 227,60. Uma linha baixa demais é PIOR que
// nenhuma: ela dá permissão para parar cedo, que é exatamente o que este
// recurso existe para não fazer.
//
// O QUE ESTES TESTES PROTEGEM:
//
//   A DIVISÃO É DIFERENTE PARA CADA PARTE. O fixo é dividido pelos dias de
//   RODAGEM (o aluguel corre no domingo também, e quem paga por ele são os
//   dias em que se roda). O variável é POR DIA RODADO, direto, sem divisão:
//   gasolina não acontece na folga, acontece porque se rodou.
//
//   NADA É CONTADO DUAS VEZES. A baixa de um gasto fixo vira uma despesa com
//   `meta.source='fixed-payment'`, que o motor classifica como consumo. Se ela
//   entrasse no variável, o fixo seria contado duas vezes e o erro seria
//   invisível — só um número alto demais, sem explicação.
//
//   DÍVIDA E PATRIMÔNIO FICAM FORA. Parcela de dívida já é contada adiante,
//   pelos vencimentos; comprar um bem não é custo de rodar.
//
//   CONTINUA DERIVADO, NÃO DIGITADO. Sai das despesas já lançadas e se corrige
//   sozinho quando o preço da gasolina muda.
//
//   SEM HISTÓRICO, NADA MUDA. Quem nunca lançou uma despesa variável vê
//   exatamente o comportamento da v83 — ninguém recebe um número do nada.
import { test, expect } from '@playwright/test';
import { abrirAppEmDemo, semearDados, lerEstado } from './_helpers.js';

// 20/08/2026, uma quinta. Agosto tem 31 dias.
const AGORA = new Date(2026, 7, 20, 15, 0, 0);

const BASE = {
  platforms: [{ id: 'p1', name: 'GrubHub', color: '#0C7A52' }],
  incomeItems: [], dailyIncome: {}, expenses: [], debtPayments: [], fixedPayments: [],
  debts: [], fixedExpenses: [], pendencias: [], vehicles: [], patrimonios: [],
  goals: [], reservaHistory: [], emergency: { current: 0, target: 0 },
  daysOff: [], reminders: [], confirmacoesAdiadas: {},
};

// 3.300 de fixos: com 5 dias por semana em agosto são 22 dias de rodagem, e
// 3.300 ÷ 22 = 150,00 de parte fixa por dia rodado.
const FIXOS = [
  { id: 'f1', name: 'Aluguel',  amount: 3000, category: 'Casa',   dueDay: 1,  since: '2026-01-01' },
  { id: 'f2', name: 'Internet', amount: 200,  category: 'Contas', dueDay: 15, since: '2026-01-01' },
  { id: 'f3', name: 'Celular',  amount: 100,  category: 'Contas', dueDay: 20, since: '2026-01-01' },
];

const COM_RITMO = { ritmo: { ligado: true, diasPorSemana: 5 } };

/**
 * Dez dias rodados na janela, com 40,00 de gasolina em cada um: 400,00 em 10
 * dias rodados = 40,00 por dia rodado, redondo de propósito.
 */
function janelaDeRua({ porDia = 40, dias = 10 } = {}) {
  const dailyIncome = {}, expenses = [];
  for (let i = 1; i <= dias; i++) {
    const d = iso(-i);
    dailyIncome[d] = { p1: 300 };
    expenses.push({ id: 'g' + i, date: d, category: 'Gasolina', amount: porDia,
                    description: 'Gasolina' });
  }
  return { dailyIncome, expenses };
}

/** Data ISO a `n` dias de AGORA (n negativo = passado). */
function iso(n) {
  const d = new Date(AGORA); d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const abrir = async (page, dados, aba = 'inicio') => {
  await page.setViewportSize({ width: 390, height: 844 });
  const erros = await abrirAppEmDemo(page, { agora: AGORA });
  await semearDados(page, { ...BASE, ...(dados || {}) }, aba);
  return erros;
};

const custo = page => page.evaluate(() => window._custoDoDia(0));
const rua   = page => page.evaluate(() => window._custoVariavelPorDiaRodado());

// ── Sem histórico, nada muda ──────────────────────────────────────────────

test('SEM HISTÓRICO a linha é exatamente a da v83', async ({ page }) => {
  const erros = await abrir(page, { fixedExpenses: FIXOS, ...COM_RITMO });
  const c = await custo(page);
  expect(c.variavel).toBe(0);
  expect(c.temVariavel).toBe(false);
  expect(c.alvo, 'apareceu custo de rua sem nenhuma despesa lançada').toBe(150);
  expect(erros).toEqual([]);
});

// ── A conta ───────────────────────────────────────────────────────────────

test('O CUSTO DA RUA É POR DIA RODADO, sem diluir na folga', async ({ page }) => {
  // 400,00 de gasolina em 10 dias rodados. Por dia rodado são 40,00 — não
  // 400 ÷ 30 = 13,33, que é o que sairia diluindo pelos dias do calendário.
  await abrir(page, { fixedExpenses: FIXOS, ...COM_RITMO, ...janelaDeRua() });
  const r = await rua(page);
  expect(r.rodados).toBe(10);
  expect(r.total).toBe(400);
  expect(r.porDiaRodado, 'a gasolina foi diluída pelos dias parados').toBe(40);
});

test('a linha do dia é a parte fixa MAIS a rua', async ({ page }) => {
  await abrir(page, { fixedExpenses: FIXOS, ...COM_RITMO, ...janelaDeRua() });
  const c = await custo(page);
  expect(c.porDiaRodado, 'a parte fixa mudou').toBe(150);
  expect(c.variavel).toBe(40);
  expect(c.alvo, '150 de fixo + 40 de rua').toBe(190);
  expect(c.temVariavel).toBe(true);

  const d = await page.evaluate(() => window._diaSePagou());
  expect(d.alvo).toBe(190);
});

test('sem ritmo declarado a rua entra do mesmo jeito', async ({ page }) => {
  // A parte fixa divide pelos 31 dias (106,45); a rua continua por dia rodado.
  await abrir(page, { fixedExpenses: FIXOS, ritmo: { ligado: true }, ...janelaDeRua() });
  const c = await custo(page);
  expect(c.temRitmo).toBe(false);
  expect(c.porDia).toBe(106.45);
  expect(c.variavel).toBe(40);
  expect(c.alvo).toBe(146.45);
});

test('a rua se corrige sozinha quando a gasolina sobe', async ({ page }) => {
  // É por isto que ela não é digitada: um número à mão envelheceria em silêncio.
  await abrir(page, { fixedExpenses: FIXOS, ...COM_RITMO, ...janelaDeRua() });
  expect((await custo(page)).alvo).toBe(190);

  await page.evaluate(() => {
    // Dobra o gasto de rua de cada dia: 40 → 80 por dia rodado.
    window.eval('D').expenses.forEach(e => { e.amount = 80; });
    window.renderInicio();
  });
  const c = await custo(page);
  expect(c.variavel, 'o aumento da gasolina não chegou à linha').toBe(80);
  expect(c.alvo).toBe(230);
});

// ── Nada é contado duas vezes ─────────────────────────────────────────────

test('NÃO CONTA DUAS VEZES: a baixa de gasto fixo fica fora do variável', async ({ page }) => {
  // A baixa cria uma despesa com meta.source='fixed-payment', que o motor
  // classifica como consumo. Se ela entrasse aqui, o aluguel seria contado no
  // fixo E na rua, e o erro seria invisível.
  const { dailyIncome, expenses } = janelaDeRua();
  expenses.push({ id: 'bx1', date: iso(-3), category: 'Casa', amount: 3000,
                  description: 'Aluguel', meta: { source: 'fixed-payment', fixedId: 'f1', cycle: '2026-08' } });
  await abrir(page, { fixedExpenses: FIXOS, ...COM_RITMO, dailyIncome, expenses });

  const r = await rua(page);
  expect(r.total, 'a baixa do aluguel entrou no custo da rua').toBe(400);
  expect((await custo(page)).alvo).toBe(190);
});

test('DÍVIDA FICA FORA: parcela já é contada pelos vencimentos', async ({ page }) => {
  const { dailyIncome, expenses } = janelaDeRua();
  expenses.push({ id: 'dv1', date: iso(-4), category: 'Dívida', amount: 620,
                  description: 'Parcela', meta: { source: 'debt', debtId: 'd1' } });
  await abrir(page, { fixedExpenses: FIXOS, ...COM_RITMO, dailyIncome, expenses });
  expect((await rua(page)).total, 'a parcela de dívida entrou no custo da rua').toBe(400);
});

test('PATRIMÔNIO FICA FORA: comprar um bem não é custo de rodar', async ({ page }) => {
  const { dailyIncome, expenses } = janelaDeRua();
  expenses.push({ id: 'pt1', date: iso(-5), category: 'Carro', amount: 9000,
                  description: 'Entrada do carro', meta: { nature: 'asset-acquisition' } });
  await abrir(page, { fixedExpenses: FIXOS, ...COM_RITMO, dailyIncome, expenses });
  expect((await rua(page)).total, 'uma aquisição de patrimônio entrou na rua').toBe(400);
});

// ── A janela ──────────────────────────────────────────────────────────────

test('a janela olha para trás e IGNORA HOJE — o dia ainda não fechou', async ({ page }) => {
  const { dailyIncome, expenses } = janelaDeRua();
  dailyIncome[iso(0)] = { p1: 10 };
  expenses.push({ id: 'hj', date: iso(0), category: 'Gasolina', amount: 900, description: 'Gasolina' });
  await abrir(page, { fixedExpenses: FIXOS, ...COM_RITMO, dailyIncome, expenses });
  const r = await rua(page);
  expect(r.rodados, 'hoje entrou na janela').toBe(10);
  expect(r.total).toBe(400);
});

test('despesa fora da janela de 30 dias não conta', async ({ page }) => {
  const { dailyIncome, expenses } = janelaDeRua();
  expenses.push({ id: 'velho', date: iso(-45), category: 'Gasolina', amount: 5000, description: 'Gasolina' });
  await abrir(page, { fixedExpenses: FIXOS, ...COM_RITMO, dailyIncome, expenses });
  expect((await rua(page)).total, 'uma despesa de 45 dias atrás entrou na janela').toBe(400);
});

test('gasto de rua num dia SEM receita não vira divisão por zero', async ({ page }) => {
  // Só um dia de gasolina, sem nenhum dia rodado na janela.
  await abrir(page, {
    fixedExpenses: FIXOS, ...COM_RITMO,
    expenses: [{ id: 'g1', date: iso(-2), category: 'Gasolina', amount: 60, description: 'Gasolina' }],
  });
  const r = await rua(page);
  expect(r.rodados).toBe(0);
  expect(r.porDiaRodado, 'dividiu por zero dias rodados').toBe(0);
  expect((await custo(page)).alvo).toBe(150);
});

// ── O efeito no placar: o defeito que motivou tudo isto ───────────────────

test('O DEFEITO ORIGINAL: a semana deixa de dar permissão para parar cedo', async ({ page }) => {
  // Reprodução da tela real: um dia rodado de 227,60 numa semana de 6 dias
  // prometidos. Com a rua na conta, a meta da semana sobe e a linha da tarde
  // deixa de dizer um número que qualquer manhã resolve.
  const { dailyIncome, expenses } = janelaDeRua();
  await abrir(page, {
    fixedExpenses: FIXOS, ritmo: { ligado: true, diasPorSemana: 6 },
    dailyIncome, expenses,
  });
  const c = await custo(page);
  // 6 por semana em agosto = 27 dias de rodagem; 3.300 ÷ 27 = 122,22 de fixo.
  expect(c.diasRodagem).toBe(27);
  expect(c.porDiaRodado).toBe(122.22);
  expect(c.variavel).toBe(40);
  expect(c.alvo).toBe(162.22);

  const s = await page.evaluate(() => window._ritmoSemana(0));
  // O piso da semana é 6 × 162,22, não 6 × 122,22.
  expect(s.piso).toBe(973.32);
});

test('o mês se paga contra o custo INTEIRO, não só contra o fixo', async ({ page }) => {
  // Cobrar só o fixo declarava "o mês já se pagou" cedo demais.
  await abrir(page, { fixedExpenses: FIXOS, ...COM_RITMO, ...janelaDeRua() });
  const c = await custo(page);
  expect(c.rodagemPrevista).toBe(22);
  expect(c.mensalTotal, '3.300 de fixo + 40 × 22 dias de rua').toBe(4180);

  const m = await page.evaluate(() => window._ritmoMes(0));
  expect(m.custoMes).toBe(4180);
  expect(m.custoFixoMes, 'a composição perdeu a parte fixa').toBe(3300);
});

test('sem ritmo, a rodagem prevista sai da taxa recente, não de um palpite', async ({ page }) => {
  // 10 dias rodados em 30 → cerca de 1/3 dos dias. Em agosto, ~10 dias.
  await abrir(page, { fixedExpenses: FIXOS, ritmo: { ligado: true }, ...janelaDeRua() });
  const c = await custo(page);
  expect(c.temRitmo).toBe(false);
  expect(c.rodagemPrevista, 'round(10 × 31 ÷ 30)').toBe(10);
  expect(c.mensalTotal, '3.300 + 40 × 10').toBe(3700);
});

// ── A prestação de contas ─────────────────────────────────────────────────

test('a folha mostra a composição INTEIRA, com a janela de onde a rua saiu', async ({ page }) => {
  // Ninguém deve ver a própria linha subir sem saber por quê.
  await abrir(page, { fixedExpenses: FIXOS, ...COM_RITMO, ...janelaDeRua() }, 'ajustes');
  await page.locator('.srow', { hasText: 'Custo do dia' }).click();
  const dlg = page.locator('#_av_dlg');
  await expect(dlg).toBeVisible();
  await expect(dlg).toContainText('UM PEDAÇO DAS SUAS CONTAS DO MÊS');
  await expect(dlg).toContainText('R$ 150,00');
  await expect(dlg).toContainText('O QUE VOCÊ GASTOU NO DIA A DIA');
  await expect(dlg).toContainText('R$ 40,00');
  await expect(dlg, 'não presta contas da janela usada').toContainText('R$ 400,00');
  await expect(dlg).toContainText('rodou em 10 deles');
  await expect(dlg).toContainText('SOMANDO AS DUAS: R$ 190,00');

  // O RECIBO: as categorias são as do usuário, não substantivos que eu escolhi.
  await expect(dlg).toContainText('O que entrou nessa conta');
  await expect(dlg).toContainText('Gasolina — R$ 400,00 (100%)');
  await expect(dlg, 'a janela não se explica').toContainText('o irregular virar média');
});

test('o cartão da Início mostra a linha e a sua composição', async ({ page }) => {
  await abrir(page, { fixedExpenses: FIXOS, ...COM_RITMO, ...janelaDeRua() });
  const passo = page.locator('.rit-passo');
  await expect(passo).toContainText('Rodando 5 dias por semana');
  await expect(passo).toContainText('Um dia rodado precisa render R$ 190,00');
  // A composição NÃO fica na cara do cartão: ela mora a um toque de distância,
  // onde há espaço para explicar em vez de abreviar.
  await expect(passo, 'a aritmética voltou para a cara do cartão')
    .not.toContainText('de fixo');
  await expect(page.locator('#home-ritmo')
    .getByRole('button', { name: /Por que R\$ 190,00/ })).toBeVisible();
});

// ── A FOLHA QUE EXPLICA ───────────────────────────────────────────────────

test('O RECIBO: as categorias são as DO USUÁRIO, não substantivos escolhidos por mim', async ({ page }) => {
  // A primeira versão desta folha dizia "você gastou X de gasolina, comida e
  // manutenção" — três palavras que EU escolhi imaginando o que um motorista
  // gasta. O total sempre foi do usuário; o rótulo era meu. Quem leu percebeu
  // e perguntou de onde tinha saído: a resposta era "da minha cabeça".
  //
  // Aqui a conta se abre nas categorias que estão nos lançamentos, ordenadas
  // pela que mais pesa — porque quem confere um número quer achar o intruso, e
  // o intruso costuma estar no topo.
  // Um intruso MODERADO (17% da janela) continua dentro da média — ele não é
  // atípico, é só de outra natureza. O recibo é o que permite vê-lo.
  const { dailyIncome, expenses } = janelaDeRua();
  expenses.push({ id: 'int1', date: iso(-5), category: 'Roupas', amount: 80,
                  description: 'Camisa' });
  await abrir(page, { fixedExpenses: FIXOS, ...COM_RITMO, dailyIncome, expenses }, 'ajustes');

  const c = await custo(page);
  expect(c.variavelCategorias.map(x => x.nome)).toEqual(['Gasolina', 'Roupas']);
  expect(c.variavelCategorias[0].total).toBe(400);
  expect(c.variavelCategorias[1].total).toBe(80);
  expect(c.variavelLancamentos).toBe(11);

  await page.locator('.srow', { hasText: 'Custo do dia' }).click();
  const dlg = page.locator('#_av_dlg');
  await expect(dlg).toContainText('Gasolina — R$ 400,00 (83%)');
  await expect(dlg, 'o intruso não aparece — não dá para conferir').toContainText('Roupas — R$ 80,00 (17%)');
});

// ── Gasto único não é gasto de dia típico ─────────────────────────────────

test('O CASO REAL: a entrada de um carro não pode inflar a linha do dia', async ({ page }) => {
  // Relato: R$ 2.000,00 de entrada de um FUSION no começo do mês empurraram a
  // linha diária em R$ 71,43 e a mantiveram inflada por trinta dias. "Não vejo
  // sentido, o dia está caríssimo" — e estava. Um número em que não se acredita
  // é pior que número nenhum.
  const { dailyIncome, expenses } = janelaDeRua();
  expenses.push({ id: 'ent1', date: iso(-9), category: 'Carros', amount: 2000,
                  description: 'Entrada do FUSION' });
  await abrir(page, { fixedExpenses: FIXOS, ...COM_RITMO, dailyIncome, expenses });

  const c = await custo(page);
  expect(c.variavelForaDoPadrao).toHaveLength(1);
  expect(c.variavelForaDoPadrao[0].total).toBe(2000);
  expect(c.variavelForaDoPadrao[0].descricao).toBe('Entrada do FUSION');
  expect(c.variavelTotalFora).toBe(2000);

  // A linha do dia volta a ser a de antes da compra: 400 ÷ 10 = 40 de rua.
  expect(c.variavel, 'a entrada do carro entrou na média por dia').toBe(40);
  expect(c.alvo).toBe(190);
});

test('O DINHEIRO NÃO SOME: o gasto único continua cobrado no total do MÊS', async ({ page }) => {
  // Tirá-lo da média por dia sem devolvê-lo ao mês faria o mês declarar "já se
  // pagou" cedo demais — o mesmo defeito que a v84 corrigiu por outro caminho.
  const { dailyIncome, expenses } = janelaDeRua();
  expenses.push({ id: 'ent1', date: iso(-9), category: 'Carros', amount: 2000,
                  description: 'Entrada do FUSION' });
  await abrir(page, { fixedExpenses: FIXOS, ...COM_RITMO, dailyIncome, expenses });

  const c = await custo(page);
  expect(c.unicosDoMes, 'o gasto único sumiu do mês').toBe(2000);
  // 3.300 de fixo + 40 × 22 dias de rodagem + 2.000 do gasto único.
  expect(c.mensalTotal).toBe(6180);

  const m = await page.evaluate(() => window._ritmoMes(0));
  expect(m.custoMes).toBe(6180);
});

test('gasto único de OUTRO MÊS não é cobrado neste', async ({ page }) => {
  // A janela do variável é de 30 dias corridos e atravessa a virada do mês.
  const { dailyIncome, expenses } = janelaDeRua({ dias: 25 });
  expenses.push({ id: 'ent1', date: iso(-25), category: 'Carros', amount: 5000,
                  description: 'Entrada do FUSION' });   // 26/07, mês passado
  await abrir(page, { fixedExpenses: FIXOS, ...COM_RITMO, dailyIncome, expenses });

  const c = await custo(page);
  expect(c.variavelForaDoPadrao, 'não foi reconhecido como gasto único').toHaveLength(1);
  expect(c.unicosDoMes, 'cobrou de agosto um gasto de julho').toBe(0);
});

test('A FOLHA MOSTRA o que ficou de fora — esconder seria pior', async ({ page }) => {
  const { dailyIncome, expenses } = janelaDeRua();
  expenses.push({ id: 'ent1', date: iso(-9), category: 'Carros', amount: 2000,
                  description: 'Entrada do FUSION' });
  await abrir(page, { fixedExpenses: FIXOS, ...COM_RITMO, dailyIncome, expenses }, 'ajustes');
  await page.locator('.srow', { hasText: 'Custo do dia' }).click();

  const dlg = page.locator('#_av_dlg');
  await expect(dlg).toContainText('FORA DA CONTA POR DIA: R$ 2.000,00');
  await expect(dlg, 'não nomeia o que excluiu').toContainText('Entrada do FUSION — R$ 2.000,00');
  await expect(dlg).toContainText('pesa mais de um quinto');
  await expect(dlg, 'não diz que o dinheiro continua cobrado')
    .toContainText('continua cobrado no total do mês');
  await expect(dlg, 'não ensina a corrigir a classificação')
    .toContainText('aquisição de patrimônio');
});

test('COM POUCO HISTÓRICO ninguém é excluído: não há padrão para comparar', async ({ page }) => {
  // Com 5 lançamentos, "fora do padrão" não existe — existe pouca informação, e
  // aí excluir seria arbitrário.
  const { dailyIncome, expenses } = janelaDeRua({ dias: 5 });
  await abrir(page, { fixedExpenses: FIXOS, ...COM_RITMO, dailyIncome, expenses });
  const c = await custo(page);
  expect(c.variavelForaDoPadrao, 'excluiu com base em 5 lançamentos').toHaveLength(0);
  expect(c.variavelTotal).toBe(200);
  expect(c.variavel, '200 ÷ 5 dias rodados').toBe(40);
});

test('um gasto grande que se REPETE não é único, e continua na média', async ({ page }) => {
  // Três abastecimentos de 150 numa janela de 850: cada um pesa 18%, abaixo do
  // limite. Repetição é padrão, não exceção.
  const { dailyIncome, expenses } = janelaDeRua();
  [3, 6, 9].forEach((d, i) => expenses.push({ id: 'big' + i, date: iso(-d),
    category: 'Gasolina', amount: 150, description: 'Tanque cheio' }));
  await abrir(page, { fixedExpenses: FIXOS, ...COM_RITMO, dailyIncome, expenses });
  const c = await custo(page);
  expect(c.variavelForaDoPadrao, 'excluiu um gasto que se repete').toHaveLength(0);
  expect(c.variavelTotal).toBe(850);
});

test('a folha diz que o gasto NÃO é diário — ninguém abastece todo dia', async ({ page }) => {
  await abrir(page, { fixedExpenses: FIXOS, ...COM_RITMO, ...janelaDeRua() }, 'ajustes');
  await page.locator('.srow', { hasText: 'Custo do dia' }).click();
  const dlg = page.locator('#_av_dlg');
  await expect(dlg).toContainText('Você não gasta isso todo dia');
  await expect(dlg).toContainText('o irregular virar média');
});

test('a folha CABE na tela e os botões continuam alcançáveis', async ({ page }) => {
  // Ao ganhar o recibo, a explicação ficou longa e empurrou os próprios botões
  // para fora do viewport: "Entendi" ficava inalcançável num aparelho baixo.
  //
  // O viewport é encolhido DEPOIS de `abrir`, que fixa 844px de altura por
  // conta própria — na primeira escrita deste teste ele vinha antes e era
  // sobrescrito em silêncio, então a asserção mediu 667 contra uma tela de 844
  // e passou por acidente.
  await abrir(page, { fixedExpenses: FIXOS, ...COM_RITMO, ...janelaDeRua() }, 'ajustes');
  const ALTURA = 667;                                   // o menor iPhone em uso
  await page.setViewportSize({ width: 390, height: ALTURA });
  await page.locator('.srow', { hasText: 'Custo do dia' }).click();
  await page.waitForTimeout(300);                       // a entrada do diálogo

  const dlg = page.locator('.av-dialog');
  const caixa = await dlg.boundingBox();
  const tela = await page.evaluate(() => window.innerHeight);
  expect(tela, 'o viewport não é o que o teste pediu').toBe(ALTURA);
  expect(caixa.height, 'o diálogo passou da altura da tela').toBeLessThanOrEqual(tela);

  const botao = page.locator('#_av_dlg').getByRole('button', { name: 'Entendi' });
  await expect(botao).toBeInViewport();

  // E o corpo rola, para que o fim do texto continue legível.
  const rolou = await page.locator('.av-dialog-msg').evaluate(el => {
    const antes = el.scrollTop; el.scrollTop = el.scrollHeight; return el.scrollTop > antes;
  });
  expect(rolou, 'o corpo do diálogo não rola: o fim do texto é inalcançável').toBe(true);
});

test('A ÊNFASE: numa folha que só explica, o botão destacado é "Entendi"', async ({ page }) => {
  // Ela vinha com "Desligar" em verde, na posição do botão principal — então o
  // gesto óbvio de quem terminou de ler desligava o recurso.
  await abrir(page, { fixedExpenses: FIXOS, ...COM_RITMO, ...janelaDeRua() }, 'ajustes');
  await page.locator('.srow', { hasText: 'Custo do dia' }).click();

  const principal = page.locator('#_av_dlg .btn-primary');
  await expect(principal).toHaveCount(1);
  await expect(principal, 'o botão em destaque desliga o recurso').toHaveText('Entendi');

  // E "Entendi" fecha sem mexer em nada.
  await principal.click();
  await page.waitForTimeout(300);
  expect(await lerEstado(page, 'D.ritmo.ligado'), 'ler a explicação desligou o recurso').toBe(true);
});

test('DESLIGADO a folha é um convite, e aí "Ligar" é que fica em destaque', async ({ page }) => {
  await abrir(page, { fixedExpenses: FIXOS, ...janelaDeRua() }, 'ajustes');
  await page.locator('.srow', { hasText: 'Custo do dia' }).click();
  const principal = page.locator('#_av_dlg .btn-primary');
  await expect(principal).toHaveText('Ligar');
  await principal.click();
  await page.waitForTimeout(300);
  expect(await lerEstado(page, 'D.ritmo.ligado')).toBe(true);
});

test('calcular a rua é só leitura: não encosta em D nem salva', async ({ page }) => {
  await abrir(page, { fixedExpenses: FIXOS, ...COM_RITMO, ...janelaDeRua() });
  const antes = await lerEstado(page, 'JSON.stringify(D)');
  const salvou = await page.evaluate(() => {
    let n = 0; const s = window.save; window.save = () => { n++; return s && s(); };
    window._custoVariavelPorDiaRodado(); window._custoDoDia(0);
    window._ritmoSemana(0); window._ritmoMes(0); window.renderInicio();
    window.save = s; return n;
  });
  expect(salvou).toBe(0);
  expect(await lerEstado(page, 'JSON.stringify(D)')).toBe(antes);
});
