// Faixa de compromissos no formulário do "+".
//
// A faixa é um ATALHO, nunca uma etapa. O que estes specs protegem:
//
//   1. o caminho rápido continua rápido: sem compromissos o formulário é
//      exatamente o de antes, e com compromissos receita/gasto comum seguem no
//      mesmo número de toques, ignorando a faixa;
//   2. o resumo é derivado de `_obrigacoesEmAberto()` a cada abertura — sem
//      cache, sem estado persistido, sem regra financeira replicada;
//   3. o total nunca é apresentado como exato quando há valor estimado;
//   4. tocar na faixa entrega o controle ao fluxo do Commit 2: o "+" sai de
//      cena, o estado temporário é descartado e um Salvar atrasado não grava.
import { test, expect } from '@playwright/test';
import { abrirAppEmDemo, semearDados, lerEstado, esperarOverlay, esperarPosicaoEstavel } from './_helpers.js';

const PASTA = 'test-results/quick-add-faixa';

// Relógio dos testes: 15/06/2026 (definido em _helpers.js).
const DIVIDA = {
  id: 'divida-teste', titulo: 'Financiamento Teste', tipo: 'financiamento',
  credor: 'Banco Teste', valorOriginal: 6500, valorParcela: 200,
  parcelasTotal: 30, amortizadoInicial: 0,
  dataInicio: '2026-01-10', periodicidade: 'mensal', status: 'ativa',
};
const FIXO_ATRASADO  = { id: 'fixo-net', name: 'Internet Teste',  amount: 99.9, category: 'Contas',   dueDay: 10, since: '2026-01-01' };
const FIXO_A_VENCER  = { id: 'fixo-str', name: 'Streaming Teste', amount: 29.9, category: 'Serviços', dueDay: 28, since: '2026-01-01' };
const FIXO_A_VENCER2 = { id: 'fixo-aca', name: 'Academia Teste',  amount: 250,  category: 'Saúde',    dueDay: 25, since: '2026-01-01' };
const FIXO_A_VENCER3 = { id: 'fixo-nuv', name: 'Nuvem Teste',     amount: 49.9, category: 'Serviços', dueDay: 20, since: '2026-01-01' };
const PENDENCIA = { id: 'pend-rev', title: 'Revisão Teste', category: 'veiculo', priority: 'media', deadline: '2026-06-30', estimatedValue: 450, status: 'aberta', createdAt: '2026-06-01' };

// Zera todas as coleções que alimentam o resolvedor: o modo demo traz gastos
// fixos próprios, e cada teste precisa controlar a lista inteira.
const LIMPO = {
  incomeItems: [], dailyIncome: {}, expenses: [], debtPayments: [], fixedPayments: [],
  debts: [], fixedExpenses: [], pendencias: [],
};

// 2 atrasados de 4 compromissos; 200 + 99,90 + 29,90 + 450 (estimado) = 779,80.
const COM_ATRASO = {
  debts: [DIVIDA],
  fixedExpenses: [FIXO_ATRASADO, FIXO_A_VENCER],
  pendencias: [PENDENCIA],
};
// 3 compromissos, nenhum atrasado, nenhum estimado; 29,90 + 250 + 49,90 = 329,80.
const SEM_ATRASO = {
  fixedExpenses: [FIXO_A_VENCER, FIXO_A_VENCER2, FIXO_A_VENCER3],
};

const faixa = page => page.locator('#qa-compr-slot .qa-compr');

/** Semeia o cenário e abre o "+" como o usuário abre: pelo FAB. */
async function abrirMais(page, dados = {}) {
  await semearDados(page, { ...LIMPO, ...dados }, 'inicio');
  await page.locator('#global-fab').click();
  await esperarOverlay(page, 'modal-quick-add', true);
}

// ── O caminho rápido continua rápido ──────────────────────────────────────

test('sem compromissos, o formulário é exatamente o de antes', async ({ page }) => {
  await abrirAppEmDemo(page);
  await abrirMais(page);

  // Nada de faixa, placeholder ou mensagem.
  await expect(faixa(page)).toHaveCount(0);
  await expect(page.locator('#qa-compr-slot')).toBeHidden();

  // Prova de que o slot vazio não custa nem um pixel: a posição do toggle é a
  // mesma com o slot no DOM e com ele removido.
  await esperarPosicaoEstavel(page, '#modal-quick-add .sheet');
  const antes = await page.locator('#qa-type-toggle').boundingBox();
  await page.evaluate(() => document.getElementById('qa-compr-slot').remove());
  const depois = await page.locator('#qa-type-toggle').boundingBox();
  expect(depois.y).toBe(antes.y);
});

test('o + abre direto no formulário, sem launcher intermediário', async ({ page }) => {
  await abrirAppEmDemo(page);
  await abrirMais(page, COM_ATRASO);

  // Um único toque no FAB e os campos do lançamento já estão à mão.
  await expect(page.locator('#qa-type-toggle')).toBeVisible();
  await expect(page.locator('#qa-amt-input')).toBeVisible();
  await expect(page.locator('#qa-save-btn')).toBeVisible();
  await expect(page.locator('.overlay.open')).toHaveCount(1);
});

test('com a faixa presente, receita comum segue no mesmo número de toques', async ({ page }) => {
  await abrirAppEmDemo(page);
  await abrirMais(page, COM_ATRASO);
  await expect(faixa(page)).toBeVisible();

  // Sem tocar na faixa: valor → salvar. Receita é o tipo padrão na criação.
  await page.locator('#qa-amt-input').fill('180');
  await page.locator('#qa-save-btn').click();
  await esperarOverlay(page, 'modal-quick-add', false);

  const estado = await lerEstado(page, `({
    receitas: D.incomeItems.length + Object.keys(D.dailyIncome).length,
    despesas: D.expenses.length,
  })`);
  expect(estado.receitas).toBe(1);
  expect(estado.despesas, 'a faixa interferiu no lançamento comum').toBe(0);
});

test('com a faixa presente, gasto comum segue no mesmo número de toques', async ({ page }) => {
  await abrirAppEmDemo(page);
  await abrirMais(page, COM_ATRASO);

  await page.locator('#qa-btn-gas').click();
  await page.locator('#qa-amt-input').fill('42');
  await page.locator('#qa-desc').fill('Almoco Teste');
  await page.locator('#qa-save-btn').click();
  await esperarOverlay(page, 'modal-quick-add', false);

  const estado = await lerEstado(page, `({
    despesas: D.expenses.length,
    manuais: D.expenses.filter(e => !e.meta || !e.meta.source).length,
    pagamentos: D.debtPayments.length,
    marcadores: D.fixedPayments.length,
  })`);
  expect(estado.despesas).toBe(1);
  expect(estado.manuais).toBe(1);
  // Um gasto comum não pode encostar em dívida nem em fixo.
  expect(estado.pagamentos).toBe(0);
  expect(estado.marcadores).toBe(0);
});

// ── Conteúdo da faixa ─────────────────────────────────────────────────────

test('sem atraso: tratamento neutro e total exato', async ({ page }) => {
  await abrirAppEmDemo(page);
  await abrirMais(page, SEM_ATRASO);

  await expect(faixa(page)).toBeVisible();
  await expect(faixa(page)).not.toHaveClass(/qa-compr--atraso/);
  await expect(faixa(page).locator('.qa-compr-top')).toHaveText('3 compromissos em aberto');
  await expect(faixa(page).locator('.qa-compr-sub')).toHaveText('R$ 329,80');
});

test('com atraso: tratamento de atenção, contagem e total aproximado', async ({ page }) => {
  await abrirAppEmDemo(page);
  await abrirMais(page, COM_ATRASO);

  await expect(faixa(page)).toHaveClass(/qa-compr--atraso/);
  await expect(faixa(page).locator('.qa-compr-top')).toHaveText('2 atrasados · 4 compromissos em aberto');
  await expect(faixa(page).locator('.qa-compr-sub')).toHaveText('cerca de R$ 779,80');
});

test('um só compromisso, um só atrasado: texto no singular', async ({ page }) => {
  await abrirAppEmDemo(page);
  await abrirMais(page, { fixedExpenses: [FIXO_ATRASADO] });

  await expect(faixa(page).locator('.qa-compr-top')).toHaveText('1 atrasado · 1 compromisso em aberto');
  await expect(faixa(page).locator('.qa-compr-sub')).toHaveText('R$ 99,90');
});

test('valor estimado deixa o total aproximado mesmo sem atraso', async ({ page }) => {
  await abrirAppEmDemo(page);
  await abrirMais(page, { fixedExpenses: [FIXO_A_VENCER], pendencias: [PENDENCIA] });

  await expect(faixa(page)).not.toHaveClass(/qa-compr--atraso/);
  await expect(faixa(page).locator('.qa-compr-top')).toHaveText('2 compromissos em aberto');
  await expect(faixa(page).locator('.qa-compr-sub')).toHaveText('cerca de R$ 479,90');
});

test('sem estimativa o total é apresentado como exato', async ({ page }) => {
  await abrirAppEmDemo(page);
  await abrirMais(page, { debts: [DIVIDA], fixedExpenses: [FIXO_ATRASADO] });

  await expect(faixa(page).locator('.qa-compr-sub')).toHaveText('R$ 299,90');
});

test('a faixa fica acima do toggle Receita/Gasto', async ({ page }) => {
  await abrirAppEmDemo(page);
  await abrirMais(page, COM_ATRASO);

  await esperarPosicaoEstavel(page, '#modal-quick-add .sheet');
  const caixaFaixa = await faixa(page).boundingBox();
  const caixaToggle = await page.locator('#qa-type-toggle').boundingBox();
  expect(caixaFaixa.y + caixaFaixa.height).toBeLessThanOrEqual(caixaToggle.y + 1);

  // E o campo principal continua logo abaixo do toggle, não empurrado para longe.
  const caixaValor = await page.locator('#qa-amt-input').boundingBox();
  expect(caixaValor.y).toBeGreaterThan(caixaToggle.y);
  expect(caixaValor.y - (caixaToggle.y + caixaToggle.height)).toBeLessThan(60);
});

test('a faixa não vaza id, nome interno de fluxo nem metadado', async ({ page }) => {
  await abrirAppEmDemo(page);
  await abrirMais(page, COM_ATRASO);

  const html = await page.locator('#qa-compr-slot').innerHTML();
  for (const proibido of ['debt-pay', 'fixed-baixa', 'pendencia-concluir', 'divida-teste',
                          'fixo-net', 'pend-rev', 'meta.source', 'asset-acquisition', 'valorSugerido']) {
    expect(html, `vazou "${proibido}"`).not.toContain(proibido);
  }
});

test('a faixa não aparece na edição de um lançamento existente', async ({ page }) => {
  await abrirAppEmDemo(page);
  await semearDados(page, {
    ...LIMPO,
    fixedExpenses: [FIXO_ATRASADO],
    expenses: [{ id: 'exp-manual', date: '2026-06-14', amount: 40, description: 'Almoco Teste', category: 'Alimentação' }],
  }, 'inicio');

  await page.evaluate(() => window.openQuickAdd({ kind: 'exp', id: 'exp-manual' }));
  await esperarOverlay(page, 'modal-quick-add', true);
  await expect(page.locator('#qa-title')).toHaveText('Editar lançamento');
  await expect(faixa(page)).toHaveCount(0);
});

// ── Estado corrente, sempre recalculado ───────────────────────────────────

test('a faixa reflete o estado a cada abertura, sem recarregar a página', async ({ page }) => {
  await abrirAppEmDemo(page);
  await abrirMais(page, { fixedExpenses: [FIXO_ATRASADO, FIXO_A_VENCER, FIXO_A_VENCER2] });
  await expect(faixa(page).locator('.qa-compr-top')).toHaveText('1 atrasado · 3 compromissos em aberto');

  // Sai de um compromisso pelo fluxo canônico...
  await faixa(page).click();
  await esperarOverlay(page, 'modal-obrigacoes', true);
  await page.locator('#obr-lista .obr-item').first().click();
  await esperarOverlay(page, 'modal-baixa', true);
  await page.locator('#baixa-confirm-btn').click();
  await esperarOverlay(page, 'modal-baixa', false);

  // ...e reabre o "+": a faixa já mostra 2, sem atraso.
  await page.locator('#global-fab').click();
  await esperarOverlay(page, 'modal-quick-add', true);
  await expect(faixa(page).locator('.qa-compr-top')).toHaveText('2 compromissos em aberto');
  await expect(faixa(page)).not.toHaveClass(/qa-compr--atraso/);
  await expect(faixa(page).locator('.qa-compr-sub')).toHaveText('R$ 279,90');
});

test('quitado o último compromisso, a faixa desaparece por completo', async ({ page }) => {
  await abrirAppEmDemo(page);
  await abrirMais(page, { fixedExpenses: [FIXO_ATRASADO] });
  await expect(faixa(page)).toBeVisible();

  await faixa(page).click();
  await page.locator('#obr-lista .obr-item').first().click();
  await esperarOverlay(page, 'modal-baixa', true);
  await page.locator('#baixa-confirm-btn').click();
  await esperarOverlay(page, 'modal-baixa', false);

  await page.locator('#global-fab').click();
  await esperarOverlay(page, 'modal-quick-add', true);
  await expect(faixa(page)).toHaveCount(0);
  await expect(page.locator('#qa-compr-slot')).toBeHidden();
});

// ── Toque na faixa: entrega ao fluxo do Commit 2 ──────────────────────────

test('tocar na faixa fecha o + e abre a folha, com um único overlay', async ({ page }) => {
  await abrirAppEmDemo(page);
  await abrirMais(page, COM_ATRASO);

  await faixa(page).click();
  await esperarOverlay(page, 'modal-quick-add', false);
  await esperarOverlay(page, 'modal-obrigacoes', true);
  await expect(page.locator('.overlay.open')).toHaveCount(1);
  await expect(page.locator('#obr-lista .obr-item')).toHaveCount(4);
});

test('o preenchimento em curso é descartado e um Salvar atrasado não grava', async ({ page }) => {
  await abrirAppEmDemo(page);
  await abrirMais(page, COM_ATRASO);

  await page.locator('#qa-btn-gas').click();
  await page.locator('#qa-amt-input').fill('200');
  await page.locator('#qa-desc').fill('Parcela do carro');

  await faixa(page).click();
  await esperarOverlay(page, 'modal-obrigacoes', true);

  await page.evaluate(() => window.qaConfirm());
  expect(await lerEstado(page, 'D.expenses.length'), 'gravou despesa manual paralela').toBe(0);
  expect(await lerEstado(page, '_qaEdit')).toBeNull();
});

test('da faixa ao pagamento da dívida: um registro só, pelo fluxo canônico', async ({ page }) => {
  await abrirAppEmDemo(page);
  await abrirMais(page, { debts: [DIVIDA] });

  await faixa(page).click();
  await page.locator('#obr-lista .obr-item').first().click();
  await esperarOverlay(page, 'debt-pay-sheet', true);

  // O fluxo pré-preenche a data com o vencimento da parcela (janeiro); aqui o
  // pagamento é feito hoje, para conferir o efeito no caixa do mês corrente.
  await page.locator('#debt-pay-valor').fill('200');
  await page.locator('#debt-pay-data').fill('15/06/2026');
  await page.locator('#debt-pay-save').click();
  await esperarOverlay(page, 'debt-pay-sheet', false);

  const estado = await lerEstado(page, `({
    despesas: D.expenses.length,
    deDivida: D.expenses.filter(e => e.meta && e.meta.source === 'debt').length,
    manuais: D.expenses.filter(e => !e.meta || !e.meta.source).length,
    pagamentos: D.debtPayments.length,
  })`);
  expect(estado.despesas).toBe(1);
  expect(estado.deDivida).toBe(1);
  expect(estado.manuais, 'apareceu despesa manual paralela').toBe(0);
  expect(estado.pagamentos).toBe(1);

  const resumo = await page.evaluate(() => window._monthMovementSummary(0));
  expect(resumo.debtPayments).toBe(200);
  expect(resumo.consumo).toBe(0);
  expect(resumo.totalCashOut).toBe(200);
});

test('saindo pela faixa, o FAB volta quando o fluxo termina', async ({ page }) => {
  await abrirAppEmDemo(page);
  await abrirMais(page, COM_ATRASO);
  await expect(page.locator('#global-fab')).toBeHidden();

  await faixa(page).click();
  await esperarOverlay(page, 'modal-obrigacoes', true);
  await page.evaluate(() => window.closeOverlay('modal-obrigacoes'));

  await expect(page.locator('#global-fab')).toBeVisible();
  // E o "+" volta a funcionar normalmente depois disso.
  await page.locator('#global-fab').click();
  await esperarOverlay(page, 'modal-quick-add', true);
  await page.locator('#qa-amt-input').fill('75');
  await page.locator('#qa-save-btn').click();
  await esperarOverlay(page, 'modal-quick-add', false);
  expect(await lerEstado(page, 'D.incomeItems.length + Object.keys(D.dailyIncome).length')).toBe(1);
});

test('duplo toque na faixa não empilha folhas', async ({ page }) => {
  await abrirAppEmDemo(page);
  await abrirMais(page, COM_ATRASO);

  await faixa(page).click();
  await page.evaluate(() => window.abrirCompromissos()); // segundo toque atrasado
  await esperarOverlay(page, 'modal-obrigacoes', true);
  await expect(page.locator('.overlay.open')).toHaveCount(1);
  await expect(page.locator('#obr-lista .obr-item')).toHaveCount(4);
});

test('abrir o + com compromissos não emite erro de console', async ({ page }) => {
  const erros = await abrirAppEmDemo(page);
  await abrirMais(page, COM_ATRASO);
  await faixa(page).click();
  await esperarOverlay(page, 'modal-obrigacoes', true);
  expect(erros).toEqual([]);
});

// ── Visual ────────────────────────────────────────────────────────────────

test.describe('visual da faixa', () => {
  const LARGURAS = [320, 375, 390, 430];

  for (const tema of ['light', 'dark']) {
    for (const largura of LARGURAS) {
      test(`faixa legível em ${tema} @ ${largura}px`, async ({ page }) => {
        await page.setViewportSize({ width: largura, height: 900 });
        await page.emulateMedia({ colorScheme: tema });
        await abrirAppEmDemo(page);
        await abrirMais(page, COM_ATRASO);

        await expect(page.locator('html')).toHaveAttribute('data-theme', tema);
        const el = faixa(page);
        await expect(el).toBeVisible();

        // Sem transbordo horizontal, e o toque cobre a faixa inteira.
        const transbordou = await el.evaluate(n => n.scrollWidth > n.clientWidth + 1);
        expect(transbordou, 'a faixa transbordou na horizontal').toBe(false);
        const folha = page.locator('#modal-quick-add .sheet');
        expect(await folha.evaluate(n => n.scrollWidth > n.clientWidth + 1)).toBe(false);

        await esperarPosicaoEstavel(page, '#modal-quick-add .sheet');
        const caixaFaixa = await el.boundingBox();
        const caixaFolha = await folha.boundingBox();
        expect(caixaFaixa.width).toBeGreaterThan(caixaFolha.width * 0.8);

        // Nem chevron escondido, nem fonte reduzida a ponto de virar legenda.
        await expect(el.locator('.qa-compr-chev svg')).toBeVisible();
        const fonte = await el.locator('.qa-compr-top').evaluate(n => parseFloat(getComputedStyle(n).fontSize));
        expect(fonte).toBeGreaterThanOrEqual(12);

        await folha.screenshot({ path: `${PASTA}/faixa-atraso-${tema}-${largura}.png` });
      });
    }
  }

  for (const tema of ['light', 'dark']) {
    test(`faixa neutra (sem atraso) em ${tema} @ 390px`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 900 });
      await page.emulateMedia({ colorScheme: tema });
      await abrirAppEmDemo(page);
      await abrirMais(page, SEM_ATRASO);

      await expect(faixa(page)).not.toHaveClass(/qa-compr--atraso/);
      await esperarPosicaoEstavel(page, '#modal-quick-add .sheet');
      await page.locator('#modal-quick-add .sheet').screenshot({ path: `${PASTA}/faixa-neutra-${tema}-390.png` });
    });
  }

  test('formulário sem faixa em 390px (referência do caminho rápido)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await abrirAppEmDemo(page);
    await abrirMais(page);
    await expect(faixa(page)).toHaveCount(0);
    await esperarPosicaoEstavel(page, '#modal-quick-add .sheet');
    await page.locator('#modal-quick-add .sheet').screenshot({ path: `${PASTA}/faixa-ausente-390.png` });
  });

  test('faixa com estimativa em 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await abrirAppEmDemo(page);
    await abrirMais(page, { fixedExpenses: [FIXO_A_VENCER], pendencias: [PENDENCIA] });
    await expect(faixa(page).locator('.qa-compr-sub')).toContainText('cerca de');
    await esperarPosicaoEstavel(page, '#modal-quick-add .sheet');
    await page.locator('#modal-quick-add .sheet').screenshot({ path: `${PASTA}/faixa-estimativa-390.png` });
  });

  test('muitos compromissos e valores longos não quebram a faixa em 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await abrirAppEmDemo(page);
    await abrirMais(page, {
      debts: [DIVIDA],
      fixedExpenses: Array.from({ length: 12 }, (_, i) => ({
        id: `fixo-${i}`, name: `Assinatura Teste ${i}`, amount: 12345.67,
        category: 'Serviços', dueDay: 10, since: '2026-01-01',
      })),
      pendencias: [{ ...PENDENCIA, estimatedValue: 98765.43 }],
    });

    const el = faixa(page);
    await expect(el.locator('.qa-compr-top')).toContainText('14 compromissos em aberto');
    await esperarPosicaoEstavel(page, '#modal-quick-add .sheet');
    expect(await el.evaluate(n => n.scrollWidth > n.clientWidth + 1)).toBe(false);

    // A faixa cresce em altura, não em largura, e não domina o formulário.
    const caixa = await el.boundingBox();
    expect(caixa.height).toBeLessThan(90);
    await expect(page.locator('#qa-amt-input')).toBeVisible();

    await page.locator('#modal-quick-add .sheet').screenshot({ path: `${PASTA}/faixa-valores-longos-320.png` });
  });
});
