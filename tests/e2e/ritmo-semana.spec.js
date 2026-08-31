// A semana tem um dono só.
//
// O app respondia "quanto por dia até domingo?" em TRÊS lugares, com três
// números diferentes — dois deles visíveis ao mesmo tempo, na mesma tela:
//
//   `renderWeekInsight`  dividia por "6 − índice de hoje"     → R$ 228,00
//   `renderWeekGoal`     dividia por dias sem receita lançada → R$ 171,00
//   `renderHomeRitmo`    dividia pelo ritmo declarado         → R$  33,22
//
// Três respostas para uma pergunta não é riqueza de informação: é o app
// admitindo que não sabe. A partir daqui existe UMA função, `_ritmoSemana`, e
// as três telas leem dela.
//
// O QUE ESTES TESTES PROTEGEM:
//
//   OS DOIS ALVOS DA SEMANA. O PISO é derivado — quanto a semana precisa
//   render para se pagar (linha do dia × dias que você pretende rodar). A META
//   é digitada — quanto você QUER ganhar, e já existia sozinha na tela Semana.
//   As duas são legítimas e respondem a perguntas diferentes; o erro era
//   tratá-las como rivais em telas separadas.
//
//   UM ALVO DE CADA VEZ. Primeiro se pagar, depois ganhar. A frase persegue
//   sempre o próximo alvo, nunca os dois — mostrar os dois devolveria o
//   problema que esta função existe para resolver.
//
//   UMA ÚNICA DEFINIÇÃO de "dias que ainda dá para rodar": os dias de
//   calendário que sobraram, limitados pelo que você ainda pretende rodar.
//
//   O ZERO É UM ESTADO VÁLIDO no passo de dias por semana, e é o inicial.
//
//   DIA FUTURO NÃO É DIA PERDIDO, e prometer sete dias numa quinta não cria
//   dias.
import { test, expect } from '@playwright/test';
import { abrirAppEmDemo, semearDados, lerEstado } from './_helpers.js';

// 20/08/2026, uma QUINTA. Agosto tem 31 dias; a semana corrente vai de
// segunda 17 a domingo 23 — quatro dias já passados (17,18,19,20) e quatro
// ainda disponíveis (20,21,22,23), com hoje nos dois lados de propósito.
const AGORA = new Date(2026, 7, 20, 15, 0, 0);

const BASE = {
  platforms: [{ id: 'p1', name: 'GrubHub', color: '#0C7A52' }],
  incomeItems: [], dailyIncome: {}, expenses: [], debtPayments: [], fixedPayments: [],
  debts: [], fixedExpenses: [], pendencias: [], vehicles: [], patrimonios: [],
  goals: [], reservaHistory: [], emergency: { current: 0, target: 0 },
  daysOff: [], reminders: [], confirmacoesAdiadas: {}, weeklyGoal: 0,
};

// 3.300 de fixos. Com 5 dias por semana em agosto: round(5 × 31 ÷ 7) = 22 dias
// de rodagem, e 3.300 ÷ 22 = 150,00 por dia rodado. Números redondos de
// propósito: um teste que erra deve apontar para a regra, não para o
// arredondamento.
const FIXOS = [
  { id: 'f1', name: 'Aluguel',  amount: 3000, category: 'Casa',   dueDay: 1,  since: '2026-01-01' },
  { id: 'f2', name: 'Internet', amount: 200,  category: 'Contas', dueDay: 15, since: '2026-01-01' },
  { id: 'f3', name: 'Celular',  amount: 100,  category: 'Contas', dueDay: 20, since: '2026-01-01' },
];

const LIGADO = { ritmo: { ligado: true } };
const COM_RITMO = { ritmo: { ligado: true, diasPorSemana: 5 } };

// Segunda 200 · terça 160 · quarta parada · quinta (hoje) 90.
// Três dias rodados, 450 na semana, dois deles bateram os 150.
const SEMANA = {
  '2026-08-17': { p1: 200 },
  '2026-08-18': { p1: 160 },
  '2026-08-20': { p1: 90 },
};

const abrir = async (page, dados, aba = 'inicio') => {
  await page.setViewportSize({ width: 390, height: 844 });
  const erros = await abrirAppEmDemo(page, { agora: AGORA });
  await semearDados(page, { ...BASE, ...(dados || {}) }, aba);
  return erros;
};

const custo  = page => page.evaluate(() => window._custoDoDia(0));
const semana = page => page.evaluate(() => window._ritmoSemana(0));
const mes    = page => page.evaluate(() => window._ritmoMes(0));

const secao  = page => page.locator('#home-ritmo-section');
const cartao = page => page.locator('#home-ritmo');
// O bloco da semana só — o do mês também fala em "Falta", e uma asserção larga
// demais no cartão inteiro leria o número errado.
const blocoSemana = page => cartao(page).locator('.rit-bloco').first();

// ── Uma resposta só ───────────────────────────────────────────────────────

test('UMA RESPOSTA: a Início e a tela Semana dizem o MESMO número por dia', async ({ page }) => {
  // Este é o teste que o defeito original teria reprovado: R$ 228,00 na tela
  // Semana e R$ 33,22 na Início, para a mesma pergunta.
  await abrir(page, {
    fixedExpenses: FIXOS, dailyIncome: SEMANA, ...COM_RITMO, weeklyGoal: 1500,
  });
  const s = await semana(page);
  const naInicio = await cartao(page).innerText();

  await page.evaluate(() => window.switchTab('semana'));
  await page.waitForTimeout(250);
  const naSemana = await page.locator('#week-goal-card').innerText();

  const alvo = new Intl.NumberFormat('pt-BR',
    { style: 'currency', currency: 'BRL' }).format(s.porDiaRestante).replace(/ /g, ' ');
  expect(naInicio, 'a Início não mostra o número por dia').toContain(alvo);
  expect(naSemana, 'a tela Semana discorda da Início').toContain(alvo);
});

test('o aviso da tela Semana parou de ecoar a meta', async ({ page }) => {
  // Ele dizia "faltam X para a meta, são Y por dia até domingo" — exatamente o
  // que o cartão logo abaixo diz, com outra conta.
  await abrir(page, {
    fixedExpenses: FIXOS, dailyIncome: SEMANA, ...COM_RITMO, weeklyGoal: 1500,
  }, 'semana');
  const aviso = page.locator('#sem-insight-section');
  await expect(aviso).toBeVisible();
  const txt = await aviso.innerText();
  expect(txt, 'o aviso voltou a falar da meta').not.toMatch(/por dia até domingo|para a meta/i);
});

// ── Os dois alvos ─────────────────────────────────────────────────────────

test('OS DOIS ALVOS: piso derivado do custo, meta digitada por você', async ({ page }) => {
  await abrir(page, {
    fixedExpenses: FIXOS, dailyIncome: SEMANA, ...COM_RITMO, weeklyGoal: 1500,
  });
  const s = await semana(page);
  expect(s.piso, '150 por dia × 5 dias prometidos').toBe(750);
  expect(s.metaDesejada, 'a meta digitada').toBe(1500);
  expect(s.temPiso).toBe(true);
  expect(s.temMeta).toBe(true);
});

test('UM ALVO DE CADA VEZ: abaixo do piso, persegue o piso', async ({ page }) => {
  await abrir(page, {
    fixedExpenses: FIXOS, dailyIncome: SEMANA, ...COM_RITMO, weeklyGoal: 1500,
  });
  const s = await semana(page);
  expect(s.entrou).toBe(450);
  expect(s.fase).toBe('piso');
  expect(s.alvoAtual).toBe(750);
  expect(s.falta).toBe(300);
  expect(s.faltamDias).toBe(2);
  expect(s.porDiaRestante, 'o número acionável da tarde de quinta').toBe(150);

  const b = blocoSemana(page);
  await expect(b).toContainText('Falta para a semana se pagar');
  await expect(b).toContainText('R$ 300,00');
  await expect(b).toContainText('R$ 150,00');
  await expect(b, 'mostrou os dois alvos ao mesmo tempo').not.toContainText('R$ 1.500,00');
});

test('passado o piso, o alvo vira a meta — e a frase diz que já se pagou', async ({ page }) => {
  await abrir(page, {
    fixedExpenses: FIXOS, ...COM_RITMO, weeklyGoal: 1500,
    dailyIncome: { '2026-08-17': { p1: 400 }, '2026-08-18': { p1: 400 }, '2026-08-20': { p1: 100 } },
  });
  const s = await semana(page);
  expect(s.entrou).toBe(900);
  expect(s.sePagou).toBe(true);
  expect(s.fase).toBe('meta');
  expect(s.alvoAtual).toBe(1500);
  expect(s.falta).toBe(600);

  const b = blocoSemana(page);
  await expect(b).toContainText('Já se pagou');
  await expect(b).toContainText('R$ 600,00');
});

test('batidos os dois, a semana fecha e para de cobrar', async ({ page }) => {
  await abrir(page, {
    fixedExpenses: FIXOS, ...COM_RITMO, weeklyGoal: 1500,
    dailyIncome: { '2026-08-17': { p1: 800 }, '2026-08-18': { p1: 800 } },
  });
  const s = await semana(page);
  expect(s.fase).toBe('completa');
  expect(s.falta).toBe(0);
  const b = blocoSemana(page);
  await expect(b).toContainText('fechou o alvo');
  await expect(b, 'ainda cobra depois de fechado').not.toContainText('Falta para');
});

test('só o piso, sem meta digitada: funciona igual', async ({ page }) => {
  await abrir(page, { fixedExpenses: FIXOS, dailyIncome: SEMANA, ...COM_RITMO });
  const s = await semana(page);
  expect(s.temMeta).toBe(false);
  expect(s.fase).toBe('piso');
  expect(s.alvoAtual).toBe(750);
});

test('só a meta, sem ritmo declarado: funciona igual', async ({ page }) => {
  await abrir(page, { fixedExpenses: FIXOS, dailyIncome: SEMANA, ...LIGADO, weeklyGoal: 1500 });
  const s = await semana(page);
  expect(s.temPiso, 'inventou um piso sem ritmo declarado').toBe(false);
  expect(s.fase).toBe('meta');
  expect(s.alvoAtual).toBe(1500);
  // Sem ritmo, os dias que restam são os do calendário: quinta a domingo.
  expect(s.faltamDias).toBe(4);
});

test('sem piso e sem meta, o cartão convida em vez de mostrar zero', async ({ page }) => {
  await abrir(page, { fixedExpenses: FIXOS, dailyIncome: SEMANA, ...LIGADO });
  const s = await semana(page);
  expect(s.fase).toBe('sem-alvo');
  await expect(blocoSemana(page)).toContainText('Diga quantos dias por semana');
});

// ── A barra com duas marcas ───────────────────────────────────────────────

test('A BARRA tem duas marcas: onde se paga e onde é a meta', async ({ page }) => {
  await abrir(page, {
    fixedExpenses: FIXOS, dailyIncome: SEMANA, ...COM_RITMO, weeklyGoal: 1500,
  });
  const s = await semana(page);
  // A escala é o maior dos dois (1.500). 450 entrou = 30%; o piso 750 = 50%.
  expect(s.pctEntrou).toBe(30);
  expect(s.pctPiso).toBe(50);
  await expect(cartao(page).locator('.rit-marca')).toHaveCount(1);
});

test('sem os dois alvos não há marca — um traço sozinho não significa nada', async ({ page }) => {
  await abrir(page, { fixedExpenses: FIXOS, dailyIncome: SEMANA, ...COM_RITMO });
  await expect(cartao(page).locator('.rit-marca')).toHaveCount(0);
});

// ── O que já era protegido, e continua ────────────────────────────────────

test('NASCE SEM PROMESSA: sem dias por semana, a conta divide pelo mês', async ({ page }) => {
  const erros = await abrir(page, { fixedExpenses: FIXOS, ...LIGADO });
  const c = await custo(page);
  expect(c.porSemana, 'alguém prometeu no lugar do usuário').toBe(0);
  expect(c.temRitmo).toBe(false);
  expect(c.porDia, '3.300 ÷ 31 dias de agosto').toBe(106.45);
  expect(c.alvo).toBe(106.45);
  expect(erros).toEqual([]);
});

test('o placar não existe com o recurso desligado', async ({ page }) => {
  await abrir(page, { fixedExpenses: FIXOS, dailyIncome: SEMANA });
  await expect(secao(page), 'apareceu sem ninguém ligar').toBeHidden();
});

test('o placar não existe sem custo cadastrado', async ({ page }) => {
  await abrir(page, { fixedExpenses: [], ...COM_RITMO });
  await expect(secao(page)).toBeHidden();
});

test('DECLARAR O RITMO sobe a linha do dia rodado para o que ela é', async ({ page }) => {
  await abrir(page, { fixedExpenses: FIXOS, ...COM_RITMO });
  const c = await custo(page);
  expect(c.diasRodagem, '5 dias por semana em agosto ≈ 22 dias').toBe(22);
  expect(c.porDiaRodado).toBe(150);
  expect(c.alvo).toBe(150);
  const d = await page.evaluate(() => window._diaSePagou());
  expect(d.alvo).toBe(150);
});

test('o alvo do dia acompanha a mudança do ritmo na hora', async ({ page }) => {
  await abrir(page, { fixedExpenses: FIXOS, ...LIGADO });
  expect((await custo(page)).alvo).toBe(106.45);
  await page.evaluate(() => { window.eval('D').ritmo.diasPorSemana = 5; window.renderInicio(); });
  expect((await custo(page)).alvo).toBe(150);
  await expect(page.locator('#home-dia')).toContainText('R$ 150,00');
});

// ── O passo ───────────────────────────────────────────────────────────────

test('O PASSO parte de vazio e o "menos" já nasce sem função', async ({ page }) => {
  await abrir(page, { fixedExpenses: FIXOS, ...LIGADO });
  await expect(page.locator('.rit-step-val')).toHaveText('?');
  await expect(page.getByRole('button', { name: 'Um dia a menos' })).toBeDisabled();
  // O vazio diz o que FAZER. Foi por não dizer isto que o passo passou
  // despercebido na primeira vez que foi ao ar.
  await expect(cartao(page)).toContainText('Quantos dias por semana você pretende rodar?');
  await expect(cartao(page)).toContainText('Toque no + para dizer');
});

test('o passo escreve o número e ele persiste', async ({ page }) => {
  await abrir(page, { fixedExpenses: FIXOS, ...LIGADO });
  const mais = page.getByRole('button', { name: 'Um dia a mais' });
  for (let i = 0; i < 5; i++) await mais.click();

  expect(await lerEstado(page, 'D.ritmo.diasPorSemana')).toBe(5);
  await expect(page.locator('.rit-step-val')).toHaveText('5');
  await expect(cartao(page)).toContainText('Rodando 5 dias por semana');
  await expect(cartao(page)).toContainText('Um dia rodado precisa render R$ 150,00');
});

test('o passo não passa de 7 nem cai abaixo de zero', async ({ page }) => {
  await abrir(page, { fixedExpenses: FIXOS, ritmo: { ligado: true, diasPorSemana: 7 } });
  await expect(page.getByRole('button', { name: 'Um dia a mais' })).toBeDisabled();
  expect((await custo(page)).diasRodagem, '7 por semana = todos os dias de agosto').toBe(31);

  const menos = page.getByRole('button', { name: 'Um dia a menos' });
  for (let i = 0; i < 9; i++) {
    if (await menos.isDisabled()) break;
    await menos.click();
  }
  expect(await lerEstado(page, 'D.ritmo.diasPorSemana'), 'passou do zero').toBe(0);
  await expect(menos).toBeDisabled();
});

test('voltar a zero devolve a conta antiga, sem sobra de estado', async ({ page }) => {
  await abrir(page, { fixedExpenses: FIXOS, ritmo: { ligado: true, diasPorSemana: 1 } });
  expect((await custo(page)).temRitmo).toBe(true);
  await page.getByRole('button', { name: 'Um dia a menos' }).click();
  const c = await custo(page);
  expect(c.temRitmo).toBe(false);
  expect(c.alvo, 'ficou preso na linha do ritmo desfeito').toBe(106.45);
});

// ── Os limites da semana ──────────────────────────────────────────────────

test('DIA FUTURO NÃO É DIA PERDIDO: sexta, sábado e domingo não contam contra', async ({ page }) => {
  await abrir(page, { fixedExpenses: FIXOS, dailyIncome: SEMANA, ...COM_RITMO });
  expect((await semana(page)).rodados).toBe(3);

  await page.evaluate(() => {
    window.eval('D').dailyIncome['2026-08-23'] = { p1: 999 };
    window.renderInicio();
  });
  const depois = await semana(page);
  expect(depois.rodados, 'um domingo futuro entrou como dia rodado').toBe(3);
  expect(depois.entrou).toBe(450);
});

test('PROMETER SETE NUMA QUINTA NÃO CRIA DIAS', async ({ page }) => {
  await abrir(page, { fixedExpenses: FIXOS, ritmo: { ligado: true, diasPorSemana: 7 } });
  const s = await semana(page);
  expect(s.prometidos).toBe(7);
  expect(s.rodados).toBe(0);
  // Restam quinta, sexta, sábado e domingo. Sete menos zero são sete, mas só
  // existem quatro dias.
  expect(s.faltamDias, 'pediu mais dias do que a semana tem').toBe(4);
});

test('os dias que bateram a meta são contados', async ({ page }) => {
  await abrir(page, { fixedExpenses: FIXOS, dailyIncome: SEMANA, ...COM_RITMO });
  // 200 e 160 passaram dos 150; 90 não.
  expect((await semana(page)).bateram).toBe(2);
});

// ── O mês ─────────────────────────────────────────────────────────────────

test('o mês conta dias rodados e o que falta para se pagar', async ({ page }) => {
  await abrir(page, { fixedExpenses: FIXOS, dailyIncome: SEMANA, ...COM_RITMO });
  const m = await mes(page);
  expect(m.rodados).toBe(3);
  expect(m.bateram).toBe(2);
  expect(m.entrou).toBe(450);
  expect(m.media, '450 em 3 dias rodados').toBe(150);
  expect(m.custoMes).toBe(3300);
  expect(m.falta).toBe(2850);
  expect(m.fechou).toBe(false);

  const c = cartao(page);
  await expect(c).toContainText('Falta para o mês se pagar');
  await expect(c).toContainText('R$ 2.850,00');
  await expect(c).toContainText('R$ 450,00 de R$ 3.300,00');
  await expect(c).toContainText('3 dias rodados');
});

test('mês que já se pagou não cobra mais', async ({ page }) => {
  await abrir(page, {
    fixedExpenses: FIXOS, dailyIncome: { '2026-08-05': { p1: 3400 } }, ...COM_RITMO,
  });
  const m = await mes(page);
  expect(m.fechou).toBe(true);
  expect(m.falta).toBe(0);
  await expect(cartao(page)).toContainText('O mês já se pagou');
});

// ── Linguagem, explicação e pureza ────────────────────────────────────────

test('o placar informa, não cobra', async ({ page }) => {
  await abrir(page, { fixedExpenses: FIXOS, dailyIncome: SEMANA, ...COM_RITMO });
  const txt = (await cartao(page).innerText()).toLowerCase();
  for (const palavra of ['perdeu', 'falhou', 'atrás', 'devendo', 'negativo', 'fracass']) {
    expect(txt, `o placar usa linguagem de cobrança: "${palavra}"`).not.toContain(palavra);
  }
});

test('"POR QUE ESSE NÚMERO?" tem porta no cartão, e a resposta é em português', async ({ page }) => {
  // A queixa que originou esta revisão: "de onde vem esse R$ 194,60? e o que é
  // 'de rua'?". A composição saiu da cara do cartão e virou frase.
  await abrir(page, { fixedExpenses: FIXOS, ...COM_RITMO });
  await expect(cartao(page), 'a composição continua na cara do cartão')
    .not.toContainText('de fixo e');

  await cartao(page).getByRole('button', { name: /Por que R\$ 150,00/ }).click();
  const dlg = page.locator('#_av_dlg');
  await expect(dlg).toBeVisible();
  await expect(dlg).toContainText('UM PEDAÇO DAS SUAS CONTAS DO MÊS');
  await expect(dlg).toContainText('O QUE VOCÊ GASTOU NO DIA A DIA');
  await expect(dlg).toContainText('R$ 150,00');
  await expect(dlg, 'a palavra "rua" sobreviveu como rótulo').not.toContainText('de rua');
});

test('a explicação diz de onde saiu cada parcela, não só o resultado', async ({ page }) => {
  await abrir(page, { fixedExpenses: FIXOS, ...COM_RITMO }, 'ajustes');
  await page.locator('.srow', { hasText: 'Custo do dia' }).click();
  const dlg = page.locator('#_av_dlg');
  await expect(dlg).toContainText('R$ 3.300,00');       // o total das contas
  await expect(dlg).toContainText('5 dias por semana');
  await expect(dlg).toContainText('22');                 // dias de rodagem no mês
});

test('ler o placar é só leitura: não encosta em D nem salva', async ({ page }) => {
  await abrir(page, {
    fixedExpenses: FIXOS, dailyIncome: SEMANA, ...COM_RITMO, weeklyGoal: 1500,
  });
  const antes = await lerEstado(page, 'JSON.stringify(D)');
  const salvou = await page.evaluate(() => {
    let n = 0; const s = window.save; window.save = () => { n++; return s && s(); };
    window._ritmoSemana(0); window._ritmoMes(0); window._custoDoDia(0);
    window.renderHomeRitmo(); window.renderInicio();
    window.save = s; return n;
  });
  expect(salvou).toBe(0);
  expect(await lerEstado(page, 'JSON.stringify(D)')).toBe(antes);
});
