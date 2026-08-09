// ══════════════════════════════════════════════════════════════════════════
// RELÓGIO E ALEATORIEDADE DETERMINÍSTICOS (tier unitário)
//
// O app lê o relógio em 44 pontos (`new Date()`) e 26 (`Date.now()`), e toda a
// aba Mês/Semana deriva de `todayStr()`, `weekDates()` e `monthDates()`. Sem
// congelar o relógio, qualquer asserção sobre esses módulos vira função do dia
// em que a suíte roda — foi exatamente isso que tornou os antigos diagnósticos
// de Mês inúteis como gate.
//
// A única fonte de não-determinismo do app além do relógio é `Math.random()`,
// usada num único ponto (`uid()`). Congelando os dois, o app fica integralmente
// determinístico.
//
// CONVENÇÃO DE FUSO: os instantes são declarados SEM timezone (ex.:
// '2026-03-31T12:00:00'), portanto interpretados no fuso local do runner, e
// sempre ao MEIO-DIA. Isso mantém a data civil idêntica em qualquer TZ, então a
// suíte não depende de variável de ambiente TZ nem falha em outra máquina.
// ══════════════════════════════════════════════════════════════════════════

const RealDate = Date;

/** Data congelada: `new Date()` e `Date.now()` devolvem sempre o mesmo instante. */
export function makeFrozenDate(instanteLocal) {
  const fixo = new RealDate(instanteLocal).getTime();
  if (Number.isNaN(fixo)) {
    throw new TypeError(`Instante inválido para o relógio congelado: ${instanteLocal}`);
  }

  class FrozenDate extends RealDate {
    constructor(...args) {
      // Só o construtor SEM argumentos é congelado. `new Date(2026, 2, 31)` e
      // `new Date('2026-03-31T12:00:00')` seguem com o comportamento real —
      // o app depende disso para montar calendários.
      if (args.length === 0) super(fixo);
      else super(...args);
    }
    static now() { return fixo; }
  }
  FrozenDate.parse = RealDate.parse;
  FrozenDate.UTC = RealDate.UTC;

  return FrozenDate;
}

/** PRNG determinístico (mulberry32): mesma semente, mesma sequência. */
export function makeSeededRandom(seed = 1) {
  let a = seed >>> 0;
  return function random() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Instantes de borda usados pelas suítes de calendário ──
// Declarados aqui para que o mesmo conjunto de bordas seja reutilizado e para
// que qualquer suíte nova herde a cobertura sem reinventar datas.
export const INSTANTES = {
  diaComum:        '2026-05-14T12:00:00', // quinta-feira comum, mês de 31 dias
  fimDeMes31:      '2026-03-31T12:00:00', // último dia de um mês de 31
  fimDeMes30:      '2026-04-30T12:00:00', // último dia de um mês de 30
  viradaDeAno:     '2026-12-31T12:00:00', // 31/12
  primeiroDoAno:   '2027-01-01T12:00:00', // 01/01
  fevereiroComum:  '2027-02-28T12:00:00', // fevereiro de 28 dias (2027 não é bissexto)
  bissexto29Fev:   '2028-02-29T12:00:00', // 29/02 em ano bissexto
  bissexto01Mar:   '2028-03-01T12:00:00', // dia seguinte ao 29/02
};
