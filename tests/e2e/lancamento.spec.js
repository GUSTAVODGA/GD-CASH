// Lançamento e reclassificação pelo formulário real.
//
// É o único caminho pelo qual a semântica da Fase B chega ao dado: o "Tipo de
// saída" grava o override de natureza. Testar isso só no motor deixaria de fora
// a parte que o usuário toca — e foi justamente na UI que o rótulo do vínculo
// precisou de um corretivo depois da Fase B.
import { test, expect } from '@playwright/test';
import { abrirAppEmDemo, semearDados, lerEstado, esperarOverlay } from './_helpers.js';

/** Abre o formulário de lançamento pelo FAB e escolhe o tipo Gasto. */
async function abrirFormularioDeGasto(page) {
  await page.locator('#global-fab').click();
  await esperarOverlay(page, 'modal-quick-add', true);
  await page.locator('#qa-btn-gas').click();
  await expect(page.locator('#qa-cat-row')).toBeVisible();
}

test('lançar um gasto cria despesa de consumo', async ({ page }) => {
  await abrirAppEmDemo(page);
  await semearDados(page, { expenses: [] }, 'inicio');

  await abrirFormularioDeGasto(page);
  await page.locator('#qa-amt-input').fill('75.50');
  await page.locator('#qa-desc').fill('Compra Teste');
  await page.locator('#qa-save-btn').click();
  await esperarOverlay(page, 'modal-quick-add', false);

  const criada = await lerEstado(page, "D.expenses.find(e => e.description === 'Compra Teste')");
  expect(criada).toBeTruthy();
  expect(criada.amount).toBe(75.5);

  const natureza = await page.evaluate(() =>
    window._movementNature(window.eval("D.expenses.find(e => e.description === 'Compra Teste')"))
  );
  expect(natureza).toBe('consumo');
});

test('gasto lançado entra no consumo do mês', async ({ page }) => {
  await abrirAppEmDemo(page);
  await semearDados(page, { expenses: [], incomeItems: [], dailyIncome: {} }, 'inicio');

  const antes = await page.evaluate(() => window._monthMovementSummary(0).consumo);

  await abrirFormularioDeGasto(page);
  await page.locator('#qa-amt-input').fill('40');
  await page.locator('#qa-desc').fill('Outra Compra Teste');
  await page.locator('#qa-save-btn').click();
  await esperarOverlay(page, 'modal-quick-add', false);

  const depois = await page.evaluate(() => window._monthMovementSummary(0).consumo);
  expect(Math.round((depois - antes) * 100) / 100).toBe(40);
});

test('reclassificar para aquisição tira o gasto do consumo sem tirar do caixa', async ({ page }) => {
  await abrirAppEmDemo(page);

  // Um bem sintético para receber a aquisição (a UI exige escolher o patrimônio).
  await semearDados(page, {
    expenses: [], incomeItems: [], dailyIncome: {},
    patrimonios: [{
      id: 'pat-teste', nome: 'Bem Teste', tipo: 'outro', status: 'ativo',
      valorAtual: 10000, dataAquisicao: '2026-06-01', eventos: [],
    }],
  }, 'inicio');

  const antes = await page.evaluate(() => {
    const r = window._monthMovementSummary(0);
    return { consumo: r.consumo, aquisicao: r.assetAcquisition, saida: r.totalCashOut };
  });

  await abrirFormularioDeGasto(page);
  await page.locator('#qa-amt-input').fill('8000');
  await page.locator('#qa-desc').fill('Aquisicao Teste');

  // "Mais opções" → Tipo de saída → Compra / entrada de patrimônio
  await page.locator('#qa-more-toggle').click();
  await expect(page.locator('#qa-more')).toBeVisible();
  await page.locator('#qa-saida-aquisicao').check();
  await page.locator('#qa-bem-sel').selectOption('pat:pat-teste');
  await page.locator('#qa-save-btn').click();
  await esperarOverlay(page, 'modal-quick-add', false);

  const natureza = await page.evaluate(() =>
    window._movementNature(window.eval("D.expenses.find(e => e.description === 'Aquisicao Teste')"))
  );
  expect(natureza).toBe('asset-acquisition');

  const depois = await page.evaluate(() => {
    const r = window._monthMovementSummary(0);
    return { consumo: r.consumo, aquisicao: r.assetAcquisition, saida: r.totalCashOut };
  });

  // O dinheiro saiu do caixa…
  expect(Math.round((depois.saida - antes.saida) * 100) / 100).toBe(8000);
  // …como aquisição, não como gasto do dia a dia.
  expect(Math.round((depois.aquisicao - antes.aquisicao) * 100) / 100).toBe(8000);
  expect(depois.consumo).toBe(antes.consumo);
});

test('editar um lançamento existente preserva o id', async ({ page }) => {
  await abrirAppEmDemo(page);
  await semearDados(page, {
    incomeItems: [], dailyIncome: {},
    expenses: [{ id: 'exp-fixo', date: '2026-06-15', amount: 30, category: 'Alimentação', description: 'Editar Teste' }],
  }, 'inicio');

  await page.locator('#inicio-tx-list .tx-item', { hasText: 'Editar Teste' }).click();
  await esperarOverlay(page, 'modal-quick-add', true);
  await page.locator('#qa-amt-input').fill('45');
  await page.locator('#qa-save-btn').click();
  await esperarOverlay(page, 'modal-quick-add', false);

  const depois = await lerEstado(page, "D.expenses.filter(e => e.description === 'Editar Teste')");
  expect(depois.length, 'a edição duplicou o lançamento').toBe(1);
  expect(depois[0].id).toBe('exp-fixo');
  expect(depois[0].amount).toBe(45);
});
