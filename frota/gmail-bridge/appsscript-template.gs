/**
 * TEMPLATE do Apps Script da ponte Gmail → fila do Lagos (Etapa 4 corretiva).
 *
 * NÃO É PARA EXECUTAR AINDA. Sem segredos no código. Autentica como USUÁRIO
 * FINAL do Firebase Auth (o "robô"); as Security Rules valem e limitam o acesso
 * à CRIAÇÃO ATÔMICA do par (notaArquivos + notasPendentes).
 *
 * Configuração (Script Properties — NUNCA no código):
 *   FIREBASE_API_KEY   (pode ser configuração/pública do projeto)
 *   FIREBASE_PROJECT_ID
 *   ROBO_EMAIL
 *   ROBO_SENHA         (senha do usuário-robô — só em Script Properties)
 *
 * Revogação do robô: Firebase Console → Authentication → desabilitar/excluir o
 * usuário-robô, OU trocar a senha (e atualizar ROBO_SENHA), OU desligar a regra
 * de notasPendentes/notaArquivos. Efeito imediato: o robô deixa de gravar.
 */

var REMETENTE = 'appisca.nfe@gmail.com';
var DOC_SIZE_MAX = 1000000;   // espelha bridge.mjs (margem sob 1 MiB)
var MAX_B64 = 999629;         // base64 CRU
var MAX_PDF_BYTES = 749721;   // PDF cru declarado

function props_() { return PropertiesService.getScriptProperties(); }

/** Autentica como o robô e devolve o idToken. NUNCA imprime token/senha. */
function obterIdToken_() {
  var p = props_();
  var apiKey = p.getProperty('FIREBASE_API_KEY');
  var email = p.getProperty('ROBO_EMAIL');
  var senha = p.getProperty('ROBO_SENHA');
  if (!apiKey || !email || !senha) throw new Error('Configuração ausente (Script Properties).');
  var resp = UrlFetchApp.fetch(
    'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + encodeURIComponent(apiKey),
    { method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      payload: JSON.stringify({ email: email, password: senha, returnSecureToken: true }) });
  if (resp.getResponseCode() !== 200) throw new Error('Falha de autenticação do robô.');   // sem detalhes sensíveis
  return JSON.parse(resp.getContentText()).idToken;                                          // não logar
}

function enderecoExato_(from) {
  var m = String(from || '').match(/<([^>]+)>/);
  return (m ? m[1] : String(from || '')).trim().toLowerCase();
}
function sha256Hex_(bytes) {
  var d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes);
  return d.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

// helpers de tipagem do REST do Firestore
function sVal_(s) { return { stringValue: String(s) }; }
function iVal_(n) { return { integerValue: String(n) }; }
function nVal_() { return { nullValue: null }; }
function mVal_(obj) { var f = {}; for (var k in obj) f[k] = obj[k]; return { mapValue: { fields: f } }; }
function docName_(projectId, coll, id) { return 'projects/' + projectId + '/databases/(default)/documents/' + coll + '/' + id; }

/**
 * Cria o PAR (arquivo + metadado) em UMA operação ATÔMICA (documents:commit),
 * com currentDocument.exists=false nos dois. Se qualquer parte falhar, NENHUMA
 * persiste. Retorna 'criado' | 'ja_existe' | lança em erro real.
 *
 * Idempotência SEM leitura: o id é 'nfe-<sha256(pdf)>' (endereçado por conteúdo)
 * e as regras exigem sha256 == hash do id. Logo, a EXISTÊNCIA de um id prova o
 * conteúdo — um FAILED_PRECONDITION nesse id é, com segurança, o MESMO par já
 * ingerido (conteúdo diferente ⇒ sha diferente ⇒ id diferente). O robô não
 * precisa (nem pode) ler para confirmar.
 */
function commitParAtomico_(projectId, idToken, docId, arqFields, metaFields) {
  var body = { writes: [
    { update: { name: docName_(projectId, 'notaArquivos', docId), fields: arqFields }, currentDocument: { exists: false } },
    { update: { name: docName_(projectId, 'notasPendentes', docId), fields: metaFields }, currentDocument: { exists: false } }
  ] };
  var resp = UrlFetchApp.fetch(
    'https://firestore.googleapis.com/v1/projects/' + projectId + '/databases/(default)/documents:commit',
    { method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + idToken }, payload: JSON.stringify(body) });   // token nunca é logado
  var code = resp.getResponseCode();
  if (code === 200) return 'criado';
  if (code === 400 || code === 409) return 'ja_existe';   // FAILED_PRECONDITION/ALREADY_EXISTS no id de conteúdo
  throw new Error('Firestore commit HTTP ' + code);
}

/** Ponto de entrada (gatilho por tempo, no futuro). NÃO executar ainda. */
function ingerirNotasDoPosto() {
  var p = props_();
  var projectId = p.getProperty('FIREBASE_PROJECT_ID');
  var idToken = obterIdToken_();

  // NÃO confia só no label da thread (ela pode receber anexos novos).
  var query = 'from:' + REMETENTE + ' has:attachment filename:pdf newer_than:2d -label:lagos-ingerido';
  var threads = GmailApp.search(query, 0, 20);

  for (var t = 0; t < threads.length; t++) {
    var msgs = threads[t].getMessages();
    var threadOk = true;
    for (var i = 0; i < msgs.length; i++) {
      var msg = msgs[i];
      if (enderecoExato_(msg.getFrom()) !== REMETENTE) continue;   // remetente EXATO
      var anexos = msg.getAttachments();
      for (var a = 0; a < anexos.length; a++) {
        var att = anexos[a];
        var mime = (att.getContentType() || '').toLowerCase();
        var nome = (att.getName() || '');
        if (!(mime === 'application/pdf' || /\.pdf$/i.test(nome))) continue;   // XML/outros ignorados

        var bytes = att.getBytes();
        var sha = sha256Hex_(bytes);
        var b64 = Utilities.base64Encode(bytes);   // base64 CRU (sem prefixo data:)
        var tamanho = bytes.length;
        var docId = 'nfe-' + sha;

        // limite conservador (sem corte): pula o anexo grande, NÃO conclui o e-mail
        if (b64.length > MAX_B64 || tamanho > MAX_PDF_BYTES) { threadOk = false; continue; }

        var arqFields = {
          notaPendenteId: sVal_(docId), sha256: sVal_(sha), mime: sVal_('application/pdf'),
          nome: sVal_(nome || 'nota.pdf'), tamanhoBytes: iVal_(tamanho),
          dataBase64: sVal_(b64), criadoEm: iVal_(Date.now())
        };
        var metaFields = {
          status: sVal_('recebida'), origem: sVal_('email'), recebidoEm: iVal_(Date.now()),
          emailMessageId: sVal_(msg.getId()), emailFrom: sVal_(msg.getFrom()),
          emailAssunto: sVal_(msg.getSubject() || ''), sha256: sVal_(sha),
          lido: mVal_({}), arquivoId: sVal_(docId), tamanhoBytes: iVal_(tamanho),
          txId: nVal_(), motivoRejeicao: nVal_(), erroLeitura: nVal_()
        };

        try {
          // 'criado' ou 'ja_existe' encerram ESTE anexo (idempotência por hash);
          // 'ja_existe' vem de FAILED_PRECONDITION e é seguro porque a criação é
          // atômica + endereçada por conteúdo (o par já existe por completo).
          commitParAtomico_(projectId, idToken, docId, arqFields, metaFields);
        } catch (e) {
          // ERRO REAL (rede/servidor): NÃO conclui este PDF nem marca a mensagem;
          // log DIAGNOSTICÁVEL sem segredos (só docId + mensagem de erro). O robô
          // NÃO tenta reparar por gravação isolada (as regras bilaterais negam).
          Logger.log('ingestao falhou docId=' + docId + ' msg=' + msg.getId() + ' erro=' + e.message);
          threadOk = false;
        }
      }
    }
    // Marca por MENSAGEM/PDF: a thread só é marcada quando TODOS os PDFs de TODAS
    // as mensagens foram tratados (criados ou já-ingeridos). Se ALGUM PDF falhou,
    // a thread NÃO é marcada e o próximo ciclo reprocessa com segurança
    // (idempotente por hash). O label é só otimização; a fonte de verdade é o
    // armazenamento atômico por conteúdo.
    if (threadOk) threads[t].addLabel(GmailApp.createLabel('lagos-ingerido'));
  }
}
