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

// ── O MESMO ABASTECIMENTO, PELO "+" GLOBAL ──────────────────────────────────
//
// "Editar dia completo" não é por onde a maioria dos lançamentos passa — o
// caminho normal é o "+" global (o formulário de "Novo lançamento"), inclusive
// para editar depois pelo acordeão da Semana. Os campos de abastecimento só
// tinham sido plugados no primeiro formulário; o relatado foi exatamente
// selecionar Gasolina ali e não ver nada — porque de fato não tinha nada.
async function abrirFormularioDeGasto(page) {
  await page.locator('#global-fab').click();
  await esperarOverlay(page, 'modal-quick-add', true);
  await page.locator('#qa-btn-gas').click();
  await page.locator('#qa-cat-sel').selectOption('Gasolina');
}

test('NO "+" GLOBAL: Gasolina também mostra os campos de abastecimento', async ({ page }) => {
  await abrir(page);
  await abrirFormularioDeGasto(page);
  await expect(page.locator('#qa-fuel-fields')).toBeVisible();

  await page.locator('#qa-cat-sel').selectOption('Alimentação');
  await expect(page.locator('#qa-fuel-fields')).toBeHidden();
});

test('NO "+" GLOBAL: preço × galões preenche o Valor sozinho', async ({ page }) => {
  await abrir(page);
  await abrirFormularioDeGasto(page);
  await page.locator('#qa-fuel-preco').fill('5.50');
  await page.locator('#qa-fuel-galoes').fill('10');
  await expect(page.locator('#qa-amt-input')).toHaveValue('55.00');
});

test('NO "+" GLOBAL: lançar abastecimento grava meta.abastecimento e mostra o MPG', async ({ page }) => {
  await abrir(page);
  await abrirFormularioDeGasto(page);
  await page.locator('#qa-desc').fill('Shell');
  await page.locator('#qa-fuel-preco').fill('5.50');
  await page.locator('#qa-fuel-galoes').fill('10');
  await page.locator('#qa-fuel-milhas').fill('350');
  await page.locator('#qa-save-btn').click();
  await esperarOverlay(page, 'modal-quick-add', false);

  const exps = await lerEstado(page, 'D.expenses');
  expect(exps.length).toBe(1);
  expect(exps[0].meta.abastecimento).toEqual({ precoGalao: 5.5, galoes: 10, milhas: 350 });

  await expect(page.locator('#days-accordion .dacc-tx-cat')).toContainText('35.0 MPG');
});

test('NO "+" GLOBAL: editar um abastecimento existente reabre com os campos preenchidos', async ({ page }) => {
  await abrir(page, {
    expenses: [{
      id: 'g1', date: '2026-08-20', category: 'Gasolina', description: 'Shell', amount: 55,
      meta: { abastecimento: { precoGalao: 5.5, galoes: 10, milhas: 350 } },
    }],
  });
  await page.locator('#days-accordion .dacc-tx-edit').first().click();
  await esperarOverlay(page, 'modal-quick-add', true);

  await expect(page.locator('#qa-fuel-fields')).toBeVisible();
  await expect(page.locator('#qa-fuel-preco')).toHaveValue('5.5');
  await expect(page.locator('#qa-fuel-galoes')).toHaveValue('10');
  await expect(page.locator('#qa-fuel-milhas')).toHaveValue('350');
});

test('NO "+" GLOBAL: editar e mudar as milhas atualiza o MPG mostrado', async ({ page }) => {
  await abrir(page, {
    expenses: [{
      id: 'g1', date: '2026-08-20', category: 'Gasolina', description: 'Shell', amount: 55,
      meta: { abastecimento: { precoGalao: 5.5, galoes: 10, milhas: 350 } },
    }],
  });
  await page.locator('#days-accordion .dacc-tx-edit').first().click();
  await esperarOverlay(page, 'modal-quick-add', true);
  await page.locator('#qa-fuel-milhas').fill('400');
  await page.locator('#qa-save-btn').click();
  await esperarOverlay(page, 'modal-quick-add', false);

  const exp = await lerEstado(page, "D.expenses.find(e => e.id === 'g1')");
  expect(exp.meta.abastecimento).toEqual({ precoGalao: 5.5, galoes: 10, milhas: 400 });
  await expect(page.locator('#days-accordion .dacc-tx-cat')).toContainText('40.0 MPG');
});

test('NO "+" GLOBAL: mudar a categoria pra longe de Gasolina remove o abastecimento', async ({ page }) => {
  await abrir(page, {
    expenses: [{
      id: 'g1', date: '2026-08-20', category: 'Gasolina', description: 'Shell', amount: 55,
      meta: { abastecimento: { precoGalao: 5.5, galoes: 10, milhas: 350 } },
    }],
  });
  await page.locator('#days-accordion .dacc-tx-edit').first().click();
  await esperarOverlay(page, 'modal-quick-add', true);
  await page.locator('#qa-cat-sel').selectOption('Alimentação');
  await expect(page.locator('#qa-fuel-fields')).toBeHidden();
  await page.locator('#qa-save-btn').click();
  await esperarOverlay(page, 'modal-quick-add', false);

  const exp = await lerEstado(page, "D.expenses.find(e => e.id === 'g1')");
  expect(exp.meta?.abastecimento).toBeUndefined();
});
