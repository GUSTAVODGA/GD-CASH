// Autoteste do loader: a fundação só vale se ela QUEBRAR quando deve quebrar.
// Um loader que engole erro de inicialização produz suítes verdes sobre funções
// que nunca rodaram — o falso senso de segurança que esta fundação existe para
// impedir. Estes testes travam esse comportamento.
import test from 'node:test';
import { assert, pareceErro } from './_assert.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { carregarApp } from './_loader.mjs';

function arquivoTemporario(conteudo) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avenco-loader-'));
  const p = path.join(dir, 'app-falso.js');
  fs.writeFileSync(p, conteudo, 'utf8');
  return p;
}

test('exceção ao avaliar o app propaga como falha, não como silêncio', () => {
  const caminho = arquivoTemporario('throw new Error("estouro de inicializacao");');
  assert.throws(
    () => carregarApp({ caminhoApp: caminho }),
    (erro) => {
      // A exceção original precisa sobreviver, tanto na causa quanto no texto.
      assert.match(erro.message, /Falha ao avaliar app\.js/);
      assert.match(erro.message, /estouro de inicializacao/);
      assert.equal(pareceErro(erro.cause), true, "a exceção original precisa sobreviver como causa");
      assert.match(erro.cause.message, /estouro de inicializacao/);
      // E precisa deixar explícito que NÃO é "função ausente".
      assert.match(erro.message, /NÃO é "função ausente"/);
      return true;
    }
  );
});

test('API de DOM não stubada vira falha de teste, com o erro original', () => {
  // `document.naoExiste` não está no stub: o loader deve deixar estourar.
  const caminho = arquivoTemporario('document.naoExiste.qualquerCoisa();');
  assert.throws(
    () => carregarApp({ caminhoApp: caminho }),
    (erro) => {
      assert.match(erro.message, /Falha ao avaliar app\.js/);
      assert.match(erro.message, /DOM\/Firebase\/localStorage/);
      assert.equal(pareceErro(erro.cause), true, "a exceção original precisa sobreviver como causa");
      return true;
    }
  );
});

test('app que avalia mas não expõe os motores falha com mensagem específica', () => {
  // Avalia sem erro, mas não define nenhuma das funções esperadas.
  const caminho = arquivoTemporario('var apenasIsso = 1;');
  assert.throws(
    () => carregarApp({ caminhoApp: caminho }),
    (erro) => {
      assert.match(erro.message, /não estão definidos como funções globais/);
      assert.match(erro.message, /_movementNature/);
      return true;
    }
  );
});

test('o app.js real carrega e expõe todos os motores esperados', () => {
  const { ctx, app } = carregarApp();
  assert.equal(typeof ctx._movementNature, 'function');
  assert.equal(typeof ctx._periodMovementSummary, 'function');
  assert.equal(typeof app.ev, 'function');
  assert.equal(typeof app.D, 'object');
});

test('o relógio congelado governa o app carregado', () => {
  const { ctx } = carregarApp({ agora: '2026-03-31T12:00:00' });
  assert.equal(ctx.todayStr(), '2026-03-31');
  assert.equal(ctx.dateStr(new ctx.Date()), '2026-03-31');
});

test('Math.random é determinístico para a mesma semente', () => {
  const a = carregarApp({ semente: 42 });
  const b = carregarApp({ semente: 42 });
  assert.equal(a.ctx.uid(), b.ctx.uid());
});
