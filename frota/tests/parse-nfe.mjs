// Testes reproduzíveis do leitor de NF-e/DANFE do Lagos (Etapa 1).
// Usa SOMENTE fixtures sintéticas (nenhum dado real de nota/cliente).
//
// Como rodar:
//   node frota/tests/parse-nfe.mjs
//
// Requisitos: Playwright instalado (import 'playwright') e Chromium disponível.
//   - CHROMIUM_PATH  (opcional) caminho do executável do Chromium.
//   - PDFJS_LOCAL    (opcional) pasta com pdf.local.js + pdf.worker.local.js
//                    para rodar, offline, os testes que dependem do pdf.js.
//                    Sem isso, os testes de fluxo PDF são PULADOS (o núcleo do
//                    parser roda 100% offline).
//
// O runner copia os arquivos do app para uma pasta temporária e força o modo
// demonstração; NÃO altera o código-fonte versionado.

import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FROTA = path.resolve(__dirname, '..');
const FIXT = path.join(__dirname, 'fixtures');

// ── monta pasta temporária servível, com DEMO forçado ──
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lagos-nfe-'));
for (const f of ['app.js', 'index.html', 'style.css', 'sw.js', 'manifest.json', 'vendor-jspdf.js', 'vendor-jspdf-autotable.js']) {
  const src = path.join(FROTA, f);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(tmp, f));
}
let appjs = fs.readFileSync(path.join(tmp, 'app.js'), 'utf8')
  .replace("const DEMO = firebaseConfig.apiKey === 'COLE_AQUI';", 'const DEMO = true;');
fs.writeFileSync(path.join(tmp, 'app.js'), appjs);

// pdf.js local (opcional) para os testes de fluxo PDF
const PDFJS = process.env.PDFJS_LOCAL;
let temPdfjs = false;
if (PDFJS && fs.existsSync(path.join(PDFJS, 'pdf.local.js')) && fs.existsSync(path.join(PDFJS, 'pdf.worker.local.js'))) {
  fs.copyFileSync(path.join(PDFJS, 'pdf.local.js'), path.join(tmp, 'pdf.local.js'));
  fs.copyFileSync(path.join(PDFJS, 'pdf.worker.local.js'), path.join(tmp, 'pdf.worker.local.js'));
  temPdfjs = true;
}

// ── servidor estático mínimo ──
const MIME = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  try {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
    const buf = await readFile(path.join(tmp, rel));
    res.setHeader('content-type', MIME[path.extname(rel)] || 'application/octet-stream');
    res.end(buf);
  } catch { res.statusCode = 404; res.end('nf'); }
});
await new Promise(r => server.listen(0, r));
const PORT = server.address().port;

// ── infra de teste ──
let PASS = 0, FAIL = 0, SKIP = 0;
const chk = (n, c, x = '') => { if (c) { PASS++; console.log('OK ✓ ' + n + (x ? ' | ' + x : '')); } else { FAIL++; console.log('*** FAIL *** ' + n + (x ? ' | ' + x : '')); } };
const skip = (n) => { SKIP++; console.log('SKIP – ' + n); };

const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const p = await (await b.newContext({ viewport: { width: 420, height: 900 }, isMobile: true, hasTouch: true })).newPage();
const errs = [];
p.on('pageerror', e => errs.push('PE:' + e.message));
p.on('console', m => { if (m.type() === 'error') { const t = m.text(); if (!/ERR_|Failed to load|status of 4|net::|jsdelivr|tesseract|pdf\.min|pdf\.worker|pdf\.local|OCR indispon|texto nativo PDF/i.test(t)) errs.push('C:' + t); } });

await p.goto(`http://localhost:${PORT}/index.html`); await p.waitForTimeout(800);
await p.locator('.lp-card').first().tap(); await p.waitForTimeout(1000);
await p.waitForFunction(() => typeof parseNota === 'function' && typeof lerTextoNota === 'function', { timeout: 8000 });

const DANFE = await readFile(path.join(FIXT, 'nfe-danfe-sintetica.txt'), 'utf8');

// ══════════ 1. PARSER — cenário DANFE sintético completo ══════════
console.log('\n== PARSER: DANFE sintética ==');
const r = await p.evaluate(t => parseNota(t), DANFE);
chk('valor 258.89', r.valor === 258.89, 'valor=' + r.valor);
chk('litros 34.11 (4 casas)', r.litros === 34.11, 'litros=' + r.litros);
chk('preço/litro 7.59', r.precoLitro === 7.59, 'preco=' + r.precoLitro);
chk('odômetro 3169 (NÃO 88 da rodovia)', r.km === 3169, 'km=' + r.km);
chk('conferência coerente', r.conferenciaOk === true);
chk('chaveNota 44 dígitos', /^\d{44}$/.test(r.chaveNota || ''), 'len=' + (r.chaveNota || '').length);
chk('numeroNota', r.numeroNota === '000.099.999', r.numeroNota);
chk('serieNota', r.serieNota === '007', r.serieNota);
chk('cnpjEmitente', r.cnpjEmitente === '11.222.333/0001-44');
chk('combustivel', r.combustivel === 'DIESEL S10', r.combustivel);
chk('placa (campo fiscal)', r.placa === 'ABC1D23', r.placa);
chk('data emissão', r.data === '2026-08-11', r.data);

// ══════════ 2. KM: rodovia × veículo ══════════
console.log('\n== KM: rodovia × odômetro ==');
chk('endereço "KM 88" sozinho → km ausente', (await p.evaluate(() => parseNota('POSTO X\nROD BR-101 KM 88, 000 - BAIRRO\nVALOR TOTAL\n100,00').km)) === undefined);
chk('"KM : 4521" (espaço antes de :)', (await p.evaluate(() => parseNota('INFO\nKM : 4521\nVALOR\n50,00').km)) === 4521);
chk('"ODÔMETRO: 78945"', (await p.evaluate(() => parseNota('NOTA\nODÔMETRO: 78945\nVALOR\n60,00').km)) === 78945);

// ══════════ 3. Litros / preço ══════════
console.log('\n== Litros / preço ==');
const rev = await p.evaluate(() => parseNota('POSTO ANTIGO\nVALOR\n120,00\n30,500 L'));
chk('compat layout antigo "30,500 L" → 30.5', rev.litros === 30.5, 'litros=' + rev.litros);
const inc = await p.evaluate(() => parseNota('POSTO W\nVALOR TOTAL\n300,00\nLT\n10,0000\n5,0000'));
chk('incoerente (10×5≠300): mantém valores, conferenciaOk=false', inc.valor === 300 && inc.litros === 10 && inc.precoLitro === 5 && inc.conferenciaOk === false);

// ══════════ 4. Chave de acesso ══════════
console.log('\n== Chave de acesso NF-e ==');
chk('chave espaçada (com rótulo) → 44 dígitos limpos', (await p.evaluate(() => parseNota('CHAVE DE ACESSO\n0001 0002 0003 0004 0005 5566 0007 0008 0009 0010 0011').chaveNota)) === '00010002000300040005556600070008000900100011');
const bad = await p.evaluate(() => parseNota('CHAVE DE ACESSO 123 456\nCNPJ\n99.888.777/0001-66\nNº 000.012.345\nSérie 002'));
chk('chave inválida → chaveNota ausente', bad.chaveNota === undefined);
chk('chave inválida → chaveAlt com cnpj/número/série', !!bad.chaveAlt && bad.chaveAlt.cnpjEmitente === '99888777000166' && bad.chaveAlt.numeroNota === '000012345' && bad.chaveAlt.serieNota === '002');
// 44 dígitos SEM rótulo: só aceita se parecer chave (modelo 55/65)
const semRotuloValida = await p.evaluate(() => parseNota('DOC\n1234 5678 9012 3456 7890 5566 7788 9900 1122 3344 5566\nVALOR\n10,00').chaveNota);
chk('44 díg sem rótulo, modelo 55 → aceita', semRotuloValida === '12345678901234567890556677889900112233445566');
const semRotuloInvalida = await p.evaluate(() => parseNota('DOC\n1234 5678 9012 3456 7890 9999 7788 9900 1122 3344 5566\nVALOR\n10,00').chaveNota);
chk('44 díg sem rótulo, modelo 99 → NÃO aceita cegamente', semRotuloInvalida === undefined, 'chave=' + semRotuloInvalida);

// ══════════ 5. Placa e segurança de extração ══════════
console.log('\n== Placa / segurança ==');
chk('placa Mercosul só em complementares', (await p.evaluate(() => parseNota('POSTO Y\nINFO COMPLEMENTARES\n9979\nQWE2A34\nKM: 100').placa)) === 'QWE2A34');
chk('"CENTRO 28970-000" NÃO é placa', (await p.evaluate(() => parseNota('POSTO Z\nBAIRRO CENTRO 28970-000\nVALOR TOTAL\n30,00').placa)) === undefined);
// placa/KM não saem de CNPJ/CEP/chave (só dígitos, sem 3 letras + rótulo)
const soFiscais = await p.evaluate(() => parseNota('CNPJ\n11.222.333/0001-44\nCEP\n28970-000\nCHAVE DE ACESSO\n1234 5678 9012 3456 7890 5566 7788 9900 1122 3344 5566\nVALOR\n40,00'));
chk('placa não extraída de CNPJ/CEP/chave', soFiscais.placa === undefined);
chk('KM não extraído de CNPJ/CEP/chave', soFiscais.km === undefined);

// ══════════ 6. Campos ausentes / texto insuficiente ══════════
console.log('\n== Robustez ==');
chk('texto vazio não gera erro', await p.evaluate(() => { try { parseNota(''); return true; } catch { return false; } }));
const parc = await p.evaluate(() => parseNota('TEXTO SOLTO SEM ESTRUTURA'));
chk('texto parcial → nada inventado', parc.valor === undefined && parc.litros === undefined && parc.km === undefined);
chk('textoUtil("") === false (→ decisão OCR)', (await p.evaluate(() => textoUtil(''))) === false);
chk('textoUtil("  \\n ") === false', (await p.evaluate(() => textoUtil('  \n '))) === false);
chk('textoUtil(texto rico) === true', (await p.evaluate(t => textoUtil(t), DANFE)) === true);

// ══════════ 7. Regressão dos consumidores (conferência → despesa → veículo) ══════════
console.log('\n== Regressão: conferência → despesa → veículo ==');
const reg = await p.evaluate((t) => {
  S.tx = []; S.anexos = []; S.vehicles[0].nome = 'Van Teste'; S.vehicles[0].placa = 'ABC1D23'; S.vehicles[0].km = 0; demoSave();
  const info = parseNota(t);
  txTipo = 'despesa'; txCat = '';
  abrirConferenciaNota(info);
  const preencheu = document.getElementById('nc-valor').value === '258,89'
    && document.getElementById('nc-km').value === '3169'
    && document.getElementById('nc-veiculo').value === S.vehicles[0].id
    && document.getElementById('modal-nota-conf').classList.contains('open');
  return { preencheu, vid: S.vehicles[0].id };
}, DANFE);
chk('conferência preenche e casa veículo pela placa', reg.preencheu);
const salvo = await p.evaluate(async () => {
  pendingAnexo = { nome: 'sintetica.pdf', mime: 'application/pdf', data: 'data:application/pdf;base64,AAAA' };
  await confirmarNotaAbast();
  await new Promise(r => setTimeout(r, 150));
  const tx = S.tx.filter(t => !t.deleted && t.cat === 'combustivel');
  const t = tx[0] || {};
  return { n: tx.length, cat: t.cat, tipo: t.tipo, origem: t.origem, valor: t.valor, litros: t.litros, km: t.km, veic: t.veiculo === S.vehicles[0].id, vehKm: S.vehicles[0].km, anexo: (S.anexos || []).some(a => a.parentId === t.id) };
});
chk('cria UMA despesa de combustível (frota)', salvo.n === 1 && salvo.cat === 'combustivel' && salvo.tipo === 'despesa' && salvo.origem === 'frota');
chk('tx com valor/litros/km e vínculo ao veículo', salvo.valor === 258.89 && salvo.litros === 34.11 && salvo.km === 3169 && salvo.veic);
chk('km espelhado no veículo', salvo.vehKm === 3169);
chk('PDF anexado à despesa', salvo.anexo === true);
// OCR falho não trava: importar uma "imagem" sem OCR disponível → fluxo conclui
const semTrava = await p.evaluate(async () => {
  const c = document.createElement('canvas'); c.width = 20; c.height = 20;
  c.getContext('2d').fillRect(0, 0, 20, 20);
  const blob = await new Promise(res => c.toBlob(res, 'image/jpeg'));
  const file = new File([blob], 'foto.jpg', { type: 'image/jpeg' });
  const leitura = await lerTextoNota(file); // OCR indisponível → texto '' (sem travar)
  return { fonte: leitura.fonte, texto: leitura.texto };
});
chk('OCR indisponível não trava (imagem → fonte ocr, texto vazio)', semTrava.fonte === 'ocr' && semTrava.texto === '');

// ══════════ 8. Fluxo PDF (texto nativo × OCR × multipágina) — precisa de pdf.js ══════════
console.log('\n== Fluxo PDF (requer pdf.js) ==');
let pdfjsPronto = temPdfjs;
if (temPdfjs) {
  await p.addScriptTag({ url: '/pdf.local.js' });
  await p.evaluate(() => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.local.js'; });
} else {
  // tenta o CDN (dev com rede); se falhar, pula
  pdfjsPronto = await p.evaluate(async () => { try { await ensurePdfjs(); return !!window.pdfjsLib; } catch { return false; } });
}
if (!pdfjsPronto) {
  skip('PDF com texto nativo → fonte "texto" (pdf.js indisponível)');
  skip('PDF só-imagem → decisão OCR (pdf.js indisponível)');
  skip('PDF multipágina lê além da 1ª página (pdf.js indisponível)');
} else {
  const nativo = await p.evaluate(async (t) => {
    await ensureJsPDF(); const { jsPDF } = window.jspdf;
    const doc = new jsPDF(); t.split('\n').forEach((ln, i) => doc.text(ln, 10, 12 + i * 7));
    const file = new File([doc.output('arraybuffer')], 's.pdf', { type: 'application/pdf' });
    const l = await lerTextoNota(file); const info = parseNota(l.texto);
    return { fonte: l.fonte, imagem: !!l.imagem, tess: typeof window.Tesseract !== 'undefined', valor: info.valor, km: info.km, chave44: /^\d{44}$/.test(info.chaveNota || '') };
  }, DANFE);
  chk('PDF com texto nativo → fonte "texto", sem imagem, OCR não carregado', nativo.fonte === 'texto' && nativo.imagem === false && nativo.tess === false);
  chk('parser sobre texto nativo do PDF: valor/km/chave corretos', nativo.valor === 258.89 && nativo.km === 3169 && nativo.chave44);

  const multipg = await p.evaluate(async () => {
    await ensureJsPDF(); const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.text('PAGINA 1 - CAPA SEM DADOS UTEIS', 10, 20);
    doc.addPage();
    ['POSTO MULTIPAGINA LTDA', 'VALOR TOTAL', '400,00', 'LT', '50,0000', '8,0000', 'KM: 5555'].forEach((ln, i) => doc.text(ln, 10, 12 + i * 8));
    const file = new File([doc.output('arraybuffer')], 'm.pdf', { type: 'application/pdf' });
    const l = await lerTextoNota(file); const info = parseNota(l.texto);
    return { fonte: l.fonte, valor: info.valor, km: info.km, litros: info.litros };
  });
  chk('PDF multipágina: lê dados da 2ª página', multipg.fonte === 'texto' && multipg.valor === 400 && multipg.km === 5555 && multipg.litros === 50);

  const soImagem = await p.evaluate(async () => {
    await ensureJsPDF(); const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const c = document.createElement('canvas'); c.width = 300; c.height = 120; const g = c.getContext('2d');
    g.fillStyle = '#eee'; g.fillRect(0, 0, 300, 120); g.fillStyle = '#333'; g.fillRect(10, 10, 120, 20);
    doc.addImage(c.toDataURL('image/jpeg'), 'JPEG', 10, 10, 90, 40);
    const file = new File([doc.output('arraybuffer')], 'img.pdf', { type: 'application/pdf' });
    const nativoTxt = await pdfTextoNativo(file);
    return { util: textoUtil(nativoTxt) };
  });
  chk('PDF só-imagem → texto NÃO útil (decisão = OCR)', soImagem.util === false);
}

console.log(`\n=== RESULTADO: ${PASS} OK / ${FAIL} FAIL / ${SKIP} SKIP ===`);
console.log('ERROS JS:', errs.length ? errs.join('\n') : 'nenhum ✓');
await b.close();
server.close();
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
process.exit(FAIL ? 1 : 0);
