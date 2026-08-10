// P2 — bloco "A vencer no mês" e a faixa de atraso anterior.
//
// Cobre o comportamento (o que o cartão mostra e esconde) e o visual (claro e
// escuro, nas larguras de tela que o Avenco precisa atender). O visual importa
// aqui porque a faixa é um elemento novo com texto que pode ser longo em
// português — "5 parcelas em atraso · R$ 1.000,00" precisa caber em 320 px.
import { test, expect } from '@playwright/test';
import { abrirAppEmDemo, irParaAba, semearDados } from './_helpers.js';

const PASTA = 'test-results/p2';

// Dívida de 33 × R$ 200 (com parcela residual), 1ª em 10/01/2026. Com o relógio
// do teste em 15/06/2026, seis parcelas venceram e nenhuma foi paga: junho tem
// uma parcela própria e cinco ficaram para trás.
const DIVIDA_COM_ATRASO = {
  id: 'divida-atraso', titulo: 'Financiamento Teste', tipo: 'financiamento',
  credor: 'Banco Teste', valorOriginal: 6500, valorParcela: 200,
  parcelasTotal: 30, amortizadoInicial: 0,
  dataInicio: '2026-01-10', periodicidade: 'mensal', status: 'ativa',
};

// Dívida curta e inteiramente vencida: três parcelas em jan/fev/mar de 2026.
// Serve ao caso "mês sem parcela própria, mas com atraso".
const DIVIDA_SO_ATRASO = {
  id: 'divida-encerrada-atraso', titulo: 'Parcelamento Teste', tipo: 'parcelamento',
  credor: 'Loja Teste', valorOriginal: 300, valorParcela: 100,
  parcelasTotal: 3, amortizadoInicial: 0,
  dataInicio: '2026-01-10', periodicidade: 'mensal', status: 'ativa',
};

const SEM_RUIDO = { incomeItems: [], dailyIncome: {}, expenses: [] };

test.describe('comportamento', () => {
  test('o mês lista só a parcela dele e resume o atraso numa faixa', async ({ page }) => {
    await abrirAppEmDemo(page);
    await semearDados(page, { ...SEM_RUIDO, debts: [DIVIDA_COM_ATRASO], debtPayments: [] }, 'mes');

    const cartao = page.locator('.mes-prev-card');
    await expect(cartao).toBeVisible();

    // Uma única linha: a parcela de 10/06. O backlog não vira lista.
    await expect(cartao.locator('.mes-prev-list .home-venc-item')).toHaveCount(1);
    await expect(cartao.locator('.mes-prev-total')).toHaveText('R$ 200,00');

    const faixa = cartao.locator('.mes-prev-atraso');
    await expect(faixa).toBeVisible();
    await expect(faixa.locator('.mes-prev-atraso-top')).toHaveText('5 parcelas em atraso · R$ 1.000,00');
    await expect(faixa.locator('.mes-prev-atraso-sub')).toContainText('10/01/2026');
  });

  test('a parcela vencida do próprio mês fica na lista com o chip Em atraso', async ({ page }) => {
    await abrirAppEmDemo(page);
    await semearDados(page, { ...SEM_RUIDO, debts: [DIVIDA_COM_ATRASO], debtPayments: [] }, 'mes');

    const linha = page.locator('.mes-prev-list .home-venc-item').first();
    await expect(linha).toContainText('Financiamento Teste');
    await expect(linha.locator('.venc-atraso')).toHaveText('Em atraso');
  });

  test('navegar meses não acumula: cada mês mostra só o seu compromisso', async ({ page }) => {
    await abrirAppEmDemo(page);
    await semearDados(page, { ...SEM_RUIDO, debts: [DIVIDA_COM_ATRASO], debtPayments: [] }, 'mes');

    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.changeMonth(1));
      await expect(page.locator('.mes-prev-list .home-venc-item')).toHaveCount(1);
      await expect(page.locator('.mes-prev-total')).toHaveText('R$ 200,00');
    }
  });

  test('a faixa abre a Central de Dívidas já filtrada em atraso', async ({ page }) => {
    await abrirAppEmDemo(page);
    await semearDados(page, { ...SEM_RUIDO, debts: [DIVIDA_COM_ATRASO], debtPayments: [] }, 'mes');

    await page.locator('.mes-prev-atraso').click();
    await expect(page.locator('#page-dividas')).toHaveClass(/active/);

    const filtro = await page.evaluate(() => window.eval('_dividasFiltro'));
    expect(filtro).toBe('atraso');
    await expect(page.locator('.div-chip-on')).toHaveText('Em atraso');
  });

  test('mês sem parcela própria, mas com atraso, mantém o cartão', async ({ page }) => {
    await abrirAppEmDemo(page);
    await semearDados(page, { ...SEM_RUIDO, debts: [DIVIDA_SO_ATRASO], debtPayments: [] }, 'mes');

    const cartao = page.locator('.mes-prev-card');
    await expect(cartao).toBeVisible();
    await expect(cartao.locator('.mes-prev-list .home-venc-item')).toHaveCount(0);
    await expect(cartao.locator('.mes-prev-sub')).toHaveText('Nenhum compromisso vence neste mês');
    await expect(cartao.locator('.mes-prev-atraso-top')).toHaveText('3 parcelas em atraso · R$ 300,00');
  });

  test('sem parcela e sem atraso o cartão desaparece', async ({ page }) => {
    await abrirAppEmDemo(page);
    await semearDados(page, { ...SEM_RUIDO, debts: [], debtPayments: [] }, 'mes');
    await expect(page.locator('.mes-prev-card')).toHaveCount(0);
  });

  test('singular quando há uma única parcela em atraso', async ({ page }) => {
    await abrirAppEmDemo(page);
    const umaSo = { ...DIVIDA_SO_ATRASO, id: 'd-uma', valorOriginal: 100, parcelasTotal: 1 };
    await semearDados(page, { ...SEM_RUIDO, debts: [umaSo], debtPayments: [] }, 'mes');
    await expect(page.locator('.mes-prev-atraso-top')).toHaveText('1 parcela em atraso · R$ 100,00');
  });

  test('o bloco previsto não entra no resultado realizado do mês', async ({ page }) => {
    await abrirAppEmDemo(page);
    await semearDados(page, { ...SEM_RUIDO, debts: [DIVIDA_COM_ATRASO], debtPayments: [] }, 'mes');
    // Nenhum lançamento real foi criado: caixa do mês continua zerado.
    const resumo = await page.evaluate(() => window._monthMovementSummary(0));
    expect(resumo.totalCashOut).toBe(0);
    expect(resumo.debtPayments).toBe(0);
    expect(await page.evaluate(() => window.monthAggregate(0).gastos)).toBe(0);
  });
});

// ── Visual: claro e escuro, nas larguras alvo ───────────────────────────────
test.describe('visual do bloco', () => {
  const LARGURAS = [320, 375, 390, 430];
  const TEMAS = ['light', 'dark'];

  for (const tema of TEMAS) {
    for (const largura of LARGURAS) {
      test(`faixa e lista legíveis em ${tema} @ ${largura}px`, async ({ page }) => {
        await page.setViewportSize({ width: largura, height: 900 });
        await page.emulateMedia({ colorScheme: tema });
        await abrirAppEmDemo(page);
        await semearDados(page, { ...SEM_RUIDO, debts: [DIVIDA_COM_ATRASO], debtPayments: [] }, 'mes');

        const cartao = page.locator('.mes-prev-card');
        await expect(cartao).toBeVisible();
        await expect(page.locator('html')).toHaveAttribute('data-theme', tema);

        // Nada pode transbordar horizontalmente na largura mais apertada.
        const transbordou = await cartao.evaluate(el => el.scrollWidth > el.clientWidth + 1);
        expect(transbordou, 'o cartão transbordou na horizontal').toBe(false);

        const faixa = cartao.locator('.mes-prev-atraso');
        await expect(faixa).toBeVisible();
        const caixa = await faixa.boundingBox();
        expect(caixa.width).toBeLessThanOrEqual(largura);
        // Alvo de toque confortável mesmo com o texto quebrando em duas linhas.
        expect(caixa.height).toBeGreaterThanOrEqual(40);

        await cartao.screenshot({ path: `${PASTA}/mes-previsto-${tema}-${largura}.png` });
      });
    }
  }

  test('cartão só com faixa de atraso também se comporta em 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await abrirAppEmDemo(page);
    await semearDados(page, { ...SEM_RUIDO, debts: [DIVIDA_SO_ATRASO], debtPayments: [] }, 'mes');

    const cartao = page.locator('.mes-prev-card');
    await expect(cartao).toBeVisible();
    const transbordou = await cartao.evaluate(el => el.scrollWidth > el.clientWidth + 1);
    expect(transbordou).toBe(false);
    await cartao.screenshot({ path: `${PASTA}/mes-previsto-so-atraso-320.png` });
  });
});
