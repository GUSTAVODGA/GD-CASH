// Custo de posse: o número acionável sai da gaveta.
//
// O app já sabia calcular quanto um bem consumiu no mês — parcela, combustível,
// manutenção, sem contar duas vezes. E usava isso em UM lugar: no fim da tela
// de detalhe, só para veículo. Enquanto isso a capa do módulo e o menu Mais
// lideravam com "Líquido R$ X", derivado de `valorEstimado` — um número que o
// usuário digitou uma vez e que envelhece virando ficção.
//
// A troca: custo do mês vira a manchete, valor estimado desce para a segunda
// linha. E a conta passa a valer para qualquer bem, não só carro.
//
// O que estes testes protegem:
//   1. a conta está CERTA (é dinheiro, e errar aqui é pior que não mostrar);
//   2. ela não conta a mesma despesa duas vezes;
//   3. ela não some com o patrimônio líquido — que continua onde estava;
//   4. ela é derivada, nunca gravada.
import { test, expect } from '@playwright/test';
import { abrirAppEmDemo, semearDados, irParaAba, lerEstado } from './_helpers.js';

const AGORA = new Date(2026, 7, 20, 12, 0, 0);   // agosto/2026

const VEICULO = {
  id: 'v1', name: 'Gol 2015', plate: 'ABC1D23', brand: 'VW', model: 'Gol', year: '2015',
  km: 80000, color: 'Prata', status: 'em_uso', photo: null, notes: '',
  history: [], linkedExpenses: [], linkedPendencias: [],
};

const IMOVEL = {
  id: 'pat-im', tipo: 'imovel', nome: 'Apartamento', status: 'ativo',
  valorEstimado: 300000, historico: [], detalhes: {}, financiamentos: [],
};

const BASE = {
  platforms: [{ id: 'p1', name: 'Fonte A', color: '#0C7A52' }],
  incomeItems: [], dailyIncome: {}, expenses: [], debtPayments: [], fixedPayments: [],
  debts: [], fixedExpenses: [], pendencias: [], reservaHistory: [], goals: [],
  daysOff: [], reminders: [], emergency: { current: 0, target: 0 },
  patrimonios: [IMOVEL], vehicles: [VEICULO],
};

const g = (id, data, valor, cat, desc, extra) =>
  Object.assign({ id, date: data, amount: valor, category: cat, description: desc }, extra || {});

const abrir = async (page, dados) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const erros = await abrirAppEmDemo(page, { agora: AGORA });
  await semearDados(page, dados || BASE, 'inicio');
  await page.evaluate(() => window._migrateVehiclesToPatrimonios());
  return erros;
};

test('A CONTA: uso, manutenção e parcela somam o custo do mês', async ({ page }) => {
  await abrir(page, { ...BASE,
    debts: [{ id: 'd1', tipo: 'financiamento', titulo: 'Financiamento do carro', credor: 'Banco',
      valorOriginal: 60000, valorParcela: 1450, parcelasTotal: 42, amortizadoInicial: 0,
      dataInicio: '2026-01-10', periodicidade: 'mensal', status: 'ativa', vehicleId: 'v1' }],
    expenses: [
      g('e1', '2026-08-05', 300, 'Transporte', 'Gasolina', { vehicleId: 'v1' }),
      g('e2', '2026-08-12', 250, 'Transporte', 'Pneu',     { vehicleId: 'v1' }),
      g('e3', '2026-08-10', 1450, 'Dívidas', 'Parcela 8/42',
        { meta: { source: 'debt', debtId: 'd1', parcelNo: 8 } }),
    ] });

  const c = await lerEstado(page, `_bemCustoMes('v1')`);
  expect(c.uso, 'uso e manutenção').toBe(550);
  expect(c.fin, 'parcela do financiamento').toBe(1450);
  expect(c.total).toBe(2000);
});

test('a conta NÃO ATRAVESSA meses', async ({ page }) => {
  await abrir(page, { ...BASE, expenses: [
    g('e1', '2026-08-05', 300, 'Transporte', 'Gasolina de agosto', { vehicleId: 'v1' }),
    g('e2', '2026-07-05', 900, 'Transporte', 'Gasolina de julho',  { vehicleId: 'v1' }),
  ] });
  expect((await lerEstado(page, `_bemCustoMes('v1')`)).total).toBe(300);
  expect((await lerEstado(page, `_bemCustoMes('v1','2026-07')`)).total).toBe(900);
});

test('a parcela de OUTRO bem não entra no custo deste', async ({ page }) => {
  await abrir(page, { ...BASE,
    debts: [{ id: 'd2', tipo: 'financiamento', titulo: 'Financiamento do apê', credor: 'Banco',
      valorOriginal: 200000, valorParcela: 1800, parcelasTotal: 120, amortizadoInicial: 0,
      dataInicio: '2026-01-10', periodicidade: 'mensal', status: 'ativa', patrimonioId: 'pat-im' }],
    expenses: [
      g('e1', '2026-08-05', 300, 'Transporte', 'Gasolina', { vehicleId: 'v1' }),
      g('e2', '2026-08-10', 1800, 'Dívidas', 'Parcela 8/120',
        { meta: { source: 'debt', debtId: 'd2', parcelNo: 8 } }),
    ] });
  const carro = await lerEstado(page, `_bemCustoMes('v1')`);
  const apto  = await lerEstado(page, `_bemCustoMes('pat-im')`);
  expect(carro.total, 'a parcela do apartamento vazou para o carro').toBe(300);
  expect(apto.fin, 'a conta não vale para bem que não é veículo').toBe(1800);
});

test('A CONTA VALE PARA IMÓVEL, não só para carro', async ({ page }) => {
  await abrir(page, { ...BASE, expenses: [
    g('e1', '2026-08-06', 420, 'Moradia', 'Condomínio', { patrimonioId: 'pat-im' }),
    g('e2', '2026-08-18', 180, 'Moradia', 'Reparo',     { patrimonioId: 'pat-im' }),
  ] });
  expect((await lerEstado(page, `_bemCustoMes('pat-im')`)).uso).toBe(600);
});

test('a mesma despesa nunca é contada duas vezes', async ({ page }) => {
  // Vínculo canônico E índice legado apontando para o mesmo gasto.
  await abrir(page, { ...BASE,
    vehicles: [{ ...VEICULO, linkedExpenses: ['e1'] }],
    expenses: [g('e1', '2026-08-05', 300, 'Transporte', 'Gasolina', { vehicleId: 'v1' })] });
  expect((await lerEstado(page, `_bemCustoMes('v1')`)).total).toBe(300);
});

test('bem sem gasto no mês custa zero, e não quebra', async ({ page }) => {
  await abrir(page);
  expect((await lerEstado(page, `_bemCustoMes('v1')`)).total).toBe(0);
  expect((await lerEstado(page, `_bemCustoMes('pat-im')`)).total).toBe(0);
  expect(await lerEstado(page, `_bemCustoMes('nao-existe').total`)).toBe(0);
});

test('A CAPA: o custo lidera, e o líquido continua na tela', async ({ page }) => {
  const erros = await abrir(page, { ...BASE, expenses: [
    g('e1', '2026-08-05', 300, 'Transporte', 'Gasolina', { vehicleId: 'v1' }),
    g('e2', '2026-08-06', 420, 'Moradia', 'Condomínio', { patrimonioId: 'pat-im' }),
  ] });
  await irParaAba(page, 'patrimonio');
  await page.waitForTimeout(400);

  const hero = page.locator('#page-patrimonio .hero-card').first();
  await expect(hero).toContainText('Custo dos bens este mês');
  await expect(hero, 'a soma dos custos não bateu').toContainText('720');
  // NADA SE PERDEU: o patrimônio líquido continua exibido.
  await expect(hero, 'o patrimônio líquido sumiu da tela').toContainText('Patrimônio líquido');
  await expect(hero).toContainText('300.000');
  expect(erros).toEqual([]);
});

test('O CARTÃO do bem mostra o custo, e o valor estimado desce', async ({ page }) => {
  await abrir(page, { ...BASE, expenses: [
    g('e1', '2026-08-05', 300, 'Transporte', 'Gasolina', { vehicleId: 'v1' }),
  ] });
  await irParaAba(page, 'patrimonio');
  await page.waitForTimeout(400);

  const cartaoImovel = page.locator('.pat-list-item', { hasText: 'Apartamento' });
  await expect(cartaoImovel.locator('.pat-list-custo')).toHaveCount(1);
  await expect(cartaoImovel, 'o valor estimado sumiu do cartão').toContainText('300.000');

  const cartaoCarro = page.locator('.pat-list-item', { hasText: 'Gol 2015' });
  await expect(cartaoCarro.locator('.pat-list-custo')).toContainText('300');
  await expect(cartaoCarro.locator('.pat-list-custo')).toContainText('/mês');
});

test('bem sem custo no mês diz isso, em vez de mostrar R$ 0,00', async ({ page }) => {
  await abrir(page);
  await irParaAba(page, 'patrimonio');
  await page.waitForTimeout(400);
  await expect(page.locator('.pat-list-item', { hasText: 'Gol 2015' })
    .locator('.pat-list-custo')).toContainText('Sem custo no mês');
});

test('o menu Mais também lidera pelo custo', async ({ page }) => {
  await abrir(page, { ...BASE, expenses: [
    g('e1', '2026-08-05', 300, 'Transporte', 'Gasolina', { vehicleId: 'v1' }),
  ] });
  await irParaAba(page, 'mais');
  const item = page.locator('.mais-item').filter({ hasText: 'Patrimônio' });
  await expect(item).toContainText('este mês');
  await expect(item, 'o líquido saiu do menu').toContainText('líquido');
});

test('o custo é DERIVADO: não grava nada e não chama save()', async ({ page }) => {
  await abrir(page, { ...BASE, expenses: [
    g('e1', '2026-08-05', 300, 'Transporte', 'Gasolina', { vehicleId: 'v1' }),
  ] });
  const antes = await lerEstado(page, 'JSON.stringify(D)');
  const salvou = await page.evaluate(() => {
    let n = 0; const s = window.save; window.save = () => { n++; return s && s(); };
    window._bemCustoMes('v1'); window._bemCustoMes('pat-im');
    window.switchTab('patrimonio'); window.switchTab('mais');
    window.save = s; return n;
  });
  expect(salvou).toBe(0);
  expect(await lerEstado(page, 'JSON.stringify(D)')).toBe(antes);
});
