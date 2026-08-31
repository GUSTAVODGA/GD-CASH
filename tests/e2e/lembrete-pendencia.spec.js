// Lembrete vira pendência, e o conversor de moedas morre.
//
// LEMBRETE E PENDÊNCIA eram a mesma frase: "uma coisa que preciso fazer até uma
// data". Duas telas, dois modelos, duas entradas no menu, duas listas. O que o
// lembrete tinha a mais — avisar antes e repetir — não é outra natureza, é
// configuração: uma pendência que repete todo mês e avisa dois dias antes É um
// lembrete.
//
// A fusão corrige um defeito de lado, e é o que estes testes mais protegem:
// o lembrete NOTIFICAVA E SUMIA. Ele não entrava na espinha de compromissos
// nem na lista "o que precisa de você" da Início, então a tela que responde "o
// que exige ação" ignorava justamente os itens criados para não serem
// esquecidos.
//
// O CONVERSOR DE MOEDAS não é um recurso de finanças pessoais — é uma
// calculadora que alguém colou num app de dinheiro. Ele buscava cotação numa
// API pública a cada abertura, ocupava uma seção inteira do menu ("Ferramentas")
// e não conversava com nenhum dado do usuário. Sai inteiro.
//
// O QUE NÃO PODE ACONTECER:
//   · perder um lembrete na migração, ou duplicá-lo ao reimportar um backup;
//   · uma pendência que já existia começar a notificar sozinha por causa da
//     fusão — ninguém pediu para ser avisado de nada;
//   · o endereço antigo virar beco sem saída.
import { test, expect } from '@playwright/test';
import { abrirAppEmDemo, semearDados, irParaAba, lerEstado } from './_helpers.js';

const AGORA = new Date(2026, 7, 20, 12, 0, 0);   // 20/08/2026

const BASE = {
  platforms: [{ id: 'p1', name: 'Fonte A', color: '#0C7A52' }],
  incomeItems: [], dailyIncome: {}, expenses: [], debtPayments: [], fixedPayments: [],
  debts: [], fixedExpenses: [], pendencias: [], vehicles: [], patrimonios: [],
  goals: [], reservaHistory: [], emergency: { current: 0, target: 0 },
  daysOff: [], reminders: [],
};

const LEMBRETE = { id: 'rm1', name: 'Troca de óleo', date: '2026-08-25',
                   notifDaysBefore: 2, repeat: 'monthly', lastNotif: '' };

const abrir = async (page, dados, aba = 'pendencias') => {
  await page.setViewportSize({ width: 390, height: 844 });
  const erros = await abrirAppEmDemo(page, { agora: AGORA });
  await semearDados(page, { ...BASE, ...(dados || {}) }, aba);
  return erros;
};

const migrar = page => page.evaluate(() => window._migrateLembretesParaPendencias());
const pends = page => page.evaluate(() => window.eval('D').pendencias);

// ── A migração ────────────────────────────────────────────────────────────

test('MIGRAÇÃO: o lembrete vira pendência sem perder nada', async ({ page }) => {
  await abrir(page, { reminders: [LEMBRETE] });
  const r = await migrar(page);
  expect(r.migrados).toBe(1);

  const [p] = await pends(page);
  expect(p.title, 'o nome do lembrete se perdeu').toBe('Troca de óleo');
  expect(p.deadline, 'a data virou outra coisa').toBe('2026-08-25');
  expect(p.notifDaysBefore, 'o aviso com antecedência se perdeu').toBe(2);
  expect(p.repeat, 'a repetição se perdeu').toBe('monthly');
  expect(p.status).toBe('aberta');
  // Lembrete não tem valor nem prioridade; nada é inventado.
  expect(p.estimatedValue).toBeNull();
  expect(p.priority).toBe('media');
});

test('MIGRAÇÃO: reimportar o mesmo backup não duplica', async ({ page }) => {
  // A identidade é pela ORIGEM (`_idLembrete`), não pelo texto: renomear a
  // pendência depois não pode fazer o lembrete "voltar".
  await abrir(page, { reminders: [LEMBRETE] });
  expect((await migrar(page)).migrados).toBe(1);

  await page.evaluate(() => { window.eval('D').pendencias[0].title = 'Outro nome'; });
  const segunda = await migrar(page);
  expect(segunda.ran, 'a migração se disse necessária de novo').toBe(false);
  expect((await pends(page)).length, 'o lembrete foi duplicado').toBe(1);
});

test('MIGRAÇÃO: sem lembrete nenhum, não faz nada', async ({ page }) => {
  await abrir(page, { reminders: [] });
  expect((await migrar(page)).ran).toBe(false);
  expect((await pends(page)).length).toBe(0);
});

// ── O defeito que a fusão corrige ─────────────────────────────────────────

test('O DEFEITO CORRIGIDO: o lembrete aparece em "o que precisa de você"', async ({ page }) => {
  // Como tela própria, ele notificava e sumia: a Início ignorava justamente os
  // itens criados para não serem esquecidos.
  await abrir(page, { reminders: [LEMBRETE] }, 'inicio');
  await page.evaluate(() => { window._migrateLembretesParaPendencias(); window.switchTab('inicio'); });
  await expect(page.locator('#home-dividas-venc'),
    'o lembrete continua invisível na Início').toContainText('Troca de óleo');
});

test('pendência sem valor com prazo à frente entra na área de atenção', async ({ page }) => {
  // A generalização que sustenta o caso acima: um lembrete é exatamente isto —
  // data, sem preço.
  await abrir(page, {
    pendencias: [{ id: 'p1', title: 'Renovar CNH', category: 'documento', priority: 'baixa',
                   deadline: '2026-08-27', estimatedValue: null, status: 'aberta',
                   createdAt: '2026-08-01' }],
  }, 'inicio');
  await expect(page.locator('#home-dividas-venc')).toContainText('Renovar CNH');
  // E não inventa valor para ela.
  const linha = page.locator('.home-venc-item', { hasText: 'Renovar CNH' });
  await expect(linha.locator('.home-venc-val')).toHaveCount(0);
});

test('pendência sem valor e sem prazo próximo NÃO polui a Início', async ({ page }) => {
  // O horizonte é de 15 dias; 30/09 está muito além, e a prioridade é baixa.
  await abrir(page, {
    pendencias: [{ id: 'p1', title: 'Pintar o portão', category: 'casa', priority: 'baixa',
                   deadline: '2026-09-30', estimatedValue: null, status: 'aberta',
                   createdAt: '2026-08-01' }],
  }, 'inicio');
  await expect(page.locator('#home-dividas-venc')).not.toContainText('Pintar o portão');
});

// ── Avisar e repetir na pendência ─────────────────────────────────────────

test('NINGUÉM PASSA A SER NOTIFICADO por causa da fusão', async ({ page }) => {
  // Toda pendência que já existia não tem `notifDaysBefore`. O motor só olha
  // para quem tem o campo — o padrão do formulário é "Não avisar".
  await abrir(page, {
    pendencias: [{ id: 'p1', title: 'Trocar a torneira', category: 'casa', priority: 'media',
                   deadline: '2026-08-20', estimatedValue: 150, status: 'aberta',
                   createdAt: '2026-08-01' }],
  });
  const avisadas = await page.evaluate(() =>
    window.eval('D').pendencias.filter(p => p.notifDaysBefore != null).length);
  expect(avisadas, 'uma pendência antiga começou a notificar sozinha').toBe(0);

  await page.evaluate(() => window.openPendenciaModal('p1'));
  expect(await page.inputValue('#pend-notif'), 'o padrão deixou de ser "Não avisar"').toBe('');
});

test('sem prazo, avisar e repetir somem do formulário', async ({ page }) => {
  // Os dois se medem a partir do prazo. Sem prazo não são "opcionais", são sem
  // sentido — e um campo sem sentido é uma pergunta que o usuário tenta
  // responder à toa.
  await abrir(page, {});
  await page.evaluate(() => window.openPendenciaModal());
  await expect(page.locator('#pend-avisar-row')).toBeHidden();
  await expect(page.locator('#pend-repete-row')).toBeHidden();

  await page.fill('#pend-deadline', '2026-08-30');
  await page.dispatchEvent('#pend-deadline', 'change');
  await expect(page.locator('#pend-avisar-row')).toBeVisible();
  await expect(page.locator('#pend-repete-row')).toBeVisible();
});

test('salvar com prazo grava avisar e repetir; sem prazo, descarta', async ({ page }) => {
  await abrir(page, {});
  await page.evaluate(() => window.openPendenciaModal());
  await page.fill('#pend-title-input', 'Seguro do carro');
  await page.fill('#pend-deadline', '2026-09-10');
  await page.dispatchEvent('#pend-deadline', 'change');
  await page.selectOption('#pend-notif', '7');
  await page.selectOption('#pend-repeat', 'yearly');
  await page.evaluate(() => window.savePendencia());

  let p = (await pends(page)).find(x => x.title === 'Seguro do carro');
  expect(p.notifDaysBefore).toBe(7);
  expect(p.repeat).toBe('yearly');

  // Agora sem prazo. Os campos ficam OCULTOS, então o valor só pode chegar
  // neles como resíduo — exatamente o caso que importa: sobra da pendência
  // anterior, e tem de ser descartado em vez de virar dado morto que nunca
  // dispara. Por isso o valor é posto direto, não pelo clique (que a folha
  // oculta impede, e é essa a proteção da vez).
  await page.evaluate(() => window.openPendenciaModal());
  await page.fill('#pend-title-input', 'Sem prazo');
  await page.evaluate(() => {
    document.getElementById('pend-notif').value = '2';
    document.getElementById('pend-repeat').value = 'monthly';
  });
  await page.evaluate(() => window.savePendencia());

  p = (await pends(page)).find(x => x.title === 'Sem prazo');
  expect(p.notifDaysBefore, 'gravou aviso numa pendência sem prazo').toBeNull();
  expect(p.repeat).toBe('none');
});

test('a repetição avança o prazo quando o aviso dispara', async ({ page }) => {
  await abrir(page, {
    pendencias: [{ id: 'p1', title: 'Troca de óleo', category: 'carro', priority: 'media',
                   deadline: '2026-08-22', estimatedValue: null, status: 'aberta',
                   createdAt: '2026-08-01', notifDaysBefore: 2, repeat: 'monthly',
                   lastNotif: '' }],
  });
  // 22/08 menos 2 dias de antecedência = hoje (20/08): é o dia de disparar.
  const disparos = await page.evaluate(() => {
    const vistos = [];
    const Orig = window.Notification;
    window.Notification = function (t, o) { vistos.push({ t, o }); };
    window.Notification.permission = 'granted';
    window.checkReminders();
    window.Notification = Orig;
    return vistos;
  });
  expect(disparos.length, 'o aviso não disparou').toBe(1);
  expect(disparos[0].t).toContain('Troca de óleo');

  const p = (await pends(page))[0];
  expect(p.deadline, 'a repetição mensal não avançou o prazo').toBe('2026-09-22');
  expect(p.lastNotif, 'sem marca de "já avisei hoje", avisaria de novo').toBe('2026-08-20');
});

test('sem repetição, o prazo fica onde está', async ({ page }) => {
  await abrir(page, {
    pendencias: [{ id: 'p1', title: 'Renovar CNH', category: 'documento', priority: 'media',
                   deadline: '2026-08-22', estimatedValue: null, status: 'aberta',
                   createdAt: '2026-08-01', notifDaysBefore: 2, repeat: 'none', lastNotif: '' }],
  });
  await page.evaluate(() => {
    const Orig = window.Notification;
    window.Notification = function () {};
    window.Notification.permission = 'granted';
    window.checkReminders();
    window.Notification = Orig;
  });
  expect((await pends(page))[0].deadline).toBe('2026-08-22');
});

// ── O erro de um dia ──────────────────────────────────────────────────────
//
// `parseDate` devolve MEIO-DIA local; as contas de prazo comparavam isso com um
// "hoje" à MEIA-NOITE. Toda diferença saía com meio dia sobrando e `Math.round`
// arredondava para cima. Consequência: todo prazo contava um dia a mais, e o
// ramo "é hoje" — diferença zero — nunca acontecia.
//
// Isto vinha de antes da fusão e valia para metas também. Como o aviso de
// lembrete passou a viver aqui, o defeito passaria a estragar justamente o
// recurso que a fusão traz.

test('O ERRO DE UM DIA: "avisar no dia" avisa no dia', async ({ page }) => {
  // Este é o caso que NUNCA disparava: notifDaysBefore 0 exigia diferença 0, e
  // a diferença mínima possível era 1.
  await abrir(page, {
    pendencias: [{ id: 'p1', title: 'Vence hoje', category: 'pessoal', priority: 'media',
                   deadline: '2026-08-20', estimatedValue: null, status: 'aberta',
                   createdAt: '2026-08-01', notifDaysBefore: 0, repeat: 'none', lastNotif: '' }],
  });
  const disparos = await page.evaluate(() => {
    const vistos = []; const Orig = window.Notification;
    window.Notification = function (t, o) { vistos.push({ t, o }); };
    window.Notification.permission = 'granted';
    window.checkReminders();
    window.Notification = Orig;
    return vistos;
  });
  expect(disparos.length, '"avisar no dia" continua não avisando').toBe(1);
  expect(disparos[0].o.body).toBe('É hoje!');
});

test('O ERRO DE UM DIA: o aviso de N dias sai N dias antes, não N+1', async ({ page }) => {
  const cenario = deadline => ({
    pendencias: [{ id: 'p1', title: 'Alvo', category: 'pessoal', priority: 'media',
                   deadline, estimatedValue: null, status: 'aberta', createdAt: '2026-08-01',
                   notifDaysBefore: 2, repeat: 'none', lastNotif: '' }],
  });
  const disparou = async d => {
    await abrir(page, cenario(d));
    return page.evaluate(() => {
      let n = 0; const Orig = window.Notification;
      window.Notification = function () { n++; };
      window.Notification.permission = 'granted';
      window.checkReminders();
      window.Notification = Orig;
      return n;
    });
  };
  // Hoje é 20/08. Com 2 dias de antecedência, o dia certo é 22/08.
  expect(await disparou('2026-08-22'), 'não avisou 2 dias antes').toBe(1);
  expect(await disparou('2026-08-23'), 'avisou 3 dias antes — o erro de um dia').toBe(0);
  expect(await disparou('2026-08-21'), 'avisou 1 dia antes').toBe(0);
});

test('O ERRO DE UM DIA: a meta que vence hoje diz que vence hoje', async ({ page }) => {
  // Mesmo defeito, na tela de Metas: "Hoje é o prazo!" era inalcançável.
  await abrir(page, {
    goals: [{ id: 'g1', name: 'Viagem', emoji: '🏖️', target: 3000, deadline: '2026-08-20',
              saldoInicial: 100, historico: [], note: '', lastNotif: '' }],
  }, 'metas');
  await expect(page.locator('.goal-card', { hasText: 'Viagem' })).toContainText('Hoje é o prazo!');
});

test('O ERRO DE UM DIA: a contagem de dias restantes bate com o calendário', async ({ page }) => {
  await abrir(page, {
    goals: [{ id: 'g1', name: 'Viagem', emoji: '🏖️', target: 3000, deadline: '2026-08-25',
              saldoInicial: 100, historico: [], note: '', lastNotif: '' }],
  }, 'metas');
  // De 20/08 a 25/08 são 5 dias. Antes saía 6.
  await expect(page.locator('.goal-card', { hasText: 'Viagem' })).toContainText('5 dias restantes');
});

test('a linha da pendência mostra que ela avisa e repete', async ({ page }) => {
  await abrir(page, {
    pendencias: [{ id: 'p1', title: 'Troca de óleo', category: 'carro', priority: 'media',
                   deadline: '2026-08-25', estimatedValue: null, status: 'aberta',
                   createdAt: '2026-08-01', notifDaysBefore: 2, repeat: 'monthly',
                   lastNotif: '' }],
  });
  const linha = page.locator('.pend-card', { hasText: 'Troca de óleo' });
  await expect(linha, 'a repetição ficou invisível').toContainText('todo mês');
  await expect(linha, 'o aviso ficou invisível').toContainText('avisa 2d antes');
});

// ── As duas telas que morreram ────────────────────────────────────────────

test('NADA FICOU INALCANÇÁVEL: quem for a Lembretes chega em Pendências', async ({ page }) => {
  await abrir(page, {}, 'inicio');
  await page.evaluate(() => window.switchTab('lembretes'));
  await expect(page.locator('#page-pendencias')).toHaveClass(/active/);
  expect(await page.locator('#page-lembretes').count(), 'a tela de Lembretes ainda existe').toBe(0);
});

test('o conversor de moedas não existe mais em lugar nenhum', async ({ page }) => {
  const erros = await abrir(page, {}, 'inicio');
  expect(await page.locator('#page-conversor').count(), 'a tela do conversor sobreviveu').toBe(0);

  await irParaAba(page, 'mais');
  await expect(page.locator('#page-mais'), 'a porta do conversor sobreviveu').not.toContainText('Conversor');

  // E nenhuma função órfã sobrou pendurada em window.
  const sobrou = await page.evaluate(() => ['convertCurrency', 'loadConversorRates',
    'swapCurrencies', 'refreshConvRates', 'copyConvResult'].filter(n => typeof window[n] === 'function'));
  expect(sobrou, 'funções do conversor continuam definidas').toEqual([]);

  // Ir para o endereço antigo não quebra nada nem deixa a tela em branco.
  await page.evaluate(() => window.switchTab('conversor'));
  await expect(page.locator('.page.active'), 'o app ficou sem tela ativa').toHaveCount(1);
  expect(erros).toEqual([]);
});

test('a seção "Ferramentas" do menu não ficou vazia nem órfã', async ({ page }) => {
  await abrir(page, {}, 'inicio');
  await irParaAba(page, 'mais');
  // Sobrou a Pesquisa: a seção continua tendo motivo para existir.
  await expect(page.locator('#page-mais')).toContainText('Pesquisar lançamentos');
});
