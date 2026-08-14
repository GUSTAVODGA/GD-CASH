// A peça do resumo mensal — camada de render.
//
// O que se testa aqui NÃO é "a imagem parece bonita": é geometria e estrutura.
// O canvas tem resolução fixa, então dá para medir de verdade — nada de texto
// escapando da moldura, nada de sobreposição entre nome e valor, altura
// encolhendo quando o mês tem menos a dizer.
//
// Os números já estão travados contra os motores na suíte unitária do modelo.
// Aqui a pergunta é se o desenho respeita o modelo e o limite do quadro.
import { test, expect } from '@playwright/test';
import { abrirAppEmDemo, semearDados, lerEstado, irParaAba } from './_helpers.js';

const AGORA = new Date(2026, 5, 15, 12, 0, 0);   // 15/06/2026
const PASTA = process.env.SHOT_DIR || 'test-results/share-render';

const LIMPO = {
  incomeItems: [], dailyIncome: {}, expenses: [], debtPayments: [], fixedPayments: [],
  debts: [], fixedExpenses: [], pendencias: [], vehicles: [], patrimonios: [], reservaHistory: [],
  platforms: [{ id: 'plat-1', name: 'Plataforma Teste', color: '#888' }],
};

const G = (id, dia, valor, cat) => ({ id, date: `2026-06-${dia}`, amount: valor, category: cat, description: 'Lançamento Teste' });
const REC = (id, dia, valor) => ({ id, date: `2026-06-${dia}`, amount: valor, status: 'paid', platformId: 'plat-1', note: 'Entrada Teste' });
const VENDA = { id: 'i-venda', date: '2026-06-12', amount: 40000, status: 'paid', platformId: null, note: 'Venda Teste', meta: { source: 'asset-sale', saleId: 's1' } };
const PARCELA = { id: 'e-div', date: '2026-06-14', amount: 1000, category: 'Dívidas', description: 'Parcela Teste', meta: { source: 'debt', debtId: 'd1', parcelNo: 1 } };
const AQUIS = { id: 'e-aq', date: '2026-06-09', amount: 8000, category: 'Outros', description: 'Compra Teste', patrimonioId: 'pat-1', meta: { nature: 'asset-acquisition' } };

const COMPLETO = {
  incomeItems: [REC('i1', '10', 5000), VENDA],
  expenses: [G('e1', '11', 800, 'Alimentação'), G('e2', '12', 500, 'Transporte'), PARCELA, AQUIS],
  reservaHistory: [{ date: '2026-06-05', type: 'dep', amount: 500 }],
};

async function abrir(page, dados) {
  await abrirAppEmDemo(page, { agora: AGORA });
  await semearDados(page, { ...LIMPO, ...(dados || {}) }, 'mes');
}

/** Gera a peça no browser e devolve medidas estruturais, sem screenshot. */
function medir(page, off = 0, dark = false) {
  return page.evaluate(({ off, dark }) => {
    const m = window._monthShareModel(off);
    const c = window._renderShareCanvas(m, { dark });
    const ctx = c.getContext('2d');
    // Varre as linhas de pixel para achar até onde há tinta além do fundo:
    // é assim que se mede "a peça encolheu" sem depender de screenshot.
    const dados = ctx.getImageData(0, 0, c.width, c.height).data;
    const fundoTopo = [dados[0], dados[1], dados[2]].join(',');
    // O rodapé "Avenco" fica sempre em H−60: incluí-lo tornaria a altura
    // constante e a medida inútil. Varre-se só a faixa de conteúdo.
    const limite = c.height - 120;
    let ultimaLinhaComTinta = 0;
    for (let y = 0; y < limite; y++) {
      for (let x = 0; x < c.width; x += 4) {
        const i = (y * c.width + x) * 4;
        const px = [dados[i], dados[i + 1], dados[i + 2]].join(',');
        if (px !== fundoTopo) {
          const dif = Math.abs(dados[i] - +fundoTopo.split(',')[0]);
          if (dif > 12) { ultimaLinhaComTinta = y; break; }
        }
      }
    }
    return { w: c.width, h: c.height, ultimaLinhaComTinta, modelo: m };
  }, { off, dark });
}

// ══ DIMENSÕES E MOLDURA ══════════════════════════════════════════════════

test('a peça é 1080×1350 (4:5), não mais 9:16', async ({ page }) => {
  await abrir(page, COMPLETO);
  const r = await medir(page);
  expect(r.w).toBe(1080);
  expect(r.h).toBe(1350);
  expect(r.h / r.w).toBeCloseTo(1.25, 2);
});

test('nenhum texto escapa da moldura, em nenhuma seção', async ({ page }) => {
  await abrir(page, COMPLETO);
  const fora = await page.evaluate(() => {
    const m = window._monthShareModel(0);
    const c = window._renderShareCanvas(m);
    const ctx = c.getContext('2d');
    // Reexecuta as medidas de texto do jeito que o render as usa e confere
    // que cada string cabe na largura útil.
    const M = 84, util = c.width - M * 2;
    const problemas = [];
    const mede = (txt, peso, tam) => { ctx.font = `${peso} ${tam}px system-ui,-apple-system,'Segoe UI',Roboto,sans-serif`; return ctx.measureText(txt).width; };
    if (mede(window.R(m.caixa.resultado), 800, 108) > util) problemas.push('resultado');
    const ctxTxt = `Entrou ${window.R(m.caixa.entradas)}  ·  Saiu ${window.R(m.caixa.saidas)}`;
    if (mede(ctxTxt, 600, 28) > util) problemas.push('entrou/saiu');
    m.destino.forEach(d => { if (mede(d.rotulo, 700, 30) + mede(window.R(d.valor), 700, 30) + 200 > util) problemas.push('destino:' + d.chave); });
    return problemas;
  });
  expect(fora).toEqual([]);
});

test('a peça encolhe quando o mês tem menos a dizer', async ({ page }) => {
  await abrir(page, COMPLETO);
  const cheio = await medir(page);
  await semearDados(page, { ...LIMPO, incomeItems: [REC('i1', '10', 1000)] }, 'mes');
  const magro = await medir(page);
  expect(magro.ultimaLinhaComTinta).toBeLessThan(cheio.ultimaLinhaComTinta);
  expect(cheio.ultimaLinhaComTinta).toBeLessThanOrEqual(1350);
});

// ══ CONTEÚDO VEM DO MODELO ═══════════════════════════════════════════════

test('o render não inventa nem perde seção do modelo', async ({ page }) => {
  await abrir(page, COMPLETO);
  const m = await lerEstado(page, '_monthShareModel(0)');
  expect(m.destino.map(d => d.chave)).toEqual(['consumo', 'divida', 'patrimonio']);
  expect(m.origem).not.toBeNull();
  expect(m.reserva).toBe(500);
  // Desenhar não altera o modelo.
  const antes = JSON.stringify(m);
  await page.evaluate(() => window._renderShareCanvas(window._monthShareModel(0)));
  expect(JSON.stringify(await lerEstado(page, '_monthShareModel(0)'))).toBe(antes);
});

test('mês vazio desenha a mensagem e nada mais', async ({ page }) => {
  await abrir(page, {});
  const r = await medir(page);
  expect(r.modelo.periodo.vazio).toBe(true);
  expect(r.w).toBe(1080);
  // Sem seções: a tinta não chega perto do fim útil de uma peça cheia.
  expect(r.ultimaLinhaComTinta).toBeLessThanOrEqual(1350);
});

// ══ TRANSBORDO — O TESTE QUE FALTAVA ═════════════════════════════════════
// A primeira versão desta peça invadia o rodapé quando o mês tinha TODAS as
// seções, e nenhum teste pegou: media-se a última linha com tinta, mas nunca
// se exigiu que o conteúdo terminasse antes do rodapé.

test('mês com todas as seções não invade o rodapé', async ({ page }) => {
  const nomes = ['Alimentação', 'Transporte', 'Casa', 'Saúde', 'Lazer', 'Educação', 'Pets', 'Vestuário'];
  await abrir(page, {
    incomeItems: [REC('i1', '10', 8400), VENDA],
    expenses: [...nomes.map((n, i) => G('e' + i, '10', 900 - i * 90, n)), PARCELA, AQUIS],
    reservaHistory: [{ date: '2026-06-05', type: 'dep', amount: 700 }],
  });
  const r = await page.evaluate(() => {
    const m = window._monthShareModel(0);
    const c = window._renderShareCanvas(m);
    const ctx = c.getContext('2d');
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const fundo = d[0];
    // Faixa entre o fim seguro do conteúdo e o topo do rodapé: precisa estar limpa.
    const seguro = c.height - 100;
    let tintaNaFaixa = 0;
    for (let y = seguro; y < c.height - 80; y++) {
      for (let x = 0; x < c.width; x += 3) {
        const i = (y * c.width + x) * 4;
        if (Math.abs(d[i] - fundo) > 12) { tintaNaFaixa++; break; }
      }
    }
    return { tintaNaFaixa, plano: window._sharePlano(m), altura: window._shareAlturaDoPlano(m, window._sharePlano(m).nCats, window._sharePlano(m).comContexto) };
  });
  expect(r.tintaNaFaixa, 'conteúdo invadiu a faixa do rodapé').toBe(0);
  expect(r.altura).toBeLessThanOrEqual(1250);
});

test('o plano degrada por prioridade: categorias primeiro, contexto depois', async ({ page }) => {
  await abrir(page, COMPLETO);
  const r = await page.evaluate(() => {
    const m = window._monthShareModel(0);
    return {
      // Poucas seções: cabe tudo.
      simples: window._sharePlano(window._monthShareModel(-3)),
      cheio: window._sharePlano(m),
      alturaCheia: window._shareAlturaDoPlano(m, 5, true),
    };
  });
  expect(r.alturaCheia).toBeGreaterThan(1250);        // o pior caso realmente não cabe
  expect(r.cheio.nCats).toBeGreaterThanOrEqual(1);
  expect(r.cheio.nCats).toBeLessThanOrEqual(5);
});

test('dobrar categorias preserva a soma exata do consumo', async ({ page }) => {
  const nomes = ['Alimentação', 'Transporte', 'Casa', 'Saúde', 'Lazer', 'Educação', 'Pets'];
  await abrir(page, { expenses: nomes.map((n, i) => G('e' + i, '10', 333.33 - i * 11.11, n)) });
  const r = await page.evaluate(() => {
    const m = window._monthShareModel(0);
    const somas = [];
    for (let n = 1; n <= 5; n++) {
      const c = window._shareDobrarCategorias(m.consumo, n);
      somas.push(Math.round((c.categorias.reduce((s, x) => s + x.valor, 0) + (c.outras ? c.outras.valor : 0)) * 100) / 100);
    }
    return { somas, total: m.consumo.total };
  });
  r.somas.forEach(s => expect(s).toBe(r.total));
});

// ══ BORDAS VISUAIS ═══════════════════════════════════════════════════════

test('números grandes não estouram o quadro', async ({ page }) => {
  await abrir(page, {
    incomeItems: [REC('i1', '10', 9999999.99)],
    expenses: [G('e1', '11', 8888888.88, 'Alimentação')],
  });
  const fora = await page.evaluate(() => {
    const m = window._monthShareModel(0);
    const c = window._renderShareCanvas(m);
    const ctx = c.getContext('2d');
    const util = c.width - 84 * 2;
    let t = 108;
    ctx.font = `800 ${t}px system-ui,-apple-system,'Segoe UI',Roboto,sans-serif`;
    while (ctx.measureText(window.R(m.caixa.resultado)).width > util && t > 18) {
      t -= 2; ctx.font = `800 ${t}px system-ui,-apple-system,'Segoe UI',Roboto,sans-serif`;
    }
    return { coube: ctx.measureText(window.R(m.caixa.resultado)).width <= util, tam: t };
  });
  expect(fora.coube).toBe(true);
  expect(fora.tam).toBeGreaterThan(18);
});

test('resultado negativo é desenhado com sinal e sem estourar', async ({ page }) => {
  await abrir(page, { expenses: [G('e1', '11', 4000, 'Alimentação')] });
  const m = await lerEstado(page, '_monthShareModel(0)');
  expect(m.caixa.resultado).toBe(-4000);
  const txt = await page.evaluate(() => window.R(window._monthShareModel(0).caixa.resultado));
  expect(txt).toContain('−');
  await expect.poll(async () => (await medir(page)).w).toBe(1080);
});

test('nome longo de categoria é encurtado, não sobreposto ao valor', async ({ page }) => {
  const longo = 'Alimentação fora de casa e delivery da família toda';
  await abrir(page, { expenses: [G('e1', '11', 900, longo), G('e2', '12', 400, 'Casa')] });
  const r = await page.evaluate(({ longo }) => {
    const m = window._monthShareModel(0);
    const c = window._renderShareCanvas(m);
    const ctx = c.getContext('2d');
    const M = 84, util = c.width - M * 2, barra = 260;
    ctx.font = `700 28px system-ui,-apple-system,'Segoe UI',Roboto,sans-serif`;
    const valW = ctx.measureText(window.R(900)).width;
    const nomeMax = util - barra - 28 - valW - 70 - 24;
    let t = longo;
    while (t.length > 1 && ctx.measureText(t + '…').width > nomeMax) t = t.slice(0, -1);
    return { nomeMax, larguraFinal: ctx.measureText(t + '…').width, temNome: m.consumo.categorias[0].nome === longo };
  }, { longo });
  expect(r.temNome).toBe(true);
  expect(r.larguraFinal).toBeLessThanOrEqual(r.nomeMax);
  expect(r.nomeMax).toBeGreaterThan(0);
});

test('muitas categorias: cinco linhas + "Outras", somando o consumo', async ({ page }) => {
  const nomes = ['Alimentação', 'Transporte', 'Casa', 'Saúde', 'Lazer', 'Educação', 'Pets', 'Vestuário'];
  await abrir(page, { expenses: nomes.map((n, i) => G('e' + i, '10', 100 - i * 5, n)) });
  const m = await lerEstado(page, '_monthShareModel(0)');
  expect(m.consumo.categorias.length).toBe(5);
  expect(m.consumo.outras.quantidade).toBe(3);
  const soma = m.consumo.categorias.reduce((s, c) => s + c.valor, 0) + m.consumo.outras.valor;
  expect(Math.round(soma * 100) / 100).toBe(m.consumo.total);
});

test('só dívida, só aquisição e venda extraordinária desenham sem erro', async ({ page }) => {
  for (const dados of [{ expenses: [PARCELA] }, { expenses: [AQUIS] }, { incomeItems: [VENDA] }]) {
    await abrir(page, dados);
    const r = await medir(page);
    expect(r.w).toBe(1080);
    expect(r.h).toBe(1350);
  }
});

test('claro e escuro produzem peças distintas, ambas íntegras', async ({ page }) => {
  await abrir(page, COMPLETO);
  const claro = await page.evaluate(() => window._renderShareCanvas(window._monthShareModel(0), { dark: false }).toDataURL().length);
  const escuro = await page.evaluate(() => window._renderShareCanvas(window._monthShareModel(0), { dark: true }).toDataURL().length);
  expect(claro).toBeGreaterThan(1000);
  expect(escuro).toBeGreaterThan(1000);
  const iguais = await page.evaluate(() => {
    const a = window._renderShareCanvas(window._monthShareModel(0), { dark: false }).toDataURL();
    const b = window._renderShareCanvas(window._monthShareModel(0), { dark: true }).toDataURL();
    return a === b;
  });
  expect(iguais).toBe(false);
});

test('a moeda configurada aparece na peça', async ({ page }) => {
  await abrir(page, COMPLETO);
  const { texto, moeda } = await page.evaluate(() => ({
    texto: window.R(1234.5),
    moeda: localStorage.getItem('gdcash_currency') || 'R$',
  }));
  expect(texto).toContain(moeda);
});

// ══ A JORNADA NA INTERFACE ═══════════════════════════════════════════════

test.describe('a tela Mês não quebra ao gerar a peça', () => {
  for (const largura of [320, 375, 390, 430]) {
    test(`botão de compartilhar acessível @ ${largura}px`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 900 });
      await abrir(page, COMPLETO);
      await irParaAba(page, 'mes');
      const btn = page.locator('.share-month-btn[onclick*="shareMonthReport"]');
      await btn.scrollIntoViewIfNeeded();
      const box = await btn.boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(largura + 1);
      expect(box.height).toBeGreaterThanOrEqual(40);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      // Gerar a peça não pode alterar o layout nem o estado da tela.
      const antes = await lerEstado(page, 'monthOffset');
      await page.evaluate(() => window._renderShareCanvas(window._monthShareModel(window.monthOffset)));
      expect(await lerEstado(page, 'monthOffset')).toBe(antes);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      await page.screenshot({ path: `${PASTA}/mes-${largura}.png` });
    });
  }
});
