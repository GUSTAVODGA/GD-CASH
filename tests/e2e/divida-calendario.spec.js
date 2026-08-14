// Calendário da dívida nas telas: todas as superfícies dizem a mesma data.
//
// Defeito corrigido aqui: a entrada paga antes do cadastro consumia
// vencimentos que nunca aconteceram, porque a data da parcela k era
// `dataInicio + período·(k−1)` e k vinha do progresso FINANCEIRO. Numa dívida
// semanal com entrada de 2.000 e parcela de 200, o app pulava dez sextas e
// anunciava outubro.
//
// Aqui a pergunta é outra: as sete superfícies que leem a projeção concordam
// entre si, e o financeiro continua o mesmo.
import { test, expect } from '@playwright/test';
import { abrirAppEmDemo, semearDados, lerEstado, irParaAba } from './_helpers.js';

// Segunda-feira 10/08/2026 — entre o primeiro vencimento (sexta 07/08) e o
// seguinte (14/08). Data fixa: a projeção é medida contra um presente declarado.
const AGORA = new Date(2026, 7, 10, 12, 0, 0);

const DIVIDA = {
  id: 'd-semanal', tipo: 'emprestimo', titulo: 'Divida Semanal Teste', credor: 'Banco Teste',
  valorOriginal: 6500, valorParcela: 200, parcelasTotal: 33,
  amortizadoInicial: 2000, parcelasPagasAntes: 0,
  dataInicio: '2026-08-07', periodicidade: 'semanal', status: 'ativa',
};
const PAGAMENTO = { id: 'pay-1', debtId: 'd-semanal', parcelNo: 11, expenseId: 'exp-1', valor: 200, data: '2026-08-07' };
const DESPESA = { id: 'exp-1', date: '2026-08-07', amount: 200, category: 'Dívidas', description: 'Divida Semanal Teste', meta: { source: 'debt', debtId: 'd-semanal', parcelNo: 11 } };

const LIMPO = {
  incomeItems: [], dailyIncome: {}, expenses: [], debtPayments: [], fixedPayments: [],
  debts: [], fixedExpenses: [], pendencias: [], vehicles: [], patrimonios: [],
};

async function semear(page, extra) {
  await semearDados(page, {
    ...LIMPO, debts: [DIVIDA], debtPayments: [PAGAMENTO], expenses: [DESPESA], ...extra,
  }, 'inicio');
}

const abrir = async page => { await abrirAppEmDemo(page, { agora: AGORA }); await semear(page); };

// ══ O MOTOR ══════════════════════════════════════════════════════════════

test('a projeção segue a grade semanal a partir do primeiro vencimento', async ({ page }) => {
  await abrir(page);
  const datas = await page.evaluate(() =>
    window._debtProjectVencimentos(window.getDebt('d-semanal'), { maxItems: 4 }).map(v => v.dueDate));
  expect(datas).toEqual(['2026-08-14', '2026-08-21', '2026-08-28', '2026-09-04']);
});

test('o financeiro do caso real permanece exato', async ({ page }) => {
  await abrir(page);
  const st = await page.evaluate(() => window._debtState(window.getDebt('d-semanal')));
  expect(st.saldo).toBe(4300);
  expect(st.pago).toBe(2200);
  expect(st.parcelasPagas).toBe(11);
  expect(st.proximaNo).toBe(12);
  expect(st.proximaVenc).toBe('2026-08-14');
  expect(await lerEstado(page, 'D.expenses.length')).toBe(1);
  expect(await lerEstado(page, 'D.debtPayments.length')).toBe(1);
});

// ══ AS SETE SUPERFÍCIES ══════════════════════════════════════════════════

test('Central de Dívidas mostra 14/08', async ({ page }) => {
  await abrir(page);
  await irParaAba(page, 'dividas');
  await expect(page.locator('#page-dividas')).toContainText('14/08');
  await expect(page.locator('#page-dividas')).not.toContainText('23/10');
});

test('detalhe da dívida mostra 14/08 nos próximos pagamentos', async ({ page }) => {
  await abrir(page);
  await irParaAba(page, 'dividas');
  await page.evaluate(() => window.openDebtDetail('d-semanal'));
  const folha = page.locator('#debt-detail-sheet');
  await expect(folha).toContainText('14/08/2026');
  await expect(folha).toContainText('21/08/2026');
  await expect(folha).not.toContainText('23/10/2026');
});

test('detalhe explica que a entrada abate o saldo sem mexer nas datas', async ({ page }) => {
  await abrir(page);
  await irParaAba(page, 'dividas');
  await page.evaluate(() => window.openDebtDetail('d-semanal'));
  const folha = page.locator('#debt-detail-sheet');
  await expect(folha).toContainText('pagos antes do cadastro no Avenco');
  await expect(folha).toContainText('sem alterar as datas de vencimento');
  await expect(folha).not.toContainText('parcelas consideradas na projeção');
});

test('Home traz o compromisso de 14/08', async ({ page }) => {
  await abrir(page);
  const datas = await page.evaluate(() => window._debtProximosPorDivida().map(v => v.dueDate));
  expect(datas).toEqual(['2026-08-14']);
});

test('Compromissos em aberto apontam para 14/08', async ({ page }) => {
  await abrir(page);
  const obr = await page.evaluate(() => window._obrigacoesEmAberto().filter(o => o.origem === 'divida'));
  expect(obr.length).toBe(1);
  expect(obr[0].vencimento).toBe('2026-08-14');
});

test('Semana enxerga a parcela no dia certo, e só nele', async ({ page }) => {
  await abrir(page);
  const semana = await page.evaluate(() => {
    const dias = {};
    ['2026-08-13', '2026-08-14', '2026-08-15'].forEach(d => {
      dias[d] = window._debtVencimentosNoPeriodo(d, d).map(v => v.dueDate);
    });
    return dias;
  });
  expect(semana['2026-08-13']).toEqual([]);
  expect(semana['2026-08-14']).toEqual(['2026-08-14']);
  expect(semana['2026-08-15']).toEqual([]);
});

test('Mês recorta as parcelas que pertencem a cada mês', async ({ page }) => {
  await abrir(page);
  const meses = await page.evaluate(() => ({
    agosto: window._debtPrevistoDoMes('2026-08').itens.map(v => v.dueDate),
    setembro: window._debtPrevistoDoMes('2026-09').itens.map(v => v.dueDate),
    outubro: window._debtPrevistoDoMes('2026-10').itens.length,
  }));
  expect(meses.agosto).toEqual(['2026-08-14', '2026-08-21', '2026-08-28']);
  expect(meses.setembro).toEqual(['2026-09-04', '2026-09-11', '2026-09-18', '2026-09-25']);
  expect(meses.outubro).toBe(5);
});

test('Patrimônio: o financiamento do bem usa a mesma data', async ({ page }) => {
  await abrirAppEmDemo(page, { agora: AGORA });
  await semear(page, {
    patrimonios: [{ id: 'pat-1', nome: 'Bem Teste', tipo: 'outro', status: 'ativo', valorEstimado: 10000, historico: [], detalhes: {} }],
    debts: [{ ...DIVIDA, tipo: 'financiamento', patrimonioId: 'pat-1' }],
  });
  const venc = await page.evaluate(() => window._debtState(window.getDebt('d-semanal')).proximaVenc);
  expect(venc).toBe('2026-08-14');
});

test('todas as superfícies concordam sobre a próxima data', async ({ page }) => {
  await abrir(page);
  const vistas = await page.evaluate(() => {
    const d = window.getDebt('d-semanal');
    return {
      state: window._debtState(d).proximaVenc,
      projecao: window._debtProjectVencimentos(d, { maxItems: 1 })[0].dueDate,
      porDivida: window._debtProximosPorDivida()[0].dueDate,
      obrigacoes: window._obrigacoesEmAberto().find(o => o.origem === 'divida').vencimento,
      mes: window._debtPrevistoDoMes('2026-08').itens[0].dueDate,
      dia: window._debtVencimentosNoPeriodo('2026-08-14', '2026-08-14')[0].dueDate,
    };
  });
  expect(new Set(Object.values(vistas)).size, `superfícies divergiram: ${JSON.stringify(vistas)}`).toBe(1);
  expect(vistas.state).toBe('2026-08-14');
});

// ══ O FLUXO DO USUÁRIO ═══════════════════════════════════════════════════

test('registrar o pagamento de 14/08 leva a 21/08, sem duplicar nada', async ({ page }) => {
  await abrir(page);
  await irParaAba(page, 'dividas');
  await page.evaluate(() => window.openDebtPay('d-semanal'));
  await page.locator('#debt-pay-valor').fill('200');
  await page.locator('#debt-pay-data').fill('14/08/2026');
  await page.locator('#debt-pay-save').click();
  await page.waitForFunction(() => !document.getElementById('debt-pay-sheet').classList.contains('open'));

  const st = await page.evaluate(() => window._debtState(window.getDebt('d-semanal')));
  expect(st.proximaVenc).toBe('2026-08-21');
  expect(st.saldo).toBe(4100);
  expect(await lerEstado(page, 'D.debtPayments.length')).toBe(2);
  expect(await lerEstado(page, 'D.expenses.length')).toBe(2);
});

test('pagar com atraso não empurra a grade', async ({ page }) => {
  await abrir(page);
  await irParaAba(page, 'dividas');
  await page.evaluate(() => window.openDebtPay('d-semanal'));
  await page.locator('#debt-pay-valor').fill('200');
  await page.locator('#debt-pay-data').fill('18/08/2026');   // a parcela de 14/08, paga atrasada
  await page.locator('#debt-pay-save').click();
  await page.waitForFunction(() => !document.getElementById('debt-pay-sheet').classList.contains('open'));

  const venc = await page.evaluate(() => window._debtState(window.getDebt('d-semanal')).proximaVenc);
  expect(venc).toBe('2026-08-21');
});

test('o formulário preserva "Parcelas já pagas antes" ao reeditar', async ({ page }) => {
  await abrirAppEmDemo(page, { agora: AGORA });
  await semear(page, { debts: [{ ...DIVIDA, parcelasPagasAntes: 4, amortizadoInicial: 800 }] });
  await irParaAba(page, 'dividas');

  await page.evaluate(() => window.openDebtForm('d-semanal'));
  await expect(page.locator('#df-pagas-antes')).toHaveValue('4');
  await page.locator('#debt-save-btn').click();

  expect(await lerEstado(page, "D.debts.find(d => d.id === 'd-semanal').parcelasPagasAntes")).toBe(4);
  expect(await lerEstado(page, "D.debts.find(d => d.id === 'd-semanal').amortizadoInicial")).toBe(800);
});

test('dívida sem amortização anterior: comportamento idêntico ao de sempre', async ({ page }) => {
  await abrirAppEmDemo(page, { agora: AGORA });
  await semear(page, {
    debts: [{ ...DIVIDA, amortizadoInicial: 0 }], debtPayments: [], expenses: [],
  });
  const st = await page.evaluate(() => window._debtState(window.getDebt('d-semanal')));
  expect(st.proximaNo).toBe(1);
  expect(st.proximaVenc).toBe('2026-08-07');
  expect(st.saldo).toBe(6500);
});
