// ══════════════════════════════════════════════════════════════════════════
// DÍVIDA — estado derivado
//
// Nada do que esta camada calcula é armazenado. Saldo, parcelas pagas,
// atraso e capital na rua são SEMPRE recalculados a partir de três coisas
// imutáveis: os termos da dívida, a lista de pagamentos e a data de hoje.
//
// Isso é uma decisão de arquitetura, não preguiça. Guardar "saldo" como
// campo obriga a mantê-lo em dia a cada pagamento, edição e exclusão — e é
// exatamente aí que sistemas de cobrança começam a mentir. Derivando, um
// pagamento apagado corrige o saldo sozinho, sem migração e sem reconciliação.
//
// ALOCAÇÃO DE PAGAMENTOS (a regra que decide o resto):
//   · pagamentos são aplicados em ordem cronológica;
//   · um pagamento dirigido a uma parcela começa nela e, se sobrar, transborda
//     para as parcelas seguintes ainda abertas — nunca para as anteriores;
//   · um pagamento sem parcela indicada preenche da mais antiga em aberto para
//     a frente;
//   · o que sobrar depois da última parcela vira crédito do cliente.
// ══════════════════════════════════════════════════════════════════════════

import { montarCronograma } from './schedule.js';
import { ratear } from './money.js';
import { comparar, diferencaEmDias } from './dates.js';

/** Situações possíveis de uma parcela, na ordem de gravidade. */
export const SITUACAO = {
  ATRASADA: 'atrasada',
  HOJE: 'hoje',
  ABERTA: 'aberta',
  PAGA: 'paga',
};

/** Ordena pagamentos de forma estável: data, depois criação, depois id. */
function emOrdemCronologica(pagamentos) {
  return [...pagamentos].sort((a, b) => {
    const porData = comparar(a.data, b.data);
    if (porData !== 0) return porData;
    const porCriacao = (a.criadoEm || 0) - (b.criadoEm || 0);
    if (porCriacao !== 0) return porCriacao;
    return String(a.id).localeCompare(String(b.id));
  });
}

/**
 * Calcula o estado completo de uma dívida.
 *
 * @param {object} divida      termos da dívida (ver model.js)
 * @param {object[]} pagamentos pagamentos DESTA dívida
 * @param {string} hojeIso     data de referência, 'AAAA-MM-DD'
 */
export function estadoDaDivida(divida, pagamentos, hojeIso) {
  const cronograma = montarCronograma({
    baseCents: divida.baseCents,
    jurosPercentual: divida.jurosPercentual,
    periodicidade: divida.periodicidade,
    parcelas: divida.parcelas,
    primeiroVencimento: divida.primeiroVencimento,
  });

  const quantidade = cronograma.parcelas.length;
  const saldoDaParcela = cronograma.parcelas.map(p => p.valorCents);
  const pagoNaParcela = new Array(quantidade).fill(0);
  const quitadaEm = new Array(quantidade).fill(null);

  let recebidoCents = 0;
  let creditoCents = 0;

  for (const pagamento of emOrdemCronologica(pagamentos)) {
    const valor = Math.max(0, pagamento.valorCents | 0);
    if (valor === 0) continue;
    recebidoCents += valor;

    let resto = valor;
    let i = Number.isInteger(pagamento.parcelaNumero)
      ? Math.max(0, Math.min(quantidade - 1, pagamento.parcelaNumero - 1))
      : 0;

    while (resto > 0 && i < quantidade) {
      if (saldoDaParcela[i] > 0) {
        const usado = Math.min(resto, saldoDaParcela[i]);
        saldoDaParcela[i] -= usado;
        pagoNaParcela[i] += usado;
        resto -= usado;
        if (saldoDaParcela[i] === 0) quitadaEm[i] = pagamento.data;
      }
      i += 1;
    }
    creditoCents += resto;
  }

  const aplicadoCents = recebidoCents - creditoCents;
  const saldoCents = cronograma.totalCents - aplicadoCents;

  // Capital e juro são recuperados na mesma proporção em que compõem a dívida.
  // Não há regra de "primeiro o juro": o dinheiro que entra amortiza os dois
  // proporcionalmente, o que mantém "na rua" coerente em qualquer momento.
  const capitalRecuperadoCents = ratear(
    aplicadoCents, cronograma.baseCents, cronograma.totalCents, cronograma.baseCents
  );
  const capitalNaRuaCents = cronograma.baseCents - capitalRecuperadoCents;
  const jurosRecebidoCents = aplicadoCents - capitalRecuperadoCents;

  const parcelas = cronograma.parcelas.map((p, i) => {
    const restanteCents = saldoDaParcela[i];
    const paga = restanteCents === 0;
    const situacao = paga
      ? SITUACAO.PAGA
      : comparar(p.vencimento, hojeIso) < 0
        ? SITUACAO.ATRASADA
        : comparar(p.vencimento, hojeIso) === 0
          ? SITUACAO.HOJE
          : SITUACAO.ABERTA;

    return {
      numero: p.numero,
      vencimento: p.vencimento,
      valorCents: p.valorCents,
      pagoCents: pagoNaParcela[i],
      restanteCents,
      parcial: !paga && pagoNaParcela[i] > 0,
      situacao,
      quitadaEm: quitadaEm[i],
      diasDeAtraso: situacao === SITUACAO.ATRASADA ? diferencaEmDias(p.vencimento, hojeIso) : 0,
    };
  });

  const emAberto = parcelas.filter(p => p.situacao !== SITUACAO.PAGA);
  const atrasadas = parcelas.filter(p => p.situacao === SITUACAO.ATRASADA);
  const vencendoHoje = parcelas.filter(p => p.situacao === SITUACAO.HOJE);
  const pagas = parcelas.filter(p => p.situacao === SITUACAO.PAGA);

  const somar = (lista, campo) => lista.reduce((t, p) => t + p[campo], 0);

  const proxima = emAberto[0] || null;

  return {
    dividaId: divida.id,
    clienteId: divida.clienteId,
    cronograma,

    baseCents: cronograma.baseCents,
    jurosPercentual: cronograma.jurosPercentual,
    jurosCents: cronograma.jurosCents,
    totalCents: cronograma.totalCents,

    recebidoCents,
    aplicadoCents,
    creditoCents,
    saldoCents,

    capitalNaRuaCents,
    capitalRecuperadoCents,
    jurosRecebidoCents,
    jurosAReceberCents: cronograma.jurosCents - jurosRecebidoCents,

    atrasadoCents: somar(atrasadas, 'restanteCents'),
    venceHojeCents: somar(vencendoHoje, 'restanteCents'),

    parcelas,
    contagem: {
      total: quantidade,
      pagas: pagas.length,
      // "Pendentes" é tudo que ainda não foi quitado — as atrasadas são um
      // subconjunto dele, não uma categoria à parte.
      pendentes: emAberto.length,
      atrasadas: atrasadas.length,
    },

    proximaParcela: proxima,
    proximoVencimento: proxima ? proxima.vencimento : null,
    quitada: saldoCents === 0,
    emAtraso: atrasadas.length > 0,
    periodicidade: divida.periodicidade,
  };
}
