// Projeção de vencimentos de dívida.
//
// Duas camadas:
//   1. Invariantes do motor de projeção (não pode criar nem sumir com dinheiro).
//   2. O recorte mensal de "A vencer no mês" e o resumo de atraso anterior,
//      que juntos particionam as parcelas pendentes sem sobreposição.
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
// P2 — "A vencer no mês" × atraso anterior
//
// Regra: as parcelas pendentes são PARTICIONADAS entre dois grupos disjuntos.
//
//   Bloco do mês  → dueDate dentro de [1º, último dia] do mês exibido.
//   Atraso        → dueDate < hoje  E  dueDate < 1º dia do mês exibido.
//
// A segunda condição do atraso é o que impede dupla contagem: uma parcela
// vencida DENTRO do mês exibido fica na lista daquele mês (com chip "Em
// atraso") e não entra no resumo.
// ══════════════════════════════════════════════════════════════════════════

// Dívida de 33 × 200 (com residual), 1ª parcela em 2026-01-10. Com o relógio em
// junho, seis parcelas já venceram (jan a jun) e nenhuma foi paga.
function comBacklog(pagamentos = [], agora = '2026-06-15T12:00:00') {
  return comDivida(dividaComParcelaResidual(), pagamentos, agora);
}

test('P2: o mês lista apenas parcelas que vencem nele', () => {
  const { ctx } = comBacklog();
  const previsto = ctx._debtPrevistoDoMes('2026-06');
  assert.equal(previsto.itens.length, 1, 'o mês não pode acumular parcelas anteriores');
  assert.equal(previsto.itens[0].dueDate, '2026-06-10');
  assert.equal(previsto.total, 200);
});

test('P2: o total do mês NÃO cresce conforme se navega para frente', () => {
  const { ctx } = comBacklog();
  for (const ym of ['2026-06', '2026-07', '2026-08', '2026-09', '2026-12']) {
    const p = ctx._debtPrevistoDoMes(ym);
    assert.equal(p.itens.length, 1, `${ym} deveria ter exatamente 1 parcela`);
    assert.equal(p.total, 200, `${ym} acumulou valor de outros meses`);
    assert.equal(p.itens[0].dueDate.slice(0, 7), ym, `${ym} listou parcela de outro mês`);
  }
});

test('P2: mês anterior também mostra só o que vencia nele', () => {
  const { ctx } = comBacklog();
  const maio = ctx._debtPrevistoDoMes('2026-05');
  assert.equal(maio.itens.length, 1);
  assert.equal(maio.itens[0].dueDate, '2026-05-10');
  assert.equal(maio.total, 200);
});

test('P2 BORDA: primeiro dia do mês pertence ao mês', () => {
  const noDia1 = dividaRedonda({ id: 'd-dia1', dataInicio: '2026-06-01' });
  const { ctx } = comDivida(noDia1, [], '2026-06-15T12:00:00');
  const junho = ctx._debtPrevistoDoMes('2026-06');
  assert.equal(junho.itens.length, 1);
  assert.equal(junho.itens[0].dueDate, '2026-06-01');
  // e não vaza para maio
  assert.equal(ctx._debtPrevistoDoMes('2026-05').itens.length, 0);
});

test('P2 BORDA: último dia do mês pertence ao mês', () => {
  const noUltimo = dividaRedonda({ id: 'd-ultimo', dataInicio: '2026-06-30' });
  const { ctx } = comDivida(noUltimo, [], '2026-06-15T12:00:00');
  const junho = ctx._debtPrevistoDoMes('2026-06');
  assert.equal(junho.itens.length, 1);
  assert.equal(junho.itens[0].dueDate, '2026-06-30');
  // e não vaza para julho
  assert.equal(ctx._debtPrevistoDoMes('2026-07').itens[0].dueDate, '2026-07-30');
});

test('P2 BORDA: fevereiro comum e 29/02 bissexto recortam certo', () => {
  const dv = dividaRedonda({ id: 'd-fev', dataInicio: '2028-01-31' });
  const { ctx } = comDivida(dv, [], '2028-02-10T12:00:00');
  const fev = ctx._debtPrevistoDoMes('2028-02');
  assert.equal(fev.itens.length, 1);
  assert.equal(fev.itens[0].dueDate, '2028-02-29', 'clamp deve cair no 29 em ano bissexto');

  const dv2 = dividaRedonda({ id: 'd-fev2', dataInicio: '2027-01-31' });
  const { ctx: ctxComum } = comDivida(dv2, [], '2027-02-10T12:00:00');
  const fevComum = ctxComum._debtPrevistoDoMes('2027-02');
  assert.equal(fevComum.itens.length, 1);
  assert.equal(fevComum.itens[0].dueDate, '2027-02-28', 'fevereiro comum fecha no 28');
});

test('P2: atraso anterior traz quantidade, total e a parcela mais antiga', () => {
  const { ctx } = comBacklog();
  const atraso = ctx._debtAtrasoAnteriorAoMes('2026-06');
  assert.equal(atraso.quantidade, 5, 'jan a mai; a de junho fica na lista do mês');
  assert.equal(atraso.total, 1000);
  assert.equal(atraso.maisAntiga, '2026-01-10');
});

test('P2 INVARIANTE: nenhuma parcela aparece no mês e no atraso ao mesmo tempo', () => {
  const { ctx } = comBacklog();
  for (const ym of ['2026-05', '2026-06', '2026-07', '2026-09']) {
    const mes = ctx._debtPrevistoDoMes(ym);
    const atraso = ctx._debtAtrasoAnteriorAoMes(ym);
    const idsMes = new Set(mes.itens.map(v => v.id));
    const repetidos = atraso.itens.filter(v => idsMes.has(v.id));
    assert.equal(repetidos.length, 0, `${ym} contou parcela duas vezes`);
  }
});

test('P2: parcela vencida DENTRO do mês fica na lista, não no resumo', () => {
  const { ctx } = comBacklog();
  const mes = ctx._debtPrevistoDoMes('2026-06');
  assert.equal(mes.itens[0].dueDate, '2026-06-10');
  assert.equal(mes.itens[0].atrasada, true, 'ela está vencida e deve poder exibir o chip');
  const atraso = ctx._debtAtrasoAnteriorAoMes('2026-06');
  assert.equal(atraso.itens.some(v => v.dueDate === '2026-06-10'), false);
});

test('P2: mês futuro não transforma parcelas intermediárias em atraso', () => {
  const { ctx } = comBacklog();
  const set = ctx._debtPrevistoDoMes('2026-09');
  const atraso = ctx._debtAtrasoAnteriorAoMes('2026-09');
  assert.equal(set.itens.length, 1);
  assert.equal(set.itens[0].dueDate, '2026-09-10');
  // Só as 6 já vencidas contra HOJE entram; julho e agosto ficam de fora dos dois.
  assert.equal(atraso.quantidade, 6);
  assert.equal(atraso.itens.every(v => v.dueDate < '2026-06-15'), true);
  assert.equal(atraso.itens.some(v => v.dueDate.startsWith('2026-07')), false);
  assert.equal(atraso.itens.some(v => v.dueDate.startsWith('2026-08')), false);
});

test('P2: pagamento parcial é contado uma única vez, pelo restante', () => {
  const { ctx } = comBacklog([{ id: 'pg', debtId: 'divida-residual', valor: 50, data: '2026-06-01' }]);
  const atraso = ctx._debtAtrasoAnteriorAoMes('2026-06');
  assert.equal(atraso.quantidade, 5);
  assert.equal(atraso.total, 950, '4 × 200 + o restante de 150 da parcela parcial');
  assert.equal(atraso.itens[0].valorNominal, 200);
  assert.equal(atraso.itens[0].valorRestante, 150);
});

test('P2: antecipação remove parcelas dos dois grupos', () => {
  // 1400 cobrem as parcelas 1 a 7 (a 7ª vence em 10/07).
  const { ctx } = comBacklog([{ id: 'pg', debtId: 'divida-residual', valor: 1400, data: '2026-06-01' }]);
  assert.equal(ctx._debtPrevistoDoMes('2026-06').itens.length, 0, 'junho já está coberto');
  assert.equal(ctx._debtAtrasoAnteriorAoMes('2026-06').quantidade, 0, 'não há mais atraso');
  const agosto = ctx._debtPrevistoDoMes('2026-08');
  assert.equal(agosto.itens.length, 1);
  assert.equal(agosto.itens[0].dueDate, '2026-08-10');
});

test('P2: dívida em dia não gera atraso nenhum', () => {
  const emDia = dividaRedonda({ id: 'd-ok', dataInicio: '2026-07-15' });
  const { ctx } = comDivida(emDia, [], '2026-06-15T12:00:00');
  assert.equal(ctx._debtAtrasoAnteriorAoMes('2026-06').quantidade, 0);
  assert.equal(ctx._debtPrevistoDoMes('2026-06').itens.length, 0);
  assert.equal(ctx._debtPrevistoDoMes('2026-07').itens.length, 1);
});

test('P2 INVARIANTE: total do mês + total em atraso <= saldo devedor', () => {
  const cenarios = [
    [[], '2026-06-15T12:00:00'],
    [[{ id: 'p1', debtId: 'divida-residual', valor: 50, data: '2026-06-01' }], '2026-06-15T12:00:00'],
    [[{ id: 'p2', debtId: 'divida-residual', valor: 1400, data: '2026-06-01' }], '2026-06-15T12:00:00'],
    [[{ id: 'p3', debtId: 'divida-residual', valor: 6500, data: '2026-06-01' }], '2026-06-15T12:00:00'],
  ];
  for (const [pagamentos, agora] of cenarios) {
    const { ctx, app } = comBacklog(pagamentos, agora);
    const saldo = ctx._debtSaldo(app.D.debts[0]);
    for (const ym of ['2026-05', '2026-06', '2026-09']) {
      const soma = ctx._debtPrevistoDoMes(ym).total + ctx._debtAtrasoAnteriorAoMes(ym).total;
      assert.equal(Math.round(soma * 100) <= Math.round(saldo * 100), true,
        `${ym}: mês + atraso (${soma}) excedeu o saldo (${saldo})`);
    }
  }
});

test('P2: ym inválido devolve estrutura vazia sem estourar', () => {
  const { ctx } = comBacklog();
  for (const ruim of ['', 'lixo', '2026', '2026-13-99']) {
    assert.equal(ctx._debtPrevistoDoMes(ruim).itens.length, 0, `previsto quebrou em "${ruim}"`);
    assert.equal(ctx._debtAtrasoAnteriorAoMes(ruim).quantidade, 0, `atraso quebrou em "${ruim}"`);
  }
});

// ── Blast radius: os demais consumidores não podem mudar ────────────────────

test('P2: Home e Central seguem com um compromisso por dívida', () => {
  const { ctx } = comBacklog();
  const porDivida = ctx._debtProximosPorDivida();
  assert.equal(porDivida.length, 1, 'uma dívida → um cartão, como antes');
  assert.equal(porDivida[0].dueDate, '2026-01-10', 'o mais antigo pendente segue sendo o 1º');
  assert.equal(porDivida[0].status, 'atrasada');
});

test('P2: a Semana continua listando o vencimento do dia', () => {
  const { ctx } = comBacklog();
  const dia = ctx._debtVencimentosNoPeriodo('2026-06-10', '2026-06-10');
  assert.equal(dia.length, 1);
  assert.equal(dia[0].dueDate, '2026-06-10');
  // e um dia sem vencimento continua vazio
  assert.equal(ctx._debtVencimentosNoPeriodo('2026-06-11', '2026-06-11').length, 0);
});

test('P2: o motor de projeção não foi alterado', () => {
  const { ctx, app } = comBacklog();
  const divida = app.D.debts[0];
  // Sem janela, continua projetando toda a dívida pendente.
  assert.equal(ctx._debtProjectVencimentos(divida, {}).length, 33);
  // Com janela explícita, continua respeitando os dois limites.
  const janela = ctx._debtProjectVencimentos(divida, { fromISO: '2026-06-01', toISO: '2026-06-30' });
  assert.equal(janela.length, 1);
  assert.equal(janela[0].dueDate, '2026-06-10');
});
