// Alvos de toque em todas as telas.
//
// Um levantamento a 390px encontrou dezesseis botões abaixo de 44px espalhados
// pelo app — de 13×18 (o "✕" de remover limite) a 36×36 (o voltar). O mínimo
// confortável no toque é 44×44.
//
// A medida aqui é da ÁREA EFETIVA, não da caixa: onde o desenho pede um botão
// pequeno, o visual fica pequeno e quem cresce é um `::before` transparente.
// Medir só `getBoundingClientRect` reprovaria botões que estão certos, e é o
// erro que este arquivo existe para não cometer.
import { test, expect } from '@playwright/test';
import { abrirAppEmDemo } from './_helpers.js';

const TELAS = ['inicio', 'semana', 'mes', 'mais', 'reserva', 'dividas', 'patrimonio',
               'pendencias', 'fixos', 'ajustes', 'metas', 'pesquisa', 'conversor', 'lembretes'];

const MINIMO = 44;

for (const largura of [320, 390]) {
  test(`todo botão visível tem 44px de área efetiva @ ${largura}px`, async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: largura, height: 844 });
    await abrirAppEmDemo(page);

    const ruins = {};
    for (const tela of TELAS) {
      await page.evaluate(t => window.switchTab(t), tela);
      await page.waitForTimeout(180);
      const achados = await page.evaluate(({ tela, MINIMO }) => {
        const pagina = document.getElementById('page-' + tela);
        const out = {};
        pagina.querySelectorAll('button,[role="button"]').forEach(el => {
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden' || !el.offsetHeight) return;
          const caixa = el.getBoundingClientRect();
          // O ::before ampliador: conta como área de toque quando existe.
          const antes = getComputedStyle(el, '::before');
          const temAntes = antes.content && antes.content !== 'none';
          const w = Math.max(caixa.width, temAntes ? parseFloat(antes.width) || 0 : 0);
          const h = Math.max(caixa.height, temAntes ? parseFloat(antes.height) || 0 : 0);
          if (w < MINIMO || h < MINIMO) {
            const nome = (el.className || '').toString().trim().split(/\s+/)[0]
              || ('sem-classe:' + (el.textContent || '').trim().slice(0, 16));
            out[`${tela} · ${nome}`] = `${Math.round(w)}x${Math.round(h)}`;
          }
        });
        return out;
      }, { tela, MINIMO });
      Object.assign(ruins, achados);
    }

    expect(ruins, 'botões abaixo do alvo mínimo de toque').toEqual({});
  });
}
