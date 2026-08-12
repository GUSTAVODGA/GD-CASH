// Prova REAL no Firestore Emulator — permissões, ATOMICIDADE e idempotência.
// Rules de ../gmail-bridge/firestore.rules. Nada real é acessado.
//
//   firebase emulators:exec --only firestore --project lagos-test \
//     "node <repo>/frota/tests/rules.emulator.mjs"

import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.resolve(__dirname, '../gmail-bridge/firestore.rules'), 'utf8');
const PROJ = 'lagos-test';
const HOST = process.env.FIRESTORE_EMULATOR_HOST; // ex.: 127.0.0.1:8080

const env = await initializeTestEnvironment({ projectId: PROJ, firestore: { rules } });
const ROBO_UID = 'ROBO_UID_NAO_CONFIGURADO';   // = sentinela do ruleset (fail-closed)
const robo = env.authenticatedContext(ROBO_UID).firestore();
// sócios (e-mails sanitizados nos relatórios; aqui são os reais para provar acesso)
const SOCIOS = ['lagosoperacional+luispaulo@gmail.com', 'lagosoperacional+ygor@gmail.com', 'lagosoperacional+thadeu@gmail.com'];
const socio = env.authenticatedContext('socio-ygor', { email: SOCIOS[1] }).firestore();
const comum = env.authenticatedContext('comum-1', { email: 'alguem@exemplo.com' }).firestore();
const anon = env.unauthenticatedContext().firestore();
// robô com UID REAL (diferente do sentinela) — simula "UID ausente/incorreto"
const roboUidReal = env.authenticatedContext('uid-real-do-robo-28chars-xxxx', { email: 'appisca.nfe@gmail.com' }).firestore();
// usuário com e-mail parecido com o de um sócio (mas não exato)
const quaseSocio = env.authenticatedContext('quase', { email: 'lagosoperacional+ygor@gmail.com.evil.com' }).firestore();

let PASS = 0, FAIL = 0;
async function t(nome, promessa) { try { await promessa; PASS++; console.log('OK ✓ ' + nome); } catch (e) { FAIL++; console.log('*** FAIL *** ' + nome + ' | ' + (e && e.message || e)); } }
function ok(nome, cond, extra = '') { if (cond) { PASS++; console.log('OK ✓ ' + nome); } else { FAIL++; console.log('*** FAIL *** ' + nome + (extra ? ' | ' + extra : '')); } }

const hex = c => c.repeat(64);
const idDe = c => 'nfe-' + hex(c);
const agora = () => Date.now();   // dentro da janela de tsOk
const arqObj = (c, over = {}) => Object.assign({ notaPendenteId: idDe(c), sha256: hex(c), mime: 'application/pdf', nome: 'nota.pdf', tamanhoBytes: 1000, dataBase64: 'QUJDRA==', criadoEm: agora() }, over);
const metaObj = (c, over = {}) => Object.assign({ status: 'recebida', origem: 'email', recebidoEm: agora(), emailMessageId: 'm1', emailFrom: 'Posto <appisca.nfe@gmail.com>', emailAssunto: 'NFe', sha256: hex(c), lido: {}, arquivoId: idDe(c), tamanhoBytes: 1000, txId: null, motivoRejeicao: null, erroLeitura: null }, over);

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

// ═══ ETAPA 5: UID fail-closed, endurecimento de payload, regressão ═══
// UID incorreto/ausente (sentinela não trocado) nega o robô — mesmo com e-mail do posto
await t('E1. robô com UID real ≠ sentinela → NEGADO (fail-closed)', assertFails(parBatch(roboUidReal, 'a', 'a')));
await t('E1b. e-mail do posto mas UID errado → NEGADO', assertFails(setDoc(doc(roboUidReal, 'notaArquivos', idDe('b2')), arqObj('b2'))));
// display name / e-mail parecido com sócio (não exato) → negado
await t('E2. e-mail parecido com sócio (não exato) → NEGADO', assertFails(getDoc(doc(quaseSocio, 'tx', 't3'))));
await t('E2b. e-mail parecido com sócio não grava na fila', assertFails(parBatch(quaseSocio, 'w', 'w')));
// robô com UID correto mas PAYLOAD inválido (endurecimento) → negado
await t('E3. lido não vazio → NEGADO', assertFails(parBatch(robo, 'l1', 'l1', {}, { lido: { valor: 10 } })));
await t('E3b. emailFrom gigante → NEGADO', assertFails(parBatch(robo, 'l2', 'l2', {}, { emailFrom: 'x'.repeat(400) })));
await t('E3c. emailAssunto gigante → NEGADO', assertFails(parBatch(robo, 'l3', 'l3', {}, { emailAssunto: 'y'.repeat(600) })));
await t('E3d. timestamp arbitrário (recebidoEm) → NEGADO', assertFails(parBatch(robo, 'l4', 'l4', {}, { recebidoEm: 1 })));
await t('E3e. txId escolhido pelo robô → NEGADO', assertFails(parBatch(robo, 'l5', 'l5', {}, { txId: 'ntx_x' })));
await t('E3f. anexoTxId (campo de confirmação) → NEGADO', assertFails(parBatch(robo, 'l6', 'l6', {}, { anexoTxId: 'ntx_x' })));
await t('E3g. tamanhoBytes acima do limite → NEGADO', assertFails(parBatch(robo, 'l7', 'l7', { tamanhoBytes: 749722 }, { tamanhoBytes: 749722 })));
// robô bloqueado em READ/UPDATE/DELETE e FORA das duas coleções
await t('E4. robô NÃO exclui', assertFails(deleteDoc(doc(robo, 'notasPendentes', idDe('a')))));
await t('E4b. robô NÃO grava em vehicles', assertFails(setDoc(doc(robo, 'vehicles', 'v1'), { nome: 'x' })));
await t('E4c. robô NÃO grava em kmlog', assertFails(setDoc(doc(robo, 'kmlog', 'k1'), { km: 1 })));
await t('E4d. robô NÃO grava em anexos', assertFails(setDoc(doc(robo, 'anexos', 'x1'), { data: 'x' })));
await t('E4e. robô NÃO grava em financiamentos', assertFails(setDoc(doc(robo, 'financiamentos', 'f1'), { credor: 'x' })));
// cada SÓCIO mantém leitura e escrita atuais (sem regressão)
for (let i = 0; i < SOCIOS.length; i++) {
  const s = env.authenticatedContext('socio' + i, { email: SOCIOS[i] }).firestore();
  await t('E5. sócio ' + (i + 1) + ' lê/grava tx, vehicles, kmlog, anexos, financiamentos e notasPendentes', assertSucceeds((async () => {
    for (const c of ['tx', 'vehicles', 'kmlog', 'anexos', 'financiamentos']) { await setDoc(doc(s, c, 'sc' + i + c), { x: 1 }); await getDoc(doc(s, c, 'sc' + i + c)); }
    await getDoc(doc(s, 'notasPendentes', idDe('a'))); await setDoc(doc(s, 'notasPendentes', idDe('a')), Object.assign(metaObj('a'), { status: 'precisa_revisao' }));
  })()));
}
// comum e anônimo continuam negados em tudo
await t('E6. usuário comum NÃO grava em tx (regressão)', assertFails(setDoc(doc(comum, 'tx', 'tc'), { valor: 1 })));
await t('E6b. não autenticado NÃO lê tx (regressão)', assertFails(getDoc(doc(anon, 'tx', 't3'))));

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
