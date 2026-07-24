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
  if (active === 'inicio')       { renderInicio(); } /* renderInicioCards already called inside renderInicio */
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
      // Render immediately with localStorage data (first paint — no cloud wait)
      initTheme();
      document.getElementById('curr-chip').textContent = currSym;
      renderInicio();
      // Sync with cloud; re-render only if data actually changed
      const _tsBeforeSync = D.updatedAt || 0;
      await loadFromCloud();
      const _migResult = _migrateVehiclesToPatrimonios();
      if (_migResult.ran) save();
      if ((D.updatedAt || 0) !== _tsBeforeSync) {
        document.getElementById('curr-chip').textContent = currSym;
        renderInicio();
      }
      initSettingsExtras();
      checkNotifPrompt();
      // FAB "+" visível nas abas de conteúdo; boot inicia no Início, então exibe.
      const fab = document.getElementById('global-fab');
      if (fab) fab.style.display = '';
      // Defer non-critical checks so the first paint completes before they run
      setTimeout(() => {
        checkGoalNotifications();
        checkReminders();
        checkPendenciasDeadlines();
        checkOnboarding();
        checkInstallBanner();
        handleShortcut();
      }, 100);
    } else {
      currentUser = null;
      _clearPrivateSession();   // remove dados do usuário anterior (memória + cache local)
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
      gdAlert({ title: 'Erro ao entrar', msg: err.message, type: 'error' });
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
    iconSvg: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/></svg>',
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
    <span class="thc-icon${help.iconSvg ? ' thc-icon-svg' : ''}">${help.iconSvg || help.icon}</span>
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
      if (!D.vehicles)    D.vehicles    = [];
      if (!D.patrimonios) D.patrimonios = [];
      localStorage.setItem('gdcash_v1', JSON.stringify(D));
    } else {
      // Primeiro login — oferece migrar dados locais existentes
      const local = localStorage.getItem('gdcash_v1');
      if (local) {
        try {
          const parsed = JSON.parse(local);
          if (Object.keys(parsed.dailyIncome || {}).length > 0) {
            gdConfirm({
              title: 'Dados locais encontrados',
              msg: 'Encontramos dados salvos neste dispositivo. Deseja importar para a nuvem?',
              confirmText: 'Importar',
              cancelText: 'Usar nuvem',
              onConfirm: async () => { D = parsed; await saveToCloud(); },
            });
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
  if (_saveCloudInFlight) return;
  _cloudSyncPending  = false;
  _saveCloudInFlight = true;
  try {
    D.updatedAt = Date.now();
    await db.collection('users').doc(currentUser.uid).collection('data').doc('main').set(D);
  } catch(e) {
    console.error('Erro ao salvar na nuvem:', e);
    _cloudSyncPending = true;
    _saveCloudTimer   = setTimeout(saveToCloud, 5000);
  } finally {
    _saveCloudInFlight = false;
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
    type: 'exp', id: e.id, date: e.date, label: e.description || e.category, sub: e.category, amount: e.amount,
    editRef: { kind: 'exp', id: e.id }
  }));
  const incItems = (D.incomeItems || []).filter(it => it.status === 'paid').map(it => ({
    type: 'inc', id: it.id, date: it.date,
    label: it.note || platMap[it.platformId]?.name || 'Receita',
    sub: platMap[it.platformId]?.name || '',
    amount: it.amount,
    editRef: { kind: 'item', id: it.id }
  }));
  const manualInc = [];
  Object.entries(D.dailyIncome || {}).forEach(([date, pm]) => {
    (D.platforms || []).forEach(p => {
      const v = pm[p.id];
      if (v && v > 0 && !(D.incomeItems || []).some(it => it.date === date && it.platformId === p.id))
        manualInc.push({ type: 'inc', id: '', date, label: p.name, sub: '', amount: v,
          editRef: { kind: 'legacy', date, pid: p.id } });
    });
  });
  const all = [...exps, ...incItems, ...manualInc]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8);
  if (!all.length) {
    listEl.innerHTML = '<div class="empty-state">Sem movimentações ainda</div>';
    return;
  }
  listEl.innerHTML = all.map((tx, i) => {
    const ref = encodeURIComponent(JSON.stringify(tx.editRef));
    return `
    <div class="tx-item" style="--sd:${i*0.04}s"${tx.id ? ` data-id="${tx.id}" data-type="${tx.type}"` : ''} data-ref="${ref}" onclick="homeTxTap(this)" role="button" tabindex="0" aria-label="Editar ${escHtml(tx.label)}">
      <div class="tx-icon ${tx.type === 'inc' ? 'tx-icon-inc' : 'tx-icon-exp'}">${tx.type === 'inc' ? '↑' : '↓'}</div>
      <div class="tx-info">
        <div class="tx-label">${escHtml(tx.label)}</div>
        <div class="tx-sub">${tx.sub ? escHtml(tx.sub) + ' · ' : ''}${tx.type === 'inc' ? 'Receita' : 'Gasto'} · ${fmtShort(tx.date)}</div>
      </div>
      <div class="tx-amt ${tx.type === 'inc' ? 'pos' : 'neg'}">${tx.type === 'inc' ? '+' : '−'}${currSym} ${Math.abs(tx.amount).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
    </div>`;
  }).join('');
}

// Toque em um lançamento recente → abre Editar lançamento (mesmo registro).
// Se um long-press de exclusão acabou de disparar, o clique subsequente é ignorado.
var _homeTxLP = false;
function homeTxTap(el) {
  if (_homeTxLP) { _homeTxLP = false; return; }
  const raw = el && el.getAttribute('data-ref');
  if (!raw) return;
  let ref; try { ref = JSON.parse(decodeURIComponent(raw)); } catch (e) { return; }
  openQuickAdd(ref);
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
// "Mais" agora é uma aba real. Estes wrappers mantêm compatibilidade com
// chamadas/testes antigos.
function openMoreMenu() { switchTab('mais'); }
function switchMore(tab) { switchTab(tab, 'mais'); }
// Voltar de uma tela interna → volta à origem (Mais ou Início).
function navBack() { switchTab(_navOrigin || 'mais'); }
// Engrenagem do cabeçalho → abre Ajustes direto, preservando a origem
// (volta para a aba principal em que o usuário estava).
function openAjustesFromGear() { switchTab('ajustes', _currentMainTab || 'inicio'); }

// ── Aba MAIS: hub de telas secundárias e ferramentas ──
function _maisChevron() {
  return '<svg class="mais-chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>';
}
function renderMais() {
  const root = document.getElementById('mais-root');
  if (!root) return;
  const pendAbertas = (D.pendencias || []).filter(p => p.status === 'aberta').length;
  const fixTotal = (D.fixedExpenses || []).filter(f => !f.paused).reduce((s, f) => s + f.amount, 0);
  const resCur = (D.emergency && D.emergency.current) || 0;
  const resTgt = (D.emergency && D.emergency.target) || 0;
  const resPct = resTgt > 0 ? Math.min(100, Math.round(resCur / resTgt * 100)) : 0;
  const net = _patNetTotals(_patUnifiedItems()).net;
  const themeLbls = { light:'Claro', dark:'Escuro', auto:'Automático' };
  const theme = themeLbls[localStorage.getItem('gdcash_theme') || 'auto'] || 'Automático';

  const item = (tab, icon, title, info) => `
    <button class="mais-item" onclick="switchTab('${tab}','mais')">
      <span class="mais-ico">${icon}</span>
      <span class="mais-body">
        <span class="mais-title">${title}</span>
        ${info ? `<span class="mais-info">${info}</span>` : ''}
      </span>
      ${_maisChevron()}
    </button>`;

  const ICO = {
    pend: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="m9 12 2 2 4-4"/></svg>',
    fix:  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>',
    res:  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    pat:  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="14" width="4" height="8" rx="1"/><rect x="9" y="8" width="4" height="14" rx="1"/><rect x="16" y="4" width="4" height="18" rx="1"/></svg>',
    conv: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/></svg>',
    srch: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',
    adj:  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="18" r="2"/></svg>',
  };

  root.innerHTML = `
    <div class="sec-label mais-sec">Resumos</div>
    <div class="mais-group">
      ${item('pendencias', ICO.pend, 'Pendências', pendAbertas > 0 ? `${pendAbertas} em aberto` : 'Nenhuma em aberto')}
      ${item('fixos', ICO.fix, 'Gastos Fixos', `${R(fixTotal)} / mês`)}
      ${item('reserva', ICO.res, 'Reserva de Emergência', resTgt > 0 ? `${R(resCur)} · ${resPct}% da meta` : R(resCur))}
      ${item('patrimonio', ICO.pat, 'Patrimônio', `Líquido ${R(net)}`)}
    </div>
    <div class="sec-label mais-sec">Ferramentas</div>
    <div class="mais-group">
      ${item('pesquisa', ICO.srch, 'Pesquisar lançamentos', '')}
      ${item('conversor', ICO.conv, 'Conversor de Moedas', '')}
    </div>
    <div class="sec-label mais-sec">Aplicativo</div>
    <div class="mais-group">
      ${item('ajustes', ICO.adj, 'Ajustes', `${currSym} · ${theme}`)}
    </div>
    <div class="mais-bottom-spacer"></div>`;
}

// ══════════════════════════════════════════
// PESQUISAR LANÇAMENTOS
// ══════════════════════════════════════════
var _srchState = { q:'', type:'all', period:'all', from:'', to:'' };

// Normaliza para busca: minúsculas + sem acentos (não persiste nada).
function _srchNorm(s) {
  return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Nome do veículo/patrimônio vinculado a um gasto, se houver.
function _srchLinkName(e) {
  if (e.vehicleId) {
    const v = (D.vehicles||[]).find(x => x.id === e.vehicleId);
    if (v) return v.name || '';
  }
  const p = (D.patrimonios||[]).find(x => (x.linkedExpenses||[]).includes(e.id));
  return p ? (p.nome || '') : '';
}

// Reúne TODOS os lançamentos existentes num formato único (sem persistir).
function _srchCollect() {
  const out = [];
  (D.expenses||[]).forEach(e => {
    out.push({
      type:'exp', date: localDateKey(e.date), amount: e.amount,
      desc: e.description || '', tag: (e.category && String(e.category).trim()) ? e.category : 'Sem categoria',
      link: _srchLinkName(e), editRef: { kind:'exp', id:e.id },
    });
  });
  (D.incomeItems||[]).forEach(it => {
    const pl = (D.platforms||[]).find(p => p.id === it.platformId);
    out.push({
      type:'inc', date: localDateKey(it.date), amount: it.amount,
      desc: it.note || '', tag: pl ? pl.name : 'Receita', link:'',
      pending: it.status === 'pending', editRef: { kind:'item', id:it.id },
    });
  });
  Object.keys(D.dailyIncome||{}).forEach(dateKey => {
    const dk = localDateKey(dateKey);
    Object.keys(D.dailyIncome[dateKey] || {}).forEach(pid => {
      const v = D.dailyIncome[dateKey][pid] || 0;
      if (v <= 0) return;
      // evita duplicar quando há itens no mesmo dia+plataforma (o modelo prioriza itens)
      const hasItems = (D.incomeItems||[]).some(it => localDateKey(it.date) === dk && it.platformId === pid);
      if (hasItems) return;
      const pl = (D.platforms||[]).find(p => p.id === pid);
      out.push({
        type:'inc', date: dk, amount: v, desc:'', tag: pl ? pl.name : 'Receita',
        link:'', editRef: { kind:'legacy', date: dateKey, pid },
      });
    });
  });
  return out;
}

// Intervalo [from,to] (YYYY-MM-DD, comparação local) do período selecionado.
function _srchRange() {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const last = (yy,mm) => new Date(yy, mm+1, 0).getDate();
  const key = (yy,mm,dd) => `${yy}-${String(mm+1).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;
  switch (_srchState.period) {
    case 'month': return { from: key(y,m,1), to: key(y,m,last(y,m)) };
    case '3m': { const d = new Date(y, m-2, 1); return { from: key(d.getFullYear(), d.getMonth(), 1), to: key(y,m,last(y,m)) }; }
    case 'year': return { from: `${y}-01-01`, to: `${y}-12-31` };
    case 'custom': return { from: _srchState.from || '', to: _srchState.to || '' };
    default: return { from:'', to:'' }; // 'all'
  }
}

function _srchPeriodLabel() {
  const r = _srchRange();
  switch (_srchState.period) {
    case 'month': return 'Este mês';
    case '3m': return 'Últimos 3 meses';
    case 'year': return 'Este ano';
    case 'custom': return (r.from||r.to) ? `${r.from ? fmtShort(r.from) : '…'} – ${r.to ? fmtShort(r.to) : '…'}` : 'Personalizado';
    default: return 'Todo o período';
  }
}

// Aplica tipo, período e termo de busca sobre a lista unificada.
function _srchFilter() {
  const { from, to } = _srchRange();
  const q = _srchNorm(_srchState.q).trim();
  return _srchCollect().filter(r => {
    if (_srchState.type === 'exp' && r.type !== 'exp') return false;
    if (_srchState.type === 'inc' && r.type !== 'inc') return false;
    if (from && (!r.date || r.date < from)) return false;
    if (to && (!r.date || r.date > to)) return false;
    if (q) {
      const hay = _srchNorm([r.desc, r.tag, r.link].join(' '));
      if (!hay.includes(q)) return false;
    }
    return true;
  }).sort((a,b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

function renderPesquisa() {
  // Sincroniza a UI com o estado atual (preserva filtros ao voltar).
  const q = document.getElementById('srch-q'); if (q) q.value = _srchState.q;
  const per = document.getElementById('srch-period'); if (per) per.value = _srchState.period;
  ['all','exp','inc'].forEach(t => {
    const b = document.getElementById('srch-type-' + t);
    if (b) { b.classList.toggle('active', _srchState.type === t); b.setAttribute('aria-pressed', _srchState.type === t ? 'true' : 'false'); }
  });
  const cust = document.getElementById('srch-custom'); if (cust) cust.style.display = _srchState.period === 'custom' ? '' : 'none';
  const cf = document.getElementById('srch-from'); if (cf) cf.value = _srchState.from;
  const ct = document.getElementById('srch-to'); if (ct) ct.value = _srchState.to;
  renderPesquisaResults();
}

function srchSetType(t) {
  _srchState.type = t;
  ['all','exp','inc'].forEach(x => {
    const b = document.getElementById('srch-type-' + x);
    if (b) { b.classList.toggle('active', x === t); b.setAttribute('aria-pressed', x === t ? 'true' : 'false'); }
  });
  renderPesquisaResults();
}

function srchSetPeriod(p) {
  _srchState.period = p;
  const cust = document.getElementById('srch-custom');
  if (cust) cust.style.display = p === 'custom' ? '' : 'none';
  renderPesquisaResults();
}

function srchClear() {
  _srchState.q = '';
  const q = document.getElementById('srch-q'); if (q) q.value = '';
  renderPesquisaResults();
}

function renderPesquisaResults() {
  const qEl = document.getElementById('srch-q');
  if (qEl) _srchState.q = qEl.value;
  const cf = document.getElementById('srch-from'); if (cf) _srchState.from = cf.value;
  const ct = document.getElementById('srch-to'); if (ct) _srchState.to = ct.value;
  const clr = document.getElementById('srch-clear'); if (clr) clr.style.display = _srchState.q ? '' : 'none';

  const rows = _srchFilter();
  const sumEl = document.getElementById('srch-summary');
  const listEl = document.getElementById('srch-results');
  if (!sumEl || !listEl) return;

  const n = rows.length;
  const incTotal = rows.filter(r => r.type === 'inc').reduce((s,r) => s+r.amount, 0);
  const expTotal = rows.filter(r => r.type === 'exp').reduce((s,r) => s+r.amount, 0);
  const magTotal = incTotal + expTotal;
  const periodLbl = _srchPeriodLabel();

  if (n === 0) {
    sumEl.innerHTML = `<div class="srch-sum-card"><div class="srch-sum-count">Nenhum lançamento encontrado.</div><div class="srch-sum-period">${escHtml(periodLbl)}</div></div>`;
    listEl.innerHTML = '';
    return;
  }

  // Bloco de valores: evita somar sinais de forma ambígua.
  let valuesHtml = '';
  const onlyExp = incTotal === 0 && expTotal > 0;
  const onlyInc = expTotal === 0 && incTotal > 0;
  if (_srchState.type === 'exp' || onlyExp) {
    valuesHtml = `<div class="srch-sum-main"><span class="srch-sum-k">Total gasto</span><span class="srch-sum-v v-red">${R(expTotal)}</span></div>`;
  } else if (_srchState.type === 'inc' || onlyInc) {
    valuesHtml = `<div class="srch-sum-main"><span class="srch-sum-k">Total recebido</span><span class="srch-sum-v v-green">${R(incTotal)}</span></div>`;
  } else {
    const liq = incTotal - expTotal;
    valuesHtml = `<div class="srch-sum-triple">
        <div><span class="srch-sum-k">Receitas</span><span class="srch-sum-v v-green">${R(incTotal)}</span></div>
        <div><span class="srch-sum-k">Despesas</span><span class="srch-sum-v v-red">${R(expTotal)}</span></div>
        <div><span class="srch-sum-k">Líquido</span><span class="srch-sum-v ${liq>=0?'v-green':'v-red'}">${R(liq)}</span></div>
      </div>`;
  }
  const avg = magTotal / n;
  sumEl.innerHTML = `<div class="srch-sum-card">
      <div class="srch-sum-head"><span class="srch-sum-count">${n} ${n===1?'lançamento':'lançamentos'}</span><span class="srch-sum-period">${escHtml(periodLbl)}</span></div>
      ${valuesHtml}
      <div class="srch-sum-avg">Média por lançamento: ${R(avg)}</div>
    </div>`;

  listEl.innerHTML = rows.map(r => {
    const sign = r.type === 'inc' ? '+' : '−';
    const cls = r.type === 'inc' ? 'v-green' : 'v-red';
    const typeLbl = r.type === 'inc' ? 'Receita' : 'Gasto';
    const title = r.desc || r.tag;
    const linkHtml = r.link ? `<span class="srch-r-link">· ${escHtml(r.link)}</span>` : '';
    const pend = r.pending ? ' <span class="srch-r-pend">(pendente)</span>' : '';
    const ref = encodeURIComponent(JSON.stringify(r.editRef));
    return `<button class="srch-r" onclick="srchOpen('${ref}')">
        <span class="srch-r-ico ${r.type==='inc'?'srch-r-ico-inc':'srch-r-ico-exp'}">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${r.type==='inc'?'<line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>':'<line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>'}</svg>
        </span>
        <span class="srch-r-body">
          <span class="srch-r-title">${escHtml(title)}${pend}</span>
          <span class="srch-r-meta">${fmtShort(r.date)} · ${escHtml(r.tag)} · ${typeLbl} ${linkHtml}</span>
        </span>
        <span class="srch-r-amt ${cls}">${sign}${R(r.amount)}</span>
      </button>`;
  }).join('');
}

// Abre o lançamento no formulário de edição (mesmo registro, sem duplicar).
function srchOpen(refStr) {
  let ref;
  try { ref = JSON.parse(decodeURIComponent(refStr)); } catch (e) { return; }
  openQuickAdd(ref);
}

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
    patrimonios: [],
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
      if(!p.patrimonios) p.patrimonios=[];
      return p;
    }
  } catch(e){}
  return defaultData();
})();

// ══════════════════════════════════════════
// MODAL SYSTEM
// ══════════════════════════════════════════

/* ── Toast ── */
(function() {
  let _wrap = null;
  let _lastMsg = '', _lastTime = 0;
  function _wrap_el() {
    if (!_wrap || !_wrap.isConnected) {
      _wrap = document.createElement('div');
      _wrap.className = 'av-toast-wrap';
      document.body.appendChild(_wrap);
    }
    return _wrap;
  }
  const ICONS = {
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
    error:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    info:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
  };
  window.gdToast = function(msg, opts) {
    if (typeof opts === 'number') opts = { duration: opts };
    const { type, duration = 3800 } = opts || {};
    // Deduplication: mesma mensagem em menos de 600ms não acumula
    const now = Date.now();
    if (msg === _lastMsg && now - _lastTime < 600) return;
    _lastMsg = msg; _lastTime = now;
    const wrap = _wrap_el();
    const el = document.createElement('div');
    el.className = 'av-toast' + (type ? ' av-toast--' + type : '');
    if (type && ICONS[type]) {
      const ic = document.createElement('span');
      ic.className = 'av-toast-icon';
      ic.innerHTML = ICONS[type];
      el.appendChild(ic);
    }
    const ms = document.createElement('span');
    ms.className = 'av-toast-msg';
    ms.textContent = msg;
    el.appendChild(ms);
    wrap.appendChild(el);
    function dismiss() {
      el.classList.add('hiding');
      setTimeout(() => el.parentNode && el.parentNode.removeChild(el), 240);
    }
    const t = setTimeout(dismiss, duration);
    el.addEventListener('click', () => { clearTimeout(t); dismiss(); });
  };
})();

/* ── Dialog helpers ── */
function _esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function _gdDialog({ title, msg, icon, iconCls, actions, onEscOrBackdrop } = {}) {
  const prev = document.getElementById('_av_dlg');
  if (prev) prev.remove();

  const _prevFocus = document.activeElement;

  const ov = document.createElement('div');
  ov.id = '_av_dlg';
  ov.className = 'av-overlay';
  ov.setAttribute('role', 'dialog');
  ov.setAttribute('aria-modal', 'true');
  if (title) ov.setAttribute('aria-label', title);

  const useRow = actions.length > 1;
  let html = '<div class="av-dialog" role="document">';
  if (icon) html += `<div class="av-dialog-icon ${iconCls || ''}">${icon}</div>`;
  if (title) html += `<div class="av-dialog-title">${_esc(title)}</div>`;
  if (msg)   html += `<div class="av-dialog-msg">${_esc(msg)}</div>`;
  html += `<div class="av-dialog-actions${useRow ? ' av-row' : ''}">`;
  actions.forEach((a, i) => {
    html += `<button class="btn ${a.cls || 'btn-secondary'}" data-av-i="${i}">${_esc(a.label)}</button>`;
  });
  html += '</div></div>';
  ov.innerHTML = html;
  document.body.appendChild(ov);
  requestAnimationFrame(() => ov.classList.add('open'));

  let _kh, _closed = false;
  function close(cb) {
    if (_closed) return;
    _closed = true;
    ov.classList.remove('open');
    document.removeEventListener('keydown', _kh, true);
    setTimeout(() => {
      ov.parentNode && ov.parentNode.removeChild(ov);
      try { _prevFocus?.focus?.(); } catch(e) {}
    }, 230);
    cb?.();
  }

  ov.addEventListener('click', e => { if (e.target === ov && onEscOrBackdrop) close(onEscOrBackdrop); });
  _kh = e => {
    if (e.key === 'Escape' && onEscOrBackdrop) { e.stopImmediatePropagation(); close(onEscOrBackdrop); return; }
    if (e.key === 'Tab') {
      const focusable = [...ov.querySelectorAll('button:not([disabled])')];
      if (focusable.length < 2) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (e.shiftKey) { if (document.activeElement === first) { e.preventDefault(); last.focus(); } }
      else            { if (document.activeElement === last)  { e.preventDefault(); first.focus(); } }
    }
  };
  document.addEventListener('keydown', _kh, true);

  ov.querySelectorAll('[data-av-i]').forEach(btn => {
    btn.addEventListener('click', () => close(actions[+btn.dataset.avI].fn));
  });
  setTimeout(() => ov.querySelector('.btn')?.focus(), 60);
}

window.gdConfirm = function({ title, msg, confirmText = 'Confirmar', cancelText = 'Cancelar', variant = 'default', onConfirm, onCancel } = {}) {
  const IC = {
    danger:  { svg: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>', cls: 'av-dialog-icon--danger' },
    warning: { svg: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>', cls: 'av-dialog-icon--warning' },
  };
  const ic = IC[variant] || null;
  const confirmCls = variant === 'danger' ? 'btn-danger' : 'btn-primary';
  _gdDialog({
    title, msg,
    icon: ic?.svg, iconCls: ic?.cls,
    actions: [
      { label: cancelText,  cls: 'btn-ghost', fn: onCancel },
      { label: confirmText, cls: confirmCls,  fn: onConfirm },
    ],
    onEscOrBackdrop: onCancel,
  });
};

window.gdAlert = function({ title, msg, btnText = 'OK', type = 'info', onClose } = {}) {
  const IC = {
    error:   { svg: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>', cls: 'av-dialog-icon--danger' },
    success: { svg: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>', cls: 'av-dialog-icon--success' },
    warning: { svg: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>', cls: 'av-dialog-icon--warning' },
    info:    { svg: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>', cls: 'av-dialog-icon--info' },
  };
  const ic = IC[type] || IC.info;
  _gdDialog({
    title, msg,
    icon: ic.svg, iconCls: ic.cls,
    actions: [{ label: btnText, cls: 'btn-primary', fn: onClose }],
    onEscOrBackdrop: onClose,
  });
};

window.gdLoading = function(show, text = 'Carregando...') {
  let el = document.getElementById('_av_ldg');
  if (show) {
    if (!el) {
      el = document.createElement('div');
      el.id = '_av_ldg';
      el.className = 'av-loading-overlay';
      el.innerHTML = '<div class="av-loading-spinner"></div><div class="av-loading-text"></div>';
      document.body.appendChild(el);
    }
    el.querySelector('.av-loading-text').textContent = text;
    requestAnimationFrame(() => el.classList.add('visible'));
  } else if (el) {
    el.classList.remove('visible');
    setTimeout(() => el.parentNode && el.parentNode.removeChild(el), 210);
  }
};

let _saveCloudTimer    = null;
let _cloudSyncPending  = false;
let _saveCloudInFlight = false;
function save() {
  try { localStorage.setItem('gdcash_v1', JSON.stringify(D)); } catch(e) {
    if (e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22)) {
      gdToast('⚠️ Armazenamento cheio. Exporte seus dados ou ative a sincronização na nuvem.');
    }
  }
  if (CLOUD_ENABLED) {
    _cloudSyncPending = true;
    clearTimeout(_saveCloudTimer);
    _saveCloudTimer = setTimeout(saveToCloud, 1500);
  }
}
function _flushCloudSync() {
  if (!_cloudSyncPending || !currentUser || !db) return;
  clearTimeout(_saveCloudTimer);
  saveToCloud();
}

// SEGURANÇA: ao sair ou trocar de conta, remove QUALQUER dado do usuário
// anterior. O app não usa onSnapshot (apenas get() pontual), então não há
// listeners a cancelar além do timer de gravação; zeramos memória e o cache
// local privado para que nenhuma informação persista no dispositivo.
function _clearPrivateSession() {
  try { clearTimeout(_saveCloudTimer); } catch (e) {}
  _cloudSyncPending  = false;
  _saveCloudInFlight = false;
  D = defaultData();
  try {
    localStorage.removeItem('gdcash_v1');
    localStorage.removeItem('gdcash_migration_backup_v1');
  } catch (e) {}
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
  gdToast('Backup exportado.');
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
        gdToast('Arquivo inválido: campos obrigatórios ausentes (' + missing.join(', ') + ').', { type: 'error' });
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
      gdToast('Dados importados com sucesso!', { type: 'success' });
      setTimeout(() => location.reload(), 1400);
    } catch(e) {
      gdToast('Arquivo inválido. Selecione um backup exportado pelo app.', { type: 'error' });
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

const _animCountTokens = new WeakMap();
function animCount(el, finalVal, duration=550) {
  if (!el) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.textContent = R(finalVal);
    return;
  }
  // Cancel any in-progress animation on this element
  const prev = _animCountTokens.get(el);
  if (prev) prev.cancelled = true;
  const token = { cancelled: false };
  _animCountTokens.set(el, token);
  const start = performance.now();
  const neg = finalVal < 0;
  const abs = Math.abs(finalVal);
  const frame = (now) => {
    if (token.cancelled) return;
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
// Normaliza qualquer data (string 'YYYY-MM-DD', string com horário, ou Date)
// para a chave de DIA LOCAL 'YYYY-MM-DD', sem deslocamento UTC.
function localDateKey(v) {
  if (v == null) return '';
  if (v instanceof Date) return isNaN(v) ? '' : dateStr(v);
  const s = String(v);
  // string com timezone explícita (Z ou ±hh:mm) → interpretar e converter p/ local
  if (/[T ].*(Z|[+-]\d{2}:?\d{2})$/.test(s)) { const d = new Date(s); return isNaN(d) ? '' : dateStr(d); }
  // 'YYYY-MM-DD' com ou sem horário SEM timezone → usar o prefixo local (evita shift UTC)
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(s); return isNaN(d) ? '' : dateStr(d);
}
// Receita paga de uma plataforma num dia (itens têm prioridade sobre input manual)
function getDayPlatIncome(date, pid) {
  const items = (D.incomeItems||[]).filter(it=>localDateKey(it.date)===date&&it.platformId===pid);
  if(items.length>0) return items.filter(it=>it.status==='paid').reduce((s,it)=>s+it.amount,0);
  return getDayIncome(date)[pid]||0;
}
// Total de todos os itens (pagos+pendentes) de uma plataforma num dia — para exibição
function getDayPlatDisplay(date, pid) {
  const items = (D.incomeItems||[]).filter(it=>localDateKey(it.date)===date&&it.platformId===pid);
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
// Conjunto de chaves de dia (LOCAL) do mês civil selecionado.
// Início inclusivo no dia 1; fim exclusivo no dia 1 do mês seguinte.
function monthDayKeys(off=0) { return new Set(monthDates(off)); }
// ── AGREGAÇÃO MENSAL ÚNICA — fonte de verdade da Home e da aba Mês ──
// Recorta ao mês civil por data LOCAL normalizada (sem shift UTC, tolerando
// registros com horário). Retorna receitas, gastos, líquido e os lançamentos
// efetivamente incluídos. Não altera nenhum dado persistido.
function monthAggregate(off=0) {
  const days = monthDates(off);
  const keys = new Set(days);
  // Receitas: por dia civil, itens pagos têm prioridade sobre o input manual
  let receitas = 0;
  const lancReceitas = [];
  days.forEach(d => {
    D.platforms.forEach(p => {
      const items = (D.incomeItems||[]).filter(it=>localDateKey(it.date)===d && it.platformId===p.id);
      if (items.length) {
        items.filter(it=>it.status==='paid').forEach(it=>{ receitas+=it.amount; lancReceitas.push(it); });
      } else {
        receitas += getDayIncome(d)[p.id]||0;
      }
    });
  });
  const lancGastos = (D.expenses||[]).filter(e=>keys.has(localDateKey(e.date)));
  const gastos = lancGastos.reduce((s,e)=>s+e.amount,0);
  return { receitas, gastos, liquido: receitas-gastos, lancamentos: { receitas: lancReceitas, gastos: lancGastos } };
}
function sumMonthIncome(off=0) { return monthAggregate(off).receitas; }
function sumMonthExpenses(off=0) { return monthAggregate(off).gastos; }
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

// Estado da análise por categoria do Mês (para seleção/realce donut↔lista).
var _mesCatItems = [];   // TODAS as categorias reais do mês (ordenadas desc)
var _mesCatTotal = 0;
var _mesCatSel = null;   // índice da categoria selecionada, ou null (mostra total)

// Monta os itens do GRÁFICO: mostra as maiores categorias e agrupa as menores
// em "Outras categorias" APENAS no donut (a lista abaixo mostra todas).
function _donutSlices(items) {
  const MAX = 6;
  if (items.length <= MAX + 1) return items.map((it,i)=>({ ...it, _idx:i }));
  const top = items.slice(0, MAX).map((it,i)=>({ ...it, _idx:i }));
  const rest = items.slice(MAX);
  const restVal = rest.reduce((s,i)=>s+i.value,0);
  top.push({ label:'Outras categorias', value:restVal, color:'#9CA3AF', _idx:null, _group:true });
  return top;
}

function renderBigDonut(svgId, pillsId, totalElId, items) {
  const svg   = document.getElementById(svgId);
  const totEl = document.getElementById(totalElId);
  const total = items.reduce((s,i)=>s+i.value,0);
  _mesCatTotal = total;
  _mesCatSel = null;
  _mesUpdateCenter();

  if(!total) {
    svg.innerHTML = `<circle cx="100" cy="100" r="80" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="22"/>`;
    return;
  }

  const slices = _donutSlices(items);
  const r=80, cx=100, cy=100, gap=3;
  const circ=2*Math.PI*r;
  let offset=0, paths='', finalDash=[];
  slices.forEach((it,idx)=>{
    const len=Math.max(0,(it.value/total)*circ - gap);
    finalDash.push(`${len} ${circ-len}`);
    const target = it._idx==null ? '' : `onclick="_selectCat(${it._idx})"`;
    paths+=`<circle class="cat-slice" data-idx="${it._idx==null?'':it._idx}" cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${it.color}" stroke-width="22"
      stroke-dasharray="0 ${circ}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})"
      stroke-linecap="round" style="cursor:${it._idx==null?'default':'pointer'};transition:stroke-dasharray .65s cubic-bezier(.35,.07,.24,.95) ${idx*0.07}s,opacity .2s,stroke-width .2s" ${target}/>`;
    offset+=(it.value/total)*circ;
  });
  svg.innerHTML = paths;
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    svg.querySelectorAll('circle').forEach((c,i)=>c.setAttribute('stroke-dasharray',finalDash[i]));
  }));
}

// Lista detalhada: TODAS as categorias reais do mês, ordenadas por valor desc,
// com valor e percentual. Sem truncar em top-5, sem "Outros" sintético.
function renderCatRows(elId, items) {
  var el = document.getElementById(elId);
  if (!el) return;
  _mesCatItems = items;
  var total = items.reduce(function(s, it) { return s + it.value; }, 0);
  _mesCatTotal = total;
  if (!total) { el.innerHTML = '<div class="empty-state">Nenhum gasto no mês</div>'; return; }
  el.innerHTML = items.map(function(it, i) {
    var pct = Math.round(it.value / total * 100);
    return '<div class="cat-row" data-idx="' + i + '" onclick="_selectCat(' + i + ')">' +
      '<span class="cat-row-dot" style="background:' + it.color + '"></span>' +
      '<span class="cat-row-name">' + escHtml(it.label) + '</span>' +
      '<span class="cat-row-val">' + R(it.value) + '</span>' +
      '<span class="cat-row-pct">' + pct + '%</span>' +
    '</div>';
  }).join('');
}

// Atualiza o centro do donut (total geral ou categoria selecionada).
function _mesUpdateCenter() {
  var valEl = document.getElementById('cat-donut-total');
  var lblEl = document.getElementById('cat-donut-lbl');
  if (!valEl) return;
  if (_mesCatSel == null || !_mesCatItems[_mesCatSel]) {
    if (_mesCatTotal > 0) animCount(valEl, _mesCatTotal, 400); else valEl.textContent = '—';
    if (lblEl) lblEl.textContent = 'total gasto';
  } else {
    var it = _mesCatItems[_mesCatSel];
    var pct = _mesCatTotal ? Math.round(it.value / _mesCatTotal * 100) : 0;
    valEl.textContent = R(it.value);
    if (lblEl) lblEl.textContent = it.label + ' · ' + pct + '%';
  }
}

// Seleciona/deseleciona uma categoria, realçando a fatia e a linha.
function _selectCat(i) {
  _mesCatSel = (_mesCatSel === i) ? null : i;
  _mesUpdateCenter();
  // realce nas linhas
  document.querySelectorAll('#cat-legend .cat-row').forEach(function(row) {
    var idx = parseInt(row.getAttribute('data-idx'), 10);
    row.classList.toggle('cat-row-active', _mesCatSel === idx);
    row.classList.toggle('cat-row-dim', _mesCatSel != null && _mesCatSel !== idx);
  });
  // realce nas fatias do donut
  document.querySelectorAll('#cat-donut .cat-slice').forEach(function(c) {
    var raw = c.getAttribute('data-idx');
    var idx = raw === '' ? null : parseInt(raw, 10);
    var on = _mesCatSel != null && idx === _mesCatSel;
    var dim = _mesCatSel != null && idx !== _mesCatSel;
    c.style.opacity = dim ? '0.3' : '1';
    c.style.strokeWidth = on ? '26' : '22';
  });
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
  if(!amt||amt<=0){ gdToast('Informe um valor.', { type: 'error' }); return; }
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
  if(!val||val<=0){gdToast('Informe um valor válido.', { type: 'error' });return;}
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
  const agg=monthAggregate(monthOffset);
  const inc=agg.receitas, exp=agg.gastos, liq=agg.liquido, resv=sumMonthReserva(monthOffset);
  animCount(document.getElementById('mes-inc'), inc);
  animCount(document.getElementById('mes-exp'), exp);
  animCount(document.getElementById('mes-liq'), liq, 650);
  animCount(document.getElementById('mes-resv'), resv);
  document.getElementById('hero-mes').className='hero-card '+(liq>=0?'pos':'neg');

  const mExps=agg.lancamentos.gastos;
  const catMap={};
  // Agregação por categoria REAL (string exata). Categoria vazia/ausente recebe
  // um rótulo claro ("Sem categoria") em vez de virar um "Outros" indistinguível.
  // Não unimos categorias diferentes por semelhança de nome/acento/caixa.
  mExps.forEach(e=>{
    const key = (e.category!=null && String(e.category).trim()) ? String(e.category) : 'Sem categoria';
    catMap[key]=(catMap[key]||0)+e.amount;
  });
  const catItems=Object.entries(catMap).sort((a,b)=>b[1]-a[1]).map(([label,value],i)=>({label,value,color:PALETTE[i%PALETTE.length]}));
  renderCatRows('cat-legend', catItems);                        // lista: TODAS as categorias
  renderBigDonut('cat-donut','cat-legend','cat-donut-total',catItems); // donut: maiores + "Outras categorias"

  const platItems=D.platforms.map(p=>({label:p.name,value:sumMonthPlat(p.id,monthOffset),color:p.color})).filter(i=>i.value>0);
  renderDonut('plat-donut','plat-legend',platItems);

  const weeks=getMonthWeeks(monthOffset);
  const monthKeys=monthDayKeys(monthOffset); // recorte ao mês civil (data local)
  const weekSums=weeks.map(w=>{
    const ds=[];const cur=new Date(w.start);
    while(cur<=w.end){const k=dateStr(cur); if(monthKeys.has(k)) ds.push(k); cur.setDate(cur.getDate()+1);}
    const wI=ds.reduce((s,d)=>s+D.platforms.reduce((ss,p)=>ss+getDayPlatIncome(d,p.id),0),0);
    const wE=D.expenses.filter(e=>ds.includes(localDateKey(e.date))).reduce((s,e)=>s+e.amount,0);
    return {wI,wE,wL:wI-wE};
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
            <span class="${w.wL>=0?'v-green':'v-red'}">${(w.wI>0||w.wE>0)?R(w.wL):'—'}</span>
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
// ── FONTE ÚNICA DA VERDADE da Reserva ──
// A validação usa ORDEM CRONOLÓGICA (data real), NUNCA a ordem física do array
// (que pode estar do mais recente para o mais antigo). Desempate estável por
// ÍNDICE ORIGINAL do array (determinístico). A ordem persistida não é alterada.
function _reservaChrono(hist) {
  return (hist || []).map((h, i) => ({ h, i }))
    .sort((a, b) => (a.h.date < b.h.date ? -1 : a.h.date > b.h.date ? 1 : 0) || (a.i - b.i))
    .map(x => x.h);
}
// Saldo total = soma de todos os movimentos (independe da ordem).
function _reservaSaldo(hist) {
  return (hist || D.reservaHistory || []).reduce((s, h) => h.type === 'dep' ? s + h.amount : s - h.amount, 0);
}
// Avalia o saldo corrente em ordem CRONOLÓGICA: total, mínimo global e o saldo
// imediatamente ANTES de cada movimento (por id) — para mensagens de "disponível".
function _reservaEval(hist) {
  const sorted = _reservaChrono(hist);
  let s = 0, min = 0; const before = {};
  for (const h of sorted) { before[h.id] = s; s += h.type === 'dep' ? h.amount : -h.amount; if (s < min) min = s; }
  return { total: s, min, before };
}
// Histórico válido se o saldo cronológico nunca fica negativo em nenhum ponto.
function _reservaHistoryValid(hist) { return _reservaEval(hist).min >= -1e-9; }
// Detecta inconsistência de dados LEGADOS sem alterar nada (recomendação manual).
function _reservaLegacyCheck() {
  const computed = _reservaSaldo(D.reservaHistory);
  const stored = (D.emergency && D.emergency.current) || 0;
  const hasNegativePoint = !_reservaHistoryValid(D.reservaHistory);
  return { consistent: Math.abs(computed - stored) < 0.005 && !hasNegativePoint, stored, computed, hasNegativePoint };
}

function renderReserva() {
  // Regra preservada: saldo = D.emergency.current; pct = min(100, current/target*100)
  // quando target>0, senão 0. Nada de percentual quando não há meta.
  const emg = D.emergency;
  const cur = emg.current || 0;
  const tgt = emg.target || 0;
  const hasMeta = tgt > 0;
  const pct = hasMeta ? Math.min(100, (cur / tgt) * 100) : 0;
  const atMeta = hasMeta && cur >= tgt;

  document.getElementById('res-total').textContent = R(cur);
  document.getElementById('res-pct').textContent = hasMeta ? `${Math.round(pct)}%` : '—';
  const ring = document.getElementById('res-ring-fill');
  ring.style.strokeDasharray = `${RING_CIRC}`;
  ring.style.strokeDashoffset = `${RING_CIRC * (1 - pct / 100)}`; // >100% nunca deforma (pct capado)

  const pctLine = document.getElementById('res-pct-line');
  if (pctLine) pctLine.textContent = !hasMeta ? 'Sem meta definida' : (atMeta ? 'Meta atingida' : `${Math.round(pct)}% da meta`);

  const metaEl = document.getElementById('res-meta');
  if (metaEl) {
    if (!hasMeta) {
      metaEl.innerHTML = `<button class="res-meta-link" onclick="openResModal('meta')">Definir meta da reserva</button>`;
    } else {
      const faltaTxt = atMeta ? 'Meta atingida' : `Faltam <strong>${R(Math.max(0, tgt - cur))}</strong>`;
      metaEl.innerHTML = `<span class="res-meta-info">Meta: <strong>${R(tgt)}</strong> · ${faltaTxt}</span>` +
        `<button class="res-meta-link" onclick="openResModal('meta')">Editar meta</button>`;
    }
  }

  const hist = document.getElementById('res-history');
  hist.innerHTML = D.reservaHistory.length
    ? [...D.reservaHistory].reverse().map(h => {
        const dep = h.type === 'dep';
        const sub = fmtShort(h.date) + (h.note ? ` · ${escHtml(h.note)}` : '');
        return `<div class="res-hist-item av-item">
          <div class="res-hist-info">
            <div class="res-hist-lbl">${dep ? 'Aporte' : 'Retirada'}</div>
            <div class="res-hist-date">${sub}</div>
          </div>
          <span class="res-hist-amt" style="color:${dep ? 'var(--gn)' : 'var(--rd)'}">${dep ? '+' : '−'}${R(h.amount)}</span>
          <button class="res-hist-kebab" onclick="openResMenu('${h.id}')" aria-label="Mais ações">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true" focusable="false"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>
          </button>
        </div>`;
      }).join('')
    : `<div class="res-empty">
         <div class="res-empty-msg">Nenhuma movimentação ainda. Seus aportes e retiradas aparecerão aqui.</div>
         <button class="btn btn-primary res-empty-btn" onclick="openResModal('dep')">Adicionar primeiro aporte</button>
       </div>`;
}
// ── Kebab de ações de uma movimentação (Editar / Excluir) ──
var _resMenuTarget = null;
function openResMenu(id) {
  _resMenuTarget = id;
  const h = (D.reservaHistory || []).find(x => x.id === id);
  const t = document.getElementById('rmenu-title');
  if (t) t.textContent = h ? (h.type === 'dep' ? 'Aporte' : 'Retirada') : 'Movimentação';
  openOverlay('res-menu-sheet');
}
function resMenuEdit() {
  closeOverlay('res-menu-sheet');
  if (_resMenuTarget) editResHist(_resMenuTarget);
}
function resMenuDelete() {
  closeOverlay('res-menu-sheet');
  if (_resMenuTarget) deleteResHist(_resMenuTarget); // deleteResHist já pede confirmação (gdConfirm)
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
  if (!val || val <= 0) { gdToast('Informe um valor válido.', { type: 'error' }); return; }
  // Bloqueio de histórico legado inconsistente: nenhuma ADIÇÃO nova até corrigir
  // manualmente o movimento problemático (evita normalizar/esconder a inconsistência).
  if (!_reservaLegacyCheck().consistent) {
    gdToast('Há uma movimentação antiga inconsistente na reserva. Edite ou exclua o movimento problemático para corrigir antes de adicionar novos.', { type: 'error' });
    return;
  }
  const move = { id: uid(), type, amount: val, note, date };
  // Retirada não pode exceder o saldo disponível em ordem cronológica (sem movimento parcial).
  if (type === 'ret') {
    const ev = _reservaEval([...D.reservaHistory, move]);
    if (ev.min < -1e-9) {
      gdToast(`O valor da retirada é maior que o saldo disponível da reserva. Disponível: ${R(Math.max(0, ev.before[move.id]))}.`, { type: 'error' });
      return; // formulário permanece aberto; nenhum dado é alterado
    }
  }
  D.reservaHistory.push(move);
  D.emergency.current = _reservaSaldo(D.reservaHistory); // fonte única
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
  if (!val || val <= 0) { gdToast('Informe um valor válido.', { type: 'error' }); return; }
  const idx = D.reservaHistory.findIndex(h => h.id === id);
  if (idx === -1) return;
  // Simula o histórico com a alteração e bloqueia se ficar negativo em algum ponto.
  const proposed = D.reservaHistory.map((h, i) => i === idx ? { ...h, amount: val, note, date } : h);
  if (!_reservaHistoryValid(proposed)) {
    gdToast('Esta alteração deixaria o saldo da reserva negativo em algum ponto do histórico.', { type: 'error' });
    return; // formulário permanece aberto; nenhum dado é alterado
  }
  D.reservaHistory = proposed;
  D.emergency.current = _reservaSaldo(D.reservaHistory); // fonte única
  save(); closeOverlay('modal-res'); renderReserva(); renderInicio();
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
    navigator.clipboard?.writeText(url).then(() => gdToast('Link copiado! Cole e envie para quem quiser.', { type: 'success' }));
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
// COMPARATIVO MENSAL — editorial
// ══════════════════════════════════════════
function toggleCompDetails(btn) {
  var d = btn.nextElementSibling;
  var open = d.style.display === 'block';
  d.style.display = open ? 'none' : 'block';
  btn.textContent = open ? 'Ver detalhes ↓' : 'Ocultar detalhes ↑';
}

// Mapa categoria→total de gastos de um mês (opcionalmente até um dia), a partir
// dos dados existentes. Não altera nenhuma agregação persistida.
function _monthCatMap(off, throughDay) {
  var dset = {};
  monthDates(off).forEach(function (dk) {
    if (!throughDay || parseInt(dk.slice(8, 10), 10) <= throughDay) dset[dk] = 1;
  });
  var m = {};
  (D.expenses || []).forEach(function (e) {
    if (!dset[localDateKey(e.date)]) return;
    var cat = (e.category != null && String(e.category).trim()) ? e.category : 'Sem categoria';
    m[cat] = (m[cat] || 0) + e.amount;
  });
  return m;
}

function renderComparativo(off) {
  var el = document.getElementById('mes-comp-section');
  if (!el) return;

  var cur = getMonthData(off);
  var isPartialCurrent = off === 0 && cur.period.dayOfMonth < cur.period.daysInMonth;
  var prev = isPartialCurrent ? getMonthData(off - 1, { throughDay: cur.period.dayOfMonth }) : getMonthData(off - 1);

  if (prev.income.total === 0 && prev.expenses.total === 0) { el.innerHTML = ''; return; }

  var prevLabel = isPartialCurrent
    ? (fmtMonthYear(off - 1) + ' (1–' + cur.period.dayOfMonth + ')')
    : fmtMonthYear(off - 1);

  // delta helper — for details table (unchanged logic)
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
      txt = pct <= 100 ? arrow + ' ' + R(absDiff) + ' (' + pct + '%)' : arrow + ' ' + R(absDiff);
    }
    return { text: txt, color: isGood ? 'var(--green)' : 'var(--red)' };
  }

  // Resumo mais útil por categoria + maior lançamento (usa dados já existentes,
  // sem nova agregação nem alteração de cálculo).
  var throughDay = isPartialCurrent ? cur.period.dayOfMonth : null;
  var curCatMap = _monthCatMap(off, throughDay);
  var prevCatMap = _monthCatMap(off - 1, throughDay);
  var allCats = {};
  Object.keys(curCatMap).forEach(function (c) { allCats[c] = 1; });
  Object.keys(prevCatMap).forEach(function (c) { allCats[c] = 1; });
  var up = null, down = null;
  Object.keys(allCats).forEach(function (c) {
    var d = (curCatMap[c] || 0) - (prevCatMap[c] || 0);
    if (d > 0 && (!up || d > up.d)) up = { c: c, d: d };
    if (d < 0 && (!down || d < down.d)) down = { c: c, d: d };
  });
  var curDates = {};
  monthDates(off).forEach(function (dk) { if (!throughDay || parseInt(dk.slice(8, 10), 10) <= throughDay) curDates[dk] = 1; });
  var biggest = null;
  (D.expenses || []).forEach(function (e) {
    if (curDates[localDateKey(e.date)] && (!biggest || e.amount > biggest.amount)) biggest = e;
  });
  function compCatLine(label, cat, amount, cls, arrow) {
    return '<div class="comp-line ' + cls + '">' + label + ': <b>' + escHtml(cat) + '</b> ' + arrow + ' ' + R(Math.abs(amount)) + '</div>';
  }
  var summaryLines = [];
  if (up)   summaryLines.push(compCatLine('Maior alta em gastos', up.c, up.d, 'neg', '▲'));
  if (down) summaryLines.push(compCatLine('Maior queda em gastos', down.c, down.d, 'pos', '▼'));
  if (biggest) summaryLines.push('<div class="comp-line neu">Maior lançamento: <b>' + escHtml(biggest.description || biggest.category) + '</b> · ' + R(biggest.amount) + '</div>');
  if (!summaryLines.length) summaryLines.push('<div class="comp-line neu">Sem variações relevantes de categoria neste período.</div>');

  // Reserve delta ainda usado na tabela de detalhes
  var hasReserve = cur.reserve.net !== 0 || prev.reserve.net !== 0;

  var periodNote = isPartialCurrent
    ? 'Comparado aos primeiros ' + cur.period.dayOfMonth + ' dias de ' + fmtMonthYear(off - 1)
    : 'Comparado a ' + prevLabel;

  // Details table — full numbers, shown on demand
  var incD = mkDelta(cur.income.total, prev.income.total, false);
  var expD = mkDelta(cur.expenses.total, prev.expenses.total, true);
  var resD = mkDelta(cur.result.net, prev.result.net, false);
  var rvD  = mkDelta(cur.reserve.net, prev.reserve.net, false);

  function detRow(lbl, prevVal, curVal, delta) {
    return '<div class="comp-det-row">' +
      '<span class="comp-det-lbl">' + lbl + '</span>' +
      '<span class="comp-det-val">' + R(prevVal) + '</span>' +
      '<span class="comp-det-val">' + R(curVal) + '</span>' +
      '<span class="comp-det-delta" style="color:' + delta.color + '">' + delta.text + '</span>' +
    '</div>';
  }

  var shortPrev = fmtMonthYear(off - 1).split(' ')[0];
  var detailsHtml =
    '<div class="comp-det-hdr"><span></span><span>' + shortPrev + '</span><span>Este mês</span><span>Δ</span></div>' +
    detRow('Receita', prev.income.total, cur.income.total, incD) +
    detRow('Gastos', prev.expenses.total, cur.expenses.total, expD) +
    detRow('Resultado', prev.result.net, cur.result.net, resD) +
    (hasReserve ? detRow('Reserva', prev.reserve.net, cur.reserve.net, rvD) : '');

  el.innerHTML =
    '<div class="sec-title">Comparativo</div>' +
    '<div class="card comp-card">' +
      '<div class="comp-period">' + periodNote + '</div>' +
      '<div class="comp-lines">' + summaryLines.join('') + '</div>' +
      '<button class="comp-toggle" onclick="toggleCompDetails(this)">Ver detalhes ↓</button>' +
      '<div class="comp-details" style="display:none">' + detailsHtml + '</div>' +
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
    const statusTxt = done ? 'Meta atingida!'
      : daysLeft < 0 ? 'Prazo encerrado'
      : daysLeft === 0 ? 'Hoje é o prazo!'
      : `${daysLeft} dia${daysLeft !== 1 ? 's' : ''} restantes`;
    const statusClass = done ? 'goal-done-txt' : daysLeft >= 0 && daysLeft <= 7 ? 'goal-urgent-txt' : '';
    const cardClass = done ? ' goal-done' : (!done && daysLeft >= 0 && daysLeft <= 7) ? ' goal-urgent' : '';
    const initial = (g.name || '?').charAt(0).toUpperCase();
    const iconHtml = g.emoji
      ? `<span class="goal-emoji">${g.emoji}</span>`
      : `<span class="goal-initial">${initial}</span>`;
    return `
      <div class="goal-card${cardClass}">
        <div class="goal-header">
          ${iconHtml}
          <div class="goal-info">
            <div class="goal-name">${g.name}</div>
            <div class="goal-meta">${fmtShort(g.deadline)} · <span class="${statusClass}">${statusTxt}</span></div>
          </div>
          <div class="goal-btns">
            <button class="icon-btn" onclick="openGoalModal('${g.id}')" title="Editar"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
            <button class="icon-btn icon-btn-del" onclick="deleteGoal('${g.id}')" title="Excluir"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
          </div>
        </div>
        <div class="goal-bar-wrap av-progress av-progress--md">
          <div class="goal-bar-fill${done?' goal-bar-done':''} av-progress-fill${done?' av-progress-fill--success':' av-progress-fill--brand'}" style="width:${pct}%"></div>
        </div>
        <div class="goal-footer">
          <span class="goal-pct-txt">${Math.round(pct)}%</span>
          <span class="goal-saved-txt">${R(g.saved)} <span class="goal-footer-of">de</span> ${R(g.target)}</span>
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
  if (!name || !target || !deadline) { gdToast('Preencha nome, valor e prazo.', { type: 'error' }); return; }
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
  gdConfirm({
    title: 'Excluir meta',
    msg: 'Deseja excluir esta meta permanentemente?',
    confirmText: 'Excluir',
    variant: 'danger',
    onConfirm: () => { D.goals = D.goals.filter(g => g.id !== id); save(); renderGoals(); },
  });
}

function openAddToGoal(id) {
  const g = D.goals.find(g => g.id === id);
  if (!g) return;
  document.getElementById('goal-dep-title').textContent = g.emoji ? `${g.emoji} ${g.name}` : g.name;
  document.getElementById('goal-dep-id').value = id;
  document.getElementById('goal-dep-val').value = '';
  openOverlay('modal-goal-dep');
}

function saveGoalDep() {
  const id = document.getElementById('goal-dep-id').value;
  const val = parseFloat(document.getElementById('goal-dep-val').value) || 0;
  if (!val || val <= 0) { gdToast('Informe um valor válido.', { type: 'error' }); return; }
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
  // Simula o histórico sem o movimento. Excluir retirada é sempre seguro;
  // excluir aporte que sustenta retiradas posteriores é bloqueado.
  const proposed = D.reservaHistory.filter(h => h.id !== id);
  if (!_reservaHistoryValid(proposed)) {
    gdToast('Não é possível excluir este aporte: há retiradas posteriores que dependem dele.', { type: 'error' });
    return; // nenhum dado é alterado
  }
  gdConfirm({
    title: 'Excluir movimentação',
    msg: 'Deseja excluir esta movimentação da reserva?',
    confirmText: 'Excluir',
    variant: 'danger',
    onConfirm: () => {
      D.reservaHistory = proposed;
      D.emergency.current = _reservaSaldo(D.reservaHistory); // fonte única
      save(); renderReserva(); renderInicio();
    },
  });
}

// ══════════════════════════════════════════
// RENDER: FIXOS
// ══════════════════════════════════════════
function renderFixos() {
  document.getElementById('fixed-total').textContent=R(D.fixedExpenses.filter(f=>!f.paused).reduce((s,f)=>s+f.amount,0));
  const list=document.getElementById('fixed-list');
  if (!D.fixedExpenses.length) { list.innerHTML='<div class="empty-state">Nenhum gasto fixo cadastrado</div>'; return; }
  const todayDay = new Date().getDate();
  // Ordenação apenas visual: dia de vencimento crescente; empate por nome;
  // sem dia válido (1–31) vai para o fim. Dados persistidos intocados.
  const fixosOrdenados = [...D.fixedExpenses].sort((a, b) => {
    const ad = (Number.isFinite(a.dueDay) && a.dueDay >= 1 && a.dueDay <= 31) ? a.dueDay : 99;
    const bd = (Number.isFinite(b.dueDay) && b.dueDay >= 1 && b.dueDay <= 31) ? b.dueDay : 99;
    return ad - bd || (a.name || '').localeCompare(b.name || '', 'pt-BR', { sensitivity: 'base' });
  });
  list.innerHTML = fixosOrdenados.map(f => {
    const paused = !!f.paused;
    const nearDue = !paused && f.dueDay && f.dueDay >= todayDay && f.dueDay <= todayDay + 3;
    const overDue = !paused && f.dueDay && f.dueDay < todayDay;
    const dueCls = nearDue ? ' fixed-due-near' : overDue ? ' fixed-due-over' : '';
    const dueTxt = f.dueDay ? ` · <span class="fixed-due-lbl${dueCls}">Vence dia ${f.dueDay}</span>` : '';
    return `
      <div class="fixed-item av-item${nearDue ? ' fixed-near-due' : ''}${paused ? ' fixed-paused' : ''}">
        <div class="fixed-info">
          <div class="fixed-name">${f.name}${paused ? ' <span class="fixed-status">Pausado</span>' : ''}</div>
          <div class="fixed-meta">${f.category}${dueTxt}</div>
        </div>
        <div class="fixed-right">
          <span class="fixed-amt">${R(f.amount)}</span>
          <div class="fixed-actions">
            <button class="fixed-pause-btn${paused ? ' fixed-pause-btn-on' : ''}" onclick="toggleFixedPaused('${f.id}')">${paused ? 'Reativar' : 'Pausar'}</button>
            <button class="fixed-kebab" onclick="openFixedMenu('${f.id}')" aria-label="Mais ações">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true" focusable="false"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>
            </button>
          </div>
        </div>
      </div>`;
  }).join('');
}
// ── Kebab de ações secundárias (Editar / Excluir) ──
var _fixedMenuTarget = null;
function openFixedMenu(id) {
  _fixedMenuTarget = id;
  const f = (D.fixedExpenses || []).find(x => x.id === id);
  const t = document.getElementById('fmenu-title');
  if (t) t.textContent = f ? f.name : 'Gasto fixo';
  openOverlay('fixed-menu-sheet');
}
function fixedMenuEdit() {
  closeOverlay('fixed-menu-sheet');
  if (_fixedMenuTarget) openFixedModal(_fixedMenuTarget);
}
function fixedMenuDelete() {
  closeOverlay('fixed-menu-sheet');
  const id = _fixedMenuTarget;
  if (!id) return;
  gdConfirm({
    title: 'Excluir gasto fixo',
    msg: 'Deseja excluir este gasto fixo permanentemente?',
    confirmText: 'Excluir',
    variant: 'danger',
    onConfirm: () => { deleteFixed(id); haptic(10); gdToast('Gasto fixo excluído.', { type: 'success' }); },
  });
}
function toggleFixedPaused(id) {
  const idx = D.fixedExpenses.findIndex(f => f.id === id);
  if (idx !== -1) D.fixedExpenses[idx].paused = !D.fixedExpenses[idx].paused;
  save(); renderFixos();
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
  if(!name||!amount){gdToast('Preencha nome e valor.', { type: 'error' });return;}
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
function deletePlatform(i) { if(D.platforms.length<=1){gdToast('Mantenha ao menos 1 plataforma.', { type: 'error' });return;} D.platforms.splice(i,1); save(); openPlatSettings(); }

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
  if (!name) { gdToast('Informe um nome para a categoria.', { type: 'error' }); return; }
  if (D.expCats.includes(name)) { gdToast('Categoria já existe.', { type: 'error' }); return; }
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
  const doDelete = () => {
    D.expCats.splice(i, 1);
    save();
    renderCatList();
    populateExpCatSel();
  };
  if (inUse) {
    gdConfirm({
      title: 'Categoria em uso',
      msg: `A categoria "${name}" está em uso em alguns gastos. Deseja mesmo excluir? Os gastos ficarão com a categoria anterior.`,
      confirmText: 'Excluir',
      variant: 'warning',
      onConfirm: doDelete,
    });
  } else {
    doDelete();
  }
}

// ══════════════════════════════════════════
// OVERLAY
// ══════════════════════════════════════════
let _scrollY = 0;
function openOverlay(id) {
  _scrollY = window.scrollY;
  document.body.style.position = 'fixed';
  document.body.style.top = `-${_scrollY}px`;
  document.body.style.width = '100%';
  document.getElementById(id).classList.add('open');
}
function closeOverlay(id) {
  document.getElementById(id).classList.remove('open');
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.width = '';
  window.scrollTo(0, _scrollY);
}
// closeOverlayNav: fecha overlay e garante scroll=0 na nova página (iOS-safe)
// Ao setar top='0' antes de remover position:fixed, o iOS restaura para y=0
function closeOverlayNav(id) {
  document.getElementById(id).classList.remove('open');
  document.body.style.top = '0';
  document.body.style.position = '';
  document.body.style.width = '';
  window.scrollTo(0, 0);
}
document.querySelectorAll('.overlay').forEach(o=>o.addEventListener('click',e=>{ if(e.target===o) closeOverlay(o.id); }));
document.addEventListener('keydown',e=>{ if(e.key==='Escape') document.querySelectorAll('.overlay.open').forEach(o=>closeOverlay(o.id)); });
window.addEventListener('pagehide', _flushCloudSync);
document.addEventListener('visibilitychange', () => { if (document.hidden) _flushCloudSync(); });

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
// Abas reais da navegação inferior e telas internas acessadas por "Mais".
const MAIN_TABS = ['inicio','semana','mes','mais'];
const INTERNAL_TABS = ['pendencias','fixos','reserva','patrimonio','conversor','pesquisa','ajustes','metas','lembretes'];
var _currentMainTab = 'inicio';        // última aba principal ativa (p/ engrenagem)
var _navOrigin      = 'mais';           // origem do Voltar de telas internas

function switchTab(tab, origin) {
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'));
  const page = document.getElementById('page-'+tab);
  if (!page) return;
  page.classList.add('active');
  // Rastreio de origem/aba principal para Voltar e engrenagem.
  if (MAIN_TABS.includes(tab)) _currentMainTab = tab;
  if (INTERNAL_TABS.includes(tab)) _navOrigin = MAIN_TABS.includes(origin) ? origin : 'mais';
  // Destaque da bottom-nav: aba real quando principal; senão, a origem (mais/início).
  const navTab = MAIN_TABS.includes(tab) ? tab : (MAIN_TABS.includes(_navOrigin) ? _navOrigin : 'mais');
  document.querySelector(`[data-tab="${navTab}"]`)?.classList.add('active');
  // Saudação "Olá, …" na topbar: mostrada em Semana/Mês/Mais; oculta em telas
  // internas e também na Home (onde o próprio hero já traz a saudação, evitando
  // duas saudações competindo).
  const greetEl = document.getElementById('logo-greeting');
  if (greetEl) greetEl.style.display = (MAIN_TABS.includes(tab) && tab !== 'inicio') ? '' : 'none';
  if(tab==='inicio')    { renderInicio(); } /* renderInicioCards already called inside renderInicio */
  if(tab==='semana')    { renderSemana(); renderDayAccordion(); }
  if(tab==='mes')       renderMes();
  if(tab==='mais')      renderMais();
  if(tab==='reserva')   renderReserva();
  if(tab==='metas')     renderGoals();
  if(tab==='fixos')      renderFixos();
  if(tab==='conversor')  loadConversorRates();
  if(tab==='pesquisa')   renderPesquisa();
  if(tab==='ajustes')    renderAjustes();
  if(tab==='lembretes')  renderLembretes();
  if(tab==='pendencias') renderPendencias();
  if(tab==='patrimonio') renderPatrimonio();
  // FAB "+" (novo lançamento): visível nas abas de conteúdo Início/Semana/Mês;
  // oculto em Mais e telas internas (que têm suas próprias ações).
  const fab = document.getElementById('global-fab');
  if (fab) fab.style.display = (tab==='inicio' || tab==='semana' || tab==='mes') ? '' : 'none';
  // FAB do Patrimônio só existe na aba patrimonio (renderPatrimonio decide a view)
  const patFab = document.getElementById('pat-fab');
  if (patFab && tab !== 'patrimonio') { patFab.style.display = 'none'; closePatSheet(); }
  checkFirstVisit(tab);
  page.classList.add('tab-fresh');
  page.querySelectorAll('.card,.hero-card').forEach((el,i)=>{
    el.style.setProperty('--sd', (i*0.055)+'s');
  });
  setTimeout(()=>page.classList.remove('tab-fresh'), 700); /* dur-slow(340) + max stagger(~250) + margin */
  // Reset scroll AFTER all DOM mutations so iOS Safari doesn't re-adjust it
  window.scrollTo(0, 0);
  requestAnimationFrame(() => window.scrollTo(0, 0));
}

// ══════════════════════════════════════════
// CONVERSOR DE MOEDAS
// ══════════════════════════════════════════
// Fonte da cotação (INALTERADA): API pública fawazahmed0/currency-api via CDN jsdelivr,
// base BRL. convRates[x] = quantos x por 1 BRL. Cache local apenas da última cotação
// bem-sucedida (chave própria; não altera dados de outras áreas).
const CONV_CACHE_KEY = 'gdcash_conv_rates';
const CONV_SYMBOLS = { brl: 'R$', usd: 'US$', eur: '€', gbp: '£' };
let convRates = null;
let convRatesSource = null;   // 'live' | 'cache' | null
let convRatesDate = null;     // data da cotação (da API)
let convRatesFetchedAt = null;

function _convFmt(v, cur) {
  return `${CONV_SYMBOLS[cur] || ''} ${(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function _convFmtRate(v, cur) {
  const dec = Math.abs(v) < 1 ? 4 : 2; // evita "0,00" em taxas pequenas
  return `${CONV_SYMBOLS[cur] || ''} ${(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: dec })}`;
}
// Aceita vírgula/ponto e valores colados formatados (pt-BR ou en). Nunca NaN, nunca negativo.
function _convParseAmount(str) {
  if (str == null) return 0;
  let s = String(str).trim().replace(/[^\d.,-]/g, '');
  if (!s) return 0;
  const hasComma = s.includes(','), hasDot = s.includes('.');
  if (hasComma && hasDot) {
    // separador decimal = o que aparece por último; o outro é milhar
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (hasComma) {
    s = s.replace(',', '.');
  }
  const n = parseFloat(s);
  return (isNaN(n) || n < 0) ? 0 : n;
}
function _convCacheRead() {
  try { const s = localStorage.getItem(CONV_CACHE_KEY); if (s) return JSON.parse(s); } catch (e) {}
  return null;
}
function _convFmtWhen(ts, date) {
  if (ts) { try { return new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch (e) {} }
  return date || '';
}
function _convSetStatus(state) {
  const updatedEl = document.getElementById('conv-updated');
  const refreshEl = document.getElementById('conv-refresh');
  if (!updatedEl) return;
  updatedEl.classList.remove('conv-cache', 'conv-error');
  if (refreshEl) refreshEl.textContent = 'Atualizar cotação';
  if (state === 'loading') {
    updatedEl.textContent = 'Buscando cotação…';
    if (refreshEl) refreshEl.textContent = 'Buscando…';
  } else if (state === 'live') {
    updatedEl.textContent = 'Atualizado em: ' + _convFmtWhen(convRatesFetchedAt, convRatesDate);
  } else if (state === 'cache') {
    updatedEl.textContent = 'Cotação armazenada — atualizada em ' + _convFmtWhen(convRatesFetchedAt, convRatesDate);
    updatedEl.classList.add('conv-cache');
  } else if (state === 'error') {
    updatedEl.textContent = 'Conexão necessária para obter a cotação. Toque em Atualizar para tentar de novo.';
    updatedEl.classList.add('conv-error');
    const rateEl = document.getElementById('conv-rate');
    const resEl = document.getElementById('conv-result');
    if (rateEl) rateEl.textContent = '';
    if (resEl) resEl.textContent = '—';
  }
}

async function loadConversorRates(force) {
  // Já temos cotação VIVA nesta sessão e não é atualização forçada → só recalcula.
  if (convRates && convRatesSource === 'live' && !force) { convertCurrency(); return; }
  _convSetStatus('loading');
  try {
    const res = await fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/brl.json');
    if (!res.ok) throw new Error('http ' + res.status);
    const data = await res.json();
    if (!data || !data.brl) throw new Error('payload');
    convRates = { ...data.brl, brl: 1 };
    convRatesSource = 'live';
    convRatesDate = data.date || null;
    convRatesFetchedAt = Date.now();
    try { localStorage.setItem(CONV_CACHE_KEY, JSON.stringify({ rates: convRates, date: convRatesDate, fetchedAt: convRatesFetchedAt })); } catch (e) {}
    _convSetStatus('live');
    convertCurrency();
  } catch (e) {
    // Offline / API falhou → usa cache identificado, senão estado de erro claro.
    const cache = _convCacheRead();
    if (cache && cache.rates) {
      convRates = cache.rates; convRatesSource = 'cache';
      convRatesDate = cache.date || null; convRatesFetchedAt = cache.fetchedAt || null;
      _convSetStatus('cache');
      convertCurrency();
    } else {
      convRates = null; convRatesSource = null;
      _convSetStatus('error');
    }
  }
}
function refreshConvRates() { loadConversorRates(true); }

function convertCurrency() {
  const resEl = document.getElementById('conv-result');
  const rateEl = document.getElementById('conv-rate');
  if (!resEl) return;
  const amount = _convParseAmount((document.getElementById('conv-amount') || {}).value);
  const from = (document.getElementById('conv-from') || {}).value;
  const to = (document.getElementById('conv-to') || {}).value;
  if (!convRates || !from || !to) { resEl.textContent = '—'; return; } // sem cotação → não calcula
  const inBRL = amount / convRates[from];
  const result = inBRL * convRates[to];
  const rate = convRates[to] / convRates[from];
  resEl.textContent = amount > 0 ? _convFmt(result, to) : '—';
  if (rateEl) rateEl.textContent = `1 ${from.toUpperCase()} = ${_convFmtRate(rate, to)}`;
}

function swapCurrencies() {
  const fromEl = document.getElementById('conv-from');
  const toEl   = document.getElementById('conv-to');
  if (!fromEl || !toEl) return;
  const tmp    = fromEl.value;
  fromEl.value = toEl.value;
  toEl.value   = tmp;
  convertCurrency();
}
function copyConvResult() {
  const txt = (document.getElementById('conv-result') || {}).textContent || '';
  if (!txt || txt === '—') { gdToast('Nada para copiar ainda.', { type: 'error' }); return; }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(txt).then(() => gdToast('Resultado copiado.', { type: 'success' })).catch(() => gdToast('Não foi possível copiar.', { type: 'error' }));
  } else {
    gdToast('Cópia não suportada neste dispositivo.', { type: 'error' });
  }
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
// Story de compartilhamento — 9:16, identidade AVENCO, adaptado ao tema atual.
// Mesmos dados de sempre (resultado, receita, gastos, top categorias, mês).
function shareMonthReport() {
  const canvas = _buildMonthStoryCanvas();
  const mLabel = fmtMonthYear(monthOffset);
  canvas.toBlob(blob => {
    const file = new File([blob], 'avenco-resumo.png', { type: 'image/png' });
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: `Avenco — ${mLabel}` }).catch(() => {});
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `avenco-${mLabel}.png`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }, 'image/png');
}

function _buildMonthStoryCanvas() {
  const W = 1080, H = 1920, M = 100;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const inc = sumMonthIncome(monthOffset), exp = sumMonthExpenses(monthOffset), liq = inc - exp;
  const mLabel = fmtMonthYear(monthOffset);

  const dark = document.documentElement.dataset.theme === 'dark';
  const C = dark
    ? { bg1:'#0F1629', bg2:'#0A0F1E', text:'#E8EDFF', dim:'rgba(232,237,255,.55)', faint:'rgba(232,237,255,.34)', ac:'#5B8AF5', gn:'#4ADE80', rd:'#F87171', line:'rgba(232,237,255,.12)', card:'rgba(232,237,255,.05)' }
    : { bg1:'#F2F0EA', bg2:'#E7E4DB', text:'#0D1440', dim:'rgba(13,20,64,.58)', faint:'rgba(13,20,64,.38)', ac:'#2563EB', gn:'#16A34A', rd:'#DC2626', line:'rgba(13,20,64,.10)', card:'rgba(13,20,64,.04)' };
  const F = "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif";

  // Fundo com leve gradiente vertical + brilho do acento no topo
  const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, C.bg1); bgGrad.addColorStop(1, C.bg2);
  ctx.fillStyle = bgGrad; ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W/2, 120, 0, W/2, 120, 720);
  glow.addColorStop(0, dark ? 'rgba(91,138,245,.16)' : 'rgba(37,99,235,.10)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);

  const roundRect = (x, y, w, h, r) => {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else {
      ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
      ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
    }
  };

  // ── Marca AVENCO: badge com triângulo + wordmark ──
  const bs = 120, bx = M, by = 150;
  roundRect(bx, by, bs, bs, 30);
  ctx.fillStyle = C.ac; ctx.fill();
  // triângulo (contorno branco, apontando para cima) — igual ao logo do app
  ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 9; ctx.lineJoin = 'round';
  const tcx = bx + bs/2, tcy = by + bs/2, ts = 34;
  ctx.beginPath();
  ctx.moveTo(tcx, tcy - ts); ctx.lineTo(tcx + ts*0.92, tcy + ts*0.72);
  ctx.lineTo(tcx - ts*0.92, tcy + ts*0.72); ctx.closePath(); ctx.stroke();
  ctx.fillStyle = C.text; ctx.font = `800 66px ${F}`; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('Avenco', bx + bs + 34, by + 84);

  // Mês
  ctx.fillStyle = C.faint; ctx.font = `600 40px ${F}`;
  ctx.fillText(mLabel.charAt(0).toUpperCase() + mLabel.slice(1), M, by + bs + 90);

  // Auto-ajuste de fonte para nunca cortar valores grandes
  const fitFont = (text, maxW, base, weight) => {
    let size = base; ctx.font = `${weight} ${size}px ${F}`;
    while (ctx.measureText(text).width > maxW && size > 22) { size -= 2; ctx.font = `${weight} ${size}px ${F}`; }
    return size;
  };
  const contentW = W - M*2;

  // ── Resultado do mês (destaque) ──
  let y = by + bs + 250;
  ctx.fillStyle = C.dim; ctx.font = `600 42px ${F}`;
  ctx.fillText('Resultado do mês', M, y);
  y += 130;
  const liqTxt = R(liq);
  const liqSize = fitFont(liqTxt, contentW, 150, '800');
  ctx.fillStyle = liq >= 0 ? C.gn : C.rd; ctx.font = `800 ${liqSize}px ${F}`;
  ctx.fillText(liqTxt, M, y);

  // Divider
  y += 90; ctx.fillStyle = C.line; ctx.fillRect(M, y, contentW, 2);

  // ── Receita / Gastos (duas colunas, cada valor ajustado à sua metade) ──
  y += 120;
  const colW = (contentW - 50) / 2;
  const colGx = M + colW + 50; // início da coluna de Gastos
  const incTxt = '↑ ' + R(inc), expTxt = '↓ ' + R(exp);
  const incSize = fitFont(incTxt, colW, 58, '800');
  ctx.fillStyle = C.gn; ctx.font = `800 ${incSize}px ${F}`;
  ctx.fillText(incTxt, M, y);
  const expSize = fitFont(expTxt, colW, 58, '800');
  ctx.fillStyle = C.rd; ctx.font = `800 ${expSize}px ${F}`;
  ctx.fillText(expTxt, colGx, y);
  ctx.fillStyle = C.faint; ctx.font = `600 34px ${F}`;
  ctx.fillText('Receita', M, y + 56);
  ctx.fillText('Gastos', colGx, y + 56);

  // ── Top categorias ──
  const dates = monthDates(monthOffset);
  const catMap = {};
  D.expenses.filter(e => dates.includes(e.date)).forEach(e => { catMap[e.category] = (catMap[e.category]||0) + e.amount; });
  const topCats = Object.entries(catMap).sort((a,b) => b[1]-a[1]).slice(0, 3);
  if (topCats.length) {
    y += 170; ctx.fillStyle = C.line; ctx.fillRect(M, y, W - M*2, 2);
    y += 80; ctx.fillStyle = C.dim; ctx.font = `600 38px ${F}`;
    ctx.fillText('Top categorias', M, y);
    y += 90;
    topCats.forEach(([cat, val], i) => {
      const ry = y + i*110;
      roundRect(M, ry - 46, contentW, 92, 22);
      ctx.fillStyle = C.card; ctx.fill();
      ctx.fillStyle = PALETTE[i % PALETTE.length];
      ctx.beginPath(); ctx.arc(M + 44, ry, 16, 0, Math.PI*2); ctx.fill();
      // valor à direita (fonte fixa), nome à esquerda ajustado ao espaço restante
      const valTxt = R(val);
      ctx.font = `700 46px ${F}`;
      const valW = ctx.measureText(valTxt).width;
      const nameMaxW = contentW - 84 - 30 - valW - 40;
      const nameSize = fitFont(cat, nameMaxW, 46, '700');
      ctx.fillStyle = C.text; ctx.textAlign = 'left'; ctx.font = `700 ${nameSize}px ${F}`;
      ctx.fillText(cat, M + 84, ry + 16);
      ctx.font = `700 46px ${F}`; ctx.textAlign = 'right';
      ctx.fillText(valTxt, W - M - 30, ry + 16);
      ctx.textAlign = 'left';
    });
  }

  // Footer AVENCO
  ctx.fillStyle = C.faint; ctx.font = `600 34px ${F}`; ctx.textAlign = 'center';
  ctx.fillText('Avenco', W/2, H - 90);
  ctx.textAlign = 'left';

  return canvas;
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
  if (document.getElementById('page-ajustes')?.classList.contains('active')) {
    renderAjustes(); return;
  }
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
  if (!limit || limit <= 0) { gdToast('Informe um valor válido.', { type: 'error' }); return; }
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
  if (!name || !date) { gdToast('Preencha nome e data.', { type: 'error' }); return; }
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
  if (!fixed.length) { gdToast('Cadastre gastos fixos com dia de vencimento antes de exportar.', { type: 'error' }); return; }
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
      _homeTxLP = true; // impede que o clique seguinte abra a edição
      item.classList.add('tx-pressing');
      setTimeout(() => item.classList.remove('tx-pressing'), 300);
      const { type, id } = item.dataset;
      gdConfirm({
        title: 'Excluir movimentação',
        msg: 'Deseja excluir esta movimentação?',
        confirmText: 'Excluir',
        variant: 'danger',
        onConfirm: () => {
          if (type === 'exp') { D.expenses = D.expenses.filter(e => e.id !== id); }
          else if (type === 'inc') { D.incomeItems = (D.incomeItems||[]).filter(it => it.id !== id); }
          save(); renderInicio();
        },
      });
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
var PEND_CAT_NAMES   = { carro:'Carro', casa:'Casa', documento:'Documento', financeiro:'Financeiro', pessoal:'Pessoal', outra:'Outra' };
var PEND_PRIO_NAMES  = { alta:'Alta prioridade', media:'Média prioridade', baixa:'Baixa prioridade' };
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
// Estado de edição do formulário de lançamento (null = criação).
// Formas: {kind:'exp', id} | {kind:'item', id} | {kind:'legacy', date, pid}
var _qaEdit = null;
var _qaSaving = false;
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
  const dark = saved === 'dark' ? true : saved === 'light' ? false : prefersDark;
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}
function toggleTheme() {
  const isDark = document.documentElement.dataset.theme === 'dark';
  setTheme(isDark ? 'light' : 'dark');
}
function updateThemeToggle(dark) {
  const btn = document.getElementById('theme-toggle-btn');
  if (btn) btn.classList.toggle('on', dark);
}
function setTheme(mode) {
  localStorage.setItem('gdcash_theme', mode);
  const dark = mode === 'dark' ? true : mode === 'light' ? false
    : window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  closeOverlay('modal-theme-sheet');
  const chip = document.getElementById('srow-theme-val');
  if (chip) chip.textContent = ({ light:'Claro', dark:'Escuro', auto:'Sistema' })[mode] || 'Sistema';
  gdToast('Aparência atualizada.');
}
function openThemeSheet() {
  const saved = localStorage.getItem('gdcash_theme') || 'auto';
  document.querySelectorAll('#modal-theme-sheet .opt-row').forEach(el => {
    el.classList.toggle('opt-on', el.dataset.theme === saved);
  });
  openOverlay('modal-theme-sheet');
}
function openCurrencySheet() {
  document.querySelectorAll('#modal-currency-sheet .opt-row').forEach(el => {
    el.classList.toggle('opt-on', el.dataset.cur === currSym);
  });
  openOverlay('modal-currency-sheet');
}
function setCurrencyFromSheet(sym) {
  setCurrency(sym);
  closeOverlay('modal-currency-sheet');
  const chip = document.getElementById('srow-curr-val');
  if (chip) chip.textContent = sym;
  gdToast('Moeda alterada.');
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
  // A Home traz a saudação no hero; oculta a saudação da topbar aqui também
  // (cobre o boot, que renderiza a Home sem passar por switchTab).
  const topGreet = document.getElementById('logo-greeting');
  if (topGreet) topGreet.style.display = 'none';

  const monthEl = document.getElementById('home-month');
  if (monthEl) {
    const d = new Date(); d.setMonth(d.getMonth() + monthOffset, 1);
    monthEl.textContent = d.toLocaleDateString('pt-BR', {month: 'long', year: 'numeric'});
  }

  const agg = monthAggregate(monthOffset);
  const inc = agg.receitas, exp = agg.gastos, liq = agg.liquido;

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

  const hoje = todayStr();

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
        // Contexto: nome do bem vinculado (patrimonioId > vehicleId legado) + categoria
        const assetName = _pendAssetName(p);
        const catLbl = (PEND_CAT_LABELS[p.category] || p.category || '').replace(/^[^\p{L}]*\s*/u, '');
        const ctx = [assetName, catLbl].filter(Boolean).join(' · ');
        return `<div class="hc-pend-item" onclick="switchTab('pendencias','inicio')">
          <div class="hc-pend-bar ${barCls}"></div>
          <div class="hc-pend-info">
            <div class="hc-pend-name">${p.title}</div>
            ${ctx ? `<div class="hc-pend-ctx">${escHtml(ctx)}</div>` : ''}
            ${dt ? `<div class="hc-pend-date${dateCls}">${isOv?'Venceu ':''}${dt}</div>` : ''}
          </div>
          ${p.estimatedValue ? `<div class="hc-pend-amount">${R(p.estimatedValue)}</div>` : ''}
        </div>`;
      }).join('');
    } else {
      pendSection.style.display = 'none';
    }
  }

  // Reserva — resumo curto: saldo + progresso/meta + acesso (sem repetir o hero da Reserva)
  const resvSection = document.getElementById('home-resv-section');
  const resvCard = document.getElementById('home-resv-card');
  if (resvSection && resvCard) {
    const saldo = (D.emergency && D.emergency.current) || 0;
    const meta  = (D.emergency && D.emergency.target)  || 0;
    if (saldo > 0 || meta > 0) {
      resvSection.style.display = '';
      const pct = meta > 0 ? Math.min(100, Math.round(saldo / meta * 100)) : 0;
      const metaLine = meta > 0
        ? `<div class="hc-resv-meta"><span>${pct}% da meta</span><span>Meta ${R(meta)}</span></div>
           <div class="hc-resv-track"><div class="hc-resv-fill${pct>=100?' hc-resv-done':''}" style="width:${pct}%"></div></div>`
        : `<div class="hc-resv-meta"><span>Sem meta definida</span></div>`;
      resvCard.innerHTML = `
        <div class="hc-resv-top">
          <div class="hc-resv-lbl">Saldo guardado</div>
          <div class="hc-resv-val">${R(saldo)}</div>
        </div>
        ${metaLine}`;
    } else {
      resvSection.style.display = 'none';
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

let _homeChartHash = '';
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

  // Skip redraw when data and theme are unchanged
  const theme = document.documentElement.dataset.theme || '';
  const hash  = months.map(m => m.inc + '|' + m.exp).join(',') + ':' + theme + ':' + canvas.offsetWidth;
  if (hash === _homeChartHash && canvas.width > 0) return;
  _homeChartHash = hash;
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
            <button class="dacc-tx-edit" title="Editar" aria-label="Editar lançamento" onclick="openQuickAdd({kind:'item',id:'${it.id}'})"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
            <button class="dacc-tx-del" title="Remover" aria-label="Remover lançamento" onclick="D.incomeItems=(D.incomeItems||[]).filter(x=>x.id!=='${it.id}');save();renderDayAccordion();refreshAfterDayEdit()">✕</button>
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
        <button class="dacc-tx-edit" title="Editar" aria-label="Editar lançamento" onclick="openQuickAdd({kind:'legacy',date:'${d}',pid:'${p.id}'})"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        <button class="dacc-tx-del" title="Remover" aria-label="Remover lançamento" onclick="setDayIncome('${d}','${p.id}',0);renderDayAccordion();refreshAfterDayEdit()">✕</button>
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
        <button class="dacc-tx-edit" title="Editar" aria-label="Editar lançamento" onclick="openQuickAdd({kind:'exp',id:'${e.id}'})"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        <button class="dacc-tx-del" title="Remover" aria-label="Remover lançamento" onclick="deleteExpense('${e.id}');renderDayAccordion();refreshAfterDayEdit()">✕</button>
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
      <div class="dacc-body"><div class="dacc-body-in">${hasData ? platItems + expItems : emptyMsg}${editFooter}</div></div>
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
  // Em modo edição o tipo é travado (não converte receita↔gasto).
  if (_qaEdit) return;
  qaType = type;
  const rec = document.getElementById('qa-btn-rec'), gas = document.getElementById('qa-btn-gas');
  rec.classList.toggle('active', type === 'rec');
  gas.classList.toggle('active', type === 'gas');
  rec.setAttribute('aria-pressed', type === 'rec' ? 'true' : 'false');
  gas.setAttribute('aria-pressed', type === 'gas' ? 'true' : 'false');
  document.getElementById('qa-cat-row').style.display = type === 'gas' ? '' : 'none';
  document.getElementById('qa-plat-row').style.display = type === 'rec' ? '' : 'none';
  document.getElementById('qa-suggest-row').style.display = 'none';
}

// Popula os selects de plataforma e categoria do formulário de lançamento.
function _qaPopulateSelects() {
  const platSel = document.getElementById('qa-plat-sel');
  if (platSel) platSel.innerHTML = D.platforms.map(p => `<option value="${p.id}">${escHtml(p.name)}</option>`).join('');
  const catSel = document.getElementById('qa-cat-sel');
  if (catSel) catSel.innerHTML = (D.expCats || []).map(c => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('');
}

// Adiciona uma receita seguindo o modelo atual (itens têm prioridade quando já
// existem no dia+plataforma; caso contrário usa o mapa legado dailyIncome).
function _addIncome(date, pid, amt, note) {
  const hasItems = (D.incomeItems||[]).some(it => localDateKey(it.date)===date && it.platformId===pid);
  if (hasItems) {
    if (!D.incomeItems) D.incomeItems = [];
    D.incomeItems.push({ id: uid(), date, platformId: pid, amount: amt, note: note || '', status: 'paid' });
    save();
  } else {
    const existing = getDayIncome(date)[pid] || 0;
    setDayIncome(date, pid, existing + amt);
  }
}

// Ajusta o cabeçalho/estado do formulário para criação ou edição.
function _qaApplyMode() {
  const titleEl = document.getElementById('qa-title');
  const delBtn = document.getElementById('qa-del-btn');
  const toggle = document.getElementById('qa-type-toggle');
  if (titleEl) titleEl.textContent = _qaEdit ? 'Editar lançamento' : 'Novo lançamento';
  if (delBtn) delBtn.style.display = _qaEdit ? '' : 'none';
  // Em edição, trava a troca de tipo (evita mover registro entre receita/gasto).
  if (toggle) toggle.classList.toggle('qa-type-locked', !!_qaEdit);
}

// Oculta o FAB global enquanto o formulário/sheet está aberto e o restaura
// conforme a aba ativa ao fechar.
function _hideFabForSheet() { const f = document.getElementById('global-fab'); if (f) f.style.display = 'none'; }
function _restoreFab() {
  const f = document.getElementById('global-fab'); if (!f) return;
  const active = document.querySelector('.page.active');
  const id = active ? active.id : '';
  f.style.display = (id === 'page-inicio' || id === 'page-semana' || id === 'page-mes') ? '' : 'none';
}

function openQuickAdd(editRef) {
  _qaEdit = editRef || null;
  _qaSaving = false;
  _hideFabForSheet();
  const sb = document.getElementById('qa-save-btn'); if (sb) sb.disabled = false;
  _qaPopulateSelects();
  const dateEl = document.getElementById('qa-date');
  const amtEl = document.getElementById('qa-amt-input');
  const descEl = document.getElementById('qa-desc');
  document.getElementById('qa-suggest-row').style.display = 'none';

  if (!_qaEdit) {
    // ── Criação ──
    if (dateEl) dateEl.value = selDate() || todayStr();
    if (amtEl) amtEl.value = '';
    if (descEl) descEl.value = '';
    qaType = 'rec';
    _qaApplyMode();
    qaSetType('rec');
    openOverlay('modal-quick-add');
    return;
  }

  // ── Edição: pré-preenche a partir do registro ──
  let type = 'gas', date = todayStr(), amount = 0, desc = '', pid = null, cat = null;
  if (_qaEdit.kind === 'exp') {
    const e = (D.expenses||[]).find(x => x.id === _qaEdit.id);
    if (!e) { _qaEdit = null; return; }
    type = 'gas'; date = e.date; amount = e.amount; desc = (e.description && e.description !== e.category) ? e.description : ''; cat = e.category;
  } else if (_qaEdit.kind === 'item') {
    const it = (D.incomeItems||[]).find(x => x.id === _qaEdit.id);
    if (!it) { _qaEdit = null; return; }
    type = 'rec'; date = localDateKey(it.date); amount = it.amount; desc = it.note || ''; pid = it.platformId;
  } else if (_qaEdit.kind === 'legacy') {
    type = 'rec'; date = _qaEdit.date; amount = getDayIncome(_qaEdit.date)[_qaEdit.pid] || 0; pid = _qaEdit.pid; desc = '';
  }
  qaType = type;
  _qaApplyMode();
  // Aplica visibilidade dos campos conforme o tipo, sem passar pela trava.
  document.getElementById('qa-btn-rec').classList.toggle('active', type === 'rec');
  document.getElementById('qa-btn-gas').classList.toggle('active', type === 'gas');
  document.getElementById('qa-btn-rec').setAttribute('aria-pressed', type === 'rec' ? 'true' : 'false');
  document.getElementById('qa-btn-gas').setAttribute('aria-pressed', type === 'gas' ? 'true' : 'false');
  document.getElementById('qa-cat-row').style.display = type === 'gas' ? '' : 'none';
  document.getElementById('qa-plat-row').style.display = type === 'rec' ? '' : 'none';

  if (dateEl) dateEl.value = date || todayStr();
  if (amtEl) amtEl.value = amount ? String(amount) : '';
  if (descEl) descEl.value = desc;
  if (pid) { const s = document.getElementById('qa-plat-sel'); if (s) s.value = pid; }
  if (cat) { const s = document.getElementById('qa-cat-sel'); if (s) s.value = cat; }
  openOverlay('modal-quick-add');
}

// Fecha o formulário e limpa o estado de edição (Voltar/Cancelar → origem).
function qaCancel() {
  _qaEdit = null;
  _pendVehicleId = null;
  _qaSaving = false;
  const sb = document.getElementById('qa-save-btn'); if (sb) sb.disabled = false;
  closeOverlay('modal-quick-add');
  _restoreFab();
}

function qaConfirm() {
  if (_qaSaving) return; // impede duplicação por duplo toque
  const amt = parseFloat(document.getElementById('qa-amt-input')?.value);
  if (!amt || amt <= 0) { gdToast('Informe um valor válido.', { type: 'error' }); return; }
  const date = document.getElementById('qa-date')?.value || todayStr();
  const desc = document.getElementById('qa-desc')?.value || '';
  _qaSaving = true;
  const saveBtn = document.getElementById('qa-save-btn');
  if (saveBtn) saveBtn.disabled = true;

  const edit = _qaEdit;
  if (edit) {
    // ── EDIÇÃO: atualiza o mesmo registro (sem duplicar) ──
    if (edit.kind === 'exp') {
      const e = (D.expenses||[]).find(x => x.id === edit.id);
      if (e) {
        const cat = document.getElementById('qa-cat-sel')?.value || e.category;
        e.date = date; e.category = cat; e.description = desc || cat; e.amount = amt;
        save(); checkBudgetAlerts(cat);
      }
    } else if (edit.kind === 'item') {
      const it = (D.incomeItems||[]).find(x => x.id === edit.id);
      if (it) {
        const pid = document.getElementById('qa-plat-sel')?.value || it.platformId;
        it.date = date; it.platformId = pid; it.amount = amt; it.note = desc || '';
        save();
      }
    } else if (edit.kind === 'legacy') {
      const pid = document.getElementById('qa-plat-sel')?.value || edit.pid;
      if (date === edit.date && pid === edit.pid) {
        setDayIncome(date, pid, amt); // mesma chave: sobrescreve
      } else {
        setDayIncome(edit.date, edit.pid, 0); // remove a origem
        _addIncome(date, pid, amt, desc);      // grava na nova chave pelo modelo padrão
      }
    }
  } else if (qaType === 'rec') {
    // ── CRIAÇÃO receita ──
    const pid = document.getElementById('qa-plat-sel')?.value;
    if (pid) {
      const platName = D.platforms.find(p => p.id === pid)?.name || 'Receita';
      _addIncome(date, pid, amt, desc);
      notifyRegistered(amt, desc || platName, platName);
    }
  } else {
    // ── CRIAÇÃO gasto ──
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

  // NÃO reseta _qaSaving aqui: mantém o bloqueio até o formulário ser reaberto,
  // impedindo que um segundo toque (síncrono) grave um duplicado.
  _qaEdit = null;
  closeOverlay('modal-quick-add');
  _restoreFab();
  haptic(10);
  _refreshAfterEntry();
}

// Exclui o lançamento em edição (com confirmação) e atualiza as telas.
function qaDelete() {
  const edit = _qaEdit;
  if (!edit) return;
  gdConfirm({
    title: 'Excluir lançamento?',
    msg: 'Esta ação não pode ser desfeita.',
    confirmText: 'Excluir', cancelText: 'Cancelar', variant: 'danger',
    onConfirm: () => {
      if (edit.kind === 'exp') {
        deleteExpense(edit.id); // já remove vínculo com veículo e salva
      } else if (edit.kind === 'item') {
        D.incomeItems = (D.incomeItems||[]).filter(x => x.id !== edit.id); save();
      } else if (edit.kind === 'legacy') {
        setDayIncome(edit.date, edit.pid, 0);
      }
      _qaEdit = null;
      closeOverlay('modal-quick-add');
      _restoreFab();
      _refreshAfterEntry();
    },
  });
}

// Re-renderiza a tela ativa após criar/editar/excluir um lançamento.
function _refreshAfterEntry() {
  if (document.getElementById('page-inicio')?.classList.contains('active')) { renderInicio(); renderInicioCards(); }
  if (document.getElementById('page-semana')?.classList.contains('active')) { renderSemana(); renderDayAccordion(); }
  if (document.getElementById('page-mes')?.classList.contains('active')) { renderMes(); }
  if (document.getElementById('page-pesquisa')?.classList.contains('active')) { renderPesquisaResults(); }
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
  if (!('Notification' in window)) { gdToast('Seu navegador não suporta notificações.', { type: 'error' }); return; }
  const perm = await Notification.requestPermission();
  if (perm === 'granted') {
    localStorage.setItem('gdcash_notif_enabled', '1');
    scheduleDailyReminder();
    gdToast('Notificações ativadas! Você receberá um lembrete diário às 21h.', { type: 'success' });
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
function initSettingsExtras() { /* replaced by renderAjustes() */ }

function renderAjustes() {
  const root = document.getElementById('ajustes-root');
  if (!root) return;

  const catCount    = (D.expCats || []).length;
  const platCount   = (D.platforms || []).length;
  const budgetCount = Object.keys(D.catBudgets || {}).length;

  const notifSupported = 'Notification' in window;
  const notifPerm   = notifSupported ? Notification.permission : 'unsupported';
  const notifStatus = notifPerm === 'granted'  ? 'Ativa'
                    : notifPerm === 'denied'   ? 'Bloqueada — ative nas configurações do sistema'
                    : notifSupported           ? 'Não configurada'
                    : 'Não suportado';

  const savedTheme = localStorage.getItem('gdcash_theme') || 'auto';
  const themeLabel = ({ light:'Claro', dark:'Escuro', auto:'Sistema' })[savedTheme] || 'Sistema';

  const lastBackup = localStorage.getItem('gdcash_last_backup');
  const backupSub  = lastBackup
    ? 'Último: ' + lastBackup.split('-').reverse().join('/')
    : 'Nunca exportado';

  const syncLabel = CLOUD_ENABLED ? 'Firebase ativo' : 'Somente local';

  const userName  = currentUser?.displayName || 'Usuário';
  const userEmail = currentUser?.email || '';
  const userPhoto = currentUser?.photoURL || '';
  const isStandalone = window.navigator.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;

  const ic = {
    bell:    `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`,
    logout:  `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`,
    sun:     `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`,
    dollar:  `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
    globe:   `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
    tag:     `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>`,
    layers:  `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`,
    sliders: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="6" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="4" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="8" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="4" x2="15" y2="4"/><line x1="17" y1="16" x2="23" y2="16"/></svg>`,
    download:`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
    upload:  `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`,
    cloud:   `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>`,
    info:    `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
    phone:   `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>`,
    shield:  `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
    file:    `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`,
    user:    `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  };
  const chev = `<svg class="srow-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>`;

  root.innerHTML = `
    <div class="sgrp-title">Perfil e conta</div>
    <div class="sgrp">
      <div class="srow srow-profile">
        ${userPhoto ? `<img class="srow-avatar" src="${escHtml(userPhoto)}" alt="">` : `<div class="srow-avatar srow-avatar-ph">${ic.user}</div>`}
        <div class="srow-body">
          <div class="srow-label">${escHtml(userName)}</div>
          ${userEmail ? `<div class="srow-value">${escHtml(userEmail)}</div>` : ''}
        </div>
      </div>
      <div class="sdivider sdivider-full"></div>
      <button class="srow" onclick="openOverlay('modal-notif-perm')">
        <span class="srow-icon">${ic.bell}</span>
        <div class="srow-body">
          <div class="srow-label">Notificações</div>
          <div class="srow-value">${notifStatus}</div>
        </div>
        <div class="srow-right">${chev}</div>
      </button>
      <div class="sdivider"></div>
      <button class="srow" onclick="openAccountMenu()">
        <span class="srow-icon">${ic.logout}</span>
        <div class="srow-body"><div class="srow-label">Minha conta</div></div>
        <div class="srow-right">${chev}</div>
      </button>
    </div>

    <div class="sgrp-title">Aparência</div>
    <div class="sgrp">
      <button class="srow" onclick="openThemeSheet()">
        <span class="srow-icon">${ic.sun}</span>
        <div class="srow-body"><div class="srow-label">Aparência</div></div>
        <div class="srow-right"><span class="srow-chip" id="srow-theme-val">${themeLabel}</span>${chev}</div>
      </button>
      <div class="sdivider"></div>
      <button class="srow" onclick="openCurrencySheet()">
        <span class="srow-icon">${ic.dollar}</span>
        <div class="srow-body"><div class="srow-label">Moeda</div></div>
        <div class="srow-right"><span class="srow-chip" id="srow-curr-val">${escHtml(currSym)}</span>${chev}</div>
      </button>
    </div>

    <div class="sgrp-title">Organização financeira</div>
    <div class="sgrp">
      <button class="srow" onclick="openCatModal()">
        <span class="srow-icon">${ic.tag}</span>
        <div class="srow-body">
          <div class="srow-label">Categorias de gastos</div>
          <div class="srow-value">${catCount} categoria${catCount !== 1 ? 's' : ''} configurada${catCount !== 1 ? 's' : ''}</div>
        </div>
        <div class="srow-right">${chev}</div>
      </button>
      <div class="sdivider"></div>
      <button class="srow" onclick="openPlatSettings()">
        <span class="srow-icon">${ic.layers}</span>
        <div class="srow-body">
          <div class="srow-label">Fontes de receita</div>
          <div class="srow-value">${platCount} fonte${platCount !== 1 ? 's' : ''} configurada${platCount !== 1 ? 's' : ''}</div>
        </div>
        <div class="srow-right">${chev}</div>
      </button>
      <div class="sdivider"></div>
      <button class="srow" onclick="openBudgetModal()">
        <span class="srow-icon">${ic.sliders}</span>
        <div class="srow-body">
          <div class="srow-label">Limites mensais</div>
          <div class="srow-value">${budgetCount ? budgetCount + ' categoria' + (budgetCount !== 1 ? 's' : '') + ' com limite' : 'Nenhum definido'}</div>
        </div>
        <div class="srow-right">${chev}</div>
      </button>
      ${budgetCount ? `<div class="sdivider sdivider-full"></div><div id="budget-settings-list" class="srow-budget-inline"></div>` : `<div id="budget-settings-list" style="display:none"></div>`}
    </div>

    <div class="sgrp-title">Dados e segurança</div>
    <div class="sgrp">
      <button class="srow" onclick="exportData()">
        <span class="srow-icon">${ic.download}</span>
        <div class="srow-body">
          <div class="srow-label">Exportar backup</div>
          <div class="srow-value">${backupSub}</div>
        </div>
        <div class="srow-right">${chev}</div>
      </button>
      <div class="sdivider"></div>
      <button class="srow" onclick="document.getElementById('import-file-input').click()">
        <span class="srow-icon">${ic.upload}</span>
        <div class="srow-body">
          <div class="srow-label">Importar backup</div>
          <div class="srow-value">Substituir dados locais</div>
        </div>
        <div class="srow-right">${chev}</div>
      </button>
      <div class="sdivider"></div>
      <div class="srow srow-muted">
        <span class="srow-icon">${ic.cloud}</span>
        <div class="srow-body">
          <div class="srow-label">Sincronização</div>
          <div class="srow-value">${syncLabel}</div>
        </div>
      </div>
    </div>
    <input type="file" id="import-file-input" accept="application/json" style="display:none" onchange="importData(event)">

    <div class="sgrp-title">Sobre</div>
    <div class="sgrp">
      ${isStandalone ? `
      <div class="srow srow-muted">
        <span class="srow-icon">${ic.phone}</span>
        <div class="srow-body">
          <div class="srow-label">Instalar como app</div>
          <div class="srow-value">App instalado</div>
        </div>
      </div>
      ` : `
      <button class="srow" onclick="document.getElementById('install-guide-section').scrollIntoView({behavior:'smooth'})">
        <span class="srow-icon">${ic.phone}</span>
        <div class="srow-body">
          <div class="srow-label">Instalar como app</div>
          <div class="srow-value">Adicionar à tela de início</div>
        </div>
        <div class="srow-right">${chev}</div>
      </button>
      `}
      <div class="sdivider"></div>
      <div class="srow srow-muted">
        <span class="srow-icon">${ic.info}</span>
        <div class="srow-body"><div class="srow-label">Versão</div><div class="srow-value">Avenco v31</div></div>
      </div>
      <div class="sdivider"></div>
      <div class="srow srow-muted">
        <span class="srow-icon">${ic.shield}</span>
        <div class="srow-body"><div class="srow-label">Política de privacidade</div><div class="srow-value">Em breve</div></div>
      </div>
      <div class="sdivider"></div>
      <div class="srow srow-muted">
        <span class="srow-icon">${ic.file}</span>
        <div class="srow-body"><div class="srow-label">Termos de uso</div><div class="srow-value">Em breve</div></div>
      </div>
    </div>

    ${!isStandalone ? `
    <div id="install-guide-section">
      <div class="sgrp-title">Instalar como app</div>
      <div class="sgrp" id="install-guide-card" style="padding:4px 0">
        <div class="ig-steps" style="padding:8px 16px 4px">
          <div class="ig-step"><div class="ig-step-num">1</div><div class="ig-step-body"><div class="ig-step-title">Abra no Safari</div><div class="ig-step-text">O app precisa estar aberto no Safari do iPhone, não no Chrome</div></div></div>
          <div class="ig-step"><div class="ig-step-num">2</div><div class="ig-step-body"><div class="ig-step-title">Toque em Compartilhar <svg style="vertical-align:middle" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg></div><div class="ig-step-text">Ícone na barra inferior do Safari</div></div></div>
          <div class="ig-step"><div class="ig-step-num">3</div><div class="ig-step-body"><div class="ig-step-title">Toque em "Adicionar à Tela de Início"</div><div class="ig-step-text">Role a lista de opções para encontrar</div></div></div>
          <div class="ig-step"><div class="ig-step-num">4</div><div class="ig-step-body"><div class="ig-step-title">Toque em "Adicionar"</div><div class="ig-step-text">O ícone do Avenco aparece na sua tela inicial</div></div></div>
        </div>
      </div>
    </div>
    ` : ''}
  `;

  if (budgetCount) renderBudgetSettingsInline();
}

function renderBudgetSettingsInline() {
  const el = document.getElementById('budget-settings-list');
  if (!el) return;
  const budgets = D.catBudgets || {};
  el.innerHTML = Object.entries(budgets).map(([cat, limit]) =>
    `<div class="settings-row">
       <span>${escHtml(cat)}</span>
       <span style="display:flex;align-items:center;gap:10px">
         <span style="color:var(--ac);font-weight:700">${R(limit)}</span>
         <button onclick="deleteCatBudget('${escHtml(cat)}')" style="background:none;border:none;color:var(--tx3);font-size:15px;cursor:pointer;padding:0">✕</button>
       </span>
     </div>`).join('');
}

// ══════════════════════════════════════════
// PENDÊNCIAS
// ══════════════════════════════════════════
var pendFilter = 'abertas';

// Resolvedor ÚNICO do vínculo da pendência com veículo/patrimônio.
// Ordem: patrimonioId válido → vehicleId direto válido → vínculo reverso
// em D.vehicles → vínculo reverso em D.patrimonios. Registros arquivados
// ou inexistentes nunca são retornados. Leitura pura — nada é criado.
// Retorna { kind:'vehicle'|'patrimonio', id, name } ou null.
function _pendAssetRef(p) {
  const liveVeh = id => {
    const v = (D.vehicles || []).find(x => x.id === id);
    return (v && v.status !== 'arquivado') ? v : null;
  };
  const livePat = id => {
    const x = (D.patrimonios || []).find(y => y.id === id);
    return (x && x.status !== 'inativo') ? x : null;
  };
  if (p.patrimonioId) {
    const pat = livePat(p.patrimonioId);
    if (pat) {
      if (pat.tipo === 'veiculo') {
        const v = liveVeh(pat._idOriginal || pat.id);
        if (v) return { kind: 'vehicle', id: v.id, name: v.name };
      } else {
        return { kind: 'patrimonio', id: pat.id, name: pat.nome };
      }
    }
  }
  if (p.vehicleId) {
    const v = liveVeh(p.vehicleId);
    if (v) return { kind: 'vehicle', id: v.id, name: v.name };
  }
  const vLink = (D.vehicles || []).find(v =>
    v.status !== 'arquivado' && (v.linkedPendencias || []).includes(p.id));
  if (vLink) return { kind: 'vehicle', id: vLink.id, name: vLink.name };
  const patLink = (D.patrimonios || []).find(x =>
    x.status !== 'inativo' && ((x.detalhes || {}).linkedPendencias || []).includes(p.id));
  if (patLink) {
    if (patLink.tipo === 'veiculo') {
      const v = liveVeh(patLink._idOriginal || patLink.id);
      if (v) return { kind: 'vehicle', id: v.id, name: v.name };
    } else {
      return { kind: 'patrimonio', id: patLink.id, name: patLink.nome };
    }
  }
  return null;
}

function _pendAssetName(p) {
  const ref = _pendAssetRef(p);
  return ref ? ref.name : null;
}

// Sincroniza o vínculo pendência↔veículo nos dois lados: grava/limpa as
// referências reversas antigas em D.vehicles e nos patrimônios tipo
// veículo, mantendo apenas o vínculo selecionado. Não toca em vínculos
// de imóveis/outros bens.
function _syncPendVehicleLink(pendId, vehicleId) {
  (D.vehicles || []).forEach(v => {
    if (v.id !== vehicleId && (v.linkedPendencias || []).includes(pendId)) {
      v.linkedPendencias = v.linkedPendencias.filter(x => x !== pendId);
    }
  });
  (D.patrimonios || []).forEach(x => {
    if (x.tipo !== 'veiculo') return;
    const lp = (x.detalhes || {}).linkedPendencias || [];
    if (lp.includes(pendId) && (x._idOriginal || x.id) !== vehicleId) {
      x.detalhes.linkedPendencias = lp.filter(pp => pp !== pendId);
    }
  });
  if (vehicleId) {
    const v = (D.vehicles || []).find(x => x.id === vehicleId);
    if (v) {
      if (!v.linkedPendencias) v.linkedPendencias = [];
      if (!v.linkedPendencias.includes(pendId)) v.linkedPendencias.push(pendId);
    }
  }
}

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
    <div class="pend-inicio-header" onclick="switchTab('pendencias','inicio')">
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
    cont.innerHTML = pendFilter === 'abertas'
      ? `<div class="empty-state"><div class="empty-state-title">Tudo resolvido por aqui.</div><div class="empty-state-sub">Crie uma pendência para acompanhar prazos e gastos futuros.</div></div>`
      : `<div class="empty-state">Nenhuma pendência concluída.</div>`;
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

  const _checkSvg  = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><polyline points="20 6 9 17 4 12"/></svg>';
  const _redoSvg   = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>';
  const _kebabSvg  = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true" focusable="false"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>';
  cont.innerHTML = items.map(p => {
    const vencida  = p.status === 'aberta' && p.deadline && p.deadline < hoje;
    const hojeDl   = p.status === 'aberta' && p.deadline === hoje;
    const proxima  = p.status === 'aberta' && p.deadline && p.deadline > hoje && p.deadline <= pendAddDays(hoje, 3);
    const done     = p.status === 'concluida';
    const assetName = _pendAssetName(p);
    const catLbl   = PEND_CAT_NAMES[p.category] || p.category || '';
    const ctx      = [assetName, catLbl].filter(Boolean).join(' · ');
    const prioLbl  = PEND_PRIO_NAMES[p.priority] || '';
    let prazoLbl = '', prazoCls = '';
    if (p.deadline) {
      const d = parseDate(p.deadline).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
      if (done)         { prazoLbl = `Prazo ${d}`; }
      else if (vencida) { prazoLbl = `Venceu ${d}`;   prazoCls = ' pend2-prazo-over'; }
      else if (hojeDl)  { prazoLbl = 'Vence hoje';    prazoCls = ' pend2-prazo-near'; }
      else if (proxima) { prazoLbl = `Vence em ${d}`; prazoCls = ' pend2-prazo-near'; }
      else              { prazoLbl = `Vence em ${d}`; }
    }
    const meta = [prioLbl, prazoLbl].filter(Boolean);
    return `<div class="pend-card pend2${done ? ' pend2-done' : ''}${vencida ? ' pend-vencida' : (proxima || hojeDl) ? ' pend-proxima' : ''}">
      <div class="pend2-body">
        <div class="pend2-title">${pendEsc(p.title)}</div>
        ${ctx ? `<div class="pend2-ctx">${pendEsc(ctx)}</div>` : ''}
        ${meta.length ? `<div class="pend2-meta">${pendEsc(meta[0])}${meta[1] ? ` · <span class="pend2-prazo${prazoCls}">${pendEsc(meta[1])}</span>` : ''}</div>` : ''}
        ${p.estimatedValue ? `<div class="pend2-val">${R(p.estimatedValue)}</div>` : ''}
        ${p.note ? `<div class="pend-card-note">${pendEsc(p.note)}</div>` : ''}
      </div>
      <div class="pend2-actions">
        ${done
          ? `<button class="pend2-act pend2-act-reopen" onclick="reopenPendencia('${p.id}')" title="Reabrir pendência" aria-label="Reabrir pendência">${_redoSvg}</button>`
          : `<button class="pend2-act pend2-act-done" onclick="completePendencia('${p.id}')" title="Concluir pendência" aria-label="Concluir pendência">${_checkSvg}</button>`}
        <button class="pend2-act" onclick="openPendMenu('${p.id}')" title="Mais ações" aria-label="Mais ações">${_kebabSvg}</button>
      </div>
    </div>`;
  }).join('');
}

// ── Menu de ações da pendência (Editar / Excluir) ──
var _pendMenuTarget = null;
function openPendMenu(id) {
  _pendMenuTarget = id;
  const p = (D.pendencias || []).find(x => x.id === id);
  const t = document.getElementById('pmenu-title');
  if (t) t.textContent = p ? p.title : 'Pendência';
  openOverlay('pend-menu-sheet');
}
function pendMenuEdit() {
  closeOverlay('pend-menu-sheet');
  if (_pendMenuTarget) openPendenciaModal(_pendMenuTarget);
}
function pendMenuDelete() {
  closeOverlay('pend-menu-sheet');
  if (_pendMenuTarget) deletePendencia(_pendMenuTarget); // mantém gdConfirm
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
  const _ref = p ? _pendAssetRef(p) : null;
  if (_ref && _ref.kind === 'vehicle') {
    const vehRow = document.getElementById('pend-veh-row');
    if (vehRow) vehRow.style.display = '';
    _populatePendVehSel();
    const vehSel = document.getElementById('pend-veh-sel');
    if (vehSel) vehSel.value = _ref.id;
  } else {
    const vehSel = document.getElementById('pend-veh-sel');
    if (vehSel) vehSel.value = '';
  }
  openOverlay('modal-pendencia');
}

function savePendencia() {
  const title = document.getElementById('pend-title-input')?.value?.trim();
  if (!title) { gdToast('Informe um título para a pendência.', { type: 'error' }); return; }
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
      const updated = { ...old, title, category: cat, priority: prio, deadline, estimatedValue, note };
      if (vehicleId) updated.vehicleId = vehicleId; else delete updated.vehicleId;
      // Normalização na edição: patrimonioId de tipo veículo vira
      // vehicleId direto (vínculos de imóvel/outro bem são preservados)
      if (updated.patrimonioId) {
        const patRef = (D.patrimonios || []).find(x => x.id === updated.patrimonioId);
        if (patRef && patRef.tipo === 'veiculo') delete updated.patrimonioId;
      }
      D.pendencias[idx] = updated;
      _syncPendVehicleLink(id, vehicleId);
    }
  } else {
    const pObj = { id: uid(), title, category: cat, priority: prio, deadline, estimatedValue, note, status: 'aberta', createdAt: todayStr() };
    if (vehicleId) pObj.vehicleId = vehicleId;
    D.pendencias.push(pObj);
    _syncPendVehicleLink(pObj.id, vehicleId);
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
    gdConfirm({
      title: 'Pendência concluída',
      msg: `Deseja registrar o valor estimado (${R(p.estimatedValue)}) como gasto?`,
      confirmText: 'Registrar',
      cancelText: 'Não',
      onConfirm: () => openPendenciaAsExpense(p),
      onCancel: () => gdToast('Pendência concluída!', { type: 'success' }),
    });
  } else {
    gdToast('Pendência concluída!', { type: 'success' });
  }
}

function openPendenciaAsExpense(p) {
  _qaEdit = null;
  _qaSaving = false;
  _hideFabForSheet();
  const sb = document.getElementById('qa-save-btn'); if (sb) sb.disabled = false;
  _pendVehicleId = p.vehicleId || null;
  _qaPopulateSelects();
  _qaApplyMode();
  const dateEl = document.getElementById('qa-date');
  if (dateEl) dateEl.value = todayStr();
  const amtEl = document.getElementById('qa-amt-input');
  if (amtEl) amtEl.value = p.estimatedValue;
  const descEl = document.getElementById('qa-desc');
  if (descEl) descEl.value = p.title;
  qaType = 'rec'; // garante que a trava não bloqueie a mudança para 'gas'
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
  gdConfirm({
    title: 'Excluir pendência',
    msg: 'Deseja excluir esta pendência permanentemente?',
    confirmText: 'Excluir',
    variant: 'danger',
    onConfirm: () => {
      D.pendencias = (D.pendencias || []).filter(p => p.id !== id);
      save();
      renderPendList();
      renderPendInicio();
      haptic(10);
      gdToast('Pendência excluída.', { type: 'success' });
    },
  });
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
  // Detalhe legacy persiste ao voltar para a aba (comportamento antigo).
  // Detalhe integrado de veículo volta à home (como o detalhe de imóvel).
  if (_vehDetailId && _vehDetailMode === 'legacy') renderVehDetail(_vehDetailId);
  else if (_patLegacyMode) _renderLegacyVehList();
  else renderPatrimonioHome();
}

function _vehShowView(id) {
  ['pat-home-view','veh-list-view','veh-detail-view','veh-form-view','pat-form-view','pat-detail-view','pat-veh-detail-view'].forEach(v => {
    const el = document.getElementById(v);
    if (el) el.style.display = (v === id) ? '' : 'none';
  });
  const legacyHeader = document.getElementById('veh-legacy-header');
  if (legacyHeader) legacyHeader.style.display = (id === 'veh-list-view') ? '' : 'none';
  const addBtn = document.getElementById('veh-add-btn');
  if (addBtn) addBtn.style.display = (id === 'veh-list-view') ? '' : 'none';
  const fab = document.getElementById('pat-fab');
  if (fab) fab.style.display = (id === 'pat-home-view') ? 'flex' : 'none';
}

// ── Fluxo legado de Veículos — preservado e acessível durante os testes ──
// renderVehList() continua sendo o ponto de retorno de todo o CRUD antigo
// (voltar do detalhe, salvar/cancelar formulário, excluir). Fora do modo
// legado ele leva à home do Patrimônio 2.0; no modo legado, à lista antiga.
var _patLegacyMode = false;

function openLegacyVehList() { _patLegacyMode = true; _renderLegacyVehList(); }
function exitLegacyVehList() { _patLegacyMode = false; renderPatrimonioHome(); }

function renderVehList() {
  if (!_patLegacyMode) { renderPatrimonioHome(); return; }
  _renderLegacyVehList();
}

// ── Cabeçalho padrão das telas internas: Voltar (ícone) + título + ação opcional ──
function _backArrowSvg() {
  return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>';
}
function _pageHeader(backOnclick, title, rightHtml) {
  return `<div class="page-header-row">
      <div class="phr-left">
        <button class="page-back-btn" onclick="${backOnclick}" aria-label="Voltar">${_backArrowSvg()}</button>
        <span class="page-header-title">${escHtml(title)}</span>
      </div>
      ${rightHtml || ''}
    </div>`;
}

function _renderLegacyVehList() {
  _vehDetailId = null;
  _vehDetailMode = 'legacy';
  _vehShowView('veh-list-view');
  window.scrollTo(0, 0);
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
  _vehDetailMode = 'legacy';
  _vehShowView('veh-detail-view');
  const cont = document.getElementById('veh-detail-cont');
  if (!cont) return;
  // Voltar: se o detalhe legacy foi aberto pelo detalhe integrado, retorna a ele.
  const backFromLegacy = (_vehReturnCtx === id) ? `backFromLegacyVehDetail('${id}')` : 'renderVehList()';
  const backFromLegacyLbl = (_vehReturnCtx === id) ? 'Detalhe' : 'Lista';
  const col = VEH_STATUS_COLORS[v.status] || 'var(--tx3)';
  const lbl = VEH_STATUS_LABELS[v.status] || v.status;
  const sub = [v.brand, v.model, v.year, v.color].filter(Boolean).join(' · ');
  const carSvg = `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 17H3v-5l3-5h12l3 5v5h-2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/><path d="M9 12h6"/></svg>`;

  const linkedExps  = (v.linkedExpenses  || []).map(eid => (D.expenses  || []).find(e => e.id === eid)).filter(Boolean);
  const linkedPends = (() => {
    const seen = new Set();
    const out = [];
    (v.linkedPendencias || []).forEach(pid => {
      const p = (D.pendencias || []).find(x => x.id === pid);
      if (p && !seen.has(p.id)) { seen.add(p.id); out.push(p); }
    });
    // União: pendências cujo resolvedor aponta para este veículo
    (D.pendencias || []).forEach(p => {
      if (seen.has(p.id)) return;
      const ref = _pendAssetRef(p);
      if (ref && ref.kind === 'vehicle' && ref.id === v.id) { seen.add(p.id); out.push(p); }
    });
    return out;
  })();
  const history = (v.history || []).slice().reverse();
  const canHardDelete = history.length === 0 && (v.linkedExpenses||[]).length === 0 && (v.linkedPendencias||[]).length === 0;

  cont.innerHTML = `
    ${_pageHeader(backFromLegacy, 'Veículo')}
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
  // Remove toasts residuais de ações anteriores (ex.: "Patrimônio adicionado")
  document.querySelectorAll('.av-toast').forEach(e => e.remove());
  const v = id ? (D.vehicles || []).find(x => x.id === id) : null;
  _vehShowView('veh-form-view');
  const cont = document.getElementById('veh-form-cont');
  if (!cont) return;
  const cancelAction = id ? `_refreshVehDetail('${id}')` : 'renderVehList()';
  cont.innerHTML = `
    ${_pageHeader(cancelAction, id ? 'Editar veículo' : 'Novo veículo')}
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
      <label class="form-label">Valor atual estimado (${escHtml(currSym)})</label>
      <input class="form-input" id="vf-valor" type="number" min="0" step="any" value="${(() => { const vp = id ? _patForVehId(id) : null; return (vp && vp.valorEstimado > 0) ? vp.valorEstimado : ''; })()}" placeholder="45000">
      <span class="field-hint">Deixe em branco se não quiser informar.</span>
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
  // Sincroniza o valor atual estimado no registro de patrimônio do veículo.
  // Campo vazio → null (valor não informado); 0 explícito é preservado como 0.
  const valorRaw = document.getElementById('vf-valor')?.value;
  const valorNum = (valorRaw === '' || valorRaw == null) ? null : (Number(valorRaw) || 0);
  _syncVehPatrimonioValor(id, valorNum, idx >= 0);
  save();
  _vehDetailId = id;
  _refreshVehDetail(id);
  gdToast(idx >= 0 ? 'Veículo atualizado.' : 'Veículo adicionado.');
}

// Busca o registro de patrimônio correspondente a um veículo (por _idOriginal ou id)
function _patForVehId(vehId) {
  return (D.patrimonios || []).find(p =>
    p.tipo === 'veiculo' && (p._idOriginal === vehId || p.id === vehId)) || null;
}

// Grava valorEstimado no patrimônio do veículo, criando o registro se a
// migração ainda não tiver rodado para ele. Nunca toca em D.vehicles.
// isEdit=true (edição de veículo já existente) registra reavaliação no
// histórico patrimonial quando o valor realmente muda; cadastro inicial
// nunca gera evento.
function _syncVehPatrimonioValor(vehId, valorEstimado, isEdit) {
  if (!Array.isArray(D.patrimonios)) D.patrimonios = [];
  const existedBefore = !!_patForVehId(vehId);
  let p = _patForVehId(vehId);
  if (!p) {
    _migrateVehiclesToPatrimonios();
    p = _patForVehId(vehId);
  }
  if (p) {
    const old = p.valorEstimado;
    // Reavaliação: registra só quando o novo valor é um número informado
    // e diferente do anterior (evita eventos ao apenas limpar o campo).
    if (isEdit && existedBefore && valorEstimado != null && (old || 0) !== valorEstimado) {
      if (!Array.isArray(p.historico)) p.historico = [];
      p.historico.push({
        id:            uid(),
        data:          todayStr(),
        tipo:          'avaliacao',
        descricao:     '',
        valor:         valorEstimado,
        valorAnterior: old || 0,
        despesaId:     null,
        pendenciaId:   null,
      });
    }
    p.valorEstimado = valorEstimado; // null = não informado
    p.updatedAt = Date.now();
  }
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
    gdToast('Veículo com histórico ou vínculos não pode ser excluído. Use "Arquivar".', { type: 'error' });
    return;
  }
  gdConfirm({
    title: 'Excluir veículo',
    msg: 'Excluir permanentemente este veículo? Esta ação não pode ser desfeita.',
    confirmText: 'Excluir',
    variant: 'danger',
    onConfirm: () => {
      D.vehicles = (D.vehicles || []).filter(x => x.id !== id);
      save();
      renderVehList();
      gdToast('Veículo excluído definitivamente.', { type: 'success' });
    },
  });
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
  _refreshVehDetail(vehId);
  gdToast('Apontamento salvo.');
}

function deleteVehHistItem(vehId, histId) {
  const v = (D.vehicles || []).find(x => x.id === vehId);
  if (!v) return;
  v.history = (v.history || []).filter(h => h.id !== histId);
  save();
  _refreshVehDetail(vehId);
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
  _refreshVehDetail(vehId);
}

function unlinkVehExp(vehId, expId) {
  const v = (D.vehicles || []).find(x => x.id === vehId);
  if (!v) return;
  v.linkedExpenses = (v.linkedExpenses || []).filter(id => id !== expId);
  save();
  _refreshVehDetail(vehId);
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
  _refreshVehDetail(vehId);
}

function unlinkVehPend(vehId, pId) {
  const v = (D.vehicles || []).find(x => x.id === vehId);
  if (!v) return;
  v.linkedPendencias = (v.linkedPendencias || []).filter(id => id !== pId);
  save();
  _refreshVehDetail(vehId);
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
  _refreshVehDetail(vehId);
  gdToast('Status atualizado.');
}

// ══════════════════════════════════════════
// PATRIMÔNIO 2.0 — FUNDAÇÃO DE DADOS
// ══════════════════════════════════════════
// Fase 1: schema, normalização, CRUD básico e migração segura.
// A tela existente de veículos (renderPatrimonio / D.vehicles) permanece
// inalterada e continua funcionando como camada de compatibilidade.

function _defaultPatrimonioFields() {
  return {
    id:             '',
    tipo:           'veiculo',
    nome:           '',
    descricao:      '',
    foto:           null,
    valorEstimado:  0,
    dataAquisicao:  '',
    observacoes:    '',
    status:         'ativo',
    etiquetas:      [],
    financiamentos: [],
    detalhes:       {},
    historico:      [],
    _migradoDe:     null,
    _idOriginal:    null,
    createdAt:      0,
    updatedAt:      0,
  };
}

function _normPatrimonioDetalhes(tipo, d) {
  const src = (d && typeof d === 'object') ? d : {};
  if (tipo === 'veiculo') {
    return Object.assign({
      placa: '', marca: '', modelo: '', ano: '',
      quilometragem: null, combustivel: '', cor: '',
      renavam: '', chassi: '',
      vinculosFixos: [], vinculosCats: [],
    }, src);
  }
  if (tipo === 'imovel') {
    return Object.assign({
      subtipo: '', endereco: '', cidade: '',
      metragem: 0, quartos: 0, banheiros: 0, vagas: 0,
      condominio: 0, iptu: 0, aluguel: 0,
      matricula: '', cartorio: '', rendaMensal: 0,
    }, src);
  }
  return Object.assign({}, src);
}

function normalizePatrimonio(raw) {
  const p = Object.assign({}, _defaultPatrimonioFields(), raw);
  if (!Array.isArray(p.financiamentos)) p.financiamentos = [];
  if (!Array.isArray(p.historico))      p.historico      = [];
  if (!Array.isArray(p.etiquetas))      p.etiquetas      = [];
  p.detalhes = _normPatrimonioDetalhes(p.tipo, p.detalhes);
  return p;
}

function createPatrimonio(data) {
  if (!Array.isArray(D.patrimonios)) D.patrimonios = [];
  const now = Date.now();
  const p   = normalizePatrimonio(Object.assign({}, data, { id: uid(), createdAt: now, updatedAt: now }));
  D.patrimonios.push(p);
  save();
  return p;
}

function getPatrimonio(id) {
  return (D.patrimonios || []).find(p => p.id === id) || null;
}

function updatePatrimonio(id, changes) {
  const list = D.patrimonios || [];
  const idx  = list.findIndex(p => p.id === id);
  if (idx === -1) return false;
  list[idx] = normalizePatrimonio(Object.assign({}, list[idx], changes, { updatedAt: Date.now() }));
  save();
  return true;
}

function archivePatrimonio(id, status) {
  return updatePatrimonio(id, { status: status || 'inativo' });
}

function listPatrimonios(tipo) {
  const all = D.patrimonios || [];
  return tipo ? all.filter(p => p.tipo === tipo) : all.slice();
}

function sumPatrimonioTotal() {
  return (D.patrimonios || [])
    .filter(p => p.status !== 'vendido' && p.status !== 'inativo')
    .reduce((s, p) => s + (p.valorEstimado || 0), 0);
}

// Migração segura de D.vehicles → D.patrimonios.
// Idempotente e RE-EXECUTÁVEL — roda em todo login e migra apenas os
// veículos que ainda não existem em D.patrimonios. Não usa flag como
// bloqueio: se um sync anterior rodou com D.vehicles vazio (nuvem ainda
// não carregada, outro dispositivo etc.), a próxima execução recupera.
// Nunca modifica nem exclui D.vehicles.
// Retorna { ran: bool, migrated: number }.
function _migrateVehiclesToPatrimonios() {
  if (!Array.isArray(D.patrimonios)) D.patrimonios = [];
  if (!Array.isArray(D.vehicles) || D.vehicles.length === 0) {
    D._patrimoniosMigrated = true;
    return { ran: false, migrated: 0 };
  }

  // Snapshot para rollback — só na primeira vez, para não sobrescrever o
  // backup pré-migração com um estado já migrado. Falha não-fatal.
  try {
    if (!localStorage.getItem('gdcash_migration_backup_v1')) {
      localStorage.setItem('gdcash_migration_backup_v1', JSON.stringify({
        _backupTimestamp: Date.now(),
        _backupVersion:   'pre-patrimonio-2',
        vehicles:         JSON.parse(JSON.stringify(D.vehicles)),
        patrimonios:      JSON.parse(JSON.stringify(D.patrimonios)),
      }));
    }
  } catch(e) {
    console.error('[patrimônio] backup pré-migração falhou:', e);
  }

  // IDs já migrados (idempotência) — cobre tanto _idOriginal quanto o
  // próprio id, já que o patrimônio migrado reutiliza o id do veículo.
  const migratedIds = new Set();
  D.patrimonios.forEach(p => {
    if (p._migradoDe === 'vehicles' && p._idOriginal) migratedIds.add(p._idOriginal);
    if (p.id) migratedIds.add(p.id);
  });

  const STATUS_MAP = {
    em_uso:     'ativo',
    na_oficina: 'ativo',
    a_venda:    'ativo',
    vendido:    'vendido',
    arquivado:  'inativo',
  };

  let count = 0;
  for (const v of D.vehicles) {
    if (migratedIds.has(v.id)) continue;

    const historico = (v.history || []).map(h => ({
      id:          h.id     || uid(),
      data:        h.date   || todayStr(),
      tipo:        h.type === 'km_update' ? 'km_update' : 'evento',
      descricao:   h.note   || '',
      valor:       h.amount || 0,
      despesaId:   null,
      pendenciaId: null,
      _legacyType: h.type   || null,
      _legacyKm:   h.km     || null,
    }));

    D.patrimonios.push(normalizePatrimonio({
      id:            v.id,
      tipo:          'veiculo',
      nome:          v.name   || '',
      foto:          v.photo  || null,
      valorEstimado: 0,
      dataAquisicao: '',
      observacoes:   v.notes  || '',
      status:        STATUS_MAP[v.status] || 'ativo',
      etiquetas:     [],
      financiamentos:[],
      detalhes: {
        placa:            v.plate  || '',
        marca:            v.brand  || '',
        modelo:           v.model  || '',
        ano:              v.year   || '',
        quilometragem:    v.km     != null ? v.km : null,
        combustivel:      '',
        cor:              v.color  || '',
        renavam:          '',
        chassi:           '',
        vinculosFixos:    [],
        vinculosCats:     [],
        linkedExpenses:   v.linkedExpenses   || [],
        linkedPendencias: v.linkedPendencias || [],
      },
      historico,
      _migradoDe:  'vehicles',
      _idOriginal: v.id,
      createdAt:   Date.now(),
      updatedAt:   Date.now(),
    }));
    count++;
  }

  D._patrimoniosMigrated = true;
  if (count > 0) D.updatedAt = Date.now();
  return { ran: count > 0, migrated: count };
}

// Rollback da migração — restaura D.patrimonios para o estado pré-migração.
// Nunca toca em D.vehicles. Seguro chamar mesmo sem backup.
function rollbackPatrimonioMigration() {
  try {
    const raw = localStorage.getItem('gdcash_migration_backup_v1');
    if (!raw) return { ok: false, reason: 'Backup não encontrado.' };
    const bk = JSON.parse(raw);
    D.patrimonios          = Array.isArray(bk.patrimonios) ? bk.patrimonios : [];
    D._patrimoniosMigrated = false;
    save();
    return { ok: true, restored: D.patrimonios.length, ts: bk._backupTimestamp };
  } catch(e) {
    return { ok: false, reason: e.message };
  }
}

// ══════════════════════════════════════════
// PATRIMÔNIO 2.0 — TELA PRINCIPAL (Etapa 2)
// ══════════════════════════════════════════
// A tela lê D.vehicles e D.patrimonios DIRETAMENTE, sem depender da
// migração: veículos vêm sempre de D.vehicles (fonte de verdade) e são
// enriquecidos com o patrimônio migrado correspondente quando existir
// (valorEstimado, financiamentos). Imóveis e outros bens vêm de
// D.patrimonios. Nunca há duplicação: um patrimônio tipo veículo cujo
// veículo original existe em D.vehicles é representado uma única vez.

// Ícones Lucide-style SVG — funções (hoistadas) evitam TDZ se
// switchTab('patrimonio') rodar durante a inicialização.
function _patIcon(tipo) {
  if (tipo === 'veiculo') return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 17H3v-5l3-5h12l3 5v5h-2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/><path d="M9 12h6"/></svg>';
  if (tipo === 'imovel')  return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>';
  return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>';
}
function _patChevr() {
  return '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
}
function _patStatusLabel(status) {
  return ({ ativo:'Ativo', vendido:'Vendido', inativo:'Arquivado' })[status] || status;
}
function _patTypeKey(tipo) {
  return (tipo === 'veiculo' || tipo === 'imovel') ? tipo : 'outro';
}

// Visão unificada e SEM duplicação de D.vehicles + D.patrimonios.
function _patUnifiedItems() {
  const vehs = Array.isArray(D.vehicles)    ? D.vehicles    : [];
  const pats = Array.isArray(D.patrimonios) ? D.patrimonios : [];
  const VEH2PAT_STATUS = { em_uso:'ativo', na_oficina:'ativo', a_venda:'ativo', vendido:'vendido', arquivado:'inativo' };

  // Patrimônio migrado indexado pelo id do veículo original
  const patByVehId = {};
  pats.forEach(p => {
    if (p.tipo === 'veiculo') patByVehId[p._idOriginal || p.id] = p;
  });

  const items = [];

  // 1) Veículos — fonte de verdade é D.vehicles, sempre visíveis
  vehs.forEach(v => {
    const p = patByVehId[v.id] || null;
    items.push({
      tipo:           'veiculo',
      nome:           v.name  || '',
      foto:           v.photo || null,
      status:         VEH2PAT_STATUS[v.status] || 'ativo',
      valorEstimado:  p ? (p.valorEstimado  || 0)  : 0,
      financiamentos: p ? (p.financiamentos || []) : [],
      vehId:          v.id,
    });
  });

  // 2) Demais patrimônios (imóveis, outros bens e veículos órfãos —
  //    sem par em D.vehicles)
  pats.forEach(p => {
    if (p.tipo === 'veiculo') {
      const vid = p._idOriginal || p.id;
      if (vehs.some(v => v.id === vid)) return; // já representado acima
    }
    items.push({
      tipo:           p.tipo || 'outro',
      nome:           p.nome || '',
      foto:           p.foto || null,
      status:         p.status || 'ativo',
      valorEstimado:  p.valorEstimado  || 0,
      financiamentos: p.financiamentos || [],
      vehId:          null,
      patId:          p.id,
    });
  });

  return items;
}

function _patNetTotals(items) {
  const list  = items || _patUnifiedItems();
  const gross = list.filter(i => i.status !== 'vendido' && i.status !== 'inativo')
                    .reduce((s, i) => s + (i.valorEstimado || 0), 0);
  const debt  = list.reduce((s, i) =>
    s + (i.financiamentos || []).reduce((sf, f) => sf + (f.saldoDevedor || 0), 0), 0);
  return { gross, debt, net: gross - debt };
}

// Controla a visibilidade do FAB de forma central. show=false esconde
// por completo (form/detalhe/estado vazio); a home com itens mostra.
function _setPatFab(show) {
  const fab = document.getElementById('pat-fab');
  if (!fab) return;
  fab.style.display = show ? 'flex' : 'none';
  if (!show) fab.classList.remove('pat-fab-hidden');
}

// Ícone de seleção (check) para o card de categoria ativo.
function _patCheckSvg() {
  return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><polyline points="20 6 9 17 4 12"/></svg>';
}

function openPatSheet() {
  const ov  = document.getElementById('pat-sheet');
  const fab = document.getElementById('pat-fab');
  if (ov)  ov.classList.add('open');
  if (fab) fab.classList.add('pat-fab-hidden'); // esconde o FAB enquanto o sheet estiver aberto
}

function closePatSheet() {
  const ov  = document.getElementById('pat-sheet');
  const fab = document.getElementById('pat-fab');
  if (ov)  ov.classList.remove('open');
  if (fab) fab.classList.remove('pat-fab-hidden');
}

function patAddTipo(tipo) {
  closePatSheet();
  if (tipo === 'veiculo') { _vehDetailMode = 'integrated'; openVehForm(); return; }
  openPatForm(tipo);
}

// Filtro interno por categoria (Veículos / Imóveis / Outros bens).
// Tocar no card ativa o filtro; tocar de novo (ou em "Limpar") remove.
var _patCatFilter = null;
function patToggleCatFilter(tipo) {
  _patCatFilter = (_patCatFilter === tipo) ? null : tipo;
  renderPatrimonioHome();
}

function renderPatrimonioHome(preserveScroll) {
  _vehDetailId = null;
  _vehShowView('pat-home-view');
  if (!preserveScroll) {
    window.scrollTo(0, 0);
    if (document.body) document.body.scrollTop = 0;
  }
  const cont = document.getElementById('pat-home-cont');
  if (!cont) return;

  const items = _patUnifiedItems();
  if (items.length === 0) {
    cont.innerHTML = _renderPatEmpty();
    _setPatFab(false); // estado vazio: sem FAB (já há o botão central)
    return;
  }

  const { gross, debt, net } = _patNetTotals(items);
  const totals  = { veiculo: 0, imovel: 0, outro: 0 };
  const counts  = { veiculo: 0, imovel: 0, outro: 0 };
  const activeItems = items.filter(i => i.status !== 'vendido' && i.status !== 'inativo');
  activeItems.forEach(i => {
    const k = _patTypeKey(i.tipo);
    totals[k] += i.valorEstimado || 0;
    counts[k]++;
  });
  const activeCount = activeItems.length;

  const catNames = { veiculo:'Veículos', imovel:'Imóveis', outro:'Outros bens' };

  cont.innerHTML = `
    <div class="card hero-card" style="margin-bottom:18px">
      <div class="hero-lbl">Patrimônio líquido</div>
      <div class="hero-val">${R(net)}</div>
      <div class="hero-chips">
        <div class="hero-chip">
          <b>${items.length}</b>&nbsp;${items.length === 1 ? 'bem cadastrado' : 'bens cadastrados'}
        </div>
        <div class="hero-chip" style="color:var(--tx2)">
          <b>${activeCount}</b>&nbsp;${activeCount === 1 ? 'ativo no patrimônio líquido' : 'ativos no patrimônio líquido'}
        </div>
      </div>
      ${debt > 0 ? `
        <div style="height:1px;background:var(--border);margin:14px 0 12px"></div>
        <div class="hero-chips">
          <div class="hero-chip">Bens&nbsp;<b>${R(gross)}</b></div>
          <div class="hero-chip" style="color:var(--tx3)">Financiamentos&nbsp;−${R(debt)}</div>
        </div>` : ''}
    </div>

    <div class="sec-label" style="margin:0 0 10px">Categorias</div>
    <div class="pat-cat-row" role="group" aria-label="Filtrar por categoria">
      ${['veiculo','imovel','outro'].map(t => {
        const on = _patCatFilter === t;
        return `
        <div class="pat-cat-card${on ? ' pat-cat-active' : ''}" role="button" tabindex="0"
             aria-pressed="${on}" aria-label="Filtrar ${catNames[t]}${on ? ' (selecionado)' : ''}"
             onclick="patToggleCatFilter('${t}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();patToggleCatFilter('${t}')}">
          <div class="pat-cat-ico pat-ico-${t}">${_patIcon(t)}</div>
          <div class="pat-cat-body">
            <div class="pat-cat-name">${catNames[t]}</div>
            <div class="pat-cat-count">${counts[t]} ${counts[t] === 1 ? 'ativo' : 'ativos'}</div>
          </div>
          <div class="pat-cat-val">${R(totals[t])}</div>
          ${on ? `<div class="pat-cat-check on">${_patCheckSvg()}</div>` : ''}
        </div>`; }).join('')}
    </div>

    <div class="pat-det-sec-head pat-home-filter-head" style="margin:0 0 10px">
      <div class="sec-label" style="margin:0">${_patCatFilter ? catNames[_patCatFilter] : 'Todos os patrimônios'}</div>
      ${_patCatFilter ? `<button class="btn-pill" onclick="patToggleCatFilter('${_patCatFilter}')">Limpar filtro</button>` : ''}
    </div>
    <div class="pat-list-group">
      ${(_patCatFilter ? items.filter(i => _patTypeKey(i.tipo) === _patCatFilter) : items).map(i => _renderPatListItem(i)).join('')
        || `<div class="pat-det-empty">Nenhum item nesta categoria.</div>`}
    </div>

    <div class="pat-home-bottom-spacer"></div>
  `;
  _setPatFab(true);
}

function _renderPatListItem(item) {
  const typeKey   = _patTypeKey(item.tipo);
  const statusK   = item.status || 'ativo';
  const statusLbl = _patStatusLabel(statusK);
  const chipName  = { veiculo:'Veículo', imovel:'Imóvel', outro:'Outro bem' }[typeKey];

  const photoHtml = item.foto
    ? `<img src="${escHtml(item.foto)}" alt="${escHtml(item.nome)}" loading="lazy">`
    : _patIcon(typeKey);

  const isClickable = !!(item.vehId || item.patId);
  const onclickAttr = item.vehId
    ? `onclick="openVehPatDetail('${escHtml(item.vehId)}')"`
    : (item.patId ? `onclick="renderPatDetail('${escHtml(item.patId)}')"` : '');

  // Veículo sem avaliação positiva → "Valor não informado" (não exibir R$ 0,00
  // como se zero fosse avaliação cadastrada). Demais bens mantêm a regra atual.
  const valorInformado = typeKey !== 'veiculo' || (typeof item.valorEstimado === 'number' && item.valorEstimado > 0);
  const valHtml = valorInformado
    ? `<span class="pat-list-val">${R(item.valorEstimado || 0)}</span>`
    : `<span class="pat-list-val pat-list-val-empty">Valor não informado</span>`;

  return `
    <div class="pat-list-item" ${onclickAttr}>
      <div class="pat-list-photo${item.foto ? '' : ' pat-ico-' + typeKey}">${photoHtml}</div>
      <div class="pat-list-body">
        <div class="pat-list-name">${escHtml(item.nome)}</div>
        <div class="pat-list-meta">
          <span class="pat-chip pat-chip-${typeKey}">${chipName}</span>
          <span class="pat-status s-${statusK}">
            <span class="pat-status-dot"></span>
            <span class="pat-status-lbl">${statusLbl}</span>
          </span>
        </div>
      </div>
      <div class="pat-list-right">
        ${valHtml}
        ${isClickable ? `<span class="pat-list-chev">${_patChevr().replace(/width="12" height="12"/g, 'width="14" height="14"')}</span>` : ''}
      </div>
    </div>`;
}

function _renderPatEmpty() {
  return `
    <div class="pat-empty">
      <div class="pat-empty-illus">
        <svg width="144" height="120" viewBox="0 0 144 120" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="8" y="60" width="52" height="44" rx="4" fill="var(--surface2)" stroke="var(--border-strong)" stroke-width="1.2"/>
          <polygon points="8,60 34,30 60,60" fill="var(--ac-t)" stroke="var(--ac)" stroke-width="1.2" stroke-linejoin="round"/>
          <rect x="22" y="78" width="22" height="26" rx="3" fill="var(--ac-t)" stroke="var(--ac-b)" stroke-width="1"/>
          <rect x="76" y="78" width="58" height="24" rx="5" fill="var(--surface2)" stroke="var(--border-strong)" stroke-width="1.2"/>
          <rect x="83" y="66" width="40" height="18" rx="4" fill="var(--surface3)" stroke="var(--border-strong)" stroke-width="1"/>
          <circle cx="89" cy="102" r="7" fill="var(--surface)" stroke="var(--border-strong)" stroke-width="1.4"/>
          <circle cx="89" cy="102" r="3" fill="var(--tx3)"/>
          <circle cx="123" cy="102" r="7" fill="var(--surface)" stroke="var(--border-strong)" stroke-width="1.4"/>
          <circle cx="123" cy="102" r="3" fill="var(--tx3)"/>
          <path d="M6 112 Q34 90 72 94 Q104 98 138 68" stroke="var(--gn)" stroke-width="1.5" stroke-dasharray="3 4" stroke-linecap="round" opacity=".55"/>
          <path d="M134 63 L138 68 L142 63" stroke="var(--gn)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity=".7"/>
        </svg>
      </div>
      <div class="pat-empty-title">Você ainda não cadastrou<br>nenhum patrimônio</div>
      <div class="pat-empty-sub">Cadastre veículos, imóveis ou outros bens para acompanhar sua evolução patrimonial.</div>
      <button class="btn btn-primary" onclick="openPatSheet()" style="display:flex;align-items:center;gap:8px">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Adicionar patrimônio
      </button>
    </div>`;
}

// ── Cadastro básico de Imóvel / Outro bem (Etapa 2) ──
// Reutiliza createPatrimonio/updatePatrimonio da fundação e o mesmo
// pipeline de foto dos veículos (resizeVehPhoto).

var PAT_TIPO_LABELS = { imovel: 'Imóvel', outro: 'Outro bem' };

function openPatForm(tipo, id) {
  // Remove toasts residuais de ações anteriores
  document.querySelectorAll('.av-toast').forEach(e => e.remove());
  const p = id ? getPatrimonio(id) : null;
  const t = p ? _patTypeKey(p.tipo) : _patTypeKey(tipo);
  _vehShowView('pat-form-view');
  window.scrollTo(0, 0);
  if (document.body) document.body.scrollTop = 0;
  const cont = document.getElementById('pat-form-cont');
  if (!cont) return;
  const tipoLbl = PAT_TIPO_LABELS[t] || 'Patrimônio';
  const d = p?.detalhes || {};
  const backAction = p ? `renderPatDetail('${p.id}')` : 'renderPatrimonioHome()';
  const statusSel = ['ativo','vendido','inativo'].map(s =>
    `<option value="${s}" ${(p?.status||'ativo')===s?'selected':''}>${_patStatusLabel(s)}</option>`).join('');
  cont.innerHTML = `
    ${_pageHeader(backAction, `${p ? 'Editar' : 'Novo'} ${tipoLbl.toLowerCase()}`)}
    <div class="form-group">
      <label class="form-label">Nome / apelido *</label>
      <input class="form-input" id="pf-nome" value="${escHtml(p?.nome||'')}" placeholder="${t==='imovel' ? 'Ex: Apartamento Centro' : 'Ex: Notebook Dell'}">
    </div>
    <div class="form-group">
      <label class="form-label">Valor atual (${escHtml(currSym)})</label>
      <input class="form-input" id="pf-valor" type="number" min="0" step="any" value="${p && p.valorEstimado ? p.valorEstimado : ''}" placeholder="${t==='imovel' ? '350000' : '3500'}">
    </div>
    <div class="form-group">
      <label class="form-label">Status</label>
      <select class="form-input" id="pf-status">${statusSel}</select>
    </div>
    <div class="form-group">
      <label class="form-label">Foto (opcional)</label>
      <div class="veh-photo-upload">
        <div id="pf-photo-preview" class="${p?.foto ? '' : 'veh-photo-empty'}" style="${p?.foto ? 'width:64px;height:64px;border-radius:12px;overflow:hidden' : ''}">
          ${p?.foto ? `<img src="${p.foto}" style="width:100%;height:100%;object-fit:cover">` : 'Sem foto'}
        </div>
        <button type="button" class="btn-pill" onclick="document.getElementById('pf-photo-input').click()">Escolher foto</button>
        <input type="file" id="pf-photo-input" accept="image/*" style="display:none" onchange="onPatPhotoChange(this)">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Observação</label>
      <textarea class="form-input" id="pf-obs" rows="2" placeholder="Notas sobre este bem">${escHtml(p?.observacoes||'')}</textarea>
    </div>
    ${t === 'imovel' ? `
    <div class="sec-label" style="margin:18px 0 10px">Detalhes do imóvel</div>
    <div class="form-group">
      <label class="form-label">Tipo do imóvel</label>
      <select class="form-input" id="pf-subtipo">
        ${['','apartamento','casa','terreno','comercial','outro'].map(s =>
          `<option value="${s}" ${(d.subtipo||'')===s?'selected':''}>${s ? s.charAt(0).toUpperCase()+s.slice(1) : '—'}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Endereço</label>
      <input class="form-input" id="pf-endereco" value="${escHtml(d.endereco||'')}" placeholder="Rua, número, bairro">
    </div>
    <div class="veh-form-row">
      <div class="form-group"><label class="form-label">Cidade</label><input class="form-input" id="pf-cidade" value="${escHtml(d.cidade||'')}" placeholder="São Paulo"></div>
      <div class="form-group"><label class="form-label">Metragem (m²)</label><input class="form-input" id="pf-metragem" type="number" min="0" step="any" value="${d.metragem || ''}" placeholder="72"></div>
    </div>
    <div class="veh-form-row">
      <div class="form-group"><label class="form-label">Quartos</label><input class="form-input" id="pf-quartos" type="number" min="0" step="1" value="${d.quartos || ''}" placeholder="2"></div>
      <div class="form-group"><label class="form-label">Banheiros</label><input class="form-input" id="pf-banheiros" type="number" min="0" step="1" value="${d.banheiros || ''}" placeholder="1"></div>
    </div>
    <div class="veh-form-row">
      <div class="form-group"><label class="form-label">Vagas</label><input class="form-input" id="pf-vagas" type="number" min="0" step="1" value="${d.vagas || ''}" placeholder="1"></div>
      <div class="form-group"><label class="form-label">Condomínio/mês (${escHtml(currSym)})</label><input class="form-input" id="pf-condominio" type="number" min="0" step="any" value="${d.condominio || ''}" placeholder="650"></div>
    </div>
    <div class="veh-form-row">
      <div class="form-group"><label class="form-label">IPTU/ano (${escHtml(currSym)})</label><input class="form-input" id="pf-iptu" type="number" min="0" step="any" value="${d.iptu || ''}" placeholder="1800"></div>
      <div class="form-group"><label class="form-label">Aluguel/renda mês (${escHtml(currSym)})</label><input class="form-input" id="pf-aluguel" type="number" min="0" step="any" value="${d.aluguel || ''}" placeholder="2500"></div>
    </div>
    <div class="veh-form-row">
      <div class="form-group"><label class="form-label">Matrícula</label><input class="form-input" id="pf-matricula" value="${escHtml(d.matricula||'')}" placeholder="Nº da matrícula"></div>
      <div class="form-group"><label class="form-label">Cartório</label><input class="form-input" id="pf-cartorio" value="${escHtml(d.cartorio||'')}" placeholder="Cartório de registro"></div>
    </div>` : ''}
    <input type="hidden" id="pf-photo-data" value="${p?.foto||''}">
    <input type="hidden" id="pf-id" value="${p?.id||''}">
    <input type="hidden" id="pf-tipo" value="${t}">
    <div class="veh-form-btns">
      <button class="btn btn-secondary" onclick="${backAction}">Cancelar</button>
      <button class="btn btn-primary" onclick="savePatrimonioForm()">Salvar</button>
    </div>
    ${p ? `
    <div style="margin-top:14px">
      <button class="btn btn-secondary" style="width:100%;color:var(--red)" onclick="deletePatrimonioUI('${p.id}')">Excluir ${tipoLbl.toLowerCase()}</button>
    </div>` : ''}`;
}

function onPatPhotoChange(input) {
  const file = input.files[0];
  if (!file) return;
  resizeVehPhoto(file).then(dataUrl => {
    if (!dataUrl) return;
    document.getElementById('pf-photo-data').value = dataUrl;
    const prev = document.getElementById('pf-photo-preview');
    if (prev) {
      prev.className = '';
      prev.style.cssText = 'width:64px;height:64px;border-radius:12px;overflow:hidden';
      prev.innerHTML = `<img src="${dataUrl}" style="width:100%;height:100%;object-fit:cover">`;
    }
  });
}

function savePatrimonioForm() {
  const nome = (document.getElementById('pf-nome')?.value || '').trim();
  if (!nome) { gdToast('Nome obrigatório.'); return; }
  const valorRaw = document.getElementById('pf-valor')?.value;
  const _num = elId => {
    const raw = document.getElementById(elId)?.value;
    return raw === '' || raw == null ? 0 : Number(raw) || 0;
  };
  const fields = {
    nome,
    valorEstimado: valorRaw === '' || valorRaw == null ? 0 : Number(valorRaw) || 0,
    status:        document.getElementById('pf-status')?.value || 'ativo',
    foto:          document.getElementById('pf-photo-data')?.value || null,
    observacoes:   (document.getElementById('pf-obs')?.value || '').trim(),
  };
  const id   = document.getElementById('pf-id')?.value;
  const tipo = document.getElementById('pf-tipo')?.value || 'outro';
  // Detalhes do imóvel — merge com os detalhes existentes, sem clobber
  if (tipo === 'imovel' && document.getElementById('pf-subtipo')) {
    const prev = id ? (getPatrimonio(id)?.detalhes || {}) : {};
    fields.detalhes = Object.assign({}, prev, {
      subtipo:    document.getElementById('pf-subtipo')?.value || '',
      endereco:   (document.getElementById('pf-endereco')?.value || '').trim(),
      cidade:     (document.getElementById('pf-cidade')?.value || '').trim(),
      metragem:   _num('pf-metragem'),
      quartos:    _num('pf-quartos'),
      banheiros:  _num('pf-banheiros'),
      vagas:      _num('pf-vagas'),
      condominio: _num('pf-condominio'),
      iptu:       _num('pf-iptu'),
      aluguel:    _num('pf-aluguel'),
      matricula:  (document.getElementById('pf-matricula')?.value || '').trim(),
      cartorio:   (document.getElementById('pf-cartorio')?.value || '').trim(),
    });
  }
  if (id) {
    // Reavaliação automática: só quando o valor realmente mudou numa edição
    const prev = getPatrimonio(id);
    if (prev && (prev.valorEstimado || 0) !== fields.valorEstimado) {
      fields.historico = (prev.historico || []).concat([{
        id:            uid(),
        data:          todayStr(),
        tipo:          'avaliacao',
        descricao:     '',
        valor:         fields.valorEstimado,
        valorAnterior: prev.valorEstimado || 0,
        despesaId:     null,
        pendenciaId:   null,
      }]);
    }
    updatePatrimonio(id, fields);
    gdToast('Patrimônio atualizado.');
    renderPatDetail(id);
  } else {
    // Cadastro inicial: nenhum evento de reavaliação é criado
    createPatrimonio(Object.assign({ tipo }, fields));
    gdToast('Patrimônio adicionado.');
    renderPatrimonioHome();
  }
}

function deletePatrimonioUI(id) {
  const p = getPatrimonio(id);
  if (!p) return;
  gdConfirm({
    title: 'Excluir patrimônio',
    msg: `Excluir permanentemente "${p.nome}"? Esta ação não pode ser desfeita. Você também pode apenas mudar o status para Arquivado.`,
    confirmText: 'Excluir',
    variant: 'danger',
    onConfirm: () => {
      D.patrimonios = (D.patrimonios || []).filter(x => x.id !== id);
      save();
      renderPatrimonioHome();
      gdToast('Patrimônio excluído.', { type: 'success' });
    },
  });
}

// ══════════════════════════════════════════
// PATRIMÔNIO 2.0 — DETALHE, FINANCIAMENTOS E HISTÓRICO (Etapa 3)
// ══════════════════════════════════════════
// Detalhe de imóvel/outro bem com seções Detalhes, Financiamentos e
// Histórico patrimonial. Financiamentos de veículos ficam para a Etapa 4
// (fluxo legado de veículos permanece intocado).

var _patFinTarget = null; // { patId, finId }
var _patEvtTarget = null; // patId

var PAT_SUBTIPO_LABELS = { apartamento:'Apartamento', casa:'Casa', terreno:'Terreno', comercial:'Comercial', outro:'Outro' };

function _patFmtDate(iso) {
  if (!iso) return '';
  const parts = String(iso).split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : iso;
}

function _patTrashSvg() {
  return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>';
}

function renderPatDetail(id) {
  const p = getPatrimonio(id);
  if (!p) { renderPatrimonioHome(); return; }
  _vehDetailId = null;
  _vehShowView('pat-detail-view');
  window.scrollTo(0, 0);
  if (document.body) document.body.scrollTop = 0;
  const cont = document.getElementById('pat-detail-cont');
  if (!cont) return;

  const typeKey  = _patTypeKey(p.tipo);
  const statusK  = p.status || 'ativo';
  const chipName = { veiculo:'Veículo', imovel:'Imóvel', outro:'Outro bem' }[typeKey];
  const d        = p.detalhes || {};
  const fins     = p.financiamentos || [];
  const saldoTot = fins.reduce((s, f) => s + (f.saldoDevedor || 0), 0);

  // ── Detalhes do imóvel (somente campos preenchidos) ──
  const detRows = [];
  if (typeKey === 'imovel') {
    if (d.subtipo)    detRows.push(['Tipo', PAT_SUBTIPO_LABELS[d.subtipo] || d.subtipo]);
    if (d.endereco)   detRows.push(['Endereço', d.endereco]);
    if (d.cidade)     detRows.push(['Cidade', d.cidade]);
    if (d.metragem)   detRows.push(['Metragem', `${d.metragem} m²`]);
    if (d.quartos)    detRows.push(['Quartos', String(d.quartos)]);
    if (d.banheiros)  detRows.push(['Banheiros', String(d.banheiros)]);
    if (d.vagas)      detRows.push(['Vagas', String(d.vagas)]);
    if (d.condominio) detRows.push(['Condomínio', `${R(d.condominio)}/mês`]);
    if (d.iptu)       detRows.push(['IPTU', `${R(d.iptu)}/ano`]);
    if (d.aluguel)    detRows.push(['Aluguel/renda', `${R(d.aluguel)}/mês`]);
    if (d.matricula)  detRows.push(['Matrícula', d.matricula]);
    if (d.cartorio)   detRows.push(['Cartório', d.cartorio]);
  }

  // ── Financiamentos ──
  const finHtml = fins.length === 0
    ? `<div class="pat-det-empty">Nenhum financiamento cadastrado.</div>`
    : fins.map(f => {
        const parc = (f.parcelasTotal || 0) > 0 ? `${f.parcelasPagas || 0}/${f.parcelasTotal} parcelas` : '';
        const parcela = f.parcelaMensal ? `${R(f.parcelaMensal)}/mês` : '';
        const sub = [f.descricao, parc, parcela].filter(Boolean).join(' · ');
        return `
        <div class="pat-fin-item" onclick="openPatFinForm('${p.id}','${f.id}')">
          <div class="pat-fin-body">
            <div class="pat-fin-name">${escHtml(f.instituicao || '')}</div>
            ${sub ? `<div class="pat-fin-sub">${escHtml(sub)}</div>` : ''}
          </div>
          <div class="pat-fin-right">
            <span class="pat-fin-saldo">−${R(f.saldoDevedor || 0)}</span>
            <button class="pat-mini-del" onclick="event.stopPropagation();deletePatFin('${p.id}','${f.id}')" aria-label="Excluir financiamento">${_patTrashSvg()}</button>
          </div>
        </div>`;
      }).join('');

  // ── Histórico (mais recente primeiro; estável para datas iguais) ──
  const hist = (p.historico || []).slice()
    .map((e, i) => ({ e, i }))
    .sort((a, b) => String(b.e.data || '').localeCompare(String(a.e.data || '')) || b.i - a.i)
    .map(x => x.e);
  const histHtml = hist.length === 0
    ? `<div class="pat-det-empty">Nenhum evento registrado.</div>`
    : hist.map(e => {
        let title, body = '';
        if (e.tipo === 'avaliacao') {
          title = 'Reavaliação';
          body  = `<span class="pat-hist-old">${R(e.valorAnterior || 0)}</span> <span class="pat-hist-arrow">→</span> <span class="pat-hist-new">${R(e.valor || 0)}</span>`;
        } else if (e.tipo === 'km_update' || e._legacyType === 'km_update') {
          title = 'Atualização de km';
          body  = e._legacyKm != null ? `${Number(e._legacyKm).toLocaleString('pt-BR')} km` : escHtml(e.descricao || '');
        } else {
          title = escHtml(e.descricao || 'Evento');
          body  = e.valor ? R(e.valor) : '';
        }
        const isManual = e.tipo === 'evento' && !e._legacyType;
        return `
        <div class="pat-hist-item">
          <div class="pat-hist-dot-col"><span class="pat-hist-dot ${e.tipo === 'avaliacao' ? 'pat-hist-dot-aval' : ''}"></span></div>
          <div class="pat-hist-body">
            <div class="pat-hist-title">${title}</div>
            ${body ? `<div class="pat-hist-val">${body}</div>` : ''}
            <div class="pat-hist-date">${_patFmtDate(e.data)}</div>
          </div>
          ${isManual ? `<button class="pat-mini-del" onclick="deletePatEvt('${p.id}','${e.id}')" aria-label="Excluir evento">${_patTrashSvg()}</button>` : ''}
        </div>`;
      }).join('');

  cont.innerHTML = `
    ${_pageHeader("renderPatrimonioHome()", chipName, `<button class="btn-pill" onclick="openPatForm(null,'${p.id}')">Editar</button>`)}

    <div class="card pat-det-hero">
      <div class="pat-det-hero-row">
        <div class="pat-list-photo pat-det-photo${p.foto ? '' : ' pat-ico-' + typeKey}">
          ${p.foto ? `<img src="${escHtml(p.foto)}" alt="${escHtml(p.nome)}">` : _patIcon(typeKey)}
        </div>
        <div class="pat-det-hero-info">
          <div class="pat-det-name">${escHtml(p.nome)}</div>
          <div class="pat-list-meta">
            <span class="pat-chip pat-chip-${typeKey}">${chipName}</span>
            <span class="pat-status s-${statusK}"><span class="pat-status-dot"></span><span class="pat-status-lbl">${_patStatusLabel(statusK)}</span></span>
          </div>
        </div>
      </div>
      <div class="pat-det-val-lbl">Valor atual estimado</div>
      <div class="pat-det-val">${R(p.valorEstimado || 0)}</div>
      ${saldoTot > 0 ? `<div class="pat-det-liq">Financiamentos −${R(saldoTot)} · Líquido <b>${R((p.valorEstimado || 0) - saldoTot)}</b></div>` : ''}
      ${p.observacoes ? `<div class="pat-det-obs">${escHtml(p.observacoes)}</div>` : ''}
    </div>

    ${detRows.length > 0 ? `
    <div class="sec-label" style="margin:18px 0 10px">Detalhes</div>
    <div class="pat-list-group" style="margin-bottom:0">
      ${detRows.map(r => `<div class="pat-det-row"><span class="pat-det-row-lbl">${escHtml(r[0])}</span><span class="pat-det-row-val">${escHtml(r[1])}</span></div>`).join('')}
    </div>` : ''}

    <div class="pat-det-sec-head">
      <div class="sec-label" style="margin:0">Financiamentos</div>
      <button class="btn-pill" onclick="openPatFinForm('${p.id}')">+ Adicionar</button>
    </div>
    <div class="pat-list-group" style="margin-bottom:0">${finHtml}</div>

    <div class="pat-det-sec-head">
      <div class="sec-label" style="margin:0">Histórico</div>
      <button class="btn-pill" onclick="openPatEvtForm('${p.id}')">+ Evento</button>
    </div>
    <div class="pat-list-group" style="margin-bottom:calc(96px + env(safe-area-inset-bottom, 0px))">${histHtml}</div>
  `;
}

// ── CRUD de financiamentos ──
function openPatFinForm(patId, finId) {
  _patFinTarget = { patId: patId, finId: finId || null };
  const p = getPatrimonio(patId);
  if (!p) return;
  const f = finId ? (p.financiamentos || []).find(x => x.id === finId) : null;
  document.getElementById('pfin-title').textContent = f ? 'Editar financiamento' : 'Novo financiamento';
  document.getElementById('pfin-total-lbl').textContent   = `Valor total (${currSym})`;
  document.getElementById('pfin-saldo-lbl').textContent   = `Saldo devedor (${currSym}) *`;
  document.getElementById('pfin-parcela-lbl').textContent = `Parcela mensal (${currSym})`;
  document.getElementById('pfin-inst').value    = f?.instituicao || '';
  document.getElementById('pfin-desc').value    = f?.descricao || '';
  document.getElementById('pfin-total').value   = f?.valorTotal || '';
  document.getElementById('pfin-saldo').value   = f?.saldoDevedor ?? '';
  document.getElementById('pfin-parcela').value = f?.parcelaMensal || '';
  document.getElementById('pfin-inicio').value  = f?.dataInicio || '';
  document.getElementById('pfin-ptotal').value  = f?.parcelasTotal || '';
  document.getElementById('pfin-ppagas').value  = f?.parcelasPagas || '';
  document.getElementById('pfin-id').value      = f?.id || '';
  openOverlay('pat-fin-sheet');
}

function savePatFin() {
  const t = _patFinTarget;
  if (!t) return;
  const p = getPatrimonio(t.patId);
  if (!p) return;
  const inst = (document.getElementById('pfin-inst')?.value || '').trim();
  if (!inst) { gdToast('Informe a instituição.'); return; }
  const saldoRaw = document.getElementById('pfin-saldo')?.value;
  if (saldoRaw === '' || saldoRaw == null) { gdToast('Informe o saldo devedor.'); return; }
  const num = elId => {
    const raw = document.getElementById(elId)?.value;
    return raw === '' || raw == null ? 0 : Number(raw) || 0;
  };
  const fin = {
    id:            t.finId || uid(),
    instituicao:   inst,
    descricao:     (document.getElementById('pfin-desc')?.value || '').trim(),
    valorTotal:    num('pfin-total'),
    saldoDevedor:  Number(saldoRaw) || 0,
    parcelaMensal: num('pfin-parcela'),
    parcelasTotal: num('pfin-ptotal'),
    parcelasPagas: num('pfin-ppagas'),
    dataInicio:    document.getElementById('pfin-inicio')?.value || '',
  };
  const list = (p.financiamentos || []).slice();
  const idx  = list.findIndex(x => x.id === fin.id);
  if (idx >= 0) list[idx] = fin; else list.push(fin);
  updatePatrimonio(t.patId, { financiamentos: list });
  closeOverlay('pat-fin-sheet');
  renderPatDetail(t.patId);
  gdToast(idx >= 0 ? 'Financiamento atualizado.' : 'Financiamento adicionado.');
}

function deletePatFin(patId, finId) {
  const p = getPatrimonio(patId);
  if (!p) return;
  const f = (p.financiamentos || []).find(x => x.id === finId);
  gdConfirm({
    title: 'Excluir financiamento',
    msg: `Excluir o financiamento${f?.instituicao ? ` de "${f.instituicao}"` : ''}? Esta ação não pode ser desfeita.`,
    confirmText: 'Excluir',
    variant: 'danger',
    onConfirm: () => {
      updatePatrimonio(patId, { financiamentos: (p.financiamentos || []).filter(x => x.id !== finId) });
      renderPatDetail(patId);
      gdToast('Financiamento excluído.', { type: 'success' });
    },
  });
}

// ── Eventos manuais do histórico ──
function openPatEvtForm(patId) {
  _patEvtTarget = patId;
  document.getElementById('pevt-data').value  = todayStr();
  document.getElementById('pevt-desc').value  = '';
  document.getElementById('pevt-valor').value = '';
  document.getElementById('pevt-valor-lbl').textContent = `Valor (${currSym}, opcional)`;
  openOverlay('pat-evt-sheet');
}

function savePatEvt() {
  const patId = _patEvtTarget;
  const p = getPatrimonio(patId);
  if (!p) return;
  const desc = (document.getElementById('pevt-desc')?.value || '').trim();
  if (!desc) { gdToast('Descrição obrigatória.'); return; }
  const valorRaw = document.getElementById('pevt-valor')?.value;
  const evt = {
    id:          uid(),
    data:        document.getElementById('pevt-data')?.value || todayStr(),
    tipo:        'evento',
    descricao:   desc,
    valor:       valorRaw === '' || valorRaw == null ? 0 : Number(valorRaw) || 0,
    despesaId:   null,
    pendenciaId: null,
  };
  updatePatrimonio(patId, { historico: (p.historico || []).concat([evt]) });
  closeOverlay('pat-evt-sheet');
  renderPatDetail(patId);
  gdToast('Evento registrado.');
}

function deletePatEvt(patId, evtId) {
  const p = getPatrimonio(patId);
  if (!p) return;
  gdConfirm({
    title: 'Excluir evento',
    msg: 'Excluir este evento do histórico? Esta ação não pode ser desfeita.',
    confirmText: 'Excluir',
    variant: 'danger',
    onConfirm: () => {
      updatePatrimonio(patId, { historico: (p.historico || []).filter(e => e.id !== evtId) });
      renderPatDetail(patId);
      gdToast('Evento excluído.', { type: 'success' });
    },
  });
}

// ══════════════════════════════════════════
// DETALHE INTEGRADO DE VEÍCULO (Meu Patrimônio)
// ══════════════════════════════════════════
// Novo destino ao tocar num veículo na lista unificada. Une D.vehicles
// (fonte de verdade dos dados próprios) ao enriquecimento em D.patrimonios
// (valor atual, histórico de reavaliação). Não migra, não duplica, não
// modifica ids. A tela legacy continua acessível por links secundários.

var _vehDetailMode = 'legacy';   // 'integrated' | 'legacy'
var _vehReturnCtx  = null;        // vehId quando o detalhe legacy foi aberto pelo integrado
var _patHomeScroll = 0;           // posição de scroll da home ao abrir o detalhe

// Re-render consciente do modo: mantém o usuário no detalhe corrente após
// uma ação. No modo legacy é idêntico ao comportamento anterior.
function _refreshVehDetail(id) {
  if (_vehDetailMode === 'integrated') renderVehPatDetail(id);
  else renderVehDetail(id);
}

// Abre o detalhe integrado guardando o scroll da home para o Voltar.
function openVehPatDetail(vehId) {
  _patHomeScroll = window.scrollY || document.body.scrollTop || document.documentElement.scrollTop || 0;
  renderVehPatDetail(vehId);
}

// Voltar do detalhe → home preservando filtro e posição de scroll.
function _backToPatHomePreserveScroll() {
  renderPatrimonioHome(true);
  const y = _patHomeScroll;
  requestAnimationFrame(() => {
    window.scrollTo(0, y);
    if (document.body) document.body.scrollTop = y;
    if (document.documentElement) document.documentElement.scrollTop = y;
  });
}

// Link secundário do detalhe integrado → detalhe legacy do mesmo veículo.
function openLegacyVehFromIntegrated(vehId) {
  _vehReturnCtx = vehId; // ao voltar do legacy, retorna ao detalhe integrado
  renderVehDetail(vehId);
}
function backFromLegacyVehDetail(vehId) {
  _vehReturnCtx = null;
  renderVehPatDetail(vehId);
}

// SVG de carro (fallback quando não há foto), coerente com o Avenco.
function _vehIconSvg(size) {
  const s = size || 20;
  return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M5 17H3v-5l3-5h12l3 5v5h-2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/><path d="M9 12h6"/></svg>`;
}

// Foto inválida / que falhou ao carregar → cai para o ícone de veículo
// (nunca deixa bloco cinza vazio). Não toca nos dados do veículo.
function _vehImgError(img) {
  const box = img && img.parentElement;
  if (!box) return;
  box.classList.add('pat-ico-veiculo');
  box.innerHTML = _vehIconSvg(26);
}

// Aceita apenas fontes de imagem seguras para <img src> (data URI de
// imagem ou http/https). Caso contrário, trata como ausente → ícone.
function _vehSafePhoto(photo) {
  if (typeof photo !== 'string' || !photo) return null;
  const p = photo.trim();
  if (/^data:image\//i.test(p) || /^https?:\/\//i.test(p)) return p;
  return null;
}

// Pendências vinculadas ao veículo (resolvedor unificado, sem duplicar
// diretas e reversas). Mesma lógica do detalhe legacy.
function _vehLinkedPends(v) {
  const seen = new Set();
  const out = [];
  (v.linkedPendencias || []).forEach(pid => {
    const p = (D.pendencias || []).find(x => x.id === pid);
    if (p && !seen.has(p.id)) { seen.add(p.id); out.push(p); }
  });
  (D.pendencias || []).forEach(p => {
    if (seen.has(p.id)) return;
    const ref = _pendAssetRef(p);
    if (ref && ref.kind === 'vehicle' && ref.id === v.id) { seen.add(p.id); out.push(p); }
  });
  return out;
}

function renderVehPatDetail(id) {
  const v = (D.vehicles || []).find(x => x.id === id);
  if (!v) { renderPatrimonioHome(); return; }
  _vehDetailId = id;
  _vehDetailMode = 'integrated';
  _vehShowView('pat-veh-detail-view');
  window.scrollTo(0, 0);
  if (document.body) document.body.scrollTop = 0;
  const cont = document.getElementById('pat-veh-detail-cont');
  if (!cont) return;

  const pat     = _patForVehId(id); // enriquecimento (pode ser null)
  const statusK = ({ em_uso:'ativo', na_oficina:'ativo', a_venda:'ativo', vendido:'vendido', arquivado:'inativo' })[v.status] || 'ativo';
  const statusLbl = VEH_STATUS_LABELS[v.status] || v.status;
  const sub     = [v.brand, v.model, v.year].filter(Boolean).join(' · ');
  // Valor informado: número positivo. 0/ausente/null → "Valor não informado".
  const valorInformado = pat && typeof pat.valorEstimado === 'number' && pat.valorEstimado > 0;

  // ── Informações do veículo: só o que NÃO aparece no cabeçalho ──
  // (nome, marca, modelo, ano, status, placa, km e valor já estão no hero)
  const infoRows = [];
  if (v.color) infoRows.push(['Cor', v.color]);
  const hasInfo = infoRows.length > 0 || !!v.notes;

  // ── Pendências abertas vinculadas (resumo) ──
  const pends = _vehLinkedPends(v).filter(p => p.status === 'aberta');
  const pendHtml = pends.length === 0
    ? `<div class="pat-det-empty">Nenhuma pendência aberta.</div>`
    : pends.map(p => `
        <div class="pat-fin-item" style="cursor:default">
          <div class="pat-fin-body">
            <div class="pat-fin-name">${escHtml(p.title)}</div>
            <div class="pat-fin-sub">${(PEND_PRIO_NAMES[p.priority] || '')}${p.estimatedValue ? ' · ' + R(p.estimatedValue) : ''}</div>
          </div>
          <button class="pat-mini-del" onclick="unlinkVehPend('${v.id}','${p.id}')" aria-label="Desvincular pendência">${_patTrashSvg()}</button>
        </div>`).join('');

  // ── Despesas vinculadas ──
  const exps = (v.linkedExpenses || []).map(eid => (D.expenses || []).find(e => e.id === eid)).filter(Boolean);
  const expHtml = exps.length === 0
    ? `<div class="pat-det-empty">Nenhuma despesa vinculada.</div>`
    : exps.map(e => `
        <div class="pat-fin-item" style="cursor:default">
          <div class="pat-fin-body">
            <div class="pat-fin-name">${escHtml(e.description || e.category)}</div>
            <div class="pat-fin-sub">${fmtShort(e.date)} · ${escHtml(e.category)}</div>
          </div>
          <div class="pat-fin-right">
            <span class="pat-fin-saldo" style="color:var(--rd)">−${R(e.amount)}</span>
            <button class="pat-mini-del" onclick="unlinkVehExp('${v.id}','${e.id}')" aria-label="Desvincular despesa">${_patTrashSvg()}</button>
          </div>
        </div>`).join('');

  // ── Histórico: eventos legacy (v.history) + reavaliações (patrimônio) ──
  const histItems = [];
  (v.history || []).forEach(h => histItems.push({
    kind: h.type === 'km_update' ? 'km' : 'evento',
    data: h.date, title: h.type === 'km_update' ? 'Atualização de km' : (h.note || 'Evento'),
    body: h.type === 'km_update' ? (h.km != null ? `${Number(h.km).toLocaleString('pt-BR')} km` : '') : (h.amount ? R(h.amount) : ''),
  }));
  if (pat) {
    (pat.historico || []).forEach(e => {
      if (e.tipo === 'avaliacao') histItems.push({
        kind: 'aval', data: e.data, title: 'Reavaliação',
        body: `<span class="pat-hist-old">${R(e.valorAnterior || 0)}</span> <span class="pat-hist-arrow">→</span> <span class="pat-hist-new">${R(e.valor || 0)}</span>`,
      });
    });
  }
  histItems.sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')));
  const histHtml = histItems.length === 0 ? '' : `
    <div class="sec-label" style="margin:18px 0 10px">Histórico</div>
    <div class="pat-list-group" style="margin-bottom:0">
      ${histItems.map(e => `
        <div class="pat-hist-item">
          <div class="pat-hist-dot-col"><span class="pat-hist-dot ${e.kind === 'aval' ? 'pat-hist-dot-aval' : ''}"></span></div>
          <div class="pat-hist-body">
            <div class="pat-hist-title">${e.title.startsWith('<') ? e.title : escHtml(e.title)}</div>
            ${e.body ? `<div class="pat-hist-val">${e.body}</div>` : ''}
            <div class="pat-hist-date">${_patFmtDate(e.data)}</div>
          </div>
        </div>`).join('')}
    </div>`;

  const safePhoto = _vehSafePhoto(v.photo);
  const photoHtml = safePhoto
    ? `<img src="${escHtml(safePhoto)}" alt="${escHtml(v.name)}" onerror="_vehImgError(this)">`
    : _vehIconSvg(26);

  cont.innerHTML = `
    ${_pageHeader("_backToPatHomePreserveScroll()", 'Veículo', `
      <div class="phr-actions">
        <button class="btn-pill" onclick="openVehForm('${v.id}')">Editar</button>
        <button class="pat-kebab-btn" onclick="openVehMenu('${v.id}')" aria-label="Mais ações do veículo">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true" focusable="false"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>
        </button>
      </div>`)}

    <div class="card pat-det-hero">
      <div class="pat-det-hero-row">
        <div class="pat-list-photo pat-det-photo${safePhoto ? '' : ' pat-ico-veiculo'}">${photoHtml}</div>
        <div class="pat-det-hero-info">
          <div class="pat-det-name">${escHtml(v.name)}</div>
          ${sub ? `<div class="pat-det-sub-line">${escHtml(sub)}</div>` : ''}
          <div class="pat-list-meta">
            <span class="pat-chip pat-chip-veiculo">Veículo</span>
            <span class="pat-status s-${statusK}"><span class="pat-status-dot"></span><span class="pat-status-lbl">${escHtml(statusLbl)}</span></span>
          </div>
          ${(v.plate || (v.km != null && v.km !== '')) ? `<div class="pat-det-sub-line" style="margin-top:4px">${[v.plate ? escHtml(v.plate) : '', (v.km != null && v.km !== '') ? Number(v.km).toLocaleString('pt-BR') + ' km' : ''].filter(Boolean).join(' · ')}</div>` : ''}
        </div>
      </div>
      <div class="pat-det-val-lbl">Valor atual estimado</div>
      ${valorInformado
        ? `<div class="pat-det-val">${R(pat.valorEstimado)}</div>`
        : `<div class="pat-det-val-empty">Valor não informado</div>`}
    </div>

    ${hasInfo ? `
    <div class="sec-label" style="margin:18px 0 10px">Informações do veículo</div>
    <div class="pat-list-group" style="margin-bottom:0">
      ${infoRows.map(r => `<div class="pat-det-row"><span class="pat-det-row-lbl">${escHtml(r[0])}</span><span class="pat-det-row-val">${escHtml(r[1])}</span></div>`).join('')}
      ${v.notes ? `<div class="pat-det-row pat-det-row-notes"><span class="pat-det-row-lbl">Observações</span><span class="pat-det-row-val pat-det-row-val-notes">${escHtml(v.notes)}</span></div>` : ''}
    </div>` : ''}

    <div class="pat-det-sec-head">
      <div class="sec-label" style="margin:0">Pendências</div>
      <button class="pat-link-add" onclick="openVehLinkPend('${v.id}')">+ Vincular</button>
    </div>
    <div class="pat-list-group" style="margin-bottom:0">${pendHtml}</div>

    <div class="pat-det-sec-head">
      <div class="sec-label" style="margin:0">Despesas</div>
      <button class="pat-link-add" onclick="openVehLinkExp('${v.id}')">+ Vincular</button>
    </div>
    <div class="pat-list-group" style="margin-bottom:0">${expHtml}</div>

    ${histHtml}

    <div class="pat-home-bottom-spacer"></div>
  `;
}

// ── Menu de ações secundárias do veículo (kebab) ──
var _vehMenuTarget = null;
function openVehMenu(id) {
  _vehMenuTarget = id;
  const v = (D.vehicles || []).find(x => x.id === id);
  const t = document.getElementById('vmenu-title');
  if (t) t.textContent = v ? v.name : 'Veículo';
  openOverlay('veh-menu-sheet');
}
function vehMenuStatus() {
  closeOverlay('veh-menu-sheet');
  if (_vehMenuTarget) openVehStatus(_vehMenuTarget);
}
function vehMenuArchive() {
  closeOverlay('veh-menu-sheet');
  const id = _vehMenuTarget;
  const v = (D.vehicles || []).find(x => x.id === id);
  if (!v) return;
  if (v.status === 'arquivado') { gdToast('Veículo já está arquivado.'); return; }
  v.status = 'arquivado';
  save();
  renderVehPatDetail(id);
  gdToast('Veículo arquivado. Histórico e vínculos preservados.');
}
function vehMenuDelete() {
  closeOverlay('veh-menu-sheet');
  const id = _vehMenuTarget;
  const v = (D.vehicles || []).find(x => x.id === id);
  if (!v) return;
  const hasHistory = (v.history || []).length > 0;
  const hasLinks   = (v.linkedExpenses || []).length > 0 || (v.linkedPendencias || []).length > 0;
  if (hasHistory || hasLinks) {
    gdToast('Veículo com histórico ou vínculos não pode ser excluído. Use "Arquivar".', { type: 'error' });
    return;
  }
  gdConfirm({
    title: 'Excluir veículo',
    msg: 'Excluir permanentemente este veículo? Esta ação não pode ser desfeita.',
    confirmText: 'Excluir',
    variant: 'danger',
    onConfirm: () => {
      D.vehicles = (D.vehicles || []).filter(x => x.id !== id);
      save();
      renderPatrimonioHome();
      gdToast('Veículo excluído definitivamente.', { type: 'success' });
    },
  });
}
