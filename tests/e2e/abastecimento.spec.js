// Abastecimento estruturado: preço/galão, galões e milhas viram um consumo
// (MPG) calculado, dentro da própria despesa de "Gasolina" — sem lista
// paralela, sem duplicar dinheiro que já é contado uma vez pela despesa.
//
// O QUE ESTES TESTES PROTEGEM:
//
//   OS CAMPOS SÓ APARECEM PARA GASOLINA — outras categorias continuam com o
//   formulário simples de sempre.
//
//   O TOTAL É DERIVADO (preço × galões), do mesmo jeito que o custo do dia é
//   derivado — nunca um número que o usuário tem que multiplicar de cabeça.
//
//   O MPG É CALCULADO NA HORA DE MOSTRAR, nunca gravado — e só aparece quando
//   os dois números que o formam (galões e milhas) existem.
//
//   NADA MUDA PARA QUEM NÃO USA: uma despesa de Gasolina sem os campos extras
//   continua sendo só valor + descrição, como sempre foi.
import { test, expect } from '@playwright/test';
import { abrirAppEmDemo, semearDados, lerEstado, esperarOverlay } from './_helpers.js';

const AGORA = new Date(2026, 7, 20, 15, 0, 0); // 20/08/2026, quinta

const BASE = {
  platforms: [{ id: 'p1', name: 'GrubHub', color: '#0C7A52' }],
  incomeItems: [], dailyIncome: {}, expenses: [], debtPayments: [], fixedPayments: [],
  debts: [], fixedExpenses: [], pendencias: [], vehicles: [], patrimonios: [],
  goals: [], reservaHistory: [], emergency: { current: 0, target: 0 },
  daysOff: [], daysHalfOff: [], reminders: [], confirmacoesAdiadas: {}, weeklyGoal: 0,
  expCats: ['Gasolina', 'Alimentação', 'Moradia'],
};

const abrir = async (page, dados) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const erros = await abrirAppEmDemo(page, { agora: AGORA });
  await semearDados(page, { ...BASE, ...(dados || {}) }, 'semana');
  return erros;
};

const abrirFolhaDoDia = async page => {
  await page.locator('.dsem-faixa .dsem-dia').nth(3).click(); // quinta (hoje)
  await page.locator('#days-accordion').getByText('Editar dia completo').click();
  await esperarOverlay(page, 'modal-day-detail', true);
};

test('CATEGORIA PADRÃO: com Gasolina selecionada, os campos de abastecimento já aparecem', async ({ page }) => {
  await abrir(page);
  await abrirFolhaDoDia(page);
  await expect(page.locator('#exp-cat')).toHaveValue('Gasolina');
  await expect(page.locator('#exp-fuel-fields')).toBeVisible();
});

test('OUTRAS CATEGORIAS: os campos de abastecimento somem', async ({ page }) => {
  await abrir(page);
  await abrirFolhaDoDia(page);
  await page.locator('#exp-cat').selectOption('Alimentação');
  await expect(page.locator('#exp-fuel-fields')).toBeHidden();

  await page.locator('#exp-cat').selectOption('Gasolina');
  await expect(page.locator('#exp-fuel-fields')).toBeVisible();
});

test('O TOTAL É DERIVADO: preço × galões preenche o Valor sozinho', async ({ page }) => {
  await abrir(page);
  await abrirFolhaDoDia(page);
  await page.locator('#exp-fuel-preco').fill('5.50');
  await page.locator('#exp-fuel-galoes').fill('10');
  await expect(page.locator('#exp-val')).toHaveValue('55.00');
});

test('lançar um abastecimento completo grava preço, galões e milhas na despesa', async ({ page }) => {
  await abrir(page);
  await abrirFolhaDoDia(page);
  await page.locator('#exp-desc').fill('Shell');
  await page.locator('#exp-fuel-preco').fill('5.50');
  await page.locator('#exp-fuel-galoes').fill('10');
  await page.locator('#exp-fuel-milhas').fill('350');
  await page.getByRole('button', { name: '+ Adicionar gasto' }).click();

  const exps = await lerEstado(page, 'D.expenses');
  expect(exps.length).toBe(1);
  expect(exps[0].category).toBe('Gasolina');
  expect(exps[0].amount).toBe(55);
  expect(exps[0].meta.abastecimento).toEqual({ precoGalao: 5.5, galoes: 10, milhas: 350 });

  // 350 ÷ 10 = 35.0 MPG, mostrado na lista do dia.
  await expect(page.locator('#exp-list')).toContainText('35.0 MPG');
});

test('sem milhas informadas, não existe MPG para mostrar', async ({ page }) => {
  await abrir(page);
  await abrirFolhaDoDia(page);
  await page.locator('#exp-fuel-preco').fill('5.50');
  await page.locator('#exp-fuel-galoes').fill('10');
  await page.getByRole('button', { name: '+ Adicionar gasto' }).click();

  const exps = await lerEstado(page, 'D.expenses');
  expect(exps[0].meta.abastecimento).toEqual({ precoGalao: 5.5, galoes: 10 });
  await expect(page.locator('#exp-list')).not.toContainText('MPG');
});

test('OS CAMPOS ESVAZIAM depois de adicionar, sem sobra pro próximo lançamento', async ({ page }) => {
  await abrir(page);
  await abrirFolhaDoDia(page);
  await page.locator('#exp-fuel-preco').fill('5.50');
  await page.locator('#exp-fuel-galoes').fill('10');
  await page.locator('#exp-fuel-milhas').fill('350');
  await page.getByRole('button', { name: '+ Adicionar gasto' }).click();

  await expect(page.locator('#exp-fuel-preco')).toHaveValue('');
  await expect(page.locator('#exp-fuel-galoes')).toHaveValue('');
  await expect(page.locator('#exp-fuel-milhas')).toHaveValue('');
});

test('UMA CATEGORIA QUALQUER continua simples: sem meta.abastecimento', async ({ page }) => {
  await abrir(page);
  await abrirFolhaDoDia(page);
  await page.locator('#exp-cat').selectOption('Alimentação');
  await page.locator('#exp-val').fill('40');
  await page.locator('#exp-desc').fill('Almoço');
  await page.getByRole('button', { name: '+ Adicionar gasto' }).click();

  const exps = await lerEstado(page, 'D.expenses');
  expect(exps.length).toBe(1);
  expect(exps[0].meta).toBeUndefined();
});

test('a despesa some do acordeão da Semana com o MPG junto', async ({ page }) => {
  await abrir(page);
  await abrirFolhaDoDia(page);
  await page.locator('#exp-fuel-preco').fill('5.00');
  await page.locator('#exp-fuel-galoes').fill('12');
  await page.locator('#exp-fuel-milhas').fill('300');
  await page.getByRole('button', { name: '+ Adicionar gasto' }).click();
  await page.evaluate(() => window.closeOverlay('modal-day-detail'));

  await expect(page.locator('#days-accordion .dacc-tx-cat')).toContainText('25.0 MPG');
});
