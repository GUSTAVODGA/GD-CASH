// ══════════════════════════════════════════════════════════════════════════
// BOOT HERMÉTICO E DETERMINÍSTICO DO APP PARA O TIER E2E
//
// Três garantias, todas obtidas SEM tocar em código de produto:
//
// 1. SEM REDE. O index.html carrega o SDK do Firebase do gstatic. Em CI isso
//    seria uma dependência externa (lenta, e indisponível em runner sem saída).
//    Interceptamos essas requisições e servimos um stub que define
//    `window.firebase` com a superfície que o app usa. Nenhuma chamada sai da
//    máquina, e nenhum dado real é tocado.
//
// 2. SEM RELÓGIO REAL. `page.clock.install()` fixa a data antes da navegação,
//    então Home, Semana e Mês renderizam sobre um calendário declarado.
//
// 3. SEM ESPERA ARBITRÁRIA. O tour do modo demo é agendado por
//    `setTimeout(startTour, 600)` dentro de `startDemo()`. Em vez de dormir
//    esperando, substituímos `startTour` por um no-op ANTES de chamar
//    `startDemo()` — como `setTimeout` recebe o valor do binding no momento do
//    agendamento, o agendamento já nasce inofensivo.
//
//    Isto importa mais do que parece: `closeTour()` chama `exitDemo()`, ou
//    seja, "fechar o tour" derrubaria o modo demo e devolveria a tela de login.
//    Neutralizar antes é a única rota limpa.
// ══════════════════════════════════════════════════════════════════════════

/** Instante padrão dos cenários E2E (local, meio-dia — estável em qualquer TZ). */
export const AGORA_PADRAO = new Date(2026, 5, 15, 12, 0, 0); // 15/06/2026

// Stub do SDK do Firebase servido no lugar do bundle do gstatic.
// `onAuthStateChanged` reporta "sem usuário": o app mostra a tela de login e
// fica parado, que é exatamente o estado de onde o modo demo parte.
const STUB_FIREBASE = `
window.firebase = (function () {
  var semUsuario = function (cb) { if (typeof cb === 'function') cb(null); return function () {}; };
  var docRef = function () {
    return {
      get: function () { return Promise.resolve({ exists: false, data: function () { return {}; } }); },
      set: function () { return Promise.resolve(); },
      update: function () { return Promise.resolve(); },
      delete: function () { return Promise.resolve(); },
      onSnapshot: function () { return function () {}; },
    };
  };
  var collRef = function () {
    return {
      doc: docRef, add: function () { return Promise.resolve({ id: 'stub' }); },
      where: collRef, orderBy: collRef, limit: collRef,
      get: function () { return Promise.resolve({ empty: true, docs: [], forEach: function () {} }); },
      onSnapshot: function () { return function () {}; },
    };
  };
  var auth = function () {
    return {
      getRedirectResult: function () { return Promise.resolve({ user: null }); },
      onAuthStateChanged: semUsuario,
      signInWithPopup: function () { return Promise.resolve({ user: null }); },
      signInWithRedirect: function () { return Promise.resolve(); },
      signOut: function () { return Promise.resolve(); },
      currentUser: null,
    };
  };
  auth.GoogleAuthProvider = function () { this.addScope = function () {}; this.setCustomParameters = function () {}; };
  var firestore = function () {
    return { collection: collRef, doc: docRef, enablePersistence: function () { return Promise.resolve(); } };
  };
  firestore.FieldValue = { serverTimestamp: function () { return 0; }, delete: function () { return null; }, increment: function (n) { return n; } };
  firestore.Timestamp = { now: function () { return { toMillis: function () { return 0; } }; }, fromDate: function (d) { return { toMillis: function () { return +d; } }; } };
  return { initializeApp: function () { return {}; }, auth: auth, firestore: firestore };
})();
`;

/** Corta toda a rede externa e injeta o stub do Firebase.
 *
 * Uma ÚNICA rota decide tudo, de propósito: o Playwright casa handlers na ordem
 * inversa do registro, então um par "específico + catch-all" faria o catch-all
 * vencer e abortar até o que deveria ser interceptado. Concentrar a decisão
 * aqui elimina essa pegadinha.
 */
async function isolarRede(page) {
  await page.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith('http://localhost')) return route.continue();
    // Fontes primeiro: `fonts.gstatic.com` também casaria com a regra do
    // Firebase abaixo e receberia JavaScript no lugar de CSS.
    if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) {
      return route.fulfill({ status: 200, contentType: 'text/css; charset=utf-8', body: '' });
    }
    if (url.includes('gstatic.com') || url.includes('firebasejs')) {
      return route.fulfill({
        status: 200,
        contentType: 'text/javascript; charset=utf-8',
        body: STUB_FIREBASE,
      });
    }
    // Qualquer outra saída para a internet é erro de teste, não silêncio.
    return route.abort();
  });
}

/**
 * Abre o app em modo demo, com rede isolada, relógio fixo e tour neutralizado.
 * Devolve o array (vivo) de erros de console capturados.
 */
export async function abrirAppEmDemo(page, { agora = AGORA_PADRAO } = {}) {
  const errosDeConsole = [];
  page.on('console', msg => { if (msg.type() === 'error') errosDeConsole.push(msg.text()); });
  page.on('pageerror', erro => errosDeConsole.push(`pageerror: ${erro.message}`));

  await isolarRede(page);
  await page.clock.install({ time: agora });
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  // O app só existe depois que app.js avaliou.
  await page.waitForFunction(() => typeof window.startDemo === 'function');

  await page.evaluate(() => {
    // Neutraliza o tour ANTES de agendá-lo (ver cabeçalho deste arquivo).
    window.startTour = () => {};
    window.startDemo();
  });

  await page.waitForSelector('#page-inicio.active');
  return errosDeConsole;
}

/** Navega para uma aba pelo roteador do próprio app. */
export async function irParaAba(page, aba) {
  await page.evaluate(nome => window.switchTab(nome), aba);
  await page.waitForSelector(`#page-${aba}.active`);
}

/** Lê o estado `D` do app (dados sintéticos do modo demo). */
export function lerEstado(page, expressao) {
  return page.evaluate(expr => window.eval(expr), expressao);
}

/**
 * Espera um overlay do app abrir ou fechar.
 *
 * Os overlays não usam `display:none`: eles alternam `opacity` e
 * `pointer-events` pela classe `open`. Para o Playwright um elemento com
 * `opacity:0` ainda é "visível", então `toBeHidden()` nunca seria satisfeito —
 * a classe é o sinal correto.
 */
export async function esperarOverlay(page, id, aberto) {
  await page.waitForFunction(
    ({ id, aberto }) => {
      const el = document.getElementById(id);
      return !!el && el.classList.contains('open') === aberto;
    },
    { id, aberto }
  );
}

/**
 * Mescla dados sintéticos no estado `D` e re-renderiza a aba indicada.
 *
 * `D` é declarado com `let` no escopo do script, então não é propriedade de
 * `window`; alcançamos o objeto por eval indireto e o MUTAMOS (não há
 * rebinding, então mutar basta).
 */
export async function semearDados(page, dados, aba = 'inicio') {
  await page.evaluate(d => {
    const estado = window.eval('D');
    Object.assign(estado, d);
  }, dados);
  await irParaAba(page, aba);
}
