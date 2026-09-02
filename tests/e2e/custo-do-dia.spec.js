// "Hoje já se pagou?" — a pergunta das três da tarde.
//
// A Início respondia pelo MÊS: quanto sobra, o que vence. Nenhum número
// respondia a pergunta que se faz com o carro ligado, decidindo entre voltar
// para casa ou rodar mais duas horas. Sem ela não há nada segurando ninguém na
// rua, e o dinheiro que entra some dentro das contas sem nunca parecer que
// sobrou algo.
//
// O QUE ESTES TESTES PROTEGEM:
//
//   O NÚMERO É DERIVADO, NÃO DIGITADO. Sai dos gastos fixos e das parcelas de
//   dívida que o usuário já cadastrou, e se corrige sozinho quando um custo
//   muda. Um valor digitado à mão envelheceria em silêncio — aumentou o
//   aluguel, a linha de chegada continuaria no lugar antigo e o app passaria a
//   MENTIR PARA MENOS, que é o erro que faz parar mais cedo achando que deu.
//
//   A PARCELA DE DÍVIDA CONTA. Ela é custo de existir tanto quanto aluguel, e
//   deixá-la de fora faria a linha nascer baixa demais. Linha baixa demais é
//   pior que nenhuma: dá permissão para parar cedo.
//
//   DIVIDE PELOS DIAS DO MÊS, não pelos dias trabalhados. Aluguel corre no
//   domingo também. Para quem não tem rotina isso é o mais honesto: não julga
//   a folga, só mostra que o dia parado custou o mesmo.
//
//   DIA SEM RECEITA NÃO É FRACASSO. A média é por DIA RODADO. Um app que
//   transforma descanso em derrota é um app que se desinstala.
//
//   NASCE DESLIGADO. Quem não ligar não vê absolutamente nada mudar.
import { test, expect } from '@playwright/test';
import { abrirAppEmDemo, semearDados, irParaAba, lerEstado } from './_helpers.js';

const AGORA = new Date(2026, 7, 20, 15, 0, 0);   // 20/08/2026 — agosto tem 31 dias

const BASE = {
  platforms: [{ id: 'p1', name: 'GrubHub', color: '#0C7A52' }],
  incomeItems: [], dailyIncome: {}, expenses: [], debtPayments: [], fixedPayments: [],
  debts: [], fixedExpenses: [], pendencias: [], vehicles: [], patrimonios: [],
  goals: [], reservaHistory: [], emergency: { current: 0, target: 0 },
  daysOff: [], reminders: [], confirmacoesAdiadas: {},
};

// 3.100 de fixos ÷ 31 dias = 100,00 por dia. Números redondos de propósito:
// um teste que erra deve apontar para a regra, não para o arredondamento.
const FIXOS = [
  { id: 'f1', name: 'Aluguel', amount: 2800, category: 'Casa', dueDay: 1, since: '2026-01-01' },
  { id: 'f2', name: 'Internet', amount: 200, category: 'Contas', dueDay: 15, since: '2026-01-01' },
  { id: 'f3', name: 'Celular', amount: 100, category: 'Contas', dueDay: 20, since: '2026-01-01' },
];

const LIGADO = { ritmo: { ligado: true } };

const abrir = async (page, dados, aba = 'inicio') => {
  await page.setViewportSize({ width: 390, height: 844 });
  const erros = await abrirAppEmDemo(page, { agora: AGORA });
  await semearDados(page, { ...BASE, ...(dados || {}) }, aba);
  return erros;
};

const custo = page => page.evaluate(() => window._custoDoDia(0));
const dia   = page => page.evaluate(() => window._diaSePagou());

// ── Nasce desligado ───────────────────────────────────────────────────────

test('NASCE DESLIGADO: sem ligar, nada muda na Início', async ({ page }) => {
  const erros = await abrir(page, { fixedExpenses: FIXOS });
  await expect(page.locator('#home-dia'), 'apareceu sem ninguém ligar').toBeEmpty();
  expect(await lerEstado(page, 'JSON.stringify(D.ritmo || null)')).toBe('null');
  expect(erros).toEqual([]);
});

test('ligar e desligar é reversível, e some ao desligar', async ({ page }) => {
  await abrir(page, { fixedExpenses: FIXOS });
  await page.evaluate(() => { window.eval('D').ritmo = { ligado: true }; window.renderInicio(); });
  await expect(page.locator('#home-dia')).toContainText('dia');

  await page.evaluate(() => { window.eval('D').ritmo.ligado = false; window.renderInicio(); });
  await expect(page.locator('#home-dia'), 'desligar não limpou a tela').toBeEmpty();
});

// ── O número é derivado ───────────────────────────────────────────────────

test('DERIVADO: o custo do dia sai dos gastos fixos cadastrados', async ({ page }) => {
  await abrir(page, { fixedExpenses: FIXOS, ...LIGADO });
  const c = await custo(page);
  expect(c.fixos).toBe(3100);
  expect(c.dias, 'agosto tem 31 dias').toBe(31);
  expect(c.porDia).toBe(100);
  expect(c.manual, 'usou valor manual sem ninguém pedir').toBe(false);
});

test('DERIVADO: mudar um gasto fixo move a linha de chegada na hora', async ({ page }) => {
  // É por isto que ele não é digitado: um número à mão envelheceria em silêncio.
  await abrir(page, { fixedExpenses: FIXOS, ...LIGADO });
  expect((await custo(page)).porDia).toBe(100);

  await page.evaluate(() => {
    window.eval('D').fixedExpenses.find(f => f.id === 'f1').amount = 3420;  // +620
    window.renderInicio();
  });
  expect((await custo(page)).porDia, 'o aumento do aluguel não chegou ao dia').toBe(120);
  await expect(page.locator('#home-dia')).toContainText('R$ 120,00');
});

test('gasto fixo PAUSADO não pesa no dia', async ({ page }) => {
  await abrir(page, {
    fixedExpenses: [...FIXOS, { id: 'f9', name: 'Academia', amount: 310, category: 'Saúde',
                                dueDay: 5, since: '2026-01-01', paused: true }],
    ...LIGADO,
  });
  expect((await custo(page)).porDia, 'contou um fixo pausado').toBe(100);
});

test('A PARCELA DE DÍVIDA CONTA: ela é custo de existir como o aluguel', async ({ page }) => {
  await abrir(page, {
    fixedExpenses: FIXOS,
    debts: [{ id: 'd1', tipo: 'financiamento', titulo: 'Financiamento do carro', credor: 'Banco',
              valorOriginal: 60000, valorParcela: 620, parcelasTotal: 42, amortizadoInicial: 0,
              dataInicio: '2026-02-10', periodicidade: 'mensal', status: 'ativa' }],
    ...LIGADO,
  });
  const c = await custo(page);
  expect(c.dividas, 'a parcela do mês ficou de fora do custo do dia').toBe(620);
  expect(c.mensal).toBe(3720);
  expect(c.porDia).toBe(120);
});

test('sem custo cadastrado, o app pede o cadastro em vez de mostrar zero', async ({ page }) => {
  // Uma linha de chegada em zero não segura ninguém — e "o dia se pagou" com
  // alvo zero seria uma mentira confortável.
  await abrir(page, { fixedExpenses: [], ...LIGADO });
  expect((await custo(page)).semBase).toBe(true);
  await expect(page.locator('#home-dia')).toContainText('Cadastre seus gastos fixos');
  await expect(page.locator('#home-dia'), 'mostrou um alvo inventado').not.toContainText('faltam');
});

test('o ajuste manual substitui o derivado, e se identifica como manual', async ({ page }) => {
  await abrir(page, { fixedExpenses: FIXOS, ritmo: { ligado: true, custoMensalManual: 6200 } });
  const c = await custo(page);
  expect(c.manual).toBe(true);
  expect(c.mensal).toBe(6200);
  expect(c.porDia).toBe(200);
});

// ── O dia ─────────────────────────────────────────────────────────────────

test('antes da linha: diz quanto falta, não quanto entrou', async ({ page }) => {
  await abrir(page, { fixedExpenses: FIXOS, dailyIncome: { '2026-08-20': { p1: 62 } }, ...LIGADO });
  const d = await dia(page);
  expect(d.alvo).toBe(100);
  expect(d.entrou).toBe(62);
  expect(d.pagou).toBe(false);
  expect(d.falta).toBe(38);
  expect(d.pct).toBe(62);

  const card = page.locator('#home-dia');
  await expect(card).toContainText('Para o dia se pagar');
  await expect(card).toContainText('faltam R$ 38,00');
  await expect(card).toContainText('Entrou R$ 62,00 de R$ 100,00');
});

test('depois da linha: "são seus" — o que o dia produziu além do custo', async ({ page }) => {
  // É a frase que faltava. O dinheiro deixa de sumir dentro das contas.
  await abrir(page, { fixedExpenses: FIXOS, dailyIncome: { '2026-08-20': { p1: 285 } }, ...LIGADO });
  const d = await dia(page);
  expect(d.pagou).toBe(true);
  expect(d.sobra).toBe(185);
  expect(d.falta).toBe(0);

  const card = page.locator('#home-dia');
  await expect(card).toContainText('O dia se pagou');
  await expect(card).toContainText('R$ 185,00');
  await expect(card).toContainText('são seus');
});

test('exatamente na linha conta como pago', async ({ page }) => {
  await abrir(page, { fixedExpenses: FIXOS, dailyIncome: { '2026-08-20': { p1: 100 } }, ...LIGADO });
  const d = await dia(page);
  expect(d.pagou, 'bater o alvo exato não contou como pago').toBe(true);
  expect(d.sobra).toBe(0);
});

test('dia sem receita: falta o alvo inteiro, e nada de vermelho', async ({ page }) => {
  await abrir(page, { fixedExpenses: FIXOS, ...LIGADO });
  const d = await dia(page);
  expect(d.entrou).toBe(0);
  expect(d.falta).toBe(100);
  // Nenhuma linguagem de culpa: o app informa, não cobra.
  const txt = await page.locator('#home-dia').innerText();
  for (const palavra of ['perdeu', 'falhou', 'atrás', 'devendo', 'negativo']) {
    expect(txt.toLowerCase(), `o cartão usa linguagem de cobrança: "${palavra}"`).not.toContain(palavra);
  }
});

// ── A média ───────────────────────────────────────────────────────────────

// ── A porta ───────────────────────────────────────────────────────────────

test('AJUSTES: a porta existe e mostra o estado', async ({ page }) => {
  await abrir(page, { fixedExpenses: FIXOS }, 'ajustes');
  const linha = page.locator('.srow', { hasText: 'Custo do dia' });
  await expect(linha).toHaveCount(1);
  await expect(linha).toContainText('Desligado');

  await page.evaluate(() => { window.eval('D').ritmo = { ligado: true }; window.switchTab('ajustes'); });
  await expect(linha, 'ligado, não mostra o número que está valendo').toContainText('R$ 100,00 por dia');
});

test('AJUSTES E INÍCIO MOSTRAM O MESMO NÚMERO — mesmo quando divergem entre si', async ({ page }) => {
  // Relato: a Início dizia "R$ 116,43 por dia" e os Ajustes diziam
  // "R$ 76,45 por dia" para a mesma pergunta, na mesma sessão. A causa: os
  // Ajustes liam `_custoDoDia().porDia` — uma quantidade INTERNA (só a parte
  // fixa, dividida pelos dias do calendário) — em vez de `.alvo`, a linha que
  // vale de verdade. Com ritmo declarado e custo de rua, os dois divergem.
  const dailyIncome = {}, expenses = [];
  for (let i = 1; i <= 10; i++) {
    const d = new Date(AGORA); d.setDate(d.getDate() - i);
    const dISO = d.toISOString().slice(0, 10);
    dailyIncome[dISO] = { p1: 300 };
    expenses.push({ id: 'g' + i, date: dISO, category: 'Gasolina', amount: 40, description: 'Posto' });
  }
  await abrir(page, {
    fixedExpenses: FIXOS, dailyIncome, expenses,
    ritmo: { ligado: true, diasPorSemana: 5 },
  }, 'ajustes');

  const c = await page.evaluate(() => window._custoDoDia(0));
  expect(c.porDia, 'o cenário não cobre o caso em que porDia ≠ alvo').not.toBe(c.alvo);
  const { alvoTxt, porDiaTxt } = await page.evaluate(() =>
    ({ alvoTxt: window.R(window._custoDoDia(0).alvo), porDiaTxt: window.R(window._custoDoDia(0).porDia) }));

  const linha = page.locator('.srow', { hasText: 'Custo do dia' });
  await expect(linha, 'os Ajustes mostraram a quantidade interna, não a linha que vale')
    .toContainText(`${alvoTxt} por dia rodado`);
  await expect(linha, 'os Ajustes mostraram o número errado').not.toContainText(porDiaTxt);

  await page.evaluate(() => window.switchTab('inicio'));
  await page.waitForTimeout(900);
  await expect(page.locator('#home-dia')).toContainText(alvoTxt);
});

test('a folha explica a conta ANTES de ligar', async ({ page }) => {
  // Ninguém deve descobrir a própria linha de chegada por surpresa.
  await abrir(page, { fixedExpenses: FIXOS }, 'ajustes');
  await page.locator('.srow', { hasText: 'Custo do dia' }).click();
  const dlg = page.locator('#_av_dlg');
  await expect(dlg).toBeVisible();
  await expect(dlg).toContainText('UM PEDAÇO DAS SUAS CONTAS DO MÊS');
  await expect(dlg).toContainText('R$ 3.100,00');
  await expect(dlg).toContainText('31 dias');
  await expect(dlg).toContainText('R$ 100,00');
  // E promete o que o desenho promete.
  await expect(dlg, 'não diz que folga não vira vermelho').toContainText('não fica vermelho');

  await dlg.getByRole('button', { name: 'Ligar' }).click();
  await page.waitForTimeout(200);
  expect(await lerEstado(page, 'D.ritmo.ligado')).toBe(true);
});

test('calcular o dia é só leitura: não encosta em D nem salva', async ({ page }) => {
  await abrir(page, { fixedExpenses: FIXOS, dailyIncome: { '2026-08-20': { p1: 62 } }, ...LIGADO });
  const antes = await lerEstado(page, 'JSON.stringify(D)');
  const salvou = await page.evaluate(() => {
    let n = 0; const s = window.save; window.save = () => { n++; return s && s(); };
    window._custoDoDia(0); window._diaSePagou();
    window.renderHomeDia(); window.renderInicio();
    window.save = s; return n;
  });
  expect(salvou).toBe(0);
  expect(await lerEstado(page, 'JSON.stringify(D)')).toBe(antes);
});
