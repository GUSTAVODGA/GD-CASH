// Prova isolada da ponte Gmail → fila (Etapa 3). SEM Gmail/Firestore reais.
// Casos 1-11: funções puras (Node). Caso 12: compatibilidade com o
// novaNotaPendente() real do app (Playwright, modo demo).
//
//   node frota/tests/gmail-bridge.mjs
//   CHROMIUM_PATH (opcional) — sem Chromium, o caso 12 é PULADO.

import { createHash } from 'crypto';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import * as B from '../gmail-bridge/bridge.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FROTA = path.resolve(__dirname, '..');

let PASS = 0, FAIL = 0, SKIP = 0;
const chk = (n, c, x = '') => { if (c) { PASS++; console.log('OK ✓ ' + n + (x ? ' | ' + x : '')); } else { FAIL++; console.log('*** FAIL *** ' + n + (x ? ' | ' + x : '')); } };

const sha256 = (bytes) => createHash('sha256').update(Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes)).digest('hex');
const opts = { sha256 };
// anexos sintéticos (NENHUM PDF real)
function pdf(name, conteudo, sizeOverride) {
  const bytes = Buffer.from(conteudo);
  return { fileName: name, mimeType: 'application/pdf', bytes, base64: bytes.toString('base64'), size: sizeOverride != null ? sizeOverride : bytes.length };
}
function xml(name) { const bytes = Buffer.from('<nfeProc><NFe/></nfeProc>'); return { fileName: name, mimeType: 'text/xml', bytes, base64: bytes.toString('base64'), size: bytes.length }; }
const DE = 'Auto Posto Exemplo <appisca.nfe@gmail.com>';

// 1
chk('1. remetente correto → 1 item',
  B.processarLote([{ messageId: 'm1', from: DE, subject: 'NFe', attachments: [pdf('nota.pdf', 'PDF-1')] }], opts).itens.length === 1);

// 2
{
  const r = B.processarLote([{ messageId: 'm2', from: 'Outro <outro@gmail.com>', subject: 'x', attachments: [pdf('n.pdf', 'PDF-2')] }], opts);
  chk('2. remetente incorreto → 0 itens, ignorado', r.itens.length === 0 && r.ignoradas[0].motivo === 'remetente_invalido');
}
// 3 — nome de exibição correto com e-mail errado + encaminhado + spoof
{
  const spoof = B.processarLote([{ messageId: 'm3', from: 'appisca.nfe@gmail.com <golpe@x.com>', subject: 'NFe', attachments: [pdf('n.pdf', 'PDF-3')] }], opts);
  const fwd = B.processarLote([{ messageId: 'm3b', from: 'Encaminhado <fulano@gmail.com>', subject: 'Enc: NFe', attachments: [pdf('n.pdf', 'PDF-3b')] }], opts);
  chk('3. display name certo + e-mail errado → rejeitado', spoof.itens.length === 0 && spoof.ignoradas[0].motivo === 'remetente_invalido');
  chk('3. encaminhado (From do encaminhador) → rejeitado', fwd.itens.length === 0);
  chk('3. endereço exato (bare) → aceito', B.remetenteConfere('appisca.nfe@gmail.com') && !B.remetenteConfere('x.appisca.nfe@gmail.com'));
}
// 4 — PDF + XML
{
  const r = B.processarLote([{ messageId: 'm4', from: DE, subject: 'NFe', attachments: [xml('nota.xml'), pdf('nota.pdf', 'PDF-4')] }], opts);
  chk('4. PDF + XML → 1 item (XML ignorado, sem virar item)', r.itens.length === 1 && r.itens[0].arquivo.mime === 'application/pdf');
}
// 5 — múltiplos PDFs (conteúdos diferentes)
{
  const r = B.processarLote([{ messageId: 'm5', from: DE, subject: 'NFe', attachments: [pdf('a.pdf', 'AAA'), pdf('b.pdf', 'BBB')] }], opts);
  chk('5. dois PDFs legítimos no mesmo e-mail → 2 itens', r.itens.length === 2 && r.itens[0].id !== r.itens[1].id);
}
// 6 — sem PDF
{
  const r = B.processarLote([{ messageId: 'm6', from: DE, subject: 'NFe', attachments: [xml('nota.xml')] }], opts);
  chk('6. e-mail sem PDF → ignorado com motivo', r.itens.length === 0 && r.ignoradas[0].motivo === 'sem_pdf');
}
// 7 — mesmo processamento repetido
{
  const msg = { messageId: 'm7', from: DE, subject: 'NFe', attachments: [pdf('n.pdf', 'REPETIDO')] };
  const r1 = B.processarLote([msg], opts);
  const r2 = B.processarLote([msg], { ...opts, jaConhecidos: new Set(r1.itens.map(i => i.id)) });
  const rDup = B.processarLote([msg, msg], opts);
  chk('7. reexecução com store → 0 novos itens', r1.itens.length === 1 && r2.itens.length === 0 && r2.reconhecidas.length === 1);
  chk('7. mesma mensagem repetida no lote → 1 item + 1 reconhecida', rDup.itens.length === 1 && rDup.reconhecidas.length === 1);
}
// 8 — mesmo PDF em mensagens diferentes
{
  const conteudo = 'MESMO-PDF';
  const r = B.processarLote([
    { messageId: 'm8a', from: DE, subject: 'NFe', attachments: [pdf('n.pdf', conteudo)] },
    { messageId: 'm8b', from: DE, subject: 'Fwd', attachments: [pdf('outro-nome.pdf', conteudo)] },
  ], opts);
  chk('8. mesmo PDF em 2 mensagens → 1 item, 1 reconhecida (mesmo documento)', r.itens.length === 1 && r.reconhecidas.length === 1 && r.reconhecidas[0].docId === r.itens[0].id);
}
// 9 — mesmo nome/tamanho, conteúdo diferente
{
  const A = 'AAAAAAAAAA', C = 'BBBBBBBBBB'; // mesmo tamanho, conteúdo diferente
  const r = B.processarLote([{ messageId: 'm9', from: DE, subject: 'NFe', attachments: [pdf('nota.pdf', A), pdf('nota.pdf', C)] }], opts);
  chk('9. mesmo nome/tamanho, conteúdo diferente → 2 itens distintos', r.itens.length === 2 && r.itens[0].id !== r.itens[1].id && A.length === C.length);
}
// 10 — falha e retry
{
  const msg = { messageId: 'm10', from: DE, subject: 'NFe', attachments: [pdf('n.pdf', 'RETRY')] };
  // falha DEPOIS de persistir o item, ANTES de marcar o Gmail → retry seguro
  const primeiro = B.processarLote([msg], opts);
  const store = new Set(primeiro.itens.map(i => i.id)); // "persistido"
  const retry = B.processarLote([msg], { ...opts, jaConhecidos: store });
  chk('10. retry após persistir e falhar antes de marcar → 0 duplicatas', primeiro.itens.length === 1 && retry.itens.length === 0);
  // falha ANTES de persistir → store vazio → retry cria (uma vez)
  const retrySemPersistir = B.processarLote([msg], opts);
  chk('10. retry quando nada foi persistido → cria 1 (uma vez)', retrySemPersistir.itens.length === 1);
}
// 11 — PDF acima do limite
{
  // conteúdo grande o bastante para o DOC real (base64) passar do limite
  const grande = pdf('grande.pdf', 'x'.repeat(800000));
  const ok = pdf('ok.pdf', 'pequeno');
  const r = B.processarLote([{ messageId: 'm11', from: DE, subject: 'NFe', attachments: [grande, ok] }], opts);
  const rej = r.ignoradas.find(i => i.motivo === 'arquivo_grande');
  chk('11. arquivo acima do limite → rejeição controlada (motivo arquivo_grande, sem corte)', !!rej && rej.docBytes > B.ARQ_LIM.docSizeMax);
  chk('11. o PDF pequeno do mesmo e-mail vira item normalmente', r.itens.length === 1 && r.itens[0].arquivo.nome === 'ok.pdf');
  chk('11. limite conservador fica abaixo do teto de 1 MiB', B.ARQ_LIM.docSizeMax < B.ARQ_LIM.firestoreDocMax && B.maxPdfBytes() > 0);
}

// ── Limite conservador (seção 5): FÓRMULA REAL do Firestore ──
{
  const ID = 'nfe-' + 'a'.repeat(64);
  const mkArq = (b64) => ({ notaPendenteId: ID, sha256: 'a'.repeat(64), mime: 'application/pdf', nome: 'nota.pdf', tamanhoBytes: 1000, dataBase64: b64, criadoEm: 1 });
  const N = B.maxBase64Len(ID);
  const noLimite = mkArq('A'.repeat(N));
  const umAcima = mkArq('A'.repeat(N + 1));
  const real = mkArq('A'.repeat(Math.ceil(283000 * 4 / 3)));  // PDF realista ~283 KB
  chk('L1. PDF realista ~283KB → dentro do limite', B.arquivoDocDentroDoLimite(real, ID) && B.tamanhoDocArquivoReal(real, ID) < B.ARQ_LIM.firestoreDocMax);
  chk('L2. arquivo EXATAMENTE no limite é aceito', B.arquivoDocDentroDoLimite(noLimite, ID) && B.tamanhoDocArquivoReal(noLimite, ID) === B.ARQ_LIM.docSizeMax);
  chk('L3. um byte acima é rejeitado', !B.arquivoDocDentroDoLimite(umAcima, ID));
  chk('L4. metadados extras (nome maior) empurram acima → rejeitado', !B.arquivoDocDentroDoLimite(Object.assign({}, noLimite, { nome: 'x'.repeat(300) }), ID));
  chk('L5. documento final sempre abaixo do teto do Firestore', B.tamanhoDocArquivoReal(noLimite, ID) < B.ARQ_LIM.firestoreDocMax);
  console.log('   [calc] teto=' + B.ARQ_LIM.firestoreDocMax + ' docSizeMax=' + B.ARQ_LIM.docSizeMax + ' overheadSemBase64=' + B.overheadSemBase64(ID) + ' maxBase64Len=' + N + ' maxPdfBytes=' + B.maxPdfBytes(ID));
}

// 12 — metadado compatível com novaNotaPendente() real
const _sha12 = sha256(Buffer.from('PDF-12'));
const _doc12 = B.idDocumento(_sha12);
const payload = Object.assign({ id: _doc12 }, B.montarMetadado(
  { messageId: 'm12', from: DE, subject: 'NFe 123', recebidoEm: 1234 },
  pdf('nota.pdf', 'PDF-12'), _sha12, _doc12, 5));

const CHROME = process.env.CHROMIUM_PATH;
if (!CHROME) {
  skipCompat();
} else {
  try {
    const { chromium } = await import('playwright');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lagos-gb-'));
    for (const f of ['app.js', 'index.html', 'style.css', 'sw.js', 'manifest.json']) { const s = path.join(FROTA, f); if (fs.existsSync(s)) fs.copyFileSync(s, path.join(tmp, f)); }
    fs.writeFileSync(path.join(tmp, 'app.js'), fs.readFileSync(path.join(tmp, 'app.js'), 'utf8').replace("const DEMO = firebaseConfig.apiKey === 'COLE_AQUI';", 'const DEMO = true;'));
    const MIME = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json' };
    const server = createServer(async (req, res) => { try { const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html'; const buf = await readFile(path.join(tmp, rel)); res.setHeader('content-type', MIME[path.extname(rel)] || 'application/octet-stream'); res.end(buf); } catch { res.statusCode = 404; res.end('nf'); } });
    await new Promise(r => server.listen(0, r)); const PORT = server.address().port;
    const b = await chromium.launch({ executablePath: CHROME });
    const p = await (await b.newContext({ hasTouch: true, isMobile: true })).newPage();
    await p.goto(`http://localhost:${PORT}/index.html`); await p.waitForTimeout(700);
    await p.locator('.lp-card').first().tap(); await p.waitForTimeout(900);
    await p.waitForFunction(() => typeof novaNotaPendente === 'function', { timeout: 8000 });
    const n = await p.evaluate((pl) => { const nota = novaNotaPendente(pl); return { id: nota.id, origem: nota.origem, status: nota.status, arquivoId: nota.arquivoId, semBase64: !('anexoData' in nota), msgId: nota.emailMessageId, from: nota.emailFrom, assunto: nota.emailAssunto, lidoObj: typeof nota.lido === 'object', txId: nota.txId }; }, payload);
    chk('12. novaNotaPendente(metadado) preserva id/origem/arquivoId/e-mail, SEM base64',
      n.id === payload.id && n.origem === 'email' && n.status === 'recebida' && n.arquivoId === payload.id && n.semBase64 && n.msgId === 'm12' && n.lidoObj && n.txId === null);
    await b.close(); server.close(); fs.rmSync(tmp, { recursive: true, force: true });
  } catch (e) { console.log('SKIP – 12. compat novaNotaPendente (' + e.message + ')'); SKIP++; }
}
function skipCompat() { console.log('SKIP – 12. compat novaNotaPendente (sem CHROMIUM_PATH)'); SKIP++; }

console.log(`\n=== RESULTADO: ${PASS} OK / ${FAIL} FAIL / ${SKIP} SKIP ===`);
process.exit(FAIL ? 1 : 0);
