// Recentes e Pesquisa falam a mesma linguagem financeira do resto do app.
//
// Antes, toda saída era "Gasto" nas duas listas — mesmo quando o Mês já dizia
// "Gastos do dia a dia: R$ 0" e a linha logo abaixo era uma parcela de dívida.
// A receita já distinguia "Venda de patrimônio"; a despesa não distinguia nada.
//
// Isto é APRESENTAÇÃO: nenhum valor, data, meta, plataforma ou agregado muda.
// Os testes provam os seis rótulos nas duas superfícies e, no mesmo cenário,
// que os sete números do resumo continuam idênticos.
import { test, expect } from '@playwright/test';
import { abrirAppEmDemo, semearDados, lerEstado, esperarOverlay, esperarPosicaoEstavel } from './_helpers.js';

const PASTA = process.env.SHOT_DIR || 'test-results/rotulos-natureza';

const VEICULO = {
  id: 'veh-teste', name: 'Veículo Teste', brand: 'Marca Teste', model: 'Modelo Teste',
  year: '2020', color: 'Prata', plate: '', km: 1000, photo: null, notes: '',
  status: 'em_uso', history: [], linkedExpenses: [], linkedPendencias: [],
};
const PAT_VEICULO = { id: 'pat-veh-teste', _idOriginal: 'veh-teste', nome: 'Veículo Teste', tipo: 'veiculo', status: 'ativo', valorEstimado: 40000, historico: [] };
const BEM = { id: 'pat-teste', nome: 'Bem Teste', tipo: 'outro', status: 'ativo', valorEstimado: 10000, historico: [] };

// Um lançamento de cada natureza, todos no mês corrente do relógio dos testes.
const CENARIO = {
  incomeItems: [], dailyIncome: {}, debtPayments: [], fixedPayments: [],
  debts: [], fixedExpenses: [], pendencias: [],
  vehicles: [VEICULO], patrimonios: [PAT_VEICULO, BEM],
  expenses: [
    { id: 'e-manual', date: '2026-06-14', amount: 45, category: 'Alimentação', description: 'Mercado Teste' },
    { id: 'e-divida', date: '2026-06-15', amount: 200, category: 'Dívidas', description: 'Parcela Do Carro Teste',
      meta: { source: 'debt', debtId: 'divida-teste', parcelNo: 1 } },
    { id: 'e-fixo', date: '2026-06-10', amount: 99.9, category: 'Contas', description: 'Internet Teste',
      meta: { source: 'fixed-payment', fixedId: 'fixo-net', cycle: '2026-06' } },
    { id: 'e-aquis', date: '2026-06-13', amount: 8000, category: 'Outros', description: 'Compra Bem Teste',
      patrimonioId: 'pat-teste', meta: { nature: 'asset-acquisition' } },
  ],
};

const RECEITAS = [
  { id: 'i-oper', date: '2026-06-14', amount: 250, status: 'paid', platformId: null, note: 'Corrida Teste' },
  { id: 'i-venda', date: '2026-06-12', amount: 40000, status: 'paid', platformId: null, note: 'Venda De Veiculo Teste',
    meta: { source: 'asset-sale', saleId: 'sale-1', vehicleId: 'veh-teste' } },
];

const RESUMO_FINANCEIRO = `(() => {
  const r = _monthMovementSummary(0);
  return { totalCashIn: r.totalCashIn, totalCashOut: r.totalCashOut, consumo: r.consumo,
           debtPayments: r.debtPayments, assetAcquisition: r.assetAcquisition,
           operationalIncome: r.operationalIncome, extraordinaryIncome: r.extraordinaryIncome };
})()`;

/** Semeia o cenário completo e amarra a receita operacional a uma plataforma real. */
async function semearTudo(page) {
  await semearDados(page, { ...CENARIO, incomeItems: RECEITAS }, 'inicio');
  await page.evaluate(() => {
    const D = window.eval('D');
    D.incomeItems.find(i => i.id === 'i-oper').platformId = D.platforms[0].id;
  });
  await page.evaluate(() => window.switchTab('inicio'));
}

/** Subtítulo da linha de Recentes que contém o texto dado. */
const subRecentes = (page, texto) =>
  page.locator('#inicio-tx-list .tx-item', { hasText: texto }).first().locator('.tx-sub');

/** Meta da linha de Pesquisa que contém o texto dado. */
const metaPesquisa = (page, texto) =>
  page.locator('#srch-results .srch-r', { hasText: texto }).first().locator('.srch-r-meta');

async function abrirPesquisa(page) {
  await page.evaluate(() => window.switchTab('pesquisa'));
  await page.locator('#srch-results .srch-r').first().waitFor();
}

// ══ OS SEIS RÓTULOS — RECENTES ═══════════════════════════════════════════

test('Recentes: cada natureza diz o que é', async ({ page }) => {
  await abrirAppEmDemo(page);
  await semearTudo(page);

  await expect(subRecentes(page, 'Mercado Teste')).toContainText('Gasto ·');
  await expect(subRecentes(page, 'Parcela Do Carro Teste')).toContainText('Pagamento de dívida');
  await expect(subRecentes(page, 'Internet Teste')).toContainText('Gasto fixo');
  await expect(subRecentes(page, 'Compra Bem Teste')).toContainText('Aquisição de patrimônio');
  await expect(subRecentes(page, 'Corrida Teste')).toContainText('Receita');
  await expect(subRecentes(page, 'Venda De Veiculo Teste')).toContainText('Venda de patrimônio');
});

test('Recentes: o título do lançamento é preservado', async ({ page }) => {
  await abrirAppEmDemo(page);
  await semearTudo(page);
  const linha = page.locator('#inicio-tx-list .tx-item', { hasText: 'Parcela Do Carro Teste' }).first();
  await expect(linha.locator('.tx-label')).toHaveText('Parcela Do Carro Teste');
  await expect(linha.locator('.tx-amt')).toContainText('200,00');
});

test('Recentes: nenhuma saída estrutural sobrou como "Gasto" solto', async ({ page }) => {
  await abrirAppEmDemo(page);
  await semearTudo(page);
  for (const titulo of ['Parcela Do Carro Teste', 'Internet Teste', 'Compra Bem Teste']) {
    const txt = await subRecentes(page, titulo).textContent();
    expect(txt, `${titulo} continua genérico`).not.toMatch(/·\s*Gasto\s*·/);
  }
});

// ══ OS SEIS RÓTULOS — PESQUISA ═══════════════════════════════════════════

test('Pesquisa: cada natureza diz o que é', async ({ page }) => {
  await abrirAppEmDemo(page);
  await semearTudo(page);
  await abrirPesquisa(page);

  await expect(metaPesquisa(page, 'Mercado Teste')).toContainText('Gasto');
  await expect(metaPesquisa(page, 'Parcela Do Carro Teste')).toContainText('Pagamento de dívida');
  await expect(metaPesquisa(page, 'Internet Teste')).toContainText('Gasto fixo');
  await expect(metaPesquisa(page, 'Compra Bem Teste')).toContainText('Aquisição de patrimônio');
  await expect(metaPesquisa(page, 'Corrida Teste')).toContainText('Receita');
  await expect(metaPesquisa(page, 'Venda De Veiculo Teste')).toContainText('Venda de patrimônio');
});

test('Pesquisa: as duas superfícies concordam no rótulo', async ({ page }) => {
  await abrirAppEmDemo(page);
  await semearTudo(page);

  const casos = [
    ['Mercado Teste', 'Gasto'],
    ['Parcela Do Carro Teste', 'Pagamento de dívida'],
    ['Internet Teste', 'Gasto fixo'],
    ['Compra Bem Teste', 'Aquisição de patrimônio'],
    ['Corrida Teste', 'Receita'],
    ['Venda De Veiculo Teste', 'Venda de patrimônio'],
  ];
  const naRecentes = {};
  for (const [titulo] of casos) naRecentes[titulo] = await subRecentes(page, titulo).textContent();
  await abrirPesquisa(page);
  for (const [titulo, rotulo] of casos) {
    const naPesquisa = await metaPesquisa(page, titulo).textContent();
    expect(naRecentes[titulo], `Recentes: ${titulo}`).toContain(rotulo);
    expect(naPesquisa, `Pesquisa: ${titulo}`).toContain(rotulo);
  }
});

test('Pesquisa: filtro e ordenação seguem intocados', async ({ page }) => {
  await abrirAppEmDemo(page);
  await semearTudo(page);
  await abrirPesquisa(page);

  const total = await page.locator('#srch-results .srch-r').count();
  await page.locator('#srch-type-exp').click();
  const soDespesas = await page.locator('#srch-results .srch-r').count();
  expect(soDespesas).toBe(4);
  await page.locator('#srch-type-inc').click();
  expect(await page.locator('#srch-results .srch-r').count()).toBe(2);
  await page.locator('#srch-type-all').click();
  expect(await page.locator('#srch-results .srch-r').count()).toBe(total);
});

// ══ REGRESSÃO FINANCEIRA — NENHUM NÚMERO MUDA ════════════════════════════

test('os sete números do resumo não mudam ao renderizar as duas superfícies', async ({ page }) => {
  await abrirAppEmDemo(page);
  await semearTudo(page);

  const antes = await lerEstado(page, RESUMO_FINANCEIRO);
  // Renderiza Recentes e Pesquisa (é onde o rótulo é calculado).
  await abrirPesquisa(page);
  await page.evaluate(() => window.switchTab('inicio'));
  const depois = await lerEstado(page, RESUMO_FINANCEIRO);
  console.log('RESUMO=' + JSON.stringify(depois));

  expect(depois).toEqual(antes);
  // E os valores são exatamente os do cenário montado.
  expect(depois).toEqual({
    totalCashIn: 40250,
    totalCashOut: 8344.9,      // 45 + 200 + 99,90 + 8000
    consumo: 144.9,            // 45 + 99,90 (o fixo continua consumo)
    debtPayments: 200,
    assetAcquisition: 8000,
    operationalIncome: 250,
    extraordinaryIncome: 40000,
  });
});

test('nenhum dado do lançamento é tocado pela renderização', async ({ page }) => {
  await abrirAppEmDemo(page);
  await semearTudo(page);
  const antes = await lerEstado(page, 'JSON.stringify({ e: D.expenses, i: D.incomeItems })');
  await abrirPesquisa(page);
  await page.evaluate(() => window.switchTab('inicio'));
  const depois = await lerEstado(page, 'JSON.stringify({ e: D.expenses, i: D.incomeItems })');
  expect(depois).toBe(antes);
});

// ══ O C1 CONTINUA VALENDO ════════════════════════════════════════════════

test('tocar na parcela em Recentes ainda abre o painel protegido', async ({ page }) => {
  await abrirAppEmDemo(page);
  await semearTudo(page);
  await page.locator('#inicio-tx-list .tx-item', { hasText: 'Parcela Do Carro Teste' }).first().click();
  await esperarOverlay(page, 'modal-quick-add', true);
  await expect(page.locator('#qa-protegido')).toBeVisible();
  await expect(page.locator('#qa-prot-tit')).toHaveText('Pagamento de dívida');
  await expect(page.locator('#qa-save-btn')).toBeHidden();
});

test('tocar na venda em Recentes ainda abre o painel protegido', async ({ page }) => {
  await abrirAppEmDemo(page);
  await semearTudo(page);
  await page.locator('#inicio-tx-list .tx-item', { hasText: 'Venda De Veiculo Teste' }).first().click();
  await esperarOverlay(page, 'modal-quick-add', true);
  await expect(page.locator('#qa-protegido')).toBeVisible();
  await expect(page.locator('#qa-prot-tit')).toHaveText('Venda de patrimônio');
});

test('tocar num gasto manual em Recentes continua abrindo o formulário editável', async ({ page }) => {
  await abrirAppEmDemo(page);
  await semearTudo(page);
  await page.locator('#inicio-tx-list .tx-item', { hasText: 'Mercado Teste' }).first().click();
  await esperarOverlay(page, 'modal-quick-add', true);
  await expect(page.locator('#qa-protegido')).toBeHidden();
  await expect(page.locator('#qa-save-btn')).toBeVisible();
});

// ══ VISUAL ═══════════════════════════════════════════════════════════════

test.describe('visual dos rótulos', () => {
  for (const tema of ['light', 'dark']) {
    for (const largura of [320, 375, 390, 430]) {
      test(`Recentes em ${tema} @ ${largura}px`, async ({ page }) => {
        await page.setViewportSize({ width: largura, height: 1000 });
        await page.emulateMedia({ colorScheme: tema });
        await abrirAppEmDemo(page);
        await semearTudo(page);

        await expect(page.locator('html')).toHaveAttribute('data-theme', tema);
        const lista = page.locator('#inicio-tx-list');
        expect(await lista.evaluate(n => n.scrollWidth > n.clientWidth + 1), 'a lista transbordou').toBe(false);

        // O rótulo não pode competir com o valor: subtítulo menor que o valor.
        const linha = page.locator('#inicio-tx-list .tx-item', { hasText: 'Aquisição de patrimônio' }).first();
        const tam = await linha.evaluate(n => ({
          sub: parseFloat(getComputedStyle(n.querySelector('.tx-sub')).fontSize),
          val: parseFloat(getComputedStyle(n.querySelector('.tx-amt')).fontSize),
          lbl: parseFloat(getComputedStyle(n.querySelector('.tx-label')).fontSize),
        }));
        expect(tam.sub).toBeLessThan(tam.val);
        expect(tam.sub).toBeLessThan(tam.lbl);
        // O rótulo mais longo ("Aquisição de patrimônio") faz o subtítulo quebrar
        // em 320px: a linha vai de 84px para 116px. Cresce, não quebra — o texto
        // continua inteiro, sem transbordo e sem sobrepor o valor. O limite abaixo
        // existe para pegar quebra de verdade, não essa folga.
        const alturas = await page.locator('#inicio-tx-list .tx-item').evaluateAll(ns => ns.map(n => n.getBoundingClientRect().height));
        alturas.forEach(h => expect(h).toBeLessThan(130));
        // O valor nunca é empurrado para fora nem sobreposto pelo subtítulo.
        const colisao = await page.locator('#inicio-tx-list .tx-item').evaluateAll(ns => ns.some(n => {
          const sub = n.querySelector('.tx-sub').getBoundingClientRect();
          const val = n.querySelector('.tx-amt').getBoundingClientRect();
          return sub.right > val.left + 1;
        }));
        expect(colisao, 'o subtítulo invadiu o valor').toBe(false);

        await esperarPosicaoEstavel(page, '#inicio-tx-list');
        await lista.screenshot({ path: `${PASTA}/recentes-${tema}-${largura}.png` });
      });
    }
  }

  for (const largura of [320, 430]) {
    test(`Pesquisa em light @ ${largura}px`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 1000 });
      await abrirAppEmDemo(page);
      await semearTudo(page);
      await abrirPesquisa(page);
      const lista = page.locator('#srch-results');
      expect(await lista.evaluate(n => n.scrollWidth > n.clientWidth + 1)).toBe(false);
      await esperarPosicaoEstavel(page, '#srch-results');
      await lista.screenshot({ path: `${PASTA}/pesquisa-light-${largura}.png` });
    });
  }

  test('Pesquisa em dark @ 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 1000 });
    await page.emulateMedia({ colorScheme: 'dark' });
    await abrirAppEmDemo(page);
    await semearTudo(page);
    await abrirPesquisa(page);
    await esperarPosicaoEstavel(page, '#srch-results');
    await page.locator('#srch-results').screenshot({ path: `${PASTA}/pesquisa-dark-390.png` });
  });
});
