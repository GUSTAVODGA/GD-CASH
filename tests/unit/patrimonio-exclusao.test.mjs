// _patrimonioDeleteState — pode apagar este bem definitivamente?
//
// Defeito coberto aqui: apagar um bem que ainda tem vínculo deixava o outro
// lado órfão — a despesa continuava apontando para um `patrimonioId` que não
// existe mais, a dívida para um bem que sumiu. A guarda que existia
// (`_bemTemHistorico`) só enxergava histórico patrimonial, financiamento e os
// índices legados do veículo; aquisição, despesa de uso, dívida não-
// financiamento e pendência passavam batido. E o botão "Excluir" do rodapé do
// formulário não consultava guarda nenhuma.
//
// Política: não há exclusão em cascata. Se existe vínculo, o bem não é
// apagado — é encerrado/vendido, e o histórico permanece.
//
// O que estes testes protegem:
//
//   1. bem sem vínculo continua excluível (cadastro errado se desfaz);
//   2. cada tipo de vínculo, sozinho, bloqueia;
//   3. financiamento QUITADO também bloqueia — histórico é motivo de guarda;
//   4. vários vínculos → um motivo por tipo, sem repetição;
//   5. a decisão é derivada: consultar não escreve nada em D.
import test from 'node:test';
import { assert, mesmoConteudo } from './_assert.mjs';
import { carregarApp } from './_loader.mjs';
import { baseVazia } from './_fixtures.mjs';

const AGORA = '2026-06-15T12:00:00';
const PAT_ID = 'pat-imovel';

const IMOVEL = () => ({
  id: PAT_ID, nome: 'Imóvel Teste', tipo: 'imovel', status: 'ativo',
  valorEstimado: 300000, historico: [], detalhes: {},
});
const VEICULO = () => ({
  id: 'veh-teste', name: 'Veículo Teste', brand: 'Marca Teste', model: 'Modelo Teste',
  year: '2020', color: 'Prata', plate: '', km: 1000, photo: null, notes: '',
  status: 'em_uso', history: [], linkedExpenses: [], linkedPendencias: [],
});

const AQUISICAO = () => ({ id: 'e-aq', date: '2026-06-13', amount: 8000, category: 'Outros', description: 'Compra Bem Teste', patrimonioId: PAT_ID, meta: { nature: 'asset-acquisition' } });
const DESPESA_USO = () => ({ id: 'e-uso', date: '2026-06-13', amount: 300, category: 'Casa', description: 'Reparo Teste', patrimonioId: PAT_ID });
const FINANCIAMENTO = () => ({ id: 'd-fin', tipo: 'financiamento', titulo: 'Financiamento Teste', credor: 'Banco Teste', patrimonioId: PAT_ID, valorOriginal: 200000, valorParcela: 1000, parcelasTotal: 200, amortizadoInicial: 0, dataInicio: '2026-01-10', periodicidade: 'mensal', status: 'ativa' });
const FIN_QUITADO = () => ({ ...FINANCIAMENTO(), id: 'd-quit', amortizadoInicial: 200000, status: 'quitada' });
const EMPRESTIMO = () => ({ id: 'd-emp', tipo: 'emprestimo', titulo: 'Empréstimo Teste', credor: 'Banco Teste', patrimonioId: PAT_ID, valorOriginal: 5000, valorParcela: 500, parcelasTotal: 10, amortizadoInicial: 0, dataInicio: '2026-01-10', periodicidade: 'mensal', status: 'ativa' });
const PENDENCIA = () => ({ id: 'pend-1', titulo: 'Pendência Teste', status: 'aberta', patrimonioId: PAT_ID });
const EVENTO = () => ({ id: 'h1', data: '2026-05-01', tipo: 'avaliacao', descricao: '', valor: 310000, valorAnterior: 300000, despesaId: null, pendenciaId: null });

function cenario(extra) {
  const carregado = carregarApp({ agora: AGORA });
  const D = baseVazia();
  D.patrimonios = [IMOVEL()];
  Object.assign(D, extra || {});
  carregado.app.D = D;
  return carregado;
}

// ── O caso que deve continuar funcionando ─────────────────────────────────

test('bem sem nenhum vínculo pode ser excluído', () => {
  const { ctx } = cenario();
  const est = ctx._patrimonioDeleteState(PAT_ID);
  assert.equal(est.podeExcluir, true);
  assert.equal(est.total, 0);
  mesmoConteudo(est.motivos, []);
  mesmoConteudo(est.tipos, []);
});

test('aceita tanto o id quanto o próprio objeto do patrimônio', () => {
  const { ctx, app } = cenario({ expenses: [AQUISICAO()] });
  assert.equal(ctx._patrimonioDeleteState(PAT_ID).podeExcluir, false);
  assert.equal(ctx._patrimonioDeleteState(app.D.patrimonios[0]).podeExcluir, false);
});

// ── Cada tipo de vínculo, sozinho, bloqueia ───────────────────────────────

test('aquisição de patrimônio bloqueia a exclusão', () => {
  const { ctx } = cenario({ expenses: [AQUISICAO()] });
  const est = ctx._patrimonioDeleteState(PAT_ID);
  assert.equal(est.podeExcluir, false);
  mesmoConteudo(est.tipos, ['aquisicao']);
  mesmoConteudo(est.motivos, ['1 aquisição']);
  assert.equal(est.contagem.aquisicao, 1);
  assert.equal(est.contagem.despesa, 0, 'a aquisição foi contada duas vezes');
});

test('despesa comum vinculada bloqueia a exclusão', () => {
  const { ctx } = cenario({ expenses: [DESPESA_USO()] });
  const est = ctx._patrimonioDeleteState(PAT_ID);
  assert.equal(est.podeExcluir, false);
  mesmoConteudo(est.motivos, ['1 lançamento vinculado']);
});

test('financiamento ativo bloqueia a exclusão', () => {
  const { ctx } = cenario({ debts: [FINANCIAMENTO()] });
  const est = ctx._patrimonioDeleteState(PAT_ID);
  assert.equal(est.podeExcluir, false);
  mesmoConteudo(est.motivos, ['1 financiamento']);
});

test('financiamento QUITADO também bloqueia — histórico se preserva', () => {
  const { ctx, app } = cenario({ debts: [FIN_QUITADO()] });
  assert.equal(ctx._debtSaldo(app.D.debts[0]), 0, 'o cenário não representa uma dívida quitada');
  const est = ctx._patrimonioDeleteState(PAT_ID);
  assert.equal(est.podeExcluir, false);
  mesmoConteudo(est.motivos, ['1 financiamento']);
});

test('dívida não-financiamento vinculada ao bem bloqueia', () => {
  const { ctx } = cenario({ debts: [EMPRESTIMO()] });
  const est = ctx._patrimonioDeleteState(PAT_ID);
  assert.equal(est.podeExcluir, false);
  mesmoConteudo(est.motivos, ['1 dívida vinculada']);
});

test('pendência com patrimonioId bloqueia', () => {
  const { ctx } = cenario({ pendencias: [PENDENCIA()] });
  const est = ctx._patrimonioDeleteState(PAT_ID);
  assert.equal(est.podeExcluir, false);
  mesmoConteudo(est.motivos, ['1 pendência']);
});

test('pendência ligada pelo índice reverso (detalhes.linkedPendencias) bloqueia', () => {
  const { ctx, app } = cenario({ pendencias: [{ id: 'pend-2', titulo: 'Pendência Teste', status: 'aberta' }] });
  app.D.patrimonios[0].detalhes = { linkedPendencias: ['pend-2'] };
  const est = ctx._patrimonioDeleteState(PAT_ID);
  assert.equal(est.podeExcluir, false);
  mesmoConteudo(est.motivos, ['1 pendência']);
});

test('evento no histórico patrimonial bloqueia', () => {
  const { ctx, app } = cenario();
  app.D.patrimonios[0].historico = [EVENTO()];
  const est = ctx._patrimonioDeleteState(PAT_ID);
  assert.equal(est.podeExcluir, false);
  mesmoConteudo(est.motivos, ['1 evento no histórico']);
});

// ── Vários vínculos ao mesmo tempo ────────────────────────────────────────

test('múltiplos tipos: um motivo por tipo, sem duplicar', () => {
  const { ctx, app } = cenario({
    expenses: [AQUISICAO(), DESPESA_USO(), { ...DESPESA_USO(), id: 'e-uso2' }],
    debts: [FINANCIAMENTO(), EMPRESTIMO()],
    pendencias: [PENDENCIA()],
  });
  app.D.patrimonios[0].historico = [EVENTO()];
  const est = ctx._patrimonioDeleteState(PAT_ID);

  assert.equal(est.podeExcluir, false);
  mesmoConteudo(est.tipos, ['aquisicao', 'financiamento', 'divida', 'despesa', 'pendencia', 'historico']);
  mesmoConteudo(est.motivos, [
    '1 aquisição', '1 financiamento', '1 dívida vinculada',
    '2 lançamentos vinculados', '1 pendência', '1 evento no histórico',
  ]);
  assert.equal(est.motivos.length, new Set(est.motivos).size, 'motivo repetido');
  assert.equal(est.total, 7);
});

test('mesma pendência ligada pelos dois lados conta uma vez só', () => {
  const { ctx, app } = cenario({ pendencias: [PENDENCIA()] });
  app.D.patrimonios[0].detalhes = { linkedPendencias: ['pend-1'] };
  mesmoConteudo(ctx._patrimonioDeleteState(PAT_ID).motivos, ['1 pendência']);
});

// ── Veículo: mesmo modelo, mesmo caminho ──────────────────────────────────

test('veículo sem vínculo pode ser excluído', () => {
  const { ctx } = cenario({ vehicles: [VEICULO()], patrimonios: [] });
  assert.equal(ctx._patrimonioDeleteState('veh-teste').podeExcluir, true);
});

test('veículo com histórico continua bloqueado, como antes', () => {
  const { ctx } = cenario({ vehicles: [{ ...VEICULO(), history: [{ id: 'h', date: '2026-05-01', type: 'evento', note: 'Revisão Teste' }] }], patrimonios: [] });
  const est = ctx._patrimonioDeleteState('veh-teste');
  assert.equal(est.podeExcluir, false);
  mesmoConteudo(est.motivos, ['1 evento no histórico']);
});

test('veículo com despesa vinculada por vehicleId bloqueia', () => {
  const { ctx } = cenario({
    vehicles: [VEICULO()], patrimonios: [],
    expenses: [{ id: 'e-veh', date: '2026-06-10', amount: 120, category: 'Transporte', description: 'Combustível Teste', vehicleId: 'veh-teste' }],
  });
  assert.equal(ctx._patrimonioDeleteState('veh-teste').podeExcluir, false);
});

test('veículo com financiamento por vehicleId bloqueia', () => {
  const { ctx } = cenario({
    vehicles: [VEICULO()], patrimonios: [],
    debts: [{ ...FINANCIAMENTO(), id: 'd-veh', patrimonioId: null, vehicleId: 'veh-teste' }],
  });
  mesmoConteudo(ctx._patrimonioDeleteState('veh-teste').motivos, ['1 financiamento']);
});

// ── Pureza e robustez ─────────────────────────────────────────────────────

test('bem inexistente não estoura e não bloqueia nada', () => {
  const { ctx } = cenario();
  [undefined, null, '', 'nao-existe', {}].forEach(v => {
    assert.equal(ctx._patrimonioDeleteState(v).podeExcluir, true);
  });
});

test('INVARIANTE: consultar o estado não escreve em D', () => {
  const { ctx, app } = cenario({
    expenses: [AQUISICAO(), DESPESA_USO()],
    debts: [FINANCIAMENTO(), EMPRESTIMO()],
    pendencias: [PENDENCIA()],
    vehicles: [VEICULO()],
  });
  const antes = JSON.stringify(app.D);
  ctx._patrimonioDeleteState(PAT_ID);
  ctx._patrimonioDeleteState('veh-teste');
  ctx._bemTemHistorico(PAT_ID);
  assert.equal(JSON.stringify(app.D), antes, 'a decisão foi persistida em algum lugar');
});

test('INVARIANTE: a decisão é derivada — muda quando o vínculo some', () => {
  const { ctx, app } = cenario({ expenses: [AQUISICAO()] });
  assert.equal(ctx._patrimonioDeleteState(PAT_ID).podeExcluir, false);
  app.D.expenses = [];
  assert.equal(ctx._patrimonioDeleteState(PAT_ID).podeExcluir, true);
});

test('_bemTemHistorico responde o inverso de podeExcluir', () => {
  const semVinculo = cenario();
  assert.equal(semVinculo.ctx._bemTemHistorico(PAT_ID), false);
  const comVinculo = cenario({ debts: [EMPRESTIMO()] });
  assert.equal(comVinculo.ctx._bemTemHistorico(PAT_ID), true);
});
