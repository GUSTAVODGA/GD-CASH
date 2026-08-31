// A fila de confirmações — o "ritmo" do app.
//
// O app inteiro era consulta sob demanda: respondia quando perguntado e nunca
// perguntava nada. Isso deixava um buraco que não aparecia em tela nenhuma —
// o dado que só o usuário sabe e que ninguém pedia. Você paga a internet e
// esquece de dar baixa; a lista de compromissos envelhece, e a sobra livre
// fica pessimista para sempre porque continua descontando algo que já saiu.
//
// O CAMINHO NÃO TOMADO, e é ele que estes testes protegem por oposição: um
// RITUAL SEMANAL, um resumo que aparece todo domingo pedindo revisão. Cerimônia
// obrigatória é o que faz app ser abandonado. A fila não tem agenda, não tem
// pop-up e não tem sequência: ela aparece só quando tem o que perguntar e some
// quando esvazia.
//
// O QUE ESTES TESTES PROTEGEM:
//
//   SÓ PERGUNTA O QUE PRECISA SER PERGUNTADO. Nada que ainda não venceu entra
//   na fila. Uma fila que enche de coisas prematuras vira ruído, o usuário
//   aprende a ignorá-la, e ela passa a ser exatamente o que existe para não
//   ser.
//
//   "SIM" RESOLVE PELO MESMO CAMINHO. Dar baixa pela fila tem de produzir o
//   MESMO lançamento que dar baixa pela tela de Gastos Fixos — duas verdades
//   sobre o que uma baixa é seria pior do que não ter fila.
//
//   "AINDA NÃO" NÃO INSISTE. Adia por uma semana sem tocar no dado.
//
//   O BURACO QUE A FILA REVELOU: até a v78 dava para lançar uma receita como A
//   RECEBER e dava para apagá-la, mas não dava para dizer que ela CHEGOU. Um
//   item pendente não entra em nenhum total, então o dinheiro que caiu na conta
//   ficava invisível até o usuário apagar e relançar.
import { test, expect } from '@playwright/test';
import { abrirAppEmDemo, semearDados, irParaAba, lerEstado } from './_helpers.js';

const AGORA = new Date(2026, 7, 20, 12, 0, 0);   // 20/08/2026

const BASE = {
  platforms: [{ id: 'p1', name: 'Fonte A', color: '#0C7A52' }],
  incomeItems: [], dailyIncome: {}, expenses: [], debtPayments: [], fixedPayments: [],
  debts: [], fixedExpenses: [], pendencias: [], vehicles: [], patrimonios: [],
  goals: [], reservaHistory: [], emergency: { current: 0, target: 0 },
  daysOff: [], reminders: [], confirmacoesAdiadas: {},
};

const FIXO_VENCIDO   = { id: 'f1', name: 'Internet', amount: 189.9, category: 'Contas', dueDay: 6,  since: '2026-01-01' };
const FIXO_A_VENCER  = { id: 'f2', name: 'Academia', amount: 120,   category: 'Saúde',  dueDay: 28, since: '2026-01-01' };
const REC_PENDENTE   = { id: 'i1', date: '2026-08-12', amount: 150, status: 'pending', platformId: 'p1', note: 'Site cliente' };
const REC_FUTURA     = { id: 'i2', date: '2026-08-29', amount: 300, status: 'pending', platformId: 'p1', note: 'Adiantamento' };
const PEND_VENCIDA   = { id: 'pd1', title: 'Trocar a torneira', category: 'casa', priority: 'media',
                         deadline: '2026-08-15', estimatedValue: 150, status: 'aberta', createdAt: '2026-08-01' };
const PEND_A_VENCER  = { id: 'pd2', title: 'Pintar o portão', category: 'casa', priority: 'baixa',
                         deadline: '2026-08-28', estimatedValue: 80, status: 'aberta', createdAt: '2026-08-01' };

const abrir = async (page, dados, aba = 'inicio') => {
  await page.setViewportSize({ width: 390, height: 844 });
  const erros = await abrirAppEmDemo(page, { agora: AGORA });
  await semearDados(page, { ...BASE, ...(dados || {}) }, aba);
  return erros;
};

const fila = page => page.evaluate(() => window._confirmacoesPendentes());
const titulos = page => page.evaluate(() => window._confirmacoesPendentes().map(i => i.titulo));

// ── Só pergunta o que precisa ser perguntado ──────────────────────────────

test('os três tipos entram na fila', async ({ page }) => {
  const erros = await abrir(page, {
    fixedExpenses: [FIXO_VENCIDO], incomeItems: [REC_PENDENTE], pendencias: [PEND_VENCIDA],
  });
  expect(await titulos(page)).toEqual(['Internet', 'Site cliente', 'Trocar a torneira']);
  // E cada um traz a sua pergunta, não uma genérica.
  const perguntas = (await fila(page)).map(i => i.pergunta);
  expect(perguntas).toEqual(['Já pagou?', 'Já caiu?', 'Resolveu?']);
  expect(erros).toEqual([]);
});

test('SÓ O QUE VENCEU: nada prematuro entra na fila', async ({ page }) => {
  await abrir(page, {
    fixedExpenses: [FIXO_A_VENCER],      // vence dia 28, hoje é 20
    incomeItems: [REC_FUTURA],           // lançada para o dia 29
    pendencias: [PEND_A_VENCER],         // prazo dia 28
  });
  expect(await titulos(page), 'a fila encheu de coisa que ainda não venceu').toEqual([]);
});

test('a fila some da Início quando não há o que perguntar', async ({ page }) => {
  await abrir(page, {});
  await expect(page.locator('#home-confirmar')).toBeEmpty();

  await page.evaluate(() => {
    window.eval('D').fixedExpenses.push({ id: 'f1', name: 'Internet', amount: 189.9,
      category: 'Contas', dueDay: 6, since: '2026-01-01' });
    window.renderHomeVencimentos();
  });
  await expect(page.locator('#home-confirmar')).toContainText('1 coisa para confirmar');
});

test('a faixa diz quantas são e de que tipo — sem repetir nomes', async ({ page }) => {
  await abrir(page, {
    fixedExpenses: [FIXO_VENCIDO], incomeItems: [REC_PENDENTE], pendencias: [PEND_VENCIDA],
  });
  const faixa = page.locator('#home-confirmar');
  await expect(faixa).toContainText('3 coisas para confirmar');
  await expect(faixa).toContainText('1 gasto fixo · 1 receita · 1 pendência');
  // Nomear o primeiro item o faria aparecer duas vezes na mesma tela: aqui e
  // na lista de atenção logo abaixo. O tipo informa sem gaguejar.
  await expect(faixa, 'a faixa voltou a repetir o nome do item').not.toContainText('Internet');
});

test('a ordem é do mais antigo primeiro', async ({ page }) => {
  // Quem espera há mais tempo pergunta primeiro.
  await abrir(page, {
    fixedExpenses: [FIXO_VENCIDO],                  // venceu 06/08
    pendencias: [PEND_VENCIDA],                     // venceu 15/08
    incomeItems: [REC_PENDENTE],                    // lançada 12/08
  });
  expect(await titulos(page)).toEqual(['Internet', 'Site cliente', 'Trocar a torneira']);
});

// ── "Sim" resolve pelo mesmo caminho ──────────────────────────────────────

test('"Sim" num gasto fixo dá baixa PELO MESMO CAMINHO da tela de Fixos', async ({ page }) => {
  await abrir(page, { fixedExpenses: [FIXO_VENCIDO] });
  await page.evaluate(() => window.confirmarItem('fixo', 'f1'));

  // O vínculo do ciclo e o lançamento, idênticos ao que `confirmBaixa` cria.
  const st = await page.evaluate(() => {
    const D = window.eval('D');
    return { pagamentos: D.fixedPayments, despesas: D.expenses };
  });
  expect(st.pagamentos.length, 'a baixa não registrou o ciclo').toBe(1);
  expect(st.pagamentos[0].fixedId).toBe('f1');
  expect(st.despesas.length, 'a baixa não criou o lançamento').toBe(1);
  expect(st.despesas[0].amount).toBe(189.9);
  expect(st.despesas[0].meta.source, 'o lançamento perdeu a marca de origem').toBe('fixed-payment');
  expect(st.despesas[0].meta.fixedId).toBe('f1');
  // A data é a da confirmação, não a do vencimento — como sempre foi na baixa.
  expect(st.despesas[0].date).toBe('2026-08-20');

  // E sai da fila.
  expect(await titulos(page)).toEqual([]);
});

test('"Sim" num gasto fixo corrige a Início na hora', async ({ page }) => {
  await abrir(page, {
    incomeItems: [{ id: 'i9', date: '2026-08-04', amount: 5000, status: 'paid', platformId: 'p1' }],
    fixedExpenses: [FIXO_VENCIDO],
  });
  // Antes: 5.000 de entrada, nada gasto, 189,90 ainda a vencer.
  const antes = await page.evaluate(() => window._sobraLivre(0));
  expect(antes.aVencer).toBe(189.9);
  expect(antes.sobra).toBe(5000 - 189.9);

  await page.evaluate(() => window.confirmarItem('fixo', 'f1'));

  // Depois: o dinheiro saiu de verdade. A sobra não muda — mudou de lado.
  const depois = await page.evaluate(() => window._sobraLivre(0));
  expect(depois.saiu, 'a baixa não virou saída de caixa').toBe(189.9);
  expect(depois.aVencer, 'continua descontando algo que já saiu').toBe(0);
  expect(depois.sobra).toBe(5000 - 189.9);
  await expect(page.locator('#home-dividas-venc')).not.toContainText('Internet');
});

test('"Sim" numa receita a receber faz o dinheiro aparecer', async ({ page }) => {
  // O buraco original: um item pendente não entra em NENHUM total.
  await abrir(page, { incomeItems: [REC_PENDENTE] });
  expect(await page.evaluate(() => window.sumMonthIncome(0)),
    'receita pendente já contava como recebida').toBe(0);

  await page.evaluate(() => window.confirmarItem('receita', 'i1'));

  expect(await page.evaluate(() => window.sumMonthIncome(0)),
    'confirmar não fez o dinheiro entrar').toBe(150);
  const it = await page.evaluate(() => window.eval('D').incomeItems[0]);
  expect(it.status).toBe('paid');
  // A nota e o valor sobrevivem — antes só dava para apagar e relançar.
  expect(it.note).toBe('Site cliente');
  expect(it.amount).toBe(150);
  // A data passa a ser a do recebimento, não a do lançamento.
  expect(it.date, 'a receita entrou no caixa na data errada').toBe('2026-08-20');
});

test('"Sim" numa pendência conclui', async ({ page }) => {
  await abrir(page, { pendencias: [PEND_VENCIDA] });
  await page.evaluate(() => window.confirmarItem('pendencia', 'pd1'));
  const p = await page.evaluate(() => window.eval('D').pendencias[0]);
  expect(p.status).toBe('concluida');
  expect(p.completedAt).toBe('2026-08-20');
  expect(await titulos(page)).toEqual([]);
});

// ── "Ainda não" não insiste ───────────────────────────────────────────────

test('"Ainda não" adia por uma semana SEM tocar no dado', async ({ page }) => {
  await abrir(page, { fixedExpenses: [FIXO_VENCIDO] });
  const antesFixos = await lerEstado(page, 'JSON.stringify(D.fixedExpenses)');

  await page.evaluate(() => window.adiarConfirmacao('fixo:f1:2026-08'));

  expect(await titulos(page), 'adiar não tirou da fila').toEqual([]);
  await expect(page.locator('#home-confirmar')).toBeEmpty();
  // Nada foi pago, nada foi lançado: adiar é sobre a PERGUNTA, não sobre o dado.
  expect(await lerEstado(page, 'D.fixedPayments.length')).toBe(0);
  expect(await lerEstado(page, 'D.expenses.length')).toBe(0);
  expect(await lerEstado(page, 'JSON.stringify(D.fixedExpenses)')).toBe(antesFixos);
  // E o compromisso continua na área de atenção — ele não deixou de existir.
  await expect(page.locator('#home-dividas-venc')).toContainText('Internet');
});

test('o adiamento EXPIRA — a pergunta volta, não some para sempre', async ({ page }) => {
  await abrir(page, { fixedExpenses: [FIXO_VENCIDO] });
  await page.evaluate(() => window.adiarConfirmacao('fixo:f1:2026-08'));
  expect(await titulos(page)).toEqual([]);

  const ate = await page.evaluate(() => window.eval('D').confirmacoesAdiadas['fixo:f1:2026-08']);
  expect(ate, 'adiou por outro prazo que não uma semana').toBe('2026-08-27');

  // Passado o prazo, volta a perguntar.
  await page.evaluate(() => {
    window.eval('D').confirmacoesAdiadas['fixo:f1:2026-08'] = '2026-08-19';
  });
  expect(await titulos(page), 'o adiamento virou permanente').toEqual(['Internet']);
});

// ── O buraco que a fila revelou ───────────────────────────────────────────

test('a receita a receber ganhou botão onde ela mora, não só na fila', async ({ page }) => {
  // Consertar o buraco só dentro da fila deixaria a tela do dia — onde o item
  // de verdade está — ainda sem saída.
  await abrir(page, { incomeItems: [REC_PENDENTE] }, 'semana');
  const marcou = await page.evaluate(() => {
    window.renderIncomeItems('2026-08-12');
    const btn = document.querySelector('.iitem-receber');
    if (!btn) return 'sem botão';
    btn.click();
    return window.eval('D').incomeItems[0].status;
  });
  expect(marcou, 'a linha da receita pendente continua sem como confirmar').toBe('paid');
});

test('marcar como recebida não mexe em quem já está recebida', async ({ page }) => {
  await abrir(page, {
    incomeItems: [{ id: 'i1', date: '2026-08-04', amount: 500, status: 'paid', platformId: 'p1' }],
  });
  const mudou = await page.evaluate(() => window.marcarReceitaRecebida('i1'));
  expect(mudou).toBe(false);
  expect(await page.evaluate(() => window.eval('D').incomeItems[0].date),
    'reescreveu a data de uma receita já recebida').toBe('2026-08-04');
});

// ── A folha ───────────────────────────────────────────────────────────────

test('a folha abre pela faixa e resolve item a item', async ({ page }) => {
  await abrir(page, {
    fixedExpenses: [FIXO_VENCIDO], incomeItems: [REC_PENDENTE], pendencias: [PEND_VENCIDA],
  });
  await page.locator('.home-conf-faixa').click();
  await expect(page.locator('#modal-confirmar')).toHaveClass(/open/);
  await expect(page.locator('#confirmar-titulo')).toHaveText('3 coisas para confirmar');
  await expect(page.locator('.conf-item')).toHaveCount(3);

  // Resolver um encolhe a fila sem fechar a folha: dá para parar no meio.
  await page.locator('.conf-item', { hasText: 'Internet' }).locator('.conf-sim').click();
  await expect(page.locator('.conf-item')).toHaveCount(2);
  await expect(page.locator('#confirmar-titulo')).toHaveText('2 coisas para confirmar');
  await expect(page.locator('#modal-confirmar'), 'a folha fechou sozinha no meio').toHaveClass(/open/);
});

test('a folha vazia explica quando a pergunta aparece', async ({ page }) => {
  await abrir(page, {});
  await page.evaluate(() => window.abrirConfirmacoes());
  await expect(page.locator('#confirmar-titulo')).toHaveText('Tudo confirmado');
  await expect(page.locator('.conf-vazio')).toContainText('Nada pendente de confirmação');
});

test('montar a fila é só leitura: não encosta em D nem chama save()', async ({ page }) => {
  await abrir(page, {
    fixedExpenses: [FIXO_VENCIDO], incomeItems: [REC_PENDENTE], pendencias: [PEND_VENCIDA],
  });
  const antes = await lerEstado(page, 'JSON.stringify(D)');
  const salvou = await page.evaluate(() => {
    let n = 0; const s = window.save; window.save = () => { n++; return s && s(); };
    window._confirmacoesPendentes(); window.renderConfirmacoes(); window.renderHomeConfirmar();
    window.save = s; return n;
  });
  expect(salvou).toBe(0);
  expect(await lerEstado(page, 'JSON.stringify(D)')).toBe(antes);
});
