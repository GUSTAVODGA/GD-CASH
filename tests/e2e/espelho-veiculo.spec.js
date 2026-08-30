// O espelho do veículo em D.patrimonios.
//
// Um carro vive em dois lugares: a identidade em `D.vehicles` (nome, foto,
// placa, km, status) e o dinheiro num registro de `D.patrimonios` ligado por
// `_idOriginal`. `_migrateVehiclesToPatrimonios` cria esse registro no login.
//
// O DEFEITO: migrar era um evento único. Quem já tinha registro era PULADO,
// para sempre — então renomear o carro, rodar mais 15 mil km ou pô-lo à venda
// deixava o patrimônio congelado no dia da migração:
//
//   APÓS MIGRAR  nome=Gol 2015              km=80000  status=ativo
//   APÓS EDITAR  nome=Gol 2015              km=80000  status=ativo
//                (o veículo já era "Gol 2015 (vendido...)", 95000, a_venda)
//
// Nada disso aparecia na tela porque o app desvia do espelho em todo lugar:
// busca a identidade em `D.vehicles` e filtra `tipo !== 'veiculo'` das listas
// de patrimônio. Esse desvio é o imposto — cada leitura nova precisa saber que
// "para veículo, a identidade mora do outro lado", e a primeira que esquecer
// mostra o dado velho.
//
// Migrar passou a ser sincronizar. Estes testes prendem as duas metades da
// regra: o que é do veículo acompanha, e o que é do patrimônio não é tocado.
import { test, expect } from '@playwright/test';
import { abrirAppEmDemo, semearDados, lerEstado, irParaAba } from './_helpers.js';

const AGORA = new Date(2026, 7, 20, 12, 0, 0);

const VEICULO = {
  id: 'v1', name: 'Gol 2015', plate: 'ABC1D23', brand: 'VW', model: 'Gol', year: '2015',
  km: 80000, color: 'Prata', status: 'em_uso', photo: null, notes: 'Comprado usado',
  history: [], linkedExpenses: [], linkedPendencias: [],
};

const BASE = {
  platforms: [{ id: 'p1', name: 'Fonte A', color: '#0C7A52' }],
  incomeItems: [], dailyIncome: {}, expenses: [], debtPayments: [], fixedPayments: [],
  debts: [], fixedExpenses: [], pendencias: [], reservaHistory: [], goals: [],
  daysOff: [], reminders: [], emergency: { current: 0, target: 0 },
  patrimonios: [], vehicles: [VEICULO],
};

/** Abre o app e deixa a migração ter rodado, como acontece no login. */
const abrir = async (page, dados) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const erros = await abrirAppEmDemo(page, { agora: AGORA });
  await semearDados(page, dados || BASE, 'inicio');
  await page.evaluate(() => window._migrateVehiclesToPatrimonios());
  return erros;
};

const espelho = page => lerEstado(page, `(() => {
  const p = (D.patrimonios || []).find(x => x.tipo === 'veiculo');
  return p ? { nome: p.nome, status: p.status, det: p.detalhes || {},
               valorEstimado: p.valorEstimado, financiamentos: (p.financiamentos||[]).length,
               historico: (p.historico||[]).length, etiquetas: (p.etiquetas||[]).length,
               observacoes: p.observacoes } : null;
})()`);

test('a migração continua criando o espelho, uma vez só', async ({ page }) => {
  await abrir(page);
  expect(await lerEstado(page, 'D.patrimonios.length')).toBe(1);
  // Idempotência: rodar de novo não duplica.
  await page.evaluate(() => { window._migrateVehiclesToPatrimonios(); window._migrateVehiclesToPatrimonios(); });
  expect(await lerEstado(page, 'D.patrimonios.length')).toBe(1);
  const e = await espelho(page);
  expect(e.nome).toBe('Gol 2015');
  expect(e.det.quilometragem).toBe(80000);
  expect(e.status).toBe('ativo');
});

test('O DEFEITO: editar o veículo passa a alcançar o espelho', async ({ page }) => {
  await abrir(page);
  await page.evaluate(() => {
    const v = D.vehicles[0];
    v.name = 'Gol 2015 (à venda)';
    v.km = 95000;
    v.plate = 'XYZ9K88';
    v.status = 'a_venda';
    window._migrateVehiclesToPatrimonios();
  });
  const e = await espelho(page);
  expect(e.nome, 'o nome ficou congelado no dia da migração').toBe('Gol 2015 (à venda)');
  expect(e.det.quilometragem, 'a km ficou congelada').toBe(95000);
  expect(e.det.placa).toBe('XYZ9K88');
  expect(e.status).toBe('ativo');   // a_venda continua sendo um bem ativo
});

test('vender o veículo chega ao espelho como encerrado', async ({ page }) => {
  await abrir(page);
  await page.evaluate(() => { D.vehicles[0].status = 'vendido'; window._migrateVehiclesToPatrimonios(); });
  expect((await espelho(page)).status).toBe('vendido');
  await page.evaluate(() => { D.vehicles[0].status = 'arquivado'; window._migrateVehiclesToPatrimonios(); });
  expect((await espelho(page)).status).toBe('inativo');
});

test('O QUE É DO PATRIMÔNIO NÃO É TOCADO pela sincronização', async ({ page }) => {
  await abrir(page);
  // Dados que só existem do lado do patrimônio — valor, financiamento,
  // histórico, etiquetas. Nenhum deles tem origem no veículo.
  await page.evaluate(() => {
    const p = D.patrimonios[0];
    p.valorEstimado = 42000;
    p.financiamentos = [{ id: 'f1', instituicao: 'Banco X' }];
    p.historico = [{ id: 'h1', data: '2026-08-01', tipo: 'evento', descricao: 'Revisão', valor: 300 }];
    p.etiquetas = ['familia'];
    p.observacoes = 'Anotação feita no patrimônio';
  });
  // Uma edição do veículo dispara a sincronização.
  await page.evaluate(() => { D.vehicles[0].name = 'Outro nome'; window._migrateVehiclesToPatrimonios(); });

  const e = await espelho(page);
  expect(e.nome, 'o campo do veículo deveria acompanhar').toBe('Outro nome');
  expect(e.valorEstimado, 'a sincronização apagou o valor estimado').toBe(42000);
  expect(e.financiamentos, 'a sincronização apagou o financiamento').toBe(1);
  expect(e.historico, 'a sincronização apagou o histórico').toBe(1);
  expect(e.etiquetas, 'a sincronização apagou as etiquetas').toBe(1);
  expect(e.observacoes, 'a sincronização sobrescreveu a anotação').toBe('Anotação feita no patrimônio');
});

test('sincronizar sem nada a mudar não suja o estado', async ({ page }) => {
  await abrir(page);
  const antes = await lerEstado(page, 'JSON.stringify(D.patrimonios)');
  const r = await page.evaluate(() => window._migrateVehiclesToPatrimonios());
  expect(r.migrated).toBe(0);
  expect(r.sincronizados, 'sincronizou algo sem ter mudança').toBe(0);
  expect(r.ran, 'pediu gravação sem ter o que gravar').toBe(false);
  expect(await lerEstado(page, 'JSON.stringify(D.patrimonios)')).toBe(antes);
});

test('salvar o veículo pela tela sincroniza na hora, sem esperar o próximo login', async ({ page }) => {
  await abrir(page);
  const mudou = await page.evaluate(() => {
    // Caminho real de gravação de status, com a folha do produto.
    // `_vehStatusTarget` é `var` no escopo do script, não propriedade de
    // `window` — definir `window._vehStatusTarget` não alcança o binding.
    // Quem define é o próprio abridor.
    window.openVehStatus('v1');
    // "vendido" NÃO é opção desta folha — vender um bem é outro fluxo
    // (venda-sheet). Definir um valor que o select não tem deixaria o campo
    // vazio e o teste passaria pelo motivo errado.
    document.getElementById('vs-status').value = 'na_oficina';
    window.saveVehStatus();
    const p = D.patrimonios.find(x => x.tipo === 'veiculo');
    return { veiculo: D.vehicles[0].status, espelho: p.status,
             opcoes: [...document.querySelectorAll('#vs-status option')].map(o => o.value) };
  });
  expect(mudou.opcoes, 'as opções de status mudaram').toContain('na_oficina');
  expect(mudou.veiculo).toBe('na_oficina');
  // Na oficina o bem segue ativo — o espelho traduz o vocabulário.
  expect(mudou.espelho, 'o espelho só ia acordar no próximo login').toBe('ativo');
});

test('sem veículo nenhum, a migração não inventa patrimônio', async ({ page }) => {
  await abrir(page, { ...BASE, vehicles: [] });
  expect(await lerEstado(page, 'D.patrimonios.length')).toBe(0);
});

// ══ FASE B: a identidade passa a vir do espelho ═══════════════════════════
//
// As quatro funções-costura — `_patNomeOf`, `_patTipoOf`, `_patIsVeiculo`,
// `_patLifecycleOf` — perguntavam ao VEÍCULO primeiro. Agora perguntam ao
// patrimônio, com o veículo como rede de segurança. Trocar a ordem nesse
// punhado de funções vale por trocá-la em todos os chamadores.
//
// O que estes testes protegem não é "lê do lugar novo" — é que a rede de
// segurança continua existindo, e que o vocabulário de status do veículo não
// vaza mais para fora da tradução.

test('a identidade do bem vem do espelho, não do veículo', async ({ page }) => {
  await abrir(page);
  // Divergência artificial: só um teste consegue produzir isto, e é
  // exatamente o que revela de onde a leitura vem.
  await page.evaluate(() => { D.patrimonios[0].nome = 'NOME DO ESPELHO'; });
  expect(await lerEstado(page, `_patNomeOf('v1')`)).toBe('NOME DO ESPELHO');
  expect(await lerEstado(page, `_patTipoOf('v1')`)).toBe('veiculo');
  expect(await lerEstado(page, `_patIsVeiculo('v1')`)).toBe(true);

  const item = await lerEstado(page, `_patUnifiedItems().find(i => i.vehId === 'v1')`);
  expect(item.nome, 'a lista de bens ainda lia o nome do veículo').toBe('NOME DO ESPELHO');
});

test('REDE DE SEGURANÇA: veículo sem espelho ainda aparece inteiro', async ({ page }) => {
  await abrir(page);
  // Simula o instante antes da migração rodar — ou uma nuvem a meio caminho.
  await page.evaluate(() => { D.patrimonios = []; });
  expect(await lerEstado(page, `_patNomeOf('v1')`)).toBe('Gol 2015');
  expect(await lerEstado(page, `_patTipoOf('v1')`)).toBe('veiculo');
  expect(await lerEstado(page, `_patIsVeiculo('v1')`)).toBe(true);
  expect(await lerEstado(page, `_patLifecycleOf('v1')`)).toBe('ativo');

  const item = await lerEstado(page, `_patUnifiedItems().find(i => i.vehId === 'v1')`);
  expect(item.nome, 'o veículo sumiu da lista sem espelho').toBe('Gol 2015');
  expect(item.status).toBe('ativo');
});

test('o ciclo de vida do bem responde pelo espelho', async ({ page }) => {
  await abrir(page);
  expect(await lerEstado(page, `_patLifecycleOf('v1')`)).toBe('ativo');
  await page.evaluate(() => { D.vehicles[0].status = 'vendido'; window._migrateVehiclesToPatrimonios(); });
  expect(await lerEstado(page, `_patLifecycleOf('v1')`)).toBe('encerrado');
  const item = await lerEstado(page, `_patUnifiedItems().find(i => i.vehId === 'v1')`);
  expect(item.status).toBe('encerrado');
});

test('NA OFICINA e À VENDA continuam sendo bem ativo', async ({ page }) => {
  await abrir(page);
  for (const st of ['na_oficina', 'a_venda', 'em_uso']) {
    await page.evaluate(s => { D.vehicles[0].status = s; window._migrateVehiclesToPatrimonios(); }, st);
    expect(await lerEstado(page, `_patLifecycleOf('v1')`), `status ${st}`).toBe('ativo');
  }
});

test('NADA SE PERDEU: a lista de bens continua trazendo veículo e imóvel', async ({ page }) => {
  await abrir(page, { ...BASE, patrimonios: [{ id: 'pat-im', tipo: 'imovel', nome: 'Apartamento',
    status: 'ativo', valorEstimado: 300000, historico: [], detalhes: {}, financiamentos: [] }] });
  const itens = await lerEstado(page, '_patUnifiedItems()');
  expect(itens.length, 'a lista perdeu um bem').toBe(2);
  expect(itens.map(i => i.tipo).sort()).toEqual(['imovel', 'veiculo']);
  expect(itens.find(i => i.tipo === 'imovel').valorEstimado).toBe(300000);
  expect(itens.find(i => i.tipo === 'veiculo').nome).toBe('Gol 2015');
});

test('a inversão é só leitura: não escreve em D nem chama save()', async ({ page }) => {
  await abrir(page);
  const antes = await lerEstado(page, 'JSON.stringify(D)');
  const salvou = await page.evaluate(() => {
    let n = 0; const s = window.save; window.save = () => { n++; return s && s(); };
    window._patUnifiedItems(); window._patNomeOf('v1'); window._patTipoOf('v1');
    window._patLifecycleOf('v1'); window._patIsVeiculo('v1');
    window.save = s; return n;
  });
  expect(salvou).toBe(0);
  expect(await lerEstado(page, 'JSON.stringify(D)')).toBe(antes);
});

// ══ FASE C: o fluxo legado de Veículos sai de cena ════════════════════════
//
// Havia TRÊS renderizadores de detalhe de bem. Um deles, `renderVehDetail`,
// pertencia a uma tela de Veículos anterior ao Patrimônio — com lista, header
// próprio e botão "Novo". Essa tela já não era alcançável: `openLegacyVehList`
// tinha ZERO chamadores (o link que a abria saiu, deixando até o CSS
// `.pat-legacy-link` órfão), e o markup estava `display:none`.
//
// Pior que morta, ela era uma armadilha: `_vehDetailMode` nascia 'legacy', e
// qualquer chamada a `_refreshVehDetail` antes de um caminho de entrada teria
// levado o usuário para uma tela invisível. Só não acontecia por sorte de
// ordem.
//
// Estes testes protegem o que ficou: a tela de bem que sobrou é a integrada, e
// ela continua completa.

test('o fluxo legado de Veículos não existe mais em lugar nenhum', async ({ page }) => {
  await abrir(page);
  const restos = await page.evaluate(() => ({
    funcoes: ['renderVehDetail', '_renderLegacyVehList', 'openLegacyVehList',
              'exitLegacyVehList', 'openLegacyVehFromIntegrated', 'backFromLegacyVehDetail']
      .filter(f => typeof window[f] === 'function'),
    markup: ['veh-legacy-header', 'veh-list-view', 'veh-detail-view', 'veh-list', 'veh-detail-cont']
      .filter(id => !!document.getElementById(id)),
  }));
  expect(restos.funcoes, 'função do fluxo legado ainda existe').toEqual([]);
  expect(restos.markup, 'markup do fluxo legado ainda está no documento').toEqual([]);
});

test('NADA SE PERDEU: o detalhe do veículo continua inteiro', async ({ page }) => {
  const erros = await abrir(page);
  await irParaAba(page, 'patrimonio');
  await page.waitForTimeout(300);
  await page.evaluate(() => window.abrirVehPatDetail
    ? window.abrirVehPatDetail('v1') : window.renderVehPatDetail('v1'));
  await page.waitForTimeout(300);

  const vista = page.locator('#pat-veh-detail-view');
  await expect(vista).toBeVisible();
  await expect(vista).toContainText('Gol 2015');
  // O detalhe integrado põe placa, marca, modelo e ano no cabeçalho, sem
  // rótulo — então o que se verifica é o VALOR, não a palavra.
  for (const dado of ['ABC1D23', 'VW', 'Gol', '2015']) {
    await expect(vista, `o detalhe perdeu o dado "${dado}"`).toContainText(dado);
  }
  // E as ações do bem continuam alcançáveis.
  const acoes = await vista.evaluate(el => (el.textContent || '').replace(/\s+/g, ' '));
  expect(acoes.length, 'o detalhe veio vazio').toBeGreaterThan(80);
  expect(erros).toEqual([]);
});

test('a tela Patrimônio só alterna vistas que existem', async ({ page }) => {
  await abrir(page);
  await irParaAba(page, 'patrimonio');
  const ok = await page.evaluate(() => {
    const vistas = ['pat-home-view','veh-form-view','pat-form-view','pat-detail-view','pat-veh-detail-view'];
    return vistas.every(v => !!document.getElementById(v));
  });
  expect(ok, 'o alternador de vistas aponta para um id que não existe').toBe(true);
});

test('voltar do detalhe leva à home do Patrimônio, não a uma tela invisível', async ({ page }) => {
  await abrir(page);
  await irParaAba(page, 'patrimonio');
  await page.evaluate(() => window.renderVehPatDetail('v1'));
  await page.waitForTimeout(250);
  await page.evaluate(() => window.renderVehList());   // ponto de retorno do CRUD
  await page.waitForTimeout(250);
  const visivel = await page.evaluate(() => {
    const h = document.getElementById('pat-home-view');
    return h ? getComputedStyle(h).display !== 'none' : false;
  });
  expect(visivel, 'o retorno do CRUD não chega à home do Patrimônio').toBe(true);
});
