// A manchete da Início responde "posso gastar isto?".
//
// O número grande da Início era o RESULTADO DO MÊS: entrou menos saiu. Olha
// para trás. Quem abre o app parado na frente de uma compra não quer saber o
// que já aconteceu — quer saber se dá. E o resultado do mês responde essa
// pergunta ERRADO PARA MAIS: ignora o aluguel que vence dia 30 e conta como
// disponível o dinheiro que já tem dono.
//
// A sobra livre responde certo:
//     entrou − saiu − guardado na reserva − o que ainda vence
//
// O QUE ESTES TESTES PROTEGEM:
//
//   O ERRO QUE CUSTA CARO É PARA MAIS. Um número otimista faz gastar dinheiro
//   que não existe; um pessimista só faz segurar. Por isso as duas decisões de
//   escopo puxam para o conservador de um lado e para o honesto do outro:
//     · compromisso ATRASADO de outro mês ENTRA no desconto — ele ainda vai
//       sair do bolso, e ignorá-lo infla a sobra;
//     · compromisso SEM DATA fica FORA — não dá para afirmar que cai neste
//       mês, e descontar sem base seria inventar pessimismo.
//
//   A PRESTAÇÃO DE CONTAS. A sobra é diferente do "entrou menos saiu" que
//   aparece logo abaixo dela. Sem dizer o que foi descontado, essa distância
//   parece erro de conta e o número perde a confiança.
//
//   O RESULTADO DO MÊS NÃO SUMIU. Perdeu a manchete, não o lugar.
//
//   O ROTULO NUNCA MENTE. "Sobra livre até o fim do mês" não quer dizer nada
//   num mês fechado nem num que não começou. Ali a manchete volta a ser o
//   resultado — e o rótulo volta junto, no mesmo instante.
import { test, expect } from '@playwright/test';
import { abrirAppEmDemo, semearDados, lerEstado } from './_helpers.js';

const AGORA = new Date(2026, 7, 20, 12, 0, 0);   // 20/08/2026 — agosto tem 31 dias

const BASE = {
  platforms: [{ id: 'p1', name: 'Fonte A', color: '#0C7A52' }],
  incomeItems: [], dailyIncome: {}, expenses: [], debtPayments: [], fixedPayments: [],
  debts: [], fixedExpenses: [], pendencias: [], vehicles: [], patrimonios: [],
  reservaHistory: [], goals: [], daysOff: [], reminders: [],
  emergency: { current: 0, target: 0 },
};

const rec = (id, d, v) => ({ id, date: d, amount: v, status: 'paid', platformId: 'p1', note: '' });
const gasto = (id, d, v) => ({ id, date: d, amount: v, category: 'Alimentação', description: 'Mercado' });

// Cenário monetário estável, usado por quase todos os testes:
//   entrou 5.000,00 · saiu 1.200,00  →  resultado do mês 3.800,00
const DINHEIRO = {
  incomeItems: [rec('i1', '2026-08-04', 5000)],
  expenses: [gasto('e1', '2026-08-05', 1200)],
};

// Vence dia 28 de agosto, dentro do mês: 400,00.
const FIXO_A_VENCER = { id: 'f1', name: 'Aluguel', amount: 400, category: 'Casa', dueDay: 28, since: '2026-01-01' };
// Pendência com valor ESTIMADO — contamina o total com incerteza.
const PEND_ESTIMADA = { id: 'p1', title: 'Trocar a torneira', category: 'casa', priority: 'media',
  deadline: '2026-08-25', estimatedValue: 150, status: 'aberta', createdAt: '2026-08-01' };

const abrir = async (page, dados) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const erros = await abrirAppEmDemo(page, { agora: AGORA });
  await semearDados(page, { ...BASE, ...DINHEIRO, ...(dados || {}) }, 'inicio');
  return erros;
};

/** A conta que o produto faz, lida direto da fonte. */
const conta = page => page.evaluate(() => window._sobraLivre(0));

test('a manchete é a sobra livre, e o rótulo diz isso', async ({ page }) => {
  const erros = await abrir(page, { fixedExpenses: [FIXO_A_VENCER] });
  await expect(page.locator('#home-bal-label')).toHaveText('Sobra livre até o fim do mês');
  // 5.000 − 1.200 − 0 − 400 = 3.400,00
  await expect(page.locator('#home-balance')).toHaveText('R$ 3.400,00');
  expect(erros).toEqual([]);
});

test('a conta é entrou − saiu − reserva − o que ainda vence', async ({ page }) => {
  await abrir(page, {
    fixedExpenses: [FIXO_A_VENCER],
    reservaHistory: [{ date: '2026-08-10', type: 'dep', amount: 300 }],
  });
  const c = await conta(page);
  expect(c.entrou).toBe(5000);
  expect(c.saiu).toBe(1200);
  expect(c.reserva).toBe(300);
  expect(c.aVencer).toBe(400);
  expect(c.sobra, 'a conta da sobra mudou de forma').toBe(5000 - 1200 - 300 - 400);
  await expect(page.locator('#home-balance')).toHaveText('R$ 3.100,00');
});

test('depósito na reserva desconta; retirada volta ao caixa e não desconta', async ({ page }) => {
  // O app trata a reserva como dinheiro FORA do caixa: o depósito não é
  // "saída" e por isso não está em `saiu`. Se a sobra também não o descontasse,
  // ela contaria como gastável um dinheiro que já foi guardado.
  await abrir(page, { reservaHistory: [{ date: '2026-08-10', type: 'dep', amount: 500 }] });
  expect((await conta(page)).sobra, 'o depósito na reserva não foi descontado').toBe(3300);

  // Retirada líquida: o dinheiro voltou para o caixa e está disponível de novo.
  await abrir(page, {
    reservaHistory: [{ date: '2026-08-10', type: 'dep', amount: 200 },
                     { date: '2026-08-12', type: 'ret', amount: 500 }],
  });
  const c = await conta(page);
  expect(c.reserva, 'a reserva do mês deveria ser líquida (dep − ret)').toBe(-300);
  expect(c.sobra, 'o saque da reserva não voltou ao caixa').toBe(3800 + 300);
});

test('ERRO PARA MAIS: compromisso atrasado de outro mês entra no desconto', async ({ page }) => {
  // Fixo que venceu dia 6 e não teve baixa: já está em atraso. Ele ainda vai
  // sair do bolso — deixá-lo de fora inflaria a sobra.
  await abrir(page, {
    fixedExpenses: [{ id: 'f9', name: 'Internet', amount: 189.9, category: 'Contas',
                      dueDay: 6, since: '2026-01-01' }],
  });
  const c = await conta(page);
  expect(c.aVencer, 'o atrasado sumiu da conta').toBe(189.9);
  expect(c.sobra).toBe(3800 - 189.9);
});

test('ERRO PARA MENOS: compromisso sem data fica fora da conta', async ({ page }) => {
  // Pendência de alta prioridade, com valor, mas sem prazo: aparece na lista de
  // "o que precisa de você" (ela precisa de você), e não entra na sobra
  // (ninguém pode afirmar que ela cai neste mês).
  await abrir(page, {
    pendencias: [{ id: 'p9', title: 'Renovar o seguro', category: 'veiculo', priority: 'alta',
                   deadline: '', estimatedValue: 900, status: 'aberta', createdAt: '2026-08-01' }],
  });
  await expect(page.locator('#home-dividas-venc'), 'a pendência sumiu da lista').toContainText('Renovar o seguro');
  const c = await conta(page);
  expect(c.aVencer, 'compromisso sem data entrou na conta').toBe(0);
  expect(c.sobra).toBe(3800);
});

test('compromisso que vence DEPOIS do fim do mês fica fora', async ({ page }) => {
  // A pergunta é "quanto sobra até o fim de AGOSTO". O que vence em setembro
  // será descontado da sobra de setembro, quando houver a receita de setembro
  // para sustentá-lo.
  const pend = (id, prazo) => ({ id, title: 'Conserto ' + id, category: 'casa', priority: 'media',
    deadline: prazo, estimatedValue: 700, status: 'aberta', createdAt: '2026-08-01' });

  await abrir(page, { pendencias: [pend('p8', '2026-09-15')] });
  expect((await conta(page)).aVencer, 'compromisso de setembro pesou em agosto').toBe(0);

  // A mesma pendência dentro do mês pesa — prova que o teste acima não passou
  // por a pendência simplesmente não entrar na espinha.
  await abrir(page, { pendencias: [pend('p8', '2026-08-29')] });
  expect((await conta(page)).aVencer).toBe(700);
});

test('PRESTAÇÃO DE CONTAS: a linha de apoio diz o que foi descontado', async ({ page }) => {
  await abrir(page, {
    fixedExpenses: [FIXO_A_VENCER],
    reservaHistory: [{ date: '2026-08-10', type: 'dep', amount: 300 }],
  });
  const sub = page.locator('#home-bal-sub');
  await expect(sub).toBeVisible();
  await expect(sub).toContainText('R$ 400,00');
  await expect(sub, 'não diz quantos compromissos compõem o desconto').toContainText('1 compromisso');
  await expect(sub, 'a reserva foi descontada em silêncio').toContainText('R$ 300,00');
  await expect(sub).toContainText('guardados na reserva');
});

test('PRESTAÇÃO DE CONTAS: "cerca de" quando há estimativa na composição', async ({ page }) => {
  await abrir(page, { fixedExpenses: [FIXO_A_VENCER], pendencias: [PEND_ESTIMADA] });
  expect((await conta(page)).temEstimativa).toBe(true);
  await expect(page.locator('#home-bal-sub'),
    'somou uma estimativa e apresentou o resultado como número fechado').toContainText('cerca de');

  // Só com valores exatos, sem o "cerca de".
  await abrir(page, { fixedExpenses: [FIXO_A_VENCER] });
  const t = await page.locator('#home-bal-sub').textContent();
  expect(t).not.toContain('cerca de');
});

test('sem nada a vencer, a linha de apoio diz isso em vez de sumir', async ({ page }) => {
  await abrir(page);
  await expect(page.locator('#home-bal-sub')).toHaveText('Nada mais vence até o fim do mês');
  await expect(page.locator('#home-balance')).toHaveText('R$ 3.800,00');
});

test('sobra negativa é mostrada como negativa, não escondida', async ({ page }) => {
  await abrir(page, {
    fixedExpenses: [{ id: 'f1', name: 'Aluguel', amount: 5000, category: 'Casa', dueDay: 28, since: '2026-01-01' }],
  });
  expect((await conta(page)).sobra).toBe(-1200);
  await expect(page.locator('#home-balance')).toHaveText('−R$ 1.200,00');
  await expect(page.locator('#home-balance')).toHaveClass(/neg/);
});

test('O RESULTADO DO MÊS NÃO SUMIU: continua na tela, na escala de apoio', async ({ page }) => {
  await abrir(page, { fixedExpenses: [FIXO_A_VENCER] });
  const chip = page.locator('#home-mes-chip');
  await expect(chip).toBeVisible();
  await expect(chip).toContainText('Resultado do mês');
  await expect(chip, 'o resultado do mês mudou de valor ao virar chip').toContainText('R$ 3.800,00');
  // E é MESMO outro número que a manchete — se fossem iguais, o chip não
  // estaria provando nada.
  await expect(page.locator('#home-balance')).toHaveText('R$ 3.400,00');
});

test('O RÓTULO NUNCA MENTE: fora do mês corrente a manchete volta a ser o resultado', async ({ page }) => {
  await abrir(page, { fixedExpenses: [FIXO_A_VENCER] });
  await expect(page.locator('#home-bal-label')).toHaveText('Sobra livre até o fim do mês');

  // Mês anterior: "até o fim do mês" não quer dizer nada num mês fechado.
  // `monthOffset` é `let` de escopo de script (não é propriedade de window);
  // é o mesmo caminho que a Mês usa para mandar o período à Início.
  const irParaMes = off => page.evaluate(o => {
    window.eval('monthOffset = ' + o); window.renderHomeNew();
  }, off);

  await irParaMes(-1);
  await expect(page.locator('#home-bal-label')).toHaveText('Resultado do mês');
  await expect(page.locator('#home-bal-sub'), 'a prestação de contas ficou órfã').toBeHidden();
  await expect(page.locator('#home-mes-chip'), 'o chip repetiria a própria manchete').toBeHidden();

  // Mês futuro: idem — não há "fim do mês" a alcançar.
  await irParaMes(1);
  await expect(page.locator('#home-bal-label')).toHaveText('Resultado do mês');

  // E volta ao normal ao retornar.
  await irParaMes(0);
  await expect(page.locator('#home-bal-label')).toHaveText('Sobra livre até o fim do mês');
  await expect(page.locator('#home-bal-sub')).toBeVisible();
});

test('dar baixa num compromisso sobe a sobra no mesmo instante', async ({ page }) => {
  // A sobra e a lista são a mesma conta. Se a linha some da lista e o número
  // grande não mexe, a tela se contradiz na frente do usuário.
  await abrir(page, { fixedExpenses: [FIXO_A_VENCER] });
  await expect(page.locator('#home-balance')).toHaveText('R$ 3.400,00');
  await expect(page.locator('#home-dividas-venc')).toContainText('Aluguel');

  await page.evaluate(() => {
    const D = window.eval('D');
    D.fixedPayments.push({ id: 'fp1', fixedId: 'f1', cycle: window.fxCurrentCycle(),
                           expenseId: null, paidDate: '2026-08-20' });
    window.refreshHomeFixosAlert();
  });
  await expect(page.locator('#home-dividas-venc')).not.toContainText('Aluguel');
  await expect(page.locator('#home-balance'), 'a baixa não chegou à sobra').toHaveText('R$ 3.800,00');
  await expect(page.locator('#home-bal-sub')).toHaveText('Nada mais vence até o fim do mês');
});

test('a manchete é só leitura: não encosta em D nem chama save()', async ({ page }) => {
  await abrir(page, { fixedExpenses: [FIXO_A_VENCER], pendencias: [PEND_ESTIMADA],
                      reservaHistory: [{ date: '2026-08-10', type: 'dep', amount: 300 }] });
  const antes = await lerEstado(page, 'JSON.stringify(D)');
  const salvou = await page.evaluate(() => {
    let n = 0; const s = window.save; window.save = () => { n++; return s && s(); };
    window._sobraLivre(0); window.renderHomeManchete(); window.switchTab('inicio');
    window.save = s; return n;
  });
  expect(salvou).toBe(0);
  expect(await lerEstado(page, 'JSON.stringify(D)')).toBe(antes);
});
