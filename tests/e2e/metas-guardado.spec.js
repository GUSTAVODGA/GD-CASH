// Reserva vira meta: um só motor para todo dinheiro guardado.
//
// Eram duas telas com a MESMA FORMA e mecânicas incompatíveis:
//
//   · a Reserva tinha um LIVRO-RAZÃO — aporte e retirada com data, nota e
//     edição —, o invariante de nunca ficar negativa em ponto nenhum da linha
//     do tempo, e presença no caixa.
//
//   · a Meta tinha um NÚMERO SOLTO. "Adicionar valor" só somava, nunca tirava,
//     e o dinheiro NÃO SAÍA DO CAIXA em lugar nenhum. Você separava R$ 5.000
//     para uma viagem e a Início continuava dizendo que esse dinheiro estava
//     livre para gastar.
//
// O QUE ESTES TESTES PROTEGEM:
//
//   O BUG QUE A FUSÃO CORRIGE. Guardar numa meta agora tira do dinheiro
//   disponível, e retirar devolve. É o erro para mais — o que faz gastar —
//   morrendo no último lugar onde ele ainda morava.
//
//   A MIGRAÇÃO NÃO INVENTA E NÃO PERDE. Dois riscos opostos, os dois testados:
//     · não perder — o saldo que o usuário via continua idêntico, inclusive
//       quando os dados legados eram INCONSISTENTES (o saldo declarado não
//       batia com a soma do razão, caso que o app antigo só sabia denunciar);
//     · não inventar — o `saved` de uma meta antiga vira SALDO INICIAL, não um
//       aporte datado de hoje. Datar hoje faria a Início afirmar que você
//       guardou aquele dinheiro neste mês e derrubaria a sobra livre por um
//       evento que nunca aconteceu.
//
//   O INVARIANTE SOBREVIVEU À GENERALIZAÇÃO. Não se retira mais do que há —
//   agora por meta, e contando o saldo inicial.
//
//   NADA FICOU INALCANÇÁVEL. A tela da Reserva não existe mais; quem for até
//   ela chega em Metas.
import { test, expect } from '@playwright/test';
import { abrirAppEmDemo, semearDados, irParaAba, lerEstado } from './_helpers.js';

const AGORA = new Date(2026, 7, 20, 12, 0, 0);   // 20/08/2026

const BASE = {
  platforms: [{ id: 'p1', name: 'Fonte A', color: '#0C7A52' }],
  incomeItems: [{ id: 'i1', date: '2026-08-04', amount: 5000, status: 'paid', platformId: 'p1' }],
  dailyIncome: {},
  expenses: [{ id: 'e1', date: '2026-08-05', amount: 1000, category: 'Alimentação', description: 'Mercado' }],
  debtPayments: [], fixedPayments: [], debts: [], fixedExpenses: [], pendencias: [],
  vehicles: [], patrimonios: [], daysOff: [], reminders: [],
};

/** Estado no formato NOVO, com a reserva já como meta. */
const comMetas = goals => ({ ...BASE, goals, emergency: { current: 0, target: 0 }, reservaHistory: [] });

/** Estado no formato ANTIGO, como um backup de antes da fusão. */
const legado = (emergency, reservaHistory, goals) => ({
  ...BASE, emergency, reservaHistory, goals: goals || [],
});

const RESERVA_ID = 'meta-reserva';
const metaReserva = (over) => ({
  id: RESERVA_ID, sistema: true, name: 'Reserva de emergência', emoji: '🛡️',
  target: 10000, deadline: '', note: '', lastNotif: '', saldoInicial: 0, historico: [], ...over,
});

const abrir = async (page, dados, aba = 'metas') => {
  await page.setViewportSize({ width: 390, height: 844 });
  const erros = await abrirAppEmDemo(page, { agora: AGORA });
  await semearDados(page, dados, aba);
  return erros;
};

const cartoes = page => page.locator('#goals-list .goal-card');
const saldoDe = (page, nome) =>
  page.locator('.goal-card', { hasText: nome }).locator('.goal-saved-txt');

// ── O bug que a fusão corrige ─────────────────────────────────────────────

test('O BUG CORRIGIDO: guardar numa meta tira do dinheiro disponível', async ({ page }) => {
  // Antes da fusão este era o buraco: `saved` subia e o caixa não sentia nada.
  await abrir(page, comMetas([
    metaReserva(),
    { id: 'g1', name: 'Viagem', emoji: '🏖️', target: 3000, deadline: '2026-12-01',
      saldoInicial: 0, historico: [] },
  ]), 'inicio');

  const antes = await page.evaluate(() => window._sobraLivre(0).sobra);
  expect(antes, 'cenário base: 5.000 − 1.000, nada guardado').toBe(4000);

  await page.evaluate(() => {
    const D = window.eval('D');
    D.goals.find(g => g.id === 'g1').historico.push(
      { id: 'm1', type: 'dep', amount: 700, note: '', date: '2026-08-12' });
  });

  const depois = await page.evaluate(() => window._sobraLivre(0));
  expect(depois.reserva, 'o que foi guardado na meta não entrou no "guardado" do mês').toBe(700);
  expect(depois.sobra, 'guardar numa meta não tirou do dinheiro disponível').toBe(3300);
});

test('retirar de uma meta devolve o dinheiro ao caixa', async ({ page }) => {
  await abrir(page, comMetas([
    metaReserva(),
    { id: 'g1', name: 'Viagem', emoji: '🏖️', target: 3000, deadline: '2026-12-01',
      saldoInicial: 0,
      historico: [
        { id: 'm1', type: 'dep', amount: 700, note: '', date: '2026-08-12' },
        { id: 'm2', type: 'ret', amount: 200, note: '', date: '2026-08-15' },
      ] },
  ]), 'inicio');
  const c = await page.evaluate(() => window._sobraLivre(0));
  expect(c.reserva, 'o guardado do mês deveria ser líquido (dep − ret)').toBe(500);
  expect(c.sobra).toBe(3500);
});

test('o guardado do mês soma a reserva e as metas, no mesmo balde', async ({ page }) => {
  await abrir(page, comMetas([
    metaReserva({ historico: [{ id: 'r1', type: 'dep', amount: 300, note: '', date: '2026-08-10' }] }),
    { id: 'g1', name: 'Viagem', emoji: '🏖️', target: 3000, deadline: '2026-12-01',
      saldoInicial: 0,
      historico: [{ id: 'm1', type: 'dep', amount: 450, note: '', date: '2026-08-12' }] },
  ]), 'inicio');
  expect(await page.evaluate(() => window.sumMonthReserva(0))).toBe(750);
});

// ── A migração ────────────────────────────────────────────────────────────

test('MIGRAÇÃO NÃO PERDE: o saldo da reserva antiga continua idêntico', async ({ page }) => {
  await abrir(page, legado(
    { current: 3200, target: 10000 },
    [
      { id: 'rh1', type: 'dep', amount: 1500, note: 'Reserva mensal', date: '2026-06-05' },
      { id: 'rh2', type: 'dep', amount: 2000, note: 'Salário extra', date: '2026-07-05' },
      { id: 'rh3', type: 'ret', amount: 300, note: 'Urgência', date: '2026-07-20' },
    ], []));

  const g = await page.evaluate(() => window._metaReserva());
  expect(g, 'a reserva antiga não virou meta').toBeTruthy();
  expect(await page.evaluate(() => window._metaSaldo(window._metaReserva())),
    'o saldo que o usuário via mudou na migração').toBe(3200);
  expect(g.target).toBe(10000);
  // E todo movimento continua lá, alcançável.
  expect((g.historico || []).length, 'movimentos do razão sumiram').toBe(3);
  await expect(page.locator('#goals-list')).toContainText('Reserva mensal');
  await expect(page.locator('#goals-list')).toContainText('Urgência');
});

test('MIGRAÇÃO NÃO PERDE: saldo legado INCONSISTENTE é absorvido, não rejeitado', async ({ page }) => {
  // O app antigo tinha um `_reservaLegacyCheck` que detectava a divergência
  // entre o saldo declarado e a soma do razão — e travava novos aportes até
  // alguém consertar à mão. Aqui os 3.200 declarados não batem com os 1.000 do
  // razão; a diferença vira saldo inicial e o app segue andando.
  await abrir(page, legado(
    { current: 3200, target: 10000 },
    [{ id: 'rh1', type: 'dep', amount: 1000, note: 'Aporte', date: '2026-06-05' }], []));

  const saldo = await page.evaluate(() => window._metaSaldo(window._metaReserva()));
  expect(saldo, 'o saldo que o usuário via foi descartado').toBe(3200);
  const g = await page.evaluate(() => window._metaReserva());
  expect(g.saldoInicial, 'a divergência não foi absorvida como saldo inicial').toBe(2200);
});

test('MIGRAÇÃO NÃO INVENTA: `saved` vira saldo inicial, não movimento deste mês', async ({ page }) => {
  // O risco: converter `saved: 5000` num aporte datado de hoje. A Início
  // passaria a afirmar que você guardou 5.000 NESTE mês e a sobra livre
  // desabaria por um evento que nunca aconteceu.
  await abrir(page, legado(
    { current: 0, target: 0 },
    [],
    [{ id: 'g1', name: 'Viagem', emoji: '🏖️', target: 8000, saved: 5000,
       deadline: '2026-12-01', note: '', lastNotif: '' }]), 'inicio');

  const c = await page.evaluate(() => window._sobraLivre(0));
  expect(c.reserva, 'o `saved` antigo virou um aporte deste mês').toBe(0);
  expect(c.sobra, 'a sobra livre caiu por um movimento que nunca existiu').toBe(4000);

  // Mas o dinheiro continua contado como guardado na meta.
  await irParaAba(page, 'metas');
  await expect(saldoDe(page, 'Viagem')).toContainText('R$ 5.000,00');
});

test('MIGRAÇÃO É IDEMPOTENTE: rodar de novo não duplica nem reescreve', async ({ page }) => {
  await abrir(page, legado(
    { current: 3200, target: 10000 },
    [{ id: 'rh1', type: 'dep', amount: 3200, note: 'Aporte', date: '2026-06-05' }], []));

  // Primeira passada: converte de verdade.
  const primeira = await page.evaluate(() => window._migrateReservaParaMeta());
  expect(primeira.ran, 'a primeira passada não converteu nada').toBe(true);
  const antes = await lerEstado(page, 'JSON.stringify(D.goals)');

  // Segunda e terceira: não têm o que fazer, e não podem tocar em nada.
  const segunda = await page.evaluate(() => window._migrateReservaParaMeta());
  await page.evaluate(() => window._migrateReservaParaMeta());
  expect(segunda.ran, 'a migração se disse necessária uma segunda vez').toBe(false);
  expect(await lerEstado(page, 'JSON.stringify(D.goals)'),
    'uma passada seguinte alterou os dados').toBe(antes);
  const reservas = await page.evaluate(() =>
    window.eval('D').goals.filter(g => g.id === 'meta-reserva').length);
  expect(reservas, 'a reserva foi duplicada').toBe(1);
});

// ── O invariante ──────────────────────────────────────────────────────────

test('INVARIANTE: não se retira mais do que a meta tem', async ({ page }) => {
  await abrir(page, comMetas([
    metaReserva({ historico: [{ id: 'r1', type: 'dep', amount: 500, note: '', date: '2026-08-01' }] }),
  ]));
  await page.evaluate(() => {
    window.openResModal('ret', 'meta-reserva');
    document.getElementById('rm-val').value = '900';
    document.getElementById('rm-date').value = '2026-08-15';
    window.saveResMove('ret');
  });
  // Nada foi gravado, e a folha continua aberta para correção.
  const hist = await page.evaluate(() =>
    window.eval('D').goals.find(g => g.id === 'meta-reserva').historico.length);
  expect(hist, 'a retirada impossível foi gravada').toBe(1);
  await expect(page.locator('#modal-res')).toHaveClass(/open/);
});

test('INVARIANTE: o saldo inicial conta — dá para retirar do que já estava lá', async ({ page }) => {
  // Regressão específica da generalização: se `_reservaEval` começasse do zero,
  // uma meta migrada (só com saldo inicial, sem razão) recusaria toda retirada.
  await abrir(page, comMetas([
    metaReserva({ saldoInicial: 1000, historico: [] }),
  ]));
  await page.evaluate(() => {
    window.openResModal('ret', 'meta-reserva');
    document.getElementById('rm-val').value = '400';
    document.getElementById('rm-date').value = '2026-08-15';
    window.saveResMove('ret');
  });
  const saldo = await page.evaluate(() => window._metaSaldo(window._metaReserva()));
  expect(saldo, 'a retirada sobre saldo inicial foi recusada').toBe(600);
});

test('INVARIANTE: cada meta responde pelo próprio saldo', async ({ page }) => {
  // Com um razão só, o dinheiro da reserva sustentaria uma retirada da viagem.
  await abrir(page, comMetas([
    metaReserva({ saldoInicial: 5000 }),
    { id: 'g1', name: 'Viagem', emoji: '🏖️', target: 3000, deadline: '2026-12-01',
      saldoInicial: 100, historico: [] },
  ]));
  await page.evaluate(() => {
    window.openResModal('ret', 'g1');
    document.getElementById('rm-val').value = '500';
    document.getElementById('rm-date').value = '2026-08-15';
    window.saveResMove('ret');
  });
  const saldo = await page.evaluate(() =>
    window._metaSaldo(window.eval('D').goals.find(g => g.id === 'g1')));
  expect(saldo, 'a viagem sacou do dinheiro da reserva').toBe(100);
});

// ── A tela ────────────────────────────────────────────────────────────────

test('a reserva é a PRIMEIRA meta, e usa o mesmo cartão das outras', async ({ page }) => {
  const erros = await abrir(page, comMetas([
    { id: 'g1', name: 'Viagem', emoji: '🏖️', target: 3000, deadline: '2026-12-01',
      saldoInicial: 500, historico: [] },
    metaReserva({ saldoInicial: 3200 }),
  ]));
  const nomes = await page.locator('#goals-list .goal-name').allTextContents();
  expect(nomes[0], 'a reserva não veio na frente').toBe('Reserva de emergência');
  expect(nomes).toContain('Viagem');
  // Mesmo cartão: se a reserva tivesse enfeite próprio, continuaria sendo
  // outra coisa na cabeça de quem olha e a fusão seria só de arquivo.
  await expect(cartoes(page)).toHaveCount(2);
  for (const i of [0, 1]) {
    await expect(cartoes(page).nth(i).locator('.goal-bar-wrap')).toHaveCount(1);
    await expect(cartoes(page).nth(i).locator('.meta-acoes')).toHaveCount(1);
  }
  expect(erros).toEqual([]);
});

test('a reserva não se exclui', async ({ page }) => {
  await abrir(page, comMetas([metaReserva({ saldoInicial: 3200 })]));
  const cartao = page.locator('.goal-card', { hasText: 'Reserva de emergência' });
  await expect(cartao.locator('.icon-btn-del'), 'a reserva ganhou botão de excluir').toHaveCount(0);
  // E nem pela porta dos fundos.
  await page.evaluate(() => window.deleteGoal('meta-reserva'));
  expect(await page.evaluate(() =>
    window.eval('D').goals.filter(g => g.id === 'meta-reserva').length)).toBe(1);
});

test('NADA FICOU INALCANÇÁVEL: quem for à Reserva chega em Metas', async ({ page }) => {
  await abrir(page, comMetas([metaReserva({ saldoInicial: 3200 })]), 'inicio');
  await page.evaluate(() => window.switchTab('reserva'));
  await expect(page.locator('#page-metas')).toHaveClass(/active/);
  await expect(page.locator('#page-metas')).toContainText('Reserva de emergência');
});

test('o histórico mostra três e expande para todos', async ({ page }) => {
  const movs = Array.from({ length: 6 }, (_, i) => ({
    id: 'm' + i, type: 'dep', amount: 100 + i, note: 'Aporte ' + i,
    date: `2026-08-0${i + 1}`,
  }));
  await abrir(page, comMetas([metaReserva({ historico: movs })]));
  const linhas = page.locator('.goal-card .res-hist-item');
  await expect(linhas).toHaveCount(3);
  await page.locator('.meta-hist-mais').click();
  await expect(linhas).toHaveCount(6);
  await expect(page.locator('.meta-hist-mais')).toContainText('Mostrar menos');
});

test('guardar pela tela move dinheiro de verdade, com data e nota', async ({ page }) => {
  await abrir(page, comMetas([
    metaReserva(),
    { id: 'g1', name: 'Viagem', emoji: '🏖️', target: 3000, deadline: '2026-12-01',
      saldoInicial: 0, historico: [] },
  ]));
  await page.locator('.goal-card', { hasText: 'Viagem' })
    .locator('.meta-acao', { hasText: 'Guardar' }).click();
  await expect(page.locator('#modal-res')).toHaveClass(/open/);
  await page.fill('#rm-val', '250');
  await page.fill('#rm-date', '2026-08-14');
  await page.fill('#rm-note', 'Sobra do mês');
  await page.click('#res-modal-body .btn-primary');

  await expect(saldoDe(page, 'Viagem')).toContainText('R$ 250,00');
  const mov = await page.evaluate(() =>
    window.eval('D').goals.find(g => g.id === 'g1').historico[0]);
  expect(mov.amount).toBe(250);
  expect(mov.date).toBe('2026-08-14');
  expect(mov.note).toBe('Sobra do mês');
  // E saiu do dinheiro disponível.
  expect(await page.evaluate(() => window.sumMonthReserva(0))).toBe(250);
});

test('a tela de metas é só leitura: renderizar não encosta em D nem salva', async ({ page }) => {
  await abrir(page, comMetas([
    metaReserva({ saldoInicial: 3200, historico: [{ id: 'r1', type: 'dep', amount: 100, note: '', date: '2026-08-02' }] }),
    { id: 'g1', name: 'Viagem', emoji: '🏖️', target: 3000, deadline: '2026-12-01',
      saldoInicial: 500, historico: [] },
  ]));
  const antes = await lerEstado(page, 'JSON.stringify(D)');
  const salvou = await page.evaluate(() => {
    let n = 0; const s = window.save; window.save = () => { n++; return s && s(); };
    window.renderGoals(); window.switchTab('metas');
    window.save = s; return n;
  });
  expect(salvou).toBe(0);
  expect(await lerEstado(page, 'JSON.stringify(D)')).toBe(antes);
});
