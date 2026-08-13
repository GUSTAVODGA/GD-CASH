// Edição de lançamentos de origem estrutural pelo formulário genérico.
//
// Defeito corrigido aqui (P1): o pagamento de dívida guarda o valor DUAS vezes
// — na despesa e no marcador `debtPayments`, que é o lido por `_debtPagoCents`.
// `qaConfirm` sincronizava `fixedPayments` mas não `debtPayments`, então editar
// a parcela por Recentes/Pesquisa mudava o caixa e NÃO mudava o saldo da
// dívida, em silêncio e para sempre. A venda de patrimônio tinha o irmão desse
// problema: `platformId: null` é o que a mantém fora da receita operacional, e
// o editor genérico atribuía uma plataforma ao salvar.
//
// Política: origem estrutural é apresentada, não editada — quem altera é o
// fluxo canônico. Lançamento manual segue editável como sempre.
import { test, expect } from '@playwright/test';
import { abrirAppEmDemo, semearDados, lerEstado, esperarOverlay, esperarPosicaoEstavel } from './_helpers.js';

const PASTA = 'test-results/edicao-estrutural';

const DIVIDA = {
  id: 'divida-teste', titulo: 'Financiamento Teste', tipo: 'financiamento',
  credor: 'Banco Teste', valorOriginal: 6500, valorParcela: 200, parcelasTotal: 30,
  amortizadoInicial: 0, dataInicio: '2026-01-10', periodicidade: 'mensal', status: 'ativa',
};
const FIXO = { id: 'fixo-net', name: 'Internet Teste', amount: 99.9, category: 'Contas', dueDay: 10, since: '2026-01-01' };
const VEICULO = {
  id: 'veh-teste', name: 'Veículo Teste', brand: 'Marca Teste', model: 'Modelo Teste',
  year: '2020', color: 'Prata', plate: '', km: 1000, photo: null, notes: '',
  status: 'em_uso', history: [], linkedExpenses: [], linkedPendencias: [],
};
const PAT_VEICULO = { id: 'pat-veh-teste', _idOriginal: 'veh-teste', nome: 'Veículo Teste', tipo: 'veiculo', status: 'ativo', valorEstimado: 40000, historico: [] };

const LIMPO = {
  incomeItems: [], dailyIncome: {}, expenses: [], debtPayments: [], fixedPayments: [],
  debts: [], fixedExpenses: [], pendencias: [], vehicles: [], patrimonios: [],
};

const painel = page => page.locator('#qa-protegido');
const ESTADO_DIVIDA = `({
  despesas: D.expenses.length,
  valorDespesa: (D.expenses.find(e => e.meta && e.meta.source === 'debt') || {}).amount,
  dataDespesa: (D.expenses.find(e => e.meta && e.meta.source === 'debt') || {}).date,
  pagamentos: D.debtPayments.length,
  valorMarcador: (D.debtPayments[0] || {}).valor,
  dataMarcador: (D.debtPayments[0] || {}).data,
})`;

/** Registra um pagamento de dívida pelo fluxo canônico e volta à Home. */
async function pagarParcela(page) {
  await semearDados(page, { ...LIMPO, debts: [DIVIDA] }, 'inicio');
  await page.locator('#global-fab').click();
  await esperarOverlay(page, 'modal-quick-add', true);
  await page.locator('#qa-compr-slot .qa-compr').click();
  await esperarOverlay(page, 'modal-obrigacoes', true);
  await page.locator('#obr-lista .obr-item').first().click();
  await esperarOverlay(page, 'debt-pay-sheet', true);
  await page.locator('#debt-pay-valor').fill('200');
  await page.locator('#debt-pay-data').fill('15/06/2026');
  await page.locator('#debt-pay-save').click();
  await esperarOverlay(page, 'debt-pay-sheet', false);
}

/** Abre um lançamento pelo mesmo caminho do usuário na Home (Recentes). */
async function abrirPorRecentes(page, texto) {
  await page.locator('#inicio-tx-list .tx-item', { hasText: texto }).first().click();
  await esperarOverlay(page, 'modal-quick-add', true);
}

// ══ O TESTE QUE FALHA NO CÓDIGO ANTERIOR ═════════════════════════════════

test('dívida: o editor genérico não altera o valor da parcela', async ({ page }) => {
  await abrirAppEmDemo(page);
  await pagarParcela(page);

  const antes = await lerEstado(page, ESTADO_DIVIDA);
  expect(antes.valorDespesa).toBe(200);
  expect(antes.valorMarcador).toBe(200);
  expect(await page.evaluate(() => window._debtSaldo(window.getDebt('divida-teste')))).toBe(6300);

  // O usuário toca a parcela em Recentes e tenta corrigir para 250.
  await abrirPorRecentes(page, 'Financiamento Teste');
  await expect(painel(page)).toBeVisible();
  await expect(page.locator('#qa-prot-tit')).toHaveText('Pagamento de dívida');
  await expect(page.locator('#qa-prot-sub')).toHaveText('Valor e data são controlados pela dívida.');
  // Não há campo de valor para alterar, nem Salvar para gravar.
  await expect(page.locator('#qa-amt-row')).toBeHidden();
  await expect(page.locator('#qa-save-btn')).toBeHidden();

  // Mesmo forçando o gravador, nada muda.
  await page.evaluate(() => {
    const el = document.getElementById('qa-amt-input'); if (el) el.value = '250';
    window.qaConfirm();
  });

  const depois = await lerEstado(page, ESTADO_DIVIDA);
  expect(depois.valorDespesa, 'o caixa foi alterado').toBe(200);
  expect(depois.valorMarcador, 'o marcador divergiu da despesa').toBe(200);
  expect(depois.valorDespesa).toBe(depois.valorMarcador);
  expect(depois.despesas).toBe(1);
  expect(depois.pagamentos).toBe(1);
  expect(await page.evaluate(() => window._debtSaldo(window.getDebt('divida-teste')))).toBe(6300);
  const res = await page.evaluate(() => window._monthMovementSummary(0));
  expect(res.debtPayments).toBe(200);
  expect(res.totalCashOut).toBe(200);
});

test('dívida: o editor genérico não altera a data da parcela', async ({ page }) => {
  await abrirAppEmDemo(page);
  await pagarParcela(page);
  const antes = await lerEstado(page, ESTADO_DIVIDA);

  await abrirPorRecentes(page, 'Financiamento Teste');
  await expect(page.locator('#qa-date-row')).toBeHidden();
  await page.evaluate(() => {
    const el = document.getElementById('qa-date'); if (el) el.value = '2026-07-20';
    window.qaConfirm();
  });

  const depois = await lerEstado(page, ESTADO_DIVIDA);
  expect(depois.dataDespesa).toBe(antes.dataDespesa);
  expect(depois.dataMarcador).toBe(antes.dataMarcador);
  expect(depois.dataDespesa).toBe(depois.dataMarcador);
});

test('dívida: excluir pelo editor genérico também não é permitido', async ({ page }) => {
  await abrirAppEmDemo(page);
  await pagarParcela(page);
  await abrirPorRecentes(page, 'Financiamento Teste');

  await expect(page.locator('#qa-del-btn')).toBeHidden();
  await page.evaluate(() => window.qaDelete());
  const r = await lerEstado(page, ESTADO_DIVIDA);
  expect(r.despesas).toBe(1);
  expect(r.pagamentos).toBe(1);
});

test('dívida: o CTA leva ao detalhe da própria dívida', async ({ page }) => {
  await abrirAppEmDemo(page);
  await pagarParcela(page);
  await abrirPorRecentes(page, 'Financiamento Teste');

  await expect(page.locator('#qa-prot-cta')).toHaveText('Abrir dívida');
  await page.locator('#qa-prot-cta').click();
  await esperarOverlay(page, 'modal-quick-add', false);
  await esperarOverlay(page, 'debt-detail-sheet', true);
  await expect(page.locator('#debt-detail-sheet')).toContainText('Financiamento Teste');
  await expect(page.locator('.overlay.open')).toHaveCount(1);
  // Abrir a origem não grava nada.
  const r = await lerEstado(page, ESTADO_DIVIDA);
  expect(r.despesas).toBe(1);
  expect(r.pagamentos).toBe(1);
});

// ══ VENDA DE PATRIMÔNIO ══════════════════════════════════════════════════

const VENDA = {
  id: 'inc-venda', date: '2026-06-12', amount: 40000, status: 'paid', platformId: null,
  note: 'Venda de Veículo Teste',
  meta: { source: 'asset-sale', saleId: 'sale-1', vehicleId: 'veh-teste' },
};

test('venda de patrimônio: não ganha plataforma e continua extraordinária', async ({ page }) => {
  await abrirAppEmDemo(page);
  await semearDados(page, { ...LIMPO, vehicles: [VEICULO], patrimonios: [PAT_VEICULO], incomeItems: [VENDA] }, 'inicio');

  const antes = await page.evaluate(() => window._monthMovementSummary(0));
  expect(antes.extraordinaryIncome).toBe(40000);
  expect(antes.operationalIncome).toBe(0);

  await abrirPorRecentes(page, 'Venda de Veículo Teste');
  await expect(painel(page)).toBeVisible();
  await expect(page.locator('#qa-prot-tit')).toHaveText('Venda de patrimônio');
  await expect(page.locator('#qa-prot-sub')).toHaveText('Esta entrada pertence à venda de um bem.');
  await expect(page.locator('#qa-plat-row')).toBeHidden();

  // Mesmo forçando o gravador com uma plataforma selecionada.
  await page.evaluate(() => {
    const s = document.getElementById('qa-plat-sel');
    if (s && s.options.length) s.value = s.options[0].value;
    const a = document.getElementById('qa-amt-input'); if (a) a.value = '999';
    window.qaConfirm();
  });

  const item = await lerEstado(page, "D.incomeItems.find(i => i.id === 'inc-venda')");
  expect(item.platformId, 'a venda virou receita operacional').toBeNull();
  expect(item.amount).toBe(40000);
  expect(item.date).toBe('2026-06-12');
  expect(item.meta.source).toBe('asset-sale');
  expect(item.meta.saleId).toBe('sale-1');
  expect(item.meta.vehicleId).toBe('veh-teste');

  expect(await page.evaluate(() => window._movementNature(window.eval("D.incomeItems.find(i => i.id === 'inc-venda')")))).toBe('income-extra');
  const depois = await page.evaluate(() => window._monthMovementSummary(0));
  expect(depois.extraordinaryIncome).toBe(40000);
  expect(depois.operationalIncome).toBe(0);
  expect(depois.totalCashIn).toBe(40000);
  expect(await lerEstado(page, 'D.incomeItems.length')).toBe(1);
});

test('venda: cancelar não altera nada e o CTA leva ao patrimônio', async ({ page }) => {
  await abrirAppEmDemo(page);
  await semearDados(page, { ...LIMPO, vehicles: [VEICULO], patrimonios: [PAT_VEICULO], incomeItems: [VENDA] }, 'inicio');

  await abrirPorRecentes(page, 'Venda de Veículo Teste');
  await page.locator('#modal-quick-add .page-back-btn').click();
  await esperarOverlay(page, 'modal-quick-add', false);
  let item = await lerEstado(page, "D.incomeItems.find(i => i.id === 'inc-venda')");
  expect(item.platformId).toBeNull();
  expect(item.amount).toBe(40000);

  await abrirPorRecentes(page, 'Venda de Veículo Teste');
  await expect(page.locator('#qa-prot-cta')).toHaveText('Abrir patrimônio');
  await page.locator('#qa-prot-cta').click();
  await esperarOverlay(page, 'modal-quick-add', false);
  await expect(page.locator('#page-patrimonio')).toHaveClass(/active/);
  item = await lerEstado(page, "D.incomeItems.find(i => i.id === 'inc-venda')");
  expect(item.platformId).toBeNull();
  expect(item.amount).toBe(40000);
});

// ══ O QUE NÃO PODE REGREDIR ══════════════════════════════════════════════

test('baixa de gasto fixo continua editável e sincronizada', async ({ page }) => {
  await abrirAppEmDemo(page);
  await semearDados(page, { ...LIMPO, fixedExpenses: [FIXO] }, 'inicio');
  await page.evaluate(() => window.darBaixaFixed('fixo-net'));
  await esperarOverlay(page, 'modal-baixa', true);
  await page.locator('#baixa-confirm-btn').click();
  await esperarOverlay(page, 'modal-baixa', false);

  await abrirPorRecentes(page, 'Internet Teste');
  // Formulário normal, sem painel de proteção.
  await expect(painel(page)).toBeHidden();
  await expect(page.locator('#qa-amt-row')).toBeVisible();
  await expect(page.locator('#qa-save-btn')).toBeVisible();

  await page.locator('#qa-amt-input').fill('120');
  await page.locator('#qa-date').fill('2026-06-20');
  await page.locator('#qa-save-btn').click();
  await esperarOverlay(page, 'modal-quick-add', false);

  const r = await lerEstado(page, `({
    despesas: D.expenses.length,
    valor: D.expenses[0].amount,
    data: D.expenses[0].date,
    marcadores: D.fixedPayments.length,
    paidDate: D.fixedPayments[0].paidDate,
    cycle: D.fixedPayments[0].cycle,
  })`);
  expect(r).toMatchObject({ despesas: 1, valor: 120, data: '2026-06-20', marcadores: 1, paidDate: '2026-06-20', cycle: '2026-06' });
});

test('gasto manual continua editável', async ({ page }) => {
  await abrirAppEmDemo(page);
  await semearDados(page, {
    ...LIMPO,
    expenses: [{ id: 'exp-man', date: '2026-06-14', amount: 45, category: 'Alimentação', description: 'Mercado Teste' }],
  }, 'inicio');

  await abrirPorRecentes(page, 'Mercado Teste');
  await expect(painel(page)).toBeHidden();
  await page.locator('#qa-amt-input').fill('60');
  await page.locator('#qa-save-btn').click();
  await esperarOverlay(page, 'modal-quick-add', false);

  const e = await lerEstado(page, "D.expenses.find(x => x.id === 'exp-man')");
  expect(e.amount).toBe(60);
  expect(await lerEstado(page, 'D.expenses.length')).toBe(1);
});

test('receita operacional continua editável', async ({ page }) => {
  await abrirAppEmDemo(page);
  await semearDados(page, {
    ...LIMPO,
    incomeItems: [{ id: 'inc-man', date: '2026-06-14', amount: 250, status: 'paid', platformId: null, note: 'Corrida Teste' }],
  }, 'inicio');
  // Usa a primeira plataforma real do app.
  await page.evaluate(() => { window.eval('D').incomeItems[0].platformId = window.eval('D').platforms[0].id; });
  await page.evaluate(() => window.switchTab('inicio'));

  await abrirPorRecentes(page, 'Corrida Teste');
  await expect(painel(page)).toBeHidden();
  await expect(page.locator('#qa-plat-row')).toBeVisible();
  await page.locator('#qa-amt-input').fill('300');
  await page.locator('#qa-save-btn').click();
  await esperarOverlay(page, 'modal-quick-add', false);

  const it = await lerEstado(page, "D.incomeItems.find(x => x.id === 'inc-man')");
  expect(it.amount).toBe(300);
  expect(await lerEstado(page, 'D.incomeItems.length')).toBe(1);
});

test('aquisição manual não regride: continua editável e mantém a natureza', async ({ page }) => {
  await abrirAppEmDemo(page);
  await semearDados(page, {
    ...LIMPO,
    patrimonios: [{ id: 'pat-teste', nome: 'Bem Teste', tipo: 'outro', status: 'ativo', valorEstimado: 10000, historico: [] }],
    expenses: [{ id: 'exp-aq', date: '2026-06-14', amount: 8000, category: 'Outros',
      description: 'Compra Bem Teste', patrimonioId: 'pat-teste', meta: { nature: 'asset-acquisition' } }],
  }, 'inicio');

  await abrirPorRecentes(page, 'Compra Bem Teste');
  await expect(painel(page)).toBeHidden();
  await expect(page.locator('#qa-saida-aquisicao')).toBeChecked();
  await page.locator('#qa-amt-input').fill('8500');
  await page.locator('#qa-save-btn').click();
  await esperarOverlay(page, 'modal-quick-add', false);

  const e = await lerEstado(page, "D.expenses.find(x => x.id === 'exp-aq')");
  expect(e.amount).toBe(8500);
  expect(e.meta.nature).toBe('asset-acquisition');
  expect(e.patrimonioId).toBe('pat-teste');
  const res = await page.evaluate(() => window._monthMovementSummary(0));
  expect(res.assetAcquisition).toBe(8500);
  expect(res.consumo).toBe(0);
});

// ══ MESMO COMPORTAMENTO EM QUALQUER SUPERFÍCIE ═══════════════════════════

test('Pesquisa abre a parcela protegida do mesmo jeito', async ({ page }) => {
  await abrirAppEmDemo(page);
  await pagarParcela(page);

  await page.evaluate(() => window.switchTab('pesquisa'));
  await page.locator('#srch-q').fill('Financiamento');
  await page.locator('#srch-results .srch-r', { hasText: 'Financiamento Teste' }).first().click();
  await esperarOverlay(page, 'modal-quick-add', true);

  await expect(painel(page)).toBeVisible();
  await expect(page.locator('#qa-prot-tit')).toHaveText('Pagamento de dívida');
  await expect(page.locator('#qa-amt-row')).toBeHidden();
  await expect(page.locator('#qa-save-btn')).toBeHidden();
});

test('Semana abre a parcela protegida do mesmo jeito', async ({ page }) => {
  await abrirAppEmDemo(page);
  await pagarParcela(page);

  await page.evaluate(() => window.switchTab('semana'));
  await page.locator('#days-accordion .dacc-tx-edit').first().waitFor();
  await page.locator('#days-accordion .dacc-tx-edit').first().click();
  await esperarOverlay(page, 'modal-quick-add', true);

  await expect(painel(page)).toBeVisible();
  await expect(page.locator('#qa-amt-row')).toBeHidden();
});

test('reabrir um lançamento manual depois do protegido volta ao formulário normal', async ({ page }) => {
  await abrirAppEmDemo(page);
  await pagarParcela(page);
  await page.evaluate(() => {
    window.eval('D').expenses.push({ id: 'exp-man', date: '2026-06-16', amount: 45, category: 'Alimentação', description: 'Mercado Teste' });
    window.switchTab('inicio');
  });

  await abrirPorRecentes(page, 'Financiamento Teste');
  await expect(painel(page)).toBeVisible();
  await page.locator('#modal-quick-add .page-back-btn').click();
  await esperarOverlay(page, 'modal-quick-add', false);

  await abrirPorRecentes(page, 'Mercado Teste');
  await expect(painel(page)).toBeHidden();
  await expect(page.locator('#qa-amt-row')).toBeVisible();
  await expect(page.locator('#qa-date-row')).toBeVisible();
  await expect(page.locator('#qa-save-btn')).toBeVisible();
  await expect(page.locator('#qa-amt-input')).toHaveValue('45');

  // E o "+" comum continua intacto depois disso.
  await page.locator('#modal-quick-add .page-back-btn').click();
  await esperarOverlay(page, 'modal-quick-add', false);
  await page.locator('#global-fab').click();
  await esperarOverlay(page, 'modal-quick-add', true);
  await expect(painel(page)).toBeHidden();
  await expect(page.locator('#qa-type-toggle')).toBeVisible();
  await expect(page.locator('#qa-save-btn')).toBeVisible();
});

// ══ VISUAL ═══════════════════════════════════════════════════════════════

test.describe('visual do lançamento protegido', () => {
  for (const tema of ['light', 'dark']) {
    for (const largura of [320, 375, 390, 430]) {
      test(`parcela protegida em ${tema} @ ${largura}px`, async ({ page }) => {
        await page.setViewportSize({ width: largura, height: 900 });
        await page.emulateMedia({ colorScheme: tema });
        await abrirAppEmDemo(page);
        await pagarParcela(page);
        await abrirPorRecentes(page, 'Financiamento Teste');

        await expect(page.locator('html')).toHaveAttribute('data-theme', tema);
        const folha = page.locator('#modal-quick-add .sheet');
        expect(await folha.evaluate(n => n.scrollWidth > n.clientWidth + 1)).toBe(false);
        await expect(page.locator('#qa-prot-valor')).toHaveText('R$ 200,00');
        await expect(page.locator('#qa-prot-cta')).toBeVisible();
        // Tira o toast do pagamento (resíduo do preparo) da frente da captura.
        await page.evaluate(() => document.querySelectorAll('.av-toast').forEach(t => t.remove()));
        await esperarPosicaoEstavel(page, '#modal-quick-add .sheet');
        await folha.screenshot({ path: `${PASTA}/divida-${tema}-${largura}.png` });
      });
    }
  }

  test('venda protegida em 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await abrirAppEmDemo(page);
    await semearDados(page, { ...LIMPO, vehicles: [VEICULO], patrimonios: [PAT_VEICULO], incomeItems: [VENDA] }, 'inicio');
    await abrirPorRecentes(page, 'Venda de Veículo Teste');
    await esperarPosicaoEstavel(page, '#modal-quick-add .sheet');
    await page.locator('#modal-quick-add .sheet').screenshot({ path: `${PASTA}/venda-light-390.png` });
  });
});
