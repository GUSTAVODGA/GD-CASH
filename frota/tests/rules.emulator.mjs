// Prova REAL no Firestore Emulator — permissões, ATOMICIDADE e idempotência.
// Rules de ../gmail-bridge/firestore.rules. Nada real é acessado.
//
//   firebase emulators:exec --only firestore --project lagos-test \
//     "node <repo>/frota/tests/rules.emulator.mjs"

import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, writeBatch } from 'firebase/firestore';
import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.resolve(__dirname, '../gmail-bridge/firestore.rules'), 'utf8');
const PROJ = 'lagos-test';
const HOST = process.env.FIRESTORE_EMULATOR_HOST; // ex.: 127.0.0.1:8080

const env = await initializeTestEnvironment({ projectId: PROJ, firestore: { rules } });
const robo = env.authenticatedContext('ROBO_NOTAS_UID').firestore();
const socio = env.authenticatedContext('socio-ygor', { email: 'lagosoperacional+ygor@gmail.com' }).firestore();
const comum = env.authenticatedContext('comum-1', { email: 'alguem@exemplo.com' }).firestore();
const anon = env.unauthenticatedContext().firestore();

let PASS = 0, FAIL = 0;
async function t(nome, promessa) { try { await promessa; PASS++; console.log('OK ✓ ' + nome); } catch (e) { FAIL++; console.log('*** FAIL *** ' + nome + ' | ' + (e && e.message || e)); } }
function ok(nome, cond, extra = '') { if (cond) { PASS++; console.log('OK ✓ ' + nome); } else { FAIL++; console.log('*** FAIL *** ' + nome + (extra ? ' | ' + extra : '')); } }

const hex = c => c.repeat(64);
const idDe = c => 'nfe-' + hex(c);
const arqObj = (c, over = {}) => Object.assign({ notaPendenteId: idDe(c), sha256: hex(c), mime: 'application/pdf', nome: 'nota.pdf', tamanhoBytes: 1000, dataBase64: 'QUJDRA==', criadoEm: 1 }, over);
const metaObj = (c, over = {}) => Object.assign({ status: 'recebida', origem: 'email', recebidoEm: 1, emailMessageId: 'm1', emailFrom: 'Posto <appisca.nfe@gmail.com>', emailAssunto: 'NFe', sha256: hex(c), lido: {}, arquivoId: idDe(c), tamanhoBytes: 1000, txId: null, motivoRejeicao: null, erroLeitura: null }, over);

function parBatch(ctx, cArq, cMeta, arqOver = {}, metaOver = {}) {
  const batch = writeBatch(ctx);
  batch.set(doc(ctx, 'notaArquivos', idDe(cArq)), arqObj(cArq, arqOver));
  batch.set(doc(ctx, 'notasPendentes', idDe(cMeta)), metaObj(cMeta, metaOver));
  return batch.commit();
}

async function existeParaSocio(coll, id) { const s = await getDoc(doc(socio, coll, id)); return s.exists(); }
// Admin SDK contra o Emulator: usa a MESMA semântica de create-only do servidor
// (documents:commit + currentDocument.exists=false). Ignora as Rules (elas já
// são provadas acima pelo SDK modular); aqui provamos ATOMICIDADE e IDEMPOTÊNCIA.
admin.initializeApp({ projectId: PROJ });
const adb = admin.firestore();
async function criarParAdmin(c, arqOver = {}, metaOver = {}) {
  const b = adb.batch();
  b.create(adb.doc('notaArquivos/' + idDe(c)), arqObj(c, arqOver));
  b.create(adb.doc('notasPendentes/' + idDe(c)), metaObj(c, metaOver));
  await b.commit();               // atômico; .create falha se qualquer doc já existir
}
async function tenta(fn) { try { await fn(); return true; } catch (e) { return false; } }

// ═══ PERMISSÕES / VÍNCULO BILATERAL (modular writeBatch, atômico) ═══
await t('1. commit atômico do PAR válido (robô)', assertSucceeds(parBatch(robo, 'a', 'a')));
await t('2. só ARQUIVO (sem o metadado par) → negado', assertFails(setDoc(doc(robo, 'notaArquivos', idDe('b')), arqObj('b'))));
await t('3. só METADADO (sem o arquivo par) → negado', assertFails(setDoc(doc(robo, 'notasPendentes', idDe('c')), metaObj('c'))));
await t('4. hash divergente entre par → negado', assertFails(parBatch(robo, 'd', 'd', {}, { sha256: hex('9') })));
// 5. IDs divergentes (arquivo em e, metadado em f)
await t('5. IDs divergentes no par → negado', assertFails((() => { const bt = writeBatch(robo); bt.set(doc(robo, 'notaArquivos', idDe('e')), arqObj('e')); bt.set(doc(robo, 'notasPendentes', idDe('f')), metaObj('f')); return bt.commit(); })()));
await t('6. metadado apontando para arquivo ANTIGO de outra nota → negado', assertFails(parBatch(robo, 'g', 'g', {}, { arquivoId: idDe('a') })));
await t('6b. campos extras no par → negado', assertFails(parBatch(robo, 'k', 'k', {}, { extra: 'x' })));
// permissões básicas do robô
await t('7. robô NÃO lê', assertFails(getDoc(doc(robo, 'notasPendentes', idDe('a')))));
await t('7b. robô NÃO atualiza (retry ingênuo via update é bloqueado)', assertFails(setDoc(doc(robo, 'notasPendentes', idDe('a')), metaObj('a'))));
await t('7c. robô NÃO grava em tx', assertFails(setDoc(doc(robo, 'tx', 't1'), { valor: 1 })));
await t('8. usuário comum NÃO cria na fila', assertFails(parBatch(comum, 'z', 'z')));
await t('8b. não autenticado NÃO cria na fila', assertFails(parBatch(anon, 'y', 'y')));
await t('9. sócio mantém ler/gravar (tx e notasPendentes)', assertSucceeds((async () => { await setDoc(doc(socio, 'tx', 't3'), { valor: 3 }); await getDoc(doc(socio, 'notasPendentes', idDe('a'))); })()));

// A4 (atomicidade das REGRAS): uma write inválida no par → batch REJEITADO,
// NADA persistido (nem órfão). Provado pelo SDK modular (rules).
await t('A4. par com metadado inválido → batch rejeitado (atômico)', assertFails(parBatch(robo, 's', 's', {}, { status: 'confirmada' })));
ok('A4. nada persistido — sem órfão', !(await existeParaSocio('notaArquivos', idDe('s'))) && !(await existeParaSocio('notasPendentes', idDe('s'))));

// ═══ ATOMICIDADE + IDEMPOTÊNCIA (create-only real, Admin SDK) ═══
// A1. par atômico via create() → sucesso
ok('A1. commit atômico do par (create-only) → sucesso', await tenta(() => criarParAdmin('r')));
// A2. retry IDÊNTICO → ALREADY_EXISTS → não duplica
ok('A2. retry idêntico → rejeitado (não duplica)', !(await tenta(() => criarParAdmin('r'))));
// A3. retry MESMO ID, CONTEÚDO DIFERENTE → rejeitado; conteúdo antigo preservado
const okA3 = !(await tenta(() => criarParAdmin('r', { dataBase64: 'ZZZZ' })));
const arqR = await adb.doc('notaArquivos/' + idDe('r')).get();
ok('A3. mesmo id/conteúdo diferente → rejeitado, conteúdo antigo intacto', okA3 && arqR.exists && arqR.data().dataBase64 === 'QUJDRA==');
// A5. falha de rede AMBÍGUA: 1º ok, ack "perdido", retry reconhece o par existente
const okP1 = await tenta(() => criarParAdmin('t'));
const okP2 = await tenta(() => criarParAdmin('t'));
const arqT = await adb.doc('notaArquivos/' + idDe('t')).get();
const metaT = await adb.doc('notasPendentes/' + idDe('t')).get();
ok('A5. rede ambígua: 1º ok, retry rejeitado, par único preservado', okP1 && !okP2 && arqT.exists && metaT.exists);
// A6. atomicidade do create: se UM já existe, o batch inteiro falha (o outro não é criado)
await adb.doc('notaArquivos/' + idDe('u')).create(arqObj('u'));   // pré-existe só o arquivo (cenário de teste)
ok('A6. create do par com um já existente → batch falha (atômico)', !(await tenta(() => criarParAdmin('u'))));
ok('A6. o metadado NÃO foi criado (atômico)', !(await adb.doc('notasPendentes/' + idDe('u')).get()).exists);
await adb.doc('notaArquivos/' + idDe('u')).delete();             // limpa o doc de teste

// A7. sem documento órfão após todos os cenários (arquivo ⟺ metadado)
const arqs = await adb.collection('notaArquivos').get();
const metas = await adb.collection('notasPendentes').get();
const idsArq = new Set(arqs.docs.map(d => d.id));
const idsMeta = new Set(metas.docs.map(d => d.id));
const orfaos = [...idsArq].filter(i => !idsMeta.has(i)).concat([...idsMeta].filter(i => !idsArq.has(i)));
ok('A7. nenhum documento órfão ao final (todo arquivo tem metadado e vice-versa)', orfaos.length === 0, 'orfaos=' + JSON.stringify(orfaos));

console.log(`\n=== EMULATOR: ${PASS} OK / ${FAIL} FAIL ===`);
await env.cleanup();
process.exit(FAIL ? 1 : 0);
