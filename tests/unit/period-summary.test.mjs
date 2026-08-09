// _periodMovementSummary — decomposição do caixa por natureza (Fase C).
// Aqui vivem os invariantes que separam CAIXA de CONSUMO. A tentação recorrente
// do produto é misturar os dois (contar aquisição de patrimônio como gasto do
// dia a dia, ou tirar pagamento de dívida do caixa); estes testes existem para
// que essa mistura nunca volte em silêncio.
import test from 'node:test';
import { assert, mesmoConteudo } from './_assert.mjs';
import { carregarApp } from './_loader.mjs';
import { cenarioNaturezas, PERIODO_NATUREZAS, baseVazia } from './_fixtures.mjs';

function resumo(dados, dias = PERIODO_NATUREZAS) {
  const carregado = carregarApp({ agora: '2026-03-15T12:00:00' });
  carregado.app.D = dados;
  return { ...carregado, s: carregado.ctx._periodMovementSummary(new Set(dias)) };
}

test('entradas: separa receita operacional de venda de patrimônio', () => {
  const { s } = resumo(cenarioNaturezas());
  assert.equal(s.operationalIncome, 500);   // 300 do dailyIncome + 200 do item pago
  assert.equal(s.extraordinaryIncome, 5000);
  assert.equal(s.totalCashIn, 5500);
});

test('receita pendente não entra no caixa', () => {
  const dados = cenarioNaturezas();
  const { s } = resumo(dados);
  // o item de 999 está como 'pending' e não pode aparecer em lugar nenhum
  assert.equal(s.operationalIncome, 500);
  assert.equal(s.totalCashIn, 5500);
});

test('saídas: separa consumo, aquisição e pagamento de dívida', () => {
  const { s } = resumo(cenarioNaturezas());
  assert.equal(s.consumo, 200);            // 50 + 30 + 20 + 100 (fixed-payment é consumo)
  assert.equal(s.assetAcquisition, 8000);
  assert.equal(s.debtPayments, 200);
  assert.equal(s.totalCashOut, 8400);
});

test('INVARIANTE: entradas − saídas = resultado de caixa', () => {
  const { s } = resumo(cenarioNaturezas());
  assert.equal(s.cashResult, s.totalCashIn - s.totalCashOut);
  assert.equal(s.cashResult, -2900);
});

test('INVARIANTE: totalCashIn é exatamente a soma das entradas', () => {
  const { s } = resumo(cenarioNaturezas());
  assert.equal(s.totalCashIn, s.operationalIncome + s.extraordinaryIncome);
});

test('INVARIANTE: totalCashOut é exatamente a soma das saídas', () => {
  const { s } = resumo(cenarioNaturezas());
  assert.equal(s.totalCashOut, s.consumo + s.assetAcquisition + s.debtPayments);
});

test('INVARIANTE: aquisição de patrimônio sai do caixa mas não é consumo', () => {
  const dados = baseVazia();
  dados.expenses = [
    { id: 'a', date: '2026-03-10', amount: 8000, category: 'Categoria B', meta: { nature: 'asset-acquisition' } },
  ];
  const { s } = resumo(dados);
  assert.equal(s.assetAcquisition, 8000);
  assert.equal(s.totalCashOut, 8000);          // saiu do caixa
  assert.equal(s.consumo, 0);                  // não é gasto do dia a dia
  mesmoConteudo(s.consumoByCategory, {});   // não polui categorias
});

test('INVARIANTE: pagamento de dívida sai do caixa mas não é consumo', () => {
  const dados = baseVazia();
  dados.expenses = [
    { id: 'b', date: '2026-03-10', amount: 200, category: 'Categoria C', meta: { source: 'debt' } },
  ];
  const { s } = resumo(dados);
  assert.equal(s.debtPayments, 200);
  assert.equal(s.totalCashOut, 200);
  assert.equal(s.consumo, 0);
  mesmoConteudo(s.consumoByCategory, {});
});

test('INVARIANTE: venda de patrimônio entra no caixa e fica fora da receita operacional', () => {
  const dados = baseVazia();
  dados.platforms = [{ id: 'plat-teste', name: 'Plataforma Teste' }];
  dados.incomeItems = [
    { id: 'v', date: '2026-03-10', platformId: null, amount: 5000, status: 'paid', meta: { source: 'asset-sale' } },
  ];
  const { ctx, s } = resumo(dados);
  assert.equal(s.extraordinaryIncome, 5000);
  assert.equal(s.totalCashIn, 5000);           // entrou no caixa
  assert.equal(s.operationalIncome, 0);        // não é receita de trabalho
  assert.equal(ctx._consumptionRatio(s), null); // e nunca vira denominador
});

test('consumoByCategory soma apenas consumo, com rótulo para o que não tem categoria', () => {
  const { s } = resumo(cenarioNaturezas());
  mesmoConteudo(s.consumoByCategory, {
    'Categoria A': 80,
    'Sem categoria': 20,
    'Categoria D': 100,
  });
  assert.equal('Categoria B' in s.consumoByCategory, false); // aquisição
  assert.equal('Categoria C' in s.consumoByCategory, false); // dívida
});

test('INVARIANTE: a soma de consumoByCategory é igual a consumo', () => {
  const { s } = resumo(cenarioNaturezas());
  const soma = Object.values(s.consumoByCategory).reduce((a, b) => a + b, 0);
  assert.equal(Math.round(soma * 100) / 100, s.consumo);
});

test('lançamentos fora do período são ignorados', () => {
  const { s } = resumo(cenarioNaturezas());
  // o cenário tem uma receita (777) e uma despesa (999) em abril
  assert.equal(s.totalCashIn, 5500);
  assert.equal(s.totalCashOut, 8400);
});

test('razão de consumo usa apenas receita operacional', () => {
  const { ctx, s } = resumo(cenarioNaturezas());
  assert.equal(ctx._consumptionRatio(s), 200 / 500);
  assert.equal(ctx._consumptionRatio({ operationalIncome: 0, consumo: 10 }), null);
});

test('INVARIANTE: nenhum componente do resumo é negativo', () => {
  const { s } = resumo(cenarioNaturezas());
  for (const chave of ['operationalIncome', 'extraordinaryIncome', 'totalCashIn', 'consumo', 'assetAcquisition', 'debtPayments', 'totalCashOut']) {
    assert.equal(s[chave] >= 0, true, `${chave} ficou negativo: ${s[chave]}`);
  }
});

test('centavos não vazam: 0,10 + 0,20 = 0,30', () => {
  const dados = baseVazia();
  dados.expenses = [
    { id: 'c1', date: '2026-03-10', amount: 0.1, category: 'Categoria A' },
    { id: 'c2', date: '2026-03-10', amount: 0.2, category: 'Categoria A' },
  ];
  const { s } = resumo(dados);
  assert.equal(s.consumo, 0.3);
  assert.equal(s.totalCashOut, 0.3);
  assert.equal(s.consumoByCategory['Categoria A'], 0.30000000000000004); // soma bruta da categoria
});

test('período vazio devolve tudo zerado', () => {
  const { s } = resumo(baseVazia());
  assert.equal(s.totalCashIn, 0);
  assert.equal(s.totalCashOut, 0);
  assert.equal(s.cashResult, 0);
  mesmoConteudo(s.consumoByCategory, {});
});
