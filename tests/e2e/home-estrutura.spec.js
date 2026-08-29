// A nova arrumação da Home.
//
// A Home era oito blocos empilhados. Agora tem três andares: o que precisa de
// você, um baralho que se alcança de lado, e os últimos lançamentos.
//
// Como em `mes-vistas`, a pergunta destes testes não é "o baralho desliza" —
// é NADA SE PERDEU, e nada ficou inalcançável.
import { test, expect } from '@playwright/test';
import { abrirAppEmDemo, semearDados, lerEstado } from './_helpers.js';

const AGORA = new Date(2026, 7, 20, 12, 0, 0);

const g = (id, d, v, c, desc) => ({ id, date: d, amount: v, category: c, description: desc || 'Lançamento' });
const rec = (id, d, v) => ({ id, date: d, amount: v, status: 'paid', platformId: 'plat-1', note: '' });

const CENARIO = {
  incomeItems: [rec('i1', '2026-08-04', 3000), rec('i2', '2026-08-18', 2500),
                rec('j1', '2026-07-04', 2800), rec('m1', '2026-06-04', 2600)],
  dailyIncome: {}, debtPayments: [], fixedPayments: [], vehicles: [], patrimonios: [],
  platforms: [{ id: 'plat-1', name: 'Fonte A', color: '#0C7A52' }],
  fixedExpenses: [{ id: 'f1', name: 'Internet', amount: 189.9, dueDay: 6 }],
  debts: [{ id: 'd1', tipo: 'financiamento', titulo: 'Financiamento Teste', credor: 'Banco Teste',
    valorOriginal: 60000, valorParcela: 1450, parcelasTotal: 42, amortizadoInicial: 0,
    dataInicio: '2025-03-10', periodicidade: 'mensal', status: 'ativa' }],
  pendencias: [{ id: 'p1', titulo: 'Trocar a torneira', valor: 150, status: 'aberta' }],
  expenses: [g('e1', '2026-08-05', 900, 'Alimentação'), g('e2', '2026-08-12', 600, 'Transporte'),
             g('j2', '2026-07-06', 700, 'Alimentação')],
  reservaHistory: [{ date: '2026-08-15', type: 'dep', amount: 300 }],
  emergency: { current: 3200, target: 10000 },
  goals: [{ id: 'g1', name: 'Viagem', target: 8000, saved: 3100 }],
};

/** Inventário do que a Home tinha antes da reorganização. */
const BLOCOS = ['#home-fixos-alert', '#home-dividas-venc', '#home-pend-section', '#home-insight',
                '#home-chart', '#home-resv-section', '#home-goal-section', '#inicio-tx-list'];

const abrir = async page => {
  await abrirAppEmDemo(page, { agora: AGORA });
  await semearDados(page, CENARIO, 'inicio');
};

test('NADA SE PERDEU: todo bloco da Home antiga continua no documento', async ({ page }) => {
  await abrir(page);
  for (const sel of BLOCOS) {
    await expect(page.locator(sel), `bloco ${sel} sumiu`).toHaveCount(1);
  }
});

test('o que precisa de você fica junto e no topo da folha', async ({ page }) => {
  await abrir(page);
  for (const sel of ['#home-fixos-alert', '#home-dividas-venc', '#home-pend-section']) {
    const dentro = await page.locator(sel).evaluate(el => !!el.closest('.hc-atencao'));
    expect(dentro, `${sel} está fora do grupo de atenção`).toBe(true);
  }
  // O grupo vem antes do baralho e dos Recentes.
  const ordem = await page.evaluate(() => {
    const y = s => document.querySelector(s).getBoundingClientRect().top + window.scrollY;
    return { atencao: y('.hc-atencao'), deck: y('.hc-deck'), recentes: y('#inicio-tx-list') };
  });
  expect(ordem.atencao).toBeLessThan(ordem.deck);
  expect(ordem.deck).toBeLessThan(ordem.recentes);
});

test('o baralho tem os três cartões e todos são alcançáveis de lado', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await abrir(page);
  const deck = page.locator('.hc-deck');
  await expect(deck.locator('> .hc-section')).toHaveCount(3);

  // Cada cartão do baralho é alcançável rolando na horizontal — e nenhum deles
  // depende de estar visível no carregamento para existir.
  for (const sel of ['#home-chart', '#home-resv-section', '#home-goal-section']) {
    const noDeck = await page.locator(sel).evaluate(el => !!el.closest('.hc-deck'));
    expect(noDeck, `${sel} não está no baralho`).toBe(true);
  }

  const rolagem = await deck.evaluate(el => ({ pode: el.scrollWidth > el.clientWidth + 1, snap: getComputedStyle(el).scrollSnapType }));
  expect(rolagem.pode, 'o baralho não rola: os cartões não cabem lado a lado como deveriam').toBe(true);
  expect(rolagem.snap).toContain('x');
});

test('o próximo cartão aparece cortado na borda — é o que diz que há mais', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await abrir(page);
  const r = await page.locator('.hc-deck').evaluate(el => {
    const largura = el.clientWidth;
    const primeiro = el.querySelector('.hc-section').getBoundingClientRect().width;
    return { largura, primeiro };
  });
  // Um cartão de largura total esconderia o seguinte por completo.
  expect(r.primeiro).toBeLessThan(r.largura - 20);
});

test('a Home encolheu: as três seções do baralho dividem uma altura, não três', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await abrir(page);
  await page.waitForTimeout(150);
  const alturas = await page.evaluate(() => ({
    deck: document.querySelector('.hc-deck').getBoundingClientRect().height,
    cartoes: [...document.querySelectorAll('.hc-deck > .hc-section')]
      .reduce((s, el) => s + el.getBoundingClientRect().height, 0),
  }));
  // Empilhados somariam ~3x; lado a lado, o baralho tem a altura de UM.
  expect(alturas.deck).toBeLessThan(alturas.cartoes * 0.55);
});

test('a Home não solta erro de console com a arrumação nova', async ({ page }) => {
  const erros = await abrirAppEmDemo(page, { agora: AGORA });
  await semearDados(page, CENARIO, 'inicio');
  await page.evaluate(() => { const d = document.querySelector('.hc-deck'); if (d) d.scrollLeft = d.clientWidth; });
  await page.waitForTimeout(200);
  expect(erros).toEqual([]);
});

test('a arrumação é só apresentação: não encosta em D nem chama save()', async ({ page }) => {
  await abrir(page);
  const antes = await lerEstado(page, 'JSON.stringify(D)');
  await page.evaluate(() => {
    window.__salvou = 0;
    const s = window.save; window.save = () => { window.__salvou++; return s && s(); };
    const d = document.querySelector('.hc-deck'); if (d) { d.scrollLeft = d.clientWidth; d.scrollLeft = 0; }
  });
  expect(await lerEstado(page, 'JSON.stringify(D)')).toBe(antes);
  expect(await lerEstado(page, 'window.__salvou')).toBe(0);
});
