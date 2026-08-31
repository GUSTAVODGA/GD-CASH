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

// 'reserva' saiu da lista porque deixou de ser uma tela: a reserva de
// emergência virou a primeira meta e mora dentro de 'metas'. Não é uma porta
// perdida — é uma porta a menos para a mesma sala. O teste logo abaixo garante
// que a reserva continua alcançável.
const TELAS_INTERNAS = ['pendencias', 'lembretes', 'fixos', 'metas',
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

test('LEMBRETES: a tela abre pelo menu e faz o ciclo completo', async ({ page }) => {
  const erros = await abrir(page);
  await irParaAba(page, 'mais');
  await page.locator('.mais-item').filter({ hasText: 'Lembretes' }).click();
  await expect(page.locator('#page-lembretes')).toHaveClass(/active/);
  await expect(page.locator('#lembretes-list')).toContainText('Nenhum lembrete ainda');

  // Criar
  await page.locator('#page-lembretes').getByText('+ Novo lembrete').click();
  await esperarOverlay(page, 'modal-lembrete', true);
  await page.fill('#lem-name', 'Troca de óleo');
  await page.fill('#lem-date', '2026-09-10');
  await page.evaluate(() => window.saveLembrete());
  await esperarOverlay(page, 'modal-lembrete', false);
  await expect(page.locator('#lembretes-list')).toContainText('Troca de óleo');
  expect(await lerEstado(page, 'D.reminders.length')).toBe(1);

  // Editar
  await page.locator('#lembretes-list .fixed-del').first().click();
  await esperarOverlay(page, 'modal-lembrete', true);
  await page.fill('#lem-name', 'Troca de óleo e filtro');
  await page.evaluate(() => window.saveLembrete());
  await expect(page.locator('#lembretes-list')).toContainText('Troca de óleo e filtro');
  expect(await lerEstado(page, 'D.reminders.length'), 'editar duplicou o lembrete').toBe(1);

  expect(erros).toEqual([]);
});

test('excluir um lembrete PERGUNTA antes — como o resto do app', async ({ page }) => {
  await abrir(page, { ...VAZIO, reminders: [{ id: 'r1', name: 'Seguro', date: '2026-09-01', notifDaysBefore: 2, repeat: 'none', lastNotif: '' }] });
  await irParaAba(page, 'lembretes');
  await expect(page.locator('#lembretes-list')).toContainText('Seguro');

  // O ✕ é o segundo botão da linha; o primeiro (···) abre a edição.
  await page.locator('#lembretes-list .fixed-del').nth(1).click();
  await page.waitForTimeout(250);

  // Nada foi apagado ainda: existe uma confirmação na frente. O diálogo do app
  // é `#_av_dlg` (av-overlay), não uma folha `.overlay`.
  expect(await lerEstado(page, 'D.reminders.length'), 'o lembrete sumiu sem perguntar').toBe(1);
  const dlg = page.locator('#_av_dlg');
  await expect(dlg, 'nenhuma confirmação apareceu').toBeVisible();
  await expect(dlg).toContainText('Seguro');

  // Cancelar preserva.
  await dlg.getByRole('button', { name: 'Cancelar' }).click();
  await page.waitForTimeout(200);
  expect(await lerEstado(page, 'D.reminders.length'), 'cancelar apagou mesmo assim').toBe(1);

  // Confirmar apaga — pelo botão de verdade, não por chamada direta.
  await page.locator('#lembretes-list .fixed-del').nth(1).click();
  await page.locator('#_av_dlg').getByRole('button', { name: 'Excluir' }).click();
  await page.waitForTimeout(250);
  expect(await lerEstado(page, 'D.reminders.length')).toBe(0);
  await expect(page.locator('#lembretes-list')).toContainText('Nenhum lembrete ainda');
});

test('METAS: a tela abre pelo menu e cria a primeira meta', async ({ page }) => {
  const erros = await abrir(page);
  await irParaAba(page, 'mais');
  await page.locator('.mais-item').filter({ hasText: 'Metas' }).click();
  await expect(page.locator('#page-metas')).toHaveClass(/active/);
  expect(erros).toEqual([]);
});

test('o menu Mais informa o estado das duas telas novas', async ({ page }) => {
  await abrir(page);
  await irParaAba(page, 'mais');
  // Vazio: o item diz que está vazio, em vez de mentir um número.
  await expect(page.locator('.mais-item').filter({ hasText: 'Lembretes' })).toContainText('Nenhum lembrete');
  await expect(page.locator('.mais-item').filter({ hasText: 'Metas' })).toContainText('Nenhuma meta ainda');

  await page.evaluate(() => {
    D.reminders = [{ id: 'r1', name: 'Seguro', date: '2026-12-01', notifDaysBefore: 2, repeat: 'none' }];
    D.goals = [{ id: 'g1', name: 'Viagem', target: 8000, saved: 1000 }];
    window.switchTab('mais');
  });
  await expect(page.locator('.mais-item').filter({ hasText: 'Lembretes' })).toContainText('Próximo');
  await expect(page.locator('.mais-item').filter({ hasText: 'Metas' })).toContainText('1 em andamento');
});

test('abrir as telas novas não encosta em D nem chama save()', async ({ page }) => {
  await abrir(page);
  const antes = await lerEstado(page, 'JSON.stringify(D)');
  const salvou = await page.evaluate(() => {
    let n = 0; const s = window.save; window.save = () => { n++; return s && s(); };
    ['mais', 'lembretes', 'metas', 'mais', 'inicio'].forEach(t => window.switchTab(t));
    window.save = s; return n;
  });
  expect(salvou).toBe(0);
  expect(await lerEstado(page, 'JSON.stringify(D)')).toBe(antes);
});
