// _monthShareModel(off) — o modelo do resumo mensal compartilhável.
//
// A peça compartilhada não pode ser um segundo motor financeiro. O modelo
// COMPÕE `_monthMovementSummary`, `monthAggregate` e `sumMonthReserva`; ele
// não soma despesa nenhuma por conta própria. Estes testes existem para que,
// se um dia alguém recalcular algo aqui dentro, a divergência apareça.
//
// O outro contrato é o histórico: o período vem por PARÂMETRO, então qualquer
// mês passado gera seu próprio relatório, hoje ou daqui a um ano, refletindo
// correções feitas depois. Nada é persistido.
import test from 'node:test';
import { assert, mesmoConteudo } from './_assert.mjs';
import { carregarApp } from './_loader.mjs';
import { baseVazia } from './_fixtures.mjs';

// Quinta-feira 15/06/2026, meio-dia. Junho = mês 0; maio = −1; abril = −2.
const AGORA = '2026-06-15T12:00:00';

const GASTO = (id, dia, valor, cat) => ({ id, date: `2026-06-${dia}`, amount: valor, category: cat, description: 'Lançamento Teste' });
const RECEITA = (id, dia, valor) => ({ id, date: `2026-06-${dia}`, amount: valor, status: 'paid', platformId: 'plat-1', note: 'Entrada Teste' });
const VENDA = (id, dia, valor) => ({ id, date: `2026-06-${dia}`, amount: valor, status: 'paid', platformId: null, note: 'Venda Teste', meta: { source: 'asset-sale', saleId: 's1', vehicleId: 'v1' } });
const PARCELA = (id, dia, valor) => ({ id, date: `2026-06-${dia}`, amount: valor, category: 'Dívidas', description: 'Parcela Teste', meta: { source: 'debt', debtId: 'd1', parcelNo: 1 } });
const AQUISICAO = (id, dia, valor) => ({ id, date: `2026-06-${dia}`, amount: valor, category: 'Outros', description: 'Compra Teste', patrimonioId: 'pat-1', meta: { nature: 'asset-acquisition' } });
const FIXO = (id, dia, valor) => ({ id, date: `2026-06-${dia}`, amount: valor, category: 'Contas', description: 'Fixo Teste', meta: { source: 'fixed-payment', fixedId: 'f1', cycle: '2026-06' } });
const DE_PENDENCIA = (id, dia, valor) => ({ id, date: `2026-06-${dia}`, amount: valor, category: 'Casa', description: 'Pendência Teste', meta: { source: 'pendencia', pendenciaId: 'p1' } });

function cenario(extra) {
  const carregado = carregarApp({ agora: AGORA });
  const D = baseVazia();
  // `baseVazia()` não traz `reservaHistory`, que o `defaultData` do app garante
  // (app.js:858) e que `sumMonthReserva` lê sem guarda. Completa-se o fixture
  // para que o cenário represente um estado real do app.
  D.reservaHistory = [];
  D.platforms = [{ id: 'plat-1', name: 'Plataforma Teste', color: '#888' }];
  Object.assign(D, extra || {});
  carregado.app.D = D;
  return carregado;
}

/** Cenário completo: uma movimentação de cada natureza, em junho/2026. */
function cenarioCompleto() {
  return cenario({
    incomeItems: [RECEITA('i1', '10', 5000), VENDA('i2', '12', 40000)],
    expenses: [
      GASTO('e1', '11', 800, 'Alimentação'),
      GASTO('e2', '12', 500, 'Transporte'),
      FIXO('e3', '10', 200),
      DE_PENDENCIA('e4', '13', 150),
      PARCELA('e5', '14', 1000),
      AQUISICAO('e6', '09', 8000),
    ],
  });
}

// ══ INVARIANTES CONTRA OS MOTORES CANÔNICOS ══════════════════════════════

test('INVARIANTE: caixa do modelo === caixa do motor', () => {
  const { ctx } = cenarioCompleto();
  const m = ctx._monthShareModel(0);
  const sum = ctx._monthMovementSummary(0);
  assert.equal(m.caixa.entradas, sum.totalCashIn);
  assert.equal(m.caixa.saidas, sum.totalCashOut);
  assert.equal(m.caixa.resultado, sum.cashResult);
});

test('INVARIANTE: caixa do modelo === monthAggregate', () => {
  const { ctx } = cenarioCompleto();
  const m = ctx._monthShareModel(0);
  const agg = ctx.monthAggregate(0);
  assert.equal(m.caixa.entradas, agg.receitas);
  assert.equal(m.caixa.saidas, agg.gastos);
  assert.equal(m.caixa.resultado, agg.liquido);
});

test('INVARIANTE: resultado === entradas − saídas', () => {
  const { ctx } = cenarioCompleto();
  const m = ctx._monthShareModel(0);
  assert.equal(m.caixa.resultado, Math.round((m.caixa.entradas - m.caixa.saidas) * 100) / 100);
});

test('INVARIANTE: as parcelas do destino somam exatamente as saídas', () => {
  const { ctx } = cenarioCompleto();
  const m = ctx._monthShareModel(0);
  const soma = m.destino.reduce((s, d) => s + d.valor, 0);
  assert.equal(Math.round(soma * 100) / 100, m.caixa.saidas);
});

test('INVARIANTE: consumo do modelo === consumo do motor', () => {
  const { ctx } = cenarioCompleto();
  const m = ctx._monthShareModel(0);
  assert.equal(m.consumo.total, ctx._monthMovementSummary(0).consumo);
});

test('INVARIANTE: as categorias somam exatamente o consumo', () => {
  const { ctx } = cenarioCompleto();
  const m = ctx._monthShareModel(0);
  const soma = m.consumo.categorias.reduce((s, c) => s + c.valor, 0) + (m.consumo.outras ? m.consumo.outras.valor : 0);
  assert.equal(Math.round(soma * 100) / 100, m.consumo.total);
});

test('INVARIANTE: categorias vêm de consumoByCategory, sem recontar', () => {
  const { ctx } = cenarioCompleto();
  const m = ctx._monthShareModel(0);
  const doMotor = ctx._monthMovementSummary(0).consumoByCategory;
  m.consumo.categorias.forEach(c => {
    assert.equal(c.valor, doMotor[c.nome], `categoria ${c.nome} divergiu do motor`);
  });
});

// ══ CADA NATUREZA NO LUGAR CERTO ═════════════════════════════════════════

test('dívida, aquisição e venda não contaminam o consumo', () => {
  const { ctx } = cenarioCompleto();
  const m = ctx._monthShareModel(0);
  // consumo = 800 + 500 + 200 (fixo) + 150 (pendência)
  assert.equal(m.consumo.total, 1650);
  const nomes = m.consumo.categorias.map(c => c.nome);
  assert.ok(!nomes.includes('Dívidas'), 'parcela de dívida virou categoria de consumo');
  assert.equal(m.consumo.categorias.find(c => c.nome === 'Outros'), undefined, 'aquisição virou consumo');
});

test('dívida e patrimônio aparecem no destino, separados do dia a dia', () => {
  const { ctx } = cenarioCompleto();
  const m = ctx._monthShareModel(0);
  const porChave = Object.fromEntries(m.destino.map(d => [d.chave, d.valor]));
  assert.equal(porChave.consumo, 1650);
  assert.equal(porChave.divida, 1000);
  assert.equal(porChave.patrimonio, 8000);
});

test('venda de patrimônio não vira receita operacional', () => {
  const { ctx } = cenarioCompleto();
  const m = ctx._monthShareModel(0);
  assert.equal(m.operacional.receita, 5000);
  assert.equal(m.origem.operacional, 5000);
  assert.equal(m.origem.extraordinaria, 40000);
  assert.equal(m.caixa.entradas, 45000);
});

test('sem entrada extraordinária, a seção "de onde veio" não existe', () => {
  const { ctx } = cenario({ incomeItems: [RECEITA('i1', '10', 5000)], expenses: [GASTO('e1', '11', 100, 'Casa')] });
  assert.equal(ctx._monthShareModel(0).origem, null);
});

test('gasto fixo entra uma vez só, como consumo', () => {
  const { ctx } = cenario({ expenses: [FIXO('e1', '10', 200)], fixedPayments: [{ fixedId: 'f1', cycle: '2026-06', expenseId: 'e1', paidDate: '2026-06-10' }] });
  const m = ctx._monthShareModel(0);
  assert.equal(m.caixa.saidas, 200);
  assert.equal(m.consumo.total, 200);
  mesmoConteudo(m.consumo.categorias.map(c => c.nome), ['Contas']);
});

test('gasto de pendência entra uma vez só, como consumo', () => {
  const { ctx } = cenario({
    expenses: [DE_PENDENCIA('e1', '13', 150)],
    pendencias: [{ id: 'p1', title: 'Pendência Teste', status: 'concluida', completedAt: '2026-06-13', despesaId: 'e1', estimatedValue: 150 }],
  });
  const m = ctx._monthShareModel(0);
  assert.equal(m.caixa.saidas, 150);
  assert.equal(m.consumo.total, 150);
});

test('lançamento legado sem metadata segue a classificação canônica', () => {
  const { ctx } = cenario({ expenses: [GASTO('e1', '10', 300, 'Alimentação')] });
  const m = ctx._monthShareModel(0);
  assert.equal(m.consumo.total, 300);
  mesmoConteudo(m.destino.map(d => d.chave), ['consumo']);
});

// ══ CATEGORIAS ═══════════════════════════════════════════════════════════

test('muitas categorias: as principais + "Outras" fecham o total', () => {
  const nomes = ['Alimentação', 'Transporte', 'Casa', 'Saúde', 'Lazer', 'Educação', 'Pets', 'Vestuário'];
  const { ctx } = cenario({ expenses: nomes.map((n, i) => GASTO('e' + i, '10', 100 - i * 5, n)) });
  const m = ctx._monthShareModel(0);
  assert.equal(m.consumo.categorias.length, 5);
  assert.equal(m.consumo.outras.quantidade, 3);
  const soma = m.consumo.categorias.reduce((s, c) => s + c.valor, 0) + m.consumo.outras.valor;
  assert.equal(Math.round(soma * 100) / 100, m.consumo.total);
});

test('até cinco categorias: nenhuma linha "Outras"', () => {
  const { ctx } = cenario({ expenses: ['A', 'B', 'C'].map((n, i) => GASTO('e' + i, '10', 50, n)) });
  assert.equal(ctx._monthShareModel(0).consumo.outras, null);
});

test('categorias saem ordenadas por valor, maior primeiro', () => {
  const { ctx } = cenario({ expenses: [GASTO('e1', '10', 100, 'Menor'), GASTO('e2', '11', 900, 'Maior'), GASTO('e3', '12', 500, 'Meio')] });
  mesmoConteudo(ctx._monthShareModel(0).consumo.categorias.map(c => c.nome), ['Maior', 'Meio', 'Menor']);
});

test('despesa sem categoria recebe rótulo, não some', () => {
  const { ctx } = cenario({ expenses: [{ id: 'e1', date: '2026-06-10', amount: 90, category: '', description: 'X' }] });
  const m = ctx._monthShareModel(0);
  mesmoConteudo(m.consumo.categorias.map(c => c.nome), ['Sem categoria']);
  assert.equal(m.consumo.total, 90);
});

// ══ HISTÓRICO — O PERÍODO VEM POR PARÂMETRO ══════════════════════════════

function cenarioTresMeses() {
  return cenario({
    incomeItems: [
      { id: 'i-abr', date: '2026-04-10', amount: 1000, status: 'paid', platformId: 'plat-1' },
      { id: 'i-mai', date: '2026-05-10', amount: 2000, status: 'paid', platformId: 'plat-1' },
      { id: 'i-jun', date: '2026-06-10', amount: 3000, status: 'paid', platformId: 'plat-1' },
    ],
    expenses: [
      { id: 'e-abr', date: '2026-04-11', amount: 100, category: 'Abril', description: 'x' },
      { id: 'e-mai', date: '2026-05-11', amount: 200, category: 'Maio', description: 'x' },
      { id: 'e-jun', date: '2026-06-11', amount: 300, category: 'Junho', description: 'x' },
    ],
  });
}

test('cada mês gera os seus próprios números', () => {
  const { ctx } = cenarioTresMeses();
  assert.equal(ctx._monthShareModel(0).caixa.entradas, 3000);
  assert.equal(ctx._monthShareModel(-1).caixa.entradas, 2000);
  assert.equal(ctx._monthShareModel(-2).caixa.entradas, 1000);
});

test('nenhum dado do mês corrente vaza para um mês histórico', () => {
  const { ctx } = cenarioTresMeses();
  const maio = ctx._monthShareModel(-1);
  mesmoConteudo(maio.consumo.categorias.map(c => c.nome), ['Maio']);
  assert.equal(maio.caixa.saidas, 200);
});

test('DETERMINISMO: agosto → julho → junho → julho devolve o mesmo julho', () => {
  const { ctx } = cenarioTresMeses();
  const primeira = JSON.stringify(ctx._monthShareModel(-1));
  ctx._monthShareModel(0);
  ctx._monthShareModel(-2);
  const segunda = JSON.stringify(ctx._monthShareModel(-1));
  assert.equal(segunda, primeira);
});

test('corrigir um lançamento antigo muda o relatório daquele mês', () => {
  const { ctx, app } = cenarioTresMeses();
  assert.equal(ctx._monthShareModel(-1).caixa.saidas, 200);
  app.D.expenses.find(e => e.id === 'e-mai').amount = 350;   // correção posterior
  assert.equal(ctx._monthShareModel(-1).caixa.saidas, 350, 'o modelo congelou o passado');
});

test('o rótulo do período acompanha o mês pedido', () => {
  const { ctx } = cenarioTresMeses();
  assert.notEqual(ctx._monthShareModel(0).periodo.rotulo, ctx._monthShareModel(-1).periodo.rotulo);
  assert.equal(ctx._monthShareModel(-1).periodo.off, -1);
});

// ══ COMPARAÇÃO — SÓ QUANDO HONESTA ═══════════════════════════════════════

test('sem consumo no mês anterior, não há comparação', () => {
  const { ctx } = cenario({ expenses: [GASTO('e1', '10', 300, 'Casa')] });
  assert.equal(ctx._monthShareModel(0).comparacao, null);
});

test('mês passado × mês passado compara os dois meses inteiros', () => {
  const { ctx } = cenario({
    expenses: [
      { id: 'a', date: '2026-04-05', amount: 100, category: 'Casa', description: 'x' },
      { id: 'b', date: '2026-04-28', amount: 100, category: 'Casa', description: 'x' },
      { id: 'c', date: '2026-05-05', amount: 300, category: 'Casa', description: 'x' },
    ],
  });
  const maio = ctx._monthShareModel(-1);
  assert.equal(maio.comparacao.consumoAnterior, 200);
  assert.equal(maio.comparacao.variacaoPct, 50);
  assert.equal(maio.comparacao.parcial, false);
});

test('mês corrente compara só os dias já decorridos do mês anterior', () => {
  // Hoje é 15/06. O gasto de 25/05 está fora da janela comparável.
  const { ctx } = cenario({
    expenses: [
      { id: 'a', date: '2026-05-05', amount: 100, category: 'Casa', description: 'x' },
      { id: 'b', date: '2026-05-25', amount: 900, category: 'Casa', description: 'x' },
      { id: 'c', date: '2026-06-05', amount: 150, category: 'Casa', description: 'x' },
    ],
  });
  const junho = ctx._monthShareModel(0);
  assert.equal(junho.comparacao.consumoAnterior, 100, 'comparou mês cheio com mês pela metade');
  assert.equal(junho.comparacao.variacaoPct, 50);
  assert.equal(junho.comparacao.parcial, true);
});

// ══ BORDAS ═══════════════════════════════════════════════════════════════

test('mês vazio: marcado como vazio, sem seções inventadas', () => {
  const { ctx } = cenario();
  const m = ctx._monthShareModel(0);
  assert.equal(m.periodo.vazio, true);
  assert.equal(m.caixa.entradas, 0);
  assert.equal(m.caixa.saidas, 0);
  assert.equal(m.caixa.resultado, 0);
  mesmoConteudo(m.destino, []);
  mesmoConteudo(m.consumo.categorias, []);
  assert.equal(m.origem, null);
  assert.equal(m.reserva, null);
});

test('só receita: destino vazio e resultado positivo', () => {
  const { ctx } = cenario({ incomeItems: [RECEITA('i1', '10', 2500)] });
  const m = ctx._monthShareModel(0);
  assert.equal(m.caixa.resultado, 2500);
  mesmoConteudo(m.destino, []);
  assert.equal(m.periodo.vazio, false);
});

test('só dívida: nenhuma categoria de consumo, resultado negativo', () => {
  const { ctx } = cenario({ expenses: [PARCELA('e1', '10', 1000)] });
  const m = ctx._monthShareModel(0);
  assert.equal(m.consumo.total, 0);
  mesmoConteudo(m.consumo.categorias, []);
  mesmoConteudo(m.destino.map(d => d.chave), ['divida']);
  assert.equal(m.caixa.resultado, -1000);
});

test('só aquisição: aparece em patrimônio, nunca em dia a dia', () => {
  const { ctx } = cenario({ expenses: [AQUISICAO('e1', '10', 8000)] });
  const m = ctx._monthShareModel(0);
  mesmoConteudo(m.destino.map(d => d.chave), ['patrimonio']);
  assert.equal(m.consumo.total, 0);
});

test('números grandes não perdem precisão', () => {
  const { ctx } = cenario({
    incomeItems: [RECEITA('i1', '10', 9999999.99)],
    expenses: [GASTO('e1', '11', 1234567.89, 'Casa')],
  });
  const m = ctx._monthShareModel(0);
  assert.equal(m.caixa.entradas, 9999999.99);
  assert.equal(m.caixa.saidas, 1234567.89);
  assert.equal(m.caixa.resultado, 8765432.1);
});

test('reserva do mês aparece quando existe, e some quando é zero', () => {
  const comReserva = cenario({ reservaHistory: [{ date: '2026-06-10', type: 'dep', amount: 500 }] });
  assert.equal(comReserva.ctx._monthShareModel(0).reserva, 500);
  assert.equal(cenario().ctx._monthShareModel(0).reserva, null);
});

test('off inválido cai no mês corrente sem estourar', () => {
  const { ctx } = cenarioCompleto();
  [undefined, null, NaN, 'x'].forEach(v => {
    assert.equal(ctx._monthShareModel(v).periodo.off, 0);
  });
});

// ══ PRIVACIDADE E PUREZA ═════════════════════════════════════════════════

test('PRIVACIDADE: o modelo não carrega descrição, título, plataforma, bem nem id', () => {
  const { ctx } = cenario({
    platforms: [{ id: 'plat-1', name: 'Plataforma Secreta', color: '#888' }],
    debts: [{ id: 'd1', tipo: 'emprestimo', titulo: 'Dívida Secreta', valorOriginal: 5000, valorParcela: 1000, parcelasTotal: 5, amortizadoInicial: 0, dataInicio: '2026-01-10', periodicidade: 'mensal', status: 'ativa' }],
    patrimonios: [{ id: 'pat-1', nome: 'Bem Secreto', tipo: 'outro', status: 'ativo', valorEstimado: 8000, historico: [], detalhes: {} }],
    incomeItems: [{ id: 'i1', date: '2026-06-12', amount: 40000, status: 'paid', platformId: null, note: 'Venda do Bem Secreto', meta: { source: 'asset-sale', saleId: 's1' } }],
    expenses: [
      { id: 'e1', date: '2026-06-11', amount: 800, category: 'Alimentação', description: 'Descrição Secreta' },
      PARCELA('e2', '14', 1000),
      AQUISICAO('e3', '09', 8000),
    ],
  });
  const texto = JSON.stringify(ctx._monthShareModel(0));
  ['Secreta', 'Secreto', 'plat-1', 'pat-1', 'd1', 's1', 'e1', 'i1', 'asset-sale', 'pendenciaId', 'debtId']
    .forEach(proibido => assert.ok(!texto.includes(proibido), `vazou "${proibido}" no modelo`));
});

test('PUREZA: gerar o modelo não altera D', () => {
  const { ctx, app } = cenarioCompleto();
  const antes = JSON.stringify(app.D);
  ctx._monthShareModel(0);
  ctx._monthShareModel(-1);
  ctx._monthShareModel(-12);
  assert.equal(JSON.stringify(app.D), antes, 'o modelo escreveu em D');
});

test('PUREZA: gerar o modelo não chama save()', () => {
  const { ctx, app } = cenarioCompleto();
  let salvou = 0;
  ctx.save = () => { salvou++; };
  ctx._monthShareModel(0);
  assert.equal(salvou, 0);
  assert.equal(app.D.expenses.length, 6);
});

test('PUREZA: duas chamadas seguidas devolvem exatamente o mesmo modelo', () => {
  const { ctx } = cenarioCompleto();
  assert.equal(JSON.stringify(ctx._monthShareModel(-1)), JSON.stringify(ctx._monthShareModel(-1)));
});
