// A regra que foi partida ao meio três vezes.
//
// `style.css` tem esta regra de animação de entrada de lista:
//
//     .tx-item,.fixed-item,.res-hist-item,.iitem,.goal-card{
//       animation:fade-in var(--dur-normal) var(--ease-out) both;
//       animation-delay:var(--sd,0s);
//     }
//
// Três vezes seguidas — v77, v79 e uma quarta tentativa — ela foi QUEBRADA do
// mesmo jeito: inserindo CSS novo usando `.goal-card{` como âncora de posição.
// `.goal-card` aparece pela PRIMEIRA vez ali dentro, no meio da lista de
// seletores. A inserção entrava no meio da lista, a regra de stagger perdia o
// corpo, e `.tx-item`, `.fixed-item`, `.res-hist-item` e `.iitem` — ou seja,
// toda linha de lançamento, de gasto fixo, de histórico de reserva e de item de
// receita do app — passavam a herdar o corpo do bloco recém-inserido.
//
// Na v79 o bloco herdado era o da faixa de confirmação: fundo, borda de 1px,
// `border-radius`, `min-height:44px` e `margin-bottom:12px` em toda linha de
// lista do aplicativo. Isso foi publicado e ficou no ar.
//
// Os testes visuais não pegaram porque mediam ALTURA e transbordo, e a
// diferença coube na tolerância — até a quarta quebra somar mais 3px de borda e
// estourar o limite. Um teste de pixel encontra o sintoma tarde; este encontra
// a causa na hora.
//
// A ASSINATURA do defeito é sempre a mesma e é fácil de detectar: um comentário
// `/* … */` NO MEIO de uma lista de seletores. Em CSS válido isso é legal, mas
// neste arquivo nunca é intencional — é sempre uma inserção que caiu no lugar
// errado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = path.resolve(import.meta.dirname, '../..');
const CSS = fs.readFileSync(path.join(RAIZ, 'style.css'), 'utf8');

/** O arquivo sem comentários — para contar chaves e ler seletores de verdade. */
const semComentarios = CSS.replace(/\/\*[\s\S]*?\*\//g, '');

test('as chaves de style.css fecham', () => {
  const abre = (semComentarios.match(/\{/g) || []).length;
  const fecha = (semComentarios.match(/\}/g) || []).length;
  assert.equal(abre, fecha, `style.css tem ${abre} "{" para ${fecha} "}"`);
});

test('NENHUM comentário no meio de uma lista de seletores', () => {
  // Varre o texto ORIGINAL: um comentário precedido por uma vírgula (ignorando
  // espaço em branco) está dentro de um seletor.
  const suspeitos = [];
  const re = /,\s*\/\*/g;
  let m;
  while ((m = re.exec(CSS)) !== null) {
    const linha = CSS.slice(0, m.index).split('\n').length;
    const trecho = CSS.slice(Math.max(0, m.index - 90), m.index + 40).split('\n').pop();
    suspeitos.push(`linha ${linha}: …${trecho.trim()}`);
  }
  assert.deepEqual(suspeitos, [],
    'inserção de CSS caiu dentro de uma lista de seletores:\n  ' + suspeitos.join('\n  '));
});

test('a regra de stagger de lista está inteira', () => {
  // Os cinco seletores juntos, com o corpo de animação — e nada mais.
  const re = /\.tx-item\s*,\s*\.fixed-item\s*,\s*\.res-hist-item\s*,\s*\.iitem\s*,\s*\.goal-card\s*\{([^}]*)\}/;
  const m = semComentarios.match(re);
  assert.ok(m, 'a regra de stagger de lista sumiu ou mudou de forma — ' +
    'foi partida ao meio de novo? (ver cabeçalho deste arquivo)');
  const corpo = m[1];
  assert.match(corpo, /animation\s*:\s*fade-in/, 'a regra perdeu a animação de entrada');
  assert.match(corpo, /animation-delay\s*:\s*var\(--sd/, 'a regra perdeu o atraso escalonado');
  // O corpo é só animação. Fundo, borda ou altura aqui significam que o bloco
  // de outro componente foi absorvido.
  for (const proibido of ['background', 'border', 'min-height', 'padding', 'margin']) {
    assert.ok(!corpo.includes(proibido),
      `a regra de stagger absorveu "${proibido}" — corpo de outro componente entrou nela`);
  }
});

test('as linhas de lista não carregam estilo de faixa da Início', () => {
  // Verificação por consequência, não por forma: seja qual for o jeito de
  // quebrar, o sintoma é `.tx-item` aparecer numa regra que também estiliza
  // um componente da área de avisos.
  const FAIXAS = ['home-conf-faixa', 'home-sync-faixa', 'home-atencao', 'meta-acoes'];
  const regras = semComentarios.split('}');
  for (const r of regras) {
    const sel = r.split('{')[0];
    if (!sel || !/\.tx-item\b/.test(sel)) continue;
    for (const f of FAIXAS) {
      assert.ok(!sel.includes(f),
        `.tx-item divide regra com .${f} — a lista de seletores foi partida`);
    }
  }
});
