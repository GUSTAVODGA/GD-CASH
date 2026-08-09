// Projeção de vencimentos de dívida.
//
// ATENÇÃO — esta suíte contém DUAS coisas diferentes, deliberadamente separadas:
//
//   1. Invariantes de verdade financeira (a projeção não pode criar nem sumir
//      com dinheiro). Estes devem valer para sempre.
//
//   2. Uma CARACTERIZAÇÃO de dívida técnica conhecida (P2), no bloco do fim.
//      Ela documenta o comportamento ATUAL de "A vencer no mês", que não é o
//      comportamento desejado. Não é especificação: é uma fotografia, tirada
//      para que o corretivo do P2 mostre exatamente o que mudou.
import test from 'node:test';
import { assert, mesmoConteudo } from './_assert.mjs';
import { carregarApp } from './_loader.mjs';
import { cenarioDivida, dividaComParcelaResidual, dividaRedonda } from './_fixtures.mjs';

function comDivida(divida, pagamentos = [], agora = '2026-06-15T12:00:00') {
  const carregado = carregarApp({ agora });
  carregado.app.D = cenarioDivida(divida, pagamentos);
  return carregado;
}

test('projeta a partir da próxima parcela pendente', () => {
  const divida = dividaRedonda();  // início 2026-01-15, 12 × 100
  const { ctx } = comDivida(divida, [{ id: 'p', debtId: divida.id, valor: 300, data: '2026-04-01' }]);
  const itens = ctx._debtProjectVencimentos(divida, {});
  assert.equal(itens.length, 9);           // 12 − 3 pagas
  assert.equal(itens[0].parcelNo, 4);
});

test('o primeiro pendente conhece o pagamento parcial', () => {
  const divida = dividaRedonda();
  const { ctx } = comDivida(divida, [{ id: 'p', debtId: divida.id, valor: 250, data: '2026-04-01' }]);
  const itens = ctx._debtProjectVencimentos(divida, {});
  assert.equal(itens[0].parcelNo, 3);
  assert.equal(itens[0].valorNominal, 100);
  assert.equal(itens[0].valorRestante, 50);   // 250 cobriu 2 parcelas e metade da 3ª
});

test('INVARIANTE: a soma das parcelas projetadas é o valor total quando nada foi pago', () => {
  for (const divida of [dividaComParcelaResidual(), dividaRedonda()]) {
    const { ctx } = comDivida(divida);
    const itens = ctx._debtProjectVencimentos(divida, {});
    const soma = itens.reduce((s, v) => s + v.valorNominal, 0);
    assert.equal(Math.round(soma * 100), Math.round(divida.valorOriginal * 100), `soma divergente em ${divida.id}`);
  }
});

test('INVARIANTE: a soma do restante projetado é exatamente o saldo devedor', () => {
  const divida = dividaComParcelaResidual();
  const { ctx } = comDivida(divida, [{ id: 'p', debtId: divida.id, valor: 950, data: '2026-05-01' }]);
  const itens = ctx._debtProjectVencimentos(divida, {});
  const soma = itens.reduce((s, v) => s + v.valorRestante, 0);
  assert.equal(Math.round(soma * 100) / 100, ctx._debtSaldo(divida));
});

test('INVARIANTE: nenhuma parcela projetada é negativa', () => {
  const divida = dividaComParcelaResidual();
  const { ctx } = comDivida(divida, [{ id: 'p', debtId: divida.id, valor: 1234.56, data: '2026-05-01' }]);
  for (const v of ctx._debtProjectVencimentos(divida, {})) {
    assert.equal(v.valorNominal > 0, true, `nominal não positivo na parcela ${v.parcelNo}`);
    assert.equal(v.valorRestante >= 0, true, `restante negativo na parcela ${v.parcelNo}`);
  }
});

test('INVARIANTE: dívida quitada não projeta nada', () => {
  const divida = dividaRedonda();
  const { ctx } = comDivida(divida, [{ id: 'p', debtId: divida.id, valor: 1200, data: '2026-05-01' }]);
  mesmoConteudo(ctx._debtProjectVencimentos(divida, {}), []);
});

test('dívida pausada ou cancelada não projeta', () => {
  for (const status of ['pausada', 'cancelada']) {
    const divida = dividaRedonda({ status });
    const { ctx } = comDivida(divida);
    mesmoConteudo(ctx._debtProjectVencimentos(divida, {}), [], `status ${status} projetou`);
  }
});

test('janela toISO corta a projeção', () => {
  const divida = dividaRedonda();
  const { ctx } = comDivida(divida);
  const itens = ctx._debtProjectVencimentos(divida, { toISO: '2026-03-31' });
  assert.equal(itens.length, 3);                    // jan, fev, mar
  assert.equal(itens.at(-1).dueDate, '2026-03-15');
});

test('janela fromISO pula o que é anterior', () => {
  const divida = dividaRedonda();
  const { ctx } = comDivida(divida);
  const itens = ctx._debtProjectVencimentos(divida, { fromISO: '2026-06-01', toISO: '2026-08-31' });
  mesmoConteudo(itens.map(v => v.dueDate), ['2026-06-15', '2026-07-15', '2026-08-15']);
});

test('maxItems limita a quantidade', () => {
  const divida = dividaComParcelaResidual();
  const { ctx } = comDivida(divida);
  assert.equal(ctx._debtProjectVencimentos(divida, { maxItems: 3 }).length, 3);
});

test('parcela vencida antes de hoje é marcada como atrasada', () => {
  const divida = dividaRedonda();                    // 1ª em 2026-01-15
  const { ctx } = comDivida(divida);                 // relógio em 2026-06-15
  const itens = ctx._debtProjectVencimentos(divida, {});
  assert.equal(itens[0].atrasada, true);
  assert.equal(itens[0].status, 'atrasada');
  const hoje = itens.find(v => v.dueDate === '2026-06-15');
  assert.equal(hoje.status, 'hoje');
  const futura = itens.find(v => v.dueDate === '2026-07-15');
  assert.equal(futura.status, 'previsto');
});

test('vencimentos no período vêm ordenados por data', () => {
  const carregado = carregarApp({ agora: '2026-06-15T12:00:00' });
  carregado.app.D = cenarioDivida(dividaRedonda(), []);
  carregado.app.D.debts.push(dividaComParcelaResidual());  // início 2026-01-10
  const itens = carregado.ctx._debtVencimentosNoPeriodo('2026-06-01', '2026-06-30');
  const datas = itens.map(v => v.dueDate);
  mesmoConteudo(datas, [...datas].sort());
  assert.equal(datas.length, 2);   // uma parcela de cada dívida em junho
});

// ══════════════════════════════════════════════════════════════════════════
// CARACTERIZAÇÃO DE DÍVIDA TÉCNICA CONHECIDA — P2 ("A vencer no mês")
//
// NÃO É A REGRA DESEJADA. É o retrato do comportamento atual.
//
// `_debtPrevistoDoMes(ym)` chama `_debtVencimentosNoPeriodo(null, to)` com
// `fromISO = null`. Sem limite inferior, a projeção enumera TODAS as parcelas
// pendentes desde o início da dívida até o fim do mês consultado — ou seja, o
// backlog histórico inteiro entra no bloco "A vencer no mês", inflando tanto a
// contagem quanto o total.
//
// Comportamento desejado (a ser implementado no commit dedicado ao P2): o bloco
// deve refletir o que vence DENTRO do mês, sem arrastar o passado ilimitado.
//
// QUANDO O P2 FOR CORRIGIDO, ESTES DOIS TESTES DEVEM SER REESCRITOS para
// expressar a regra correta — eles falharão de propósito, e essa falha é o
// sinal de que o corretivo funcionou.
// ══════════════════════════════════════════════════════════════════════════

test('P2 [caracterização, não especificação]: previsto do mês inclui backlog histórico', () => {
  // Dívida iniciada em janeiro, nada pago, relógio em junho.
  const divida = dividaComParcelaResidual();          // 1ª parcela em 2026-01-10
  const { ctx } = comDivida(divida, [], '2026-06-15T12:00:00');

  const previsto = ctx._debtPrevistoDoMes('2026-06');

  // Hoje: entram as parcelas de janeiro a junho (6), não apenas a de junho.
  assert.equal(previsto.itens.length, 6, 'comportamento atual: backlog desde o início da dívida');
  mesmoConteudo(previsto.itens.map(v => v.dueDate), [
    '2026-01-10', '2026-02-10', '2026-03-10', '2026-04-10', '2026-05-10', '2026-06-10',
  ]);
  assert.equal(previsto.total, 1200);  // 6 × 200, e não os 200 do mês corrente

  // Registro explícito do que se espera DEPOIS do P2 (hoje intencionalmente falso):
  const apenasDoMes = previsto.itens.filter(v => v.dueDate >= '2026-06-01');
  assert.equal(apenasDoMes.length, 1, 'referência: só uma parcela vence de fato em junho');
});

test('P2 [caracterização, não especificação]: o backlog cresce com a distância do início', () => {
  const divida = dividaComParcelaResidual();
  const { ctx } = comDivida(divida, [], '2026-09-15T12:00:00');
  const previsto = ctx._debtPrevistoDoMes('2026-09');
  // Três meses depois do caso anterior, o bloco acumula três parcelas a mais.
  assert.equal(previsto.itens.length, 9);
  assert.equal(previsto.total, 1800);
});

test('_debtVencimentosNoPeriodo com fromISO explícito NÃO sofre do P2', () => {
  // O motor de janela está correto: o problema do P2 está em quem o chama sem
  // limite inferior. Este teste protege o motor enquanto o chamador é corrigido.
  const divida = dividaComParcelaResidual();
  const { ctx } = comDivida(divida, [], '2026-06-15T12:00:00');
  const itens = ctx._debtVencimentosNoPeriodo('2026-06-01', '2026-06-30');
  assert.equal(itens.length, 1);
  assert.equal(itens[0].dueDate, '2026-06-10');
});
