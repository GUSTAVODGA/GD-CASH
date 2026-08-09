// Home e Mês — as duas telas que resumem dinheiro.
//
// O valor destes testes é serem uma ponte: eles comparam o que a TELA mostra
// com o que o MOTOR calcula. Se um dia a UI passar a somar por conta própria,
// a divergência aparece aqui, e não no extrato de alguém.
import { test, expect } from '@playwright/test';
import { abrirAppEmDemo, irParaAba, semearDados } from './_helpers.js';

// Cenário fechado: dois dias de receita, três saídas de naturezas diferentes.
const CENARIO = {
  incomeItems: [], dailyIncome: { '2026-06-11': { 'plat-teste': 500 } },
  platforms: [{ id: 'plat-teste', name: 'Plataforma Teste' }],
  expenses: [
    { id: 'e1', date: '2026-06-11', amount: 120, category: 'Alimentação' },
    { id: 'e2', date: '2026-06-12', amount: 80, category: 'Transporte' },
    { id: 'e3', date: '2026-06-12', amount: 300, category: 'Outros', meta: { source: 'debt' } },
  ],
};

test('a Home renderiza sem depender de dados reais', async ({ page }) => {
  await abrirAppEmDemo(page);
  await expect(page.locator('#page-inicio')).toHaveClass(/active/);
  await expect(page.locator('#inicio-tx-list')).not.toBeEmpty();
});

test('o hero do Mês mostra exatamente o que o motor calcula', async ({ page }) => {
  await abrirAppEmDemo(page);
  await semearDados(page, CENARIO, 'mes');

  const esperado = await page.evaluate(() => {
    const a = window.monthAggregate(0);
    return { inc: window.R(a.receitas), exp: window.R(a.gastos), liq: window.R(a.liquido) };
  });

  await expect(page.locator('#mes-inc')).toHaveText(esperado.inc);
  await expect(page.locator('#mes-exp')).toHaveText(esperado.exp);
  await expect(page.locator('#mes-liq')).toHaveText(esperado.liq);
});

test('os totais do mês batem com o cenário semeado', async ({ page }) => {
  await abrirAppEmDemo(page);
  await semearDados(page, CENARIO, 'mes');

  const agregado = await page.evaluate(() => window.monthAggregate(0));
  expect(agregado.receitas).toBe(500);
  expect(agregado.gastos).toBe(500);   // 120 + 80 + 300
  expect(agregado.liquido).toBe(0);

  // Mesmo caixa, decomposição diferente: só 200 é gasto do dia a dia.
  const resumo = await page.evaluate(() => window._monthMovementSummary(0));
  expect(resumo.totalCashOut).toBe(agregado.gastos);
  expect(resumo.consumo).toBe(200);
  expect(resumo.debtPayments).toBe(300);
});

test('navegar entre meses muda o rótulo e o recorte', async ({ page }) => {
  await abrirAppEmDemo(page);
  await semearDados(page, CENARIO, 'mes');

  await expect(page.locator('#month-lbl')).toHaveText(/jun.*2026/i);

  await page.evaluate(() => window.changeMonth(-1));
  await expect(page.locator('#month-lbl')).toHaveText(/mai.*2026/i);

  // Maio não tem lançamento no cenário: o agregado do mês exibido é zero.
  const maio = await page.evaluate(() => window.monthAggregate(-1));
  expect(maio.receitas).toBe(0);
  expect(maio.gastos).toBe(0);
});

test('a semana renderiza sobre a data congelada pelo teste', async ({ page }) => {
  await abrirAppEmDemo(page);
  await irParaAba(page, 'semana');

  const semana = await page.evaluate(() => window.weekDates(0));
  // 15/06/2026 é uma segunda-feira: a semana começa nela.
  expect(semana[0]).toBe('2026-06-15');
  expect(semana[6]).toBe('2026-06-21');
});
