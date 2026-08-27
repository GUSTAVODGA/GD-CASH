// CLIENTES — lista com busca. Cada linha diz o essencial: quem é, como está e
// quanto ainda deve.

import { esc, estadoVazio } from '../dom.js';
import { icones } from '../icons.js';
import { seloCliente } from '../pieces.js';
import { formatarReais } from '../../core/money.js';
import { formatarDataCurta } from '../../core/dates.js';
import { estadoDoCliente } from '../../core/portfolio.js';
import { iniciais, formatarTelefone } from '../../core/model.js';

// A busca vive fora do estado do app de propósito: é preferência de momento,
// não dado. Some ao sair da tela, como deve.
let termoDeBusca = '';

export function telaClientes(ctx) {
  const clientes = ctx.dados.clientes
    .map(c => estadoDoCliente(c, ctx.pano))
    .sort(ordenar);

  const filtrados = filtrar(clientes, termoDeBusca);

  return {
    titulo: 'Clientes',
    acaoTopo: { acao: 'novo-cliente', icone: icones.mais, rotulo: 'Novo cliente' },
    html: clientes.length === 0 ? semClientes() : `
      <div class="busca" style="margin:4px 0 14px">
        ${icones.busca}
        <input class="entrada" id="busca-clientes" type="search" placeholder="Buscar por nome ou telefone"
               value="${esc(termoDeBusca)}" autocomplete="off" enterkeyhint="search">
      </div>
      ${filtrados.length === 0 ? semResultado(termoDeBusca) : `
        <section class="cartao">${filtrados.map(linhaCliente).join('')}</section>
        <p class="nota">${filtrados.length} de ${clientes.length} ${clientes.length === 1 ? 'cliente' : 'clientes'}</p>
      `}
    `,
    aoMontar(raiz) {
      const campo = raiz.querySelector('#busca-clientes');
      if (!campo) return;
      campo.addEventListener('input', () => {
        termoDeBusca = campo.value;
        ctx.atualizar({ manterFoco: '#busca-clientes' });
      });
    },
  };
}

/** Ordem útil: quem está em atraso primeiro, depois quem deve mais. */
function ordenar(a, b) {
  const pesoA = a.situacao === 'atrasado' ? 0 : a.aReceberCents > 0 ? 1 : 2;
  const pesoB = b.situacao === 'atrasado' ? 0 : b.aReceberCents > 0 ? 1 : 2;
  if (pesoA !== pesoB) return pesoA - pesoB;
  if (a.aReceberCents !== b.aReceberCents) return b.aReceberCents - a.aReceberCents;
  return a.cliente.nome.localeCompare(b.cliente.nome, 'pt-BR');
}

function filtrar(lista, termo) {
  const limpo = termo.trim().toLowerCase();
  if (!limpo) return lista;
  const digitos = limpo.replace(/\D/g, '');
  return lista.filter(({ cliente }) =>
    cliente.nome.toLowerCase().includes(limpo) ||
    (digitos.length >= 3 && cliente.telefone.replace(/\D/g, '').includes(digitos))
  );
}

function linhaCliente(estado) {
  const { cliente } = estado;
  const emAtraso = estado.situacao === 'atrasado';

  const sub = estado.contagem.abertas > 0
    ? `${estado.contagem.abertas} ${estado.contagem.abertas === 1 ? 'dívida' : 'dívidas'}` +
      (estado.proximoVencimento ? ` · próx. ${formatarDataCurta(estado.proximoVencimento)}` : '')
    : cliente.telefone
      ? formatarTelefone(cliente.telefone)
      : 'Sem dívidas abertas';

  return `<button class="linha com-avatar" data-acao="abrir-cliente" data-cliente="${esc(cliente.id)}">
    <span class="avatar ${emAtraso ? 'atraso' : ''}">${esc(iniciais(cliente.nome))}</span>
    <span class="linha-corpo">
      <span class="linha-titulo">${esc(cliente.nome)}</span>
      <span class="linha-sub">${esc(sub)}</span>
    </span>
    <span class="linha-fim">
      <span class="valor valor-medio ${emAtraso ? 'tom-negativo' : ''}">${esc(formatarReais(estado.aReceberCents))}</span>
      ${seloCliente(estado.situacao)}
    </span>
  </button>`;
}

function semClientes() {
  return estadoVazio({
    icone: icones.clientes,
    titulo: 'Nenhum cliente ainda',
    texto: 'Os clientes são a base de tudo: cada dívida pertence a um deles.',
    botao: { acao: 'novo-cliente', rotulo: 'Cadastrar cliente', icone: icones.mais },
  });
}

function semResultado(termo) {
  return estadoVazio({
    icone: icones.busca,
    titulo: 'Nada encontrado',
    texto: `Nenhum cliente corresponde a "${termo.trim()}".`,
  });
}
