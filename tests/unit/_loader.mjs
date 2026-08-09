// ══════════════════════════════════════════════════════════════════════════
// LOADER DO APP PARA O TIER UNITÁRIO
//
// Carrega o `app.js` REAL — o mesmo arquivo servido ao browser — dentro de um
// contexto `vm` com stubs mínimos de DOM, localStorage e Firebase.
//
// POR QUE `vm` E NÃO `import`: o `app.js` é um script clássico, sem exports.
// Transformá-lo em módulo ES para poder importar as funções seria alterar
// produto. O loader existe justamente para testar o arquivo publicado como ele
// é, sem exigir uma única linha de mudança no app.
//
// CONTRATO (quebra ruidosamente se violado):
//   1. `app.js` é um script clássico, não-módulo;
//   2. os motores testados são declarações de função no escopo global do script;
//   3. o epílogo injetado consegue fechar sobre os bindings léxicos (`D`).
// Se o app um dia virar módulo ES, este loader falha com erro explícito — e é
// para isso que ele falha rápido.
//
// POLÍTICA DE ERRO (deliberada): qualquer exceção ao avaliar o `app.js` é
// propagada. O loader NUNCA a converte em "função ausente", porque um app que
// não inicializou produziria suítes verdes sobre funções que nunca rodaram —
// exatamente o falso senso de segurança que esta fundação existe para impedir.
// Stub faltando é falha de teste, não silêncio.
// ══════════════════════════════════════════════════════════════════════════

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { makeFrozenDate, makeSeededRandom, INSTANTES } from './_clock.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
export const APP_PATH = path.resolve(AQUI, '../../app.js');

// Motores que precisam existir após o carregamento. A lista é uma rede de
// segurança contra refatoração silenciosa: some uma função, a suíte inteira cai.
const MOTORES_ESPERADOS = [
  '_movementNature', '_periodMovementSummary', '_monthMovementSummary',
  '_consumptionRatio', 'monthAggregate', 'localDateKey', 'dateStr', 'todayStr',
  'monthDates', 'weekDates', '_debtParcelasTotal', '_debtParcelaCents',
  '_debtParcelasPagas', '_debtProximaParcelaNo', '_debtProjectVencimentos',
  '_debtVencimentosNoPeriodo', '_debtPrevistoDoMes', '_debtSaldo',
  'reconcileDebtPayments', 'reconcileFixedPayments',
];

// ── stubs de DOM ──────────────────────────────────────────────────────────
function mkClassList() {
  const s = new Set();
  return {
    add: (...c) => c.forEach(x => s.add(x)),
    remove: (...c) => c.forEach(x => s.delete(x)),
    toggle: (c, f) => { const on = f === undefined ? !s.has(c) : !!f; on ? s.add(c) : s.delete(c); return on; },
    contains: c => s.has(c),
  };
}

function mkEl(tag = 'div') {
  const el = {
    tagName: String(tag).toUpperCase(),
    classList: mkClassList(),
    style: {}, dataset: {}, attributes: {},
    textContent: '', innerHTML: '', innerText: '', value: '',
    checked: false, disabled: false, id: '', className: '',
    children: [], childNodes: [], parentNode: null, firstChild: null,
    scrollTop: 0, scrollHeight: 0, offsetWidth: 0, offsetHeight: 0,
  };
  el.appendChild = c => { el.children.push(c); if (c) c.parentNode = el; return c; };
  el.append = (...cs) => cs.forEach(c => el.appendChild(c));
  el.removeChild = c => { el.children = el.children.filter(x => x !== c); return c; };
  el.remove = () => { if (el.parentNode) el.parentNode.removeChild(el); };
  el.insertBefore = c => el.appendChild(c);
  el.insertAdjacentHTML = () => {};
  el.addEventListener = () => {};
  el.removeEventListener = () => {};
  el.dispatchEvent = () => true;
  el.setAttribute = (k, v) => { el.attributes[k] = String(v); };
  el.getAttribute = k => (k in el.attributes ? el.attributes[k] : null);
  el.removeAttribute = k => { delete el.attributes[k]; };
  el.hasAttribute = k => k in el.attributes;
  el.querySelector = () => mkEl();
  el.querySelectorAll = () => [];
  el.closest = () => null;
  el.getBoundingClientRect = () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 });
  el.focus = () => {}; el.blur = () => {}; el.click = () => {};
  el.scrollIntoView = () => {}; el.scrollTo = () => {};
  el.animate = () => ({ finished: Promise.resolve(), cancel() {} });
  el.getContext = () => null;
  return el;
}

function mkStorage() {
  const m = new Map();
  return {
    getItem: k => (m.has(String(k)) ? m.get(String(k)) : null),
    setItem: (k, v) => { m.set(String(k), String(v)); },
    removeItem: k => { m.delete(String(k)); },
    clear: () => m.clear(),
    key: i => Array.from(m.keys())[i] ?? null,
    get length() { return m.size; },
  };
}

// Firebase: `onAuthStateChanged` nunca dispara o callback, então o app fica
// "deslogado" e nenhuma renderização é acionada — o que isola os motores puros.
function mkFirebase() {
  const docRef = () => ({
    get: () => Promise.resolve({ exists: false, data: () => ({}) }),
    set: () => Promise.resolve(), update: () => Promise.resolve(),
    delete: () => Promise.resolve(), onSnapshot: () => () => {},
  });
  const collRef = () => ({
    doc: docRef, add: () => Promise.resolve({ id: 'stub' }),
    where: collRef, orderBy: collRef, limit: collRef,
    get: () => Promise.resolve({ empty: true, docs: [], forEach: () => {} }),
    onSnapshot: () => () => {},
  });
  return {
    initializeApp: () => ({}),
    auth: Object.assign(() => ({
      getRedirectResult: () => Promise.resolve({ user: null }),
      onAuthStateChanged: () => () => {},
      signInWithPopup: () => Promise.resolve({ user: null }),
      signInWithRedirect: () => Promise.resolve(),
      signOut: () => Promise.resolve(),
      currentUser: null,
    }), { GoogleAuthProvider: class { addScope() {} setCustomParameters() {} } }),
    firestore: Object.assign(() => ({
      collection: collRef, doc: docRef, enablePersistence: () => Promise.resolve(),
    }), {
      FieldValue: { serverTimestamp: () => 0, delete: () => null, increment: n => n },
      Timestamp: { now: () => ({ toMillis: () => 0 }), fromDate: d => ({ toMillis: () => +d }) },
    }),
  };
}

function mkContexto({ FrozenDate, random }) {
  const documento = {
    readyState: 'complete',
    documentElement: mkEl('html'),
    head: mkEl('head'),
    cookie: '', title: '',
    getElementById: () => mkEl(),
    querySelector: () => mkEl(),
    querySelectorAll: () => [],
    getElementsByClassName: () => [],
    getElementsByTagName: () => [],
    createElement: t => mkEl(t),
    createElementNS: t => mkEl(t),
    createTextNode: t => ({ textContent: String(t) }),
    createDocumentFragment: () => mkEl('fragment'),
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
    execCommand: () => true,
  };
  documento.body = mkEl('body');

  const armazenamento = mkStorage();

  const ctx = {
    console,
    Date: FrozenDate,
    Math: Object.create(Math, { random: { value: random, writable: true, configurable: true } }),
    setTimeout: () => 0, clearTimeout: () => {},
    setInterval: () => 0, clearInterval: () => {},
    requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
    queueMicrotask: () => {},
    localStorage: armazenamento, sessionStorage: mkStorage(),
    document: documento,
    navigator: {
      userAgent: 'avenco-unit-tests', language: 'pt-BR', onLine: true,
      serviceWorker: { register: () => Promise.resolve(), ready: Promise.resolve({}) },
      vibrate: () => true, clipboard: { writeText: () => Promise.resolve() },
      share: () => Promise.resolve(),
    },
    location: {
      href: 'http://localhost/', hash: '', search: '', pathname: '/',
      origin: 'http://localhost', reload: () => {}, replace: () => {},
    },
    history: { pushState: () => {}, replaceState: () => {}, back: () => {}, go: () => {} },
    screen: { width: 390, height: 844 },
    innerWidth: 390, innerHeight: 844, devicePixelRatio: 2,
    matchMedia: () => ({
      matches: false, media: '',
      addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {},
    }),
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    alert: () => {}, confirm: () => true, prompt: () => null,
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({}), text: () => Promise.resolve('') }),
    IntersectionObserver: class { observe() {} unobserve() {} disconnect() {} },
    ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
    MutationObserver: class { observe() {} disconnect() {} takeRecords() { return []; } },
    Event: class { constructor(t) { this.type = t; } },
    CustomEvent: class { constructor(t, o) { this.type = t; this.detail = o && o.detail; } },
    Image: class { set src(_v) {} },
    Notification: { permission: 'default', requestPermission: () => Promise.resolve('default') },
    performance: { now: () => 0 },
    firebase: mkFirebase(),
  };
  ctx.window = ctx;
  ctx.self = ctx;
  ctx.globalThis = ctx;
  ctx.addEventListener = () => {};
  ctx.removeEventListener = () => {};
  return ctx;
}

// Epílogo: roda no MESMO escopo léxico do app.js, então fecha sobre `D` e
// demais bindings `let`/`const` — que não viram propriedade do objeto global.
const EPILOGO = `
;var __app = {
  get D() { return D; },
  set D(v) { D = v; },
  // Escotilha para ler/escrever qualquer binding léxico do script
  // (ex.: ev('monthOffset = 0')). Eval direto: enxerga o escopo do script.
  ev: function (codigo) { return eval(codigo); },
};
`;

/**
 * Carrega o app.js num contexto isolado e determinístico.
 *
 * @param {object}  [opcoes]
 * @param {string}  [opcoes.agora]  instante local congelado (sem timezone, ao meio-dia)
 * @param {number}  [opcoes.semente] semente do Math.random
 * @param {string}  [opcoes.caminhoApp] caminho alternativo (usado só pelo autoteste do loader)
 * @returns {{ ctx: object, app: object, D: object }} contexto, ponte e atalho para D
 */
export function carregarApp({ agora = INSTANTES.diaComum, semente = 1, caminhoApp = APP_PATH } = {}) {
  const FrozenDate = makeFrozenDate(agora);
  const random = makeSeededRandom(semente);
  const ctx = mkContexto({ FrozenDate, random });
  vm.createContext(ctx);

  const fonte = fs.readFileSync(caminhoApp, 'utf8');

  try {
    vm.runInContext(fonte + '\n' + EPILOGO, ctx, { filename: caminhoApp, timeout: 30000 });
  } catch (erro) {
    // Falha rápida e ruidosa: preserva a exceção original como `cause`.
    const e = new Error(
      `Falha ao avaliar app.js no contexto de teste (relógio congelado em ${agora}).\n` +
      `Causa original: ${erro && erro.message}\n` +
      `Isto NÃO é "função ausente": o app não terminou de inicializar. Provável stub de ` +
      `DOM/Firebase/localStorage faltando em tests/unit/_loader.mjs — acrescente o stub ` +
      `mínimo necessário em vez de tolerar o erro.`,
      { cause: erro }
    );
    e.stack = `${e.message}\n--- stack original ---\n${erro && erro.stack}`;
    throw e;
  }

  const app = ctx.__app;
  if (!app || typeof app.ev !== 'function') {
    throw new Error(
      'O epílogo do loader não executou: app.js foi avaliado mas a ponte __app não existe. ' +
      'Isso normalmente significa que app.js deixou de ser um script clássico (virou módulo ES) ' +
      'ou que a execução parou antes do fim do arquivo.'
    );
  }

  const ausentes = MOTORES_ESPERADOS.filter(nome => typeof ctx[nome] !== 'function');
  if (ausentes.length) {
    throw new Error(
      `app.js carregou, mas estes motores não estão definidos como funções globais: ` +
      `${ausentes.join(', ')}. Se foram renomeados, atualize MOTORES_ESPERADOS e as suítes; ` +
      `se sumiram, é regressão de produto.`
    );
  }

  return { ctx, app, get D() { return app.D; } };
}

/** Substitui o estado `D` inteiro por um fixture sintético. */
export function comDados(carregado, dados) {
  carregado.app.D = dados;
  return carregado;
}
