// Cadastro e edição de cliente. Um formulário só, usado nos dois casos: os
// campos são idênticos, e ter duas telas para a mesma coisa é como sistemas
// ficam grandes sem ficar melhores.

import { abrirFolha, fecharFolha } from './sheet.js';
import { esc, avisar } from './dom.js';

/**
 * @param {object} ctx
 * @param {object|null} clienteExistente  null para cadastro novo
 * @param {function} [aoSalvar]           recebe o cliente salvo
 */
export function abrirFormularioCliente(ctx, clienteExistente = null, aoSalvar) {
  const edicao = Boolean(clienteExistente);
  const c = clienteExistente || { nome: '', telefone: '', endereco: '', observacoes: '' };

  abrirFolha({
    titulo: edicao ? 'Editar cliente' : 'Novo cliente',
    conteudo: `
      <div class="campo">
        <label class="campo-rotulo" for="cl-nome">Nome</label>
        <input class="entrada" id="cl-nome" value="${esc(c.nome)}" autocomplete="name"
               enterkeyhint="next" placeholder="Nome do cliente">
      </div>
      <div class="campo">
        <label class="campo-rotulo" for="cl-telefone">Telefone</label>
        <input class="entrada" id="cl-telefone" value="${esc(c.telefone)}" inputmode="tel"
               autocomplete="tel" placeholder="(00) 00000-0000">
      </div>
      <div class="campo">
        <label class="campo-rotulo" for="cl-endereco">Endereço</label>
        <input class="entrada" id="cl-endereco" value="${esc(c.endereco)}" autocomplete="street-address"
               placeholder="Rua, número, bairro">
      </div>
      <div class="campo">
        <label class="campo-rotulo" for="cl-obs">Observações</label>
        <textarea class="entrada" id="cl-obs" placeholder="Referências, horários, o que ajudar na cobrança">${esc(c.observacoes)}</textarea>
      </div>

      <div class="folha-acoes">
        <button class="botao botao-primario botao-bloco botao-alto" id="cl-salvar">${edicao ? 'Salvar alterações' : 'Cadastrar cliente'}</button>
        <button class="botao botao-bloco" id="cl-cancelar">Cancelar</button>
      </div>
    `,
    montar(folha) {
      const ler = () => ({
        nome: folha.querySelector('#cl-nome').value,
        telefone: folha.querySelector('#cl-telefone').value,
        endereco: folha.querySelector('#cl-endereco').value,
        observacoes: folha.querySelector('#cl-obs').value,
      });

      folha.querySelector('#cl-cancelar').addEventListener('click', fecharFolha);
      folha.querySelector('#cl-salvar').addEventListener('click', () => {
        try {
          const campos = ler();
          const salvo = edicao
            ? ctx.store.editarCliente(clienteExistente.id, campos)
            : ctx.store.adicionarCliente(campos);
          fecharFolha();
          avisar(edicao ? 'Cliente atualizado.' : 'Cliente cadastrado.');
          ctx.atualizar();
          if (aoSalvar) aoSalvar(salvo);
        } catch (erro) {
          avisar(erro.message);
        }
      });
    },
  });
}
