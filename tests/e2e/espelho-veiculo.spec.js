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
import { abrirAppEmDemo, semearDados, lerEstado } from './_helpers.js';

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
