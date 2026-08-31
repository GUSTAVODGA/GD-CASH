// O baralho da Início, e o ícone que ficou para trás.
//
// Quatro defeitos apareceram juntos numa tela só, três deles invisíveis para
// quem usa o app em tema claro — os prints que os revelaram eram do escuro.
//
//   · DUPLICAÇÃO. Desde que a reserva virou a primeira meta (v77),
//     `D.goals[0]` passou a ser ela — e o cartão "Meta em curso" começou a
//     mostrar exatamente o que o cartão "Reserva de emergência" ao lado já
//     mostrava. Dois cartões vizinhos, a mesma informação. Regressão da fusão.
//
//   · VAZIO. O baralho estica todo cartão à altura do mais alto. O conteúdo
//     ficava grudado no topo: 109px de nada num cartão de 207 na Reserva, mais
//     da metade dele.
//
//   · CAIXA DENTRO DE CAIXA. A regra que apaga o contêiner interno dentro do
//     baralho é `.hc-deck .hc-…`; as regras de tema escuro são
//     `:root[data-theme="dark"] .hc-…`, de especificidade MAIOR, e venciam. No
//     escuro o cartão interno voltava com fundo e borda — exatamente o que
//     aquele bloco de CSS existe para impedir.
//
//   · LEGENDA COM A COR ERRADA. As barras do gráfico sempre usaram `--gn` e
//     `--rd`; o ponto de "Saídas" na legenda era azul, sobra da identidade
//     anterior. A legenda explicava o gráfico com uma cor que não está nele.
//
// E o ÍCONE: o app é verde há várias versões, mas o ícone da tela de início
// continuava azul (#1D4ED8), junto com `theme_color` e `background_color`.
import { test, expect } from '@playwright/test';
import { abrirAppEmDemo, semearDados, lerEstado } from './_helpers.js';
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = path.resolve(new URL('../..', import.meta.url).pathname);
const AGORA = new Date(2026, 7, 20, 12, 0, 0);

const BASE = {
  platforms: [{ id: 'p1', name: 'Fonte A', color: '#0C7A52' }],
  incomeItems: [{ id: 'i1', date: '2026-08-04', amount: 4000, status: 'paid', platformId: 'p1' }],
  dailyIncome: {}, expenses: [{ id: 'e1', date: '2026-08-05', amount: 900, category: 'Lazer', description: 'Lanche' }],
  debtPayments: [], fixedPayments: [], debts: [], fixedExpenses: [], pendencias: [],
  vehicles: [], patrimonios: [], reminders: [], daysOff: [],
  reservaHistory: [], emergency: { current: 0, target: 0 },
};

const RESERVA = { id: 'meta-reserva', sistema: true, name: 'Reserva de emergência', emoji: '🛡️',
                  target: 5000, deadline: '', note: '', saldoInicial: 1000, historico: [], lastNotif: '' };
const VIAGEM  = { id: 'g1', name: 'Viagem', emoji: '🏖️', target: 3000, deadline: '2026-12-01',
                  note: '', lastNotif: '', saldoInicial: 900, historico: [] };

const abrir = async (page, dados, tema = 'dark') => {
  await page.setViewportSize({ width: 390, height: 844 });
  const erros = await abrirAppEmDemo(page, { agora: AGORA });
  await page.evaluate(t => { document.documentElement.dataset.theme = t; }, tema);
  await semearDados(page, { ...BASE, ...(dados || {}) }, 'inicio');
  return erros;
};

const cartoesVisiveis = page => page.evaluate(() =>
  [...document.querySelector('.hc-deck').children]
    .filter(c => c.classList.contains('hc-section') && getComputedStyle(c).display !== 'none')
    .map(c => ({
      titulo: c.querySelector('.hc-sec-title')?.textContent.trim(),
      texto: c.innerText,
      altura: Math.round(c.getBoundingClientRect().height),
      // Altura ÚTIL: o que sobra depois do padding do cartão. Comparar o
      // conteúdo com a altura externa contaria o padding como se fosse buraco.
      util: Math.round(c.clientHeight
        - parseFloat(getComputedStyle(c).paddingTop)
        - parseFloat(getComputedStyle(c).paddingBottom)),
      conteudo: Math.round([...c.children].reduce((s, x) => s + x.getBoundingClientRect().height, 0)),
    })));

// ── Duplicação ────────────────────────────────────────────────────────────

test('DUPLICAÇÃO: a reserva não aparece em dois cartões do mesmo baralho', async ({ page }) => {
  const erros = await abrir(page, { goals: [RESERVA, VIAGEM] });
  const cartoes = await cartoesVisiveis(page);
  const meta = cartoes.find(c => c.titulo === 'Meta em curso');
  expect(meta, 'o cartão de meta sumiu').toBeTruthy();
  expect(meta.texto, 'o cartão "Meta em curso" voltou a mostrar a reserva')
    .not.toContain('Reserva de emergência');
  expect(meta.texto).toContain('Viagem');

  // E a reserva continua tendo o cartão dela.
  expect(cartoes.some(c => c.titulo === 'Reserva de emergência'),
    'o cartão da reserva sumiu').toBe(true);
  expect(erros).toEqual([]);
});

test('sem meta além da reserva, o cartão "Meta em curso" não aparece vazio', async ({ page }) => {
  await abrir(page, { goals: [RESERVA] });
  const cartoes = await cartoesVisiveis(page);
  expect(cartoes.map(c => c.titulo)).not.toContain('Meta em curso');
});

test('meta já atingida não ocupa o cartão de "em curso"', async ({ page }) => {
  await abrir(page, { goals: [RESERVA, { ...VIAGEM, saldoInicial: 3000 }] });
  const cartoes = await cartoesVisiveis(page);
  expect(cartoes.map(c => c.titulo), 'meta concluída ainda ocupa o cartão').not.toContain('Meta em curso');
});

// ── Vazio ─────────────────────────────────────────────────────────────────

test('VAZIO: o conteúdo preenche o cartão em vez de deixar buraco', async ({ page }) => {
  await abrir(page, { goals: [RESERVA, VIAGEM] });
  const cartoes = await cartoesVisiveis(page);
  for (const c of cartoes) {
    const sobra = c.util - c.conteudo;
    // Dentro da área útil, o conteúdo tem de ocupar praticamente tudo. Era
    // aqui que a Reserva deixava 109px de nada.
    expect(sobra, `"${c.titulo}" deixa ${sobra}px de vazio em ${c.util}px úteis`)
      .toBeLessThanOrEqual(16);
  }
});

// ── Caixa dentro de caixa ─────────────────────────────────────────────────

for (const tema of ['light', 'dark']) {
  test(`CAIXA DENTRO DE CAIXA: nenhum cartão interno no baralho @ ${tema}`, async ({ page }) => {
    await abrir(page, { goals: [RESERVA, VIAGEM] }, tema);
    const internos = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('.hc-deck .hc-chart-box, .hc-deck .hc-resv-card, .hc-deck .hc-goal-card')
        .forEach(el => {
          const cs = getComputedStyle(el);
          const temBorda = parseFloat(cs.borderTopWidth) > 0;
          const temFundo = cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent';
          const temSombra = cs.boxShadow && cs.boxShadow !== 'none';
          if (temBorda || temFundo || temSombra) {
            out.push({ cls: el.className, borda: cs.borderTopWidth, fundo: cs.backgroundColor, sombra: cs.boxShadow });
          }
        });
      return out;
    });
    expect(internos, `cartão dentro de cartão no tema ${tema}`).toEqual([]);
  });
}

// ── Legenda ───────────────────────────────────────────────────────────────

test('LEGENDA: o ponto de Saídas tem a cor das barras de saída', async ({ page }) => {
  await abrir(page, { goals: [RESERVA] });
  const cores = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const px = q => getComputedStyle(document.querySelector(q)).backgroundColor;
    const norm = v => v.trim().toLowerCase();
    return {
      barraEntrada: norm(cs.getPropertyValue('--gn')),
      barraSaida:   norm(cs.getPropertyValue('--rd')),
      pontoEntrada: px('.home-legend-dot--inc'),
      pontoSaida:   px('.home-legend-dot--exp'),
    };
  });
  // Comparação por renderização: converte o token para o mesmo formato do dot.
  const comoRgb = async v => page.evaluate(cor => {
    const d = document.createElement('div');
    d.style.backgroundColor = cor; document.body.appendChild(d);
    const r = getComputedStyle(d).backgroundColor; d.remove(); return r;
  }, v);
  expect(cores.pontoSaida, 'o ponto de Saídas não é a cor da barra de saída')
    .toBe(await comoRgb(cores.barraSaida));
  expect(cores.pontoEntrada, 'o ponto de Entradas não é a cor da barra de entrada')
    .toBe(await comoRgb(cores.barraEntrada));
});

// ── Os pontos do baralho ──────────────────────────────────────────────────

test('os pontos dizem quantos cartões existem e onde você está', async ({ page }) => {
  await abrir(page, { goals: [RESERVA, VIAGEM] });
  const dots = page.locator('#hc-deck-dots > i');
  await expect(dots, 'os pontos não acompanham a quantidade de cartões').toHaveCount(3);
  await expect(page.locator('#hc-deck-dots > i.on')).toHaveCount(1);
  // O primeiro cartão está em vista no início.
  await expect(dots.nth(0)).toHaveClass(/on/);

  // Rolar o baralho move o ponto.
  await page.evaluate(() => {
    const d = document.querySelector('.hc-deck');
    const c = [...d.children].filter(x => x.classList.contains('hc-section')
      && getComputedStyle(x).display !== 'none')[1];
    d.scrollLeft = c.offsetLeft - d.offsetLeft;
    d.dispatchEvent(new Event('scroll'));
  });
  await expect(dots.nth(1), 'o ponto não acompanhou a rolagem').toHaveClass(/on/);
});

test('um cartão só não vira baralho: sem pontos', async ({ page }) => {
  // Sem meta e sem histórico, sobra só o gráfico.
  await abrir(page, { goals: [], incomeItems: [], expenses: [] });
  await expect(page.locator('#hc-deck-dots')).toBeEmpty();
});

// ── O ícone ───────────────────────────────────────────────────────────────

test('ÍCONE: não sobrou azul da identidade anterior', async () => {
  const AZUIS = ['#0C2494', '#1D4ED8', '#4A7AF5'];
  for (const arq of ['icon.svg', 'icon-maskable.svg', 'manifest.json', 'index.html']) {
    const txt = fs.readFileSync(path.join(RAIZ, arq), 'utf8');
    for (const azul of AZUIS) {
      expect(txt.toUpperCase(), `${arq} ainda traz o azul ${azul}`)
        .not.toContain(azul.toUpperCase());
    }
  }
});

test('ÍCONE: manifest e meta usam a cor do campo do app', async () => {
  const mf = JSON.parse(fs.readFileSync(path.join(RAIZ, 'manifest.json'), 'utf8'));
  expect(mf.theme_color).toBe('#0C4F3F');
  expect(mf.background_color).toBe('#0C4F3F');
  const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  expect(html).toContain('<meta name="theme-color" content="#0C4F3F">');
  // A cor tem de ser a MESMA que o CSS chama de campo — não uma aproximação.
  const css = fs.readFileSync(path.join(RAIZ, 'style.css'), 'utf8');
  expect(css, 'o token --flood mudou e o ícone ficou para trás de novo')
    .toContain('--flood: #0C4F3F;');
});

test('ÍCONE: todo arquivo declarado no manifest existe e não está vazio', async () => {
  const mf = JSON.parse(fs.readFileSync(path.join(RAIZ, 'manifest.json'), 'utf8'));
  const arquivos = [...mf.icons.map(i => i.src), 'icon-180.png', 'favicon.png', 'icon-1024.png'];
  for (const f of arquivos) {
    const p = path.join(RAIZ, f);
    expect(fs.existsSync(p), `${f} não existe`).toBe(true);
    expect(fs.statSync(p).size, `${f} está vazio`).toBeGreaterThan(1000);
  }
  // O maskable tem arquivo PRÓPRIO: reusar o comum faria a marca encostar no
  // corte de launchers que recortam em círculo.
  const maskable = mf.icons.find(i => i.purpose === 'maskable');
  expect(maskable.src).toBe('icon-512-maskable.png');
  expect(mf.icons.find(i => i.purpose === 'any' && i.sizes === '512x512').src)
    .not.toBe(maskable.src);
});

// ── O aviso ───────────────────────────────────────────────────────────────

test('AVISO: só aparece para quem está com o app INSTALADO', async ({ page }) => {
  await abrir(page, { goals: [RESERVA] });
  // No navegador comum não há o que reinstalar — o aviso seria ação impossível.
  const noNavegador = await page.evaluate(() => {
    localStorage.removeItem('gdcash_aviso_icone_v80');
    window.matchMedia = (q) => ({ matches: false, media: q, addListener(){}, removeListener(){} });
    window.checkAvisoIcone();
    return !!document.getElementById('_av_dlg');
  });
  expect(noNavegador, 'o aviso apareceu para quem abriu no navegador').toBe(false);

  const instalado = await page.evaluate(() => {
    window.matchMedia = (q) => ({ matches: q.includes('standalone'), media: q, addListener(){}, removeListener(){} });
    window.checkAvisoIcone();
    return true;
  });
  expect(instalado).toBe(true);
  await expect(page.locator('#_av_dlg')).toBeVisible();
  await expect(page.locator('#_av_dlg')).toContainText('O ícone do Avenco mudou');
});

test('AVISO: aparece UMA vez e não volta a incomodar', async ({ page }) => {
  await abrir(page, { goals: [RESERVA] });
  await page.evaluate(() => {
    localStorage.removeItem('gdcash_aviso_icone_v80');
    window.matchMedia = (q) => ({ matches: q.includes('standalone'), media: q, addListener(){}, removeListener(){} });
    window.checkAvisoIcone();
  });
  await expect(page.locator('#_av_dlg')).toBeVisible();
  await page.locator('#_av_dlg').getByRole('button', { name: 'Entendi' }).click();
  await page.waitForTimeout(300);

  expect(await page.evaluate(() => localStorage.getItem('gdcash_aviso_icone_v80')),
    'dispensar o aviso não ficou registrado').toBe('1');

  const voltou = await page.evaluate(() => { window.checkAvisoIcone(); return !!document.getElementById('_av_dlg'); });
  expect(voltou, 'o aviso voltou depois de dispensado').toBe(false);
});

test('AVISO: o diálogo respeita as quebras de linha do passo a passo', async ({ page }) => {
  // Sem `white-space: pre-line` os três passos viravam um parágrafo só.
  await abrir(page, { goals: [RESERVA] });
  await page.evaluate(() => {
    window.matchMedia = (q) => ({ matches: q.includes('standalone'), media: q, addListener(){}, removeListener(){} });
    localStorage.removeItem('gdcash_aviso_icone_v80');
    window.checkAvisoIcone();
  });
  await expect(page.locator('.av-dialog-msg')).toBeVisible();
  const ws = await page.evaluate(() =>
    getComputedStyle(document.querySelector('.av-dialog-msg')).whiteSpace);
  expect(ws).toBe('pre-line');
});

test('a Início continua sem tocar em D ao desenhar o baralho', async ({ page }) => {
  await abrir(page, { goals: [RESERVA, VIAGEM] });
  const antes = await lerEstado(page, 'JSON.stringify(D)');
  const salvou = await page.evaluate(() => {
    let n = 0; const s = window.save; window.save = () => { n++; return s && s(); };
    window.renderDeckDots(); window.renderInicio();
    window.save = s; return n;
  });
  expect(salvou).toBe(0);
  expect(await lerEstado(page, 'JSON.stringify(D)')).toBe(antes);
});
