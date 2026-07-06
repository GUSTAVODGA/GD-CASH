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
const CURRENCIES = ['R$', 'US$', '€', '£'];
let currSym = localStorage.getItem('gdcash_currency') || 'R$';

function cycleCurrency() {
  const idx = CURRENCIES.indexOf(currSym);
  currSym = CURRENCIES[(idx + 1) % CURRENCIES.length];
  localStorage.setItem('gdcash_currency', currSym);
  document.getElementById('curr-chip').textContent = currSym;
  const active = document.querySelector('.page.active')?.id?.replace('page-', '');
  if (active === 'inicio')  renderInicio();
  else if (active === 'semana')  renderSemana();
  else if (active === 'mes')     renderMes();
  else if (active === 'reserva') renderReserva();
  else if (active === 'fixos')   renderFixos();
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
      checkGoalNotifications();
      checkReminders();
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
    text: 'Visão completa do mês: líquido, gráfico de gastos por categoria, receita por plataforma e histórico dos últimos 6 meses. Toque no mês para navegar.',
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
      D = { ...defaultData(), ...doc.data() };
      if (!D.goals) D.goals = [];
      if (!D.weeklyGoal) D.weeklyGoal = 0;
      if (!D.reminders) D.reminders = [];
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
      return p;
    }
  } catch(e){}
  return defaultData();
})();

function save() {
  try { localStorage.setItem('gdcash_v1', JSON.stringify(D)); } catch(e){}
  if (CLOUD_ENABLED) saveToCloud();
}

function exportData() {
  const blob = new Blob([JSON.stringify(D, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `gdcash-backup-${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  localStorage.setItem('gdcash_last_backup', todayStr());
}
function importData(event) {
  const file = event.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      D = parsed;
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
function dateStr(d)    { return d.toISOString().split('T')[0]; }
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
    const wI=ds.reduce((s,d)=>s+D.platforms.reduce((ss,p)=>{const i=getDayIncome(d);return ss+(i[p.id]||0);},0),0);
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
  const emg=D.emergency;
  const pct=emg.target>0?Math.min(100,(emg.current/emg.target)*100):0;
  document.getElementById('res-total').textContent=R(emg.current);
  document.getElementById('res-pct').textContent=`${Math.round(pct)}%`;
  const ring=document.getElementById('res-ring-fill');
  ring.style.strokeDasharray=`${RING_CIRC}`;
  ring.style.strokeDashoffset=`${RING_CIRC*(1-pct/100)}`;
  document.getElementById('res-meta').textContent=
    `Meta: ${R(emg.target)} — faltam ${R(Math.max(0,emg.target-emg.current))}`;
  const hist=document.getElementById('res-history');
  hist.innerHTML=D.reservaHistory.length
    ? [...D.reservaHistory].reverse().map(h=>`
        <div class="res-hist-item">
          <div class="res-hist-info">
            <div class="res-hist-lbl">${h.note||(h.type==='dep'?'Depósito':'Retirada')}</div>
            <div class="res-hist-date">${fmtShort(h.date)}</div>
          </div>
          <span class="res-hist-amt" style="color:${h.type==='dep'?'var(--green)':'var(--red)'}">
            ${h.type==='dep'?'+':'−'}${R(h.amount)}
          </span>
          <button class="res-hist-del" onclick="deleteResHist('${h.id}')">✕</button>
        </div>`).join('')
    : '<div class="empty-state">Nenhuma movimentação ainda</div>';
  renderGoals();
}

function openResModal(type) {
  const titles={dep:'Depositar na Reserva',ret:'Retirar da Reserva',meta:'Editar Meta'};
  document.getElementById('res-modal-title').textContent=titles[type];
  document.getElementById('res-modal-body').innerHTML=type==='meta'
    ? `<div class="fg"><label class="fl">Meta da Reserva ($)</label>
        <input class="fi" type="number" id="rm-meta" value="${D.emergency.target}" min="0" step="100"></div>
       <button class="btn btn-primary" onclick="saveResMeta()">Salvar Meta</button>`
    : `<div class="fg"><label class="fl">Valor ($)</label>
        <input class="fi" type="number" id="rm-val" min="0" step="0.01" placeholder="0.00"></div>
       <div class="fg"><label class="fl">Observação (opcional)</label>
        <input class="fi" type="text" id="rm-note" placeholder="Ex: Salário, emergência..."></div>
       <button class="btn btn-primary" onclick="saveResMove('${type}')">Confirmar</button>`;
  openOverlay('modal-res');
}
function saveResMeta() {
  D.emergency.target=parseFloat(document.getElementById('rm-meta').value)||0;
  save(); closeOverlay('modal-res'); renderReserva();
}
function saveResMove(type) {
  const val=parseFloat(document.getElementById('rm-val').value)||0;
  const note=document.getElementById('rm-note').value.trim();
  if(!val||val<=0){alert('Informe um valor válido.');return;}
  D.emergency.current=type==='dep' ? D.emergency.current+val : Math.max(0,D.emergency.current-val);
  D.reservaHistory.push({id:uid(),type,amount:val,note,date:todayStr()});
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
  const daysLeft = dates.filter(d => parseDate(d) > now).length;
  let foot = '';
  if (done) foot = 'Meta da semana atingida! 🎉';
  else if (daysLeft === 0) foot = `Faltaram ${R(goal-inc)} pra bater a meta.`;
  else foot = `Faltam <b>${R(goal-inc)}</b> em ${daysLeft} dia${daysLeft!==1?'s':''}`;

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
    parts.push(`Mês começando — ${daysWithData} dia${daysWithData!==1?'s':''} registrado${daysWithData!==1?'s':''}. Saldo até agora: <b>${R(liq)}</b>. Continue registrando pra ter uma análise completa.`);
    return parts[0];
  }

  if (isPast) {
    if (liq>0 && incChange!==null && incChange>15)
      parts.push(`Mês excelente — receita <b>${incChange}% acima</b> do anterior e fechou com <b>${R(liq)}</b> positivo.`);
    else if (liq>0 && savingsRate>=25)
      parts.push(`Boa disciplina: você guardou <b>${savingsRate}%</b> da receita esse mês.`);
    else if (liq>0 && incChange!==null && incChange<-10)
      parts.push(`Receita caiu <b>${Math.abs(incChange)}%</b>, mas o saldo fechou positivo em <b>${R(liq)}</b>.`);
    else if (liq>0)
      parts.push(`Mês fechado no azul: <b>${R(liq)}</b> de saldo positivo.`);
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
      parts.push(`<b>${pctPassed}%</b> do mês passou. Saldo atual: <b>${R(liq)}</b>.`);
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
    requestNotifPermission();
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
async function requestNotifPermission() {
  if (!('Notification' in window) || Notification.permission !== 'default') return;
  await Notification.requestPermission();
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
  const h=D.reservaHistory.find(h=>h.id===id);
  if(!h) return;
  D.emergency.current=h.type==='dep' ? Math.max(0,D.emergency.current-h.amount) : D.emergency.current+h.amount;
  D.reservaHistory=D.reservaHistory.filter(h=>h.id!==id);
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
  const moreTabs = ['fixos','conversor','ajustes','lembretes'];
  document.querySelector('.nav-more-btn')?.classList.toggle('active', moreTabs.includes(tab));
  if(tab==='inicio')    renderInicio();
  if(tab==='semana')    renderSemana();
  if(tab==='mes')       renderMes();
  if(tab==='reserva')   renderReserva();
  if(tab==='fixos')      renderFixos();
  if(tab==='conversor')  loadConversorRates();
  if(tab==='ajustes')    renderBudgetSettings();
  if(tab==='lembretes')  renderLembretes();
  // Show FAB only on main tabs
  const fab = document.getElementById('global-fab');
  if (fab) fab.style.display = ['inicio','semana','mes','reserva'].includes(tab) ? '' : 'none';
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
let DEMO_MODE = false;
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
      { id:'rh1', type:'dep', amount:500, note:'Salário extra',  date: prev[0] },
      { id:'rh2', type:'dep', amount:300, note:'Freela',          date: w[0]   },
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
  { tab:'inicio',  anchor:'hero-inicio',    title:'Tela Início',            text:'Resumo da semana, reserva e movimentações recentes. É aqui que você começa o dia no GD CASH.' },
  { tab:'semana',  anchor:'days-grid',      title:'Dias da semana',          text:'Toque em qualquer dia para lançar ganhos e gastos. Pontinho laranja = dia com dados registrados.' },
  { tab:'mes',     anchor:'big-donut-card', title:'Gastos por categoria',    text:'No mês você vê exatamente onde o dinheiro foi — o gráfico de rosca mostra cada categoria.' },
  { tab:'mes',     anchor:'trends-chart',   title:'Histórico 6 meses',       text:'Barras verdes são receita, vermelhas são gastos. Fica claro se você está evoluindo mês a mês.' },
  { tab:'reserva', anchor:'res-ring-wrap',  title:'Reserva de emergência',   text:'Deposite aos poucos e acompanhe quanto falta para a sua meta de reserva.' },
  { tab:'reserva', anchor:'goals-list',     title:'Suas metas',              text:'Defina metas com prazo e valor — iPhone, viagem, o que for. O app acompanha o progresso.', last:true },
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
}

// ══════════════════════════════════════════
// ONBOARDING
// ══════════════════════════════════════════
const OB_STEPS = [
  { icon:'💰', title:'Bem-vindo ao GD CASH', text:'Seu controle financeiro pessoal. Simples, bonito e gratuito para sempre.', cta:'Próximo' },
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
  ctx.fillText('Líquido do mês',80,435);

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
  ctx.fillText('GD CASH · gustavodga.github.io/GD-CASH/',80,1042);

  canvas.toBlob(blob => {
    const file = new File([blob],'gdcash-resumo.png',{type:'image/png'});
    if (navigator.share && navigator.canShare && navigator.canShare({files:[file]})) {
      navigator.share({files:[file], title:`GD CASH — ${mLabel}`}).catch(()=>{});
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href=url; a.download=`gdcash-${mLabel}.png`; a.click();
      URL.revokeObjectURL(url);
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
    requestNotifPermission();
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
      changed = true;
    }
  });
  if (changed) save();
}

// ══════════════════════════════════════════
// EXPORT — CSV / ICS / EMAIL
// ══════════════════════════════════════════
function exportCSV() {
  const rows = [['Data','Tipo','Categoria/Plataforma','Descrição','Valor']];
  D.expenses.forEach(e => rows.push([e.date,'Gasto',e.category,e.description||e.category,-e.amount]));
  (D.incomeItems||[]).forEach(it => {
    const plat = D.platforms.find(p=>p.id===it.platformId)?.name||'';
    rows.push([it.date,'Receita',plat,it.note||plat,it.amount]);
  });
  Object.entries(D.dailyIncome||{}).forEach(([date,pm]) => {
    D.platforms.forEach(p => {
      const v = pm[p.id];
      const hasItems = (D.incomeItems||[]).some(it=>it.date===date&&it.platformId===p.id);
      if(v&&v>0&&!hasItems) rows.push([date,'Receita',p.name,p.name,v]);
    });
  });
  rows.sort((a,b) => String(a[0]).localeCompare(String(b[0])));
  const csv = rows.map(r => r.map(c => `"${String(c||'').replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿'+csv], {type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download=`gdcash-${todayStr()}.csv`; a.click();
  URL.revokeObjectURL(url);
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
      const ds = d.toISOString().split('T')[0].replace(/-/g,'');
      const nd = new Date(d); nd.setDate(nd.getDate()+1);
      const ns = nd.toISOString().split('T')[0].replace(/-/g,'');
      events += `BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:${ds}\r\nDTEND;VALUE=DATE:${ns}\r\nSUMMARY:🔁 ${f.name} — vencimento\r\nDESCRIPTION:${f.category} · ${R(f.amount)}\r\nUID:gdcash-${f.id}-${ds}@gdcash\r\nBEGIN:VALARM\r\nTRIGGER:-P2D\r\nACTION:DISPLAY\r\nDESCRIPTION:Vence em 2 dias: ${f.name}\r\nEND:VALARM\r\nEND:VEVENT\r\n`;
    }
  });
  const ics = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//GD CASH//PT\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\n${events}END:VCALENDAR`;
  const blob = new Blob([ics], {type:'text/calendar'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download='gdcash-vencimentos.ics'; a.click();
  URL.revokeObjectURL(url);
}

function emailMonthReport() {
  const inc=sumMonthIncome(monthOffset), exp=sumMonthExpenses(monthOffset), liq=inc-exp;
  const mLabel=fmtMonthYear(monthOffset);
  const subject = `GD CASH — Resumo ${mLabel}`;
  const body = `Resumo financeiro: ${mLabel}\n\nReceita:  ${R(inc)}\nGastos:   ${R(exp)}\nLíquido:  ${R(liq)}\n\nReserva de emergência: ${R(D.emergency.current)}\n\n---\nGerado pelo GD CASH`;
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

initSwipe();
initLongPress();
