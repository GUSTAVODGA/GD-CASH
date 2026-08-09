// _movementNature — resolvedor único de natureza de movimento (Fase A).
// É o ponto de onde toda a semântica financeira deriva: se ele erra, o caixa,
// o consumo, o donut e o orçamento erram juntos e em silêncio.
import test from 'node:test';
import assert from 'node:assert/strict';
import { carregarApp } from './_loader.mjs';

const { ctx } = carregarApp();
const natureza = ctx._movementNature;

test('entrada inválida nunca explode: cai em consumo', () => {
  assert.equal(natureza(null), 'consumo');
  assert.equal(natureza(undefined), 'consumo');
  assert.equal(natureza('texto'), 'consumo');
  assert.equal(natureza(42), 'consumo');
});

test('movimento de reserva é transferência, não receita nem gasto', () => {
  assert.equal(natureza({ type: 'dep', amount: 100 }), 'transfer');
  assert.equal(natureza({ type: 'ret', amount: 100 }), 'transfer');
});

test('receita com plataforma é operacional', () => {
  assert.equal(natureza({ platformId: 'plat-teste', amount: 100 }), 'income-operational');
  // a chave platformId, mesmo nula, é o que discrimina receita de despesa
  assert.equal(natureza({ platformId: null, amount: 100 }), 'income-operational');
});

test('venda de patrimônio é receita extraordinária', () => {
  assert.equal(natureza({ platformId: null, amount: 5000, meta: { source: 'asset-sale' } }), 'income-extra');
  assert.equal(natureza({ amount: 5000, meta: { source: 'asset-sale' } }), 'income-extra');
});

test('despesa sem marcação é consumo', () => {
  assert.equal(natureza({ amount: 10, category: 'Categoria A' }), 'consumo');
  assert.equal(natureza({}), 'consumo');
});

test('origem estrutural de despesa é respeitada', () => {
  assert.equal(natureza({ amount: 10, meta: { source: 'debt' } }), 'debt-payment');
  assert.equal(natureza({ amount: 10, meta: { source: 'fixed-payment' } }), 'consumo');
});

test('override manual válido reclassifica a despesa', () => {
  assert.equal(natureza({ amount: 10, meta: { nature: 'asset-acquisition' } }), 'asset-acquisition');
  assert.equal(natureza({ amount: 10, meta: { nature: 'consumo' } }), 'consumo');
  assert.equal(natureza({ amount: 10, meta: { nature: 'debt-payment' } }), 'debt-payment');
});

test('override inaplicável a despesa é rejeitado, sem inventar receita', () => {
  // income-*/transfer não descrevem uma saída de caixa manual.
  assert.equal(natureza({ amount: 10, meta: { nature: 'income-extra' } }), 'consumo');
  assert.equal(natureza({ amount: 10, meta: { nature: 'income-operational' } }), 'consumo');
  assert.equal(natureza({ amount: 10, meta: { nature: 'transfer' } }), 'consumo');
  assert.equal(natureza({ amount: 10, meta: { nature: 'inexistente' } }), 'consumo');
});

test('INVARIANTE: origem estrutural precede override manual', () => {
  // Um pagamento de dívida não vira consumo porque alguém marcou o contrário.
  assert.equal(natureza({ amount: 10, meta: { source: 'debt', nature: 'consumo' } }), 'debt-payment');
  assert.equal(natureza({ amount: 10, meta: { source: 'fixed-payment', nature: 'asset-acquisition' } }), 'consumo');
  assert.equal(natureza({ platformId: null, meta: { source: 'asset-sale', nature: 'consumo' } }), 'income-extra');
});

test('INVARIANTE: reserva precede qualquer outra marcação', () => {
  assert.equal(natureza({ type: 'dep', meta: { source: 'debt' } }), 'transfer');
  assert.equal(natureza({ type: 'ret', meta: { nature: 'asset-acquisition' } }), 'transfer');
});

test('INVARIANTE: a natureza resolvida é sempre um valor do vocabulário', () => {
  const amostras = [
    null, {}, { type: 'dep' }, { platformId: 'p' },
    { meta: { source: 'asset-sale' } }, { meta: { source: 'debt' } },
    { meta: { source: 'fixed-payment' } }, { meta: { nature: 'asset-acquisition' } },
    { meta: { nature: 'lixo' } },
  ];
  for (const item of amostras) {
    assert.equal(ctx._isValidNature(natureza(item)), true, `natureza inválida para ${JSON.stringify(item)}`);
  }
});

test('vocabulário de override de despesa exclui receitas e transferência', () => {
  assert.equal(ctx._isValidExpenseNatureOverride('consumo'), true);
  assert.equal(ctx._isValidExpenseNatureOverride('asset-acquisition'), true);
  assert.equal(ctx._isValidExpenseNatureOverride('debt-payment'), true);
  assert.equal(ctx._isValidExpenseNatureOverride('income-extra'), false);
  assert.equal(ctx._isValidExpenseNatureOverride('income-operational'), false);
  assert.equal(ctx._isValidExpenseNatureOverride('transfer'), false);
});
