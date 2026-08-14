// Compartilhar e exportar o resumo mensal — camada 3.
//
// Duas perguntas: o mês compartilhado é o EXIBIDO (inclusive meses anteriores
// à existência desta feature), e gerar/compartilhar não toca em dinheiro.
//
// O fallback importa tanto quanto o caminho feliz: em desktop sem
// `navigator.share`, a peça precisa virar download em vez de sumir.
import { test, expect } from '@playwright/test';
import { abrirAppEmDemo, semearDados, lerEstado, irParaAba } from './_helpers.js';

const AGORA = new Date(2026, 7, 20, 12, 0, 0);   // 20/08/2026 — agosto é o mês 0

const LIMPO = {
  incomeItems: [], dailyIncome: {}, expenses: [], debtPayments: [], fixedPayments: [],
  debts: [], fixedExpenses: [], pendencias: [], vehicles: [], patrimonios: [], reservaHistory: [],
  platforms: [{ id: 'plat-1', name: 'Plataforma Teste', color: '#888' }],
};

const rec = (id, data, valor) => ({ id, date: data, amount: valor, status: 'paid', platformId: 'plat-1', note: 'Entrada Teste' });
const gasto = (id, data, valor, cat) => ({ id, date: data, amount: valor, category: cat, description: 'Lançamento Teste' });

// Três meses distintos: agosto (0), julho (−1) e junho (−2).
const TRES_MESES = {
  incomeItems: [rec('i-jun', '2026-06-10', 1000), rec('i-jul', '2026-07-10', 2000), rec('i-ago', '2026-08-10', 3000)],
  expenses: [
    gasto('e-jun', '2026-06-11', 100, 'Junho'),
    gasto('e-jul', '2026-07-11', 200, 'Julho'),
    gasto('e-ago', '2026-08-11', 300, 'Agosto'),
  ],
};

async function abrir(page, dados) {
  await abrirAppEmDemo(page, { agora: AGORA });
  await semearDados(page, { ...LIMPO, ...(dados || {}) }, 'mes');
}

/** Instala espiões: registra o que foi compartilhado/baixado, sem I/O real. */
async function espionar(page) {
  await page.evaluate(() => {
    window.__share = { arquivos: [], downloads: [] };
    navigator.share = files => { window.__share.arquivos.push(files); return Promise.resolve(); };
    navigator.canShare = () => true;
    const criar = document.createElement.bind(document);
    document.createElement = tag => {
      const el = criar(tag);
      if (tag === 'a') {
        const clicar = el.click.bind(el);
        el.click = () => { window.__share.downloads.push(el.download); try { clicar(); } catch (e) {} };
      }
      return el;
    };
  });
}

const esperarShare = page => page.waitForFunction(() => window.__share.arquivos.length > 0, null, { timeout: 5000 });
const esperarDownload = page => page.waitForFunction(() => window.__share.downloads.length > 0, null, { timeout: 5000 });

// ══ O MÊS EXIBIDO É A FONTE ══════════════════════════════════════════════

test('compartilhar usa o mês exibido, não o mês atual', async ({ page }) => {
  await abrir(page, TRES_MESES);
  await irParaAba(page, 'mes');
  await page.evaluate(() => { window.monthOffset = -1; window.renderMes(); });

  const usado = await page.evaluate(() => {
    const m = window._monthShareModel(window.monthOffset);
    return { rotulo: m.periodo.rotulo, off: m.periodo.off, entradas: m.caixa.entradas };
  });
  expect(usado.off).toBe(-1);
  expect(usado.entradas).toBe(2000);
  expect(usado.rotulo).not.toBe(await page.evaluate(() => window.fmtMonthYear(0)));
});

test('agosto → julho → junho → julho: cada mês é o seu, e julho se repete', async ({ page }) => {
  await abrir(page, TRES_MESES);
  await irParaAba(page, 'mes');
  const ler = off => page.evaluate(o => JSON.stringify(window._monthShareModel(o)), off);

  const agosto = JSON.parse(await ler(0));
  const julho1 = await ler(-1);
  const junho = JSON.parse(await ler(-2));
  const julho2 = await ler(-1);

  expect(agosto.caixa.entradas).toBe(3000);
  expect(JSON.parse(julho1).caixa.entradas).toBe(2000);
  expect(junho.caixa.entradas).toBe(1000);
  expect(julho2).toBe(julho1);                       // determinístico
  expect(agosto.consumo.categorias[0].nome).toBe('Agosto');
  expect(junho.consumo.categorias[0].nome).toBe('Junho');
});

test('nenhuma informação do mês atual vaza para um mês histórico', async ({ page }) => {
  await abrir(page, TRES_MESES);
  const junho = await lerEstado(page, '_monthShareModel(-2)');
  expect(junho.caixa.saidas).toBe(100);
  expect(junho.consumo.categorias.map(c => c.nome)).toEqual(['Junho']);
});

test('compartilhar um mês não altera o mês seguinte', async ({ page }) => {
  await abrir(page, TRES_MESES);
  await espionar(page);
  const agostoAntes = await lerEstado(page, 'JSON.stringify(_monthShareModel(0))');
  await page.evaluate(() => { window.monthOffset = -1; window.shareMonthReport(); });
  await esperarShare(page);
  expect(await lerEstado(page, 'JSON.stringify(_monthShareModel(0))')).toBe(agostoAntes);
});

test('mês anterior à feature gera relatório sem exigir nada novo', async ({ page }) => {
  // Dados "antigos": sem meta nenhuma, como um lançamento pré-Fase A/B/C.
  await abrir(page, {
    expenses: [{ id: 'legado', date: '2026-06-05', amount: 250, category: 'Casa', description: 'x' }],
  });
  const junho = await lerEstado(page, '_monthShareModel(-2)');
  expect(junho.periodo.vazio).toBe(false);
  expect(junho.caixa.saidas).toBe(250);
  expect(junho.consumo.total).toBe(250);
});

// ══ EXPORTAÇÃO ═══════════════════════════════════════════════════════════

test('com navigator.share: envia um PNG nomeado pelo mês exibido', async ({ page }) => {
  await abrir(page, TRES_MESES);
  await espionar(page);
  await page.evaluate(() => { window.monthOffset = -1; window.shareMonthReport(); });
  await esperarShare(page);

  const envio = await page.evaluate(() => {
    const a = window.__share.arquivos[0];
    return { titulo: a.title, nome: a.files[0].name, tipo: a.files[0].type, bytes: a.files[0].size };
  });
  expect(envio.tipo).toBe('image/png');
  expect(envio.nome).toMatch(/^avenco-.+\.png$/);
  expect(envio.bytes).toBeGreaterThan(1000);
  expect(envio.titulo).toContain('Avenco');
  expect(await lerEstado(page, 'window.__share.downloads.length')).toBe(0);
});

test('sem navigator.share: cai no download, sem erro', async ({ page }) => {
  await abrir(page, TRES_MESES);
  await espionar(page);
  await page.evaluate(() => { delete navigator.share; delete navigator.canShare; });
  await page.evaluate(() => window.shareMonthReport());
  await esperarDownload(page);

  const nome = await lerEstado(page, 'window.__share.downloads[0]');
  expect(nome).toMatch(/^avenco-.+\.png$/);
});

test('canShare recusando arquivos também cai no download', async ({ page }) => {
  await abrir(page, TRES_MESES);
  await espionar(page);
  await page.evaluate(() => { navigator.canShare = () => false; });
  await page.evaluate(() => window.shareMonthReport());
  await esperarDownload(page);
  expect(await lerEstado(page, 'window.__share.arquivos.length')).toBe(0);
});

test('falha ao desenhar avisa e não corrompe estado', async ({ page }) => {
  await abrir(page, TRES_MESES);
  const antes = await lerEstado(page, 'JSON.stringify(D)');
  await page.evaluate(() => {
    window._renderShareCanvas = () => { throw new Error('falha sintética'); };
    window.shareMonthReport();
  });
  expect(await lerEstado(page, 'JSON.stringify(D)')).toBe(antes);
  expect(await lerEstado(page, 'monthOffset')).toBe(0);
});

// ══ NÃO TOCA EM DINHEIRO ═════════════════════════════════════════════════

test('compartilhar não altera D, não salva e não cria lançamento', async ({ page }) => {
  await abrir(page, TRES_MESES);
  await espionar(page);
  const antes = await lerEstado(page, 'JSON.stringify(D)');
  const offAntes = await lerEstado(page, 'monthOffset');

  await page.evaluate(() => {
    window.__salvou = 0;
    const s = window.save; window.save = () => { window.__salvou++; return s && s(); };
    window.shareMonthReport();
  });
  await esperarShare(page);

  expect(await lerEstado(page, 'JSON.stringify(D)')).toBe(antes);
  expect(await lerEstado(page, 'window.__salvou')).toBe(0);
  expect(await lerEstado(page, 'monthOffset')).toBe(offAntes);
  expect(await lerEstado(page, 'D.expenses.length')).toBe(3);
  expect(await lerEstado(page, 'D.debtPayments.length')).toBe(0);
  expect(await lerEstado(page, 'D.fixedPayments.length')).toBe(0);
});

test('gerar a peça de vários meses seguidos não deixa resíduo', async ({ page }) => {
  await abrir(page, TRES_MESES);
  const antes = await lerEstado(page, 'JSON.stringify(D)');
  await page.evaluate(() => { [0, -1, -2, -6, -12].forEach(o => window._renderShareCanvas(window._monthShareModel(o))); });
  expect(await lerEstado(page, 'JSON.stringify(D)')).toBe(antes);
});

// ══ E-MAIL: MESMA FONTE ══════════════════════════════════════════════════

test('o e-mail usa o mesmo modelo e o mesmo mês exibido', async ({ page }) => {
  await abrir(page, TRES_MESES);
  const texto = await page.evaluate(() => window._shareTextoDoModelo(window._monthShareModel(-1)));
  expect(texto).toContain('Entrou');
  expect(texto).toContain('Resultado');
  expect(texto).toContain(await page.evaluate(() => window.R(2000)));
  // Julho, não agosto.
  expect(texto).not.toContain(await page.evaluate(() => window.R(3000)));
});

test('o texto do e-mail separa natureza como a imagem', async ({ page }) => {
  await abrir(page, {
    incomeItems: [rec('i1', '2026-08-10', 5000), { id: 'i2', date: '2026-08-12', amount: 40000, status: 'paid', platformId: null, note: 'Venda Teste', meta: { source: 'asset-sale', saleId: 's1' } }],
    expenses: [
      gasto('e1', '2026-08-11', 800, 'Alimentação'),
      { id: 'e2', date: '2026-08-14', amount: 1000, category: 'Dívidas', description: 'Parcela Teste', meta: { source: 'debt', debtId: 'd1' } },
    ],
  });
  const texto = await page.evaluate(() => window._shareTextoDoModelo(window._monthShareModel(0)));
  expect(texto).toContain('Para onde foi');
  expect(texto).toContain('Dívidas');
  expect(texto).toContain('De onde veio');
  expect(texto).toContain('venda de bem');
});

test('PRIVACIDADE: nem a imagem nem o texto carregam dados sensíveis', async ({ page }) => {
  await abrir(page, {
    platforms: [{ id: 'plat-1', name: 'Plataforma Secreta', color: '#888' }],
    debts: [{ id: 'd1', tipo: 'emprestimo', titulo: 'Divida Secreta', valorOriginal: 5000, valorParcela: 1000, parcelasTotal: 5, amortizadoInicial: 0, dataInicio: '2026-01-10', periodicidade: 'mensal', status: 'ativa' }],
    patrimonios: [{ id: 'pat-1', nome: 'Bem Secreto', tipo: 'outro', status: 'ativo', valorEstimado: 8000, historico: [], detalhes: {} }],
    incomeItems: [{ id: 'i1', date: '2026-08-12', amount: 40000, status: 'paid', platformId: null, note: 'Venda do Bem Secreto', meta: { source: 'asset-sale', saleId: 's1' } }],
    expenses: [
      { id: 'e1', date: '2026-08-11', amount: 800, category: 'Alimentação', description: 'Descricao Secreta' },
      { id: 'e2', date: '2026-08-14', amount: 1000, category: 'Dívidas', description: 'Parcela Secreta', meta: { source: 'debt', debtId: 'd1' } },
    ],
  });
  const alvo = ['Secreta', 'Secreto', 'plat-1', 'pat-1', 'd1', 's1', 'e1', 'i1', 'asset-sale'];
  const modelo = await page.evaluate(() => JSON.stringify(window._monthShareModel(0)));
  const texto = await page.evaluate(() => window._shareTextoDoModelo(window._monthShareModel(0)));
  alvo.forEach(p => {
    expect(modelo, `modelo vazou "${p}"`).not.toContain(p);
    expect(texto, `texto vazou "${p}"`).not.toContain(p);
  });
});
