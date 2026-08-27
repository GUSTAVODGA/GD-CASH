// Ícones em SVG, desenhados no mesmo traço: 24×24, contorno de 1,6, pontas
// arredondadas. Um conjunto pequeno e coerente — nenhum emoji entra no produto.

const desenho = (corpo, extra = '') =>
  `<svg class="icone${extra ? ` ${extra}` : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
  `stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${corpo}</svg>`;

export const icones = {
  inicio: desenho('<path d="M3.5 10.6 12 3.8l8.5 6.8"/><path d="M5.8 9.6V20h12.4V9.6"/>'),
  clientes: desenho(
    '<circle cx="9.2" cy="8.4" r="3.2"/>' +
    '<path d="M3.4 19.4c0-3 2.6-4.9 5.8-4.9s5.8 1.9 5.8 4.9"/>' +
    '<path d="M16.3 5.9a3 3 0 0 1 0 5"/><path d="M17.6 14.8c1.9.6 3 2 3 4.6"/>'
  ),
  caixa: desenho(
    '<path d="M4 8V6.6c0-1 .8-1.8 1.8-1.7l11.4 1"/>' +
    '<rect x="3" y="8" width="18" height="11.5" rx="2.4"/>' +
    '<circle cx="16.6" cy="13.8" r="1.15"/>'
  ),

  mais: desenho('<path d="M12 5.5v13M5.5 12h13"/>'),
  menos: desenho('<path d="M5.5 12h13"/>'),
  busca: desenho('<circle cx="11" cy="11" r="6.4"/><path d="m15.8 15.8 4.4 4.4"/>'),
  fechar: desenho('<path d="m6.5 6.5 11 11M17.5 6.5l-11 11"/>'),
  cheque: desenho('<path d="m5.5 12.6 4.3 4.3L18.6 8"/>'),

  direita: desenho('<path d="m9.5 5.5 6.5 6.5-6.5 6.5"/>'),
  esquerda: desenho('<path d="m14.5 5.5-6.5 6.5 6.5 6.5"/>'),
  baixo: desenho('<path d="m5.5 9 6.5 6.5L18.5 9"/>'),

  calendario: desenho(
    '<rect x="3.5" y="5.2" width="17" height="15.3" rx="2.6"/>' +
    '<path d="M3.5 9.8h17M8.2 3.5v3.2M15.8 3.5v3.2"/>'
  ),
  relogio: desenho('<circle cx="12" cy="12" r="8.4"/><path d="M12 7.2v5.1l3.3 1.9"/>'),
  alerta: desenho('<circle cx="12" cy="12" r="8.6"/><path d="M12 7.8v4.9"/><circle cx="12" cy="16.1" r=".95" fill="currentColor" stroke="none"/>'),

  telefone: desenho(
    '<path d="M7.2 3.6h2.9l1.4 3.8-2 1.4a12.2 12.2 0 0 0 5.7 5.7l1.4-2 3.8 1.4v2.9a1.7 1.7 0 0 1-1.8 1.7C11.2 18 6 12.8 5.5 5.4a1.7 1.7 0 0 1 1.7-1.8Z"/>'
  ),
  local: desenho('<path d="M12 20.8s6.3-5.6 6.3-10.4a6.3 6.3 0 1 0-12.6 0C5.7 15.2 12 20.8 12 20.8Z"/><circle cx="12" cy="10.2" r="2.3"/>'),
  nota: desenho('<path d="M5.6 4.9h12.8M5.6 9.4h12.8M5.6 13.9h8.6M5.6 18.4h5.4"/>'),
  pessoa: desenho('<circle cx="12" cy="8.2" r="3.6"/><path d="M5 20c0-3.5 3.2-5.6 7-5.6s7 2.1 7 5.6"/>'),

  dividas: desenho('<path d="m12 3.4 8.2 4.3-8.2 4.3-8.2-4.3Z"/><path d="m4.2 12.2 7.8 4.1 7.8-4.1"/><path d="m4.2 16.6 7.8 4.1 7.8-4.1"/>'),
  entrada: desenho('<path d="M12 4v10.4"/><path d="m8.2 10.8 3.8 3.8 3.8-3.8"/><path d="M4.6 19.6h14.8"/>'),
  saida: desenho('<path d="M12 14.4V4"/><path d="m8.2 7.6 3.8-3.8 3.8 3.8"/><path d="M4.6 19.6h14.8"/>'),

  lapis: desenho('<path d="M4.6 19.4h3.6L18.9 8.7l-3.6-3.6L4.6 15.8Z"/><path d="m13.9 6.5 3.6 3.6"/>'),
  lixeira: desenho('<path d="M4.6 6.9h14.8M9.6 6.9V4.8h4.8v2.1"/><path d="m6.8 6.9.9 12.1a1.8 1.8 0 0 0 1.8 1.6h5a1.8 1.8 0 0 0 1.8-1.6l.9-12.1"/>'),
};
