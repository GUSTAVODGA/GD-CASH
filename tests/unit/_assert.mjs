// ══════════════════════════════════════════════════════════════════════════
// ASSERÇÕES CIENTES DE REALM
//
// O app roda dentro de um contexto `vm`, que é um REALM diferente do host: os
// objetos e arrays criados lá têm `Array`/`Object` próprios. Isso faz
// `assert.deepStrictEqual` falhar com "same structure but not reference-equal"
// mesmo quando o conteúdo é idêntico, e faz `x instanceof Error` devolver
// false para exceções vindas de dentro do vm.
//
// Em vez de espalhar workarounds pelas suítes, o tratamento fica aqui:
//   - `mesmoConteudo` compara por VALOR, normalizando o lado que veio do vm;
//   - `pareceErro` checa formato de erro sem depender de identidade de classe.
//
// Comparações de valores primitivos (`assert.equal`) atravessam realm sem
// problema e seguem usando o assert estrito diretamente.
// ══════════════════════════════════════════════════════════════════════════

import assert from 'node:assert/strict';

export { assert };

/** Converte um valor de qualquer realm em estruturas simples do host. */
function normalizar(valor) {
  if (valor === undefined) return undefined;
  return JSON.parse(JSON.stringify(valor));
}

/** deepEqual por conteúdo, imune à diferença de realm. */
export function mesmoConteudo(atual, esperado, mensagem) {
  assert.deepEqual(normalizar(atual), esperado, mensagem);
}

/** Verifica que algo se comporta como Error sem exigir a classe do host. */
export function pareceErro(valor) {
  return !!valor && typeof valor === 'object' && typeof valor.message === 'string';
}
