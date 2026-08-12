// Auditoria de layout: o FAB e a nav inferior não podem cobrir nenhuma ação/card
// no fim da rolagem — em 320/375/390/430px, claro/escuro, histórico aberto/fechado,
// lista curta/longa. Usa dados sintéticos, modo demo.
//
//   node frota/tests/fab-layout.mjs
//   CHROMIUM_PATH (opcional), SHOTS_DIR (opcional p/ capturas)

import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FROTA = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lagos-fab-'));
for (const f of ['app.js', 'index.html', 'style.css', 'sw.js', 'manifest.json', 'vendor-jspdf.js', 'vendor-jspdf-autotable.js']) {
  const src = path.join(FROTA, f); if (fs.existsSync(src)) fs.copyFileSync(src, path.join(tmp, f));
}
fs.writeFileSync(path.join(tmp, 'app.js'),
  fs.readFileSync(path.join(tmp, 'app.js'), 'utf8').replace("const DEMO = firebaseConfig.apiKey === 'COLE_AQUI';", 'const DEMO = true;'));
const SHOTS = process.env.SHOTS_DIR || path.join(tmp, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });

const MIME = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  try { const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html'; const buf = await readFile(path.join(tmp, rel)); res.setHeader('content-type', MIME[path.extname(rel)] || 'application/octet-stream'); res.end(buf); }
  catch { res.statusCode = 404; res.end('nf'); }
});
await new Promise(r => server.listen(0, r)); const PORT = server.address().port;

let PASS = 0, FAIL = 0;
const chk = (n, c, x = '') => { if (c) { PASS++; console.log('OK ✓ ' + n + (x ? ' | ' + x : '')); } else { FAIL++; console.log('*** FAIL *** ' + n + (x ? ' | ' + x : '')); } };

const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await b.newContext({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push('PE:' + e.message));

await p.goto(`http://localhost:${PORT}/index.html`); await p.waitForTimeout(700);
await p.locator('.lp-card').first().tap(); await p.waitForTimeout(1000);
await p.waitForFunction(() => typeof novaNotaPendente === 'function', { timeout: 8000 });

// semeia notas sintéticas; qtd controla lista curta/longa
async function seed(qtd) {
  await p.evaluate((q) => {
    S.tx = []; S.notasPendentes = []; S.anexos = [];
    S.vehicles[0].placa = 'ABC1D23'; delete S.vehicles[0].status;
    for (let i = 0; i < q; i++) S.notasPendentes.push(novaNotaPendente({ lido: { posto: 'Posto ' + i, valor: 100 + i, data: '2026-08-0' + ((i % 9) + 1), placa: i % 2 ? 'ABC1D23' : '' } }));
    // uma confirmada (histórico) e uma rejeitada (último botão = Restaurar)
    S.notasPendentes.push(novaNotaPendente({ lido: { posto: 'Confirmada', valor: 50, data: '2026-08-01' }, status: 'confirmada', txId: 'zz' }));
    S.notasPendentes.push(novaNotaPendente({ lido: { posto: 'Rejeitada', valor: 12, data: '2026-08-02' }, status: 'rejeitada', motivoRejeicao: 'duplicada' }));
    demoSave(); goTab('lanc');
  }, qtd);
}
// mede se o ÚLTIMO botão de ação da fila fica coberto pelo FAB/nav no fim da rolagem
async function medir(histAberto) {
  return await p.evaluate((hist) => {
    _histNotasAberto = hist; renderNotasRevisar();
    window.scrollTo(0, document.body.scrollHeight);
    const fab = document.getElementById('fab');
    const fabVisivel = getComputedStyle(fab).display !== 'none';
    const btns = [...document.querySelectorAll('#notas-revisar button')];
    const el = btns[btns.length - 1];
    if (!el) return { semBotao: true };
    const rb = el.getBoundingClientRect(), rf = fab.getBoundingClientRect();
    const nav = document.querySelector('.bottom-nav').getBoundingClientRect();
    const cx = rb.left + rb.width / 2, cy = rb.top + rb.height / 2;
    const hit = document.elementFromPoint(cx, cy);
    const naViewport = cy > 0 && cy < window.innerHeight;
    const cobreFab = fab.contains(hit) || hit === fab;
    const sobreEl = !!hit && (hit === el || el.contains(hit) || hit.contains(el));
    const cruzaFab = !(rb.bottom <= rf.top || rb.top >= rf.bottom || rb.right <= rf.left || rb.left >= rf.right);
    const cruzaNav = rb.bottom > nav.top;
    return { fabVisivel, naViewport, cobreFab, sobreEl, cruzaFab, cruzaNav, label: (el.textContent || '').trim() };
  }, histAberto);
}

const larguras = [320, 375, 390, 430];
for (const w of larguras) {
  await p.setViewportSize({ width: w, height: 780 });
  await seed(10); // lista LONGA
  for (const hist of [true, false]) {
    for (const tema of ['light', 'dark']) {
      await p.evaluate(t => document.documentElement.setAttribute('data-theme', t), tema);
      await p.waitForTimeout(120);
      const r = await medir(hist);
      const ok = r.fabVisivel && r.naViewport && !r.cobreFab && r.sobreEl && !r.cruzaFab && !r.cruzaNav;
      chk(`${w}px · ${tema} · histórico ${hist ? 'aberto' : 'fechado'} · último botão livre do FAB/nav`, ok, r.label || JSON.stringify(r));
    }
  }
}
await p.evaluate(t => document.documentElement.setAttribute('data-theme', 'light'), 'light');

// lista CURTA (não rola) — FAB flutua sobre área vazia, nada coberto
await p.setViewportSize({ width: 390, height: 780 });
await seed(1);
const curta = await medir(true);
chk('lista curta · último botão não coberto pelo FAB', !curta.cobreFab && curta.sobreEl, curta.label);

// ── capturas: 390px, histórico aberto, rolado até o fim (FAB visível, sem cobrir) ──
await p.setViewportSize({ width: 390, height: 780 });
await seed(6);
await p.evaluate(() => { _histNotasAberto = true; renderNotasRevisar(); window.scrollTo(0, document.body.scrollHeight); const t = document.getElementById('toast'); if (t) t.style.opacity = '0'; });
await p.waitForTimeout(150);
const shotL = path.join(SHOTS, 'fab-fim-claro.png');
const shotD = path.join(SHOTS, 'fab-fim-escuro.png');
await p.screenshot({ path: shotL });
await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
await p.waitForTimeout(150);
await p.screenshot({ path: shotD });
chk('captura clara (fim da rolagem) gerada', fs.existsSync(shotL));
chk('captura escura (fim da rolagem) gerada', fs.existsSync(shotD));
console.log('   capturas em: ' + SHOTS);

console.log(`\n=== RESULTADO: ${PASS} OK / ${FAIL} FAIL ===`);
console.log('ERROS JS:', errs.length ? errs.join('\n') : 'nenhum ✓');
await b.close(); server.close();
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
process.exit(FAIL ? 1 : 0);
