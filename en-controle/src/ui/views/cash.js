// CAIXA — de onde vem e para onde vai o dinheiro da operação.
//
// O saldo em caixa é um acumulado simples, e a tela mostra a conta inteira em
// vez de pedir fé: aportes menos retiradas, menos o que foi emprestado, mais o
// que foi recebido. O extrato abaixo é essa mesma conta, item a item.

import { esc, cabecalhoSecao, estadoVazio, avisar, tremer } from '../dom.js';
import { icones } from '../icons.js';
import { abrirFolha, fecharFolha, confirmar } from '../sheet.js';
import { formatarReais, lerValor } from '../../core/money.js';
import { formatarData, formatarDataCurta, comparar, hoje as dataDeHoje } from '../../core/dates.js';
import { TIPO_CAIXA } from '../../core/portfolio.js';

const LIMITE_EXTRATO = 40;

export function telaCaixa(ctx) {
  const pano = ctx.pano;
  const extrato = montarExtrato(ctx).slice(0, LIMITE_EXTRATO);
  const total = contarMovimentos(ctx);

  return {
    titulo: 'Caixa',
    html: `
      <section class="cartao">
        <div class="resumo-topo">
          <div class="resumo-principal">
            <div>
              <div class="resumo-caixa-rotulo">Em caixa</div>
              <div class="valor valor-gigante ${pano.emCaixaCents < 0 ? 'tom-negativo' : ''}">${esc(formatarReais(pano.emCaixaCents))}</div>
            </div>
          </div>
        </div>
        <div class="fatos">
          ${fato('Aportes', formatarReais(pano.aportesCents))}
          ${fato('Retiradas', formatarReais(pano.retiradasCents))}
          ${fato('Emprestado', formatarReais(pano.emprestadoCents))}
          ${fato('Recebido', formatarReais(pano.recebidoCents))}
        </div>
      </section>

      <p class="nota">
        Em caixa = aportes − retiradas − emprestado + recebido.
        O que está com os clientes aparece em <b>Na rua</b>, no Início.
      </p>

      <div class="acoes-duplas">
        <button class="botao botao-contorno" data-acao="novo-aporte">${icones.entrada}Aporte</button>
        <button class="botao botao-contorno" data-acao="nova-retirada">${icones.saida}Retirada</button>
      </div>

      ${pano.emCaixaCents < 0 && pano.aportesCents === 0 ? `<p class="nota" style="margin-top:14px">
        O caixa está negativo porque há capital emprestado sem origem registrada.
        Se esse dinheiro já era da operação, registre um aporte com o valor inicial.
      </p>` : ''}

      <section class="secao">
        ${cabecalhoSecao('Extrato', total > 0 ? `${total} ${total === 1 ? 'movimento' : 'movimentos'}` : null)}
        ${extrato.length === 0
          ? estadoVazio({
              icone: icones.caixa,
              titulo: 'Nenhum movimento ainda',
              texto: 'Empréstimos, recebimentos, aportes e retiradas aparecem aqui em ordem de data.',
            })
          : `<section class="cartao">${extrato.map(linhaExtrato).join('')}</section>`}
        ${total > extrato.length ? `<p class="nota">Mostrando os ${extrato.length} mais recentes.</p>` : ''}
      </section>

      <section class="secao">
        ${ctx.dados.exemplo
          ? `<button class="botao botao-discreto" data-acao="limpar-exemplo">${icones.lixeira}Limpar dados de exemplo</button>`
          : `<button class="botao botao-discreto" data-acao="carregar-exemplo">Ver com dados de exemplo</button>`}
      </section>
    `,
  };
}

function fato(rotulo, valor) {
  return `<div class="fato"><span class="rotulo-mini">${esc(rotulo)}</span>
    <span class="fato-valor">${esc(valor)}</span></div>`;
}

/**
 * O extrato une o que foi lançado à mão (aportes e retiradas) com o que é
 * consequência de outra coisa (empréstimos e recebimentos). Os dois últimos
 * não são gravados como movimento: são derivados das dívidas e dos pagamentos,
 * o que garante que o extrato jamais discorde do saldo.
 */
function montarExtrato(ctx) {
  const nome = id => {
    const c = ctx.store.cliente(id);
    return c ? c.nome : 'Cliente removido';
  };

  const movimentos = [
    ...ctx.dados.caixa.map(m => ({
      id: m.id,
      removivel: true,
      data: m.data,
      criadoEm: m.criadoEm,
      valorCents: m.tipo === TIPO_CAIXA.APORTE ? m.valorCents : -m.valorCents,
      titulo: m.tipo === TIPO_CAIXA.APORTE ? 'Aporte' : 'Retirada',
      sub: m.observacao || formatarData(m.data),
      icone: m.tipo === TIPO_CAIXA.APORTE ? icones.entrada : icones.saida,
    })),
    ...ctx.dados.dividas.map(d => ({
      id: d.id,
      removivel: false,
      data: d.data,
      criadoEm: d.criadoEm,
      valorCents: -d.baseCents,
      titulo: 'Empréstimo',
      sub: nome(d.clienteId),
      icone: icones.saida,
    })),
    ...ctx.dados.pagamentos.map(p => {
      const divida = ctx.store.divida(p.dividaId);
      return {
        id: p.id,
        removivel: false,
        data: p.data,
        criadoEm: p.criadoEm,
        valorCents: p.valorCents,
        titulo: 'Recebimento',
        sub: divida ? nome(divida.clienteId) : 'Cliente removido',
        icone: icones.entrada,
      };
    }),
  ];

  return movimentos.sort((a, b) => comparar(b.data, a.data) || (b.criadoEm - a.criadoEm));
}

function contarMovimentos(ctx) {
  return ctx.dados.caixa.length + ctx.dados.dividas.length + ctx.dados.pagamentos.length;
}

function linhaExtrato(m) {
  const positivo = m.valorCents > 0;
  const conteudo = `
    <span class="tom-fraco" style="display:flex">${m.icone}</span>
    <span class="linha-corpo">
      <span class="linha-titulo" style="font-weight:500">${esc(m.titulo)}</span>
      <span class="linha-sub">${esc(m.sub)}</span>
    </span>
    <span class="linha-fim">
      <span class="valor valor-medio ${positivo ? 'tom-positivo' : ''}">${
        positivo ? '+ ' : '− '}${esc(formatarReais(Math.abs(m.valorCents)))}</span>
      <span class="rotulo-mini">${esc(formatarDataCurta(m.data))}</span>
    </span>`;

  return m.removivel
    ? `<button class="linha" data-acao="ver-movimento" data-movimento="${esc(m.id)}">${conteudo}</button>`
    : `<div class="linha">${conteudo}</div>`;
}

// ── ações da tela ─────────────────────────────────────────────────────────

export const acoesCaixa = {
  'novo-aporte'(alvo, ctx) { abrirMovimento(ctx, TIPO_CAIXA.APORTE); },
  'nova-retirada'(alvo, ctx) { abrirMovimento(ctx, TIPO_CAIXA.RETIRADA); },

  'ver-movimento'(alvo, ctx) {
    const movimento = ctx.dados.caixa.find(m => m.id === alvo.dataset.movimento);
    if (!movimento) return;
    const aporte = movimento.tipo === TIPO_CAIXA.APORTE;

    confirmar({
      titulo: `${aporte ? 'Aporte' : 'Retirada'} de ${formatarReais(movimento.valorCents)}`,
      texto: `${formatarData(movimento.data)}${movimento.observacao ? ` · ${movimento.observacao}` : ''}. ` +
             'Remover este lançamento recalcula o saldo em caixa.',
      rotuloConfirmar: 'Remover lançamento',
      perigo: true,
      aoConfirmar() {
        ctx.store.removerMovimentoCaixa(movimento.id);
        avisar('Lançamento removido.');
        ctx.atualizar();
      },
    });
  },
};

function abrirMovimento(ctx, tipo) {
  const aporte = tipo === TIPO_CAIXA.APORTE;

  abrirFolha({
    titulo: aporte ? 'Registrar aporte' : 'Registrar retirada',
    texto: aporte
      ? 'Dinheiro que entra no caixa da operação — capital próprio dos sócios.'
      : 'Dinheiro que sai do caixa e não é empréstimo — retirada de lucro, por exemplo.',
    conteudo: `
      <div class="campo">
        <label class="campo-rotulo" for="cx-valor">Valor</label>
        <div class="entrada-dinheiro">
          <span>R$</span>
          <input id="cx-valor" inputmode="decimal" autocomplete="off" placeholder="0,00">
        </div>
      </div>
      <div class="campo">
        <label class="campo-rotulo" for="cx-data">Data</label>
        <input class="entrada" id="cx-data" type="date" value="${esc(ctx.hoje)}" max="2100-12-31">
      </div>
      <div class="campo">
        <label class="campo-rotulo" for="cx-obs">Observação</label>
        <input class="entrada" id="cx-obs" placeholder="Opcional">
      </div>
      <div class="folha-acoes">
        <button class="botao botao-primario botao-bloco botao-alto" id="cx-salvar">
          ${aporte ? 'Registrar aporte' : 'Registrar retirada'}</button>
        <button class="botao botao-bloco" id="cx-cancelar">Cancelar</button>
      </div>
    `,
    montar(folha) {
      folha.querySelector('#cx-cancelar').addEventListener('click', fecharFolha);
      folha.querySelector('#cx-salvar').addEventListener('click', () => {
        const valorCents = lerValor(folha.querySelector('#cx-valor').value);
        if (!valorCents || valorCents <= 0) {
          avisar('Informe um valor maior que zero.');
          return;
        }
        try {
          ctx.store.registrarMovimentoCaixa({
            tipo,
            valorCents,
            data: folha.querySelector('#cx-data').value || dataDeHoje(),
            observacao: folha.querySelector('#cx-obs').value,
          });
          fecharFolha();
          tremer();
          avisar(`${aporte ? 'Aporte' : 'Retirada'} de ${formatarReais(valorCents)} registrado.`);
          ctx.atualizar();
        } catch (erro) {
          avisar(erro.message);
        }
      });
    },
  });
}
