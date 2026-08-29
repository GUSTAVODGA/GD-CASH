// O acabamento das folhas: o que faltava para elas serem janelas de verdade.
//
// Quatro lacunas medidas nas 39 folhas do app, todas resolvidas num lugar só
// (`_acabarFolhas`) em vez de repetidas 39 vezes no HTML:
//
//   · nenhuma se declarava `role="dialog"`/`aria-modal`, então um leitor de
//     tela não anunciava que abriu uma janela nem confinava a leitura a ela;
//   · o foco continuava no <body> com a folha aberta — quem navega por teclado
//     seguia tabulando pelo conteúdo de trás;
//   · 25 campos tinham rótulo VISÍVEL mas não associado (`<label class="fl">`
//     sem `for`): sem nome para a tecnologia assistiva, e tocar no rótulo não
//     focava o campo;
//   · 16 campos numéricos não pediam teclado: quem digita dinheiro no telefone
//     precisa da vírgula.
//
// Nada disso muda o que o app faz — muda quem consegue usá-lo.
import { test, expect } from '@playwright/test';
import { abrirAppEmDemo, semearDados } from './_helpers.js';

const AGORA = new Date(2026, 7, 20, 12, 0, 0);
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

/** Percorre todas as folhas, abrindo cada uma, e colhe o que a função pedir. */
const porFolha = (page, colher) => page.evaluate(fonte => {
  const colher = eval('(' + fonte + ')');
  const achados = [];
  [...document.querySelectorAll('.overlay')].filter(o => o.id).forEach(ov => {
    try { window.openOverlay(ov.id); } catch (e) { return; }
    colher(ov, achados);
    try { window.closeOverlay(ov.id); } catch (e) { ov.classList.remove('open'); }
  });
  return achados;
}, colher.toString());

test('TODA folha se declara uma janela', async ({ page }) => {
  await abrir(page);
  const sem = await porFolha(page, (ov, achados) => {
    if (ov.getAttribute('role') !== 'dialog' || ov.getAttribute('aria-modal') !== 'true') achados.push(ov.id);
  });
  expect(sem, 'folhas sem role=dialog/aria-modal').toEqual([]);
});

test('TODO campo tem um nome que a tecnologia assistiva alcança', async ({ page }) => {
  await abrir(page);
  const sem = await porFolha(page, (ov, achados) => {
    ov.querySelectorAll('input,select,textarea').forEach(el => {
      if (el.type === 'hidden' || getComputedStyle(el).display === 'none') return;
      const tem = el.getAttribute('aria-label') || el.getAttribute('placeholder') ||
        (el.id && ov.querySelector('label[for="' + el.id + '"]')) || el.closest('label');
      if (!tem) achados.push(ov.id + '/' + (el.id || el.name || el.type));
    });
  });
  expect(sem, 'campos sem rótulo acessível').toEqual([]);
});

test('TODO campo numérico pede o teclado certo', async ({ page }) => {
  await abrir(page);
  const sem = await porFolha(page, (ov, achados) => {
    ov.querySelectorAll('input[type=number]').forEach(el => {
      if (getComputedStyle(el).display === 'none') return;
      const im = el.getAttribute('inputmode');
      if (im !== 'decimal' && im !== 'numeric') achados.push(ov.id + '/' + (el.id || el.name || '?'));
    });
  });
  expect(sem, 'campos numéricos sem inputmode').toEqual([]);
});

test('o campo de dinheiro pede vírgula; o de dia, não', async ({ page }) => {
  await abrir(page);
  const r = await page.evaluate(() => {
    window.openOverlay('modal-fixed');
    const m = document.getElementById('fi-amount').getAttribute('inputmode');
    const d = document.getElementById('fi-day').getAttribute('inputmode');
    window.closeOverlay('modal-fixed');
    return { valorMensal: m, diaDoVencimento: d };
  });
  expect(r.valorMensal, 'valor mensal precisa do teclado com vírgula').toBe('decimal');
  expect(r.diaDoVencimento, 'dia do vencimento é inteiro').toBe('numeric');
});

test('o foco entra na folha ao abrir e volta para quem a abriu', async ({ page }) => {
  await abrir(page);
  const r = await page.evaluate(() => {
    // Um elemento real da página assume o foco antes, como faria um toque.
    const gatilho = document.querySelector('.home-venc-item') || document.querySelector('button');
    gatilho.focus();
    const antes = gatilho === document.activeElement;

    window.openOverlay('modal-fixed');
    const ov = document.getElementById('modal-fixed');
    const dentro = ov.contains(document.activeElement);

    window.closeOverlay('modal-fixed');
    return { antes, dentro, voltou: gatilho === document.activeElement };
  });
  expect(r.antes).toBe(true);
  expect(r.dentro, 'o foco ficou fora da folha aberta').toBe(true);
  expect(r.voltou, 'o foco não voltou para quem abriu a folha').toBe(true);
});

test('abrir a folha NÃO abre o teclado do telefone sozinho', async ({ page }) => {
  await abrir(page);
  // Focar o primeiro campo faria o teclado subir a cada folha, sem pedido.
  // O foco vai para a folha, que não é um campo de digitação.
  const tag = await page.evaluate(() => {
    window.openOverlay('modal-fixed');
    const t = document.activeElement.tagName;
    window.closeOverlay('modal-fixed');
    return t;
  });
  expect(['INPUT', 'TEXTAREA', 'SELECT']).not.toContain(tag);
});

test('o acabamento é só apresentação: não encosta em D nem chama save()', async ({ page }) => {
  await abrir(page);
  const antes = await page.evaluate(() => JSON.stringify(window.eval('D')));
  const salvou = await page.evaluate(() => {
    let n = 0; const s = window.save; window.save = () => { n++; return s && s(); };
    [...document.querySelectorAll('.overlay')].filter(o => o.id).forEach(o => {
      try { window.openOverlay(o.id); window.closeOverlay(o.id); } catch (e) {}
    });
    window.save = s;
    return n;
  });
  expect(salvou).toBe(0);
  expect(await page.evaluate(() => JSON.stringify(window.eval('D')))).toBe(antes);
});
