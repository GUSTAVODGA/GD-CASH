// Meia folga: o dia em que se trabalhou uma parte e se folgou o resto.
//
// Antes só existiam dois estados por dia: normal ou folga cheia — e folga
// cheia tranca lançamento de receita/gasto. Quem trabalha de manhã e para à
// tarde não tinha como registrar isso: marcar folga apagava o dia (e travava
// o lançamento do que já tinha ganhado); não marcar contava o dia como
// rodado por inteiro no Ritmo, o que infla o quanto já se cumpriu da semana
// prometida.
//
// O QUE ESTES TESTES PROTEGEM:
//
//   TRÊS ESTADOS NUM TOQUE SÓ: normal → meia folga → folga → normal.
//
//   MEIA FOLGA NÃO TRANCA LANÇAMENTO. Só a folga cheia tranca — é o motivo
//   dela existir.
//
//   MEIA FOLGA PESA 0,5 NO RITMO, não 0 nem 1 — e SÓ ela; sem marcação
//   nenhuma, o comportamento antigo (0 ou 1) continua idêntico.
//
//   A FAIXA DA SEMANA REFLETE O ESTADO NA HORA, sem precisar trocar de aba.
import { test, expect } from '@playwright/test';
import { abrirAppEmDemo, semearDados, lerEstado, esperarOverlay } from './_helpers.js';

// 20/08/2026, quinta. Mesma semana usada em ritmo-semana.spec.js.
const AGORA = new Date(2026, 7, 20, 15, 0, 0);

const FIXOS = [
  { id: 'f1', name: 'Aluguel', amount: 3000, category: 'Casa', dueDay: 1, since: '2026-01-01' },
  { id: 'f2', name: 'Internet', amount: 300, category: 'Contas', dueDay: 15, since: '2026-01-01' },
];

const BASE = {
  platforms: [{ id: 'p1', name: 'GrubHub', color: '#0C7A52' }],
  incomeItems: [], dailyIncome: {}, expenses: [], debtPayments: [], fixedPayments: [],
  debts: [], fixedExpenses: FIXOS, pendencias: [], vehicles: [], patrimonios: [],
  goals: [], reservaHistory: [], emergency: { current: 0, target: 0 },
  daysOff: [], daysHalfOff: [], reminders: [], confirmacoesAdiadas: {}, weeklyGoal: 0,
  // 3.300 ÷ 22 dias de rodagem (5/semana em agosto) = 150,00 por dia rodado.
  ritmo: { ligado: true, diasPorSemana: 5 },
};

const abrir = async (page, dados) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const erros = await abrirAppEmDemo(page, { agora: AGORA });
  await semearDados(page, { ...BASE, ...(dados || {}) }, 'semana');
  return erros;
};

const semana = page => page.evaluate(() => window._ritmoSemana(0));

// Abre a folha de detalhe do dia via "Editar dia completo", como o usuário
// de fato alcança o botão "Marcar folga".
const abrirFolhaDoDia = async (page, idxNaFaixa) => {
  await page.locator('.dsem-faixa .dsem-dia').nth(idxNaFaixa).click();
  await page.locator('#days-accordion').getByText('Editar dia completo').click();
  await esperarOverlay(page, 'modal-day-detail', true);
};

// segunda=0 ... quinta(hoje)=3 na faixa desta semana.
const QUARTA = '2026-08-19';
const IDX_QUARTA = 2;

test('TRÊS ESTADOS: um toque de cada vez, normal → meia folga → folga → normal', async ({ page }) => {
  await abrir(page);
  await abrirFolhaDoDia(page, IDX_QUARTA);

  const botao = page.locator('#btn-folga');
  await expect(botao).toHaveText('Marcar folga');
  await expect(botao).not.toHaveClass(/half|on/);

  await botao.click();
  await expect(botao).toHaveText('½ Meia folga');
  await expect(botao).toHaveClass(/half/);
  expect(await lerEstado(page, 'D.daysHalfOff')).toEqual([QUARTA]);
  expect(await lerEstado(page, 'D.daysOff')).toEqual([]);

  await botao.click();
  await expect(botao).toHaveText('✓ Folga');
  await expect(botao).toHaveClass(/on/);
  expect(await lerEstado(page, 'D.daysHalfOff')).toEqual([]);
  expect(await lerEstado(page, 'D.daysOff')).toEqual([QUARTA]);

  await botao.click();
  await expect(botao).toHaveText('Marcar folga');
  expect(await lerEstado(page, 'D.daysHalfOff')).toEqual([]);
  expect(await lerEstado(page, 'D.daysOff')).toEqual([]);
});

test('MEIA FOLGA NÃO TRANCA LANÇAMENTO — só a folga cheia tranca', async ({ page }) => {
  await abrir(page);
  await abrirFolhaDoDia(page, IDX_QUARTA);
  await page.locator('#btn-folga').click();   // normal → meia folga

  const input = page.locator('#inc-inputs-grid .inc-inp').first();
  await expect(input).toBeEnabled();
  const addSec = page.locator('#add-exp-section');
  await expect(addSec).toHaveCSS('pointer-events', 'auto');

  await page.locator('#btn-folga').click();   // meia folga → folga cheia
  await expect(input).toBeDisabled();
  await expect(addSec).toHaveCSS('pointer-events', 'none');
});

test('MEIA FOLGA PESA 0,5 NO RITMO — não um dia inteiro, não zero', async ({ page }) => {
  await abrir(page, { dailyIncome: { '2026-08-17': { p1: 200 }, '2026-08-18': { p1: 160 } } });
  // Sem meia folga marcada: 2 dias rodados, como antes desta feature.
  expect((await semana(page)).rodados).toBe(2);

  await abrirFolhaDoDia(page, IDX_QUARTA);
  await page.locator('#btn-folga').click();   // quarta vira meia folga

  const s = await semana(page);
  expect(s.rodados, 'dois dias inteiros + meia folga').toBe(2.5);
  await expect(page.locator('.rit-marca')).toHaveCount(0); // não quebra a barra
});

test('FOLGA CHEIA continua contando ZERO, como sempre contou', async ({ page }) => {
  await abrir(page, { dailyIncome: { '2026-08-17': { p1: 200 }, '2026-08-18': { p1: 160 } } });
  await abrirFolhaDoDia(page, IDX_QUARTA);
  await page.locator('#btn-folga').click();   // meia folga
  await page.locator('#btn-folga').click();   // folga cheia

  expect((await semana(page)).rodados).toBe(2);
});

test('a faixa da semana reflete o estado na hora, sem trocar de aba', async ({ page }) => {
  await abrir(page);
  await abrirFolhaDoDia(page, IDX_QUARTA);
  await page.locator('#btn-folga').click();   // meia folga

  const pill = page.locator('.dsem-faixa .dsem-dia').nth(IDX_QUARTA);
  await expect(pill).toHaveClass(/half-off/);
  await expect(page.locator('#days-accordion .dacc-sub')).toContainText('Meia folga');

  await page.locator('#btn-folga').click();   // folga cheia
  await expect(pill).toHaveClass(/(^| )off( |$)/);
  await expect(page.locator('#days-accordion .dacc-sub')).toContainText('Folga');
});

test('sem nenhuma meia folga marcada, o comportamento antigo não muda', async ({ page }) => {
  const erros = await abrir(page, {
    dailyIncome: { '2026-08-17': { p1: 200 }, '2026-08-18': { p1: 160 }, '2026-08-20': { p1: 90 } },
  });
  const s = await semana(page);
  expect(s.rodados).toBe(3);
  expect(s.faltamDias).toBe(2);
  expect(erros).toEqual([]);
});
