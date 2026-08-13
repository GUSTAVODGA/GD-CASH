// "Foi para comprar um bem?" — decisão explícita e cadastro sem beco sem saída.
//
// O que estes specs protegem:
//
//   1. gasto comum continua simples: o switch nasce desligado, e desligado o
//      lançamento é consumo puro — com ou sem vínculo a um bem;
//   2. ligado, a operação vira aquisição pelo MESMO override de hoje
//      (meta.nature='asset-acquisition') e o vínculo passa a ser obrigatório;
//   3. desligar remove só a natureza — o vínculo escolhido sobrevive;
//   4. lançamentos de origem estrutural (dívida, baixa de fixo) não podem ser
//      reclassificados pela edição manual;
//   5. sem nenhum bem cadastrado, o campo oferece o cadastro; a ida e a volta
//      preservam o rascunho e não criam despesa, dívida nem pagamento.
import { test, expect } from '@playwright/test';
import { abrirAppEmDemo, semearDados, lerEstado, esperarOverlay, esperarPosicaoEstavel } from './_helpers.js';

const PASTA = 'test-results/aquisicao';

const VEICULO = {
  id: 'veh-teste', name: 'Veículo Teste', brand: 'Marca Teste', model: 'Modelo Teste',
  year: '2020', color: 'Prata', plate: '', km: 1000, photo: null, notes: '',
  status: 'em_uso', history: [], linkedExpenses: [], linkedPendencias: [],
};
const PAT_VEICULO = {
  id: 'pat-veh-teste', _idOriginal: 'veh-teste', nome: 'Veículo Teste', tipo: 'veiculo',
  status: 'ativo', valorEstimado: 40000, historico: [],
};
const BEM = {
  id: 'pat-teste', nome: 'Bem Teste', tipo: 'outro', status: 'ativo',
  valorEstimado: 10000, historico: [],
};

// Zera tudo o que alimenta o formulário e o seletor de bens: o modo demo traz
// veículos e patrimônios próprios, e cada teste precisa controlar a lista.
const LIMPO = {
  incomeItems: [], dailyIncome: {}, expenses: [], debtPayments: [], fixedPayments: [],
  debts: [], fixedExpenses: [], pendencias: [], vehicles: [], patrimonios: [],
};

const linha = page => page.locator('#qa-aq-wrap');
const chave = page => page.locator('#qa-aq-switch');
const botaoCadastrar = page => page.locator('#qa-bem-add');

/** Abre o "+" no tipo Gasto, com o cenário semeado. */
async function abrirGasto(page, dados = {}) {
  await semearDados(page, { ...LIMPO, ...dados }, 'inicio');
  await page.locator('#global-fab').click();
  await esperarOverlay(page, 'modal-quick-add', true);
  await page.locator('#qa-btn-gas').click();
  await expect(page.locator('#qa-cat-row')).toBeVisible();
}

const naturezaDe = (page, desc) => page.evaluate(
  d => window._movementNature(window.eval(`D.expenses.find(e => e.description === ${JSON.stringify(d)})`)),
  desc
);

// ── O gasto comum continua simples ────────────────────────────────────────

test('o switch nasce desligado e não há acordeão no caminho', async ({ page }) => {
  await abrirAppEmDemo(page);
  await abrirGasto(page, { patrimonios: [BEM] });

  await expect(linha(page)).toBeVisible();
  await expect(page.locator('#qa-saida-aquisicao')).not.toBeChecked();
  await expect(page.locator('#qa-bem-lbl')).toHaveText('Relacionado a (opcional)');
  // O acordeão "Mais opções" não existe mais.
  await expect(page.locator('#qa-more-toggle')).toHaveCount(0);
  await expect(page.locator('#qa-more')).toHaveCount(0);
});

test('switch desligado: gasto comum é consumo', async ({ page }) => {
  await abrirAppEmDemo(page);
  await abrirGasto(page);

  await page.locator('#qa-amt-input').fill('75.50');
  await page.locator('#qa-desc').fill('Compra Comum Teste');
  await page.locator('#qa-save-btn').click();
  await esperarOverlay(page, 'modal-quick-add', false);

  expect(await naturezaDe(page, 'Compra Comum Teste')).toBe('consumo');
  const e = await lerEstado(page, "D.expenses.find(x => x.description === 'Compra Comum Teste')");
  expect(e.meta).toBeUndefined();
});

test('switch desligado com vínculo: consumo relacionado ao veículo', async ({ page }) => {
  await abrirAppEmDemo(page);
  await abrirGasto(page, { vehicles: [VEICULO], patrimonios: [PAT_VEICULO] });

  await page.locator('#qa-amt-input').fill('320');
  await page.locator('#qa-desc').fill('Gasolina Teste');
  await page.locator('#qa-bem-sel').selectOption('veh:veh-teste');
  await page.locator('#qa-save-btn').click();
  await esperarOverlay(page, 'modal-quick-add', false);

  expect(await naturezaDe(page, 'Gasolina Teste')).toBe('consumo');
  const e = await lerEstado(page, "D.expenses.find(x => x.description === 'Gasolina Teste')");
  expect(e.vehicleId, 'o vínculo opcional se perdeu').toBe('veh-teste');
});

// ── Aquisição ─────────────────────────────────────────────────────────────

test('switch ligado grava a aquisição pelo override canônico', async ({ page }) => {
  await abrirAppEmDemo(page);
  await abrirGasto(page, { patrimonios: [BEM] });

  await page.locator('#qa-amt-input').fill('8000');
  await page.locator('#qa-desc').fill('Aquisicao Teste');
  await chave(page).click();
  await expect(page.locator('#qa-bem-lbl')).toHaveText('Qual bem?');
  await page.locator('#qa-bem-sel').selectOption('pat:pat-teste');
  await page.locator('#qa-save-btn').click();
  await esperarOverlay(page, 'modal-quick-add', false);

  expect(await naturezaDe(page, 'Aquisicao Teste')).toBe('asset-acquisition');
  const e = await lerEstado(page, "D.expenses.find(x => x.description === 'Aquisicao Teste')");
  expect(e.meta.nature).toBe('asset-acquisition');
  expect(e.patrimonioId).toBe('pat-teste');
  // Nenhum identificador paralelo foi inventado para o bem.
  expect(e.meta.assetRef).toBeUndefined();

  const resumo = await page.evaluate(() => window._monthMovementSummary(0));
  expect(resumo.assetAcquisition).toBe(8000);
  expect(resumo.consumo).toBe(0);
  expect(resumo.totalCashOut).toBe(8000);
});

test('aquisição exige um bem: sem seleção, nada é gravado', async ({ page }) => {
  await abrirAppEmDemo(page);
  await abrirGasto(page, { patrimonios: [BEM] });

  await page.locator('#qa-amt-input').fill('900');
  await page.locator('#qa-desc').fill('Sem Bem Teste');
  await chave(page).click();
  await page.locator('#qa-bem-sel').selectOption('');
  await page.locator('#qa-save-btn').click();

  await expect(page.locator('#modal-quick-add')).toHaveClass(/open/);
  expect(await lerEstado(page, 'D.expenses.length')).toBe(0);
  // E o formulário volta a aceitar o Salvar depois do erro.
  await page.locator('#qa-bem-sel').selectOption('pat:pat-teste');
  await page.locator('#qa-save-btn').click();
  await esperarOverlay(page, 'modal-quick-add', false);
  expect(await lerEstado(page, 'D.expenses.length')).toBe(1);
});

test('desligar o switch remove só a natureza e preserva o bem escolhido', async ({ page }) => {
  await abrirAppEmDemo(page);
  await abrirGasto(page, { vehicles: [VEICULO], patrimonios: [PAT_VEICULO] });

  await page.locator('#qa-amt-input').fill('1500');
  await page.locator('#qa-desc').fill('Volta Atras Teste');
  await chave(page).click();
  await page.locator('#qa-bem-sel').selectOption('veh:veh-teste');
  // Marcou por engano: desliga.
  await chave(page).click();
  await expect(page.locator('#qa-bem-lbl')).toHaveText('Relacionado a (opcional)');
  // O bem continua selecionado — não é preciso preencher de novo.
  await expect(page.locator('#qa-bem-sel')).toHaveValue('veh:veh-teste');

  await page.locator('#qa-save-btn').click();
  await esperarOverlay(page, 'modal-quick-add', false);

  const e = await lerEstado(page, "D.expenses.find(x => x.description === 'Volta Atras Teste')");
  expect(e.vehicleId).toBe('veh-teste');
  expect(e.meta, 'sobrou override de natureza').toBeUndefined();
  expect(await naturezaDe(page, 'Volta Atras Teste')).toBe('consumo');
});

// ── Edição ────────────────────────────────────────────────────────────────

test('editar uma aquisição existente abre com o switch ligado e o bem certo', async ({ page }) => {
  await abrirAppEmDemo(page);
  await semearDados(page, {
    ...LIMPO,
    patrimonios: [BEM],
    expenses: [{
      id: 'exp-aq', date: '2026-06-10', amount: 8000, category: 'Outros',
      description: 'Aquisicao Existente', patrimonioId: 'pat-teste',
      meta: { nature: 'asset-acquisition' },
    }],
  }, 'inicio');

  await page.evaluate(() => window.openQuickAdd({ kind: 'exp', id: 'exp-aq' }));
  await esperarOverlay(page, 'modal-quick-add', true);

  await expect(page.locator('#qa-btn-gas')).toHaveClass(/active/);
  await expect(page.locator('#qa-saida-aquisicao')).toBeChecked();
  await expect(page.locator('#qa-bem-lbl')).toHaveText('Qual bem?');
  await expect(page.locator('#qa-bem-sel')).toHaveValue('pat:pat-teste');
  await expect(page.locator('#qa-amt-input')).toHaveValue('8000');

  // Salvar sem mudar nada não duplica nem recria.
  await page.locator('#qa-save-btn').click();
  await esperarOverlay(page, 'modal-quick-add', false);
  const todas = await lerEstado(page, "D.expenses.filter(x => x.description === 'Aquisicao Existente')");
  expect(todas.length).toBe(1);
  expect(todas[0].id).toBe('exp-aq');
  expect(todas[0].meta.nature).toBe('asset-acquisition');
  expect(todas[0].patrimonioId).toBe('pat-teste');
  expect(todas[0].amount).toBe(8000);
});

// ── Fluxos protegidos ─────────────────────────────────────────────────────

test('pagamento de dívida não pode ser reclassificado pela edição', async ({ page }) => {
  await abrirAppEmDemo(page);
  await semearDados(page, {
    ...LIMPO,
    patrimonios: [BEM],
    expenses: [{
      id: 'exp-div', date: '2026-06-10', amount: 200, category: 'Dívidas',
      description: 'Parcela Teste', meta: { source: 'debt', debtId: 'divida-x' },
    }],
  }, 'inicio');

  await page.evaluate(() => window.openQuickAdd({ kind: 'exp', id: 'exp-div' }));
  await esperarOverlay(page, 'modal-quick-add', true);
  await expect(linha(page)).toBeHidden();

  // A garantia ficou mais forte: o pagamento de dívida nem chega a abrir o
  // formulário editável — é apresentado em leitura, sem Salvar (ver
  // edicao-estrutural.spec.js). Reclassificar deixou de ser alcançável.
  await expect(page.locator('#qa-protegido')).toBeVisible();
  await expect(page.locator('#qa-save-btn')).toBeHidden();
  await page.evaluate(() => window.qaConfirm());

  const e = await lerEstado(page, "D.expenses.find(x => x.id === 'exp-div')");
  expect(e.meta.source).toBe('debt');
  expect(e.meta.nature, 'a natureza estrutural foi sobrescrita').toBeUndefined();
  expect(await naturezaDe(page, 'Parcela Teste')).toBe('debt-payment');
});

test('baixa de gasto fixo não pode ser reclassificada pela edição', async ({ page }) => {
  await abrirAppEmDemo(page);
  await semearDados(page, {
    ...LIMPO,
    patrimonios: [BEM],
    expenses: [{
      id: 'exp-fix', date: '2026-06-10', amount: 99.9, category: 'Contas',
      description: 'Internet Teste', meta: { source: 'fixed-payment', fixedId: 'fixo-x' },
    }],
  }, 'inicio');

  await page.evaluate(() => window.openQuickAdd({ kind: 'exp', id: 'exp-fix' }));
  await esperarOverlay(page, 'modal-quick-add', true);
  await expect(linha(page)).toBeHidden();

  await page.locator('#qa-save-btn').click();
  await esperarOverlay(page, 'modal-quick-add', false);
  const e = await lerEstado(page, "D.expenses.find(x => x.id === 'exp-fix')");
  expect(e.meta.nature).toBeUndefined();
  expect(e.meta.source).toBe('fixed-payment');
});

test('receita não mostra o controle de aquisição', async ({ page }) => {
  await abrirAppEmDemo(page);
  await semearDados(page, { ...LIMPO, patrimonios: [BEM] }, 'inicio');
  await page.locator('#global-fab').click();
  await esperarOverlay(page, 'modal-quick-add', true);
  await expect(linha(page)).toBeHidden();
  await expect(page.locator('#qa-bem-row')).toBeHidden();
});

// ── Sem nenhum bem cadastrado: a saída ────────────────────────────────────

test('sem bens, ligar o switch oferece "Cadastrar um bem" no lugar do seletor', async ({ page }) => {
  await abrirAppEmDemo(page);
  await abrirGasto(page);

  await expect(botaoCadastrar(page)).toBeHidden();
  await chave(page).click();
  await expect(botaoCadastrar(page)).toBeVisible();
  await expect(botaoCadastrar(page)).toHaveText(/Cadastrar um bem/);
  await expect(page.locator('#qa-bem-sel')).toBeHidden();

  // Desligar devolve o campo normal.
  await chave(page).click();
  await expect(botaoCadastrar(page)).toBeHidden();
  await expect(page.locator('#qa-bem-sel')).toBeVisible();
});

test('havendo bem ativo, o atalho de cadastro não aparece', async ({ page }) => {
  await abrirAppEmDemo(page);
  await abrirGasto(page, { patrimonios: [BEM] });
  await chave(page).click();
  await expect(botaoCadastrar(page)).toBeHidden();
  await expect(page.locator('#qa-bem-sel')).toBeVisible();
});

test('cadastrar um bem e voltar: rascunho intacto e bem novo selecionado', async ({ page }) => {
  await abrirAppEmDemo(page);
  await abrirGasto(page);

  await page.locator('#qa-amt-input').fill('2000');
  await page.locator('#qa-date').fill('2026-06-12');
  await page.locator('#qa-desc').fill('Compra Do Bem Teste');
  await page.locator('#qa-cat-sel').selectOption({ index: 1 });
  const categoria = await page.locator('#qa-cat-sel').inputValue();
  await chave(page).click();

  await botaoCadastrar(page).click();
  await esperarOverlay(page, 'modal-quick-add', false);
  await esperarOverlay(page, 'pat-sheet', true);

  // Fluxo canônico de patrimônio: escolhe o tipo e preenche o cadastro.
  await page.locator('#pat-sheet button', { hasText: 'Veículo' }).first().click();
  await page.locator('#vf-name').fill('Veículo Teste');
  await page.locator('#vf-valor').fill('40000');
  await page.locator('#veh-form-cont button', { hasText: 'Salvar' }).first().click();

  // De volta ao lançamento, com tudo como estava.
  await esperarOverlay(page, 'modal-quick-add', true);
  await expect(page.locator('#qa-btn-gas')).toHaveClass(/active/);
  await expect(page.locator('#qa-amt-input')).toHaveValue('2000');
  await expect(page.locator('#qa-date')).toHaveValue('2026-06-12');
  await expect(page.locator('#qa-desc')).toHaveValue('Compra Do Bem Teste');
  await expect(page.locator('#qa-cat-sel')).toHaveValue(categoria);
  await expect(page.locator('#qa-saida-aquisicao')).toBeChecked();
  await expect(page.locator('#qa-bem-lbl')).toHaveText('Qual bem?');

  // O bem recém-criado voltou selecionado — e nada foi gravado ainda.
  const vehId = await lerEstado(page, 'D.vehicles[0].id');
  await expect(page.locator('#qa-bem-sel')).toHaveValue('veh:' + vehId);
  expect(await lerEstado(page, 'D.expenses.length'), 'o cadastro salvou o lançamento sozinho').toBe(0);

  // Só agora o usuário confirma.
  await page.locator('#qa-save-btn').click();
  await esperarOverlay(page, 'modal-quick-add', false);

  const estado = await lerEstado(page, `({
    despesas: D.expenses.length,
    bens: D.vehicles.length,
    pagamentos: D.debtPayments.length,
    dividas: D.debts.length,
  })`);
  expect(estado.despesas, 'mais de uma despesa foi criada').toBe(1);
  expect(estado.bens).toBe(1);
  expect(estado.pagamentos, 'apareceu pagamento de dívida').toBe(0);
  expect(estado.dividas).toBe(0);

  const e = await lerEstado(page, 'D.expenses[0]');
  expect(e.amount).toBe(2000);
  expect(e.description).toBe('Compra Do Bem Teste');
  expect(e.meta.nature).toBe('asset-acquisition');
  expect(e.vehicleId).toBe(vehId);
});

test('cadastrar um imóvel a partir do lançamento também volta selecionado', async ({ page }) => {
  await abrirAppEmDemo(page);
  await abrirGasto(page);

  await page.locator('#qa-amt-input').fill('350000');
  await page.locator('#qa-desc').fill('Compra Imovel Teste');
  await chave(page).click();
  await botaoCadastrar(page).click();
  await esperarOverlay(page, 'pat-sheet', true);

  await page.locator('#pat-sheet button', { hasText: 'Imóvel' }).first().click();
  await page.locator('#pf-nome').fill('Imovel Teste');
  await page.locator('#pat-form-cont button', { hasText: 'Salvar' }).first().click();

  await esperarOverlay(page, 'modal-quick-add', true);
  const patId = await lerEstado(page, "D.patrimonios.find(p => p.nome === 'Imovel Teste').id");
  await expect(page.locator('#qa-bem-sel')).toHaveValue('pat:' + patId);
  await expect(page.locator('#qa-amt-input')).toHaveValue('350000');
  expect(await lerEstado(page, 'D.expenses.length')).toBe(0);
});

test('bem novo com financiamento: dívida fica independente, sem pagamento', async ({ page }) => {
  await abrirAppEmDemo(page);
  await abrirGasto(page);

  await page.locator('#qa-amt-input').fill('20000');
  await page.locator('#qa-desc').fill('Entrada Do Carro Teste');
  await chave(page).click();
  await botaoCadastrar(page).click();
  await esperarOverlay(page, 'pat-sheet', true);
  await page.locator('#pat-sheet button', { hasText: 'Veículo' }).first().click();

  await page.locator('#vf-name').fill('Carro Financiado Teste');
  await page.locator('#vf-valor').fill('80000');
  await page.locator('#veh-form-cont label.pf-switch').first().click();
  await page.locator('#vff-financiado').fill('60000');
  await page.locator('#vff-saldo').fill('60000');
  await page.locator('#veh-form-cont button', { hasText: 'Salvar' }).first().click();

  await esperarOverlay(page, 'modal-quick-add', true);
  await page.locator('#qa-save-btn').click();
  await esperarOverlay(page, 'modal-quick-add', false);

  const estado = await lerEstado(page, `({
    despesas: D.expenses.length,
    dividas: D.debts.length,
    saldo: D.debts.length ? D.debts[0].valorOriginal : 0,
    pagamentos: D.debtPayments.length,
  })`);
  expect(estado.despesas, 'o lançamento duplicou').toBe(1);
  expect(estado.dividas, 'o financiamento do bem não foi preservado').toBe(1);
  // O valor do lançamento NÃO virou entrada nem amortização do financiamento.
  expect(estado.saldo).toBe(60000);
  expect(estado.pagamentos, 'a volta ao lançamento criou pagamento de dívida').toBe(0);

  const e = await lerEstado(page, 'D.expenses[0]');
  expect(e.amount).toBe(20000);
  expect(e.meta.nature).toBe('asset-acquisition');
});

// ── Cancelamentos e limpeza do rascunho ───────────────────────────────────

test('cancelar na folha de tipo volta ao lançamento com o rascunho', async ({ page }) => {
  await abrirAppEmDemo(page);
  await abrirGasto(page);

  await page.locator('#qa-amt-input').fill('1234');
  await page.locator('#qa-desc').fill('Rascunho Teste');
  await chave(page).click();
  await botaoCadastrar(page).click();
  await esperarOverlay(page, 'pat-sheet', true);

  await page.locator('#pat-sheet button', { hasText: 'Cancelar' }).click();
  await esperarOverlay(page, 'modal-quick-add', true);

  await expect(page.locator('#qa-amt-input')).toHaveValue('1234');
  await expect(page.locator('#qa-desc')).toHaveValue('Rascunho Teste');
  await expect(page.locator('#qa-saida-aquisicao')).toBeChecked();
  await expect(botaoCadastrar(page)).toBeVisible();

  const estado = await lerEstado(page, `({
    bens: D.vehicles.length + D.patrimonios.length,
    despesas: D.expenses.length,
    dividas: D.debts.length,
  })`);
  expect(estado.bens).toBe(0);
  expect(estado.despesas).toBe(0);
  expect(estado.dividas).toBe(0);
});

test('cancelar no formulário do bem volta ao lançamento com o rascunho', async ({ page }) => {
  await abrirAppEmDemo(page);
  await abrirGasto(page);

  await page.locator('#qa-amt-input').fill('555');
  await page.locator('#qa-desc').fill('Cancelou Bem Teste');
  await chave(page).click();
  await botaoCadastrar(page).click();
  await esperarOverlay(page, 'pat-sheet', true);
  await page.locator('#pat-sheet button', { hasText: 'Veículo' }).first().click();
  await expect(page.locator('#vf-name')).toBeVisible();

  // Voltar do formulário do bem é cancelamento: nada criado, rascunho intacto.
  await page.locator('#veh-form-cont .page-back-btn').first().click();
  await esperarOverlay(page, 'modal-quick-add', true);

  await expect(page.locator('#qa-amt-input')).toHaveValue('555');
  await expect(page.locator('#qa-desc')).toHaveValue('Cancelou Bem Teste');
  await expect(page.locator('#qa-saida-aquisicao')).toBeChecked();
  expect(await lerEstado(page, 'D.vehicles.length')).toBe(0);
  expect(await lerEstado(page, 'D.expenses.length')).toBe(0);

  // E dá para seguir: desligar o switch e salvar como gasto comum.
  await chave(page).click();
  await page.locator('#qa-save-btn').click();
  await esperarOverlay(page, 'modal-quick-add', false);
  expect(await naturezaDe(page, 'Cancelou Bem Teste')).toBe('consumo');
});

test('cancelar o lançamento limpa o rascunho', async ({ page }) => {
  await abrirAppEmDemo(page);
  await abrirGasto(page);

  await page.locator('#qa-amt-input').fill('777');
  await page.locator('#qa-desc').fill('Descartado Teste');
  await chave(page).click();
  await botaoCadastrar(page).click();
  await esperarOverlay(page, 'pat-sheet', true);
  await page.locator('#pat-sheet button', { hasText: 'Cancelar' }).click();
  await esperarOverlay(page, 'modal-quick-add', true);

  // Agora desiste de vez.
  await page.locator('#modal-quick-add .page-back-btn').click();
  await esperarOverlay(page, 'modal-quick-add', false);
  expect(await lerEstado(page, '_qaRascunho')).toBeNull();

  // Reabrir o "+" traz o formulário limpo, sem resquício do rascunho.
  await page.locator('#global-fab').click();
  await esperarOverlay(page, 'modal-quick-add', true);
  await expect(page.locator('#qa-amt-input')).toHaveValue('');
  await expect(page.locator('#qa-desc')).toHaveValue('');
});

test('sair para outra aba durante o cadastro descarta o rascunho', async ({ page }) => {
  await abrirAppEmDemo(page);
  await abrirGasto(page);

  await page.locator('#qa-amt-input').fill('999');
  await chave(page).click();
  await botaoCadastrar(page).click();
  await esperarOverlay(page, 'pat-sheet', true);

  await page.evaluate(() => window.switchTab('semana'));
  expect(await lerEstado(page, '_qaRascunho')).toBeNull();
  expect(await lerEstado(page, 'D.expenses.length')).toBe(0);
});

test('o rascunho não sobrevive a um reload', async ({ page }) => {
  await abrirAppEmDemo(page);
  await abrirGasto(page);

  await page.locator('#qa-amt-input').fill('4321');
  await chave(page).click();
  await botaoCadastrar(page).click();
  await esperarOverlay(page, 'pat-sheet', true);

  // Nada do rascunho pode ter ido para o armazenamento persistente.
  const persistido = await page.evaluate(() => {
    const chaves = Object.keys(localStorage);
    return chaves.filter(k => (localStorage.getItem(k) || '').includes('4321'));
  });
  expect(persistido, 'o rascunho vazou para o localStorage').toEqual([]);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.startDemo === 'function');
  expect(await page.evaluate(() => window.eval('_qaRascunho'))).toBeNull();
});

// ── Visual ────────────────────────────────────────────────────────────────

test.describe('visual do controle de aquisição', () => {
  const LARGURAS = [320, 375, 390, 430];

  for (const tema of ['light', 'dark']) {
    for (const largura of LARGURAS) {
      test(`controle legível em ${tema} @ ${largura}px`, async ({ page }) => {
        await page.setViewportSize({ width: largura, height: 900 });
        await page.emulateMedia({ colorScheme: tema });
        await abrirAppEmDemo(page);
        await abrirGasto(page, { patrimonios: [BEM] });

        await expect(page.locator('html')).toHaveAttribute('data-theme', tema);
        await chave(page).click();

        const folha = page.locator('#modal-quick-add .sheet');
        expect(await folha.evaluate(n => n.scrollWidth > n.clientWidth + 1)).toBe(false);
        // O switch continua alcançável e o rótulo não some.
        await expect(chave(page)).toBeVisible();
        const fonte = await page.locator('#qa-aq-lbl').evaluate(n => parseFloat(getComputedStyle(n).fontSize));
        expect(fonte).toBeGreaterThanOrEqual(13);

        await esperarPosicaoEstavel(page, '#modal-quick-add .sheet');
        await folha.screenshot({ path: `${PASTA}/aquisicao-${tema}-${largura}.png` });
      });
    }
  }

  test('sem bens: o atalho de cadastro cabe em 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await abrirAppEmDemo(page);
    await abrirGasto(page);
    await chave(page).click();

    const folha = page.locator('#modal-quick-add .sheet');
    expect(await folha.evaluate(n => n.scrollWidth > n.clientWidth + 1)).toBe(false);
    await esperarPosicaoEstavel(page, '#modal-quick-add .sheet');
    await folha.screenshot({ path: `${PASTA}/aquisicao-sem-bem-320.png` });
  });

  test('descrição longa e valor grande não quebram o bloco em 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await abrirAppEmDemo(page);
    await abrirGasto(page, {
      patrimonios: [
        { ...BEM, nome: 'Bem Com Nome Bastante Extenso Para Teste De Layout' },
        { id: 'pat-2', nome: 'Outro Bem Teste', tipo: 'outro', status: 'ativo', valorEstimado: 500, historico: [] },
        { id: 'pat-3', nome: 'Terceiro Bem Teste', tipo: 'imovel', status: 'ativo', valorEstimado: 900000, historico: [] },
      ],
    });
    await page.locator('#qa-amt-input').fill('1234567.89');
    await page.locator('#qa-desc').fill('Descrição bem longa de um lançamento para teste de layout apertado');
    await chave(page).click();

    const folha = page.locator('#modal-quick-add .sheet');
    expect(await folha.evaluate(n => n.scrollWidth > n.clientWidth + 1)).toBe(false);
    const linhaAq = await page.locator('#qa-aq-row, .qa-aq-row').first().boundingBox();
    expect(linhaAq.height, 'a linha do switch virou um card').toBeLessThan(70);
    await esperarPosicaoEstavel(page, '#modal-quick-add .sheet');
    await folha.screenshot({ path: `${PASTA}/aquisicao-textos-longos-320.png` });
  });

  test('gasto comum em 390px: o formulário continua enxuto', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await abrirAppEmDemo(page);
    await abrirGasto(page, { patrimonios: [BEM] });
    await expect(page.locator('#qa-saida-aquisicao')).not.toBeChecked();
    await esperarPosicaoEstavel(page, '#modal-quick-add .sheet');
    await page.locator('#modal-quick-add .sheet').screenshot({ path: `${PASTA}/gasto-comum-390.png` });
  });

  test('teclado aberto (viewport curto) não esconde o controle', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 420 });
    await abrirAppEmDemo(page);
    await abrirGasto(page, { patrimonios: [BEM] });
    await page.locator('#qa-amt-input').click();
    await chave(page).scrollIntoViewIfNeeded();
    await expect(chave(page)).toBeVisible();
    await expect(page.locator('#qa-bem-sel')).toBeVisible();
  });
});
