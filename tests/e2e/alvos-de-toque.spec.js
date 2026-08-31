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

// Três telas saíram da lista. 'reserva' virou a primeira meta dentro de
// 'metas', e 'lembretes' virou pendência dentro de 'pendencias' — as duas que
// os absorveram continuam aqui, então os botões que eram delas passaram a ser
// medidos junto com o resto. 'conversor' foi removido do app.
const TELAS = ['inicio', 'semana', 'mes', 'mais', 'dividas', 'patrimonio',
               'pendencias', 'fixos', 'ajustes', 'metas', 'pesquisa'];

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
          // O pseudo-elemento ampliador conta como área de toque. Media-se
          // ::before E ::after: a régua olhava só para ::before e reprovava
          // botões corretos que usam ::after — o erro que o cabeçalho deste
          // arquivo diz não querer cometer, cometido em metade dos casos.
          const pseudo = ['::before', '::after'].map(q => {
            const cs2 = getComputedStyle(el, q);
            if (!cs2.content || cs2.content === 'none') return { w: 0, h: 0 };
            return { w: parseFloat(cs2.width) || 0, h: parseFloat(cs2.height) || 0 };
          });
          const w = Math.max(caixa.width, ...pseudo.map(x => x.w));
          const h = Math.max(caixa.height, ...pseudo.map(x => x.h));
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
