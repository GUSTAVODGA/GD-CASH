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

function addExpense() {
  const date=selDate(), cat=document.getElementById('exp-cat').value;
  const val=parseFloat(document.getElementById('exp-val').value);
  const desc=document.getElementById('exp-desc').value.trim();
  if(!val||val<=0){alert('Informe um valor válido.');return;}
  D.expenses.push({id:uid(),date,category:cat,amount:val,description:desc});
  document.getElementById('exp-val').value='';
  document.getElementById('exp-desc').value='';
  haptic(10); save(); refreshAfterDayEdit();
  notifyRegistered(val, desc || cat, cat);
}

function deleteExpense(id) { D.expenses=D.expenses.filter(e=>e.id!==id); save(); refreshAfterDayEdit(); }

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
  save(); closeOverlay('modal-week-goal'); renderWeekGoal();
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
  const moreTabs = ['fixos','conversor','ajustes','lembretes','pendencias'];
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
let qaType = 'rec';

const CAT_KEYWORDS = {
  'Alimentação': ['mercado', 'supermercado', 'ifood', 'rappi', 'pizza', 'burger', 'restaurante', 'lanche', 'comida', 'padaria', 'açaí'],
  'Transporte': ['uber', 'gasolina', '99', 'combustível', 'posto', 'estacionamento', 'ônibus', 'metrô', 'taxi'],
  'Moradia': ['aluguel', 'condomínio', 'água', 'luz', 'energia', 'gás', 'internet', 'net'],
  'Lazer': ['cinema', 'netflix', 'spotify', 'show', 'festa', 'bar', 'balada', 'jogo', 'steam'],
  'Saúde': ['farmácia', 'remédio', 'médico', 'academia', 'plano', 'consulta', 'dentista'],
  'Serviços': ['salão', 'barbearia', 'lavanderia', 'conserto', 'manutenção'],
};

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
    D.expenses.push({ id: uid(), date, category: cat, description: desc || cat, amount: amt });
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
const PEND_CAT_LABELS = { carro:'🚗 Carro', casa:'🏠 Casa', documento:'📄 Documento', financeiro:'💰 Financeiro', pessoal:'👤 Pessoal', outra:'📌 Outra' };
const PEND_PRIO_LABELS = { alta:'🔴 Alta', media:'🟡 Média', baixa:'🟢 Baixa' };
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
  if (!D.pendencias) D.pendencias = [];
  if (id) {
    const idx = D.pendencias.findIndex(p => p.id === id);
    if (idx >= 0) D.pendencias[idx] = { ...D.pendencias[idx], title, category: cat, priority: prio, deadline, estimatedValue, note };
  } else {
    D.pendencias.push({ id: uid(), title, category: cat, priority: prio, deadline, estimatedValue, note, status: 'aberta', createdAt: todayStr() });
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
