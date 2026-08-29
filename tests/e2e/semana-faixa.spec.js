// A faixa de dias da Semana.
//
// O acordeão empilhava os sete dias com cabeçalho completo cada um: 635px de
// tela só para escolher um dia, e mais de um podia ficar aberto ao mesmo
// tempo. Agora os cabeçalhos são uma faixa e só o dia escolhido abre.
//
// Mesma disciplina de `mes-vistas` e `home-estrutura`: o que se prova aqui não
// é que a faixa é bonita — é que nenhuma ação do dia se perdeu.
import { test, expect } from '@playwright/test';
import { abrirAppEmDemo, semearDados, irParaAba, lerEstado, esperarOverlay } from './_helpers.js';

const AGORA = new Date(2026, 5, 15, 12, 0, 0);   // segunda, 15/06/2026

const SEMANA = {
  incomeItems: [
    { id: 'i-seg', date: '2026-06-15', amount: 185, status: 'paid', platformId: 'plat-1', note: '' },
    { id: 'i-qua', date: '2026-06-17', amount: 240, status: 'paid', platformId: 'plat-1', note: '' },
  ],
  dailyIncome: {}, debtPayments: [], fixedPayments: [], debts: [], fixedExpenses: [],
  pendencias: [], vehicles: [], patrimonios: [], reservaHistory: [],
  platforms: [{ id: 'plat-1', name: 'Fonte A', color: '#0C7A52' }],
  expenses: [
    { id: 'e-seg', date: '2026-06-15', amount: 85, category: 'Transporte', description: 'Gasolina' },
    { id: 'e-qui', date: '2026-06-18', amount: 40, category: 'Alimentação', description: 'Almoço' },
  ],
  daysOff: [],
};

const abrir = async page => {
  await abrirAppEmDemo(page, { agora: AGORA });
  await semearDados(page, SEMANA, 'semana');
};

test('a faixa traz os sete dias, e só um abre por vez', async ({ page }) => {
  await abrir(page);
  await expect(page.locator('.dsem-faixa .dsem-dia')).toHaveCount(7);
  await expect(page.locator('#days-accordion .dacc.open')).toHaveCount(1);
  await expect(page.locator('.dsem-faixa .dsem-dia.sel')).toHaveCount(1);
});

test('a tela abre no dia de HOJE, como abria antes', async ({ page }) => {
  await abrir(page);
  await expect(page.locator('.dsem-faixa .dsem-dia.sel')).toHaveClass(/hoje/);
  await expect(page.locator('#days-accordion .dacc-name')).toContainText('15');
});

test('escolher um dia troca o conteúdo aberto', async ({ page }) => {
  await abrir(page);
  await page.locator('.dsem-faixa .dsem-dia').nth(3).click();   // quinta, 18
  await expect(page.locator('#days-accordion .dacc-name')).toContainText('18');
  await expect(page.locator('#days-accordion .dacc-body-in')).toContainText('Almoço');
  // E o dia anterior deixou de estar aberto — é isso que encurta a tela.
  await expect(page.locator('#days-accordion .dacc-body-in')).not.toContainText('Gasolina');
});

test('NADA SE PERDEU: editar, remover e "Editar dia completo" seguem no dia aberto', async ({ page }) => {
  await abrir(page);
  await expect(page.locator('#days-accordion .dacc-tx-edit').first()).toBeVisible();
  await expect(page.locator('#days-accordion .dacc-tx-del').first()).toBeVisible();
  await expect(page.locator('#days-accordion')).toContainText('Editar dia completo');

  // O caminho de edição continua chegando ao mesmo lugar.
  await page.locator('#days-accordion .dacc-tx-edit').first().click();
  await esperarOverlay(page, 'modal-quick-add', true);
});

test('a folha do dia continua alcançável por "Editar dia completo"', async ({ page }) => {
  await abrir(page);
  await page.locator('#days-accordion').getByText('Editar dia completo').click();
  await esperarOverlay(page, 'modal-day-detail', true);
});

test('a grade #days-grid segue oculta, como já estava', async ({ page }) => {
  await abrir(page);
  // `.days-grid { display:none !important }` existe desde antes desta reforma:
  // a grade é markup legado que ninguém vê. Este teste existe para que a
  // afirmação fique registrada — se um dia ela reaparecer, será por decisão,
  // não por acidente de cascata.
  await expect(page.locator('#days-grid')).toBeHidden();
  await expect(page.locator('#days-grid .day-btn')).toHaveCount(7);
});

test('a escolha do usuário manda ao trocar de semana; sem escolha, volta a HOJE', async ({ page }) => {
  await abrir(page);
  // Sem escolha: ao voltar para a semana atual, HOJE de novo.
  await page.evaluate(() => window.changeWeek(-1));
  await page.evaluate(() => window.changeWeek(1));
  await expect(page.locator('.dsem-faixa .dsem-dia.sel')).toHaveClass(/hoje/);

  // Com escolha: a semana seguinte respeita o dia escolhido.
  await page.locator('.dsem-faixa .dsem-dia').nth(5).click();
  await page.evaluate(() => window.changeWeek(1));
  const idx = await page.locator('.dsem-faixa .dsem-dia').evaluateAll(
    ns => ns.findIndex(n => n.classList.contains('sel')));
  expect(idx).toBe(5);
});

test('a tela encurtou: sete cabeçalhos empilhados viraram uma linha', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await abrir(page);
  await page.waitForTimeout(150);
  const m = await page.evaluate(() => ({
    faixa: document.querySelector('.dsem-faixa').getBoundingClientRect().height,
    total: document.body.scrollHeight,
  }));
  // Sete cabeçalhos empilhados passavam de 400px só para escolher um dia.
  expect(m.faixa).toBeLessThan(110);
  expect(m.total, 'a Semana voltou a ser um rolo').toBeLessThan(1700);
});

test('a seleção do dia é estado de tela: não encosta em D nem chama save()', async ({ page }) => {
  await abrir(page);
  const antes = await lerEstado(page, 'JSON.stringify(D)');
  await page.evaluate(() => {
    window.__salvou = 0;
    const s = window.save; window.save = () => { window.__salvou++; return s && s(); };
    [1, 4, 6, 0].forEach(i => window.selecionarDiaSemana(i));
  });
  expect(await lerEstado(page, 'JSON.stringify(D)')).toBe(antes);
  expect(await lerEstado(page, 'window.__salvou')).toBe(0);
});

test('a Semana não solta erro de console ao percorrer os dias', async ({ page }) => {
  const erros = await abrirAppEmDemo(page, { agora: AGORA });
  await semearDados(page, SEMANA, 'semana');
  for (let i = 0; i < 7; i++) await page.locator('.dsem-faixa .dsem-dia').nth(i).click();
  await irParaAba(page, 'inicio');
  await irParaAba(page, 'semana');
  expect(erros).toEqual([]);
});
