// Pendência ⇄ despesa pelo fluxo real do usuário.
//
// Antes: concluir uma pendência com "Registrar" criava uma despesa manual
// comum, sem vínculo nenhum. Apagar a despesa depois deixava a pendência
// concluída para sempre, e o app perdia a relação entre as duas coisas.
//
// Agora a relação é gravada dos dois lados no momento do Salvar, e excluir a
// despesa devolve a pendência para os compromissos em aberto.
import { test, expect } from '@playwright/test';
import { abrirAppEmDemo, semearDados, lerEstado, esperarOverlay, irParaAba } from './_helpers.js';

const PENDENCIA = {
  id: 'pend-1', title: 'Pendencia Teste', category: 'Casa', status: 'aberta',
  estimatedValue: 150, deadline: '2026-06-20',
};

const LIMPO = {
  incomeItems: [], dailyIncome: {}, expenses: [], debtPayments: [], fixedPayments: [],
  debts: [], fixedExpenses: [], pendencias: [], vehicles: [], patrimonios: [],
};

const dialogo = page => page.locator('#_av_dlg');

async function semear(page, extra) {
  await semearDados(page, { ...LIMPO, pendencias: [PENDENCIA], ...extra }, 'inicio');
}

/** Conclui a pendência e responde ao diálogo "registrar o valor como gasto?". */
async function concluir(page, resposta) {
  await page.evaluate(() => window.completePendencia('pend-1'));
  await dialogo(page).waitFor({ state: 'visible' });
  await page.locator('#_av_dlg .av-dialog-actions button', { hasText: resposta }).click();
}

const ESTADO = `({
  status: (D.pendencias[0] || {}).status,
  despesaId: (D.pendencias[0] || {}).despesaId,
  despesas: D.expenses.length,
  meta: (D.expenses[0] || {}).meta,
  debtPayments: D.debtPayments.length,
  fixedPayments: D.fixedPayments.length,
})`;

// ══ CONCLUIR ═════════════════════════════════════════════════════════════

test('concluir sem registrar gasto: concluída e nenhuma despesa', async ({ page }) => {
  await abrirAppEmDemo(page);
  await semear(page);
  await concluir(page, 'Não');

  const st = await lerEstado(page, ESTADO);
  expect(st.status).toBe('concluida');
  expect(st.despesas).toBe(0);
  expect(st.despesaId).toBeUndefined();
});

test('escolher Registrar abre o formulário sem gravar nada ainda', async ({ page }) => {
  await abrirAppEmDemo(page);
  await semear(page);
  await concluir(page, 'Registrar');
  await esperarOverlay(page, 'modal-quick-add', true);

  await expect(page.locator('#qa-amt-input')).toHaveValue('150');
  await expect(page.locator('#qa-desc')).toHaveValue('Pendencia Teste');
  const st = await lerEstado(page, ESTADO);
  expect(st.despesas).toBe(0);
  expect(st.despesaId).toBeUndefined();
});

test('salvar cria exatamente uma despesa, vinculada dos dois lados', async ({ page }) => {
  await abrirAppEmDemo(page);
  await semear(page);
  await concluir(page, 'Registrar');
  await esperarOverlay(page, 'modal-quick-add', true);
  await page.locator('#qa-save-btn').click();
  await esperarOverlay(page, 'modal-quick-add', false);

  const st = await lerEstado(page, ESTADO);
  expect(st.despesas).toBe(1);
  expect(st.meta).toEqual({ source: 'pendencia', pendenciaId: 'pend-1' });
  expect(st.status).toBe('concluida');
  expect(st.debtPayments).toBe(0);
  expect(st.fixedPayments).toBe(0);

  const e = await lerEstado(page, 'D.expenses[0]');
  expect(e.amount).toBe(150);
  expect(st.despesaId).toBe(e.id);
  expect(await page.evaluate(() => window._movementNature(window.eval('D.expenses[0]')))).toBe('consumo');

  const res = await page.evaluate(() => window._monthMovementSummary(0));
  expect(res.totalCashOut).toBe(150);
  expect(res.consumo).toBe(150);
});

test('cancelar o lançamento não deixa relação fantasma', async ({ page }) => {
  await abrirAppEmDemo(page);
  await semear(page);
  await concluir(page, 'Registrar');
  await esperarOverlay(page, 'modal-quick-add', true);
  await page.evaluate(() => window.qaCancel());
  await esperarOverlay(page, 'modal-quick-add', false);

  const st = await lerEstado(page, ESTADO);
  expect(st.despesas).toBe(0);
  expect(st.despesaId).toBeUndefined();
  expect(st.status).toBe('concluida');
});

test('o "+" depois do fluxo não herda o vínculo da pendência', async ({ page }) => {
  await abrirAppEmDemo(page);
  await semear(page);
  await concluir(page, 'Registrar');
  await esperarOverlay(page, 'modal-quick-add', true);
  await page.evaluate(() => window.qaCancel());
  await esperarOverlay(page, 'modal-quick-add', false);

  await page.locator('#global-fab').click();
  await esperarOverlay(page, 'modal-quick-add', true);
  await page.evaluate(() => window.qaSetType('gas'));
  await page.locator('#qa-amt-input').fill('40');
  await page.locator('#qa-desc').fill('Gasto Avulso Teste');
  await page.locator('#qa-save-btn').click();
  await esperarOverlay(page, 'modal-quick-add', false);

  const st = await lerEstado(page, ESTADO);
  expect(st.despesas).toBe(1);
  expect(st.meta).toBeUndefined();
  expect(st.despesaId).toBeUndefined();
});

// ══ EXCLUIR A DESPESA ════════════════════════════════════════════════════

/** Percorre o fluxo completo até existir a despesa vinculada. */
async function comDespesaVinculada(page) {
  await abrirAppEmDemo(page);
  await semear(page);
  await concluir(page, 'Registrar');
  await esperarOverlay(page, 'modal-quick-add', true);
  await page.locator('#qa-save-btn').click();
  await esperarOverlay(page, 'modal-quick-add', false);
  return lerEstado(page, 'D.expenses[0].id');
}

test('excluir a despesa reabre a pendência e devolve o compromisso', async ({ page }) => {
  const expId = await comDespesaVinculada(page);
  expect(await page.evaluate(() => window._obrigacoesEmAberto().filter(o => o.origem === 'pendencia').length)).toBe(0);

  await page.evaluate(id => window.deleteExpense(id), expId);

  const st = await lerEstado(page, ESTADO);
  expect(st.status).toBe('aberta');
  expect(st.despesaId).toBeUndefined();
  expect(st.despesas).toBe(0);

  const obr = await page.evaluate(() => window._obrigacoesEmAberto().filter(o => o.origem === 'pendencia'));
  expect(obr.length).toBe(1);
  expect(obr[0].id).toBe('pend-1');
  expect(obr[0].valorSugerido).toBe(150);
});

test('excluir a despesa não cria nenhuma outra e zera o caixa do mês', async ({ page }) => {
  const expId = await comDespesaVinculada(page);
  await page.evaluate(id => window.deleteExpense(id), expId);

  expect(await lerEstado(page, 'D.expenses.length')).toBe(0);
  const res = await page.evaluate(() => window._monthMovementSummary(0));
  expect(res.totalCashOut).toBe(0);
  expect(res.consumo).toBe(0);
});

test('reconciliar de novo depois de excluir não duplica efeito', async ({ page }) => {
  const expId = await comDespesaVinculada(page);
  await page.evaluate(id => window.deleteExpense(id), expId);
  const depois = await lerEstado(page, 'JSON.stringify(D.pendencias)');
  await page.evaluate(() => { window.reconcilePendencias(); window.reconcilePendencias(); });
  expect(await lerEstado(page, 'JSON.stringify(D.pendencias)')).toBe(depois);
  expect(await lerEstado(page, 'D.pendencias.length')).toBe(1);
});

test('excluir pelo próprio lançamento (Recentes → Excluir) também reabre', async ({ page }) => {
  await comDespesaVinculada(page);
  await page.locator('#inicio-tx-list .tx-item', { hasText: 'Pendencia Teste' }).first().click();
  await esperarOverlay(page, 'modal-quick-add', true);
  await page.locator('#qa-del-btn').click();
  await dialogo(page).waitFor({ state: 'visible' });
  await page.locator('#_av_dlg .av-dialog-actions button', { hasText: 'Excluir' }).click();

  await expect.poll(() => lerEstado(page, 'D.pendencias[0].status')).toBe('aberta');
  expect(await lerEstado(page, 'D.expenses.length')).toBe(0);
});

// ══ REABRIR E EXCLUIR A PENDÊNCIA ════════════════════════════════════════

test('reabrir com despesa viva é bloqueado e não apaga dinheiro', async ({ page }) => {
  await comDespesaVinculada(page);
  const antes = await lerEstado(page, ESTADO);

  await page.evaluate(() => window.reopenPendencia('pend-1'));
  await dialogo(page).waitFor({ state: 'visible' });
  await expect(page.locator('#_av_dlg .av-dialog-title')).toHaveText('Existe um gasto registrado');
  await expect(page.locator('#_av_dlg .av-dialog-msg')).toContainText('exclua esse lançamento primeiro');
  await page.locator('#_av_dlg .av-dialog-actions button').first().click();

  expect(await lerEstado(page, ESTADO)).toEqual(antes);
  expect(await lerEstado(page, 'D.pendencias[0].status')).toBe('concluida');
  expect(await lerEstado(page, 'D.expenses.length')).toBe(1);
});

test('excluir a pendência com despesa viva é bloqueado, sem cascata', async ({ page }) => {
  await comDespesaVinculada(page);
  const antes = await lerEstado(page, ESTADO);

  await page.evaluate(() => window.deletePendencia('pend-1'));
  await dialogo(page).waitFor({ state: 'visible' });
  await expect(page.locator('#_av_dlg .av-dialog-title')).toHaveText('Existe um gasto vinculado');
  await page.locator('#_av_dlg .av-dialog-actions button').first().click();

  expect(await lerEstado(page, 'D.pendencias.length')).toBe(1);
  expect(await lerEstado(page, 'D.expenses.length')).toBe(1);
  expect(await lerEstado(page, ESTADO)).toEqual(antes);
});

test('sem despesa vinculada, reabrir e excluir seguem como sempre', async ({ page }) => {
  await abrirAppEmDemo(page);
  await semear(page);
  await concluir(page, 'Não');

  await page.evaluate(() => window.reopenPendencia('pend-1'));
  expect(await lerEstado(page, 'D.pendencias[0].status')).toBe('aberta');

  await page.evaluate(() => window.deletePendencia('pend-1'));
  await dialogo(page).waitFor({ state: 'visible' });
  await expect(page.locator('#_av_dlg .av-dialog-title')).toHaveText('Excluir pendência');
  await page.locator('#_av_dlg .av-dialog-actions button', { hasText: 'Excluir' }).click();
  expect(await lerEstado(page, 'D.pendencias.length')).toBe(0);
});

// ══ RECENTES E PESQUISA ══════════════════════════════════════════════════

test('Recentes nomeia o gasto de pendência', async ({ page }) => {
  await comDespesaVinculada(page);
  const linha = page.locator('#inicio-tx-list .tx-item', { hasText: 'Pendencia Teste' }).first();
  await expect(linha).toContainText('Gasto de pendência');
});

test('Pesquisa nomeia o gasto de pendência', async ({ page }) => {
  await comDespesaVinculada(page);
  await irParaAba(page, 'pesquisa');
  await page.locator('#srch-q').fill('Pendencia Teste');
  await expect(page.locator('#srch-results')).toContainText('Gasto de pendência');
});

// ══ INVARIANTES ══════════════════════════════════════════════════════════

test('INVARIANTE: repetir o fluxo não gera duas despesas para a mesma pendência', async ({ page }) => {
  const expId = await comDespesaVinculada(page);
  await page.evaluate(id => window.deleteExpense(id), expId);   // reabre
  await concluir(page, 'Registrar');                            // conclui de novo
  await esperarOverlay(page, 'modal-quick-add', true);
  await page.locator('#qa-save-btn').click();
  await esperarOverlay(page, 'modal-quick-add', false);

  const ligadas = await page.evaluate(() =>
    window.eval('D').expenses.filter(e => e.meta && e.meta.source === 'pendencia' && e.meta.pendenciaId === 'pend-1'));
  expect(ligadas.length).toBe(1);
  expect(await lerEstado(page, 'D.expenses.length')).toBe(1);
});

test('INVARIANTE: o fluxo não toca em dívidas, fixos nem patrimônio', async ({ page }) => {
  await abrirAppEmDemo(page);
  await semearDados(page, {
    ...LIMPO, pendencias: [PENDENCIA],
    debts: [{ id: 'd1', tipo: 'emprestimo', titulo: 'Divida Teste', valorOriginal: 1000, valorParcela: 100, parcelasTotal: 10, amortizadoInicial: 0, dataInicio: '2026-01-10', periodicidade: 'mensal', status: 'ativa' }],
    patrimonios: [{ id: 'pat-1', nome: 'Bem Teste', tipo: 'outro', status: 'ativo', valorEstimado: 5000, historico: [], detalhes: {} }],
  }, 'inicio');
  const antes = await lerEstado(page, 'JSON.stringify({ d: D.debts, dp: D.debtPayments, fp: D.fixedPayments, p: D.patrimonios })');

  await concluir(page, 'Registrar');
  await esperarOverlay(page, 'modal-quick-add', true);
  await page.locator('#qa-save-btn').click();
  await esperarOverlay(page, 'modal-quick-add', false);

  expect(await lerEstado(page, 'JSON.stringify({ d: D.debts, dp: D.debtPayments, fp: D.fixedPayments, p: D.patrimonios })')).toBe(antes);
  expect(await page.evaluate(() => window._debtSaldo(window.getDebt('d1')))).toBe(1000);
});
