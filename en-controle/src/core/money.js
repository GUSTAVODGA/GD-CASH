// ══════════════════════════════════════════════════════════════════════════
// DINHEIRO — aritmética em centavos inteiros
//
// Nenhum valor monetário do EN Controle existe como número quebrado. Tudo é
// centavo inteiro, e toda operação que poderia gerar fração termina numa
// divisão inteira explícita com o resto tratado à mão. É o que garante a
// invariante mais importante do produto: a soma das parcelas fecha
// EXATAMENTE com o total da dívida, sem sobra nem falta de um centavo.
//
// Ponto flutuante só aparece na fronteira (o que o usuário digita, o que a
// tela mostra). Entre uma coisa e outra, é inteiro.
// ══════════════════════════════════════════════════════════════════════════

/** Erro de domínio: entrada inválida vinda do usuário ou de dado corrompido. */
export class ErroDeValor extends Error {}

function exigirInteiro(valor, nome) {
  if (!Number.isInteger(valor)) {
    throw new ErroDeValor(`${nome} precisa ser um inteiro em centavos (recebido: ${valor}).`);
  }
  return valor;
}

function exigirSeguro(valor, contexto) {
  if (!Number.isSafeInteger(valor)) {
    throw new ErroDeValor(
      `${contexto} estourou a faixa de inteiro seguro do JavaScript. ` +
      `Os valores envolvidos são grandes demais para serem calculados sem perda.`
    );
  }
  return valor;
}

/**
 * Divide `numerador` por `denominador` arredondando meio para cima, sem
 * passar por ponto flutuante. Os dois precisam ser inteiros; o denominador,
 * positivo.
 */
export function dividirArredondando(numerador, denominador) {
  exigirInteiro(numerador, 'numerador');
  exigirInteiro(denominador, 'denominador');
  if (denominador <= 0) throw new ErroDeValor('Denominador precisa ser positivo.');

  const negativo = numerador < 0;
  const abs = Math.abs(numerador);
  const inteiro = Math.floor(abs / denominador);
  const resto = abs - inteiro * denominador;
  // Meio para cima, em módulo: 2,5 → 3 e −2,5 → −3.
  const ajustado = resto * 2 >= denominador ? inteiro + 1 : inteiro;
  return negativo ? -ajustado : ajustado;
}

// ── juros ─────────────────────────────────────────────────────────────────

/**
 * Converte um percentual de juros em pontos-base (centésimos de por cento).
 * 20 → 2000; 12,5 → 1250. Duas casas decimais é o limite deliberado: é o que
 * o formulário oferece e é o suficiente para o domínio.
 */
export function jurosEmPontosBase(percentual) {
  if (typeof percentual !== 'number' || !Number.isFinite(percentual)) {
    throw new ErroDeValor(`Percentual de juros inválido: ${percentual}.`);
  }
  if (percentual < 0) throw new ErroDeValor('Percentual de juros não pode ser negativo.');
  if (percentual > 1000) throw new ErroDeValor('Percentual de juros acima do limite aceito (1000%).');
  return Math.round(percentual * 100);
}

/**
 * Aplica juros simples sobre o valor base, uma única vez.
 *
 * total = base × (1 + percentual/100), arredondado ao centavo.
 *
 * É juro simples e único de propósito: é assim que a operação funciona no
 * papel que este sistema substitui. Não há capitalização por período.
 */
export function aplicarJuros(baseCents, percentual) {
  exigirInteiro(baseCents, 'Valor base');
  if (baseCents < 0) throw new ErroDeValor('Valor base não pode ser negativo.');

  const pb = jurosEmPontosBase(percentual);
  const produto = exigirSeguro(baseCents * (10000 + pb), 'O cálculo de juros');
  return dividirArredondando(produto, 10000);
}

/** Parte que é juro: total − base. */
export function jurosDe(baseCents, totalCents) {
  return exigirInteiro(totalCents, 'Total') - exigirInteiro(baseCents, 'Valor base');
}

// ── parcelamento ──────────────────────────────────────────────────────────

/**
 * Reparte `totalCents` em `quantidade` parcelas cujo somatório é exatamente
 * `totalCents`.
 *
 * A diferença de arredondamento (de 0 a quantidade−1 centavos) vai inteira
 * para a ÚLTIMA parcela. É a convenção do produto, e é única: assim as
 * parcelas correntes são todas iguais — o número que o cliente memoriza — e
 * só a última fecha a conta.
 *
 * @returns {number[]} vetor de centavos, com `quantidade` posições
 */
export function repartirParcelas(totalCents, quantidade) {
  exigirInteiro(totalCents, 'Total');
  exigirInteiro(quantidade, 'Quantidade de parcelas');
  if (totalCents < 0) throw new ErroDeValor('Total não pode ser negativo.');
  if (quantidade < 1) throw new ErroDeValor('A dívida precisa de ao menos uma parcela.');

  const corrente = Math.floor(totalCents / quantidade);
  const residuo = totalCents - corrente * quantidade;

  const parcelas = new Array(quantidade).fill(corrente);
  parcelas[quantidade - 1] = corrente + residuo;
  return parcelas;
}

/**
 * Rateia `parteCents` de um todo, mantendo a proporção `numerador/denominador`
 * e sem nunca ultrapassar o teto informado. Usado para separar quanto de um
 * recebimento amortizou capital e quanto foi juro.
 */
export function ratear(parteCents, numerador, denominador, teto) {
  exigirInteiro(parteCents, 'Parte');
  if (denominador <= 0) return 0;
  const produto = exigirSeguro(parteCents * numerador, 'O rateio');
  const bruto = dividirArredondando(produto, denominador);
  return Math.max(0, Math.min(teto, bruto));
}

// ── fronteira: texto ⇄ centavos ───────────────────────────────────────────

const FORMATADOR = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 123456 → "1.234,56" (sem o símbolo). */
export function formatarNumero(cents) {
  exigirInteiro(cents, 'Valor');
  return FORMATADOR.format(cents / 100);
}

/** 123456 → "R$ 1.234,56". Negativos saem como "− R$ 1.234,56". */
export function formatarReais(cents) {
  exigirInteiro(cents, 'Valor');
  const sinal = cents < 0 ? '− ' : '';
  return `${sinal}R$ ${FORMATADOR.format(Math.abs(cents) / 100)}`;
}

/**
 * Lê o que o usuário digitou e devolve centavos.
 *
 * Aceita "1.234,56", "1234,56", "1234.56", "1234" e "R$ 1.234,56". A regra de
 * desempate entre ponto e vírgula: o ÚLTIMO separador que aparecer com duas
 * casas depois dele é o decimal; o resto é separador de milhar.
 *
 * @returns {number|null} centavos, ou null se não houver número legível
 */
export function lerValor(texto) {
  if (typeof texto === 'number') return Number.isFinite(texto) ? Math.round(texto * 100) : null;
  if (typeof texto !== 'string') return null;

  const limpo = texto.replace(/[^\d.,-]/g, '').trim();
  if (!limpo || !/\d/.test(limpo)) return null;

  const negativo = limpo.startsWith('-');
  const corpo = limpo.replace(/-/g, '');

  const ultimaVirgula = corpo.lastIndexOf(',');
  const ultimoPonto = corpo.lastIndexOf('.');
  const posSeparador = Math.max(ultimaVirgula, ultimoPonto);

  let inteiros = corpo;
  let decimais = '';

  // Só é decimal se houver 1 ou 2 dígitos depois do separador. "1.234" é mil
  // duzentos e trinta e quatro, não um e vinte e três centavos.
  if (posSeparador >= 0) {
    const cauda = corpo.slice(posSeparador + 1);
    if (cauda.length > 0 && cauda.length <= 2 && /^\d+$/.test(cauda)) {
      inteiros = corpo.slice(0, posSeparador);
      decimais = cauda;
    }
  }

  const digitosInteiros = inteiros.replace(/\D/g, '');
  const centavos = Number(digitosInteiros || '0') * 100 + Number(decimais.padEnd(2, '0') || '0');
  if (!Number.isSafeInteger(centavos)) return null;
  return negativo ? -centavos : centavos;
}

/** Formata percentual sem casas inúteis: 20 → "20%", 12.5 → "12,5%". */
export function formatarPercentual(percentual) {
  const texto = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(percentual);
  return `${texto}%`;
}
