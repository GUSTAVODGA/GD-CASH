// O app parava de salvar na nuvem sem nunca contar.
//
// Gravar podia falhar PARA SEMPRE em silêncio: o erro ia para `console.error`,
// o timer tentava de novo a cada 5s até o fim dos tempos, e o app continuava
// funcionando com o dado local — então TUDO PARECIA NORMAL. A tela de Ajustes
// ainda dizia "Firebase ativo", texto fixo que nunca olhou para a realidade.
// Você usaria o app por semanas achando que está sincronizado; trocaria de
// celular e descobriria que a nuvem congelou meses atrás.
//
// Num app de finanças é o pior defeito possível. Não é um número errado numa
// tela: é o histórico inteiro que não existe mais.
//
// A CAUSA MAIS PROVÁVEL é o teto de 1 MiB do Firestore. Todo o estado — com as
// FOTOS em base64 — vai num documento só. Uma foto de 400px em JPEG 0.75 chega
// a ~120 KB de data URI; oito estouram o teto sozinhas.
//
// O QUE ESTES TESTES PROTEGEM:
//
//   O SILÊNCIO ACABOU. Falha de gravação vira faixa na Início e verdade nos
//   Ajustes.
//
//   O AVISO VEM ANTES DA QUEBRA. Perto do teto, o app avisa enquanto ainda dá
//   para agir — e diz o que pesa (as fotos), não só que está cheio.
//
//   NÃO ALARMA POR SOLAVANCO. Rede oscilando por dez segundos é vida normal.
//   Um alarme a cada tropeço ensina o usuário a ignorar o alarme.
//
//   A SAÍDA DE EMERGÊNCIA ESTÁ NO AVISO. Quando a nuvem não recebe, o backup
//   local é a única rede — e é oferecido ali, não escondido em Ajustes.
import { test, expect } from '@playwright/test';
import { abrirAppEmDemo, semearDados, irParaAba } from './_helpers.js';

const AGORA = new Date(2026, 7, 20, 12, 0, 0);

const BASE = {
  platforms: [{ id: 'p1', name: 'Fonte A', color: '#0C7A52' }],
  incomeItems: [], dailyIncome: {}, expenses: [], debtPayments: [], fixedPayments: [],
  debts: [], fixedExpenses: [], pendencias: [], vehicles: [], patrimonios: [],
  goals: [], reservaHistory: [], emergency: { current: 0, target: 0 },
  daysOff: [], reminders: [], confirmacoesAdiadas: {},
};

const abrir = async (page, dados) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const erros = await abrirAppEmDemo(page, { agora: AGORA });
  await semearDados(page, { ...BASE, ...(dados || {}) }, 'inicio');
  return erros;
};

/** Força o estado interno de sincronização, como se o Firestore tivesse falhado. */
const fingirFalha = (page, haQuantoTempoMs) => page.evaluate(ms => {
  window.eval(`_syncEstado = 'erro'`);
  window.eval(`_syncDesde = ${Date.now() - ms}`);
  window.eval(`_syncUltimoOk = ${Date.now() - 86400000 * 3}`);
  window.eval(`_syncUltimoErro = 'maximum document size exceeded'`);
  window.renderHomeSync();
}, haQuantoTempoMs);

const fingirTamanho = (page, bytes) => page.evaluate(n => {
  window.eval(`_syncEstado = 'ok'`);
  window.eval(`_syncTamanho = ${n}`);
  window.renderHomeSync();
}, bytes);

// ── O silêncio acabou ─────────────────────────────────────────────────────

test('O SILÊNCIO ACABOU: falha de gravação vira faixa na Início', async ({ page }) => {
  const erros = await abrir(page, {});
  await expect(page.locator('#home-sync'), 'a faixa apareceu sem haver falha').toBeEmpty();

  await fingirFalha(page, 5 * 60000);
  await expect(page.locator('#home-sync')).toContainText('Não está salvando na nuvem');
  // E diz desde quando — "está quebrado" sozinho não deixa ninguém decidir nada.
  await expect(page.locator('#home-sync')).toContainText('Última vez');
  expect(erros).toEqual([]);
});

test('NÃO ALARMA POR SOLAVANCO: falha recente não vira faixa', async ({ page }) => {
  await abrir(page, {});
  await fingirFalha(page, 10000);   // 10 segundos
  await expect(page.locator('#home-sync'),
    'dez segundos de rede ruim viraram alarme').toBeEmpty();

  await fingirFalha(page, 61000);   // pouco mais de um minuto
  await expect(page.locator('#home-sync')).toContainText('Não está salvando');
});

test('a faixa NÃO tem "adiar" — falha de gravação não é lembrete', async ({ page }) => {
  await abrir(page, {});
  await fingirFalha(page, 5 * 60000);
  const faixa = page.locator('#home-sync');
  // Exatamente UM botão: a própria faixa. Nenhum segundo botão de dispensar.
  await expect(faixa.locator('button')).toHaveCount(1);
  await expect(faixa).not.toContainText('Ainda não');
  await expect(faixa).not.toContainText('Dispensar');
});

// ── O aviso vem antes da quebra ───────────────────────────────────────────

test('O AVISO VEM ANTES: perto do teto, avisa enquanto dá para agir', async ({ page }) => {
  await abrir(page, {});
  await fingirTamanho(page, 500 * 1024);      // 48% — longe
  await expect(page.locator('#home-sync')).toBeEmpty();

  await fingirTamanho(page, 850 * 1024);      // 83% — perto
  const faixa = page.locator('#home-sync');
  await expect(faixa).toContainText('perto do limite');
  await expect(faixa, 'não diz o quanto').toContainText('83%');
});

test('o aviso aponta O QUE pesa, não só que está cheio', async ({ page }) => {
  // Uma foto grande de patrimônio — a causa real de quase todo estouro.
  // Grande o bastante para cruzar o limiar de aviso sozinha: é exatamente o
  // caso real que quebra a gravação, e é sempre foto.
  const fotona = 'data:image/jpeg;base64,' + 'A'.repeat(850 * 1024);
  await abrir(page, {
    patrimonios: [{ id: 'pt1', tipo: 'veiculo', nome: 'Carro', status: 'ativo',
                    foto: fotona, valorEstimado: 0, detalhes: {} }],
  });
  const st = await page.evaluate(() => { window.save(); return window.syncStatus(); });
  expect(st.fotos, 'o app não sabe quanto as fotos ocupam').toBeGreaterThan(800 * 1024);
  expect(st.tamanho).toBeGreaterThan(st.fotos);

  await page.evaluate(() => window.renderHomeSync());
  await expect(page.locator('#home-sync'), 'a faixa não menciona as fotos').toContainText('fotos ocupam');
});

test('o diagnóstico oferece o backup — a única rede quando a nuvem não recebe', async ({ page }) => {
  await abrir(page, {});
  await fingirFalha(page, 5 * 60000);
  await page.locator('.home-sync-faixa').click();
  const dlg = page.locator('#_av_dlg');
  await expect(dlg).toBeVisible();
  await expect(dlg).toContainText('A nuvem não está recebendo');
  // Tranquiliza sobre o que NÃO se perdeu, antes de assustar.
  await expect(dlg).toContainText('continua guardando tudo NESTE aparelho');
  await expect(dlg.getByRole('button', { name: 'Exportar backup' })).toHaveCount(1);
});

// ── Os Ajustes param de mentir ────────────────────────────────────────────

test('AJUSTES: a linha de sincronização responde pelo estado real', async ({ page }) => {
  await abrir(page, {});
  await irParaAba(page, 'ajustes');
  const linha = page.locator('.srow', { hasText: 'Sincronização' });
  // Sem falha, não diz "Falhando".
  await expect(linha).not.toContainText('Falhando');

  await page.evaluate(() => {
    window.eval(`_syncEstado = 'erro'`);
    window.eval(`_syncDesde = ${Date.now() - 600000}`);
    window.eval(`_syncUltimoOk = ${Date.now() - 86400000 * 5}`);
    window.switchTab('ajustes');
  });
  await expect(linha, 'os Ajustes continuam dizendo que está tudo bem').toContainText('Falhando');
});

test('AJUSTES: mostra o espaço ocupado, não só o estado', async ({ page }) => {
  await abrir(page, {});
  await page.evaluate(() => { window.eval('_syncTamanho = ' + (900 * 1024)); window.switchTab('ajustes'); });
  const linha = page.locator('.srow', { hasText: 'Sincronização' });
  await expect(linha).toContainText('perto do limite');
});

// ── O motor ───────────────────────────────────────────────────────────────

test('o tamanho é medido a cada gravação, sem contar duas vezes', async ({ page }) => {
  await abrir(page, {});
  const antes = await page.evaluate(() => { window.save(); return window.syncStatus().tamanho; });
  await page.evaluate(() => {
    window.eval('D').expenses.push({ id: 'e1', date: '2026-08-10', amount: 50,
      category: 'Lazer', description: 'x'.repeat(5000) });
    window.save();
  });
  const depois = await page.evaluate(() => window.syncStatus().tamanho);
  expect(depois, 'o tamanho não acompanhou o crescimento dos dados').toBeGreaterThan(antes + 4000);
});

test('a retentativa recua em vez de martelar a cada 5s para sempre', async ({ page }) => {
  // Com o documento acima do teto, o retry fixo de 5s vira uma tentativa a
  // cada cinco segundos pelo resto da sessão — bateria e cota queimadas para
  // falhar sempre pelo mesmo motivo.
  await abrir(page, {});
  const recuos = await page.evaluate(() => window.eval('SYNC_RECUOS'));
  expect(recuos[0]).toBe(5000);
  expect(recuos[recuos.length - 1], 'o recuo não chega a um intervalo tranquilo')
    .toBeGreaterThanOrEqual(300000);
  for (let i = 1; i < recuos.length; i++) {
    expect(recuos[i], 'os recuos não são crescentes').toBeGreaterThan(recuos[i - 1]);
  }
});

test('syncStatus é só leitura: não altera D nem dispara gravação', async ({ page }) => {
  await abrir(page, { expenses: [{ id: 'e1', date: '2026-08-10', amount: 50, category: 'Lazer', description: 'x' }] });
  const antes = await page.evaluate(() => JSON.stringify(window.eval('D')));
  const salvou = await page.evaluate(() => {
    let n = 0; const s = window.save; window.save = () => { n++; return s && s(); };
    window.syncStatus(); window.renderHomeSync();
    window.save = s; return n;
  });
  expect(salvou).toBe(0);
  expect(await page.evaluate(() => JSON.stringify(window.eval('D')))).toBe(antes);
});
