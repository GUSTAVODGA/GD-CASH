// Peças visuais compartilhadas entre as telas. Ficam aqui para que o resumo
// financeiro e a linha de parcela sejam a MESMA coisa em toda tela onde
// aparecem — o que mantém o sistema parecendo um produto só.

import { esc, classes } from './dom.js';
import { icones } from './icons.js';
import { formatarReais, formatarPercentual } from '../core/money.js';
import { formatarDataCurta, distanciaEmPalavras } from '../core/dates.js';
import { SITUACAO } from '../core/debt.js';
import { SITUACAO_CLIENTE } from '../core/portfolio.js';
import { iniciais } from '../core/model.js';
import { rotuloPeriodicidade } from '../core/schedule.js';

/**
 * O resumo financeiro do topo: um valor grande, três de apoio, e uma faixa
 * fina que mostra a proporção do atraso. Compacto de propósito — ele informa
 * a situação sem tomar a tela.
 */
export function resumoFinanceiro(pano) {
  const aReceber = pano.aReceberCents;
  const atrasado = pano.atrasadoCents;
  const proporcaoAtraso = aReceber > 0 ? Math.min(100, (atrasado / aReceber) * 100) : 0;

  return `<section class="cartao">
    <div class="resumo-topo">
      <div class="resumo-principal">
        <div>
          <div class="resumo-caixa-rotulo">Em caixa</div>
          <div class="valor valor-gigante ${pano.emCaixaCents < 0 ? 'tom-negativo' : ''}">${esc(formatarReais(pano.emCaixaCents))}</div>
        </div>
      </div>
      ${aReceber > 0 ? `<div class="resumo-trilho">
        <span class="trilho-atraso" style="width:${proporcaoAtraso.toFixed(2)}%"></span>
        <span class="trilho-aberto" style="width:${(100 - proporcaoAtraso).toFixed(2)}%"></span>
      </div>` : ''}
    </div>
    <div class="resumo-grade">
      ${itemResumo('Na rua', pano.naRuaCents)}
      ${itemResumo('A receber', pano.aReceberCents)}
      ${itemResumo('Atrasado', pano.atrasadoCents, pano.atrasadoCents > 0 ? 'tom-negativo' : 'tom-fraco')}
    </div>
  </section>`;
}

function itemResumo(rotulo, cents, tom = '') {
  return `<div class="resumo-item">
    <span class="rotulo-mini">${esc(rotulo)}</span>
    <span class="valor valor-pequeno ${tom}">${esc(formatarReais(cents))}</span>
  </div>`;
}

/** Resumo de três números, sem o valor gigante. Usado na ficha do cliente. */
export function trioDeValores(itens) {
  return `<section class="cartao"><div class="resumo-grade">
    ${itens.map(i => itemResumo(i.rotulo, i.cents, i.tom || '')).join('')}
  </div></section>`;
}

/**
 * Uma parcela na agenda do Início: quem, qual parcela, quanto e quando.
 * O toque abre o registro de pagamento.
 */
export function linhaAgenda(item, hojeIso) {
  const atrasada = item.situacao === SITUACAO.ATRASADA;
  const quando = atrasada
    ? `${item.diasDeAtraso} ${item.diasDeAtraso === 1 ? 'dia' : 'dias'} de atraso`
    : distanciaEmPalavras(item.vencimento, hojeIso);

  return `<button class="linha com-avatar" data-acao="pagar" data-divida="${esc(item.dividaId)}" data-parcela="${item.numero}">
    <span class="avatar ${atrasada ? 'atraso' : ''}">${esc(iniciais(item.clienteNome))}</span>
    <span class="linha-corpo">
      <span class="linha-titulo">${esc(item.clienteNome)}</span>
      <span class="linha-sub">Parcela ${item.numero}/${item.totalParcelas} · ${esc(formatarDataCurta(item.vencimento))}${item.parcial ? ' · parcial' : ''}</span>
    </span>
    <span class="linha-fim">
      <span class="valor valor-medio">${esc(formatarReais(item.restanteCents))}</span>
      <span class="rotulo-mini ${atrasada ? 'tom-negativo' : ''}">${esc(quando)}</span>
    </span>
  </button>`;
}

/** Lista de agenda com corte e contagem do que ficou de fora. */
export function listaAgenda(itens, hojeIso, limite = 4) {
  const visiveis = itens.slice(0, limite);
  const restantes = itens.length - visiveis.length;
  return `<section class="cartao">
    ${visiveis.map(i => linhaAgenda(i, hojeIso)).join('')}
    ${restantes > 0 ? `<div class="linha"><span class="linha-corpo"><span class="linha-sub">
      e mais ${restantes} ${restantes === 1 ? 'parcela' : 'parcelas'}
    </span></span></div>` : ''}
  </section>`;
}

/** Selo de situação financeira do cliente. */
export function seloCliente(situacao) {
  const info = SITUACAO_CLIENTE[situacao] || SITUACAO_CLIENTE['sem-dividas'];
  return `<span class="selo ponto ${esc(info.tom)}">${esc(info.rotulo)}</span>`;
}

/** Selo de situação de uma dívida. */
export function seloDivida(estado) {
  if (estado.quitada) return '<span class="selo quitado ponto">Quitada</span>';
  if (estado.emAtraso) {
    const n = estado.contagem.atrasadas;
    return `<span class="selo atraso ponto">${n} em atraso</span>`;
  }
  return '<span class="selo ponto">Em dia</span>';
}

/** Barra de progresso das parcelas pagas. */
export function progressoDivida(estado) {
  const feito = estado.totalCents > 0 ? (estado.aplicadoCents / estado.totalCents) * 100 : 0;
  return `<div class="progresso ${estado.emAtraso ? 'atraso' : ''}">
    <span style="width:${Math.max(0, Math.min(100, feito)).toFixed(2)}%"></span>
  </div>`;
}

/** Linha "Valor · Juros · Total" que descreve os termos combinados. */
export function termosDaDivida(estado) {
  return `${formatarReais(estado.baseCents)} + ${formatarPercentual(estado.jurosPercentual)} · ` +
    `${rotuloPeriodicidade(estado.periodicidade)} · ${estado.contagem.total}×`;
}

/** Uma parcela na ficha da dívida. */
export function linhaParcela(parcela, dividaId, hojeIso) {
  const paga = parcela.situacao === SITUACAO.PAGA;
  const atrasada = parcela.situacao === SITUACAO.ATRASADA;
  const hoje = parcela.situacao === SITUACAO.HOJE;

  const sub = paga
    ? (parcela.quitadaEm ? `Paga em ${formatarDataCurta(parcela.quitadaEm)}` : 'Paga')
    : atrasada
      ? `Venceu ${distanciaEmPalavras(parcela.vencimento, hojeIso)}`
      : hoje
        ? 'Vence hoje'
        : distanciaEmPalavras(parcela.vencimento, hojeIso);

  // Parcela paga não é botão: desfazer um recebimento é um ato do histórico de
  // pagamentos, onde se vê exatamente qual lançamento está sendo removido.
  const etiqueta = paga ? 'div' : 'button';
  const gatilho = paga ? '' : ` data-acao="pagar" data-divida="${esc(dividaId)}" data-parcela="${parcela.numero}"`;

  return `<${etiqueta} class="parcela ${classes(paga && 'paga', atrasada && 'atrasada')}"${gatilho}>
    <span class="parcela-numero">${paga ? icones.cheque : parcela.numero}</span>
    <span class="parcela-info">
      <span>${esc(formatarDataCurta(parcela.vencimento))}</span>
      <span class="parcela-sub ${atrasada ? 'tom-negativo' : ''}">${esc(sub)}${parcela.parcial ? ` · falta ${formatarReais(parcela.restanteCents)}` : ''}</span>
    </span>
    <span class="parcela-valor">${esc(formatarReais(parcela.valorCents))}</span>
  </${etiqueta}>`;
}

/** Grade de fatos da dívida — os campos que o pedido exige ver com clareza. */
export function fatosDaDivida(estado) {
  const fato = (rotulo, valor, tom = '') =>
    `<div class="fato"><span class="rotulo-mini">${esc(rotulo)}</span>
      <span class="fato-valor ${tom}">${esc(valor)}</span></div>`;

  return `<div class="fatos">
    ${fato('Valor original', formatarReais(estado.baseCents))}
    ${fato('Juros', `${formatarPercentual(estado.jurosPercentual)} · ${formatarReais(estado.jurosCents)}`)}
    ${fato('Valor total', formatarReais(estado.totalCents))}
    ${fato('Recebido', formatarReais(estado.aplicadoCents))}
    ${fato('Periodicidade', rotuloPeriodicidade(estado.periodicidade))}
    ${fato('Próximo vencimento', estado.proximoVencimento ? formatarDataCurta(estado.proximoVencimento) : '—')}
  </div>`;
}

/** Contagem de parcelas: pagas, pendentes e atrasadas. */
export function contadoresDeParcelas(estado) {
  return `<div class="contadores">
    <span class="contador"><b>${estado.contagem.pagas}</b><span>pagas</span></span>
    <span class="contador"><b>${estado.contagem.pendentes}</b><span>pendentes</span></span>
    <span class="contador ${estado.contagem.atrasadas > 0 ? 'tom-negativo' : ''}">
      <b>${estado.contagem.atrasadas}</b><span>atrasadas</span></span>
  </div>`;
}
