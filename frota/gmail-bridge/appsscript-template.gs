/**
 * TEMPLATE do Apps Script da ponte Gmail → fila do Lagos (Etapa 4).
 *
 * NÃO É PARA EXECUTAR AINDA. Sem segredos no código. Autentica como USUÁRIO
 * FINAL do Firebase Auth (o "robô"), então as Security Rules valem e limitam o
 * acesso à criação dos dois documentos da fila (notaArquivos + notasPendentes).
 *
 * Configuração (Script Properties — NUNCA no código):
 *   FIREBASE_API_KEY   (pode ser configuração/pública do projeto)
 *   FIREBASE_PROJECT_ID
 *   ROBO_EMAIL
 *   ROBO_SENHA         (senha do usuário-robô — só em Script Properties)
 *
 * Revogação do robô: no Firebase Console → Authentication → desabilitar/excluir
 * o usuário-robô, OU trocar a senha (e atualizar ROBO_SENHA), OU desligar a
 * regra de notasPendentes/notaArquivos. Efeito imediato: o robô deixa de gravar.
 */

var REMETENTE = 'appisca.nfe@gmail.com';
var DOC_MAX_SEGURO = 900000;   // espelha bridge.mjs / firestore.rules
var MAX_PDF_BYTES = 674232;

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
  if (resp.getResponseCode() !== 200) throw new Error('Falha de autenticação do robô.'); // sem detalhes sensíveis
  return JSON.parse(resp.getContentText()).idToken;                                        // não logar
}

function enderecoExato_(from) {
  var m = String(from || '').match(/<([^>]+)>/);
  return (m ? m[1] : String(from || '')).trim().toLowerCase();
}
function sha256Hex_(bytes) {
  var d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes);
  return d.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

/** Cria um documento com ID fixo. Idempotente: ALREADY_EXISTS conta como sucesso. */
function criarDoc_(projectId, idToken, colecao, docId, fields) {
  var url = 'https://firestore.googleapis.com/v1/projects/' + projectId +
    '/databases/(default)/documents/' + colecao + '?documentId=' + encodeURIComponent(docId);
  var resp = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + idToken },
    payload: JSON.stringify({ fields: fields })
  });
  var code = resp.getResponseCode();
  if (code === 200) return 'criado';
  if (code === 409) return 'ja_existe';           // idempotente
  throw new Error('Firestore create ' + colecao + ' HTTP ' + code); // sem token nos logs
}

// helpers de tipagem do REST do Firestore
function sVal_(s) { return { stringValue: String(s) }; }
function iVal_(n) { return { integerValue: String(n) }; }
function nVal_() { return { nullValue: null }; }
function mVal_(obj) { var f = {}; for (var k in obj) f[k] = obj[k]; return { mapValue: { fields: f } }; }

/** Ponto de entrada (gatilho por tempo, no futuro). NÃO executar ainda. */
function ingerirNotasDoPosto() {
  var p = props_();
  var projectId = p.getProperty('FIREBASE_PROJECT_ID');
  var idToken = obterIdToken_();

  // Busca conservadora; NÃO confia só no label (thread pode receber anexos novos).
  var query = 'from:' + REMETENTE + ' has:attachment filename:pdf newer_than:2d -label:lagos-ingerido';
  var threads = GmailApp.search(query, 0, 20);

  for (var t = 0; t < threads.length; t++) {
    var msgs = threads[t].getMessages();
    var threadOk = true;
    for (var i = 0; i < msgs.length; i++) {
      var msg = msgs[i];
      if (enderecoExato_(msg.getFrom()) !== REMETENTE) continue; // remetente EXATO
      var anexos = msg.getAttachments();
      for (var a = 0; a < anexos.length; a++) {
        var att = anexos[a];
        var mime = (att.getContentType() || '').toLowerCase();
        var nome = (att.getName() || '');
        var ehPdf = mime === 'application/pdf' || /\.pdf$/i.test(nome);
        if (!ehPdf) continue;                                  // XML e outros: ignorados
        var bytes = att.getBytes();
        var sha = sha256Hex_(bytes);
        var b64 = Utilities.base64Encode(bytes);
        var dataUrl = 'data:application/pdf;base64,' + b64;
        var tamanho = bytes.length;
        var docId = 'nfe-' + sha;

        // limite conservador (sem corte): pula o anexo grande, NÃO conclui o e-mail
        if (dataUrl.length > DOC_MAX_SEGURO || tamanho > MAX_PDF_BYTES) { threadOk = false; continue; }

        try {
          // ARQUIVO primeiro (o metadado exige que ele exista)
          criarDoc_(projectId, idToken, 'notaArquivos', docId, {
            notaPendenteId: sVal_(docId), sha256: sVal_(sha), mime: sVal_('application/pdf'),
            nome: sVal_(nome || 'nota.pdf'), tamanhoBytes: iVal_(tamanho),
            dataBase64: sVal_(dataUrl), criadoEm: iVal_(Date.now())
          });
          // METADADO leve (sem base64)
          criarDoc_(projectId, idToken, 'notasPendentes', docId, {
            status: sVal_('recebida'), origem: sVal_('email'), recebidoEm: iVal_(Date.now()),
            emailMessageId: sVal_(msg.getId()), emailFrom: sVal_(msg.getFrom()),
            emailAssunto: sVal_(msg.getSubject() || ''), sha256: sVal_(sha),
            lido: mVal_({}), arquivoId: sVal_(docId), tamanhoBytes: iVal_(tamanho),
            txId: nVal_(), motivoRejeicao: nVal_(), erroLeitura: nVal_()
          });
        } catch (e) {
          // se metadado OU arquivo falhar, NÃO marca o e-mail como concluído → retry
          threadOk = false;
        }
      }
    }
    // só marca a thread quando TUDO deu certo (retry seguro; idempotente por docId)
    if (threadOk) threads[t].addLabel(GmailApp.createLabel('lagos-ingerido'));
  }
}
