// ══════════════════════════════════════════
// LAGOS SERVIÇOS DE TRANSPORTE — Gestão de Frota
// PWA + Firebase (Auth e-mail/senha + Firestore compartilhado)
// Enquanto o Firebase não é configurado, roda em MODO DEMO (localStorage).
// ══════════════════════════════════════════

const firebaseConfig = {
  apiKey: "AIzaSyBV0cSMImMxsS7xxQll3QdR0zY2vipRENM",
  authDomain: "lagos-operacional.firebaseapp.com",
  projectId: "lagos-operacional",
  storageBucket: "lagos-operacional.firebasestorage.app",
  messagingSenderId: "983051373757",
  appId: "1:983051373757:web:344d2f61349afb85ec7bd4"
};

const DEMO = firebaseConfig.apiKey === 'COLE_AQUI';
const LS_KEY = 'lagos_demo_v1';

// ── PERFIS DOS SÓCIOS (tela "Quem está usando?") ──
// Preencher no setup: nome de cada sócio + e-mail de login criado no Firebase.
// Dica: dá pra usar um único e-mail da empresa com apelidos "+", ex.:
//   empresa+joao@gmail.com / empresa+pedro@gmail.com — tudo cai na mesma caixa.
// "foto" é opcional (link ou arquivo); sem foto aparece a inicial colorida.
const SOCIOS = [
  { nome: 'Luís Paulo', sigla: 'LP', email: 'lagosoperacional+luispaulo@gmail.com', foto: '' },
  { nome: 'Ygor',       sigla: 'YC', email: 'lagosoperacional+ygor@gmail.com',      foto: '' },
  { nome: 'Thadeu',     sigla: 'TC', email: 'lagosoperacional+thadeu@gmail.com',    foto: '' },
];

let auth = null, db = null;
let me = null; // { uid, email, nome }

// Estado compartilhado (espelho do Firestore ou do localStorage no demo)
// (anexos ficam fora dos listeners: são carregados sob demanda, por item)
let S = { vehicles: [], drivers: [], tx: [], kmlog: [], profiles: {}, anexos: [], eventos: [] };
let unsubs = [];

// Estado de UI
let monthOffset = 0;
let lancFilter = 'todos';
let lancOrigem = 'todas';
let txTipo = 'despesa', txCat = null, txOrigem = 'frota';
let editingTxId = null, detailTxId = null;
let editingVehId = null, detailVehId = null;
let editingDrvId = null;

// ══════════════════════════════════════════
// ÍCONES — biblioteca única (SVG inline, traço consistente)
// ══════════════════════════════════════════
const _svg = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const I = {
  home: _svg('<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>'),
  truck: _svg('<path d="M1 7h13v10H1z"/><path d="M14 10h4l3 3v4h-7z"/><circle cx="6" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>'),
  user: _svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5"/>'),
  users: _svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c1.2-3 3.7-4.5 6.5-4.5s5.3 1.5 6.5 4.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8"/><path d="M17.5 15.7c2 .7 3.4 2.1 4 4.3"/>'),
  coins: _svg('<circle cx="8" cy="8" r="6"/><path d="M18.1 9.9a6 6 0 1 1-8.2 8.2"/><path d="M8 6v4"/><path d="M6 8h4"/>'),
  building: _svg('<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 21v-4h6v4"/><path d="M8 7h2M14 7h2M8 11h2M14 11h2"/>'),
  plus: _svg('<path d="M12 5v14M5 12h14"/>'),
  x: _svg('<path d="M18 6 6 18M6 6l12 12"/>'),
  check: _svg('<path d="M20 6 9 17l-5-5"/>'),
  pencil: _svg('<path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>'),
  trash: _svg('<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 15h10l1-15"/><path d="M10 11v6M14 11v6"/>'),
  camera: _svg('<path d="M4 8h3l2-3h6l2 3h3v12H4z"/><circle cx="12" cy="13" r="3.5"/>'),
  image: _svg('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5-8 8"/>'),
  fileText: _svg('<path d="M14 2H6v20h12V8z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h6"/>'),
  filePlus: _svg('<path d="M14 2H6v20h12V8z"/><path d="M14 2v6h6"/><path d="M12 12v6M9 15h6"/>'),
  paperclip: _svg('<path d="m21 11.5-8.5 8.5a5.5 5.5 0 0 1-7.8-7.8L13 3.9a3.7 3.7 0 0 1 5.2 5.2L10 17.3a1.8 1.8 0 0 1-2.6-2.6l7.8-7.8"/>'),
  fuel: _svg('<path d="M4 21V6a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v15"/><path d="M2 21h13"/><path d="M13 10h2a2 2 0 0 1 2 2v5a1.5 1.5 0 0 0 3 0v-8l-3-3"/><path d="M6 8h5"/>'),
  wrench: _svg('<path d="M14.5 6.5a4.5 4.5 0 0 0-6 6L3 18l3 3 5.5-5.5a4.5 4.5 0 0 0 6-6L14 13l-3-3z"/>'),
  disc: _svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/>'),
  road: _svg('<path d="M5 21 10 3M19 21 14 3"/><path d="M12 8v2M12 14v3"/>'),
  shield: _svg('<path d="M12 3l8 3v5.5c0 4.5-3.2 7.8-8 9.5-4.8-1.7-8-5-8-9.5V6z"/>'),
  package: _svg('<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/>'),
  mapPin: _svg('<path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>'),
  refresh: _svg('<path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/>'),
  idCard: _svg('<rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="8" cy="11" r="2"/><path d="M5 16c.7-1.5 1.7-2.2 3-2.2s2.3.7 3 2.2"/><path d="M14 9h5M14 13h5"/>'),
  clock: _svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>'),
  eye: _svg('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>'),
  sliders: _svg('<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2" fill="currentColor"/><circle cx="15" cy="12" r="2" fill="currentColor"/><circle cx="7" cy="18" r="2" fill="currentColor"/>'),
  calendar: _svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  alert: _svg('<path d="M12 3 2 20h20z"/><path d="M12 9v5"/><path d="M12 17.5v.5"/>'),
  logOut: _svg('<path d="M9 21H4V3h5"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>'),
  moon: _svg('<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/>'),
  key: _svg('<circle cx="8" cy="15" r="4.5"/><path d="M11 12 20 3"/><path d="M17 6l3 3M15 8l2 2"/>'),
  search: _svg('<circle cx="10.5" cy="10.5" r="7"/><path d="m21 21-5.5-5.5"/>'),
  chart: _svg('<path d="M3 21h18"/><path d="M7 21v-8M12 21V7M17 21v-5"/>'),
  receipt: _svg('<path d="M6 2h12v20l-2-1.5L14 22l-2-1.5L10 22l-2-1.5L6 22z"/><path d="M9 7h6M9 11h6"/>'),
  calculator: _svg('<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M8 6h8"/><path d="M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 19h.01M12 19h.01M16 19h.01"/>'),
  percent: _svg('<path d="M19 5 5 19"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/>'),
  landmark: _svg('<path d="M3 9 12 3l9 6"/><path d="M5 9v9M9.5 9v9M14.5 9v9M19 9v9"/><path d="M3 21h18M3 18h18"/>'),
  droplet: _svg('<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>'),
  phone: _svg('<path d="M5 3h4l2 5-2.5 1.5a12 12 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 5a2 2 0 0 1 2-2z"/>'),
  download: _svg('<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 21h16"/>'),
  share: _svg('<path d="M12 15V3"/><path d="m7 8 5-5 5 5"/><path d="M4 13v8h16v-8"/>'),
  history: _svg('<path d="M3 12a9 9 0 1 1 3 6.7"/><path d="M3 12H1.5M3 12l2.5 2.5"/><path d="M12 7v5l3 3"/>'),
  folder: _svg('<path d="M3 5h6l2 2h10v13H3z"/>'),
  note: _svg('<path d="M4 4h16v12l-4 4H4z"/><path d="M16 20v-4h4"/><path d="M8 9h8M8 13h5"/>'),
  info: _svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8v.5"/>'),
};
function icon(nome, tam) {
  return `<span class="ic"${tam ? ` style="width:${tam}px;height:${tam}px"` : ''}>${I[nome] || I.info}</span>`;
}
// injeta ícones nos elementos estáticos do HTML (data-ic="nome")
function injetarIcones() {
  document.querySelectorAll('[data-ic]').forEach(el => {
    if (!el.querySelector('.ic')) el.insertAdjacentHTML('afterbegin', icon(el.dataset.ic));
  });
}
// eventos antigos foram salvos com emoji no campo ico — converte para a biblioteca
const LEGACY_ICO = { '🚐': 'truck', '🧑‍✈️': 'user', '🪪': 'idCard', '📝': 'note', '🔁': 'refresh', '📌': 'mapPin', '📄': 'fileText' };
function evIcon(ico) {
  return icon(I[ico] ? ico : (LEGACY_ICO[ico] || 'mapPin'));
}

// ══════════════════════════════════════════
// CATEGORIAS
// ══════════════════════════════════════════
const CATS = {
  // despesas da frota (vinculadas às vans)
  despesa: [
    { id: 'combustivel', nome: 'Combustível', ico: 'fuel' },
    { id: 'manutencao',  nome: 'Manutenção',  ico: 'wrench' },
    { id: 'pneus',       nome: 'Pneus',       ico: 'disc' },
    { id: 'pedagio',     nome: 'Pedágio',     ico: 'road' },
    { id: 'documentos',  nome: 'Documentos',  ico: 'fileText' },
    { id: 'seguro',      nome: 'Seguro',      ico: 'shield' },
    { id: 'salarios',    nome: 'Salários',    ico: 'users' },
    { id: 'outros',      nome: 'Outros',      ico: 'package' },
  ],
  // despesas do escritório (administração da empresa, sem veículo)
  escritorio: [
    { id: 'aluguel',       nome: 'Aluguel',      ico: 'home' },
    { id: 'contas',        nome: 'Água/Luz/Net', ico: 'droplet' },
    { id: 'telefone',      nome: 'Telefone',     ico: 'phone' },
    { id: 'contabilidade', nome: 'Contador',     ico: 'calculator' },
    { id: 'impostos',      nome: 'Impostos',     ico: 'percent' },
    { id: 'material',      nome: 'Material',     ico: 'folder' },
    { id: 'salarios_adm',  nome: 'Salários adm.', ico: 'users' },
    { id: 'outros_esc',    nome: 'Outros',       ico: 'package' },
  ],
  receita: [
    { id: 'contrato',  nome: 'Prefeitura',   ico: 'landmark' },
    { id: 'frete',     nome: 'Frete extra',  ico: 'truck' },
    { id: 'outros_r',  nome: 'Outros',       ico: 'coins' },
  ]
};
function catInfo(id) {
  return CATS.despesa.find(c => c.id === id) || CATS.escritorio.find(c => c.id === id) ||
    CATS.receita.find(c => c.id === id) || { id, nome: 'Outros', ico: 'package' };
}
// origem de um lançamento: registros antigos não têm o campo — deduz pela categoria
function origemDe(t) {
  if (t.origem) return t.origem;
  return CATS.escritorio.some(c => c.id === t.cat) ? 'escritorio' : 'frota';
}

// ══════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════
const $ = id => document.getElementById(id);

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function R(v) {
  return 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function parseValor(str) {
  if (typeof str === 'number') return str;
  str = String(str || '').trim().replace(/[R$\s]/g, '');
  if (!str) return 0;
  // "1.234,56" → 1234.56 | "1234,56" → 1234.56 | "1234.56" → 1234.56
  if (str.includes(',')) str = str.replace(/\./g, '').replace(',', '.');
  const v = parseFloat(str);
  return isNaN(v) ? 0 : v;
}
function parseIntBR(str) {
  const v = parseInt(String(str || '').replace(/[.\s]/g, ''), 10);
  return isNaN(v) ? 0 : v;
}
function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function monthKey(offset = 0) {
  const d = new Date();
  const m = new Date(d.getFullYear(), d.getMonth() + offset, 1);
  return m.getFullYear() + '-' + String(m.getMonth() + 1).padStart(2, '0');
}
function capFirst(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }
function monthLabel(offset = 0) {
  const d = new Date();
  const m = new Date(d.getFullYear(), d.getMonth() + offset, 1);
  return capFirst(m.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }));
}
function fmtDia(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const hoje = todayStr();
  const ontem = (() => { const o = new Date(); o.setDate(o.getDate() - 1); return o.getFullYear() + '-' + String(o.getMonth() + 1).padStart(2, '0') + '-' + String(o.getDate()).padStart(2, '0'); })();
  const base = dt.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' });
  if (dateStr === hoje) return 'Hoje · ' + base;
  if (dateStr === ontem) return 'Ontem · ' + base;
  return base;
}
function fmtData(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-').map(Number);
  return String(d).padStart(2, '0') + '/' + String(m).padStart(2, '0') + '/' + y;
}
function fmtKm(v) { return (Number(v) || 0).toLocaleString('pt-BR') + ' km'; }
function fmtDataHora(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Cor fixa por pessoa (derivada do nome) — cada sócio tem sua cor no app
const AUTHOR_COLORS = ['#2563eb', '#2e8b3d', '#d97706', '#7c3aed', '#0d9488', '#db2777', '#b91c1c', '#475569'];
function authorColor(nome) {
  let h = 0;
  const s = String(nome || '?');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AUTHOR_COLORS[h % AUTHOR_COLORS.length];
}
function authorChip(nome, uid) {
  const n = String(nome || '?');
  const foto = uid && S.profiles[uid]?.foto;
  const dot = foto
    ? `<span class="au-dot" style="background:center/cover no-repeat url(&quot;${foto}&quot;)"></span>`
    : `<span class="au-dot" style="background:${authorColor(n)}">${esc(n[0].toUpperCase())}</span>`;
  return `<span class="tx-author">${dot}${esc(n.split(' ')[0])}</span>`;
}
function diasAte(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  const alvo = new Date(y, m - 1, d);
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  return Math.round((alvo - hoje) / 86400000);
}

let toastTimer = null;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

function openOverlay(id) { $(id).classList.add('open'); }
function closeOverlay(id) { $(id).classList.remove('open'); }

function confirmDialog(title, msg, cb) {
  $('confirm-title').textContent = title;
  $('confirm-msg').textContent = msg;
  const yes = $('confirm-yes');
  const clone = yes.cloneNode(true);
  yes.parentNode.replaceChild(clone, yes);
  clone.addEventListener('click', () => { closeOverlay('modal-confirm'); cb(); });
  openOverlay('modal-confirm');
}

// ══════════════════════════════════════════
// CAMADA DE DADOS (Firestore ou demo/localStorage)
// ══════════════════════════════════════════
function demoLoad() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) { S = { ...S, ...JSON.parse(raw) }; return true; }
  } catch (e) {}
  return false;
}
function demoSave() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) {}
}

async function dataSet(coll, id, obj) {
  if (DEMO) {
    if (coll === 'profiles') {
      S.profiles[id] = obj;
    } else {
      const arr = S[coll];
      const i = arr.findIndex(x => x.id === id);
      if (i >= 0) arr[i] = { ...obj, id }; else arr.push({ ...obj, id });
    }
    demoSave();
    renderAll();
    return;
  }
  await db.collection(coll).doc(id).set(obj);
}
async function dataDelete(coll, id) {
  if (DEMO) {
    S[coll] = S[coll].filter(x => x.id !== id);
    demoSave();
    renderAll();
    return;
  }
  await db.collection(coll).doc(id).delete();
}

function startListeners() {
  stopListeners();
  ['vehicles', 'drivers', 'tx', 'kmlog', 'eventos'].forEach(coll => {
    unsubs.push(db.collection(coll).onSnapshot(snap => {
      S[coll] = snap.docs.map(d => ({ ...d.data(), id: d.id }));
      renderAll();
    }, err => console.error('listener ' + coll, err)));
  });
  unsubs.push(db.collection('profiles').onSnapshot(snap => {
    S.profiles = {};
    snap.docs.forEach(d => { S.profiles[d.id] = d.data(); });
    if (me && S.profiles[me.uid]?.nome) { me.nome = S.profiles[me.uid].nome; }
    renderAll();
  }, err => console.error('listener profiles', err)));
}
function stopListeners() {
  unsubs.forEach(u => { try { u(); } catch (e) {} });
  unsubs = [];
}

// ══════════════════════════════════════════
// AUTENTICAÇÃO
// ══════════════════════════════════════════
function initApp() {
  initTheme();
  if (DEMO) {
    renderProfilePicker();
    $('lp-demo-note').style.display = '';
    if (localStorage.getItem('lagos_demo_active')) enterDemo(true);
    return;
  }
  if (SOCIOS.length) renderProfilePicker();
  else $('login-form').style.display = '';
  if (typeof firebase === 'undefined') {
    const nota = $('lp-demo-note');
    nota.textContent = 'Sem conexão com o servidor. Verifique a internet e recarregue a página.';
    nota.style.display = '';
    return;
  }
  firebase.initializeApp(firebaseConfig);
  auth = firebase.auth();
  db = firebase.firestore();
  try { db.enablePersistence({ synchronizeTabs: true }).catch(() => {}); } catch (e) {}

  auth.onAuthStateChanged(async user => {
    if (user) {
      me = { uid: user.uid, email: user.email, nome: '' };
      try {
        const p = await db.collection('profiles').doc(user.uid).get();
        if (p.exists && p.data().nome) me.nome = p.data().nome;
      } catch (e) {}
      // primeiro acesso pelo seletor de perfis: o nome já vem da lista de sócios
      if (!me.nome) {
        const s = SOCIOS.find(x => (x.email || '').toLowerCase() === (user.email || '').toLowerCase());
        if (s) {
          me.nome = s.nome;
          dataSet('profiles', me.uid, { nome: s.nome, email: me.email }).catch(e => console.error(e));
        }
      }
      startListeners();
      showApp();
      if (!me.nome) openNameModal();
    } else {
      me = null;
      stopListeners();
      $('login-screen').style.display = 'flex';
      $('app').style.display = 'none';
    }
  });
}

function loginError(msg) {
  const el = $('login-err');
  el.textContent = msg;
  el.style.display = '';
}

function mapAuthError(err) {
  const map = {
    'auth/invalid-credential': 'Senha incorreta. Tente de novo.',
    'auth/invalid-login-credentials': 'Senha incorreta. Tente de novo.',
    'auth/wrong-password': 'Senha incorreta. Tente de novo.',
    'auth/user-not-found': 'Este e-mail não tem acesso ao sistema.',
    'auth/invalid-email': 'E-mail inválido.',
    'auth/user-disabled': 'Este acesso foi desativado.',
    'auth/operation-not-allowed': 'Login por senha desativado no servidor — avise o administrador.',
    'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
    'auth/network-request-failed': 'Sem conexão com o servidor. Verifique a internet e tente de novo.',
  };
  return map[err.code] || 'Erro ao entrar (' + (err.code || '?') + '). Tente fechar e abrir o app.';
}

function doLogin() {
  const email = $('login-email').value.trim();
  const pass = $('login-pass').value;
  if (!email || !pass) { loginError('Preencha e-mail e senha.'); return; }
  $('login-err').style.display = 'none';
  $('btn-login').disabled = true;
  $('btn-login').textContent = 'Entrando…';
  auth.signInWithEmailAndPassword(email, pass)
    .catch(err => loginError(mapAuthError(err)))
    .finally(() => {
      $('btn-login').disabled = false;
      $('btn-login').textContent = 'Entrar';
    });
}

// ── Seletor de perfis (Quem está usando?) ──
let selectedSocio = null;

// Avatares desenhados (flat): silhueta branca sobre gradiente, um por sócio
const AVATAR_GRADS = [
  ['#1e3a8a', '#3b82f6'], // azul-marinho → azul
  ['#166534', '#4ade80'], // verde-escuro → verde
  ['#7c2d12', '#f59e0b'], // terra → âmbar
  ['#0f766e', '#2dd4bf'], // petróleo → turquesa
];
// foto de perfil: sincronizada nos profiles + cache local p/ a tela de entrada
function cachedFoto(email) {
  try { return localStorage.getItem('lagos_foto_' + String(email || '').toLowerCase()) || ''; } catch (e) { return ''; }
}
function myPhoto() {
  return (me && S.profiles[me.uid]?.foto) || (me && cachedFoto(me.email)) || '';
}
function fileToSquareDataURL(file, size) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(img.width, img.height);
      const c = document.createElement('canvas');
      c.width = c.height = size;
      c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      resolve(c.toDataURL('image/jpeg', 0.82));
      URL.revokeObjectURL(img.src);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}
async function handleFotoInput(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  try {
    const url = await fileToSquareDataURL(file, 192);
    await dataSet('profiles', me.uid, { ...(S.profiles[me.uid] || {}), nome: me.nome, email: me.email, foto: url });
    if (DEMO) S.profiles[me.uid] = { ...(S.profiles[me.uid] || {}), nome: me.nome, foto: url };
    try { localStorage.setItem('lagos_foto_' + String(me.email || '').toLowerCase(), url); } catch (e) {}
    renderAll();
    toast('Foto de perfil atualizada ✓');
  } catch (e) {
    console.error(e);
    toast('Não foi possível usar essa imagem.');
  }
  input.value = '';
}
function removeProfilePhoto() {
  confirmDialog('Remover foto', 'Voltar a mostrar suas iniciais?', async () => {
    await dataSet('profiles', me.uid, { ...(S.profiles[me.uid] || {}), nome: me.nome, email: me.email, foto: '' });
    try { localStorage.removeItem('lagos_foto_' + String(me.email || '').toLowerCase()); } catch (e) {}
    renderAll();
    toast('Foto removida');
  });
}

// ── arquivos: redimensionar imagem / ler cru ──
function fileToJpegDataURL(file, maxSide) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const sc = Math.min(1, maxSide / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * sc));
      c.height = Math.max(1, Math.round(img.height * sc));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', 0.78));
      URL.revokeObjectURL(img.src);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}
function fileToRawDataURL(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}
function dataURLtoBlob(dataUrl) {
  const [head, b64] = dataUrl.split(',');
  const mime = head.match(/data:(.*?);/)[1];
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}

// ══════════════════════════════════════════
// ANEXOS (fotos e PDFs de veículos, motoristas e lançamentos)
// Guardados no banco como dados compactados; carregados sob demanda.
// ══════════════════════════════════════════
let anexoCtx = null;        // { tipo, parentId, elId } de onde veio o pedido de anexar
let _anexosVistos = {};     // cache do último carregamento (para o visualizador)

async function anexosDe(parentId) {
  if (DEMO) return (S.anexos || []).filter(a => a.parentId === parentId);
  const snap = await db.collection('anexos').where('parentId', '==', parentId).get();
  return snap.docs.map(d => ({ ...d.data(), id: d.id }));
}
async function addAnexoRecord(tipo, parentId, obj) {
  const id = newId();
  const rec = { parentTipo: tipo, parentId, ...obj, ts: Date.now(), autorNome: me.nome || me.email };
  // anexo de lançamento carrega também o veículo, para aparecer na ficha da van
  if (tipo === 'tx' && !rec.veiculoId) {
    const t = S.tx.find(x => x.id === parentId);
    rec.veiculoId = t?.veiculo || '';
  }
  if (DEMO) { S.anexos = S.anexos || []; S.anexos.push({ ...rec, id }); demoSave(); }
  else await db.collection('anexos').doc(id).set(rec);
  return id;
}

// ── EVENTOS: registro do que aconteceu (troca de veículo, CNH, cadastro…) ──
async function logEvento(parentTipo, parentId, ico, titulo, detalhe, extra) {
  const id = newId();
  const rec = { parentTipo, parentId, ico, titulo, detalhe: detalhe || '', autorNome: me.nome || me.email, ts: Date.now(), ...(extra || {}) };
  if (DEMO) { S.eventos = S.eventos || []; S.eventos.push({ ...rec, id }); demoSave(); }
  else await db.collection('eventos').doc(id).set(rec);
}
// eventos de uma ficha (a coleção inteira fica sincronizada em S.eventos);
// eventos de documento (doc:true) ficam fora — a ficha já lista os anexos em si
async function eventosDe(parentId) {
  return (S.eventos || []).filter(e => e.parentId === parentId && !e.doc);
}
function eventoHTML(e, comDono) {
  // na linha do tempo geral da Central mostra de quem é o evento (van/motorista)
  const dono = comDono
    ? (e.parentTipo === 'vehicle' ? vehNome(e.parentId) : (S.drivers.find(d => d.id === e.parentId)?.nome || ''))
    : '';
  return `
    <div class="tx-item" style="cursor:default">
      <div class="tx-ico">${evIcon(e.ico)}</div>
      <div class="tx-body">
        <div class="tx-title">${esc(e.titulo)}</div>
        <div class="tx-meta">${authorChip(e.autorNome)}${dono ? ' · ' + esc(dono) : ''}${e.detalhe ? ' · ' + esc(e.detalhe) : ''} · ${e.ts ? fmtDia(new Date(e.ts).toISOString().slice(0, 10)) : ''}</div>
      </div>
    </div>`;
}

// notas fiscais de lançamentos vinculadas a um veículo
async function notasDoVeiculo(vid) {
  if (DEMO) return (S.anexos || []).filter(a => a.parentTipo === 'tx' && a.veiculoId === vid);
  const snap = await db.collection('anexos')
    .where('parentTipo', '==', 'tx').where('veiculoId', '==', vid).get();
  return snap.docs.map(d => ({ ...d.data(), id: d.id }));
}
async function renderNotasVeiculo(elId, vid) {
  const el = $(elId);
  if (!el) return;
  let list = [];
  try { list = await notasDoVeiculo(vid); } catch (e) { return; }
  const secEl = $('veh-notas-wrap');
  if (secEl) secEl.style.display = list.length ? '' : 'none';
  if (!list.length) { el.innerHTML = ''; return; }
  list.sort((a, b) => (b.ts || 0) - (a.ts || 0)).forEach(a => { _anexosVistos[a.id] = a; });
  el.innerHTML = list.map(a => `
    <div class="anexo-chip">
      ${icon(a.mime === 'application/pdf' ? 'fileText' : 'receipt', 16)}
      <button class="an-nome" onclick="openAnexoViewer('${a.id}')">${esc(a.nome)}</button>
      <small>${a.ts ? fmtData(new Date(a.ts).toISOString().slice(0, 10)) : ''}</small>
    </div>`).join('');
}
async function deleteAnexoRecord(id) {
  if (DEMO) { S.anexos = (S.anexos || []).filter(a => a.id !== id); demoSave(); }
  else await db.collection('anexos').doc(id).delete();
}

async function renderAnexosInto(elId, parentId, tipo) {
  const el = $(elId);
  if (!el) return [];
  el.innerHTML = '<div class="empty-mini">Carregando anexos…</div>';
  let list = [];
  try { list = await anexosDe(parentId); }
  catch (e) { el.innerHTML = '<div class="empty-mini">Não deu para carregar os anexos.</div>'; return []; }
  list.forEach(a => { _anexosVistos[a.id] = a; });
  el.innerHTML = list.map(a => `
    <div class="anexo-chip">
      ${icon(a.mime === 'application/pdf' ? 'fileText' : 'image', 16)}
      <button class="an-nome" onclick="openAnexoViewer('${a.id}')">${esc(a.nome)}</button>
      <button class="x" onclick="removeAnexo('${a.id}','${elId}','${parentId}','${tipo}')">✕</button>
    </div>`).join('') +
    `<button class="btn btn-small" onclick="pickAnexo('${tipo}','${parentId}','${elId}')">${icon('paperclip', 14)} Anexar foto ou PDF</button>`;
  return list;
}
function pickAnexo(tipo, parentId, elId) {
  anexoCtx = { tipo, parentId, elId };
  $('anexo-input').click();
}
async function handleAnexoInput(input) {
  const file = input.files && input.files[0];
  input.value = '';
  if (!file || !anexoCtx) return;
  toast('Preparando anexo…');
  try {
    let data, mime;
    if (file.type === 'application/pdf') {
      data = await fileToRawDataURL(file);
      mime = 'application/pdf';
      if (data.length > 950000) { toast('PDF muito grande (máx. ~700 KB). Tire uma foto do documento.'); return; }
    } else {
      data = await fileToJpegDataURL(file, 1200);
      mime = 'image/jpeg';
    }
    await addAnexoRecord(anexoCtx.tipo, anexoCtx.parentId, { nome: file.name || 'anexo', mime, data });
    // aparece na linha do tempo geral da Central (doc:true evita duplicar na ficha)
    if (anexoCtx.tipo === 'vehicle' || anexoCtx.tipo === 'driver') {
      logEvento(anexoCtx.tipo, anexoCtx.parentId, 'paperclip', 'Documento anexado', file.name || '', { doc: true });
    }
    toast('Anexo salvo');
    renderAnexosInto(anexoCtx.elId, anexoCtx.parentId, anexoCtx.tipo);
  } catch (e) {
    console.error(e);
    toast('Não foi possível anexar esse arquivo.');
  }
}
function removeAnexo(id, elId, parentId, tipo) {
  confirmDialog('Excluir anexo', 'Excluir este arquivo?', async () => {
    try { await deleteAnexoRecord(id); toast('Anexo excluído'); } catch (e) { toast('Erro ao excluir.'); }
    renderAnexosInto(elId, parentId, tipo);
  });
}
function openAnexoViewer(id) {
  const a = _anexosVistos[id];
  if (!a) return;
  if (a.mime === 'application/pdf') {
    window.open(URL.createObjectURL(dataURLtoBlob(a.data)));
    return;
  }
  $('anexo-title').textContent = a.nome;
  $('anexo-img').src = a.data;
  openOverlay('modal-anexo');
}

function socioSigla(s) {
  if (s.sigla) return s.sigla;
  const partes = String(s.nome || '?').trim().split(/\s+/);
  return (partes[0][0] + (partes[1] ? partes[1][0] : '')).toUpperCase();
}
function socioAvatarHTML(s, i, small) {
  const cls = small ? 'lp-avatar lp-avatar-sm' : 'lp-avatar';
  if (s.foto) return `<span class="${cls}"><img src="${esc(s.foto)}" alt="${esc(s.nome)}"></span>`;
  const [c1, c2] = AVATAR_GRADS[i % AVATAR_GRADS.length];
  return `<span class="${cls} lp-monogram" style="background:linear-gradient(135deg,${c1},${c2})">${esc(socioSigla(s))}</span>`;
}

function profilesList() {
  if (SOCIOS.length) return SOCIOS.map(s => ({ ...s, foto: cachedFoto(s.email) || s.foto }));
  return DEMO ? [{ nome: 'Sócio 1' }, { nome: 'Sócio 2' }, { nome: 'Sócio 3' }] : [];
}

function renderProfilePicker() {
  $('login-profiles').style.display = '';
  $('login-pass-step').style.display = 'none';
  $('lp-grid').innerHTML = profilesList().map((s, i) => `
    <button class="lp-card" onclick="pickProfile(${i})">
      ${socioAvatarHTML(s, i)}
      <span class="lp-nome">${esc(s.nome)}</span>
    </button>`).join('');
}

function pickProfile(i) {
  const s = profilesList()[i];
  if (!s) return;
  if (DEMO) {
    localStorage.setItem('lagos_demo_nome', s.nome);
    if (s.email) localStorage.setItem('lagos_demo_email', s.email);
    enterDemo();
    return;
  }
  selectedSocio = s;
  $('login-profiles').style.display = 'none';
  $('login-pass-step').style.display = '';
  $('lp-sel-avatar').outerHTML = socioAvatarHTML(s, i, true).replace('<span class="lp-avatar lp-avatar-sm"', '<span class="lp-avatar lp-avatar-sm" id="lp-sel-avatar"');
  $('lp-sel-nome').textContent = s.nome;
  $('lp-err').style.display = 'none';
  $('lp-pass').value = '';
  $('lp-pass').focus();
}

function backToProfiles() {
  selectedSocio = null;
  renderProfilePicker();
}

function profileLogin() {
  if (!selectedSocio) return;
  if (!auth) {
    $('lp-err').textContent = 'Sem conexão com o servidor. Recarregue a página e tente de novo.';
    $('lp-err').style.display = '';
    return;
  }
  const pass = $('lp-pass').value;
  if (!pass) { $('lp-err').textContent = 'Digite sua senha.'; $('lp-err').style.display = ''; return; }
  $('lp-err').style.display = 'none';
  $('lp-entrar').disabled = true;
  $('lp-entrar').textContent = 'Entrando…';
  auth.signInWithEmailAndPassword(selectedSocio.email, pass)
    .catch(err => {
      $('lp-err').textContent = mapAuthError(err);
      $('lp-err').style.display = '';
    })
    .finally(() => {
      $('lp-entrar').disabled = false;
      $('lp-entrar').textContent = 'Entrar';
    });
}

function forgotPasswordProfile() {
  if (!selectedSocio) return;
  auth.sendPasswordResetEmail(selectedSocio.email)
    .then(() => toast('Link de nova senha enviado pro e-mail da empresa'))
    .catch(() => {
      $('lp-err').textContent = 'Não foi possível enviar o e-mail agora.';
      $('lp-err').style.display = '';
    });
}

function forgotPassword() {
  const email = $('login-email').value.trim();
  if (!email) { loginError('Digite seu e-mail acima e toque em "Esqueci minha senha".'); return; }
  auth.sendPasswordResetEmail(email)
    .then(() => toast('Enviamos um link de redefinição para ' + email))
    .catch(() => loginError('Não foi possível enviar. Confira o e-mail digitado.'));
}

function enterDemo(silent) {
  localStorage.setItem('lagos_demo_active', '1');
  me = {
    uid: 'demo',
    email: localStorage.getItem('lagos_demo_email') || 'demo@lagos.app',
    nome: localStorage.getItem('lagos_demo_nome') || 'Você',
  };
  if (!demoLoad()) seedDemo();
  showApp();
  if (!silent) toast('Modo demonstração — dados salvos só neste aparelho');
}

function doLogout() {
  confirmDialog('Sair', 'Deseja sair da sua conta?', () => {
    if (DEMO) {
      localStorage.removeItem('lagos_demo_active');
      location.reload();
      return;
    }
    auth.signOut();
  });
}

function showApp() {
  $('login-screen').style.display = 'none';
  $('app').style.display = '';
  renderAll();
}

// ══════════════════════════════════════════
// PERFIL (nome de exibição)
// ══════════════════════════════════════════
function openNameModal() {
  $('profile-nome').value = me?.nome || '';
  openOverlay('modal-name');
}
function saveProfileName() {
  const nome = $('profile-nome').value.trim();
  if (!nome) { toast('Digite um nome.'); return; }
  me.nome = nome;
  if (DEMO) {
    localStorage.setItem('lagos_demo_nome', nome);
    demoSave();
  } else {
    dataSet('profiles', me.uid, { nome, email: me.email }).catch(e => console.error(e));
  }
  closeOverlay('modal-name');
  renderAll();
  toast('Nome salvo');
}

// ══════════════════════════════════════════
// NAVEGAÇÃO
// ══════════════════════════════════════════
function goTab(tab) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  $('page-' + tab).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('nav-on', b.dataset.tab === tab));
  // a Central é painel executivo: sem botão de cadastro nela
  $('fab').style.display = (tab === 'lanc') ? '' : 'none';
  window.scrollTo({ top: 0 });
  renderAll();
}
function openAjustes() { goTab('mais'); }

// ══════════════════════════════════════════
// RENDER GERAL
// ══════════════════════════════════════════
function renderAll() {
  if (!me) return;
  const active = document.querySelector('.page.active')?.id?.replace('page-', '');
  if (active === 'inicio') renderInicio();
  else if (active === 'lanc') renderLanc();
  else if (active === 'frota') renderFrota();
  else if (active === 'motoristas') renderMotoristas();
  else if (active === 'mais') renderMais();
}

function txDoMes(offset) {
  const mk = monthKey(offset);
  return S.tx.filter(t => (t.data || '').startsWith(mk));
}
function vehById(id) { return S.vehicles.find(v => v.id === id); }
function vehNome(id) {
  const v = vehById(id);
  return v ? v.nome : (id ? 'Veículo removido' : '');
}

// ══════════════════════════════════════════
// INÍCIO
// ══════════════════════════════════════════
function renderInicio() {
  const hour = new Date().getHours();
  const sauda = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const nome = (me.nome || '').split(' ')[0];
  $('inicio-greeting').textContent = sauda + (nome ? ', ' + nome : '');
  $('inicio-date').textContent = capFirst(new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }));
  const minhaFoto = myPhoto();
  if (minhaFoto) {
    $('avatar-initial').textContent = '';
    $('btn-avatar').style.background = `center/cover no-repeat url("${minhaFoto}")`;
  } else {
    $('avatar-initial').textContent = (me.nome || me.email || '?')[0].toUpperCase();
    $('btn-avatar').style.background = authorColor(me.nome || me.email);
  }

  const txs = txDoMes(0);
  const inc = txs.filter(t => t.tipo === 'receita').reduce((s, t) => s + t.valor, 0);
  const exp = txs.filter(t => t.tipo === 'despesa').reduce((s, t) => s + t.valor, 0);
  const liq = inc - exp;
  $('hero-month').textContent = monthLabel(0);
  $('hero-liq').textContent = R(liq);
  $('hero-inc').textContent = R(inc);
  $('hero-exp').textContent = R(exp);
  $('hero-inicio').className = 'hero-card' + (liq < 0 ? ' neg' : '');

  const alerts = computeAlerts();
  renderSituacao(alerts);

  // indicadores — tocar leva pro módulo correspondente
  const vansAtivas = S.vehicles.filter(v => v.status !== 'inativo').length;
  const motAtivos = S.drivers.filter(d => d.status !== 'inativo').length;
  $('dash-tiles').innerHTML = `
    <button class="tile" onclick="goTab('frota')"><b>${vansAtivas}</b><small>Veículos ativos</small></button>
    <button class="tile" onclick="goTab('motoristas')"><b>${motAtivos}</b><small>Motoristas ativos</small></button>`;

  renderAlerts(alerts);
  renderRecent(txs);
  renderInicioChart(txs);
}

// ── Situação da empresa: calculada a partir das pendências ──
function renderSituacao(alerts) {
  const crit = alerts.filter(a => a.crit).length;
  const nivel = crit ? 'crit' : alerts.length ? 'warn' : 'ok';
  const conf = {
    ok:   { ic: 'check', titulo: 'Operação normal', sub: 'Nenhuma pendência — tudo em dia.' },
    warn: { ic: 'alert', titulo: 'Atenção', sub: alerts.length + (alerts.length === 1 ? ' item precisa' : ' itens precisam') + ' de atenção. Toque para ver.' },
    crit: { ic: 'alert', titulo: 'Pendências críticas', sub: crit + (crit === 1 ? ' pendência crítica' : ' pendências críticas') + (alerts.length > crit ? ' e ' + (alerts.length - crit) + ' em atenção' : '') + '. Toque para ver.' },
  }[nivel];
  $('status-card').innerHTML = `
    <${alerts.length ? 'button onclick="irParaAlertas()"' : 'div'} class="status-card sc-${nivel}">
      ${icon(conf.ic, 22)}
      <div><b>${conf.titulo}</b><small>${conf.sub}</small></div>
    </${alerts.length ? 'button' : 'div'}>`;
}

function computeAlerts() {
  const alerts = [];
  S.vehicles.forEach(v => {
    if (v.status === 'inativo') return;
    [['licenciamento', 'Licenciamento', 'fileText'], ['seguro', 'Seguro', 'shield']].forEach(([campo, label, ico]) => {
      const dias = diasAte(v[campo]);
      if (dias === null) return;
      if (dias < 0) alerts.push({ crit: true, ico, txt: `${label} da ${v.nome} VENCIDO`, sub: `venceu em ${fmtData(v[campo])}`, veh: v.id });
      else if (dias <= 30) alerts.push({ crit: dias <= 7, ico, txt: `${label} da ${v.nome} vence em ${dias} dia${dias === 1 ? '' : 's'}`, sub: fmtData(v[campo]), veh: v.id });
    });
    const intervalo = Number(v.oleoIntervalo) || 0;
    const ultima = Number(v.oleoUltimaKm) || 0;
    if (intervalo > 0 && ultima > 0 && v.km > 0) {
      const rodou = v.km - ultima;
      if (rodou >= intervalo) alerts.push({ crit: true, ico: 'droplet', txt: `Troca de óleo da ${v.nome} atrasada`, sub: `rodou ${fmtKm(rodou)} desde a última troca (limite ${fmtKm(intervalo)})`, veh: v.id });
      else if (rodou >= intervalo - 1000) alerts.push({ crit: false, ico: 'droplet', txt: `Troca de óleo da ${v.nome} se aproximando`, sub: `faltam ${fmtKm(intervalo - rodou)}`, veh: v.id });
    }
  });
  S.drivers.forEach(d => {
    const dias = diasAte(d.cnhValidade);
    if (dias === null) return;
    if (dias < 0) alerts.push({ crit: true, ico: 'idCard', txt: `CNH de ${d.nome} VENCIDA`, sub: `venceu em ${fmtData(d.cnhValidade)}`, drv: d.id });
    else if (dias <= 30) alerts.push({ crit: dias <= 7, ico: 'idCard', txt: `CNH de ${d.nome} vence em ${dias} dia${dias === 1 ? '' : 's'}`, sub: fmtData(d.cnhValidade), drv: d.id });
  });
  return alerts.sort((a, b) => (b.crit ? 1 : 0) - (a.crit ? 1 : 0));
}

// tocar num alerta abre a ficha de quem tem o problema
function renderAlerts(alerts) {
  alerts = alerts || computeAlerts();
  $('alert-section').style.display = alerts.length ? '' : 'none';
  $('alert-list').innerHTML = alerts.map(a => `
    <button class="alert-item${a.crit ? ' crit' : ''}" onclick="${a.veh ? `openVehDetail('${a.veh}')` : a.drv ? `openDrvDetail('${a.drv}')` : ''}">
      <span class="a-ico">${icon(a.ico)}</span>
      <div><b>${esc(a.txt)}</b><small>${esc(a.sub)}</small></div>
    </button>`).join('');
}

function irParaAlertas() {
  if (!computeAlerts().length) { toast('Nenhum vencimento próximo!'); return; }
  $('alert-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// linha do tempo geral da empresa: lançamentos + eventos (trocas, documentos, cadastros…)
function renderRecent() {
  const el = $('recent-list');
  const itens = [
    ...S.tx.map(t => ({ ts: t.ts || 0, html: txItemHTML(t) })),
    ...(S.eventos || []).map(e => ({ ts: e.ts || 0, html: eventoHTML(e, true) })),
  ].sort((a, b) => b.ts - a.ts).slice(0, 8);
  $('sec-recent').style.display = itens.length ? '' : 'none';
  // sistema zerado: uma boa-vinda no lugar de várias seções vazias
  $('inicio-vazio').style.display = (!S.tx.length && !S.vehicles.length) ? '' : 'none';
  el.innerHTML = itens.map(i => i.html).join('');
}

// gráfico da Central: mesma leitura do Financeiro (frota × escritório + categorias)
function renderInicioChart(txs) {
  const desp = txs.filter(t => t.tipo === 'despesa');
  $('sec-chart').style.display = desp.length ? '' : 'none';
  if (desp.length) $('inicio-chart').innerHTML = chartDespesasHTML(desp, false);
}

// ══════════════════════════════════════════
// LANÇAMENTOS
// ══════════════════════════════════════════
function shiftMonth(dir) {
  monthOffset += dir;
  if (monthOffset > 0) monthOffset = 0;
  renderLanc();
}
function setLancFilter(f) {
  lancFilter = f;
  document.querySelectorAll('#lanc-type-chips .chip').forEach(c => c.classList.toggle('chip-on', c.dataset.f === f));
  renderLanc();
}

function txItemHTML(t) {
  const c = catInfo(t.cat);
  const vnome = t.veiculo ? vehNome(t.veiculo) : '';
  const partes = [];
  if (t.tipo === 'despesa' && origemDe(t) === 'escritorio') partes.push('Escritório');
  if (vnome) partes.push(esc(vnome));
  if (t.cat === 'combustivel' && t.litros) partes.push(t.litros.toLocaleString('pt-BR') + ' L');
  if (t.desc) partes.push(esc(t.desc));
  const meta = `${authorChip(t.autorNome, t.autorUid)}${partes.length ? ' · ' + partes.join(' · ') : ''}`;
  return `
    <button class="tx-item" onclick="openTxDetail('${t.id}')">
      <div class="tx-ico">${icon(c.ico)}</div>
      <div class="tx-body">
        <div class="tx-title">${c.nome}</div>
        <div class="tx-meta">${meta}</div>
      </div>
      <div class="tx-val ${t.tipo === 'receita' ? 'pos' : 'neg'}">${t.tipo === 'receita' ? '+' : '−'} ${R(t.valor)}</div>
    </button>`;
}

function setLancOrigem(o) {
  lancOrigem = o;
  document.querySelectorAll('#lanc-orig-chips .chip').forEach(c => c.classList.toggle('chip-on', c.dataset.o === o));
  renderLanc();
}

function renderLanc() {
  $('lanc-month-label').textContent = monthLabel(monthOffset);

  // popula filtro de veículos
  const sel = $('lanc-veh-filter');
  const cur = sel.value;
  sel.innerHTML = '<option value="">Todos os veículos</option>' +
    S.vehicles.map(v => `<option value="${v.id}">${esc(v.nome)}</option>`).join('');
  sel.value = cur;

  // popula filtro de categorias (agrupado por origem)
  const catSel = $('lanc-cat-filter');
  const curCat = catSel.value;
  const opt = c => `<option value="${c.id}">${c.nome}</option>`;
  catSel.innerHTML = '<option value="">Todas as categorias</option>' +
    `<optgroup label="Frota">${CATS.despesa.map(opt).join('')}</optgroup>` +
    `<optgroup label="Escritório">${CATS.escritorio.map(opt).join('')}</optgroup>` +
    `<optgroup label="Receitas">${CATS.receita.map(opt).join('')}</optgroup>`;
  catSel.value = curCat;

  const mes = txDoMes(monthOffset);
  const inc = mes.filter(t => t.tipo === 'receita').reduce((s, t) => s + t.valor, 0);
  const exp = mes.filter(t => t.tipo === 'despesa').reduce((s, t) => s + t.valor, 0);
  $('lanc-sum-inc').textContent = R(inc);
  $('lanc-sum-exp').textContent = R(exp);
  $('lanc-sum-liq').textContent = '= ' + R(inc - exp);
  $('lanc-sum-liq').style.color = inc - exp < 0 ? 'var(--neg)' : 'var(--pos)';

  renderLancCharts(mes);

  let txs = mes;
  if (lancFilter !== 'todos') txs = txs.filter(t => t.tipo === lancFilter);
  if (lancOrigem !== 'todas') txs = txs.filter(t => t.tipo === 'despesa' && origemDe(t) === lancOrigem);
  if (catSel.value) txs = txs.filter(t => t.cat === catSel.value);
  if (sel.value) txs = txs.filter(t => t.veiculo === sel.value);

  const el = $('lanc-list');
  if (!txs.length) {
    el.innerHTML = `<div class="empty-big"><span class="e-ico">${icon('calendar', 40)}</span>Nada lançado com esses filtros neste mês.</div>`;
    return;
  }
  // agrupa por dia (desc)
  const porDia = {};
  txs.forEach(t => { (porDia[t.data] = porDia[t.data] || []).push(t); });
  const dias = Object.keys(porDia).sort().reverse();
  el.innerHTML = dias.map(dia => `
    <div class="day-group">
      <div class="day-label">${fmtDia(dia)}</div>
      ${porDia[dia].sort((a, b) => (b.ts || 0) - (a.ts || 0)).map(txItemHTML).join('')}
    </div>`).join('');
}

// ── Gráfico de despesas: frota × escritório + maiores categorias ──
// usado na Central (só leitura) e no Financeiro (linhas aplicam o filtro)
function chartDespesasHTML(desp, clicavel) {
  const total = desp.reduce((s, t) => s + t.valor, 0);
  const escr = desp.filter(t => origemDe(t) === 'escritorio').reduce((s, t) => s + t.valor, 0);
  const frota = total - escr;
  const row = (ic, nome, val, pct, onclick) => `
    <${onclick ? `button class="cat-row cat-row-btn" onclick="${onclick}"` : 'div class="cat-row"'}>
      <div class="c-ico">${icon(ic, 18)}</div>
      <div class="c-body">
        <div class="c-top"><b>${nome}</b><span class="c-val">${R(val)} <small>· ${pct}%</small></span></div>
        <div class="c-bar"><div class="c-bar-fill" style="width:${pct}%"></div></div>
      </div>
    </${onclick ? 'button' : 'div'}>`;

  // divisão frota × escritório (só aparece quando o escritório tem gastos)
  let html = '';
  if (escr > 0) {
    html += row('truck', 'Frota', frota, Math.round(frota / total * 100), clicavel ? "setLancFilter('despesa');setLancOrigem('frota')" : '') +
            row('building', 'Escritório', escr, Math.round(escr / total * 100), clicavel ? "setLancFilter('despesa');setLancOrigem('escritorio')" : '') +
            '<div class="chart-sep"></div>';
  }
  // maiores categorias
  const porCat = {};
  desp.forEach(t => { porCat[t.cat] = (porCat[t.cat] || 0) + t.valor; });
  html += Object.entries(porCat).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([cat, val]) => {
    const c = catInfo(cat);
    return row(c.ico, c.nome, val, Math.round(val / total * 100));
  }).join('');
  return html;
}

function renderLancCharts(mes) {
  const wrap = $('lanc-charts');
  if (!wrap) return;
  const desp = mes.filter(t => t.tipo === 'despesa');
  if (!desp.length) { wrap.style.display = 'none'; return; }
  wrap.style.display = '';
  $('lanc-charts-body').innerHTML = chartDespesasHTML(desp, true);
}

// ── Formulário de lançamento ──
let pendingAnexo = null; // nota importada aguardando o salvamento do lançamento

function openTxForm(tx) {
  pendingAnexo = null;
  $('tx-anexo-chip').style.display = 'none';
  editingTxId = tx ? tx.id : null;
  $('tx-form-title').textContent = tx ? 'Editar lançamento' : 'Novo lançamento';
  $('tx-save-btn').textContent = tx ? 'Salvar alterações' : 'Salvar';
  txTipo = tx ? tx.tipo : 'despesa';
  txCat = tx ? tx.cat : null;
  txOrigem = tx ? origemDe(tx) : 'frota';
  $('tx-valor').value = tx ? tx.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '';
  $('tx-data').value = tx ? tx.data : todayStr();
  $('tx-desc').value = tx ? (tx.desc || '') : '';
  $('tx-litros').value = tx && tx.litros ? String(tx.litros).replace('.', ',') : '';
  $('tx-km').value = tx && tx.km ? tx.km : '';

  const sel = $('tx-veiculo');
  sel.innerHTML = '<option value="">— Nenhum / geral —</option>' +
    S.vehicles.filter(v => v.status !== 'inativo' || (tx && tx.veiculo === v.id))
      .map(v => `<option value="${v.id}">${esc(v.nome)} · ${esc(v.placa || '')}</option>`).join('') +
    // ao editar lançamento de veículo já excluído, mantém o vínculo visível
    (tx && tx.veiculo && !vehById(tx.veiculo) ? `<option value="${tx.veiculo}">Veículo removido</option>` : '');
  sel.value = tx ? (tx.veiculo || '') : '';

  updateTipoSeg();
  renderCatGrid();
  updateFuelExtra();
  openOverlay('modal-tx');
}

function setTxTipo(tipo) {
  txTipo = tipo;
  txCat = null;
  updateTipoSeg();
  renderCatGrid();
  updateFuelExtra();
}
function setTxOrigem(origem) {
  txOrigem = origem;
  txCat = null;
  updateTipoSeg();
  renderCatGrid();
  updateFuelExtra();
}
function updateTipoSeg() {
  $('seg-despesa').classList.toggle('seg-on', txTipo === 'despesa');
  $('seg-receita').classList.toggle('seg-on', txTipo === 'receita');
  // origem só faz sentido para despesa; escritório dispensa o campo de veículo
  $('tx-orig-seg').style.display = txTipo === 'despesa' ? '' : 'none';
  $('seg-frota').classList.toggle('seg-on', txOrigem === 'frota');
  $('seg-escritorio').classList.toggle('seg-on', txOrigem === 'escritorio');
  $('tx-veh-fld').style.display = (txTipo === 'despesa' && txOrigem === 'escritorio') ? 'none' : '';
}
function catsAtuais() {
  if (txTipo === 'receita') return CATS.receita;
  return txOrigem === 'escritorio' ? CATS.escritorio : CATS.despesa;
}
function renderCatGrid() {
  $('tx-cat-grid').innerHTML = catsAtuais().map(c => `
    <button type="button" class="cat-pill${txCat === c.id ? ' cp-on' : ''}" onclick="pickCat('${c.id}')">
      <span class="cp-ico">${icon(c.ico, 20)}</span>${c.nome}
    </button>`).join('');
}
function pickCat(id) {
  txCat = id;
  renderCatGrid();
  updateFuelExtra();
}
function updateFuelExtra() {
  const show = txTipo === 'despesa' && txCat === 'combustivel';
  $('tx-fuel-extra').style.display = show ? '' : 'none';
  if (show) updateFuelHint();
}
function updateFuelHint() {
  const v = vehById($('tx-veiculo').value);
  const litros = parseValor($('tx-litros').value);
  const valor = parseValor($('tx-valor').value);
  const partes = [];
  if (v && v.km) partes.push(`Km atual da ${v.nome}: ${fmtKm(v.km)}`);
  if (litros > 0 && valor > 0) partes.push(`≈ ${R(valor / litros)}/litro`);
  $('tx-fuel-hint').textContent = partes.join(' · ');
}

async function saveTx() {
  const valor = parseValor($('tx-valor').value);
  if (valor <= 0) { toast('Informe o valor.'); return; }
  if (!txCat) { toast('Escolha uma categoria.'); return; }
  const data = $('tx-data').value || todayStr();
  const origem = txTipo === 'despesa' ? txOrigem : '';
  const veiculo = origem === 'escritorio' ? '' : ($('tx-veiculo').value || '');
  if (txCat === 'combustivel' && !veiculo) { toast('Selecione o veículo abastecido.'); return; }

  const original = editingTxId ? S.tx.find(x => x.id === editingTxId) : null;
  const t = {
    tipo: txTipo,
    cat: txCat,
    valor,
    data,
    veiculo,
    origem,
    desc: $('tx-desc').value.trim(),
    litros: txCat === 'combustivel' ? parseValor($('tx-litros').value) : 0,
    km: txCat === 'combustivel' ? parseIntBR($('tx-km').value) : 0,
    // autor original nunca muda; edições ficam registradas à parte
    autorNome: original ? (original.autorNome || '?') : (me.nome || me.email),
    autorUid: original ? (original.autorUid || '') : me.uid,
    ts: original ? (original.ts || Date.now()) : Date.now(),
  };
  if (original) {
    t.editadoPorNome = me.nome || me.email;
    t.editadoEm = Date.now();
  }
  const id = editingTxId || newId();
  closeOverlay('modal-tx');
  try {
    await dataSet('tx', id, t);
    // nota importada fica anexada ao lançamento E vinculada ao veículo
    if (pendingAnexo) {
      try { await addAnexoRecord('tx', id, { ...pendingAnexo, veiculoId: veiculo || '' }); } catch (e) { console.error(e); }
      pendingAnexo = null;
    }
    // abastecimento com km informado atualiza o odômetro do veículo
    if (t.km > 0 && veiculo) {
      const v = vehById(veiculo);
      if (v && t.km > (Number(v.km) || 0)) {
        await dataSet('vehicles', v.id, { ...stripId(v), km: t.km });
      }
    }
    toast(editingTxId ? 'Lançamento atualizado ✓' : (txTipo === 'despesa' ? 'Despesa registrada ✓' : 'Receita registrada ✓'));
  } catch (e) {
    console.error(e);
    toast('Erro ao salvar. Verifique a conexão.');
  }
  editingTxId = null;
}

function stripId(obj) { const { id, ...rest } = obj; return rest; }

// ── Detalhe do lançamento ──
function openTxDetail(id) {
  const t = S.tx.find(x => x.id === id);
  if (!t) return;
  detailTxId = id;
  const c = catInfo(t.cat);
  const rows = [
    ['Tipo', t.tipo === 'receita' ? '▲ Receita' : '▼ Despesa'],
    ['Categoria', c.nome],
    ['Valor', R(t.valor)],
    ['Data', fmtData(t.data)],
  ];
  if (t.tipo === 'despesa') rows.splice(1, 0, ['Origem', origemDe(t) === 'escritorio' ? 'Escritório' : 'Frota']);
  if (t.veiculo) rows.push(['Veículo', vehNome(t.veiculo)]);
  if (t.litros) rows.push(['Litros', t.litros.toLocaleString('pt-BR') + ' L (' + R(t.valor / t.litros) + '/L)']);
  if (t.km) rows.push(['Km no painel', fmtKm(t.km)]);
  if (t.desc) rows.push(['Descrição', t.desc]);
  rows.push(['Lançado por', (t.autorNome || '—') + (t.ts ? ' · ' + fmtDataHora(t.ts) : '')]);
  $('tx-detail-body').innerHTML = '<div class="detail-rows">' +
    rows.map(([k, v]) => `<div class="detail-row"><small>${k}</small><b>${esc(v)}</b></div>`).join('') +
    '</div>' +
    (t.veiculo && vehById(t.veiculo)
      ? `<button class="btn btn-secondary btn-block" style="margin-bottom:12px" onclick="closeOverlay('modal-tx-detail');openVehDetail('${t.veiculo}')">${icon('truck', 16)} Abrir ficha da ${esc(vehNome(t.veiculo))}</button>`
      : '') +
    '<div class="anexos-list" id="tx-anexos"></div>';
  renderAnexosInto('tx-anexos', id, 'tx');
  openOverlay('modal-tx-detail');
}
function editTxFromDetail() {
  const t = S.tx.find(x => x.id === detailTxId);
  closeOverlay('modal-tx-detail');
  if (t) openTxForm(t);
}
function deleteTxFromDetail() {
  const id = detailTxId;
  confirmDialog('Excluir lançamento', 'Essa ação não pode ser desfeita. Excluir mesmo assim?', async () => {
    closeOverlay('modal-tx-detail');
    try { await dataDelete('tx', id); toast('Lançamento excluído'); }
    catch (e) { toast('Erro ao excluir.'); }
  });
}

// ══════════════════════════════════════════
// QUILOMETRAGEM
// ══════════════════════════════════════════
// Leituras de km de um veículo: registros manuais (kmlog) + abastecimentos com km
function kmReadings(vid) {
  const manuais = S.kmlog.filter(l => l.veiculo === vid && l.km > 0)
    .map(l => ({ data: l.data, km: l.km }));
  const abastecidas = S.tx.filter(t => t.veiculo === vid && t.cat === 'combustivel' && t.km > 0)
    .map(t => ({ data: t.data, km: t.km }));
  return [...manuais, ...abastecidas].sort((a, b) => a.data.localeCompare(b.data) || a.km - b.km);
}

// Km rodado no mês = última leitura do mês − última leitura anterior ao mês
// (se não houver leitura anterior, usa a primeira leitura do próprio mês)
function kmRodadoMes(vid, offset = 0) {
  const mk = monthKey(offset);
  const reads = kmReadings(vid);
  const doMes = reads.filter(r => r.data.startsWith(mk));
  if (!doMes.length) return 0;
  const ultima = Math.max(...doMes.map(r => r.km));
  const anteriores = reads.filter(r => r.data < mk + '-01');
  const base = anteriores.length ? Math.max(...anteriores.map(r => r.km)) : Math.min(...doMes.map(r => r.km));
  return Math.max(0, ultima - base);
}

let kmVehId = null;
function openKmForm(vid) {
  const v = vehById(vid);
  if (v) {
    // veio da ficha do veículo: já sabemos qual é
    kmVehId = vid;
    $('km-veh-fld').style.display = 'none';
    $('km-veh-info').textContent = v.nome + (v.km ? ' — última leitura: ' + fmtKm(v.km) : '');
  } else {
    // veio do atalho do Início: escolher o veículo
    if (!S.vehicles.length) { toast('Cadastre um veículo primeiro (módulo Operação).'); return; }
    kmVehId = null;
    const sel = $('km-veiculo');
    sel.innerHTML = '<option value="">— Escolha a van —</option>' +
      S.vehicles.filter(x => x.status !== 'inativo')
        .map(x => `<option value="${x.id}">${esc(x.nome)}${x.placa ? ' · ' + esc(x.placa) : ''}</option>`).join('');
    sel.value = '';
    $('km-veh-fld').style.display = '';
    $('km-veh-info').textContent = '';
  }
  $('km-valor').value = '';
  $('km-data').value = todayStr();
  closeOverlay('modal-veh-detail');
  openOverlay('modal-km');
}
function kmVehChanged() {
  const v = vehById($('km-veiculo').value);
  kmVehId = v ? v.id : null;
  $('km-veh-info').textContent = v ? (v.nome + (v.km ? ' — última leitura: ' + fmtKm(v.km) : '')) : '';
}

async function saveKmLog() {
  const km = parseIntBR($('km-valor').value);
  if (km <= 0) { toast('Informe o km do painel.'); return; }
  const v = vehById(kmVehId);
  if (!v) { toast('Escolha o veículo.'); return; }
  const data = $('km-data').value || todayStr();
  closeOverlay('modal-km');
  try {
    await dataSet('kmlog', newId(), {
      veiculo: kmVehId, km, data,
      autorNome: me.nome || me.email, autorUid: me.uid, ts: Date.now(),
    });
    if (km > (Number(v.km) || 0)) await dataSet('vehicles', v.id, { ...stripId(v), km });
    toast('Km registrado ✓');
  } catch (e) { toast('Erro ao salvar.'); }
}

function deleteKmLog(id) {
  confirmDialog('Excluir leitura de km', 'Excluir este registro de quilometragem?', async () => {
    try { await dataDelete('kmlog', id); toast('Registro excluído'); }
    catch (e) { toast('Erro ao excluir.'); }
    closeOverlay('modal-veh-detail');
  });
}

// ══════════════════════════════════════════
// FROTA
// ══════════════════════════════════════════
function consumoMedio(vid) {
  // média = soma dos Δkm entre abastecimentos consecutivos / litros dos abastecimentos posteriores
  const fills = S.tx
    .filter(t => t.veiculo === vid && t.cat === 'combustivel' && t.km > 0 && t.litros > 0)
    .sort((a, b) => a.km - b.km);
  if (fills.length < 2) return null;
  let dKm = 0, litros = 0;
  for (let i = 1; i < fills.length; i++) {
    dKm += fills[i].km - fills[i - 1].km;
    litros += fills[i].litros;
  }
  if (litros <= 0 || dKm <= 0) return null;
  return dKm / litros;
}

function vehAlertChips(v) {
  const chips = [];
  [['licenciamento', 'Licenciamento'], ['seguro', 'Seguro']].forEach(([campo, label]) => {
    const dias = diasAte(v[campo]);
    if (dias === null) return;
    if (dias < 0) chips.push({ crit: true, txt: `${label} vencido` });
    else if (dias <= 30) chips.push({ crit: false, txt: `${label} vence em ${dias}d` });
  });
  const intervalo = Number(v.oleoIntervalo) || 0, ultima = Number(v.oleoUltimaKm) || 0;
  if (intervalo > 0 && ultima > 0 && v.km > 0) {
    const rodou = v.km - ultima;
    if (rodou >= intervalo) chips.push({ crit: true, txt: 'Troca de óleo atrasada' });
    else if (rodou >= intervalo - 1000) chips.push({ crit: false, txt: `Óleo: faltam ${fmtKm(intervalo - rodou)}` });
  }
  return chips;
}

function motoristaDe(vid) {
  return S.drivers.find(d => d.veiculoId === vid);
}

function renderFrota() {
  const el = $('veh-list');
  if (!S.vehicles.length) {
    el.innerHTML = `<div class="empty-big"><span class="e-ico">${icon('truck', 40)}</span>Nenhum veículo cadastrado.<br>Toque em <b>+ Veículo</b> para adicionar a primeira van.</div>`;
    return;
  }
  const mk = monthKey(0);
  const ordem = { ativo: 0, manutencao: 1, inativo: 2 };
  const stLabel = { ativo: 'Ativo', manutencao: 'Manutenção', inativo: 'Inativo' };
  const busca = ($('frota-busca')?.value || '').trim().toLowerCase();
  let lista = [...S.vehicles];
  if (busca) {
    lista = lista.filter(v => {
      const mot = motoristaDe(v.id);
      return (v.nome || '').toLowerCase().includes(busca) ||
             (v.placa || '').toLowerCase().includes(busca) ||
             (v.modelo || '').toLowerCase().includes(busca) ||
             (mot && mot.nome.toLowerCase().includes(busca));
    });
    if (!lista.length) { el.innerHTML = `<div class="empty-big"><span class="e-ico">${icon('search', 40)}</span>Nada encontrado com essa busca.</div>`; return; }
  }
  el.innerHTML = lista
    .sort((a, b) => (ordem[a.status] ?? 0) - (ordem[b.status] ?? 0) || a.nome.localeCompare(b.nome))
    .map(v => {
      const gasto = S.tx.filter(t => t.veiculo === v.id && t.tipo === 'despesa' && (t.data || '').startsWith(mk))
        .reduce((s, t) => s + t.valor, 0);
      const cons = consumoMedio(v.id);
      const rodou = kmRodadoMes(v.id);
      const chips = vehAlertChips(v);
      const mot = motoristaDe(v.id);
      return `
        <button class="veh-card" onclick="openVehDetail('${v.id}')">
          <div class="veh-top">
            <div class="veh-ico">${v.foto ? `<img src="${v.foto}" alt="">` : icon('truck', 24)}</div>
            <div>
              <div class="veh-nome">${esc(v.nome)}</div>
              <div class="veh-sub">${esc(v.placa || '')}${v.modelo ? ' · ' + esc(v.modelo) : ''}${mot ? ' · ' + esc(mot.nome.split(' ')[0]) : ''}</div>
            </div>
            <span class="veh-status st-${v.status || 'ativo'}">${stLabel[v.status] || stLabel.ativo}</span>
          </div>
          <div class="veh-stats">
            <div class="veh-stat"><small>Km atual</small><b>${v.km ? fmtKm(v.km) : '—'}</b></div>
            <div class="veh-stat"><small>Rodou no mês</small><b>${rodou ? fmtKm(rodou) : '—'}</b></div>
            <div class="veh-stat"><small>Gasto no mês</small><b>${R(gasto)}</b></div>
            <div class="veh-stat"><small>Consumo</small><b>${cons ? cons.toFixed(1).replace('.', ',') + ' km/L' : '—'}</b></div>
          </div>
          ${chips.length ? '<div class="veh-alerts">' + chips.map(c => `<span class="veh-alert-chip${c.crit ? ' crit' : ''}">${c.txt}</span>`).join('') + '</div>' : ''}
        </button>`;
    }).join('');
}

function openVehicleForm(v) {
  editingVehId = v ? v.id : null;
  $('veh-form-title').textContent = v ? 'Editar veículo' : 'Novo veículo';
  $('veh-nome').value = v ? v.nome : '';
  $('veh-placa').value = v ? (v.placa || '') : '';
  $('veh-ano').value = v ? (v.ano || '') : '';
  $('veh-modelo').value = v ? (v.modelo || '') : '';
  $('veh-km').value = v && v.km ? v.km : '';
  $('veh-oleo-km').value = v && v.oleoUltimaKm ? v.oleoUltimaKm : '';
  $('veh-oleo-int').value = v && v.oleoIntervalo ? v.oleoIntervalo : '';
  $('veh-licenc').value = v ? (v.licenciamento || '') : '';
  $('veh-seguro').value = v ? (v.seguro || '') : '';
  $('veh-status').value = v ? (v.status || 'ativo') : 'ativo';
  $('veh-obs').value = v ? (v.observacoes || '') : '';
  $('veh-del-btn').style.display = v ? '' : 'none';
  openOverlay('modal-veh');
}

async function saveVehicle() {
  const nome = $('veh-nome').value.trim();
  if (!nome) { toast('Dê um nome ao veículo (ex.: Van 01).'); return; }
  const origV = editingVehId ? vehById(editingVehId) : null;
  const v = {
    nome,
    placa: $('veh-placa').value.trim().toUpperCase(),
    ano: $('veh-ano').value.trim(),
    modelo: $('veh-modelo').value.trim(),
    km: parseIntBR($('veh-km').value),
    oleoUltimaKm: parseIntBR($('veh-oleo-km').value),
    oleoIntervalo: parseIntBR($('veh-oleo-int').value),
    licenciamento: $('veh-licenc').value || '',
    seguro: $('veh-seguro').value || '',
    status: $('veh-status').value,
    observacoes: $('veh-obs').value.trim(),
    foto: origV?.foto || '',
    criadoPorNome: origV?.criadoPorNome || me.nome || me.email,
    atualizadoPorNome: me.nome || me.email,
    atualizadoEm: Date.now(),
  };
  const id = editingVehId || newId();
  closeOverlay('modal-veh');
  try {
    await dataSet('vehicles', id, v);
    if (!origV) logEvento('vehicle', id, 'truck', 'Veículo cadastrado', v.nome + (v.placa ? ' · ' + v.placa : ''));
    toast(editingVehId ? 'Veículo atualizado ✓' : 'Veículo adicionado ✓');
  } catch (e) { toast('Erro ao salvar.'); }
  editingVehId = null;
}

function deleteVehicleFromForm() {
  const id = editingVehId;
  confirmDialog('Excluir veículo', 'Os lançamentos já feitos serão mantidos no histórico. Excluir o veículo?', async () => {
    closeOverlay('modal-veh');
    try { await dataDelete('vehicles', id); toast('Veículo excluído'); }
    catch (e) { toast('Erro ao excluir.'); }
  });
}

function openVehDetail(id) {
  const v = vehById(id);
  if (!v) return;
  detailVehId = id;
  $('veh-detail-title').textContent = v.nome;
  const mk = monthKey(0);
  const txsV = S.tx.filter(t => t.veiculo === id).sort((a, b) => (b.ts || 0) - (a.ts || 0));
  const gastoMes = txsV.filter(t => t.tipo === 'despesa' && (t.data || '').startsWith(mk)).reduce((s, t) => s + t.valor, 0);
  const cons = consumoMedio(id);
  const rodou = kmRodadoMes(id);
  const custoKm = rodou > 0 ? gastoMes / rodou : null;
  const proxOleo = (Number(v.oleoUltimaKm) || 0) + (Number(v.oleoIntervalo) || 0);

  const mot = motoristaDe(id);
  const stLabel = { ativo: 'Ativo', manutencao: 'Manutenção', inativo: 'Inativo' };

  // indicadores principais (4)
  const cells = [
    ['Km atual', v.km ? fmtKm(v.km) : '—'],
    ['Gasto no mês', R(gastoMes)],
    ['Consumo médio', cons ? cons.toFixed(1).replace('.', ',') + ' km/L' : '—'],
    ['Próx. manutenção', proxOleo > (Number(v.oleoUltimaKm) || 0) ? 'Óleo aos ' + fmtKm(proxOleo) : '—'],
  ];
  // informações técnicas (tudo do cadastro)
  const tech = [
    ['Placa', v.placa || '—'],
    ['Modelo', (v.modelo || '—') + (v.ano ? ' · ' + v.ano : '')],
    ['Rodou no mês', rodou ? fmtKm(rodou) : '—'],
    ['Custo por km (mês)', custoKm ? R(custoKm) : '—'],
    ['Troca de óleo a cada', v.oleoIntervalo ? fmtKm(v.oleoIntervalo) : '—'],
    ['Última troca de óleo', v.oleoUltimaKm ? fmtKm(v.oleoUltimaKm) : '—'],
    ['Licenciamento', fmtData(v.licenciamento)],
    ['Seguro', fmtData(v.seguro)],
  ];
  // vencimentos exibidos junto dos documentos
  const vencChip = (label, data) => {
    const dias = diasAte(data);
    if (dias === null) return '';
    const cls = dias < 0 ? 'vc-crit' : dias <= 30 ? 'vc-warn' : 'vc-ok';
    const txt = dias < 0 ? 'VENCIDO' : dias === 0 ? 'vence HOJE' : `em ${dias}d`;
    return `<span class="venc-chip ${cls}">${label}: ${fmtData(data)} (${txt})</span>`;
  };
  const vencimentos = vencChip('Licenciamento', v.licenciamento) + vencChip('Seguro', v.seguro);

  $('veh-detail-body').innerHTML = `
    <div class="ficha-head">
      <button class="veh-ico ficha-foto" onclick="pickVehFoto('${id}')" title="Trocar foto">${v.foto ? `<img src="${v.foto}" alt="">` : icon('truck', 30)}</button>
      <div class="ficha-info">
        <b>${esc(v.nome)}</b>
        <small>${esc(v.placa || 'sem placa')}${v.modelo ? ' · ' + esc(v.modelo) : ''}</small>
        <small>${mot ? 'Motorista: ' + esc(mot.nome) : 'Sem motorista vinculado'}</small>
      </div>
      <span class="veh-status st-${v.status || 'ativo'}">${stLabel[v.status] || stLabel.ativo}</span>
    </div>

    <div class="vd-grid">${cells.map(([k, val]) => `<div class="vd-cell"><small>${k}</small><b>${esc(val)}</b></div>`).join('')}</div>

    <div class="quick-row quick-2x2">
      <button class="qa" onclick="registrarAbastecimento('${id}')">${icon('fuel', 24)}Registrar<br>abastecimento</button>
      <button class="qa" onclick="registrarManutencao('${id}')">${icon('wrench', 24)}Registrar<br>manutenção</button>
      <button class="qa" onclick="openKmForm('${id}')">${icon('mapPin', 24)}Atualizar<br>KM</button>
      <button class="qa" onclick="pickAnexo('vehicle','${id}','veh-anexos')">${icon('filePlus', 24)}Adicionar<br>documento</button>
    </div>

    <h2 class="sec-title">${icon('history', 14)} Histórico</h2>
    <div id="van-timeline"><div class="empty-mini">Carregando…</div></div>
    <button class="btn-link" onclick="verHistoricoCompleto('${id}')">Ver todos os lançamentos →</button>

    <h2 class="sec-title">${icon('fileText', 14)} Documentos</h2>
    ${vencimentos ? `<div class="venc-chips">${vencimentos}</div>` : ''}
    <div class="anexos-list" id="veh-anexos"></div>
    <div id="veh-notas-wrap" style="display:none">
      <div class="sec-sub">Notas fiscais de lançamentos</div>
      <div class="anexos-list" id="veh-notas"></div>
    </div>

    <h2 class="sec-title">${icon('note', 14)} Observações</h2>
    <label class="fld"><textarea id="van-obs" rows="3" placeholder="Anotações livres sobre esta van…">${esc(v.observacoes || '')}</textarea></label>
    <button class="btn btn-small" style="margin-top:-6px" onclick="salvarObsVan('${id}')">Salvar observações</button>

    <h2 class="sec-title">${icon('sliders', 14)} Informações técnicas</h2>
    <div class="vd-grid">${tech.map(([k, val]) => `<div class="vd-cell"><small>${k}</small><b>${esc(val)}</b></div>`).join('')}</div>
    <button class="btn btn-secondary btn-block" onclick="closeOverlay('modal-veh-detail');openVehicleForm(vehById('${id}'))">${icon('pencil', 16)} Editar dados do veículo</button>
  `;
  renderVanTimeline(id, txsV);
  renderNotasVeiculo('veh-notas', id);
  openOverlay('modal-veh-detail');
}

// ── Linha do tempo da van: lançamentos + leituras de km + documentos ──
async function renderVanTimeline(vid, txsV) {
  const eventos = [
    ...txsV.map(t => ({ ts: t.ts || 0, html: txItemHTML(t) })),
    ...S.kmlog.filter(l => l.veiculo === vid).map(l => ({
      ts: l.ts || 0,
      html: `
        <div class="tx-item" style="cursor:default">
          <div class="tx-ico">${icon('mapPin')}</div>
          <div class="tx-body">
            <div class="tx-title">Km registrado: ${fmtKm(l.km)}</div>
            <div class="tx-meta">${authorChip(l.autorNome)} · ${fmtDia(l.data)}</div>
          </div>
          <button class="x" onclick="deleteKmLog('${l.id}')">✕</button>
        </div>`,
    })),
  ];
  // eventos da van (troca de motorista, cadastro, observações…)
  try { (await eventosDe(vid)).forEach(e => eventos.push({ ts: e.ts || 0, html: eventoHTML(e) })); } catch (e) {}
  // documentos entram na linha do tempo assim que carregam
  const docs = await renderAnexosInto('veh-anexos', vid, 'vehicle');
  docs.forEach(a => eventos.push({
    ts: a.ts || 0,
    html: `
      <button class="tx-item" onclick="openAnexoViewer('${a.id}')">
        <div class="tx-ico">${icon(a.mime === 'application/pdf' ? 'fileText' : 'image')}</div>
        <div class="tx-body">
          <div class="tx-title">Documento: ${esc(a.nome)}</div>
          <div class="tx-meta">${authorChip(a.autorNome)} · ${a.ts ? fmtDia(new Date(a.ts).toISOString().slice(0, 10)) : ''}</div>
        </div>
      </button>`,
  }));
  const el = $('van-timeline');
  if (!el) return;
  eventos.sort((a, b) => b.ts - a.ts);
  el.innerHTML = eventos.length
    ? eventos.slice(0, 10).map(e => e.html).join('')
    : '<div class="empty-mini">Nenhum evento ainda — use as ações rápidas acima.</div>';
}

// ações rápidas com contexto embutido
function registrarAbastecimento(vid) {
  closeOverlay('modal-veh-detail');
  openTxForm();
  pickCat('combustivel');
  $('tx-veiculo').value = vid;
  updateFuelExtra();
  updateFuelHint();
}
function registrarManutencao(vid) {
  closeOverlay('modal-veh-detail');
  openTxForm();
  pickCat('manutencao');
  $('tx-veiculo').value = vid;
}
async function salvarObsVan(vid) {
  const v = vehById(vid);
  if (!v) return;
  const obs = $('van-obs').value.trim();
  try {
    await dataSet('vehicles', vid, { ...stripId(v), observacoes: obs });
    if (obs && obs !== (v.observacoes || '')) logEvento('vehicle', vid, 'note', 'Observação registrada', obs.slice(0, 80));
    toast('Observações salvas ✓');
  } catch (e) { toast('Erro ao salvar.'); }
}

// lançamento nascendo de dentro da ficha: van já selecionada
function lancarParaVan(vid) {
  closeOverlay('modal-veh-detail');
  openTxForm();
  $('tx-veiculo').value = vid;
  updateFuelHint();
}

// histórico completo = aba Lançamentos já filtrada neste veículo
function verHistoricoCompleto(vid) {
  closeOverlay('modal-veh-detail');
  monthOffset = 0;
  lancFilter = 'todos';
  goTab('lanc');
  document.querySelectorAll('#lanc-type-chips .chip').forEach(c => c.classList.toggle('chip-on', c.dataset.f === 'todos'));
  $('lanc-veh-filter').value = vid;
  renderLanc();
}

// foto do veículo (aparece no card da frota)
let vehFotoId = null;
function pickVehFoto(vid) {
  vehFotoId = vid;
  $('veh-foto-input').click();
}
async function handleVehFotoInput(input) {
  const file = input.files && input.files[0];
  input.value = '';
  const v = vehById(vehFotoId);
  if (!file || !v) return;
  try {
    const foto = await fileToSquareDataURL(file, 160);
    await dataSet('vehicles', v.id, { ...stripId(v), foto });
    toast('Foto da van salva ✓');
    closeOverlay('modal-veh-detail');
  } catch (e) { toast('Não foi possível usar essa imagem.'); }
}

// ══════════════════════════════════════════
// MOTORISTAS (aba própria com ficha completa)
// ══════════════════════════════════════════
function cnhBadge(d) {
  const dias = diasAte(d.cnhValidade);
  if (dias === null) return '';
  if (dias < 0) return '<span class="row-badge rb-crit">CNH vencida</span>';
  if (dias <= 30) return `<span class="row-badge rb-warn">CNH vence em ${dias}d</span>`;
  return '<span class="row-badge rb-ok">CNH em dia</span>';
}

function renderMotoristas() {
  const el = $('driver-list');
  if (!S.drivers.length) {
    el.innerHTML = `<div class="empty-big"><span class="e-ico">${icon('user', 40)}</span>Nenhum motorista cadastrado.<br>Toque em <b>+ Motorista</b> para adicionar o primeiro.</div>`;
    return;
  }
  el.innerHTML = [...S.drivers]
    .sort((a, b) => a.nome.localeCompare(b.nome))
    .map(d => {
      const van = S.vehicles.find(v => v.id === d.veiculoId);
      const stTag = d.status === 'ferias' ? 'Férias · ' : d.status === 'inativo' ? 'Inativo · ' : '';
      return `
        <button class="veh-card" onclick='openDrvDetail(${JSON.stringify(d.id)})'>
          <div class="veh-top">
            <div class="veh-ico">${d.foto ? `<img src="${d.foto}" alt="">` : icon('user', 24)}</div>
            <div>
              <div class="veh-nome">${esc(d.nome)}</div>
              <div class="veh-sub">${stTag}${van ? esc(van.nome) + ' · ' : ''}CNH ${esc(d.cnhCategoria || '—')} · até ${fmtData(d.cnhValidade)}</div>
            </div>
            ${cnhBadge(d)}
          </div>
        </button>`;
    }).join('');
}

// ficha completa do motorista
let detailDrvId = null;
function openDrvDetail(id) {
  const d = S.drivers.find(x => x.id === id);
  if (!d) return;
  detailDrvId = id;
  const van = S.vehicles.find(v => v.id === d.veiculoId);
  const dias = diasAte(d.cnhValidade);
  const stLabelD = { ativo: 'Ativo', ferias: 'Férias', inativo: 'Inativo' };
  const stClsD = { ativo: 'st-ativo', ferias: 'st-manutencao', inativo: 'st-inativo' };
  $('drv-detail-title').textContent = d.nome;

  // indicadores (4)
  const rodou = d.veiculoId ? kmRodadoMes(d.veiculoId) : 0;
  const mk = monthKey(0);
  const gastoVan = d.veiculoId
    ? S.tx.filter(t => t.veiculo === d.veiculoId && t.tipo === 'despesa' && (t.data || '').startsWith(mk)).reduce((s, t) => s + t.valor, 0)
    : 0;
  const cnhTxt = dias === null ? '—' : dias < 0 ? 'VENCIDA' : `vence em ${dias}d`;
  const cells = [
    ['Van atual', van ? van.nome : '—'],
    ['CNH', cnhTxt],
    ['Rodou no mês (van)', rodou ? fmtKm(rodou) : '—'],
    ['Gastos da van no mês', d.veiculoId ? R(gastoVan) : '—'],
  ];
  // informações completas
  const info = [
    ['Telefone', d.telefone || '—'],
    ['Categoria da CNH', d.cnhCategoria || '—'],
    ['Validade da CNH', fmtData(d.cnhValidade)],
    ['Veículo atual', van ? van.nome : '—'],
    ['Data de cadastro', d.criadoEm ? fmtData(new Date(d.criadoEm).toISOString().slice(0, 10)) : '—'],
    ['Cadastrado por', d.criadoPorNome || '—'],
  ];
  const alertaCNH = dias !== null && dias <= 30
    ? `<div class="venc-chips"><span class="venc-chip ${dias < 0 ? 'vc-crit' : 'vc-warn'}">CNH: ${fmtData(d.cnhValidade)} (${dias < 0 ? 'VENCIDA' : 'em ' + dias + 'd'})</span></div>`
    : '';

  $('drv-detail-body').innerHTML = `
    <div class="ficha-head">
      <button class="veh-ico ficha-foto" onclick="pickDrvFoto('${id}')" title="Trocar foto">${d.foto ? `<img src="${d.foto}" alt="">` : icon('user', 30)}</button>
      <div class="ficha-info">
        <b>${esc(d.nome)}</b>
        <small>CNH ${esc(d.cnhCategoria || '—')} · até ${fmtData(d.cnhValidade)}</small>
        <small>${van ? 'Van: ' + esc(van.nome) : 'Sem veículo vinculado'}</small>
      </div>
      <span class="veh-status ${stClsD[d.status] || 'st-ativo'}">${stLabelD[d.status] || stLabelD.ativo}</span>
    </div>

    <div class="vd-grid">${cells.map(([k, val]) => `<div class="vd-cell"><small>${k}</small><b>${esc(val)}</b></div>`).join('')}</div>

    <div class="quick-row quick-2x2">
      <button class="qa" onclick="openTrocaVeiculo('${id}')">${icon('refresh', 24)}Trocar<br>veículo</button>
      <button class="qa" onclick="openCNHForm('${id}')">${icon('idCard', 24)}Atualizar<br>CNH</button>
      <button class="qa" onclick="pickAnexo('driver','${id}','drv-anexos')">${icon('filePlus', 24)}Adicionar<br>documento</button>
      <button class="qa" onclick="focarObsMotorista()">${icon('note', 24)}Registrar<br>observação</button>
    </div>

    <h2 class="sec-title">${icon('history', 14)} Histórico</h2>
    <div id="drv-timeline"><div class="empty-mini">Carregando…</div></div>

    <h2 class="sec-title">${icon('fileText', 14)} Documentos (frente e verso da CNH, exames…)</h2>
    ${alertaCNH}
    <div class="anexos-list" id="drv-anexos"></div>

    <h2 class="sec-title">${icon('note', 14)} Observações</h2>
    <label class="fld"><textarea id="drv-obs-inline" rows="3" placeholder="Anotações livres sobre este motorista…">${esc(d.observacoes || '')}</textarea></label>
    <button class="btn btn-small" style="margin-top:-6px" onclick="salvarObsMotorista('${id}')">Salvar observações</button>

    <h2 class="sec-title">${icon('sliders', 14)} Informações</h2>
    <div class="vd-grid">${info.map(([k, val]) => `<div class="vd-cell"><small>${k}</small><b>${esc(val)}</b></div>`).join('')}</div>
    ${van ? `<button class="btn btn-secondary btn-block" style="margin-bottom:8px" onclick="closeOverlay('modal-drv-detail');openVehDetail('${van.id}')">${icon('truck', 16)} Abrir Central da ${esc(van.nome)}</button>` : ''}
    <button class="btn btn-secondary btn-block" onclick="closeOverlay('modal-drv-detail');openDriverForm('${id}')">${icon('pencil', 16)} Editar dados do motorista</button>
  `;
  renderDrvTimeline(id);
  openOverlay('modal-drv-detail');
}

// linha do tempo do motorista: eventos + documentos anexados
async function renderDrvTimeline(did) {
  let eventos = [];
  try { eventos = (await eventosDe(did)).map(e => ({ ts: e.ts || 0, html: eventoHTML(e) })); } catch (e) {}
  const docs = await renderAnexosInto('drv-anexos', did, 'driver');
  docs.forEach(a => eventos.push({
    ts: a.ts || 0,
    html: `
      <button class="tx-item" onclick="openAnexoViewer('${a.id}')">
        <div class="tx-ico">${icon(a.mime === 'application/pdf' ? 'fileText' : 'image')}</div>
        <div class="tx-body">
          <div class="tx-title">Documento: ${esc(a.nome)}</div>
          <div class="tx-meta">${authorChip(a.autorNome)} · ${a.ts ? fmtDia(new Date(a.ts).toISOString().slice(0, 10)) : ''}</div>
        </div>
      </button>`,
  }));
  const el = $('drv-timeline');
  if (!el) return;
  eventos.sort((a, b) => b.ts - a.ts);
  el.innerHTML = eventos.length
    ? eventos.slice(0, 10).map(e => e.html).join('')
    : '<div class="empty-mini">Nenhum evento ainda.</div>';
}

// ── ações rápidas da Central do Motorista ──
let acaoDrvId = null;
function openTrocaVeiculo(did) {
  const d = S.drivers.find(x => x.id === did);
  if (!d) return;
  acaoDrvId = did;
  $('troca-info').textContent = d.nome + ' está ' + (d.veiculoId ? 'na ' + vehNome(d.veiculoId) : 'sem van no momento') + '.';
  $('troca-veiculo').innerHTML = '<option value="">— Nenhuma —</option>' +
    S.vehicles.filter(v => v.status !== 'inativo')
      .map(v => `<option value="${v.id}">${esc(v.nome)}${v.placa ? ' · ' + esc(v.placa) : ''}</option>`).join('');
  $('troca-veiculo').value = d.veiculoId || '';
  openOverlay('modal-troca');
}
async function salvarTrocaVeiculo() {
  const d = S.drivers.find(x => x.id === acaoDrvId);
  if (!d) return;
  const novo = $('troca-veiculo').value || '';
  closeOverlay('modal-troca');
  if ((d.veiculoId || '') === novo) { toast('Nada mudou.'); return; }
  try {
    await dataSet('drivers', d.id, { ...stripId(d), veiculoId: novo, atualizadoPorNome: me.nome || me.email, atualizadoEm: Date.now() });
    registrarTrocaEventos(d.id, d.nome, d.veiculoId || '', novo);
    toast('Veículo trocado ✓');
    closeOverlay('modal-drv-detail');
  } catch (e) { toast('Erro ao salvar.'); }
}
function openCNHForm(did) {
  const d = S.drivers.find(x => x.id === did);
  if (!d) return;
  acaoDrvId = did;
  $('cnh-cat').value = d.cnhCategoria || 'D';
  $('cnh-val').value = d.cnhValidade || '';
  openOverlay('modal-cnh');
}
async function salvarCNH() {
  const d = S.drivers.find(x => x.id === acaoDrvId);
  if (!d) return;
  const val = $('cnh-val').value || '';
  const cat = $('cnh-cat').value;
  closeOverlay('modal-cnh');
  try {
    await dataSet('drivers', d.id, { ...stripId(d), cnhCategoria: cat, cnhValidade: val, atualizadoPorNome: me.nome || me.email, atualizadoEm: Date.now() });
    logEvento('driver', d.id, 'idCard', 'CNH atualizada', 'categoria ' + cat + ', válida até ' + fmtData(val));
    toast('CNH atualizada ✓');
    closeOverlay('modal-drv-detail');
  } catch (e) { toast('Erro ao salvar.'); }
}
function focarObsMotorista() {
  const el = $('drv-obs-inline');
  if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus(); }
}
async function salvarObsMotorista(did) {
  const d = S.drivers.find(x => x.id === did);
  if (!d) return;
  const obs = $('drv-obs-inline').value.trim();
  try {
    await dataSet('drivers', did, { ...stripId(d), observacoes: obs });
    if (obs && obs !== (d.observacoes || '')) logEvento('driver', did, 'note', 'Observação registrada', obs.slice(0, 80));
    toast('Observações salvas ✓');
  } catch (e) { toast('Erro ao salvar.'); }
}

// foto do motorista
let drvFotoId = null;
function pickDrvFoto(did) {
  drvFotoId = did;
  $('drv-foto-input').click();
}
async function handleDrvFotoInput(input) {
  const file = input.files && input.files[0];
  input.value = '';
  const d = S.drivers.find(x => x.id === drvFotoId);
  if (!file || !d) return;
  try {
    const foto = await fileToSquareDataURL(file, 160);
    await dataSet('drivers', d.id, { ...stripId(d), foto });
    toast('Foto salva ✓');
    closeOverlay('modal-drv-detail');
  } catch (e) { toast('Não foi possível usar essa imagem.'); }
}

// ══════════════════════════════════════════
// AJUSTES (só conta e sistema)
// ══════════════════════════════════════════
function renderMais() {
  $('ajuste-nome-atual').textContent = me.nome || '—';
  $('ajuste-email-atual').textContent = me.email || '';
  const temFoto = !!myPhoto();
  $('ajuste-foto-atual').textContent = temFoto ? 'Toque para trocar a foto' : 'Sem foto — mostrando suas iniciais';
  $('btn-remover-foto').style.display = temFoto ? '' : 'none';
  $('theme-label').textContent = document.documentElement.dataset.theme === 'dark' ? 'Escuro' : 'Claro';
}

function changeMyPassword() {
  if (DEMO || !auth) { toast('Disponível só no modo real.'); return; }
  confirmDialog('Trocar senha', 'Enviar o link de troca de senha para o e-mail da empresa?', () => {
    auth.sendPasswordResetEmail(me.email)
      .then(() => toast('Link enviado! Abra o e-mail da empresa.'))
      .catch(() => toast('Não foi possível enviar agora.'));
  });
}

function togglePass(id, btn) {
  const inp = $(id);
  const mostrar = inp.type === 'password';
  inp.type = mostrar ? 'text' : 'password';
  btn.textContent = mostrar ? 'Esconder senha' : 'Mostrar senha';
}

function openDriverForm(idOrNull) {
  const d = typeof idOrNull === 'string' ? S.drivers.find(x => x.id === idOrNull) : null;
  editingDrvId = d ? d.id : null;
  $('driver-form-title').textContent = d ? 'Editar motorista' : 'Novo motorista';
  $('drv-nome').value = d ? d.nome : '';
  $('drv-tel').value = d ? (d.telefone || '') : '';
  $('drv-cnh-cat').value = d ? (d.cnhCategoria || 'D') : 'D';
  $('drv-cnh-val').value = d ? (d.cnhValidade || '') : '';
  $('drv-obs').value = d ? (d.observacoes || '') : '';
  // vínculo com veículo
  $('drv-veiculo').innerHTML = '<option value="">— Nenhum —</option>' +
    S.vehicles.filter(v => v.status !== 'inativo' || (d && d.veiculoId === v.id))
      .map(v => `<option value="${v.id}">${esc(v.nome)}${v.placa ? ' · ' + esc(v.placa) : ''}</option>`).join('');
  $('drv-veiculo').value = d ? (d.veiculoId || '') : '';
  $('drv-status').value = d ? (d.status || 'ativo') : 'ativo';
  $('drv-del-btn').style.display = d ? '' : 'none';
  openOverlay('modal-driver');
}

async function saveDriver() {
  const nome = $('drv-nome').value.trim();
  if (!nome) { toast('Digite o nome do motorista.'); return; }
  const origD = editingDrvId ? S.drivers.find(x => x.id === editingDrvId) : null;
  const d = {
    nome,
    telefone: $('drv-tel').value.trim(),
    cnhCategoria: $('drv-cnh-cat').value,
    cnhValidade: $('drv-cnh-val').value || '',
    veiculoId: $('drv-veiculo').value || '',
    status: $('drv-status').value,
    observacoes: $('drv-obs').value.trim(),
    foto: origD?.foto || '',
    criadoEm: origD?.criadoEm || Date.now(),
    criadoPorNome: origD?.criadoPorNome || me.nome || me.email,
    atualizadoPorNome: me.nome || me.email,
    atualizadoEm: Date.now(),
  };
  const id = editingDrvId || newId();
  closeOverlay('modal-driver');
  try {
    await dataSet('drivers', id, d);
    // eventos do histórico
    if (!origD) {
      logEvento('driver', id, 'user', 'Entrada na empresa', d.nome + ' cadastrado');
      if (d.veiculoId) registrarTrocaEventos(id, d.nome, '', d.veiculoId);
    } else {
      if ((origD.veiculoId || '') !== d.veiculoId) registrarTrocaEventos(id, d.nome, origD.veiculoId || '', d.veiculoId);
      if ((origD.cnhValidade || '') !== d.cnhValidade) logEvento('driver', id, 'idCard', 'CNH atualizada', 'válida até ' + fmtData(d.cnhValidade));
    }
    toast(editingDrvId ? 'Motorista atualizado ✓' : 'Motorista adicionado ✓');
  } catch (e) { toast('Erro ao salvar.'); }
  editingDrvId = null;
}

// eventos gerados por uma troca de veículo (no motorista e nas vans)
function registrarTrocaEventos(did, nome, oldVid, newVid) {
  const de = oldVid ? vehNome(oldVid) : 'nenhuma van';
  const para = newVid ? vehNome(newVid) : 'nenhuma van';
  logEvento('driver', did, 'refresh', 'Troca de veículo', de + ' → ' + para);
  if (oldVid) logEvento('vehicle', oldVid, 'user', nome + ' deixou esta van', '');
  if (newVid) logEvento('vehicle', newVid, 'user', nome + ' assumiu esta van', '');
}

function deleteDriverFromForm() {
  const id = editingDrvId;
  confirmDialog('Excluir motorista', 'Excluir este motorista do cadastro?', async () => {
    closeOverlay('modal-driver');
    try { await dataDelete('drivers', id); toast('Motorista excluído'); }
    catch (e) { toast('Erro ao excluir.'); }
  });
}

// ══════════════════════════════════════════
// RESUMO DO MÊS EM IMAGEM (formato stories 1080×1920)
// ══════════════════════════════════════════
function loadImg(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}

async function buildResumoCanvas() {
  const W = 1080, H = 1920;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');

  // fundo azul-marinho com brilho verde
  const bg = x.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#101f3d'); bg.addColorStop(1, '#0b1220');
  x.fillStyle = bg; x.fillRect(0, 0, W, H);
  const glow = x.createRadialGradient(W / 2, 0, 0, W / 2, 0, 900);
  glow.addColorStop(0, 'rgba(63,174,76,0.14)'); glow.addColorStop(1, 'rgba(63,174,76,0)');
  x.fillStyle = glow; x.fillRect(0, 0, W, H);

  // logo + marca
  try { x.drawImage(await loadImg('icon-192.png'), 80, 90, 120, 120); } catch (e) {}
  x.fillStyle = '#f4f7fb'; x.font = 'italic 800 68px system-ui,sans-serif';
  x.textAlign = 'left'; x.fillText('LAGOS', 228, 168);
  x.fillStyle = 'rgba(244,247,251,0.5)'; x.font = '500 30px system-ui,sans-serif';
  x.fillText('Serviços de Transporte', 230, 210);

  // mês
  const mLabel = monthLabel(0);
  x.fillStyle = 'rgba(244,247,251,0.45)'; x.font = '600 34px system-ui,sans-serif';
  x.fillText(mLabel.toUpperCase(), 80, 330);

  const txs = txDoMes(0);
  const inc = txs.filter(t => t.tipo === 'receita').reduce((s, t) => s + t.valor, 0);
  const exp = txs.filter(t => t.tipo === 'despesa').reduce((s, t) => s + t.valor, 0);
  const liq = inc - exp;

  // resultado
  x.fillStyle = liq >= 0 ? '#4ade80' : '#f87171';
  x.font = 'bold 110px system-ui,sans-serif';
  x.fillText(R(liq), 80, 460);
  x.fillStyle = 'rgba(244,247,251,0.45)'; x.font = '500 32px system-ui,sans-serif';
  x.fillText('Resultado do mês', 80, 512);

  // receitas / despesas
  x.fillStyle = '#4ade80'; x.font = 'bold 54px system-ui,sans-serif';
  x.fillText('▲ ' + R(inc), 80, 620);
  x.fillStyle = 'rgba(244,247,251,0.4)'; x.font = '500 28px system-ui,sans-serif';
  x.fillText('Receitas', 80, 662);
  x.fillStyle = '#f87171'; x.font = 'bold 54px system-ui,sans-serif';
  x.fillText('▼ ' + R(exp), 560, 620);
  x.fillStyle = 'rgba(244,247,251,0.4)'; x.font = '500 28px system-ui,sans-serif';
  x.fillText('Despesas', 560, 662);

  x.fillStyle = 'rgba(255,255,255,0.08)'; x.fillRect(80, 715, W - 160, 2);

  // gráfico: despesas por categoria (top 5)
  const porCat = {};
  txs.filter(t => t.tipo === 'despesa').forEach(t => { porCat[t.cat] = (porCat[t.cat] || 0) + t.valor; });
  const cats = Object.entries(porCat).sort((a, b) => b[1] - a[1]).slice(0, 5);
  let y = 790;
  x.fillStyle = 'rgba(244,247,251,0.45)'; x.font = '600 32px system-ui,sans-serif';
  x.fillText('DESPESAS POR CATEGORIA', 80, y);
  y += 60;
  const maxCat = cats.length ? cats[0][1] : 1;
  cats.forEach(([cat, val]) => {
    const info = catInfo(cat);
    x.fillStyle = '#f4f7fb'; x.font = '600 34px system-ui,sans-serif';
    x.fillText(info.nome, 80, y);
    x.textAlign = 'right'; x.fillText(R(val), W - 80, y);
    x.textAlign = 'left';
    const bw = Math.max(14, (W - 160) * (val / maxCat));
    x.fillStyle = 'rgba(255,255,255,0.08)';
    roundRect(x, 80, y + 18, W - 160, 20, 10); x.fill();
    const bar = x.createLinearGradient(80, 0, 80 + bw, 0);
    bar.addColorStop(0, '#2e8b3d'); bar.addColorStop(1, '#4ade80');
    x.fillStyle = bar;
    roundRect(x, 80, y + 18, bw, 20, 10); x.fill();
    y += 108;
  });
  if (!cats.length) { x.fillStyle = 'rgba(244,247,251,0.4)'; x.font = '500 32px system-ui,sans-serif'; x.fillText('Nenhuma despesa lançada.', 80, y); y += 80; }

  // custo por veículo (top 3)
  const porVeh = {};
  txs.filter(t => t.tipo === 'despesa' && t.veiculo).forEach(t => { porVeh[t.veiculo] = (porVeh[t.veiculo] || 0) + t.valor; });
  const vehs = Object.entries(porVeh).sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (vehs.length) {
    y += 30;
    x.fillStyle = 'rgba(255,255,255,0.08)'; x.fillRect(80, y - 60, W - 160, 2);
    x.fillStyle = 'rgba(244,247,251,0.45)'; x.font = '600 32px system-ui,sans-serif';
    x.fillText('CUSTO POR VEÍCULO', 80, y);
    y += 62;
    vehs.forEach(([vid, val]) => {
      const rodou = vehById(vid) ? kmRodadoMes(vid) : 0;
      x.fillStyle = '#f4f7fb'; x.font = '600 36px system-ui,sans-serif';
      x.fillText(vehNome(vid), 80, y);
      x.textAlign = 'right';
      x.fillText(R(val) + (rodou ? '  ·  ' + fmtKm(rodou) : ''), W - 80, y);
      x.textAlign = 'left';
      y += 72;
    });
  }

  // rodapé
  x.fillStyle = 'rgba(244,247,251,0.22)'; x.font = '500 28px system-ui,sans-serif';
  x.fillText('Lagos Serviços de Transporte', 80, H - 70);
  return c;
}
function roundRect(x, px, py, pw, ph, pr) {
  x.beginPath();
  x.moveTo(px + pr, py);
  x.arcTo(px + pw, py, px + pw, py + ph, pr);
  x.arcTo(px + pw, py + ph, px, py + ph, pr);
  x.arcTo(px, py + ph, px, py, pr);
  x.arcTo(px, py, px + pw, py, pr);
  x.closePath();
}

async function shareResumoMes() {
  toast('Gerando imagem…');
  const c = await buildResumoCanvas();
  c.toBlob(blob => {
    const file = new File([blob], 'lagos-resumo.png', { type: 'image/png' });
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: 'Lagos — ' + monthLabel(0) }).catch(() => {});
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'lagos-resumo.png';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }, 'image/png');
}

// ══════════════════════════════════════════
// IMPORTAR NOTA DE ABASTECIMENTO (PDF/foto + OCR)
// A leitura roda no próprio aparelho; nada é enviado a terceiros.
// ══════════════════════════════════════════
async function ensureTesseract() {
  if (window.Tesseract) return;
  await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');
}
async function ensurePdfjs() {
  if (window.pdfjsLib) return;
  await loadScript('https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js');
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
}
async function pdfPrimeiraPagina(file) {
  await ensurePdfjs();
  const buf = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
  const page = await pdf.getPage(1);
  const vp = page.getViewport({ scale: 2 });
  const c = document.createElement('canvas');
  c.width = vp.width; c.height = vp.height;
  await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
  return c.toDataURL('image/jpeg', 0.85);
}
async function ocrTexto(dataUrl) {
  await ensureTesseract();
  const worker = await window.Tesseract.createWorker('por');
  const { data } = await worker.recognize(dataUrl);
  await worker.terminate();
  return data.text || '';
}

// extrai valor, litros, data e placa do texto da nota
function parseNota(txt) {
  const t = txt.toUpperCase();
  const out = {};
  const pm = t.match(/[A-Z]{3}\s?-?\s?\d[A-Z0-9]\d{2}/);
  if (pm) out.placa = pm[0].replace(/[\s-]/g, '');
  const lm = t.match(/(\d{1,3}[.,]\d{1,3})\s*(?:L\b|LT\b|LTS\b|LITROS?)/);
  if (lm) out.litros = parseValor(lm[1]);
  const dm = t.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (dm) out.data = `${dm[3]}-${dm[2]}-${dm[1]}`;
  const vm = t.match(/(?:TOTAL|VALOR)[^0-9]{0,25}(\d{1,3}(?:\.\d{3})*,\d{2})/);
  if (vm) out.valor = parseValor(vm[1]);
  else {
    const todos = [...t.matchAll(/(\d{1,3}(?:\.\d{3})*,\d{2})/g)].map(m => parseValor(m[1])).filter(v => v > 5);
    if (todos.length) out.valor = Math.max(...todos);
  }
  return out;
}

// Anexa a nota ao lançamento ABERTO e usa a leitura só pra preencher campos vazios
async function importNota(input) {
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  const formAberto = $('modal-tx').classList.contains('open');
  if (!formAberto) openTxForm();
  toast('Lendo a nota… pode levar alguns segundos');
  let imagem = null, texto = '', anexo = null;
  try {
    if (file.type === 'application/pdf') {
      imagem = await pdfPrimeiraPagina(file);
      const raw = await fileToRawDataURL(file);
      anexo = raw.length <= 950000
        ? { nome: file.name || 'nota.pdf', mime: 'application/pdf', data: raw }
        : { nome: (file.name || 'nota') + '.jpg', mime: 'image/jpeg', data: imagem };
    } else {
      imagem = await fileToJpegDataURL(file, 1600);
      anexo = { nome: file.name || 'nota.jpg', mime: 'image/jpeg', data: await fileToJpegDataURL(file, 1200) };
    }
  } catch (e) {
    console.error(e);
    toast('Não consegui abrir esse arquivo.');
    return;
  }
  pendingAnexo = anexo;
  $('tx-anexo-chip').style.display = '';
  try {
    texto = await Promise.race([
      ocrTexto(imagem),
      new Promise((_, rej) => setTimeout(() => rej(new Error('tempo esgotado')), 25000)),
    ]);
  } catch (e) { console.error('OCR indisponível', e); }
  const info = texto ? parseNota(texto) : {};

  // preenche APENAS o que o usuário ainda não preencheu
  if (txTipo === 'despesa' && !txCat && info.litros) pickCat('combustivel');
  if (info.valor && !parseValor($('tx-valor').value)) {
    $('tx-valor').value = info.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  }
  if (txCat === 'combustivel' && info.litros && !parseValor($('tx-litros').value)) {
    $('tx-litros').value = String(info.litros).replace('.', ',');
  }
  if (info.data) $('tx-data').value = info.data;
  if (info.placa && !$('tx-veiculo').value) {
    const v = S.vehicles.find(x => (x.placa || '').replace(/-/g, '') === info.placa);
    if (v) $('tx-veiculo').value = v.id;
  }
  updateFuelExtra();
  updateFuelHint();
  const leu = info.valor || info.litros || info.placa;
  toast(leu ? 'Nota lida! Confere e salva.' : 'Nota anexada — preencha os campos normalmente');
}

// ══════════════════════════════════════════
// EXPORTAR CSV
// ══════════════════════════════════════════
function exportCSV() {
  if (!S.tx.length) { toast('Nada para exportar ainda.'); return; }
  const head = ['Data', 'Tipo', 'Origem', 'Categoria', 'Veículo', 'Descrição', 'Valor (R$)', 'Litros', 'Km', 'Lançado por'];
  const lines = [...S.tx].sort((a, b) => (a.data || '').localeCompare(b.data || ''))
    .map(t => [
      fmtData(t.data),
      t.tipo === 'receita' ? 'Receita' : 'Despesa',
      t.tipo === 'despesa' ? (origemDe(t) === 'escritorio' ? 'Escritório' : 'Frota') : '',
      catInfo(t.cat).nome,
      t.veiculo ? vehNome(t.veiculo) : '',
      (t.desc || '').replace(/;/g, ','),
      t.valor.toFixed(2).replace('.', ','),
      t.litros ? String(t.litros).replace('.', ',') : '',
      t.km || '',
      t.autorNome || '',
    ].join(';'));
  const csv = '\ufeff' + head.join(';') + '\n' + lines.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'lagos-lancamentos.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  toast('CSV exportado ✓');
}

// ══════════════════════════════════════════
// TEMA
// ══════════════════════════════════════════
// Tema padrão é o CLARO (identidade da marca); escuro é opcional
function applyTheme(theme) {
  if (theme === 'dark') document.documentElement.dataset.theme = 'dark';
  else delete document.documentElement.dataset.theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#0b1220' : '#f4f7fb');
}
function initTheme() {
  applyTheme(localStorage.getItem('lagos_theme') === 'dark' ? 'dark' : 'light');
}
function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('lagos_theme', next);
  applyTheme(next);
  renderMais();
}

// ══════════════════════════════════════════
// DADOS DE EXEMPLO (modo demo)
// ══════════════════════════════════════════
function seedDemo() {
  const hoje = new Date();
  const dstr = (diasAtras) => {
    const d = new Date(hoje); d.setDate(d.getDate() - diasAtras);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };
  const dfut = (dias) => {
    const d = new Date(hoje); d.setDate(d.getDate() + dias);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };
  const v1 = newId(), v2 = newId();
  S.vehicles = [
    { id: v1, nome: 'Van 01', placa: 'ABC1D23', modelo: 'Fiat Ducato', ano: '2019', km: 148300, oleoUltimaKm: 139500, oleoIntervalo: 10000, licenciamento: dfut(22), seguro: dfut(120), status: 'ativo' },
    { id: v2, nome: 'Van 02', placa: 'DEF4G56', modelo: 'Mercedes Sprinter 415', ano: '2021', km: 96650, oleoUltimaKm: 95800, oleoIntervalo: 10000, licenciamento: dfut(200), seguro: dfut(45), status: 'ativo' },
  ];
  S.kmlog = [
    { id: newId(), veiculo: v2, km: 96650, data: dstr(0), autorNome: 'Você', autorUid: 'demo', ts: Date.now() },
    { id: newId(), veiculo: v1, km: 145700, data: dstr(36), autorNome: 'Sócio 2', autorUid: 'demo', ts: Date.now() - 36 * 86400000 },
  ];
  const d1 = newId(), d2 = newId();
  S.drivers = [
    { id: d1, nome: 'Carlos Silva', telefone: '(24) 99999-1111', cnhCategoria: 'D', cnhValidade: dfut(400), veiculoId: v1, status: 'ativo' },
    { id: d2, nome: 'Roberto Souza', telefone: '(24) 99999-2222', cnhCategoria: 'D', cnhValidade: dfut(18), veiculoId: v2, status: 'ativo' },
  ];
  S.eventos = [
    { id: newId(), parentTipo: 'driver', parentId: d1, ico: 'refresh', titulo: 'Troca de veículo', detalhe: 'Van 02 → Van 01', autorNome: 'Sócio 2', ts: Date.now() - 30 * 60000 },
    { id: newId(), parentTipo: 'vehicle', parentId: v2, ico: 'paperclip', titulo: 'Documento anexado', detalhe: 'seguro-van02.pdf', autorNome: 'Você', ts: Date.now() - 90 * 60000, doc: true },
    { id: newId(), parentTipo: 'driver', parentId: d2, ico: 'idCard', titulo: 'CNH atualizada', detalhe: 'categoria D', autorNome: 'Sócio 3', ts: Date.now() - 6 * 86400000 },
  ];
  const autores = ['Você', 'Sócio 2', 'Sócio 3'];
  const mk = (t) => ({ ...t, id: newId(), autorUid: 'demo', ts: Date.now() - Math.random() * 1e7 });
  S.tx = [
    mk({ tipo: 'receita', cat: 'contrato', valor: 14500, data: dstr(2), veiculo: '', desc: 'Repasse mensal — transporte escolar', autorNome: autores[0], litros: 0, km: 0 }),
    mk({ tipo: 'despesa', cat: 'combustivel', valor: 420.50, data: dstr(1), veiculo: v1, desc: '', litros: 70, km: 148300, autorNome: autores[1] }),
    mk({ tipo: 'despesa', cat: 'combustivel', valor: 405.00, data: dstr(6), veiculo: v1, desc: '', litros: 68, km: 147620, autorNome: autores[0] }),
    mk({ tipo: 'despesa', cat: 'combustivel', valor: 398.00, data: dstr(11), veiculo: v1, desc: '', litros: 66, km: 146900, autorNome: autores[2] }),
    mk({ tipo: 'despesa', cat: 'combustivel', valor: 380.00, data: dstr(3), veiculo: v2, desc: '', litros: 62, km: 96400, autorNome: autores[1] }),
    mk({ tipo: 'despesa', cat: 'combustivel', valor: 372.00, data: dstr(9), veiculo: v2, desc: '', litros: 60, km: 95780, autorNome: autores[2] }),
    mk({ tipo: 'despesa', cat: 'manutencao', valor: 850, data: dstr(4), veiculo: v2, desc: 'Pastilhas de freio + revisão', litros: 0, km: 0, autorNome: autores[0] }),
    mk({ tipo: 'despesa', cat: 'pneus', valor: 1240, data: dstr(15), veiculo: v1, desc: '2 pneus dianteiros', litros: 0, km: 0, autorNome: autores[1] }),
    mk({ tipo: 'despesa', cat: 'salarios', valor: 3200, data: dstr(5), veiculo: '', desc: 'Diárias dos motoristas', litros: 0, km: 0, autorNome: autores[0] }),
    mk({ tipo: 'despesa', cat: 'documentos', valor: 310, data: dstr(12), veiculo: v2, desc: 'Licenciamento anual', litros: 0, km: 0, autorNome: autores[2] }),
    mk({ tipo: 'despesa', cat: 'outros', valor: 90, data: dstr(7), veiculo: v1, desc: 'Lavagem completa', litros: 0, km: 0, autorNome: autores[1] }),
    mk({ tipo: 'receita', cat: 'frete', valor: 900, data: dstr(8), veiculo: v2, desc: 'Fretamento fim de semana', litros: 0, km: 0, autorNome: autores[2] }),
    mk({ tipo: 'despesa', cat: 'aluguel', origem: 'escritorio', valor: 1500, data: dstr(6), veiculo: '', desc: 'Aluguel da sala', litros: 0, km: 0, autorNome: autores[0] }),
    mk({ tipo: 'despesa', cat: 'contabilidade', origem: 'escritorio', valor: 480, data: dstr(10), veiculo: '', desc: 'Honorários do contador', litros: 0, km: 0, autorNome: autores[2] }),
    mk({ tipo: 'despesa', cat: 'contas', origem: 'escritorio', valor: 260, data: dstr(13), veiculo: '', desc: 'Luz + internet', litros: 0, km: 0, autorNome: autores[1] }),
    mk({ tipo: 'despesa', cat: 'combustivel', valor: 410, data: dstr(33), veiculo: v1, desc: '', litros: 69, km: 145900, autorNome: autores[0] }),
    mk({ tipo: 'receita', cat: 'contrato', valor: 14500, data: dstr(32), veiculo: '', desc: 'Repasse mensal — transporte escolar', autorNome: autores[0], litros: 0, km: 0 }),
    mk({ tipo: 'despesa', cat: 'seguro', valor: 780, data: dstr(35), veiculo: v2, desc: 'Parcela do seguro', litros: 0, km: 0, autorNome: autores[1] }),
  ];
  demoSave();
}

// ══════════════════════════════════════════
// BOOT
// ══════════════════════════════════════════
// migra chaves antigas do armazenamento (versões iniciais usavam prefixo gdfrota_)
[
  ['gdfrota_demo_v1', 'lagos_demo_v1'],
  ['gdfrota_demo_active', 'lagos_demo_active'],
  ['gdfrota_demo_nome', 'lagos_demo_nome'],
  ['gdfrota_theme', 'lagos_theme'],
].forEach(([antiga, nova]) => {
  try {
    const val = localStorage.getItem(antiga);
    if (val !== null && localStorage.getItem(nova) === null) localStorage.setItem(nova, val);
    if (val !== null) localStorage.removeItem(antiga);
  } catch (e) {}
});

document.addEventListener('input', e => {
  if (e.target.id === 'tx-litros' || e.target.id === 'tx-valor') updateFuelHint();
});
document.addEventListener('change', e => {
  if (e.target.id === 'tx-veiculo') updateFuelHint();
  if (e.target.id === 'foto-input') handleFotoInput(e.target);
  if (e.target.id === 'anexo-input') handleAnexoInput(e.target);
  if (e.target.id === 'veh-foto-input') handleVehFotoInput(e.target);
  if (e.target.id === 'drv-foto-input') handleDrvFotoInput(e.target);
  if (e.target.id === 'nota-input') importNota(e.target);
});

// Enter no login envia o formulário
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || DEMO) return;
  if (e.target.id === 'login-pass' || e.target.id === 'login-email') doLogin();
  if (e.target.id === 'lp-pass') profileLogin();
});

// ícones dos elementos estáticos do HTML
injetarIcones();

// fechar overlay tocando fora
document.querySelectorAll('.overlay').forEach(ov => {
  ov.addEventListener('click', e => { if (e.target === ov) ov.classList.remove('open'); });
});

// Auto-atualização: busca versão nova ao abrir e recarrega quando ela chega,
// evitando aparelhos presos em versões antigas do app instalado
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then(reg => {
      reg.update().catch(() => {});
      setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
    }).catch(() => {});
    const tinhaVersaoAntiga = !!navigator.serviceWorker.controller;
    let recarregou = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!tinhaVersaoAntiga || recarregou) return;
      recarregou = true;
      location.reload();
    });
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      navigator.serviceWorker.getRegistration().then(r => r && r.update().catch(() => {}));
    }
  });
}

initApp();
