// ══════════════════════════════════════════════════════════════════════════
// PANORAMA — os quatro números da operação, e a agenda do dia
//
// Os quatro conceitos NÃO são sinônimos e nunca devem ser calculados um a
// partir do outro por atalho:
//
//   EM CAIXA   dinheiro que está com os sócios agora.
//              aportes − retiradas − capital emprestado + tudo que foi recebido.
//              Cai quando uma dívida nasce (o dinheiro saiu) e sobe a cada
//              pagamento. Pode ser negativo enquanto o capital de origem não
//              tiver sido registrado como aporte.
//
//   NA RUA     capital ainda vinculado às dívidas abertas. É PRINCIPAL, sem
//              juro nenhum: é o dinheiro que saiu do bolso e ainda não voltou.
//              Em caixa + na rua = o patrimônio da operação.
//
//   A RECEBER  saldo total que ainda deve entrar: principal + juros das
//              parcelas não quitadas. É sempre ≥ "na rua"; a diferença entre
//              os dois é exatamente o lucro ainda não realizado.
//
//   ATRASADO   a fatia de "a receber" cujo vencimento já passou. É subconjunto
//              de "a receber", não uma quinta grandeza somável às outras.
// ══════════════════════════════════════════════════════════════════════════

import { estadoDaDivida, SITUACAO } from './debt.js';
import { comparar } from './dates.js';

export const TIPO_CAIXA = {
  APORTE: 'aporte',
  RETIRADA: 'retirada',
};

/**
 * Consolida todo o estado da operação em uma data de referência.
 *
 * @param {{clientes:object[], dividas:object[], pagamentos:object[], caixa:object[]}} dados
 * @param {string} hojeIso
 */
export function panorama(dados, hojeIso) {
  const pagamentosPorDivida = agruparPor(dados.pagamentos || [], p => p.dividaId);

  const estados = (dados.dividas || []).map(divida =>
    estadoDaDivida(divida, pagamentosPorDivida.get(divida.id) || [], hojeIso)
  );
  const estadoPorDivida = new Map(estados.map(e => [e.dividaId, e]));

  // ── dinheiro ────────────────────────────────────────────────────────────
  const movimentos = dados.caixa || [];
  const aportesCents = somarSe(movimentos, m => m.tipo === TIPO_CAIXA.APORTE, m => m.valorCents);
  const retiradasCents = somarSe(movimentos, m => m.tipo === TIPO_CAIXA.RETIRADA, m => m.valorCents);

  const emprestadoCents = estados.reduce((t, e) => t + e.baseCents, 0);
  const recebidoCents = estados.reduce((t, e) => t + e.recebidoCents, 0);

  const emCaixaCents = aportesCents - retiradasCents - emprestadoCents + recebidoCents;
  const naRuaCents = estados.reduce((t, e) => t + e.capitalNaRuaCents, 0);
  const aReceberCents = estados.reduce((t, e) => t + e.saldoCents, 0);
  const atrasadoCents = estados.reduce((t, e) => t + e.atrasadoCents, 0);
  const venceHojeCents = estados.reduce((t, e) => t + e.venceHojeCents, 0);

  // ── agenda operacional ──────────────────────────────────────────────────
  const nomePorCliente = new Map((dados.clientes || []).map(c => [c.id, c.nome]));
  const itens = [];
  for (const estado of estados) {
    for (const parcela of estado.parcelas) {
      if (parcela.situacao === SITUACAO.PAGA) continue;
      itens.push({
        dividaId: estado.dividaId,
        clienteId: estado.clienteId,
        clienteNome: nomePorCliente.get(estado.clienteId) || 'Cliente removido',
        numero: parcela.numero,
        totalParcelas: estado.contagem.total,
        vencimento: parcela.vencimento,
        valorCents: parcela.valorCents,
        restanteCents: parcela.restanteCents,
        parcial: parcela.parcial,
        situacao: parcela.situacao,
        diasDeAtraso: parcela.diasDeAtraso,
      });
    }
  }
  itens.sort((a, b) => comparar(a.vencimento, b.vencimento) || a.clienteNome.localeCompare(b.clienteNome, 'pt-BR'));

  const agenda = {
    atrasadas: itens.filter(i => i.situacao === SITUACAO.ATRASADA),
    hoje: itens.filter(i => i.situacao === SITUACAO.HOJE),
    proximas: itens.filter(i => i.situacao === SITUACAO.ABERTA),
  };

  return {
    hoje: hojeIso,

    emCaixaCents,
    naRuaCents,
    aReceberCents,
    atrasadoCents,
    venceHojeCents,

    aportesCents,
    retiradasCents,
    emprestadoCents,
    recebidoCents,
    jurosAReceberCents: estados.reduce((t, e) => t + e.jurosAReceberCents, 0),
    jurosRecebidoCents: estados.reduce((t, e) => t + e.jurosRecebidoCents, 0),

    estados,
    estadoPorDivida,
    agenda,

    contagem: {
      clientes: (dados.clientes || []).length,
      dividas: estados.length,
      dividasAbertas: estados.filter(e => !e.quitada).length,
      clientesEmAtraso: new Set(estados.filter(e => e.emAtraso).map(e => e.clienteId)).size,
    },
  };
}

/**
 * O recorte de um cliente dentro do panorama: suas dívidas, seus números e a
 * situação financeira que aparece na lista.
 */
export function estadoDoCliente(cliente, panoramaAtual) {
  const dividas = panoramaAtual.estados.filter(e => e.clienteId === cliente.id);

  const abertas = dividas.filter(e => !e.quitada);
  const emAtraso = dividas.some(e => e.emAtraso);

  const proximos = abertas
    .map(e => e.proximoVencimento)
    .filter(Boolean)
    .sort(comparar);

  let situacao;
  if (dividas.length === 0) situacao = 'sem-dividas';
  else if (emAtraso) situacao = 'atrasado';
  else if (abertas.length === 0) situacao = 'quitado';
  else situacao = 'em-dia';

  return {
    cliente,
    dividas,
    situacao,
    aReceberCents: dividas.reduce((t, e) => t + e.saldoCents, 0),
    atrasadoCents: dividas.reduce((t, e) => t + e.atrasadoCents, 0),
    naRuaCents: dividas.reduce((t, e) => t + e.capitalNaRuaCents, 0),
    totalCents: dividas.reduce((t, e) => t + e.totalCents, 0),
    recebidoCents: dividas.reduce((t, e) => t + e.recebidoCents, 0),
    proximoVencimento: proximos[0] || null,
    contagem: {
      dividas: dividas.length,
      abertas: abertas.length,
      quitadas: dividas.length - abertas.length,
      parcelasAtrasadas: dividas.reduce((t, e) => t + e.contagem.atrasadas, 0),
    },
  };
}

/** Rótulo e tom da situação financeira do cliente. */
export const SITUACAO_CLIENTE = {
  'atrasado': { rotulo: 'Em atraso', tom: 'atraso' },
  'em-dia': { rotulo: 'Em dia', tom: 'ativo' },
  'quitado': { rotulo: 'Quitado', tom: 'quitado' },
  'sem-dividas': { rotulo: 'Sem dívidas', tom: 'neutro' },
};

// ── utilidades ────────────────────────────────────────────────────────────

function agruparPor(lista, chave) {
  const mapa = new Map();
  for (const item of lista) {
    const k = chave(item);
    const atual = mapa.get(k);
    if (atual) atual.push(item);
    else mapa.set(k, [item]);
  }
  return mapa;
}

function somarSe(lista, filtro, valor) {
  return lista.reduce((t, item) => (filtro(item) ? t + valor(item) : t), 0);
}
