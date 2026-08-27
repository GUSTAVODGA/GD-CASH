// ══════════════════════════════════════════════════════════════════════════
// EN CONTROLE — montagem do aplicativo
//
// Um ciclo só, e sempre o mesmo: rota + dados → panorama → tela. Qualquer
// mudança de dado chama `atualizar()`, que refaz o panorama do zero e redesenha.
// Não há estado espalhado nem tela que se atualiza sozinha por um caminho
// próprio — é isso que mantém o que está na tela sempre igual ao que está
// gravado.
// ══════════════════════════════════════════════════════════════════════════

import { criarStore } from './core/store.js';
import { panorama } from './core/portfolio.js';
import { hoje as dataDeHoje } from './core/dates.js';
import { formatarReais } from './core/money.js';
import { dadosDeExemplo } from './core/sample.js';

import { esc, avisar } from './ui/dom.js';
import { icones } from './ui/icons.js';
import { confirmar, fecharFolha, folhaAberta } from './ui/sheet.js';
import { abrirPagamento } from './ui/payments.js';
import { abrirFormularioCliente } from './ui/client-form.js';

import { telaInicio } from './ui/views/home.js';
import { telaClientes } from './ui/views/clients.js';
import { telaCliente, alternarParcelas } from './ui/views/client.js';
import { telaNovaDivida, prepararNovaDivida, acoesNovaDivida } from './ui/views/new-debt.js';
import { telaCaixa, acoesCaixa } from './ui/views/cash.js';

const store = criarStore();

const ABAS = [
  { rota: '#/', nome: 'inicio', rotulo: 'Início', icone: icones.inicio },
  { rota: '#/clientes', nome: 'clientes', rotulo: 'Clientes', icone: icones.clientes },
  { rota: '#/caixa', nome: 'caixa', rotulo: 'Caixa', icone: icones.caixa },
];

const TELAS = {
  inicio: telaInicio,
  clientes: telaClientes,
  cliente: telaCliente,
  'nova-divida': telaNovaDivida,
  caixa: telaCaixa,
};

// ── rota ──────────────────────────────────────────────────────────────────

function lerRota() {
  const bruto = (location.hash || '#/').replace(/^#/, '');
  const [caminho, consulta] = bruto.split('?');
  const partes = caminho.split('/').filter(Boolean);
  const busca = new URLSearchParams(consulta || '');

  if (partes.length === 0) return { nome: 'inicio', params: {} };
  if (partes[0] === 'clientes') return { nome: 'clientes', params: {} };
  if (partes[0] === 'caixa') return { nome: 'caixa', params: {} };
  if (partes[0] === 'cliente' && partes[1]) return { nome: 'cliente', params: { id: partes[1] } };
  if (partes[0] === 'nova-divida') return { nome: 'nova-divida', params: { cliente: busca.get('cliente') } };
  return { nome: 'inicio', params: {} };
}

function ir(rota, { substituir = false } = {}) {
  if (substituir) location.replace(rota);
  else location.hash = rota;
}

// ── contexto ──────────────────────────────────────────────────────────────

function contexto() {
  const dados = store.estado();
  const hoje = dataDeHoje();
  return {
    store,
    dados,
    hoje,
    pano: panorama(dados, hoje),
    rota: lerRota(),
    params: lerRota().params,
    ir,
    atualizar,
  };
}

// ── desenho ───────────────────────────────────────────────────────────────

const elTopo = document.getElementById('topo');
const elTela = document.getElementById('tela');
const elAbas = document.getElementById('abas');

let rotaDesenhada = null;

function atualizar({ manterFoco = null } = {}) {
  desenhar({ manterFoco, preservarRolagem: true });
}

function desenhar({ manterFoco = null, preservarRolagem = false } = {}) {
  const ctx = contexto();
  const construir = TELAS[ctx.rota.nome] || telaInicio;

  let tela;
  try {
    tela = construir(ctx);
  } catch (erro) {
    // Uma tela nunca deve derrubar o aplicativo inteiro: o usuário continua
    // navegando, e o erro aparece onde dá para lê-lo.
    console.error(erro);
    tela = {
      titulo: 'Erro',
      html: `<div class="vazio"><div class="vazio-titulo">Não foi possível montar esta tela</div>
        <p class="vazio-texto">${esc(erro.message)}</p></div>`,
    };
  }

  const rolagem = preservarRolagem ? window.scrollY : 0;

  elTopo.innerHTML = `
    ${tela.voltar ? `<button class="topo-acao voltar" data-acao="voltar" aria-label="Voltar">${icones.esquerda}</button>` : ''}
    <span class="topo-titulo">${esc(tela.titulo)}</span>
    ${tela.acaoTopo ? `<button class="topo-acao" data-acao="${esc(tela.acaoTopo.acao)}"
      aria-label="${esc(tela.acaoTopo.rotulo)}">${tela.acaoTopo.icone}</button>` : ''}
  `;

  elTela.innerHTML = tela.html;
  elTela.classList.toggle('sem-abas', Boolean(tela.semAbas));

  elAbas.hidden = Boolean(tela.semAbas);
  elAbas.innerHTML = tela.semAbas ? '' : `<div class="abas-interno">${ABAS.map(aba => `
    <button class="aba" data-acao="ir-aba" data-rota="${esc(aba.rota)}"
      ${aba.nome === ctx.rota.nome ? 'aria-current="page"' : ''}>
      ${aba.icone}<span>${esc(aba.rotulo)}</span>
    </button>`).join('')}</div>`;

  if (tela.aoMontar) tela.aoMontar(elTela, ctx);

  window.scrollTo(0, rolagem);
  atualizarSombraDoTopo();

  if (manterFoco) {
    const campo = elTela.querySelector(manterFoco);
    if (campo) {
      campo.focus();
      const fim = campo.value ? campo.value.length : 0;
      try { campo.setSelectionRange(fim, fim); } catch { /* nem todo tipo de campo aceita */ }
    }
  }

  rotaDesenhada = ctx.rota.nome;
}

function atualizarSombraDoTopo() {
  elTopo.classList.toggle('rolado', window.scrollY > 4);
}

// ── ações globais ─────────────────────────────────────────────────────────

const ACOES = {
  voltar() {
    if (history.length > 1) history.back();
    else ir('#/');
  },

  'ir-aba'(alvo) {
    ir(alvo.dataset.rota);
  },

  'ir-clientes'() { ir('#/clientes'); },

  'abrir-cliente'(alvo) {
    ir(`#/cliente/${alvo.dataset.cliente}`);
  },

  'nova-divida'(alvo, ctx) {
    const clienteId = alvo.dataset.cliente || (ctx.rota.nome === 'cliente' ? ctx.params.id : null);
    prepararNovaDivida(clienteId);
    ir(clienteId ? `#/nova-divida?cliente=${clienteId}` : '#/nova-divida');
  },

  'novo-cliente'(alvo, ctx) {
    abrirFormularioCliente(ctx, null, cliente => ir(`#/cliente/${cliente.id}`));
  },

  'editar-cliente'(alvo, ctx) {
    const cliente = ctx.store.cliente(ctx.params.id);
    if (cliente) abrirFormularioCliente(ctx, cliente);
  },

  'excluir-cliente'(alvo, ctx) {
    const cliente = ctx.store.cliente(ctx.params.id);
    if (!cliente) return;
    const dividas = ctx.dados.dividas.filter(d => d.clienteId === cliente.id).length;

    confirmar({
      titulo: `Excluir ${cliente.nome}?`,
      texto: dividas > 0
        ? `As ${dividas} ${dividas === 1 ? 'dívida' : 'dívidas'} deste cliente e todos os pagamentos registrados serão apagados. Não há como desfazer.`
        : 'O cadastro será apagado. Não há como desfazer.',
      rotuloConfirmar: 'Excluir cliente',
      perigo: true,
      aoConfirmar() {
        ctx.store.removerCliente(cliente.id);
        avisar('Cliente excluído.');
        ir('#/clientes');
      },
    });
  },

  'pagar'(alvo, ctx) {
    abrirPagamento(ctx, alvo.dataset.divida, Number(alvo.dataset.parcela));
  },

  'alternar-parcelas'(alvo, ctx) {
    alternarParcelas(alvo.dataset.divida);
    ctx.atualizar();
  },

  'excluir-divida'(alvo, ctx) {
    const divida = ctx.store.divida(alvo.dataset.divida);
    if (!divida) return;
    const pagamentos = ctx.store.pagamentosDaDivida(divida.id).length;

    confirmar({
      titulo: 'Excluir esta dívida?',
      texto: pagamentos > 0
        ? `${pagamentos} ${pagamentos === 1 ? 'pagamento registrado será apagado' : 'pagamentos registrados serão apagados'} junto. Não há como desfazer.`
        : 'A dívida será apagada. Não há como desfazer.',
      rotuloConfirmar: 'Excluir dívida',
      perigo: true,
      aoConfirmar() {
        ctx.store.removerDivida(divida.id);
        avisar('Dívida excluída.');
        ctx.atualizar();
      },
    });
  },

  'ver-pagamento'(alvo, ctx) {
    const pagamento = ctx.dados.pagamentos.find(p => p.id === alvo.dataset.pagamento);
    if (!pagamento) return;

    confirmar({
      titulo: `Pagamento de ${formatarReais(pagamento.valorCents)}`,
      texto: 'Remover este recebimento devolve o valor ao saldo da dívida e ao que está na rua, e tira o dinheiro do caixa.',
      rotuloConfirmar: 'Remover pagamento',
      perigo: true,
      aoConfirmar() {
        ctx.store.removerPagamento(pagamento.id);
        avisar('Pagamento removido.');
        ctx.atualizar();
      },
    });
  },

  'carregar-exemplo'(alvo, ctx) {
    const temDados = ctx.dados.clientes.length > 0 && !ctx.dados.exemplo;
    const carregar = () => {
      ctx.store.substituir(dadosDeExemplo(ctx.hoje));
      avisar('Dados de exemplo carregados.');
      ir('#/');
    };

    if (!temDados) return carregar();
    confirmar({
      titulo: 'Substituir os dados atuais?',
      texto: 'Os clientes, dívidas e pagamentos já cadastrados serão apagados e trocados pelos de exemplo.',
      rotuloConfirmar: 'Carregar exemplo',
      perigo: true,
      aoConfirmar: carregar,
    });
  },

  'limpar-exemplo'(alvo, ctx) {
    confirmar({
      titulo: 'Limpar os dados de exemplo?',
      texto: 'Tudo volta a ficar vazio para você começar com os dados reais.',
      rotuloConfirmar: 'Limpar tudo',
      perigo: true,
      aoConfirmar() {
        ctx.store.limpar();
        avisar('Pronto: sistema vazio.');
        ir('#/');
      },
    });
  },

  ...acoesNovaDivida,
  ...acoesCaixa,
};

document.body.addEventListener('click', evento => {
  const alvo = evento.target.closest('[data-acao]');
  if (!alvo) return;
  const acao = ACOES[alvo.dataset.acao];
  if (!acao) return;
  evento.preventDefault();
  acao(alvo, contexto());
});

// ── ciclo de vida ─────────────────────────────────────────────────────────

window.addEventListener('hashchange', () => {
  if (folhaAberta()) fecharFolha();
  const rota = lerRota();
  if (rota.nome === 'nova-divida' && rotaDesenhada !== 'nova-divida') {
    prepararNovaDivida(rota.params.cliente || null);
  }
  desenhar({ preservarRolagem: false });
});

window.addEventListener('scroll', atualizarSombraDoTopo, { passive: true });

// Gravação vinda de outra aba do mesmo navegador: o estado mudou por fora, e
// a tela precisa acompanhar.
window.addEventListener('storage', () => desenhar({ preservarRolagem: true }));

if (lerRota().nome === 'nova-divida') prepararNovaDivida(lerRota().params.cliente || null);
desenhar({ preservarRolagem: false });

if (store.gravacaoFalhou()) {
  avisar('Não foi possível gravar neste aparelho. Verifique o espaço disponível.');
}

// Service worker próprio, em escopo próprio. O aplicativo vizinho neste
// domínio registra um SW na raiz que é cache-first para JS e CSS; um registro
// em escopo mais específico vence para as páginas desta pasta, e é o que
// impede os módulos do EN Controle de serem servidos de um cache alheio.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {
      // Sem service worker o aplicativo funciona igual, só não abre offline.
    });
  });
}
