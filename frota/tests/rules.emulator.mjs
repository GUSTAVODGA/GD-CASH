// Prova de permissões das regras propostas — roda DE VERDADE no Firestore
// Emulator (não é teste unitário de função pura).
//
// Como rodar (precisa de firebase-tools + @firebase/rules-unit-testing + firebase):
//   cd <pasta com firebase.json e node_modules>
//   firebase emulators:exec --only firestore --project lagos-test \
//     "node <caminho>/frota/tests/rules.emulator.mjs"
//
// As regras vêm de ../gmail-bridge/firestore.rules. Nada real é acessado.

import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.resolve(__dirname, '../gmail-bridge/firestore.rules'), 'utf8');

const env = await initializeTestEnvironment({ projectId: 'lagos-test', firestore: { rules } });
const robo = env.authenticatedContext('ROBO_NOTAS_UID').firestore();
const socio = env.authenticatedContext('socio-ygor', { email: 'lagosoperacional+ygor@gmail.com' }).firestore();
const comum = env.authenticatedContext('comum-1', { email: 'alguem@exemplo.com' }).firestore();
const anon = env.unauthenticatedContext().firestore();

let PASS = 0, FAIL = 0;
async function t(nome, promessa) { try { await promessa; PASS++; console.log('OK ✓ ' + nome); } catch (e) { FAIL++; console.log('*** FAIL *** ' + nome + ' | ' + (e && e.message || e)); } }

const hex = c => c.repeat(64);
const idDe = c => 'nfe-' + hex(c);
const arq = (c, over = {}) => Object.assign({ notaPendenteId: idDe(c), sha256: hex(c), mime: 'application/pdf', nome: 'nota.pdf', tamanhoBytes: 1000, dataBase64: 'QUJDRA==', criadoEm: 1 }, over);
const meta = (c, over = {}) => Object.assign({ status: 'recebida', origem: 'email', recebidoEm: 1, emailMessageId: 'm1', emailFrom: 'Posto <appisca.nfe@gmail.com>', emailAssunto: 'NFe', sha256: hex(c), lido: {}, arquivoId: idDe(c), tamanhoBytes: 1000, txId: null, motivoRejeicao: null, erroLeitura: null }, over);

// 1-2 robô cria arquivo e metadado válidos (arquivo primeiro)
await t('1. robô cria ARQUIVO válido', assertSucceeds(setDoc(doc(robo, 'notaArquivos', idDe('a')), arq('a'))));
await t('2. robô cria METADADO válido (vínculo coerente)', assertSucceeds(setDoc(doc(robo, 'notasPendentes', idDe('a')), meta('a'))));
// 3-5 robô não lê / não atualiza / não exclui
await t('3. robô NÃO lê', assertFails(getDoc(doc(robo, 'notasPendentes', idDe('a')))));
await t('4. robô NÃO atualiza', assertFails(updateDoc(doc(robo, 'notasPendentes', idDe('a')), { status: 'confirmada' })));
await t('5. robô NÃO exclui', assertFails(deleteDoc(doc(robo, 'notasPendentes', idDe('a')))));
// 6-7 robô não grava em tx / outras coleções
await t('6. robô NÃO grava em tx', assertFails(setDoc(doc(robo, 'tx', 't1'), { valor: 1 })));
await t('7a. robô NÃO grava em vehicles', assertFails(setDoc(doc(robo, 'vehicles', 'v1'), { nome: 'x' })));
await t('7b. robô NÃO grava em financiamentos', assertFails(setDoc(doc(robo, 'financiamentos', 'f1'), { credor: 'x' })));
await t('7c. robô NÃO grava em anexos', assertFails(setDoc(doc(robo, 'anexos', 'x1'), { data: 'x' })));
// 8 campo extra negado (arquivo existe para não falhar por vínculo)
await setDoc(doc(robo, 'notaArquivos', idDe('b')), arq('b')).catch(() => {});
await t('8. metadado com campo extra é NEGADO', assertFails(setDoc(doc(robo, 'notasPendentes', idDe('b')), meta('b', { extra: 'x' }))));
// 9 tamanho acima do limite negado (arquivo)
await t('9a. arquivo tamanhoBytes acima do limite NEGADO', assertFails(setDoc(doc(robo, 'notaArquivos', idDe('c')), arq('c', { tamanhoBytes: 674233 }))));
await t('9b. arquivo dataBase64 acima do limite NEGADO', assertFails(setDoc(doc(robo, 'notaArquivos', idDe('c')), arq('c', { dataBase64: 'A'.repeat(900001) }))));
// txId/estado confirmado na criação: negado
await setDoc(doc(robo, 'notaArquivos', idDe('g')), arq('g')).catch(() => {});
await t('9c. metadado com txId escolhido é NEGADO', assertFails(setDoc(doc(robo, 'notasPendentes', idDe('g')), meta('g', { txId: 'ntx_x' }))));
await t('9d. metadado com status confirmada é NEGADO', assertFails(setDoc(doc(robo, 'notasPendentes', idDe('g')), meta('g', { status: 'confirmada' }))));
// vínculo coerente: metadado sem arquivo correspondente / sha divergente
await t('9e. metadado sem arquivo correspondente é NEGADO', assertFails(setDoc(doc(robo, 'notasPendentes', idDe('h')), meta('h'))));
// 10 usuário comum não autorizado
await t('10. usuário comum NÃO cria na fila', assertFails(setDoc(doc(comum, 'notasPendentes', idDe('d')), meta('d'))));
await t('10b. usuário comum NÃO grava em tx', assertFails(setDoc(doc(comum, 'tx', 't2'), { valor: 1 })));
// 11 sócio mantém comportamento atual
await t('11a. sócio grava em tx', assertSucceeds(setDoc(doc(socio, 'tx', 't3'), { valor: 3 })));
await t('11b. sócio lê notasPendentes', assertSucceeds(getDoc(doc(socio, 'notasPendentes', idDe('a')))));
await t('11c. sócio atualiza notasPendentes (confirmar/rejeitar)', assertSucceeds(updateDoc(doc(socio, 'notasPendentes', idDe('a')), { status: 'precisa_revisao' })));
// 12 não autenticado
await t('12. não autenticado é NEGADO', assertFails(setDoc(doc(anon, 'notasPendentes', idDe('e')), meta('e'))));

console.log(`\n=== EMULATOR: ${PASS} OK / ${FAIL} FAIL ===`);
await env.cleanup();
process.exit(FAIL ? 1 : 0);
