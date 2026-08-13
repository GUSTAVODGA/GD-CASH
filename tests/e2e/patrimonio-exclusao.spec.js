// Exclusão de patrimônio pela interface.
//
// Defeito corrigido aqui: apagar um bem com vínculo deixava o outro lado
// órfão — a despesa continuava apontando para um `patrimonioId` inexistente e
// a dívida para um bem que sumiu. Havia duas portas: o menu "⋮" (guarda parcial,
// que só via histórico e financiamento) e o botão "Excluir" do rodapé do
// formulário (nenhuma guarda).
//
// Política: sem cascata. Havendo vínculo, o bem não é apagado — é encerrado,
// e todo o histórico permanece.
import { test, expect } from '@playwright/test';
import { abrirAppEmDemo, semearDados, lerEstado } from './_helpers.js';

const PASTA = process.env.SHOT_DIR || 'test-results/patrimonio-exclusao';

const PAT_ID = 'pat-imovel';
const IMOVEL = {
  id: PAT_ID, nome: 'Imovel Teste', tipo: 'imovel', status: 'ativo',
  valorEstimado: 300000, historico: [], detalhes: {},
};
const VEICULO = {
  id: 'veh-teste', name: 'Veiculo Teste', brand: 'Marca Teste', model: 'Modelo Teste',
  year: '2020', color: 'Prata', plate: '', km: 1000, photo: null, notes: '',
  status: 'em_uso', history: [], linkedExpenses: [], linkedPendencias: [],
};
const AQUISICAO = { id: 'e-aq', date: '2026-06-13', amount: 8000, category: 'Outros', description: 'Compra Bem Teste', patrimonioId: PAT_ID, meta: { nature: 'asset-acquisition' } };
const DESPESA_USO = { id: 'e-uso', date: '2026-06-13', amount: 300, category: 'Casa', description: 'Reparo Teste', patrimonioId: PAT_ID };
const FINANCIAMENTO = { id: 'd-fin', tipo: 'financiamento', titulo: 'Financiamento Teste', credor: 'Banco Teste', patrimonioId: PAT_ID, valorOriginal: 200000, valorParcela: 1000, parcelasTotal: 200, amortizadoInicial: 0, dataInicio: '2026-01-10', periodicidade: 'mensal', status: 'ativa' };
const FIN_QUITADO = { ...FINANCIAMENTO, id: 'd-quit', amortizadoInicial: 200000, status: 'quitada' };

const LIMPO = {
  incomeItems: [], dailyIncome: {}, expenses: [], debtPayments: [], fixedPayments: [],
  debts: [], fixedExpenses: [], pendencias: [], vehicles: [], patrimonios: [],
};

const dialogo = page => page.locator('#_av_dlg');
const tituloDlg = page => page.locator('#_av_dlg .av-dialog-title');
const msgDlg = page => page.locator('#_av_dlg .av-dialog-msg');

/** Fotografia do estado que jamais pode mudar por uma tentativa de exclusão. */
const RETRATO = `JSON.stringify({
  patrimonios: D.patrimonios, vehicles: D.vehicles, expenses: D.expenses,
  debts: D.debts, debtPayments: D.debtPayments, pendencias: D.pendencias,
  incomeItems: D.incomeItems,
})`;

/** Abre o menu "⋮" do bem e toca em Excluir — o caminho do usuário. */
async function excluirPeloMenu(page, id) {
  await page.evaluate(i => window.openPatMenu(i), id);
  await page.locator('#pat-menu-sheet').waitFor({ state: 'visible' });
  await page.locator('#pat-menu-sheet [onclick*="patMenuDelete"]').click();
  await dialogo(page).waitFor({ state: 'visible' });
}

/** Abre o formulário de edição do bem e toca no "Excluir" do rodapé. */
async function excluirPeloFormulario(page, id) {
  // O formulário vive dentro da aba Patrimônio: sem entrar nela, o botão
  // existe no DOM mas não está visível para o usuário.
  await page.evaluate(() => window.switchTab('patrimonio', 'mais'));
  await page.locator('#page-patrimonio.active').waitFor();
  await page.evaluate(i => window.openPatForm(null, i), id);
  await page.locator(`#pat-form-cont [onclick*="deletePatrimonioUI"]`).click();
  await dialogo(page).waitFor({ state: 'visible' });
}

async function semear(page, dados) {
  await semearDados(page, { ...LIMPO, patrimonios: [IMOVEL], ...dados }, 'inicio');
}

// ══ OS TESTES QUE FALHAM NO CÓDIGO DA v64 ════════════════════════════════

test('aquisição: excluir o bem é bloqueado e nada muda', async ({ page }) => {
  await abrirAppEmDemo(page);
  await semear(page, { expenses: [AQUISICAO] });

  const antes = await lerEstado(page, RETRATO);
  const liquidoAntes = await page.evaluate(() => window._patNetTotals(window._patUnifiedItems()));

  await excluirPeloMenu(page, PAT_ID);
  await expect(tituloDlg(page)).toHaveText('Este bem possui histórico financeiro');
  await expect(msgDlg(page)).toContainText('1 aquisição');
  await expect(msgDlg(page)).toContainText('não pode ser apagado');
  // O caminho seguro é oferecido, não a exclusão.
  await expect(page.locator('#_av_dlg .av-dialog-actions')).toContainText('Marcar como vendido');
  await page.locator('#_av_dlg .av-dialog-actions button', { hasText: 'Voltar' }).click();

  expect(await lerEstado(page, 'D.patrimonios.length')).toBe(1);
  const e = await lerEstado(page, "D.expenses.find(x => x.id === 'e-aq')");
  expect(e.amount).toBe(8000);
  expect(e.patrimonioId).toBe(PAT_ID);
  expect(await lerEstado(page, `!!D.patrimonios.find(p => p.id === '${PAT_ID}')`)).toBe(true);
  expect(await page.evaluate(() => window._movementNature(window.eval("D.expenses.find(x => x.id === 'e-aq')")))).toBe('asset-acquisition');
  expect(await lerEstado(page, RETRATO)).toBe(antes);
  const liquidoDepois = await page.evaluate(() => window._patNetTotals(window._patUnifiedItems()));
  expect(liquidoDepois).toEqual(liquidoAntes);
});

test('aquisição: o botão do formulário também bloqueia', async ({ page }) => {
  await abrirAppEmDemo(page);
  await semear(page, { expenses: [AQUISICAO] });
  const antes = await lerEstado(page, RETRATO);

  await excluirPeloFormulario(page, PAT_ID);
  await expect(tituloDlg(page)).toHaveText('Este bem possui histórico financeiro');
  await page.locator('#_av_dlg .av-dialog-actions button', { hasText: 'Voltar' }).click();

  expect(await lerEstado(page, 'D.patrimonios.length')).toBe(1);
  expect(await lerEstado(page, RETRATO)).toBe(antes);
});

test('financiamento ativo: bloqueia e a dívida fica intacta', async ({ page }) => {
  await abrirAppEmDemo(page);
  await semear(page, { debts: [FINANCIAMENTO] });

  const antes = await lerEstado(page, RETRATO);
  const saldoAntes = await page.evaluate(() => window._debtSaldo(window.getDebt('d-fin')));

  await excluirPeloMenu(page, PAT_ID);
  await expect(msgDlg(page)).toContainText('1 financiamento');
  await page.locator('#_av_dlg .av-dialog-actions button', { hasText: 'Voltar' }).click();

  const d = await lerEstado(page, "D.debts.find(x => x.id === 'd-fin')");
  expect(d.id).toBe('d-fin');
  expect(d.patrimonioId).toBe(PAT_ID);
  expect(d.valorOriginal).toBe(200000);
  expect(await page.evaluate(() => window._debtSaldo(window.getDebt('d-fin')))).toBe(saldoAntes);
  expect(await lerEstado(page, 'D.debtPayments.length')).toBe(0);
  expect(await lerEstado(page, 'D.patrimonios.length')).toBe(1);
  expect(await lerEstado(page, RETRATO)).toBe(antes);
});

test('financiamento QUITADO: histórico ainda impede a exclusão', async ({ page }) => {
  await abrirAppEmDemo(page);
  await semear(page, { debts: [FIN_QUITADO] });
  expect(await page.evaluate(() => window._debtSaldo(window.getDebt('d-quit')))).toBe(0);

  const antes = await lerEstado(page, RETRATO);
  await excluirPeloMenu(page, PAT_ID);
  await expect(msgDlg(page)).toContainText('1 financiamento');
  await page.locator('#_av_dlg .av-dialog-actions button', { hasText: 'Voltar' }).click();

  expect(await lerEstado(page, 'D.patrimonios.length')).toBe(1);
  expect(await lerEstado(page, RETRATO)).toBe(antes);
});

test('despesa de uso: bloqueia sem desfazer o vínculo nem virar consumo solto', async ({ page }) => {
  await abrirAppEmDemo(page);
  await semear(page, { expenses: [DESPESA_USO] });
  const antes = await lerEstado(page, RETRATO);

  await excluirPeloMenu(page, PAT_ID);
  await expect(msgDlg(page)).toContainText('1 lançamento vinculado');
  await page.locator('#_av_dlg .av-dialog-actions button', { hasText: 'Voltar' }).click();

  const e = await lerEstado(page, "D.expenses.find(x => x.id === 'e-uso')");
  expect(e.patrimonioId).toBe(PAT_ID);
  expect(await page.evaluate(() => window._movementNature(window.eval("D.expenses.find(x => x.id === 'e-uso')")))).toBe('consumo');
  expect(await lerEstado(page, RETRATO)).toBe(antes);
});

test('pendência vinculada: bloqueia', async ({ page }) => {
  await abrirAppEmDemo(page);
  await semear(page, { pendencias: [{ id: 'pend-1', titulo: 'Pendencia Teste', status: 'aberta', patrimonioId: PAT_ID }] });
  const antes = await lerEstado(page, RETRATO);

  await excluirPeloMenu(page, PAT_ID);
  await expect(msgDlg(page)).toContainText('1 pendência');
  await page.locator('#_av_dlg .av-dialog-actions button', { hasText: 'Voltar' }).click();

  expect(await lerEstado(page, 'D.patrimonios.length')).toBe(1);
  expect(await lerEstado(page, RETRATO)).toBe(antes);
});

test('vários vínculos: um motivo por tipo, sem repetição', async ({ page }) => {
  await abrirAppEmDemo(page);
  await semear(page, {
    expenses: [AQUISICAO, DESPESA_USO],
    debts: [FINANCIAMENTO],
    pendencias: [{ id: 'pend-1', titulo: 'Pendencia Teste', status: 'aberta', patrimonioId: PAT_ID }],
  });

  await excluirPeloMenu(page, PAT_ID);
  const texto = await msgDlg(page).textContent();
  expect(texto).toContain('1 aquisição');
  expect(texto).toContain('1 financiamento');
  expect(texto).toContain('1 lançamento vinculado');
  expect(texto).toContain('1 pendência');
  expect(texto.match(/aquisição/g).length).toBe(1);
  expect(texto.match(/financiamento/g).length).toBe(1);
});

// ══ O QUE NÃO PODE TER MUDADO ════════════════════════════════════════════

test('bem sem vínculo continua sendo excluído normalmente', async ({ page }) => {
  await abrirAppEmDemo(page);
  await semear(page, {});

  await excluirPeloMenu(page, PAT_ID);
  await expect(tituloDlg(page)).toHaveText('Excluir patrimônio');
  await page.locator('#_av_dlg .av-dialog-actions button', { hasText: 'Excluir' }).click();

  expect(await lerEstado(page, 'D.patrimonios.length')).toBe(0);
});

test('bem sem vínculo: o botão do formulário também exclui', async ({ page }) => {
  await abrirAppEmDemo(page);
  await semear(page, {});

  await excluirPeloFormulario(page, PAT_ID);
  await expect(tituloDlg(page)).toHaveText('Excluir patrimônio');
  await page.locator('#_av_dlg .av-dialog-actions button', { hasText: 'Excluir' }).click();

  expect(await lerEstado(page, 'D.patrimonios.length')).toBe(0);
});

test('cancelar a exclusão limpa não apaga nada', async ({ page }) => {
  await abrirAppEmDemo(page);
  await semear(page, {});
  const antes = await lerEstado(page, RETRATO);

  await excluirPeloMenu(page, PAT_ID);
  await page.locator('#_av_dlg .av-dialog-actions button', { hasText: 'Cancelar' }).click();

  expect(await lerEstado(page, 'D.patrimonios.length')).toBe(1);
  expect(await lerEstado(page, RETRATO)).toBe(antes);
});

test('veículo sem vínculo continua excluível pelo menu', async ({ page }) => {
  await abrirAppEmDemo(page);
  await semearDados(page, { ...LIMPO, vehicles: [VEICULO] }, 'inicio');

  await page.evaluate(() => { window._vehMenuTarget = 'veh-teste'; window.vehMenuDelete(); });
  await dialogo(page).waitFor({ state: 'visible' });
  await expect(tituloDlg(page)).toHaveText('Excluir veículo');
  await page.locator('#_av_dlg .av-dialog-actions button', { hasText: 'Excluir' }).click();

  expect(await lerEstado(page, 'D.vehicles.length')).toBe(0);
});

test('veículo com histórico continua bloqueado, como antes', async ({ page }) => {
  await abrirAppEmDemo(page);
  await semearDados(page, {
    ...LIMPO,
    vehicles: [{ ...VEICULO, history: [{ id: 'h1', date: '2026-05-01', type: 'evento', note: 'Revisao Teste' }] }],
  }, 'inicio');
  const antes = await lerEstado(page, RETRATO);

  await page.evaluate(() => { window._vehMenuTarget = 'veh-teste'; window.vehMenuDelete(); });
  await dialogo(page).waitFor({ state: 'visible' });
  await expect(tituloDlg(page)).toHaveText('Este bem possui histórico financeiro');
  await page.locator('#_av_dlg .av-dialog-actions button', { hasText: 'Voltar' }).click();

  expect(await lerEstado(page, 'D.vehicles.length')).toBe(1);
  expect(await lerEstado(page, RETRATO)).toBe(antes);
});

test('INVARIANTE: nenhuma tentativa bloqueada deixa lançamento ou dívida órfãos', async ({ page }) => {
  await abrirAppEmDemo(page);
  await semear(page, { expenses: [AQUISICAO, DESPESA_USO], debts: [FINANCIAMENTO] });

  await excluirPeloMenu(page, PAT_ID);
  await page.locator('#_av_dlg .av-dialog-actions button', { hasText: 'Voltar' }).click();
  await excluirPeloFormulario(page, PAT_ID);
  await page.locator('#_av_dlg .av-dialog-actions button', { hasText: 'Voltar' }).click();

  const orfaos = await page.evaluate(() => {
    const existe = id => !!id && ((window.eval('D').patrimonios || []).some(p => p.id === id) || (window.eval('D').vehicles || []).some(v => v.id === id));
    const D = window.eval('D');
    return {
      despesas: (D.expenses || []).filter(e => e.patrimonioId && !existe(e.patrimonioId)).length,
      dividas: (D.debts || []).filter(d => d.patrimonioId && !existe(d.patrimonioId)).length,
    };
  });
  expect(orfaos.despesas).toBe(0);
  expect(orfaos.dividas).toBe(0);
});

// ══ VISUAL ═══════════════════════════════════════════════════════════════

test.describe('visual do bloqueio', () => {
  for (const tema of ['light', 'dark']) {
    for (const largura of [320, 375, 390, 430]) {
      test(`diálogo de bloqueio em ${tema} @ ${largura}px`, async ({ page }) => {
        await page.setViewportSize({ width: largura, height: 900 });
        await page.emulateMedia({ colorScheme: tema });
        await abrirAppEmDemo(page);
        await semear(page, {
          expenses: [AQUISICAO, DESPESA_USO],
          debts: [FINANCIAMENTO],
          pendencias: [{ id: 'pend-1', titulo: 'Pendencia Teste', status: 'aberta', patrimonioId: PAT_ID }],
        });

        await excluirPeloMenu(page, PAT_ID);
        await expect(page.locator('html')).toHaveAttribute('data-theme', tema);

        const cx = page.locator('#_av_dlg .av-dialog');
        const cxBox = await cx.boundingBox();
        expect(cxBox.width).toBeLessThanOrEqual(largura);
        // Nada transborda na horizontal, nem a mensagem longa dos quatro motivos.
        expect(await cx.evaluate(n => n.scrollWidth > n.clientWidth + 1), 'o diálogo transbordou').toBe(false);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

        // Os dois botões cabem e continuam tocáveis (alvo mínimo de 40px).
        for (const rotulo of ['Voltar', 'Marcar como vendido']) {
          const b = page.locator('#_av_dlg .av-dialog-actions button', { hasText: rotulo });
          const box = await b.boundingBox();
          expect(box.height, `${rotulo} ficou pequeno demais`).toBeGreaterThanOrEqual(40);
          expect(box.x).toBeGreaterThanOrEqual(0);
          expect(box.x + box.width).toBeLessThanOrEqual(largura + 1);
        }

        // A mensagem não pode ficar cortada nem sob os botões.
        const msg = page.locator('#_av_dlg .av-dialog-msg');
        expect(await msg.evaluate(n => n.scrollHeight <= n.clientHeight + 1), 'a mensagem ficou cortada').toBe(true);
        const mBox = await msg.boundingBox();
        const aBox = await page.locator('#_av_dlg .av-dialog-actions').boundingBox();
        expect(mBox.y + mBox.height).toBeLessThanOrEqual(aBox.y + 1);

        await page.screenshot({ path: `${PASTA}/bloqueio-${tema}-${largura}.png` });
      });
    }
  }
});
