// ══════════════════════════════════════════
// FIREBASE — config (preenchido após setup)
// ══════════════════════════════════════════
const CLOUD_ENABLED = true;

const firebaseConfig = {
  apiKey: "AIzaSyCXtq2Y5S8Lb4JboxXP19DM7OGtTiNUn5s",
  authDomain: "gd-cash-45999.firebaseapp.com",
  projectId: "gd-cash-45999",
  storageBucket: "gd-cash-45999.firebasestorage.app",
  messagingSenderId: "935225376421",
  appId: "1:935225376421:web:75db9d4134f44177c3174c"
};

let auth, db, currentUser = null;

// ── Moeda ──
const CURRENCIES = ['R$', 'US$', 'CA$', 'AU$', 'MX$', '€', '£', '¥'];
let currSym = localStorage.getItem('gdcash_currency') || 'R$';

function setCurrency(sym) {
  currSym = sym;
  localStorage.setItem('gdcash_currency', currSym);
  const chip = document.getElementById('curr-chip');
  if (chip) chip.textContent = currSym;
  document.querySelectorAll('.curr-pill').forEach(btn => {
    btn.classList.toggle('curr-pill-on', btn.dataset.cur === currSym);
  });
  const active = document.querySelector('.page.active')?.id?.replace('page-', '');
  if (active === 'inicio')       { renderInicio(); renderInicioCards(); }
  else if (active === 'semana')  { renderSemana(); renderDayAccordion(); }
  else if (active === 'mes')     renderMes();
  else if (active === 'reserva') renderReserva();
  else if (active === 'metas')   renderGoals();
  else if (active === 'fixos')   renderFixos();
}

function cycleCurrency() {
  const idx = CURRENCIES.indexOf(currSym);
  setCurrency(CURRENCIES[(idx + 1) % CURRENCIES.length]);
}

function initFirebase() {
  firebase.initializeApp(firebaseConfig);
  auth = firebase.auth();
  db   = firebase.firestore();

  // Handle redirect result (iOS PWA fallback)
  auth.getRedirectResult().catch(() => {});

  auth.onAuthStateChanged(async user => {
    const loginScreen = document.getElementById('login-screen');
    const avatarBtn   = document.getElementById('user-avatar-btn');
    const avatarImg   = document.getElementById('user-avatar-img');
    if (user) {
      currentUser = user;
      loginScreen.style.display = 'none';
      avatarBtn.style.display   = '';
      avatarImg.src = user.photoURL || '';
      await loadFromCloud();
      document.getElementById('curr-chip').textContent = currSym;
      renderInicio();
      initTheme();
      initSettingsExtras();
      checkNotifPrompt();
      // FAB só na aba Semana
      const fab = document.getElementById('global-fab');
      if (fab) fab.style.display = 'none';
      checkGoalNotifications();
      checkReminders();
      checkPendenciasDeadlines();
      checkOnboarding();
      checkInstallBanner();
      handleShortcut();
    } else {
      currentUser = null;
      loginScreen.style.display = 'flex';
      avatarBtn.style.display   = 'none';
    }
  });
}

function signInWithGoogle(forceSelect = false) {
  const provider = new firebase.auth.GoogleAuthProvider();
  if (forceSelect) provider.setCustomParameters({ prompt: 'select_account' });
  auth.signInWithPopup(provider).catch(err => {
    if (err.code === 'auth/popup-blocked' || err.code === 'auth/popup-closed-by-user') {
      auth.signInWithRedirect(provider);
    } else {
      alert('Erro ao entrar: ' + err.message);
    }
  });
}

function switchAccount() {
  auth.signOut().then(() => signInWithGoogle(true));
}

function openAccountMenu() {
  document.getElementById('acct-name').textContent  = currentUser?.displayName || 'Usuário';
  document.getElementById('acct-email').textContent = currentUser?.email || '';
  const avatar = document.getElementById('acct-avatar');
  avatar.src = currentUser?.photoURL || '';
  avatar.style.display = currentUser?.photoURL ? '' : 'none';
  openOverlay('modal-account');
}

// ══════════════════════════════════════════
// INSTALL BANNER (iOS Safari only)
// ══════════════════════════════════════════
function checkInstallBanner() {
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isSafari = /safari/i.test(navigator.userAgent) && !/chrome|crios|fxios/i.test(navigator.userAgent);
  const isStandalone = window.navigator.standalone === true;
  const dismissed = localStorage.getItem('gdcash_install_dismissed');
  // Floating banner: only iOS Safari, not installed, not dismissed
  if (isIOS && isSafari && !isStandalone && !dismissed) {
    const el = document.getElementById('install-banner');
    if (el) el.style.display = '';
  }
  // Ajustes guide: hide only when already running as installed PWA
  if (isStandalone) {
    const sec = document.getElementById('install-guide-section');
    const card = document.getElementById('install-guide-card');
    if (sec) sec.style.display = 'none';
    if (card) card.style.display = 'none';
  }
}

function dismissInstallBanner() {
  localStorage.setItem('gdcash_install_dismissed', '1');
  const el = document.getElementById('install-banner');
  if (!el) return;
  el.style.transition = 'opacity .25s, transform .25s';
  el.style.opacity = '0';
  el.style.transform = 'translateY(16px)';
  setTimeout(() => { el.style.display = 'none'; }, 280);
}

// ══════════════════════════════════════════
// TAB HELP (? por aba)
// ══════════════════════════════════════════
const TAB_HELP = {
  inicio: {
    icon: '🏠',
    title: 'Tela Início',
    text: 'Resumo da semana, movimentações recentes e reserva num só lugar. Use o botão + para lançar receita ou gasto sem sair da tela.',
  },
  metas: {
    icon: '🎯',
    title: 'Minhas Metas',
    text: 'Defina metas com prazo e valor — iPhone, viagem, o que for. Acompanhe o progresso e adicione valor conforme vai guardando.',
  },
  semana: {
    icon: '📅',
    title: 'Aba Semana',
    text: 'Lance seus ganhos e gastos diários aqui. Toque em um dia para registrar valores por plataforma. Use as setas ‹ › para navegar entre semanas.',
  },
  reserva: {
    icon: '🛡️',
    title: 'Reserva & Metas',
    text: 'Aqui fica sua reserva de emergência — deposite aos poucos e acompanhe a meta. Abaixo você cria metas com prazo e valor, como viagens ou compras.',
  },
  mes: {
    icon: '📊',
    title: 'Aba Mês',
    text: 'Visão completa do mês: resultado, gráfico de gastos por categoria, receita por plataforma e histórico dos últimos 6 meses. Toque no mês para navegar.',
  },
  fixos: {
    icon: '🔁',
    title: 'Gastos Fixos',
    text: 'Cadastre contas que se repetem todo mês — aluguel, internet, planos, assinaturas. Ficam separados dos gastos do dia a dia para você ter o custo fixo sempre visível.',
  },
  conversor: {
    icon: '💱',
    title: 'Conversor de Moedas',
    text: 'Converta entre Real, Dólar, Euro e Libra com cotação atualizada automaticamente. Útil para precificar serviços ou comparar preços em outras moedas.',
  },
  lembretes: {
    icon: '🔔',
    title: 'Lembretes',
    text: 'Crie lembretes para qualquer coisa — troca de óleo, seguro, revisão, vencimentos. Ativa notificação no dia ou com antecedência. Use o botão Calendário para exportar os vencimentos dos fixos.',
  },
  ajustes: {
    icon: '⚙️',
    title: 'Ajustes',
    text: 'Configure suas fontes de receita, categorias de gastos e limites de orçamento mensal por categoria. Também aqui você faz backup e restaura seus dados.',
  },
  pendencias: {
    icon: '📋',
    title: 'Pendências',
    text: 'Registre tudo que precisa resolver — compra, documento, manutenção, conta. Defina prioridade e prazo. Ao concluir, você pode registrar como gasto real se quiser.',
  },
};

function showTabHelp(tab) {
  const help = TAB_HELP[tab];
  if (!help) return;
  const page = document.getElementById('page-' + tab);
  if (!page) return;

  // Remove existing card
  page.querySelector('.tab-help-card')?.remove();

  const card = document.createElement('div');
  card.className = 'tab-help-card';
  card.innerHTML = `
    <span class="thc-icon">${help.icon}</span>
    <div class="thc-body">
      <div class="thc-title">${help.title}</div>
      <div class="thc-text">${help.text}</div>
    </div>
    <button class="thc-close" onclick="dismissTabHelp('${tab}')">✕</button>`;

  // Insert after nav-row/page-header-row, or at top
  const navRow = page.querySelector('.nav-row, .page-header-row');
  if (navRow) navRow.after(card);
  else page.insertBefore(card, page.firstChild);

  // Animate in
  requestAnimationFrame(() => card.classList.add('thc-visible'));
  localStorage.setItem('gdcash_help_' + tab, '1');
}

function dismissTabHelp(tab) {
  const card = document.getElementById('page-' + tab)?.querySelector('.tab-help-card');
  if (!card) return;
  card.classList.remove('thc-visible');
  setTimeout(() => card.remove(), 260);
}

function checkFirstVisit(tab) {
  if (DEMO_MODE) return;
  if (!localStorage.getItem('gdcash_help_' + tab)) {
    setTimeout(() => showTabHelp(tab), 350);
  }
}

async function loadFromCloud() {
  try {
    const doc = await db.collection('users').doc(currentUser.uid).collection('data').doc('main').get();
    if (doc.exists) {
      const cloudData = doc.data();
      const localUpdatedAt = D.updatedAt || 0;
      const cloudUpdatedAt = cloudData.updatedAt || 0;
      if (cloudUpdatedAt >= localUpdatedAt) {
        D = { ...defaultData(), ...cloudData };
      }
      if (!D.goals) D.goals = [];
      if (!D.weeklyGoal) D.weeklyGoal = 0;
      if (!D.reminders) D.reminders = [];
      if (!D.pendencias) D.pendencias = [];
      if (!D.vehicles) D.vehicles = [];
      localStorage.setItem('gdcash_v1', JSON.stringify(D));
    } else {
      // Primeiro login — oferece migrar dados locais existentes
      const local = localStorage.getItem('gdcash_v1');
      if (local) {
        try {
          const parsed = JSON.parse(local);
          if (Object.keys(parsed.dailyIncome || {}).length > 0) {
            if (confirm('Encontramos dados salvos neste dispositivo. Deseja importar para a nuvem?')) {
              D = parsed;
              await saveToCloud();
            }
          }
        } catch(e) {}
      }
    }
  } catch(e) {
    console.error('Erro ao carregar da nuvem:', e);
    try { const l = localStorage.getItem('gdcash_v1'); if(l) D = JSON.parse(l); } catch(e2) {}
  }
}

async function saveToCloud() {
  if (!currentUser || !db) return;
  try {
    D.updatedAt = Date.now();
    await db.collection('users').doc(currentUser.uid).collection('data').doc('main').set(D);
  } catch(e) {
    console.error('Erro ao salvar na nuvem:', e);
  }
}

// ══════════════════════════════════════════
// RENDER: INÍCIO
// ══════════════════════════════════════════
function renderInicio() {
  const hour = new Date().getHours();
  const saudacao = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const nome = currentUser?.displayName?.split(' ')[0] || '';
  const greetEl = document.getElementById('inicio-greeting');
  if (greetEl) greetEl.textContent = saudacao + (nome ? ', ' + nome : '') + ' 👋';

  const inc = sumWeekIncome(weekOffset), exp = sumWeekExpenses(weekOffset), liq = inc - exp;
  animCount(document.getElementById('inicio-liq'), liq, 650);
  animCount(document.getElementById('inicio-inc'), inc);
  animCount(document.getElementById('inicio-exp'), exp);
  const hero = document.getElementById('hero-inicio');
  if (hero) hero.className = 'hero-card ' + (liq >= 0 ? 'pos' : 'neg');

  const gwrap = document.getElementById('inicio-goal-wrap');
  if (gwrap) {
    const bar = document.getElementById('inicio-goal-bar');
    const pctEl = document.getElementById('inicio-goal-pct');
    if (D.weeklyGoal > 0) {
      const pct = Math.min(100, Math.round(inc / D.weeklyGoal * 100));
      if (bar) { bar.style.width = pct + '%'; bar.className = 'wg-bar-fill' + (pct >= 100 ? ' wg-done' : ''); }
      if (pctEl) pctEl.textContent = R(inc) + ' / ' + R(D.weeklyGoal);
    } else {
      if (bar) { bar.style.width = '0%'; bar.className = 'wg-bar-fill'; }
      if (pctEl) pctEl.textContent = 'Definir →';
    }
  }

  const rpct = D.emergency.target > 0 ? Math.min(100, Math.round(D.emergency.current / D.emergency.target * 100)) : 0;
  const rbar = document.getElementById('inicio-reserve-bar');
  if (rbar) { rbar.style.width = rpct + '%'; rbar.className = 'wg-bar-fill' + (rpct >= 100 ? ' wg-done' : ''); }
  const rval = document.getElementById('inicio-reserve-val');
  if (rval) rval.textContent = R(D.emergency.current);
  const rpctEl = document.getElementById('inicio-reserve-pct-txt');
  if (rpctEl) rpctEl.textContent = rpct + '%';

  renderRecentTx();
  renderInicioCards();
  renderHomeNew();
}

function renderRecentTx() {
  const listEl = document.getElementById('inicio-tx-list');
  if (!listEl) return;
  const platMap = Object.fromEntries((D.platforms || []).map(p => [p.id, p]));
  const exps = (D.expenses || []).map(e => ({
    type: 'exp', id: e.id, date: e.date, label: e.description || e.category, sub: e.category, amount: e.amount
  }));
  const incItems = (D.incomeItems || []).filter(it => it.status === 'paid').map(it => ({
    type: 'inc', id: it.id, date: it.date,
    label: it.note || platMap[it.platformId]?.name || 'Receita',
    sub: platMap[it.platformId]?.name || '',
    amount: it.amount
  }));
  const manualInc = [];
  Object.entries(D.dailyIncome || {}).forEach(([date, pm]) => {
    (D.platforms || []).forEach(p => {
      const v = pm[p.id];
      if (v && v > 0 && !(D.incomeItems || []).some(it => it.date === date && it.platformId === p.id))
        manualInc.push({ type: 'inc', id: '', date, label: p.name, sub: '', amount: v });
    });
  });
  const all = [...exps, ...incItems, ...manualInc]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8);
  if (!all.length) {
    listEl.innerHTML = '<div class="empty-state">Sem movimentações ainda</div>';
    return;
  }
  listEl.innerHTML = all.map((tx, i) => `
    <div class="tx-item" style="--sd:${i*0.04}s"${tx.id ? ` data-id="${tx.id}" data-type="${tx.type}"` : ''}>
      <div class="tx-icon ${tx.type === 'inc' ? 'tx-icon-inc' : 'tx-icon-exp'}">${tx.type === 'inc' ? '↑' : '↓'}</div>
      <div class="tx-info">
        <div class="tx-label">${tx.label}</div>
        <div class="tx-sub">${tx.sub ? tx.sub + ' · ' : ''}${fmtShort(tx.date)}</div>
      </div>
      <div class="tx-amt ${tx.type === 'inc' ? 'pos' : 'neg'}">${tx.type === 'inc' ? '+' : '−'}${currSym} ${Math.abs(tx.amount).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
    </div>`).join('');
}

// ── Dia: abrir / atualizar ──
function openDayDetail(idx) {
  selDayIdx = idx;
  document.querySelectorAll('#days-grid .day-btn').forEach((btn, i) => btn.classList.toggle('sel', i === idx));
  populateExpCatSel();
  _onExpCatChange();
  renderDayDetail();
  openOverlay('modal-day-detail');
}

function selectDay(idx) {
  selDayIdx = idx;
  document.querySelectorAll('#days-grid .day-btn').forEach((btn, i) => btn.classList.toggle('sel', i === idx));
}

function refreshAfterDayEdit() {
  renderDayDetail();
  // Update days-grid dots
  const dates = weekDates(weekOffset);
  document.querySelectorAll('#days-grid .day-btn').forEach((btn, i) => {
    if (i >= dates.length) return;
    const d = dates[i];
    const hasData = Object.values(getDayIncome(d)).some(v => v > 0)
      || getDayExpenses(d).length > 0
      || (D.incomeItems || []).some(it => it.date === d);
    btn.classList.toggle('has-data', hasData);
  });
  // Refresh hero on semana page if active
  if (document.getElementById('page-semana')?.classList.contains('active')) {
    const inc = sumWeekIncome(weekOffset), exp = sumWeekExpenses(weekOffset), liq = inc - exp;
    animCount(document.getElementById('ws-inc'), inc);
    animCount(document.getElementById('ws-exp'), exp);
    animCount(document.getElementById('ws-liq'), liq, 650);
    document.getElementById('hero-semana').className = 'hero-card ' + (liq >= 0 ? 'pos' : 'neg');
    document.getElementById('plat-cards').innerHTML = D.platforms.map(p =>
      `<div class="plat-c" style="border-top-color:${p.color}" onclick="openPlatSettings()">
        <div class="plat-c-name" style="color:${p.color}">${p.name}</div>
        <div class="plat-c-val">${R(sumPlatWeek(p.id, weekOffset))}</div>
      </div>`).join('');
  }
  // Refresh inicio if active
  if (document.getElementById('page-inicio')?.classList.contains('active')) renderInicio();
}

// ── Mais / FAB ──
function openMoreMenu() { openOverlay('modal-more'); }
function switchMore(tab) { closeOverlay('modal-more'); setTimeout(() => switchTab(tab), 50); }

let _fabOpen = false;
function toggleFabMenu() { haptic(6); _fabOpen ? closeFabMenu() : openFabMenu(); }

function openFabMenu() {
  _fabOpen = true;
  const bd = document.getElementById('fab-backdrop');
  const ac = document.getElementById('fab-actions');
  const btn = document.getElementById('global-fab');
  bd.style.display = ''; ac.style.display = '';
  btn.classList.add('fab-open');
  requestAnimationFrame(() => {
    bd.style.opacity = '1';
    ac.style.opacity = '1';
    ac.style.transform = 'translateY(0)';
  });
}

function closeFabMenu() {
  _fabOpen = false;
  const bd = document.getElementById('fab-backdrop');
  const ac = document.getElementById('fab-actions');
  bd.style.opacity = '0';
  ac.style.opacity = '0';
  ac.style.transform = 'translateY(12px)';
  document.getElementById('global-fab').classList.remove('fab-open');
  setTimeout(() => { bd.style.display = 'none'; ac.style.display = 'none'; }, 220);
}

function fabAction(type) {
  closeFabMenu();
  setTimeout(() => {
    const goToDay = () => {
      openDayDetail(selDayIdx);
      if (type === 'expense') {
        setTimeout(() => {
          const sheet = document.querySelector('#modal-day-detail .sheet');
          const expSec = document.getElementById('add-exp-section');
          if (sheet && expSec) sheet.scrollTop = expSec.offsetTop - 20;
        }, 400);
      }
    };
    if (!document.getElementById('page-semana')?.classList.contains('active')) {
      switchTab('semana');
      setTimeout(goToDay, 350);
    } else {
      goToDay();
    }
  }, 250);
}

// ══════════════════════════════════════════
// DATA & STORE
// ══════════════════════════════════════════
const WEEK_DAYS = ['SEG','TER','QUA','QUI','SEX','SÁB','DOM'];
const PALETTE = ['#ffb800','#00e6a0','#3ec6ff','#ff6b35','#a78bfa','#ff4d6a','#5eead4','#ffe066'];
const RING_R = 68, RING_CIRC = 2*Math.PI*RING_R;

function defaultData() {
  return {
    platforms: [
      { id:'p1', name:'Fonte 1', color:PALETTE[0] },
      { id:'p2', name:'Fonte 2', color:PALETTE[1] },
      { id:'p3', name:'Extra',   color:PALETTE[2] }
    ],
    dailyIncome: {},
    daysOff: [],
    expenses: [],
    expCats: ['Gasolina','Alimentação','Moradia','Saúde','Lazer','Transporte','Serviços','Outros'],
    fixedExpenses: [],
    emergency: { target: 10000, current: 0 },
    reservaHistory: [],
    goals: [],
    weeklyGoal: 0,
    incomeItems: [],
    catBudgets: {},
    reminders: [],
    pendencias: [],
    vehicles: [],
  };
}

let D = (() => {
  try {
    const s = localStorage.getItem('gdcash_v1');
    if(s) {
      const p=JSON.parse(s);
      if(!p.goals)       p.goals=[];
      if(!p.weeklyGoal)  p.weeklyGoal=0;
      if(!p.incomeItems) p.incomeItems=[];
      if(!p.catBudgets)  p.catBudgets={};
      if(!p.reminders)   p.reminders=[];
      if(!p.pendencias)  p.pendencias=[];
      if(!p.vehicles)    p.vehicles=[];
      return p;
    }
  } catch(e){}
  return defaultData();
})();

function gdToast(msg, duration=4000) {
  let el = document.getElementById('gd-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'gd-toast';
    el.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:#1a1a2e;color:#e8e7f4;padding:12px 20px;border-radius:12px;font-size:14px;z-index:9999;max-width:320px;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,.5);border:1px solid #25273a;transition:opacity .3s';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.opacity = '1';
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.opacity = '0'; }, duration);
}

function save() {
  try { localStorage.setItem('gdcash_v1', JSON.stringify(D)); } catch(e) {
    if (e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22)) {
      gdToast('⚠️ Armazenamento cheio. Exporte seus dados ou ative a sincronização na nuvem.');
    }
  }
  if (CLOUD_ENABLED) saveToCloud();
}

function exportData() {
  const blob = new Blob([JSON.stringify(D, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `avenco-backup-${todayStr()}.json`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  localStorage.setItem('gdcash_last_backup', todayStr());
}
function importData(event) {
  const file = event.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const required = ['platforms','expenses','dailyIncome'];
      const missing = required.filter(k => !parsed[k] || typeof parsed[k] !== 'object');
      if (missing.length) {
        alert('Arquivo inválido: campos obrigatórios ausentes (' + missing.join(', ') + '). Selecione um backup exportado pelo Avenco.');
        return;
      }
      const def = defaultData();
      D = Object.assign({}, def, parsed);
      D.platforms = Array.isArray(parsed.platforms) ? parsed.platforms : def.platforms;
      D.expenses = Array.isArray(parsed.expenses) ? parsed.expenses : def.expenses;
      D.incomeItems = Array.isArray(parsed.incomeItems) ? parsed.incomeItems : def.incomeItems || [];
      D.goals = Array.isArray(parsed.goals) ? parsed.goals : def.goals || [];
      D.reminders = Array.isArray(parsed.reminders) ? parsed.reminders : def.reminders || [];
      D.fixedExpenses = Array.isArray(parsed.fixedExpenses) ? parsed.fixedExpenses : def.fixedExpenses || [];
      D.pendencias = Array.isArray(parsed.pendencias) ? parsed.pendencias : def.pendencias || [];
      save();
      alert('Dados importados com sucesso!');
      location.reload();
    } catch(e) {
      alert('Arquivo inválido. Selecione um backup exportado pelo app.');
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}
function uid()  { return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }
function haptic(ms=8) { try { navigator.vibrate?.(ms); } catch(e) {} }

// ══════════════════════════════════════════
// DATE UTILS
// ══════════════════════════════════════════
function getMonday(dt) {
  const d = new Date(dt); const day = d.getDay();
  d.setDate(d.getDate() + (day===0 ? -6 : 1-day)); d.setHours(0,0,0,0); return d;
}
function dateStr(d)    { const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${day}`; }
function todayStr()    { return dateStr(new Date()); }
function parseDate(s)  { return new Date(s+'T12:00:00'); }
function fmtShort(d)   { return parseDate(d).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}); }
function fmtDate(d)    { return parseDate(d).toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'numeric'}); }
function fmtMonthYear(off) {
  const d = new Date(); d.setMonth(d.getMonth()+off,1);
  return d.toLocaleDateString('pt-BR',{month:'short',year:'numeric'});
}
// Money formatter — always shows an explicit "−" sign for negative values,
// since color alone (red/green) is ambiguous once printed/screenshotted.
function R(v) {
  const n = v||0;
  const sign = n<0 ? '−' : '';
  return sign+currSym+' '+Math.abs(n).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
}

function animCount(el, finalVal, duration=550) {
  if (!el) return;
  const start = performance.now();
  const neg = finalVal < 0;
  const abs = Math.abs(finalVal);
  const frame = (now) => {
    const p = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - p, 3);
    const cur = abs * ease * (neg ? -1 : 1);
    el.textContent = R(cur);
    if (p < 1) requestAnimationFrame(frame);
    else {
      el.textContent = R(finalVal);
      el.classList.remove('num-pop');
      void el.offsetWidth;
      el.classList.add('num-pop');
    }
  };
  requestAnimationFrame(frame);
}

// ══════════════════════════════════════════
// WEEK STATE
// ══════════════════════════════════════════
let weekOffset = 0;
let selDayIdx = (() => { const d=new Date().getDay(); return d===0?6:d-1; })();
let monthOffset = 0;

function weekDates(off=0) {
  const mon = getMonday(new Date()); mon.setDate(mon.getDate()+off*7);
  return Array.from({length:7},(_,i)=>{ const d=new Date(mon); d.setDate(d.getDate()+i); return dateStr(d); });
}
function selDate() { return weekDates(weekOffset)[selDayIdx]; }
function changeWeek(dir) { weekOffset+=dir; renderSemana(); }

// ══════════════════════════════════════════
// INCOME HELPERS
// ══════════════════════════════════════════
function getDayIncome(date)       { return D.dailyIncome[date]||{}; }
function setDayIncome(date,pid,v) { if(!D.dailyIncome[date])D.dailyIncome[date]={}; D.dailyIncome[date][pid]=parseFloat(v)||0; save(); }
function saveDayIncomeWithFeedback(date,pid,v,el) {
  setDayIncome(date,pid,v);
  el.classList.add('inp-saved');
  setTimeout(()=>el.classList.remove('inp-saved'),1400);
  renderDayDetail();
}
// Receita paga de uma plataforma num dia (itens têm prioridade sobre input manual)
function getDayPlatIncome(date, pid) {
  const items = (D.incomeItems||[]).filter(it=>it.date===date&&it.platformId===pid);
  if(items.length>0) return items.filter(it=>it.status==='paid').reduce((s,it)=>s+it.amount,0);
  return getDayIncome(date)[pid]||0;
}
// Total de todos os itens (pagos+pendentes) de uma plataforma num dia — para exibição
function getDayPlatDisplay(date, pid) {
  const items = (D.incomeItems||[]).filter(it=>it.date===date&&it.platformId===pid);
  if(items.length>0) return items.reduce((s,it)=>s+it.amount,0);
  return getDayIncome(date)[pid]||0;
}
function sumDayIncome(date)   { return D.platforms.reduce((s,p)=>s+getDayPlatIncome(date,p.id),0); }
function sumPlatWeek(pid,off=0) { return weekDates(off).reduce((s,d)=>s+getDayPlatIncome(d,pid),0); }
function sumWeekIncome(off=0) { return D.platforms.reduce((s,p)=>s+sumPlatWeek(p.id,off),0); }
function sumWeekExpenses(off=0)   { const dates=weekDates(off); return D.expenses.filter(e=>dates.includes(e.date)).reduce((s,e)=>s+e.amount,0); }
function getDayExpenses(date)     { return D.expenses.filter(e=>e.date===date); }
function sumDayExpenses(date)     { return getDayExpenses(date).reduce((s,e)=>s+e.amount,0); }

// ══════════════════════════════════════════
// MONTH HELPERS
// ══════════════════════════════════════════
function monthDates(off=0) {
  const d=new Date(); d.setMonth(d.getMonth()+off,1);
  const y=d.getFullYear(),m=d.getMonth(),days=new Date(y,m+1,0).getDate();
  return Array.from({length:days},(_,i)=>`${y}-${String(m+1).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`);
}
function sumMonthIncome(off=0) {
  return monthDates(off).reduce((s,d)=>s+D.platforms.reduce((ss,p)=>ss+getDayPlatIncome(d,p.id),0),0);
}
function sumMonthExpenses(off=0) { const dates=monthDates(off); return D.expenses.filter(e=>dates.includes(e.date)).reduce((s,e)=>s+e.amount,0); }
function sumMonthPlat(pid,off=0) {
  return monthDates(off).reduce((s,d)=>s+getDayPlatIncome(d,pid),0);
}
function sumMonthReserva(off=0) {
  const dates=new Set(monthDates(off));
  return D.reservaHistory.filter(h=>dates.has(h.date)).reduce((s,h)=>s+(h.type==='dep'?h.amount:-h.amount),0);
}
function getMonthWeeks(off=0) {
  const d=new Date(); d.setMonth(d.getMonth()+off,1);
  const y=d.getFullYear(),m=d.getMonth();
  const last=new Date(y,m+1,0);
  const weeks=[]; let cur=getMonday(new Date(y,m,1));
  while(cur<=last) {
    const s=new Date(cur),e=new Date(cur); e.setDate(e.getDate()+6);
    weeks.push({start:s,end:e}); cur.setDate(cur.getDate()+7);
  }
  return weeks;
}

// ══════════════════════════════════════════
// HISTÓRICO E COMPARATIVOS — API DE DADOS
// ══════════════════════════════════════════
// getMonthData(off, opts) — retorna dados estruturados de qualquer mês.
// opts.throughDay: limita ao dia N do mês (para comparação de período parcial).
// Projetado para consulta futura por IA ou scripts externos.
function getMonthData(off, opts) {
  var throughDay = opts && opts.throughDay;
  var d0 = new Date(); d0.setMonth(d0.getMonth() + off, 1);
  var year = d0.getFullYear(), month = d0.getMonth();
  var daysInMonth = new Date(year, month + 1, 0).getDate();
  var now = new Date(); now.setHours(0, 0, 0, 0);
  var isCurrentMonth = off === 0;
  var dayOfMonth = throughDay ? Math.min(throughDay, daysInMonth) : (isCurrentMonth ? now.getDate() : daysInMonth);
  var pctPassed = Math.round((dayOfMonth / daysInMonth) * 100);

  var dates = [];
  for (var i = 1; i <= dayOfMonth; i++) {
    dates.push(year + '-' + String(month + 1).padStart(2, '0') + '-' + String(i).padStart(2, '0'));
  }
  var datesSet = new Set(dates);
  var daysWithData = dates.filter(function(dt) { return sumDayIncome(dt) > 0 || getDayExpenses(dt).length > 0; }).length;

  var inc = dates.reduce(function(s, dt) {
    return s + D.platforms.reduce(function(ss, p) { return ss + getDayPlatIncome(dt, p.id); }, 0);
  }, 0);
  var incByPlatform = D.platforms.map(function(p) {
    return { id: p.id, name: p.name, amount: dates.reduce(function(s, dt) { return s + getDayPlatIncome(dt, p.id); }, 0) };
  }).filter(function(p) { return p.amount > 0; });

  var mExps = D.expenses.filter(function(e) { return datesSet.has(e.date); });
  var exp = mExps.reduce(function(s, e) { return s + e.amount; }, 0);
  var catMap = {};
  mExps.forEach(function(e) { catMap[e.category] = (catMap[e.category] || 0) + e.amount; });
  var byCategory = Object.entries(catMap).sort(function(a, b) { return b[1] - a[1]; }).map(function(entry) {
    return { cat: entry[0], amount: entry[1], pct: exp > 0 ? Math.round(entry[1] / exp * 100) : 0 };
  });
  var topExpense = mExps.slice().sort(function(a, b) { return b.amount - a.amount; })[0] || null;

  var resvMoves = D.reservaHistory.filter(function(h) { return datesSet.has(h.date); });
  var resvDeps = resvMoves.filter(function(h) { return h.type === 'dep'; });
  var resvRets = resvMoves.filter(function(h) { return h.type === 'ret'; });
  var resvDeposited = resvDeps.reduce(function(s, h) { return s + h.amount; }, 0);
  var resvWithdrawn = resvRets.reduce(function(s, h) { return s + h.amount; }, 0);

  var vehCostMap = {};
  mExps.filter(function(e) { return e.vehicleId; }).forEach(function(e) {
    vehCostMap[e.vehicleId] = (vehCostMap[e.vehicleId] || 0) + e.amount;
  });
  var byVehicle = Object.entries(vehCostMap).map(function(entry) {
    var veh = (D.vehicles || []).find(function(v) { return v.id === entry[0]; });
    return { id: entry[0], name: veh ? veh.name : 'Veículo', cost: entry[1] };
  }).sort(function(a, b) { return b.cost - a.cost; });

  var pendCompleted = (D.pendencias || []).filter(function(p) {
    return p.status === 'concluida' && p.completedAt && datesSet.has(p.completedAt);
  });

  return {
    period: { off: off, year: year, month: month, label: fmtMonthYear(off), isCurrentMonth: isCurrentMonth, pctPassed: pctPassed, dayOfMonth: dayOfMonth, daysInMonth: daysInMonth, daysWithData: daysWithData },
    income: { total: inc, byPlatform: incByPlatform },
    expenses: { total: exp, byCategory: byCategory, topExpense: topExpense },
    result: { net: inc - exp, savingsRate: inc > 0 ? Math.round(((inc - exp) / inc) * 100) : 0 },
    reserve: { net: resvDeposited - resvWithdrawn, deposits: resvDeps, withdrawals: resvRets, totalDeposited: resvDeposited, totalWithdrawn: resvWithdrawn },
    goals: { active: D.goals || [] },
    pendencias: { completedThisMonth: pendCompleted },
    vehicles: { byCost: byVehicle },
  };
}

// ══════════════════════════════════════════
// DONUT CHART (dependency-free SVG renderer)
// ══════════════════════════════════════════
function renderDonut(svgId, legendId, items) {
  const svg = document.getElementById(svgId);
  const legend = document.getElementById(legendId);
  const total = items.reduce((s,i)=>s+i.value,0);
  if(!total) {
    svg.innerHTML = `<circle cx="60" cy="60" r="48" fill="none" stroke="var(--border)" stroke-width="16"/>`;
    legend.innerHTML = '<div class="empty-state">Sem dados ainda</div>';
    return;
  }
  const r=48, cx=60, cy=60, circ=2*Math.PI*r;
  let offset=0, paths='', finalDash=[];
  items.forEach((it,idx)=>{
    const len=(it.value/total)*circ;
    finalDash.push(`${len} ${circ-len}`);
    paths+=`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${it.color}" stroke-width="16"
      stroke-dasharray="0 ${circ}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})"
      style="transition:stroke-dasharray .6s cubic-bezier(.35,.07,.24,.95) ${idx*0.07}s"/>`;
    offset+=len;
  });
  svg.innerHTML = paths;
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    svg.querySelectorAll('circle').forEach((c,i)=>c.setAttribute('stroke-dasharray',finalDash[i]));
  }));
  legend.innerHTML = items.map(it=>`
    <div class="legend-item">
      <span class="legend-dot" style="background:${it.color}"></span>
      <span class="legend-label">${it.label}</span>
      <span class="legend-pct">${Math.round(it.value/total*100)}%</span>
      <span class="legend-val">${R(it.value)}</span>
    </div>`).join('');
}

function renderBigDonut(svgId, pillsId, totalElId, items) {
  const svg    = document.getElementById(svgId);
  const pills  = document.getElementById(pillsId);
  const totEl  = document.getElementById(totalElId);
  const total  = items.reduce((s,i)=>s+i.value,0);

  if(totEl) { if(total>0) animCount(totEl,total,600); else totEl.textContent='—'; }

  if(!total) {
    svg.innerHTML = `<circle cx="100" cy="100" r="80" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="22"/>`;
    pills.innerHTML = '<div class="empty-state">Nenhum gasto no mês</div>';
    return;
  }

  const r=80, cx=100, cy=100, gap=3;
  const circ=2*Math.PI*r;
  let offset=0, paths='', finalDash=[];
  items.forEach((it,idx)=>{
    const len=Math.max(0,(it.value/total)*circ - gap);
    finalDash.push(`${len} ${circ-len}`);
    paths+=`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${it.color}" stroke-width="22"
      stroke-dasharray="0 ${circ}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})"
      stroke-linecap="round" style="transition:stroke-dasharray .65s cubic-bezier(.35,.07,.24,.95) ${idx*0.07}s"/>`;
    offset+=(it.value/total)*circ;
  });
  svg.innerHTML = paths;
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    svg.querySelectorAll('circle').forEach((c,i)=>c.setAttribute('stroke-dasharray',finalDash[i]));
  }));

  pills.innerHTML = items.map(it=>`
    <div class="cat-pill" style="border-color:${it.color}20;background:${it.color}12">
      <span class="cat-pill-dot" style="background:${it.color}"></span>
      <span class="cat-pill-name">${it.label}</span>
      <span class="cat-pill-val" style="color:${it.color}">${R(it.value)}</span>
    </div>`).join('');
}

// Vertical category list: top 5 + Outros, with bar, value and % of total (0–100%)
function renderCatList(elId, items) {
  var el = document.getElementById(elId);
  if (!el) return;
  var total = items.reduce(function(s, it) { return s + it.value; }, 0);
  if (!total) return;
  var top = items.slice(0, 5);
  var rest = items.slice(5);
  var rows = top.slice();
  if (rest.length > 0) {
    var otherVal = rest.reduce(function(s, it) { return s + it.value; }, 0);
    rows.push({ label: 'Outros', value: otherVal, color: '#9CA3AF' });
  }
  el.innerHTML = rows.map(function(it) {
    var pct = Math.round(it.value / total * 100);
    return '<div class="cat-row">' +
      '<span class="cat-row-dot" style="background:' + it.color + '"></span>' +
      '<span class="cat-row-name">' + it.label + '</span>' +
      '<div class="cat-row-bar-wrap"><div class="cat-row-bar" style="width:' + pct + '%;background:' + it.color + '"></div></div>' +
      '<span class="cat-row-val">' + R(it.value) + '</span>' +
      '<span class="cat-row-pct">' + pct + '%</span>' +
    '</div>';
  }).join('');
}

// ══════════════════════════════════════════
// RENDER: SEMANA
// ══════════════════════════════════════════
function renderSemana() {
  const dates=weekDates(weekOffset);
  document.getElementById('week-lbl').innerHTML=`Semana <b>${fmtShort(dates[0])} – ${fmtShort(dates[6])}</b>`;
  const inc=sumWeekIncome(weekOffset), exp=sumWeekExpenses(weekOffset), liq=inc-exp;
  animCount(document.getElementById('ws-inc'), inc);
  animCount(document.getElementById('ws-exp'), exp);
  animCount(document.getElementById('ws-liq'), liq, 650);
  document.getElementById('hero-semana').className='hero-card '+(liq>=0?'pos':'neg');

  document.getElementById('plat-cards').innerHTML=D.platforms.map(p=>`
    <div class="plat-c" style="border-top-color:${p.color}" onclick="openPlatSettings()">
      <div class="plat-c-name" style="color:${p.color}">${p.name}</div>
      <div class="plat-c-val">${R(sumPlatWeek(p.id,weekOffset))}</div>
    </div>`).join('');

  document.getElementById('days-grid').innerHTML=dates.map((d,i)=>{
    const hasData=Object.values(getDayIncome(d)).some(v=>v>0)||getDayExpenses(d).length>0||(D.incomeItems||[]).some(it=>it.date===d);
    const isOff=D.daysOff.includes(d);
    const dt=parseDate(d);
    return `<div class="day-btn${i===selDayIdx?' sel':''}${hasData?' has-data':''}${isOff?' off':''}" onclick="selectDay(${i})">
      <div class="day-lbl">${WEEK_DAYS[i]}</div>
      <div class="day-num">${dt.getDate()}</div>
      <div class="day-dot"></div>
    </div>`;
  }).join('');

  renderWeekGoal();
  renderWeekInsight(weekOffset);
  renderDayAccordion();
}

function renderDayDetail() {
  const date=selDate(), isOff=D.daysOff.includes(date);
  document.getElementById('day-detail-date').textContent=fmtDate(date);
  const fb=document.getElementById('btn-folga');
  fb.className='btn-folga'+(isOff?' on':'');
  fb.textContent=isOff?'✓ Folga':'Marcar folga';

  const inc=getDayIncome(date);
  const cols=Math.min(D.platforms.length,3);
  const grid=document.getElementById('inc-inputs-grid');
  grid.style.gridTemplateColumns=`repeat(${cols},1fr)`;
  grid.innerHTML=D.platforms.map(p=>{
    const hasItems=(D.incomeItems||[]).some(it=>it.date===date&&it.platformId===p.id);
    const displayVal=getDayPlatDisplay(date,p.id);
    const val=displayVal>0?displayVal:'';
    return `
    <div class="inc-inp-wrap">
      <div class="inc-inp-lbl" style="color:${p.color}">${p.name}</div>
      <input class="inc-inp" type="number" min="0" step="0.01" placeholder="0.00"
        value="${val}"
        ${hasItems?'readonly title="Total calculado pelos serviços detalhados"':'onchange="saveDayIncomeWithFeedback(\''+date+'\',\''+p.id+'\',this.value,this)"'}
        ${hasItems||isOff?'style="opacity:.55;pointer-events:'+(hasItems?'none':'auto')+'"':''}
        ${isOff&&!hasItems?'disabled':''}>
    </div>`;
  }).join('');

  const exps=getDayExpenses(date);
  const emEl=document.getElementById('exp-empty-msg');
  const listEl=document.getElementById('exp-list');
  emEl.style.display=exps.length?'none':'block';
  listEl.innerHTML=exps.map(e=>`
    <div class="exp-item">
      <div class="exp-info">
        <div class="exp-cat">${e.category}</div>
        <div class="exp-desc">${e.description||e.category}</div>
      </div>
      <span class="exp-amt">${R(e.amount)}</span>
      <button class="exp-del" onclick="deleteExpense('${e.id}')">✕</button>
    </div>`).join('');

  renderIncomeItems(date);

  const dayInc=sumDayIncome(date), dayExp=sumDayExpenses(date), dayBal=dayInc-dayExp;
  const rv=document.getElementById('result-val');
  rv.textContent=R(dayBal); rv.className='result-val '+(dayBal>=0?'pos':'neg');

  const addSec=document.getElementById('add-exp-section');
  addSec.style.opacity=isOff?'0.4':'1';
  addSec.style.pointerEvents=isOff?'none':'auto';
}

function renderIncomeItems(date) {
  const items = (D.incomeItems||[]).filter(it=>it.date===date);
  const paid    = items.filter(it=>it.status==='paid');
  const pending = items.filter(it=>it.status==='pending');
  const platMap = Object.fromEntries(D.platforms.map(p=>[p.id,p]));

  const pendingTotal = pending.reduce((s,it)=>s+it.amount,0);

  const itemRow = it => `
    <div class="iitem">
      <span class="iitem-status ${it.status==='paid'?'paid':'pending'}"></span>
      <div class="iitem-info">
        <span class="iitem-note">${it.note||platMap[it.platformId]?.name||'Receita'}</span>
        <span class="iitem-plat" style="color:${platMap[it.platformId]?.color||'#888'}">${platMap[it.platformId]?.name||''}</span>
      </div>
      <span class="iitem-amt">${R(it.amount)}</span>
      <button class="exp-del" onclick="deleteIncomeItem('${it.id}')">✕</button>
    </div>`;

  document.getElementById('income-items-list').innerHTML =
    [...paid,...pending].map(itemRow).join('') ||
    '<div class="iitem-empty">Nenhum serviço detalhado ainda</div>';

  const pendEl = document.getElementById('income-pending-total');
  if(pendingTotal>0){
    pendEl.style.display='';
    pendEl.textContent=`A receber: ${R(pendingTotal)}`;
  } else {
    pendEl.style.display='none';
  }
}

function addIncomeItem() {
  const date = selDate();
  const pid  = document.getElementById('ii-plat').value;
  const amt  = parseFloat(document.getElementById('ii-amt').value);
  const note = document.getElementById('ii-note').value.trim();
  const status = document.getElementById('ii-status').value;
  if(!amt||amt<=0){ alert('Informe um valor.'); return; }
  if(!D.incomeItems) D.incomeItems=[];
  D.incomeItems.push({id:uid(),date,platformId:pid,amount:amt,note,status});
  document.getElementById('ii-amt').value='';
  document.getElementById('ii-note').value='';
  document.getElementById('income-add-form').style.display='none';
  flyNumber(amt, document.getElementById('ii-amt'));
  haptic(10); save(); refreshAfterDayEdit();
}

function deleteIncomeItem(id) {
  D.incomeItems=(D.incomeItems||[]).filter(it=>it.id!==id);
  save(); refreshAfterDayEdit();
}

function toggleIncomeForm() {
  const f=document.getElementById('income-add-form');
  f.style.display = f.style.display==='none'?'':'none';
  if(f.style.display!=='none'){
    const sel=document.getElementById('ii-plat');
    sel.innerHTML=D.platforms.map(p=>`<option value="${p.id}">${p.name}</option>`).join('');
  }
}

function toggleFolga() {
  const date=selDate();
  if(D.daysOff.includes(date)) D.daysOff=D.daysOff.filter(d=>d!==date);
  else D.daysOff.push(date);
  save(); refreshAfterDayEdit();
}

function populateExpCatSel() {
  document.getElementById('exp-cat').innerHTML=D.expCats.map(c=>`<option value="${c}">${c}</option>`).join('');
}

function _isVehCat(cat) {
  if (!cat) return false;
  const c = cat.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return /gasolina|combustiv|manutenc|estacion|pedagio|seguro|ipva|carro|oficina|revisao|pneu|troca|lubrific/.test(c);
}

function _populateExpVehSel() {
  const sel = document.getElementById('exp-veh-sel');
  if (!sel) return;
  const vehs = (D.vehicles || []).filter(v => v.status !== 'arquivado');
  sel.innerHTML = '<option value="">— Veículo (opcional) —</option>' + vehs.map(v => `<option value="${v.id}">${escHtml(v.name)}</option>`).join('');
}

function _onExpCatChange() {
  const vehs = (D.vehicles || []).filter(v => v.status !== 'arquivado');
  const vehSel   = document.getElementById('exp-veh-sel');
  const linkRow  = document.getElementById('exp-veh-link-row');
  if (!vehSel || vehs.length === 0) { if (vehSel) vehSel.style.display = 'none'; if (linkRow) linkRow.style.display = 'none'; return; }
  const cat = document.getElementById('exp-cat')?.value || '';
  if (_isVehCat(cat)) {
    _populateExpVehSel();
    vehSel.style.display = '';
    if (linkRow) linkRow.style.display = 'none';
  } else {
    vehSel.style.display = 'none';
    if (linkRow) linkRow.style.display = '';
  }
}

function _showExpVehManual() {
  _populateExpVehSel();
  const vehSel  = document.getElementById('exp-veh-sel');
  const linkRow = document.getElementById('exp-veh-link-row');
  if (vehSel) vehSel.style.display = '';
  if (linkRow) linkRow.style.display = 'none';
}

function _populatePendVehSel() {
  const sel = document.getElementById('pend-veh-sel');
  if (!sel) return;
  const vehs = (D.vehicles || []).filter(v => v.status !== 'arquivado');
  sel.innerHTML = '<option value="">— Nenhum —</option>' + vehs.map(v => `<option value="${v.id}">${escHtml(v.name)}</option>`).join('');
}

function _onPendCatChange() {
  const cat   = document.getElementById('pend-cat-sel')?.value || '';
  const vehs  = (D.vehicles || []).filter(v => v.status !== 'arquivado');
  const vehRow = document.getElementById('pend-veh-row');
  if (!vehRow) return;
  if (vehs.length === 0 || cat !== 'carro') {
    vehRow.style.display = 'none';
  } else {
    _populatePendVehSel();
    vehRow.style.display = '';
  }
}

function addExpense() {
  const date=selDate(), cat=document.getElementById('exp-cat').value;
  const val=parseFloat(document.getElementById('exp-val').value);
  const desc=document.getElementById('exp-desc').value.trim();
  if(!val||val<=0){alert('Informe um valor válido.');return;}
  const vehSel = document.getElementById('exp-veh-sel');
  const vehicleId = (vehSel && vehSel.style.display !== 'none') ? (vehSel.value || null) : null;
  const expObj = {id:uid(),date,category:cat,amount:val,description:desc};
  if (vehicleId) expObj.vehicleId = vehicleId;
  D.expenses.push(expObj);
  if (vehicleId) {
    const veh = (D.vehicles||[]).find(v => v.id === vehicleId);
    if (veh) { if (!veh.linkedExpenses) veh.linkedExpenses=[]; if (!veh.linkedExpenses.includes(expObj.id)) veh.linkedExpenses.push(expObj.id); }
  }
  document.getElementById('exp-val').value='';
  document.getElementById('exp-desc').value='';
  haptic(10); save(); refreshAfterDayEdit();
  notifyRegistered(val, desc || cat, cat);
}

function deleteExpense(id) {
  const exp = D.expenses.find(e => e.id === id);
  if (exp?.vehicleId) {
    const veh = (D.vehicles||[]).find(v => v.id === exp.vehicleId);
    if (veh) veh.linkedExpenses = (veh.linkedExpenses||[]).filter(eid => eid !== id);
  }
  D.expenses=D.expenses.filter(e=>e.id!==id);
  save();
  refreshAfterDayEdit();
}

// ══════════════════════════════════════════
// RENDER: MÊS
// ══════════════════════════════════════════
function renderMes() {
  document.getElementById('month-lbl').textContent=fmtMonthYear(monthOffset);
  const summary=buildMonthSummary(monthOffset);
  const sumEl=document.getElementById('month-summary');
  const sumTxt=document.getElementById('month-summary-text');
  if(summary){sumEl.style.display='';sumTxt.innerHTML=summary;}
  else sumEl.style.display='none';
  const inc=sumMonthIncome(monthOffset), exp=sumMonthExpenses(monthOffset), liq=inc-exp, resv=sumMonthReserva(monthOffset);
  animCount(document.getElementById('mes-inc'), inc);
  animCount(document.getElementById('mes-exp'), exp);
  animCount(document.getElementById('mes-liq'), liq, 650);
  animCount(document.getElementById('mes-resv'), resv);
  document.getElementById('hero-mes').className='hero-card '+(liq>=0?'pos':'neg');

  const dates=monthDates(monthOffset);
  const mExps=D.expenses.filter(e=>dates.includes(e.date));
  const catMap={};
  mExps.forEach(e=>{ catMap[e.category]=(catMap[e.category]||0)+e.amount; });
  const catItems=Object.entries(catMap).sort((a,b)=>b[1]-a[1]).map(([label,value],i)=>({label,value,color:PALETTE[i%PALETTE.length]}));
  renderBigDonut('cat-donut','cat-legend','cat-donut-total',catItems);
  renderCatList('cat-legend', catItems);

  const platItems=D.platforms.map(p=>({label:p.name,value:sumMonthPlat(p.id,monthOffset),color:p.color})).filter(i=>i.value>0);
  renderDonut('plat-donut','plat-legend',platItems);

  const weeks=getMonthWeeks(monthOffset);
  const weekSums=weeks.map(w=>{
    const ds=[];const cur=new Date(w.start);
    while(cur<=w.end){ds.push(dateStr(cur));cur.setDate(cur.getDate()+1);}
    const wI=ds.reduce((s,d)=>s+D.platforms.reduce((ss,p)=>ss+getDayPlatIncome(d,p.id),0),0);
    const wE=D.expenses.filter(e=>ds.includes(e.date)).reduce((s,e)=>s+e.amount,0);
    return {wI,wL:wI-wE};
  });
  const maxWI=Math.max(1,...weekSums.map(w=>w.wI));
  const totalI=weekSums.reduce((s,w)=>s+w.wI,0);
  const totalL=weekSums.reduce((s,w)=>s+w.wL,0);
  const weeksHTML=weekSums.map((w,i)=>`
    <div class="s2s-row">
      <div class="s2s-top">
        <span class="s2s-wlbl">Semana ${i+1}</span>
        <span class="s2s-vals">
          <span class="s2s-val-pair">
            <span class="s2s-val-lbl">Rec.</span>
            <span class="v-green">${w.wI>0?R(w.wI):'—'}</span>
          </span>
          <span class="s2s-val-pair">
            <span class="s2s-val-lbl">Líq.</span>
            <span class="${w.wL>=0?'v-green':'v-red'}">${w.wI>0?R(w.wL):'—'}</span>
          </span>
        </span>
      </div>
      <div class="s2s-bar-wrap"><div class="s2s-bar-fill" style="width:${Math.min(100,(w.wI/maxWI)*100)}%"></div></div>
    </div>`).join('');
  const totalHTML=`
    <div class="s2s-total">
      <span class="s2s-total-lbl">Total do mês</span>
      <span class="s2s-vals">
        <span class="s2s-val-pair">
          <span class="s2s-val-lbl">Rec.</span>
          <span class="v-green">${R(totalI)}</span>
        </span>
        <span class="s2s-val-pair">
          <span class="s2s-val-lbl">Líq.</span>
          <span class="${totalL>=0?'v-green':'v-red'}">${R(totalL)}</span>
        </span>
      </span>
    </div>`;
  document.getElementById('s2s-bars').innerHTML=weeksHTML+totalHTML;
  renderTrendsChart();
  renderCatBudgets();
  renderComparativo(monthOffset);
  renderInsights(monthOffset);
}
function changeMonth(dir) { monthOffset+=dir; renderMes(); }

// ══════════════════════════════════════════
// MONTH PICKER
// ══════════════════════════════════════════
const MONTH_NAMES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
let pickerYear = new Date().getFullYear();

function openMonthPicker() {
  const now = new Date();
  const cur = new Date(); cur.setMonth(cur.getMonth()+monthOffset,1);
  pickerYear = cur.getFullYear();
  renderPickerGrid(now.getFullYear(), now.getMonth());
  openOverlay('modal-month-picker');
}
function shiftPickerYear(dir) {
  pickerYear += dir;
  const now = new Date();
  renderPickerGrid(now.getFullYear(), now.getMonth());
}
function renderPickerGrid(nowY, nowM) {
  document.getElementById('mp-year-lbl').textContent = pickerYear;
  const now = new Date();
  const cur = new Date(); cur.setMonth(cur.getMonth()+monthOffset,1);
  const selY = cur.getFullYear(), selM = cur.getMonth();
  document.getElementById('mp-month-grid').innerHTML = MONTH_NAMES.map((name,m)=>{
    const isSel = pickerYear===selY && m===selM;
    return `<button class="mp-month-btn${isSel?' sel':''}" onclick="pickMonth(${pickerYear},${m})">${name}</button>`;
  }).join('');
}
function pickMonth(year, month) {
  const now = new Date();
  monthOffset = (year - now.getFullYear())*12 + (month - now.getMonth());
  closeOverlay('modal-month-picker');
  renderMes();
}

// ══════════════════════════════════════════
// RENDER: RESERVA
// ══════════════════════════════════════════
function renderReserva() {
  const emg = D.emergency;
  const pct = emg.target > 0 ? Math.min(100, (emg.current / emg.target) * 100) : 0;
  document.getElementById('res-total').textContent = R(emg.current);
  document.getElementById('res-pct').textContent = `${Math.round(pct)}%`;
  const ring = document.getElementById('res-ring-fill');
  ring.style.strokeDasharray = `${RING_CIRC}`;
  ring.style.strokeDashoffset = `${RING_CIRC * (1 - pct / 100)}`;
  document.getElementById('res-meta').textContent =
    `Meta: ${R(emg.target)} — faltam ${R(Math.max(0, emg.target - emg.current))}`;
  const hist = document.getElementById('res-history');
  hist.innerHTML = D.reservaHistory.length
    ? [...D.reservaHistory].reverse().map(h => {
        const lbl = (h.type === 'dep' ? 'Aporte' : 'Retirada') + (h.note ? ` · ${h.note}` : '');
        return `<div class="res-hist-item">
          <div class="res-hist-info">
            <div class="res-hist-lbl">${lbl}</div>
            <div class="res-hist-date">${fmtShort(h.date)}</div>
          </div>
          <span class="res-hist-amt" style="color:${h.type === 'dep' ? 'var(--green)' : 'var(--red)'}">
            ${h.type === 'dep' ? '+' : '−'}${R(h.amount)}
          </span>
          <div class="res-hist-btns">
            <button class="res-hist-edit" onclick="editResHist('${h.id}')" title="Editar">✎</button>
            <button class="res-hist-del" onclick="deleteResHist('${h.id}')" title="Excluir">✕</button>
          </div>
        </div>`;
      }).join('')
    : '<div class="empty-state">Nenhuma movimentação ainda</div>';
}

function openResModal(type) {
  const titles = { dep: 'Adicionar à reserva', ret: 'Retirar da reserva', meta: 'Editar Meta' };
  document.getElementById('res-modal-title').textContent = titles[type];
  document.getElementById('res-modal-body').innerHTML = type === 'meta'
    ? `<div class="fg"><label class="fl">Meta da Reserva</label>
        <input class="fi" type="number" id="rm-meta" value="${D.emergency.target}" min="0" step="100"></div>
       <button class="btn btn-primary" onclick="saveResMeta()">Salvar Meta</button>`
    : `<div class="fg"><label class="fl">Valor</label>
        <input class="fi" type="number" id="rm-val" min="0" step="0.01" placeholder="0,00"></div>
       <div class="fg"><label class="fl">Data</label>
        <input class="fi" type="date" id="rm-date" value="${todayStr()}" max="${todayStr()}"></div>
       <div class="fg"><label class="fl">Observação (opcional)</label>
        <input class="fi" type="text" id="rm-note" placeholder="Ex: salário, emergência..."></div>
       <button class="btn btn-primary" onclick="saveResMove('${type}')">Confirmar</button>`;
  openOverlay('modal-res');
}
function saveResMeta() {
  D.emergency.target = parseFloat(document.getElementById('rm-meta').value) || 0;
  save(); closeOverlay('modal-res'); renderReserva();
}
function saveResMove(type) {
  const val = parseFloat(document.getElementById('rm-val').value) || 0;
  const note = document.getElementById('rm-note').value.trim();
  const dateEl = document.getElementById('rm-date');
  const date = (dateEl && dateEl.value) ? dateEl.value : todayStr();
  if (!val || val <= 0) { alert('Informe um valor válido.'); return; }
  D.emergency.current = type === 'dep' ? D.emergency.current + val : Math.max(0, D.emergency.current - val);
  D.reservaHistory.push({ id: uid(), type, amount: val, note, date });
  save(); renderReserva(); renderInicio();
  if (type === 'ret') {
    window._resRetData = { amount: val, note, date };
    document.getElementById('res-modal-title').textContent = 'Registrar como gasto?';
    document.getElementById('res-modal-body').innerHTML = `
      <p class="res-q-text">Esse valor foi usado em uma despesa?</p>
      <p class="res-q-sub">Se sim, abriremos o formulário já preenchido para você confirmar.</p>
      <div class="res-q-actions">
        <button class="btn btn-secondary res-q-btn" onclick="closeOverlay('modal-res')">Não</button>
        <button class="btn btn-primary res-q-btn" onclick="openExpenseFromReserva()">Sim, registrar gasto</button>
      </div>`;
  } else {
    closeOverlay('modal-res');
  }
}
function openExpenseFromReserva() {
  const d = window._resRetData || {};
  closeOverlay('modal-res');
  const targetDate = d.date || todayStr();
  const amount = d.amount || 0;
  const note = d.note || '';
  const target = parseDate(targetDate);
  const targetMon = getMonday(new Date(target));
  const todayMon = getMonday(new Date());
  const wOff = Math.round((targetMon.getTime() - todayMon.getTime()) / (7 * 24 * 60 * 60 * 1000));
  const dow = target.getDay();
  const dIdx = dow === 0 ? 6 : dow - 1;
  const doOpen = () => {
    weekOffset = wOff;
    renderSemana();
    setTimeout(() => {
      openDayDetail(dIdx);
      setTimeout(() => {
        const expVal = document.getElementById('exp-val');
        const expDesc = document.getElementById('exp-desc');
        if (expVal) expVal.value = amount.toFixed(2);
        if (expDesc && note) expDesc.value = note;
        const sheet = document.querySelector('#modal-day-detail .sheet');
        const expSec = document.getElementById('add-exp-section');
        if (sheet && expSec) sheet.scrollTop = expSec.offsetTop - 20;
      }, 400);
    }, 300);
  };
  if (!document.getElementById('page-semana')?.classList.contains('active')) {
    switchTab('semana');
    setTimeout(doOpen, 350);
  } else {
    doOpen();
  }
}
function editResHist(id) {
  const h = D.reservaHistory.find(e => e.id === id);
  if (!h) return;
  const titles = { dep: 'Editar Aporte', ret: 'Editar Retirada' };
  document.getElementById('res-modal-title').textContent = titles[h.type];
  document.getElementById('res-modal-body').innerHTML = `
    <div class="fg"><label class="fl">Valor</label>
      <input class="fi" type="number" id="rm-val" min="0" step="0.01" value="${h.amount}"></div>
    <div class="fg"><label class="fl">Data</label>
      <input class="fi" type="date" id="rm-date" value="${h.date}" max="${todayStr()}"></div>
    <div class="fg"><label class="fl">Observação (opcional)</label>
      <input class="fi" type="text" id="rm-note" value="${h.note || ''}"></div>
    <button class="btn btn-primary" onclick="updateResHist('${h.id}')">Salvar</button>`;
  openOverlay('modal-res');
}
function updateResHist(id) {
  const val = parseFloat(document.getElementById('rm-val').value) || 0;
  const note = document.getElementById('rm-note').value.trim();
  const dateEl = document.getElementById('rm-date');
  const date = (dateEl && dateEl.value) ? dateEl.value : todayStr();
  if (!val || val <= 0) { alert('Informe um valor válido.'); return; }
  const idx = D.reservaHistory.findIndex(h => h.id === id);
  if (idx === -1) return;
  D.reservaHistory[idx] = { ...D.reservaHistory[idx], amount: val, note, date };
  D.emergency.current = D.reservaHistory.reduce((s, h) => h.type === 'dep' ? s + h.amount : s - h.amount, 0);
  D.emergency.current = Math.max(0, D.emergency.current);
  save(); closeOverlay('modal-res'); renderReserva();
}
// ══════════════════════════════════════════
// WEEKLY GOAL
// ══════════════════════════════════════════
function renderWeekGoal() {
  const el = document.getElementById('week-goal-card');
  if (!el) return;
  const goal = D.weeklyGoal || 0;
  if (!goal) {
    el.innerHTML = `<button class="wg-set-btn" onclick="openWeekGoalModal()">+ Definir meta semanal de receita</button>`;
    return;
  }
  const inc = sumWeekIncome(weekOffset);
  const pct = Math.min(100, (inc/goal)*100);
  const done = inc >= goal;
  const dates = weekDates(weekOffset);
  const now = new Date(); now.setHours(0,0,0,0);
  const today = todayStr();
  // Conta só dias sem receita lançada: dias futuros sempre; hoje só se ainda não tiver nada
  const daysLeft = dates.filter(d => {
    const dDate = parseDate(d);
    if (dDate < now) return false;           // dia passado
    if (d === today) return sumDayIncome(today) === 0; // hoje: só se sem receita
    return true;                              // dia futuro
  }).length;
  let foot = '';
  if (done) foot = 'Meta da semana atingida! 🎉';
  else if (daysLeft === 0) foot = `Faltaram ${R(goal-inc)} pra bater a meta.`;
  else {
    const perDay = Math.ceil((goal - inc) / daysLeft);
    const dayTxt = daysLeft === 1 ? 'hoje' : `por dia nos próx. ${daysLeft} dias`;
    foot = `Faltam <b>${R(goal-inc)}</b> — faça <b>${R(perDay)}</b> ${dayTxt}`;
  }

  el.innerHTML = `
    <div class="wg-top">
      <span class="wg-lbl">Meta da semana</span>
      <button class="wg-edit" onclick="openWeekGoalModal()">···</button>
    </div>
    <div class="wg-vals">
      <span class="wg-current" style="color:${done?'var(--green)':'var(--text)'}">${R(inc)}</span>
      <span class="wg-target">de ${R(goal)}</span>
    </div>
    <div class="wg-bar-wrap"><div class="wg-bar-fill${done?' wg-done':''}" style="width:${pct}%"></div></div>
    <div class="wg-foot">${foot}</div>`;
}

function shareApp() {
  const url = 'https://gustavodga.github.io/GD-CASH/';
  const text = 'Controle suas finanças com clareza e inteligência. Experimenta o Avenco, é gratuito!';
  if (navigator.share) {
    navigator.share({ title: 'Avenco', text, url }).catch(() => {});
  } else {
    navigator.clipboard?.writeText(url).then(() => alert('Link copiado! Cole e envie para quem quiser.'));
  }
}

function openWeekGoalModal() {
  document.getElementById('wg-val').value = D.weeklyGoal || '';
  openOverlay('modal-week-goal');
}
function saveWeekGoal() {
  const val = parseFloat(document.getElementById('wg-val').value) || 0;
  D.weeklyGoal = val;
  save(); closeOverlay('modal-week-goal'); renderWeekGoal(); renderWeekInsight(weekOffset);
}

function renderWeekInsight(off) {
  var el = document.getElementById('sem-insight-section');
  if (!el) return;

  var inc = sumWeekIncome(off);
  var exp = sumWeekExpenses(off);
  var liq = inc - exp;
  var goal = D.weeklyGoal || 0;

  if (inc === 0 && exp === 0) {
    el.innerHTML =
      '<div class="card insights-card insight-neutral">' +
        '<div class="insight-row">Ainda não há dados para analisar esta semana.</div>' +
      '</div>';
    return;
  }

  var dates = weekDates(off);
  var today = todayStr();
  var isCurrentWeek = off === 0;
  var todayIdx = dates.indexOf(today);
  var daysElapsed = isCurrentWeek ? (todayIdx >= 0 ? todayIdx + 1 : 7) : 7;
  var daysLeft = isCurrentWeek && todayIdx >= 0 ? 6 - todayIdx : 0;

  // For fair comparison: only count the same number of elapsed days from previous week
  var prevIncEquiv = isCurrentWeek && daysElapsed < 7
    ? weekDates(off - 1).slice(0, daysElapsed).reduce(function(s, d) { return s + sumDayIncome(d); }, 0)
    : sumWeekIncome(off - 1);
  var prevExpEquiv = isCurrentWeek && daysElapsed < 7
    ? (function() { var ds = weekDates(off - 1).slice(0, daysElapsed); return D.expenses.filter(function(e) { return ds.includes(e.date); }).reduce(function(s, e) { return s + e.amount; }, 0); })()
    : sumWeekExpenses(off - 1);

  var insight = null;

  // 1. Goal achieved
  if (!insight && goal > 0 && inc >= goal) {
    insight = { text: 'Meta da semana atingida com <b>' + R(inc) + '</b>.', state: 'pos' };
  }

  // 2. Goal progress + daily pace (current week, ≥40% done, days left)
  if (!insight && goal > 0 && inc < goal && isCurrentWeek && daysLeft > 0) {
    var needed = goal - inc;
    var pct = Math.round((inc / goal) * 100);
    var perDay = Math.ceil(needed / daysLeft);
    if (pct >= 40) {
      insight = {
        text: 'Faltam <b>' + R(needed) + '</b> para a meta. São <b>' + R(perDay) + '</b> por dia até domingo.',
        state: 'pos'
      };
    }
  }

  // 3. Behind pace vs goal (current week, ≥2 days elapsed, ≥20% behind expected)
  if (!insight && goal > 0 && isCurrentWeek && daysElapsed >= 2) {
    var expected = (goal / 7) * daysElapsed;
    var behindPct = expected > 0 ? Math.round(((expected - inc) / expected) * 100) : 0;
    if (behindPct >= 20 && daysLeft > 0) {
      insight = {
        text: 'Você está <b>' + behindPct + '% abaixo</b> do ritmo necessário para bater a meta.',
        state: 'warn'
      };
    }
  }

  // 4. Income comparison vs equivalent period of previous week (≥15% change)
  if (!insight && prevIncEquiv > 30) {
    var incDiff = Math.round(((inc - prevIncEquiv) / prevIncEquiv) * 100);
    if (incDiff >= 15) {
      var iTxt = incDiff <= 100
        ? 'Receita <b>' + incDiff + '% acima</b> do mesmo período da semana passada.'
        : 'Receita bastante acima do mesmo período da semana passada.';
      insight = { text: iTxt, state: 'pos' };
    } else if (incDiff <= -15) {
      var iTxt = Math.abs(incDiff) <= 100
        ? 'Receita <b>' + Math.abs(incDiff) + '% abaixo</b> do mesmo período da semana passada.'
        : 'Receita bastante abaixo do mesmo período da semana passada.';
      insight = { text: iTxt, state: 'warn' };
    }
  }

  // 5. Expenses up but income also grew — neutral framing
  if (!insight && prevExpEquiv > 0 && prevIncEquiv > 0) {
    var expDiff = Math.round(((exp - prevExpEquiv) / prevExpEquiv) * 100);
    var incDiff2 = Math.round(((inc - prevIncEquiv) / prevIncEquiv) * 100);
    if (expDiff >= 15 && incDiff2 >= 10) {
      insight = { text: 'Os gastos aumentaram, mas sua receita também cresceu.', state: 'neutral' };
    } else if (expDiff >= 20 && incDiff2 < 10) {
      var eTxt = expDiff <= 100
        ? 'Gastos <b>' + expDiff + '% acima</b> do mesmo período da semana passada.'
        : 'Gastos bastante acima do mesmo período da semana passada.';
      insight = { text: eTxt, state: 'warn' };
    }
  }

  // 6. Neutral fallback
  if (!insight) {
    insight = {
      text: liq > 0 ? 'Resultado positivo nesta semana.'
          : liq < 0 ? 'Gastos superaram a receita nesta semana.'
          : 'Receita e gastos equilibrados nesta semana.',
      state: 'neutral'
    };
  }

  var stateClass = insight.state === 'pos' ? '' : ' insight-' + insight.state;
  el.innerHTML =
    '<div class="card insights-card' + stateClass + '">' +
      '<div class="insight-row">' + capInsight(insight.text) + '</div>' +
    '</div>';
}

// ══════════════════════════════════════════
// MONTH SUMMARY
// ══════════════════════════════════════════
function buildMonthSummary(off) {
  const inc = sumMonthIncome(off), exp = sumMonthExpenses(off), liq = inc - exp;
  if (inc === 0 && exp === 0) return null;

  const prevInc = sumMonthIncome(off-1), prevExp = sumMonthExpenses(off-1);
  const dates = monthDates(off);
  const now = new Date(); now.setHours(0,0,0,0);
  const isPast = off < 0;

  const d2 = new Date(); d2.setMonth(d2.getMonth()+off,1);
  const daysInMonth = new Date(d2.getFullYear(),d2.getMonth()+1,0).getDate();
  const dayOfMonth = Math.min(now.getDate(), daysInMonth);
  const pctPassed = Math.round((dayOfMonth/daysInMonth)*100);
  const daysWithData = dates.filter(dt => parseDate(dt)<=now && (sumDayIncome(dt)>0||getDayExpenses(dt).length>0)).length;
  const hasEnoughData = isPast || daysWithData >= 7 || pctPassed >= 25;

  const catMap = {};
  D.expenses.filter(e=>dates.includes(e.date)).forEach(e=>{ catMap[e.category]=(catMap[e.category]||0)+e.amount; });
  const topCat = Object.entries(catMap).sort((a,b)=>b[1]-a[1])[0];
  const topCatPct = topCat && exp>0 ? Math.round((topCat[1]/exp)*100) : 0;

  const savingsRate = inc>0 ? Math.round((liq/inc)*100) : 0;
  const incChange = prevInc>0 ? Math.round(((inc-prevInc)/prevInc)*100) : null;
  const parts = [];

  if (!isPast && !hasEnoughData) {
    parts.push(`Mês começando — ${daysWithData} dia${daysWithData!==1?'s':''} registrado${daysWithData!==1?'s':''}. Resultado até agora: <b>${R(liq)}</b>. Continue registrando pra ter uma análise completa.`);
    return parts[0];
  }

  if (isPast) {
    if (liq>0 && incChange!==null && incChange>15)
      parts.push(`Mês excelente — receita <b>${incChange}% acima</b> do anterior e fechou com <b>${R(liq)}</b> positivo.`);
    else if (liq>0 && savingsRate>=25)
      parts.push(`Boa disciplina: você guardou <b>${savingsRate}%</b> da receita esse mês.`);
    else if (liq>0 && incChange!==null && incChange<-10)
      parts.push(`Receita caiu <b>${Math.abs(incChange)}%</b>, mas o resultado fechou positivo em <b>${R(liq)}</b>.`);
    else if (liq>0)
      parts.push(`Mês fechado no azul: <b>${R(liq)}</b> de resultado positivo.`);
    else
      parts.push(`Mês pesado — gastos superaram a receita em <b>${R(Math.abs(liq))}</b>. Acontece, o importante é saber.`);
    if (topCat && topCatPct>=30)
      parts.push(`<b>${topCat[0]}</b> foi a maior despesa: ${topCatPct}% de tudo que saiu.`);
    if (liq<0)
      parts.push(`Fique de olho em <b>${topCat?topCat[0]:'seus maiores gastos'}</b> no próximo mês.`);
    else if (savingsRate<10)
      parts.push(`Que tal separar pelo menos 10% da receita pra reserva no próximo mês?`);
  } else {
    if (liq<0)
      parts.push(`Atenção: gastos já passaram a receita em <b>${R(Math.abs(liq))}</b>. Ainda dá tempo de equilibrar.`);
    else if (incChange!==null && inc>=(prevInc*(pctPassed/100)*1.15))
      parts.push(`Ritmo acima do esperado — mais forte que no mesmo ponto do mês passado.`);
    else
      parts.push(`<b>${pctPassed}%</b> do mês passou. Resultado atual: <b>${R(liq)}</b>.`);
    if (topCat && topCatPct>=40)
      parts.push(`<b>${topCat[0]}</b> está pesando bastante: ${topCatPct}% dos gastos do mês.`);
    if (incChange!==null && incChange<-20 && pctPassed>40)
      parts.push(`Receita <b>${Math.abs(incChange)}%</b> abaixo do mesmo ponto do mês passado.`);
    const urgentGoal=(D.goals||[]).find(g=>{
      if(g.saved>=g.target) return false;
      const days=Math.round((parseDate(g.deadline)-now)/(1000*60*60*24));
      return days>=0&&days<=60;
    });
    if(urgentGoal){
      const left=Math.max(0,urgentGoal.target-urgentGoal.saved);
      const days=Math.round((parseDate(urgentGoal.deadline)-now)/(1000*60*60*24));
      if(left>0) parts.push(`Meta <b>${urgentGoal.name}</b> em ${days} dias — faltam <b>${R(left)}</b>.`);
    }
  }
  return parts.join(' ') || null;
}

// ══════════════════════════════════════════
// COMPARATIVO MENSAL
// ══════════════════════════════════════════
function renderComparativo(off) {
  var el = document.getElementById('mes-comp-section');
  if (!el) return;

  var cur = getMonthData(off);

  // For current in-progress month compare only the same # of days in prev month
  var isPartialCurrent = off === 0 && cur.period.dayOfMonth < cur.period.daysInMonth;
  var prev = isPartialCurrent ? getMonthData(off - 1, { throughDay: cur.period.dayOfMonth }) : getMonthData(off - 1);

  // Don't show if previous month has absolutely no data
  if (prev.income.total === 0 && prev.expenses.total === 0) { el.innerHTML = ''; return; }

  var prevLabel = isPartialCurrent
    ? (fmtMonthYear(off - 1) + ' (1–' + cur.period.dayOfMonth + ')')
    : fmtMonthYear(off - 1);

  // delta helper — returns display text and color
  // lessIsGood: spending less is positive (expenses)
  function mkDelta(curVal, prevVal, lessIsGood) {
    var diff = curVal - prevVal;
    if (diff === 0) return { text: 'Igual', color: 'var(--text3)' };
    var isGood = lessIsGood ? diff < 0 : diff > 0;
    var arrow = diff > 0 ? '▲' : '▼';
    var absDiff = Math.abs(diff);
    var txt;
    if (prevVal <= 0) {
      txt = arrow + ' ' + R(absDiff);
    } else {
      var pct = Math.round(absDiff / prevVal * 100);
      txt = pct <= 100
        ? arrow + ' ' + R(absDiff) + ' (' + pct + '%)'
        : arrow + ' ' + R(absDiff);
    }
    return { text: txt, color: isGood ? 'var(--green)' : 'var(--red)' };
  }

  var incD = mkDelta(cur.income.total, prev.income.total, false);
  var expD = mkDelta(cur.expenses.total, prev.expenses.total, true);
  var resD = mkDelta(cur.result.net, prev.result.net, false);
  var rvD  = mkDelta(cur.reserve.net, prev.reserve.net, false);

  var partialNote = isPartialCurrent
    ? '<div class="comp-note">Mês em andamento — comparando primeiros ' + cur.period.dayOfMonth + ' dias</div>'
    : '';

  // Reserve row: only show if either month had any reserve movement
  var hasReserve = cur.reserve.net !== 0 || prev.reserve.net !== 0;
  var resvSign = cur.reserve.net >= 0 ? (cur.reserve.net > 0 ? '+' : '') : '';
  var resvRow = hasReserve
    ? '<div class="comp-row"><span class="comp-lbl">Reserva</span><span class="comp-cur" style="color:' + (cur.reserve.net >= 0 ? 'var(--green)' : 'var(--red)') + '">' + resvSign + R(cur.reserve.net) + '</span><span class="comp-delta" style="color:' + rvD.color + '">' + rvD.text + '</span></div>'
    : '';

  // Top category changes (only if prev has expense data and pct change >= 12)
  var catChips = '';
  if (prev.expenses.total > 0 && cur.expenses.byCategory.length > 0) {
    var prevCatMap = {};
    prev.expenses.byCategory.forEach(function(c) { prevCatMap[c.cat] = c.amount; });
    var chips = cur.expenses.byCategory.slice(0, 4).map(function(c) {
      var p = prevCatMap[c.cat] || 0;
      if (!p || p < 20) return null;
      var pct = Math.round((c.amount - p) / p * 100);
      if (Math.abs(pct) < 12) return null;
      var good = pct < 0;
      var badge = Math.abs(pct) <= 100
        ? (pct > 0 ? '▲' : '▼') + Math.abs(pct) + '%'
        : (pct > 0 ? '▲ ' : '▼ ') + R(Math.abs(c.amount - p));
      return '<span class="comp-cat-chip ' + (good ? 'gn' : 'rd') + '">' + c.cat + ' ' + badge + '</span>';
    }).filter(Boolean).slice(0, 3);
    if (chips.length) catChips = '<div class="comp-cats">' + chips.join('') + '</div>';
  }

  var resultSign = cur.result.net >= 0 ? '' : '';
  el.innerHTML =
    '<div class="sec-title">Comparativo com ' + prevLabel + '</div>' +
    '<div class="card comp-card">' +
      partialNote +
      '<div class="comp-row"><span class="comp-lbl">Receita</span><span class="comp-cur">' + R(cur.income.total) + '</span><span class="comp-delta" style="color:' + incD.color + '">' + incD.text + '</span></div>' +
      '<div class="comp-row"><span class="comp-lbl">Gastos</span><span class="comp-cur">' + R(cur.expenses.total) + '</span><span class="comp-delta" style="color:' + expD.color + '">' + expD.text + '</span></div>' +
      '<div class="comp-row"><span class="comp-lbl">Resultado</span><span class="comp-cur" style="color:' + (cur.result.net >= 0 ? 'var(--green)' : 'var(--red)') + '">' + R(cur.result.net) + '</span><span class="comp-delta" style="color:' + resD.color + '">' + resD.text + '</span></div>' +
      resvRow +
      catChips +
    '</div>';
}

// ══════════════════════════════════════════
// INSIGHTS DETERMINÍSTICOS
// ══════════════════════════════════════════

// Strip HTML tags, count plain-text chars, truncate at word boundary if > max
function capInsight(html, max) {
  max = max || 160;
  var plain = html.replace(/<[^>]+>/g, '');
  if (plain.length <= max) return html;
  var cut = max - 3;
  while (cut > max * 0.6 && plain[cut] !== ' ') cut--;
  var out = '', count = 0, inTag = false;
  for (var i = 0; i < html.length; i++) {
    if (html[i] === '<') inTag = true;
    if (!inTag) count++;
    out += html[i];
    if (html[i] === '>') inTag = false;
    if (!inTag && count >= cut) { out += '…'; break; }
  }
  return out;
}

function renderInsights(off) {
  var el = document.getElementById('mes-insights-section');
  if (!el) return;

  var cur = getMonthData(off);
  if (cur.income.total === 0 && cur.expenses.total === 0) { el.innerHTML = ''; return; }

  // For partial current month, compare only equivalent days of previous month
  var isPartial = off === 0 && cur.period.pctPassed < 100;
  var prev = isPartial
    ? getMonthData(off - 1, { throughDay: cur.period.dayOfMonth })
    : getMonthData(off - 1);

  var inc = cur.income.total, exp = cur.expenses.total, liq = cur.result.net;
  var prevInc = prev.income.total, prevExp = prev.expenses.total, prevLiq = prev.result.net;

  var insight = null; // { text, state } — state: 'pos' | 'warn' | 'neutral'

  // 1. Budget utilization warning (≥90% of income already spent)
  if (!insight && inc > 0 && exp / inc >= 0.90) {
    var usedPct = Math.round(exp / inc * 100);
    insight = {
      text: 'Você já utilizou <b>' + usedPct + '%</b> da receita registrada neste mês.',
      state: 'warn'
    };
  }

  // 2. Expense comparison vs previous period (≥10% change worth noting)
  if (!insight && prevExp > 30) {
    var diffPct = Math.round((exp - prevExp) / prevExp * 100);
    if (diffPct <= -10) {
      var downTxt = Math.abs(diffPct) <= 100
        ? 'Você gastou <b>' + Math.abs(diffPct) + '% menos</b> que no mesmo período do mês passado.'
        : 'Você gastou <b>' + R(Math.abs(exp - prevExp)) + ' a menos</b> que no mesmo período do mês passado.';
      insight = { text: downTxt, state: 'pos' };
    } else if (diffPct >= 15) {
      var upTxt = diffPct <= 100
        ? 'Seus gastos subiram <b>' + diffPct + '%</b> em relação ao mesmo período do mês passado.'
        : 'Seus gastos aumentaram bastante em relação ao mesmo período anterior.';
      insight = { text: upTxt, state: 'warn' };
    }
  }

  // 3. Result improved driven mainly by expenses falling (not just income rising)
  if (!insight && liq > 0 && prevLiq < liq && prevExp > exp && prevInc <= inc * 1.05) {
    insight = {
      text: 'Seu resultado melhorou principalmente porque os gastos caíram.',
      state: 'pos'
    };
  }

  // 4. Reserve deposited and result stays positive — highlight the positive behavior
  if (!insight && cur.reserve.totalDeposited > 0 && liq >= 0) {
    insight = {
      text: 'Você guardou <b>' + R(cur.reserve.totalDeposited) + '</b> neste mês sem comprometer seu resultado.',
      state: 'pos'
    };
  }

  // 5. Top expense category dominates (≥30% of total expenses)
  if (!insight && cur.expenses.byCategory.length > 0 && exp > 0) {
    var top = cur.expenses.byCategory[0];
    var topPct = Math.round(top.amount / exp * 100);
    if (topPct >= 30 && top.amount >= 80) {
      insight = {
        text: '<b>' + top.cat + '</b> representa <b>' + topPct + '%</b> dos seus gastos neste mês.',
        state: topPct >= 50 ? 'warn' : 'neutral'
      };
    }
  }

  // 6. Vehicle cost notable (≥20% of expenses)
  if (!insight && cur.vehicles.byCost.length > 0 && exp > 0) {
    var veh = cur.vehicles.byCost[0];
    var vPct = Math.round(veh.cost / exp * 100);
    if (vPct >= 20) {
      insight = {
        text: '<b>' + veh.name + '</b> representou <b>' + R(veh.cost) + '</b> em gastos neste período.',
        state: 'neutral'
      };
    }
  }

  // 7. Neutral fallback when there's data but no notable signal
  if (!insight && (inc > 0 || exp > 0)) {
    insight = {
      text: liq > 0 ? 'Resultado positivo neste período.'
          : liq < 0 ? 'Gastos superaram a receita neste período.'
          : 'Receita e gastos equilibrados neste período.',
      state: 'neutral'
    };
  }

  if (!insight) { el.innerHTML = ''; return; }

  var stateClass = insight.state === 'pos' ? '' : ' insight-' + insight.state;
  el.innerHTML =
    '<div class="sec-title">Destaque do mês</div>' +
    '<div class="card insights-card' + stateClass + '">' +
      '<div class="insight-row">' + capInsight(insight.text) + '</div>' +
    '</div>';
}

// ══════════════════════════════════════════
// GOALS (METAS)
// ══════════════════════════════════════════
function renderGoals() {
  const el = document.getElementById('goals-list');
  if (!el) return;
  if (!D.goals || !D.goals.length) {
    el.innerHTML = '<div class="card"><div class="empty-state">Nenhuma meta ainda</div></div>';
    return;
  }
  const today = new Date(); today.setHours(0,0,0,0);
  el.innerHTML = D.goals.map(g => {
    const pct = g.target > 0 ? Math.min(100, (g.saved / g.target) * 100) : 0;
    const left = Math.max(0, g.target - g.saved);
    const dl = parseDate(g.deadline);
    const daysLeft = Math.round((dl - today) / (1000*60*60*24));
    const done = g.saved >= g.target;
    const statusTxt = done ? 'Meta atingida! 🎉'
      : daysLeft < 0 ? 'Prazo encerrado'
      : daysLeft === 0 ? 'Hoje é o prazo!'
      : `${daysLeft} dia${daysLeft !== 1 ? 's' : ''} restantes`;
    const statusClass = done ? 'goal-done-txt' : daysLeft >= 0 && daysLeft <= 7 ? 'goal-urgent-txt' : '';
    const cardClass = done ? ' goal-done' : (!done && daysLeft >= 0 && daysLeft <= 7) ? ' goal-urgent' : '';
    return `
      <div class="goal-card${cardClass}">
        <div class="goal-header">
          <span class="goal-emoji">${g.emoji||'🎯'}</span>
          <div class="goal-info">
            <div class="goal-name">${g.name}</div>
            <div class="goal-meta">${fmtShort(g.deadline)} · <span class="${statusClass}">${statusTxt}</span></div>
          </div>
          <div class="goal-btns">
            <button class="fixed-del" onclick="openGoalModal('${g.id}')">···</button>
            <button class="fixed-del" onclick="deleteGoal('${g.id}')">✕</button>
          </div>
        </div>
        <div class="goal-bar-wrap">
          <div class="goal-bar-fill${done?' goal-bar-done':''}" style="width:${pct}%"></div>
        </div>
        <div class="goal-footer">
          <span class="goal-saved-txt">${R(g.saved)} guardados</span>
          <span class="goal-pct-txt">${Math.round(pct)}%</span>
          <span class="goal-left-txt">${done ? '' : 'Faltam '+R(left)}</span>
        </div>
        ${!done ? `<button class="btn btn-secondary goal-add-btn" onclick="openAddToGoal('${g.id}')">+ Adicionar valor</button>` : ''}
      </div>`;
  }).join('');
}

function openGoalModal(id) {
  const g = id ? D.goals.find(g => g.id === id) : null;
  document.getElementById('goal-modal-title').textContent = g ? 'Editar Meta' : 'Nova Meta';
  document.getElementById('goal-edit-id').value = id || '';
  document.getElementById('goal-emoji').value = g?.emoji || '';
  document.getElementById('goal-name').value = g?.name || '';
  document.getElementById('goal-target').value = g?.target || '';
  document.getElementById('goal-saved-inp').value = g?.saved || '';
  document.getElementById('goal-deadline').value = g?.deadline || '';
  document.getElementById('goal-note').value = g?.note || '';
  openOverlay('modal-goal');
}

function saveGoal() {
  const id = document.getElementById('goal-edit-id').value;
  const name = document.getElementById('goal-name').value.trim();
  const emoji = document.getElementById('goal-emoji').value.trim() || '🎯';
  const target = parseFloat(document.getElementById('goal-target').value) || 0;
  const saved = parseFloat(document.getElementById('goal-saved-inp').value) || 0;
  const deadline = document.getElementById('goal-deadline').value;
  const note = document.getElementById('goal-note').value.trim();
  if (!name || !target || !deadline) { alert('Preencha nome, valor e prazo.'); return; }
  if (id) {
    const idx = D.goals.findIndex(g => g.id === id);
    if (idx !== -1) D.goals[idx] = { ...D.goals[idx], name, emoji, target, saved, deadline, note };
  } else {
    D.goals.push({ id: uid(), name, emoji, target, saved, deadline, note, lastNotif: '' });
    maybePromptNotif();
  }
  save(); closeOverlay('modal-goal'); renderGoals();
}

function deleteGoal(id) {
  if (!confirm('Excluir esta meta?')) return;
  D.goals = D.goals.filter(g => g.id !== id);
  save(); renderGoals();
}

function openAddToGoal(id) {
  const g = D.goals.find(g => g.id === id);
  if (!g) return;
  document.getElementById('goal-dep-title').textContent = `${g.emoji||'🎯'} ${g.name}`;
  document.getElementById('goal-dep-id').value = id;
  document.getElementById('goal-dep-val').value = '';
  openOverlay('modal-goal-dep');
}

function saveGoalDep() {
  const id = document.getElementById('goal-dep-id').value;
  const val = parseFloat(document.getElementById('goal-dep-val').value) || 0;
  if (!val || val <= 0) { alert('Informe um valor válido.'); return; }
  const g = D.goals.find(g => g.id === id);
  if (!g) return;
  g.saved = (g.saved || 0) + val;
  save(); closeOverlay('modal-goal-dep'); renderGoals();
}

// ── Notificações ──
function maybePromptNotif() {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'default') return;
  if (localStorage.getItem('gdcash_notif_dismissed')) return;
  setTimeout(() => openOverlay('modal-notif-perm'), 500);
}

function checkGoalNotifications() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (!D.goals || !D.goals.length) return;
  const today = new Date(); today.setHours(0,0,0,0);
  let changed = false;
  D.goals.forEach(g => {
    if (g.saved >= g.target || g.lastNotif === todayStr()) return;
    const dl = parseDate(g.deadline);
    const daysLeft = Math.round((dl - today) / (1000*60*60*24));
    if (daysLeft < 0 || daysLeft > 30) return;
    const body = daysLeft === 0
      ? `Hoje é o prazo! Faltam ${R(Math.max(0, g.target - g.saved))}`
      : `Faltam ${daysLeft} dia${daysLeft !== 1 ? 's' : ''} — ainda precisa de ${R(Math.max(0, g.target - g.saved))}`;
    new Notification(`${g.emoji||'🎯'} ${g.name}`, { body, icon: '/GD-CASH/icon-192.png' });
    g.lastNotif = todayStr();
    changed = true;
  });
  if (changed) save();
}

function deleteResHist(id) {
  if (!D.reservaHistory.find(h => h.id === id)) return;
  if (!confirm('Excluir esta movimentação?')) return;
  D.reservaHistory = D.reservaHistory.filter(h => h.id !== id);
  D.emergency.current = D.reservaHistory.reduce((s, h) => h.type === 'dep' ? s + h.amount : s - h.amount, 0);
  D.emergency.current = Math.max(0, D.emergency.current);
  save(); renderReserva();
}

// ══════════════════════════════════════════
// RENDER: FIXOS
// ══════════════════════════════════════════
function renderFixos() {
  document.getElementById('fixed-total').textContent=R(D.fixedExpenses.reduce((s,f)=>s+f.amount,0));
  const list=document.getElementById('fixed-list');
  list.innerHTML=D.fixedExpenses.length
    ? D.fixedExpenses.map(f=>`
        <div class="fixed-item">
          <div class="fixed-info">
            <div class="fixed-name">${f.name}</div>
            <div class="fixed-meta">${f.category}${f.dueDay?' · Vence dia '+f.dueDay:''}</div>
          </div>
          <div class="fixed-right">
            <span class="fixed-amt">${R(f.amount)}</span>
            <button class="fixed-del" onclick="openFixedModal('${f.id}')">···</button>
            <button class="fixed-del" onclick="deleteFixed('${f.id}')">✕</button>
          </div>
        </div>`).join('')
    : '<div class="empty-state">Nenhum gasto fixo cadastrado</div>';
}
function openFixedModal(id) {
  const f=id?D.fixedExpenses.find(f=>f.id===id):null;
  document.getElementById('fixed-modal-title').textContent=f?'Editar Gasto Fixo':'Novo Gasto Fixo';
  document.getElementById('fixed-edit-id').value=id||'';
  document.getElementById('fi-name').value=f?.name||'';
  document.getElementById('fi-amount').value=f?.amount||'';
  document.getElementById('fi-day').value=f?.dueDay||'';
  document.getElementById('fi-cat').innerHTML=D.expCats.map(c=>`<option value="${c}" ${f?.category===c?'selected':''}>${c}</option>`).join('');
  openOverlay('modal-fixed');
}
function deleteFixed(id) { D.fixedExpenses=D.fixedExpenses.filter(f=>f.id!==id); save(); renderFixos(); }
function saveFixed() {
  const id=document.getElementById('fixed-edit-id').value;
  const name=document.getElementById('fi-name').value.trim();
  const amount=parseFloat(document.getElementById('fi-amount').value)||0;
  const category=document.getElementById('fi-cat').value;
  const dueDay=parseInt(document.getElementById('fi-day').value)||null;
  if(!name||!amount){alert('Preencha nome e valor.');return;}
  if(id) { const idx=D.fixedExpenses.findIndex(f=>f.id===id); if(idx!==-1) D.fixedExpenses[idx]={...D.fixedExpenses[idx],name,amount,category,dueDay}; }
  else D.fixedExpenses.push({id:uid(),name,amount,category,dueDay});
  save(); closeOverlay('modal-fixed'); renderFixos();
}

// ══════════════════════════════════════════
// PLATFORM SETTINGS
// ══════════════════════════════════════════
function openPlatSettings() {
  document.getElementById('plat-settings-body').innerHTML=D.platforms.map((p,i)=>`
    <div class="set-row">
      <div class="color-dot" style="background:${p.color}" onclick="cyclePlatColor(${i})" title="Trocar cor"></div>
      <input class="fi" type="text" value="${p.name}" style="flex:1;padding:8px 10px;font-size:14px"
        onchange="D.platforms[${i}].name=this.value;save()">
      ${D.platforms.length>1?`<button class="row-del" onclick="deletePlatform(${i})">✕</button>`:''}
    </div>`).join('');
  openOverlay('modal-plat');
}
function cyclePlatColor(i) { const idx=PALETTE.indexOf(D.platforms[i].color); D.platforms[i].color=PALETTE[(idx+1)%PALETTE.length]; save(); openPlatSettings(); }
function addPlatform() { D.platforms.push({id:uid(),name:'Nova Fonte',color:PALETTE[D.platforms.length%PALETTE.length]}); save(); openPlatSettings(); }
function deletePlatform(i) { if(D.platforms.length<=1){alert('Mantenha ao menos 1 plataforma.');return;} D.platforms.splice(i,1); save(); openPlatSettings(); }

// ══════════════════════════════════════════
// CATEGORY MANAGEMENT
// ══════════════════════════════════════════
function openCatModal() {
  renderCatList();
  openOverlay('modal-cats');
}
function renderCatList() {
  const el = document.getElementById('cats-list');
  if (!el) return;
  el.innerHTML = D.expCats.map((c, i) => `
    <div class="set-row">
      <input class="fi" type="text" value="${c}" style="flex:1;padding:7px 10px;font-size:13px"
        onchange="renameCat(${i}, this.value)">
      ${D.expCats.length > 1 ? `<button class="row-del" onclick="deleteCat(${i})">✕</button>` : ''}
    </div>`).join('');
}
function addCat() {
  const inp = document.getElementById('new-cat-input');
  const name = inp.value.trim();
  if (!name) { alert('Informe um nome para a categoria.'); return; }
  if (D.expCats.includes(name)) { alert('Categoria já existe.'); return; }
  D.expCats.push(name);
  save();
  inp.value = '';
  renderCatList();
  populateExpCatSel();
}
function renameCat(i, name) {
  const trimmed = name.trim();
  if (!trimmed) return;
  const old = D.expCats[i];
  D.expCats[i] = trimmed;
  D.expenses.forEach(e => { if (e.category === old) e.category = trimmed; });
  save();
  populateExpCatSel();
}
function deleteCat(i) {
  const name = D.expCats[i];
  const inUse = D.expenses.some(e => e.category === name);
  if (inUse && !confirm(`A categoria "${name}" está em uso em alguns gastos. Deseja mesmo excluir? Os gastos ficarão com a categoria anterior.`)) return;
  D.expCats.splice(i, 1);
  save();
  renderCatList();
  populateExpCatSel();
}

// ══════════════════════════════════════════
// OVERLAY
// ══════════════════════════════════════════
function openOverlay(id)  { document.getElementById(id).classList.add('open'); }
function closeOverlay(id) { document.getElementById(id).classList.remove('open'); }
document.querySelectorAll('.overlay').forEach(o=>o.addEventListener('click',e=>{ if(e.target===o) o.classList.remove('open'); }));
document.addEventListener('keydown',e=>{ if(e.key==='Escape') document.querySelectorAll('.overlay.open').forEach(o=>o.classList.remove('open')); });

// Refresh Semana hero when day-detail panel closes (any close path)
new MutationObserver((mutations) => {
  for (const m of mutations) {
    if (m.attributeName === 'class' && !m.target.classList.contains('open')) {
      refreshAfterDayEdit();
      renderDayAccordion();
    }
  }
}).observe(document.getElementById('modal-day-detail'), { attributes: true });

// ══════════════════════════════════════════
// TABS
// ══════════════════════════════════════════
function switchTab(tab) {
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'));
  const page = document.getElementById('page-'+tab);
  if (!page) return;
  page.classList.add('active');
  document.querySelector(`[data-tab="${tab}"]`)?.classList.add('active');
  // Highlight "Mais" button for secondary tabs
  const moreTabs = ['fixos','conversor','ajustes','lembretes','pendencias','patrimonio'];
  if(tab==='inicio')    { renderInicio(); renderInicioCards(); }
  if(tab==='semana')    { renderSemana(); renderDayAccordion(); }
  if(tab==='mes')       renderMes();
  if(tab==='reserva')   renderReserva();
  if(tab==='metas')     renderGoals();
  if(tab==='fixos')      renderFixos();
  if(tab==='conversor')  loadConversorRates();
  if(tab==='ajustes')    { renderBudgetSettings(); initSettingsExtras(); }
  if(tab==='lembretes')  renderLembretes();
  if(tab==='pendencias') renderPendencias();
  if(tab==='patrimonio') renderPatrimonio();
  // Show FAB only on main tabs
  const fab = document.getElementById('global-fab');
  if (fab) fab.style.display = tab === 'semana' ? '' : 'none';
  checkFirstVisit(tab);
  page.classList.add('tab-fresh');
  page.querySelectorAll('.card,.hero-card').forEach((el,i)=>{
    el.style.setProperty('--sd', (i*0.055)+'s');
  });
  setTimeout(()=>page.classList.remove('tab-fresh'), 900);
}

// ══════════════════════════════════════════
// CONVERSOR DE MOEDAS
// ══════════════════════════════════════════
let convRates = null;
let convRatesLoaded = false;

async function loadConversorRates() {
  if (convRatesLoaded) { convertCurrency(); return; }
  const rateEl   = document.getElementById('conv-rate');
  const updatedEl= document.getElementById('conv-updated');
  if (rateEl) rateEl.textContent = 'Buscando cotação...';
  try {
    const res  = await fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/brl.json');
    const data = await res.json();
    convRates = { ...data.brl, brl: 1 };
    convRatesLoaded = true;
    if (updatedEl) updatedEl.textContent = 'Cotação do dia: ' + data.date;
    convertCurrency();
  } catch {
    if (rateEl) rateEl.textContent = 'Sem conexão. Verifique a internet.';
  }
}

function convertCurrency() {
  if (!convRates) return;
  const amount = parseFloat(document.getElementById('conv-amount').value) || 0;
  const from   = document.getElementById('conv-from').value;
  const to     = document.getElementById('conv-to').value;

  // convRates[x] = how many x per 1 BRL
  const inBRL  = amount / convRates[from];
  const result = inBRL  * convRates[to];
  const rate   = convRates[to] / convRates[from];

  const SYMBOLS = { brl: 'R$', usd: 'US$', eur: '€', gbp: '£' };
  const fmt = (v, cur) => `${SYMBOLS[cur]} ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  document.getElementById('conv-result').textContent = amount > 0 ? fmt(result, to) : '—';
  document.getElementById('conv-rate').textContent   = `1 ${from.toUpperCase()} = ${fmt(rate, to)}`;
}

function swapCurrencies() {
  const fromEl = document.getElementById('conv-from');
  const toEl   = document.getElementById('conv-to');
  const tmp    = fromEl.value;
  fromEl.value = toEl.value;
  toEl.value   = tmp;
  convertCurrency();
}

// ══════════════════════════════════════════
// DEMO MODE
// ══════════════════════════════════════════
var DEMO_MODE = false;
let _realD = null;

function buildDemoData() {
  const w = weekDates(0);
  const prev = weekDates(-1);
  const now = new Date();
  const m = (off) => {
    const d = new Date(now.getFullYear(), now.getMonth() + off, 1);
    const days = [];
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    for (let i = 1; i <= last; i++) {
      const dd = new Date(d.getFullYear(), d.getMonth(), i);
      days.push(dateStr(dd));
    }
    return days;
  };

  const inc = {};
  // Esta semana
  inc[w[0]] = { d1: 185, d2: 90 };
  inc[w[1]] = { d1: 210, d2: 140 };
  inc[w[2]] = { d1: 170 };           // d3 coberto por incomeItems
  inc[w[3]] = { d1: 195, d2: 75 };
  inc[w[4]] = { d1: 240 };           // d2 coberto por incomeItems
  // Semana passada
  inc[prev[0]] = { d1: 160, d2: 95 };
  inc[prev[1]] = { d1: 230 };
  inc[prev[2]] = { d1: 175, d3: 350 };
  inc[prev[3]] = { d1: 200, d2: 110 };
  inc[prev[4]] = { d1: 185 };
  inc[prev[5]] = { d1: 90 };

  // Meses anteriores
  const mkInc = (days, base) => {
    days.forEach((d, i) => {
      if (i % 7 === 6) return;
      const r = base + (Math.sin(i * 1.7) * base * 0.3);
      if (r > 50) inc[d] = { d1: Math.round(r * 0.6), d2: Math.round(r * 0.25), d3: i % 14 === 0 ? Math.round(r * 0.5) : 0 };
    });
  };
  mkInc(m(-1), 200); mkInc(m(-2), 185); mkInc(m(-3), 215); mkInc(m(-4), 170); mkInc(m(-5), 195);

  const exps = [];
  const addExp = (date, cat, amt, desc) => exps.push({ id: uid(), date, category: cat, amount: amt, description: desc });
  // Esta semana
  addExp(w[0], 'Gasolina', 85, 'Shell');
  addExp(w[1], 'Alimentação', 38, 'Almoço');
  addExp(w[2], 'Gasolina', 95, 'Posto BR');
  addExp(w[3], 'Serviços', 19.90, 'Spotify');
  addExp(w[4], 'Alimentação', 55, 'Mercado');
  // Semana passada
  addExp(prev[1], 'Gasolina', 90, 'Ipiranga');
  addExp(prev[2], 'Lazer', 65, 'Cinema');
  addExp(prev[3], 'Alimentação', 42, 'iFood');
  addExp(prev[4], 'Saúde', 80, 'Farmácia');
  // Meses anteriores
  const addMonthExp = (days) => {
    addExp(days[3],  'Gasolina',    320, 'Abastecimento');
    addExp(days[5],  'Moradia',     900, 'Aluguel');
    addExp(days[8],  'Alimentação', 280, 'Supermercado');
    addExp(days[10], 'Serviços',     89.90, 'Internet');
    addExp(days[12], 'Lazer',        120, 'Sair com amigos');
    addExp(days[15], 'Gasolina',     90, 'Gasolina');
    addExp(days[18], 'Saúde',        150, 'Consulta');
    addExp(days[20], 'Alimentação',   95, 'Restaurante');
    addExp(days[22], 'Transporte',    48, 'Uber');
  };
  addMonthExp(m(-1)); addMonthExp(m(-2)); addMonthExp(m(-3)); addMonthExp(m(-4)); addMonthExp(m(-5));

  return {
    platforms: [
      { id:'d1', name:'Uber Eats',  color:'#00e6a0' },
      { id:'d2', name:'iFood',      color:'#ffb800' },
      { id:'d3', name:'Freelance',  color:'#3ec6ff' },
    ],
    dailyIncome: inc,
    daysOff: [w[5], w[6]],
    expenses: exps,
    expCats: ['Gasolina','Alimentação','Moradia','Saúde','Lazer','Transporte','Serviços','Outros'],
    fixedExpenses: [
      { id:'fx1', name:'Aluguel',     amount:900,   category:'Moradia',   dueDay:5  },
      { id:'fx2', name:'Internet',    amount:89.90, category:'Serviços',  dueDay:10 },
      { id:'fx3', name:'Seguro moto', amount:120,   category:'Serviços',  dueDay:15 },
    ],
    emergency: { target:10000, current:3200 },
    reservaHistory: [
      { id:'rh1', type:'dep', amount:1500, note:'Reserva mensal', date: prev[0] },
      { id:'rh2', type:'dep', amount:1200, note:'Salário extra',  date: prev[2] },
      { id:'rh3', type:'dep', amount:800,  note:'Freela',          date: w[0]   },
      { id:'rh4', type:'ret', amount:300,  note:'Compras urgentes', date: w[1]  },
    ],
    goals: [
      { id:'gd1', name:'iPhone 16 Pro', emoji:'📱', target:8000, saved:2400, deadline:'2026-12-31', note:'', lastNotif:'' },
      { id:'gd2', name:'Viagem praia',   emoji:'🏖️', target:3000, saved:1200, deadline:'2026-10-15', note:'', lastNotif:'' },
    ],
    weeklyGoal: 1500,
    catBudgets: { 'Gasolina': 400, 'Alimentação': 300 },
    reminders: (() => {
      const d = new Date(); d.setHours(0,0,0,0);
      const add = (n) => { const x = new Date(d); x.setDate(x.getDate()+n); return dateStr(x); };
      return [
        { id:'rm1', name:'Troca de óleo',  date:add(5),  notifDaysBefore:2, repeat:'monthly', lastNotif:'' },
        { id:'rm2', name:'Revisão do carro', date:add(18), notifDaysBefore:7, repeat:'yearly',  lastNotif:'' },
      ];
    })(),
    incomeItems: [
      { id:'ii1', date:w[2], platformId:'d3', amount:350, note:'Site cliente — sinal',    status:'paid'    },
      { id:'ii2', date:w[2], platformId:'d3', amount:150, note:'Site cliente — restante', status:'pending' },
      { id:'ii3', date:w[4], platformId:'d2', amount:35,  note:'Almoço Zona Norte',       status:'paid'    },
      { id:'ii4', date:w[4], platformId:'d2', amount:25,  note:'Lanche tarde',             status:'paid'    },
    ],
    vehicles: [
      {
        id:'vh1', name:'Prius Preto', brand:'Toyota', model:'Prius', year:'2022',
        color:'Preto', plate:'BRA2E19', km:38400, photo:null,
        notes:'Principal. Revisão anual em dezembro.',
        status:'na_oficina',
        history:[
          { id:'vh1h1', type:'km_update', date:prev[2], note:'', km:38400 },
          { id:'vh1h2', type:'evento',    date:w[0],    note:'Levado à oficina — barulho no freio' },
        ],
        linkedExpenses:[], linkedPendencias:[],
      },
      {
        id:'vh2', name:'Prius Vermelho', brand:'Toyota', model:'Prius', year:'2019',
        color:'Vermelho', plate:'ABC1234', km:72000, photo:null,
        notes:'Segundo veículo. IPVA vence em fevereiro.',
        status:'em_uso',
        history:[
          { id:'vh2h1', type:'km_update', date:prev[0], note:'', km:72000 },
        ],
        linkedExpenses:[], linkedPendencias:[],
      },
    ],
  };
}

function startDemo() {
  DEMO_MODE = true;
  _realD = D;
  D = buildDemoData();
  weekOffset = 0;
  monthOffset = 0;
  selDayIdx = (() => { const d=new Date().getDay(); return d===0?6:d-1; })();
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('demo-banner').style.display = 'flex';
  document.getElementById('curr-chip').textContent = currSym;
  switchTab('inicio');
  setTimeout(startTour, 600);
}

function exitDemo() {
  DEMO_MODE = false;
  D = _realD || defaultData();
  weekOffset = 0;
  monthOffset = 0;
  selDayIdx = (() => { const d=new Date().getDay(); return d===0?6:d-1; })();
  document.getElementById('demo-banner').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
  closeTour();
}

// ── Tour ──
const TOUR_STEPS = [
  { tab:'inicio',  anchor:'car-inner',       title:'Tela Início',            text:'Resumo da semana, reserva e movimentações recentes. É aqui que você começa o dia no Avenco.' },
  { tab:'semana',  anchor:'days-accordion',  title:'Dias da semana',          text:'Veja e edite os lançamentos de cada dia. Toque em um dia para expandir. Use o + para adicionar receita ou gasto.' },
  { tab:'mes',     anchor:'big-donut-card', title:'Gastos por categoria',    text:'No mês você vê exatamente onde o dinheiro foi — o gráfico de rosca mostra cada categoria.' },
  { tab:'mes',     anchor:'trends-chart',   title:'Histórico 6 meses',       text:'Barras verdes são receita, vermelhas são gastos. Fica claro se você está evoluindo mês a mês.' },
  { tab:'reserva', anchor:'res-ring-wrap',  title:'Reserva de emergência',   text:'Deposite aos poucos e acompanhe quanto falta para a sua meta de reserva.' },
  { tab:'metas',   anchor:'goals-list',      title:'Suas metas',              text:'Defina metas com prazo e valor — iPhone, viagem, o que for. O app acompanha o progresso.', last:true },
];
let tourStep = 0;

function startTour() {
  tourStep = 0;
  showTourStep();
}

function showTourStep() {
  const s = TOUR_STEPS[tourStep];
  const overlay = document.getElementById('tour-overlay');
  const card    = document.getElementById('tour-card');
  overlay.style.display = 'block';

  document.getElementById('tour-step-lbl').textContent = `${tourStep+1} / ${TOUR_STEPS.length}`;
  document.getElementById('tour-title').textContent = s.title;
  document.getElementById('tour-text').textContent  = s.text;
  document.getElementById('tour-next').textContent  = s.last ? 'Começar de verdade →' : 'Próximo';

  if (s.tab) switchTab(s.tab);

  const spot = document.getElementById('tour-spotlight');
  setTimeout(() => {
    const anchor = s.anchor ? document.getElementById(s.anchor) || document.querySelector('.'+s.anchor) : null;
    if (anchor) {
      anchor.scrollIntoView({ behavior:'smooth', block:'center' });
      // Wait for scroll to settle before measuring position
      setTimeout(() => {
        const rect = anchor.getBoundingClientRect();
        const pad = 8;
        spot.style.cssText = `display:block;top:${rect.top - pad}px;left:${rect.left - pad}px;width:${rect.width + pad*2}px;height:${rect.height + pad*2}px;`;
      }, 320);
    } else {
      spot.style.display = 'none';
    }
    card.classList.remove('tour-anim'); void card.offsetWidth; card.classList.add('tour-anim');
  }, 300);
}

function nextTourStep() {
  if (tourStep >= TOUR_STEPS.length - 1) {
    closeTour();
    exitDemo();
    return;
  }
  tourStep++;
  showTourStep();
}

function closeTour() {
  document.getElementById('tour-overlay').style.display = 'none';
  document.getElementById('tour-spotlight').style.display = 'none';
  if (DEMO_MODE) exitDemo();
}

// ══════════════════════════════════════════
// ONBOARDING
// ══════════════════════════════════════════
const OB_STEPS = [
  { icon:'💰', title:'Bem-vindo ao Avenco', text:'Seu controle financeiro pessoal. Clareza para decidir, controle para avançar.', cta:'Próximo' },
  { icon:'📥', title:'Lance seus ganhos', text:'Na aba Semana, registre o quanto ganhou em cada fonte — delivery, freela, cliente, o que for.', cta:'Próximo' },
  { icon:'🎯', title:'Acompanhe e cresça', text:'Veja gastos por categoria, monte sua reserva de emergência e defina metas. Tudo em um lugar.', cta:'Começar agora' },
];
let obStep = 0;

function checkOnboarding() {
  if (!localStorage.getItem('gdcash_onboarded')) {
    obStep = 0;
    renderObStep();
    document.getElementById('onboarding').style.display = 'flex';
  }
}

function renderObStep() {
  const s = OB_STEPS[obStep];
  document.getElementById('ob-icon').textContent = s.icon;
  document.getElementById('ob-title').textContent = s.title;
  document.getElementById('ob-text').textContent  = s.text;
  document.getElementById('ob-cta').textContent   = s.cta;
  document.getElementById('ob-dots').innerHTML = OB_STEPS.map((_,i) =>
    `<div class="ob-dot${i===obStep?' active':''}"></div>`).join('');
  const card = document.getElementById('ob-card');
  card.classList.remove('ob-anim'); void card.offsetWidth; card.classList.add('ob-anim');
}

function nextOnboardStep() {
  obStep++;
  if (obStep >= OB_STEPS.length) { finishOnboarding(); return; }
  renderObStep();
}

function finishOnboarding() {
  localStorage.setItem('gdcash_onboarded','1');
  const el = document.getElementById('onboarding');
  el.style.opacity = '0';
  el.style.transition = 'opacity .3s';
  setTimeout(() => { el.style.display = 'none'; el.style.opacity = ''; el.style.transition = ''; }, 320);
}

// ══════════════════════════════════════════
// TRENDS CHART (últimos 6 meses)
// ══════════════════════════════════════════
function renderTrendsChart() {
  const container = document.getElementById('trends-chart');
  if (!container) return;
  const now = new Date();
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const off = (d.getFullYear() - now.getFullYear()) * 12 + (d.getMonth() - now.getMonth());
    months.push({ label: MONTH_NAMES[d.getMonth()], inc: sumMonthIncome(off), exp: sumMonthExpenses(off) });
  }
  const maxVal = Math.max(1, ...months.flatMap(m => [m.inc, m.exp]));
  const bW = 18, gap = 5, gW = bW * 2 + gap, gGap = 14;
  const totalW = months.length * (gW + gGap) - gGap;
  const chartH = 110, labelH = 20, H = chartH + labelH;
  let bars = '';
  months.forEach((m, i) => {
    const x = i * (gW + gGap);
    const ih = m.inc > 0 ? Math.max(4, (m.inc / maxVal) * chartH) : 4;
    const eh = m.exp > 0 ? Math.max(4, (m.exp / maxVal) * chartH) : 4;
    const cx = x + gW / 2;
    const hasData = m.inc > 0 || m.exp > 0;
    bars += `
      <rect x="${x}" y="${chartH - ih}" width="${bW}" height="${ih}" rx="5"
        fill="#00e6a0" opacity="${m.inc > 0 ? 1 : 0.15}"
        style="transition:height .5s ${i*0.06}s,y .5s ${i*0.06}s"/>
      <rect x="${x + bW + gap}" y="${chartH - eh}" width="${bW}" height="${eh}" rx="5"
        fill="#ff4d6a" opacity="${m.exp > 0 ? 1 : 0.15}"
        style="transition:height .5s ${i*0.06}s,y .5s ${i*0.06}s"/>
      <text x="${cx}" y="${H - 3}" text-anchor="middle"
        fill="${hasData ? 'rgba(245,246,248,.55)' : 'rgba(245,246,248,.2)'}"
        font-size="9.5" font-family="-apple-system,sans-serif" font-weight="700">${m.label}</text>
    `;
  });
  container.innerHTML = `
    <svg viewBox="0 0 ${totalW} ${H}" style="width:100%;overflow:visible;display:block">${bars}</svg>
    <div class="trends-legend">
      <span class="trends-dot" style="background:#00e6a0"></span><span>Receita</span>
      <span class="trends-dot" style="background:#ff4d6a"></span><span>Gastos</span>
    </div>`;
}

// ══════════════════════════════════════════
// COMPARTILHAR RESUMO MENSAL
// ══════════════════════════════════════════
function shareMonthReport() {
  const canvas = document.createElement('canvas');
  canvas.width = 1080; canvas.height = 1080;
  const ctx = canvas.getContext('2d');
  const inc = sumMonthIncome(monthOffset), exp = sumMonthExpenses(monthOffset), liq = inc - exp;
  const mLabel = fmtMonthYear(monthOffset);

  // BG
  ctx.fillStyle = '#07080d'; ctx.fillRect(0, 0, 1080, 1080);
  const grad = ctx.createRadialGradient(540, 0, 0, 540, 0, 700);
  grad.addColorStop(0, 'rgba(255,184,0,0.13)'); grad.addColorStop(1, 'rgba(255,184,0,0)');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, 1080, 1080);

  // Badge GD
  ctx.beginPath();
  const bx=80, by=80, bw=110, bh=110, br=26;
  ctx.moveTo(bx+br,by); ctx.lineTo(bx+bw-br,by); ctx.arcTo(bx+bw,by,bx+bw,by+br,br);
  ctx.lineTo(bx+bw,by+bh-br); ctx.arcTo(bx+bw,by+bh,bx+bw-br,by+bh,br);
  ctx.lineTo(bx+br,by+bh); ctx.arcTo(bx,by+bh,bx,by+bh-br,br);
  ctx.lineTo(bx,by+br); ctx.arcTo(bx,by,bx+br,by,br); ctx.closePath();
  const bg = ctx.createLinearGradient(80,80,190,190);
  bg.addColorStop(0,'#ffd633'); bg.addColorStop(1,'#e09400');
  ctx.fillStyle=bg; ctx.fill();
  ctx.fillStyle='rgba(0,0,0,0.7)'; ctx.font='bold 50px system-ui,sans-serif';
  ctx.textAlign='center'; ctx.fillText('GD',135,150);

  // CASH
  ctx.fillStyle='#f5f6f8'; ctx.font='bold 56px system-ui,sans-serif';
  ctx.textAlign='left'; ctx.fillText('CASH',212,151);

  // Month
  ctx.fillStyle='rgba(245,246,248,0.38)'; ctx.font='500 30px system-ui,sans-serif';
  ctx.fillText(mLabel,80,240);

  // Main value
  ctx.fillStyle = liq>=0 ? '#00e6a0' : '#ff4d6a';
  ctx.font = 'bold 100px system-ui,sans-serif';
  ctx.fillText(R(liq), 80, 390);
  ctx.fillStyle='rgba(245,246,248,0.4)'; ctx.font='500 28px system-ui,sans-serif';
  ctx.fillText('Resultado do mês',80,435);

  // Divider
  ctx.fillStyle='rgba(255,255,255,0.07)'; ctx.fillRect(80,470,920,1);

  // Inc / Exp
  ctx.fillStyle='#00e6a0'; ctx.font='bold 48px system-ui,sans-serif';
  ctx.fillText('↑ '+R(inc),80,548);
  ctx.fillStyle='rgba(245,246,248,0.35)'; ctx.font='500 24px system-ui,sans-serif';
  ctx.fillText('Receita',80,583);

  ctx.fillStyle='#ff4d6a'; ctx.font='bold 48px system-ui,sans-serif';
  ctx.fillText('↓ '+R(exp),580,548);
  ctx.fillStyle='rgba(245,246,248,0.35)'; ctx.font='500 24px system-ui,sans-serif';
  ctx.fillText('Gastos',580,583);

  // Top cats
  const dates = monthDates(monthOffset);
  const catMap = {};
  D.expenses.filter(e=>dates.includes(e.date)).forEach(e=>{catMap[e.category]=(catMap[e.category]||0)+e.amount;});
  const topCats = Object.entries(catMap).sort((a,b)=>b[1]-a[1]).slice(0,3);
  if (topCats.length) {
    ctx.fillStyle='rgba(255,255,255,0.07)'; ctx.fillRect(80,618,920,1);
    ctx.fillStyle='rgba(245,246,248,0.35)'; ctx.font='500 24px system-ui,sans-serif';
    ctx.fillText('Top categorias',80,664);
    topCats.forEach(([cat,val],i) => {
      ctx.fillStyle = PALETTE[i];
      ctx.font = 'bold 36px system-ui,sans-serif';
      ctx.fillText(`${cat}  ${R(val)}`, 80, 714+i*60);
    });
  }

  // Footer
  ctx.fillStyle='rgba(245,246,248,0.18)'; ctx.font='500 24px system-ui,sans-serif';
  ctx.fillText('Avenco · gustavodga.github.io/GD-CASH/',80,1042);

  canvas.toBlob(blob => {
    const file = new File([blob],'gdcash-resumo.png',{type:'image/png'});
    if (navigator.share && navigator.canShare && navigator.canShare({files:[file]})) {
      navigator.share({files:[file], title:`Avenco — ${mLabel}`}).catch(()=>{});
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href=url; a.download=`avenco-${mLabel}.png`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }, 'image/png');
}

// ══════════════════════════════════════════
// ORÇAMENTO POR CATEGORIA
// ══════════════════════════════════════════
function renderCatBudgets() {
  const el = document.getElementById('cat-budget-bars');
  if (!el) return;
  const budgets = D.catBudgets || {};
  const hasBudgets = Object.keys(budgets).length > 0;
  const section = document.getElementById('cat-budget-section');

  if (!hasBudgets) {
    if (section) section.style.display = 'none';
    return;
  }
  if (section) section.style.display = '';

  const dates = monthDates(monthOffset);
  const catMap = {};
  D.expenses.filter(e=>dates.includes(e.date)).forEach(e=>{catMap[e.category]=(catMap[e.category]||0)+e.amount;});

  el.innerHTML = Object.entries(budgets).map(([cat, limit]) => {
    const spent = catMap[cat] || 0;
    const pct = Math.min(100, (spent / limit) * 100);
    const over = spent > limit;
    const color = over ? '#ff4d6a' : pct > 75 ? '#ffb800' : '#00e6a0';
    return `
      <div class="bud-row">
        <div class="bud-top">
          <span class="bud-cat">${cat}</span>
          <span class="bud-vals">
            <span style="color:${color};font-weight:700">${R(spent)}</span>
            <span class="bud-limit"> / ${R(limit)}</span>
          </span>
        </div>
        <div class="bud-bar-wrap">
          <div class="bud-bar-fill" style="width:${pct}%;background:${color};box-shadow:0 0 8px ${color}66"></div>
        </div>
        ${over ? `<div class="bud-over">⚠️ Limite ultrapassado em ${R(spent-limit)}</div>` : ''}
        <button class="bud-del" onclick="deleteCatBudget('${cat}')">✕</button>
      </div>`;
  }).join('');
}

function renderBudgetSettings() {
  const el = document.getElementById('budget-settings-list');
  if (!el) return;
  const budgets = D.catBudgets || {};
  if (!Object.keys(budgets).length) {
    el.innerHTML = '<div class="empty-state" style="padding:14px 0">Nenhum limite definido ainda</div>';
    return;
  }
  el.innerHTML = Object.entries(budgets).map(([cat, limit]) =>
    `<div class="settings-row">
       <span>${cat}</span>
       <span style="display:flex;align-items:center;gap:10px">
         <span style="color:var(--gold);font-weight:700">${R(limit)}</span>
         <button onclick="deleteCatBudget('${cat}')" style="background:none;border:none;color:var(--text3);font-size:15px;cursor:pointer;padding:0">✕</button>
       </span>
     </div>`).join('');
}

function openBudgetModal() {
  const sel = document.getElementById('budget-cat-sel');
  sel.innerHTML = D.expCats.map(c=>`<option value="${c}">${c}</option>`).join('');
  document.getElementById('budget-limit-val').value = '';
  openOverlay('modal-budget');
}

function saveCatBudget() {
  const cat = document.getElementById('budget-cat-sel').value;
  const limit = parseFloat(document.getElementById('budget-limit-val').value);
  if (!limit || limit <= 0) { alert('Informe um valor válido.'); return; }
  if (!D.catBudgets) D.catBudgets = {};
  D.catBudgets[cat] = limit;
  save();
  closeOverlay('modal-budget');
  renderBudgetSettings();
}

function deleteCatBudget(cat) {
  delete D.catBudgets[cat];
  save();
  renderBudgetSettings();
  renderCatBudgets();
}

// ══════════════════════════════════════════
// LEMBRETES
// ══════════════════════════════════════════
function renderLembretes() {
  const el = document.getElementById('lembretes-list');
  if (!el) return;
  if (!D.reminders || !D.reminders.length) {
    el.innerHTML = '<div class="card"><div class="empty-state">Nenhum lembrete ainda</div></div>';
    return;
  }
  const today = new Date(); today.setHours(0,0,0,0);
  const REPEAT = { none:'Não repete', weekly:'Semanal', monthly:'Mensal', yearly:'Anual' };
  const sorted = [...D.reminders].sort((a,b) => a.date.localeCompare(b.date));
  el.innerHTML = '<div class="card" style="padding:0">' + sorted.map((r, i) => {
    const rDate = parseDate(r.date);
    const daysUntil = Math.round((rDate - today) / (1000*60*60*24));
    const isUrgent = daysUntil >= 0 && daysUntil <= 3;
    const isPast = daysUntil < 0;
    const status = daysUntil === 0 ? 'Hoje!'
                 : daysUntil === 1 ? 'Amanhã'
                 : daysUntil > 1  ? `Em ${daysUntil} dias`
                 : `${Math.abs(daysUntil)} dia${Math.abs(daysUntil)!==1?'s':''} atrás`;
    return `<div class="lembrete-item${isUrgent?' lembrete-urgent':''}${isPast?' lembrete-past':''}${i>0?' lembrete-sep':''}">
      <div class="lembrete-icon">🔔</div>
      <div class="lembrete-info">
        <div class="lembrete-name">${r.name}</div>
        <div class="lembrete-meta">${fmtShort(r.date)} · ${REPEAT[r.repeat||'none']}</div>
      </div>
      <div class="lembrete-right">
        <span class="lembrete-status${isUrgent?' lembrete-status-urgent':''}">${status}</span>
        <button class="fixed-del" onclick="openLembreteModal('${r.id}')">···</button>
        <button class="fixed-del" onclick="deleteLembrete('${r.id}')">✕</button>
      </div>
    </div>`;
  }).join('') + '</div>';
}

function openLembreteModal(id) {
  const r = id ? D.reminders.find(r => r.id === id) : null;
  document.getElementById('lembrete-modal-title').textContent = r ? 'Editar Lembrete' : 'Novo Lembrete';
  document.getElementById('lembrete-edit-id').value = id || '';
  document.getElementById('lem-name').value = r?.name || '';
  document.getElementById('lem-date').value = r?.date || '';
  document.getElementById('lem-notif').value = String(r?.notifDaysBefore ?? 2);
  document.getElementById('lem-repeat').value = r?.repeat || 'none';
  openOverlay('modal-lembrete');
}

function saveLembrete() {
  const id = document.getElementById('lembrete-edit-id').value;
  const name = document.getElementById('lem-name').value.trim();
  const date = document.getElementById('lem-date').value;
  const notifDaysBefore = parseInt(document.getElementById('lem-notif').value) || 0;
  const repeat = document.getElementById('lem-repeat').value;
  if (!name || !date) { alert('Preencha nome e data.'); return; }
  if (!D.reminders) D.reminders = [];
  if (id) {
    const idx = D.reminders.findIndex(r => r.id === id);
    if (idx !== -1) D.reminders[idx] = { ...D.reminders[idx], name, date, notifDaysBefore, repeat };
  } else {
    D.reminders.push({ id: uid(), name, date, notifDaysBefore, repeat, lastNotif: '' });
    maybePromptNotif();
  }
  save(); closeOverlay('modal-lembrete'); renderLembretes();
}

function deleteLembrete(id) {
  D.reminders = D.reminders.filter(r => r.id !== id);
  save(); renderLembretes();
}

function checkReminders() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (!D.reminders || !D.reminders.length) return;
  const today = new Date(); today.setHours(0,0,0,0);
  let changed = false;
  D.reminders.forEach(r => {
    if (!r.date || r.lastNotif === todayStr()) return;
    const rDate = parseDate(r.date);
    const daysUntil = Math.round((rDate - today) / (1000*60*60*24));
    const notifyWhen = r.notifDaysBefore || 0;
    if (daysUntil === notifyWhen) {
      const body = notifyWhen > 0 ? `Daqui ${notifyWhen} dia${notifyWhen!==1?'s':''}` : 'É hoje!';
      new Notification(`🔔 ${r.name}`, { body, icon: '/GD-CASH/icon-192.png' });
      r.lastNotif = todayStr();
      if (r.repeat && r.repeat !== 'none') {
        const next = new Date(rDate);
        if (r.repeat === 'weekly')  next.setDate(next.getDate() + 7);
        if (r.repeat === 'monthly') next.setMonth(next.getMonth() + 1);
        if (r.repeat === 'yearly')  next.setFullYear(next.getFullYear() + 1);
        r.date = dateStr(next);
      }
      changed = true;
    }
  });
  if (changed) save();
}

// ══════════════════════════════════════════
// EXPORT — CSV / ICS / EMAIL
// ══════════════════════════════════════════
function exportCSV() {
  const header = ['Data','Tipo','Categoria/Plataforma','Descrição','Valor'];
  const rows = [];
  D.expenses.forEach(e => rows.push([e.date,'Gasto',e.category,e.description||e.category,-e.amount]));
  (D.incomeItems||[]).forEach(it => {
    const plat = D.platforms.find(p=>p.id===it.platformId)?.name||'';
    const tipo = it.status === 'pending' ? 'Receita (pendente)' : 'Receita';
    rows.push([it.date,tipo,plat,it.note||plat,it.amount]);
  });
  Object.entries(D.dailyIncome||{}).forEach(([date,pm]) => {
    D.platforms.forEach(p => {
      const v = pm[p.id];
      const hasItems = (D.incomeItems||[]).some(it=>it.date===date&&it.platformId===p.id);
      if(v&&v>0&&!hasItems) rows.push([date,'Receita',p.name,p.name,v]);
    });
  });
  rows.sort((a,b) => String(a[0]).localeCompare(String(b[0])));
  rows.unshift(header);
  const csv = rows.map(r => r.map(c => `"${String(c||'').replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿'+csv], {type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download=`avenco-${todayStr()}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportCalendar() {
  const fixed = (D.fixedExpenses||[]).filter(f => f.dueDay);
  if (!fixed.length) { alert('Cadastre gastos fixos com dia de vencimento antes de exportar.'); return; }
  const now = new Date();
  let events = '';
  fixed.forEach(f => {
    for (let m = 0; m < 12; m++) {
      const d = new Date(now.getFullYear(), now.getMonth()+m, f.dueDay);
      if (d.getDate() !== f.dueDay) continue;
      const ds = dateStr(d).replace(/-/g,'');
      const nd = new Date(d); nd.setDate(nd.getDate()+1);
      const ns = dateStr(nd).replace(/-/g,'');
      events += `BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:${ds}\r\nDTEND;VALUE=DATE:${ns}\r\nSUMMARY:🔁 ${f.name} — vencimento\r\nDESCRIPTION:${f.category} · ${R(f.amount)}\r\nUID:gdcash-${f.id}-${ds}@gdcash\r\nBEGIN:VALARM\r\nTRIGGER:-P2D\r\nACTION:DISPLAY\r\nDESCRIPTION:Vence em 2 dias: ${f.name}\r\nEND:VALARM\r\nEND:VEVENT\r\n`;
    }
  });
  const ics = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Avenco//PT\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\n${events}END:VCALENDAR`;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
                (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIOS) {
    // No iOS: abre link com data URI — Safari reconhece text/calendar e abre o Calendário
    const dataUri = 'data:text/calendar;charset=utf-8,' + encodeURIComponent(ics);
    const a = document.createElement('a');
    a.href = dataUri;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } else {
    const blob = new Blob([ics], {type:'text/calendar'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download='avenco-vencimentos.ics';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }
}

function emailMonthReport() {
  const inc=sumMonthIncome(monthOffset), exp=sumMonthExpenses(monthOffset), liq=inc-exp;
  const mLabel=fmtMonthYear(monthOffset);
  const subject = `Avenco — Resumo ${mLabel}`;
  const body = `Resumo financeiro: ${mLabel}\n\nReceita:   ${R(inc)}\nGastos:    ${R(exp)}\nResultado: ${R(liq)}\n\nReserva de emergência: ${R(D.emergency.current)}\n\n---\nGerado pelo Avenco`;
  window.open(`mailto:${currentUser?.email||''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
}

// ══════════════════════════════════════════
// SWIPE ENTRE ABAS
// ══════════════════════════════════════════
function initSwipe() {
  const TABS = ['inicio','semana','mes','reserva'];
  let sx = 0, sy = 0, blocked = false;
  const main = document.querySelector('main');
  if (!main) return;
  main.addEventListener('touchstart', e => {
    sx = e.touches[0].clientX;
    sy = e.touches[0].clientY;
    blocked = !!e.target.closest('.cat-pills,.plat-cards,.overlay,.sheet');
  }, { passive: true });
  main.addEventListener('touchend', e => {
    if (blocked || document.querySelector('.overlay.open')) return;
    const dx = e.changedTouches[0].clientX - sx;
    const dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx) * 0.6) return;
    const active = document.querySelector('.page.active')?.id?.replace('page-','');
    const idx = TABS.indexOf(active);
    if (idx === -1) return;
    if (dx < 0 && idx < TABS.length-1) switchTab(TABS[idx+1]);
    else if (dx > 0 && idx > 0) switchTab(TABS[idx-1]);
  }, { passive: true });
}

// ══════════════════════════════════════════
// LONG PRESS DELETE (lista de movimentações)
// ══════════════════════════════════════════
function initLongPress() {
  let lpTimer = null;
  const list = document.getElementById('inicio-tx-list');
  if (!list) return;
  const cancel = () => clearTimeout(lpTimer);
  list.addEventListener('touchstart', e => {
    const item = e.target.closest('[data-id]');
    if (!item || !item.dataset.id) return;
    lpTimer = setTimeout(() => {
      haptic(25);
      item.classList.add('tx-pressing');
      setTimeout(() => item.classList.remove('tx-pressing'), 300);
      const { type, id } = item.dataset;
      if (confirm('Excluir esta movimentação?')) {
        if (type === 'exp') { D.expenses = D.expenses.filter(e => e.id !== id); }
        else if (type === 'inc') { D.incomeItems = (D.incomeItems||[]).filter(it => it.id !== id); }
        save(); renderInicio();
      }
    }, 550);
  }, { passive: true });
  list.addEventListener('touchend', cancel, { passive: true });
  list.addEventListener('touchmove', cancel, { passive: true });
}

// ══════════════════════════════════════════
// NÚMERO VOANDO
// ══════════════════════════════════════════
function flyNumber(amount, fromEl) {
  if (!fromEl) return;
  const rect = fromEl.getBoundingClientRect();
  const fly = document.createElement('div');
  fly.className = 'fly-number';
  fly.textContent = '+' + R(Math.abs(amount));
  fly.style.left = (rect.left + rect.width / 2) + 'px';
  fly.style.top = rect.top + 'px';
  document.body.appendChild(fly);
  requestAnimationFrame(() => requestAnimationFrame(() => fly.classList.add('fly-go')));
  setTimeout(() => fly.remove(), 900);
}

// ══════════════════════════════════════════
// MODULE CONSTANTS — must be before firebase init (avoids TDZ when init throws)
// ══════════════════════════════════════════
var PEND_CAT_LABELS  = { carro:'🚗 Carro', casa:'🏠 Casa', documento:'📄 Documento', financeiro:'💰 Financeiro', pessoal:'👤 Pessoal', outra:'📌 Outra' };
var PEND_PRIO_LABELS = { alta:'🔴 Alta', media:'🟡 Média', baixa:'🟢 Baixa' };
var VEH_STATUS_LABELS = { em_uso:'Em uso', na_oficina:'Na oficina', a_venda:'À venda', vendido:'Vendido', arquivado:'Arquivado' };
var VEH_STATUS_COLORS = { em_uso:'var(--green)', na_oficina:'#f59e0b', a_venda:'var(--ac)', vendido:'var(--tx3)', arquivado:'var(--tx3)' };
var _vehDetailId = null;
var _vehEventTarget = null;
var _vehLinkExpTarget = null;
var _vehLinkPendTarget = null;
var _vehStatusTarget = null;
var _pendVehicleId = null;
var qaType = 'rec';
var CAT_KEYWORDS = {
  'Alimentação': ['mercado', 'supermercado', 'ifood', 'rappi', 'pizza', 'burger', 'restaurante', 'lanche', 'comida', 'padaria', 'açaí'],
  'Transporte': ['uber', 'gasolina', '99', 'combustível', 'posto', 'estacionamento', 'ônibus', 'metrô', 'taxi'],
  'Moradia': ['aluguel', 'condomínio', 'água', 'luz', 'energia', 'gás', 'internet', 'net'],
  'Lazer': ['cinema', 'netflix', 'spotify', 'show', 'festa', 'bar', 'balada', 'jogo', 'steam'],
  'Saúde': ['farmácia', 'remédio', 'médico', 'academia', 'plano', 'consulta', 'dentista'],
  'Serviços': ['salão', 'barbearia', 'lavanderia', 'conserto', 'manutenção'],
};

// ══════════════════════════════════════════
// INIT
// ══════════════════════════════════════════
if (CLOUD_ENABLED) {
  initFirebase(); // renders app after auth
} else {
  renderSemana();
  checkGoalNotifications();
  checkReminders();
}

// ── Manifest shortcuts (long-press icon on home screen) ──
function handleShortcut() {
  const action = new URLSearchParams(location.search).get('action');
  if (!action) return;
  if (action === 'income' || action === 'expense') {
    switchTab('semana');
    setTimeout(() => {
      openDayDetail(selDayIdx);
      if (action === 'expense') {
        setTimeout(() => {
          const sheet = document.querySelector('#modal-day-detail .sheet');
          const expSec = document.getElementById('add-exp-section');
          if (sheet && expSec) sheet.scrollTop = expSec.offsetTop - 20;
        }, 400);
      }
    }, 350);
  } else if (action === 'balance') {
    switchTab('inicio');
  }
  // Clean URL without reload
  history.replaceState({}, '', location.pathname);
}

// initSwipe() removido — interferia com o carrossel
initLongPress();

// ══════════════════════════════════════════
// THEME (light / dark)
// ══════════════════════════════════════════
function initTheme() {
  const saved = localStorage.getItem('gdcash_theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = saved ? saved === 'dark' : prefersDark;
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  updateThemeToggle(dark);
}
function toggleTheme() {
  const isDark = document.documentElement.dataset.theme === 'dark';
  const newTheme = isDark ? 'light' : 'dark';
  document.documentElement.dataset.theme = newTheme;
  localStorage.setItem('gdcash_theme', newTheme);
  updateThemeToggle(!isDark);
}
function updateThemeToggle(dark) {
  const btn = document.getElementById('theme-toggle-btn');
  if (btn) btn.classList.toggle('on', dark);
}

// ══════════════════════════════════════════
// CAROUSEL DOTS
// ══════════════════════════════════════════
function updCarDots() {
  const c = document.getElementById('car-inner');
  if (!c) return;
  const i = Math.round(c.scrollLeft / (c.scrollWidth / 2));
  document.querySelectorAll('#car-dots .cdot').forEach((d, j) => d.classList.toggle('on', j === i));
}

// ══════════════════════════════════════════
// RENDER INÍCIO — new big cards
// ══════════════════════════════════════════
function renderInicioCards() {
  const weekInc = sumWeekIncome(weekOffset);
  const weekExp = sumWeekExpenses(weekOffset);
  const weekLiq = weekInc - weekExp;
  const monthInc = sumMonthIncome(monthOffset);
  const monthExp = sumMonthExpenses(monthOffset);
  const monthLiq = monthInc - monthExp;

  const bcWL = document.getElementById('bc-week-liq');
  const bcWI = document.getElementById('bc-week-inc');
  const bcWE = document.getElementById('bc-week-exp');
  if (bcWL) animCount(bcWL, weekLiq, 650);
  if (bcWI) bcWI.textContent = R(weekInc);
  if (bcWE) bcWE.textContent = R(weekExp);

  const bcML = document.getElementById('bc-month-liq');
  const bcMI = document.getElementById('bc-month-inc');
  const bcME = document.getElementById('bc-month-exp');
  if (bcML) animCount(bcML, monthLiq, 650);
  if (bcMI) bcMI.textContent = R(monthInc);
  if (bcME) bcME.textContent = R(monthExp);

  // Carousel subtitles
  const reservePct = D.emergency.target > 0 ? Math.round(D.emergency.current / D.emergency.target * 100) : 0;
  const rSub = document.getElementById('car-reserve-sub');
  if (rSub) rSub.textContent = reservePct + '% da meta · Ver tudo →';

  const goalCount = (D.goals || []).filter(g => !g.completed).length;
  const gSub = document.getElementById('car-goals-sub');
  if (gSub) gSub.textContent = goalCount + (goalCount === 1 ? ' meta ativa →' : ' metas ativas →');

  // Update logo greeting with real name
  const nome = currentUser?.displayName?.split(' ')[0] || 'você';
  const greet = document.getElementById('logo-greeting');
  if (greet) { greet.textContent = 'Olá, '; const b = document.createElement('b'); b.textContent = nome; greet.appendChild(b); }

  renderPendInicio();
}

// ══════════════════════════════════════════
// HOME SCREEN — redesign
// ══════════════════════════════════════════
function renderHomeNew() {
  // 1. Hero — use real monthOffset so period matches user's selection
  const hour = new Date().getHours();
  const saudacao = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const nome = currentUser?.displayName?.split(' ')[0] || '';
  const greetEl = document.getElementById('home-greeting');
  if (greetEl) greetEl.textContent = saudacao + (nome ? ', ' + nome : '');

  const monthEl = document.getElementById('home-month');
  if (monthEl) {
    const d = new Date(); d.setMonth(d.getMonth() + monthOffset, 1);
    monthEl.textContent = d.toLocaleDateString('pt-BR', {month: 'long', year: 'numeric'});
  }

  const inc = sumMonthIncome(monthOffset), exp = sumMonthExpenses(monthOffset), liq = inc - exp;

  const balEl = document.getElementById('home-balance');
  if (balEl) {
    balEl.className = 'hc-balance ' + (liq >= 0 ? 'pos' : 'neg');
    if (inc === 0 && exp === 0) { balEl.textContent = '—'; }
    else animCount(balEl, liq, 700);
  }
  const incEl = document.getElementById('home-inc');
  const expEl = document.getElementById('home-exp');
  if (incEl) incEl.textContent = inc === 0 ? '—' : R(inc);
  if (expEl) expEl.textContent = exp === 0 ? '—' : R(exp);

  // 2. Chart
  setTimeout(drawHomeChart, 40);

  // 3. Insight — show only when there's actual data
  const insightWrap = document.getElementById('home-insight');
  const insightText = document.getElementById('home-insight-text');
  if (insightWrap && insightText) {
    if (inc > 0 || exp > 0) {
      insightWrap.style.display = '';
      insightText.textContent = buildMonthInsight(inc, exp);
    } else {
      insightWrap.style.display = 'none';
    }
  }

  // 4. Timeline — pendencias with deadlines
  const hoje = todayStr();
  const upcoming = (D.pendencias || [])
    .filter(p => p.status === 'aberta' && p.deadline)
    .sort((a, b) => a.deadline.localeCompare(b.deadline))
    .slice(0, 4);

  const tlWrap = document.getElementById('home-timeline-wrap');
  const tlEl   = document.getElementById('home-timeline');
  if (tlWrap && tlEl) {
    if (upcoming.length > 0) {
      tlWrap.style.display = '';
      tlEl.innerHTML = upcoming.map(p => {
        const isOv  = p.deadline < hoje;
        const isTod = p.deadline === hoje;
        const dt = parseDate(p.deadline).toLocaleDateString('pt-BR', {day: '2-digit', month: 'short'});
        const dateLabel = isOv ? 'Vencida' : isTod ? 'Hoje' : dt;
        const dayNum = isOv ? '!' : isTod ? '◆' : parseDate(p.deadline).getDate();
        const badgeCls = p.priority === 'alta' ? 'hc-tl-badge--alta' : p.priority === 'media' ? 'hc-tl-badge--media' : 'hc-tl-badge--baixa';
        const dateCls = isOv ? ' hc-tl-overdue' : isTod ? ' hc-tl-today' : '';
        return `<div class="hc-tl-item">
          <div class="hc-tl-badge ${badgeCls}">${dayNum}</div>
          <div class="hc-tl-info">
            <div class="hc-tl-name">${p.title}</div>
            <div class="hc-tl-date-label${dateCls}">${dateLabel}</div>
          </div>
          <div class="hc-tl-right">${p.estimatedValue ? `<div class="hc-tl-amount">${R(p.estimatedValue)}</div>` : ''}</div>
        </div>`;
      }).join('');
    } else {
      tlWrap.style.display = 'none';
    }
  }

  // 5. Meta atual
  const activeGoals = (D.goals || []).filter(g => !g.completed);
  const goalSection = document.getElementById('home-goal-section');
  const goalEl      = document.getElementById('home-goal');
  if (goalSection && goalEl) {
    if (activeGoals.length > 0) {
      const g = activeGoals[0];
      const saved   = g.saved   || 0;
      const target  = g.target  || 0;
      const pct     = target > 0 ? Math.min(100, Math.round(saved / target * 100)) : 0;
      const remains = Math.max(0, target - saved);
      goalSection.style.display = '';
      goalEl.innerHTML = `
        <div class="hc-goal-name">${g.name || 'Meta'}</div>
        <div class="hc-goal-row">
          <div class="hc-goal-saved">${R(saved)} guardados</div>
          <div class="hc-goal-pct-big">${pct}%</div>
        </div>
        <div class="hc-goal-bar-track">
          <div class="hc-goal-bar-fill" style="width:${pct}%"></div>
        </div>
        <div class="hc-goal-meta">
          <span>Meta: ${R(target)}</span>
          <span>Faltam ${R(remains)}</span>
        </div>`;
    } else {
      goalSection.style.display = 'none';
    }
  }

  // 6. Pendências relevantes (vencidas ou alta prioridade)
  const relevantPend = (D.pendencias || [])
    .filter(p => p.status === 'aberta' && ((p.deadline && p.deadline <= hoje) || p.priority === 'alta'))
    .sort((a, b) => {
      const aS = (a.deadline && a.deadline < hoje) ? 0 : a.priority === 'alta' ? 1 : 2;
      const bS = (b.deadline && b.deadline < hoje) ? 0 : b.priority === 'alta' ? 1 : 2;
      return aS - bS || (a.deadline || '9999').localeCompare(b.deadline || '9999');
    })
    .slice(0, 5);

  const pendSection = document.getElementById('home-pend-section');
  const pendListEl  = document.getElementById('home-pend-list');
  if (pendSection && pendListEl) {
    if (relevantPend.length > 0) {
      pendSection.style.display = '';
      pendListEl.innerHTML = relevantPend.map(p => {
        const isOv  = p.deadline && p.deadline < hoje;
        const isTod = p.deadline === hoje;
        const dt    = p.deadline ? parseDate(p.deadline).toLocaleDateString('pt-BR', {day:'2-digit',month:'short'}) : '';
        const barCls = p.priority === 'alta' ? 'hc-pend-bar--alta' : p.priority === 'media' ? 'hc-pend-bar--media' : 'hc-pend-bar--baixa';
        const dateCls = isOv ? ' hc-pend-overdue' : isTod ? ' hc-pend-today' : '';
        return `<div class="hc-pend-item" onclick="switchTab('pendencias')">
          <div class="hc-pend-bar ${barCls}"></div>
          <div class="hc-pend-info">
            <div class="hc-pend-name">${p.title}</div>
            ${dt ? `<div class="hc-pend-date${dateCls}">${isOv?'Venceu ':''}${dt}</div>` : ''}
          </div>
          ${p.estimatedValue ? `<div class="hc-pend-amount">${R(p.estimatedValue)}</div>` : ''}
        </div>`;
      }).join('');
    } else {
      pendSection.style.display = 'none';
    }
  }

  // Reserve movement note (visible only when there are reserve changes this month)
  const resvChip = document.getElementById('home-resv-note');
  if (resvChip) {
    const resvNet = sumMonthReserva(monthOffset);
    if (resvNet > 0) {
      resvChip.style.display = '';
      resvChip.innerHTML = `↑ Você guardou <strong>${R(resvNet)}</strong> na reserva em ${fmtMonthYear(monthOffset)}.`;
    } else if (resvNet < 0) {
      resvChip.style.display = '';
      resvChip.innerHTML = `↓ Você retirou <strong>${R(Math.abs(resvNet))}</strong> da reserva em ${fmtMonthYear(monthOffset)}.`;
    } else {
      resvChip.style.display = 'none';
    }
  }

  // Tools section — badge showing count of open pendências
  const toolsBadge = document.getElementById('tools-pend-badge');
  if (toolsBadge) {
    const openCount = (D.pendencias || []).filter(p => p.status === 'aberta').length;
    toolsBadge.textContent = openCount > 9 ? '9+' : openCount;
    toolsBadge.style.display = openCount > 0 ? '' : 'none';
  }
}

function buildMonthInsight(inc, exp) {
  const liq = inc - exp;
  if (inc === 0 && exp === 0) return 'Nenhuma movimentação registrada este mês. Comece lançando sua primeira receita ou gasto.';
  if (exp === 0)  return `Receita de ${R(inc)} registrada — nenhum gasto lançado até agora.`;
  if (inc === 0)  return `${R(exp)} em gastos lançados. Nenhuma receita registrada ainda.`;
  const ratio = exp / inc;
  if (liq >= 0) {
    if (ratio < 0.5) return `Mês excelente: só ${Math.round(ratio*100)}% da receita foi gasta. Você ficou com ${R(liq)} de resultado.`;
    if (ratio < 0.8) return `Mês equilibrado: ${Math.round(ratio*100)}% da receita foi para gastos. Resultado de ${R(liq)}.`;
    return `Mês apertado: ${Math.round(ratio*100)}% da receita foi consumida. Sobraram ${R(liq)}.`;
  }
  return `Atenção: os gastos superaram a receita em ${R(Math.abs(liq))} este mês.`;
}

function drawHomeChart() {
  const canvas  = document.getElementById('home-chart');
  const emptyEl = document.getElementById('home-chart-empty');
  const legendEl = document.getElementById('home-chart-legend');
  if (!canvas) return;

  const months = [];
  for (let i = -5; i <= 0; i++) {
    const d = new Date(); d.setMonth(d.getMonth() + i, 1);
    const lbl = d.toLocaleDateString('pt-BR', {month: 'short'}).replace('.', '');
    months.push({ lbl, inc: sumMonthIncome(i), exp: sumMonthExpenses(i) });
  }

  const hasData = months.some(m => m.inc > 0 || m.exp > 0);

  // Empty state
  if (!hasData) {
    canvas.style.display  = 'none';
    if (emptyEl)  emptyEl.style.display  = '';
    if (legendEl) legendEl.style.display = 'none';
    return;
  }

  canvas.style.display  = '';
  if (emptyEl)  emptyEl.style.display  = 'none';
  if (legendEl) legendEl.style.display = '';

  if (!canvas.offsetWidth) return;
  const dpr = window.devicePixelRatio || 1;
  const cw = canvas.offsetWidth, ch = canvas.offsetHeight;
  canvas.width = cw * dpr; canvas.height = ch * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const maxVal = Math.max(...months.flatMap(m => [m.inc, m.exp]), 1);
  const padT = 6, padB = 22, padL = 0, padR = 0;
  const chartW = cw - padL - padR, chartH = ch - padT - padB;
  const groupW = chartW / months.length;
  const barW   = Math.min(groupW * 0.27, 15);
  const barGap = groupW * 0.055;

  const isDark    = document.documentElement.dataset.theme === 'dark';
  const incColor  = isDark ? '#5B8AF5' : '#1D4ED8';
  const expColor  = isDark ? 'rgba(91,138,245,.38)' : '#93C5FD';
  const gridColor = isDark ? 'rgba(255,255,255,.06)' : 'rgba(12,18,64,.06)';
  const lblColor  = isDark ? 'rgba(232,237,255,.35)' : 'rgba(12,18,64,.33)';

  ctx.clearRect(0, 0, cw, ch);

  // grid lines
  for (let i = 1; i <= 3; i++) {
    const y = padT + (chartH / 4) * i;
    ctx.strokeStyle = gridColor; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(chartW, y); ctx.stroke();
  }

  months.forEach((m, i) => {
    const cx   = padL + (i + 0.5) * groupW;
    const incH = Math.max((m.inc / maxVal) * chartH, 2);
    const expH = Math.max((m.exp / maxVal) * chartH, 2);

    ctx.fillStyle = incColor; ctx.globalAlpha = 0.82;
    homeRoundRect(ctx, cx - barW - barGap / 2, padT + chartH - incH, barW, incH, 3);
    ctx.fill();

    ctx.fillStyle = expColor; ctx.globalAlpha = 0.66;
    homeRoundRect(ctx, cx + barGap / 2, padT + chartH - expH, barW, expH, 3);
    ctx.fill();

    ctx.globalAlpha = 1;
    ctx.fillStyle = lblColor;
    ctx.font = `600 10px Inter, -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    const lbl = m.lbl.charAt(0).toUpperCase() + m.lbl.slice(1, 3);
    ctx.fillText(lbl, cx, padT + chartH + 16);
  });
}

function homeRoundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ══════════════════════════════════════════
// DAY ACCORDION — Semana
// ══════════════════════════════════════════
function renderDayAccordion() {
  const acc = document.getElementById('days-accordion');
  if (!acc) return;
  const dates = weekDates(weekOffset);
  const NAMES = ['Segunda','Terça','Quarta','Quinta','Sexta','Sábado','Domingo'];

  acc.innerHTML = dates.map((d, i) => {
    const dt = parseDate(d);
    const dayLabel = NAMES[i] + ', ' + dt.getDate() + ' ' + dt.toLocaleDateString('pt-BR',{month:'short'}).replace('.','');
    const dayInc = sumDayIncome(d);
    const dayExp = sumDayExpenses(d);
    const dayLiq = dayInc - dayExp;
    const exps = getDayExpenses(d);
    const isOff = D.daysOff.includes(d);

    // Income rows — each incomeItem gets its own row+delete; legacy dailyIncome entries get one row
    const platItems = D.platforms.map(p => {
      const items = (D.incomeItems||[]).filter(it => it.date===d && it.platformId===p.id);
      if (items.length > 0) {
        return items.map(it => {
          const label = it.note || it.description || p.name;
          const statusTag = it.status === 'pending' ? ' <span style="font-size:10px;opacity:.6">(pendente)</span>' : '';
          return `<div class="dacc-tx">
            <div class="dacc-tx-ico" style="background:${p.color}22">
              <svg viewBox="0 0 24 24" style="stroke:${p.color}"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
            </div>
            <div class="dacc-tx-info"><div class="dacc-tx-lbl">${p.name}${statusTag}</div><div class="dacc-tx-cat">${label !== p.name ? label : 'Receita'}</div></div>
            <div class="dacc-tx-amt" style="color:var(--gn)">+${R(it.amount)}</div>
            <button class="dacc-tx-del" title="Remover" onclick="D.incomeItems=(D.incomeItems||[]).filter(x=>x.id!=='${it.id}');save();renderDayAccordion();refreshAfterDayEdit()">✕</button>
          </div>`;
        }).join('');
      }
      const v = getDayIncome(d)[p.id] || 0;
      if (v <= 0) return '';
      return `<div class="dacc-tx">
        <div class="dacc-tx-ico" style="background:${p.color}22">
          <svg viewBox="0 0 24 24" style="stroke:${p.color}"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
        </div>
        <div class="dacc-tx-info"><div class="dacc-tx-lbl">${p.name}</div><div class="dacc-tx-cat">Receita</div></div>
        <div class="dacc-tx-amt" style="color:var(--gn)">+${R(v)}</div>
        <button class="dacc-tx-del" title="Remover" onclick="setDayIncome('${d}','${p.id}',0);renderDayAccordion();refreshAfterDayEdit()">✕</button>
      </div>`;
    }).join('');

    // Expense rows — with delete button
    const expItems = exps.map(e => `
      <div class="dacc-tx">
        <div class="dacc-tx-ico" style="background:var(--rd-t)">
          <svg viewBox="0 0 24 24" style="stroke:var(--rd)"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>
        </div>
        <div class="dacc-tx-info"><div class="dacc-tx-lbl">${e.description||e.category}</div><div class="dacc-tx-cat">Gasto · ${e.category}</div></div>
        <div class="dacc-tx-amt" style="color:var(--rd)">−${R(e.amount)}</div>
        <button class="dacc-tx-del" title="Remover" onclick="deleteExpense('${e.id}');renderDayAccordion();refreshAfterDayEdit()">✕</button>
      </div>`).join('');

    const hasData = dayInc > 0 || exps.length > 0;
    const txCount = (D.platforms.filter(p=>getDayPlatIncome(d,p.id)>0).length) + exps.length;
    const subLabel = isOff ? 'Folga' : hasData ? txCount + (txCount===1?' lançamento':' lançamentos') : 'Nenhum lançamento';
    const liqColor = dayLiq > 0 ? 'var(--gn)' : dayLiq < 0 ? 'var(--rd)' : 'var(--tx3)';
    const liqSign = dayLiq > 0 ? '+' : '';
    const isToday = d === todayStr();

    // "Editar dia completo" footer inside expanded body
    const editFooter = `<div style="padding:10px 14px;border-top:1px solid var(--border)">
      <button onclick="event.stopPropagation();openDayDetail(${i})" style="width:100%;padding:10px;border-radius:12px;border:1px solid var(--border);background:var(--surface2);color:var(--tx2);font-size:12px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        Editar dia completo
      </button>
    </div>`;

    const emptyMsg = `<div style="padding:12px 14px;font-size:12px;color:var(--tx3)">Nenhum lançamento ainda.</div>`;

    return `<div class="dacc${isToday?' open':''}" id="dacc-${i}">
      <div class="dacc-head" onclick="toggleDacc(${i})">
        <div class="dacc-dot ${hasData?'dacc-dot-active':'dacc-dot-empty'}"></div>
        <div class="dacc-info">
          <div class="dacc-name">${dayLabel}${isToday?' <span style="font-size:9px;background:var(--ac-t);color:var(--ac);border-radius:6px;padding:2px 6px;font-weight:700">HOJE</span>':''}</div>
          <div class="dacc-sub">${subLabel}</div>
        </div>
        <div class="dacc-right">
          ${hasData ? `<div class="dacc-liq" style="color:${liqColor}">${liqSign}${R(dayLiq)}</div>` : ''}
          <div class="dacc-chev"><svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg></div>
        </div>
      </div>
      <div class="dacc-body">${hasData ? platItems + expItems : emptyMsg}${editFooter}</div>
    </div>`;
  }).join('');
}

function toggleDacc(i) {
  const el = document.getElementById('dacc-' + i);
  if (el) el.classList.toggle('open');
}

// ══════════════════════════════════════════
// QUICK ADD SHEET
// ══════════════════════════════════════════

function qaSuggestCat() {
  const desc = document.getElementById('qa-desc')?.value?.toLowerCase() || '';
  if (!desc || qaType !== 'gas') {
    document.getElementById('qa-suggest-row').style.display = 'none';
    return;
  }
  for (const [cat, keys] of Object.entries(CAT_KEYWORDS)) {
    if (keys.some(k => desc.includes(k))) {
      document.getElementById('qa-suggest-row').style.display = 'flex';
      document.getElementById('qa-suggest-txt').textContent = cat;
      const sel = document.getElementById('qa-cat-sel');
      if (sel) {
        for (let i = 0; i < sel.options.length; i++) {
          if (sel.options[i].value === cat) { sel.selectedIndex = i; break; }
        }
      }
      return;
    }
  }
  document.getElementById('qa-suggest-row').style.display = 'none';
}

function qaSetType(type) {
  qaType = type;
  document.getElementById('qa-btn-rec').classList.toggle('active', type === 'rec');
  document.getElementById('qa-btn-gas').classList.toggle('active', type === 'gas');
  document.getElementById('qa-cat-row').style.display = type === 'gas' ? '' : 'none';
  document.getElementById('qa-plat-row').style.display = type === 'rec' ? '' : 'none';
  document.getElementById('qa-suggest-row').style.display = 'none';
}

function qaUpdateAmt() {
  const v = parseFloat(document.getElementById('qa-amt-input')?.value) || 0;
  const el = document.getElementById('qa-amt-display');
  if (el) el.textContent = R(v);
}

function openQuickAdd() {
  // Populate selects
  const platSel = document.getElementById('qa-plat-sel');
  if (platSel) platSel.innerHTML = D.platforms.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  const catSel = document.getElementById('qa-cat-sel');
  if (catSel) catSel.innerHTML = (D.expCats || []).map(c => `<option value="${c}">${c}</option>`).join('');

  // Use selected day in Semana, otherwise today
  const dateEl = document.getElementById('qa-date');
  if (dateEl) dateEl.value = selDate() || todayStr();

  // Reset
  document.getElementById('qa-amt-input').value = '';
  document.getElementById('qa-amt-display').textContent = R(0);
  document.getElementById('qa-desc').value = '';
  document.getElementById('qa-suggest-row').style.display = 'none';
  qaSetType('rec');

  openOverlay('modal-quick-add');
}

function qaConfirm() {
  const amt = parseFloat(document.getElementById('qa-amt-input')?.value);
  if (!amt || amt <= 0) { alert('Informe um valor válido.'); return; }
  const date = document.getElementById('qa-date')?.value || todayStr();
  const desc = document.getElementById('qa-desc')?.value || '';

  if (qaType === 'rec') {
    const pid = document.getElementById('qa-plat-sel')?.value;
    if (pid) {
      const platName = D.platforms.find(p => p.id === pid)?.name || 'Receita';
      const hasItems = (D.incomeItems||[]).some(it => it.date===date && it.platformId===pid);
      if (hasItems) {
        if (!D.incomeItems) D.incomeItems = [];
        D.incomeItems.push({ id: uid(), date, platformId: pid, amount: amt, note: desc || '', status: 'paid' });
        save();
      } else {
        const existing = getDayIncome(date)[pid] || 0;
        setDayIncome(date, pid, existing + amt);
      }
      notifyRegistered(amt, desc || platName, platName);
    }
  } else {
    const cat = document.getElementById('qa-cat-sel')?.value || (D.expCats[0] || 'Outros');
    const thisVehicleId = _pendVehicleId;
    _pendVehicleId = null;
    const expId = uid();
    const expObj = { id: expId, date, category: cat, description: desc || cat, amount: amt };
    if (thisVehicleId) expObj.vehicleId = thisVehicleId;
    D.expenses.push(expObj);
    if (thisVehicleId) {
      const veh = (D.vehicles||[]).find(v => v.id === thisVehicleId);
      if (veh) { if (!veh.linkedExpenses) veh.linkedExpenses=[]; if (!veh.linkedExpenses.includes(expId)) veh.linkedExpenses.push(expId); }
    }
    save();
    checkBudgetAlerts(cat);
    notifyRegistered(amt, desc || cat, cat);
  }

  closeOverlay('modal-quick-add');
  haptic(10);

  // Refresh whatever is visible
  if (document.getElementById('page-inicio')?.classList.contains('active')) { renderInicio(); renderInicioCards(); }
  if (document.getElementById('page-semana')?.classList.contains('active')) { renderSemana(); renderDayAccordion(); }
}

function notifyRegistered(amount, label, category) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    new Notification(R(amount) + ' registrado', {
      body: label + (category && category !== label ? ' · ' + category : ''),
      icon: '/GD-CASH/icon-192.png',
      silent: true,
      tag: 'gdcash-entry',
    });
  } catch(e) {}
}

// ══════════════════════════════════════════
// PUSH NOTIFICATIONS
// ══════════════════════════════════════════
async function requestNotifPermission() {
  closeOverlay('modal-notif-perm');
  if (!('Notification' in window)) { alert('Seu navegador não suporta notificações.'); return; }
  const perm = await Notification.requestPermission();
  if (perm === 'granted') {
    localStorage.setItem('gdcash_notif_enabled', '1');
    scheduleDailyReminder();
    alert('Notificações ativadas! Você receberá um lembrete diário às 21h.');
  }
}

function checkNotifPrompt() {
  if (localStorage.getItem('gdcash_notif_dismissed')) return;
  if (localStorage.getItem('gdcash_notif_enabled')) return;
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    localStorage.setItem('gdcash_notif_enabled', '1');
    return;
  }
  // Show prompt after 30 seconds of use
  setTimeout(() => {
    if (!localStorage.getItem('gdcash_notif_dismissed')) {
      openOverlay('modal-notif-perm');
    }
  }, 30000);
}

function scheduleDailyReminder() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.ready.then(reg => {
    if (reg.active) {
      reg.active.postMessage({ type: 'SCHEDULE_DAILY', hour: 21, minute: 0 });
    }
  });
}

function checkBudgetAlerts(cat) {
  if (!D.catBudgets || !D.catBudgets[cat]) return;
  const budget = D.catBudgets[cat];
  const catSpent = (D.expenses || [])
    .filter(e => monthDates(0).includes(e.date) && e.category === cat)
    .reduce((s, e) => s + e.amount, 0);
  const pct = Math.round(catSpent / budget * 100);
  if (pct >= 80 && pct < 100 && Notification.permission === 'granted') {
    new Notification('Avenco — Alerta de orçamento', {
      body: `Você já usou ${pct}% do limite de "${cat}" este mês.`,
      icon: '/icon-192.png',
    });
  }
}

// ══════════════════════════════════════════
// ADD THEME TOGGLE TO SETTINGS PAGE
// ══════════════════════════════════════════
function initSettingsExtras() {
  const settingsPage = document.getElementById('page-ajustes');
  if (!settingsPage) return;
  const existing = settingsPage.querySelector('.theme-toggle-section');
  if (existing) return;

  const section = document.createElement('div');
  section.className = 'theme-toggle-section';
  section.innerHTML = `
    <div class="sec-title">Aparência</div>
    <div class="card settings-list">
      <div class="theme-toggle-row">
        <span>Modo escuro</span>
        <button class="toggle-switch" id="theme-toggle-btn" onclick="toggleTheme()">
          <div class="toggle-knob"></div>
        </button>
      </div>
      <div class="theme-toggle-row">
        <span>Notificações</span>
        <button class="btn btn-secondary" style="width:auto;padding:8px 14px;font-size:12px" onclick="openOverlay('modal-notif-perm')">Configurar</button>
      </div>
    </div>
    <div class="sec-title">Moeda</div>
    <div class="card" style="padding:14px 16px">
      <div style="font-size:13px;color:var(--text-2);margin-bottom:12px">Símbolo exibido em todos os valores do app</div>
      <div class="curr-pills">
        ${CURRENCIES.map(c => `<button class="curr-pill${c === currSym ? ' curr-pill-on' : ''}" data-cur="${c}" onclick="setCurrency('${c}')">${c}</button>`).join('')}
      </div>
    </div>`;

  const firstSec = settingsPage.querySelector('.sec-title');
  if (firstSec) firstSec.before(section);
  else settingsPage.prepend(section);

  // Set initial toggle state
  updateThemeToggle(document.documentElement.dataset.theme === 'dark');
}

// ══════════════════════════════════════════
// PENDÊNCIAS
// ══════════════════════════════════════════
var pendFilter = 'abertas';

function renderPendInicio() {
  const el = document.getElementById('pend-inicio-card');
  if (!el) return;
  const hoje = todayStr();
  const abertas = (D.pendencias || []).filter(p => p.status === 'aberta');
  if (abertas.length === 0) { el.style.display = 'none'; return; }
  el.style.display = '';
  const altas = abertas.filter(p => p.priority === 'alta').length;
  const vencidas = abertas.filter(p => p.deadline && p.deadline < hoje).length;
  const totalEst = abertas.reduce((s, p) => s + (p.estimatedValue || 0), 0);
  el.innerHTML = `
    <div class="pend-inicio-header" onclick="switchMore('pendencias')">
      <span class="pend-inicio-title">📋 Pendências</span>
      <span class="pend-inicio-link">Ver todas →</span>
    </div>
    <div class="pend-inicio-chips">
      <div class="pic pic-blue">${abertas.length} em aberto</div>
      ${altas > 0 ? `<div class="pic pic-red">${altas} alta${altas>1?'s':''}</div>` : ''}
      ${vencidas > 0 ? `<div class="pic pic-orange">${vencidas} vencida${vencidas>1?'s':''}</div>` : ''}
      ${totalEst > 0 ? `<div class="pic pic-gray">${R(totalEst)} estimado</div>` : ''}
    </div>`;
}

function setPendFilter(f) {
  pendFilter = f;
  document.querySelectorAll('.pend-filter-btn').forEach(b => b.classList.toggle('active', b.dataset.f === f));
  renderPendList();
}

function renderPendencias() {
  const page = document.getElementById('page-pendencias');
  if (!page) return;
  const tabs = page.querySelector('.pend-filter-row');
  if (tabs) tabs.querySelectorAll('.pend-filter-btn').forEach(b => b.classList.toggle('active', b.dataset.f === pendFilter));
  renderPendList();
}

function renderPendList() {
  const cont = document.getElementById('pend-list');
  if (!cont) return;
  const hoje = todayStr();
  let items = (D.pendencias || []);
  if (pendFilter === 'abertas') items = items.filter(p => p.status === 'aberta');
  else if (pendFilter === 'concluidas') items = items.filter(p => p.status === 'concluida');

  if (items.length === 0) {
    cont.innerHTML = `<div class="empty-state">${pendFilter === 'abertas' ? 'Nenhuma pendência em aberto. Toque em + para adicionar.' : 'Nenhuma pendência concluída.'}</div>`;
    return;
  }

  items = [...items].sort((a, b) => {
    const prioOrder = { alta: 0, media: 1, baixa: 2 };
    const ap = prioOrder[a.priority] ?? 1, bp = prioOrder[b.priority] ?? 1;
    if (ap !== bp) return ap - bp;
    if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
    if (a.deadline) return -1;
    if (b.deadline) return 1;
    return (b.createdAt || '').localeCompare(a.createdAt || '');
  });

  cont.innerHTML = items.map(p => {
    const vencida = p.status === 'aberta' && p.deadline && p.deadline < hoje;
    const proxima = p.status === 'aberta' && p.deadline && p.deadline >= hoje && p.deadline <= pendAddDays(hoje, 3);
    const catLabel = PEND_CAT_LABELS[p.category] || p.category;
    const prioLabel = PEND_PRIO_LABELS[p.priority] || p.priority;
    const deadlineStr = p.deadline ? `Prazo: ${pendFmtDate(p.deadline)}` : '';
    const valStr = p.estimatedValue ? `Estimado: ${R(p.estimatedValue)}` : '';
    return `<div class="pend-card${vencida ? ' pend-vencida' : proxima ? ' pend-proxima' : ''}">
      <div class="pend-card-top">
        <div class="pend-card-info">
          <div class="pend-card-title">${pendEsc(p.title)}</div>
          <div class="pend-card-meta">
            <span class="pend-badge pend-prio-${p.priority}">${prioLabel}</span>
            <span class="pend-badge pend-cat">${catLabel}</span>
          </div>
          ${deadlineStr || valStr ? `<div class="pend-card-sub">${[deadlineStr, valStr].filter(Boolean).join(' · ')}</div>` : ''}
          ${p.note ? `<div class="pend-card-note">${pendEsc(p.note)}</div>` : ''}
        </div>
        <div class="pend-card-actions">
          ${p.status === 'aberta'
            ? `<button class="pend-btn pend-btn-done" onclick="completePendencia('${p.id}')" title="Concluir">✓</button>`
            : `<button class="pend-btn pend-btn-reopen" onclick="reopenPendencia('${p.id}')" title="Reabrir">↩</button>`}
          <button class="pend-btn pend-btn-edit" onclick="openPendenciaModal('${p.id}')" title="Editar">✎</button>
          <button class="pend-btn pend-btn-del" onclick="deletePendencia('${p.id}')" title="Excluir">🗑</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function pendEsc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function pendAddDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

function pendFmtDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function openPendenciaModal(id) {
  const modal = document.getElementById('modal-pendencia');
  if (!modal) return;
  const p = id ? (D.pendencias || []).find(x => x.id === id) : null;
  modal.querySelector('#pend-modal-title').textContent = p ? 'Editar Pendência' : 'Nova Pendência';
  modal.querySelector('#pend-id').value = p ? p.id : '';
  modal.querySelector('#pend-title-input').value = p ? p.title : '';
  modal.querySelector('#pend-cat-sel').value = p ? p.category : 'pessoal';
  modal.querySelector('#pend-prio-sel').value = p ? p.priority : 'media';
  modal.querySelector('#pend-deadline').value = p ? (p.deadline || '') : '';
  modal.querySelector('#pend-value').value = p ? (p.estimatedValue || '') : '';
  modal.querySelector('#pend-note').value = p ? (p.note || '') : '';
  _onPendCatChange();
  if (p?.vehicleId) {
    const vehRow = document.getElementById('pend-veh-row');
    if (vehRow) vehRow.style.display = '';
    _populatePendVehSel();
    const vehSel = document.getElementById('pend-veh-sel');
    if (vehSel) vehSel.value = p.vehicleId;
  } else {
    const vehSel = document.getElementById('pend-veh-sel');
    if (vehSel) vehSel.value = '';
  }
  openOverlay('modal-pendencia');
}

function savePendencia() {
  const title = document.getElementById('pend-title-input')?.value?.trim();
  if (!title) { alert('Informe um título para a pendência.'); return; }
  const id = document.getElementById('pend-id')?.value;
  const cat = document.getElementById('pend-cat-sel')?.value || 'pessoal';
  const prio = document.getElementById('pend-prio-sel')?.value || 'media';
  const deadline = document.getElementById('pend-deadline')?.value || null;
  const valRaw = parseFloat(document.getElementById('pend-value')?.value);
  const estimatedValue = valRaw > 0 ? valRaw : null;
  const note = document.getElementById('pend-note')?.value?.trim() || '';
  const pendVehRow = document.getElementById('pend-veh-row');
  const vehicleId = (pendVehRow && pendVehRow.style.display !== 'none')
    ? (document.getElementById('pend-veh-sel')?.value || null) : null;
  if (!D.pendencias) D.pendencias = [];
  if (id) {
    const idx = D.pendencias.findIndex(p => p.id === id);
    if (idx >= 0) {
      const old = D.pendencias[idx];
      const oldVehId = old.vehicleId || null;
      if (oldVehId && oldVehId !== vehicleId) {
        const oldVeh = (D.vehicles||[]).find(v => v.id === oldVehId);
        if (oldVeh) oldVeh.linkedPendencias = (oldVeh.linkedPendencias||[]).filter(pid => pid !== id);
      }
      const updated = { ...old, title, category: cat, priority: prio, deadline, estimatedValue, note };
      if (vehicleId) updated.vehicleId = vehicleId; else delete updated.vehicleId;
      D.pendencias[idx] = updated;
      if (vehicleId && vehicleId !== oldVehId) {
        const newVeh = (D.vehicles||[]).find(v => v.id === vehicleId);
        if (newVeh) { if (!newVeh.linkedPendencias) newVeh.linkedPendencias=[]; if (!newVeh.linkedPendencias.includes(id)) newVeh.linkedPendencias.push(id); }
      }
    }
  } else {
    const pObj = { id: uid(), title, category: cat, priority: prio, deadline, estimatedValue, note, status: 'aberta', createdAt: todayStr() };
    if (vehicleId) pObj.vehicleId = vehicleId;
    D.pendencias.push(pObj);
    if (vehicleId) {
      const veh = (D.vehicles||[]).find(v => v.id === vehicleId);
      if (veh) { if (!veh.linkedPendencias) veh.linkedPendencias=[]; if (!veh.linkedPendencias.includes(pObj.id)) veh.linkedPendencias.push(pObj.id); }
    }
  }
  save();
  closeOverlay('modal-pendencia');
  haptic(10);
  renderPendList();
  renderPendInicio();
  gdToast('Pendência salva!');
}

function completePendencia(id) {
  const p = (D.pendencias || []).find(x => x.id === id);
  if (!p) return;
  p.status = 'concluida';
  p.completedAt = todayStr();
  save();
  renderPendList();
  renderPendInicio();
  haptic(15);
  if (p.estimatedValue && p.estimatedValue > 0) {
    if (confirm(`Pendência concluída! Deseja registrar o valor estimado (${R(p.estimatedValue)}) como gasto?`)) {
      openPendenciaAsExpense(p);
    }
  } else {
    gdToast('Pendência concluída! ✓');
  }
}

function openPendenciaAsExpense(p) {
  _pendVehicleId = p.vehicleId || null;
  const platSel = document.getElementById('qa-plat-sel');
  if (platSel) platSel.innerHTML = D.platforms.map(pl => `<option value="${pl.id}">${pl.name}</option>`).join('');
  const catSel = document.getElementById('qa-cat-sel');
  if (catSel) catSel.innerHTML = (D.expCats || []).map(c => `<option value="${c}">${c}</option>`).join('');
  const dateEl = document.getElementById('qa-date');
  if (dateEl) dateEl.value = todayStr();
  const amtEl = document.getElementById('qa-amt-input');
  if (amtEl) amtEl.value = p.estimatedValue;
  const amtDisp = document.getElementById('qa-amt-display');
  if (amtDisp) amtDisp.textContent = R(p.estimatedValue);
  const descEl = document.getElementById('qa-desc');
  if (descEl) descEl.value = p.title;
  qaSetType('gas');
  document.getElementById('qa-suggest-row').style.display = 'none';
  openOverlay('modal-quick-add');
}

function reopenPendencia(id) {
  const p = (D.pendencias || []).find(x => x.id === id);
  if (!p) return;
  p.status = 'aberta';
  delete p.completedAt;
  save();
  renderPendList();
  renderPendInicio();
  gdToast('Pendência reaberta.');
}

function deletePendencia(id) {
  if (!confirm('Excluir esta pendência?')) return;
  D.pendencias = (D.pendencias || []).filter(p => p.id !== id);
  save();
  renderPendList();
  renderPendInicio();
  haptic(10);
  gdToast('Pendência excluída.');
}

function checkPendenciasDeadlines() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const hoje = todayStr();
  const amanha = pendAddDays(hoje, 1);
  (D.pendencias || []).filter(p => p.status === 'aberta' && p.deadline).forEach(p => {
    if (p.lastDeadlineNotif === hoje) return;
    const isVencida = p.deadline < hoje;
    const isHoje = p.deadline === hoje;
    const isAmanha = p.deadline === amanha;
    if (isVencida || isHoje || isAmanha) {
      const msg = isVencida ? `Pendência vencida: ${p.title}` : isHoje ? `Pendência vence hoje: ${p.title}` : `Pendência vence amanhã: ${p.title}`;
      try { new Notification('Avenco — Pendência', { body: msg, icon: '/GD-CASH/icon-192.png', tag: 'pend-' + p.id }); } catch(e) {}
      p.lastDeadlineNotif = hoje;
    }
  });
  save();
}

// ══════════════════════════════════════════
// PATRIMÔNIO — VEÍCULOS
// ══════════════════════════════════════════

function escHtml(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

var VEH_STATUS_LABELS = { em_uso:'Em uso', na_oficina:'Na oficina', a_venda:'À venda', vendido:'Vendido', arquivado:'Arquivado' };
var VEH_STATUS_COLORS = { em_uso:'var(--green)', na_oficina:'#f59e0b', a_venda:'var(--ac)', vendido:'var(--tx3)', arquivado:'var(--tx3)' };

var _vehDetailId = null;

function renderPatrimonio() {
  if (_vehDetailId) renderVehDetail(_vehDetailId);
  else renderVehList();
}

function _vehShowView(id) {
  ['veh-list-view','veh-detail-view','veh-form-view'].forEach(v => {
    const el = document.getElementById(v);
    if (el) el.style.display = (v === id) ? '' : 'none';
  });
  const addBtn = document.getElementById('veh-add-btn');
  if (addBtn) addBtn.style.display = (id === 'veh-list-view') ? '' : 'none';
}

function renderVehList() {
  _vehDetailId = null;
  _vehShowView('veh-list-view');
  const list = document.getElementById('veh-list');
  if (!list) return;
  const vehicles = D.vehicles || [];
  const active   = vehicles.filter(v => v.status !== 'arquivado' && v.status !== 'vendido');
  const inactive = vehicles.filter(v => v.status === 'arquivado' || v.status === 'vendido');
  if (vehicles.length === 0) {
    list.innerHTML = `<div class="veh-empty"><div class="veh-empty-ico">🚗</div><p>Nenhum veículo cadastrado.</p><button class="btn btn-primary" onclick="openVehForm()">Adicionar veículo</button></div>`;
    return;
  }
  const carSvg = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 17H3v-5l3-5h12l3 5v5h-2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/><path d="M9 12h6"/></svg>`;
  const cardHtml = v => {
    const col = VEH_STATUS_COLORS[v.status] || 'var(--tx3)';
    const lbl = VEH_STATUS_LABELS[v.status] || v.status;
    const sub = [v.brand, v.model, v.year].filter(Boolean).join(' · ');
    return `<div class="veh-card" onclick="renderVehDetail('${v.id}')">
      ${v.photo
        ? `<img class="veh-card-photo" src="${v.photo}" alt="${escHtml(v.name)}">`
        : `<div class="veh-card-photo veh-card-no-photo">${carSvg}</div>`}
      <div class="veh-card-info">
        <div class="veh-card-name">${escHtml(v.name)}</div>
        ${sub ? `<div class="veh-card-sub">${escHtml(sub)}</div>` : ''}
        ${v.km != null ? `<div class="veh-card-km">${Number(v.km).toLocaleString('pt-BR')} km</div>` : ''}
      </div>
      <span class="veh-status-chip" style="background:${col}20;color:${col}">${lbl}</span>
    </div>`;
  };
  let html = active.length === 0
    ? `<div class="veh-empty" style="padding:24px 0"><p style="margin:0;color:var(--tx3)">Nenhum veículo ativo.</p></div>`
    : active.map(cardHtml).join('');
  if (inactive.length > 0) {
    html += `<div class="veh-section-title veh-archive-heading">Vendidos e arquivados (${inactive.length})</div>`;
    html += inactive.map(cardHtml).join('');
  }
  list.innerHTML = html;
}

function renderVehDetail(id) {
  const v = (D.vehicles || []).find(x => x.id === id);
  if (!v) { renderVehList(); return; }
  _vehDetailId = id;
  _vehShowView('veh-detail-view');
  const cont = document.getElementById('veh-detail-cont');
  if (!cont) return;
  const col = VEH_STATUS_COLORS[v.status] || 'var(--tx3)';
  const lbl = VEH_STATUS_LABELS[v.status] || v.status;
  const sub = [v.brand, v.model, v.year, v.color].filter(Boolean).join(' · ');
  const carSvg = `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 17H3v-5l3-5h12l3 5v5h-2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/><path d="M9 12h6"/></svg>`;

  const linkedExps  = (v.linkedExpenses  || []).map(eid => (D.expenses  || []).find(e => e.id === eid)).filter(Boolean);
  const linkedPends = (v.linkedPendencias|| []).map(pid => (D.pendencias|| []).find(p => p.id === pid)).filter(Boolean);
  const history = (v.history || []).slice().reverse();
  const canHardDelete = history.length === 0 && (v.linkedExpenses||[]).length === 0 && (v.linkedPendencias||[]).length === 0;

  cont.innerHTML = `
    <div class="veh-detail-topbar">
      <button class="btn-icon-sm" onclick="renderVehList()">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
        Lista
      </button>
    </div>
    <div class="veh-detail-header">
      ${v.photo ? `<img class="veh-detail-photo" src="${v.photo}" alt="${escHtml(v.name)}">` : `<div class="veh-detail-photo veh-detail-no-photo">${carSvg}</div>`}
      <div class="veh-detail-meta">
        <div class="veh-detail-name">${escHtml(v.name)}</div>
        ${sub ? `<div class="veh-detail-sub">${escHtml(sub)}</div>` : ''}
        ${v.plate ? `<div class="veh-detail-plate">${escHtml(v.plate)}</div>` : ''}
        ${v.km != null ? `<div class="veh-detail-km">${Number(v.km).toLocaleString('pt-BR')} km</div>` : ''}
      </div>
    </div>
    <div class="veh-detail-status-row">
      <span class="veh-status-chip" style="background:${col}20;color:${col}">${lbl}</span>
      <button class="btn-inline-ghost" onclick="openVehStatus('${v.id}')">Alterar status</button>
    </div>
    ${v.notes ? `<div class="veh-detail-notes">${escHtml(v.notes)}</div>` : ''}
    <div class="veh-actions-row">
      <button class="btn-pill" onclick="openVehEvent('${v.id}')">+ Apontamento</button>
      <button class="btn-pill" onclick="openVehLinkExp('${v.id}')">Vincular despesa</button>
      <button class="btn-pill" onclick="openVehLinkPend('${v.id}')">Vincular pendência</button>
    </div>
    ${linkedExps.length ? `
    <div class="veh-section-title">Despesas vinculadas</div>
    <div class="veh-linked-list">${linkedExps.map(e => `
      <div class="veh-linked-item">
        <div class="veh-linked-info">
          <span class="veh-linked-desc">${escHtml(e.description || e.category)}</span>
          <span class="veh-linked-meta">${fmtShort(e.date)} · ${R(e.amount)}</span>
        </div>
        <button class="veh-unlink-btn" onclick="unlinkVehExp('${v.id}','${e.id}')">✕</button>
      </div>`).join('')}</div>` : ''}
    ${linkedPends.length ? `
    <div class="veh-section-title">Pendências vinculadas</div>
    <div class="veh-linked-list">${linkedPends.map(p => `
      <div class="veh-linked-item">
        <div class="veh-linked-info">
          <span class="veh-linked-desc">${escHtml(p.title)}</span>
          <span class="veh-linked-meta">${p.status === 'aberta' ? 'Aberta' : 'Concluída'}${p.estimatedValue ? ' · ' + R(p.estimatedValue) : ''}</span>
        </div>
        <button class="veh-unlink-btn" onclick="unlinkVehPend('${v.id}','${p.id}')">✕</button>
      </div>`).join('')}</div>` : ''}
    ${history.length ? `
    <div class="veh-section-title">Histórico</div>
    <div class="veh-history-list">${history.map(h => `
      <div class="veh-hist-item">
        <div class="veh-hist-dot ${h.type === 'km_update' ? 'km' : ''}"></div>
        <div class="veh-hist-info">
          <div class="veh-hist-main">${h.type === 'km_update' ? Number(h.km).toLocaleString('pt-BR') + ' km' : escHtml(h.note || 'Evento')}</div>
          <div class="veh-hist-meta">${fmtShort(h.date)}${h.amount ? ' · ' + R(h.amount) : ''}</div>
        </div>
        <button class="veh-unlink-btn" onclick="deleteVehHistItem('${v.id}','${h.id}')">✕</button>
      </div>`).join('')}</div>` : ''}
    <div class="veh-detail-footer">
      <button class="btn btn-secondary" onclick="openVehForm('${v.id}')">Editar</button>
      <button class="btn btn-secondary" onclick="archiveVehicle('${v.id}')">Arquivar</button>
    </div>
    ${canHardDelete ? `<div class="veh-hard-delete-row"><button class="btn-text-danger" onclick="deleteVehicle('${v.id}')">Excluir definitivamente</button></div>` : ''}`;
}

function openVehForm(id) {
  const v = id ? (D.vehicles || []).find(x => x.id === id) : null;
  _vehShowView('veh-form-view');
  const cont = document.getElementById('veh-form-cont');
  if (!cont) return;
  const cancelAction = id ? `renderVehDetail('${id}')` : 'renderVehList()';
  cont.innerHTML = `
    <div class="veh-detail-topbar">
      <button class="btn-icon-sm" onclick="${cancelAction}">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
        ${id ? 'Detalhes' : 'Lista'}
      </button>
    </div>
    <div class="form-group">
      <label class="form-label">Nome / apelido *</label>
      <input class="form-input" id="vf-name" value="${escHtml(v?.name||'')}" placeholder="Ex: Prius Preto">
    </div>
    <div class="veh-form-row">
      <div class="form-group"><label class="form-label">Marca</label><input class="form-input" id="vf-brand" value="${escHtml(v?.brand||'')}" placeholder="Toyota"></div>
      <div class="form-group"><label class="form-label">Modelo</label><input class="form-input" id="vf-model" value="${escHtml(v?.model||'')}" placeholder="Prius"></div>
    </div>
    <div class="veh-form-row">
      <div class="form-group"><label class="form-label">Ano</label><input class="form-input" id="vf-year" value="${escHtml(v?.year||'')}" placeholder="2023"></div>
      <div class="form-group"><label class="form-label">Cor</label><input class="form-input" id="vf-color" value="${escHtml(v?.color||'')}" placeholder="Preto"></div>
    </div>
    <div class="veh-form-row">
      <div class="form-group"><label class="form-label">Placa</label><input class="form-input" id="vf-plate" value="${escHtml(v?.plate||'')}" placeholder="ABC-1234"></div>
      <div class="form-group"><label class="form-label">Quilometragem</label><input class="form-input" id="vf-km" type="number" min="0" value="${v?.km ?? ''}" placeholder="45000"></div>
    </div>
    <div class="form-group">
      <label class="form-label">Status</label>
      <select class="form-input" id="vf-status">
        ${Object.entries(VEH_STATUS_LABELS).filter(([k]) => k !== 'arquivado').map(([k,l]) => `<option value="${k}" ${(v?.status||'em_uso')===k?'selected':''}>${l}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Foto</label>
      <div class="veh-photo-upload">
        <div id="vf-photo-preview" class="${v?.photo ? '' : 'veh-photo-empty'}" style="${v?.photo ? 'width:64px;height:64px;border-radius:12px;overflow:hidden' : ''}">
          ${v?.photo ? `<img src="${v.photo}" style="width:100%;height:100%;object-fit:cover">` : 'Sem foto'}
        </div>
        <button type="button" class="btn-pill" onclick="document.getElementById('vf-photo-input').click()">Escolher foto</button>
        <input type="file" id="vf-photo-input" accept="image/*" style="display:none" onchange="onVehPhotoChange(this)">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Observações</label>
      <textarea class="form-input" id="vf-notes" rows="2" placeholder="Notas sobre o veículo">${escHtml(v?.notes||'')}</textarea>
    </div>
    <input type="hidden" id="vf-photo-data" value="${v?.photo||''}">
    <input type="hidden" id="vf-id" value="${v?.id||''}">
    <div class="veh-form-btns">
      <button class="btn btn-secondary" onclick="${cancelAction}">Cancelar</button>
      <button class="btn btn-primary" onclick="saveVehicle()">Salvar</button>
    </div>`;
}

function saveVehicle() {
  const name = (document.getElementById('vf-name')?.value || '').trim();
  if (!name) { gdToast('Nome obrigatório.'); return; }
  const existId = document.getElementById('vf-id')?.value;
  const id = existId || uid();
  const photo = document.getElementById('vf-photo-data')?.value || null;
  const kmRaw = document.getElementById('vf-km')?.value;
  const vehicles = D.vehicles || [];
  const idx = vehicles.findIndex(v => v.id === id);
  const veh = {
    id,
    name,
    brand:  (document.getElementById('vf-brand')?.value || '').trim(),
    model:  (document.getElementById('vf-model')?.value || '').trim(),
    year:   (document.getElementById('vf-year')?.value  || '').trim(),
    color:  (document.getElementById('vf-color')?.value || '').trim(),
    plate:  (document.getElementById('vf-plate')?.value || '').trim(),
    km:     kmRaw !== '' && kmRaw != null ? Number(kmRaw) : null,
    photo:  photo || null,
    notes:  (document.getElementById('vf-notes')?.value || '').trim(),
    status: document.getElementById('vf-status')?.value || 'em_uso',
    history:          idx >= 0 ? (vehicles[idx].history          || []) : [],
    linkedExpenses:   idx >= 0 ? (vehicles[idx].linkedExpenses   || []) : [],
    linkedPendencias: idx >= 0 ? (vehicles[idx].linkedPendencias || []) : [],
  };
  if (idx >= 0) vehicles[idx] = veh; else vehicles.push(veh);
  D.vehicles = vehicles;
  save();
  _vehDetailId = id;
  renderVehDetail(id);
  gdToast(idx >= 0 ? 'Veículo atualizado.' : 'Veículo adicionado.');
}

function archiveVehicle(id) {
  const v = (D.vehicles || []).find(x => x.id === id);
  if (!v) return;
  if (v.status === 'arquivado') { gdToast('Veículo já está arquivado.'); return; }
  v.status = 'arquivado';
  save();
  renderVehList();
  gdToast('Veículo arquivado. Histórico e vínculos preservados.');
}

function deleteVehicle(id) {
  const v = (D.vehicles || []).find(x => x.id === id);
  if (!v) return;
  const hasHistory = (v.history || []).length > 0;
  const hasLinks   = (v.linkedExpenses || []).length > 0 || (v.linkedPendencias || []).length > 0;
  if (hasHistory || hasLinks) {
    gdToast('Veículo com histórico ou vínculos não pode ser excluído. Use "Arquivar".');
    return;
  }
  if (!confirm('Excluir permanentemente este veículo? Esta ação não pode ser desfeita.')) return;
  D.vehicles = (D.vehicles || []).filter(x => x.id !== id);
  save();
  renderVehList();
  gdToast('Veículo excluído definitivamente.');
}

function onVehPhotoChange(input) {
  const file = input.files[0];
  if (!file) return;
  resizeVehPhoto(file).then(dataUrl => {
    if (!dataUrl) return;
    document.getElementById('vf-photo-data').value = dataUrl;
    const prev = document.getElementById('vf-photo-preview');
    if (prev) {
      prev.className = '';
      prev.style.cssText = 'width:64px;height:64px;border-radius:12px;overflow:hidden';
      prev.innerHTML = `<img src="${dataUrl}" style="width:100%;height:100%;object-fit:cover">`;
    }
  });
}

function resizeVehPhoto(file) {
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 400;
      let w = img.width, h = img.height;
      if (w > MAX || h > MAX) {
        if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
        else { w = Math.round(w * MAX / h); h = MAX; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.75));
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

// ── Apontamento modal ──
var _vehEventTarget = null;
function openVehEvent(vehId) {
  _vehEventTarget = vehId;
  const v = (D.vehicles || []).find(x => x.id === vehId);
  if (!v) return;
  document.getElementById('veh-event-modal-title').textContent = 'Apontamento — ' + v.name;
  document.getElementById('ve-date').value = todayStr();
  document.getElementById('ve-type').value = 'evento';
  document.getElementById('ve-note').value = '';
  document.getElementById('ve-km').value = '';
  document.getElementById('ve-amount').value = '';
  _vehEventTypeToggle();
  openOverlay('modal-veh-event');
}

function _vehEventTypeToggle() {
  const t = document.getElementById('ve-type')?.value;
  const kmRow   = document.getElementById('ve-km-row');
  const noteRow = document.getElementById('ve-note-row');
  if (kmRow)   kmRow.style.display   = (t === 'km_update') ? '' : 'none';
  if (noteRow) noteRow.style.display = (t !== 'km_update') ? '' : 'none';
}

function saveVehEvent() {
  const vehId = _vehEventTarget;
  const v = (D.vehicles || []).find(x => x.id === vehId);
  if (!v) return;
  const type   = document.getElementById('ve-type').value;
  const date   = document.getElementById('ve-date').value || todayStr();
  const note   = (document.getElementById('ve-note').value || '').trim();
  const kmVal  = document.getElementById('ve-km').value;
  const amtVal = document.getElementById('ve-amount').value;
  if (type === 'km_update') {
    if (!kmVal) { gdToast('Informe a quilometragem.'); return; }
    v.km = Number(kmVal);
  } else {
    if (!note) { gdToast('Informe uma descrição.'); return; }
  }
  if (!v.history) v.history = [];
  const entry = { id: uid(), type, date, note };
  if (kmVal)  entry.km     = Number(kmVal);
  if (amtVal) entry.amount = Number(amtVal);
  v.history.push(entry);
  save();
  closeOverlay('modal-veh-event');
  renderVehDetail(vehId);
  gdToast('Apontamento salvo.');
}

function deleteVehHistItem(vehId, histId) {
  const v = (D.vehicles || []).find(x => x.id === vehId);
  if (!v) return;
  v.history = (v.history || []).filter(h => h.id !== histId);
  save();
  renderVehDetail(vehId);
}

// ── Vincular despesa ──
var _vehLinkExpTarget = null;
function openVehLinkExp(vehId) {
  _vehLinkExpTarget = vehId;
  const v = (D.vehicles || []).find(x => x.id === vehId);
  if (!v) return;
  const linked = v.linkedExpenses || [];
  const available = (D.expenses || []).filter(e => !linked.includes(e.id)).slice().sort((a,b) => b.date.localeCompare(a.date));
  const sel = document.getElementById('vle-exp-sel');
  if (!sel) return;
  sel.innerHTML = available.length
    ? available.map(e => `<option value="${e.id}">${fmtShort(e.date)} · ${e.category} · ${R(e.amount)}${e.description ? ' · ' + escHtml(e.description) : ''}</option>`).join('')
    : '<option value="">Nenhuma despesa disponível</option>';
  openOverlay('modal-veh-link-exp');
}

function saveVehLinkExp() {
  const vehId = _vehLinkExpTarget;
  const v = (D.vehicles || []).find(x => x.id === vehId);
  if (!v) return;
  const expId = document.getElementById('vle-exp-sel')?.value;
  if (!expId) { gdToast('Selecione uma despesa.'); return; }
  if (!v.linkedExpenses) v.linkedExpenses = [];
  if (!v.linkedExpenses.includes(expId)) { v.linkedExpenses.push(expId); save(); gdToast('Despesa vinculada.'); }
  closeOverlay('modal-veh-link-exp');
  renderVehDetail(vehId);
}

function unlinkVehExp(vehId, expId) {
  const v = (D.vehicles || []).find(x => x.id === vehId);
  if (!v) return;
  v.linkedExpenses = (v.linkedExpenses || []).filter(id => id !== expId);
  save();
  renderVehDetail(vehId);
}

// ── Vincular pendência ──
var _vehLinkPendTarget = null;
function openVehLinkPend(vehId) {
  _vehLinkPendTarget = vehId;
  const v = (D.vehicles || []).find(x => x.id === vehId);
  if (!v) return;
  const linked = v.linkedPendencias || [];
  const available = (D.pendencias || []).filter(p => !linked.includes(p.id));
  const sel = document.getElementById('vlp-pend-sel');
  if (!sel) return;
  sel.innerHTML = available.length
    ? available.map(p => `<option value="${p.id}">${escHtml(p.title)}${p.estimatedValue ? ' · ' + R(p.estimatedValue) : ''} · ${p.status}</option>`).join('')
    : '<option value="">Nenhuma pendência disponível</option>';
  openOverlay('modal-veh-link-pend');
}

function saveVehLinkPend() {
  const vehId = _vehLinkPendTarget;
  const v = (D.vehicles || []).find(x => x.id === vehId);
  if (!v) return;
  const pId = document.getElementById('vlp-pend-sel')?.value;
  if (!pId) { gdToast('Selecione uma pendência.'); return; }
  if (!v.linkedPendencias) v.linkedPendencias = [];
  if (!v.linkedPendencias.includes(pId)) { v.linkedPendencias.push(pId); save(); gdToast('Pendência vinculada.'); }
  closeOverlay('modal-veh-link-pend');
  renderVehDetail(vehId);
}

function unlinkVehPend(vehId, pId) {
  const v = (D.vehicles || []).find(x => x.id === vehId);
  if (!v) return;
  v.linkedPendencias = (v.linkedPendencias || []).filter(id => id !== pId);
  save();
  renderVehDetail(vehId);
}

// ── Status ──
var _vehStatusTarget = null;
function openVehStatus(vehId) {
  _vehStatusTarget = vehId;
  const v = (D.vehicles || []).find(x => x.id === vehId);
  if (!v) return;
  const sel = document.getElementById('vs-status');
  if (sel) sel.value = v.status;
  openOverlay('modal-veh-status');
}

function saveVehStatus() {
  const vehId = _vehStatusTarget;
  const v = (D.vehicles || []).find(x => x.id === vehId);
  if (!v) return;
  v.status = document.getElementById('vs-status')?.value || 'em_uso';
  save();
  closeOverlay('modal-veh-status');
  renderVehDetail(vehId);
  gdToast('Status atualizado.');
}
