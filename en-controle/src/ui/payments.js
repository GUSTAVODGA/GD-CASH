// Registro de pagamento — a ação mais frequente do sistema, e por isso a que
// precisa custar menos toques: abre com o valor da parcela e a data de hoje já
// preenchidos, e um único botão resolve o caso comum.

import { abrirFolha, fecharFolha } from './sheet.js';
import { esc, avisar, tremer } from './dom.js';
import { formatarReais, formatarNumero, lerValor } from '../core/money.js';
import { formatarData, hoje as dataDeHoje } from '../core/dates.js';
import { estadoDaDivida } from '../core/debt.js';

/**
 * @param {object} ctx        contexto do app (store, atualizar…)
 * @param {string} dividaId
 * @param {number} numeroParcela
 */
export function abrirPagamento(ctx, dividaId, numeroParcela) {
  const divida = ctx.store.divida(dividaId);
  if (!divida) return;

  const estado = estadoDaDivida(divida, ctx.store.pagamentosDaDivida(dividaId), ctx.hoje);
  const parcela = estado.parcelas.find(p => p.numero === numeroParcela) || estado.proximaParcela;
  if (!parcela) return;

  const cliente = ctx.store.cliente(divida.clienteId);
  const sugerido = parcela.restanteCents;

  abrirFolha({
    titulo: 'Registrar pagamento',
    texto: `${cliente ? cliente.nome : 'Cliente'} · parcela ${parcela.numero} de ${estado.contagem.total} · ` +
           `vencimento ${formatarData(parcela.vencimento)}`,
    conteudo: `
      <div class="campo">
        <label class="campo-rotulo" for="pg-valor">Valor recebido</label>
        <div class="entrada-dinheiro">
          <span>R$</span>
          <input id="pg-valor" inputmode="decimal" autocomplete="off" value="${esc(formatarNumero(sugerido))}">
        </div>
        <p class="campo-dica">Parcela de ${esc(formatarReais(parcela.valorCents))}${
          parcela.pagoCents > 0 ? ` · já recebido ${esc(formatarReais(parcela.pagoCents))}` : ''
        }. Um valor maior avança para as próximas parcelas.</p>
      </div>

      <div class="campo">
        <label class="campo-rotulo" for="pg-data">Data do recebimento</label>
        <input class="entrada" id="pg-data" type="date" value="${esc(ctx.hoje)}" max="2100-12-31">
      </div>

      <div class="folha-acoes">
        <button class="botao botao-primario botao-bloco botao-alto" id="pg-confirmar">Confirmar recebimento</button>
        <button class="botao botao-bloco" id="pg-cancelar">Cancelar</button>
      </div>
    `,
    montar(folha) {
      const campoValor = folha.querySelector('#pg-valor');
      const campoData = folha.querySelector('#pg-data');

      campoValor.addEventListener('focus', () => campoValor.select());

      folha.querySelector('#pg-cancelar').addEventListener('click', fecharFolha);
      folha.querySelector('#pg-confirmar').addEventListener('click', () => {
        const valorCents = lerValor(campoValor.value);
        if (!valorCents || valorCents <= 0) {
          avisar('Informe um valor maior que zero.');
          campoValor.focus();
          return;
        }
        try {
          ctx.store.registrarPagamento({
            dividaId,
            valorCents,
            data: campoData.value || dataDeHoje(),
            parcelaNumero: parcela.numero,
          });
          fecharFolha();
          tremer();
          avisar(`Recebido ${formatarReais(valorCents)}.`);
          ctx.atualizar();
        } catch (erro) {
          avisar(erro.message);
        }
      });
    },
  });
}
