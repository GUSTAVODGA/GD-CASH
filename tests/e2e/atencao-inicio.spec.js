// "O que precisa de você": três blocos viram uma lista.
//
// A Início montava TRÊS blocos independentes na área de atenção — alerta de
// gastos fixos vencidos, lista de compromissos de dívida, lista de pendências
// — cada um com a própria regra de o que mostrar e a própria ordenação. Três
// respostas para a pergunta que, na cabeça de quem olha, é uma só: o que vence
// e quanto.
//
// A resposta unificada JÁ EXISTIA em `_obrigacoesEmAberto()`, com uma forma só,
// ordenação por urgência e honestidade sobre estimativa. Era consumida apenas
// pelo fluxo do "+". A Início agora consome a mesma espinha.
//
// O QUE ESTES TESTES PROTEGEM — e é aqui que a fusão se prova ou cai:
//
//   NADA SE PERDEU. Unificar exigiu reconciliar dois escopos diferentes, e as
//   duas reconciliações foram feitas na direção de não perder nada:
//     · a espinha descarta pendência SEM valor (para ela o critério é "dá para
//       pagar agora"); a Início mostra pendência de alta prioridade mesmo sem
//       valor, e essas voltam marcadas como sem valor;
//     · os horizontes eram diferentes (dívida 15 dias, fixo só depois de
//       vencer, pendência vencida ou alta) — adotou-se o mais largo dos três,
//       o que garante superconjunto.
//
//   NADA APARECE DUAS VEZES. Os blocos antigos precisavam parar de renderizar,
//   senão o mesmo compromisso surgiria em dois lugares da mesma tela.
import { test, expect } from '@playwright/test';
import { abrirAppEmDemo, semearDados, irParaAba, lerEstado } from './_helpers.js';

const AGORA = new Date(2026, 7, 20, 12, 0, 0);   // 20/08/2026

const BASE = {
  platforms: [{ id: 'p1', name: 'Fonte A', color: '#0C7A52' }],
  incomeItems: [], dailyIncome: {}, expenses: [], debtPayments: [], fixedPayments: [],
  debts: [], fixedExpenses: [], pendencias: [], vehicles: [], patrimonios: [],
  reservaHistory: [], goals: [], daysOff: [], reminders: [],
  emergency: { current: 0, target: 0 },
};

const DIVIDA_ATRASADA = {
  id: 'd1', tipo: 'financiamento', titulo: 'Financiamento do carro', credor: 'Banco',
  valorOriginal: 60000, valorParcela: 1450, parcelasTotal: 42, amortizadoInicial: 0,
  dataInicio: '2026-02-10', periodicidade: 'mensal', status: 'ativa',
};
const FIXO_VENCIDO = { id: 'f1', name: 'Internet', amount: 189.9, category: 'Contas', dueDay: 6, since: '2026-01-01' };
const FIXO_A_VENCER = { id: 'f2', name: 'Academia', amount: 120, category: 'Saúde', dueDay: 28, since: '2026-01-01' };
const PEND_COM_VALOR = { id: 'p1', title: 'Trocar a torneira', category: 'casa', priority: 'media',
  deadline: '2026-08-15', estimatedValue: 150, status: 'aberta', createdAt: '2026-08-01' };
const PEND_SEM_VALOR = { id: 'p2', title: 'Renovar o seguro', category: 'veiculo', priority: 'alta',
  deadline: '', estimatedValue: 0, status: 'aberta', createdAt: '2026-08-01' };

const abrir = async (page, dados) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const erros = await abrirAppEmDemo(page, { agora: AGORA });
  await semearDados(page, { ...BASE, ...(dados || {}) }, 'inicio');
  return erros;
};

const lista = page => page.locator('#home-dividas-venc .home-venc-item');

test('OS TRÊS TIPOS aparecem na mesma lista', async ({ page }) => {
  const erros = await abrir(page, {
    debts: [DIVIDA_ATRASADA], fixedExpenses: [FIXO_VENCIDO], pendencias: [PEND_COM_VALOR],
  });
  const bloco = page.locator('#home-dividas-venc');
  await expect(bloco).toContainText('O que precisa de você');
  await expect(bloco).toContainText('Financiamento do carro');
  await expect(bloco).toContainText('Internet');
  await expect(bloco).toContainText('Trocar a torneira');
  // E cada linha se identifica pelo tipo.
  await expect(bloco).toContainText('Dívida');
  await expect(bloco).toContainText('Gasto fixo');
  await expect(bloco).toContainText('Pendência');
  expect(erros).toEqual([]);
});

test('NADA APARECE DUAS VEZES: os blocos antigos pararam de renderizar', async ({ page }) => {
  await abrir(page, {
    debts: [DIVIDA_ATRASADA], fixedExpenses: [FIXO_VENCIDO], pendencias: [PEND_COM_VALOR],
  });
  // Os contêineres continuam no documento (outros pontos do app os referenciam),
  // mas vazios: quem preenche agora é a lista única.
  await expect(page.locator('#home-fixos-alert')).toBeEmpty();
  await expect(page.locator('#home-pend-section')).toBeHidden();
  await expect(page.locator('#home-pend-list')).toBeEmpty();

  // Contagem de menções: cada item exatamente uma vez na página inicial.
  const vezes = await page.evaluate(() => {
    const t = document.getElementById('page-inicio').innerText;
    const conta = s => (t.match(new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    return { internet: conta('Internet'), torneira: conta('Trocar a torneira') };
  });
  expect(vezes.internet, 'gasto fixo aparecendo duas vezes na Início').toBe(1);
  expect(vezes.torneira, 'pendência aparecendo duas vezes na Início').toBe(1);
});

test('NADA SE PERDEU: pendência de alta prioridade SEM valor continua aparecendo', async ({ page }) => {
  // A espinha a descarta ("sem valor não é pagável"); a Início precisa dela.
  await abrir(page, { pendencias: [PEND_SEM_VALOR] });
  const bloco = page.locator('#home-dividas-venc');
  await expect(bloco, 'a pendência sem valor sumiu da Início').toContainText('Renovar o seguro');
  // E não inventa um valor para ela.
  const linha = page.locator('.home-venc-item', { hasText: 'Renovar o seguro' });
  await expect(linha.locator('.home-venc-val')).toHaveCount(0);
});

test('NADA SE PERDEU: o horizonte adotado é o mais largo dos três', async ({ page }) => {
  // Fixo que ainda NÃO venceu: o bloco antigo só mostrava depois do atraso.
  // Com o horizonte unificado ele aparece antes — ganho, não perda.
  await abrir(page, { fixedExpenses: [FIXO_A_VENCER] });
  await expect(page.locator('#home-dividas-venc')).toContainText('Academia');
});

test('a ordem é por urgência: atrasado primeiro, depois por vencimento', async ({ page }) => {
  await abrir(page, {
    debts: [DIVIDA_ATRASADA], fixedExpenses: [FIXO_VENCIDO, FIXO_A_VENCER], pendencias: [PEND_COM_VALOR],
  });
  const titulos = await lista(page).evaluateAll(ns =>
    ns.map(n => n.querySelector('.home-venc-title').textContent.trim()));
  const atrasos = await lista(page).evaluateAll(ns =>
    ns.map(n => !!n.querySelector('.venc-chip')));
  // Nenhum item sem atraso pode vir antes de um item em atraso.
  const primeiroSemAtraso = atrasos.indexOf(false);
  if (primeiroSemAtraso >= 0) {
    expect(atrasos.slice(primeiroSemAtraso).every(a => !a),
      `ordem quebrada: ${titulos.join(' | ')}`).toBe(true);
  }
  // A academia (vence dia 28, no futuro) não pode ser a primeira.
  expect(titulos[0]).not.toBe('Academia');
});

test('cada linha leva aonde levava antes da fusão', async ({ page }) => {
  await abrir(page, {
    debts: [DIVIDA_ATRASADA], fixedExpenses: [FIXO_VENCIDO], pendencias: [PEND_COM_VALOR],
  });
  const destinos = await lista(page).evaluateAll(ns => ns.map(n => ({
    t: n.querySelector('.home-venc-title').textContent.trim(),
    on: n.getAttribute('onclick'),
  })));
  const de = t => destinos.find(d => d.t === t).on;
  expect(de('Financiamento do carro'), 'a dívida deixou de abrir seu detalhe').toContain('openDebtDetail');
  expect(de('Internet'), 'o fixo deixou de levar aos Gastos Fixos').toContain("'fixos'");
  expect(de('Trocar a torneira'), 'a pendência deixou de levar às Pendências').toContain("'pendencias'");
});

test('o total é honesto quando há estimativa na composição', async ({ page }) => {
  // Pendência tem valor ESTIMADO; somar sem avisar seria apresentar um número
  // fechado que não é fechado.
  await abrir(page, { fixedExpenses: [FIXO_VENCIDO], pendencias: [PEND_COM_VALOR] });
  await expect(page.locator('.home-atencao-total')).toContainText('cerca de');

  // Só com valores exatos, sem o "cerca de".
  await abrir(page, { fixedExpenses: [FIXO_VENCIDO] });
  const t = await page.locator('.home-atencao-total').textContent();
  expect(t).not.toContain('cerca de');
  expect(t).toContain('189,90');
});

test('sem compromisso nenhum, o bloco não aparece', async ({ page }) => {
  const erros = await abrir(page);
  await expect(page.locator('#home-dividas-venc')).toBeEmpty();
  expect(erros).toEqual([]);
});

test('a lista corta em cinco e diz quantos sobraram', async ({ page }) => {
  const muitos = Array.from({ length: 8 }, (_, i) => ({
    id: 'f' + i, name: 'Fixo ' + i, amount: 50 + i, category: 'Contas',
    dueDay: 5, since: '2026-01-01',
  }));
  await abrir(page, { fixedExpenses: muitos });
  await expect(lista(page)).toHaveCount(5);
  await expect(page.locator('.home-atencao-mais')).toContainText('e mais 3');

  // "e mais N" leva à folha que tem TODOS os compromissos, não a uma aba de um
  // tipo só — o bloco deixou de ser sobre dívidas.
  await page.locator('.home-atencao-mais').click();
  await expect(page.locator('#modal-obrigacoes')).toHaveClass(/open/);
  await expect(page.locator('#obr-lista .obr-item')).toHaveCount(8);
});

test('dar baixa num fixo tira ele da lista, sem recarregar a tela', async ({ page }) => {
  await abrir(page, { fixedExpenses: [FIXO_VENCIDO], debts: [DIVIDA_ATRASADA] });
  await expect(page.locator('#home-dividas-venc')).toContainText('Internet');
  await page.evaluate(() => {
    // Caminho do produto: marca a baixa do ciclo e avisa a Início.
    const ciclo = window.fxCurrentCycle();
    D.fixedPayments.push({ id: 'fp1', fixedId: 'f1', cycle: ciclo, expenseId: null, paidDate: '2026-08-20' });
    window.refreshHomeFixosAlert();
  });
  await expect(page.locator('#home-dividas-venc'), 'a baixa não chegou à lista').not.toContainText('Internet');
  await expect(page.locator('#home-dividas-venc')).toContainText('Financiamento do carro');
});

test('a área de atenção é só leitura: não encosta em D nem chama save()', async ({ page }) => {
  await abrir(page, {
    debts: [DIVIDA_ATRASADA], fixedExpenses: [FIXO_VENCIDO], pendencias: [PEND_COM_VALOR, PEND_SEM_VALOR],
  });
  const antes = await lerEstado(page, 'JSON.stringify(D)');
  const salvou = await page.evaluate(() => {
    let n = 0; const s = window.save; window.save = () => { n++; return s && s(); };
    window._atencaoInicio(); window.renderHomeVencimentos(); window.switchTab('inicio');
    window.save = s; return n;
  });
  expect(salvou).toBe(0);
  expect(await lerEstado(page, 'JSON.stringify(D)')).toBe(antes);
});
