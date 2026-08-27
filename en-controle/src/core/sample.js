// Dados de exemplo — para conhecer o sistema antes de digitar dado real.
//
// Nada aqui é pessoa real: nomes genéricos, endereços inventados, valores
// redondos. O repositório é público, e nenhum dado de cliente pode entrar
// nele nem por engano.
//
// As datas são relativas a hoje, para que a operação de exemplo tenha sempre
// parcela vencida, parcela vencendo hoje e parcela futura — que é justamente o
// que a tela de Início existe para mostrar.

import { somarDias, somarMeses } from './dates.js';
import { novoId, VERSAO_DADOS } from './model.js';
import { TIPO_CAIXA } from './portfolio.js';

export function dadosDeExemplo(hojeIso) {
  const clientes = [
    { nome: 'Ana Ribeiro', telefone: '11987650001', endereco: 'Rua das Acácias, 120', observacoes: 'Prefere pagar aos sábados pela manhã.' },
    { nome: 'Bruno Tavares', telefone: '11987650002', endereco: 'Av. Central, 45 — fundos', observacoes: '' },
    { nome: 'Carla Nunes', telefone: '11987650003', endereco: 'Travessa São Jorge, 8', observacoes: 'Contato pelo telefone da filha.' },
    { nome: 'Diego Matos', telefone: '11987650004', endereco: '', observacoes: '' },
  ].map((c, i) => ({ ...c, id: novoId('cli'), criadoEm: Date.now() - (4 - i) * 86400000 }));

  const [ana, bruno, carla, diego] = clientes;

  const dividas = [
    // Em dia, mensal, com metade paga.
    {
      clienteId: ana.id, baseCents: 200000, jurosPercentual: 20,
      periodicidade: 'mensal', parcelas: 10,
      primeiroVencimento: somarMeses(hojeIso, -4), data: somarMeses(hojeIso, -5),
    },
    // Semanal, com uma parcela vencendo exatamente hoje.
    {
      clienteId: bruno.id, baseCents: 80000, jurosPercentual: 15,
      periodicidade: 'semanal', parcelas: 8,
      primeiroVencimento: somarDias(hojeIso, -21), data: somarDias(hojeIso, -23),
    },
    // Em atraso: três vencimentos passados e nada pago.
    {
      clienteId: carla.id, baseCents: 150000, jurosPercentual: 20,
      periodicidade: 'quinzenal', parcelas: 6,
      primeiroVencimento: somarDias(hojeIso, -45), data: somarDias(hojeIso, -47),
    },
    // Recém-criada, primeira parcela ainda por vir.
    {
      clienteId: diego.id, baseCents: 50000, jurosPercentual: 10,
      periodicidade: 'mensal', parcelas: 4,
      primeiroVencimento: somarDias(hojeIso, 9), data: somarDias(hojeIso, -1),
    },
    // Segunda dívida da Ana, simultânea à primeira.
    {
      clienteId: ana.id, baseCents: 60000, jurosPercentual: 15,
      periodicidade: 'quinzenal', parcelas: 4,
      primeiroVencimento: somarDias(hojeIso, 3), data: somarDias(hojeIso, -11),
    },
  ].map(d => ({ ...d, id: novoId('div'), observacao: '', criadoEm: Date.now(), origemDividaIds: [], substituidaPorId: null }));

  const [dividaAna, dividaBruno, , , ] = dividas;

  const pagamentos = [
    // Ana: cinco parcelas em dia, uma por mês.
    ...Array.from({ length: 5 }, (_, i) => ({
      dividaId: dividaAna.id,
      valorCents: 24000,
      data: somarMeses(dividaAna.primeiroVencimento, i),
      parcelaNumero: i + 1,
    })),
    // Bruno: três semanas pagas; a quarta vence hoje.
    ...Array.from({ length: 3 }, (_, i) => ({
      dividaId: dividaBruno.id,
      valorCents: 11500,
      data: somarDias(dividaBruno.primeiroVencimento, i * 7),
      parcelaNumero: i + 1,
    })),
  ].map((p, i) => ({ ...p, id: novoId('pag'), observacao: '', criadoEm: Date.now() + i }));

  const caixa = [{
    id: novoId('cx'),
    tipo: TIPO_CAIXA.APORTE,
    valorCents: 800000,
    data: somarMeses(hojeIso, -6),
    observacao: 'Capital inicial da operação',
    criadoEm: Date.now() - 1000,
  }];

  return { versao: VERSAO_DADOS, clientes, dividas, pagamentos, caixa, exemplo: true };
}
