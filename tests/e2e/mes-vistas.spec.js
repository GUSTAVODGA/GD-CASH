// As vistas da tela Mês.
//
// A tela tinha 17 blocos empilhados e 3.150px de rolagem. Agora os mesmos
// blocos vivem em três vistas. A pergunta que estes testes existem para
// responder não é "as abas funcionam" — é "NADA se perdeu no caminho".
import { test, expect } from '@playwright/test';
import { abrirAppEmDemo, semearDados, irParaAba, lerEstado } from './_helpers.js';

const AGORA = new Date(2026, 7, 20, 12, 0, 0);   // agosto/2026

const LIMPO = {
  incomeItems: [], dailyIncome: {}, expenses: [], debtPayments: [], fixedPayments: [],
  debts: [], fixedExpenses: [], pendencias: [], vehicles: [], patrimonios: [], reservaHistory: [],
  platforms: [{ id: 'plat-1', name: 'Fonte A', color: '#0C7A52' }, { id: 'plat-2', name: 'Fonte B', color: '#1A6FA8' }],
};

const g = (id, d, v, c, desc, extra) => Object.assign({ id, date: d, amount: v, category: c, description: desc || 'Lançamento' }, extra || {});
const rec = (id, d, v, p) => ({ id, date: d, amount: v, status: 'paid', platformId: p || 'plat-1', note: '' });

const CENARIO = {
  ...LIMPO,
  debts: [{ id: 'd1', tipo: 'financiamento', titulo: 'Financiamento Teste', credor: 'Banco Teste',
    valorOriginal: 60000, valorParcela: 1450, parcelasTotal: 42, amortizadoInicial: 0,
    dataInicio: '2025-03-10', periodicidade: 'mensal', status: 'ativa' }],
  incomeItems: [rec('i1', '2026-08-04', 3000), rec('i2', '2026-08-18', 2500, 'plat-2'),
                rec('j1', '2026-07-04', 2800), rec('j2', '2026-07-18', 2200, 'plat-2')],
  expenses: [g('e1', '2026-08-05', 900, 'Alimentação'), g('e2', '2026-08-12', 600, 'Transporte'),
             g('e3', '2026-08-19', 400, 'Casa'), g('j3', '2026-07-06', 700, 'Alimentação')],
  reservaHistory: [{ date: '2026-08-15', type: 'dep', amount: 300 }],
  catBudgets: { 'Alimentação': 400 },
};

/** Todo bloco da tela e a vista onde ele mora. É o inventário do que existia
 *  antes das vistas: se um sumir, um teste abaixo cai. */
const BLOCOS = {
  resumo:   ['#month-summary', '#mes-previsto', '#cat-donut', '#cat-legend'],
  analise:  ['#mes-comp-section', '#mes-insights-section', '#plat-donut', '#plat-legend', '#cat-budget-bars'],
  evolucao: ['#s2s-bars', '#trends-chart'],
};
const TODOS = Object.values(BLOCOS).flat();

async function abrir(page) {
  await abrirAppEmDemo(page, { agora: AGORA });
  await semearDados(page, CENARIO, 'mes');
}

test('a vista de entrada é Resumo', async ({ page }) => {
  await abrir(page);
  await expect(page.locator('#page-mes .mes-tab.active')).toHaveText('Resumo');
  await expect(page.locator('#page-mes .mes-vista.active')).toHaveAttribute('data-vista', 'resumo');
});

test('NADA SE PERDEU: cada bloco da tela antiga existe e é alcançável', async ({ page }) => {
  await abrir(page);

  // Existir no documento é o primeiro requisito: nenhum bloco foi removido.
  for (const sel of TODOS) {
    await expect(page.locator(sel), `bloco ${sel} sumiu do documento`).toHaveCount(1);
  }

  // E cada um fica VISÍVEL na sua vista — ou seja, alcançável a um toque.
  for (const [vista, seletores] of Object.entries(BLOCOS)) {
    await page.evaluate(v => window.setMesView(v), vista);
    for (const sel of seletores) {
      // `#month-summary` e `#cat-budget-bars` podem estar vazios conforme os
      // dados; o que se exige aqui é que a VISTA os exponha, não que tenham
      // conteúdo. Por isso a checagem é do contêiner da vista.
      const naVista = await page.locator(sel).evaluate(
        (el, v) => el.closest('.mes-vista')?.dataset.vista === v, vista);
      expect(naVista, `${sel} não está na vista ${vista}`).toBe(true);
    }
    await expect(page.locator(`#page-mes .mes-vista[data-vista="${vista}"]`)).toBeVisible();
  }
});

test('trocar de vista esconde as outras e só as outras', async ({ page }) => {
  await abrir(page);
  for (const vista of ['analise', 'evolucao', 'resumo']) {
    await page.locator(`#page-mes .mes-tab[data-vista="${vista}"]`).click();
    await expect(page.locator(`#page-mes .mes-vista[data-vista="${vista}"]`)).toBeVisible();
    for (const outra of Object.keys(BLOCOS).filter(v => v !== vista)) {
      await expect(page.locator(`#page-mes .mes-vista[data-vista="${outra}"]`)).toBeHidden();
    }
    await expect(page.locator('#page-mes .mes-tab.active')).toHaveCount(1);
  }
});

test('a vista sobrevive à troca de mês', async ({ page }) => {
  await abrir(page);
  await page.locator('#page-mes .mes-tab[data-vista="evolucao"]').click();
  const antes = await lerEstado(page, 'monthOffset');

  await page.evaluate(() => window.changeMonth(-1));
  expect(await lerEstado(page, 'monthOffset')).toBe(antes - 1);
  // Quem está comparando meses no Histórico não volta ao Resumo a cada seta.
  await expect(page.locator('#page-mes .mes-tab.active')).toHaveText('Evolução');
  await expect(page.locator('#page-mes .mes-vista[data-vista="evolucao"]')).toBeVisible();
});

test('as ações do mês ficam fora das vistas, sempre alcançáveis', async ({ page }) => {
  await abrir(page);
  for (const vista of ['resumo', 'analise', 'evolucao']) {
    await page.evaluate(v => window.setMesView(v), vista);
    await expect(page.locator('.share-month-btn[onclick*="shareMonthReport"]')).toBeVisible();
    await expect(page.locator('.share-month-btn[onclick*="emailMonthReport"]')).toBeVisible();
  }
});

test('a tela encurtou de verdade, e nenhuma vista vira um novo rolo', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await abrir(page);
  const alturas = {};
  for (const vista of ['resumo', 'analise', 'evolucao']) {
    await page.evaluate(v => window.setMesView(v), vista);
    await page.waitForTimeout(120);
    alturas[vista] = await page.evaluate(() => document.body.scrollHeight);
  }
  // O ganho é o motivo da mudança: antes eram ~3.150px em UMA tela. Se uma
  // vista voltar a passar disso, a reorganização perdeu o sentido.
  Object.entries(alturas).forEach(([v, h]) => {
    expect(h, `a vista ${v} voltou a ser um rolo (${h}px)`).toBeLessThan(2400);
  });
});

test('a vista é estado de tela: não encosta em D nem chama save()', async ({ page }) => {
  await abrir(page);
  const antes = await lerEstado(page, 'JSON.stringify(D)');
  await page.evaluate(() => {
    window.__salvou = 0;
    const s = window.save; window.save = () => { window.__salvou++; return s && s(); };
    ['analise', 'evolucao', 'resumo'].forEach(v => window.setMesView(v));
  });
  expect(await lerEstado(page, 'JSON.stringify(D)')).toBe(antes);
  expect(await lerEstado(page, 'window.__salvou')).toBe(0);
});

test('a tela Mês não solta erro de console ao trocar de vista', async ({ page }) => {
  const erros = await abrirAppEmDemo(page, { agora: AGORA });
  await semearDados(page, CENARIO, 'mes');
  for (const v of ['analise', 'evolucao', 'resumo']) {
    await page.locator(`#page-mes .mes-tab[data-vista="${v}"]`).click();
    await page.waitForTimeout(100);
  }
  await irParaAba(page, 'inicio');
  await irParaAba(page, 'mes');
  expect(erros).toEqual([]);
});
