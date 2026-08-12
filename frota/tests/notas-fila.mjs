// Testes reproduzíveis da fila "Notas para revisar" (Etapa 2).
// Usa SOMENTE dados sintéticos (nenhuma nota/dado real). Modo demo.
//
//   node frota/tests/notas-fila.mjs
//   CHROMIUM_PATH  (opcional) caminho do Chromium
//   PDFJS_LOCAL    (opcional) pasta com pdf.local.js + pdf.worker.local.js
//   SHOTS_DIR      (opcional) pasta p/ salvar capturas claro/escuro
//
// O runner copia o app para uma pasta temporária e força o modo demo — não
// altera o código versionado.

import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FROTA = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lagos-fila-'));
for (const f of ['app.js', 'index.html', 'style.css', 'sw.js', 'manifest.json', 'vendor-jspdf.js', 'vendor-jspdf-autotable.js']) {
  const src = path.join(FROTA, f);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(tmp, f));
}
fs.writeFileSync(path.join(tmp, 'app.js'),
  fs.readFileSync(path.join(tmp, 'app.js'), 'utf8').replace("const DEMO = firebaseConfig.apiKey === 'COLE_AQUI';", 'const DEMO = true;'));
const PDFJS = process.env.PDFJS_LOCAL;
let temPdfjs = false;
if (PDFJS && fs.existsSync(path.join(PDFJS, 'pdf.local.js'))) {
  fs.copyFileSync(path.join(PDFJS, 'pdf.local.js'), path.join(tmp, 'pdf.local.js'));
  fs.copyFileSync(path.join(PDFJS, 'pdf.worker.local.js'), path.join(tmp, 'pdf.worker.local.js'));
  temPdfjs = true;
}
const SHOTS = process.env.SHOTS_DIR || path.join(tmp, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

const MIME = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  try {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
    const buf = await readFile(path.join(tmp, rel));
    res.setHeader('content-type', MIME[path.extname(rel)] || 'application/octet-stream'); res.end(buf);
  } catch { res.statusCode = 404; res.end('nf'); }
});
await new Promise(r => server.listen(0, r));
const PORT = server.address().port;

let PASS = 0, FAIL = 0, SKIP = 0;
const chk = (n, c, x = '') => { if (c) { PASS++; console.log('OK ✓ ' + n + (x ? ' | ' + x : '')); } else { FAIL++; console.log('*** FAIL *** ' + n + (x ? ' | ' + x : '')); } };
const skip = n => { SKIP++; console.log('SKIP – ' + n); };
// helpers de teste injetados na página (reaproveitados após cada reload)
const injectHelpersInline = () => {
  window.VID = S.vehicles[0].id;
  window.mkNota = (lido, extra = {}) => { const n = novaNotaPendente(Object.assign({ origem: 'manual', anexoNome: 'x.pdf', anexoMime: 'application/pdf', anexoData: 'data:application/pdf;base64,AAAA', lido, status: 'precisa_revisao' }, extra)); S.notasPendentes.push(n); demoSave(); renderAll(); return n.id; };
  window.confirmarNota = async (id, veic) => { revisarNotaPendente(id); document.getElementById('nc-veiculo').value = veic || window.VID; await confirmarNotaAbast(); await new Promise(r => setTimeout(r, 60)); };
  window.txComb = () => S.tx.filter(t => !t.deleted && t.cat === 'combustivel');
  window.getNota = id => S.notasPendentes.find(n => n.id === id);
};

const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const p = await (await b.newContext({ viewport: { width: 400, height: 860 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })).newPage();
const errs = [];
p.on('pageerror', e => errs.push('PE:' + e.message));
p.on('console', m => { if (m.type() === 'error') { const t = m.text(); if (!/ERR_|Failed to load|status of 4|net::|jsdelivr|tesseract|pdf\.min|pdf\.worker|pdf\.local|OCR indispon|texto nativo|falha simulada/i.test(t)) errs.push('C:' + t); } });

await p.goto(`http://localhost:${PORT}/index.html`); await p.waitForTimeout(800);
await p.locator('.lp-card').first().tap(); await p.waitForTimeout(1000);
await p.waitForFunction(() => typeof importNotaParaFila === 'function' && typeof confirmarNotaAbast === 'function', { timeout: 8000 });

// base isolada: uma van com placa conhecida, nada mais
await p.evaluate(() => {
  S.tx = []; S.anexos = []; S.notasPendentes = [];
  S.vehicles[0].nome = 'Van Teste'; S.vehicles[0].placa = 'ABC1D23'; S.vehicles[0].km = 0; delete S.vehicles[0].status;
  demoSave(); renderAll();
  window.VID = S.vehicles[0].id;
  // helper: cria nota pendente sintética
  window.mkNota = (lido, extra = {}) => {
    const n = novaNotaPendente(Object.assign({ origem: 'manual', anexoNome: 'x.pdf', anexoMime: 'application/pdf', anexoData: 'data:application/pdf;base64,AAAA', lido, status: 'precisa_revisao' }, extra));
    S.notasPendentes.push(n); demoSave(); renderAll(); return n.id;
  };
  window.confirmarNota = async (id, veic) => {
    revisarNotaPendente(id);
    document.getElementById('nc-veiculo').value = veic || window.VID;
    await confirmarNotaAbast(); await new Promise(r => setTimeout(r, 60));
  };
  window.txComb = () => S.tx.filter(t => !t.deleted && t.cat === 'combustivel');
  window.getNota = id => S.notasPendentes.find(n => n.id === id);
});
const CH1 = '12345678901234567890556677889900112233445566';
const CH2 = '99998888777766665555444433332222111100009999'.slice(0, 44);

console.log('\n== 1. importar para a fila sem criar tx (imagem ilegível → precisa_revisao) ==');
const imp = await p.evaluate(async () => {
  const c = document.createElement('canvas'); c.width = 30; c.height = 30; c.getContext('2d').fillRect(0, 0, 30, 30);
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg'));
  const dt = new DataTransfer(); dt.items.add(new File([blob], 'nota.jpg', { type: 'image/jpeg' }));
  const input = document.getElementById('nota-fila-input'); input.files = dt.files;
  await importNotaParaFila(input); await new Promise(r => setTimeout(r, 120));
  const n = S.notasPendentes[S.notasPendentes.length - 1];
  return { nNotas: S.notasPendentes.length, nTx: S.tx.length, status: n && n.status, erro: n && n.erroLeitura };
});
chk('importou 1 nota, 0 tx', imp.nNotas === 1 && imp.nTx === 0);
chk('14. PDF/arquivo ilegível → precisa_revisao com erroLeitura', imp.status === 'precisa_revisao' && imp.erro === 'sem_texto_util');
await p.evaluate(() => { S.notasPendentes = []; demoSave(); renderAll(); });

console.log('\n== 2. contador de pendências (confirmadas/rejeitadas fora) ==');
const cont = await p.evaluate(() => {
  mkNota({ posto: 'P1', valor: 10, data: '2026-08-01' });
  mkNota({ posto: 'P2', valor: 20, data: '2026-08-02' });
  mkNota({ posto: 'P3', valor: 30, data: '2026-08-03', chaveNota: '11112222333344445555666677778888999900001111' }, { status: 'confirmada', txId: 'x' });
  mkNota({ posto: 'P4', valor: 40, data: '2026-08-04' }, { status: 'rejeitada', motivoRejeicao: 'ilegivel' });
  const badge = document.querySelector('#notas-revisar .nrev-count');
  return { pend: notasPendentesLista().length, badge: badge && badge.textContent };
});
chk('contador = 2 (só pendentes)', cont.pend === 2 && cont.badge === '2');
await p.evaluate(() => { S.notasPendentes = []; S.tx = []; demoSave(); renderAll(); });

console.log('\n== 3-4. revisar/corrigir e confirmar → exatamente 1 despesa ==');
const conf = await p.evaluate(async () => {
  const id = mkNota({ posto: 'Posto Bom', valor: 100, data: '2026-08-05', litros: 12.5, placa: 'ABC1D23', km: 5000, chaveNota: '12345678901234567890556677889900112233445566' });
  revisarNotaPendente(id);
  const preencheu = document.getElementById('nc-valor').value && document.getElementById('nc-veiculo').value === window.VID;
  // Luiz corrige o valor antes de confirmar
  document.getElementById('nc-valor').value = '150,00';
  await confirmarNotaAbast(); await new Promise(r => setTimeout(r, 80));
  const tx = txComb(); const n = getNota(id);
  return { preencheu: !!preencheu, nTx: tx.length, valor: tx[0] && tx[0].valor, km: tx[0] && tx[0].km, veic: tx[0] && tx[0].veiculo === window.VID, status: n.status, txId: n.txId === (tx[0] && tx[0].id), vehKm: S.vehicles[0].km, anexo: (S.anexos || []).some(a => a.parentId === (tx[0] && tx[0].id)) };
});
chk('3. revisar preenche e casa veículo', conf.preencheu);
chk('4. confirma → 1 despesa, valor corrigido 150, vínculo+km+anexo', conf.nTx === 1 && conf.valor === 150 && conf.veic && conf.km === 5000 && conf.vehKm === 5000 && conf.anexo);
chk('4. nota vira confirmada com txId', conf.status === 'confirmada' && conf.txId);

console.log('\n== 5. duplo toque cria só 1 tx ==');
const dbl = await p.evaluate(async () => {
  S.tx = []; S.notasPendentes = []; S.anexos = []; demoSave();
  const id = mkNota({ posto: 'Dbl', valor: 80, data: '2026-08-06', chaveNota: '22223333444455556666777788889999000011112222' });
  revisarNotaPendente(id); document.getElementById('nc-veiculo').value = window.VID;
  const a = confirmarNotaAbast(); const b2 = confirmarNotaAbast(); // duplo toque
  await Promise.all([a, b2]); await new Promise(r => setTimeout(r, 80));
  return { nTx: txComb().length };
});
chk('5. duplo toque → 1 tx', dbl.nTx === 1);

console.log('\n== 6. recarregar e tentar confirmar de novo ==');
await p.reload(); await p.waitForTimeout(900);
if (await p.evaluate(() => document.querySelector('.lp-card') && document.getElementById('login-screen') && getComputedStyle(document.getElementById('login-screen')).display !== 'none')) { await p.locator('.lp-card').first().tap(); await p.waitForTimeout(700); }
await p.waitForFunction(() => typeof revisarNotaPendente === 'function', { timeout: 6000 });
// re-injeta helpers perdidos no reload
await p.evaluate(() => {
  window.VID = S.vehicles[0].id;
  window.mkNota = (lido, extra = {}) => { const n = novaNotaPendente(Object.assign({ origem: 'manual', anexoNome: 'x.pdf', anexoMime: 'application/pdf', anexoData: 'data:application/pdf;base64,AAAA', lido, status: 'precisa_revisao' }, extra)); S.notasPendentes.push(n); demoSave(); renderAll(); return n.id; };
  window.confirmarNota = async (id, veic) => { revisarNotaPendente(id); document.getElementById('nc-veiculo').value = veic || window.VID; await confirmarNotaAbast(); await new Promise(r => setTimeout(r, 60)); };
  window.txComb = () => S.tx.filter(t => !t.deleted && t.cat === 'combustivel');
  window.getNota = id => S.notasPendentes.find(n => n.id === id);
});
const rel = await p.evaluate(async () => {
  const antes = txComb().length;
  const n = S.notasPendentes.find(x => x.status === 'confirmada');
  revisarNotaPendente(n.id); // deve recusar (já confirmada, tx viva)
  await new Promise(r => setTimeout(r, 60));
  const modalAberto = document.getElementById('modal-nota-conf').classList.contains('open');
  return { antes, depois: txComb().length, modalAberto };
});
chk('6. nota confirmada persiste e NÃO reconfirma (sem modal, sem nova tx)', rel.antes === rel.depois && rel.modalAberto === false);

console.log('\n== 7. chave NF-e duplicada → não duplica ==');
const dup = await p.evaluate(async () => {
  S.tx = []; S.notasPendentes = []; demoSave();
  const chave = '33334444555566667777888899990000111122223333';
  const a = mkNota({ posto: 'A', valor: 50, data: '2026-08-07', chaveNota: chave });
  const b2 = mkNota({ posto: 'B', valor: 50, data: '2026-08-08', chaveNota: chave });
  await confirmarNota(a); await confirmarNota(b2);
  const nb = getNota(b2);
  return { nTx: txComb().length, bLancada: nb.status === 'confirmada' && nb.jaLancada === true };
});
chk('7. mesma chave → 1 tx; 2ª nota vinculada como já lançada', dup.nTx === 1 && dup.bLancada);

console.log('\n== 8. mesma nota já lançada manualmente ==');
const man = await p.evaluate(async () => {
  S.tx = []; S.notasPendentes = []; demoSave();
  const chave = '44445555666677778888999900001111222233334444';
  // lançamento MANUAL direto (sem fila): abrirConferenciaNota + confirmar
  notaConfInfo = { valor: 70, data: '2026-08-09', chaveNota: chave };
  notaFilaId = null;
  document.getElementById('nc-valor').value = '70,00';
  document.getElementById('nc-data').value = '2026-08-09';
  abrirConferenciaNota({ valor: 70, data: '2026-08-09', chaveNota: chave });
  document.getElementById('nc-veiculo').value = window.VID;
  await confirmarNotaAbast(); await new Promise(r => setTimeout(r, 60));
  const aposManual = txComb().length;
  // agora a mesma nota chega pela fila
  const id = mkNota({ posto: 'Fila', valor: 70, data: '2026-08-09', chaveNota: chave });
  await confirmarNota(id);
  const n = getNota(id);
  return { aposManual, final: txComb().length, vinc: n.status === 'confirmada' && n.jaLancada === true };
});
chk('8. já lançada manual → fila não duplica (1 tx) e vincula', man.aposManual === 1 && man.final === 1 && man.vinc);

console.log('\n== 9. duas notas legítimas, mesmo valor e data, chaves diferentes ==');
const two = await p.evaluate(async () => {
  S.tx = []; S.notasPendentes = []; demoSave();
  const a = mkNota({ posto: 'Leg A', valor: 90, data: '2026-08-10', chaveNota: '55556666777788889999000011112222333344445555' });
  const b2 = mkNota({ posto: 'Leg B', valor: 90, data: '2026-08-10', chaveNota: '66667777888899990000111122223333444455556666' });
  await confirmarNota(a); await confirmarNota(b2);
  return { nTx: txComb().length };
});
chk('9. valor/data iguais + chaves diferentes → 2 tx (não bloqueia)', two.nTx === 2);

console.log('\n== 10. falha ANTES de criar a tx → nota não vira confirmada ==');
const f10 = await p.evaluate(async () => {
  S.tx = []; S.notasPendentes = []; demoSave();
  const id = mkNota({ posto: 'Falha1', valor: 60, data: '2026-08-11', chaveNota: '77778888999900001111222233334444555566667777' });
  const orig = S.tx;
  S.tx = new Proxy(orig, { get(t, k) { if (k === 'push') return () => { throw new Error('falha simulada'); }; const v = t[k]; return typeof v === 'function' ? v.bind(t) : v; } });
  revisarNotaPendente(id); document.getElementById('nc-veiculo').value = window.VID;
  await confirmarNotaAbast().catch(() => {}); await new Promise(r => setTimeout(r, 60));
  S.tx = orig; // restaura
  const n = S.notasPendentes.find(x => x.id === id);
  return { nTx: S.tx.filter(t => !t.deleted && t.cat === 'combustivel').length, status: n.status, txId: n.txId };
});
chk('10. tx falhou → 0 tx e nota segue precisa_revisao (não confirmada)', f10.nTx === 0 && f10.status === 'precisa_revisao' && !f10.txId);

console.log('\n== 11. falha DEPOIS de criar a tx → retry reconhece e conclui sem duplicar ==');
const f11 = await p.evaluate(async () => {
  S.tx = []; S.notasPendentes = []; demoSave();
  const id = mkNota({ posto: 'Falha2', valor: 65, data: '2026-08-12', chaveNota: '88889999000011112222333344445555666677778888' });
  await confirmarNota(id); // 1ª: cria tx e confirma
  const txId = getNota(id).txId;
  // simula "tx criada, mas a nota não atualizou": volta a nota ao estado pré-confirmação
  const n = getNota(id); const { id: _drop, ...rest } = n;
  await dataSet('notasPendentes', id, Object.assign(rest, { status: 'precisa_revisao', txId: null }));
  await confirmarNota(id); // retry
  const n2 = getNota(id);
  return { nTx: txComb().length, mesmaTx: n2.txId === txId, status: n2.status };
});
chk('11. retry após falha parcial → 1 tx (mesmo id) e nota confirmada', f11.nTx === 1 && f11.mesmaTx && f11.status === 'confirmada');

console.log('\n== 12-13. rejeitar com motivo e restaurar ==');
const rej = await p.evaluate(async () => {
  S.tx = []; S.notasPendentes = []; demoSave();
  const id = mkNota({ posto: 'Rej', valor: 30, data: '2026-08-13' });
  abrirRejeicaoNota(id);
  document.querySelector('input[name="nrej-motivo"][value="nao_abastecimento"]').checked = true;
  await confirmarRejeicaoNota(); await new Promise(r => setTimeout(r, 40));
  const n1 = getNota(id);
  const rejStatus = n1.status; const motivo = n1.motivoRejeicao; const nTxRej = txComb().length;
  await restaurarNotaRevisar(id); await new Promise(r => setTimeout(r, 40));
  const n2 = getNota(id);
  return { rejStatus, motivo, nTxRej, restaurado: n2.status };
});
chk('12. rejeitar com motivo → rejeitada, motivo salvo, sem tx', rej.rejStatus === 'rejeitada' && rej.motivo === 'nao_abastecimento' && rej.nTxRej === 0);
chk('13. restaurar rejeitada → precisa_revisao', rej.restaurado === 'precisa_revisao');
const rejSemMotivo = await p.evaluate(async () => {
  const id = mkNota({ posto: 'RejSem', valor: 10, data: '2026-08-14' });
  abrirRejeicaoNota(id);
  document.querySelectorAll('input[name="nrej-motivo"]').forEach(r => r.checked = false);
  await confirmarRejeicaoNota(); await new Promise(r => setTimeout(r, 30));
  return getNota(id).status;
});
chk('12. rejeição SEM motivo é bloqueada', rejSemMotivo === 'precisa_revisao');

console.log('\n== 15. placa sem veículo correspondente ==');
const semVeic = await p.evaluate(async () => {
  S.tx = []; S.notasPendentes = []; demoSave();
  const id = mkNota({ posto: 'SemVeic', valor: 45, data: '2026-08-15', placa: 'ZZZ9Z99', chaveNota: '10101010101010101010551010101010101010101010' });
  revisarNotaPendente(id);
  const veicVazio = document.getElementById('nc-veiculo').value === '';
  await confirmarNotaAbast(); await new Promise(r => setTimeout(r, 40)); // sem veículo → bloqueia
  const bloqueou = txComb().length === 0 && getNota(id).status === 'precisa_revisao';
  // Luiz escolhe o veículo manualmente
  document.getElementById('nc-veiculo').value = window.VID;
  await confirmarNotaAbast(); await new Promise(r => setTimeout(r, 60));
  return { veicVazio, bloqueou, apos: txComb().length, status: getNota(id).status };
});
chk('15. placa sem match → veículo vazio e confirmação bloqueada', semVeic.veicVazio && semVeic.bloqueou);
chk('15. após escolher veículo → confirma normalmente', semVeic.apos === 1 && semVeic.status === 'confirmada');

console.log('\n== 16. exclusão posterior da tx reabre a nota ==');
const del = await p.evaluate(async () => {
  S.tx = []; S.notasPendentes = []; demoSave();
  const id = mkNota({ posto: 'Del', valor: 55, data: '2026-08-16', chaveNota: '12121212121212121212551212121212121212121212' });
  await confirmarNota(id);
  const txId = getNota(id).txId;
  await softDeleteTx(txId); await new Promise(r => setTimeout(r, 60));
  const n = getNota(id);
  const reaberta = n.status === 'precisa_revisao' && !n.txId && n.erroLeitura === 'tx_removida';
  await restaurarTx(txId); await new Promise(r => setTimeout(r, 60));
  const n2 = getNota(id);
  return { reaberta, relink: n2.status === 'confirmada' && n2.txId === txId };
});
chk('16. excluir tx → nota reabre (não afirma despesa válida)', del.reaberta);
chk('16. restaurar tx → nota volta a vincular', del.relink);

console.log('\n== AUDITORIA 3: fila vincula à tx manual SEM alterá-la ==');
const linkManual = await p.evaluate(async () => {
  S.tx = []; S.notasPendentes = []; S.anexos = []; demoSave();
  const chave = '1'.repeat(44);
  abrirConferenciaNota({ valor: 70, data: '2026-08-09', litros: 7, placa: 'ABC1D23', km: 1234, chaveNota: chave });
  document.getElementById('nc-veiculo').value = window.VID; document.getElementById('nc-valor').value = '70,00';
  await confirmarNotaAbast(); await new Promise(r => setTimeout(r, 60));
  const manual = txComb()[0]; const snap = JSON.stringify(manual); const nAnexo = (S.anexos || []).length;
  const id = mkNota({ posto: 'Fila', valor: 999, data: '2026-01-01', litros: 99, placa: 'ZZZ9Z99', km: 88888, chaveNota: chave });
  revisarNotaPendente(id); document.getElementById('nc-veiculo').value = window.VID;
  document.getElementById('nc-valor').value = '999,00'; document.getElementById('nc-km').value = '88888';
  await confirmarNotaAbast(); await new Promise(r => setTimeout(r, 60));
  const manual2 = txComb().find(t => t.id === manual.id); const n = getNota(id);
  return { nTx: txComb().length, inalterado: JSON.stringify(manual2) === snap, semAnexoNovo: (S.anexos || []).length === nAnexo, avisa: n.jaLancada === true, vinc: n.txId === manual.id };
});
chk('3. vincula à tx manual sem alterar valor/veículo/km/data e sem anexar', linkManual.nTx === 1 && linkManual.inalterado && linkManual.semAnexoNovo);
chk('3. informa "já lançada" e guarda vínculo consistente', linkManual.avisa && linkManual.vinc);

console.log('\n== AUDITORIA 4: fallback fiscal exige CNPJ+número+série ==');
const fb = await p.evaluate(async () => {
  S.tx = []; S.notasPendentes = []; demoSave();
  const a = mkNota({ posto: 'A', valor: 50, data: '2026-08-20', cnpjEmitente: '11.222.333/0001-44', numeroNota: '000.100', serieNota: '1' });
  const b = mkNota({ posto: 'B', valor: 50, data: '2026-08-21', cnpjEmitente: '11.222.333/0001-44', numeroNota: '000.100', serieNota: '1' });
  await confirmarNota(a); await confirmarNota(b);
  const comFull = txComb().length;
  S.tx = []; S.notasPendentes = []; demoSave();
  const c = mkNota({ posto: 'C', valor: 60, data: '2026-08-22', cnpjEmitente: '11.222.333/0001-44', numeroNota: '000.200' });
  const d = mkNota({ posto: 'D', valor: 60, data: '2026-08-22', cnpjEmitente: '11.222.333/0001-44', numeroNota: '000.200' });
  await confirmarNota(c); await confirmarNota(d);
  return { comFull, semSerie: txComb().length };
});
chk('4. conjunto fiscal completo (cnpj+nº+série) deduplica → 1 tx', fb.comFull === 1);
chk('4. conjunto incompleto (sem série) NÃO gera identidade fraca → 2 tx', fb.semSerie === 2);

console.log('\n== AUDITORIA 4: sem chave nem fiscal → não se bloqueiam ==');
const noKey = await p.evaluate(async () => {
  S.tx = []; S.notasPendentes = []; demoSave();
  await confirmarNota(mkNota({ posto: 'X', valor: 33, data: '2026-08-26' }));
  await confirmarNota(mkNota({ posto: 'Y', valor: 33, data: '2026-08-26' }));
  return { nTx: txComb().length };
});
chk('4. sem identidade fiscal, mesmo valor/data → 2 tx (não bloqueia)', noKey.nTx === 2);

console.log('\n== AUDITORIA 4: mesma nota em 2 e-mails → 1 despesa ==');
const emailDup = await p.evaluate(async () => {
  S.tx = []; S.notasPendentes = []; demoSave();
  const chave = '2'.repeat(44);
  const a = mkNota({ posto: 'E1', valor: 80, data: '2026-08-23', chaveNota: chave }, { origem: 'email', emailMessageId: 'm1', emailFrom: 'x@y' });
  const b = mkNota({ posto: 'E2', valor: 80, data: '2026-08-23', chaveNota: chave }, { origem: 'email', emailMessageId: 'm2', emailFrom: 'x@y' });
  await confirmarNota(a); await confirmarNota(b);
  return { nTx: txComb().length, bLancada: getNota(b).jaLancada === true };
});
chk('4. mesma chave via 2 e-mails → 1 tx', emailDup.nTx === 1 && emailDup.bLancada);

console.log('\n== AUDITORIA 4: rejeitar duplicada não afeta a original ==');
const rejDup = await p.evaluate(async () => {
  S.tx = []; S.notasPendentes = []; demoSave();
  const chave = '3'.repeat(44);
  const orig = mkNota({ posto: 'Orig', valor: 40, data: '2026-08-24', chaveNota: chave });
  await confirmarNota(orig);
  const txId = getNota(orig).txId; const st = getNota(orig).status;
  const dup = mkNota({ posto: 'Dup', valor: 40, data: '2026-08-24', chaveNota: chave });
  abrirRejeicaoNota(dup); document.querySelector('input[name="nrej-motivo"][value="duplicada"]').checked = true;
  await confirmarRejeicaoNota(); await new Promise(r => setTimeout(r, 40));
  const o = getNota(orig);
  return { origIntacta: o.status === st && o.txId === txId, txViva: !!S.tx.find(t => t.id === txId && !t.deleted), dupRej: getNota(dup).status === 'rejeitada' };
});
chk('4. rejeitar duplicada não altera a original nem sua tx', rejDup.origIntacta && rejDup.txViva && rejDup.dupRej);

console.log('\n== AUDITORIA 5: excluir despesa comum não mexe em notas; PDF preservado ==');
const del2 = await p.evaluate(async () => {
  S.tx = []; S.notasPendentes = []; S.anexos = []; demoSave();
  const id = mkNota({ posto: 'PDF', valor: 55, data: '2026-08-25', chaveNota: '4'.repeat(44) });
  await confirmarNota(id); const txId = getNota(id).txId;
  S.tx.push({ id: 'comum1', tipo: 'despesa', cat: 'outros', origem: 'frota', valor: 10, data: '2026-08-25', veiculo: window.VID }); demoSave();
  const antes = JSON.stringify(getNota(id));
  await softDeleteTx('comum1'); await new Promise(r => setTimeout(r, 40));
  const notaIgual = JSON.stringify(getNota(id)) === antes;
  const pdfAntes = getNota(id).anexoData;
  await softDeleteTx(txId); await new Promise(r => setTimeout(r, 40));
  const n = getNota(id);
  return { notaIgual, reabriu: n.status === 'precisa_revisao', pdf: n.anexoData === pdfAntes && !!n.anexoData };
});
chk('5. excluir despesa comum não altera nenhuma nota', del2.notaIgual);
chk('5. excluir tx da fila reabre a nota mas preserva o PDF', del2.reabriu && del2.pdf);

console.log('\n== 18. regressão: importador manual/Financeiro/KM/anexos ==');
const reg = await p.evaluate(async () => {
  S.tx = []; S.notasPendentes = []; S.anexos = []; S.vehicles[0].km = 0; demoSave();
  // lançamento manual direto (sem fila) ainda cria tx e NÃO cria nota pendente
  pendingAnexo = { nome: 'm.pdf', mime: 'application/pdf', data: 'data:application/pdf;base64,AAAA' };
  abrirConferenciaNota({ valor: 200, data: '2026-08-17', litros: 20, placa: 'ABC1D23', km: 9000 });
  document.getElementById('nc-veiculo').value = window.VID;
  await confirmarNotaAbast(); await new Promise(r => setTimeout(r, 60));
  const tx = txComb();
  return { nTx: tx.length, nNotas: S.notasPendentes.length, km: S.vehicles[0].km, anexo: (S.anexos || []).length, semFila: !tx[0].notaPendenteId };
});
chk('18. manual direto cria tx, sem criar nota pendente', reg.nTx === 1 && reg.nNotas === 0 && reg.semFila);
chk('18. KM espelhado e anexo preservados', reg.km === 9000 && reg.anexo === 1);
chk('18. seção some quando não há notas', await p.evaluate(() => { S.notasPendentes = []; demoSave(); renderAll(); return getComputedStyle(document.getElementById('notas-revisar')).display === 'none'; }));

console.log('\n== 17. capturas claro/escuro (celular) ==');
await p.evaluate(() => {
  S.tx = []; S.notasPendentes = []; demoSave();
  mkNota({ posto: 'Posto Central', valor: 258.89, data: '2026-08-11', litros: 34.11, combustivel: 'DIESEL S10', placa: 'ABC1D23', km: 3169, chaveNota: '12345678901234567890556677889900112233445566' });
  mkNota({ posto: 'Sem placa', valor: 120.5, data: '2026-08-10', litros: 15 }, { erroLeitura: 'sem_texto_util' });
  mkNota({ posto: 'Antigo', valor: 44, data: '2026-08-01', chaveNota: '20202020202020202020552020202020202020202020' }, { status: 'confirmada', txId: 'zz' });
  mkNota({ posto: 'Recusada', valor: 12, data: '2026-08-02' }, { status: 'rejeitada', motivoRejeicao: 'duplicada' });
  goTab('lanc'); _histNotasAberto = true; renderNotasRevisar();
  // fecha qualquer overlay/toast aberto para capturas limpas
  document.querySelectorAll('.overlay.open').forEach(o => o.classList.remove('open'));
  const tt = document.getElementById('toast'); if (tt) tt.style.opacity = '0';
});
await p.waitForTimeout(300);
const shotLight = path.join(SHOTS, 'notas-fila-claro.png');
const shotDark = path.join(SHOTS, 'notas-fila-escuro.png');
await p.locator('#notas-revisar').screenshot({ path: shotLight });
await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
await p.waitForTimeout(200);
await p.locator('#notas-revisar').screenshot({ path: shotDark });
await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
chk('17. captura clara gerada', fs.existsSync(shotLight));
chk('17. captura escura gerada', fs.existsSync(shotDark));
console.log('   capturas em: ' + SHOTS);

console.log('\n== AUDITORIA 3: recuperação de falha parcial APÓS RECARREGAR ==');
await p.evaluate(async () => {
  S.tx = []; S.notasPendentes = []; S.anexos = []; demoSave();
  const chave = '5'.repeat(44);
  window.__recId = mkNota({ posto: 'Recuperar', valor: 77, data: '2026-08-27', chaveNota: chave });
  await confirmarNota(window.__recId);      // cria tx + confirma
  const n = getNota(window.__recId); window.__recTx = n.txId;
  // simula "tx criada mas nota NÃO atualizou": persiste estado parcial (localStorage)
  const { id, ...rest } = n;
  await dataSet('notasPendentes', n.id, Object.assign(rest, { status: 'precisa_revisao', txId: null }));
});
const recId = await p.evaluate(() => window.__recId);
const recTx = await p.evaluate(() => window.__recTx);
await p.reload(); await p.waitForTimeout(900);
if (await p.evaluate(() => document.getElementById('login-screen') && getComputedStyle(document.getElementById('login-screen')).display !== 'none')) { await p.locator('.lp-card').first().tap(); await p.waitForTimeout(700); }
await p.waitForFunction(() => typeof revisarNotaPendente === 'function', { timeout: 6000 });
await p.evaluate(injectHelpersInline);
const rec = await p.evaluate(async ({ recId, recTx }) => {
  const nAntes = getNota(recId);
  const persistiu = !!nAntes && nAntes.status === 'precisa_revisao' && !nAntes.txId;
  await confirmarNota(recId);
  const n2 = getNota(recId);
  return { persistiu, nTx: txComb().length, mesmaTx: n2.txId === recTx, status: n2.status };
}, { recId, recTx });
chk('3. estado parcial (tx sem nota atualizada) sobrevive ao reload', rec.persistiu);
chk('3. confirmar após reload reconhece a tx e não duplica (1 tx)', rec.nTx === 1 && rec.mesmaTx && rec.status === 'confirmada');

console.log(`\n=== RESULTADO: ${PASS} OK / ${FAIL} FAIL / ${SKIP} SKIP ===`);
console.log('ERROS JS:', errs.length ? errs.join('\n') : 'nenhum ✓');
await b.close(); server.close();
if (!process.env.SHOTS_DIR) { /* mantém as capturas se SHOTS_DIR foi passado */ }
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
process.exit(FAIL ? 1 : 0);
