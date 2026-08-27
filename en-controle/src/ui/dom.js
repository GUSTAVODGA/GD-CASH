// Utilidades de tela. Nenhuma biblioteca: as telas são funções que devolvem
// HTML e o comportamento vem de delegação de evento por `data-acao`.

/** Escapa texto vindo do usuário antes de entrar em HTML. Sempre. */
export function esc(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** Junta classes ignorando o que for falso. */
export function classes(...lista) {
  return lista.filter(Boolean).join(' ');
}

let temporizadorAviso = null;

/** Aviso curto e discreto no rodapé. */
export function avisar(texto) {
  const el = document.getElementById('aviso');
  if (!el) return;
  el.textContent = texto;
  el.hidden = false;
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => { el.hidden = true; }, 2600);
}

/** Vibração curta de confirmação, onde o aparelho suportar. */
export function tremer(padrao = 8) {
  try { navigator.vibrate?.(padrao); } catch { /* sem suporte, sem problema */ }
}

/** Cabeçalho de seção com título, contagem opcional e ação à direita. */
export function cabecalhoSecao(titulo, contagem, acao) {
  return `<div class="secao-cabecalho">
    <span class="secao-titulo">${esc(titulo)}</span>
    ${contagem !== undefined && contagem !== null ? `<span class="secao-contagem">${esc(contagem)}</span>` : ''}
    ${acao ? `<button class="secao-link" data-acao="${esc(acao.acao)}"${acao.dados || ''}>${esc(acao.rotulo)}</button>` : ''}
  </div>`;
}

/** Estado vazio: ícone, título, texto e, quando fizer sentido, uma saída. */
export function estadoVazio({ icone, titulo, texto, botao }) {
  return `<div class="vazio">
    <div class="vazio-icone">${icone}</div>
    <div class="vazio-titulo">${esc(titulo)}</div>
    ${texto ? `<p class="vazio-texto">${esc(texto)}</p>` : ''}
    ${botao ? `<button class="botao botao-contorno" data-acao="${esc(botao.acao)}">${botao.icone || ''}${esc(botao.rotulo)}</button>` : ''}
  </div>`;
}
