// Dívidas e Patrimônio — as duas centrais onde a semântica financeira vira
// tela. Cobre o cronograma derivado (parcela residual) chegando à UI e o ciclo
// de vida do bem, que já exigiu correção de somente-leitura em produção.
import { test, expect } from '@playwright/test';
import { abrirAppEmDemo, irParaAba, semearDados, lerEstado } from './_helpers.js';

// Dívida sintética que reproduz a aritmética do resíduo: 6500 / 200 → 33
// parcelas (32 × 200 + 1 × 100). O campo `parcelasTotal` está errado de
// propósito e deve ser ignorado pelo resolvedor.
const DIVIDA_TESTE = {
  id: 'divida-teste', titulo: 'Financiamento Teste', tipo: 'financiamento',
  credor: 'Banco Teste', valorOriginal: 6500, valorParcela: 200,
  parcelasTotal: 30, amortizadoInicial: 0,
  dataInicio: '2026-06-10', periodicidade: 'mensal', status: 'ativa',
};

const BEM_TESTE = {
  id: 'pat-teste', nome: 'Bem Teste', tipo: 'outro', status: 'ativo',
  valorAtual: 20000, dataAquisicao: '2026-01-10', eventos: [],
};

test('a central de dívidas lista a dívida semeada', async ({ page }) => {
  await abrirAppEmDemo(page);
  await semearDados(page, { debts: [DIVIDA_TESTE], debtPayments: [] }, 'dividas');

  await expect(page.locator('#dividas-list')).toContainText('Financiamento Teste');
  await expect(page.locator('#dividas-resumo')).not.toBeEmpty();
});

test('a UI usa o total de parcelas derivado, não o campo cadastrado', async ({ page }) => {
  await abrirAppEmDemo(page);
  await semearDados(page, { debts: [DIVIDA_TESTE], debtPayments: [] }, 'dividas');

  const estado = await page.evaluate(() => {
    const d = window.eval('D.debts[0]');
    return {
      total: window._debtParcelasTotal(d),
      saldo: window._debtSaldo(d),
      proxima: window._debtProximaParcelaNo(d),
    };
  });

  expect(estado.total, 'a UI voltou a confiar no parcelasTotal cadastrado').toBe(33);
  expect(estado.saldo).toBe(6500);
  expect(estado.proxima).toBe(1);

  // E a tela reflete isso, não os 30 do cadastro.
  await expect(page.locator('#dividas-list')).toContainText('33');
});

test('registrar pagamento reduz saldo e avança a parcela', async ({ page }) => {
  await abrirAppEmDemo(page);
  await semearDados(page, {
    debts: [DIVIDA_TESTE],
    debtPayments: [{ id: 'pg-teste', debtId: 'divida-teste', valor: 600, data: '2026-06-12' }],
  }, 'dividas');

  const estado = await page.evaluate(() => {
    const d = window.eval('D.debts[0]');
    return { saldo: window._debtSaldo(d), pagas: window._debtParcelasPagas(d), proxima: window._debtProximaParcelaNo(d) };
  });

  expect(estado.saldo).toBe(5900);
  expect(estado.pagas).toBe(3);
  expect(estado.proxima).toBe(4);
});

test('a aba Patrimônio abre e lista o bem semeado', async ({ page }) => {
  await abrirAppEmDemo(page);
  await semearDados(page, { patrimonios: [BEM_TESTE] }, 'patrimonio');
  await expect(page.locator('#page-patrimonio')).toContainText('Bem Teste');
});

test('ciclo de vida do bem: ativo → encerrado → reaberto', async ({ page }) => {
  await abrirAppEmDemo(page);
  await semearDados(page, { patrimonios: [BEM_TESTE] }, 'patrimonio');

  const inicial = await page.evaluate(() => window._patLifecycleOf('pat-teste'));
  expect(inicial).toBe('ativo');

  // Encerra pelo próprio motor de ciclo de vida do app.
  await page.evaluate(() => window._patSetLifecycle('pat-teste', 'encerrado'));
  const encerrado = await page.evaluate(() => window._patLifecycleOf('pat-teste'));
  expect(encerrado).toBe('encerrado');

  await irParaAba(page, 'patrimonio');
  const statusApos = await lerEstado(page, "D.patrimonios.find(p => p.id === 'pat-teste').status");
  expect(statusApos).toBe('encerrado');

  // Reabre: volta a ser operável, sem perder o histórico.
  await page.evaluate(() => window._patSetLifecycle('pat-teste', 'ativo'));
  const reaberto = await page.evaluate(() => window._patLifecycleOf('pat-teste'));
  expect(reaberto).toBe('ativo');

  const preservado = await lerEstado(page, "D.patrimonios.find(p => p.id === 'pat-teste')");
  expect(preservado.nome).toBe('Bem Teste');
  expect(preservado.valorAtual).toBe(20000);
});

test('INVARIANTE de tela: o mês não conta dívida nem aquisição como consumo', async ({ page }) => {
  await abrirAppEmDemo(page);
  await semearDados(page, {
    incomeItems: [], dailyIncome: {},
    expenses: [
      { id: 'e-consumo',   date: '2026-06-12', amount: 100, category: 'Alimentação' },
      { id: 'e-divida',    date: '2026-06-12', amount: 200, category: 'Outros', meta: { source: 'debt' } },
      { id: 'e-aquisicao', date: '2026-06-12', amount: 900, category: 'Outros', meta: { nature: 'asset-acquisition' } },
    ],
  }, 'mes');

  const resumo = await page.evaluate(() => window._monthMovementSummary(0));
  expect(resumo.consumo).toBe(100);
  expect(resumo.debtPayments).toBe(200);
  expect(resumo.assetAcquisition).toBe(900);
  expect(resumo.totalCashOut).toBe(1200);

  // O donut de categorias mostra apenas o consumo.
  const totalDonut = await page.evaluate(() => window.eval('_mesCatTotal'));
  expect(totalDonut).toBe(100);
});

// ── Folha em cima de folha: quem abriu por último tem que ficar visível ──
//
// "Registrar pagamento" abre uma segunda folha por cima da folha de detalhe
// da dívida — de propósito: fechar a segunda revela a primeira de novo,
// já atualizada (é o que `salvarPagamentoDivida` faz ao chamar
// `openDebtDetail` de novo depois de salvar). O defeito: todo `.overlay`
// divide o MESMO z-index, e como CSS empata z-index pela ordem no DOM, quem
// vence não é quem abriu por último — é quem está depois no HTML. Como
// `debt-pay-sheet` vem ANTES de `debt-detail-sheet` no index.html, a folha
// de pagamento abria de verdade (a classe `open` estava lá, o clique
// funcionou) só que ATRÁS da folha de detalhe: invisível, inalcançável. Do
// lado de quem usa, o botão "Registrar pagamento" simplesmente não fazia
// nada.
const DIVIDA_HOJE = {
  id: 'divida-hoje', titulo: 'FUSION 2013', tipo: 'parcelamento', credor: 'Banco Teste',
  categoria: 'Transporte', valorOriginal: 6600, valorParcela: 200, parcelasTotal: 33,
  amortizadoInicial: 2000, dataInicio: '2026-08-07', periodicidade: 'mensal', status: 'ativa',
};

test('a folha de "Registrar pagamento" abre por CIMA da folha de detalhe, não atrás dela', async ({ page }) => {
  await abrirAppEmDemo(page, { agora: new Date(2026, 8, 4, 7, 41, 0) }); // 04/09/2026
  await semearDados(page, {
    debts: [DIVIDA_HOJE],
    debtPayments: [
      { id: 'pay13', debtId: 'divida-hoje', valor: 200, data: '2026-08-21', parcelNo: 13 },
      { id: 'pay14', debtId: 'divida-hoje', valor: 200, data: '2026-08-28', parcelNo: 14 },
    ],
  }, 'dividas');

  await page.locator('.div-card', { hasText: 'FUSION 2013' }).click();
  await page.locator('#debt-detail-body').getByRole('button', { name: 'Registrar pagamento' }).click();

  // As duas seguem "abertas" (é o desenho — a de trás não fecha). O que
  // importa é qual delas o dedo realmente alcança.
  const topo = await page.evaluate(() => {
    const dp = document.getElementById('debt-pay-sheet');
    const r = dp.querySelector('.sheet').getBoundingClientRect();
    const el = document.elementFromPoint(r.left + r.width / 2, r.top + 40);
    return dp.contains(el);
  });
  expect(topo, 'a folha de pagamento abriu atrás da folha de detalhe').toBe(true);

  await expect(page.locator('#debt-pay-valor')).toBeVisible();
  await page.locator('#debt-pay-valor').fill('200');
  await page.locator('#debt-pay-save').click();

  const pagamentos = await lerEstado(page, "D.debtPayments.filter(p => p.debtId === 'divida-hoje')");
  expect(pagamentos.length, 'o pagamento não foi registrado — a folha nunca foi alcançada').toBe(3);
});
