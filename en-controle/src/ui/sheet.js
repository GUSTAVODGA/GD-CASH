// Folha inferior — o único tipo de modal do sistema. Toda ação que precisa de
// confirmação ou de um formulário curto acontece aqui, subindo do rodapé, ao
// alcance do polegar.

import { esc } from './dom.js';

let aoFechar = null;

function camada() { return document.getElementById('folha-camada'); }
function corpo() { return document.getElementById('folha'); }

/**
 * @param {object} opcoes
 * @param {string} opcoes.titulo
 * @param {string} [opcoes.texto]     linha de apoio abaixo do título
 * @param {string} opcoes.conteudo    HTML do miolo
 * @param {function} [opcoes.montar]  recebe o elemento da folha após inserir
 * @param {function} [opcoes.fechou]  chamado quando a folha fecha
 */
export function abrirFolha({ titulo, texto = '', conteudo = '', montar, fechou }) {
  const camadaEl = camada();
  const folhaEl = corpo();
  if (!camadaEl || !folhaEl) return;

  folhaEl.innerHTML = `
    <div class="folha-puxador"></div>
    <h2 class="folha-titulo">${esc(titulo)}</h2>
    ${texto ? `<p class="folha-texto">${esc(texto)}</p>` : ''}
    ${conteudo}
  `;
  camadaEl.hidden = false;
  document.body.style.overflow = 'hidden';
  aoFechar = fechou || null;

  if (montar) montar(folhaEl);

  const primeiro = folhaEl.querySelector('input:not([type="hidden"]), textarea, button');
  // Só foca em campo de texto: focar um botão abriria o teclado à toa e
  // roubaria a leitura do título por leitores de tela.
  if (primeiro && (primeiro.tagName === 'INPUT' || primeiro.tagName === 'TEXTAREA')) {
    setTimeout(() => primeiro.focus(), 60);
  }
}

export function fecharFolha() {
  const camadaEl = camada();
  if (!camadaEl || camadaEl.hidden) return;
  camadaEl.hidden = true;
  corpo().innerHTML = '';
  document.body.style.overflow = '';
  const callback = aoFechar;
  aoFechar = null;
  if (callback) callback();
}

export function folhaAberta() {
  const camadaEl = camada();
  return camadaEl ? !camadaEl.hidden : false;
}

/** Confirmação de ação destrutiva. Nunca `window.confirm`. */
export function confirmar({ titulo, texto, rotuloConfirmar = 'Confirmar', perigo = false, aoConfirmar }) {
  abrirFolha({
    titulo,
    texto,
    conteudo: `<div class="folha-acoes">
      <button class="botao ${perigo ? 'botao-perigo' : 'botao-primario'} botao-bloco botao-alto" data-acao="confirmar-folha">${esc(rotuloConfirmar)}</button>
      <button class="botao botao-bloco" data-acao="fechar-folha">Cancelar</button>
    </div>`,
    montar(folhaEl) {
      folhaEl.querySelector('[data-acao="confirmar-folha"]').addEventListener('click', () => {
        fecharFolha();
        aoConfirmar();
      });
      folhaEl.querySelector('[data-acao="fechar-folha"]').addEventListener('click', fecharFolha);
    },
  });
}

// Fechar pelo fundo e pela tecla Esc.
document.addEventListener('click', e => {
  if (e.target.matches('[data-fechar-folha]')) fecharFolha();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && folhaAberta()) fecharFolha();
});
