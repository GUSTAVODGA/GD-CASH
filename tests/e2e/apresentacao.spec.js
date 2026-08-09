// Regressão dos dois ajustes de apresentação da Fase C — P3.
// Ambos correspondem a bugs que chegaram a produção, e ambos só se provam num
// browser real: um é de layout (texto truncado), o outro é de rótulo.
import { test, expect } from '@playwright/test';
import { abrirAppEmDemo, irParaAba, semearDados } from './_helpers.js';

test('o miolo do donut mostra "Gastos do dia a dia" sem truncar', async ({ page }) => {
  await abrirAppEmDemo(page);
  await irParaAba(page, 'mes');

  const miolo = page.locator('#cat-donut-top');
  await expect(miolo).toHaveText('Gastos do dia a dia');

  // A classe de quebra é o que impede o "GASTOS DO DIA A D…" do bug original.
  await expect(miolo).toHaveClass(/bdc-top--wrap/);

  const estilo = await miolo.evaluate(el => {
    const s = getComputedStyle(el);
    return { whiteSpace: s.whiteSpace, textOverflow: s.textOverflow };
  });
  expect(estilo.whiteSpace).toBe('normal');
  expect(estilo.textOverflow).toBe('clip');

  // Prova de que o texto cabe: sem overflow horizontal no elemento.
  const coube = await miolo.evaluate(el => el.scrollWidth <= el.clientWidth + 1);
  expect(coube, 'o rótulo do donut voltou a truncar').toBe(true);
});

test('ao selecionar uma categoria, o miolo volta ao rótulo curto', async ({ page }) => {
  await abrirAppEmDemo(page);
  await irParaAba(page, 'mes');

  // Seleciona a primeira categoria pelo próprio estado do app.
  await page.evaluate(() => window._selectCat(0));

  const miolo = page.locator('#cat-donut-top');
  await expect(miolo).not.toHaveClass(/bdc-top--wrap/);
  await expect(miolo).not.toHaveText('Gastos do dia a dia');
});

test('venda de patrimônio aparece como "Venda de patrimônio" em Recentes', async ({ page }) => {
  await abrirAppEmDemo(page);

  // Recentes mostra só os 8 lançamentos mais novos; zeramos o resto para que a
  // asserção seja sobre a linha que interessa, e não sobre a ordenação.
  await semearDados(page, {
    expenses: [], dailyIncome: {},
    incomeItems: [
      {
        id: 'venda-teste', date: '2026-06-14', platformId: null, amount: 12000,
        status: 'paid', note: 'Venda de Bem Teste', meta: { source: 'asset-sale' },
      },
    ],
  }, 'inicio');

  const linha = page.locator('#inicio-tx-list .tx-item', { hasText: 'Venda de Bem Teste' });
  await expect(linha).toBeVisible();
  await expect(linha.locator('.tx-sub')).toContainText('Venda de patrimônio');
  await expect(linha.locator('.tx-sub')).not.toContainText('Receita');
});

test('receita operacional continua rotulada como "Receita"', async ({ page }) => {
  await abrirAppEmDemo(page);

  await semearDados(page, {
    expenses: [], dailyIncome: {},
    platforms: [{ id: 'plat-teste', name: 'Plataforma Teste' }],
    incomeItems: [
      {
        id: 'op-teste', date: '2026-06-14', platformId: 'plat-teste', amount: 250,
        status: 'paid', note: 'Corrida Teste',
      },
    ],
  }, 'inicio');

  const linha = page.locator('#inicio-tx-list .tx-item', { hasText: 'Corrida Teste' });
  await expect(linha).toBeVisible();
  await expect(linha.locator('.tx-sub')).toContainText('Receita');
  await expect(linha.locator('.tx-sub')).not.toContainText('Venda de patrimônio');
});
