// Folha "Compromissos em aberto" — apresentação e roteamento canônico.
//
// Nesta fase a folha ainda não tem entrada na UI: é aberta por chamada direta,
// que é exatamente como os testes a exercitam. O que estes specs protegem:
//
//   1. a folha mostra o que o resolvedor devolve, na ordem dele, em linguagem
//      humana e sem vazar nome interno de fluxo, id ou metadado;
//   2. o agregado não finge exatidão quando há valor estimado;
//   3. tocar num item abre o fluxo CANÔNICO — e o pagamento resultante gera
//      exatamente um registro, nunca uma despesa manual paralela;
//   4. o "+" não fica pendurado por baixo, e nenhum qaConfirm atrasado grava.
import { test, expect } from '@playwright/test';
import { abrirAppEmDemo, semearDados, lerEstado, esperarOverlay } from './_helpers.js';

const PASTA = 'test-results/obrigacoes';

// Relógio dos testes: 15/06/2026 (definido em _helpers.js).
const DIVIDA = {
  id: 'divida-teste', titulo: 'Financiamento Teste', tipo: 'financiamento',
  credor: 'Banco Teste', valorOriginal: 6500, valorParcela: 200,
  parcelasTotal: 30, amortizadoInicial: 0,
  dataInicio: '2026-01-10', periodicidade: 'mensal', status: 'ativa',
};
const FIXO_ATRASADO = { id: 'fixo-net', name: 'Internet Teste', amount: 99.9, category: 'Contas', dueDay: 10, since: '2026-01-01' };
const FIXO_A_VENCER = { id: 'fixo-str', name: 'Streaming Teste', amount: 29.9, category: 'Serviços', dueDay: 28, since: '2026-01-01' };
const PENDENCIA = { id: 'pend-rev', title: 'Revisão Teste', category: 'veiculo', priority: 'media', deadline: '2026-06-30', estimatedValue: 450, status: 'aberta', createdAt: '2026-06-01' };

// Zera TODAS as coleções que alimentam a folha — inclusive as entidades — para
// que cada teste controle a lista inteira. O modo demo traz gastos fixos
// próprios; sem zerá-los, o primeiro item da folha seria um deles.
const LIMPO = {
  incomeItems: [], dailyIncome: {}, expenses: [], debtPayments: [], fixedPayments: [],
  debts: [], fixedExpenses: [], pendencias: [],
};

/** Semeia o cenário e abre a folha por chamada direta. */
async function abrirFolha(page, dados) {
  await semearDados(page, { ...LIMPO, ...dados }, 'inicio');
  await page.evaluate(() => window.abrirCompromissos());
  await esperarOverlay(page, 'modal-obrigacoes', true);
}

const CENARIO_COMPLETO = {
  debts: [DIVIDA],
  fixedExpenses: [FIXO_ATRASADO, FIXO_A_VENCER],
  pendencias: [PENDENCIA],
};

// ── Apresentação ──────────────────────────────────────────────────────────

test('lista as três origens numa folha só', async ({ page }) => {
  await abrirAppEmDemo(page);
  await abrirFolha(page, CENARIO_COMPLETO);

  const itens = page.locator('#obr-lista .obr-item');
  await expect(itens).toHaveCount(4);
  await expect(itens.nth(0)).toContainText('Financiamento Teste');
  await expect(itens.nth(0)).toContainText('Dívida');
  await expect(itens.nth(1)).toContainText('Internet Teste');
  await expect(itens.nth(1)).toContainText('Gasto fixo');
  await expect(itens.nth(3)).toContainText('Revisão Teste');
  await expect(itens.nth(3)).toContainText('Pendência');
});

test('a ordem do resolvedor aparece na tela: atrasadas primeiro', async ({ page }) => {
  await abrirAppEmDemo(page);
  await abrirFolha(page, CENARIO_COMPLETO);

  const titulos = await page.locator('#obr-lista .home-venc-title').allTextContents();
  expect(titulos).toEqual(['Financiamento Teste', 'Internet Teste', 'Streaming Teste', 'Revisão Teste']);
});

test('item atrasado exibe o selo Em atraso; item a vencer não', async ({ page }) => {
  await abrirAppEmDemo(page);
  await abrirFolha(page, CENARIO_COMPLETO);

  const itens = page.locator('#obr-lista .obr-item');
  await expect(itens.nth(1).locator('.venc-atraso')).toHaveText('Em atraso');
  await expect(itens.nth(2).locator('.venc-atraso')).toHaveCount(0);
});

test('valor estimado é sinalizado no item', async ({ page }) => {
  await abrirAppEmDemo(page);
  await abrirFolha(page, CENARIO_COMPLETO);

  const pendencia = page.locator('#obr-lista .obr-item').nth(3);
  await expect(pendencia.locator('.obr-chip-est')).toHaveText('Estimado');
  await expect(pendencia.locator('.home-venc-val')).toContainText('~');

  // As demais origens não podem ser marcadas como estimativa.
  await expect(page.locator('#obr-lista .obr-chip-est')).toHaveCount(1);
});

test('agregado é exato quando não há estimativa', async ({ page }) => {
  await abrirAppEmDemo(page);
  await abrirFolha(page, { debts: [DIVIDA], fixedExpenses: [FIXO_ATRASADO, FIXO_A_VENCER] });
  // 200 + 99,90 + 29,90 = 329,80
  await expect(page.locator('#obr-resumo')).toHaveText('3 compromissos · R$ 329,80');
});

test('agregado não finge exatidão quando há pendência estimada', async ({ page }) => {
  await abrirAppEmDemo(page);
  await abrirFolha(page, CENARIO_COMPLETO);
  // 329,80 + 450 estimados = 779,80, apresentado como aproximação
  await expect(page.locator('#obr-resumo')).toHaveText('4 compromissos · cerca de R$ 779,80');
});

test('singular quando há um único compromisso', async ({ page }) => {
  await abrirAppEmDemo(page);
  await abrirFolha(page, { fixedExpenses: [FIXO_A_VENCER] });
  await expect(page.locator('#obr-resumo')).toHaveText('1 compromisso · R$ 29,90');
});

test('estado vazio quando não há compromisso', async ({ page }) => {
  await abrirAppEmDemo(page);
  await abrirFolha(page, { debts: [], fixedExpenses: [], pendencias: [] });

  await expect(page.locator('.obr-vazio-tit')).toHaveText('Tudo em dia');
  await expect(page.locator('.obr-vazio-sub')).toHaveText('Nenhum compromisso em aberto agora.');
  await expect(page.locator('#obr-lista .obr-item')).toHaveCount(0);
  await expect(page.locator('#obr-resumo')).toHaveText('');
});

test('a folha não vaza nome interno de fluxo, id nem metadado', async ({ page }) => {
  await abrirAppEmDemo(page);
  await abrirFolha(page, CENARIO_COMPLETO);

  const html = await page.locator('#modal-obrigacoes').innerHTML();
  for (const proibido of ['debt-pay', 'fixed-baixa', 'pendencia-concluir', 'divida-teste',
                          'fixo-net', 'pend-rev', 'meta.source', 'asset-acquisition', 'nature']) {
    expect(html, `a folha expôs "${proibido}"`).not.toContain(proibido);
  }
});

// ── Roteamento canônico e ausência de dupla contagem ──────────────────────

test('dívida: roteia para o pagamento canônico e cria exatamente um registro', async ({ page }) => {
  await abrirAppEmDemo(page);
  await abrirFolha(page, { debts: [DIVIDA] });

  await page.locator('#obr-lista .obr-item').first().click();
  await esperarOverlay(page, 'modal-obrigacoes', false);
  await esperarOverlay(page, 'debt-pay-sheet', true);

  // O fluxo canônico pré-preenche a data com o vencimento da parcela (janeiro).
  // Aqui o pagamento é feito hoje, para que o efeito no caixa do mês corrente
  // possa ser conferido.
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

  // O dinheiro saiu do caixa uma única vez, e como dívida — não como consumo.
  const resumo = await page.evaluate(() => window._monthMovementSummary(0));
  expect(resumo.debtPayments).toBe(200);
  expect(resumo.consumo).toBe(0);
  expect(resumo.totalCashOut).toBe(200);
});

test('fixo: roteia para a baixa canônica e cria exatamente um registro', async ({ page }) => {
  await abrirAppEmDemo(page);
  await abrirFolha(page, { fixedExpenses: [FIXO_ATRASADO] });

  await page.locator('#obr-lista .obr-item').first().click();
  await esperarOverlay(page, 'modal-obrigacoes', false);
  await esperarOverlay(page, 'modal-baixa', true);

  await page.locator('#baixa-confirm-btn').click();
  await esperarOverlay(page, 'modal-baixa', false);

  const estado = await lerEstado(page, `({
    despesas: D.expenses.length,
    deFixo: D.expenses.filter(e => e.meta && e.meta.source === 'fixed-payment').length,
    manuais: D.expenses.filter(e => !e.meta || !e.meta.source).length,
    marcadores: D.fixedPayments.length,
  })`);
  expect(estado.despesas).toBe(1);
  expect(estado.deFixo).toBe(1);
  expect(estado.manuais, 'apareceu despesa manual paralela').toBe(0);
  expect(estado.marcadores).toBe(1);
});

test('pendência: roteia para o fluxo canônico sem criar registro por conta própria', async ({ page }) => {
  await abrirAppEmDemo(page);
  await abrirFolha(page, { pendencias: [PENDENCIA] });

  await page.locator('#obr-lista .obr-item').first().click();
  await esperarOverlay(page, 'modal-obrigacoes', false);

  // O fluxo existente conclui a pendência e PERGUNTA se deve registrar o gasto.
  const dialogo = page.locator('#_av_dlg');
  await expect(dialogo).toBeVisible();
  await expect(dialogo.locator('.av-dialog-title')).toHaveText('Pendência concluída');

  await dialogo.getByRole('button', { name: 'Não' }).click();

  const estado = await lerEstado(page, `({
    despesas: D.expenses.length,
    status: D.pendencias[0].status,
  })`);
  expect(estado.status).toBe('concluida');
  expect(estado.despesas, 'a folha criou despesa por conta própria').toBe(0);
});

test('quitada a obrigação, ela não aparece na reabertura da folha', async ({ page }) => {
  await abrirAppEmDemo(page);
  await abrirFolha(page, { fixedExpenses: [FIXO_ATRASADO, FIXO_A_VENCER] });
  await expect(page.locator('#obr-lista .obr-item')).toHaveCount(2);

  await page.locator('#obr-lista .obr-item').first().click();
  await esperarOverlay(page, 'modal-baixa', true);
  await page.locator('#baixa-confirm-btn').click();
  await esperarOverlay(page, 'modal-baixa', false);

  await page.evaluate(() => window.abrirCompromissos());
  await esperarOverlay(page, 'modal-obrigacoes', true);
  await expect(page.locator('#obr-lista .obr-item')).toHaveCount(1);
  await expect(page.locator('#obr-lista .obr-item').first()).toContainText('Streaming Teste');
});

// ── Higiene de estado ─────────────────────────────────────────────────────

test('rotear a partir do + fecha o formulário e trava um Salvar atrasado', async ({ page }) => {
  await abrirAppEmDemo(page);
  await semearDados(page, { ...LIMPO, debts: [DIVIDA] }, 'inicio');

  // Simula o cenário do próximo commit: o "+" está aberto e preenchido quando o
  // usuário decide pagar um compromisso.
  await page.locator('#global-fab').click();
  await esperarOverlay(page, 'modal-quick-add', true);
  await page.locator('#qa-btn-gas').click();
  await page.locator('#qa-amt-input').fill('200');
  await page.locator('#qa-desc').fill('Parcela do carro');

  await page.evaluate(() => window.abrirCompromissos());
  await esperarOverlay(page, 'modal-obrigacoes', true);

  // Abrir a folha já tira o "+" de cena: os dois nunca coexistem.
  await esperarOverlay(page, 'modal-quick-add', false);
  await expect(page.locator('.overlay.open')).toHaveCount(1);

  await page.locator('#obr-lista .obr-item').first().click();
  await esperarOverlay(page, 'modal-obrigacoes', false);
  await esperarOverlay(page, 'debt-pay-sheet', true);
  await expect(page.locator('.overlay.open')).toHaveCount(1);

  // Um qaConfirm atrasado não pode gravar a despesa manual que ficou preenchida.
  await page.evaluate(() => window.qaConfirm());
  expect(await lerEstado(page, 'D.expenses.length')).toBe(0);

  // E o estado de edição foi descartado.
  expect(await lerEstado(page, '_qaEdit')).toBeNull();
});

test('reabrir o + depois de rotear volta a funcionar normalmente', async ({ page }) => {
  await abrirAppEmDemo(page);
  await semearDados(page, { ...LIMPO, debts: [DIVIDA] }, 'inicio');

  await page.evaluate(() => window.abrirCompromissos());
  await page.locator('#obr-lista .obr-item').first().click();
  await esperarOverlay(page, 'debt-pay-sheet', true);
  await page.evaluate(() => window.closeOverlay('debt-pay-sheet'));

  // A trava de gravação é liberada ao reabrir o formulário.
  await page.locator('#global-fab').click();
  await esperarOverlay(page, 'modal-quick-add', true);
  await page.locator('#qa-btn-gas').click();
  await page.locator('#qa-amt-input').fill('90');
  await page.locator('#qa-desc').fill('Almoco Teste');
  await page.locator('#qa-save-btn').click();
  await esperarOverlay(page, 'modal-quick-add', false);

  expect(await lerEstado(page, "D.expenses.filter(e => e.description === 'Almoco Teste').length")).toBe(1);
});

test('abrir a folha duas vezes seguidas não empilha overlay nem duplica itens', async ({ page }) => {
  await abrirAppEmDemo(page);
  await abrirFolha(page, CENARIO_COMPLETO);
  await page.evaluate(() => window.abrirCompromissos());
  await esperarOverlay(page, 'modal-obrigacoes', true);

  await expect(page.locator('#obr-lista .obr-item')).toHaveCount(4);
  await expect(page.locator('.overlay.open')).toHaveCount(1);
});

test('duplo toque no mesmo item não abre dois fluxos', async ({ page }) => {
  await abrirAppEmDemo(page);
  await abrirFolha(page, { debts: [DIVIDA] });

  await page.locator('#obr-lista .obr-item').first().click();
  await page.evaluate(() => window._tocarObrigacao(0)); // segundo toque, já fora da folha
  await esperarOverlay(page, 'debt-pay-sheet', true);
  await expect(page.locator('.overlay.open')).toHaveCount(1);
});

// ── Visual ────────────────────────────────────────────────────────────────

test.describe('visual da folha', () => {
  const LARGURAS = [320, 375, 390, 430];

  for (const tema of ['light', 'dark']) {
    for (const largura of LARGURAS) {
      test(`folha legível em ${tema} @ ${largura}px`, async ({ page }) => {
        await page.setViewportSize({ width: largura, height: 900 });
        await page.emulateMedia({ colorScheme: tema });
        await abrirAppEmDemo(page);
        await abrirFolha(page, CENARIO_COMPLETO);

        const folha = page.locator('#modal-obrigacoes .sheet');
        await expect(folha).toBeVisible();
        await expect(page.locator('html')).toHaveAttribute('data-theme', tema);

        const transbordou = await folha.evaluate(el => el.scrollWidth > el.clientWidth + 1);
        expect(transbordou, 'a folha transbordou na horizontal').toBe(false);

        await folha.screenshot({ path: `${PASTA}/obrigacoes-${tema}-${largura}.png` });
      });
    }
  }

  test('título e valor longos não quebram o layout em 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await abrirAppEmDemo(page);
    await abrirFolha(page, {
      fixedExpenses: [{ ...FIXO_ATRASADO, name: 'Assinatura Muito Longa De Servico Teste Ilimitado', amount: 123456.78 }],
      pendencias: [{ ...PENDENCIA, title: 'Pendência Com Nome Bastante Extenso Para Teste', estimatedValue: 98765.43 }],
    });

    const folha = page.locator('#modal-obrigacoes .sheet');
    const transbordou = await folha.evaluate(el => el.scrollWidth > el.clientWidth + 1);
    expect(transbordou).toBe(false);
    await folha.screenshot({ path: `${PASTA}/obrigacoes-textos-longos-320.png` });
  });

  test('estado vazio também se comporta em 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await abrirAppEmDemo(page);
    await abrirFolha(page, { debts: [], fixedExpenses: [], pendencias: [] });
    const folha = page.locator('#modal-obrigacoes .sheet');
    await folha.screenshot({ path: `${PASTA}/obrigacoes-vazio-320.png` });
  });
});
