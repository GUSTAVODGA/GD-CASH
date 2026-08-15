// Relatório mensal em PDF — estrutura e conteúdo.
//
// Não se testa "o PDF parece bonito": intercepta-se tudo o que é escrito no
// documento (`doc.text` e `doc.autoTable`) e verifica-se o que entrou — os
// totais, as linhas, a paginação e, sobretudo, o que NÃO pode aparecer.
//
// Os números já estão travados contra os motores na suíte unitária do modelo.
// Aqui a pergunta é se o documento reproduz o modelo sem inventar nem perder.
import { test, expect } from '@playwright/test';
import { abrirAppEmDemo, semearDados, lerEstado, irParaAba } from './_helpers.js';

const AGORA = new Date(2026, 7, 20, 12, 0, 0);   // 20/08/2026 — agosto é o mês 0

const LIMPO = {
  incomeItems: [], dailyIncome: {}, expenses: [], debtPayments: [], fixedPayments: [],
  debts: [], fixedExpenses: [], pendencias: [], vehicles: [], patrimonios: [], reservaHistory: [],
  platforms: [{ id: 'plat-1', name: 'Plataforma Teste', color: '#888' }],
};

const g = (id, data, valor, cat, desc) => ({ id, date: data, amount: valor, category: cat, description: desc || 'Lançamento Teste' });
const rec = (id, data, valor) => ({ id, date: data, amount: valor, status: 'paid', platformId: 'plat-1', note: 'Entrada Teste' });

const VENDA = { id: 'i-venda', date: '2026-08-12', amount: 40000, status: 'paid', platformId: null, note: 'Venda do Carro Secreto', meta: { source: 'asset-sale', saleId: 's1', vehicleId: 'v1' } };
const DIVIDA = { id: 'd1', tipo: 'emprestimo', titulo: 'Emprestimo Secreto', credor: 'Banco Secreto', valorOriginal: 6600, valorParcela: 200, parcelasTotal: 33, amortizadoInicial: 0, dataInicio: '2026-01-10', periodicidade: 'mensal', status: 'ativa' };
const PARCELA = { id: 'e-div', date: '2026-08-14', amount: 200, category: 'Dívidas', description: 'Emprestimo Secreto — Banco Secreto', meta: { source: 'debt', debtId: 'd1', parcelNo: 3 } };
const AQUIS = { id: 'e-aq', date: '2026-08-02', amount: 8000, category: 'Outros', description: 'Entrada do apartamento', patrimonioId: 'pat-1', meta: { nature: 'asset-acquisition' } };
const FIXO = { id: 'e-fx', date: '2026-08-07', amount: 200, category: 'Contas', description: 'Internet', meta: { source: 'fixed-payment', fixedId: 'f1', cycle: '2026-08' } };
const PEND = { id: 'e-pd', date: '2026-08-15', amount: 150, category: 'Casa', description: 'Trocar a torneira', meta: { source: 'pendencia', pendenciaId: 'p1' } };

const COMPLETO = {
  incomeItems: [rec('i1', '2026-08-05', 8400), VENDA],
  debts: [DIVIDA],
  patrimonios: [{ id: 'pat-1', nome: 'Apartamento Secreto', tipo: 'imovel', status: 'ativo', valorEstimado: 300000, historico: [], detalhes: {} }],
  expenses: [g('e1', '2026-08-03', 2410.55, 'Alimentação', 'Mercado do mês'), FIXO, PEND, PARCELA, AQUIS],
  reservaHistory: [{ date: '2026-08-10', type: 'dep', amount: 700 }],
};

async function abrir(page, dados) {
  await abrirAppEmDemo(page, { agora: AGORA });
  await semearDados(page, { ...LIMPO, ...(dados || {}) }, 'mes');
  await page.evaluate(() => window._pdfGarantirLib());
}

/** Monta o documento capturando TUDO o que é escrito nele. */
function montar(page, off = 0) {
  return page.evaluate((off) => {
    // O jsPDF 2.x monta os métodos na INSTÂNCIA, não num protótipo público.
    // Envolve-se o construtor para instrumentar o documento que o app cria.
    const textos = [], tabelas = [];
    const Orig = window.jspdf.jsPDF;
    const celula = c => (c && c.content !== undefined ? String(c.content) : String(c));
    window.jspdf.jsPDF = function (...args) {
      const doc = new Orig(...args);
      const textoOrig = doc.text.bind(doc), tabelaOrig = doc.autoTable.bind(doc);
      doc.text = (...as) => { textos.push(String(as[0])); return textoOrig(...as); };
      doc.autoTable = (o) => {
        tabelas.push({
          head: (o.head || []).map(l => l.map(celula)),
          body: (o.body || []).map(l => l.map(celula)),
          foot: (o.foot || []).map(l => l.map(celula)),
          showFoot: o.showFoot, rowPageBreak: o.rowPageBreak, marginTop: o.margin && o.margin.top,
        });
        return tabelaOrig(o);
      };
      return doc;
    };
    try {
      const m = window._monthShareModel(off);
      const { stats } = window._shareRelatorioDoc(m);
      return { textos, tabelas, stats, modelo: m };
    } finally {
      window.jspdf.jsPDF = Orig;
    }
  }, off);
}

const tabelaPor = (r, cabecalho) => r.tabelas.find(t => t.head.length && t.head[0][0] === cabecalho);
const tudoQueFoiEscrito = r => (r.textos.join('\n') + '\n' + JSON.stringify(r.tabelas));

// ══ INVARIANTES: O DOCUMENTO REPRODUZ O MODELO ═══════════════════════════

test('INVARIANTE: os totais do PDF são os do modelo', async ({ page }) => {
  await abrir(page, COMPLETO);
  const r = await montar(page);
  expect(r.stats.entradas).toBe(r.modelo.caixa.entradas);
  expect(r.stats.saidas).toBe(r.modelo.caixa.saidas);
  const escrito = tudoQueFoiEscrito(r);
  const R = v => v;
  expect(escrito).toContain(await page.evaluate(v => window.R(v), r.modelo.caixa.entradas));
  expect(escrito).toContain(await page.evaluate(v => window.R(v), r.modelo.caixa.saidas));
  expect(escrito).toContain(await page.evaluate(v => window.R(v), r.modelo.caixa.resultado));
});

test('INVARIANTE: a tabela de saídas tem todas as linhas e fecha no total', async ({ page }) => {
  await abrir(page, COMPLETO);
  const r = await montar(page);
  const t = tabelaPor(r, 'Data');
  const saidas = r.tabelas.find(x => x.head.length && x.head[0].includes('Descrição'));
  expect(saidas.body.length).toBe(r.modelo.movimentos.saidas.length);
  expect(saidas.foot[0][3]).toBe(await page.evaluate(v => window.R(v), r.modelo.caixa.saidas));
});

test('INVARIANTE: a tabela de entradas tem todas as linhas e fecha no total', async ({ page }) => {
  await abrir(page, COMPLETO);
  const r = await montar(page);
  const entradas = r.tabelas.find(x => x.head.length && x.head[0].includes('Tipo') && !x.head[0].includes('Descrição'));
  expect(entradas.body.length).toBe(r.modelo.movimentos.entradas.length);
  expect(entradas.foot[0][2]).toBe(await page.evaluate(v => window.R(v), r.modelo.caixa.entradas));
});

test('INVARIANTE: as categorias do PDF são as do motor, todas', async ({ page }) => {
  await abrir(page, COMPLETO);
  const r = await montar(page);
  const cat = tabelaPor(r, 'Categoria');
  const doMotor = await page.evaluate(() => window._monthMovementSummary(0).consumoByCategory);
  expect(cat.body.length).toBe(Object.keys(doMotor).length);
  expect(cat.foot[0][1]).toBe(await page.evaluate(v => window.R(v), r.modelo.consumo.total));
});

test('dívida, aquisição e venda não entram na tabela de categorias', async ({ page }) => {
  await abrir(page, COMPLETO);
  const r = await montar(page);
  const nomes = tabelaPor(r, 'Categoria').body.map(l => l[0]);
  expect(nomes).not.toContain('Dívidas');
  expect(nomes).not.toContain('Outros');
});

test('cada natureza aparece com o seu tipo na tabela de saídas', async ({ page }) => {
  await abrir(page, COMPLETO);
  const r = await montar(page);
  const tipos = r.tabelas.find(x => x.head.length && x.head[0].includes('Descrição')).body.map(l => l[2]).sort();
  expect(tipos).toEqual(['Aquisição de patrimônio', 'Gasto', 'Gasto de pendência', 'Gasto fixo', 'Pagamento de dívida']);
});

// ══ PRIVACIDADE ══════════════════════════════════════════════════════════

test('PRIVACIDADE: nada de credor, título de dívida, plataforma, bem ou id', async ({ page }) => {
  await abrir(page, COMPLETO);
  const escrito = tudoQueFoiEscrito(await montar(page));
  ['Secreto', 'Secreta', 'Banco', 'plat-1', 'pat-1', 'd1', 's1', 'v1', 'e-div', 'asset-sale', 'pendenciaId']
    .forEach(p => expect(escrito, `vazou "${p}" no PDF`).not.toContain(p));
});

test('pagamento de dívida aparece como "Parcela X/Y"', async ({ page }) => {
  await abrir(page, COMPLETO);
  const r = await montar(page);
  const linha = r.tabelas.find(x => x.head.length && x.head[0].includes('Descrição')).body.find(l => l[2] === 'Pagamento de dívida');
  expect(linha[1]).toBe('Parcela 3/33');
});

test('venda de patrimônio não nomeia o bem', async ({ page }) => {
  await abrir(page, COMPLETO);
  const r = await montar(page);
  const entradas = r.tabelas.find(x => x.head.length && x.head[0].includes('Tipo') && !x.head[0].includes('Descrição'));
  const venda = entradas.body.find(l => l[1] === 'Venda de patrimônio');
  expect(venda).toBeTruthy();
  expect(JSON.stringify(venda)).not.toContain('Carro');
});

test('descrição de gasto manual e de aquisição é preservada', async ({ page }) => {
  await abrir(page, COMPLETO);
  const r = await montar(page);
  const desc = r.tabelas.find(x => x.head.length && x.head[0].includes('Descrição')).body.map(l => l[1]);
  expect(desc).toContain('Mercado do mês');
  expect(desc).toContain('Entrada do apartamento');
  expect(desc).toContain('Trocar a torneira');
  expect(desc).toContain('Internet');
});

// ══ SEÇÕES CONDICIONAIS ══════════════════════════════════════════════════

test('mês vazio: uma página, sem tabelas', async ({ page }) => {
  await abrir(page, {});
  const r = await montar(page, -6);
  expect(r.stats.paginas).toBe(1);
  expect(r.tabelas.length).toBe(0);
  expect(tudoQueFoiEscrito(r)).toContain('Nenhuma movimentação registrada neste mês');
});

test('só receita: sem tabela de saídas', async ({ page }) => {
  await abrir(page, { incomeItems: [rec('i1', '2026-08-05', 3000)] });
  const r = await montar(page);
  expect(r.tabelas.find(x => x.head.length && x.head[0].includes('Descrição'))).toBeUndefined();
  expect(r.stats.entradas).toBe(3000);
});

test('só dívida: sem tabela de categorias, com resumo de dívidas', async ({ page }) => {
  await abrir(page, { debts: [DIVIDA], expenses: [PARCELA] });
  const r = await montar(page);
  expect(tabelaPor(r, 'Categoria')).toBeUndefined();
  expect(tudoQueFoiEscrito(r)).toContain('Dívidas');
  expect(r.stats.saidas).toBe(200);
});

test('aquisição e venda aparecem agregadas, sem identificar o bem', async ({ page }) => {
  await abrir(page, COMPLETO);
  const escrito = tudoQueFoiEscrito(await montar(page));
  expect(escrito).toContain('Patrimônio — aquisições');
  expect(escrito).toContain('Patrimônio — vendas');
});

test('reserva aparece rotulada como fora do caixa', async ({ page }) => {
  await abrir(page, COMPLETO);
  expect(tudoQueFoiEscrito(await montar(page))).toContain('Reserva do mês (fora do caixa)');
});

test('sem reserva, sem venda e sem dívida, as seções somem', async ({ page }) => {
  await abrir(page, { incomeItems: [rec('i1', '2026-08-05', 3000)], expenses: [g('e1', '2026-08-06', 100, 'Casa')] });
  const escrito = tudoQueFoiEscrito(await montar(page));
  expect(escrito).not.toContain('Reserva do mês');
  expect(escrito).not.toContain('Patrimônio — vendas');
  expect(escrito).not.toContain('Entradas extraordinárias');
});

// ══ MULTIPÁGINA ══════════════════════════════════════════════════════════

const MUITOS = {
  incomeItems: [rec('i1', '2026-08-05', 20000)],
  expenses: Array.from({ length: 62 }, (_, i) =>
    g('m' + i, `2026-08-${String(1 + (i % 28)).padStart(2, '0')}`, 25 + i * 3.5, 'Cat' + (i % 7),
      i % 5 === 0 ? 'Descrição bem longa para forçar quebra de linha dentro da célula ' + i : 'Item ' + i)),
};

test('62 lançamentos geram múltiplas páginas, com todos presentes', async ({ page }) => {
  await abrir(page, MUITOS);
  const r = await montar(page);
  expect(r.stats.paginas).toBeGreaterThan(1);
  const saidas = r.tabelas.find(x => x.head.length && x.head[0].includes('Descrição'));
  expect(saidas.body.length).toBe(62);
  expect(r.modelo.movimentos.saidas.length).toBe(62);
});

test('linha nunca é partida entre páginas e o total só sai na última', async ({ page }) => {
  await abrir(page, MUITOS);
  const r = await montar(page);
  r.tabelas.forEach(t => {
    expect(t.rowPageBreak, 'linha pode ser partida entre páginas').toBe('avoid');
    if (t.foot.length) expect(t.showFoot, 'o total repetiria em toda página').toBe('lastPage');
  });
});

test('a margem superior reserva espaço para o cabeçalho de continuação', async ({ page }) => {
  await abrir(page, MUITOS);
  const r = await montar(page);
  r.tabelas.forEach(t => expect(t.marginTop).toBeGreaterThanOrEqual(50));
});

test('cabeçalho da tabela e paginação aparecem em todas as páginas', async ({ page }) => {
  await abrir(page, MUITOS);
  const r = await montar(page);
  const paginas = r.stats.paginas;
  const escrito = tudoQueFoiEscrito(r);
  for (let i = 1; i <= paginas; i++) expect(escrito).toContain(`Página ${i} de ${paginas}`);
  // A faixa de continuação existe uma vez por página extra.
  const faixas = r.textos.filter(t => t.startsWith('Avenco · Relatório mensal')).length;
  expect(faixas).toBe(paginas - 1);
});

test('valores grandes e resultado negativo saem por extenso, sem truncar', async ({ page }) => {
  await abrir(page, { expenses: [g('e1', '2026-08-05', 1234567.89, 'Alimentação')] });
  const r = await montar(page);
  const escrito = tudoQueFoiEscrito(r);
  expect(escrito).toContain(await page.evaluate(() => window.R(1234567.89)));
  expect(r.modelo.caixa.resultado).toBe(-1234567.89);
  // O sinal chega ao papel como hífen, não como o "−" que `R()` usa na tela:
  // a fonte padrão do jsPDF escreve em cp1252, onde U+2212 não existe.
  expect(escrito).toContain('-R$ 1.234.567,89');
  expect(escrito).not.toContain('−');
});

// ══ CODIFICAÇÃO ══════════════════════════════════════════════════════════
//
// Regressão encontrada revisando um PDF real: o resultado negativo saía como
// `"R$ 6.922,15`. O jsPDF não avisa quando o caractere não cabe na cp1252 —
// ele emite outros bytes e o valor é lido ao contrário. Por isso a asserção é
// sobre TUDO o que foi escrito, e não sobre um campo específico.

const FORA_DA_CP1252 = /[^\n\x20-\xFF€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/u;

test('CODIFICAÇÃO: nada escrito no documento sai da cp1252', async ({ page }) => {
  await abrir(page, COMPLETO);
  const r = await montar(page);
  const fora = [...r.textos, JSON.stringify(r.tabelas)].filter(t => FORA_DA_CP1252.test(t));
  expect(fora, `estes textos não sobrevivem à fonte padrão: ${JSON.stringify(fora)}`).toEqual([]);
});

test('CODIFICAÇÃO: mês de resultado negativo escreve o sinal, não uma aspa', async ({ page }) => {
  await abrir(page, {
    incomeItems: [rec('i1', '2026-08-05', 8516)],
    expenses: [g('e1', '2026-08-06', 15438.15, 'Casa')],
  });
  const r = await montar(page);
  expect(r.modelo.caixa.resultado).toBe(-6922.15);
  expect(tudoQueFoiEscrito(r)).toContain('-R$ 6.922,15');
});

test('CODIFICAÇÃO: emoji e ideograma digitados pelo usuário não embaralham a linha', async ({ page }) => {
  await abrir(page, { expenses: [g('e1', '2026-08-05', 90, 'Casa \u{1F3E0}', 'Mercado \u{1F6D2} da esquina')] });
  const r = await montar(page);
  const desc = r.tabelas.find(x => x.head.length && x.head[0].includes('Descrição')).body[0][1];
  expect(desc).toBe('Mercado ? da esquina');
  expect(tabelaPor(r, 'Categoria').body[0][0]).toBe('Casa ?');
  expect(FORA_DA_CP1252.test(tudoQueFoiEscrito(r))).toBe(false);
});

test('categoria e descrição longas não são cortadas no modelo', async ({ page }) => {
  const catLonga = 'Alimentação fora de casa e delivery da família inteira';
  const descLonga = 'Compra grande de supermercado com itens de limpeza, higiene e mercearia para o mês todo';
  await abrir(page, { expenses: [g('e1', '2026-08-05', 500, catLonga, descLonga)] });
  const r = await montar(page);
  expect(tabelaPor(r, 'Categoria').body[0][0]).toBe(catLonga);
  expect(r.tabelas.find(x => x.head.length && x.head[0].includes('Descrição')).body[0][1]).toBe(descLonga);
});

// ══ HISTÓRICO E DETERMINISMO ═════════════════════════════════════════════

const TRES_MESES = {
  incomeItems: [rec('i-jun', '2026-06-10', 1000), rec('i-jul', '2026-07-10', 2000), rec('i-ago', '2026-08-10', 3000)],
  expenses: [g('e-jun', '2026-06-11', 100, 'Junho'), g('e-jul', '2026-07-11', 200, 'Julho'), g('e-ago', '2026-08-11', 300, 'Agosto')],
};

test('agosto → julho → junho → julho: cada PDF é do seu mês, e julho repete', async ({ page }) => {
  await abrir(page, TRES_MESES);
  const ago = await montar(page, 0);
  const jul1 = await montar(page, -1);
  const jun = await montar(page, -2);
  const jul2 = await montar(page, -1);

  expect(ago.stats.entradas).toBe(3000);
  expect(jul1.stats.entradas).toBe(2000);
  expect(jun.stats.entradas).toBe(1000);
  expect(JSON.stringify(jul2.tabelas)).toBe(JSON.stringify(jul1.tabelas));
  expect(tabelaPor(ago, 'Categoria').body[0][0]).toBe('Agosto');
  expect(tabelaPor(jun, 'Categoria').body[0][0]).toBe('Junho');
});

test('o cabeçalho nomeia o mês pedido, não o mês atual', async ({ page }) => {
  await abrir(page, TRES_MESES);
  const jul = await montar(page, -1);
  const rotuloJul = await page.evaluate(() => window.fmtMonthYear(-1));
  const esperado = rotuloJul.charAt(0).toUpperCase() + rotuloJul.slice(1);
  expect(jul.textos).toContain(esperado);
  expect(jul.textos).not.toContain(await page.evaluate(() => {
    const r = window.fmtMonthYear(0); return r.charAt(0).toUpperCase() + r.slice(1);
  }));
});

test('corrigir um lançamento antigo muda o PDF daquele mês', async ({ page }) => {
  await abrir(page, TRES_MESES);
  expect((await montar(page, -1)).stats.saidas).toBe(200);
  await page.evaluate(() => { window.eval('D').expenses.find(e => e.id === 'e-jul').amount = 350; });
  expect((await montar(page, -1)).stats.saidas).toBe(350);
});

// ══ A JORNADA NA INTERFACE ═══════════════════════════════════════════════

test('a moeda configurada aparece no relatório', async ({ page }) => {
  await abrir(page, COMPLETO);
  const { escrito, moeda } = await page.evaluate(() => {
    const m = window._monthShareModel(0);
    return { escrito: window.R(m.caixa.entradas), moeda: localStorage.getItem('gdcash_currency') || 'R$' };
  });
  expect(escrito).toContain(moeda);
  expect(tudoQueFoiEscrito(await montar(page))).toContain(escrito);
});

test.describe('a tela Mês não quebra ao gerar o relatório', () => {
  for (const largura of [320, 375, 390, 430]) {
    test(`botão acessível e layout íntegro @ ${largura}px`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 900 });
      await abrir(page, COMPLETO);
      await irParaAba(page, 'mes');

      const btn = page.locator('.share-month-btn[onclick*="shareMonthReport"]');
      await expect(btn).toContainText('Compartilhar relatório');
      await btn.scrollIntoViewIfNeeded();
      const box = await btn.boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(largura + 1);
      expect(box.height).toBeGreaterThanOrEqual(40);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

      // Montar o documento não altera o layout nem o mês exibido.
      const antes = await lerEstado(page, 'monthOffset');
      await page.evaluate(() => window._shareRelatorioDoc(window._monthShareModel(window.monthOffset)));
      expect(await lerEstado(page, 'monthOffset')).toBe(antes);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    });
  }
});

// ══ PUREZA ═══════════════════════════════════════════════════════════════

test('montar o relatório não altera D, não salva e não mexe no mês', async ({ page }) => {
  await abrir(page, COMPLETO);
  const antes = await lerEstado(page, 'JSON.stringify(D)');
  const offAntes = await lerEstado(page, 'monthOffset');
  await page.evaluate(() => {
    window.__salvou = 0;
    const s = window.save; window.save = () => { window.__salvou++; return s && s(); };
    [0, -1, -2].forEach(o => window._shareRelatorioDoc(window._monthShareModel(o)));
  });
  expect(await lerEstado(page, 'JSON.stringify(D)')).toBe(antes);
  expect(await lerEstado(page, 'window.__salvou')).toBe(0);
  expect(await lerEstado(page, 'monthOffset')).toBe(offAntes);
});

test('o nome do arquivo é seguro para o sistema de arquivos', async ({ page }) => {
  await abrir(page, COMPLETO);
  const nome = await page.evaluate(() => window._pdfNomeArquivo(window.fmtMonthYear(0)));
  expect(nome).toMatch(/^Avenco - .+\.pdf$/);
  expect(nome).not.toMatch(/[\\/:*?"<>|]/);
});
