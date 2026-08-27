// ══════════════════════════════════════════════════════════════════════════
// CRONOGRAMA — de "R$ 2.000 a 20% em 10 vezes" para dez parcelas datadas
//
// Este é o coração do produto. Se ele erra, tudo erra: o cliente cobra o dia
// errado, o saldo não fecha, o caixa mente.
//
// Duas invariantes valem sempre, e existem testes só para elas:
//
//   1. A soma das parcelas é EXATAMENTE o total da dívida.
//   2. Toda data é derivada da PRIMEIRA parcela, com deslocamento próprio —
//      nunca da parcela anterior. Sem cadeia, sem deriva acumulada, e o dia do
//      mês volta a 31 depois de um fevereiro.
// ══════════════════════════════════════════════════════════════════════════

import { aplicarJuros, jurosDe, repartirParcelas, ErroDeValor } from './money.js';
import { somarDias, somarMeses, dataValida, ErroDeData } from './dates.js';

/**
 * As periodicidades previstas. `passo` é a função que leva a primeira data até
 * a n-ésima; recebe sempre o índice a partir do zero.
 */
export const PERIODICIDADES = {
  semanal: {
    id: 'semanal',
    rotulo: 'Semanal',
    descricao: 'a cada 7 dias',
    avancar: (primeira, i) => somarDias(primeira, 7 * i),
  },
  quinzenal: {
    id: 'quinzenal',
    rotulo: 'Quinzenal',
    // Quinzena aqui é intervalo real de 14 dias — não "dia 1 e dia 15", que
    // produziria intervalos desiguais de 14 e 16 dias. A escolha é deliberada
    // e é a que casa com semanal e mensal na mesma escada.
    descricao: 'a cada 14 dias',
    avancar: (primeira, i) => somarDias(primeira, 14 * i),
  },
  mensal: {
    id: 'mensal',
    rotulo: 'Mensal',
    descricao: 'todo mês, no mesmo dia',
    avancar: (primeira, i) => somarMeses(primeira, i),
  },
};

export const LISTA_PERIODICIDADES = Object.values(PERIODICIDADES);

/** Atalhos de juros oferecidos no formulário. Qualquer outro valor é aceito. */
export const JUROS_SUGERIDOS = [10, 15, 20];

export const MAX_PARCELAS = 120;

/** A data de vencimento da parcela de índice `i` (0 = primeira). */
export function vencimentoNoIndice(primeiroVencimento, periodicidade, i) {
  const p = PERIODICIDADES[periodicidade];
  if (!p) throw new ErroDeData(`Periodicidade desconhecida: "${periodicidade}".`);
  return p.avancar(primeiroVencimento, i);
}

/**
 * Monta o cronograma completo de uma dívida.
 *
 * @param {object} entrada
 * @param {number} entrada.baseCents            valor emprestado, em centavos
 * @param {number} entrada.jurosPercentual      percentual aplicado uma vez sobre a base
 * @param {string} entrada.periodicidade        'semanal' | 'quinzenal' | 'mensal'
 * @param {number} entrada.parcelas             quantidade de parcelas
 * @param {string} entrada.primeiroVencimento   'AAAA-MM-DD'
 *
 * @returns {{
 *   baseCents: number, jurosPercentual: number, jurosCents: number, totalCents: number,
 *   parcelas: Array<{numero:number, vencimento:string, valorCents:number}>,
 *   valorParcelaCents: number, ultimaParcelaCents: number, parcelasIguais: boolean,
 *   primeiroVencimento: string, ultimoVencimento: string, periodicidade: string
 * }}
 */
export function montarCronograma({
  baseCents,
  jurosPercentual,
  periodicidade,
  parcelas,
  primeiroVencimento,
}) {
  if (!Number.isInteger(baseCents) || baseCents <= 0) {
    throw new ErroDeValor('Informe um valor base maior que zero.');
  }
  if (!PERIODICIDADES[periodicidade]) {
    throw new ErroDeData(`Periodicidade desconhecida: "${periodicidade}".`);
  }
  if (!Number.isInteger(parcelas) || parcelas < 1) {
    throw new ErroDeValor('A dívida precisa de ao menos uma parcela.');
  }
  if (parcelas > MAX_PARCELAS) {
    throw new ErroDeValor(`Número de parcelas acima do limite (${MAX_PARCELAS}).`);
  }
  if (!dataValida(primeiroVencimento)) {
    throw new ErroDeData('Informe a data do primeiro vencimento.');
  }

  const totalCents = aplicarJuros(baseCents, jurosPercentual);
  const valores = repartirParcelas(totalCents, parcelas);

  const lista = valores.map((valorCents, i) => ({
    numero: i + 1,
    vencimento: vencimentoNoIndice(primeiroVencimento, periodicidade, i),
    valorCents,
  }));

  return {
    baseCents,
    jurosPercentual,
    jurosCents: jurosDe(baseCents, totalCents),
    totalCents,
    parcelas: lista,
    valorParcelaCents: valores[0],
    ultimaParcelaCents: valores[valores.length - 1],
    parcelasIguais: valores[0] === valores[valores.length - 1],
    primeiroVencimento,
    ultimoVencimento: lista[lista.length - 1].vencimento,
    periodicidade,
  };
}

/** Rótulo curto da periodicidade, para a interface. */
export function rotuloPeriodicidade(id) {
  return PERIODICIDADES[id] ? PERIODICIDADES[id].rotulo : id;
}
