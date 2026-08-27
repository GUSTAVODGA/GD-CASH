// ══════════════════════════════════════════════════════════════════════════
// DATAS — calendário civil, sem fuso horário e sem `Date` na aritmética
//
// Uma data de vencimento é um fato do calendário: "5 de março de 2026". Não é
// um instante, não tem hora e não deveria mudar porque o celular está em outro
// fuso ou porque o horário de verão entrou. Por isso este módulo representa
// data como a string 'AAAA-MM-DD' e faz toda a aritmética sobre inteiros do
// calendário proléptico gregoriano — nunca somando milissegundos.
//
// O objeto `Date` do JavaScript aparece em um único lugar: `hoje()`, para
// perguntar ao relógio local que dia é. Dali em diante, é string e inteiro.
//
// REGRA DO MÊS: avançar um mês é avançar no calendário, não somar 30 dias.
// 31/01 + 1 mês é 28/02 (ou 29/02 em ano bissexto), e + 2 meses é 31/03 —
// e não 28/03. Isso só funciona porque toda data da série é derivada da
// PRIMEIRA, com o dia original preservado como âncora, em vez de derivada da
// anterior. Derivar em cadeia perderia o dia 31 no primeiro fevereiro e nunca
// mais o recuperaria.
// ══════════════════════════════════════════════════════════════════════════

/** Erro de domínio: data inválida ou fora do calendário. */
export class ErroDeData extends Error {}

const PADRAO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Verdadeiro para anos bissextos do calendário gregoriano. */
export function bissexto(ano) {
  return (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;
}

/** Quantidade de dias do mês (mês de 1 a 12). */
export function diasNoMes(ano, mes) {
  if (mes < 1 || mes > 12) throw new ErroDeData(`Mês fora da faixa: ${mes}.`);
  if (mes === 2) return bissexto(ano) ? 29 : 28;
  return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mes - 1];
}

/** Decompõe 'AAAA-MM-DD' validando contra o calendário real. */
export function partes(iso) {
  if (typeof iso !== 'string') throw new ErroDeData(`Data inválida: ${iso}.`);
  const m = PADRAO.exec(iso);
  if (!m) throw new ErroDeData(`Data fora do formato AAAA-MM-DD: "${iso}".`);

  const ano = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);

  if (mes < 1 || mes > 12) throw new ErroDeData(`Mês inexistente em "${iso}".`);
  if (dia < 1 || dia > diasNoMes(ano, mes)) throw new ErroDeData(`Dia inexistente em "${iso}".`);
  return { ano, mes, dia };
}

/** Verdadeiro se `iso` é uma data válida no formato esperado. */
export function dataValida(iso) {
  try {
    partes(iso);
    return true;
  } catch {
    return false;
  }
}

/** Compõe 'AAAA-MM-DD' a partir dos componentes, com zero à esquerda. */
export function montar(ano, mes, dia) {
  const mm = String(mes).padStart(2, '0');
  const dd = String(dia).padStart(2, '0');
  return `${String(ano).padStart(4, '0')}-${mm}-${dd}`;
}

// ── conversão data ⇄ número de dias ───────────────────────────────────────
// Algoritmo de Howard Hinnant (days_from_civil / civil_from_days): exato para
// qualquer data do calendário proléptico gregoriano, só com inteiros. Dia 0 é
// 1970-01-01.

/** 'AAAA-MM-DD' → número de dias desde 1970-01-01. */
export function emDias(iso) {
  const { ano, mes, dia } = partes(iso);
  const a = ano - (mes <= 2 ? 1 : 0);
  const era = Math.floor(a / 400);
  const anoDaEra = a - era * 400;
  const diaDoAno = Math.floor((153 * (mes + (mes > 2 ? -3 : 9)) + 2) / 5) + dia - 1;
  const diaDaEra = anoDaEra * 365 + Math.floor(anoDaEra / 4) - Math.floor(anoDaEra / 100) + diaDoAno;
  return era * 146097 + diaDaEra - 719468;
}

/** Número de dias desde 1970-01-01 → 'AAAA-MM-DD'. */
export function deDias(dias) {
  const z = dias + 719468;
  const era = Math.floor(z / 146097);
  const diaDaEra = z - era * 146097;
  const anoDaEra = Math.floor(
    (diaDaEra - Math.floor(diaDaEra / 1460) + Math.floor(diaDaEra / 36524) - Math.floor(diaDaEra / 146096)) / 365
  );
  const a = anoDaEra + era * 400;
  const diaDoAno = diaDaEra - (365 * anoDaEra + Math.floor(anoDaEra / 4) - Math.floor(anoDaEra / 100));
  const mp = Math.floor((5 * diaDoAno + 2) / 153);
  const dia = diaDoAno - Math.floor((153 * mp + 2) / 5) + 1;
  const mes = mp + (mp < 10 ? 3 : -9);
  return montar(a + (mes <= 2 ? 1 : 0), mes, dia);
}

// ── aritmética ────────────────────────────────────────────────────────────

/** Soma (ou subtrai) dias corridos. Semanas reais nascem daqui. */
export function somarDias(iso, dias) {
  if (!Number.isInteger(dias)) throw new ErroDeData(`Quantidade de dias inválida: ${dias}.`);
  return deDias(emDias(iso) + dias);
}

/**
 * Soma meses de calendário, preservando o dia sempre que ele existir no mês
 * de destino e grudando no último dia do mês quando não existir.
 *
 * 31/01 +1 → 28/02 · 31/01 +2 → 31/03 · 29/02 +12 → 28/02 do ano seguinte.
 */
export function somarMeses(iso, meses) {
  if (!Number.isInteger(meses)) throw new ErroDeData(`Quantidade de meses inválida: ${meses}.`);
  const { ano, mes, dia } = partes(iso);

  const total = ano * 12 + (mes - 1) + meses;
  const anoDestino = Math.floor(total / 12);
  const mesDestino = total - anoDestino * 12 + 1;

  return montar(anoDestino, mesDestino, Math.min(dia, diasNoMes(anoDestino, mesDestino)));
}

/** −1, 0 ou 1. Comparação lexicográfica basta no formato AAAA-MM-DD. */
export function comparar(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Dias de `de` até `ate` (positivo se `ate` está no futuro). */
export function diferencaEmDias(de, ate) {
  return emDias(ate) - emDias(de);
}

// ── relógio ───────────────────────────────────────────────────────────────

/**
 * A data civil de hoje, no fuso do aparelho. Único ponto do módulo que
 * consulta o relógio — e recebe o `Date` por parâmetro para que os testes
 * possam congelar o tempo sem truque global.
 */
export function hoje(agora = new Date()) {
  return montar(agora.getFullYear(), agora.getMonth() + 1, agora.getDate());
}

// ── apresentação ──────────────────────────────────────────────────────────

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];
const DIAS_SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/** '2026-03-05' → '05/03/2026'. */
export function formatarData(iso) {
  const { ano, mes, dia } = partes(iso);
  return `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${ano}`;
}

/** '2026-03-05' → '05 mar'. Para listas, onde o ano costuma ser ruído. */
export function formatarDataCurta(iso) {
  const { mes, dia } = partes(iso);
  return `${String(dia).padStart(2, '0')} ${MESES_CURTOS[mes - 1]}`;
}

/** '2026-03-05' → '5 de março de 2026'. */
export function formatarDataExtenso(iso) {
  const { ano, mes, dia } = partes(iso);
  return `${dia} de ${MESES[mes - 1]} de ${ano}`;
}

/** Dia da semana da data ('quinta'). Derivado do número de dias, sem `Date`. */
export function diaDaSemana(iso) {
  // 1970-01-01 foi uma quinta-feira (índice 4 em DIAS_SEMANA).
  const indice = ((emDias(iso) + 4) % 7 + 7) % 7;
  return DIAS_SEMANA[indice];
}

/**
 * Distância em linguagem de gente, sempre relativa a `referencia`.
 * 'hoje', 'amanhã', 'ontem', 'em 3 dias', 'há 12 dias'.
 */
export function distanciaEmPalavras(iso, referencia) {
  const dias = diferencaEmDias(referencia, iso);
  if (dias === 0) return 'hoje';
  if (dias === 1) return 'amanhã';
  if (dias === -1) return 'ontem';
  if (dias > 0) return `em ${dias} dias`;
  return `há ${Math.abs(dias)} dias`;
}
