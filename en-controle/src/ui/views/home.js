// INÍCIO — a tela que responde "como está a operação hoje?" numa olhada.
//
// A ordem é deliberada: primeiro o resumo compacto, depois o que exige ação
// hoje (vencendo e atrasado), e só então o que ainda vem. Nada de quatro
// cartões gigantes: os quatro números moram em um cartão só, e o resto da tela
// é a agenda do dia.

import { esc, cabecalhoSecao, estadoVazio } from '../dom.js';
import { icones } from '../icons.js';
import { resumoFinanceiro, listaAgenda } from '../pieces.js';
import { formatarReais } from '../../core/money.js';
import { formatarDataExtenso, diaDaSemana } from '../../core/dates.js';

export function telaInicio(ctx) {
  const pano = ctx.pano;
  const vazia = ctx.dados.clientes.length === 0;

  return {
    titulo: 'EN Controle',
    html: vazia ? primeiraVez() : conteudo(ctx, pano),
  };
}

function conteudo(ctx, pano) {
  const { atrasadas, hoje: vencendoHoje, proximas } = pano.agenda;

  return `
    ${ctx.dados.exemplo ? faixaExemplo() : ''}

    <p class="nota" style="margin:0 0 12px;padding-left:4px">
      ${esc(capitalizar(diaDaSemana(ctx.hoje)))}, ${esc(formatarDataExtenso(ctx.hoje))}
    </p>

    ${resumoFinanceiro(pano)}

    <div class="acoes-duplas">
      <button class="botao botao-primario" data-acao="nova-divida">${icones.mais}Nova dívida</button>
      <button class="botao botao-contorno" data-acao="novo-cliente">${icones.pessoa}Novo cliente</button>
    </div>

    ${vencendoHoje.length > 0 ? `<section class="secao">
      ${cabecalhoSecao('Vence hoje', formatarReais(pano.venceHojeCents))}
      ${listaAgenda(vencendoHoje, ctx.hoje, 5)}
    </section>` : ''}

    ${atrasadas.length > 0 ? `<section class="secao">
      ${cabecalhoSecao('Em atraso', formatarReais(pano.atrasadoCents))}
      ${listaAgenda(atrasadas, ctx.hoje, 5)}
    </section>` : ''}

    ${proximas.length > 0 ? `<section class="secao">
      ${cabecalhoSecao('Próximos vencimentos')}
      ${listaAgenda(proximas, ctx.hoje, 5)}
    </section>` : ''}

    ${semAgenda(atrasadas, vencendoHoje, proximas) ? `<section class="secao">
      ${estadoVazio({
        icone: icones.cheque,
        titulo: 'Nenhuma parcela em aberto',
        texto: 'Tudo o que foi cadastrado está quitado. Cadastre uma nova dívida quando emprestar de novo.',
      })}
    </section>` : ''}
  `;
}

function semAgenda(atrasadas, hoje, proximas) {
  return atrasadas.length === 0 && hoje.length === 0 && proximas.length === 0;
}

function primeiraVez() {
  return `
    ${estadoVazio({
      icone: icones.dividas,
      titulo: 'Comece cadastrando um cliente',
      texto: 'Depois é só registrar a dívida: valor, juros, periodicidade e a data da primeira parcela. O restante o sistema calcula.',
      botao: { acao: 'novo-cliente', rotulo: 'Cadastrar cliente', icone: icones.mais },
    })}
    <p class="nota" style="text-align:center;max-width:34ch;margin:4px auto 0">
      Já tem dinheiro na rua? Registre um aporte em Caixa para o saldo refletir o capital da operação.
    </p>
  `;
}

function faixaExemplo() {
  return `<div class="faixa-exemplo">
    ${icones.alerta}
    <span>Você está vendo dados de exemplo.</span>
    <button data-acao="limpar-exemplo">Limpar</button>
  </div>`;
}

function capitalizar(texto) {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
