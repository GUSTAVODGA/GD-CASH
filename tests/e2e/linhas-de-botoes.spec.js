// Botões da mesma linha começam na mesma altura.
//
// O DEFEITO QUE ORIGINOU ESTE ARQUIVO, numa foto de iPhone de quem usa o app:
// na tela "Metas e reserva", "Guardar" e "Retirar" ficavam visivelmente
// tortos — um começava 8px acima do outro. Não era ilusão de sombra: medido no
// navegador, "Retirar" tinha `margin-top: 8px` e "Guardar" não.
//
// A ORIGEM é uma regra legítima com um alcance grande demais:
//
//     .btn + .btn { margin-top: 8px; }        /* para botões EMPILHADOS */
//
// Ela existe para pilhas verticais (Salvar em cima, Cancelar embaixo). Só que
// ela também acerta linhas HORIZONTAIS, onde o espaçamento já vem do `gap` do
// flex — e ali a margem não separa nada, só empurra o segundo botão para
// baixo. O style.css compensa com uma lista de exceções escrita à mão, com um
// aviso: "se criar uma nova linha horizontal de .btn, adicione o contêiner
// aqui".
//
// Esse aviso é justamente o problema: depende de alguém lembrar. Falhou duas
// vezes em silêncio — `.meta-acoes` (Guardar/Retirar) e `.df-actions`
// (Cancelar/Marcar como vendido) — e uma delas só apareceu porque chegou aos
// olhos de quem usa o app.
//
// ESTE TESTE TIRA A LISTA DAS COSTAS DE QUEM ESCREVE O CÓDIGO. Ele não sabe
// nada sobre `.meta-acoes`, `.df-actions` ou qualquer nome: percorre as telas e
// as folhas do app, encontra TODA linha horizontal de botões que estiver na
// tela e mede. Se dois botões da mesma linha não começarem na mesma altura, ou
// tiverem alturas diferentes, ele falha e diz qual é a linha. Uma linha nova
// que esqueça a exceção passa a ser pega aqui, não no aparelho de ninguém.
import { test, expect } from '@playwright/test';
import { abrirAppEmDemo, irParaAba } from './_helpers.js';

/**
 * Mede, dentro da página, toda linha horizontal de botões visível.
 *
 * Só linhas HORIZONTAIS entram: numa pilha vertical o `margin-top` é o
 * espaçamento correto e desejado, e cobrá-la aqui reprovaria o certo.
 */
const MEDIR_LINHAS = () => {
  const linhas = [];
  document.querySelectorAll('*').forEach(cont => {
    const botoes = [...cont.children].filter(c => c.classList && c.classList.contains('btn'));
    if (botoes.length < 2) return;

    const cs = getComputedStyle(cont);
    const horizontal = (cs.display === 'flex' || cs.display === 'inline-flex')
      && !cs.flexDirection.startsWith('column');
    if (!horizontal) return;

    const visiveis = botoes.filter(b => b.getBoundingClientRect().height > 0);
    if (visiveis.length < 2) return;

    linhas.push({
      contêiner: (cont.className && String(cont.className)) || cont.tagName,
      botoes: visiveis.map(b => {
        const r = b.getBoundingClientRect();
        return {
          texto: b.textContent.trim().slice(0, 24),
          top: Math.round(r.top * 10) / 10,
          altura: Math.round(r.height * 10) / 10,
          marginTop: getComputedStyle(b).marginTop,
        };
      }),
    });
  });
  return linhas;
};

/** Falha com o nome da linha e a medida de cada botão — não só "não bate". */
function conferirLinhas(linhas, onde) {
  for (const linha of linhas) {
    const tops = linha.botoes.map(b => b.top);
    const alturas = linha.botoes.map(b => b.altura);
    const detalhe = linha.botoes
      .map(b => `"${b.texto}" topo=${b.top} altura=${b.altura} margin-top=${b.marginTop}`)
      .join(' | ');

    expect(
      Math.max(...tops) - Math.min(...tops),
      `[${onde}] a linha ".${linha.contêiner}" tem botões começando em alturas ` +
      `diferentes — é o defeito do "um mais acima que o outro": ${detalhe}`
    ).toBeLessThanOrEqual(0.5);

    expect(
      Math.max(...alturas) - Math.min(...alturas),
      `[${onde}] a linha ".${linha.contêiner}" tem botões de alturas diferentes: ${detalhe}`
    ).toBeLessThanOrEqual(0.5);
  }
}

const ABAS = ['inicio', 'semana', 'mes', 'mais', 'metas', 'fixos', 'dividas', 'pendencias', 'patrimonio', 'ajustes'];

test('todas as abas: nenhuma linha de botões sai torta', async ({ page }) => {
  await abrirAppEmDemo(page);
  for (const aba of ABAS) {
    await irParaAba(page, aba);
    conferirLinhas(await page.evaluate(MEDIR_LINHAS), 'aba ' + aba);
  }
});

test('A LINHA RELATADA: Guardar e Retirar começam na mesma altura', async ({ page }) => {
  await abrirAppEmDemo(page);
  await irParaAba(page, 'metas');

  const par = await page.evaluate(() => {
    const linha = document.querySelector('.meta-acoes');
    const [a, b] = [...linha.querySelectorAll('.btn')].map(el => {
      const r = el.getBoundingClientRect();
      return { texto: el.textContent.trim(), top: r.top, altura: r.height };
    });
    return { a, b };
  });

  expect(par.a.texto).toBe('Guardar');
  expect(par.b.texto).toBe('Retirar');
  expect(Math.abs(par.a.top - par.b.top), 'Guardar e Retirar não começam na mesma altura')
    .toBeLessThanOrEqual(0.5);
  expect(Math.abs(par.a.altura - par.b.altura), 'Guardar e Retirar têm alturas diferentes')
    .toBeLessThanOrEqual(0.5);
});

test('folhas e diálogos: nenhuma linha de botões sai torta', async ({ page }) => {
  await abrirAppEmDemo(page);

  // Uma dívida de mentira, só para as telas de dívida existirem de verdade
  // durante a medição. Some junto com a página no fim do teste.
  await page.evaluate(() => {
    const D = window.eval('D');
    D.debts = D.debts || [];
    D.debts.push({
      id: 'tmp-linhas-1', tipo: 'financiamento', titulo: 'Linha de teste', credor: 'Banco',
      valorOriginal: 10000, valorParcela: 500, parcelasTotal: 20, parcelasPagasAntes: 2,
      periodicidade: 'mensal', dataInicio: '2026-01-10', categoria: 'Moradia',
      status: 'ativa', pagamentos: [],
    });
  });

  const folhas = [
    ['lançamento rápido', () => window.openQuickAdd()],
    ['dia',               () => window.openDayDetail(0)],
    ['form dívida',       () => window.openDebtForm()],
    ['detalhe dívida',    () => { const d = (window.eval('D').debts || [])[0]; if (d) window.openDebtDetail(d.id); }],
    ['pagar dívida',      () => { const d = (window.eval('D').debts || [])[0]; if (d) window.openDebtPay(d.id); }],
    ['form meta',         () => window.openGoalModal()],
    ['guardar na meta',   () => window.openResModal('dep', 'meta-reserva')],
    ['form fixo',         () => window.openFixedModal()],
    ['form pendência',    () => window.openPendenciaModal()],
    ['categorias',        () => window.openCatModal()],
    ['limite',            () => window.openBudgetModal()],
    ['meta semanal',      () => window.openWeekGoalModal()],
    ['detalhe veículo',   () => { const v = (window.eval('D').vehicles || [])[0]; if (v) window.openVehPatDetail(v.id); }],
    ['form veículo',      () => { const v = (window.eval('D').vehicles || [])[0]; if (v) window.openVehForm(v.id); }],
    ['venda de bem',      () => { const v = (window.eval('D').vehicles || [])[0]; if (v && window.venderBem) window.venderBem(v.id); }],
    ['financiamento',     () => { const v = (window.eval('D').vehicles || [])[0]; if (v) window.openPatFinForm(v.id, '', 'veh'); }],
    ['diálogo',           () => window.gdConfirm && window.gdConfirm({ title: 'Teste', msg: 'Alinhamento', confirmText: 'Confirmar' })],
    ['diálogo perigo',    () => window.gdConfirm && window.gdConfirm({ title: 'Teste', msg: 'Alinhamento', confirmText: 'Excluir', variant: 'danger' })],
  ];

  for (const [rotulo, abrir] of folhas) {
    await page.evaluate(abrir);
    await page.waitForTimeout(120);
    conferirLinhas(await page.evaluate(MEDIR_LINHAS), 'folha: ' + rotulo);
    await page.evaluate(() => {
      document.querySelectorAll('.overlay.open, .av-overlay').forEach(el => {
        if (el.id && window.closeOverlay) { try { window.closeOverlay(el.id); } catch (e) {} }
        if (el.classList.contains('av-overlay')) el.remove();
      });
    });
    await page.waitForTimeout(80);
  }
});
