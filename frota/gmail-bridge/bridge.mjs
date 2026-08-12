// Ponte Gmail → fila "Notas para revisar" — LÓGICA PURA e testável.
//
// Este módulo NÃO acessa o Gmail nem o Firestore. Ele recebe representações
// SINTÉTICAS de mensagens e devolve os itens que iriam para a fila (payload
// compatível com novaNotaPendente()), além das marcações e ignorados.
//
// O sha256 é INJETADO (dependência) para o mesmo código rodar:
//   - no Node (testes): crypto.createHash('sha256')
//   - no Apps Script (futuro): Utilities.computeDigest(SHA_256, bytes)
//
// Nada aqui é carregado pelo app publicado (fica fora de index.html).

export const REMETENTE_ESPERADO = 'appisca.nfe@gmail.com';

export const LIMITES = {
  // Cada documento do Firestore cabe em ~1 MiB (contando TODOS os campos).
  firestoreDocBytes: 1048576,
  // base64 infla ~4/3; reservamos margem para email*/lido/sha etc. no mesmo doc.
  // 700 KB de PDF cru ≈ 933 KB em base64 → cabe com folga em 1 MiB.
  maxPdfBytes: 700 * 1024,
};

// ── Remetente ────────────────────────────────────────────────────────────
// Extrai o endereço REAL do cabeçalho From ("Nome <email>" ou "email").
export function enderecoDoFrom(from) {
  const s = String(from == null ? '' : from).trim();
  const m = s.match(/<([^>]+)>/);
  return (m ? m[1] : s).trim().toLowerCase();
}
// Remetente EXATO: compara só o endereço real. O nome de exibição é ignorado,
// então "appisca.nfe@gmail.com <golpe@x.com>" NÃO é aceito (o endereço é golpe@x.com).
// Um e-mail encaminhado tem From do encaminhador → também não confere.
export function remetenteConfere(from, esperado = REMETENTE_ESPERADO) {
  return enderecoDoFrom(from) === String(esperado || '').toLowerCase();
}

// ── Anexos ───────────────────────────────────────────────────────────────
export function ehPdf(att) {
  const mime = String(att && att.mimeType || '').toLowerCase();
  const nome = String(att && att.fileName || '').toLowerCase();
  if (mime === 'application/pdf') return true;
  if (mime === '' && nome.endsWith('.pdf')) return true;   // tolera mime ausente
  return false;
}
export function ehXml(att) {
  const mime = String(att && att.mimeType || '').toLowerCase();
  const nome = String(att && att.fileName || '').toLowerCase();
  return mime.includes('xml') || nome.endsWith('.xml');
}

// ── Identidade ───────────────────────────────────────────────────────────
// Identidade do DOCUMENTO (endereçada por conteúdo): dois e-mails com o MESMO
// PDF geram o mesmo docId → reconhecido como o mesmo documento (sem duplicar).
export function idDocumento(sha256hex) { return 'nfe-' + sha256hex; }
// Referência POR ANEXO/MENSAGEM (marcação no Gmail): usa messageId + sha256.
export function refAnexo(messageId, sha256hex) { return String(messageId) + '::' + sha256hex; }

// ── Tamanho ──────────────────────────────────────────────────────────────
export function base64Bytes(pdfBytes) { return Math.ceil(pdfBytes / 3) * 4; }
export function pdfExcedeLimite(pdfBytes, limites = LIMITES) { return pdfBytes > limites.maxPdfBytes; }
export function dataUrlPdf(base64) { return 'data:application/pdf;base64,' + base64; }

// ── Payload compatível com novaNotaPendente() ────────────────────────────
export function montarPayload(msg, att, sha256hex, docId) {
  return {
    id: docId,                       // idempotente (conteúdo)
    status: 'recebida',              // e-mail entra como "recebida"; o app lê/revisa
    origem: 'email',
    anexoNome: att.fileName || 'nota.pdf',
    anexoMime: 'application/pdf',
    anexoData: dataUrlPdf(att.base64),
    emailMessageId: msg.messageId,
    emailFrom: msg.from,
    emailAssunto: msg.subject || '',
    lido: {},                        // sem OCR no servidor: o app preenche na revisão
    txId: null, motivoRejeicao: null, erroLeitura: null,
    sha256: sha256hex,               // metadado de ingestão
    ingestadoEm: msg.recebidoEm || null,
  };
}

// ── Processamento de UMA mensagem ────────────────────────────────────────
// opts: { sha256(bytes)->hex, jaConhecidos:Set<docId>, limites }
export function processarMensagem(msg, opts = {}) {
  const sha256 = opts.sha256;
  const jaConhecidos = opts.jaConhecidos || new Set();
  const limites = opts.limites || LIMITES;
  const res = { itens: [], reconhecidas: [], ignoradas: [], marcacoes: [] };

  if (!remetenteConfere(msg.from)) {
    res.ignoradas.push({ messageId: msg.messageId, motivo: 'remetente_invalido', from: msg.from });
    return res;
  }
  // O XML pode vir junto; ele é IGNORADO para a fila, sem impedir o e-mail.
  const pdfs = (msg.attachments || []).filter(ehPdf);
  if (!pdfs.length) {
    res.ignoradas.push({ messageId: msg.messageId, motivo: 'sem_pdf' });
    return res;
  }
  const vistosNestaMsg = new Set();
  for (const att of pdfs) {
    const bytesLen = att.size != null ? att.size : (att.bytes ? att.bytes.length : 0);
    if (pdfExcedeLimite(bytesLen, limites)) {
      // rejeição CONTROLADA — nunca corta silenciosamente
      res.ignoradas.push({ messageId: msg.messageId, anexo: att.fileName, motivo: 'pdf_grande', bytes: bytesLen, limite: limites.maxPdfBytes });
      continue;
    }
    const sha = sha256(att.bytes);
    const docId = idDocumento(sha);
    res.marcacoes.push({ messageId: msg.messageId, anexo: att.fileName, sha256: sha, ref: refAnexo(msg.messageId, sha), docId });
    if (jaConhecidos.has(docId) || vistosNestaMsg.has(docId)) {
      res.reconhecidas.push({ messageId: msg.messageId, docId, sha256: sha, motivo: 'documento_ja_ingerido' });
      continue;   // reenvio/reprocesso do mesmo PDF → não duplica
    }
    vistosNestaMsg.add(docId);
    res.itens.push(montarPayload(msg, att, sha, docId));
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
