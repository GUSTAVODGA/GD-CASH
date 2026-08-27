// FICHA DO CLIENTE — os dados dele, todas as dívidas e o histórico de
// pagamentos. Um cliente pode ter várias dívidas ao mesmo tempo, e cada uma
// aparece inteira: termos, saldo, contagem de parcelas e próximo vencimento.

import { esc, cabecalhoSecao, estadoVazio } from '../dom.js';
import { icones } from '../icons.js';
import {
  trioDeValores, seloDivida, progressoDivida, termosDaDivida,
  fatosDaDivida, contadoresDeParcelas, linhaParcela,
} from '../pieces.js';
import { formatarReais } from '../../core/money.js';
import { formatarData, formatarDataCurta, comparar } from '../../core/dates.js';
import { estadoDoCliente } from '../../core/portfolio.js';
import { formatarTelefone } from '../../core/model.js';

// Quais dívidas estão com a lista de parcelas aberta. Estado de tela, não de
// dado — por isso vive aqui e não no armazenamento.
const parcelasAbertas = new Set();

export function telaCliente(ctx) {
  const cliente = ctx.store.cliente(ctx.params.id);
  if (!cliente) {
    return {
      titulo: 'Cliente',
      voltar: true,
      html: estadoVazio({
        icone: icones.alerta,
        titulo: 'Cliente não encontrado',
        texto: 'Ele pode ter sido removido neste aparelho.',
        botao: { acao: 'ir-clientes', rotulo: 'Ver clientes' },
      }),
    };
  }

  const estado = estadoDoCliente(cliente, ctx.pano);
  const dividas = [...estado.dividas].sort(ordenarDividas);
  const pagamentos = historicoDoCliente(ctx, dividas);

  return {
    titulo: cliente.nome,
    voltar: true,
    acaoTopo: { acao: 'editar-cliente', icone: icones.lapis, rotulo: 'Editar cliente' },
    html: `
      ${blocoContato(cliente)}

      ${estado.contagem.dividas > 0 ? trioDeValores([
        { rotulo: 'A receber', cents: estado.aReceberCents },
        { rotulo: 'Na rua', cents: estado.naRuaCents },
        { rotulo: 'Atrasado', cents: estado.atrasadoCents, tom: estado.atrasadoCents > 0 ? 'tom-negativo' : 'tom-fraco' },
      ]) : ''}

      <section class="secao">
        ${cabecalhoSecao('Dívidas', dividas.length > 0 ? `${estado.contagem.abertas} em aberto` : null)}
        ${dividas.length === 0
          ? estadoVazio({
              icone: icones.dividas,
              titulo: 'Nenhuma dívida registrada',
              texto: 'Cadastre a primeira dívida deste cliente.',
              botao: { acao: 'nova-divida', rotulo: 'Nova dívida', icone: icones.mais },
            })
          : dividas.map(d => cartaoDivida(d, ctx)).join('')}
      </section>

      ${dividas.length > 0 ? `<button class="botao botao-contorno botao-bloco" style="margin-top:12px"
        data-acao="nova-divida">${icones.mais}Nova dívida para ${esc(primeiroNome(cliente.nome))}</button>` : ''}

      ${pagamentos.length > 0 ? `<section class="secao">
        ${cabecalhoSecao('Histórico de pagamentos', `${formatarReais(estado.recebidoCents)} recebidos`)}
        <section class="cartao">${pagamentos.map(p => linhaPagamento(p)).join('')}</section>
      </section>` : ''}

      <section class="secao">
        <button class="botao botao-discreto" data-acao="excluir-cliente">${icones.lixeira}Excluir cliente</button>
      </section>
    `,
  };
}

function ordenarDividas(a, b) {
  if (a.quitada !== b.quitada) return a.quitada ? 1 : -1;
  if (a.emAtraso !== b.emAtraso) return a.emAtraso ? -1 : 1;
  if (a.proximoVencimento && b.proximoVencimento) return comparar(a.proximoVencimento, b.proximoVencimento);
  return 0;
}

function blocoContato(cliente) {
  const linhas = [
    cliente.telefone && { icone: icones.telefone, texto: formatarTelefone(cliente.telefone), link: `tel:${cliente.telefone.replace(/\D/g, '')}` },
    cliente.endereco && { icone: icones.local, texto: cliente.endereco },
    cliente.observacoes && { icone: icones.nota, texto: cliente.observacoes },
  ].filter(Boolean);

  if (linhas.length === 0) {
    return `<section class="cartao"><div class="linha">
      <span class="linha-corpo"><span class="linha-sub">Sem telefone, endereço ou observações cadastrados.</span></span>
      <span class="linha-fim"><button class="botao botao-discreto" data-acao="editar-cliente">Adicionar</button></span>
    </div></section>`;
  }

  return `<section class="cartao">${linhas.map(l => `
    <div class="linha">
      <span class="tom-fraco" style="display:flex">${l.icone}</span>
      <span class="linha-corpo">
        <span class="linha-titulo" style="font-weight:450;white-space:normal">${
          l.link ? `<a href="${esc(l.link)}" style="color:inherit;text-decoration:none">${esc(l.texto)}</a>` : esc(l.texto)
        }</span>
      </span>
    </div>`).join('')}</section>`;
}

function cartaoDivida(estado, ctx) {
  const aberta = parcelasAbertas.has(estado.dividaId);

  return `<section class="cartao">
    <div class="cartao-conteudo" style="padding-bottom:14px">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">
        <div>
          <div class="rotulo-mini">${esc(termosDaDivida(estado))}</div>
          <div class="valor valor-grande" style="margin-top:4px">${esc(formatarReais(estado.saldoCents))}</div>
          <div class="rotulo-mini" style="margin-top:2px">
            ${estado.quitada ? 'dívida quitada' : 'saldo restante'}
          </div>
        </div>
        ${seloDivida(estado)}
      </div>
      <div style="margin-top:14px">${progressoDivida(estado)}</div>
    </div>

    ${fatosDaDivida(estado)}
    ${contadoresDeParcelas(estado)}

    <div style="padding:0 16px 14px;display:flex;gap:8px">
      ${!estado.quitada ? `<button class="botao botao-primario" style="flex:1"
        data-acao="pagar" data-divida="${esc(estado.dividaId)}" data-parcela="${estado.proximaParcela.numero}">
        Registrar pagamento</button>` : ''}
      <button class="botao ${estado.quitada ? 'botao-bloco' : ''}" data-acao="alternar-parcelas" data-divida="${esc(estado.dividaId)}">
        ${aberta ? 'Ocultar' : 'Parcelas'}
      </button>
    </div>

    ${aberta ? `<div style="border-top:1px solid var(--linha)">
      ${estado.parcelas.map(p => linhaParcela(p, estado.dividaId, ctx.hoje)).join('')}
      <div style="padding:12px 16px;border-top:1px solid var(--linha)">
        <button class="botao botao-discreto" data-acao="excluir-divida" data-divida="${esc(estado.dividaId)}">
          ${icones.lixeira}Excluir dívida</button>
      </div>
    </div>` : ''}
  </section>`;
}

function historicoDoCliente(ctx, dividas) {
  const ids = new Set(dividas.map(d => d.dividaId));
  const porId = new Map(dividas.map(d => [d.dividaId, d]));

  return ctx.dados.pagamentos
    .filter(p => ids.has(p.dividaId))
    .map(p => ({ ...p, divida: porId.get(p.dividaId) }))
    .sort((a, b) => comparar(b.data, a.data) || (b.criadoEm - a.criadoEm));
}

function linhaPagamento(pagamento) {
  const divida = pagamento.divida;
  const descricao = pagamento.parcelaNumero
    ? `Parcela ${pagamento.parcelaNumero} de ${divida.contagem.total}`
    : 'Pagamento avulso';

  return `<button class="linha" data-acao="ver-pagamento" data-pagamento="${esc(pagamento.id)}">
    <span class="tom-fraco" style="display:flex">${icones.entrada}</span>
    <span class="linha-corpo">
      <span class="linha-titulo" style="font-weight:500">${esc(descricao)}</span>
      <span class="linha-sub">Dívida de ${esc(formatarReais(divida.baseCents))} · ${esc(formatarData(pagamento.data))}</span>
    </span>
    <span class="linha-fim">
      <span class="valor valor-medio tom-positivo">${esc(formatarReais(pagamento.valorCents))}</span>
      <span class="rotulo-mini">${esc(formatarDataCurta(pagamento.data))}</span>
    </span>
  </button>`;
}

function primeiroNome(nome) {
  return String(nome).trim().split(/\s+/)[0];
}

/** Abre ou fecha a lista de parcelas de uma dívida. */
export function alternarParcelas(dividaId) {
  if (parcelasAbertas.has(dividaId)) parcelasAbertas.delete(dividaId);
  else parcelasAbertas.add(dividaId);
}
