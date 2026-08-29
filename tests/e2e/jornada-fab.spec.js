// Jornada especial "+" → Compromissos em aberto → fluxo canônico.
//
// Defeito corrigido aqui (P2): o FAB vive em z-index 70, sob as folhas (100), e
// os botões de confirmar passam por cima da área dele. `closeOverlay` tira
// `pointer-events` na hora, mas a folha ainda leva ~0,22s sumindo — então o
// toque que confirmava a quitação chegava ao FAB e reabria "Novo lançamento"
// vazio, convidando o usuário a lançar a MESMA saída outra vez, à mão.
//
// O que estes specs protegem:
//
//   1. durante toda a jornada o FAB fica oculto — não há alvo clicável embaixo
//      de folha nenhuma, em nenhuma largura;
//   2. o toque fantasma no ponto do botão de confirmar não abre o formulário
//      manual e não cria uma segunda despesa;
//   3. terminada a jornada, o FAB volta — depois que a transição acabou;
//   4. o caminho "Registrar" da pendência continua abrindo o formulário
//      pré-preenchido, sem faixa de compromissos.
import { test, expect } from '@playwright/test';
import { abrirAppEmDemo, semearDados, lerEstado, esperarOverlay } from './_helpers.js';

const DIVIDA = {
  id: 'divida-teste', titulo: 'Financiamento Teste', tipo: 'financiamento',
  credor: 'Banco Teste', valorOriginal: 6500, valorParcela: 200, parcelasTotal: 30,
  amortizadoInicial: 0, dataInicio: '2026-01-10', periodicidade: 'mensal', status: 'ativa',
};
const FIXO = { id: 'fixo-net', name: 'Internet Teste', amount: 99.9, category: 'Contas', dueDay: 10, since: '2026-01-01' };
const FIXO2 = { id: 'fixo-str', name: 'Streaming Teste', amount: 29.9, category: 'Serviços', dueDay: 12, since: '2026-01-01' };
const PENDENCIA = { id: 'pend-rev', title: 'Revisão Teste', category: 'veiculo', priority: 'media', deadline: '2026-06-30', estimatedValue: 450, status: 'aberta', createdAt: '2026-06-01' };

const LIMPO = {
  incomeItems: [], dailyIncome: {}, expenses: [], debtPayments: [], fixedPayments: [],
  debts: [], fixedExpenses: [], pendencias: [], vehicles: [], patrimonios: [],
};

const fab = page => page.locator('#global-fab');

/** Retângulo que o FAB OCUPARIA na viewport.
 *  Corrigido o defeito ele está `display:none`, e um elemento oculto devolve
 *  rect zerado — então derivamos a posição do CSS (right/bottom/tamanho fixos)
 *  para continuar provando que o cenário perigoso existe. */
const retanguloDoFab = page => page.evaluate(() => {
  const cs = getComputedStyle(document.getElementById('global-fab'));
  const w = parseFloat(cs.width), h = parseFloat(cs.height);
  const left = window.innerWidth - parseFloat(cs.right) - w;
  const top = window.innerHeight - parseFloat(cs.bottom) - h;
  return { left, top, right: left + w, bottom: top + h };
});

/** Toca no CENTRO do retângulo do FAB.
 *
 *  Antes, o botão de confirmar da folha caía por cima do FAB, e tocar no botão
 *  já era tocar no FAB — a sobreposição vinha de graça. Com o FAB pousado na
 *  ponta da pílula de navegação, a folha não o cobre mais, e um toque no botão
 *  de confirmar não prova mais nada sobre ele.
 *
 *  Então o toque fantasma passa a ser mirado: bate exatamente onde o "+" está.
 *  Isso é mais forte que a pré-condição antiga, que dependia de duas caixas se
 *  encontrarem por acaso — aqui o cenário perigoso é construído de propósito. */
async function tocarSobreOFab(page) {
  const f = await retanguloDoFab(page);
  const x = (f.left + f.right) / 2, y = (f.top + f.bottom) / 2;
  await page.mouse.click(x, y);
  return { x, y };
}

/** Nenhum item da barra mora sob o FAB — senão o toque fantasma trocaria de
 *  aba em vez de abrir o "+", e o teste passaria pelo motivo errado. */
async function navLivreSobOFab(page) {
  const f = await retanguloDoFab(page);
  return page.evaluate(({ left, top, right, bottom }) => {
    return [...document.querySelectorAll('.bottom-nav .nav-item')].every(el => {
      const b = el.getBoundingClientRect();
      return b.right < left || b.left > right || b.bottom < top || b.top > bottom;
    });
  }, f);
}
const RESUMO = `({
  despesas: D.expenses.length,
  manuais: D.expenses.filter(e => !e.meta || !e.meta.source).length,
  deDivida: D.expenses.filter(e => e.meta && e.meta.source === 'debt').length,
  deFixo: D.expenses.filter(e => e.meta && e.meta.source === 'fixed-payment').length,
  dePendencia: D.expenses.filter(e => e.meta && e.meta.source === 'pendencia').length,
  debtPayments: D.debtPayments.length,
  fixedPayments: D.fixedPayments.length,
})`;

/** "+" → faixa → folha → item. Deixa o fluxo canônico aberto. */
async function irAteOCompromisso(page, dados, titulo) {
  await semearDados(page, { ...LIMPO, ...dados }, 'inicio');
  await page.locator('#global-fab').click();
  await esperarOverlay(page, 'modal-quick-add', true);
  await page.locator('#qa-compr-slot .qa-compr').click();
  await esperarOverlay(page, 'modal-obrigacoes', true);
  await page.locator('#obr-lista .obr-item', { hasText: titulo }).click();
}

/** Clica num ponto absoluto da viewport (não no elemento) — é assim que um
 *  toque fantasma se comporta: mesmo ponto, alvo já trocado. */
async function tocarNoPonto(page, seletor) {
  const b = await page.locator(seletor).boundingBox();
  const x = b.x + b.width / 2, y = b.y + b.height / 2;
  await page.mouse.click(x, y);
  return { x, y };
}

// ── O teste que falhava antes da correção ─────────────────────────────────

test('REGRESSÃO fixo: toque fantasma no "Dar baixa" não abre o + nem duplica', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await abrirAppEmDemo(page);
  await irAteOCompromisso(page, { fixedExpenses: [FIXO, FIXO2] }, 'Internet Teste');
  await esperarOverlay(page, 'modal-baixa', true);
  await page.locator('#baixa-confirm-btn').scrollIntoViewIfNeeded();

  // Durante a folha o FAB fica oculto — é essa a guarda que protege a jornada.
  await expect(fab(page)).toBeHidden();
  expect(await navLivreSobOFab(page), 'um item da barra mora sob o FAB').toBe(true);

  await tocarNoPonto(page, '#baixa-confirm-btn');                 // confirma a baixa
  await esperarOverlay(page, 'modal-baixa', false);
  // Toques fantasma MIRADOS no "+", com a folha ainda desaparecendo.
  const ponto = await tocarSobreOFab(page);
  await page.mouse.click(ponto.x, ponto.y);

  await expect(page.locator('#modal-quick-add')).not.toHaveClass(/open/);
  const r = await lerEstado(page, RESUMO);
  expect(r).toMatchObject({ despesas: 1, deFixo: 1, manuais: 0, fixedPayments: 1, debtPayments: 0 });

  // Terminada a transição, o FAB volta normalmente.
  await expect(fab(page)).toBeVisible();
  await expect(page.locator('.overlay.open')).toHaveCount(0);
});

test('REGRESSÃO dívida: toque fantasma no "Registrar" não abre o + nem duplica', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await abrirAppEmDemo(page);
  await irAteOCompromisso(page, { debts: [DIVIDA] }, 'Financiamento Teste');
  await esperarOverlay(page, 'debt-pay-sheet', true);
  await page.locator('#debt-pay-valor').fill('200');
  await page.locator('#debt-pay-data').fill('15/06/2026');
  await page.locator('#debt-pay-save').scrollIntoViewIfNeeded();

  await expect(fab(page)).toBeHidden();
  expect(await navLivreSobOFab(page), 'um item da barra mora sob o FAB').toBe(true);

  await tocarNoPonto(page, '#debt-pay-save');
  await esperarOverlay(page, 'debt-pay-sheet', false);
  const ponto = await tocarSobreOFab(page);
  await page.mouse.click(ponto.x, ponto.y);

  await expect(page.locator('#modal-quick-add')).not.toHaveClass(/open/);
  const r = await lerEstado(page, RESUMO);
  expect(r).toMatchObject({ despesas: 1, deDivida: 1, manuais: 0, debtPayments: 1, fixedPayments: 0 });
  const saldo = await page.evaluate(() => window._debtSaldo(window.getDebt('divida-teste')));
  expect(saldo).toBe(6300);

  await expect(fab(page)).toBeVisible();
  await expect(page.locator('.overlay.open')).toHaveCount(0);
});

// ── FAB oculto ao longo de toda a jornada ─────────────────────────────────

test('o FAB fica oculto do "+" até o fim do fluxo do fixo', async ({ page }) => {
  await abrirAppEmDemo(page);
  await semearDados(page, { ...LIMPO, fixedExpenses: [FIXO] }, 'inicio');
  await expect(fab(page)).toBeVisible();                    // origem

  await page.locator('#global-fab').click();
  await esperarOverlay(page, 'modal-quick-add', true);
  await expect(fab(page)).toBeHidden();                     // "+" aberto

  await page.locator('#qa-compr-slot .qa-compr').click();
  await esperarOverlay(page, 'modal-obrigacoes', true);
  await expect(fab(page)).toBeHidden();                     // folha
  expect(await lerEstado(page, '_jornadaCompromisso')).toBe(true);

  await page.locator('#obr-lista .obr-item').first().click();
  await esperarOverlay(page, 'modal-baixa', true);
  await expect(fab(page)).toBeHidden();                     // baixa

  await page.locator('#baixa-confirm-btn').click();
  await esperarOverlay(page, 'modal-baixa', false);
  await expect(fab(page)).toBeVisible();                    // fim seguro
  expect(await lerEstado(page, '_jornadaCompromisso')).toBe(false);
});

test('o FAB fica oculto do "+" até o fim do fluxo da dívida', async ({ page }) => {
  await abrirAppEmDemo(page);
  await irAteOCompromisso(page, { debts: [DIVIDA] }, 'Financiamento Teste');
  await esperarOverlay(page, 'debt-pay-sheet', true);
  await expect(fab(page)).toBeHidden();
  await page.locator('#debt-pay-valor').fill('200');
  await page.locator('#debt-pay-data').fill('15/06/2026');
  await page.locator('#debt-pay-save').click();
  await esperarOverlay(page, 'debt-pay-sheet', false);
  await expect(fab(page)).toBeVisible();
  expect(await lerEstado(page, '_jornadaCompromisso')).toBe(false);
});

// ── Pendência: os dois comportamentos preservados ─────────────────────────

test('pendência "Não": encerra a jornada e volta à origem', async ({ page }) => {
  await abrirAppEmDemo(page);
  await irAteOCompromisso(page, { pendencias: [PENDENCIA] }, 'Revisão Teste');
  await expect(page.locator('#_av_dlg')).toBeVisible();
  await expect(fab(page)).toBeHidden();

  await page.locator('#_av_dlg').getByRole('button', { name: 'Não' }).click();
  await expect(fab(page)).toBeVisible();
  await expect(page.locator('#modal-quick-add')).not.toHaveClass(/open/);
  expect(await lerEstado(page, '_jornadaCompromisso')).toBe(false);
  expect(await lerEstado(page, 'D.pendencias[0].status')).toBe('concluida');
  expect(await lerEstado(page, 'D.expenses.length')).toBe(0);
});

test('pendência "Registrar": abre o formulário pré-preenchido, sem faixa e sem FAB', async ({ page }) => {
  await abrirAppEmDemo(page);
  await irAteOCompromisso(page, { pendencias: [PENDENCIA], fixedExpenses: [FIXO] }, 'Revisão Teste');
  await page.locator('#_av_dlg').getByRole('button', { name: 'Registrar' }).click();
  await esperarOverlay(page, 'modal-quick-add', true);

  await expect(page.locator('#qa-amt-input')).toHaveValue('450');
  await expect(page.locator('#qa-desc')).toHaveValue('Revisão Teste');
  await expect(page.locator('#qa-btn-gas')).toHaveClass(/active/);
  // Nenhuma jornada especial dentro da jornada: a faixa não aparece aqui.
  await expect(page.locator('#qa-compr-slot .qa-compr')).toHaveCount(0);
  await expect(fab(page)).toBeHidden();
  // Nada gravado antes do Salvar.
  expect(await lerEstado(page, 'D.expenses.length')).toBe(0);

  await page.locator('#qa-save-btn').click();
  await esperarOverlay(page, 'modal-quick-add', false);
  const r = await lerEstado(page, RESUMO);
  // A despesa nasce VINCULADA à pendência (não é mais um gasto manual solto):
  // é o vínculo que permite reabrir a pendência se o lançamento for excluído.
  expect(r).toMatchObject({ despesas: 1, dePendencia: 1, manuais: 0, debtPayments: 0, fixedPayments: 0 });
  expect(await lerEstado(page, 'D.expenses[0].meta.pendenciaId')).toBe(await lerEstado(page, 'D.pendencias[0].id'));
  expect(await lerEstado(page, 'D.pendencias[0].despesaId')).toBe(await lerEstado(page, 'D.expenses[0].id'));
  await expect(fab(page)).toBeVisible();
  expect(await lerEstado(page, '_jornadaCompromisso')).toBe(false);
});

// ── Cancelamentos: destino preservado, FAB restaurado com segurança ───────

test('fechar a folha de compromissos encerra a jornada', async ({ page }) => {
  await abrirAppEmDemo(page);
  await semearDados(page, { ...LIMPO, fixedExpenses: [FIXO] }, 'inicio');
  await page.locator('#global-fab').click();
  await esperarOverlay(page, 'modal-quick-add', true);
  await page.locator('#qa-compr-slot .qa-compr').click();
  await esperarOverlay(page, 'modal-obrigacoes', true);

  await page.locator('#modal-obrigacoes').getByRole('button', { name: 'Fechar' }).click();
  await esperarOverlay(page, 'modal-obrigacoes', false);
  await expect(fab(page)).toBeVisible();
  expect(await lerEstado(page, '_jornadaCompromisso')).toBe(false);
  expect(await lerEstado(page, 'D.expenses.length')).toBe(0);
});

test('fechar a baixa sem confirmar encerra a jornada sem gravar', async ({ page }) => {
  await abrirAppEmDemo(page);
  await irAteOCompromisso(page, { fixedExpenses: [FIXO] }, 'Internet Teste');
  await esperarOverlay(page, 'modal-baixa', true);
  await page.evaluate(() => window.closeOverlay('modal-baixa'));
  await expect(fab(page)).toBeVisible();
  expect(await lerEstado(page, '_jornadaCompromisso')).toBe(false);
  const r = await lerEstado(page, RESUMO);
  expect(r).toMatchObject({ despesas: 0, fixedPayments: 0, debtPayments: 0 });
});

test('fechar o pagamento de dívida sem confirmar encerra a jornada sem gravar', async ({ page }) => {
  await abrirAppEmDemo(page);
  await irAteOCompromisso(page, { debts: [DIVIDA] }, 'Financiamento Teste');
  await esperarOverlay(page, 'debt-pay-sheet', true);
  await page.evaluate(() => window.closeOverlay('debt-pay-sheet'));
  await expect(fab(page)).toBeVisible();
  const r = await lerEstado(page, RESUMO);
  expect(r).toMatchObject({ despesas: 0, debtPayments: 0 });
});

test('reabrir o "+" depois da jornada volta a funcionar', async ({ page }) => {
  await abrirAppEmDemo(page);
  await irAteOCompromisso(page, { fixedExpenses: [FIXO, FIXO2] }, 'Internet Teste');
  await page.locator('#baixa-confirm-btn').click();
  await esperarOverlay(page, 'modal-baixa', false);
  await expect(fab(page)).toBeVisible();

  await page.locator('#global-fab').click();
  await esperarOverlay(page, 'modal-quick-add', true);
  await page.locator('#qa-btn-gas').click();
  await page.locator('#qa-amt-input').fill('40');
  await page.locator('#qa-desc').fill('Almoco Teste');
  await page.locator('#qa-save-btn').click();
  await esperarOverlay(page, 'modal-quick-add', false);
  const r = await lerEstado(page, RESUMO);
  expect(r).toMatchObject({ despesas: 2, manuais: 1, deFixo: 1, fixedPayments: 1 });
  await expect(fab(page)).toBeVisible();
});

// ── Nenhum FAB clicável sob os botões de confirmar, em qualquer largura ───

test.describe('sem alvo clicável embaixo das folhas', () => {
  for (const largura of [320, 375, 390, 430]) {
    test(`fixo @ ${largura}px`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 844 });
      await abrirAppEmDemo(page);
      await irAteOCompromisso(page, { fixedExpenses: [FIXO, FIXO2] }, 'Internet Teste');
      await esperarOverlay(page, 'modal-baixa', true);
      await page.locator('#baixa-confirm-btn').scrollIntoViewIfNeeded();

      const d = await page.evaluate(() => {
        const b = document.getElementById('baixa-confirm-btn').getBoundingClientRect();
        const f = document.getElementById('global-fab');
        const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
        const alvo = document.elementFromPoint(cx, cy);
        return {
          fabDisplay: getComputedStyle(f).display,
          alvoNoCentro: alvo ? (alvo.id || alvo.className) : null,
          alvoEhFab: !!(alvo && alvo.closest('#global-fab')),
        };
      });
      expect(d.fabDisplay, 'FAB visível sob a folha').toBe('none');
      expect(d.alvoEhFab, 'o botão de confirmar tem o FAB por baixo').toBe(false);

      await page.locator('#baixa-confirm-btn').click();
      await esperarOverlay(page, 'modal-baixa', false);
      await expect(fab(page)).toBeVisible();
      expect(await lerEstado(page, 'D.fixedPayments.length')).toBe(1);
    });

    test(`dívida @ ${largura}px`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 844 });
      await abrirAppEmDemo(page);
      await irAteOCompromisso(page, { debts: [DIVIDA] }, 'Financiamento Teste');
      await esperarOverlay(page, 'debt-pay-sheet', true);
      await page.locator('#debt-pay-save').scrollIntoViewIfNeeded();

      const d = await page.evaluate(() => {
        const b = document.getElementById('debt-pay-save').getBoundingClientRect();
        const alvo = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
        return {
          fabDisplay: getComputedStyle(document.getElementById('global-fab')).display,
          alvoEhFab: !!(alvo && alvo.closest('#global-fab')),
        };
      });
      expect(d.fabDisplay).toBe('none');
      expect(d.alvoEhFab).toBe(false);

      await page.locator('#debt-pay-valor').fill('200');
      await page.locator('#debt-pay-data').fill('15/06/2026');
      await page.locator('#debt-pay-save').click();
      await esperarOverlay(page, 'debt-pay-sheet', false);
      await expect(fab(page)).toBeVisible();
      expect(await lerEstado(page, 'D.debtPayments.length')).toBe(1);
    });
  }
});
