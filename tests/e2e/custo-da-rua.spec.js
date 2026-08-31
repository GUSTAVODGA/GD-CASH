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

  const s = await page.evaluate(() => window._ritmoSemana());
  // A meta da semana é 6 × 162,22, não 6 × 122,22.
  expect(s.meta).toBe(973.32);
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
  await expect(dlg).toContainText('Gastos fixos');
  await expect(dlg).toContainText('Fixo por dia rodado: R$ 150,00');
  await expect(dlg).toContainText('Gasolina, comida e manutenção: R$ 40,00 por dia rodado');
  await expect(dlg, 'não presta contas da janela usada').toContainText('R$ 400,00 em 10 dias rodados');
  await expect(dlg).toContainText('Um dia rodado precisa render R$ 190,00');
});

test('o cartão da Início mostra a linha e a sua composição', async ({ page }) => {
  await abrir(page, { fixedExpenses: FIXOS, ...COM_RITMO, ...janelaDeRua() });
  const passo = page.locator('.rit-passo');
  await expect(passo).toContainText('Pretendo rodar 5 dias por semana');
  await expect(passo).toContainText('Cada dia rodado precisa render R$ 190,00');
  await expect(passo).toContainText('R$ 150,00 de fixo e R$ 40,00 de rua');
});

test('calcular a rua é só leitura: não encosta em D nem salva', async ({ page }) => {
  await abrir(page, { fixedExpenses: FIXOS, ...COM_RITMO, ...janelaDeRua() });
  const antes = await lerEstado(page, 'JSON.stringify(D)');
  const salvou = await page.evaluate(() => {
    let n = 0; const s = window.save; window.save = () => { n++; return s && s(); };
    window._custoVariavelPorDiaRodado(); window._custoDoDia(0);
    window._ritmoSemana(); window._ritmoMes(0); window.renderInicio();
    window.save = s; return n;
  });
  expect(salvou).toBe(0);
  expect(await lerEstado(page, 'JSON.stringify(D)')).toBe(antes);
});
