// Smoke: o app sobe, entra em modo demo e não grita no console.
// É o teste mais barato e o que mais pega regressão grosseira — um erro de
// sintaxe ou uma função removida derruba este spec antes de qualquer outro.
import { test, expect } from '@playwright/test';
import { abrirAppEmDemo, irParaAba } from './_helpers.js';

test('carrega, entra em demo e chega na Home sem erro de console', async ({ page }) => {
  const erros = await abrirAppEmDemo(page);
  await expect(page.locator('#page-inicio')).toHaveClass(/active/);
  expect(erros, `erros de console: ${erros.join(' | ')}`).toEqual([]);
});

test('o relógio do app obedece à data fixada pelo teste', async ({ page }) => {
  await abrirAppEmDemo(page);
  const hoje = await page.evaluate(() => window.todayStr());
  expect(hoje).toBe('2026-06-15');
});

test('todas as abas principais abrem sem erro de console', async ({ page }) => {
  const erros = await abrirAppEmDemo(page);
  for (const aba of ['semana', 'mes', 'reserva', 'metas', 'dividas', 'patrimonio', 'inicio']) {
    await irParaAba(page, aba);
    await expect(page.locator(`#page-${aba}`)).toHaveClass(/active/);
  }
  expect(erros, `erros de console: ${erros.join(' | ')}`).toEqual([]);
});

test('o tour não sequestra a sessão de teste', async ({ page }) => {
  // closeTour() chama exitDemo(); se o tour aparecesse, o modo demo cairia e a
  // tela de login voltaria. Este teste trava a neutralização do helper.
  await abrirAppEmDemo(page);
  await page.clock.runFor(5000);
  await expect(page.locator('#tour-overlay')).toBeHidden();
  await expect(page.locator('#login-screen')).toBeHidden();
  await expect(page.locator('#page-inicio')).toHaveClass(/active/);
});

test('nenhuma requisição externa escapa durante o boot', async ({ page }) => {
  // O index.html referencia dois hosts externos: o SDK do Firebase e as fontes
  // do Google. Ambos são servidos por stub local. Qualquer host além desses
  // significa que o teste deixou de ser hermético.
  const HOSTS_INTERCEPTADOS = ['www.gstatic.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

  const externas = [];
  page.on('request', req => {
    const url = new URL(req.url());
    if (url.hostname !== 'localhost') externas.push(url.hostname);
  });

  await abrirAppEmDemo(page);

  const inesperadas = [...new Set(externas)].filter(h => !HOSTS_INTERCEPTADOS.includes(h));
  expect(inesperadas, `hosts externos não interceptados: ${inesperadas.join(' | ')}`).toEqual([]);
});
