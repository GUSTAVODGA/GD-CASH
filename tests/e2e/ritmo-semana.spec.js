// O placar: a semana e o mês.
//
// O cartão do dia responde "posso ir para casa agora?". Ele não responde
// "estou no ritmo?" — e essa é a pergunta que decide a semana inteira. Sem
// ela, quatro dias fracos seguidos passam despercebidos até o mês fechar
// curto, e aí não há mais o que fazer.
//
// O QUE ESTES TESTES PROTEGEM:
//
//   UMA COISA SÓ SE DIGITA: quantos dias por semana você PRETENDE rodar. Não é
//   contrato, é o divisor da conta. Enquanto ninguém disser, a conta divide
//   pelos dias do MÊS — o comportamento antigo, que não julga folga. Declarado
//   o ritmo, a linha do dia rodado sobe para o que ela é de verdade, e sobe
//   por uma conta que o próprio usuário escolheu.
//
//   O ZERO É UM ESTADO VÁLIDO, e é o inicial. Prometer no lugar do usuário é o
//   começo de um número em que ele não acredita.
//
//   DIA FUTURO NÃO É DIA PERDIDO. O placar da semana só olha para trás e para
//   hoje. Uma segunda-feira de manhã não pode dizer "você está atrás".
//
//   PROMETER SETE DIAS NUMA QUINTA NÃO CRIA DIAS. O que falta rodar é limitado
//   pelos dias que ainda existem na semana — senão o app pediria o impossível
//   e ensinaria a ignorá-lo.
//
//   A CONTA QUE DECIDE A TARDE é "falta X em N dias — dá Y por dia". É o único
//   número acionável às três da tarde de uma quinta.
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
  daysOff: [], reminders: [], confirmacoesAdiadas: {},
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
const semana = page => page.evaluate(() => window._ritmoSemana());
const mes    = page => page.evaluate(() => window._ritmoMes(0));

const secao = page => page.locator('#home-ritmo-section');
const cartao = page => page.locator('#home-ritmo');
// O bloco da semana só — o do mês também fala em "Faltam", e uma asserção
// larga demais no cartão inteiro leria o número errado.
const blocoSemana = page => cartao(page).locator('.rit-bloco', { hasText: 'Esta semana' });

// ── O zero é o estado inicial ─────────────────────────────────────────────

test('NASCE SEM PROMESSA: sem dias por semana, a conta divide pelo mês', async ({ page }) => {
  const erros = await abrir(page, { fixedExpenses: FIXOS, ...LIGADO });
  const c = await custo(page);
  expect(c.porSemana, 'alguém prometeu no lugar do usuário').toBe(0);
  expect(c.temRitmo).toBe(false);
  expect(c.diasRodagem).toBe(0);
  // 3.300 ÷ 31 dias de agosto = 106,45 — o comportamento antigo, intacto.
  expect(c.porDia).toBe(106.45);
  expect(c.alvo, 'a linha de chegada mudou sem ninguém declarar ritmo').toBe(106.45);
  expect(erros).toEqual([]);
});

test('o placar não existe com o recurso desligado', async ({ page }) => {
  await abrir(page, { fixedExpenses: FIXOS, dailyIncome: SEMANA });
  await expect(secao(page), 'apareceu sem ninguém ligar').toBeHidden();
});

test('o placar não existe sem custo cadastrado', async ({ page }) => {
  // Sem base, "faltam X" seria um número inventado.
  await abrir(page, { fixedExpenses: [], ...COM_RITMO });
  await expect(secao(page)).toBeHidden();
});

test('ligado e com custo, o placar aparece', async ({ page }) => {
  await abrir(page, { fixedExpenses: FIXOS, dailyIncome: SEMANA, ...COM_RITMO });
  await expect(secao(page)).toBeVisible();
  await expect(cartao(page)).toContainText('Esta semana');
  await expect(cartao(page)).toContainText('Este mês');
});

// ── Declarar o ritmo move a linha ─────────────────────────────────────────

test('DECLARAR O RITMO sobe a linha do dia rodado para o que ela é', async ({ page }) => {
  await abrir(page, { fixedExpenses: FIXOS, ...COM_RITMO });
  const c = await custo(page);
  expect(c.porSemana).toBe(5);
  expect(c.diasRodagem, '5 dias por semana em agosto ≈ 22 dias').toBe(22);
  expect(c.porDiaRodado).toBe(150);
  expect(c.alvo, 'a linha continuou na conta de dia de existir').toBe(150);
  expect(c.temRitmo).toBe(true);
  // E a linha nova é a que o cartão do dia usa.
  const d = await page.evaluate(() => window._diaSePagou());
  expect(d.alvo).toBe(150);
  expect(d.temRitmo).toBe(true);
});

test('o alvo do dia acompanha a mudança do ritmo na hora', async ({ page }) => {
  await abrir(page, { fixedExpenses: FIXOS, ...LIGADO });
  expect((await custo(page)).alvo).toBe(106.45);

  await page.evaluate(() => { window.eval('D').ritmo.diasPorSemana = 5; window.renderInicio(); });
  expect((await custo(page)).alvo).toBe(150);
  await expect(page.locator('#home-dia')).toContainText('R$ 150,00');
});

test('o mensal não muda — o ritmo só muda o divisor', async ({ page }) => {
  // A conta de quanto custa o mês é a mesma; declarar ritmo não inventa custo.
  await abrir(page, { fixedExpenses: FIXOS, ...COM_RITMO });
  const c = await custo(page);
  expect(c.mensal).toBe(3300);
  expect(c.fixos).toBe(3300);
});

// ── O passo: a única coisa que se digita ──────────────────────────────────

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
  await expect(cartao(page)).toContainText('Cada dia rodado precisa render R$ 150,00');
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

// ── O placar da semana ────────────────────────────────────────────────────

test('A CONTA QUE DECIDE A TARDE: falta X em N dias — dá Y por dia', async ({ page }) => {
  await abrir(page, { fixedExpenses: FIXOS, dailyIncome: SEMANA, ...COM_RITMO });
  const s = await semana(page);
  expect(s.rodados).toBe(3);
  expect(s.prometidos).toBe(5);
  expect(s.entrou).toBe(450);
  expect(s.meta, '150 × 5 dias prometidos').toBe(750);
  expect(s.falta).toBe(300);
  expect(s.faltamDias).toBe(2);
  expect(s.porDiaRestante, 'o número acionável da tarde de quinta').toBe(150);

  const c = cartao(page);
  await expect(c).toContainText('3 de 5 dias');
  await expect(c).toContainText('R$ 450,00');
  await expect(c).toContainText('Faltam 2 dias e R$ 300,00 — dá R$ 150,00 por dia');
});

test('DIA FUTURO NÃO É DIA PERDIDO: sexta, sábado e domingo não contam contra', async ({ page }) => {
  // Se o futuro contasse, toda segunda-feira de manhã diria "você está atrás".
  await abrir(page, { fixedExpenses: FIXOS, dailyIncome: SEMANA, ...COM_RITMO });
  const s = await semana(page);
  expect(s.rodados, 'contou dia que ainda não aconteceu').toBe(3);

  // Semear o futuro não pode mudar o passado do placar.
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

test('cumprir o combinado encerra a cobrança da semana', async ({ page }) => {
  await abrir(page, {
    fixedExpenses: FIXOS, dailyIncome: SEMANA,
    ritmo: { ligado: true, diasPorSemana: 2 },
  });
  const s = await semana(page);
  expect(s.cumpriu).toBe(true);
  expect(s.faltamDias).toBe(0);
  await expect(blocoSemana(page)).toContainText('Semana cumprida');
  await expect(blocoSemana(page), 'ainda cobra depois de cumprido').not.toContainText('Faltam');
});

test('sem ritmo declarado a semana mostra o que houve, sem prometer nada', async ({ page }) => {
  await abrir(page, { fixedExpenses: FIXOS, dailyIncome: SEMANA, ...LIGADO });
  const s = await semana(page);
  expect(s.prometidos).toBe(0);
  expect(s.faltamDias).toBe(0);
  expect(s.entrou).toBe(450);

  const c = cartao(page);
  await expect(c).toContainText('3 dias rodados');
  await expect(c).toContainText('R$ 450,00');
  await expect(c, 'inventou uma meta que ninguém pediu').not.toContainText('de 5 dias');
});

test('os dias que bateram a meta são contados', async ({ page }) => {
  await abrir(page, { fixedExpenses: FIXOS, dailyIncome: SEMANA, ...COM_RITMO });
  const s = await semana(page);
  // 200 e 160 passaram dos 150; 90 não.
  expect(s.bateram).toBe(2);
});

// ── O placar do mês ───────────────────────────────────────────────────────

test('o mês conta dias rodados, dias que bateram e a média por dia rodado', async ({ page }) => {
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
  await expect(c).toContainText('3 dias rodados');
  await expect(c).toContainText('2 dias bateram a meta de R$ 150,00');
  await expect(c).toContainText('R$ 150,00 por dia rodado');
});

test('o que falta do mês é dividido pelos dias de rodagem que sobraram', async ({ page }) => {
  await abrir(page, { fixedExpenses: FIXOS, dailyIncome: SEMANA, ...COM_RITMO });
  const m = await mes(page);
  // De 20 a 31 de agosto são 12 dias; 22 de rodagem menos 3 rodados são 19,
  // então o limite é o calendário: 12.
  expect(m.diasRestantes).toBe(12);
  expect(m.rodagemRestante).toBe(12);
  expect(m.porDiaRestante, '2.850 ÷ 12').toBe(237.5);
  await expect(cartao(page)).toContainText('Faltam R$ 2.850,00 em 12 dias');
});

test('mês que já se pagou não cobra mais', async ({ page }) => {
  await abrir(page, {
    fixedExpenses: FIXOS,
    dailyIncome: { '2026-08-05': { p1: 3400 } },
    ...COM_RITMO,
  });
  const m = await mes(page);
  expect(m.fechou).toBe(true);
  expect(m.falta).toBe(0);
  await expect(cartao(page)).toContainText('O mês já se pagou');
});

test('mês sem nenhum dia rodado não mostra média nem placar de metas', async ({ page }) => {
  // Zero de zero é zero, e "média R$ 0,00" leria como fracasso.
  await abrir(page, { fixedExpenses: FIXOS, ...COM_RITMO });
  const m = await mes(page);
  expect(m.rodados).toBe(0);
  expect(m.media).toBe(0);
  await expect(cartao(page), 'mostrou média sem base').not.toContainText('por dia rodado');
});

// ── Linguagem e pureza ────────────────────────────────────────────────────

test('o placar informa, não cobra', async ({ page }) => {
  await abrir(page, { fixedExpenses: FIXOS, dailyIncome: SEMANA, ...COM_RITMO });
  const txt = (await cartao(page).innerText()).toLowerCase();
  for (const palavra of ['perdeu', 'falhou', 'atrás', 'devendo', 'negativo', 'fracass']) {
    expect(txt, `o placar usa linguagem de cobrança: "${palavra}"`).not.toContain(palavra);
  }
});

test('a folha do ritmo explica a conta do dia rodado quando há ritmo', async ({ page }) => {
  await abrir(page, { fixedExpenses: FIXOS, ...COM_RITMO }, 'ajustes');
  await page.locator('.srow', { hasText: 'Custo do dia' }).click();
  const dlg = page.locator('#_av_dlg');
  await expect(dlg).toBeVisible();
  await expect(dlg).toContainText('5 dias por semana');
  await expect(dlg).toContainText('22 dias no mês');
  await expect(dlg).toContainText('R$ 150,00');
});

test('ler o placar é só leitura: não encosta em D nem salva', async ({ page }) => {
  await abrir(page, { fixedExpenses: FIXOS, dailyIncome: SEMANA, ...COM_RITMO });
  const antes = await lerEstado(page, 'JSON.stringify(D)');
  const salvou = await page.evaluate(() => {
    let n = 0; const s = window.save; window.save = () => { n++; return s && s(); };
    window._ritmoSemana(); window._ritmoMes(0); window._custoDoDia(0);
    window.renderHomeRitmo(); window.renderInicio();
    window.save = s; return n;
  });
  expect(salvou).toBe(0);
  expect(await lerEstado(page, 'JSON.stringify(D)')).toBe(antes);
});
