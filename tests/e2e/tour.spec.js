// O primeiro passo do tour perdeu o alvo.
//
// Apontava para `#car-inner` — um carrossel da Início antigo, substituído
// há várias versões pelo cabeçalho novo (`.hc-header`). O container ficou no
// HTML só como compatibilidade para renders antigos ("JS compat: hidden
// elements... UNTOUCHED"), sempre `display:none`. `getBoundingClientRect()`
// num elemento `display:none` devolve tudo zero, então o holofote do tour
// virava uma caixa de 16×16px grudada no canto superior esquerdo da tela —
// não destacava nada do que o texto do passo descreve. Quem via o tour pela
// primeira vez via um quadrado sem sentido no canto, não a tela de Início.
import { test, expect } from '@playwright/test';
import { abrirAppEmDemo } from './_helpers.js';

test('o primeiro passo do tour destaca algo visível, não um ponto vazio', async ({ page }) => {
  await abrirAppEmDemo(page);
  await page.evaluate(() => { window.tourStep = 0; window.showTourStep(); });
  await page.waitForTimeout(700); // a folha espera a rolagem assentar antes de medir

  const spot = await page.evaluate(() => {
    const s = document.getElementById('tour-spotlight');
    return { display: s.style.display, width: parseFloat(s.style.width), height: parseFloat(s.style.height) };
  });
  expect(spot.display).toBe('block');
  // Uma caixa de verdade, não os 16px residuais de um alvo com rect zerado.
  expect(spot.width, 'o holofote não tem largura de conteúdo real').toBeGreaterThan(50);
  expect(spot.height, 'o holofote não tem altura de conteúdo real').toBeGreaterThan(50);
});
