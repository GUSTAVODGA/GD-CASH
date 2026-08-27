// ══════════════════════════════════════════════════════════════════════════
// MODELO DE DADOS
//
// Quatro coleções, e só. A cadeia inteira do produto cabe nelas:
//
//   cliente → dívida → parcelas → pagamentos → caixa
//
// As PARCELAS não têm coleção própria de propósito: elas são função dos termos
// da dívida (valor, juros, periodicidade, quantidade, primeiro vencimento) e
// são recalculadas sempre. Gravá-las criaria duas verdades sobre a mesma coisa,
// e a hora em que elas discordassem seria a hora em que o sistema mentiria.
//
// O que se grava é só o que é FATO e não pode ser deduzido: quem é o cliente,
// quais foram os termos combinados, que dinheiro entrou e quando.
// ══════════════════════════════════════════════════════════════════════════

import { ErroDeValor } from './money.js';
import { dataValida, hoje, ErroDeData } from './dates.js';
import { PERIODICIDADES, MAX_PARCELAS } from './schedule.js';
import { TIPO_CAIXA } from './portfolio.js';

export const VERSAO_DADOS = 1;

/** Identificador curto, único e ordenável por criação. */
export function novoId(prefixo = 'id') {
  const tempo = Date.now().toString(36);
  const acaso = (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2))
    .replace(/-/g, '')
    .slice(0, 8);
  return `${prefixo}_${tempo}${acaso}`;
}

/** O estado inicial de uma operação vazia. */
export function estadoVazio() {
  return { versao: VERSAO_DADOS, clientes: [], dividas: [], pagamentos: [], caixa: [], exemplo: false };
}

// ── clientes ──────────────────────────────────────────────────────────────

export function criarCliente({ nome, telefone = '', endereco = '', observacoes = '' }) {
  const limpo = String(nome || '').trim();
  if (!limpo) throw new ErroDeValor('O cliente precisa de um nome.');

  return {
    id: novoId('cli'),
    nome: limpo,
    telefone: String(telefone || '').trim(),
    endereco: String(endereco || '').trim(),
    observacoes: String(observacoes || '').trim(),
    criadoEm: Date.now(),
  };
}

/** Só os campos editáveis; id e criadoEm são imutáveis. */
export function aplicarEdicaoCliente(cliente, campos) {
  const nome = campos.nome !== undefined ? String(campos.nome).trim() : cliente.nome;
  if (!nome) throw new ErroDeValor('O cliente precisa de um nome.');

  return {
    ...cliente,
    nome,
    telefone: campos.telefone !== undefined ? String(campos.telefone).trim() : cliente.telefone,
    endereco: campos.endereco !== undefined ? String(campos.endereco).trim() : cliente.endereco,
    observacoes: campos.observacoes !== undefined ? String(campos.observacoes).trim() : cliente.observacoes,
  };
}

// ── dívidas ───────────────────────────────────────────────────────────────

export function criarDivida({
  clienteId,
  baseCents,
  jurosPercentual,
  periodicidade,
  parcelas,
  primeiroVencimento,
  data = null,
  observacao = '',
}) {
  if (!clienteId) throw new ErroDeValor('Escolha o cliente da dívida.');
  if (!Number.isInteger(baseCents) || baseCents <= 0) {
    throw new ErroDeValor('Informe um valor maior que zero.');
  }
  if (typeof jurosPercentual !== 'number' || !Number.isFinite(jurosPercentual) || jurosPercentual < 0) {
    throw new ErroDeValor('Informe um percentual de juros válido.');
  }
  if (!PERIODICIDADES[periodicidade]) throw new ErroDeValor('Escolha a periodicidade.');
  if (!Number.isInteger(parcelas) || parcelas < 1 || parcelas > MAX_PARCELAS) {
    throw new ErroDeValor(`Informe de 1 a ${MAX_PARCELAS} parcelas.`);
  }
  if (!dataValida(primeiroVencimento)) throw new ErroDeData('Informe a data do primeiro vencimento.');

  // Data em que o capital saiu do caixa. Não entra em nenhum cálculo de saldo
  // — o caixa é um acumulado, não um extrato por período — mas é o que ordena
  // o empréstimo no histórico do caixa, e é um fato que só se registra na hora.
  const dataEmprestimo = data || hoje();
  if (!dataValida(dataEmprestimo)) throw new ErroDeData('Data do empréstimo inválida.');

  return {
    id: novoId('div'),
    clienteId,
    baseCents,
    jurosPercentual,
    periodicidade,
    parcelas,
    primeiroVencimento,
    data: dataEmprestimo,
    observacao: String(observacao || '').trim(),
    criadoEm: Date.now(),

    // ── costura para o futuro ────────────────────────────────────────────
    // Juntar uma dívida nova a uma existente vai ser modelado como SUBSTITUIÇÃO:
    // as antigas apontam para a nova em `substituidaPorId`, a nova lista as
    // origens em `origemDividaIds`, e nenhum histórico é apagado. Os campos já
    // existem e são preservados na gravação; nenhuma regra os usa ainda, e é
    // exatamente por isso que ligar essa funcionalidade depois não vai exigir
    // migração de dados.
    origemDividaIds: [],
    substituidaPorId: null,
  };
}

// ── pagamentos ────────────────────────────────────────────────────────────

export function criarPagamento({ dividaId, valorCents, data, parcelaNumero = null, observacao = '' }) {
  if (!dividaId) throw new ErroDeValor('Pagamento sem dívida de origem.');
  if (!Number.isInteger(valorCents) || valorCents <= 0) {
    throw new ErroDeValor('Informe um valor de pagamento maior que zero.');
  }
  const dataPagamento = data || hoje();
  if (!dataValida(dataPagamento)) throw new ErroDeData('Informe a data do pagamento.');

  return {
    id: novoId('pag'),
    dividaId,
    valorCents,
    data: dataPagamento,
    parcelaNumero: Number.isInteger(parcelaNumero) ? parcelaNumero : null,
    observacao: String(observacao || '').trim(),
    criadoEm: Date.now(),
  };
}

// ── caixa ─────────────────────────────────────────────────────────────────

export function criarMovimentoCaixa({ tipo, valorCents, data, observacao = '' }) {
  if (tipo !== TIPO_CAIXA.APORTE && tipo !== TIPO_CAIXA.RETIRADA) {
    throw new ErroDeValor('Movimento de caixa precisa ser aporte ou retirada.');
  }
  if (!Number.isInteger(valorCents) || valorCents <= 0) {
    throw new ErroDeValor('Informe um valor maior que zero.');
  }
  const dataMovimento = data || hoje();
  if (!dataValida(dataMovimento)) throw new ErroDeData('Informe a data do movimento.');

  return {
    id: novoId('cx'),
    tipo,
    valorCents,
    data: dataMovimento,
    observacao: String(observacao || '').trim(),
    criadoEm: Date.now(),
  };
}

// ── saneamento na leitura ─────────────────────────────────────────────────

/**
 * Devolve um estado íntegro a partir de qualquer coisa lida do armazenamento.
 *
 * Registros malformados são DESCARTADOS, não corrigidos por chute: um
 * pagamento sem dívida ou uma dívida com data inválida some em vez de
 * envenenar todos os cálculos que dependem dele. O que sobra é sempre
 * consistente — dívida sem cliente e pagamento sem dívida não passam.
 */
export function normalizar(bruto) {
  const vazio = estadoVazio();
  if (!bruto || typeof bruto !== 'object') return vazio;

  const clientes = arranjo(bruto.clientes)
    .filter(c => c && typeof c.id === 'string' && String(c.nome || '').trim())
    .map(c => ({
      id: c.id,
      nome: String(c.nome).trim(),
      telefone: String(c.telefone || '').trim(),
      endereco: String(c.endereco || '').trim(),
      observacoes: String(c.observacoes || '').trim(),
      criadoEm: Number(c.criadoEm) || 0,
    }));
  const idsDeCliente = new Set(clientes.map(c => c.id));

  const dividas = arranjo(bruto.dividas)
    .filter(d =>
      d && typeof d.id === 'string' &&
      idsDeCliente.has(d.clienteId) &&
      Number.isInteger(d.baseCents) && d.baseCents > 0 &&
      Number.isFinite(d.jurosPercentual) && d.jurosPercentual >= 0 &&
      PERIODICIDADES[d.periodicidade] &&
      Number.isInteger(d.parcelas) && d.parcelas >= 1 && d.parcelas <= MAX_PARCELAS &&
      dataValida(d.primeiroVencimento)
    )
    .map(d => ({
      id: d.id,
      clienteId: d.clienteId,
      baseCents: d.baseCents,
      jurosPercentual: d.jurosPercentual,
      periodicidade: d.periodicidade,
      parcelas: d.parcelas,
      primeiroVencimento: d.primeiroVencimento,
      // Dívida gravada antes deste campo existir cai no primeiro vencimento,
      // que é a melhor aproximação disponível da data do empréstimo.
      data: dataValida(d.data) ? d.data : d.primeiroVencimento,
      observacao: String(d.observacao || '').trim(),
      criadoEm: Number(d.criadoEm) || 0,
      origemDividaIds: arranjo(d.origemDividaIds).filter(x => typeof x === 'string'),
      substituidaPorId: typeof d.substituidaPorId === 'string' ? d.substituidaPorId : null,
    }));
  const idsDeDivida = new Set(dividas.map(d => d.id));

  const pagamentos = arranjo(bruto.pagamentos)
    .filter(p =>
      p && typeof p.id === 'string' &&
      idsDeDivida.has(p.dividaId) &&
      Number.isInteger(p.valorCents) && p.valorCents > 0 &&
      dataValida(p.data)
    )
    .map(p => ({
      id: p.id,
      dividaId: p.dividaId,
      valorCents: p.valorCents,
      data: p.data,
      parcelaNumero: Number.isInteger(p.parcelaNumero) ? p.parcelaNumero : null,
      observacao: String(p.observacao || '').trim(),
      criadoEm: Number(p.criadoEm) || 0,
    }));

  const caixa = arranjo(bruto.caixa)
    .filter(m =>
      m && typeof m.id === 'string' &&
      (m.tipo === TIPO_CAIXA.APORTE || m.tipo === TIPO_CAIXA.RETIRADA) &&
      Number.isInteger(m.valorCents) && m.valorCents > 0 &&
      dataValida(m.data)
    )
    .map(m => ({
      id: m.id,
      tipo: m.tipo,
      valorCents: m.valorCents,
      data: m.data,
      observacao: String(m.observacao || '').trim(),
      criadoEm: Number(m.criadoEm) || 0,
    }));

  return { versao: VERSAO_DADOS, clientes, dividas, pagamentos, caixa, exemplo: bruto.exemplo === true };
}

function arranjo(v) {
  return Array.isArray(v) ? v : [];
}

// ── apresentação de dados do cliente ──────────────────────────────────────

/** Formata telefone brasileiro quando reconhece o tamanho; senão devolve como veio. */
export function formatarTelefone(telefone) {
  const digitos = String(telefone || '').replace(/\D/g, '');
  if (digitos.length === 11) return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`;
  if (digitos.length === 10) return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 6)}-${digitos.slice(6)}`;
  return String(telefone || '').trim();
}

/** Iniciais para o avatar da lista: "João da Silva" → "JS". */
export function iniciais(nome) {
  const partes = String(nome || '').trim().split(/\s+/).filter(p => p.length > 1 || /\d/.test(p));
  if (partes.length === 0) return '?';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}
