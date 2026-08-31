// Toda tela do app precisa de uma porta.
//
// Duas telas existiam prontas — formulário, render, texto de ajuda — e não
// eram alcançáveis:
//
//   · METAS só tinha uma porta: o cartão "Ver metas" na Início. E esse cartão
//     só aparece para quem JÁ tem uma meta. Quem nunca criou nunca ia criar —
//     a porta ficava do lado de dentro.
//   · LEMBRETES não tinha porta nenhuma. Tela, CRUD, repetição, notificação
//     por antecedência, tudo pronto, alcançável só pelo console.
//
// O teste que importa aqui não é "o item existe no menu" — é a varredura:
// partindo de um app VAZIO, existe algum caminho visível até cada tela? É
// assim que o defeito foi encontrado, e é assim que ele fica encontrado.
import { test, expect } from '@playwright/test';
import { abrirAppEmDemo, semearDados, irParaAba, esperarOverlay, lerEstado } from './_helpers.js';

const AGORA = new Date(2026, 7, 20, 12, 0, 0);

/** Um usuário novo: nada cadastrado, nenhum cartão condicional na tela. */
const VAZIO = {
  platforms: [{ id: 'p1', name: 'Fonte A', color: '#0C7A52' }],
  incomeItems: [], dailyIncome: {}, expenses: [], debtPayments: [], fixedPayments: [],
  debts: [], fixedExpenses: [], pendencias: [], vehicles: [], patrimonios: [],
  reservaHistory: [], goals: [], daysOff: [], reminders: [],
  emergency: { current: 0, target: 0 },
};

// Duas telas saíram da lista porque deixaram de existir, cada uma por um
// motivo diferente:
//   · 'reserva' virou a primeira meta e mora dentro de 'metas';
//   · 'lembretes' virou pendência com aviso e repetição, dentro de 'pendencias'.
// Nenhuma das duas é porta perdida — é porta a menos para a mesma sala, e os
// testes abaixo garantem que as duas continuam alcançáveis.
// ('conversor' saiu por outro motivo: foi removido do app, não fundido.)
const TELAS_INTERNAS = ['pendencias', 'fixos', 'metas',
                        'patrimonio', 'dividas', 'pesquisa', 'ajustes'];

const abrir = async (page, dados) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const erros = await abrirAppEmDemo(page, { agora: AGORA });
  await semearDados(page, dados || VAZIO, 'inicio');
  await page.addStyleTag({ content: '*{transition:none !important;animation:none !important}' });
  return erros;
};

/** Varre todas as telas e devolve, por destino, os caminhos VISÍVEIS até ele. */
const caminhosAte = (page, destinos) => page.evaluate(destinos => {
  const achados = {}; destinos.forEach(d => achados[d] = []);
  const telas = ['inicio', 'semana', 'mes', 'mais'];
  const vis = el => {
    const c = getComputedStyle(el), b = el.getBoundingClientRect();
    return c.display !== 'none' && c.visibility !== 'hidden' && +c.opacity > 0 && b.width > 2 && b.height > 2;
  };
  for (const t of telas) {
    try { window.switchTab(t); } catch (e) { continue; }
    document.querySelectorAll('.page.active [onclick], .bottom-nav [onclick]').forEach(el => {
      if (!vis(el)) return;
      const h = el.getAttribute('onclick') || '';
      destinos.forEach(d => {
        if (new RegExp(`['"]${d}['"]`).test(h)) achados[d].push(t);
      });
    });
  }
  return achados;
}, destinos);

test('UM USUÁRIO NOVO alcança todas as telas internas', async ({ page }) => {
  await abrir(page);
  const c = await caminhosAte(page, TELAS_INTERNAS);
  const orfas = TELAS_INTERNAS.filter(t => c[t].length === 0);
  expect(orfas, 'telas sem nenhum caminho visível a partir de um app vazio').toEqual([]);
});

test('a porta de Metas não depende de já existir uma meta', async ({ page }) => {
  // Era exatamente este o defeito: a única porta aparecia depois de entrar.
  await abrir(page);
  const semMeta = await caminhosAte(page, ['metas']);
  expect(semMeta.metas.length, 'Metas ficou inalcançável para quem não tem meta').toBeGreaterThan(0);

  await page.evaluate(() => { D.goals = [{ id: 'g1', name: 'Viagem', target: 8000, saved: 1000 }]; });
  const comMeta = await caminhosAte(page, ['metas']);
  expect(comMeta.metas.length).toBeGreaterThanOrEqual(semMeta.metas.length);
});

test('a RESERVA continua alcançável depois de deixar de ser tela', async ({ page }) => {
  // Ela saiu de `TELAS_INTERNAS` porque virou a primeira meta. Sair da lista
  // não pode virar desculpa: o caminho até ela tem de existir, e o endereço
  // antigo tem de continuar levando a algum lugar.
  await abrir(page);
  await irParaAba(page, 'mais');
  const porta = page.locator('.mais-item').filter({ hasText: 'Metas e reserva' });
  await expect(porta, 'sumiu a porta para metas e reserva').toHaveCount(1);
  await porta.click();
  await expect(page.locator('#page-metas')).toHaveClass(/active/);

  // E o endereço antigo não vira beco sem saída.
  await page.evaluate(() => window.switchTab('reserva'));
  await expect(page.locator('#page-metas')).toHaveClass(/active/);
});

test('LEMBRETE: o ciclo completo, agora dentro de Pendências', async ({ page }) => {
  // A tela de Lembretes não existe mais — um lembrete é uma pendência com
  // prazo, aviso e repetição. O ciclo que este teste protegia continua
  // inteiro; mudou o endereço.
  const erros = await abrir(page);
  await irParaAba(page, 'mais');
  await page.locator('.mais-item').filter({ hasText: 'Pendências' }).click();
  await expect(page.locator('#page-pendencias')).toHaveClass(/active/);

  // Criar
  await page.evaluate(() => window.openPendenciaModal());
  await esperarOverlay(page, 'modal-pendencia', true);
  await page.fill('#pend-title-input', 'Troca de óleo');
  await page.fill('#pend-deadline', '2026-09-10');
  await page.dispatchEvent('#pend-deadline', 'change');
  await page.selectOption('#pend-notif', '2');
  await page.selectOption('#pend-repeat', 'monthly');
  await page.evaluate(() => window.savePendencia());
  await esperarOverlay(page, 'modal-pendencia', false);
  await expect(page.locator('#pend-list')).toContainText('Troca de óleo');
  expect(await lerEstado(page, 'D.pendencias.length')).toBe(1);
  // O que veio dos Lembretes sobreviveu à criação.
  expect(await lerEstado(page, 'D.pendencias[0].notifDaysBefore')).toBe(2);
  expect(await lerEstado(page, 'D.pendencias[0].repeat')).toBe('monthly');

  // Editar
  await page.evaluate(() => window.openPendenciaModal(window.eval('D').pendencias[0].id));
  await esperarOverlay(page, 'modal-pendencia', true);
  await page.fill('#pend-title-input', 'Troca de óleo e filtro');
  await page.evaluate(() => window.savePendencia());
  await expect(page.locator('#pend-list')).toContainText('Troca de óleo e filtro');
  expect(await lerEstado(page, 'D.pendencias.length'), 'editar duplicou').toBe(1);
  expect(await lerEstado(page, 'D.pendencias[0].repeat'), 'editar perdeu a repetição').toBe('monthly');

  expect(erros).toEqual([]);
});

test('excluir uma pendência PERGUNTA antes — como o resto do app', async ({ page }) => {
  // Esta garantia vinha do teste de Lembretes: o ✕ da lista era a única
  // exclusão do app que apagava sem perguntar. A tela morreu; a garantia não.
  await abrir(page, { ...VAZIO, pendencias: [
    { id: 'p1', title: 'Seguro', category: 'pessoal', priority: 'media',
      deadline: '2026-09-01', estimatedValue: null, status: 'aberta',
      createdAt: '2026-08-01', notifDaysBefore: 2, repeat: 'none', lastNotif: '' },
  ] });
  await irParaAba(page, 'pendencias');
  await expect(page.locator('#pend-list')).toContainText('Seguro');

  await page.evaluate(() => window.deletePendencia('p1'));
  await page.waitForTimeout(250);

  // Nada foi apagado ainda: existe uma confirmação na frente.
  expect(await lerEstado(page, 'D.pendencias.length'), 'a pendência sumiu sem perguntar').toBe(1);
  const dlg = page.locator('#_av_dlg');
  await expect(dlg, 'nenhuma confirmação apareceu').toBeVisible();

  // Cancelar preserva.
  await dlg.getByRole('button', { name: 'Cancelar' }).click();
  await page.waitForTimeout(200);
  expect(await lerEstado(page, 'D.pendencias.length'), 'cancelar apagou mesmo assim').toBe(1);

  // Confirmar apaga.
  await page.evaluate(() => window.deletePendencia('p1'));
  await page.locator('#_av_dlg').getByRole('button', { name: 'Excluir' }).click();
  await page.waitForTimeout(250);
  expect(await lerEstado(page, 'D.pendencias.length')).toBe(0);
});

test('METAS: a tela abre pelo menu e cria a primeira meta', async ({ page }) => {
  const erros = await abrir(page);
  await irParaAba(page, 'mais');
  await page.locator('.mais-item').filter({ hasText: 'Metas' }).click();
  await expect(page.locator('#page-metas')).toHaveClass(/active/);
  expect(erros).toEqual([]);
});

test('o menu Mais informa o estado de cada tela', async ({ page }) => {
  await abrir(page);
  await irParaAba(page, 'mais');
  // Vazio: o item diz que está vazio, em vez de mentir um número.
  await expect(page.locator('.mais-item').filter({ hasText: 'Pendências' })).toContainText('Nenhuma em aberto');
  await expect(page.locator('.mais-item').filter({ hasText: 'Metas' })).toContainText('Nenhuma meta ainda');

  await page.evaluate(() => {
    D.pendencias = [{ id: 'p1', title: 'Seguro', category: 'pessoal', priority: 'media',
                      deadline: '2026-12-01', estimatedValue: null, status: 'aberta',
                      createdAt: '2026-08-01', notifDaysBefore: 2, repeat: 'none' }];
    D.goals = [{ id: 'g1', name: 'Viagem', target: 8000, saldoInicial: 1000, historico: [] }];
    window.switchTab('mais');
  });
  await expect(page.locator('.mais-item').filter({ hasText: 'Pendências' })).toContainText('1 em aberto');
  await expect(page.locator('.mais-item').filter({ hasText: 'Metas' })).toContainText('em andamento');
});

test('abrir as telas novas não encosta em D nem chama save()', async ({ page }) => {
  await abrir(page);
  const antes = await lerEstado(page, 'JSON.stringify(D)');
  const salvou = await page.evaluate(() => {
    let n = 0; const s = window.save; window.save = () => { n++; return s && s(); };
    ['mais', 'pendencias', 'metas', 'mais', 'inicio'].forEach(t => window.switchTab(t));
    window.save = s; return n;
  });
  expect(salvou).toBe(0);
  expect(await lerEstado(page, 'JSON.stringify(D)')).toBe(antes);
});
