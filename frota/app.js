// ══════════════════════════════════════════
// LAGOS SERVIÇOS DE TRANSPORTE — Gestão de Frota
// PWA + Firebase (Auth e-mail/senha + Firestore compartilhado)
// Enquanto o Firebase não é configurado, roda em MODO DEMO (localStorage).
// ══════════════════════════════════════════

const firebaseConfig = {
  apiKey: "COLE_AQUI",            // ← preencher seguindo o SETUP.md
  authDomain: "COLE_AQUI",
  projectId: "COLE_AQUI",
  storageBucket: "COLE_AQUI",
  messagingSenderId: "COLE_AQUI",
  appId: "COLE_AQUI"
};

const DEMO = firebaseConfig.apiKey === 'COLE_AQUI';
const LS_KEY = 'lagos_demo_v1';

let auth = null, db = null;
let me = null; // { uid, email, nome }

// Estado compartilhado (espelho do Firestore ou do localStorage no demo)
let S = { vehicles: [], drivers: [], tx: [], kmlog: [], profiles: {} };
let unsubs = [];

// Estado de UI
let monthOffset = 0;
let lancFilter = 'todos';
let txTipo = 'despesa', txCat = null;
let editingTxId = null, detailTxId = null;
let editingVehId = null, detailVehId = null;
let editingDrvId = null;

// ══════════════════════════════════════════
// CATEGORIAS
// ══════════════════════════════════════════
const CATS = {
  despesa: [
    { id: 'combustivel', nome: 'Combustível', ico: '⛽' },
    { id: 'manutencao',  nome: 'Manutenção',  ico: '🔧' },
    { id: 'pneus',       nome: 'Pneus',       ico: '🛞' },
    { id: 'pedagio',     nome: 'Pedágio',     ico: '🛣️' },
    { id: 'documentos',  nome: 'Documentos',  ico: '📄' },
    { id: 'seguro',      nome: 'Seguro',      ico: '🛡️' },
    { id: 'salarios',    nome: 'Salários',    ico: '👥' },
    { id: 'outros',      nome: 'Outros',      ico: '📦' },
  ],
  receita: [
    { id: 'contrato',  nome: 'Prefeitura',   ico: '🏛️' },
    { id: 'frete',     nome: 'Frete extra',  ico: '🚐' },
    { id: 'outros_r',  nome: 'Outros',       ico: '💰' },
  ]
};
function catInfo(id) {
  return CATS.despesa.find(c => c.id === id) || CATS.receita.find(c => c.id === id) || { id, nome: 'Outros', ico: '📦' };
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
function authorChip(nome) {
  const n = String(nome || '?');
  return `<span class="tx-author"><span class="au-dot" style="background:${authorColor(n)}">${esc(n[0].toUpperCase())}</span>${esc(n.split(' ')[0])}</span>`;
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
  ['vehicles', 'drivers', 'tx', 'kmlog'].forEach(coll => {
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
    $('login-form').style.display = 'none';
    $('login-demo').style.display = '';
    if (localStorage.getItem('lagos_demo_active')) enterDemo(true);
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

function doLogin() {
  const email = $('login-email').value.trim();
  const pass = $('login-pass').value;
  if (!email || !pass) { loginError('Preencha e-mail e senha.'); return; }
  $('login-err').style.display = 'none';
  $('btn-login').disabled = true;
  $('btn-login').textContent = 'Entrando…';
  auth.signInWithEmailAndPassword(email, pass)
    .catch(err => {
      const map = {
        'auth/invalid-credential': 'E-mail ou senha incorretos.',
        'auth/wrong-password': 'E-mail ou senha incorretos.',
        'auth/user-not-found': 'Este e-mail não tem acesso ao sistema.',
        'auth/invalid-email': 'E-mail inválido.',
        'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos.',
        'auth/network-request-failed': 'Sem conexão. Verifique a internet.',
      };
      loginError(map[err.code] || 'Erro ao entrar: ' + err.message);
    })
    .finally(() => {
      $('btn-login').disabled = false;
      $('btn-login').textContent = 'Entrar';
    });
}

function forgotPassword() {
  const email = $('login-email').value.trim();
  if (!email) { loginError('Digite seu e-mail acima e toque em "Esqueci minha senha".'); return; }
  auth.sendPasswordResetEmail(email)
    .then(() => toast('📧 Enviamos um link de redefinição para ' + email))
    .catch(() => loginError('Não foi possível enviar. Confira o e-mail digitado.'));
}

function enterDemo(silent) {
  localStorage.setItem('lagos_demo_active', '1');
  me = { uid: 'demo', email: 'demo@lagos.app', nome: localStorage.getItem('lagos_demo_nome') || 'Você' };
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
  toast('Nome salvo 👍');
}

// ══════════════════════════════════════════
// NAVEGAÇÃO
// ══════════════════════════════════════════
function goTab(tab) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  $('page-' + tab).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('nav-on', b.dataset.tab === tab));
  $('fab').style.display = (tab === 'inicio' || tab === 'lanc') ? '' : 'none';
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
  $('inicio-greeting').textContent = sauda + (nome ? ', ' + nome : '') + ' 👋';
  $('inicio-date').textContent = capFirst(new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }));
  $('avatar-initial').textContent = (me.nome || me.email || '?')[0].toUpperCase();
  $('btn-avatar').style.background = authorColor(me.nome || me.email);

  const txs = txDoMes(0);
  const inc = txs.filter(t => t.tipo === 'receita').reduce((s, t) => s + t.valor, 0);
  const exp = txs.filter(t => t.tipo === 'despesa').reduce((s, t) => s + t.valor, 0);
  const liq = inc - exp;
  $('hero-month').textContent = monthLabel(0);
  $('hero-liq').textContent = R(liq);
  $('hero-inc').textContent = R(inc);
  $('hero-exp').textContent = R(exp);
  $('hero-inicio').className = 'hero-card' + (liq < 0 ? ' neg' : '');

  renderAlerts();
  renderCatBreakdown(txs);
  renderVehBreakdown(txs);
  renderRecent();
}

function computeAlerts() {
  const alerts = [];
  S.vehicles.forEach(v => {
    if (v.status === 'inativo') return;
    [['licenciamento', 'Licenciamento', '📄'], ['seguro', 'Seguro', '🛡️']].forEach(([campo, label, ico]) => {
      const dias = diasAte(v[campo]);
      if (dias === null) return;
      if (dias < 0) alerts.push({ crit: true, ico, txt: `${label} da ${v.nome} VENCIDO`, sub: `venceu em ${fmtData(v[campo])}` });
      else if (dias <= 30) alerts.push({ crit: dias <= 7, ico, txt: `${label} da ${v.nome} vence em ${dias} dia${dias === 1 ? '' : 's'}`, sub: fmtData(v[campo]) });
    });
    const intervalo = Number(v.oleoIntervalo) || 0;
    const ultima = Number(v.oleoUltimaKm) || 0;
    if (intervalo > 0 && ultima > 0 && v.km > 0) {
      const rodou = v.km - ultima;
      if (rodou >= intervalo) alerts.push({ crit: true, ico: '🛢️', txt: `Troca de óleo da ${v.nome} atrasada`, sub: `rodou ${fmtKm(rodou)} desde a última troca (limite ${fmtKm(intervalo)})` });
      else if (rodou >= intervalo - 1000) alerts.push({ crit: false, ico: '🛢️', txt: `Troca de óleo da ${v.nome} se aproximando`, sub: `faltam ${fmtKm(intervalo - rodou)}` });
    }
  });
  S.drivers.forEach(d => {
    const dias = diasAte(d.cnhValidade);
    if (dias === null) return;
    if (dias < 0) alerts.push({ crit: true, ico: '🪪', txt: `CNH de ${d.nome} VENCIDA`, sub: `venceu em ${fmtData(d.cnhValidade)}` });
    else if (dias <= 30) alerts.push({ crit: dias <= 7, ico: '🪪', txt: `CNH de ${d.nome} vence em ${dias} dia${dias === 1 ? '' : 's'}`, sub: fmtData(d.cnhValidade) });
  });
  return alerts.sort((a, b) => (b.crit ? 1 : 0) - (a.crit ? 1 : 0));
}

function renderAlerts() {
  const alerts = computeAlerts();
  $('alert-section').style.display = alerts.length ? '' : 'none';
  $('alert-list').innerHTML = alerts.map(a => `
    <div class="alert-item${a.crit ? ' crit' : ''}">
      <span class="a-ico">${a.ico}</span>
      <div><b>${esc(a.txt)}</b><small>${esc(a.sub)}</small></div>
    </div>`).join('');
}

function renderCatBreakdown(txs) {
  const el = $('cat-breakdown');
  const desp = txs.filter(t => t.tipo === 'despesa');
  if (!desp.length) { el.innerHTML = '<div class="empty-mini">Nenhuma despesa lançada neste mês.</div>'; return; }
  const porCat = {};
  desp.forEach(t => { porCat[t.cat] = (porCat[t.cat] || 0) + t.valor; });
  const total = desp.reduce((s, t) => s + t.valor, 0);
  const rows = Object.entries(porCat).sort((a, b) => b[1] - a[1]).map(([cat, val]) => {
    const c = catInfo(cat);
    const pct = Math.round(val / total * 100);
    return `
      <div class="cat-row">
        <div class="c-ico">${c.ico}</div>
        <div class="c-body">
          <div class="c-top"><b>${c.nome}</b><span class="c-val">${R(val)} <small>· ${pct}%</small></span></div>
          <div class="c-bar"><div class="c-bar-fill" style="width:${pct}%"></div></div>
        </div>
      </div>`;
  });
  el.innerHTML = rows.join('');
}

function renderVehBreakdown(txs) {
  const el = $('veh-breakdown');
  const desp = txs.filter(t => t.tipo === 'despesa' && t.veiculo);
  if (!desp.length) { el.innerHTML = '<div class="empty-mini">Nenhuma despesa vinculada a veículos.</div>'; return; }
  const porVeh = {};
  desp.forEach(t => { porVeh[t.veiculo] = (porVeh[t.veiculo] || 0) + t.valor; });
  const max = Math.max(...Object.values(porVeh));
  const rows = Object.entries(porVeh).sort((a, b) => b[1] - a[1]).map(([vid, val]) => {
    const pct = Math.round(val / max * 100);
    const rodou = vehById(vid) ? kmRodadoMes(vid) : 0;
    return `
      <div class="cat-row">
        <div class="c-ico">🚐</div>
        <div class="c-body">
          <div class="c-top"><b>${esc(vehNome(vid))}</b><span class="c-val">${R(val)}${rodou ? ' <small>· ' + fmtKm(rodou) + '</small>' : ''}</span></div>
          <div class="c-bar"><div class="c-bar-fill" style="width:${pct}%"></div></div>
        </div>
      </div>`;
  });
  el.innerHTML = rows.join('');
}

function renderRecent() {
  const el = $('recent-list');
  const txs = [...S.tx].sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 5);
  if (!txs.length) {
    el.innerHTML = '<div class="empty-big"><span class="e-ico">🧾</span>Nenhum lançamento ainda.<br>Toque no botão <b>+</b> para registrar o primeiro gasto ou receita.</div>';
    return;
  }
  el.innerHTML = txs.map(txItemHTML).join('');
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
  if (vnome) partes.push(esc(vnome));
  if (t.cat === 'combustivel' && t.litros) partes.push(t.litros.toLocaleString('pt-BR') + ' L');
  if (t.desc) partes.push(esc(t.desc));
  const meta = `${authorChip(t.autorNome)}${partes.length ? ' · ' + partes.join(' · ') : ''}`;
  return `
    <button class="tx-item" onclick="openTxDetail('${t.id}')">
      <div class="tx-ico">${c.ico}</div>
      <div class="tx-body">
        <div class="tx-title">${c.nome}</div>
        <div class="tx-meta">${meta}</div>
      </div>
      <div class="tx-val ${t.tipo === 'receita' ? 'pos' : 'neg'}">${t.tipo === 'receita' ? '+' : '−'} ${R(t.valor)}</div>
    </button>`;
}

function renderLanc() {
  $('lanc-month-label').textContent = monthLabel(monthOffset);

  // popula filtro de veículos
  const sel = $('lanc-veh-filter');
  const cur = sel.value;
  sel.innerHTML = '<option value="">Todos os veículos</option>' +
    S.vehicles.map(v => `<option value="${v.id}">${esc(v.nome)}</option>`).join('');
  sel.value = cur;

  let txs = txDoMes(monthOffset);
  const inc = txs.filter(t => t.tipo === 'receita').reduce((s, t) => s + t.valor, 0);
  const exp = txs.filter(t => t.tipo === 'despesa').reduce((s, t) => s + t.valor, 0);
  $('lanc-sum-inc').textContent = R(inc);
  $('lanc-sum-exp').textContent = R(exp);
  $('lanc-sum-liq').textContent = '= ' + R(inc - exp);
  $('lanc-sum-liq').style.color = inc - exp < 0 ? 'var(--neg)' : 'var(--pos)';

  if (lancFilter !== 'todos') txs = txs.filter(t => t.tipo === lancFilter);
  if (sel.value) txs = txs.filter(t => t.veiculo === sel.value);

  const el = $('lanc-list');
  if (!txs.length) {
    el.innerHTML = '<div class="empty-big"><span class="e-ico">🗓️</span>Nada lançado com esses filtros neste mês.</div>';
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

// ── Formulário de lançamento ──
function openTxForm(tx) {
  editingTxId = tx ? tx.id : null;
  $('tx-form-title').textContent = tx ? 'Editar lançamento' : 'Novo lançamento';
  $('tx-save-btn').textContent = tx ? 'Salvar alterações' : 'Salvar';
  txTipo = tx ? tx.tipo : 'despesa';
  txCat = tx ? tx.cat : null;
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
function updateTipoSeg() {
  $('seg-despesa').classList.toggle('seg-on', txTipo === 'despesa');
  $('seg-receita').classList.toggle('seg-on', txTipo === 'receita');
}
function renderCatGrid() {
  $('tx-cat-grid').innerHTML = CATS[txTipo].map(c => `
    <button type="button" class="cat-pill${txCat === c.id ? ' cp-on' : ''}" onclick="pickCat('${c.id}')">
      <span class="cp-ico">${c.ico}</span>${c.nome}
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
  const veiculo = $('tx-veiculo').value || '';
  if (txCat === 'combustivel' && !veiculo) { toast('Selecione o veículo abastecido.'); return; }

  const original = editingTxId ? S.tx.find(x => x.id === editingTxId) : null;
  const t = {
    tipo: txTipo,
    cat: txCat,
    valor,
    data,
    veiculo,
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
    ['Categoria', c.ico + ' ' + c.nome],
    ['Valor', R(t.valor)],
    ['Data', fmtData(t.data)],
  ];
  if (t.veiculo) rows.push(['Veículo', vehNome(t.veiculo)]);
  if (t.litros) rows.push(['Litros', t.litros.toLocaleString('pt-BR') + ' L (' + R(t.valor / t.litros) + '/L)']);
  if (t.km) rows.push(['Km no painel', fmtKm(t.km)]);
  if (t.desc) rows.push(['Descrição', t.desc]);
  rows.push(['Lançado por', (t.autorNome || '—') + (t.ts ? ' · ' + fmtDataHora(t.ts) : '')]);
  if (t.editadoPorNome) rows.push(['Editado por', t.editadoPorNome + (t.editadoEm ? ' · ' + fmtDataHora(t.editadoEm) : '')]);
  $('tx-detail-body').innerHTML = '<div class="detail-rows">' +
    rows.map(([k, v]) => `<div class="detail-row"><small>${k}</small><b>${esc(v)}</b></div>`).join('') + '</div>';
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
  if (!v) return;
  kmVehId = vid;
  $('km-veh-info').textContent = v.nome + (v.km ? ' — última leitura: ' + fmtKm(v.km) : '');
  $('km-valor').value = '';
  $('km-data').value = todayStr();
  closeOverlay('modal-veh-detail');
  openOverlay('modal-km');
}

async function saveKmLog() {
  const km = parseIntBR($('km-valor').value);
  if (km <= 0) { toast('Informe o km do painel.'); return; }
  const v = vehById(kmVehId);
  if (!v) return;
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
    if (dias < 0) chips.push({ crit: true, txt: `⚠️ ${label} vencido` });
    else if (dias <= 30) chips.push({ crit: false, txt: `📅 ${label} vence em ${dias}d` });
  });
  const intervalo = Number(v.oleoIntervalo) || 0, ultima = Number(v.oleoUltimaKm) || 0;
  if (intervalo > 0 && ultima > 0 && v.km > 0) {
    const rodou = v.km - ultima;
    if (rodou >= intervalo) chips.push({ crit: true, txt: '🛢️ Troca de óleo atrasada' });
    else if (rodou >= intervalo - 1000) chips.push({ crit: false, txt: `🛢️ Óleo: faltam ${fmtKm(intervalo - rodou)}` });
  }
  return chips;
}

function renderFrota() {
  const el = $('veh-list');
  if (!S.vehicles.length) {
    el.innerHTML = '<div class="empty-big"><span class="e-ico">🚐</span>Nenhum veículo cadastrado.<br>Toque em <b>+ Veículo</b> para adicionar a primeira van.</div>';
    return;
  }
  const mk = monthKey(0);
  const ordem = { ativo: 0, manutencao: 1, inativo: 2 };
  const stLabel = { ativo: '🟢 Ativo', manutencao: '🟡 Manutenção', inativo: '⚪ Inativo' };
  el.innerHTML = [...S.vehicles]
    .sort((a, b) => (ordem[a.status] ?? 0) - (ordem[b.status] ?? 0) || a.nome.localeCompare(b.nome))
    .map(v => {
      const gasto = S.tx.filter(t => t.veiculo === v.id && t.tipo === 'despesa' && (t.data || '').startsWith(mk))
        .reduce((s, t) => s + t.valor, 0);
      const cons = consumoMedio(v.id);
      const rodou = kmRodadoMes(v.id);
      const chips = vehAlertChips(v);
      return `
        <button class="veh-card" onclick="openVehDetail('${v.id}')">
          <div class="veh-top">
            <div class="veh-ico">🚐</div>
            <div>
              <div class="veh-nome">${esc(v.nome)}</div>
              <div class="veh-sub">${esc(v.placa || '')}${v.modelo ? ' · ' + esc(v.modelo) : ''}${v.ano ? ' · ' + esc(v.ano) : ''}</div>
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
    criadoPorNome: origV?.criadoPorNome || me.nome || me.email,
    atualizadoPorNome: me.nome || me.email,
    atualizadoEm: Date.now(),
  };
  const id = editingVehId || newId();
  closeOverlay('modal-veh');
  try {
    await dataSet('vehicles', id, v);
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

  const cells = [
    ['Placa', v.placa || '—'],
    ['Modelo', (v.modelo || '—') + (v.ano ? ' · ' + v.ano : '')],
    ['Km atual', v.km ? fmtKm(v.km) : '—'],
    ['Rodou no mês', rodou ? fmtKm(rodou) : '—'],
    ['Gasto no mês', R(gastoMes)],
    ['Custo por km (mês)', custoKm ? R(custoKm) : '—'],
    ['Consumo médio', cons ? cons.toFixed(1).replace('.', ',') + ' km/L' : '—'],
    ['Próx. troca de óleo', proxOleo > (Number(v.oleoUltimaKm) || 0) ? fmtKm(proxOleo) : '—'],
    ['Licenciamento', fmtData(v.licenciamento)],
    ['Seguro', fmtData(v.seguro)],
  ];
  const kmLogs = S.kmlog.filter(l => l.veiculo === id)
    .sort((a, b) => b.data.localeCompare(a.data) || b.km - a.km).slice(0, 5);
  $('veh-detail-body').innerHTML = `
    <div class="vd-grid">${cells.map(([k, val]) => `<div class="vd-cell"><small>${k}</small><b>${esc(val)}</b></div>`).join('')}</div>
    ${v.atualizadoPorNome ? `<p class="modal-note" style="margin-top:-4px">Última edição: ${esc(v.atualizadoPorNome)}${v.atualizadoEm ? ' · ' + fmtDataHora(v.atualizadoEm) : ''}</p>` : ''}
    <div class="fld-row">
      <button class="btn btn-secondary" onclick="openKmForm('${id}')">📍 Registrar km</button>
      <button class="btn btn-secondary" onclick="closeOverlay('modal-veh-detail');openVehicleForm(vehById('${id}'))">✏️ Editar</button>
    </div>
    ${kmLogs.length ? '<h2 class="sec-title">Leituras de km registradas</h2><div class="card">' + kmLogs.map(l => `
      <div class="row-btn">
        <span class="row-ico">📍</span>
        <span class="row-txt"><b>${fmtKm(l.km)}</b><small>${fmtDia(l.data)} · por ${esc((l.autorNome || '?').split(' ')[0])}</small></span>
        <button class="x" onclick="deleteKmLog('${l.id}')">✕</button>
      </div>`).join('') + '</div>' : ''}
    <h2 class="sec-title">Últimos lançamentos deste veículo</h2>
    ${txsV.length ? txsV.slice(0, 6).map(txItemHTML).join('') : '<div class="empty-mini">Nenhum lançamento ainda.</div>'}
  `;
  openOverlay('modal-veh-detail');
}

// ══════════════════════════════════════════
// MOTORISTAS
// ══════════════════════════════════════════
function renderMais() {
  const el = $('driver-list');
  if (!S.drivers.length) {
    el.innerHTML = '<div class="empty-big"><span class="e-ico">🧑‍✈️</span>Nenhum motorista cadastrado.</div>';
  } else {
    el.innerHTML = '<div class="card">' + [...S.drivers]
      .sort((a, b) => a.nome.localeCompare(b.nome))
      .map(d => {
        const dias = diasAte(d.cnhValidade);
        let badge = '<span class="row-badge rb-ok">CNH ok</span>';
        if (dias === null) badge = '';
        else if (dias < 0) badge = '<span class="row-badge rb-crit">CNH vencida</span>';
        else if (dias <= 30) badge = `<span class="row-badge rb-warn">CNH ${dias}d</span>`;
        return `
          <button class="row-btn" onclick='openDriverForm(${JSON.stringify(d.id)})'>
            <span class="row-ico">🧑‍✈️</span>
            <span class="row-txt"><b>${esc(d.nome)}</b><small>CNH ${esc(d.cnhCategoria || '—')} · válida até ${fmtData(d.cnhValidade)}${d.telefone ? ' · ' + esc(d.telefone) : ''}</small></span>
            ${badge}
          </button>`;
      }).join('') + '</div>';
  }
  $('ajuste-nome-atual').textContent = me.nome || '—';
  $('ajuste-email-atual').textContent = me.email || '';
  $('theme-label').textContent = document.documentElement.dataset.theme === 'dark' ? 'Escuro' : 'Claro';
}

function openDriverForm(idOrNull) {
  const d = typeof idOrNull === 'string' ? S.drivers.find(x => x.id === idOrNull) : null;
  editingDrvId = d ? d.id : null;
  $('driver-form-title').textContent = d ? 'Editar motorista' : 'Novo motorista';
  $('drv-nome').value = d ? d.nome : '';
  $('drv-tel').value = d ? (d.telefone || '') : '';
  $('drv-cnh-cat').value = d ? (d.cnhCategoria || 'D') : 'D';
  $('drv-cnh-val').value = d ? (d.cnhValidade || '') : '';
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
    criadoPorNome: origD?.criadoPorNome || me.nome || me.email,
    atualizadoPorNome: me.nome || me.email,
    atualizadoEm: Date.now(),
  };
  const id = editingDrvId || newId();
  closeOverlay('modal-driver');
  try {
    await dataSet('drivers', id, d);
    toast(editingDrvId ? 'Motorista atualizado ✓' : 'Motorista adicionado ✓');
  } catch (e) { toast('Erro ao salvar.'); }
  editingDrvId = null;
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
// EXPORTAR CSV
// ══════════════════════════════════════════
function exportCSV() {
  if (!S.tx.length) { toast('Nada para exportar ainda.'); return; }
  const head = ['Data', 'Tipo', 'Categoria', 'Veículo', 'Descrição', 'Valor (R$)', 'Litros', 'Km', 'Lançado por'];
  const lines = [...S.tx].sort((a, b) => (a.data || '').localeCompare(b.data || ''))
    .map(t => [
      fmtData(t.data),
      t.tipo === 'receita' ? 'Receita' : 'Despesa',
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
  toast('CSV exportado 📊');
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
  S.drivers = [
    { id: newId(), nome: 'Carlos Silva', telefone: '(24) 99999-1111', cnhCategoria: 'D', cnhValidade: dfut(400) },
    { id: newId(), nome: 'Roberto Souza', telefone: '(24) 99999-2222', cnhCategoria: 'D', cnhValidade: dfut(18) },
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
document.addEventListener('change', e => { if (e.target.id === 'tx-veiculo') updateFuelHint(); });

// Enter no login envia o formulário
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && (e.target.id === 'login-pass' || e.target.id === 'login-email') && !DEMO) doLogin();
});

// fechar overlay tocando fora
document.querySelectorAll('.overlay').forEach(ov => {
  ov.addEventListener('click', e => { if (e.target === ov) ov.classList.remove('open'); });
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

initApp();
