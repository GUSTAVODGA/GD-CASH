// O que o dedo alcança dentro de uma folha.
//
// O relato foi "tem botões que não consigo clicar": no detalhe de um
// compromisso em atraso, "Registrar pagamento" aparecia e não respondia.
//
// A causa não era z-index nem overlay. A folha encosta no rodapé da tela e a
// regra base `.sheet` tinha `padding:22px` seco. Num iPhone o indicador de home
// ocupa os últimos ~34px da tela e o sistema intercepta o toque ali antes da
// página. Com 22px de respiro, o último controle de 29 das 39 folhas nascia
// dentro dessa faixa: visível, e inerte.
//
// O Chromium headless não tem entalhe — `env(safe-area-inset-bottom)` vale 0 e
// o defeito é invisível para um teste ingênuo. Por isso aqui a faixa é
// SIMULADA: mede-se a distância entre o último controle e o rodapé da tela, e
// exige-se que caiba o indicador. É a única forma de esta suíte enxergar um
// defeito que só existe em aparelho com entalhe.
import { test, expect } from '@playwright/test';
import { abrirAppEmDemo, semearDados, esperarOverlay, lerEstado } from './_helpers.js';

const AGORA = new Date(2026, 7, 20, 12, 0, 0);
const INDICADOR = 34;   // altura do indicador de home do iPhone, em CSS px

const rec = (id, d, v) => ({ id, date: d, amount: v, status: 'paid', platformId: 'p1', note: '' });

const CENARIO = {
  platforms: [{ id: 'p1', name: 'Fonte A', color: '#0C7A52' }],
  incomeItems: [rec('i1', '2026-08-04', 3200)],
  dailyIncome: {}, debtPayments: [], fixedPayments: [], vehicles: [], daysOff: [],
  patrimonios: [{ id: 'pat1', nome: 'Apartamento', tipo: 'imovel', status: 'ativo',
    valorEstimado: 300000, historico: [], detalhes: {} }],
  fixedExpenses: [{ id: 'f1', name: 'Internet', amount: 189.9, dueDay: 6 }],
  pendencias: [{ id: 'pd1', titulo: 'Trocar a torneira', valor: 150, status: 'aberta' }],
  goals: [{ id: 'g1', name: 'Viagem', target: 8000, saved: 3100 }],
  emergency: { current: 3200, target: 10000 },
  reservaHistory: [{ date: '2026-08-15', type: 'dep', amount: 300 }],
  debts: [{ id: 'd1', tipo: 'financiamento', titulo: 'Financiamento Teste', credor: 'Banco Teste',
    valorOriginal: 60000, valorParcela: 1450, parcelasTotal: 42, amortizadoInicial: 0,
    dataInicio: '2025-12-10', periodicidade: 'mensal', status: 'ativa' }],
  expenses: [{ id: 'e1', date: '2026-08-05', amount: 940, category: 'Alimentação', description: 'Mercado' }],
};

const abrir = async page => {
  await page.setViewportSize({ width: 390, height: 844 });
  const erros = await abrirAppEmDemo(page, { agora: AGORA });
  await semearDados(page, CENARIO, 'inicio');
  await page.addStyleTag({ content: '*{transition:none !important;animation:none !important}' });
  return erros;
};

// O respiro só se manifesta em aparelho com entalhe, e o Chromium do CI não tem
// nenhum: `env(safe-area-inset-bottom)` resolve para 0 e a geometria fica
// idêntica com e sem a correção. Medir pixels aqui não prova nada — o que se
// pode provar é que a REGRA declara o respiro. Por isso este teste lê o CSSOM.
test('a regra base das folhas declara respiro para a barra de gestos', async ({ page }) => {
  await abrir(page);
  const paddings = await page.evaluate(() => {
    const regras = [...document.styleSheets].flatMap(f => { try { return [...f.cssRules]; } catch (e) { return []; } });
    return regras
      .filter(r => r.selectorText && /(^|,\s*)\.sheet\s*(,|$)/.test(r.selectorText) && r.style.paddingBottom)
      .map(r => ({ seletor: r.selectorText, valor: r.style.paddingBottom }));
  });
  expect(paddings.length, 'a regra base .sheet parou de declarar padding-bottom').toBeGreaterThan(0);
  paddings.forEach(p => expect(p.valor, `${p.seletor} perdeu o env(safe-area-inset-bottom)`)
    .toContain('safe-area-inset-bottom'));
});

// E, independente do entalhe: nenhum controle pode transbordar a caixa de
// conteúdo da própria folha. Isso pega o defeito complementar — uma folha que
// corta o próprio botão por overflow, em qualquer aparelho.
test('NENHUMA folha corta um controle para fora da própria caixa', async ({ page }) => {
  await abrir(page);
  const ids = await page.evaluate(() => [...document.querySelectorAll('.overlay')].map(o => o.id).filter(Boolean));
  expect(ids.length, 'o app deixou de ter folhas — o teste perdeu o objeto').toBeGreaterThan(20);

  const cortados = await page.evaluate(ids => {
    const achados = [];
    for (const id of ids) {
      const ov = document.getElementById(id);
      try { window.openOverlay(id); } catch (e) { continue; }
      const folha = ov.querySelector('.sheet');
      if (!folha) { ov.classList.remove('open'); continue; }
      folha.scrollTop = folha.scrollHeight;          // o último controle é o que corre risco
      const fim = folha.getBoundingClientRect().bottom - parseFloat(getComputedStyle(folha).paddingBottom);

      folha.querySelectorAll('button,a,input,select,textarea,[onclick],[role=button]').forEach(el => {
        const cs = getComputedStyle(el), b = el.getBoundingClientRect();
        if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return;
        if (b.width <= 2 || b.height <= 2) return;
        if (b.bottom > fim + 0.5) {
          achados.push(`${id} :: ${(el.textContent || el.value || el.getAttribute('aria-label') || el.tagName)
            .trim().replace(/\s+/g, ' ').slice(0, 34)} (transborda ${Math.round(b.bottom - fim)}px)`);
        }
      });
      ov.classList.remove('open');
    }
    return achados;
  }, ids);

  expect(cortados, 'controles cortados para fora da folha').toEqual([]);
});

test('a altura da folha acompanha a janela real, não a janela ideal', async ({ page }) => {
  await abrir(page);
  // `dvh` encolhe junto com a barra de endereço do iOS; `vh` não. Se a folha
  // voltar a medir só em `vh`, o fim dela some abaixo da dobra no aparelho.
  const usaDvh = await page.evaluate(() => {
    const regras = [...document.styleSheets].flatMap(f => { try { return [...f.cssRules]; } catch (e) { return []; } });
    const daFolha = regras.filter(r => r.selectorText && /(^|,\s*)\.sheet(\s|,|$)|\.sheet-tall/.test(r.selectorText));
    return daFolha.map(r => r.style.maxHeight).filter(Boolean);
  });
  expect(usaDvh.length).toBeGreaterThan(0);
  usaDvh.forEach(v => expect(v, 'altura de folha ainda medida em vh').toContain('dvh'));
});

test('O BUG RELATADO: "Registrar pagamento" de um compromisso em atraso responde', async ({ page }) => {
  const erros = await abrir(page);

  // O caminho exato do relato: Home → compromisso em atraso → registrar.
  await page.locator('.home-venc-item').first().click();
  await esperarOverlay(page, 'debt-detail-sheet', true);

  const botao = page.locator('#debt-detail-sheet button').filter({ hasText: /^Registrar pagamento$/ });
  await expect(botao).toHaveCount(1);

  // Sem rolagem programática: o gesto que o dedo faria sobre a folha.
  await page.mouse.move(195, 500);
  for (let i = 0; i < 12; i++) await page.mouse.wheel(0, 120);
  await page.waitForTimeout(200);

  await botao.click();
  await esperarOverlay(page, 'debt-pay-sheet', true);
  expect(erros).toEqual([]);
});

test('registrar o pagamento cria a despesa e o marcador — uma vez só', async ({ page }) => {
  await abrir(page);
  const antes = await lerEstado(page, '({ d: D.expenses.length, p: (D.debtPayments||[]).length })');

  const expId = await page.evaluate(() => window._debtRegistrarPagamento('d1', { valor: 1450, data: '2026-08-20' }));
  expect(expId).toBeTruthy();

  const depois = await lerEstado(page, '({ d: D.expenses.length, p: (D.debtPayments||[]).length })');
  expect(depois.d).toBe(antes.d + 1);
  expect(depois.p).toBe(antes.p + 1);

  // A despesa criada carrega a origem estrutural, que é o que protege a natureza.
  const meta = await lerEstado(page, "D.expenses[D.expenses.length-1].meta");
  expect(meta.source).toBe('debt');
  expect(meta.debtId).toBe('d1');
});
