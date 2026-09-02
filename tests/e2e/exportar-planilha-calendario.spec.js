// Duas portas que existiam sem maçaneta: `exportCSV` e `exportCalendar`
// estavam completas no código — cabeçalho, formatação, lembrete de 2 dias —
// mas nenhum botão do app chamava nenhuma das duas. Uma varredura de funções
// sem chamador encontrou as duas junto com `shareApp`.
//
// São exportações, não backup: não substituem nem apagam nada em `D`. Ficam
// em Ajustes, ao lado de "Exportar backup", porque respondem à mesma
// pergunta ("quero uma cópia dos meus dados fora do app") com propósitos
// diferentes — uma para ANALISAR (planilha), outra para SER AVISADO
// (agenda do celular).
//
// O QUE ESTES TESTES PROTEGEM:
//
//   AS DUAS TÊM PORTA. Existir no código não é a mesma coisa que existir para
//   o usuário — é exatamente o defeito que motivou esta revisão.
//
//   ESTADO VAZIO NÃO BAIXA UM ARQUIVO EM BRANCO. Um CSV com só o cabeçalho, ou
//   um .ics sem nenhum evento, pareceria um erro do app, não um estado.
//
//   O CONTEÚDO ESTÁ CERTO: o CSV tem o sinal do gasto invertido (saída conta
//   como negativa) e o .ics carrega o lembrete de 2 dias antes.
//
//   SÓ LEITURA: gerar qualquer um dos dois arquivos não grava em D.
import { test, expect } from '@playwright/test';
import { abrirAppEmDemo, semearDados, lerEstado } from './_helpers.js';

const AGORA = new Date(2026, 7, 20, 12, 0, 0);

const LIMPO = {
  incomeItems: [], dailyIncome: {}, expenses: [], debtPayments: [], fixedPayments: [],
  debts: [], fixedExpenses: [], pendencias: [], vehicles: [], patrimonios: [], reservaHistory: [],
  platforms: [{ id: 'plat-1', name: 'GrubHub', color: '#0C7A52' }],
};

const COM_DADOS = {
  expenses: [{ id: 'e1', date: '2026-08-11', amount: 55.5, category: 'Gasolina', description: 'Posto' }],
  incomeItems: [{ id: 'i1', date: '2026-08-10', amount: 200, status: 'paid', platformId: 'plat-1', note: 'Corridas' }],
  fixedExpenses: [{ id: 'f1', name: 'Aluguel', amount: 1450, category: 'Casa', dueDay: 5, since: '2025-01-01' }],
};

const abrir = async (page, dados) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const erros = await abrirAppEmDemo(page, { agora: AGORA });
  await semearDados(page, { ...LIMPO, ...(dados || {}) }, 'ajustes');
  return erros;
};

/** Espiona downloads: intercepta o clique no <a> e o conteúdo do Blob. */
async function espionar(page) {
  await page.evaluate(() => {
    window.__down = [];
    const criarEl = document.createElement.bind(document);
    document.createElement = tag => {
      const el = criarEl(tag);
      if (tag === 'a') {
        const clicar = el.click.bind(el);
        el.click = () => { window.__down.push({ nome: el.download, href: el.href }); try { clicar(); } catch (e) {} };
      }
      return el;
    };
    const BlobOrig = window.Blob;
    window.__blobs = new Map();
    window.Blob = class extends BlobOrig {
      constructor(partes, opts) {
        super(partes, opts);
        window.__blobs.set(this, partes.join(''));
      }
    };
    const criarURL = URL.createObjectURL.bind(URL);
    window.__urls = new Map();
    URL.createObjectURL = blob => {
      const url = criarURL(blob);
      window.__urls.set(url, window.__blobs.get(blob));
      return url;
    };
  });
}

const conteudoDoUltimoDownload = page => page.evaluate(() => {
  const d = window.__down[window.__down.length - 1];
  return d ? window.__urls.get(d.href) : null;
});

const linhaAjustes = (page, rotulo) => page.locator('.srow', { hasText: rotulo });
const toastMsg = page => page.locator('.av-toast-msg');

// ── As duas têm porta ───────────────────────────────────────────────────

test('a linha "Exportar planilha (CSV)" existe em Ajustes e chama exportCSV', async ({ page }) => {
  await abrir(page, COM_DADOS);
  const linha = linhaAjustes(page, 'Exportar planilha (CSV)');
  await expect(linha).toBeVisible();
  await expect(linha).toContainText('2 lançamentos');
  const onclick = await linha.getAttribute('onclick');
  expect(onclick).toBe('exportCSV()');
});

test('a linha "Exportar vencimentos (calendário)" existe em Ajustes e chama exportCalendar', async ({ page }) => {
  await abrir(page, COM_DADOS);
  const linha = linhaAjustes(page, 'Exportar vencimentos (calendário)');
  await expect(linha).toBeVisible();
  await expect(linha).toContainText('1 gasto fixo com vencimento');
  const onclick = await linha.getAttribute('onclick');
  expect(onclick).toBe('exportCalendar()');
});

// ── Estado vazio não baixa arquivo em branco ──────────────────────────────

test('CSV vazio: nenhum download, e o app diz por quê', async ({ page }) => {
  await abrir(page, {});
  await espionar(page);
  await linhaAjustes(page, 'Exportar planilha (CSV)').click();
  await expect(toastMsg(page)).toHaveText('Ainda não há lançamentos para exportar.');
  const baixou = await page.evaluate(() => window.__down.length > 0);
  expect(baixou, 'baixou um CSV com nada dentro').toBe(false);
});

test('calendário vazio: nenhum download, e o app diz por quê', async ({ page }) => {
  await abrir(page, {});
  await espionar(page);
  await linhaAjustes(page, 'Exportar vencimentos (calendário)').click();
  await expect(toastMsg(page)).toHaveText('Cadastre gastos fixos com dia de vencimento antes de exportar.');
  const baixou = await page.evaluate(() => window.__down.length > 0);
  expect(baixou).toBe(false);
});

test('o subtítulo muda para o estado vazio quando não há o que exportar', async ({ page }) => {
  await abrir(page, {});
  await expect(linhaAjustes(page, 'Exportar planilha (CSV)')).toContainText('Nada lançado ainda');
  await expect(linhaAjustes(page, 'Exportar vencimentos (calendário)'))
    .toContainText('Nenhum gasto fixo com dia de vencimento');
});

// ── O conteúdo do arquivo ─────────────────────────────────────────────────

test('o CSV tem cabeçalho, o gasto como valor NEGATIVO e a receita como positivo', async ({ page }) => {
  await abrir(page, COM_DADOS);
  await espionar(page);
  await linhaAjustes(page, 'Exportar planilha (CSV)').click();
  await expect(toastMsg(page)).toHaveText('Planilha exportada.');

  const nome = await page.evaluate(() => window.__down.at(-1).nome);
  expect(nome).toMatch(/^avenco-\d{4}-\d{2}-\d{2}\.csv$/);

  const csv = await conteudoDoUltimoDownload(page);
  expect(csv).toContain('Data,Tipo,Categoria/Plataforma,Descrição,Valor'.split(',').join('","'));
  expect(csv, 'o gasto não está negativo').toContain('"-55.5"');
  expect(csv, 'a receita sumiu ou trocou de sinal').toContain('"200"');
  expect(csv).toContain('"Posto"');
  expect(csv).toContain('"Corridas"');
});

test('o .ics carrega o vencimento e o lembrete de 2 dias antes', async ({ page }) => {
  await abrir(page, COM_DADOS);
  await espionar(page);
  await linhaAjustes(page, 'Exportar vencimentos (calendário)').click();
  await expect(toastMsg(page)).toHaveText('Arquivo de vencimentos exportado.');

  const nome = await page.evaluate(() => window.__down.at(-1).nome);
  expect(nome).toBe('avenco-vencimentos.ics');

  const ics = await conteudoDoUltimoDownload(page);
  expect(ics).toContain('BEGIN:VCALENDAR');
  expect(ics).toContain('SUMMARY:🔁 Aluguel');
  expect(ics, 'perdeu o lembrete de 2 dias antes').toContain('TRIGGER:-P2D');
  // Doze meses de vencimento — um por mês à frente, não só o mês corrente.
  expect((ics.match(/BEGIN:VEVENT/g) || []).length).toBeGreaterThanOrEqual(11);
});

// ── Pureza ────────────────────────────────────────────────────────────────

test('exportar não grava em D nem chama save()', async ({ page }) => {
  await abrir(page, COM_DADOS);
  await espionar(page);
  const antes = await lerEstado(page, 'JSON.stringify(D)');
  const salvou = await page.evaluate(() => {
    let n = 0; const s = window.save; window.save = () => { n++; return s && s(); };
    window.exportCSV(); window.exportCalendar();
    window.save = s; return n;
  });
  expect(salvou, 'exportar chamou save()').toBe(0);
  expect(await lerEstado(page, 'JSON.stringify(D)')).toBe(antes);
});
