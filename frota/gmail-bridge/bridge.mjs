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

// Limite CONSERVADOR calculado pela FÓRMULA REAL de tamanho do documento do
// Firestore (nome do doc + nomes de campo + valores + overhead), não por
// JSON.stringify. Fórmula oficial: string = bytes UTF-8 + 1; inteiro/timestamp
// = 8; null/bool = 1; mapa/array = 32 + itens; nome do doc = Σ(segmento+1) + 16;
// total = nomeDoc + Σ(campos) + 32.
export const ARQ_LIM = {
  firestoreDocMax: 1048576,   // 1 MiB por documento (teto do Firestore)
  docSizeMax: 1000000,        // margem de 48 576 bytes (~47,4 KiB) sob o teto
};
function utf8Len(s) { return new TextEncoder().encode(String(s)).length; }
function strSize(s) { return utf8Len(s) + 1; }
function valSize(v) {
  if (v === null || v === undefined) return 1;
  if (typeof v === 'boolean') return 1;
  if (typeof v === 'number') return 8;
  if (typeof v === 'string') return strSize(v);
  if (Array.isArray(v)) return 32 + v.reduce((s, x) => s + valSize(x), 0);
  if (typeof v === 'object') return 32 + Object.keys(v).reduce((s, k) => s + strSize(k) + valSize(v[k]), 0);
  return 0;
}
// tamanho REAL do documento no Firestore (bytes), incluindo o nome do documento.
export function firestoreDocSize(fields, docPath) {
  const nome = docPath.reduce((s, seg) => s + strSize(seg), 0) + 16;
  const campos = Object.keys(fields).reduce((s, k) => s + strSize(k) + valSize(fields[k]), 0);
  return nome + campos + 32;
}
export function tamanhoDocArquivoReal(arq, id) { return firestoreDocSize(arq, ['notaArquivos', id]); }
export function arquivoDocDentroDoLimite(arq, id, lim = ARQ_LIM) { return tamanhoDocArquivoReal(arq, id) <= lim.docSizeMax; }
// Tamanho do doc com dataBase64 vazio; um valor de comprimento L acrescenta
// exatamente L bytes ao total (strSize('')=1 → strSize(L)=L+1).
export function overheadSemBase64(id) { return tamanhoDocArquivoReal(montarArquivoBase(id), id); }
export function maxBase64Len(id = 'nfe-' + 'a'.repeat(64), lim = ARQ_LIM) { return lim.docSizeMax - overheadSemBase64(id); }
export function maxPdfBytes(id) { return Math.floor(maxBase64Len(id) * 3 / 4); }
export function base64Bytes(pdfBytes) { return Math.ceil(pdfBytes / 3) * 4; }
function montarArquivoBase(id) {
  return { notaPendenteId: id, sha256: 'a'.repeat(64), mime: 'application/pdf', nome: 'nota.pdf', tamanhoBytes: 999999, dataBase64: '', criadoEm: 1 };
}

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
    // rejeição CONTROLADA pelo tamanho REAL do documento no Firestore — nunca corta.
    if (!arquivoDocDentroDoLimite(arquivo, docId, lim)) {
      res.ignoradas.push({ messageId: msg.messageId, anexo: att.fileName, motivo: 'arquivo_grande', bytes: tamanho, docBytes: tamanhoDocArquivoReal(arquivo, docId), limite: lim.docSizeMax });
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
