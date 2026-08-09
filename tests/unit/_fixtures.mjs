// ══════════════════════════════════════════════════════════════════════════
// FIXTURES SINTÉTICOS
//
// REGRA INEGOCIÁVEL: este repositório é PÚBLICO e servido pelo GitHub Pages.
// Nenhum dado pessoal entra aqui — sem nomes de pessoas, sem credores reais,
// sem placas, sem modelos de veículo reais, sem valores copiados de dados de
// produção. Nomes são genéricos ("Veículo Teste", "Banco Teste") e os números
// são escolhidos para exercitar a matemática, não para retratar ninguém.
//
// Quando um fixture reproduz um bug histórico, ele reproduz a ARITMÉTICA do
// bug (ex.: total que não é múltiplo da parcela), nunca os dados originais.
// ══════════════════════════════════════════════════════════════════════════

/** Estado mínimo: todas as coleções que os motores leem, vazias. */
export function baseVazia() {
  return {
    platforms: [],
    dailyIncome: {},
    incomeItems: [],
    expenses: [],
    expCats: [],
    fixedExpenses: [],
    fixedPayments: [],
    debts: [],
    debtPayments: [],
    patrimonios: [],
    vehicles: [],
    goals: [],
    reminders: [],
    pendencias: [],
    emergency: { target: 0, moves: [] },
    catBudgets: {},
  };
}

// ── Cenário de naturezas: uma saída de cada tipo + entradas de cada origem ──
// Serve às suítes de caixa × consumo. Datas fixas, dentro de março/2026.
export const PERIODO_NATUREZAS = ['2026-03-10', '2026-03-11', '2026-03-12'];

export function cenarioNaturezas() {
  const d = baseVazia();
  d.platforms = [{ id: 'plat-teste', name: 'Plataforma Teste' }];
  d.dailyIncome = { '2026-03-10': { 'plat-teste': 300 } };
  d.incomeItems = [
    // receita operacional paga (entra no caixa e no denominador da razão)
    { id: 'inc-1', date: '2026-03-11', platformId: 'plat-teste', amount: 200, status: 'paid' },
    // receita pendente (NÃO entra no caixa)
    { id: 'inc-2', date: '2026-03-11', platformId: 'plat-teste', amount: 999, status: 'pending' },
    // venda de patrimônio: entra no caixa, fora da receita operacional
    { id: 'inc-3', date: '2026-03-12', platformId: null, amount: 5000, status: 'paid', meta: { source: 'asset-sale' } },
    // fora do período
    { id: 'inc-4', date: '2026-04-01', platformId: 'plat-teste', amount: 777, status: 'paid' },
  ];
  d.expenses = [
    { id: 'exp-1', date: '2026-03-10', amount: 50, category: 'Categoria A' },
    { id: 'exp-2', date: '2026-03-10', amount: 30, category: 'Categoria A' },
    { id: 'exp-3', date: '2026-03-11', amount: 20, category: '' },                                        // sem categoria
    { id: 'exp-4', date: '2026-03-11', amount: 8000, category: 'Categoria B', meta: { nature: 'asset-acquisition' } },
    { id: 'exp-5', date: '2026-03-12', amount: 200, category: 'Categoria C', meta: { source: 'debt' } },
    { id: 'exp-6', date: '2026-03-12', amount: 100, category: 'Categoria D', meta: { source: 'fixed-payment' } },
    { id: 'exp-7', date: '2026-04-01', amount: 999, category: 'Categoria A' },                            // fora do período
  ];
  return d;
}

// ── Dívida com parcela residual ──
// Reproduz a aritmética do bug corrigido em produção: o total cadastrado não é
// múltiplo do valor da parcela, então a quantidade tem de ser derivada e a
// ÚLTIMA parcela absorve o resíduo.
//   6500 / 200 → 33 parcelas: 32 × 200 (= 6400) + 1 × 100 (resíduo) = 6500.
export function dividaComParcelaResidual(extra = {}) {
  return {
    id: 'divida-residual',
    titulo: 'Financiamento Teste',
    tipo: 'financiamento',
    credor: 'Banco Teste',
    valorOriginal: 6500,
    valorParcela: 200,
    parcelasTotal: 30,          // cadastro INCORRETO de propósito: deve ser ignorado
    amortizadoInicial: 0,
    dataInicio: '2026-01-10',
    periodicidade: 'mensal',
    status: 'ativa',
    ...extra,
  };
}

/** Dívida "redonda": total é múltiplo exato da parcela (1200 / 100 = 12). */
export function dividaRedonda(extra = {}) {
  return {
    id: 'divida-redonda',
    titulo: 'Parcelamento Teste',
    tipo: 'parcelamento',
    credor: 'Loja Teste',
    valorOriginal: 1200,
    valorParcela: 100,
    parcelasTotal: 12,
    amortizadoInicial: 0,
    dataInicio: '2026-01-15',
    periodicidade: 'mensal',
    status: 'ativa',
    ...extra,
  };
}

/** Dívida com amortização anterior ao cadastro (nenhum pagamento no app). */
export function dividaComAmortizacaoAnterior(extra = {}) {
  return dividaComParcelaResidual({
    id: 'divida-amortizada',
    amortizadoInicial: 2000,   // 10 parcelas de 200 já cobertas antes do cadastro
    ...extra,
  });
}

/** Dívida iniciada em dia 31 — exercita o clamp de mês curto no vencimento. */
export function dividaIniciadaEmDia31(extra = {}) {
  return {
    id: 'divida-dia-31',
    titulo: 'Empréstimo Teste',
    tipo: 'emprestimo',
    credor: 'Banco Teste',
    valorOriginal: 500,
    valorParcela: 100,
    parcelasTotal: 5,
    amortizadoInicial: 0,
    dataInicio: '2026-01-31',
    periodicidade: 'mensal',
    status: 'ativa',
    ...extra,
  };
}

/** Estado com uma dívida e (opcionalmente) pagamentos registrados no app. */
export function cenarioDivida(divida, pagamentos = []) {
  const d = baseVazia();
  d.debts = [divida];
  d.debtPayments = pagamentos;
  return d;
}
