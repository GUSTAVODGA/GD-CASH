// Ponte Gmail → fila "Notas para revisar" — LÓGICA PURA e testável.
//
// Não acessa Gmail nem Firestore. Recebe representações SINTÉTICAS de mensagens
// e produz, por PDF, o PAR de documentos que iriam para o Firestore:
//   - metadado  → coleção notasPendentes/{id}  (leve, SEM base64)
//   - arquivo   → coleção notaArquivos/{id}     (só o PDF + metadados do arquivo)
//
// sha256 é INJETADO para o mesmo código rodar no Node (crypto) e no Apps Script
// (Utilities.computeDigest). Nada aqui é carregado pelo app publicado.

export const REMETENTE_ESPERADO = 'appisca.nfe@gmail.com';

// Limite CONSERVADOR calculado sobre o tamanho serializado COMPLETO do
// documento de arquivo (base64 + campos), com margem larga abaixo do teto de
// 1 MiB do Firestore. Nada de usar o máximo teórico.
export const ARQ_LIM = {
  firestoreDocMax: 1048576,   // 1 MiB por documento (teto do Firestore)
  docMaxSeguro: 900000,       // margem de ~145 KiB abaixo do teto
};
// maxPdf derivado (informativo): base64 infla ~4/3; reservamos campos.
export function maxPdfBytes(lim = ARQ_LIM) { return Math.floor((lim.docMaxSeguro - 1024) / 4) * 3; }
export function base64Bytes(pdfBytes) { return Math.ceil(pdfBytes / 3) * 4; }
function utf8Len(s) { return new TextEncoder().encode(s).length; }
// tamanho serializado real do documento (UTF-8 de JSON.stringify).
export function tamanhoDocSerializado(doc) { return utf8Len(JSON.stringify(doc)); }
export function arquivoDocDentroDoLimite(doc, lim = ARQ_LIM) { return tamanhoDocSerializado(doc) <= lim.docMaxSeguro; }

// ── Remetente ────────────────────────────────────────────────────────────
export function enderecoDoFrom(from) {
  const s = String(from == null ? '' : from).trim();
  const m = s.match(/<([^>]+)>/);
  return (m ? m[1] : s).trim().toLowerCase();
}
// Remetente EXATO: só o endereço real conta. Nome de exibição é ignorado, então
// "appisca.nfe@gmail.com <golpe@x.com>" NÃO é aceito; encaminhado também não.
export function remetenteConfere(from, esperado = REMETENTE_ESPERADO) {
  return enderecoDoFrom(from) === String(esperado || '').toLowerCase();
}

// ── Anexos ───────────────────────────────────────────────────────────────
export function ehPdf(att) {
  const mime = String(att && att.mimeType || '').toLowerCase();
  const nome = String(att && att.fileName || '').toLowerCase();
  return mime === 'application/pdf' || (mime === '' && nome.endsWith('.pdf'));
}
export function ehXml(att) {
  const mime = String(att && att.mimeType || '').toLowerCase();
  const nome = String(att && att.fileName || '').toLowerCase();
  return mime.includes('xml') || nome.endsWith('.xml');
}

// ── Identidade ───────────────────────────────────────────────────────────
export function idDocumento(sha256hex) { return 'nfe-' + sha256hex; }              // endereçada por conteúdo
export function refAnexo(messageId, sha256hex) { return String(messageId) + '::' + sha256hex; }

export function dataUrlPdf(base64) { return 'data:application/pdf;base64,' + base64; }

// ── Documentos (par metadado + arquivo) ──────────────────────────────────
export function montarMetadado(msg, att, sha256hex, docId, tamanhoBytes) {
  return {
    status: 'recebida',            // estado inicial permitido
    origem: 'email',
    recebidoEm: msg.recebidoEm || null,
    emailMessageId: msg.messageId,
    emailFrom: msg.from,
    emailAssunto: msg.subject || '',
    sha256: sha256hex,
    lido: {},                      // sem OCR no servidor; o app preenche na revisão
    arquivoId: docId,              // vínculo coerente (mesmo id do arquivo)
    tamanhoBytes: tamanhoBytes,
    txId: null,                    // o robô NUNCA escolhe txId
    motivoRejeicao: null,
    erroLeitura: null,
  };
}
export function montarArquivo(msg, att, sha256hex, docId, tamanhoBytes) {
  return {
    notaPendenteId: docId,         // vínculo coerente (mesmo id do metadado)
    sha256: sha256hex,
    mime: 'application/pdf',
    nome: att.fileName || 'nota.pdf',
    tamanhoBytes: tamanhoBytes,
    dataBase64: att.base64,
    criadoEm: msg.recebidoEm || null,
  };
}

// ── Processamento de UMA mensagem ────────────────────────────────────────
// opts: { sha256(bytes)->hex, jaConhecidos:Set<docId>, limites }
export function processarMensagem(msg, opts = {}) {
  const sha256 = opts.sha256;
  const jaConhecidos = opts.jaConhecidos || new Set();
  const lim = opts.limites || ARQ_LIM;
  const res = { itens: [], reconhecidas: [], ignoradas: [], marcacoes: [] };

  if (!remetenteConfere(msg.from)) {
    res.ignoradas.push({ messageId: msg.messageId, motivo: 'remetente_invalido', from: msg.from });
    return res;
  }
  const pdfs = (msg.attachments || []).filter(ehPdf);   // XML é ignorado, sem barrar o e-mail
  if (!pdfs.length) {
    res.ignoradas.push({ messageId: msg.messageId, motivo: 'sem_pdf' });
    return res;
  }
  const vistosNestaMsg = new Set();
  for (const att of pdfs) {
    const tamanho = att.size != null ? att.size : (att.bytes ? att.bytes.length : 0);
    const sha = sha256(att.bytes);
    const docId = idDocumento(sha);
    const arquivo = montarArquivo(msg, att, sha, docId, tamanho);
    // rejeição CONTROLADA pelo tamanho serializado COMPLETO — nunca corta.
    if (!arquivoDocDentroDoLimite(arquivo, lim)) {
      res.ignoradas.push({ messageId: msg.messageId, anexo: att.fileName, motivo: 'arquivo_grande', bytes: tamanho, docBytes: tamanhoDocSerializado(arquivo), limite: lim.docMaxSeguro });
      continue;
    }
    res.marcacoes.push({ messageId: msg.messageId, anexo: att.fileName, sha256: sha, ref: refAnexo(msg.messageId, sha), docId });
    if (jaConhecidos.has(docId) || vistosNestaMsg.has(docId)) {
      res.reconhecidas.push({ messageId: msg.messageId, docId, sha256: sha, motivo: 'documento_ja_ingerido' });
      continue;   // reenvio/reprocesso do mesmo PDF → não duplica
    }
    vistosNestaMsg.add(docId);
    res.itens.push({ id: docId, metadado: montarMetadado(msg, att, sha, docId, tamanho), arquivo });
  }
  return res;
}

// ── Processamento de um LOTE (deduplica também ENTRE mensagens) ───────────
export function processarLote(mensagens, opts = {}) {
  const jaConhecidos = new Set(opts.jaConhecidos ? [...opts.jaConhecidos] : []);
  const out = { itens: [], reconhecidas: [], ignoradas: [], marcacoes: [] };
  for (const msg of (mensagens || [])) {
    const r = processarMensagem(msg, { ...opts, jaConhecidos });
    out.itens.push(...r.itens);
    out.reconhecidas.push(...r.reconhecidas);
    out.ignoradas.push(...r.ignoradas);
    out.marcacoes.push(...r.marcacoes);
    r.itens.forEach(it => jaConhecidos.add(it.id));
  }
  return out;
}
