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
      _setUserAvatar(user);
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
  dividas: {
    icon: '🧾',
    title: 'Dívidas',
    text: 'Central de todas as suas dívidas — financiamentos, compras parceladas, empréstimos e dívidas pessoais. Acompanhe saldo, parcelas pagas, próximos vencimentos e registre pagamentos. Cada dívida é um único registro, também acessível pelo bem relacionado no Patrimônio.',
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
      if (!Array.isArray(D.installments)) D.installments = [];
      if (!Array.isArray(D.installmentPayments)) D.installmentPayments = [];
      if (!Array.isArray(D.fixedPayments)) D.fixedPayments = [];
      // Marco de adoção da função de baixa: só vencimentos a partir desta data
      // contam como pendente/vencido. Vencimentos anteriores viram histórico neutro
      // (evita cobrar/duplicar compromissos já pagos antes da função existir).
      let _fxNeedSave = false;
      if (!D.fixedStart) { D.fixedStart = dateStr(new Date()); _fxNeedSave = true; }
      // Limpa marcadores de baixa órfãos vindos da nuvem; persiste pelo fluxo normal (save()).
      const _fxCleaned = reconcileFixedPayments();
      // Consolidação canônica de dívidas (idempotente) + reconciliação unificada.
      // Roda após loadFromCloud para migrar dados antigos e limpar marcadores órfãos.
      const _migrated = migrateDebtsV1();
      const _patLife = migratePatrimonioLifecycleV1();
      const _debtCleaned = reconcileDebtPayments();
      const _pendCleaned = reconcilePendencias();
      localStorage.setItem('gdcash_v1', JSON.stringify(D));
      if (_fxCleaned || _migrated || _patLife || _debtCleaned || _pendCleaned || _fxNeedSave) save();
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
  refreshHomeFixosAlert();
  renderHomeVencimentos();
}

function renderRecentTx() {
  const listEl = document.getElementById('inicio-tx-list');
  if (!listEl) return;
  const platMap = Object.fromEntries((D.platforms || []).map(p => [p.id, p]));
  const exps = (D.expenses || []).map(e => ({
    type: 'exp', id: e.id, date: e.date, label: e.description || e.category, sub: e.category, amount: e.amount,
    typeLabel: _movementTypeLabel(e),
    editRef: { kind: 'exp', id: e.id }
  }));
  const incItems = (D.incomeItems || []).filter(it => it.status === 'paid').map(it => ({
    type: 'inc', id: it.id, date: it.date,
    label: it.note || platMap[it.platformId]?.name || 'Receita',
    sub: platMap[it.platformId]?.name || '',
    typeLabel: _movementTypeLabel(it),
    amount: it.amount,
    editRef: { kind: 'item', id: it.id }
  }));
  const manualInc = [];
  Object.entries(D.dailyIncome || {}).forEach(([date, pm]) => {
    (D.platforms || []).forEach(p => {
      const v = pm[p.id];
      if (v && v > 0 && !(D.incomeItems || []).some(it => it.date === date && it.platformId === p.id))
        manualInc.push({ type: 'inc', id: '', date, label: p.name, sub: '', amount: v,
          typeLabel: 'Receita',
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
        <div class="tx-sub">${tx.sub ? escHtml(tx.sub) + ' · ' : ''}${escHtml(tx.typeLabel || 'Gasto')} · ${fmtShort(tx.date)}</div>
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
  const dividasAtivas = (D.debts || []).filter(d => { const s = _debtStatus(d); return s === 'ativa' || s === 'atrasada'; });
  const dividasSaldo = dividasAtivas.reduce((s, d) => s + _debtSaldo(d), 0);
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
    debt: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/><circle cx="7" cy="14.5" r="1"/></svg>',
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
      ${item('dividas', ICO.debt, 'Dívidas', dividasAtivas.length > 0 ? `${dividasAtivas.length} ativa(s) · ${R(dividasSaldo)} devedor` : 'Nenhuma ativa')}
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
var _srchState = { q:'', type:'all', period:'all', from:'', to:'', bem:'' };

// Abre a Pesquisa já filtrada pelas despesas de um bem (opcionalmente do mês).
function abrirDespesasDoBem(bemId, period) {
  _srchState.bem = bemId || '';
  _srchState.type = 'exp';
  _srchState.period = period || 'month';
  _srchState.q = '';
  switchTab('pesquisa', 'patrimonio');
  renderPesquisa();
}
function srchClearBem() { _srchState.bem = ''; renderPesquisaResults(); }

// Normaliza para busca: minúsculas + sem acentos (não persiste nada).
function _srchNorm(s) {
  return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Nome do veículo/patrimônio vinculado a um gasto, se houver (canônico + legado).
function _srchLinkName(e) {
  if (e.vehicleId) {
    const v = (D.vehicles||[]).find(x => x.id === e.vehicleId);
    if (v) return v.name || '';
  }
  if (e.patrimonioId) {
    const p = (D.patrimonios||[]).find(x => x.id === e.patrimonioId);
    if (p) return p.nome || '';
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
      typeLabel: _movementTypeLabel(e),
      link: _srchLinkName(e), bemId: _expBemLegacyId(e), editRef: { kind:'exp', id:e.id },
    });
  });
  (D.incomeItems||[]).forEach(it => {
    const pl = (D.platforms||[]).find(p => p.id === it.platformId);
    out.push({
      type:'inc', date: localDateKey(it.date), amount: it.amount,
      desc: it.note || '', tag: pl ? pl.name : 'Receita', link:'',
      typeLabel: _movementTypeLabel(it),
      assetSale: !!(it.meta && it.meta.source === 'asset-sale'),
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
        typeLabel: 'Receita',
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
    if (_srchState.bem && r.bemId !== _srchState.bem) return false; // filtro por patrimônio vinculado
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
  const bemChip = _srchState.bem
    ? `<div class="srch-bem-chip"><span>Despesas de: <b>${escHtml(_patNomeOf(_srchState.bem) || 'bem')}</b></span><button onclick="srchClearBem()" aria-label="Limpar filtro do patrimônio">✕</button></div>`
    : '';

  if (n === 0) {
    sumEl.innerHTML = bemChip + `<div class="srch-sum-card"><div class="srch-sum-count">Nenhum lançamento encontrado.</div><div class="srch-sum-period">${escHtml(periodLbl)}</div></div>`;
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
  sumEl.innerHTML = bemChip + `<div class="srch-sum-card">
      <div class="srch-sum-head"><span class="srch-sum-count">${n} ${n===1?'lançamento':'lançamentos'}</span><span class="srch-sum-period">${escHtml(periodLbl)}</span></div>
      ${valuesHtml}
      <div class="srch-sum-avg">Média por lançamento: ${R(avg)}</div>
    </div>`;

  listEl.innerHTML = rows.map(r => {
    const sign = r.type === 'inc' ? '+' : '−';
    const cls = r.type === 'inc' ? 'v-green' : 'v-red';
    const typeLbl = r.typeLabel || (r.type === 'inc' ? 'Receita' : 'Gasto');
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
          <span class="srch-r-meta">${fmtShort(r.date)} · ${r.assetSale ? '' : escHtml(r.tag) + ' · '}${typeLbl} ${linkHtml}</span>
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
    fixedPayments: [],
    fixedStart: null,
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
    installments: [],
    installmentPayments: [],
    // Fonte única canônica de dívidas (financiamentos, parcelamentos, empréstimos…).
    // installments/installmentPayments e patrimonios[].financiamentos permanecem
    // apenas como BACKUP pós-migração — não são lidos nos cálculos.
    debts: [],
    debtPayments: [],
    _debtsSchema: 0,
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
      if(!Array.isArray(p.installments)) p.installments=[];
      if(!Array.isArray(p.installmentPayments)) p.installmentPayments=[];
      if(!Array.isArray(p.debts)) p.debts=[];
      if(!Array.isArray(p.debtPayments)) p.debtPayments=[];
      if(!Array.isArray(p.fixedPayments)) p.fixedPayments=[];
      if(!p.fixedStart)  p.fixedStart=dateStr(new Date());
      return p;
    }
  } catch(e){}
  return defaultData();
})();

// Migração canônica de dívidas no boot local (offline / antes do loadFromCloud).
// Idempotente: flag global + identidade por origem. loadFromCloud roda de novo sem duplicar.
try { if (migrateDebtsV1()) localStorage.setItem('gdcash_v1', JSON.stringify(D)); } catch (e) {}
try { if (migratePatrimonioLifecycleV1()) localStorage.setItem('gdcash_v1', JSON.stringify(D)); } catch (e) {}

// ══════════════════════════════════════════
// MODAL SYSTEM
// ══════════════════════════════════════════

/* ── Toast (gerenciador único: no máximo 1 host + 1 toast visível por vez) ── */
(function() {
  let _wrap = null, _el = null, _timer = 0, _removeTimer = 0, _lastMsg = '', _lastType = '';
  const ICONS = {
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
    error:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    info:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
  };
  // Host único e global (fora de qualquer sheet/modal). Remove hosts órfãos.
  function _hostEl() {
    const all = document.querySelectorAll('.av-toast-wrap');
    all.forEach(w => { if (w !== _wrap) w.remove(); });
    if (!_wrap || !_wrap.isConnected) {
      _wrap = document.createElement('div');
      _wrap.className = 'av-toast-wrap';
      _wrap.setAttribute('aria-live', 'polite');
      document.body.appendChild(_wrap);
    }
    return _wrap;
  }
  function _clearTimers() { if (_timer) { clearTimeout(_timer); _timer = 0; } if (_removeTimer) { clearTimeout(_removeTimer); _removeTimer = 0; } }
  function _remove() {
    _clearTimers();
    const el = _el; _el = null; _lastMsg = ''; _lastType = '';
    if (el) { el.classList.add('hiding'); _removeTimer = setTimeout(() => { el.parentNode && el.parentNode.removeChild(el); _removeTimer = 0; }, 240); }
  }
  window.gdToast = function(msg, opts) {
    if (typeof opts === 'number') opts = { duration: opts };
    const { type, duration = 3800 } = opts || {};
    const tp = type || '';
    // Deduplicação: mesma mensagem+variante já visível → apenas reinicia o tempo.
    if (_el && _el.isConnected && msg === _lastMsg && tp === _lastType) {
      if (_timer) clearTimeout(_timer);
      _timer = setTimeout(_remove, duration);
      return;
    }
    // Substitui (nunca empilha): remove qualquer toast atual e mantém 1 host/1 toast.
    _clearTimers();
    const wrap = _hostEl();
    wrap.innerHTML = '';
    _el = document.createElement('div');
    _el.className = 'av-toast' + (tp ? ' av-toast--' + tp : '');
    _el.innerHTML = (tp && ICONS[tp] ? `<span class="av-toast-icon">${ICONS[tp]}</span>` : '') + '<span class="av-toast-msg"></span>';
    _el.querySelector('.av-toast-msg').textContent = msg;
    wrap.appendChild(_el);
    _lastMsg = msg; _lastType = tp;
    _timer = setTimeout(_remove, duration);
  };
  // Limpeza explícita (usada ao navegar/fechar overlays, se necessário).
  window._gdToastClear = function() { _remove(); };
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

// ── Avatar do usuário: nunca mostra o ícone nativo de imagem quebrada ──
// Usa a foto quando válida; senão, mostra iniciais (ou um ícone SVG do Avenco).
// O fallback vale no carregamento, reload, troca de tema e erro real de imagem.
const _USER_AVATAR_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/></svg>';
function _userInitials(user) {
  const n = String((user && (user.displayName || user.email)) || '').trim();
  if (!n) return '';
  const parts = n.split(/\s+/).filter(Boolean);
  const ini = (parts[0]?.[0] || '') + (parts.length > 1 ? (parts[parts.length - 1][0] || '') : '');
  return ini.toUpperCase().slice(0, 2);
}
function _setUserAvatar(user) {
  const btn = document.getElementById('user-avatar-btn');
  const img = document.getElementById('user-avatar-img');
  if (!btn || !img) return;
  let fb = document.getElementById('user-avatar-fallback');
  if (!fb) {
    fb = document.createElement('span');
    fb.id = 'user-avatar-fallback';
    fb.className = 'user-avatar-fallback';
    btn.appendChild(fb);
  }
  const initials = _userInitials(user);
  fb.innerHTML = initials || _USER_AVATAR_SVG;
  const url = (user && user.photoURL) ? String(user.photoURL).trim() : '';
  const showFallback = () => { img.style.display = 'none'; fb.style.display = 'flex'; };
  const showImg = () => { img.style.display = ''; fb.style.display = 'none'; };
  if (url) {
    img.onerror = showFallback;
    img.onload = showImg;
    img.src = url;
    // Se já carregou com falha (cache) ou é inválida, cai no fallback.
    if (img.complete && !img.naturalWidth) showFallback(); else showImg();
  } else {
    img.onerror = null; img.removeAttribute('src'); showFallback();
  }
}

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
// Data completa no padrão brasileiro dd/mm/aaaa (armazenamento continua ISO YYYY-MM-DD).
function _fmtDataBR(d) { if(!d) return ''; const dt = parseDate(d); return isNaN(dt) ? '' : dt.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'}); }
// Campo de data em dd/mm/aaaa (independe do locale do dispositivo). Converte de/para
// ISO YYYY-MM-DD para o armazenamento — nunca há inversão silenciosa dia/mês.
function _isoToBr(iso) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '')); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; }
function _brToIso(s) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s || '').trim());
  if (!m) return '';
  const d = +m[1], mo = +m[2], y = +m[3];
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return ''; // rejeita 31/02 etc.
  return `${m[3]}-${m[2]}-${m[1]}`;
}
function _maskDateBR(el) {
  const v = el.value.replace(/\D/g, '').slice(0, 8);
  let out = v.slice(0, 2);
  if (v.length >= 3) out += '/' + v.slice(2, 4);
  if (v.length >= 5) out += '/' + v.slice(4, 8);
  el.value = out;
}
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
// Receita avulsa (venda de patrimônio) de um dia — fora do modelo por plataforma
// (platformId nulo). Entra nos TOTAIS de dia/semana/mês, nunca no per-plataforma/ritmo.
function _saleIncomeDay(date) {
  return (D.incomeItems || []).filter(it =>
    it.status === 'paid' && !it.platformId && it.meta && it.meta.source === 'asset-sale' &&
    localDateKey(it.date) === date).reduce((s, it) => s + (it.amount || 0), 0);
}
function sumDayIncome(date)   { return D.platforms.reduce((s,p)=>s+getDayPlatIncome(date,p.id),0) + _saleIncomeDay(date); }
function sumPlatWeek(pid,off=0) { return weekDates(off).reduce((s,d)=>s+getDayPlatIncome(d,pid),0); }
function sumWeekIncome(off=0) { return D.platforms.reduce((s,p)=>s+sumPlatWeek(p.id,off),0) + weekDates(off).reduce((s,d)=>s+_saleIncomeDay(d),0); }
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
    // Receita avulsa (venda de patrimônio) — entra no total do mês, fora do per-plataforma.
    (D.incomeItems||[]).filter(it=>it.status==='paid' && !it.platformId && it.meta && it.meta.source==='asset-sale' && localDateKey(it.date)===d)
      .forEach(it=>{ receitas+=it.amount; lancReceitas.push(it); });
  });
  const lancGastos = (D.expenses||[]).filter(e=>keys.has(localDateKey(e.date)));
  const gastos = lancGastos.reduce((s,e)=>s+e.amount,0);
  return { receitas, gastos, liquido: receitas-gastos, lancamentos: { receitas: lancReceitas, gastos: lancGastos } };
}
function sumMonthIncome(off=0) { return monthAggregate(off).receitas; }
function sumMonthExpenses(off=0) { return monthAggregate(off).gastos; }

// ══════════════════════════════════════════════════════════════════════════
// FONTE ÚNICA — RESUMO SEMÂNTICO DE UM PERÍODO (Fase C: caixa × consumo).
// Decompõe o CAIXA (todas as entradas/saídas reais) por natureza, via _movementNature.
// NÃO altera o total de caixa: totalCashIn === receitas e totalCashOut === gastos do
// monthAggregate; cashResult === líquido. Reserva fica FORA (estrutura à parte).
//   Entradas: operationalIncome (plataforma) + extraordinaryIncome (asset-sale)
//   Saídas:   consumo + assetAcquisition + debtPayments
// consumoByCategory soma SÓ consumo (base de "gastos por categoria" e orçamento).
// `keys` é um Set de chaves de dia LOCAL (ex.: new Set(monthDates(off))).
// ══════════════════════════════════════════════════════════════════════════
function _periodMovementSummary(keys) {
  let operationalIncome = 0, extraordinaryIncome = 0;
  keys.forEach(d => {
    D.platforms.forEach(p => {
      const items = (D.incomeItems||[]).filter(it => localDateKey(it.date)===d && it.platformId===p.id);
      if (items.length) items.filter(it=>it.status==='paid').forEach(it=>{ operationalIncome += it.amount||0; });
      else operationalIncome += getDayIncome(d)[p.id]||0;
    });
    (D.incomeItems||[]).filter(it => it.status==='paid' && !it.platformId && it.meta && it.meta.source==='asset-sale' && localDateKey(it.date)===d)
      .forEach(it=>{ extraordinaryIncome += it.amount||0; });
  });
  let consumo = 0, assetAcquisition = 0, debtPayments = 0;
  const consumoByCategory = {};
  (D.expenses||[]).forEach(e => {
    if (!keys.has(localDateKey(e.date))) return;
    const nat = _movementNature(e), amt = e.amount || 0;
    if (nat === 'asset-acquisition') assetAcquisition += amt;
    else if (nat === 'debt-payment') debtPayments += amt;
    else { consumo += amt; const c = (e.category!=null && String(e.category).trim()) ? String(e.category) : 'Sem categoria'; consumoByCategory[c] = (consumoByCategory[c]||0) + amt; }
  });
  const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100; // arredonda a 2 casas (valores já em reais)
  const totalCashIn = r2(operationalIncome + extraordinaryIncome);
  const totalCashOut = r2(consumo + assetAcquisition + debtPayments);
  return {
    operationalIncome: r2(operationalIncome), extraordinaryIncome: r2(extraordinaryIncome), totalCashIn,
    consumo: r2(consumo), assetAcquisition: r2(assetAcquisition), debtPayments: r2(debtPayments), totalCashOut,
    cashResult: r2(totalCashIn - totalCashOut), consumoByCategory,
  };
}
function _monthMovementSummary(off=0) { return _periodMovementSummary(new Set(monthDates(off))); }
function _weekMovementSummary(off=0) { return _periodMovementSummary(new Set(weekDates(off))); }
// Razão de consumo: consumo / receita OPERACIONAL (asset-sale nunca no denominador).
// Retorna null quando não há receita operacional (evita percentual absurdo/infinito).
function _consumptionRatio(sum) { return sum.operationalIncome > 0 ? (sum.consumo / sum.operationalIncome) : null; }
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

  // "expenses" aqui alimenta comparativo/insight de CONSUMO (Fase C): só consumo.
  // Aquisição de patrimônio e pagamento de dívida são caixa, não consumo → fora daqui.
  var mExpsAll = D.expenses.filter(function(e) { return datesSet.has(e.date); });
  var mExps = mExpsAll.filter(function(e) { return _movementNature(e) === 'consumo'; });
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
// Lista de barras — PROTAGONISTA. Cada categoria: cor + nome + valor, barra
// proporcional ao MAIOR gasto (trilho + gradiente + cantos), % do mês e um
// painel de detalhe que expande ao selecionar. Sem nova agregação.
function renderCatRows(elId, items) {
  var el = document.getElementById(elId);
  if (!el) return;
  _mesCatItems = items;
  var total = items.reduce(function(s, it) { return s + it.value; }, 0);
  _mesCatTotal = total;
  var maxVal = items.length ? items[0].value : 0; // itens vêm ordenados desc
  if (!total) { el.innerHTML = '<div class="empty-state">Nenhum gasto do dia a dia neste mês</div>'; return; }
  el.innerHTML = items.map(function(it, i) {
    var pct = Math.round(it.value / total * 100);
    var w = maxVal ? Math.max(3, Math.round(it.value / maxVal * 100)) : 0;
    return '<div class="mcat" data-idx="' + i + '" style="--c:' + it.color + '">' +
      '<button class="mcat-row" onclick="_selectCat(' + i + ')" aria-label="' + escHtml(it.label) + '">' +
        '<span class="mcat-line">' +
          '<span class="mcat-dot"></span>' +
          '<span class="mcat-name">' + escHtml(it.label) + '</span>' +
          '<span class="mcat-val">' + R(it.value) + '</span>' +
        '</span>' +
        '<span class="mcat-track"><span class="mcat-fill" style="width:' + w + '%"></span></span>' +
        '<span class="mcat-pct">' + pct + '% do mês</span>' +
      '</button>' +
      '<div class="mcat-detail" id="mcat-detail-' + i + '"></div>' +
    '</div>';
  }).join('');
}

// Centro do donut — só o essencial (spec): padrão TOTAL GASTO/valor/nº categorias;
// selecionado nome/valor/percentual. Sem nº de lançamentos nem frases.
function _mesUpdateCenter(animate) {
  var topEl = document.getElementById('cat-donut-top');
  var valEl = document.getElementById('cat-donut-total');
  var lblEl = document.getElementById('cat-donut-lbl');
  var center = document.getElementById('cat-donut-center');
  if (!valEl) return;
  if (_mesCatSel == null || !_mesCatItems[_mesCatSel]) {
    // Rótulo padrão é a frase humana "Gastos do dia a dia": pode ocupar 2 linhas no
    // miolo do donut (bdc-top--wrap) para não truncar, sem reduzir a tipografia.
    if (topEl) { topEl.textContent = 'Gastos do dia a dia'; topEl.classList.add('bdc-top--wrap'); }
    if (_mesCatTotal > 0) animCount(valEl, _mesCatTotal, 450); else valEl.textContent = '—';
    if (lblEl) lblEl.textContent = _mesCatItems.length ? (_mesCatItems.length + (_mesCatItems.length === 1 ? ' categoria' : ' categorias')) : '';
    if (center) center.classList.remove('bdc-sel');
  } else {
    var it = _mesCatItems[_mesCatSel];
    var pct = _mesCatTotal ? Math.round(it.value / _mesCatTotal * 100) : 0;
    // Categoria selecionada: nome curto numa linha (mantém nowrap/ellipsis padrão).
    if (topEl) { topEl.textContent = it.label; topEl.classList.remove('bdc-top--wrap'); }
    valEl.textContent = R(it.value);
    if (lblEl) lblEl.textContent = pct + '%';
    if (center) { center.classList.add('bdc-sel'); center.style.setProperty('--cat-color', it.color); }
  }
  if (animate && center) { center.classList.remove('bdc-swap'); void center.offsetWidth; center.classList.add('bdc-swap'); }
}

// Painel de detalhe da categoria (nome, valor, % do mês, nº de lançamentos,
// maior lançamento e "Ver lançamentos"). Só leitura dos dados já carregados.
// Painel simplificado — não repete o que já está na linha (nome/valor/%).
// Mostra apenas o que agrega: maior gasto e último lançamento + CTA discreto.
function _catDetailHTML(it, i) {
  var rows = '';
  if (it.top) {
    rows += '<div class="mcat-d-row"><span class="mcat-d-lbl">Maior gasto</span>' +
      '<span class="mcat-d-desc">' + escHtml(it.top.desc) + '</span>' +
      '<span class="mcat-d-amt">' + R(it.top.amount) + '</span></div>';
  }
  rows += '<div class="mcat-d-row"><span class="mcat-d-lbl">Quantidade de lançamentos</span>' +
    '<span class="mcat-d-desc"></span>' +
    '<span class="mcat-d-amt">' + it.count + '</span></div>';
  if (it.last) {
    rows += '<div class="mcat-d-row"><span class="mcat-d-lbl">Último lançamento</span>' +
      '<span class="mcat-d-desc">' + escHtml(it.last.desc) + '</span>' +
      '<span class="mcat-d-amt mcat-d-date">' + fmtShort(it.last.date) + '</span></div>';
  }
  return '<div class="mcat-detail-in" style="--c:' + it.color + '">' +
    rows +
    '<button class="mcat-d-cta" onclick="_verLancamentos(' + i + ')">Ver lançamentos <span aria-hidden="true">→</span></button>' +
  '</div>';
}

// Seleciona/deseleciona: destaca barra, linha, %, donut; esmaece as demais;
// expande o painel de detalhe abaixo da categoria selecionada.
function _selectCat(i) {
  _mesCatSel = (_mesCatSel === i) ? null : i;
  _mesUpdateCenter(true);
  document.querySelectorAll('#cat-legend .mcat').forEach(function(row) {
    var idx = parseInt(row.getAttribute('data-idx'), 10);
    var on = _mesCatSel === idx;
    row.classList.toggle('mcat-active', on);
    row.classList.toggle('mcat-dim', _mesCatSel != null && !on);
    var det = row.querySelector('.mcat-detail');
    if (det) {
      if (on && _mesCatItems[idx]) { det.innerHTML = _catDetailHTML(_mesCatItems[idx], idx); det.classList.add('open'); }
      else { det.classList.remove('open'); det.innerHTML = ''; }
    }
  });
  // realce nas fatias do donut (mantém interação/animação atuais)
  document.querySelectorAll('#cat-donut .cat-slice').forEach(function(c) {
    var raw = c.getAttribute('data-idx');
    var idx = raw === '' ? null : parseInt(raw, 10);
    var on = _mesCatSel != null && idx === _mesCatSel;
    var dim = _mesCatSel != null && idx !== _mesCatSel;
    c.style.opacity = dim ? '0.65' : '1'; // demais fatias legíveis (~65%), foco na ativa
    c.style.strokeWidth = on ? '26' : '22';
  });
}

// "Ver lançamentos" → abre a Pesquisa já filtrada pela categoria e pelo mês
// atualmente aberto (usa o estado existente da Pesquisa; sem filtros novos).
function _verLancamentos(i) {
  var it = _mesCatItems[i];
  if (!it) return;
  _srchState.q = it.label;
  _srchState.type = 'exp';
  if (monthOffset === 0) {
    _srchState.period = 'month';
    _srchState.from = ''; _srchState.to = '';
  } else {
    var d = new Date(); d.setMonth(d.getMonth() + monthOffset, 1);
    var y = d.getFullYear(), m = d.getMonth(), last = new Date(y, m + 1, 0).getDate();
    var mm = String(m + 1).padStart(2, '0');
    _srchState.period = 'custom';
    _srchState.from = y + '-' + mm + '-01';
    _srchState.to = y + '-' + mm + '-' + String(last).padStart(2, '0');
  }
  switchTab('pesquisa', 'mes');
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

  _populateBemSel('exp-bem-sel'); // "Relacionado a" (bens ativos), independente da categoria

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
  const vehs = (D.vehicles || []).filter(v => v.status !== 'arquivado' && v.status !== 'vendido');
  sel.innerHTML = '<option value="">— Veículo (opcional) —</option>' + vehs.map(v => `<option value="${v.id}">${escHtml(v.name)}</option>`).join('');
}

function _onExpCatChange() {
  const vehs = (D.vehicles || []).filter(v => v.status !== 'arquivado' && v.status !== 'vendido');
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
  const vehs = (D.vehicles || []).filter(v => v.status !== 'arquivado' && v.status !== 'vendido');
  sel.innerHTML = '<option value="">— Nenhum —</option>' + vehs.map(v => `<option value="${v.id}">${escHtml(v.name)}</option>`).join('');
}

function _onPendCatChange() {
  const cat   = document.getElementById('pend-cat-sel')?.value || '';
  const vehs  = (D.vehicles || []).filter(v => v.status !== 'arquivado' && v.status !== 'vendido');
  const vehRow = document.getElementById('pend-veh-row');
  if (!vehRow) return;
  if (vehs.length === 0 || cat !== 'carro') {
    vehRow.style.display = 'none';
  } else {
    _populatePendVehSel();
    vehRow.style.display = '';
  }
}

// ══════════════════════════════════════════════════════════════════════════
// VÍNCULO DESPESA ⇄ PATRIMÔNIO (canônico; espelha D.debts: vehicleId/patrimonioId)
// A categoria responde "com o que gastei"; o vínculo responde "com qual bem gastei".
// Conceitos independentes. Sem nova entidade — o vínculo mora na própria despesa.
// ══════════════════════════════════════════════════════════════════════════
function _expBemId(e) { return (e && (e.vehicleId || e.patrimonioId)) || null; }
// Id do bem para consulta/filtro (canônico OU índice legado veh/pat.linkedExpenses).
function _expBemLegacyId(e) {
  if (!e) return null;
  if (e.vehicleId) return e.vehicleId;
  if (e.patrimonioId) return e.patrimonioId;
  const v = (D.vehicles || []).find(x => (x.linkedExpenses || []).includes(e.id)); if (v) return v.id;
  const p = (D.patrimonios || []).find(x => (x.linkedExpenses || []).includes(e.id)); if (p) return p.id;
  return null;
}
function _expBemSelValue(e) { if (!e) return ''; if (e.vehicleId) return 'veh:' + e.vehicleId; if (e.patrimonioId) return 'pat:' + e.patrimonioId; return ''; }
// <option>s de "Relacionado a": bens ATIVOS (não encerrados). Preserva o vínculo atual
// mesmo se o bem estiver encerrado (para não desvincular histórico ao editar).
function _bemVinculoOptions(currentVal) {
  let html = `<option value="">— Nenhum patrimônio —</option>`;
  (D.vehicles || []).filter(v => _patLifecycleOf(v.id) === 'ativo').forEach(v => {
    const val = 'veh:' + v.id;
    html += `<option value="${val}"${currentVal === val ? ' selected' : ''}>${escHtml(v.name || 'Veículo')} · veículo</option>`;
  });
  (D.patrimonios || []).filter(p => p.tipo !== 'veiculo' && (p.status || 'ativo') === 'ativo').forEach(p => {
    const val = 'pat:' + p.id; const t = { imovel: 'imóvel', outro: 'outro bem' }[p.tipo] || 'bem';
    html += `<option value="${val}"${currentVal === val ? ' selected' : ''}>${escHtml(p.nome || 'Bem')} · ${t}</option>`;
  });
  if (currentVal && !html.includes(`value="${currentVal}"`)) {
    const id = currentVal.slice(4);
    html += `<option value="${currentVal}" selected>${escHtml(_patNomeOf(id) || 'Bem')} · encerrado</option>`;
  }
  return html;
}
function _populateBemSel(selId, currentVal) { const s = document.getElementById(selId); if (s) s.innerHTML = _bemVinculoOptions(currentVal || ''); }
// Aplica/troca/remove o vínculo canônico numa despesa. Campos mutuamente exclusivos
// (uma despesa nunca fica ligada a dois bens). Mantém veh.linkedExpenses (índice
// legado). NÃO permite NOVO vínculo com bem encerrado. Retorna ids de bens afetados.
function _expSetBemLink(expObj, selValue) {
  const prev = _expBemSelValue(expObj);
  if (selValue === prev) return []; // sem mudança → preserva (inclui links legados/encerrados)
  const affected = new Set();
  if (expObj.vehicleId) { affected.add(expObj.vehicleId); const pv = (D.vehicles || []).find(v => v.id === expObj.vehicleId); if (pv) pv.linkedExpenses = (pv.linkedExpenses || []).filter(x => x !== expObj.id); }
  if (expObj.patrimonioId) affected.add(expObj.patrimonioId);
  delete expObj.vehicleId; delete expObj.patrimonioId;
  if (selValue) {
    const kind = selValue.slice(0, 3), id = selValue.slice(4);
    if (_patLifecycleOf(id) === 'ativo') {
      if (kind === 'veh') { expObj.vehicleId = id; const v = (D.vehicles || []).find(x => x.id === id); if (v) { if (!v.linkedExpenses) v.linkedExpenses = []; if (!v.linkedExpenses.includes(expObj.id)) v.linkedExpenses.push(expObj.id); } affected.add(id); }
      else if (kind === 'pat') { expObj.patrimonioId = id; affected.add(id); }
    }
  }
  return [...affected];
}
// Despesas vinculadas a um bem (canônico + índice legado).
function _expensesDoBem(id) {
  const isVeh = _patIsVeiculo(id);
  const rec = _patOwnerRec(id);
  const patKey = rec ? rec.id : id;
  const legacy = isVeh ? new Set(((D.vehicles || []).find(v => v.id === id) || {}).linkedExpenses || []) : new Set((rec && rec.linkedExpenses) || []);
  return (D.expenses || []).filter(e => (isVeh ? (e.vehicleId === id) : (e.patrimonioId === patKey)) || legacy.has(e.id));
}
// 'YYYY-MM' do mês corrente (base local).
function _ymNow() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
// Custo do veículo no mês, separado por natureza (fonte única _movementNature),
// sem dupla contagem por expenseId:
//   uso       → gasto do dia a dia vinculado ao veículo (consumo);
//   fin       → pagamento de dívida do próprio veículo (debt-payment);
//   aquisicao → compra/entrada de patrimônio vinculada ao veículo (asset-acquisition).
// Não considera projeções nem saldo devedor — só gasto realizado no mês.
function _vehCustoMes(vehId, ym) {
  ym = ym || _ymNow();
  let uso = 0, fin = 0, aquisicao = 0; const seen = new Set();
  const v = (D.vehicles || []).find(x => x.id === vehId);
  const isLinked = (e) => e.vehicleId === vehId || (v && (v.linkedExpenses || []).includes(e.id));
  (D.expenses || []).forEach(e => {
    if (seen.has(e.id) || String(e.date || '').slice(0, 7) !== ym) return;
    const nat = _movementNature(e);
    if (nat === 'debt-payment') {
      // Financiamento só entra se a dívida for do próprio veículo.
      const d = (e.meta && e.meta.debtId) ? getDebt(e.meta.debtId) : null;
      if (d && d.vehicleId === vehId) { fin += e.amount || 0; seen.add(e.id); }
      return; // pagamento de dívida nunca conta como uso/manutenção nem aquisição
    }
    if (!isLinked(e)) return;
    if (nat === 'asset-acquisition') { aquisicao += e.amount || 0; seen.add(e.id); }
    else { uso += e.amount || 0; seen.add(e.id); }
  });
  return { uso, fin, aquisicao, total: uso + fin + aquisicao };
}

// ══════════════════════════════════════════════════════════════════════════
// MOTOR SEMÂNTICO (Fase A) — natureza financeira de uma movimentação.
// Fonte ÚNICA para "o que esta movimentação representa?". Função PURA e DERIVADA:
// não altera dados, não altera agregações e NÃO modifica o objeto recebido.
// Nesta fase o resolvedor apenas EXISTE — nenhuma tela/soma o consome ainda.
//
// Precedência (verdade estrutural do sistema tem prioridade sobre override manual):
//   1. Origem estrutural/canônica protegida:
//        reservaHistory (type dep/ret)     → 'transfer'
//        income  meta.source='asset-sale'  → 'income-extra'
//        expense meta.source='debt'        → 'debt-payment'
//        expense meta.source='fixed-payment' → 'consumo'
//   2. Override manual (meta.nature) SOMENTE em despesa sem origem protegida.
//   3. Receita com platformId              → 'income-operational'
//   4. Defaults: despesa → 'consumo'; receita → 'income-operational'.
// meta.nature NUNCA transforma pagamento de dívida em consumo, nem asset-sale em
// receita operacional. Vínculo vehicleId/patrimonioId sozinho NÃO define natureza.
// ══════════════════════════════════════════════════════════════════════════
var MOVEMENT_NATURES = Object.freeze([
  'consumo', 'asset-acquisition', 'debt-payment', 'transfer',
  'income-operational', 'income-extra',
]);
function _isValidNature(n) { return typeof n === 'string' && MOVEMENT_NATURES.indexOf(n) !== -1; }
// Naturezas aceitáveis como OVERRIDE manual de uma despesa (saída de caixa).
// income-*/transfer não se aplicam a despesa manual → inválidas (fallback 'consumo').
var _EXPENSE_NATURE_OVERRIDES = Object.freeze(['consumo', 'asset-acquisition', 'debt-payment']);
function _isValidExpenseNatureOverride(n) { return _EXPENSE_NATURE_OVERRIDES.indexOf(n) !== -1; }

function _movementNature(item) {
  if (!item || typeof item !== 'object') return 'consumo';
  // 1) Reserva (estrutura própria): sempre transferência.
  if (item.type === 'dep' || item.type === 'ret') return 'transfer';
  const meta = (item.meta && typeof item.meta === 'object') ? item.meta : null;
  const source = meta ? meta.source : null;
  // Discriminação receita × despesa: itens de receita carregam sempre a chave
  // platformId (mesmo null, no caso de venda de patrimônio).
  const isIncome = Object.prototype.hasOwnProperty.call(item, 'platformId') || source === 'asset-sale';
  if (isIncome) {
    // 1) Origem estrutural protegida (override manual não altera).
    if (source === 'asset-sale') return 'income-extra';
    // 3/4) Receita com plataforma / receita normal.
    return 'income-operational';
  }
  // Despesa:
  // 1) Origem estrutural/canônica protegida — precede qualquer override manual.
  if (source === 'debt') return 'debt-payment';
  if (source === 'fixed-payment') return 'consumo';
  // Pendência é origem canônica como as duas acima: enquanto o vínculo existir,
  // a despesa é consumo. `source` diz de onde veio; nenhum override manual pode
  // transformá-la em aquisição de patrimônio ou pagamento de dívida.
  if (source === 'pendencia') return 'consumo';
  // 2) Override manual explícito, só quando não há origem estrutural protegida.
  if (meta && _isValidExpenseNatureOverride(meta.nature)) return meta.nature;
  // 4) Default de despesa manual.
  return 'consumo';
}

// ── Rótulo humano do TIPO de uma movimentação (só apresentação) ────────────
// Recentes e Pesquisa usam este helper para não chamar toda saída de "Gasto"
// enquanto o resto do app já separa consumo de dívida e de aquisição. Deriva de
// `_movementNature` e da metadata estrutural que já existe — não é uma segunda
// classificação, não decide nada e não entra em cálculo nenhum.
//
// `fixed-payment` é consumo para o motor (e continua sendo), mas na lista vale
// dizer que veio de um gasto fixo: é a origem, não a natureza, que muda.
const MOVIMENTO_LBL = Object.freeze({
  'debt-payment':      'Pagamento de dívida',
  'asset-acquisition': 'Aquisição de patrimônio',
  'income-extra':      'Venda de patrimônio',
  'income-operational':'Receita',
  'transfer':          'Reserva',
  'consumo':           'Gasto',
});
function _movementTypeLabel(item) {
  if (!item || typeof item !== 'object') return 'Gasto';
  const meta = (item.meta && typeof item.meta === 'object') ? item.meta : null;
  if (meta && meta.source === 'fixed-payment') return 'Gasto fixo';
  if (meta && meta.source === 'pendencia') return 'Gasto de pendência';
  return MOVIMENTO_LBL[_movementNature(item)] || 'Gasto';
}

function addExpense() {
  const date=selDate(), cat=document.getElementById('exp-cat').value;
  const val=parseFloat(document.getElementById('exp-val').value);
  const desc=document.getElementById('exp-desc').value.trim();
  if(!val||val<=0){gdToast('Informe um valor válido.', { type: 'error' });return;}
  const bemSel = document.getElementById('exp-bem-sel');
  const bemVal = bemSel ? (bemSel.value || '') : '';
  const expObj = {id:uid(),date,category:cat,amount:val,description:desc};
  D.expenses.push(expObj);
  if (bemVal) _expSetBemLink(expObj, bemVal); // vínculo canônico (opcional, independente da categoria)
  document.getElementById('exp-val').value='';
  document.getElementById('exp-desc').value='';
  if (bemSel) bemSel.value='';
  haptic(10); save(); refreshAfterDayEdit();
  notifyRegistered(val, desc || cat, cat);
}

// ── PENDÊNCIA ⇄ DESPESA: reconciliador único ─────────────────────────────
// Mesmo padrão de dívidas e fixos: a despesa é a verdade financeira, e o
// vínculo é um marcador que só pode existir enquanto a despesa existir. Se a
// despesa some, a conclusão que dependia dela deixa de ter lastro — e a
// pendência volta a ser um compromisso em aberto.
//
// O que este reconciliador NUNCA faz: apagar dinheiro. Marcador órfão do lado
// da pendência é limpo; despesa órfã (apontando para pendência inexistente)
// é preservada intacta — vira um gasto comum, que é o que ela sempre foi para
// o caixa. Excluir pendência com despesa viva é bloqueado antes, na UI.
//
// Idempotente: rodar duas vezes não produz efeito novo.
function _pendDespesaVinculada(p) {
  if (!p || !p.despesaId) return null;
  return (D.expenses || []).find(e => e.id === p.despesaId) || null;
}
function reconcilePendencias() {
  if (!Array.isArray(D.pendencias)) return false;
  let mudou = false;
  D.pendencias.forEach(p => {
    if (!p || !p.despesaId) return;
    if (_pendDespesaVinculada(p)) return;          // despesa viva: nada a fazer
    delete p.despesaId;                            // marcador órfão
    if (p.status === 'concluida') {                // a conclusão perdeu o lastro
      p.status = 'aberta';
      delete p.completedAt;
    }
    mudou = true;
  });
  return mudou;
}

function deleteExpense(id) {
  // Remove o id do índice legado em qualquer veículo (o vínculo canônico some com a despesa).
  (D.vehicles||[]).forEach(v => { if (v.linkedExpenses) v.linkedExpenses = v.linkedExpenses.filter(eid => eid !== id); });
  D.expenses=D.expenses.filter(e=>e.id!==id);
  // Se era uma despesa de baixa, remove o marcador órfão (o fixo volta a pendente/vencido).
  reconcileFixedPayments();
  // Dívidas (financiamento/parcelamento/…): remove o marcador do pagamento, revertendo
  // a amortização (saldo/progresso/parcela recalculados por derivação). Sem órfãos.
  reconcileDebtPayments();
  // Pendências: se a despesa era o lastro de uma conclusão, a pendência reabre.
  reconcilePendencias();
  save();
  refreshAfterDayEdit();
  refreshHomeFixosAlert();
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

  // "Gastos por categoria" = SÓ consumo (Fase C): aquisição de patrimônio e pagamento
  // de dívida são saída de caixa, mas NÃO consumo — não entram nas barras/donut.
  const mExps=agg.lancamentos.gastos.filter(e=>_movementNature(e)==='consumo');
  const catMap={}, catCount={}, catTop={}, catLast={};
  // Agregação por categoria REAL (string exata). Categoria vazia/ausente recebe
  // um rótulo claro ("Sem categoria") em vez de virar um "Outros" indistinguível.
  // Não unimos categorias diferentes por semelhança de nome/acento/caixa.
  // catCount/catTop/catLast (nº, maior e último lançamento) são apenas leitura
  // dos gastos JÁ carregados — não recalculam agregação nem tocam monthAggregate.
  mExps.forEach(e=>{
    const key = (e.category!=null && String(e.category).trim()) ? String(e.category) : 'Sem categoria';
    catMap[key]=(catMap[key]||0)+e.amount;
    catCount[key]=(catCount[key]||0)+1;
    if(!catTop[key] || e.amount>catTop[key].amount) catTop[key]={ desc:(e.description||e.category||''), amount:e.amount };
    const dk=localDateKey(e.date);
    if(!catLast[key] || dk>catLast[key].date) catLast[key]={ desc:(e.description||e.category||''), date:dk };
  });
  const catItems=Object.entries(catMap).sort((a,b)=>b[1]-a[1]).map(([label,value],i)=>({label,value,count:catCount[label]||0,top:catTop[label]||null,last:catLast[label]||null,color:PALETTE[i%PALETTE.length]}));
  renderCatRows('cat-legend', catItems);                        // lista de barras: protagonista
  renderBigDonut('cat-donut','cat-legend','cat-donut-total',catItems); // donut: resumo visual

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
  renderMesPrevisto(monthOffset);
  renderTrendsChart();
  renderCatBudgets();
  renderComparativo(monthOffset);
  renderInsights(monthOffset);
}
function _monthYM(off) { const d = new Date(); d.setMonth(d.getMonth() + off, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
// Previsto do mês (dívidas) — bloco SEPARADO, rotulado; NÃO entra em receitas/gastos/
// resultado líquido realizado. Apenas projeção derivada de D.debts.
function renderMesPrevisto(off) {
  const el = document.getElementById('mes-previsto'); if (!el) return;
  const ym = _monthYM(off);
  const { total, itens } = _debtPrevistoDoMes(ym);
  const atraso = _debtAtrasoAnteriorAoMes(ym);
  // O cartão só some quando não há NEM compromisso do mês NEM atraso anterior:
  // um mês sem parcelas próprias ainda precisa avisar sobre o que ficou para trás.
  if (!itens.length && !atraso.quantidade) { el.innerHTML = ''; return; }
  // Contagem de atraso DENTRO do mês exibido (parcela já vencida que pertence a
  // este mês). É diferente do atraso anterior, e as duas nunca se sobrepõem.
  const atrasadosNoMes = itens.filter(v => v.atrasada).length;
  const rows = itens.slice().sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate))).map(_vencRowHtml).join('');
  const sub = itens.length
    ? `${itens.length} compromisso(s)${atrasadosNoMes ? ` · ${atrasadosNoMes} em atraso` : ''} — não entra no resultado realizado`
    : 'Nenhum compromisso vence neste mês';
  const plural = atraso.quantidade === 1 ? 'parcela' : 'parcelas';
  const faixaAtraso = atraso.quantidade ? `
      <button class="mes-prev-atraso" onclick="_irParaDividasEmAtraso()"
        aria-label="${escHtml(`${atraso.quantidade} ${plural} em atraso de meses anteriores, total ${R(atraso.total)}, mais antiga em ${_fmtDataBR(atraso.maisAntiga)}. Abrir dívidas em atraso.`)}">
        <span class="mes-prev-atraso-ico" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        </span>
        <span class="mes-prev-atraso-main">
          <span class="mes-prev-atraso-top">${atraso.quantidade} ${plural} em atraso · ${R(atraso.total)}</span>
          <span class="mes-prev-atraso-sub">De meses anteriores · mais antiga ${_fmtDataBR(atraso.maisAntiga)}</span>
        </span>
        <span class="mes-prev-atraso-chev" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </span>
      </button>` : '';
  el.innerHTML = `
    <div class="card av-card mes-prev-card">
      <div class="mes-prev-hd">
        <div>
          <div class="mes-prev-lbl">A vencer no mês <span class="mes-prev-tag">Previsto</span></div>
          <div class="mes-prev-sub">${sub}</div>
        </div>
        <div class="mes-prev-total">${R(total)}</div>
      </div>
      ${faixaAtraso}
      ${rows ? `<div class="home-venc-list mes-prev-list">${rows}</div>` : ''}
    </div>`;
}
// Atalho da faixa de atraso: abre a Central de Dívidas já no filtro existente.
function _irParaDividasEmAtraso() {
  switchTab('dividas', 'mes');
  setDividasFiltro('atraso');
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

  // Ritmo/renda típica usam receita OPERACIONAL (asset-sale não distorce o "destaque").
  const sum = _monthMovementSummary(off);
  const prevInc = _monthMovementSummary(off-1).operationalIncome;
  const dates = monthDates(off);
  const now = new Date(); now.setHours(0,0,0,0);
  const isPast = off < 0;

  const d2 = new Date(); d2.setMonth(d2.getMonth()+off,1);
  const daysInMonth = new Date(d2.getFullYear(),d2.getMonth()+1,0).getDate();
  const dayOfMonth = Math.min(now.getDate(), daysInMonth);
  const pctPassed = Math.round((dayOfMonth/daysInMonth)*100);
  const daysWithData = dates.filter(dt => parseDate(dt)<=now && (sumDayIncome(dt)>0||getDayExpenses(dt).length>0)).length;
  const hasEnoughData = isPast || daysWithData >= 7 || pctPassed >= 25;

  // "Maior despesa" e percentuais de gasto = SÓ consumo (não a aquisição/dívida).
  const catMap = sum.consumoByCategory;
  const topCat = Object.entries(catMap).sort((a,b)=>b[1]-a[1])[0];
  const topCatPct = topCat && sum.consumo>0 ? Math.round((topCat[1]/sum.consumo)*100) : 0;

  // Disciplina = quanto da receita operacional NÃO foi consumida.
  const savingsRate = sum.operationalIncome>0 ? Math.round(((sum.operationalIncome-sum.consumo)/sum.operationalIncome)*100) : 0;
  const incChange = prevInc>0 ? Math.round(((sum.operationalIncome-prevInc)/prevInc)*100) : null;
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
      parts.push(`<b>${topCat[0]}</b> foi o maior gasto do dia a dia: ${topCatPct}% do consumo.`);
    if (liq<0)
      parts.push(`Fique de olho em <b>${topCat?topCat[0]:'seus maiores gastos'}</b> no próximo mês.`);
    else if (savingsRate<10)
      parts.push(`Que tal separar pelo menos 10% da receita pra reserva no próximo mês?`);
  } else {
    if (liq<0)
      parts.push(`Atenção: gastos já passaram a receita em <b>${R(Math.abs(liq))}</b>. Ainda dá tempo de equilibrar.`);
    else if (incChange!==null && sum.operationalIncome>=(prevInc*(pctPassed/100)*1.15))
      parts.push(`Ritmo acima do esperado — mais forte que no mesmo ponto do mês passado.`);
    else
      parts.push(`<b>${pctPassed}%</b> do mês passou. Resultado atual: <b>${R(liq)}</b>.`);
    if (topCat && topCatPct>=40)
      parts.push(`<b>${topCat[0]}</b> está pesando bastante: ${topCatPct}% do consumo do mês.`);
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
    if (_movementNature(e) !== 'consumo') return; // comparativo de categoria = só consumo
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
// ══════════════════════════════════════════
// GASTOS FIXOS — ciclo mensal e baixa (lançamento real)
// O cadastro recorrente (D.fixedExpenses) nunca é alterado pela baixa.
// O estado de pagamento é MENSAL e derivado de D.fixedPayments:
//   { fixedId, cycle:'YYYY-MM', expenseId, paidDate:'YYYY-MM-DD' }
// ══════════════════════════════════════════
function fxCycleOf(dateKey) { const m = String(dateKey||'').match(/^(\d{4})-(\d{2})/); return m ? m[1]+'-'+m[2] : ''; }
function fxCurrentCycle() { const d = new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); }
function fxTodayKey() { return dateStr(new Date()); }
// Data de vencimento válida no ciclo: 29/30/31 em mês curto → último dia do mês. Datas locais.
function fxDueDateForCycle(dueDay, cycle) {
  const m = String(cycle||'').match(/^(\d{4})-(\d{2})$/); if (!m || !dueDay) return null;
  const y = +m[1], mo = +m[2] - 1;
  const last = new Date(y, mo + 1, 0).getDate();
  const day = Math.min(Math.max(1, dueDay), last);
  return `${m[1]}-${m[2]}-${String(day).padStart(2,'0')}`;
}
function fxPayment(fixedId, cycle) { return (D.fixedPayments||[]).find(p => p.fixedId===fixedId && p.cycle===cycle) || null; }
// Data a partir da qual a baixa passa a valer para um item: por item (since,
// gravado na criação) ou o marco global de adoção (D.fixedStart). Vencimentos
// anteriores a essa data são pré-existentes (histórico, não acionáveis).
function fxBaselineFor(f) { return (f && f.since) || D.fixedStart || ''; }
// Estado de um item num ciclo: 'paused' | 'paid' | 'preexisting' | 'overdue' | 'pending'
function fxState(f, cycle) {
  if (f.paused) return { status: 'paused' };
  const pay = fxPayment(f.id, cycle);
  if (pay) return { status: 'paid', paidDate: pay.paidDate, expenseId: pay.expenseId };
  const dueDate = fxDueDateForCycle(f.dueDay, cycle);
  const baseline = fxBaselineFor(f);
  // Vencimento anterior à adoção da função → histórico neutro (sem baixa/aviso).
  if (dueDate && baseline && dueDate < baseline) return { status: 'preexisting', dueDate };
  if (dueDate && cycle <= fxCurrentCycle() && fxTodayKey() > dueDate) return { status: 'overdue', dueDate };
  return { status: 'pending', dueDate };
}
// Itens ativos vencidos e sem baixa no ciclo atual (para o aviso da Home).
function fxOverdueCurrent() {
  const cycle = fxCurrentCycle();
  return (D.fixedExpenses||[]).filter(f => fxState(f, cycle).status === 'overdue');
}
// Reconciliação segura: remove APENAS marcadores de baixa órfãos —
// despesa vinculada inexistente (expenseId) ou cadastro inexistente (fixedId).
// Não cria despesas, não altera lançamentos legítimos, não migra nada.
// Retorna true se removeu algo (para persistir pelo fluxo normal).
function reconcileFixedPayments() {
  if (!Array.isArray(D.fixedPayments)) { D.fixedPayments = []; return false; }
  const expIds = new Set((D.expenses || []).map(e => e.id));
  const fixIds = new Set((D.fixedExpenses || []).map(f => f.id));
  const before = D.fixedPayments.length;
  D.fixedPayments = D.fixedPayments.filter(p => p && expIds.has(p.expenseId) && fixIds.has(p.fixedId));
  return D.fixedPayments.length !== before;
}

function renderFixos() {
  document.getElementById('fixed-total').textContent=R(D.fixedExpenses.filter(f=>!f.paused).reduce((s,f)=>s+f.amount,0));
  const list=document.getElementById('fixed-list');
  if (!D.fixedExpenses.length) { list.innerHTML='<div class="empty-state">Nenhum gasto fixo cadastrado</div>'; return; }
  const cycle = fxCurrentCycle();
  // Ordenação apenas visual: dia de vencimento crescente; empate por nome;
  // sem dia válido (1–31) vai para o fim. Dados persistidos intocados.
  const fixosOrdenados = [...D.fixedExpenses].sort((a, b) => {
    const ad = (Number.isFinite(a.dueDay) && a.dueDay >= 1 && a.dueDay <= 31) ? a.dueDay : 99;
    const bd = (Number.isFinite(b.dueDay) && b.dueDay >= 1 && b.dueDay <= 31) ? b.dueDay : 99;
    return ad - bd || (a.name || '').localeCompare(b.name || '', 'pt-BR', { sensitivity: 'base' });
  });
  list.innerHTML = fixosOrdenados.map(f => {
    const st = fxState(f, cycle);
    const paused = st.status === 'paused';
    // Chip de status (categoria à esquerda + estado do ciclo em pill colorido).
    let chip = '';
    if (paused) chip = '<span class="fixed-chip fixed-chip-paused">Pausado</span>';
    else if (st.status === 'paid') chip = `<span class="fixed-chip fixed-chip-done">Pago em ${fmtShort(st.paidDate)}</span>`;
    else if (st.status === 'overdue') chip = '<span class="fixed-chip fixed-chip-over">Vencido</span>';
    else if (st.status === 'preexisting' && f.dueDay) chip = `<span class="fixed-chip fixed-chip-neutral">Vence dia ${f.dueDay}</span>`;
    else if (f.dueDay) chip = `<span class="fixed-chip fixed-chip-due">Vence dia ${f.dueDay}</span>`;
    const itemCls = paused ? ' fixed-paused' : st.status === 'overdue' ? ' fixed-item-over' : st.status === 'paid' ? ' fixed-item-paid' : '';
    const dotCls = paused ? 'fixed-dot-paused' : st.status === 'overdue' ? 'fixed-dot-over' : st.status === 'paid' ? 'fixed-dot-done' : 'fixed-dot-due';
    const canBaixa = !paused && (st.status === 'pending' || st.status === 'overdue');
    const baixaRow = canBaixa
      ? `<div class="fixed-baixa-row"><button class="fixed-baixa-btn" onclick="darBaixaFixed('${f.id}')">Dar baixa</button></div>`
      : '';
    return `
      <div class="fixed-item${itemCls}">
        <div class="fixed-main">
          <span class="fixed-dot ${dotCls}" aria-hidden="true"></span>
          <div class="fixed-info">
            <div class="fixed-name">${f.name}</div>
            <div class="fixed-meta"><span class="fixed-cat">${f.category}</span>${chip}</div>
          </div>
          <div class="fixed-end">
            <span class="fixed-amt">${R(f.amount)}</span>
            <button class="fixed-kebab" onclick="openFixedMenu('${f.id}')" aria-label="Mais ações">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true" focusable="false"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>
            </button>
          </div>
        </div>
        ${baixaRow}
      </div>`;
  }).join('');
}

// ── Baixa mensal: cria uma despesa real e marca o ciclo como pago ──
var _baixaTarget = null;
function darBaixaFixed(id) {
  const f = (D.fixedExpenses || []).find(x => x.id === id);
  if (!f) return;
  // Impede baixa de item já pago no ciclo atual (proteção contra duplicidade).
  if (fxPayment(id, fxCurrentCycle())) { gdToast('Este gasto já teve baixa neste mês.', { type: 'info' }); return; }
  _baixaTarget = id;
  document.getElementById('baixa-name').textContent = f.name;
  document.getElementById('baixa-amt').textContent = R(f.amount);
  // Data padrão = dia local do clique (nunca a data de vencimento).
  document.getElementById('baixa-date').value = fxTodayKey();
  const btn = document.getElementById('baixa-confirm-btn');
  if (btn) btn.disabled = false;
  openOverlay('modal-baixa');
}
function confirmBaixa() {
  const id = _baixaTarget;
  if (!id) return;
  const f = (D.fixedExpenses || []).find(x => x.id === id);
  if (!f) { closeOverlay('modal-baixa'); return; }
  const btn = document.getElementById('baixa-confirm-btn');
  if (btn && btn.disabled) return; // impede duplo toque
  const dateInput = document.getElementById('baixa-date').value;
  const date = localDateKey(dateInput) || fxTodayKey();
  const cycle = fxCurrentCycle();
  // Revalida no momento da confirmação (evita duplicidade em duplo toque).
  if (fxPayment(id, cycle)) { closeOverlay('modal-baixa'); gdToast('Este gasto já teve baixa neste mês.', { type: 'info' }); renderFixos(); return; }
  if (btn) btn.disabled = true;
  const expId = uid();
  // Metadado imutável de origem: a despesa carrega permanentemente que veio de uma baixa
  // de gasto fixo (além do vínculo em fixedPayments). Apenas informativo; nada depende dele.
  D.expenses.push({ id: expId, date, category: f.category, amount: f.amount, description: f.name, meta: { source: 'fixed-payment', fixedId: id, cycle } });
  D.fixedPayments.push({ fixedId: id, cycle, expenseId: expId, paidDate: date });
  _baixaTarget = null;
  haptic(10); save();
  closeOverlay('modal-baixa');
  renderFixos();
  refreshHomeFixosAlert();
  refreshAfterDayEdit();
  gdToast('Baixa registrada. Lançamento criado em Despesas.', { type: 'success' });
}
// ── Desfazer baixa do mês: remove só o lançamento gerado e volta a pendente ──
function desfazerBaixaFixed(id) {
  const cycle = fxCurrentCycle();
  const pay = fxPayment(id, cycle);
  if (!pay) return;
  // Remove apenas a despesa vinculada por expenseId (nunca lançamentos manuais parecidos).
  if (pay.expenseId) D.expenses = D.expenses.filter(e => e.id !== pay.expenseId);
  D.fixedPayments = D.fixedPayments.filter(p => !(p.fixedId === id && p.cycle === cycle));
  haptic(10); save();
  renderFixos();
  refreshHomeFixosAlert();
  refreshAfterDayEdit();
  gdToast('Baixa desfeita.', { type: 'success' });
}
// ── Aviso compacto na Home: gastos fixos ativos vencidos e sem baixa no mês ──
function refreshHomeFixosAlert() {
  const el = document.getElementById('home-fixos-alert');
  if (!el) return;
  const overdue = fxOverdueCurrent();
  if (!overdue.length) { el.innerHTML = ''; return; }
  const total = overdue.reduce((s, f) => s + f.amount, 0);
  const n = overdue.length;
  el.innerHTML = `
    <button class="home-fixos-alert" onclick="switchTab('fixos','inicio')" aria-label="Ver gastos fixos vencidos">
      <span class="hfa-ico" aria-hidden="true">!</span>
      <span class="hfa-body">
        <span class="hfa-title">Gastos fixos vencidos</span>
        <span class="hfa-sub">${n} ${n === 1 ? 'pagamento pendente' : 'pagamentos pendentes'}</span>
        <span class="hfa-total">Total: ${R(total)}</span>
        <span class="hfa-cta" aria-hidden="true">Ver gastos fixos →</span>
      </span>
    </button>`;
}
// ── Kebab de ações secundárias (Editar / Excluir) ──
var _fixedMenuTarget = null;
function openFixedMenu(id) {
  _fixedMenuTarget = id;
  const f = (D.fixedExpenses || []).find(x => x.id === id);
  const t = document.getElementById('fmenu-title');
  if (t) t.textContent = f ? f.name : 'Gasto fixo';
  // "Desfazer baixa deste mês" só aparece se houver baixa no ciclo atual.
  const undo = document.getElementById('fmenu-undo');
  if (undo) undo.style.display = fxPayment(id, fxCurrentCycle()) ? '' : 'none';
  // Pausar/Reativar (ação secundária movida da linha para o menu).
  const pausedNow = !!(f && f.paused);
  const plbl = document.getElementById('fmenu-pause-lbl');
  if (plbl) plbl.textContent = pausedNow ? 'Reativar' : 'Pausar';
  const pico = document.getElementById('fmenu-pause-ico');
  if (pico) pico.innerHTML = pausedNow
    ? '<polygon points="6 4 20 12 6 20 6 4"/>'
    : '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>';
  openOverlay('fixed-menu-sheet');
}
function fixedMenuEdit() {
  closeOverlay('fixed-menu-sheet');
  if (_fixedMenuTarget) openFixedModal(_fixedMenuTarget);
}
function fixedMenuPause() {
  closeOverlay('fixed-menu-sheet');
  if (_fixedMenuTarget) toggleFixedPaused(_fixedMenuTarget);
}
function fixedMenuUndo() {
  closeOverlay('fixed-menu-sheet');
  const id = _fixedMenuTarget;
  if (!id) return;
  gdConfirm({
    title: 'Desfazer baixa deste mês',
    msg: 'Remove o lançamento criado por esta baixa e volta o gasto fixo para pendente neste mês. Não afeta outros meses nem lançamentos manuais.',
    confirmText: 'Desfazer baixa',
    variant: 'danger',
    onConfirm: () => desfazerBaixaFixed(id),
  });
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
  save(); renderFixos(); refreshHomeFixosAlert();
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
function deleteFixed(id) {
  D.fixedExpenses = D.fixedExpenses.filter(f => f.id !== id);
  // Remove só os marcadores de baixa do cadastro excluído; as despesas históricas permanecem.
  D.fixedPayments = (D.fixedPayments || []).filter(p => p.fixedId !== id);
  save(); renderFixos(); refreshHomeFixosAlert();
}
function saveFixed() {
  const id=document.getElementById('fixed-edit-id').value;
  const name=document.getElementById('fi-name').value.trim();
  const amount=parseFloat(document.getElementById('fi-amount').value)||0;
  const category=document.getElementById('fi-cat').value;
  const dueDay=parseInt(document.getElementById('fi-day').value)||null;
  if(!name||!amount){gdToast('Preencha nome e valor.', { type: 'error' });return;}
  if(id) { const idx=D.fixedExpenses.findIndex(f=>f.id===id); if(idx!==-1) D.fixedExpenses[idx]={...D.fixedExpenses[idx],name,amount,category,dueDay}; }
  // 'since' = data de criação: vencimentos anteriores a ela não geram baixa/aviso
  // (evita cobrar retroativamente um fixo recém-cadastrado cujo dia já passou).
  else D.fixedExpenses.push({id:uid(),name,amount,category,dueDay,since:dateStr(new Date())});
  save(); closeOverlay('modal-fixed'); renderFixos(); refreshHomeFixosAlert();
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
// DÍVIDAS — FONTE ÚNICA CANÔNICA (D.debts + D.debtPayments)
// ══════════════════════════════════════════
// Toda dívida (financiamento, parcelamento, empréstimo, pessoal, outro) é UM único
// registro em D.debts. Patrimônio, central de Dívidas, pagamentos e projeções
// consultam/editam o MESMO registro — não há cópias.
//
// Modelo:
//   debt = { id, tipo, titulo, credor, valorOriginal, amortizadoInicial,
//            parcelasTotal, valorParcela, periodicidade, dataInicio, juros,
//            categoria, valorBem, patrimonioId, vehicleId, status,
//            observacoes, criadoEm, atualizadoEm, _migradoDe }
//   debtPayment = { id, debtId, parcelNo|null, expenseId, valor, data, criadoEm }
//   despesa gerada: meta:{ source:'debt', debtId, parcelNo|null }
//
// Fórmula canônica (cálculos em CENTAVOS inteiros, sem ponto flutuante):
//   valorPago    = amortizadoInicial + Σ(pagamentos.valor)
//   saldoDevedor = max(0, valorOriginal − valorPago)              (nunca negativo)
//   progresso(%) = clamp[0,100]( valorPago / valorOriginal )       (por VALOR)
//   parcelasPagas: alocação por cobertura — parcela k está paga quando o valorPago
//                  cobre a soma nominal das parcelas 1..k (pagamento parcial NÃO
//                  conta a parcela até cobri-la integralmente).
// Impede dupla subtração: amortizadoInicial e pagamentos são somados uma única vez.
// ══════════════════════════════════════════
function _c(v) { return Math.round((Number(v) || 0) * 100); }   // reais → centavos (inteiro)
function _r(c) { return (Math.round(Number(c) || 0)) / 100; }   // centavos → reais

const DEBT_TIPOS = ['financiamento', 'parcelamento', 'emprestimo', 'pessoal', 'outro'];
const DEBT_STATUS_MANUAIS = ['pausada', 'cancelada']; // demais status são derivados

function _normDebt(raw) {
  const d = (raw && typeof raw === 'object') ? raw : {};
  const tipo = DEBT_TIPOS.includes(d.tipo) ? d.tipo : 'outro';
  const status = DEBT_STATUS_MANUAIS.includes(d.status) ? d.status : 'ativa';
  return {
    id: d.id || uid(),
    tipo,
    titulo: String(d.titulo || '').trim() || 'Dívida',
    credor: String(d.credor || '').trim(),
    valorOriginal: Math.max(0, _r(_c(d.valorOriginal))),
    amortizadoInicial: _r(_c(d.amortizadoInicial)),           // já amortizado antes do app
    parcelasTotal: Math.max(0, Math.round(Number(d.parcelasTotal) || 0)),
    // Quantas parcelas já haviam TRANSCORRIDO quando a dívida foi cadastrada.
    // Grandeza de calendário, separada de `amortizadoInicial` (dinheiro).
    // Ausente em dado antigo → 0: a amortização anterior não inventa vencimentos.
    parcelasPagasAntes: Math.max(0, Math.round(Number(d.parcelasPagasAntes) || 0)),
    valorParcela: Math.max(0, _r(_c(d.valorParcela))),
    periodicidade: d.periodicidade || 'mensal',
    dataInicio: d.dataInicio || '',
    juros: (d.juros === '' || d.juros == null) ? null : (Number(d.juros) || 0),
    categoria: d.categoria || '',                              // categoria da despesa (parcelamento)
    valorBem: (d.valorBem === '' || d.valorBem == null) ? null : Math.max(0, _r(_c(d.valorBem))),
    patrimonioId: d.patrimonioId || null,
    vehicleId: d.vehicleId || null,
    status,
    observacoes: String(d.observacoes || '').trim(),
    criadoEm: d.criadoEm || Date.now(),
    atualizadoEm: d.atualizadoEm || Date.now(),
    _migradoDe: d._migradoDe || null,                          // { source, id, patrimonioId? }
  };
}

function getDebt(id) { return (D.debts || []).find(d => d.id === id) || null; }
function _debtPaymentsOf(debtId) { return (D.debtPayments || []).filter(p => p.debtId === debtId); }
// valorPago em centavos = amortização inicial + soma dos pagamentos
function _debtPagoCents(debt) {
  const pays = _debtPaymentsOf(debt.id).reduce((s, p) => s + _c(p.valor), 0);
  return _c(debt.amortizadoInicial) + pays;
}
function _debtSaldoCents(debt) { return Math.max(0, _c(debt.valorOriginal) - _debtPagoCents(debt)); }
function _debtSaldo(debt) { return _r(_debtSaldoCents(debt)); }
function _debtPago(debt) { return _r(Math.min(_c(debt.valorOriginal), Math.max(0, _debtPagoCents(debt)))); }
function _debtProgress(debt) {
  const base = _c(debt.valorOriginal);
  if (base <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round(Math.max(0, _debtPagoCents(debt)) / base * 100)));
}
// ── FONTE ÚNICA da quantidade de parcelas (resolvedor de projeção) ──
// Regra: havendo valor total e valor padrão da parcela, totalParcelas = ceil(total/padrão);
// as parcelas anteriores usam o valor padrão e a ÚLTIMA absorve o resíduo (nunca zero,
// soma exatamente = valor total). Sem valor padrão, cai no total cadastrado (fallback).
// Corrige automaticamente dívidas com parcelasTotal cadastrado incorretamente, sem
// tocar em saldo, pagamentos ou histórico (a verdade financeira segue sendo o saldo).
function _debtParcelasTotal(debt) {
  const vpC = _c(debt.valorParcela);
  const voC = _c(debt.valorOriginal);
  if (vpC > 0 && voC > 0) return Math.ceil(voC / vpC);
  return Math.max(0, Math.round(Number(debt.parcelasTotal) || 0));
}
// Valor nominal da parcela k (1..N) em centavos; a última absorve o resíduo.
function _debtParcelaCents(debt, k) {
  const N = _debtParcelasTotal(debt);
  if (N <= 0) return 0;
  const vp = _c(debt.valorParcela);
  if (k >= N) return _c(debt.valorOriginal) - vp * (N - 1);
  return vp;
}
// Alocação de pagamentos: parcela k paga quando valorPago cobre a soma nominal 1..k.
function _debtParcelasPagas(debt) {
  const N = _debtParcelasTotal(debt);
  if (N <= 0) return 0;
  const pago = _debtPagoCents(debt);
  let acc = 0, count = 0;
  for (let k = 1; k <= N; k++) { acc += _debtParcelaCents(debt, k); if (pago >= acc) count++; else break; }
  return count;
}
function _debtProximaParcelaNo(debt) {
  const N = _debtParcelasTotal(debt);
  if (N <= 0) return null;
  const pagas = _debtParcelasPagas(debt);
  return pagas >= N ? null : pagas + 1;
}
// Parcelas cobertas SOMENTE pela amortização anterior ao cadastro (sem pagamentos do app).
function _debtParcelasDeAmort(debt) {
  const N = _debtParcelasTotal(debt);
  if (N <= 0) return 0;
  const amort = _c(debt.amortizadoInicial);
  let acc = 0, count = 0;
  for (let k = 1; k <= N; k++) { acc += _debtParcelaCents(debt, k); if (amort >= acc) count++; else break; }
  return count;
}
// ── PROGRESSO FINANCEIRO ≠ PROGRESSO CRONOLÓGICO ─────────────────────────
// `amortizadoInicial` é DINHEIRO pago antes do cadastro. Ele reduz o saldo e
// entra no "já pago" — mas não diz que semanas ou meses transcorreram. Uma
// entrada de R$ 2.000 numa dívida semanal de R$ 200 não faz dez sextas-feiras
// acontecerem.
//
// Quem informa tempo transcorrido é `parcelasPagasAntes` — a contagem que o
// formulário já pergunta ("Parcelas já pagas antes"). Com ela, `dataInicio`
// ("Primeiro vencimento") continua sendo o vencimento da parcela
// `parcelasPagasAntes + 1`, e a grade caminha a partir dali.
//
// Este deslocamento mede as parcelas que o dinheiro quitou SEM que o tempo
// tenha passado — as que a projeção precisa desconsiderar ao datar:
//
//   fantasma = parcelas cobertas pela amortização − parcelas declaradas como
//              cronologicamente transcorridas          (nunca negativo)
//
// Sem amortização anterior, fantasma = 0 e a grade é exatamente a de sempre.
function _debtParcelasSemCalendario(debt) {
  const declaradas = Math.max(0, Math.round(Number(debt && debt.parcelasPagasAntes) || 0));
  return Math.max(0, _debtParcelasDeAmort(debt) - declaradas);
}
// Vencimento da parcela k, ancorado na grade contratual: dataInicio +
// periodicidade·(k−1−fantasma). Mensal clampa dia curto. A grade NUNCA é
// reancorada na data em que um pagamento foi feito — pagar atrasado quita a
// parcela vencida, não empurra as seguintes.
function _debtDueDate(debt, k) {
  const base = parseDate(debt.dataInicio);
  if (!base || isNaN(base)) return '';
  const i = Math.max(1, k) - 1 - _debtParcelasSemCalendario(debt);
  const freq = debt.periodicidade || 'mensal';
  let dt;
  if (freq === 'semanal')        dt = new Date(base.getFullYear(), base.getMonth(), base.getDate() + 7 * i);
  else if (freq === 'quinzenal') dt = new Date(base.getFullYear(), base.getMonth(), base.getDate() + 14 * i);
  else if (freq === 'anual')     dt = new Date(base.getFullYear() + i, base.getMonth(), base.getDate());
  else {
    const y = base.getFullYear(), mo = base.getMonth() + i, day = base.getDate();
    const last = new Date(y, mo + 1, 0).getDate();
    dt = new Date(y, mo, Math.min(day, last));
  }
  return dateStr(dt);
}
// Quanto ainda falta para cobrir integralmente a próxima parcela (em reais).
function _debtProximaValor(debt) {
  const no = _debtProximaParcelaNo(debt);
  if (!no) return 0;
  let acc = 0;
  for (let k = 1; k <= no; k++) acc += _debtParcelaCents(debt, k);
  return _r(Math.max(0, acc - _debtPagoCents(debt)));
}
function _debtQuitada(debt) { return _c(debt.valorOriginal) > 0 && _debtSaldoCents(debt) <= 0; }
// Status efetivo: manuais (pausada/cancelada) têm prioridade; demais são derivados.
function _debtStatus(debt) {
  if (DEBT_STATUS_MANUAIS.includes(debt.status)) return debt.status;
  if (_debtQuitada(debt)) return 'quitada';
  const no = _debtProximaParcelaNo(debt);
  if (no) { const dd = _debtDueDate(debt, no); if (dd && dd < todayStr()) return 'atrasada'; }
  return 'ativa';
}
function _debtAtrasada(debt) { return _debtStatus(debt) === 'atrasada'; }
// Estado agregado — usado por TODAS as telas (fonte única).
function _debtState(debt) {
  const proximaNo = _debtProximaParcelaNo(debt);
  return {
    valorOriginal: debt.valorOriginal,
    pago: _debtPago(debt),
    saldo: _debtSaldo(debt),
    progress: _debtProgress(debt),
    parcelasTotal: _debtParcelasTotal(debt),
    parcelasPagas: _debtParcelasPagas(debt),
    proximaNo,
    proximaVenc: proximaNo ? _debtDueDate(debt, proximaNo) : '',
    proximaValor: proximaNo ? _debtProximaValor(debt) : 0,
    status: _debtStatus(debt),
    quitada: _debtQuitada(debt),
    ativa: !['quitada', 'cancelada'].includes(_debtStatus(debt)),
  };
}
// Dívidas vinculadas a um patrimônio (por id) ou a um veículo (por vehicleId).
function _debtsForPatrimonio(patId) { return (D.debts || []).filter(d => d.patrimonioId && d.patrimonioId === patId); }
function _debtsForVehicle(vehId) { return (D.debts || []).filter(d => d.vehicleId && d.vehicleId === vehId); }

// ══════════════════════════════════════════
// RESOLVEDOR GLOBAL DE VENCIMENTOS (Fase 3) — projeção DERIVADA de D.debts.
// Nunca materializa nada: não cria despesas, pendências nem cópias de parcelas.
// Central, Home, Semana e Mês consultam ESTE resolvedor (fonte única da projeção).
// Item projetado: identidade estável (debtId+parcelNo, ou debtId+data), valor
// restante ciente de pagamento parcial, status/atraso, referência à dívida real.
// ══════════════════════════════════════════
function _mkVenc(debt, parcelNo, dueISO, nominalC, restanteC, today) {
  const atrasada = !!(dueISO && dueISO < today);
  return {
    id: debt.id + ':' + (parcelNo != null ? 'p' + parcelNo : 'd' + (dueISO || '')),
    debtId: debt.id, parcelNo: parcelNo != null ? parcelNo : null,
    titulo: debt.titulo, tipo: debt.tipo,
    patrimonioId: debt.patrimonioId || null, vehicleId: debt.vehicleId || null, bemNome: _debtBemNome(debt),
    dueDate: dueISO || '', valorNominal: _r(nominalC), valorRestante: _r(Math.max(0, restanteC)),
    parcelasTotal: _debtParcelasTotal(debt),
    atrasada, status: atrasada ? 'atrasada' : (dueISO && dueISO === today ? 'hoje' : 'previsto'),
    origem: 'debt-projection',
    debt,
  };
}
// Projeta os vencimentos PENDENTES de UMA dívida (só ativas/atrasadas).
// opts: { fromISO, toISO, maxItems }. O 1º pendente é ciente de pagamento parcial.
function _debtProjectVencimentos(debt, opts) {
  if (!debt || !_debtIsAtiva(debt)) return [];
  const o = opts || {};
  const today = todayStr();
  const items = [];
  const N = _debtParcelasTotal(debt);
  if (N > 0) {
    const start = _debtProximaParcelaNo(debt);
    if (!start) return [];
    const pagoCents = _debtPagoCents(debt);
    let cumCents = 0;
    for (let k = 1; k < start; k++) cumCents += _debtParcelaCents(debt, k); // já cobertas
    for (let k = start; k <= N; k++) {
      const nominalC = _debtParcelaCents(debt, k);
      const restanteC = k === start ? (cumCents + nominalC - pagoCents) : nominalC;
      const due = _debtDueDate(debt, k);
      cumCents += nominalC;
      if (o.toISO && due && due > o.toISO) break;        // além da janela: para
      if (o.fromISO && due && due < o.fromISO) continue;  // antes da janela: pula
      items.push(_mkVenc(debt, k, due, nominalC, restanteC, today));
      if (o.maxItems && items.length >= o.maxItems) break;
    }
  } else {
    // Sem parcelas: só projeta se houver data e saldo pendente (nunca inventa vencimento).
    const saldoC = _debtSaldoCents(debt);
    if (debt.dataInicio && saldoC > 0) {
      const due = debt.dataInicio;
      if ((!o.fromISO || due >= o.fromISO) && (!o.toISO || due <= o.toISO)) {
        items.push(_mkVenc(debt, null, due, saldoC, saldoC, today));
      }
    }
  }
  return items;
}
// Todas as projeções (todas as dívidas ativas/atrasadas), ordenadas por data.
function _debtVencimentosNoPeriodo(fromISO, toISO) {
  const out = [];
  (D.debts || []).forEach(d => { _debtProjectVencimentos(d, { fromISO, toISO }).forEach(v => out.push(v)); });
  out.sort((a, b) => String(a.dueDate || '~').localeCompare(String(b.dueDate || '~')) || String(a.titulo || '').localeCompare(String(b.titulo || ''), 'pt-BR', { sensitivity: 'base' }));
  return out;
}
// O próximo vencimento pendente de CADA dívida (um por dívida) — usado por Central/Home.
function _debtProximosPorDivida() {
  const out = [];
  (D.debts || []).forEach(d => { const v = _debtProjectVencimentos(d, { maxItems: 1 })[0]; if (v) out.push(v); });
  out.sort((a, b) => String(a.dueDate || '~').localeCompare(String(b.dueDate || '~')));
  return out;
}
// Compromissos que vencem DENTRO do mês (YYYY-MM). Só previsão, nunca despesa.
// A janela é fechada nos dois lados: uma parcela vencida em mês anterior pertence
// ao mês dela, não a este — o atraso acumulado é reportado à parte, por
// _debtAtrasoAnteriorAoMes. O filtro final repete a regra do mês de forma
// explícita (a projeção pode devolver item sem data quando a dívida não tem
// dataInicio válida, e ele não pertence a mês nenhum).
function _debtPrevistoDoMes(ym) {
  const m = /^(\d{4})-(\d{2})$/.exec(ym); if (!m) return { total: 0, itens: [] };
  const from = ym + '-01';
  const last = new Date(+m[1], +m[2], 0).getDate();
  const to = `${ym}-${String(last).padStart(2, '0')}`;
  const itens = _debtVencimentosNoPeriodo(from, to)
    .filter(v => v.dueDate && v.dueDate >= from && v.dueDate <= to);
  return { total: _r(itens.reduce((s, v) => s + _c(v.valorRestante), 0)), itens };
}
// Atraso acumulado ANTES do mês exibido — resumo único, nunca lista no Mês.
// Duas condições, ambas necessárias:
//   1) dueDate < hoje      → é atraso de verdade, medido contra o presente e não
//                            contra o mês que está sendo olhado;
//   2) dueDate < 1º do mês → não está listado no bloco do mês, o que garante que
//                            nenhuma parcela apareça nos dois lugares.
// Consequência desejada: ao abrir um mês futuro, parcelas intermediárias que
// ainda não venceram não entram aqui (não são atraso) nem no bloco daquele mês
// (não pertencem a ele) — elas pertencem aos seus próprios meses.
function _debtAtrasoAnteriorAoMes(ym) {
  const vazio = { quantidade: 0, total: 0, itens: [], maisAntiga: '' };
  const m = /^(\d{4})-(\d{2})$/.exec(ym); if (!m) return vazio;
  const inicioDoMes = ym + '-01';
  const hoje = todayStr();
  // Teto da janela: o dia anterior ao mais restritivo dos dois limites.
  const limite = inicioDoMes < hoje ? inicioDoMes : hoje;
  const itens = _debtVencimentosNoPeriodo(null, _addDaysISO(limite, -1))
    .filter(v => v.dueDate && v.dueDate < hoje && v.dueDate < inicioDoMes);
  if (!itens.length) return vazio;
  return {
    quantidade: itens.length,
    total: _r(itens.reduce((s, v) => s + _c(v.valorRestante), 0)),
    itens,
    maisAntiga: itens[0].dueDate,   // _debtVencimentosNoPeriodo já ordena por data
  };
}
// Data civil local + N dias (ISO), sem timezone UTC.
function _addDaysISO(iso, n) {
  const dt = parseDate(iso); if (isNaN(dt)) return iso;
  dt.setDate(dt.getDate() + n);
  return dateStr(dt);
}

// ══════════════════════════════════════════════════════════════════════════
// COMPROMISSOS EM ABERTO — resolvedor único, puramente derivado.
//
// Reúne, numa lista só, o que está pendente de pagamento em três origens que
// continuam SEPARADAS no dado: dívidas, gastos fixos e pendências. É um view
// model efêmero: não vira coleção em D, não persiste, não chama save(), não
// cria despesa nem pagamento, e não define natureza financeira — quem decide a
// natureza continua sendo a função canônica que quitar cada item, depois.
//
// O campo `origem` é o que impede a armadilha de "unificar dados ao simplificar
// a UX": ele carrega para o consumidor qual estrutura gerou o item, e `acao` diz
// qual fluxo canônico deverá ser aberto. Nesta fase nada é executado — `acao` é
// apenas um identificador estável.
//
// Nenhuma regra de negócio é reimplementada aqui: quem decide se um fixo está
// em aberto é fxState; quem decide o próximo compromisso de uma dívida é
// _debtProximosPorDivida (que já filtra ativas e devolve no máximo um por
// dívida, nunca projetando dívida quitada).
// ══════════════════════════════════════════════════════════════════════════
const OBRIGACAO_ACOES = Object.freeze({
  divida:    'debt-pay',            // → openDebtPay(id)
  fixo:      'fixed-baixa',         // → openBaixa(id)
  pendencia: 'pendencia-concluir',  // → completePendencia(id)
});

// Ordena: atrasadas primeiro; depois por vencimento; item sem vencimento vai
// para o fim do seu grupo; empate resolvido pelo título.
function _obrigacaoCompare(a, b) {
  if (a.atrasada !== b.atrasada) return a.atrasada ? -1 : 1;
  const av = a.vencimento || '', bv = b.vencimento || '';
  if (!!av !== !!bv) return av ? -1 : 1;
  if (av !== bv) return av < bv ? -1 : 1;
  return String(a.titulo || '').localeCompare(String(b.titulo || ''), 'pt-BR', { sensitivity: 'base' });
}

function _obrigacoesEmAberto() {
  const hoje = todayStr();
  const itens = [];

  // ── Dívidas: um compromisso por dívida (o 1º pendente já prioriza atrasada) ──
  _debtProximosPorDivida().forEach(v => {
    itens.push({
      origem: 'divida',
      id: v.debtId,
      titulo: v.titulo || 'Dívida',
      subtitulo: v.parcelNo ? `Parcela ${v.parcelNo}/${v.parcelasTotal}` : '',
      valorSugerido: v.valorRestante,
      valorEhEstimativa: false,      // valor derivado do saldo devedor
      vencimento: v.dueDate || '',
      atrasada: !!v.atrasada,
      acao: OBRIGACAO_ACOES.divida,
      parcelNo: v.parcelNo || null,  // contexto para o fluxo canônico
    });
  });

  // ── Gastos fixos: só o que fxState considera em aberto no ciclo corrente ──
  const ciclo = fxCurrentCycle();
  (D.fixedExpenses || []).forEach(f => {
    const estado = fxState(f, ciclo);   // 'paid'/'paused'/'preexisting' ficam de fora
    if (estado.status !== 'pending' && estado.status !== 'overdue') return;
    itens.push({
      origem: 'fixo',
      id: f.id,
      titulo: f.name || 'Gasto fixo',
      subtitulo: f.category || '',
      valorSugerido: f.amount || 0,
      valorEhEstimativa: false,      // valor contratado do fixo
      vencimento: estado.dueDate || '',
      atrasada: estado.status === 'overdue',
      acao: OBRIGACAO_ACOES.fixo,
      ciclo,                         // contexto para o fluxo canônico
    });
  });

  // ── Pendências: abertas E com valor estimado (sem valor não é pagável) ──
  (D.pendencias || []).forEach(p => {
    if (p.status !== 'aberta') return;
    const valor = Number(p.estimatedValue) || 0;
    if (valor <= 0) return;
    itens.push({
      origem: 'pendencia',
      id: p.id,
      titulo: p.title || 'Pendência',
      subtitulo: p.category || '',
      valorSugerido: valor,
      // O valor de uma pendência é ESTIMADO: o consumidor não pode apresentá-lo
      // como exato nem somá-lo a um total sem sinalizar isso.
      valorEhEstimativa: true,
      vencimento: p.deadline || '',
      atrasada: !!(p.deadline && p.deadline < hoje),
      acao: OBRIGACAO_ACOES.pendencia,
    });
  });

  return itens.sort(_obrigacaoCompare);
}

// Agregado derivado da lista — fonte ÚNICA para qualquer superfície que resuma
// compromissos (folha e faixa do "+"). Não consulta D, não guarda estado e não
// reimplementa regra financeira: só conta e soma o que o resolvedor devolveu.
// `temEstimativa` existe para que nenhum consumidor apresente o total como exato
// quando há pendência (valor estimado) na composição.
function _obrigacoesResumo(itens) {
  const lista = Array.isArray(itens) ? itens : [];
  return {
    quantidade: lista.length,
    atrasados: lista.reduce((n, i) => n + (i && i.atrasada ? 1 : 0), 0),
    total: _r(lista.reduce((s, i) => s + _c(i && i.valorSugerido), 0)),
    temEstimativa: lista.some(i => i && i.valorEhEstimativa),
  };
}
// Texto do total respeitando a honestidade do agregado.
function _obrigacoesTotalTexto(resumo) {
  return `${resumo.temEstimativa ? 'cerca de ' : ''}${R(resumo.total)}`;
}
// "1 compromisso" / "4 compromissos"
function _obrigacoesContagemTexto(resumo) {
  return `${resumo.quantidade} ${resumo.quantidade === 1 ? 'compromisso' : 'compromissos'}`;
}

// ══════════════════════════════════════════════════════════════════════════
// FOLHA "COMPROMISSOS EM ABERTO"
//
// Apresentação pura do resolvedor: renderObrigacoes() NÃO consulta D nem aplica
// regra própria — tudo vem de _obrigacoesEmAberto(), recalculado a cada
// abertura (sem cache, para que uma obrigação quitada suma na próxima vez).
//
// Tocar num item sai desta folha e abre o fluxo CANÔNICO da origem. Esta folha
// nunca cria despesa, pagamento ou marcador.
// ══════════════════════════════════════════════════════════════════════════
const OBRIGACAO_ORIGEM_LBL = Object.freeze({
  divida: 'Dívida', fixo: 'Gasto fixo', pendencia: 'Pendência',
});
// Lista da abertura corrente. Existe só para o clique achar o item pelo índice,
// sem despejar id nem nome interno de fluxo no HTML.
let _obrigacoesNaTela = [];

// Sai do formulário de lançamento antes de abrir qualquer fluxo canônico.
// Três garantias: nenhum overlay do "+" fica aberto por baixo; o estado de
// criação/edição é descartado; e `_qaSaving = true` trava um qaConfirm atrasado
// (um toque em Salvar que chegue depois da troca de tela) para que ele não grave
// uma despesa manual paralela. openQuickAdd/qaCancel zeram esse estado quando o
// formulário for legitimamente reaberto. Nada persistido é apagado ou alterado.
//
// NÃO restaura o FAB aqui: quem sai do "+" está entrando na jornada especial,
// e durante ela o FAB precisa continuar oculto (ver _jornadaCompromisso).
function _sairDoLancamento() {
  _qaEdit = null;
  _pendVehicleId = null;
  _pendOrigemId = null;
  _qaSaving = true;
  const sb = document.getElementById('qa-save-btn'); if (sb) sb.disabled = true;
  const ov = document.getElementById('modal-quick-add');
  if (!ov || !ov.classList.contains('open')) return;
  closeOverlay('modal-quick-add');
}

// ══════════════════════════════════════════════════════════════════════════
// JORNADA ESPECIAL: "+" → Compromissos em aberto → fluxo canônico
//
// O FAB mora em z-index 70, ABAIXO das folhas (100), e os botões de confirmar
// ("Dar baixa", "Registrar") passam por cima da área dele. `closeOverlay` tira
// `pointer-events` no mesmo instante, mas a folha ainda leva ~0,22s sumindo —
// e nessa janela o toque que confirmou a operação chegava ao FAB, reabrindo
// "Novo lançamento" vazio logo depois de uma quitação já registrada. Daí o
// risco real: lançar a mesma saída uma segunda vez, à mão.
//
// A correção é uma flag efêmera: enquanto a jornada dura, o FAB fica oculto; e
// ele só volta quando o último overlay TERMINOU de fechar e nenhum outro
// assumiu. Nada disso é persistido nem toca em dado financeiro.
// ══════════════════════════════════════════════════════════════════════════
var _jornadaCompromisso = false;
// Overlays que fazem parte da jornada (o "+" entra por causa da pendência, que
// termina no formulário pré-preenchido).
const JORNADA_OVERLAYS = Object.freeze(['modal-obrigacoes', 'debt-pay-sheet', 'modal-baixa', 'modal-quick-add']);

var _fabTimerSeguro = null;
// Restaura o FAB só quando ninguém mais possa recebê-lo por engano: espera o
// FIM REAL da transição do overlay que fechou (transitionend), com uma única
// rede de segurança para os casos em que ela não dispara (aba oculta,
// prefers-reduced-motion, elemento já invisível). Se outra folha tiver assumido
// nesse meio-tempo, não faz nada — a jornada continua.
function _restaurarFabQuandoSeguro(overlayId) {
  const el = overlayId ? document.getElementById(overlayId) : null;
  function concluir() {
    if (_fabTimerSeguro) { clearTimeout(_fabTimerSeguro); _fabTimerSeguro = null; }
    if (el) el.removeEventListener('transitionend', aoFimDaTransicao);
    if (document.querySelector('.overlay.open, .av-overlay.open')) return; // outra folha assumiu
    _jornadaCompromisso = false;
    _restoreFab();
  }
  function aoFimDaTransicao(ev) {
    if (ev.target === el && ev.propertyName === 'opacity') concluir();
  }
  if (el) el.addEventListener('transitionend', aoFimDaTransicao);
  if (_fabTimerSeguro) clearTimeout(_fabTimerSeguro);
  _fabTimerSeguro = setTimeout(concluir, 400);
}

// Ponto único de encerramento da jornada. No-op fora dela.
function _encerrarJornadaCompromisso(overlayId) {
  if (!_jornadaCompromisso) return;
  _restaurarFabQuandoSeguro(overlayId || null);
}

// Roteador único: uma porta de entrada para os três fluxos canônicos, em vez de
// lógica financeira espalhada por onclick.
function _abrirObrigacao(item) {
  if (!item || !item.origem) return;
  _sairDoLancamento();
  const folha = document.getElementById('modal-obrigacoes');
  if (folha && folha.classList.contains('open')) closeOverlay('modal-obrigacoes');
  if (item.origem === 'divida')    { openDebtPay(item.id); return; }
  if (item.origem === 'fixo')      { darBaixaFixed(item.id); return; }
  if (item.origem === 'pendencia') { completePendencia(item.id); return; }
}
// Ponte do clique: resolve o índice para o item da abertura corrente.
function _tocarObrigacao(i) { _abrirObrigacao(_obrigacoesNaTela[Number(i)]); }

function _obrigacaoRowHtml(item, i) {
  const origemLbl = OBRIGACAO_ORIGEM_LBL[item.origem] || '';
  const contexto = [origemLbl, item.subtitulo].filter(Boolean).join(' · ');
  const data = item.vencimento ? _fmtDataBR(item.vencimento) : 'Sem prazo';
  const aria = `${item.titulo}, ${origemLbl}, ${item.valorEhEstimativa ? 'valor estimado ' : ''}${R(item.valorSugerido)}, ${item.atrasada ? 'em atraso, ' : ''}${data}`;
  return `<button class="home-venc-item obr-item" onclick="_tocarObrigacao(${i})" aria-label="${escHtml(aria)}">
    <div class="home-venc-main">
      <div class="home-venc-title" title="${escHtml(item.titulo)}">${escHtml(item.titulo)}</div>
      <div class="home-venc-sub">${escHtml(contexto)}</div>
    </div>
    <div class="home-venc-end">
      <div class="home-venc-val">${item.valorEhEstimativa ? '~ ' : ''}${R(item.valorSugerido)}</div>
      <div class="home-venc-meta">
        ${item.atrasada ? '<span class="venc-chip venc-atraso">Em atraso</span>' : ''}
        ${item.valorEhEstimativa ? '<span class="venc-chip obr-chip-est">Estimado</span>' : ''}
        <span class="home-venc-date">${data}</span>
      </div>
    </div>
  </button>`;
}

function renderObrigacoes() {
  const listaEl = document.getElementById('obr-lista');
  const resumoEl = document.getElementById('obr-resumo');
  if (!listaEl) return;
  _obrigacoesNaTela = _obrigacoesEmAberto();
  const itens = _obrigacoesNaTela;

  if (!itens.length) {
    if (resumoEl) resumoEl.textContent = '';
    listaEl.innerHTML = `<div class="obr-vazio">
      <div class="obr-vazio-tit">Tudo em dia</div>
      <div class="obr-vazio-sub">Nenhum compromisso em aberto agora.</div>
    </div>`;
    return;
  }

  // Agregado honesto: havendo qualquer valor estimado, o total NÃO é
  // apresentado como exato — a diferença entre devido e estimado é preservada.
  const resumo = _obrigacoesResumo(itens);
  if (resumoEl) resumoEl.textContent = `${_obrigacoesContagemTexto(resumo)} · ${_obrigacoesTotalTexto(resumo)}`;

  listaEl.innerHTML = `<div class="home-venc-list obr-lista">${itens.map(_obrigacaoRowHtml).join('')}</div>`;
}

// Abre a folha. Nesta fase não há entrada na UI: só chamada direta.
// Sai do formulário de lançamento ANTES de abrir, para que os dois nunca
// coexistam: sobrepostos, o "+" ficaria por cima (vem depois no DOM) e roubaria
// os toques da folha.
function abrirCompromissos() {
  _jornadaCompromisso = true;   // antes de sair do "+": o FAB não pode reaparecer
  _sairDoLancamento();
  renderObrigacoes();
  openOverlay('modal-obrigacoes');
}

// ── Faixa do "+" ──────────────────────────────────────────────────────────
// Atalho, nunca etapa: o "+" continua abrindo o formulário direto, e receita ou
// gasto comum seguem no mesmo número de toques ignorando a faixa. Sem itens em
// aberto, o slot fica literalmente vazio (`#qa-compr-slot:empty` some) e o
// formulário fica idêntico ao de hoje. Recalcula do resolvedor a cada abertura:
// sem cache e sem estado persistido, de modo que quitar um compromisso já se
// reflete na próxima vez que o "+" abrir.
function renderFaixaCompromissos() {
  const slot = document.getElementById('qa-compr-slot');
  if (!slot) return;
  // Só na criação: em edição o formulário está preso a um registro existente
  // (o toggle de tipo é travado) e um atalho para outro fluxo ali seria ruído.
  const resumo = _qaEdit ? _obrigacoesResumo([]) : _obrigacoesResumo(_obrigacoesEmAberto());
  if (!resumo.quantidade) { slot.innerHTML = ''; return; }

  const atraso = resumo.atrasados > 0;
  const topo = atraso
    ? `${resumo.atrasados} ${resumo.atrasados === 1 ? 'atrasado' : 'atrasados'} · ${_obrigacoesContagemTexto(resumo)} em aberto`
    : `${_obrigacoesContagemTexto(resumo)} em aberto`;
  const valor = _obrigacoesTotalTexto(resumo);
  const ico = atraso
    ? '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>'
    : '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>';
  slot.innerHTML = `<button type="button" class="qa-compr${atraso ? ' qa-compr--atraso' : ''}" onclick="abrirCompromissos()"
      aria-label="${escHtml(`${topo}, ${valor}. Abrir compromissos em aberto.`)}">
    <span class="qa-compr-ico" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${ico}</svg>
    </span>
    <span class="qa-compr-main">
      <span class="qa-compr-top">${escHtml(topo)}</span>
      <span class="qa-compr-sub">${escHtml(valor)}</span>
    </span>
    <span class="qa-compr-chev" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
    </span>
  </button>`;
}

// ── Vencimentos na Home: atrasados + hoje + próximos (projeção; nunca despesa) ──
const VENC_STATUS_META = { atrasada: { lbl: 'Em atraso', cls: 'atraso' }, hoje: { lbl: 'Hoje', cls: 'hoje' }, previsto: { lbl: 'A vencer', cls: 'previsto' } };
function _vencRowHtml(v) {
  const sm = VENC_STATUS_META[v.status] || VENC_STATUS_META.previsto;
  const ctx = [(DEBT_TIPO_META[v.tipo] || {}).lbl, v.bemNome].filter(Boolean).join(' · ');
  const parc = v.parcelNo ? ` · ${v.parcelNo}/${v.parcelasTotal}` : '';
  const aria = `${v.titulo}, ${sm.lbl}, ${R(v.valorRestante)}, ${_fmtDataBR(v.dueDate)}`;
  return `<button class="home-venc-item" onclick="openDebtDetail('${v.debtId}')" aria-label="${escHtml(aria)}">
    <div class="home-venc-main">
      <div class="home-venc-title" title="${escHtml(v.titulo)}">${escHtml(v.titulo)}</div>
      <div class="home-venc-sub">${escHtml(ctx)}${parc}</div>
    </div>
    <div class="home-venc-end">
      <div class="home-venc-val">${R(v.valorRestante)}</div>
      <div class="home-venc-meta"><span class="venc-chip venc-${sm.cls}">${sm.lbl}</span><span class="home-venc-date">${_fmtDataBR(v.dueDate)}</span></div>
    </div>
  </button>`;
}
// Atualiza a projeção em TODAS as telas ativas após pagar/desfazer/editar uma dívida.
function _afterDebtChange() {
  const active = id => document.getElementById(id)?.classList.contains('active');
  if (active('page-dividas')) renderDividas();
  if (active('page-inicio')) renderHomeVencimentos();
  if (active('page-semana')) renderDayAccordion();
  if (active('page-mes')) renderMes();
}
function renderHomeVencimentos() {
  const el = document.getElementById('home-dividas-venc'); if (!el) return;
  const today = todayStr();
  const horizon = _addDaysISO(today, 15); // atrasados (sem piso) + próximos 15 dias
  // UM compromisso por dívida: o 1º pendente já prioriza atrasada > hoje > 1ª futura
  // (parcelas são sequenciais, então a atrasada É a primeira pendente). Assim uma única
  // dívida não ocupa vários cartões enquanto outras ficam escondidas — as demais parcelas
  // seguem disponíveis na Central, no detalhe, na Semana e no Mês.
  const all = _debtProximosPorDivida().filter(v => v.dueDate && v.dueDate <= horizon);
  const ord = { atrasada: 0, hoje: 1, previsto: 2 };
  all.sort((a, b) => (ord[a.status] - ord[b.status]) || String(a.dueDate).localeCompare(String(b.dueDate)));
  const items = all.slice(0, 4);
  if (!items.length) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="hc-section home-venc-sec">
    <div class="hc-sec-hd"><span class="hc-tri-sm"></span><span class="hc-sec-title">Próximos compromissos</span><button class="hc-sec-link" onclick="switchTab('dividas','inicio')">Ver dívidas</button></div>
    <div class="home-venc-list">${items.map(_vencRowHtml).join('')}</div>
  </div>`;
}

// Registra UM pagamento: cria a despesa real e o marcador de pagamento (uma única vez).
// valor livre (aceita parcial, antecipado ou diferente da parcela). Retorna expenseId.
function _debtRegistrarPagamento(debtId, opts) {
  const d = getDebt(debtId);
  if (!d) return null;
  const valor = Math.max(0, _r(_c(opts.valor)));
  if (valor <= 0) return null;
  const data = opts.data || todayStr();
  const parcelNo = opts.parcelNo || null;
  const categoria = opts.categoria || d.categoria || (D.expCats && D.expCats[0]) || 'Outros';
  const descBase = d.tipo === 'parcelamento' && _debtParcelasTotal(d)
    ? `${d.titulo} (parcela ${parcelNo || (_debtParcelasPagas(d) + 1)}/${_debtParcelasTotal(d)})`
    : `${d.titulo}${d.credor ? ' — ' + d.credor : ''}`;
  const descricao = (opts.descricao && opts.descricao.trim()) || descBase;
  const expId = uid();
  // saleId opcional: amarra o pagamento à liquidação de um bem (para estorno na reabertura).
  const expMeta = { source: 'debt', debtId: d.id, parcelNo: parcelNo };
  if (opts.saleId) expMeta.saleId = opts.saleId;
  D.expenses.push({ id: expId, date: data, category: categoria, amount: valor, description: descricao, meta: expMeta });
  D.debtPayments = D.debtPayments || [];
  const payRec = { id: uid(), debtId: d.id, parcelNo: parcelNo, expenseId: expId, valor: valor, data: data, criadoEm: Date.now() };
  if (opts.saleId) payRec.meta = { saleId: opts.saleId };
  D.debtPayments.push(payRec);
  d.atualizadoEm = Date.now();
  return expId;
}

// Reconciliação: remove marcadores órfãos (despesa OU dívida inexistente). Como o
// saldo é derivado, remover o marcador reverte automaticamente a amortização.
function reconcileDebtPayments() {
  if (!Array.isArray(D.debtPayments)) { D.debtPayments = []; return false; }
  const expIds = new Set((D.expenses || []).map(e => e.id));
  const debtIds = new Set((D.debts || []).map(d => d.id));
  const before = D.debtPayments.length;
  D.debtPayments = D.debtPayments.filter(p => p && p.debtId && debtIds.has(p.debtId) && (!p.expenseId || expIds.has(p.expenseId)));
  return D.debtPayments.length !== before;
}

// ── Migração idempotente do ciclo de vida do patrimônio (V1) ──
// "Arquivado"/"inativo"/"vendido" legados → estado canônico 'encerrado'.
// Veículo 'arquivado' → 'vendido' (lifecycle encerrado). Preserva TUDO: histórico,
// despesas, pagamentos e vínculos. NÃO cria eventos sintéticos (entrada/quitação).
// Idempotente via flag _patLifecycleSchema; releitura não reprocessa.
function migratePatrimonioLifecycleV1() {
  if (D._patLifecycleSchema === 1) return false;
  let changed = false;
  (D.patrimonios || []).forEach(p => {
    if (p.status === 'inativo' || p.status === 'vendido') { p.status = 'encerrado'; changed = true; }
  });
  (D.vehicles || []).forEach(v => {
    if (v.status === 'arquivado') { v.status = 'vendido'; changed = true; }
  });
  D._patLifecycleSchema = 1;
  return true; // sempre grava a flag na primeira execução
}

// ── Migração idempotente V1: consolida installments + patrimonios.financiamentos ──
// Idempotência dupla: flag global (_debtsSchema) E identidade por origem (_migradoDe).
// IDs de origem preservados quando livres; em colisão, novo id estável + _migradoDe.
function migrateDebtsV1() {
  if (!Array.isArray(D.debts)) D.debts = [];
  if (!Array.isArray(D.debtPayments)) D.debtPayments = [];
  const usedIds = new Set(D.debts.map(d => d.id));
  const sameOrigin = (a, b) => a && b && a.source === b.source && String(a.id) === String(b.id) &&
    ((a.patrimonioId || null) === (b.patrimonioId || null));
  const alreadyMigrated = (src) => D.debts.some(d => sameOrigin(d._migradoDe, src));
  const stableId = (origId) => {
    if (origId && !usedIds.has(origId)) { usedIds.add(origId); return origId; }
    let nid = uid(); while (usedIds.has(nid)) nid = uid(); usedIds.add(nid); return nid;
  };
  let changed = false;

  // 1) Parcelamentos → dívida do tipo 'parcelamento'
  (D.installments || []).forEach(inst => {
    if (!inst || !inst.id) return;
    const src = { source: 'installment', id: inst.id };
    if (alreadyMigrated(src)) return;
    const id = stableId(inst.id);
    D.debts.push(_normDebt({
      id, tipo: 'parcelamento', titulo: inst.descricao, credor: inst.conta,
      valorOriginal: inst.valorTotal, amortizadoInicial: 0,
      parcelasTotal: inst.parcelas, valorParcela: inst.valorParcela,
      periodicidade: inst.frequencia, dataInicio: inst.dataPrimeira,
      categoria: inst.categoria, observacoes: inst.observacoes,
      criadoEm: inst.criadoEm, _migradoDe: src,
    }));
    (D.installmentPayments || []).filter(p => p.installmentId === inst.id).forEach(p => {
      D.debtPayments.push({ id: uid(), debtId: id, parcelNo: p.parcelNo || null, expenseId: p.expenseId, valor: p.valor, data: p.paidDate, criadoEm: p.criadoEm || Date.now() });
    });
    changed = true;
  });

  // 2) Financiamentos de patrimônio → dívida do tipo 'financiamento'
  (D.patrimonios || []).forEach(p => {
    (p.financiamentos || []).forEach(f => {
      if (!f || !f.id) return;
      const src = { source: 'patrimonio-financiamento', id: f.id, patrimonioId: p.id };
      if (alreadyMigrated(src)) return;
      const id = stableId(f.id);
      const isVeic = p.tipo === 'veiculo';
      // Fórmula que preserva o saldo EXATO (centavo a centavo) e evita dupla subtração:
      //   saldo = valorOriginal − amortizadoInicial − Σpagamentos = f.saldoDevedor
      // Defensivo: se valorFinanciado faltar (0), usa (saldo + pagamentos) como base,
      // para NÃO descartar a dívida (recuperação em vez de perda).
      const pagosCents = (f.pagamentos || []).reduce((s, pg) => s + _c(pg.valor), 0);
      const saldoCents = _c(f.saldoDevedor);
      const valFinCents = _c(f.valorFinanciado);
      const baseCents = valFinCents > 0 ? valFinCents : (saldoCents + pagosCents);
      D.debts.push(_normDebt({
        id, tipo: 'financiamento', titulo: (p.nome || f.instituicao || 'Financiamento'),
        credor: f.instituicao, valorOriginal: _r(baseCents),
        amortizadoInicial: _r(baseCents - saldoCents - pagosCents), valorBem: f.valorBem,
        periodicidade: f.frequencia, dataInicio: f.dataInicio, observacoes: f.observacoes,
        patrimonioId: isVeic ? null : p.id,
        vehicleId: isVeic ? (p._idOriginal || p.id) : null,
        _migradoDe: src,
      }));
      (f.pagamentos || []).forEach(pg => {
        D.debtPayments.push({ id: uid(), debtId: id, parcelNo: null, expenseId: pg.expenseId, valor: pg.valor, data: pg.data, criadoEm: pg.criadoEm || Date.now() });
      });
      changed = true;
    });
  });

  if (D._debtsSchema !== 1) { D._debtsSchema = 1; changed = true; }
  return changed;
}

// ══════════════════════════════════════════
// PARCELAMENTOS (Compras Parceladas)
// Módulo INDEPENDENTE de Patrimônio/Financiamento. Espelha o padrão dos Gastos
// Fixos: o cadastro (D.installments) é o "plano" imutável; cada parcela confirmada
// gera UMA despesa real + um marcador (D.installmentPayments). Nenhuma despesa é
// criada antecipadamente. Todo o estado (pagas, restantes, %, próxima) é DERIVADO
// dos marcadores — fonte única, sem saldo armazenado.
//   installment:        { id, descricao, valorTotal, parcelas, valorParcela,
//                          dataPrimeira, frequencia, categoria, conta, observacoes, criadoEm }
//   installmentPayment: { installmentId, parcelNo(1..N), expenseId, valor, paidDate }
//   despesa gerada:     meta:{ source:'installment', installmentId, parcelNo }
// ══════════════════════════════════════════
function _round2(v) { return Math.round((Number(v) || 0) * 100) / 100; }

function _normInstallment(raw) {
  const r = raw || {};
  const N = Math.max(1, Math.round(Number(r.parcelas) || 1));
  const total = Math.max(0, _round2(r.valorTotal));
  let vp = _round2(r.valorParcela);
  if (!(vp > 0)) vp = _round2(total / N);
  return {
    id: r.id || uid(),
    descricao: String(r.descricao || '').trim() || 'Compra',
    valorTotal: total,
    parcelas: N,
    valorParcela: vp,
    dataPrimeira: r.dataPrimeira || dateStr(new Date()),
    frequencia: r.frequencia || 'mensal',
    categoria: r.categoria || (D.expCats && D.expCats[0]) || 'Outros',
    conta: String(r.conta || '').trim(),
    observacoes: String(r.observacoes || '').trim(),
    criadoEm: r.criadoEm || Date.now(),
  };
}

// Valor da parcela k (1..N): a ÚLTIMA absorve o resíduo de arredondamento, de modo
// que a soma das parcelas seja exatamente igual ao valorTotal.
function _instParcelaValor(inst, parcelNo) {
  const N = inst.parcelas || 1;
  const vp = _round2(inst.valorParcela);
  if (parcelNo >= N) return _round2(inst.valorTotal - vp * (N - 1));
  return vp;
}
// Vencimento da parcela k: dataPrimeira + frequência·(k−1). Mensal clampa dia curto.
function _instDueDate(inst, parcelNo) {
  const base = parseDate(inst.dataPrimeira);
  if (!base || isNaN(base)) return '';
  const k = Math.max(1, parcelNo) - 1;
  const freq = inst.frequencia || 'mensal';
  let d;
  if (freq === 'semanal')       d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + 7 * k);
  else if (freq === 'quinzenal') d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + 14 * k);
  else if (freq === 'anual')     d = new Date(base.getFullYear() + k, base.getMonth(), base.getDate());
  else { // mensal (default): preserva o dia, clampando ao último dia do mês curto
    const y = base.getFullYear(), mo = base.getMonth() + k, day = base.getDate();
    const last = new Date(y, mo + 1, 0).getDate();
    d = new Date(y, mo, Math.min(day, last));
  }
  return dateStr(d);
}
function _instPayment(instId, parcelNo) {
  return (D.installmentPayments || []).find(p => p.installmentId === instId && p.parcelNo === parcelNo) || null;
}
function _instPaidCount(inst) {
  return (D.installmentPayments || []).filter(p => p.installmentId === inst.id).length;
}
function _instValorPago(inst) {
  return _round2((D.installmentPayments || [])
    .filter(p => p.installmentId === inst.id)
    .reduce((s, p) => s + (Number(p.valor) || 0), 0));
}
// Estado derivado (FONTE ÚNICA). % concluído = parcelas pagas ÷ total (contagem).
function _instState(inst) {
  const N = inst.parcelas || 1;
  const pagas = Math.min(N, _instPaidCount(inst));
  const restantes = Math.max(0, N - pagas);
  const pct = N > 0 ? Math.max(0, Math.min(100, Math.round(pagas / N * 100))) : 0;
  const concluido = pagas >= N;
  const proximaNo = concluido ? null : pagas + 1; // confirmação sempre sequencial
  return {
    N, pagas, restantes, pct, concluido, proximaNo,
    proximaVenc: proximaNo ? _instDueDate(inst, proximaNo) : '',
    proximaValor: proximaNo ? _instParcelaValor(inst, proximaNo) : 0,
    pago: _instValorPago(inst),
    emAberto: _round2(inst.valorTotal - _instValorPago(inst)),
  };
}
// Reconciliação segura: remove APENAS marcadores órfãos — despesa vinculada
// inexistente (expenseId) ou parcelamento inexistente (installmentId). Não cria
// despesas, não migra nada. Como o estado é derivado, remover o marcador faz a
// parcela voltar sozinha ao estado "prevista". Retorna true se removeu algo.
function reconcileInstallmentPayments() {
  if (!Array.isArray(D.installmentPayments)) { D.installmentPayments = []; return false; }
  const expIds = new Set((D.expenses || []).map(e => e.id));
  const instIds = new Set((D.installments || []).map(i => i.id));
  const before = D.installmentPayments.length;
  D.installmentPayments = D.installmentPayments.filter(p => p && expIds.has(p.expenseId) && instIds.has(p.installmentId));
  return D.installmentPayments.length !== before;
}

// ══════════════════════════════════════════
// CENTRAL DE DÍVIDAS (Fase 2) — interface visual de D.debts / D.debtPayments
// ══════════════════════════════════════════
// Não cria estrutura nova, não copia registros, não materializa vencimentos nem
// reativa D.installments. Todas as operações leem/escrevem a fonte canônica (Fase 1).
const DEBT_TIPO_META = {
  financiamento: { lbl: 'Financiamento', chip: 'fin' },
  parcelamento:  { lbl: 'Parcelamento',  chip: 'parc' },
  emprestimo:    { lbl: 'Empréstimo',    chip: 'emp' },
  pessoal:       { lbl: 'Dívida pessoal', chip: 'pess' },
  outro:         { lbl: 'Outro',         chip: 'outro' },
};
const DEBT_STATUS_META = {
  ativa:     { lbl: 'Ativa',     cls: 'ativa' },
  atrasada:  { lbl: 'Em atraso', cls: 'atraso' },
  quitada:   { lbl: 'Quitada',   cls: 'quitada' },
  pausada:   { lbl: 'Pausada',   cls: 'pausada' },
  cancelada: { lbl: 'Cancelada', cls: 'cancelada' },
};
const DIV_FILTROS = [
  ['todas', 'Todas'], ['financiamento', 'Financiamentos'], ['parcelamento', 'Parcelamentos'],
  ['emprestimo', 'Empréstimos'], ['pessoal', 'Pessoais'], ['outro', 'Outros'],
  ['atraso', 'Em atraso'], ['quitada', 'Quitadas'],
];
let _dividasFiltro = 'todas';

// Resolve o nome do bem vinculado (sem alterar vínculos na renderização).
function _debtBemNome(d) {
  if (d.patrimonioId) { const p = getPatrimonio(d.patrimonioId); if (p) return p.nome; }
  if (d.vehicleId) {
    const v = (D.vehicles || []).find(x => x.id === d.vehicleId); if (v) return v.name;
    const pv = (D.patrimonios || []).find(x => x.tipo === 'veiculo' && (x._idOriginal === d.vehicleId || x.id === d.vehicleId));
    if (pv) return pv.nome;
  }
  return '';
}
function _debtHasBem(d) { return !!(d.patrimonioId || d.vehicleId); }
// Ativa para os totais: apenas ativa/atrasada (exclui quitada, cancelada, pausada).
function _debtIsAtiva(d) { const s = _debtStatus(d); return s === 'ativa' || s === 'atrasada'; }

function renderDividas() { renderDividasResumo(); renderDividasFiltros(); renderDividasList(); }

// ── Triagem da porta de entrada: bem financiado começa pelo Patrimônio ──
// Regra de produto: se a dívida nasceu para comprar um bem, o cadastro começa
// pelo bem; se existe sozinha, começa aqui. Sem bloqueio, só direcionamento.
function openDebtAddTriage() { openOverlay('debt-triage-sheet'); }
function _debtTriageGo(kind) {
  closeOverlay('debt-triage-sheet');
  if (kind === 'semvem') { openDebtForm(); return; }
  // Ordem importa: troca de aba primeiro (pode renderizar a Home e limpar flags),
  // depois arma o retorno e o switch de financiamento, e por fim abre o formulário.
  switchTab('patrimonio', 'mais');
  _finFlowReturn = 'dividas';
  _finFlowStartOn = true;
  if (kind === 'veiculo') openVehForm();
  else if (kind === 'imovel') openPatForm('imovel');
  else if (kind === 'outro') openPatForm('outro');
}

// ── Vincular uma dívida existente a um patrimônio (sem recriar nada) ──────────
// `_debtLinkTarget`: dívida cuja sheet de vínculo está aberta.
// `_debtLinkPending`: dívida a ser vinculada ao PRÓXIMO bem criado (fluxo "criar bem
// a partir da dívida") — garante que o novo bem NÃO gere uma segunda dívida.
var _debtLinkTarget = null;
var _debtLinkPending = null;
var _VINC_ICO = {
  veiculo: '<path d="M5 13l1.4-4.2A2 2 0 0 1 8.3 7.5h7.4a2 2 0 0 1 1.9 1.3L19 13v4a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H8v1a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z"/><circle cx="7.5" cy="16" r="1.1"/><circle cx="16.5" cy="16" r="1.1"/>',
  imovel: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  outro: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
};
function _vincOptHtml(onclick, ico, lbl, sub) {
  return `<button class="av-sheet-opt" onclick="${onclick}">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ico}</svg>
    <span class="debt-triage-opt-txt"><span class="debt-triage-opt-lbl">${escHtml(lbl)}</span>${sub?`<span class="debt-triage-opt-sub">${escHtml(sub)}</span>`:''}</span>
  </button>`;
}
function vincularDividaMenu(debtId) {
  const d = getDebt(debtId); if (!d) return;
  if (_debtHasBem(d)) { gdToast('Esta dívida já está vinculada a um bem.', { type: 'info' }); return; }
  closeOverlay('debt-menu-sheet');
  _debtLinkTarget = debtId;
  const body = document.getElementById('debt-link-body');
  if (body) {
    // Bens existentes compatíveis: ativos apenas (encerrados não recebem vínculo).
    const vehs = (D.vehicles || []).filter(v => _patLifecycleOf(v.id) !== 'encerrado');
    const pats = (D.patrimonios || []).filter(p => p.tipo !== 'veiculo' && (p.status || 'ativo') === 'ativo');
    const existOpts = [];
    vehs.forEach(v => existOpts.push(_vincOptHtml(`_vincularDividaExistente('${debtId}','veh','${v.id}')`, _VINC_ICO.veiculo, v.name || 'Veículo', 'Veículo')));
    pats.forEach(p => existOpts.push(_vincOptHtml(`_vincularDividaExistente('${debtId}','pat','${p.id}')`, _VINC_ICO[p.tipo] || _VINC_ICO.outro, p.nome || 'Bem', { imovel:'Imóvel', outro:'Outro bem' }[p.tipo] || 'Bem')));
    const existBlock = existOpts.length ? `
      <div><div class="debt-link-seclbl">Selecionar bem existente</div>
      <div style="display:flex;flex-direction:column;gap:8px">${existOpts.join('')}</div></div>` : '';
    const createBlock = `
      <div><div class="debt-link-seclbl">Criar novo bem a partir desta dívida</div>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${_vincOptHtml(`_vincularDividaNovoBem('${debtId}','veiculo')`, _VINC_ICO.veiculo, 'Criar novo veículo', 'Usa os dados desta dívida')}
        ${_vincOptHtml(`_vincularDividaNovoBem('${debtId}','imovel')`, _VINC_ICO.imovel, 'Criar novo imóvel', 'Usa os dados desta dívida')}
        ${_vincOptHtml(`_vincularDividaNovoBem('${debtId}','outro')`, _VINC_ICO.outro, 'Criar outro bem', 'Usa os dados desta dívida')}
      </div></div>`;
    body.innerHTML = existBlock + createBlock;
  }
  openOverlay('debt-link-sheet');
}
// Rota 1 — vincular a um bem que já existe: preenche só vehicleId/patrimonioId.
function _vincularDividaExistente(debtId, kind, targetId) {
  const d = getDebt(debtId); if (!d) return;
  if (_debtHasBem(d)) { gdToast('Esta dívida já está vinculada.', { type: 'info' }); return; }
  if (_patLifecycleOf(targetId) === 'encerrado') { gdToast('Bem encerrado não pode receber vínculo.', { type: 'info' }); return; }
  _relinkDebtToBem(d, targetId); // não toca saldo, parcelas, pagamentos nem projeções
  save();
  _debtLinkTarget = null;
  closeOverlay('debt-link-sheet');
  renderDividas();
  gdToast('Dívida vinculada a ' + _debtBemNome(d) + '.', { type: 'success' });
  openDebtDetail(debtId);
}
// Rota 2 — criar um novo bem a partir da dívida (o bem NÃO cria outra dívida).
function _vincularDividaNovoBem(debtId, tipo) {
  const d = getDebt(debtId); if (!d) return;
  if (_debtHasBem(d)) { gdToast('Esta dívida já está vinculada.', { type: 'info' }); return; }
  closeOverlay('debt-link-sheet'); closeOverlay('debt-detail-sheet');
  switchTab('patrimonio', 'mais');
  _debtLinkPending = debtId; // após switchTab (que pode limpar flags de fluxo)
  if (tipo === 'veiculo') {
    openVehForm();
    const nm = document.getElementById('vf-name'); if (nm && !nm.value) nm.value = d.titulo || '';
    const vv = document.getElementById('vf-valor'); if (vv && !vv.value && d.valorBem) vv.value = d.valorBem;
  } else {
    openPatForm(tipo);
    const nm = document.getElementById('pf-nome'); if (nm && !nm.value) nm.value = d.titulo || '';
    const vv = document.getElementById('pf-valor'); if (vv && !vv.value && d.valorBem) vv.value = d.valorBem;
  }
}

function renderDividasResumo() {
  const el = document.getElementById('dividas-resumo'); if (!el) return;
  const debts = D.debts || [];
  const ativas = debts.filter(_debtIsAtiva);
  const saldoTot = ativas.reduce((s, d) => s + _debtSaldo(d), 0);
  const pagoTot = ativas.reduce((s, d) => s + _debtPago(d), 0);
  const nAtraso = debts.filter(d => _debtStatus(d) === 'atrasada').length;
  // Próximo vencimento e total previsto vêm do RESOLVEDOR canônico (mesma projeção
  // usada por Home/Semana/Mês) — sem cálculo local duplicado.
  const proxPorDivida = _debtProximosPorDivida();
  const prox = proxPorDivida.find(v => v.dueDate) || null;
  const previsto = proxPorDivida.reduce((s, v) => s + v.valorRestante, 0);
  el.innerHTML = `
    <div class="card av-card div-resumo">
      <div class="div-resumo-top">
        <div class="div-resumo-lbl">Saldo devedor</div>
        <div class="div-resumo-val">${R(saldoTot)}</div>
      </div>
      <div class="div-resumo-grid">
        <div class="div-rc"><span class="div-rc-lbl">Já pago</span><span class="div-rc-val div-rc-pos">${R(pagoTot)}</span></div>
        <div class="div-rc"><span class="div-rc-lbl">Ativas</span><span class="div-rc-val">${ativas.length}</span></div>
        <div class="div-rc"><span class="div-rc-lbl">Em atraso</span><span class="div-rc-val ${nAtraso > 0 ? 'div-rc-warn' : ''}">${nAtraso}</span></div>
        <div class="div-rc"><span class="div-rc-lbl">Próximo venc.</span><span class="div-rc-val">${prox ? _fmtDataBR(prox.dueDate) : '—'}</span></div>
      </div>
      ${previsto > 0 ? `<div class="div-resumo-foot">Próximos pagamentos previstos <b>${R(previsto)}</b></div>` : ''}
    </div>`;
}

function renderDividasFiltros() {
  const el = document.getElementById('dividas-filtros'); if (!el) return;
  el.innerHTML = DIV_FILTROS.map(([k, lbl]) =>
    `<button class="div-chip${_dividasFiltro === k ? ' div-chip-on' : ''}" role="tab" aria-selected="${_dividasFiltro === k}" onclick="setDividasFiltro('${k}')">${lbl}</button>`).join('');
}
function setDividasFiltro(k) { _dividasFiltro = k; renderDividasFiltros(); renderDividasList(); }

function _debtMatchFiltro(d, f) {
  if (f === 'todas') return true;
  if (f === 'atraso') return _debtStatus(d) === 'atrasada';
  if (f === 'quitada') return _debtStatus(d) === 'quitada';
  return d.tipo === f;
}

function renderDividasList() {
  const list = document.getElementById('dividas-list'); if (!list) return;
  const all = D.debts || [];
  if (!all.length) { list.innerHTML = _dividasEmptyAll(); return; }
  const filtered = all.filter(d => _debtMatchFiltro(d, _dividasFiltro));
  if (!filtered.length) { list.innerHTML = _dividasEmptyFiltro(); return; }
  const rank = { atrasada: 0, ativa: 1, pausada: 2, quitada: 3, cancelada: 4 };
  const ordered = filtered.map(d => ({ d, st: _debtState(d) })).sort((a, b) => {
    const ra = rank[a.st.status] ?? 9, rb = rank[b.st.status] ?? 9;
    if (ra !== rb) return ra - rb;
    return String(a.st.proximaVenc || '~').localeCompare(String(b.st.proximaVenc || '~')) ||
      String(a.d.titulo || '').localeCompare(String(b.d.titulo || ''), 'pt-BR', { sensitivity: 'base' });
  });
  list.innerHTML = ordered.map(({ d, st }) => _debtCardHtml(d, st)).join('');
}

function _debtCardHtml(d, st) {
  const tm = DEBT_TIPO_META[d.tipo] || DEBT_TIPO_META.outro;
  const sm = DEBT_STATUS_META[st.status] || DEBT_STATUS_META.ativa;
  const bem = _debtBemNome(d);
  const sub = d.credor || '';
  const temParcelas = st.parcelasTotal > 0;
  const progLine = `${st.progress}% pago${temParcelas ? ` · ${st.parcelasPagas} de ${st.parcelasTotal} parcelas` : ''}`;
  const venc = st.proximaNo ? `<div class="div-card-next">Próxima: ${R(st.proximaValor)} · ${_fmtDataBR(st.proximaVenc)}</div>` : '';
  const muted = st.status === 'cancelada' || st.status === 'quitada' || st.status === 'pausada';
  const ariaFull = `${d.titulo}, ${tm.lbl}${sub ? ', ' + sub : ''}, saldo ${R(st.saldo)}, ${sm.lbl}`;
  return `
    <div class="div-card${muted ? ' div-card-muted' : ''}" role="button" tabindex="0" aria-label="${escHtml(ariaFull)}" onclick="openDebtDetail('${d.id}')">
      <div class="div-card-head">
        <div class="div-card-info">
          <div class="div-card-title" title="${escHtml(d.titulo)}">${escHtml(d.titulo)}</div>
          <div class="div-card-meta"><span class="div-tipo-chip div-tipo-${tm.chip}">${tm.lbl}</span>${sub ? `<span class="div-card-sub">${escHtml(sub)}</span>` : ''}</div>
        </div>
        <div class="div-card-end">
          <span class="div-card-saldo-lbl">Saldo</span>
          <span class="div-card-saldo">${R(st.saldo)}</span>
        </div>
      </div>
      <div class="div-card-prog"><span class="div-card-prog-fill" style="width:${st.progress}%"></span></div>
      <div class="div-card-foot">
        <span class="div-card-prog-txt">${progLine}</span>
        <span class="div-status s-${sm.cls}">${sm.lbl}</span>
      </div>
      ${venc}
      ${bem ? `<button class="div-card-vinc" onclick="event.stopPropagation();abrirBemDaDivida('${d.id}')">Vinculada a: ${escHtml(bem)}</button>` : ''}
    </div>`;
}

function _dividasEmptyAll() {
  return `<div class="div-empty">
    <div class="div-empty-title">Nenhuma dívida cadastrada</div>
    <div class="div-empty-txt">Cadastre financiamentos, compras parceladas, empréstimos, dívidas pessoais ou outras obrigações para acompanhar saldo, parcelas e vencimentos num só lugar.</div>
    <button class="btn btn-primary" style="width:auto;padding:11px 20px" onclick="openDebtAddTriage()">+ Adicionar dívida</button>
  </div>`;
}
function _dividasEmptyFiltro() {
  return `<div class="div-empty">
    <div class="div-empty-title">Nenhuma dívida neste filtro</div>
    <div class="div-empty-txt">Não há registros para o filtro selecionado.</div>
    <button class="btn btn-secondary" style="width:auto;padding:11px 20px" onclick="setDividasFiltro('todas')">Ver todas</button>
  </div>`;
}

// ── Detalhe da dívida ──
function openDebtDetail(id) {
  const d = getDebt(id); if (!d) return;
  const body = document.getElementById('debt-detail-body'); if (!body) return;
  const st = _debtState(d);
  const tm = DEBT_TIPO_META[d.tipo] || DEBT_TIPO_META.outro;
  const sm = DEBT_STATUS_META[st.status] || DEBT_STATUS_META.ativa;
  const bem = _debtBemNome(d);
  const temParcelas = st.parcelasTotal > 0;
  const idRow = [
    ['Tipo', tm.lbl],
    d.credor ? ['Credor', escHtml(d.credor)] : null,
    bem ? [(d.vehicleId ? 'Veículo' : 'Patrimônio'), escHtml(bem)] : null,
    d.dataInicio ? ['Início', _fmtDataBR(d.dataInicio)] : null,
  ].filter(Boolean);
  const valRows = [
    ['Valor original', R(d.valorOriginal)],
    d.amortizadoInicial > 0 ? ['Valor pago anteriormente', R(d.amortizadoInicial)] : null,
    ['Total pago', R(st.pago)],
    ['Saldo devedor', R(st.saldo)],
    temParcelas ? ['Parcelas pagas', `${st.parcelasPagas} de ${st.parcelasTotal}`] : null,
    d.valorParcela > 0 ? ['Valor da parcela', R(d.valorParcela)] : null,
    d.juros != null ? ['Juros', `${d.juros}%`] : null,
  ].filter(Boolean);
  const vencRows = (st.proximaNo && st.status !== 'cancelada' && st.status !== 'pausada') ? [
    ['Próximo vencimento', _fmtDataBR(st.proximaVenc)],
    ['Falta p/ a parcela atual', R(st.proximaValor)],
    temParcelas ? ['Parcelas restantes', String(st.parcelasTotal - st.parcelasPagas)] : null,
  ].filter(Boolean) : [];
  const rowsHtml = arr => arr.map(r => `<div class="pat-det-row"><span class="pat-det-row-lbl">${r[0]}</span><span class="pat-det-row-val">${r[1]}</span></div>`).join('');
  // Histórico de pagamentos (identidade por debtPaymentId; cada um desfazível).
  const pays = _debtPaymentsOf(d.id).slice()
    .sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')) || (b.parcelNo || 0) - (a.parcelNo || 0));
  // Amortização anterior ao cadastro (valor pago antes do Avenco) — informativo, NÃO é um
  // pagamento do app. Diferencia claramente "antes do cadastro" de "registrado no Avenco".
  const temAmort = _c(d.amortizadoInicial) > 0;
  const parcAmort = _debtParcelasDeAmort(d);
  // O texto precisa dizer a verdade das DUAS grandezas: o dinheiro abate o
  // saldo sempre; o calendário só anda quando o usuário declarou parcelas já
  // transcorridas. Antes esta linha afirmava que a amortização era "considerada
  // na projeção" — era exatamente o defeito, escrito na tela.
  const parcCrono = Math.max(0, Math.round(Number(d.parcelasPagasAntes) || 0));
  const priorHtml = temAmort ? `
    <div class="div-prior-card">
      <div class="div-prior-main">${R(d.amortizadoInicial)} pagos antes do cadastro no Avenco</div>
      ${temParcelas && parcAmort > 0 ? `<div class="div-prior-sub">${parcCrono > 0
        ? `Equivalente a ${parcAmort} ${parcAmort === 1 ? 'parcela' : 'parcelas'}; ${parcCrono} ${parcCrono === 1 ? 'já havia vencido' : 'já haviam vencido'} antes do cadastro.`
        : `Abate o saldo, sem alterar as datas de vencimento.`}</div>` : ''}
    </div>` : '';
  const histHtml = pays.length === 0
    ? `<div class="pagfin-empty">${temAmort ? 'Nenhum pagamento registrado no Avenco ainda.' : 'Nenhum pagamento registrado ainda.'}</div>`
    : pays.map(p => `
        <div class="pagfin-row">
          <div class="pagfin-row-body">
            <span class="pagfin-row-desc">${p.parcelNo ? `Parcela ${p.parcelNo}${temParcelas ? '/' + st.parcelasTotal : ''}` : 'Amortização extra'}</span>
            <span class="pagfin-row-date">${_fmtDataBR(p.data)}</span>
          </div>
          <span class="pagfin-row-val">−${R(p.valor || 0)}</span>
          <button class="div-pay-undo" onclick="event.stopPropagation();desfazerPagamentoDivida('${d.id}','${p.id}')" aria-label="Desfazer pagamento">${_patTrashSvg()}</button>
        </div>`).join('');
  // Próximos pagamentos (projeção local, somente leitura — não materializa nada).
  let proxHtml = '';
  if (temParcelas && st.proximaNo && st.status !== 'cancelada' && st.status !== 'pausada') {
    const linhas = [];
    for (let k = st.proximaNo; k <= Math.min(st.parcelasTotal, st.proximaNo + 2); k++) {
      const val = k === st.proximaNo ? st.proximaValor : _r(_debtParcelaCents(d, k));
      linhas.push(`<div class="pagfin-row"><div class="pagfin-row-body"><span class="pagfin-row-desc">Parcela ${k}/${st.parcelasTotal}</span><span class="pagfin-row-date">${_fmtDataBR(_debtDueDate(d, k))}</span></div><span class="pagfin-row-val div-prox-val">${R(val)}</span></div>`);
    }
    proxHtml = `<div class="parcel-det-hist-lbl">Próximos pagamentos</div><div class="pagfin-hist">${linhas.join('')}</div>`;
  }
  const podePagar = !st.quitada && st.status !== 'cancelada' && st.status !== 'pausada';
  const acaoPrimaria = st.quitada
    ? '<div class="pagfin-quitado">✓ Dívida quitada</div>'
    : st.status === 'cancelada'
      ? '<div class="div-selo-cancel">Dívida cancelada</div>'
      : st.status === 'pausada'
        ? `<button class="btn btn-secondary" style="width:100%" onclick="retomarDivida('${d.id}')">Retomar dívida</button>`
        : `<button class="btn btn-primary" style="width:100%" onclick="openDebtPay('${d.id}')">Registrar pagamento</button>`;
  body.innerHTML = `
    <div class="div-det-head">
      <div class="div-det-title">${escHtml(d.titulo)}</div>
      <div class="div-det-badges"><span class="div-tipo-chip div-tipo-${tm.chip}">${tm.lbl}</span><span class="div-status s-${sm.cls}">${sm.lbl}</span></div>
    </div>
    <div class="div-det-progress"><span class="div-det-progress-fill" style="width:${st.progress}%"></span></div>
    <div class="div-det-progtxt">${st.progress}% pago${temParcelas ? ` · ${st.parcelasPagas} de ${st.parcelasTotal} parcelas` : ''}</div>
    <div class="sec-label" style="margin:16px 0 8px">Valores</div>
    <div class="pat-list-group" style="margin-bottom:0">${rowsHtml(valRows)}</div>
    ${vencRows.length ? `<div class="sec-label" style="margin:16px 0 8px">Vencimentos</div><div class="pat-list-group" style="margin-bottom:0">${rowsHtml(vencRows)}</div>` : ''}
    ${idRow.length ? `<div class="sec-label" style="margin:16px 0 8px">Informações</div><div class="pat-list-group" style="margin-bottom:0">${rowsHtml(idRow)}</div>` : ''}
    ${d.observacoes ? `<div class="div-det-obs">${escHtml(d.observacoes)}</div>` : ''}
    <div class="div-det-actions">
      ${acaoPrimaria}
      ${!_debtHasBem(d) ? `<button class="btn btn-secondary" style="width:100%;margin-top:8px" onclick="vincularDividaMenu('${d.id}')">Vincular a um patrimônio</button>` : ''}
      <button class="btn btn-secondary" style="width:100%;margin-top:8px" onclick="openDebtMenu('${d.id}')">Mais ações</button>
    </div>
    <div class="parcel-det-hist-lbl" style="margin-top:16px">Histórico de pagamentos</div>
    ${priorHtml}
    <div class="pagfin-hist">${histHtml}</div>
    ${proxHtml}
    ${_debtHasBem(d) ? `<button class="div-bem-link" onclick="abrirBemDaDivida('${d.id}')">Vinculada a: ${escHtml(bem)} — abrir →</button>` : ''}
    <button class="btn btn-secondary" style="width:100%;margin-top:14px" onclick="closeOverlay('debt-detail-sheet')">Fechar</button>`;
  openOverlay('debt-detail-sheet');
}

// ── Menu de ações secundárias ──
function _debtMenuOpt(lbl, ico, onclick, danger) {
  const color = danger ? 'var(--rd)' : 'var(--text)';
  const ICO = {
    edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
    quit: '<path d="M20 6L9 17l-5-5"/>',
    pause: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
    play: '<polygon points="6 3 20 12 6 21 6 3"/>',
    cancel: '<circle cx="12" cy="12" r="10"/><line x1="4.9" y1="4.9" x2="19.1" y2="19.1"/>',
    trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    open: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>',
  };
  return `<button class="av-sheet-opt" onclick="${onclick}">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${danger ? 'var(--rd)' : 'currentColor'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICO[ico] || ''}</svg>
    <span style="flex:1;text-align:left;font-size:14px;font-weight:700;color:${color}">${lbl}</span>
  </button>`;
}
function openDebtMenu(id) {
  const d = getDebt(id); if (!d) return;
  const st = _debtState(d);
  document.getElementById('debt-menu-title').textContent = d.titulo;
  const opts = [];
  opts.push(_debtMenuOpt('Editar', 'edit', `closeOverlay('debt-menu-sheet');openDebtForm('${id}')`));
  if (!st.quitada && st.status !== 'cancelada') opts.push(_debtMenuOpt('Quitar', 'quit', `quitarDivida('${id}')`));
  if (st.status === 'pausada') opts.push(_debtMenuOpt('Retomar', 'play', `retomarDivida('${id}')`));
  else if (st.status !== 'cancelada' && !st.quitada) opts.push(_debtMenuOpt('Pausar', 'pause', `pausarDivida('${id}')`));
  if (st.status !== 'cancelada') opts.push(_debtMenuOpt('Cancelar', 'cancel', `cancelarDivida('${id}')`));
  if (_debtHasBem(d)) opts.push(_debtMenuOpt(d.vehicleId ? 'Abrir veículo' : 'Abrir patrimônio', 'open', `abrirBemDaDivida('${id}')`));
  else opts.push(_debtMenuOpt('Vincular a um patrimônio', 'open', `vincularDividaMenu('${id}')`));
  opts.push(_debtMenuOpt('Excluir', 'trash', `excluirDivida('${id}')`, true));
  document.getElementById('debt-menu-opts').innerHTML = opts.join('');
  openOverlay('debt-menu-sheet');
}

// ── Ações: quitar, pausar, retomar, cancelar, excluir (semânticas distintas) ──
function quitarDivida(id) {
  const d = getDebt(id); if (!d) return;
  const saldo = _debtSaldo(d);
  if (saldo <= 0) { gdToast('Esta dívida já está quitada.', { type: 'info' }); return; }
  gdConfirm({
    title: 'Quitar dívida',
    msg: `Registrar o pagamento final de ${R(saldo)} para liquidar "${d.titulo}"? O saldo ficará zero, o progresso 100% e a dívida será marcada como quitada.`,
    confirmText: 'Quitar', onConfirm: () => {
      _debtRegistrarPagamento(id, { valor: saldo, data: todayStr(), descricao: 'Quitação' });
      save(); closeOverlay('debt-menu-sheet'); renderDividas();
      if (document.getElementById('debt-detail-sheet')?.classList.contains('open')) openDebtDetail(id);
      refreshAfterDayEdit(); gdToast('Dívida quitada.', { type: 'success' });
    },
  });
}
function pausarDivida(id) {
  const d = getDebt(id); if (!d) return;
  d.status = 'pausada'; d.atualizadoEm = Date.now(); save();
  closeOverlay('debt-menu-sheet'); renderDividas();
  if (document.getElementById('debt-detail-sheet')?.classList.contains('open')) openDebtDetail(id);
  gdToast('Dívida pausada. Fora dos compromissos ativos até retomar.', { type: 'info' });
}
function retomarDivida(id) {
  const d = getDebt(id); if (!d) return;
  d.status = 'ativa'; d.atualizadoEm = Date.now(); save();
  closeOverlay('debt-menu-sheet'); renderDividas();
  if (document.getElementById('debt-detail-sheet')?.classList.contains('open')) openDebtDetail(id);
  gdToast('Dívida retomada.', { type: 'success' });
}
function cancelarDivida(id) {
  const d = getDebt(id); if (!d) return;
  gdConfirm({
    title: 'Cancelar dívida', variant: 'danger', confirmText: 'Cancelar dívida',
    msg: `Marcar "${d.titulo}" como cancelada? O saldo histórico é preservado (ela NÃO é considerada quitada), sai dos totais ativos e das projeções, e os pagamentos anteriores continuam no histórico.`,
    onConfirm: () => {
      d.status = 'cancelada'; d.atualizadoEm = Date.now(); save();
      closeOverlay('debt-menu-sheet'); renderDividas();
      if (document.getElementById('debt-detail-sheet')?.classList.contains('open')) openDebtDetail(id);
      gdToast('Dívida cancelada.', { type: 'info' });
    },
  });
}
function _doExcluirDivida(id) {
  D.debtPayments = (D.debtPayments || []).filter(p => p.debtId !== id);
  D.debts = (D.debts || []).filter(x => x.id !== id);
  save(); closeOverlay('debt-menu-sheet'); closeOverlay('debt-detail-sheet'); renderDividas();
  gdToast('Dívida excluída.', { type: 'success' });
}
// Política de exclusão (Opção A): dívida COM qualquer pagamento/despesa vinculada
// NÃO pode ser excluída pela interface comum — para preservar a rastreabilidade,
// o usuário deve Cancelar (mantém o registro) em vez de apagar. Só dívidas sem
// nenhum pagamento podem ser excluídas.
function excluirDivida(id) {
  const d = getDebt(id); if (!d) return;
  const nPag = _debtPaymentsOf(id).length;
  const temDespesa = (D.expenses || []).some(e => e.meta && e.meta.source === 'debt' && e.meta.debtId === id);
  if (nPag === 0 && !temDespesa) {
    gdConfirm({
      title: 'Excluir dívida', variant: 'danger', confirmText: 'Excluir',
      msg: `Excluir "${d.titulo}"? Não há pagamentos registrados — a exclusão é limpa.`,
      onConfirm: () => _doExcluirDivida(id),
    });
  } else {
    // Não excluir: oferecer Cancelar (preserva dívida, saldo histórico e despesas).
    // Confirmação única: ao confirmar, cancela diretamente (sem segundo diálogo).
    gdConfirm({
      title: 'Não é possível excluir', variant: 'warning', confirmText: 'Cancelar dívida', cancelText: 'Voltar',
      msg: `"${d.titulo}" tem ${nPag} pagamento(s) registrado(s) e não pode ser excluída, para não deixar despesas sem origem no histórico. Você pode Cancelar a dívida — ela sai dos totais ativos, mas o registro e os pagamentos são preservados.`,
      onConfirm: () => {
        const dd = getDebt(id); if (!dd) return;
        dd.status = 'cancelada'; dd.atualizadoEm = Date.now(); save();
        closeOverlay('debt-menu-sheet'); renderDividas();
        if (document.getElementById('debt-detail-sheet')?.classList.contains('open')) openDebtDetail(id);
        gdToast('Dívida cancelada.', { type: 'info' });
      },
    });
  }
}
function abrirBemDaDivida(id) {
  const d = getDebt(id); if (!d) return;
  closeOverlay('debt-menu-sheet'); closeOverlay('debt-detail-sheet');
  switchTab('patrimonio', 'mais');
  if (d.patrimonioId && getPatrimonio(d.patrimonioId)) { renderPatDetail(d.patrimonioId); return; }
  if (d.vehicleId) {
    const v = (D.vehicles || []).find(x => x.id === d.vehicleId);
    if (v) { _vehDetailMode = 'integrated'; renderVehPatDetail(v.id); return; }
  }
  renderPatrimonioHome();
}

// ── Registrar pagamento (usa exclusivamente a camada canônica da Fase 1) ──
var _debtPayTarget = null;
function openDebtPay(id) {
  const d = getDebt(id); if (!d) return;
  if (_debtSaldoCents(d) <= 0) { gdToast('Esta dívida já está quitada.', { type: 'info' }); return; }
  if (_debtStatus(d) === 'cancelada') { gdToast('Dívida cancelada.', { type: 'info' }); return; }
  if (_debtStatus(d) === 'pausada') { gdToast('Retome a dívida antes de pagar.', { type: 'info' }); return; }
  _debtPayTarget = { id };
  const st = _debtState(d);
  document.getElementById('debt-pay-summary').innerHTML =
    `<div class="pagfin-sum-row"><span>${escHtml(d.titulo)}</span><span>Saldo <b>${R(st.saldo)}</b></span></div>` +
    (st.proximaNo ? `<div class="pagfin-sum-row"><span>Parcela ${st.proximaNo}${st.parcelasTotal ? '/' + st.parcelasTotal : ''}</span><span>${R(st.proximaValor)}</span></div>` : '');
  document.getElementById('debt-pay-valor').value = st.proximaValor > 0 ? st.proximaValor : '';
  document.getElementById('debt-pay-data').value = _isoToBr(st.proximaVenc || todayStr());
  const cat = document.getElementById('debt-pay-cat');
  if (cat) cat.innerHTML = (D.expCats || []).map(c => `<option value="${escHtml(c)}"${c === d.categoria ? ' selected' : ''}>${escHtml(c)}</option>`).join('');
  document.getElementById('debt-pay-desc').value = '';
  const btn = document.getElementById('debt-pay-save'); if (btn) btn.disabled = false;
  openOverlay('debt-pay-sheet');
}
function salvarPagamentoDivida() {
  const t = _debtPayTarget; if (!t) return;
  const d = getDebt(t.id); if (!d) { closeOverlay('debt-pay-sheet'); return; }
  const btn = document.getElementById('debt-pay-save');
  if (btn && btn.disabled) return; // impede toque duplo
  if (_debtSaldoCents(d) <= 0) { closeOverlay('debt-pay-sheet'); gdToast('Dívida já quitada.', { type: 'info' }); return; }
  let valor = Number(document.getElementById('debt-pay-valor').value) || 0;
  if (valor <= 0) { gdToast('Informe um valor válido.', { type: 'error' }); return; }
  valor = Math.min(valor, _debtSaldo(d)); // nunca além do saldo
  const data = _brToIso(document.getElementById('debt-pay-data').value) || todayStr();
  const cat = document.getElementById('debt-pay-cat')?.value || d.categoria || (D.expCats[0] || 'Outros');
  const desc = (document.getElementById('debt-pay-desc')?.value || '').trim();
  const st = _debtState(d);
  if (btn) btn.disabled = true;
  _debtRegistrarPagamento(d.id, { valor, data, categoria: cat, descricao: desc, parcelNo: st.proximaNo || null });
  _debtPayTarget = null; haptic(10); save();
  closeOverlay('debt-pay-sheet');
  _afterDebtChange();
  if (document.getElementById('debt-detail-sheet')?.classList.contains('open')) openDebtDetail(d.id);
  refreshAfterDayEdit();
  gdToast(_debtQuitada(d) ? 'Pagamento registrado. Dívida quitada!' : 'Pagamento registrado. Lançamento criado em Despesas.', { type: 'success' });
}
function desfazerPagamentoDivida(debtId, payId) {
  const p = (D.debtPayments || []).find(x => x.id === payId); if (!p) return;
  gdConfirm({
    title: 'Desfazer pagamento', variant: 'danger', confirmText: 'Desfazer',
    msg: `Remover este pagamento de ${R(p.valor)}? A despesa vinculada também será removida e o saldo recalculado.`,
    onConfirm: () => {
      if (p.expenseId) D.expenses = (D.expenses || []).filter(e => e.id !== p.expenseId);
      D.debtPayments = (D.debtPayments || []).filter(x => x.id !== payId);
      save(); _afterDebtChange();
      if (document.getElementById('debt-detail-sheet')?.classList.contains('open')) openDebtDetail(debtId);
      refreshAfterDayEdit(); gdToast('Pagamento desfeito.', { type: 'success' });
    },
  });
}

// ── Formulário multi-tipo (campos adaptados; componentes reaproveitados) ──
let _debtFormTipo = 'parcelamento';
function openDebtForm(id) {
  const d = id ? getDebt(id) : null;
  document.getElementById('debt-edit-id').value = d ? d.id : '';
  document.getElementById('debt-modal-title').textContent = d ? 'Editar dívida' : 'Nova dívida';
  _debtFormTipo = d ? d.tipo : 'parcelamento';
  _renderDebtForm(d);
  openOverlay('modal-debt');
}
function _selectDebtTipo(t) {
  _debtFormTipo = t;
  const id = document.getElementById('debt-edit-id').value;
  _renderDebtForm(id ? getDebt(id) : null);
}
function _debtBemOptions(sel) {
  let html = `<option value="">Nenhum (dívida independente)</option>`;
  (D.patrimonios || []).filter(p => p.tipo !== 'veiculo').forEach(p => {
    html += `<option value="pat:${p.id}"${sel === 'pat:' + p.id ? ' selected' : ''}>${escHtml(p.nome)}</option>`;
  });
  (D.vehicles || []).forEach(v => {
    html += `<option value="veh:${v.id}"${sel === 'veh:' + v.id ? ' selected' : ''}>${escHtml(v.name)} (veículo)</option>`;
  });
  return html;
}
function _renderDebtForm(d) {
  const body = document.getElementById('debt-form-body'); if (!body) return;
  const t = _debtFormTipo;
  const editing = !!d;
  const g = (k, def) => d && d[k] != null && d[k] !== '' ? d[k] : (def == null ? '' : def);
  const selBem = d ? (d.patrimonioId ? 'pat:' + d.patrimonioId : (d.vehicleId ? 'veh:' + d.vehicleId : '')) : '';
  const saldoAtual = d ? _debtSaldo(d) : '';
  const tipoChips = editing ? '' : `
    <div class="df-tipos">
      ${Object.entries(DEBT_TIPO_META).map(([k, m]) => `<button type="button" class="df-tipo${t === k ? ' df-tipo-on' : ''}" onclick="_selectDebtTipo('${k}')">${m.lbl}</button>`).join('')}
    </div>`;
  const credorLbl = (t === 'financiamento' || t === 'emprestimo') ? 'Instituição / credor' : (t === 'pessoal' ? 'Pessoa' : 'Credor (opcional)');
  // Bloco de valores (financiamento usa financiado + saldo; demais usam valor + já pago)
  let valorBlock;
  if (t === 'financiamento') {
    valorBlock = `
      <div class="veh-form-row">
        <div class="form-group"><label class="form-label" for="df-valor">Valor financiado *</label><input class="form-input" id="df-valor" type="number" min="0" step="0.01" inputmode="decimal" value="${g('valorOriginal')}"></div>
        <div class="form-group"><label class="form-label" for="df-saldo">Saldo devedor atual *</label><input class="form-input" id="df-saldo" type="number" min="0" step="0.01" inputmode="decimal" value="${saldoAtual}"></div>
      </div>
      <div class="form-group"><label class="form-label" for="df-bemvalor">Valor do bem (opcional)</label><input class="form-input" id="df-bemvalor" type="number" min="0" step="0.01" inputmode="decimal" value="${g('valorBem')}"></div>`;
  } else {
    const jaPago = d ? d.amortizadoInicial : '';
    valorBlock = `
      <div class="veh-form-row">
        <div class="form-group"><label class="form-label" for="df-valor">${t === 'parcelamento' ? 'Valor total *' : 'Valor *'}</label><input class="form-input" id="df-valor" type="number" min="0" step="0.01" inputmode="decimal" value="${g('valorOriginal')}"></div>
        <div class="form-group"><label class="form-label" for="df-pago">Valor já pago antes (opc.)</label><input class="form-input" id="df-pago" type="number" min="0" step="0.01" inputmode="decimal" value="${jaPago}"></div>
      </div>`;
  }
  // Parcelas: financiamento/parcelamento/emprestimo têm; pessoal/outro opcionais
  const showParcelas = t !== 'pessoal';
  // "Parcelas já pagas antes": importa a posição por contagem (só cadastro em andamento,
  // fora do financiamento — que importa via saldo). NÃO gera despesas nem debtPayments.
  const pagasAntesRow = (showParcelas && t !== 'financiamento') ? `
    <div class="form-group"><label class="form-label" for="df-pagas-antes">Parcelas já pagas antes (opc.)</label><input class="form-input" id="df-pagas-antes" type="number" min="0" step="1" inputmode="numeric" placeholder="0" value="${d && d.parcelasPagasAntes ? d.parcelasPagasAntes : ''}"><div class="parcel-form-hint">Se a compra já está em andamento, informe quantas parcelas já foram pagas — é isso que posiciona o próximo vencimento. Vira saldo inicial importado, sem criar despesas nem afetar Início/Semana/Mês. Se você só deu uma entrada, deixe em branco e informe o valor ao lado.</div></div>` : '';
  const parcelasBlock = showParcelas ? `
    <div class="veh-form-row">
      <div class="form-group"><label class="form-label" for="df-parcelas">Nº de parcelas${t === 'parcelamento' || t === 'financiamento' ? '' : ' (opc.)'}</label><input class="form-input" id="df-parcelas" type="number" min="0" step="1" inputmode="numeric" value="${g('parcelasTotal')}"></div>
      <div class="form-group"><label class="form-label" for="df-valorparcela">Valor da parcela</label><input class="form-input" id="df-valorparcela" type="number" min="0" step="0.01" inputmode="decimal" value="${g('valorParcela')}"></div>
    </div>
    ${pagasAntesRow}
    <div class="veh-form-row">
      <div class="form-group"><label class="form-label" for="df-data">Primeiro vencimento</label><input class="form-input" id="df-data" type="text" inputmode="numeric" placeholder="dd/mm/aaaa" maxlength="10" value="${_isoToBr(g('dataInicio'))}" oninput="_maskDateBR(this)"></div>
      <div class="form-group"><label class="form-label" for="df-freq">Periodicidade</label><select class="form-input" id="df-freq">${['mensal', 'quinzenal', 'semanal', 'anual'].map(f => `<option value="${f}"${g('periodicidade', 'mensal') === f ? ' selected' : ''}>${({ mensal: 'Mensal', quinzenal: 'Quinzenal', semanal: 'Semanal', anual: 'Anual' })[f]}</option>`).join('')}</select></div>
    </div>` : `
    <div class="form-group"><label class="form-label" for="df-data">Vencimento (opcional)</label><input class="form-input" id="df-data" type="text" inputmode="numeric" placeholder="dd/mm/aaaa" maxlength="10" value="${_isoToBr(g('dataInicio'))}" oninput="_maskDateBR(this)"></div>
    <input type="hidden" id="df-parcelas" value="${g('parcelasTotal', 0)}"><input type="hidden" id="df-valorparcela" value="${g('valorParcela', 0)}"><input type="hidden" id="df-freq" value="mensal">`;
  const jurosBlock = (t === 'financiamento' || t === 'emprestimo') ? `<div class="form-group"><label class="form-label" for="df-juros">Juros % (opcional)</label><input class="form-input" id="df-juros" type="number" min="0" step="0.01" inputmode="decimal" value="${d && d.juros != null ? d.juros : ''}"></div>` : `<input type="hidden" id="df-juros" value="${d && d.juros != null ? d.juros : ''}">`;
  const catBlock = (t === 'parcelamento') ? `<div class="form-group"><label class="form-label" for="df-cat">Categoria</label><select class="form-input" id="df-cat">${(D.expCats || []).map(c => `<option value="${escHtml(c)}"${g('categoria') === c ? ' selected' : ''}>${escHtml(c)}</option>`).join('')}</select></div>` : `<input type="hidden" id="df-cat" value="${escHtml(g('categoria'))}">`;
  const statusBlock = editing ? `<div class="form-group"><label class="form-label" for="df-status">Status</label><select class="form-input" id="df-status">${['ativa', 'pausada', 'cancelada'].map(s => `<option value="${s}"${(d.status || 'ativa') === s ? ' selected' : ''}>${DEBT_STATUS_META[s].lbl}</option>`).join('')}</select></div>` : '';
  body.innerHTML = `
    ${tipoChips}
    <div class="form-group"><label class="form-label" for="df-titulo">Título *</label><input class="form-input" id="df-titulo" type="text" value="${escHtml(g('titulo'))}" placeholder="${t === 'parcelamento' ? 'Ex: iPhone' : t === 'financiamento' ? 'Ex: Financiamento do carro' : 'Ex: Empréstimo pessoal'}"></div>
    <div class="form-group"><label class="form-label" for="df-credor">${credorLbl}</label><input class="form-input" id="df-credor" type="text" value="${escHtml(g('credor'))}" placeholder="${t === 'pessoal' ? 'Nome da pessoa' : 'Ex: Caixa, Nubank'}"></div>
    ${valorBlock}
    ${parcelasBlock}
    ${jurosBlock}
    ${catBlock}
    <div class="form-group"><label class="form-label" for="df-bem">Bem relacionado (opcional)</label><select class="form-input" id="df-bem">${_debtBemOptions(selBem)}</select></div>
    ${statusBlock}
    <div class="form-group"><label class="form-label" for="df-obs">Observações (opcional)</label><input class="form-input" id="df-obs" type="text" value="${escHtml(g('observacoes'))}"></div>
    <button class="btn btn-primary" id="debt-save-btn" onclick="salvarDivida()">${editing ? 'Salvar alterações' : 'Criar dívida'}</button>
    <button class="btn btn-secondary" style="width:100%;margin-top:8px" onclick="closeOverlay('modal-debt')">Cancelar</button>`;
}
function salvarDivida() {
  const _saveBtn = document.getElementById('debt-save-btn');
  if (_saveBtn && _saveBtn.disabled) return; // proteção contra toque duplo
  const id = document.getElementById('debt-edit-id').value;
  const tipo = _debtFormTipo;
  const g = k => document.getElementById(k);
  const titulo = (g('df-titulo')?.value || '').trim();
  if (!titulo) { gdToast('Informe um título.', { type: 'error' }); return; }
  const credor = (g('df-credor')?.value || '').trim();
  const obs = (g('df-obs')?.value || '').trim();
  const dataInicio = _brToIso(g('df-data')?.value) || '';
  let parcelasTotal = Math.max(0, Math.round(Number(g('df-parcelas')?.value) || 0));
  const valorParcela = Math.max(0, Number(g('df-valorparcela')?.value) || 0);
  const periodicidade = g('df-freq')?.value || 'mensal';
  const juros = (g('df-juros') && g('df-juros').value !== '') ? Number(g('df-juros').value) : null;
  const categoria = g('df-cat')?.value || '';
  const bemVal = g('df-bem')?.value || '';
  let valorOriginal = 0, amortizadoInicial = 0, valorBem = null, parcelasPagasAntes = 0;
  if (tipo === 'financiamento') {
    valorOriginal = Number(g('df-valor')?.value) || 0;
    valorBem = (g('df-bemvalor') && g('df-bemvalor').value !== '') ? Number(g('df-bemvalor').value) : null;
    if (g('df-saldo') && g('df-saldo').value !== '') amortizadoInicial = _r(_c(valorOriginal) - _c(Number(g('df-saldo').value) || 0));
  } else {
    valorOriginal = Number(g('df-valor')?.value) || 0;
    // Importação de dívida em andamento: "parcelas já pagas antes" tem precedência e vira
    // saldo inicial (amortizadoInicial) — SEM criar despesas/debtPayments. Senão, usa o valor.
    const pagasAntes = Math.max(0, Math.round(Number(g('df-pagas-antes')?.value) || 0));
    if (pagasAntes > 0 && parcelasTotal > 0) {
      const vpc = valorParcela > 0 ? _c(valorParcela) : Math.round(_c(valorOriginal) / parcelasTotal);
      amortizadoInicial = pagasAntes >= parcelasTotal ? valorOriginal : _r(vpc * pagasAntes);
    } else {
      amortizadoInicial = (g('df-pago') && g('df-pago').value !== '') ? (Number(g('df-pago').value) || 0) : 0;
    }
    // A contagem é guardada ALÉM do dinheiro: ela é a única que diz quanto
    // tempo já passou. Convertê-la só em `amortizadoInicial` apagava a
    // diferença entre "dei uma entrada" e "já paguei dez parcelas".
    parcelasPagasAntes = pagasAntes;
  }
  if (!(valorOriginal > 0)) { gdToast('Informe o valor.', { type: 'error' }); return; }
  // Correção segura da quantidade de parcelas: com valor total e valor padrão, o total é
  // derivado (ceil) e a última parcela absorve o resíduo. Não altera saldo/amortização/
  // pagamentos — só a metadados de projeção (a verdade financeira continua sendo o saldo).
  if (valorParcela > 0 && valorOriginal > 0) parcelasTotal = Math.ceil(_c(valorOriginal) / _c(valorParcela));
  if (amortizadoInicial < 0) amortizadoInicial = 0;
  if (_c(amortizadoInicial) > _c(valorOriginal)) { gdToast('O valor já pago não pode exceder o valor original.', { type: 'error' }); return; }
  let patrimonioId = null, vehicleId = null;
  if (bemVal.startsWith('pat:')) patrimonioId = bemVal.slice(4);
  else if (bemVal.startsWith('veh:')) vehicleId = bemVal.slice(4);
  const fields = { tipo, titulo, credor, valorOriginal, amortizadoInicial, parcelasPagasAntes, parcelasTotal, valorParcela, periodicidade, dataInicio, juros, categoria, valorBem, patrimonioId, vehicleId, observacoes: obs };
  if (_saveBtn) _saveBtn.disabled = true; // validações passaram → trava o botão
  D.debts = D.debts || [];
  if (id) {
    const d = getDebt(id); if (!d) { closeOverlay('modal-debt'); return; }
    // Validação: valor original não pode ficar abaixo do já pago (inicial + pagamentos reais).
    const pagosCents = _debtPaymentsOf(id).reduce((s, p) => s + _c(p.valor), 0);
    if (_c(amortizadoInicial) + pagosCents > _c(valorOriginal)) { gdToast('Valor original menor que o total já pago. Ajuste os valores.', { type: 'error' }); return; }
    const statusSel = g('df-status')?.value || d.status;
    const idx = D.debts.indexOf(d);
    // Preserva id, _migradoDe, criadoEm e pagamentos; não duplica.
    D.debts[idx] = _normDebt(Object.assign({}, d, fields, { status: statusSel, atualizadoEm: Date.now() }));
  } else {
    D.debts.push(_normDebt(fields));
  }
  haptic(10); save();
  closeOverlay('modal-debt'); renderDividas();
  if (id && document.getElementById('debt-detail-sheet')?.classList.contains('open')) openDebtDetail(id);
  gdToast(id ? 'Dívida atualizada.' : 'Dívida cadastrada.', { type: 'success' });
}

// Compat: rotas antigas de Parcelamentos redirecionam para a central de Dívidas.
function renderParcelamentos() { renderDividas(); }
function openParcelForm(id) { openDebtForm(id); }

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
  // Possível fim da jornada especial. A decisão é adiada até este overlay
  // terminar de sumir — e só vale se nenhum outro tiver assumido.
  if (_jornadaCompromisso && JORNADA_OVERLAYS.includes(id)) _restaurarFabQuandoSeguro(id);
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
const INTERNAL_TABS = ['pendencias','fixos','reserva','patrimonio','dividas','conversor','pesquisa','ajustes','metas','lembretes'];
var _currentMainTab = 'inicio';        // última aba principal ativa (p/ engrenagem)
var _navOrigin      = 'mais';           // origem do Voltar de telas internas

function switchTab(tab, origin) {
  // Compat: a antiga aba "Parcelamentos" agora é a central de Dívidas.
  if (tab === 'parcelamentos') tab = 'dividas';
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'));
  const page = document.getElementById('page-'+tab);
  if (!page) return;
  page.classList.add('active');
  // Rascunho do lançamento só faz sentido enquanto o usuário está fora para
  // cadastrar um bem. Ir para qualquer outra aba é sair do fluxo sem intenção
  // de voltar — o rascunho morre aqui (a volta ao lançamento limpa antes).
  if (tab !== 'patrimonio' && _qaRascunho) _qaLimparRascunho();
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
  if(tab==='pesquisa')   { if (origin !== 'patrimonio') _srchState.bem = ''; renderPesquisa(); }
  if(tab==='ajustes')    renderAjustes();
  if(tab==='lembretes')  renderLembretes();
  if(tab==='pendencias') renderPendencias();
  if(tab==='patrimonio') renderPatrimonio();
  if(tab==='dividas') renderDividas();
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

// ══════════════════════════════════════════════════════════════════════════
// MODELO DO RESUMO MENSAL COMPARTILHÁVEL — CAMADA 1
//
// Função PURA que COMPÕE os motores canônicos; não recalcula finança nenhuma.
// Recebe o período por PARÂMETRO (`off`), nunca lê `monthOffset` nem `new Date()`
// para o que é relativo ao mês compartilhado — é isso que faz o relatório
// funcionar para qualquer mês passado e refletir correções feitas depois.
//
// Nada aqui persiste: não escreve em D, não chama save(), não cria snapshot.
// Gerar o relatório de maio hoje e de novo daqui a um ano devolve a verdade
// de maio SEGUNDO OS DADOS DE AGORA — que é exatamente o pedido.
//
// Fontes (únicas):
//   _monthMovementSummary(off)  caixa, naturezas e consumo por categoria
//   monthAggregate(off)         totais de caixa (checagem cruzada)
//   sumMonthReserva(off)        reserva do mês (estrutura à parte do caixa)
//   fmtMonthYear(off)           rótulo do período
//
// PRIVACIDADE: só agregados. Categoria (criada pelo usuário) entra; descrição
// de lançamento, título de dívida, nome de plataforma, qual bem foi vendido ou
// comprado, ids e metadata NUNCA entram — nem no modelo, nem por acidente.
// ══════════════════════════════════════════════════════════════════════════

// Quantas categorias de consumo aparecem nominalmente antes de "Outras".
const SHARE_TOP_CATEGORIAS = 5;

function _sharePct(parte, total) {
  return total > 0 ? Math.round((parte / total) * 100) : 0;
}

/** Modelo do mês `off` (0 = atual, −1 = anterior, …). Puro e determinístico. */
function _monthShareModel(off) {
  const periodo = Number.isFinite(off) ? off : 0;
  const sum = _monthMovementSummary(periodo);
  const agg = monthAggregate(periodo);
  const reserva = sumMonthReserva(periodo);
  const rotulo = fmtMonthYear(periodo);

  // ── Para onde foi: decomposição do CAIXA por natureza ──────────────────
  // As três parcelas somam exatamente totalCashOut (invariante do motor).
  const destino = [
    { chave: 'consumo',   rotulo: 'Dia a dia',  valor: sum.consumo,          pct: _sharePct(sum.consumo, sum.totalCashOut) },
    { chave: 'divida',    rotulo: 'Dívidas',    valor: sum.debtPayments,     pct: _sharePct(sum.debtPayments, sum.totalCashOut) },
    { chave: 'patrimonio',rotulo: 'Patrimônio', valor: sum.assetAcquisition, pct: _sharePct(sum.assetAcquisition, sum.totalCashOut) },
  ].filter(d => d.valor > 0);

  // ── Gastos do dia a dia: SÓ consumo, direto de consumoByCategory ───────
  // Muitas categorias viram "Outras", e o resto é o COMPLEMENTO exato: a soma
  // das linhas continua sendo o consumo total, sem sobra nem falta.
  const todas = Object.entries(sum.consumoByCategory)
    .map(([nome, valor]) => ({ nome, valor }))
    .sort((a, b) => b.valor - a.valor || a.nome.localeCompare(b.nome, 'pt-BR'));
  const principais = todas.slice(0, SHARE_TOP_CATEGORIAS).map(c => ({
    nome: c.nome, valor: c.valor, pct: _sharePct(c.valor, sum.consumo),
  }));
  const somaPrincipais = principais.reduce((s, c) => s + c.valor, 0);
  const restoValor = Math.round((sum.consumo - somaPrincipais) * 100) / 100;
  const outras = todas.length > SHARE_TOP_CATEGORIAS
    ? { quantidade: todas.length - SHARE_TOP_CATEGORIAS, valor: restoValor, pct: _sharePct(restoValor, sum.consumo) }
    : null;

  // ── De onde veio: operacional × extraordinária ─────────────────────────
  // Só vira seção quando há entrada extraordinária — sem ela, "entrou" já diz tudo.
  const origem = sum.extraordinaryIncome > 0
    ? {
        operacional: sum.operationalIncome,
        extraordinaria: sum.extraordinaryIncome,
        pctExtraordinaria: _sharePct(sum.extraordinaryIncome, sum.totalCashIn),
      }
    : null;

  // ── Comparação com o mês anterior: só quando é honesta ─────────────────
  // Exige mês anterior COM consumo (senão a variação percentual é ficção) e,
  // para o mês corrente (parcial), compara o mesmo número de dias decorridos.
  const comparacao = _shareComparacaoConsumo(periodo, sum.consumo);

  const vazio = sum.totalCashIn === 0 && sum.totalCashOut === 0;

  return {
    periodo: { off: periodo, rotulo, vazio },
    caixa: {
      entradas: sum.totalCashIn,
      saidas: sum.totalCashOut,
      resultado: sum.cashResult,          // PROTAGONISTA: entradas − saídas
    },
    destino,
    consumo: { total: sum.consumo, categorias: principais, outras },
    origem,
    comparacao,
    reserva: reserva !== 0 ? reserva : null,
    // Resultado operacional é SECUNDÁRIO e sempre rotulado como tal por quem
    // desenha: nunca existem dois números chamados só de "resultado".
    operacional: { receita: sum.operationalIncome, sobra: Math.round((sum.operationalIncome - sum.consumo) * 100) / 100 },
    _checagem: { aggReceitas: agg.receitas, aggGastos: agg.gastos, aggLiquido: agg.liquido },
  };
}

/** Variação do consumo contra o mês anterior, ou null quando não é comparável.
 *
 * Mês passado × mês passado: compara os dois meses inteiros.
 *
 * Mês CORRENTE: ele ainda está pela metade. Comparar 12 dias contra 31 diria
 * "você gastou 60% menos" quando na verdade o mês só não acabou. Então a
 * janela do mês anterior é recortada nos mesmos dias decorridos — usando o
 * MESMO motor, com outro conjunto de chaves. Este é o único ponto que olha o
 * relógio, e só para o mês corrente: um mês passado nunca depende de hoje.
 */
function _shareComparacaoConsumo(off, consumoAtual) {
  const parcialAte = off === 0 ? new Date().getDate() : null;
  const chaves = new Set(
    parcialAte ? monthDates(off - 1).slice(0, parcialAte) : monthDates(off - 1)
  );
  const anterior = _periodMovementSummary(chaves);
  if (!(anterior.consumo > 0)) return null;   // sem base: não inventa percentual
  const variacao = Math.round(((consumoAtual - anterior.consumo) / anterior.consumo) * 100);
  return { consumoAnterior: anterior.consumo, variacaoPct: variacao, parcial: !!parcialAte };
}

// ══════════════════════════════════════════════════════════════════════════
// PEÇA DO RESUMO MENSAL — CAMADA 2 (render)
//
// Cartão-relatório 1080×1350 (4:5): cabe em feed, story e mensageiro sem
// corte, e rende mais informação por pixel de altura do que o 9:16 anterior,
// que gastava 1920px para mostrar cinco números.
//
// Desenha A PARTIR DO MODELO e nada além dele. Não conhece `D`, não conhece
// `monthOffset` e não calcula dinheiro: se um número está errado aqui, ele já
// estava errado no modelo — e o modelo tem invariantes contra os motores.
//
// Seção sem conteúdo naquele mês simplesmente não é desenhada: a peça encolhe.
// Não se preenche espaço com nada inventado.
// ══════════════════════════════════════════════════════════════════════════

const SHARE_W = 1080, SHARE_H = 1350, SHARE_M = 84;
const SHARE_FONT = "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif";

function _sharePalette(dark) {
  return dark
    ? { bg1:'#0F1629', bg2:'#0A0F1E', text:'#E8EDFF', dim:'rgba(232,237,255,.62)', faint:'rgba(232,237,255,.38)', ac:'#5B8AF5', gn:'#4ADE80', rd:'#F87171', line:'rgba(232,237,255,.12)', card:'rgba(232,237,255,.06)', trilho:'rgba(232,237,255,.10)' }
    : { bg1:'#F2F0EA', bg2:'#E7E4DB', text:'#0D1440', dim:'rgba(13,20,64,.62)', faint:'rgba(13,20,64,.42)', ac:'#2563EB', gn:'#16A34A', rd:'#DC2626', line:'rgba(13,20,64,.10)', card:'rgba(13,20,64,.05)', trilho:'rgba(13,20,64,.08)' };
}

/** Desenha a peça do mês a partir do modelo. Devolve o canvas. */
function _renderShareCanvas(m, opts) {
  const o = opts || {};
  const W = SHARE_W, H = SHARE_H, M = SHARE_M, contentW = W - M * 2;
  const canvas = o.canvas || document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const dark = o.dark !== undefined ? !!o.dark : (document.documentElement.dataset.theme === 'dark');
  const C = _sharePalette(dark);
  const F = SHARE_FONT;

  const fonte = (peso, tam) => { ctx.font = `${peso} ${tam}px ${F}`; };
  // Reduz o corpo até caber; devolve o tamanho usado. Nunca corta número.
  const caber = (texto, maxW, base, peso) => {
    let t = base; fonte(peso, t);
    while (ctx.measureText(texto).width > maxW && t > 18) { t -= 2; fonte(peso, t); }
    return t;
  };
  // Encurta com reticências quando nem o corpo mínimo resolve (nome de categoria).
  const encurtar = (texto, maxW) => {
    if (ctx.measureText(texto).width <= maxW) return texto;
    let t = texto;
    while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
    return t + '…';
  };
  const arred = (x, y, w, h, r) => {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else {
      ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
      ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
    }
  };
  const risco = (y) => { ctx.fillStyle = C.line; ctx.fillRect(M, y, contentW, 2); };
  const secao = (txt, y) => {
    ctx.fillStyle = C.faint; fonte(700, 26); ctx.textAlign = 'left';
    ctx.fillText(txt.toUpperCase(), M, y);
  };

  // ── Fundo ──
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, C.bg1); g.addColorStop(1, C.bg2);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const brilho = ctx.createRadialGradient(W/2, 90, 0, W/2, 90, 620);
  brilho.addColorStop(0, dark ? 'rgba(91,138,245,.16)' : 'rgba(37,99,235,.10)');
  brilho.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = brilho; ctx.fillRect(0, 0, W, H);

  // ── Cabeçalho: marca + período ──
  let y = M;
  const bs = 66;
  arred(M, y, bs, bs, 18); ctx.fillStyle = C.ac; ctx.fill();
  ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 5; ctx.lineJoin = 'round';
  const tcx = M + bs/2, tcy = y + bs/2, ts = 19;
  ctx.beginPath();
  ctx.moveTo(tcx, tcy - ts); ctx.lineTo(tcx + ts*0.92, tcy + ts*0.72);
  ctx.lineTo(tcx - ts*0.92, tcy + ts*0.72); ctx.closePath(); ctx.stroke();
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = C.text; fonte(800, 38); ctx.fillText('Avenco', M + bs + 22, y + 30);
  ctx.fillStyle = C.faint; fonte(600, 24); ctx.fillText('Resumo mensal', M + bs + 22, y + 60);
  const mesTxt = m.periodo.rotulo.charAt(0).toUpperCase() + m.periodo.rotulo.slice(1);
  ctx.textAlign = 'right'; ctx.fillStyle = C.dim; fonte(700, 30);
  ctx.fillText(mesTxt, W - M, y + 46);
  ctx.textAlign = 'left';
  y += bs + 34; risco(y);

  // ── Mês sem movimentação: diz isso e encerra ──
  if (m.periodo.vazio) {
    ctx.textAlign = 'center';
    ctx.fillStyle = C.dim; fonte(700, 44);
    ctx.fillText('Nenhuma movimentação', W/2, H/2 - 20);
    ctx.fillStyle = C.faint; fonte(600, 30);
    ctx.fillText('registrada neste mês', W/2, H/2 + 30);
    fonte(600, 24); ctx.fillStyle = C.faint;
    ctx.fillText('Avenco', W/2, H - 60);
    ctx.textAlign = 'left';
    return canvas;
  }

  // ── Resultado do mês: o número protagonista (caixa) ──
  y += 62;
  ctx.fillStyle = C.dim; fonte(600, 30);
  ctx.fillText('Resultado do mês', M, y);
  y += 88;
  const resTxt = R(m.caixa.resultado);
  const resTam = caber(resTxt, contentW, 104, '800');
  ctx.fillStyle = m.caixa.resultado >= 0 ? C.gn : C.rd; fonte(800, resTam);
  ctx.fillText(resTxt, M, y);
  y += 44;
  const ctxTxt = `Entrou ${R(m.caixa.entradas)}  ·  Saiu ${R(m.caixa.saidas)}`;
  const ctxTam = caber(ctxTxt, contentW, 28, '600');
  ctx.fillStyle = C.faint; fonte(600, ctxTam);
  ctx.fillText(ctxTxt, M, y);

  // ── Para onde foi ──
  if (m.destino.length) {
    y += 52; risco(y); y += 48;
    secao('Para onde foi', y);
    y += 42;
    m.destino.forEach(d => {
      arred(M, y, contentW, 62, 16); ctx.fillStyle = C.card; ctx.fill();
      ctx.textAlign = 'right';
      ctx.fillStyle = C.dim; fonte(600, 26);
      ctx.fillText(`${d.pct}%`, W - M - 24, y + 40);
      const pctW = ctx.measureText('100%').width;
      const valTxt = R(d.valor);
      const valTam = caber(valTxt, contentW - 48 - pctW - 24 - 220, 30, '700');
      ctx.fillStyle = C.text; fonte(700, valTam);
      ctx.fillText(valTxt, W - M - 24 - pctW - 24, y + 40);
      const valW = ctx.measureText(valTxt).width;
      ctx.textAlign = 'left';
      const rotMaxW = contentW - 48 - pctW - 24 - valW - 24;
      const rotTam = caber(d.rotulo, rotMaxW, 30, '700');
      ctx.fillStyle = C.text; fonte(700, rotTam);
      ctx.fillText(encurtar(d.rotulo, rotMaxW), M + 24, y + 40);
      y += 72;
    });
    y -= 10;
  }

  // ── Gastos do dia a dia ──
  if (m.consumo.categorias.length) {
    y += 42; risco(y); y += 48;
    secao('Gastos do dia a dia', y);
    y += 46;
    const maior = m.consumo.categorias[0].valor || 1;
    const barraW = 220;
    m.consumo.categorias.forEach((c, i) => {
      const pctTxt = `${c.pct}%`, valTxt = R(c.valor);
      ctx.textAlign = 'right';
      fonte(600, 24); ctx.fillStyle = C.faint;
      ctx.fillText(pctTxt, W - M, y + 10);
      const pctW = ctx.measureText('100%').width;
      fonte(700, 28); ctx.fillStyle = C.text;
      ctx.fillText(valTxt, W - M - pctW - 20, y + 10);
      const valW = ctx.measureText(valTxt).width;
      ctx.textAlign = 'left';
      // Nome recebe o espaço que sobra: barra e números têm prioridade.
      const nomeMaxW = contentW - barraW - 24 - valW - pctW - 40;
      const nomeTam = caber(c.nome, nomeMaxW, 28, '700');
      ctx.fillStyle = C.text; fonte(700, nomeTam);
      ctx.fillText(encurtar(c.nome, nomeMaxW), M, y + 10);
      // Trilho + preenchimento proporcional à MAIOR categoria.
      const bx = M + contentW - barraW - valW - pctW - 40;
      arred(bx, y - 8, barraW, 14, 7); ctx.fillStyle = C.trilho; ctx.fill();
      arred(bx, y - 8, Math.max(6, Math.round(barraW * (c.valor / maior))), 14, 7);
      ctx.fillStyle = PALETTE[i % PALETTE.length]; ctx.fill();
      y += 54;
    });
    if (m.consumo.outras) {
      const ou = m.consumo.outras;
      ctx.fillStyle = C.faint; fonte(600, 26);
      ctx.fillText(`+ outras ${ou.quantidade} categoria${ou.quantidade === 1 ? '' : 's'}`, M, y + 8);
      ctx.textAlign = 'right'; ctx.fillStyle = C.dim; fonte(600, 26);
      ctx.fillText(`${R(ou.valor)}   ${ou.pct}%`, W - M, y + 8);
      ctx.textAlign = 'left';
      y += 44;
    }
    y -= 6;
  }

  // ── De onde veio (só quando há entrada extraordinária) ──
  if (m.origem) {
    y += 42; risco(y); y += 48;
    secao('De onde veio', y);
    y += 42;
    const meia = (contentW - 30) / 2;
    const bloco = (bx, rot, val, cor) => {
      arred(bx, y, meia, 92, 16); ctx.fillStyle = C.card; ctx.fill();
      ctx.fillStyle = C.faint; fonte(600, 24);
      ctx.fillText(encurtar(rot, meia - 40), bx + 20, y + 34);
      const t = caber(R(val), meia - 40, 32, '800');
      ctx.fillStyle = cor; fonte(800, t);
      ctx.fillText(R(val), bx + 20, y + 72);
    };
    bloco(M, 'Operação', m.origem.operacional, C.text);
    bloco(M + meia + 30, 'Venda de bem', m.origem.extraordinaria, C.ac);
    y += 100;
  }

  // ── Contexto: comparação e reserva ──
  const contexto = [];
  if (m.comparacao) {
    const v = m.comparacao.variacaoPct;
    contexto.push([
      m.comparacao.parcial ? 'Dia a dia vs. mesmo período do mês anterior' : 'Dia a dia vs. mês anterior',
      `${v > 0 ? '+' : ''}${v}%`,
      v > 0 ? C.rd : C.gn,
    ]);
  }
  if (m.reserva !== null) {
    contexto.push(['Reserva do mês', (m.reserva > 0 ? '+' : '') + R(m.reserva), m.reserva >= 0 ? C.gn : C.rd]);
  }
  if (contexto.length) {
    y += 42; risco(y); y += 46;
    contexto.forEach(([rot, val, cor]) => {
      ctx.textAlign = 'right'; ctx.fillStyle = cor; fonte(700, 28);
      ctx.fillText(val, W - M, y);
      const valW = ctx.measureText(val).width;
      ctx.textAlign = 'left'; ctx.fillStyle = C.dim; fonte(600, 26);
      ctx.fillText(encurtar(rot, contentW - valW - 30), M, y);
      y += 44;
    });
  }

  // ── Rodapé ──
  ctx.textAlign = 'center'; ctx.fillStyle = C.faint; fonte(600, 24);
  ctx.fillText('Avenco', W/2, H - 60);
  ctx.textAlign = 'left';
  return canvas;
}

// ══════════════════════════════════════════
// COMPARTILHAR RESUMO MENSAL — CAMADA 3
// ══════════════════════════════════════════
// Único ponto com I/O: modelo → peça → PNG → compartilhar ou baixar.
// O mês compartilhado é o EXIBIDO (`monthOffset`), lido aqui e passado adiante.
// Não altera D, não chama save(), não cria lançamento, não mexe em monthOffset
// e não persiste snapshot. Falhar aqui não deixa rastro financeiro.
function shareMonthReport() {
  const off = monthOffset;
  const mLabel = fmtMonthYear(off);
  let canvas;
  try { canvas = _renderShareCanvas(_monthShareModel(off)); }
  catch (e) { console.error(e); gdToast('Não foi possível gerar a imagem.', { type: 'error' }); return; }
  canvas.toBlob(blob => {
    if (!blob) { gdToast('Não foi possível gerar a imagem.', { type: 'error' }); return; }
    const nome = `avenco-${mLabel.replace(/\s+/g, '-').replace(/\./g, '')}.png`;
    const file = new File([blob], nome, { type: 'image/png' });
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: `Avenco — ${mLabel}` }).catch(() => {});
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = nome;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }, 'image/png');
}

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
          if (type === 'exp') { D.expenses = D.expenses.filter(e => e.id !== id); reconcileFixedPayments(); reconcileDebtPayments(); reconcilePendencias(); }
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
// Pendência que originou o formulário aberto agora. Memória EFÊMERA de UI: só
// vira vínculo persistido se o usuário chegar a salvar. Cancelar não deixa
// relação fantasma — a pendência fica concluída sem despesa, igual a quem
// responde "Não" ao ser perguntado.
var _pendOrigemId = null;
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
  // Resumo semântico do mês (mesmos totais de caixa; apenas separa a composição das saídas).
  const sum = _monthMovementSummary(monthOffset);

  const balEl = document.getElementById('home-balance');
  if (balEl) {
    balEl.className = 'hc-balance ' + (liq >= 0 ? 'pos' : 'neg');
    // Zero é um valor válido: sempre exibir R$ 0,00 (nunca esconder com '—').
    animCount(balEl, liq, 700);
  }
  const incEl = document.getElementById('home-inc');
  const expEl = document.getElementById('home-exp');
  if (incEl) incEl.textContent = R(inc);
  if (expEl) expEl.textContent = R(exp);

  // Detalhamento discreto das saídas: só aparece quando há saída que não é consumo.
  const brkEl = document.getElementById('home-cash-breakdown');
  if (brkEl) {
    if (sum.assetAcquisition > 0 || sum.debtPayments > 0) {
      const parts = [];
      if (sum.consumo > 0)          parts.push(`<span class="hc-brk-item"><span class="hc-brk-dot c"></span>Gastos do dia a dia <b>${R(sum.consumo)}</b></span>`);
      if (sum.assetAcquisition > 0) parts.push(`<span class="hc-brk-item"><span class="hc-brk-dot p"></span>Patrimônio <b>${R(sum.assetAcquisition)}</b></span>`);
      if (sum.debtPayments > 0)     parts.push(`<span class="hc-brk-item"><span class="hc-brk-dot d"></span>Dívidas <b>${R(sum.debtPayments)}</b></span>`);
      brkEl.innerHTML = parts.join('');
      brkEl.style.display = '';
    } else {
      brkEl.style.display = 'none';
    }
  }

  // 2. Chart
  setTimeout(drawHomeChart, 40);

  // 3. Insight — show only when there's actual data
  const insightWrap = document.getElementById('home-insight');
  const insightText = document.getElementById('home-insight-text');
  if (insightWrap && insightText) {
    if (inc > 0 || exp > 0) {
      insightWrap.style.display = '';
      insightText.textContent = buildMonthInsight(sum);
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

// Insight de CONSUMO: numerador = gastos do dia a dia (consumo); denominador =
// receita OPERACIONAL (asset-sale nunca no denominador). Sem % absurdo se op=0.
function buildMonthInsight(sum) {
  const opInc = sum.operationalIncome, consumo = sum.consumo;
  if (sum.totalCashIn === 0 && sum.totalCashOut === 0) return 'Nenhuma movimentação registrada este mês. Comece lançando sua primeira receita ou gasto.';
  if (consumo === 0) return `Nenhum gasto do dia a dia lançado até agora este mês.`;
  if (opInc === 0)   return `Você registrou ${R(consumo)} em gastos do dia a dia e ainda não registrou receita operacional neste mês.`;
  const ratio = consumo / opInc;
  if (ratio < 0.5) return `Mês tranquilo: você consumiu ${Math.round(ratio*100)}% da sua receita operacional.`;
  if (ratio < 0.8) return `Consumo equilibrado: ${Math.round(ratio*100)}% da receita operacional foi para gastos do dia a dia.`;
  if (ratio <= 1)  return `Consumo apertado: ${Math.round(ratio*100)}% da receita operacional foi consumida.`;
  return `Atenção: seus gastos do dia a dia (${R(consumo)}) já passaram a receita operacional (${R(opInc)}) neste mês.`;
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

    // Compromissos PREVISTOS do dia (projeção derivada de D.debts; nunca despesa).
    // Não entram no líquido realizado do dia; apenas exibição, com indicação visual.
    const dayVencs = _debtVencimentosNoPeriodo(d, d);
    const vencItems = dayVencs.map(v => {
      const sm = VENC_STATUS_META[v.status] || VENC_STATUS_META.previsto;
      return `<div class="dacc-tx dacc-venc" role="button" tabindex="0" onclick="event.stopPropagation();openDebtDetail('${v.debtId}')" aria-label="${escHtml(v.titulo + ', ' + sm.lbl + ', ' + R(v.valorRestante))}">
        <div class="dacc-tx-ico dacc-venc-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/></svg></div>
        <div class="dacc-tx-info"><div class="dacc-tx-lbl">${escHtml(v.titulo)} <span class="venc-chip venc-${sm.cls}">${sm.lbl}</span></div><div class="dacc-tx-cat">Previsto${v.parcelNo ? ` · parcela ${v.parcelNo}/${v.parcelasTotal}` : ''}</div></div>
        <div class="dacc-tx-amt dacc-venc-amt">${R(v.valorRestante)}</div>
      </div>`;
    }).join('');

    const hasData = dayInc > 0 || exps.length > 0;
    const hasContent = hasData || dayVencs.length > 0;
    const txCount = (D.platforms.filter(p=>getDayPlatIncome(d,p.id)>0).length) + exps.length;
    const subLabel = isOff ? 'Folga' : hasData ? txCount + (txCount===1?' lançamento':' lançamentos') : (dayVencs.length ? dayVencs.length + (dayVencs.length===1?' previsto':' previstos') : 'Nenhum lançamento');
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
        <div class="dacc-dot ${hasData?'dacc-dot-active':dayVencs.length?'dacc-dot-venc':'dacc-dot-empty'}"></div>
        <div class="dacc-info">
          <div class="dacc-name">${dayLabel}${isToday?' <span style="font-size:9px;background:var(--ac-t);color:var(--ac);border-radius:6px;padding:2px 6px;font-weight:700">HOJE</span>':''}</div>
          <div class="dacc-sub">${subLabel}</div>
        </div>
        <div class="dacc-right">
          ${hasData ? `<div class="dacc-liq" style="color:${liqColor}">${liqSign}${R(dayLiq)}</div>` : ''}
          <div class="dacc-chev"><svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg></div>
        </div>
      </div>
      <div class="dacc-body"><div class="dacc-body-in">${hasContent ? platItems + expItems + vencItems : emptyMsg}${editFooter}</div></div>
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
  const bemRow = document.getElementById('qa-bem-row'); if (bemRow) bemRow.style.display = type === 'gas' ? '' : 'none';
  const aqWrap = document.getElementById('qa-aq-wrap'); if (aqWrap) aqWrap.style.display = (type === 'gas' && _qaReclassivel) ? '' : 'none';
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
  // Durante a jornada especial o FAB fica oculto: ele vive sob as folhas e o
  // toque que fecha uma delas cairia nele.
  if (_jornadaCompromisso) { f.style.display = 'none'; return; }
  const active = document.querySelector('.page.active');
  const id = active ? active.id : '';
  f.style.display = (id === 'page-inicio' || id === 'page-semana' || id === 'page-mes') ? '' : 'none';
}

// ══════════════════════════════════════════════════════════════════════════
// POLÍTICA DE EDIÇÃO — fonte única de "o que o formulário genérico pode mudar"
//
// Regra de produto: a mesma operação nunca é mantida em dois lugares à mão. Um
// pagamento de dívida vive na despesa E no marcador `debtPayments` (que guarda
// o próprio `valor`, lido por `_debtPagoCents`); uma venda de patrimônio vive
// no item de receita com `platformId: null`, e é esse `null` que a mantém fora
// da receita operacional. Editar esses campos pelo formulário genérico mudaria
// um lado só — o caixa passaria a dizer um número e a dívida (ou o ritmo de
// receita) outro, sem aviso.
//
// Por isso, origem estrutural aqui é APRESENTADA, não editada: o formulário
// mostra a operação e manda para o fluxo canônico, que sabe mexer nos dois
// lados. Lançamento manual — receita, gasto e aquisição — segue editável como
// sempre; a proteção não se aplica a ele.
//
// `fixed-payment` NÃO entra na proteção: o marcador de baixa não copia valor
// nenhum (só fixedId/cycle/expenseId/paidDate) e `qaConfirm` já sincroniza
// ciclo e data de pagamento, inclusive bloqueando conflito de ciclo. Não há
// divergência possível ali, e o comportamento aprovado fica intacto.
// ══════════════════════════════════════════════════════════════════════════
const EDICAO_LIVRE = Object.freeze({
  origemEstrutural: null, podeEditarValor: true, podeEditarData: true,
  podeEditarTipo: true, podeEditarPlataforma: true, podeEditarNatureza: true,
  podeEditarVinculo: true, titulo: '', explicacao: '', ctaLabel: '', destinoCanonico: null,
});

function _movementEditPolicy(item) {
  if (!item || typeof item !== 'object') return EDICAO_LIVRE;
  const meta = (item.meta && typeof item.meta === 'object') ? item.meta : null;
  const source = meta ? meta.source : null;

  // Pagamento de dívida: valor e data pertencem ao marcador em debtPayments.
  if (source === 'debt') {
    return Object.freeze({
      origemEstrutural: 'debt',
      podeEditarValor: false, podeEditarData: false, podeEditarTipo: false,
      podeEditarPlataforma: false, podeEditarNatureza: false, podeEditarVinculo: false,
      titulo: 'Pagamento de dívida',
      explicacao: 'Valor e data são controlados pela dívida.',
      ctaLabel: 'Abrir dívida',
      destinoCanonico: meta.debtId ? { tipo: 'divida', id: meta.debtId } : null,
    });
  }

  // Venda de patrimônio: é `platformId: null` que a mantém como entrada
  // extraordinária. Uma edição genérica atribuiria uma plataforma e a venda
  // viraria receita operacional, mudando o ritmo e a razão de consumo.
  if (source === 'asset-sale') {
    const alvo = meta.vehicleId ? { tipo: 'veiculo', id: meta.vehicleId }
               : meta.patrimonioId ? { tipo: 'patrimonio', id: meta.patrimonioId }
               : null;
    return Object.freeze({
      origemEstrutural: 'asset-sale',
      podeEditarValor: false, podeEditarData: false, podeEditarTipo: false,
      podeEditarPlataforma: false, podeEditarNatureza: false, podeEditarVinculo: false,
      titulo: 'Venda de patrimônio',
      explicacao: 'Esta entrada pertence à venda de um bem.',
      ctaLabel: 'Abrir patrimônio',
      destinoCanonico: alvo,
    });
  }

  return EDICAO_LIVRE;
}

// Só quem é apresentado em modo leitura (dívida e venda). Baixa de fixo e
// lançamento manual continuam no formulário normal.
function _edicaoSomenteLeitura(item) { return _movementEditPolicy(item).origemEstrutural !== null; }

// ── Fase B: reclassificação explícita de "Tipo de saída" (só despesa manual) ──
// Uma despesa é reclassificável se NÃO tem origem estrutural protegida (debt/fixed).
var _qaReclassivel = true;
// Reclassificar = oferecer "Foi para comprar um bem?" e gravar/remover o
// override de natureza. Só isso: valor, data, categoria, descrição e vínculo
// comum seguem editáveis em qualquer despesa não protegida por _movementEditPolicy.
function _expIsReclassificavel(e) {
  if (!e) return true; // criação: sempre manual
  const src = e.meta && e.meta.source;
  return src !== 'debt' && src !== 'fixed-payment' && src !== 'pendencia';
}
// Grava/remove SOMENTE o override de natureza numa despesa manual. asset-acquisition
// adiciona meta.nature; "consumo" (default) remove o override, preservando o resto.
// Nunca toca valor, data, descrição, categoria, vínculo, source nem qualquer dado da dívida.
function _expSetNature(expObj, nature) {
  if (nature === 'asset-acquisition') {
    if (!expObj.meta || typeof expObj.meta !== 'object') expObj.meta = {};
    expObj.meta.nature = 'asset-acquisition';
  } else if (expObj.meta && typeof expObj.meta === 'object') {
    delete expObj.meta.nature;
    if (Object.keys(expObj.meta).length === 0) delete expObj.meta; // não deixa meta vazio
  }
}
// Estado do switch "Foi para comprar um bem?": 'consumo' (default) ou 'aquisicao'.
// Retorna sempre 'consumo' quando o bloco está oculto (receita ou despesa de origem
// estrutural) → a natureza dessas nunca passa por aqui.
function _qaSaidaValue() {
  const wrap = document.getElementById('qa-aq-wrap');
  if (!wrap || wrap.style.display === 'none') return 'consumo';
  return document.getElementById('qa-saida-aquisicao')?.checked ? 'aquisicao' : 'consumo';
}
// Existe algum bem que possa RECEBER uma aquisição agora? Mesmo critério de
// _bemVinculoOptions: só bens ativos entram.
function _qaTemBemAtivo() {
  return (D.vehicles || []).some(v => _patLifecycleOf(v.id) === 'ativo')
      || (D.patrimonios || []).some(p => p.tipo !== 'veiculo' && (p.status || 'ativo') === 'ativo');
}
function qaOnSaidaChange() {
  const aq = !!document.getElementById('qa-saida-aquisicao')?.checked;
  // O rótulo do vínculo reflete a obrigatoriedade: comprando um bem, ele deixa
  // de ser opcional.
  const lbl = document.getElementById('qa-bem-lbl');
  if (lbl) lbl.textContent = aq ? 'Qual bem?' : 'Relacionado a (opcional)';
  // Ligar o switch sem ter nenhum bem cadastrado seria um beco sem saída
  // descoberto só no Salvar. O próprio campo passa a oferecer o cadastro.
  const semBem = aq && !_qaTemBemAtivo();
  const sel = document.getElementById('qa-bem-sel');
  const add = document.getElementById('qa-bem-add');
  if (sel) sel.style.display = semBem ? 'none' : '';
  if (add) add.style.display = semBem ? '' : 'none';
}
// Prepara o switch ao abrir o formulário.
function _qaInitSaida(nature) {
  const cb = document.getElementById('qa-saida-aquisicao');
  if (cb) cb.checked = nature === 'asset-acquisition';
  qaOnSaidaChange();
}

// Registro por trás de um editRef (só leitura; não altera nada).
function _qaRegistroDe(ref) {
  if (!ref) return null;
  if (ref.kind === 'exp')  return (D.expenses   || []).find(x => x.id === ref.id) || null;
  if (ref.kind === 'item') return (D.incomeItems || []).find(x => x.id === ref.id) || null;
  return null; // 'legacy' é sempre receita manual — nunca estrutural
}

let _qaProtegidoAlvo = null;

// Mostra a operação e desliga tudo que é editável. Nenhuma gravação acontece
// nesta tela: não há Salvar nem Excluir — a entidade dona é quem altera.
function _qaMostrarProtegido(registro, politica) {
  _qaProtegidoAlvo = politica.destinoCanonico;
  const ocultar = ['qa-compr-slot', 'qa-type-toggle', 'qa-amt-row', 'qa-date-row', 'qa-cat-row',
                   'qa-aq-wrap', 'qa-bem-row', 'qa-plat-row', 'qa-desc-row', 'qa-suggest-row',
                   'qa-save-btn', 'qa-del-btn'];
  ocultar.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
  const painel = document.getElementById('qa-protegido');
  if (painel) painel.style.display = '';
  const txt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  txt('qa-prot-tit', politica.titulo);
  txt('qa-prot-sub', politica.explicacao);
  txt('qa-prot-desc', registro.description || registro.note || politica.titulo);
  txt('qa-prot-valor', R(registro.amount || 0));
  txt('qa-prot-data', _fmtDataBR(localDateKey(registro.date) || registro.date));
  const cta = document.getElementById('qa-prot-cta');
  if (cta) { cta.textContent = politica.ctaLabel; cta.style.display = politica.destinoCanonico ? '' : 'none'; }
  const titulo = document.getElementById('qa-title');
  if (titulo) titulo.textContent = politica.titulo;
}

// Devolve o formulário ao estado editável (o painel é reaproveitado a cada abertura).
function _qaEsconderProtegido() {
  _qaProtegidoAlvo = null;
  const painel = document.getElementById('qa-protegido');
  if (painel) painel.style.display = 'none';
  ['qa-compr-slot', 'qa-type-toggle', 'qa-amt-row', 'qa-date-row', 'qa-desc-row', 'qa-save-btn']
    .forEach(id => { const el = document.getElementById(id); if (el) el.style.display = ''; });
  // As linhas condicionais (categoria, plataforma, bem, aquisição, sugestão e o
  // botão excluir) são reposicionadas pelo próprio fluxo de abertura.
}

// Leva ao fluxo canônico dono da operação. Não edita nada aqui.
function qaAbrirOrigem() {
  const alvo = _qaProtegidoAlvo;
  if (!alvo) return;
  _qaEdit = null;
  _qaSaving = true;
  closeOverlay('modal-quick-add');
  _restaurarFabQuandoSeguro('modal-quick-add');
  if (alvo.tipo === 'divida') { switchTab('dividas', _currentMainTab); openDebtDetail(alvo.id); return; }
  switchTab('patrimonio', 'mais');
  if (alvo.tipo === 'veiculo') { _vehDetailId = alvo.id; _vehDetailMode = 'integrated'; renderVehPatDetail(alvo.id); return; }
  if (alvo.tipo === 'patrimonio') { renderPatDetail(alvo.id); return; }
}

function openQuickAdd(editRef) {
  _qaEdit = editRef || null;
  _qaSaving = false;
  _pendOrigemId = null;   // o "+" nunca herda a origem de uma pendência anterior
  _hideFabForSheet();
  const sb = document.getElementById('qa-save-btn'); if (sb) sb.disabled = false;
  _qaPopulateSelects();
  const dateEl = document.getElementById('qa-date');
  const amtEl = document.getElementById('qa-amt-input');
  const descEl = document.getElementById('qa-desc');
  document.getElementById('qa-suggest-row').style.display = 'none';
  _qaEsconderProtegido();

  // Origem estrutural: apresenta e sai. Não monta formulário editável nenhum,
  // venha o toque de Recentes, da Pesquisa, da Semana ou de onde for.
  const _reg = _qaRegistroDe(_qaEdit);
  const _pol = _movementEditPolicy(_reg);
  if (_reg && _pol.origemEstrutural) {
    _qaApplyMode();
    _qaMostrarProtegido(_reg, _pol);
    openOverlay('modal-quick-add');
    return;
  }

  // Antes de qualquer ramo: a faixa reflete o estado no instante da abertura.
  renderFaixaCompromissos();

  if (!_qaEdit) {
    // ── Criação ──
    if (dateEl) dateEl.value = selDate() || todayStr();
    if (amtEl) amtEl.value = '';
    if (descEl) descEl.value = '';
    qaType = 'rec';
    _qaReclassivel = true;           // criação é sempre despesa manual reclassificável
    _qaApplyMode();
    _qaInitSaida('consumo');         // default: gasto do dia a dia
    qaSetType('rec');
    _populateBemSel('qa-bem-sel', _pendVehicleId ? 'veh:' + _pendVehicleId : '');
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
  const bemRowE = document.getElementById('qa-bem-row'); if (bemRowE) bemRowE.style.display = type === 'gas' ? '' : 'none';
  document.getElementById('qa-plat-row').style.display = type === 'rec' ? '' : 'none';

  if (dateEl) dateEl.value = date || todayStr();
  if (amtEl) amtEl.value = amount ? String(amount) : '';
  if (descEl) descEl.value = desc;
  if (pid) { const s = document.getElementById('qa-plat-sel'); if (s) s.value = pid; }
  if (cat) { const s = document.getElementById('qa-cat-sel'); if (s) s.value = cat; }
  // "Relacionado a" + "Tipo de saída": pré-seleciona vínculo e natureza da despesa em edição.
  let _qaBemVal = '', _eNature = 'consumo';
  if (_qaEdit.kind === 'exp') {
    const _e = (D.expenses || []).find(x => x.id === _qaEdit.id);
    _qaBemVal = _expBemSelValue(_e);
    _qaReclassivel = (type === 'gas') && _expIsReclassificavel(_e);
    if (_e && _movementNature(_e) === 'asset-acquisition') _eNature = 'asset-acquisition';
  } else {
    _qaReclassivel = false;
  }
  _populateBemSel('qa-bem-sel', _qaBemVal);
  _qaInitSaida(_eNature);
  const aqWrapE = document.getElementById('qa-aq-wrap');
  if (aqWrapE) aqWrapE.style.display = (type === 'gas' && _qaReclassivel) ? '' : 'none';
  openOverlay('modal-quick-add');
}

// ══════════════════════════════════════════════════════════════════════════
// RASCUNHO DO LANÇAMENTO — ida e volta para "Cadastrar um bem"
//
// Ligar "Foi para comprar um bem?" sem ter nenhum bem cadastrado levava a um
// beco sem saída: o usuário só descobria a falta no Salvar. Agora ele sai daqui
// para o cadastro canônico de patrimônio e volta com o que já tinha digitado.
//
// O rascunho é MEMÓRIA EFÊMERA DA UI: não entra em D, Firestore, localStorage
// nem em coleção nova, e por isso não sobrevive a um reload — de propósito. Ele
// morre ao salvar, ao cancelar o lançamento e ao sair do fluxo sem intenção de
// voltar (troca de aba que não seja o próprio Patrimônio).
//
// Voltar do cadastro apenas SELECIONA o bem criado. Não grava a despesa, não
// cria pagamento de dívida e não interpreta o valor do lançamento como entrada
// ou amortização de um financiamento: aquisição e dívida continuam distintas.
// ══════════════════════════════════════════════════════════════════════════
var _qaRascunho = null;

function _qaCapturarRascunho() {
  const ativa = document.querySelector('.page.active');
  return {
    aba: ativa ? (ativa.id || '').replace(/^page-/, '') : 'inicio',
    edicao: _qaEdit,
    tipo: qaType,
    valor: document.getElementById('qa-amt-input')?.value || '',
    data: document.getElementById('qa-date')?.value || '',
    categoria: document.getElementById('qa-cat-sel')?.value || '',
    plataforma: document.getElementById('qa-plat-sel')?.value || '',
    descricao: document.getElementById('qa-desc')?.value || '',
    bem: document.getElementById('qa-bem-sel')?.value || '',
    aquisicao: _qaSaidaValue() === 'aquisicao',
  };
}

// Repõe os campos por cima do formulário já reaberto. `bemSel`, quando vem,
// é o vínculo do bem recém-criado e tem precedência sobre o do rascunho.
function _qaAplicarRascunho(r, bemSel) {
  if (!r) return;
  if (!r.edicao && r.tipo && r.tipo !== qaType) qaSetType(r.tipo);
  const set = (id, v) => { const el = document.getElementById(id); if (el != null && el) el.value = v; };
  set('qa-amt-input', r.valor);
  if (r.data) set('qa-date', r.data);
  if (r.descricao) set('qa-desc', r.descricao);
  const catSel = document.getElementById('qa-cat-sel');
  if (catSel && r.categoria && [...catSel.options].some(o => o.value === r.categoria)) catSel.value = r.categoria;
  const platSel = document.getElementById('qa-plat-sel');
  if (platSel && r.plataforma && [...platSel.options].some(o => o.value === r.plataforma)) platSel.value = r.plataforma;
  // O select é repopulado para que o bem recém-criado exista como opção.
  _populateBemSel('qa-bem-sel', bemSel || r.bem || '');
  _qaInitSaida(r.aquisicao ? 'asset-acquisition' : 'consumo');
}

function _qaLimparRascunho() { _qaRascunho = null; }

// Sai do lançamento PRESERVANDO o rascunho (ao contrário de qaCancel) e abre o
// cadastro canônico de patrimônio — a mesma folha de tipo do botão "+" da aba.
// Nenhum bem, dívida ou despesa é criado aqui.
function qaCadastrarBem() {
  _qaRascunho = _qaCapturarRascunho();
  _qaEdit = null;
  _pendVehicleId = null;
  _pendOrigemId = null;
  _qaSaving = true;                 // trava um Salvar atrasado enquanto estamos fora
  const sb = document.getElementById('qa-save-btn'); if (sb) sb.disabled = true;
  closeOverlay('modal-quick-add');
  _restoreFab();
  switchTab('patrimonio', 'mais');  // renderPatrimonioHome limpa flags de OUTROS fluxos
  openPatSheet();
}

// Volta ao lançamento. `bemSel` presente = bem criado; ausente = cancelamento.
function _qaVoltarAoLancamento(bemSel) {
  const r = _qaRascunho;
  if (!r) return false;
  _qaRascunho = null;               // limpa ANTES do switchTab (que descarta rascunho pendente)
  switchTab(r.aba || 'inicio');
  openQuickAdd(r.edicao || null);
  _qaAplicarRascunho(r, bemSel);
  return true;
}
// Cancelou o cadastro: volta com tudo como estava, sem bem novo e sem gravar nada.
function qaVoltarSemBem() { _qaVoltarAoLancamento(''); }

// Fechar a folha de tipo é cancelamento explícito. `closePatSheet` continua
// existindo para os fechamentos que NÃO são cancelamento (escolha de tipo,
// troca de aba), por isso o desvio mora aqui e não lá.
function patSheetDismiss() {
  closePatSheet();
  if (_qaRascunho) qaVoltarSemBem();
}

// Fecha o formulário e limpa o estado de edição (Voltar/Cancelar → origem).
function qaCancel() {
  _qaEdit = null;
  _pendVehicleId = null;
  _pendOrigemId = null;
  _qaSaving = false;
  _qaLimparRascunho();  // cancelar o lançamento encerra o rascunho de vez
  const sb = document.getElementById('qa-save-btn'); if (sb) sb.disabled = false;
  closeOverlay('modal-quick-add');
  _restaurarFabQuandoSeguro('modal-quick-add');
}

function qaConfirm() {
  if (_qaSaving) return; // impede duplicação por duplo toque
  // Rede de segurança do gravador: mesmo que a UI seja contornada, um lançamento
  // de origem estrutural nunca é regravado por aqui.
  if (_edicaoSomenteLeitura(_qaRegistroDe(_qaEdit))) return;
  const amt = parseFloat(document.getElementById('qa-amt-input')?.value);
  if (!amt || amt <= 0) { gdToast('Informe um valor válido.', { type: 'error' }); return; }
  const date = document.getElementById('qa-date')?.value || todayStr();
  const desc = document.getElementById('qa-desc')?.value || '';
  _qaSaving = true;
  const saveBtn = document.getElementById('qa-save-btn');
  if (saveBtn) saveBtn.disabled = true;

  // Reclassificação (Fase B): "aquisição de patrimônio" EXIGE bem ativo vinculado.
  // Pré-valida antes de qualquer mutação para não deixar edição pela metade.
  const _saida = _qaSaidaValue();
  if (_saida === 'aquisicao') {
    const _bemSel = document.getElementById('qa-bem-sel')?.value || '';
    const _bemId = _bemSel ? _bemSel.slice(4) : '';
    if (!_bemSel || _patLifecycleOf(_bemId) !== 'ativo') {
      gdToast('Para registrar como compra/entrada de patrimônio, selecione em "Relacionado a" um bem ativo.', { type: 'error' });
      _qaSaving = false; if (saveBtn) saveBtn.disabled = false; return;
    }
  }

  const edit = _qaEdit;
  if (edit) {
    // ── EDIÇÃO: atualiza o mesmo registro (sem duplicar) ──
    if (edit.kind === 'exp') {
      const e = (D.expenses||[]).find(x => x.id === edit.id);
      if (e) {
        const cat = document.getElementById('qa-cat-sel')?.value || e.category;
        // Se a despesa veio de "Dar baixa", mantém o vínculo coerente com a nova data.
        const pay = (D.fixedPayments||[]).find(p => p.expenseId === e.id);
        if (pay) {
          const newCycle = fxCycleOf(date);
          if (newCycle && newCycle !== pay.cycle) {
            // Mudou de mês: bloqueia se já existir baixa desse fixo no ciclo de destino.
            const conflito = (D.fixedPayments||[]).some(p => p !== pay && p.fixedId === pay.fixedId && p.cycle === newCycle);
            if (conflito) {
              gdToast('Já existe uma baixa deste gasto fixo no mês de destino. Edição cancelada.', { type: 'error' });
              _qaSaving = false; if (saveBtn) saveBtn.disabled = false;
              return; // não altera nada
            }
            pay.cycle = newCycle; // move o marcador para o ciclo correto
          }
          pay.paidDate = localDateKey(date) || date; // "Pago em DD/MM" reflete a nova data
        }
        e.date = date; e.category = cat; e.description = desc || cat; e.amount = amt;
        // Vínculo com patrimônio (adicionar / trocar / remover) — independente da categoria.
        _expSetBemLink(e, document.getElementById('qa-bem-sel')?.value || '');
        // Tipo de saída (só despesa manual reclassificável): grava/remove o override de natureza.
        if (_expIsReclassificavel(e)) _expSetNature(e, _saida === 'aquisicao' ? 'asset-acquisition' : 'consumo');
        save(); checkBudgetAlerts(cat);
        refreshHomeFixosAlert();
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
    _pendVehicleId = null;
    const expObj = { id: uid(), date, category: cat, description: desc || cat, amount: amt };
    // Origem pendência: o vínculo é gravado dos DOIS lados, como já acontece em
    // dívida e gasto fixo (despesa + marcador). Só aqui — no Salvar — a relação
    // passa a existir. A natureza continua consumo: `source` diz de onde veio,
    // não o que é.
    const _pendOrigem = _pendOrigemId ? (D.pendencias || []).find(x => x.id === _pendOrigemId) : null;
    if (_pendOrigem) {
      expObj.meta = { source: 'pendencia', pendenciaId: _pendOrigem.id };
      _pendOrigem.despesaId = expObj.id;
    }
    _pendOrigemId = null;
    D.expenses.push(expObj);
    // Vínculo com patrimônio escolhido em "Relacionado a" (opcional, canônico).
    _expSetBemLink(expObj, document.getElementById('qa-bem-sel')?.value || '');
    // Tipo de saída: se "aquisição", grava o override (bem já validado como ativo acima).
    if (_saida === 'aquisicao') _expSetNature(expObj, 'asset-acquisition');
    save();
    checkBudgetAlerts(cat);
    notifyRegistered(amt, desc || cat, cat);
  }

  // NÃO reseta _qaSaving aqui: mantém o bloqueio até o formulário ser reaberto,
  // impedindo que um segundo toque (síncrono) grave um duplicado.
  _qaEdit = null;
  _qaLimparRascunho();   // lançamento gravado: o rascunho cumpriu seu papel
  closeOverlay('modal-quick-add');
  _restaurarFabQuandoSeguro('modal-quick-add');
  haptic(10);
  _refreshAfterEntry();
}

// Exclui o lançamento em edição (com confirmação) e atualiza as telas.
function qaDelete() {
  const edit = _qaEdit;
  if (!edit) return;
  if (_edicaoSomenteLeitura(_qaRegistroDe(edit))) return; // desfaz-se pela entidade dona
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
      _restaurarFabQuandoSeguro('modal-quick-add');
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
  // Detalhe do veículo aberto → atualiza resumos (custo/despesas) imediatamente.
  if (_vehDetailId && document.getElementById('pat-veh-detail-view')?.style.display !== 'none') { renderVehPatDetail(_vehDetailId); }
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
  // Orçamento/limite mede SÓ consumo: aquisição de patrimônio e pagamento de dívida
  // são saída de caixa, mas não estouram o limite de consumo da categoria.
  const catSpent = (D.expenses || [])
    .filter(e => monthDates(0).includes(e.date) && e.category === cat && _movementNature(e) === 'consumo')
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
        <div class="srow-body"><div class="srow-label">Versão</div><div class="srow-value">Avenco v66</div></div>
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
    return (v && v.status !== 'arquivado' && v.status !== 'vendido') ? v : null;
  };
  const livePat = id => {
    const x = (D.patrimonios || []).find(y => y.id === id);
    return (x && x.status !== 'inativo' && x.status !== 'encerrado') ? x : null;
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
    v.status !== 'arquivado' && v.status !== 'vendido' && (v.linkedPendencias || []).includes(p.id));
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
      onCancel: () => { gdToast('Pendência concluída!', { type: 'success' }); _encerrarJornadaCompromisso(null); },
    });
  } else {
    gdToast('Pendência concluída!', { type: 'success' });
    _encerrarJornadaCompromisso(null);
  }
}

function openPendenciaAsExpense(p) {
  _qaEdit = null;
  _qaSaving = false;
  _hideFabForSheet();
  const sb = document.getElementById('qa-save-btn'); if (sb) sb.disabled = false;
  _pendVehicleId = p.vehicleId || null;
  _pendOrigemId = p.id;
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
  // Sem faixa de compromissos aqui: o formulário já veio de um compromisso, e
  // deixar conteúdo de uma abertura anterior no slot seria pior ainda.
  const slotCompr = document.getElementById('qa-compr-slot');
  if (slotCompr) slotCompr.innerHTML = '';
  openOverlay('modal-quick-add');
}

function reopenPendencia(id) {
  const p = (D.pendencias || []).find(x => x.id === id);
  if (!p) return;
  // Reabrir com despesa viva criaria duas verdades ao mesmo tempo: um
  // compromisso em aberto e o gasto que o quitou. Apagar o dinheiro por conta
  // própria seria pior — quem decide sobre dinheiro é o usuário, no lançamento.
  const desp = _pendDespesaVinculada(p);
  if (desp) {
    gdAlert({
      title: 'Existe um gasto registrado',
      type: 'warning',
      msg: `Esta pendência foi concluída com um gasto de ${R(desp.amount)} em ${_fmtDataBR(desp.date)}. Para reabri-la, exclua esse lançamento primeiro — ela volta sozinha para os compromissos em aberto.`,
    });
    return;
  }
  p.status = 'aberta';
  delete p.completedAt;
  save();
  renderPendList();
  renderPendInicio();
  gdToast('Pendência reaberta.');
}

function deletePendencia(id) {
  // Apagar a pendência deixaria a despesa apontando para algo que não existe
  // mais. Não há cascata: o gasto é do usuário, não do cadastro.
  const p = (D.pendencias || []).find(x => x.id === id);
  const desp = p ? _pendDespesaVinculada(p) : null;
  if (desp) {
    gdAlert({
      title: 'Existe um gasto vinculado',
      type: 'warning',
      msg: `Esta pendência tem um gasto de ${R(desp.amount)} em ${_fmtDataBR(desp.date)}. Exclua o lançamento primeiro se quiser mesmo apagá-la — nenhum gasto é removido junto.`,
    });
    return;
  }
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
  if (id && _patEncerradoBloqueado(id)) return;
  // Remove toasts residuais de ações anteriores (ex.: "Patrimônio adicionado")
  document.querySelectorAll('.av-toast').forEach(e => e.remove());
  const v = id ? (D.vehicles || []).find(x => x.id === id) : null;
  _vehShowView('veh-form-view');
  const cont = document.getElementById('veh-form-cont');
  if (!cont) return;
  // Veio do lançamento para cadastrar um bem: Voltar é cancelamento e devolve
  // o usuário ao lançamento com o rascunho intacto.
  const cancelAction = id ? `_refreshVehDetail('${id}')` : (_qaRascunho ? 'qaVoltarSemBem()' : 'renderVehList()');
  // ── Financiamento inline (paridade com imóvel/outro; fonte única D.debts) ──
  const _vDebt = id ? _vehPrincipalDebt(id) : null;
  const fin0 = _vDebt ? {
    instituicao: _vDebt.credor, valorBem: _vDebt.valorBem, valorFinanciado: _vDebt.valorOriginal,
    saldoDevedor: _debtSaldo(_vDebt), dataInicio: _vDebt.dataInicio, frequencia: _vDebt.periodicidade,
    observacoes: _vDebt.observacoes,
  } : null;
  const finOn = !!fin0 || _finFlowStartOn;
  _finFlowStartOn = false;
  // Fluxo "criar bem a partir da dívida": financiamento já existe → não recriar.
  const linkPending = !!_debtLinkPending;
  const freqSel = ['mensal','quinzenal','semanal','anual','irregular'].map(fr =>
    `<option value="${fr}" ${(fin0?.frequencia||'mensal')===fr?'selected':''}>${({mensal:'Mensal',quinzenal:'Quinzenal',semanal:'Semanal',anual:'Anual',irregular:'Irregular / sem periodicidade'})[fr]}</option>`).join('');
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
    ${linkPending ? `<div class="pf-fin-linknote">Este veículo será vinculado à dívida já existente. O financiamento não é recriado.</div>` : `
    <div class="pf-fin-toggle">
      <div class="pf-fin-toggle-txt">
        <span class="pf-fin-toggle-lbl">Este veículo é financiado</span>
        <span class="pf-fin-toggle-sub">Registre o financiamento junto com o veículo</span>
      </div>
      <label class="pf-switch">
        <input type="checkbox" id="vf-fin-on" ${finOn?'checked':''} onchange="_toggleVfFin()" aria-label="Este veículo é financiado">
        <span class="pf-switch-track"><span class="pf-switch-thumb"></span></span>
      </label>
    </div>
    <div id="vf-fin-fields" class="pf-fin-fields" style="display:${finOn?'block':'none'}">
      <div class="form-group">
        <label class="form-label">Instituição / credor</label>
        <input class="form-input" id="vff-inst" value="${escHtml(fin0?.instituicao||'')}" placeholder="Ex: Banco Toyota, Santander">
      </div>
      <div class="veh-form-row">
        <div class="form-group"><label class="form-label">Valor do bem (${escHtml(currSym)})</label><input class="form-input" id="vff-bem" type="number" min="0" step="any" value="${fin0?.valorBem||''}" placeholder="80000"></div>
        <div class="form-group"><label class="form-label">Valor financiado (${escHtml(currSym)}) *</label><input class="form-input" id="vff-financiado" type="number" min="0" step="any" value="${fin0?.valorFinanciado||''}" placeholder="60000"></div>
      </div>
      <div class="veh-form-row">
        <div class="form-group"><label class="form-label">Saldo devedor (${escHtml(currSym)}) *</label><input class="form-input" id="vff-saldo" type="number" min="0" step="any" value="${fin0?.saldoDevedor ?? ''}" placeholder="45000"></div>
        <div class="form-group"><label class="form-label">Início</label><input class="form-input" id="vff-inicio" type="date" value="${fin0?.dataInicio||''}"></div>
      </div>
      <div class="form-group">
        <label class="form-label">Frequência</label>
        <select class="form-input" id="vff-freq">${freqSel}</select>
      </div>
      <div class="form-group">
        <label class="form-label">Observações do financiamento</label>
        <textarea class="form-input" id="vff-obs" rows="2" placeholder="Anotações (taxa, seguro, etc.)">${escHtml(fin0?.observacoes||'')}</textarea>
      </div>
    </div>`}
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
  const linkPendingId = _debtLinkPending; // fluxo "criar bem a partir da dívida"
  // ── Financiamento inline: valida ANTES de mutar D.vehicles (evita estado parcial). ──
  const finOn = document.getElementById('vf-fin-on')?.checked;
  let finFields = null;
  if (finOn) {
    const financiadoRaw = document.getElementById('vff-financiado')?.value;
    const saldoRaw = document.getElementById('vff-saldo')?.value;
    if (financiadoRaw === '' || financiadoRaw == null || saldoRaw === '' || saldoRaw == null) {
      gdToast('Preencha valor financiado e saldo devedor (ou desligue "Este veículo é financiado").', { type: 'error' });
      return;
    }
    finFields = {
      titulo: name, credor: (document.getElementById('vff-inst')?.value || '').trim(),
      valorBem: Number(document.getElementById('vff-bem')?.value) || 0,
      valorFinanciado: Number(financiadoRaw) || 0, saldo: Number(saldoRaw) || 0,
      dataInicio: document.getElementById('vff-inicio')?.value || '',
      frequencia: document.getElementById('vff-freq')?.value || 'mensal',
      observacoes: (document.getElementById('vff-obs')?.value || '').trim(),
    };
  }
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
  // Financiamento: cria/atualiza a dívida canônica vinculada por vehicleId (upsert —
  // preserva debtId + pagamentos ao editar; nunca duplica pelo mesmo fluxo).
  let finDebt = null;
  if (finFields) finDebt = _patUpsertFinDebt({ vehicleId: id }, finFields);
  save();
  // Fluxo "cadastrar um bem a partir do lançamento": volta ao "+" com o veículo
  // novo já selecionado. Um eventual financiamento criado acima permanece
  // intacto e INDEPENDENTE — nenhum pagamento de dívida é gerado aqui, e o
  // valor do lançamento não é lido como entrada nem amortização.
  if (_qaRascunho && !linkPendingId && idx < 0) {
    gdToast('Veículo cadastrado. Confira o lançamento e salve.', { type: 'success' });
    _qaVoltarAoLancamento('veh:' + id);
    return;
  }
  // Fluxo "criar bem a partir da dívida": vincula a dívida EXISTENTE ao novo veículo,
  // sem criar outra dívida (preserva debtId, saldo, parcelas, pagamentos e projeções).
  if (linkPendingId && idx < 0) {
    _debtLinkPending = null;
    const ld = getDebt(linkPendingId);
    if (ld && !_debtHasBem(ld)) { _relinkDebtToBem(ld, id); save(); }
    _finFlowReturn = null;
    _vehDetailId = id; _vehDetailMode = 'integrated'; renderVehPatDetail(id);
    gdToast('Dívida vinculada a ' + name + '.', { type: 'success' });
    return;
  }
  // Retorno à Central de Dívidas quando o fluxo começou nela (bem novo financiado).
  const startedInDividas = _finFlowReturn === 'dividas';
  _finFlowReturn = null;
  if (startedInDividas && finDebt && idx < 0) {
    switchTab('dividas'); renderDividas();
    gdToast('Veículo criado e financiamento vinculado.', { type: 'success' });
    openDebtDetail(finDebt.id);
    return;
  }
  _vehDetailId = id;
  _refreshVehDetail(id);
  gdToast(idx >= 0 ? 'Veículo atualizado.' : (finDebt ? 'Veículo e financiamento adicionados.' : 'Veículo adicionado.'));
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
  if (_patEncerradoBloqueado(vehId)) return;
  _vehLinkExpTarget = vehId;
  const v = (D.vehicles || []).find(x => x.id === vehId);
  if (!v) return;
  // Só oferece despesas ainda SEM vínculo (e que não sejam pagamentos de dívida).
  const available = (D.expenses || []).filter(e => !_expBemLegacyId(e) && !(e.meta && e.meta.source === 'debt')).slice().sort((a,b) => b.date.localeCompare(a.date));
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
  const exp = (D.expenses || []).find(e => e.id === expId);
  if (exp) { _expSetBemLink(exp, 'veh:' + vehId); save(); gdToast('Despesa vinculada.'); } // vínculo canônico
  closeOverlay('modal-veh-link-exp');
  _refreshVehDetail(vehId);
}

function unlinkVehExp(vehId, expId) {
  if (_patEncerradoBloqueado(vehId)) return;
  const exp = (D.expenses || []).find(e => e.id === expId);
  if (exp) _expSetBemLink(exp, ''); // remove o vínculo canônico + índice legado
  const v = (D.vehicles || []).find(x => x.id === vehId);
  if (v) v.linkedExpenses = (v.linkedExpenses || []).filter(id => id !== expId); // compat p/ despesa inexistente
  save();
  _refreshVehDetail(vehId);
}

// ── Vincular pendência ──
var _vehLinkPendTarget = null;
function openVehLinkPend(vehId) {
  if (_patEncerradoBloqueado(vehId)) return;
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
  if (_patEncerradoBloqueado(vehId)) return;
  const v = (D.vehicles || []).find(x => x.id === vehId);
  if (!v) return;
  v.linkedPendencias = (v.linkedPendencias || []).filter(id => id !== pId);
  save();
  _refreshVehDetail(vehId);
}

// ── Status ──
var _vehStatusTarget = null;
function openVehStatus(vehId) {
  if (_patEncerradoBloqueado(vehId)) return;
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

// Normaliza um financiamento: garante os campos novos (opcionais) e o histórico
// de pagamentos, preservando os campos legados de parcela. Retrocompatível.
function _normFinanciamento(raw) {
  const f = (raw && typeof raw === 'object') ? raw : {};
  const out = Object.assign({
    id: '', instituicao: '', descricao: '',
    valorBem: 0, valorFinanciado: 0, saldoDevedor: 0,
    dataInicio: '', frequencia: 'mensal', observacoes: '',
    // legados de parcela — preservados, não usados pelo fluxo novo:
    valorTotal: 0, parcelaMensal: 0, parcelasTotal: 0, parcelasPagas: 0,
  }, f);
  if (!out.id) out.id = uid();
  out.pagamentos = Array.isArray(f.pagamentos) ? f.pagamentos : [];
  return out;
}

// ── Fonte única dos números do financiamento ──────────────────────────────
// "Valor já pago", "Saldo devedor" e "% quitado" derivam SEMPRE de
// (valorFinanciado, saldoDevedor). Assim nunca há divergência entre eles.
function _finJaPago(f) { return Math.max(0, (f?.valorFinanciado || 0) - (f?.saldoDevedor || 0)); }
function _finQuitadoPct(f) {
  const base = f?.valorFinanciado || 0;
  if (base <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((base - (f.saldoDevedor || 0)) / base * 100)));
}
// Reconciliação segura dos pagamentos de financiamento: remove pagamentos cuja
// despesa não existe mais (expenseId inválido) e devolve o valor ao saldo devedor,
// recalculando-o automaticamente. Nunca deixa pagamento órfão. Retorna true se mudou.
function reconcilePatFinPayments() {
  const expIds = new Set((D.expenses || []).map(e => e.id));
  let changed = false;
  (D.patrimonios || []).forEach(p => {
    (p.financiamentos || []).forEach(f => {
      if (!Array.isArray(f.pagamentos) || !f.pagamentos.length) return;
      const kept = [];
      let back = 0;
      f.pagamentos.forEach(pg => {
        if (pg && pg.expenseId && !expIds.has(pg.expenseId)) back += (pg.valor || 0);
        else kept.push(pg);
      });
      if (kept.length !== f.pagamentos.length) {
        f.saldoDevedor = (f.saldoDevedor || 0) + back; // devolve ao saldo o valor dos órfãos
        f.pagamentos = kept;
        changed = true;
      }
    });
  });
  return changed;
}

function normalizePatrimonio(raw) {
  const p = Object.assign({}, _defaultPatrimonioFields(), raw);
  p.financiamentos = (Array.isArray(p.financiamentos) ? p.financiamentos : []).map(_normFinanciamento);
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
function _patTypeKey(tipo) {
  return (tipo === 'veiculo' || tipo === 'imovel') ? tipo : 'outro';
}
// ── Ciclo de vida canônico do patrimônio: 'ativo' | 'encerrado' ──
// Tipos não vendáveis (futuro: empresa etc.) usam o rótulo "Encerrado";
// os demais (veículo/imóvel/outro) usam "Vendido". "Arquivado" não existe mais.
const _PAT_NAO_VENDAVEL = new Set([]);
function _patEncerradoLabel(tipo) { return _PAT_NAO_VENDAVEL.has(_patTypeKey(tipo)) ? 'Encerrado' : 'Vendido'; }
function _patStatusLabel(status, tipo) {
  if (status === 'ativo') return 'Ativo';
  // 'encerrado' (canônico) e legados ('vendido'/'inativo') → rótulo de encerrado por tipo
  return _patEncerradoLabel(tipo);
}
// Estado de ciclo de vida a partir de um id (patId ou vehId).
function _patLifecycleOf(id) {
  const veh = (D.vehicles || []).find(v => v.id === id);
  if (veh) return (veh.status === 'vendido' || veh.status === 'arquivado') ? 'encerrado' : 'ativo';
  const p = (D.patrimonios || []).find(x => x.id === id);
  if (p) return (p.status === 'ativo') ? 'ativo' : 'encerrado';
  return 'ativo';
}
// Guarda de somente-leitura: recusa qualquer edição/criação/exclusão de item de um
// bem Vendido/Encerrado, mesmo por chamada direta à função. Retorna true se bloqueou.
function _patEncerradoBloqueado(id) {
  if (_patLifecycleOf(id) === 'encerrado') {
    gdToast('Bem ' + _patEncerradoLabel(_patTipoOf(id)).toLowerCase() + ' é somente leitura. Reabra o bem para editar.', { type: 'info' });
    return true;
  }
  return false;
}
// Registro-dono onde guardamos metadata do bem (patrimônio de preferência; senão veículo).
function _patOwnerRec(id) {
  const rec = (D.patrimonios || []).find(p => p.id === id || p._idOriginal === id);
  if (rec) return rec;
  return (D.vehicles || []).find(v => v.id === id) || null;
}
// Aplica o estado de ciclo de vida ao(s) registro(s) do bem, preservando/restaurando
// a situação operacional do veículo. life: 'ativo' | 'encerrado'.
function _patSetLifecycle(id, life, prevStatusStore) {
  const veh = (D.vehicles || []).find(v => v.id === id || (_patOwnerRec(id) && v.id === _patOwnerRec(id)._idOriginal));
  const rec = (D.patrimonios || []).find(p => p.id === id || p._idOriginal === id);
  if (veh) {
    if (life === 'encerrado') { if (prevStatusStore) prevStatusStore.prevStatus = veh.status; veh.status = 'vendido'; }
    else { veh.status = (prevStatusStore && prevStatusStore.prevStatus) || 'em_uso'; }
  } else if (rec) {
    if (life === 'encerrado') { if (prevStatusStore) prevStatusStore.prevStatus = rec.status; rec.status = 'encerrado'; }
    else { rec.status = 'ativo'; }
  }
}

// Visão unificada e SEM duplicação de D.vehicles + D.patrimonios.
function _patUnifiedItems() {
  const vehs = Array.isArray(D.vehicles)    ? D.vehicles    : [];
  const pats = Array.isArray(D.patrimonios) ? D.patrimonios : [];
  const VEH2PAT_STATUS = { em_uso:'ativo', na_oficina:'ativo', a_venda:'ativo', vendido:'encerrado', arquivado:'encerrado' };

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
      status:         (p.status === 'ativo' || !p.status) ? 'ativo' : 'encerrado',
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
  // Bens que compõem o patrimônio: apenas ATIVOS (encerrados/vendidos saem do total).
  const gross = list.filter(i => i.status === 'ativo')
                    .reduce((s, i) => s + (i.valorEstimado || 0), 0);
  // TODA dívida ativa reduz o patrimônio líquido, vinculada a um bem ou não.
  // O vínculo é contexto/apresentação, não decide a existência da obrigação.
  // Excluídas apenas quitadas (saldo 0) e canceladas. Pausada continua contando.
  const debt  = (D.debts || [])
    .filter(d => _debtStatus(d) !== 'cancelada' && _debtStatus(d) !== 'quitada')
    .reduce((s, d) => s + _debtSaldo(d), 0);
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
var _patShowEncerrados = false;
function patToggleEncerrados() { _patShowEncerrados = !_patShowEncerrados; renderPatrimonioHome(true); }
var _patCatFilter = null;
function patToggleCatFilter(tipo) {
  _patCatFilter = (_patCatFilter === tipo) ? null : tipo;
  renderPatrimonioHome();
}

function renderPatrimonioHome(preserveScroll) {
  _finFlowReturn = null; _debtLinkPending = null; // aterrissar na Home encerra fluxos vindos de Dívidas
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
  const activeItems = items.filter(i => i.status === 'ativo');
  const encerradosItems = items.filter(i => i.status !== 'ativo');
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
      <div class="sec-label" style="margin:0">${_patCatFilter ? catNames[_patCatFilter] : 'Patrimônio atual'}</div>
      ${_patCatFilter ? `<button class="btn-pill" onclick="patToggleCatFilter('${_patCatFilter}')">Limpar filtro</button>` : ''}
    </div>
    <div class="pat-list-group">
      ${(_patCatFilter ? activeItems.filter(i => _patTypeKey(i.tipo) === _patCatFilter) : activeItems).map(i => _renderPatListItem(i)).join('')
        || `<div class="pat-det-empty">Nenhum bem ativo${_patCatFilter ? ' nesta categoria' : ''}.</div>`}
    </div>

    ${encerradosItems.length ? `
    <button class="pat-encerrados-head" onclick="patToggleEncerrados()" aria-expanded="${_patShowEncerrados}">
      <span class="sec-label" style="margin:0">Vendidos / Encerrados</span>
      <span class="pat-encerrados-count">${encerradosItems.length}</span>
      <svg class="pat-encerrados-chev${_patShowEncerrados ? ' open' : ''}" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
    </button>
    ${_patShowEncerrados ? `<div class="pat-list-group pat-encerrados-list">${encerradosItems.map(i => _renderPatListItem(i)).join('')}</div>` : ''}` : ''}

    <div class="pat-home-bottom-spacer"></div>
  `;
  _setPatFab(true);
}

function _renderPatListItem(item) {
  const typeKey   = _patTypeKey(item.tipo);
  const statusK   = item.status || 'ativo';
  const statusCls = statusK === 'ativo' ? 'ativo' : 'vendido';
  const statusLbl = _patStatusLabel(statusK, item.tipo);
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
          <span class="pat-status s-${statusCls}">
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
  if (id && _patEncerradoBloqueado(id)) return;
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
  // Financiamento principal vem da FONTE ÚNICA de dívidas (D.debts), não mais embutido.
  const _pDebt = p ? _patPrincipalDebt(p) : null;
  const fin0 = _pDebt ? {
    instituicao: _pDebt.credor, valorBem: _pDebt.valorBem, valorFinanciado: _pDebt.valorOriginal,
    saldoDevedor: _debtSaldo(_pDebt), dataInicio: _pDebt.dataInicio, frequencia: _pDebt.periodicidade,
    observacoes: _pDebt.observacoes,
  } : null;
  const finOn = !!fin0 || _finFlowStartOn;
  _finFlowStartOn = false;
  const linkPending = !!_debtLinkPending; // criar bem a partir da dívida: não recriar financiamento
  const freqSel = ['mensal','quinzenal','semanal','anual','irregular'].map(fr =>
    `<option value="${fr}" ${(fin0?.frequencia||'mensal')===fr?'selected':''}>${({mensal:'Mensal',quinzenal:'Quinzenal',semanal:'Semanal',anual:'Anual',irregular:'Irregular / sem periodicidade'})[fr]}</option>`).join('');
  // Idem veículo: Voltar durante o fluxo do lançamento devolve o rascunho.
  const backAction = p ? `renderPatDetail('${p.id}')` : (_qaRascunho ? 'qaVoltarSemBem()' : 'renderPatrimonioHome()');
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
    ${linkPending ? `<div class="pf-fin-linknote">Este bem será vinculado à dívida já existente. O financiamento não é recriado.</div>` : `
    <div class="pf-fin-toggle">
      <div class="pf-fin-toggle-txt">
        <span class="pf-fin-toggle-lbl">Este bem é financiado</span>
        <span class="pf-fin-toggle-sub">Registre o financiamento junto com o bem</span>
      </div>
      <label class="pf-switch">
        <input type="checkbox" id="pf-fin-on" ${finOn?'checked':''} onchange="_togglePfFin()" aria-label="Este bem é financiado">
        <span class="pf-switch-track"><span class="pf-switch-thumb"></span></span>
      </label>
    </div>
    <div id="pf-fin-fields" class="pf-fin-fields" style="display:${finOn?'block':'none'}">
      <div class="form-group">
        <label class="form-label">Instituição / credor</label>
        <input class="form-input" id="pff-inst" value="${escHtml(fin0?.instituicao||'')}" placeholder="Ex: Caixa, Banco do Brasil">
      </div>
      <div class="veh-form-row">
        <div class="form-group"><label class="form-label">Valor do bem (${escHtml(currSym)})</label><input class="form-input" id="pff-bem" type="number" min="0" step="any" value="${fin0?.valorBem||''}" placeholder="300000"></div>
        <div class="form-group"><label class="form-label">Valor financiado (${escHtml(currSym)}) *</label><input class="form-input" id="pff-financiado" type="number" min="0" step="any" value="${fin0?.valorFinanciado||''}" placeholder="240000"></div>
      </div>
      <div class="veh-form-row">
        <div class="form-group"><label class="form-label">Saldo devedor (${escHtml(currSym)}) *</label><input class="form-input" id="pff-saldo" type="number" min="0" step="any" value="${fin0?.saldoDevedor ?? ''}" placeholder="180000"></div>
        <div class="form-group"><label class="form-label">Início</label><input class="form-input" id="pff-inicio" type="date" value="${fin0?.dataInicio||''}"></div>
      </div>
      <div class="form-group">
        <label class="form-label">Frequência</label>
        <select class="form-input" id="pff-freq">${freqSel}</select>
      </div>
      <div class="form-group">
        <label class="form-label">Observações</label>
        <textarea class="form-input" id="pff-obs" rows="2" placeholder="Anotações (taxa, seguro, etc.)">${escHtml(fin0?.observacoes||'')}</textarea>
      </div>
      ${(p && (p.financiamentos||[]).length > 1) ? `<div class="pf-fin-note">Este bem tem mais de um financiamento — os demais podem ser gerenciados no detalhe.</div>` : ''}
    </div>`}
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

// Mostra/oculta o sub-formulário de financiamento conforme o switch.
function _togglePfFin() {
  const on = document.getElementById('pf-fin-on')?.checked;
  const box = document.getElementById('pf-fin-fields');
  if (box) box.style.display = on ? 'block' : 'none';
  if (on) {
    // Pré-preenche "valor do bem" com o valor do patrimônio, se ainda vazio.
    const bem = document.getElementById('pff-bem');
    const val = document.getElementById('pf-valor')?.value;
    if (bem && !bem.value && val) bem.value = val;
  }
}

// ── Porta de entrada unificada Patrimônio ⇄ Dívidas ──────────────────────────
// `_finFlowReturn`: quando um cadastro de bem financiado começou na Central de
// Dívidas, ao concluir voltamos para lá mostrando a dívida criada.
// `_finFlowStartOn`: abre o formulário do bem já com o switch de financiamento ligado.
var _finFlowReturn = null;
var _finFlowStartOn = false;

// Dívida de financiamento principal de um veículo (no máx. uma). Fonte única D.debts.
function _vehPrincipalDebt(vehId) {
  return (D.debts || []).find(d => d.tipo === 'financiamento' && d.vehicleId === vehId) || null;
}

// Espelho de _togglePfFin para o formulário de veículo.
function _toggleVfFin() {
  const on = document.getElementById('vf-fin-on')?.checked;
  const box = document.getElementById('vf-fin-fields');
  if (box) box.style.display = on ? 'block' : 'none';
  if (on) {
    const bem = document.getElementById('vff-bem');
    const val = document.getElementById('vf-valor')?.value;
    if (bem && !bem.value && val) bem.value = val;
  }
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

// ── Ponte Patrimônio ⇄ Dívidas (fonte única) ──────────────────────────────
// Resolve a dívida de financiamento principal de um bem (imóvel/outro via
// patrimonioId; veículo via vehicleId). Um bem tem no máximo um financiamento principal.
function _patPrincipalDebt(p) {
  if (!p) return null;
  if (p.tipo === 'veiculo') { const vid = p._idOriginal || p.id; return (D.debts || []).find(d => d.tipo === 'financiamento' && d.vehicleId === vid) || null; }
  return (D.debts || []).find(d => d.tipo === 'financiamento' && d.patrimonioId === p.id) || null;
}
// Cria/atualiza o financiamento de um bem como dívida canônica, SEM duplicar.
// `link` = { patrimonioId } ou { vehicleId }. saldo informado vira amortizadoInicial
// derivado (valorFinanciado − saldo − Σpagamentos), preservando o histórico de pagamentos.
function _patUpsertFinDebt(link, f) {
  D.debts = D.debts || [];
  const finder = link.vehicleId
    ? d => d.tipo === 'financiamento' && d.vehicleId === link.vehicleId
    : d => d.tipo === 'financiamento' && d.patrimonioId === link.patrimonioId;
  const existing = D.debts.find(finder) || null;
  const pagosCents = existing ? _debtPaymentsOf(existing.id).reduce((s, p) => s + _c(p.valor), 0) : 0;
  const amortInicial = _r(_c(f.valorFinanciado) - _c(f.saldo) - pagosCents);
  const fields = {
    tipo: 'financiamento', titulo: f.titulo || (existing && existing.titulo) || 'Financiamento',
    credor: f.credor, valorBem: f.valorBem, valorOriginal: f.valorFinanciado,
    amortizadoInicial: amortInicial, dataInicio: f.dataInicio, periodicidade: f.frequencia,
    observacoes: f.observacoes, atualizadoEm: Date.now(),
  };
  if (existing) {
    const idx = D.debts.indexOf(existing);
    D.debts[idx] = _normDebt(Object.assign({}, existing, fields));
    return D.debts[idx];
  }
  const nd = _normDebt(Object.assign({}, fields, link));
  D.debts.push(nd);
  return nd;
}

function savePatrimonioForm() {
  const nome = (document.getElementById('pf-nome')?.value || '').trim();
  if (!nome) { gdToast('Nome obrigatório.'); return; }
  const linkPendingId = _debtLinkPending; // fluxo "criar bem a partir da dívida"
  const valorRaw = document.getElementById('pf-valor')?.value;
  const _num = elId => {
    const raw = document.getElementById(elId)?.value;
    return raw === '' || raw == null ? 0 : Number(raw) || 0;
  };
  const _pfId = document.getElementById('pf-id')?.value;
  const fields = {
    nome,
    valorEstimado: valorRaw === '' || valorRaw == null ? 0 : Number(valorRaw) || 0,
    // Ciclo de vida é gerido pelo menu (Vender/Reabrir), não pelo formulário:
    // criar nasce 'ativo'; editar preserva o estado atual.
    status:        (_pfId ? (getPatrimonio(_pfId)?.status || 'ativo') : 'ativo'),
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
  // ── Financiamento inline (switch "Este bem é financiado") ──
  // Não altera a estrutura de dados nem a lógica de pagamentos: apenas cria/atualiza
  // o financiamento principal (financiamentos[0]) preservando id + pagamentos.
  const finOn = document.getElementById('pf-fin-on')?.checked;
  let finToSave = null;
  if (finOn) {
    const financiadoRaw = document.getElementById('pff-financiado')?.value;
    const saldoRaw = document.getElementById('pff-saldo')?.value;
    if (financiadoRaw === '' || financiadoRaw == null || saldoRaw === '' || saldoRaw == null) {
      gdToast('Preencha valor financiado e saldo devedor (ou desligue "Este bem é financiado").', { type: 'error' });
      return;
    }
    finToSave = {
      instituicao:     (document.getElementById('pff-inst')?.value || '').trim(),
      valorBem:        _num('pff-bem'),
      valorFinanciado: Number(financiadoRaw) || 0,
      saldoDevedor:    Number(saldoRaw) || 0,
      dataInicio:      document.getElementById('pff-inicio')?.value || '',
      frequencia:      document.getElementById('pff-freq')?.value || 'mensal',
      observacoes:     (document.getElementById('pff-obs')?.value || '').trim(),
    };
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
    // Switch ligado → cria/atualiza a dívida de financiamento (fonte única, preserva pagamentos).
    // Switch desligado → não mexe nas dívidas existentes (sem perda de dados).
    if (finToSave) {
      _patUpsertFinDebt({ patrimonioId: id }, {
        titulo: nome, credor: finToSave.instituicao, valorBem: finToSave.valorBem,
        valorFinanciado: finToSave.valorFinanciado, saldo: finToSave.saldoDevedor,
        dataInicio: finToSave.dataInicio, frequencia: finToSave.frequencia, observacoes: finToSave.observacoes,
      });
      save();
    }
    gdToast('Patrimônio atualizado.');
    renderPatDetail(id);
  } else {
    // Cadastro inicial: nenhum evento de reavaliação é criado
    const novo = createPatrimonio(Object.assign({ tipo }, fields));
    // Fluxo "criar bem a partir da dívida": vincula a dívida EXISTENTE ao novo bem,
    // sem criar outra dívida (preserva debtId, saldo, parcelas, pagamentos e projeções).
    if (linkPendingId && novo) {
      _debtLinkPending = null;
      const ld = getDebt(linkPendingId);
      if (ld && !_debtHasBem(ld)) { _relinkDebtToBem(ld, novo.id); save(); }
      _finFlowReturn = null;
      gdToast('Dívida vinculada a ' + nome + '.', { type: 'success' });
      renderPatDetail(novo.id);
      return;
    }
    let novoDebt = null;
    if (finToSave && novo) {
      novoDebt = _patUpsertFinDebt({ patrimonioId: novo.id }, {
        titulo: nome, credor: finToSave.instituicao, valorBem: finToSave.valorBem,
        valorFinanciado: finToSave.valorFinanciado, saldo: finToSave.saldoDevedor,
        dataInicio: finToSave.dataInicio, frequencia: finToSave.frequencia, observacoes: finToSave.observacoes,
      });
      save();
    }
    // Fluxo "cadastrar um bem a partir do lançamento": volta ao "+" com o bem
    // novo já selecionado. Um financiamento criado acima permanece intacto e
    // INDEPENDENTE — nenhum pagamento de dívida é gerado aqui, e o valor do
    // lançamento não é lido como entrada nem amortização.
    if (_qaRascunho && !linkPendingId) {
      gdToast('Bem cadastrado. Confira o lançamento e salve.', { type: 'success' });
      _qaVoltarAoLancamento('pat:' + novo.id);
      return;
    }
    // Retorno à Central de Dívidas quando o fluxo começou nela (bem novo financiado).
    const startedInDividas = _finFlowReturn === 'dividas';
    _finFlowReturn = null;
    if (startedInDividas && novoDebt) {
      switchTab('dividas'); renderDividas();
      gdToast('Bem criado e financiamento vinculado.', { type: 'success' });
      openDebtDetail(novoDebt.id);
      return;
    }
    if (novoDebt) {
      gdToast('Patrimônio e financiamento adicionados.');
      renderPatDetail(novo.id); // abre o detalhe já com o financiamento
    } else {
      gdToast('Patrimônio adicionado.');
      renderPatrimonioHome();
    }
  }
}

function deletePatrimonioUI(id) {
  const p = getPatrimonio(id);
  if (!p) return;
  // Mesma guarda do menu "⋮": este botão vive no rodapé do formulário e era a
  // única porta de exclusão sem verificação nenhuma.
  const estado = _patrimonioDeleteState(id);
  if (!estado.podeExcluir) { _patBloquearExclusao(id, estado); return; }
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

// Menu "⋮" do detalhe de imóvel/outro bem — surfacing das ações que antes só
// existiam dentro do formulário (Arquivar/Reativar e Excluir), em paridade com
// o menu do veículo. Não adiciona funcionalidade: apenas expõe o que já existe.
var _patMenuTarget = null;
function openPatMenu(id) {
  const p = getPatrimonio(id); if (!p) return;
  _patMenuTarget = id;
  const t = document.getElementById('patmenu-title');
  if (t) t.textContent = p.nome || 'Patrimônio';
  const lbl = document.getElementById('patmenu-archive-lbl');
  if (lbl) lbl.textContent = _patLifecycleOf(id) === 'encerrado'
    ? 'Reabrir'
    : (_patEncerradoLabel(p.tipo) === 'Vendido' ? 'Marcar como vendido' : 'Encerrar');
  openOverlay('pat-menu-sheet');
}
// Botão de ciclo de vida do menu: vender (ativo) ou reabrir (encerrado).
function patMenuArchive() {
  closeOverlay('pat-menu-sheet');
  const id = _patMenuTarget; if (!id) return;
  if (_patLifecycleOf(id) === 'encerrado') reabrirBem(id); else venderBem(id);
}
function patMenuDelete() {
  closeOverlay('pat-menu-sheet');
  if (_patMenuTarget) excluirBemGuardado(_patMenuTarget);
}

// ══════════════════════════════════════════
// CICLO DE VIDA DO PATRIMÔNIO — Venda/Encerramento, Reabertura e Exclusão guardada
// ══════════════════════════════════════════
function _patIsVeiculo(id) { return (D.vehicles || []).some(v => v.id === id); }
function _patNomeOf(id) { const v = (D.vehicles || []).find(x => x.id === id); if (v) return v.name || ''; const p = getPatrimonio(id); return p ? (p.nome || '') : ''; }
function _patTipoOf(id) { if (_patIsVeiculo(id)) return 'veiculo'; const p = getPatrimonio(id); return p ? (p.tipo || 'outro') : 'outro'; }
// Financiamentos vinculados ao bem (fonte única D.debts).
function _debtsDoBem(id) {
  const rec = _patOwnerRec(id);
  const vidKey = _patIsVeiculo(id) ? id : (rec ? (rec._idOriginal || rec.id) : id);
  const patKey = rec ? rec.id : id;
  return (D.debts || []).filter(x => x.tipo === 'financiamento' && (x.patrimonioId === patKey || (x.vehicleId && x.vehicleId === vidKey)));
}
function _debtsAtivasDoBem(id) { return _debtsDoBem(id).filter(d => _debtStatus(d) !== 'cancelada' && _debtSaldo(d) > 0); }
function _relinkDebtToBem(d, id) {
  if (_patIsVeiculo(id)) { d.vehicleId = id; d.patrimonioId = null; }
  else { const rec = _patOwnerRec(id); d.patrimonioId = rec ? rec.id : id; d.vehicleId = null; }
  d.atualizadoEm = Date.now();
}
// Resumo da venda (derivado; nunca armazenado em duplicidade).
function _patVendaOf(id) { const rec = _patOwnerRec(id); if (rec && rec.venda) return rec.venda; const v = (D.vehicles || []).find(x => x.id === id); return (v && v.venda) || null; }
// Resumo derivado da venda (entrou / quitação / líquido) — nunca armazena duplicidade.
function _patVendaSummaryHtml(venda) {
  if (!venda) return '';
  const entrou = venda.valor || 0;
  const quit = venda.dividaDestino === 'quitada'
    ? (D.debtPayments || []).filter(p => p.meta && p.meta.saleId === venda.saleId).reduce((s, p) => s + (p.valor || 0), 0)
    : 0;
  const liq = entrou - quit;
  return `<div class="pat-det-sec-head"><div class="sec-label" style="margin:0">Venda</div></div>
    <div class="pat-list-group" style="margin-bottom:0"><div class="pat-venda-summary">
      <div class="pat-venda-row"><span>Data</span><span>${_patFmtDate(venda.data)}</span></div>
      ${entrou > 0 ? `<div class="pat-venda-row"><span>Entrou</span><span class="pos">${R(entrou)}</span></div>` : ''}
      ${quit > 0 ? `<div class="pat-venda-row"><span>Quitação da dívida</span><span class="neg">−${R(quit)}</span></div>` : ''}
      ${venda.dividaDestino === 'mantida' ? `<div class="pat-venda-row"><span>Dívida</span><span>mantida (sem vínculo)</span></div>` : ''}
      ${(entrou > 0 || quit > 0) ? `<div class="pat-venda-row pat-venda-net"><span>Resultado líquido</span><span>${R(liq)}</span></div>` : ''}
    </div></div>`;
}

var _vendaTarget = null;
function venderBem(id) {
  if (_patLifecycleOf(id) !== 'ativo') { gdToast('Este bem já está encerrado.', { type: 'info' }); return; }
  _vendaTarget = id;
  const tipo = _patTipoOf(id);
  const verbo = _patEncerradoLabel(tipo) === 'Vendido' ? 'Marcar como vendido' : 'Encerrar';
  const saldo = _debtsAtivasDoBem(id).reduce((s, d) => s + _debtSaldo(d), 0);
  const tEl = document.getElementById('venda-title'); if (tEl) tEl.textContent = verbo;
  const body = document.getElementById('venda-body');
  body.innerHTML = `
    <div class="form-group"><label class="form-label">Data da venda</label>
      <input class="form-input" id="venda-data" inputmode="numeric" placeholder="dd/mm/aaaa" value="${_isoToBr(todayStr())}"></div>
    <div class="form-group"><label class="form-label">Valor recebido (opcional)</label>
      <input class="form-input" id="venda-valor" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0,00"></div>
    ${saldo > 0 ? `
    <div class="form-group">
      <label class="form-label">Este bem ainda tem financiamento — saldo ${R(saldo)}</label>
      <div class="venda-debt-opts">
        <label class="venda-opt"><input type="radio" name="venda-divida" value="quitada" checked><span>Quitei na venda</span></label>
        <label class="venda-opt"><input type="radio" name="venda-divida" value="mantida"><span>Continuo devendo (sem vínculo com o bem)</span></label>
      </div>
    </div>` : ''}
    <div class="venda-note">Nada é apagado — histórico, despesas e pagamentos ficam preservados. Você pode reabrir depois.</div>
    <div class="df-actions">
      <button class="btn btn-secondary" onclick="closeOverlay('venda-sheet')">Cancelar</button>
      <button class="btn btn-primary" id="venda-confirm" onclick="confirmarVendaBem()">${verbo}</button>
    </div>`;
  const dEl = document.getElementById('venda-data'); if (dEl && typeof _maskDateBR === 'function') _maskDateBR(dEl);
  openOverlay('venda-sheet');
}
function confirmarVendaBem() {
  const id = _vendaTarget; if (!id) return;
  const btn = document.getElementById('venda-confirm'); if (btn && btn.disabled) return;
  if (_patLifecycleOf(id) !== 'ativo') { closeOverlay('venda-sheet'); return; } // guarda anti-duplo
  const dataIso = _brToIso(document.getElementById('venda-data')?.value) || todayStr();
  const valor = Math.max(0, Number(document.getElementById('venda-valor')?.value) || 0);
  const debts = _debtsAtivasDoBem(id);
  const saldo = debts.reduce((s, d) => s + _debtSaldo(d), 0);
  const destinoEl = document.querySelector('input[name="venda-divida"]:checked');
  const dividaDestino = saldo > 0 ? (destinoEl ? destinoEl.value : 'mantida') : null;
  if (btn) btn.disabled = true;
  const saleId = uid();
  const rec = _patOwnerRec(id);
  const venda = { saleId, data: dataIso, valor, dividaDestino };

  // 1) Entrada da venda (receita avulsa asset-sale) — só se valor informado (>0)
  if (valor > 0) {
    const linkKey = _patIsVeiculo(id) ? { vehicleId: id } : { patrimonioId: (rec ? rec.id : id) };
    const entrada = { id: uid(), date: dataIso, amount: valor, status: 'paid', platformId: null,
      note: 'Venda de ' + (_patNomeOf(id) || 'bem'),
      meta: Object.assign({ source: 'asset-sale', saleId }, linkKey) };
    D.incomeItems = D.incomeItems || []; D.incomeItems.push(entrada);
    venda.entradaId = entrada.id;
  }

  // 2) Destino da dívida
  if (dividaDestino === 'quitada') {
    debts.forEach(d => {
      const sd = _debtSaldo(d);
      if (sd > 0) _debtRegistrarPagamento(d.id, { valor: sd, data: dataIso, descricao: 'Quitação — venda de ' + (_patNomeOf(id) || 'bem'), saleId });
    });
  } else if (dividaDestino === 'mantida') {
    venda.dividasDesvinculadas = debts.map(d => d.id);
    debts.forEach(d => { d.vehicleId = null; d.patrimonioId = null; d.atualizadoEm = Date.now(); });
  }

  // 3) Encerrar o bem (preserva histórico) + grava a metadata de venda
  _patSetLifecycle(id, 'encerrado', venda);
  if (rec) rec.venda = venda; else { const veh = (D.vehicles || []).find(v => v.id === id); if (veh) veh.venda = venda; }
  save();
  closeOverlay('venda-sheet');
  renderPatrimonioHome();
  gdToast('Bem marcado como ' + _patEncerradoLabel(_patTipoOf(id)).toLowerCase() + '. Histórico preservado.', { type: 'success' });
}
function reabrirBem(id) {
  const rec = _patOwnerRec(id);
  const veh = (D.vehicles || []).find(v => v.id === id);
  const venda = _patVendaOf(id);
  const alterouDivida = venda && (venda.dividaDestino === 'quitada' || venda.dividaDestino === 'mantida');
  gdConfirm({
    title: 'Reabrir', confirmText: 'Reabrir',
    msg: `Reabrir "${_patNomeOf(id)}"? Ele volta para o seu patrimônio atual como Ativo.` +
      (alterouDivida ? ' A alteração da dívida feita na venda será revertida.' : ''),
    onConfirm: () => {
      if (venda) {
        // Estorno da entrada
        if (venda.entradaId) D.incomeItems = (D.incomeItems || []).filter(it => it.id !== venda.entradaId);
        // Estorno da quitação: remove pagamento + despesa por saleId; re-vincula a dívida ao bem
        if (venda.dividaDestino === 'quitada') {
          const pays = (D.debtPayments || []).filter(p => p.meta && p.meta.saleId === venda.saleId);
          pays.forEach(p => { if (p.expenseId) D.expenses = (D.expenses || []).filter(e => e.id !== p.expenseId); });
          const debtIds = new Set(pays.map(p => p.debtId));
          D.debtPayments = (D.debtPayments || []).filter(p => !(p.meta && p.meta.saleId === venda.saleId));
          debtIds.forEach(did => { const d = getDebt(did); if (d) _relinkDebtToBem(d, id); });
        } else if (venda.dividaDestino === 'mantida') {
          (venda.dividasDesvinculadas || []).forEach(did => { const d = getDebt(did); if (d) _relinkDebtToBem(d, id); });
        }
      }
      _patSetLifecycle(id, 'ativo', venda || {});
      if (rec) delete rec.venda;
      if (veh) delete veh.venda;
      save();
      renderPatrimonioHome();
      gdToast('Bem reaberto. Voltou ao patrimônio ativo.', { type: 'success' });
    },
  });
}
// ── FONTE ÚNICA DA EXCLUSÃO DE UM BEM ────────────────────────────────────
// Apagar um bem que ainda tem vínculo deixa o outro lado órfão: a despesa
// continua apontando para um `patrimonioId` que não existe mais, e a dívida
// para um bem que sumiu. Como não há exclusão em cascata (de propósito — o
// histórico financeiro é do usuário, não do cadastro), a única saída correta
// é não apagar: o bem se ENCERRA (vendido/encerrado), preservando tudo.
//
// Todo bloqueio nasce aqui. O estado é DERIVADO dos dados atuais a cada
// consulta e nunca é gravado — não existe flag "tem vínculo" em lugar nenhum.
// Serve veículo e imóvel/outro bem pelo mesmo caminho, porque o modelo de
// vínculo é o mesmo (`vehicleId`/`patrimonioId` na despesa, na dívida e na
// pendência); o que difere entre os dois é só o índice legado do veículo
// (`linkedExpenses`/`linkedPendencias`), já coberto por `_expensesDoBem`.
const _PAT_VINCULO_LBL = Object.freeze({
  aquisicao:     ['aquisição', 'aquisições'],
  despesa:       ['lançamento vinculado', 'lançamentos vinculados'],
  financiamento: ['financiamento', 'financiamentos'],
  divida:        ['dívida vinculada', 'dívidas vinculadas'],
  pendencia:     ['pendência', 'pendências'],
  historico:     ['evento no histórico', 'eventos no histórico'],
});
const _PAT_VINCULO_ORDEM = Object.freeze(['aquisicao', 'financiamento', 'divida', 'despesa', 'pendencia', 'historico']);

// Todas as dívidas do bem, de qualquer tipo e em qualquer estado — inclusive
// quitada. Financiamento pago é histórico: apagar o bem apagaria o dono do
// registro. (`_debtsDoBem` responde outra pergunta — só o financiamento vivo
// do bem, usado pelo fluxo de venda — e por isso não serve de guarda.)
function _dividasVinculadasAoBem(id) {
  const rec = _patOwnerRec(id);
  const vidKey = _patIsVeiculo(id) ? id : (rec ? (rec._idOriginal || rec.id) : id);
  const patKey = rec ? rec.id : id;
  return (D.debts || []).filter(d => (d.patrimonioId && d.patrimonioId === patKey) || (d.vehicleId && d.vehicleId === vidKey));
}

// Pendências que apontam para o bem: vínculo canônico (`patrimonioId`/
// `vehicleId`) e os dois índices reversos que o modelo mantém.
function _pendenciasVinculadasAoBem(id) {
  const rec = _patOwnerRec(id);
  const vidKey = _patIsVeiculo(id) ? id : (rec ? (rec._idOriginal || rec.id) : id);
  const patKey = rec ? rec.id : id;
  const reversos = new Set([
    ...(((D.vehicles || []).find(v => v.id === vidKey) || {}).linkedPendencias || []),
    ...(((rec && rec.detalhes) || {}).linkedPendencias || []),
  ]);
  return (D.pendencias || []).filter(p =>
    (p.patrimonioId && p.patrimonioId === patKey) ||
    (p.vehicleId && p.vehicleId === vidKey) ||
    reversos.has(p.id));
}

/** Estado de exclusão de um bem: pode apagar? por quê não? o que está preso? */
function _patrimonioDeleteState(ref) {
  const id = (ref && typeof ref === 'object') ? (ref.id || null) : ref;
  if (!id) return { podeExcluir: true, motivos: [], tipos: [], total: 0, contagem: {} };

  const rec = _patOwnerRec(id);
  const veh = (D.vehicles || []).find(v => v.id === id);

  const despesas = _expensesDoBem(id);
  const contagem = {
    aquisicao:     despesas.filter(e => _movementNature(e) === 'asset-acquisition').length,
    despesa:       despesas.filter(e => _movementNature(e) !== 'asset-acquisition').length,
    financiamento: _dividasVinculadasAoBem(id).filter(d => d.tipo === 'financiamento').length,
    divida:        _dividasVinculadasAoBem(id).filter(d => d.tipo !== 'financiamento').length,
    pendencia:     _pendenciasVinculadasAoBem(id).length,
    historico:     ((rec && rec.historico) || []).length + ((veh && veh.history) || []).length,
  };

  // Um motivo por TIPO de vínculo, com a contagem dentro — nunca repetido.
  const tipos = _PAT_VINCULO_ORDEM.filter(k => contagem[k] > 0);
  const motivos = tipos.map(k => {
    const n = contagem[k], lbl = _PAT_VINCULO_LBL[k];
    return `${n} ${n === 1 ? lbl[0] : lbl[1]}`;
  });
  const total = tipos.reduce((s, k) => s + contagem[k], 0);
  return { podeExcluir: total === 0, motivos, tipos, total, contagem };
}

// Mantido como pergunta booleana para quem só quer saber "dá ou não dá".
function _bemTemHistorico(id) { return !_patrimonioDeleteState(id).podeExcluir; }

// Diálogo único do bloqueio: explica o porquê e oferece o caminho seguro
// (encerrar/vender), que preserva o bem e todo o histórico.
function _patBloquearExclusao(id, estado) {
  const tipo = _patTipoOf(id);
  const encerrado = _patEncerradoLabel(tipo);
  const verbo = encerrado === 'Vendido' ? 'Marcar como vendido' : 'Encerrar';
  gdConfirm({
    title: 'Este bem possui histórico financeiro',
    variant: 'warning', confirmText: verbo, cancelText: 'Voltar',
    msg: `"${_patNomeOf(id)}" tem ${_listaHumana(estado.motivos)}. Para preservar esse histórico, ele não pode ser apagado — marque como ${encerrado.toLowerCase()} e ele sai do seu patrimônio sem perder nada.`,
    onConfirm: () => venderBem(id),
  });
}

// "a, b e c" — enumeração legível, sem vírgula antes do "e".
function _listaHumana(itens) {
  const l = (itens || []).filter(Boolean);
  if (!l.length) return 'vínculos';
  if (l.length === 1) return l[0];
  return l.slice(0, -1).join(', ') + ' e ' + l[l.length - 1];
}

function excluirBemGuardado(id) {
  const estado = _patrimonioDeleteState(id);
  if (!estado.podeExcluir) { _patBloquearExclusao(id, estado); return; }
  // Sem vínculo → exclusão limpa (reusa os fluxos existentes por tipo)
  if (_patIsVeiculo(id)) _vehDoDelete(id);
  else deletePatrimonioUI(id);
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

// Ícones de estado vazio (contorno, discretos) — apenas orientam, sem novas ações.
const _PAT_EMPTY_ICONS = {
  despesa:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 3h12l2 2v16l-2-1-2 1-2-1-2 1-2-1-2 1V5z"/><line x1="8" y1="8" x2="14" y2="8"/><line x1="8" y1="12" x2="14" y2="12"/></svg>',
  pendencia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a1.5 1.5 0 0 0 1.29 2.25h17.78A1.5 1.5 0 0 0 22.18 18L13.71 3.86a1.5 1.5 0 0 0-2.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  historico: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg>',
};
// Estado vazio orientativo (ícone + título + dica). Substitui o texto "morto".
function _patEmptyState(iconKey, title, hint) {
  return `<div class="pat-inl-empty">
    <div class="pat-inl-empty-ico">${_PAT_EMPTY_ICONS[iconKey] || _PAT_EMPTY_ICONS.historico}</div>
    <div class="pat-inl-empty-title">${escHtml(title)}</div>
    ${hint ? `<div class="pat-inl-empty-hint">${escHtml(hint)}</div>` : ''}
  </div>`;
}
// Faixa de estado do bem (Arquivado/Vendido) — visível no topo do card principal.
function _patStateBanner(statusK, tipo) {
  if (statusK === 'ativo') return '';
  // Qualquer estado não-ativo é "Encerrado" (rótulo por tipo: Vendido/Encerrado).
  const lbl = _patEncerradoLabel(tipo);
  return `<div class="pat-state-banner pat-state-vendido"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg><span>${escHtml(lbl)}</span></div>`;
}

// Card de financiamento (compartilhado por imóvel/outro e veículo). ownerId =
// patrimonioId (kind 'pat') ou vehicleId (kind 'veh'); as ações preservam o contexto.
function _finCardHtml(f, ownerId, kind, readonly) {
  const st = _debtState(f);
  const pagos = st.pago, quitado = st.progress, quitadoTotal = st.quitada;
  const freqLbl = { mensal:'Mensal', quinzenal:'Quinzenal', semanal:'Semanal', anual:'Anual', irregular:'Irregular' }[f.periodicidade] || '';
  const metaBits = [freqLbl].filter(Boolean).join(' · ');
  const pags = _debtPaymentsOf(f.id).slice()
    .map((x, i) => ({ x, i }))
    .sort((a, b) => String(b.x.data || '').localeCompare(String(a.x.data || '')) || b.i - a.i)
    .map(o => o.x);
  const pagsHtml = pags.length === 0
    ? `<div class="pagfin-empty">Nenhum pagamento registrado ainda.</div>`
    : pags.map(x => `
        <div class="pagfin-row">
          <div class="pagfin-row-body">
            <span class="pagfin-row-desc">${escHtml('Pagamento')}</span>
            <span class="pagfin-row-date">${fmtShort(x.data)}</span>
          </div>
          <span class="pagfin-row-val">−${R(x.valor || 0)}</span>
        </div>`).join('');
  return `
    <div class="pat-fin-card">
      <div class="pat-fin-head">
        <div class="pat-fin-body">
          <div class="pat-fin-name">${escHtml(f.credor || 'Financiamento')}</div>
          ${metaBits ? `<div class="pat-fin-sub">${escHtml(metaBits)}</div>` : ''}
        </div>
        ${readonly ? '' : `<div class="pat-fin-head-actions">
          <button class="pat-mini-edit" onclick="openPatFinForm('${ownerId}','${f.id}','${kind}')" aria-label="Editar financiamento"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
          <button class="pat-mini-del" onclick="deletePatFin('${ownerId}','${f.id}','${kind}')" aria-label="Excluir financiamento">${_patTrashSvg()}</button>
        </div>`}
      </div>
      <div class="pagfin-progress"><span class="pagfin-progress-fill" style="width:${quitado}%"></span></div>
      <div class="pagfin-grid">
        <div class="pagfin-cell"><span class="pagfin-cell-lbl">Valor financiado</span><span class="pagfin-cell-val">${R(f.valorOriginal || 0)}</span></div>
        <div class="pagfin-cell"><span class="pagfin-cell-lbl">Já pago</span><span class="pagfin-cell-val pagfin-pos">${R(pagos)}</span></div>
        <div class="pagfin-cell"><span class="pagfin-cell-lbl">Saldo devedor</span><span class="pagfin-cell-val pagfin-neg">${R(st.saldo)}</span></div>
        <div class="pagfin-cell"><span class="pagfin-cell-lbl">% quitado</span><span class="pagfin-cell-val">${quitado}%</span></div>
      </div>
      ${quitadoTotal
        ? `<div class="pagfin-quitado">✓ Financiamento quitado</div>`
        : (readonly ? '' : `<button class="btn btn-primary pagfin-add-btn" onclick="openPagFinForm('${ownerId}','${f.id}','${kind}')">Registrar pagamento</button>`)}
      <div class="pagfin-hist">${pagsHtml}</div>
      <button class="div-bem-link" style="margin-top:12px" onclick="openDebtDetail('${f.id}')">Ver dívida completa →</button>
    </div>`;
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
  // Financiamentos vêm da FONTE ÚNICA de dívidas (D.debts) vinculadas a este bem.
  const _vidKey  = p._idOriginal || p.id;
  const fins     = (D.debts || []).filter(x => x.tipo === 'financiamento' && (x.patrimonioId === p.id || (x.vehicleId && x.vehicleId === _vidKey)));
  const saldoTot = fins.reduce((s, x) => s + _debtSaldo(x), 0);

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

  // Bem encerrado (vendido) = somente leitura: sem adicionar financiamento/evento.
  const readonly = statusK !== 'ativo';
  const venda = readonly ? _patVendaOf(p.id) : null;

  // ── Financiamento (mesma affordance discreta e discoverável do veículo) ──
  const finHtml = fins.length === 0
    ? (readonly ? '' : `<button class="btn btn-secondary" style="width:100%" onclick="openPatFinForm('${p.id}','','pat')">Este bem é financiado — adicionar</button>`)
    : `<div class="pat-list-group" style="margin-bottom:0">${fins.map(f => _finCardHtml(f, p.id, 'pat', readonly)).join('')}</div>`;

  // ── Histórico (mais recente primeiro; estável para datas iguais) ──
  const hist = (p.historico || []).slice()
    .map((e, i) => ({ e, i }))
    .sort((a, b) => String(b.e.data || '').localeCompare(String(a.e.data || '')) || b.i - a.i)
    .map(x => x.e);
  const histHtml = hist.length === 0
    ? _patEmptyState('historico', 'Nenhum evento ainda', 'Registre reavaliações e acontecimentos para acompanhar a evolução deste bem.')
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
          ${(isManual && !readonly) ? `<button class="pat-mini-del" onclick="deletePatEvt('${p.id}','${e.id}')" aria-label="Excluir evento">${_patTrashSvg()}</button>` : ''}
        </div>`;
      }).join('');

  cont.innerHTML = `
    ${_pageHeader("renderPatrimonioHome()", chipName, `
      <div class="phr-actions">
        ${readonly ? '' : `<button class="btn-pill" onclick="openPatForm(null,'${p.id}')">Editar</button>`}
        <button class="pat-kebab-btn" onclick="openPatMenu('${p.id}')" aria-label="Mais ações">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true" focusable="false"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>
        </button>
      </div>`)}

    <div class="card pat-det-hero${statusK !== 'ativo' ? ' pat-hero-inactive' : ''}">
      ${_patStateBanner(statusK, p.tipo)}
      <div class="pat-det-hero-row">
        <div class="pat-list-photo pat-det-photo${p.foto ? '' : ' pat-ico-' + typeKey}">
          ${p.foto ? `<img src="${escHtml(p.foto)}" alt="${escHtml(p.nome)}">` : _patIcon(typeKey)}
        </div>
        <div class="pat-det-hero-info">
          <div class="pat-det-name">${escHtml(p.nome)}</div>
          <div class="pat-list-meta">
            <span class="pat-chip pat-chip-${typeKey}">${chipName}</span>
            ${statusK === 'ativo' ? `<span class="pat-status s-${statusK}"><span class="pat-status-dot"></span><span class="pat-status-lbl">${_patStatusLabel(statusK)}</span></span>` : ''}
          </div>
        </div>
      </div>
      <div class="pat-det-valblock">
        <div class="pat-det-val-lbl">Valor atual estimado</div>
        <div class="pat-det-val">${R(p.valorEstimado || 0)}</div>
        ${saldoTot > 0 ? `
        <div class="pat-det-liqrow"><span>Financiamentos</span><span class="pat-det-liqrow-neg">−${R(saldoTot)}</span></div>
        <div class="pat-det-liqrow pat-det-liqrow-net"><span>Patrimônio líquido</span><span>${R((p.valorEstimado || 0) - saldoTot)}</span></div>` : ''}
      </div>
      ${p.observacoes ? `<div class="pat-det-obs">${escHtml(p.observacoes)}</div>` : ''}
    </div>

    ${venda ? _patVendaSummaryHtml(venda) : ''}

    ${detRows.length > 0 ? `
    <div class="pat-det-sec-head"><div class="sec-label" style="margin:0">Detalhes</div></div>
    <div class="pat-list-group" style="margin-bottom:0">
      ${detRows.map(r => `<div class="pat-det-row"><span class="pat-det-row-lbl">${escHtml(r[0])}</span><span class="pat-det-row-val">${escHtml(r[1])}</span></div>`).join('')}
    </div>` : ''}

    ${(!readonly || fins.length) ? `
    <div class="pat-det-sec-head">
      <div class="sec-label" style="margin:0">Financiamento</div>
    </div>
    ${finHtml}` : ''}

    <div class="pat-det-sec-head">
      <div class="sec-label" style="margin:0">Histórico</div>
      ${readonly ? '' : `<button class="pat-link-add" onclick="openPatEvtForm('${p.id}')">+ Evento</button>`}
    </div>
    <div class="pat-list-group pat-det-lastgroup">${histHtml}</div>
  `;
}

// Re-renderiza o detalhe correto (imóvel/outro via renderPatDetail; veículo via
// renderVehPatDetail) após uma ação de financiamento. kind: 'pat' | 'veh'.
function _finRerender(kind, ownerId) {
  if (kind === 'veh') renderVehPatDetail(ownerId); else renderPatDetail(ownerId);
}

// ── CRUD de financiamentos (opera sobre a dívida canônica; finId === debtId) ──
// ownerId = patrimonioId (kind 'pat') ou vehicleId (kind 'veh'). Mesmo fluxo p/ ambos.
function openPatFinForm(patId, finId, kind) {
  if (_patEncerradoBloqueado(patId)) return;
  _patFinTarget = { patId: patId, finId: finId || null, kind: kind || 'pat' };
  const f = finId ? getDebt(finId) : null;
  document.getElementById('pfin-title').textContent = f ? 'Editar financiamento' : 'Novo financiamento';
  document.getElementById('pfin-bem-lbl').textContent        = `Valor do bem (${currSym})`;
  document.getElementById('pfin-financiado-lbl').textContent = `Valor financiado (${currSym}) *`;
  document.getElementById('pfin-saldo-lbl').textContent      = `Saldo devedor (${currSym}) *`;
  document.getElementById('pfin-inst').value       = f?.credor || '';
  document.getElementById('pfin-desc').value       = '';
  document.getElementById('pfin-bem').value        = f?.valorBem || '';
  document.getElementById('pfin-financiado').value = f?.valorOriginal || '';
  document.getElementById('pfin-saldo').value      = f ? _debtSaldo(f) : '';
  document.getElementById('pfin-inicio').value     = f?.dataInicio || '';
  document.getElementById('pfin-freq').value       = f?.periodicidade || 'mensal';
  document.getElementById('pfin-obs').value        = f?.observacoes || '';
  document.getElementById('pfin-id').value         = f?.id || '';
  openOverlay('pat-fin-sheet');
}

function savePatFin() {
  const t = _patFinTarget;
  if (!t) return;
  const kind = t.kind || 'pat';
  const p = kind === 'veh' ? (D.vehicles || []).find(x => x.id === t.patId) : getPatrimonio(t.patId);
  const inst = (document.getElementById('pfin-inst')?.value || '').trim();
  if (!inst) { gdToast('Informe a instituição.'); return; }
  const financiadoRaw = document.getElementById('pfin-financiado')?.value;
  const saldoRaw = document.getElementById('pfin-saldo')?.value;
  if (financiadoRaw === '' || financiadoRaw == null) { gdToast('Informe o valor financiado.'); return; }
  if (saldoRaw === '' || saldoRaw == null) { gdToast('Informe o saldo devedor.'); return; }
  const num = elId => {
    const raw = document.getElementById(elId)?.value;
    return raw === '' || raw == null ? 0 : Number(raw) || 0;
  };
  const financiado = num('pfin-financiado');
  const saldo = Number(saldoRaw) || 0;
  const existing = t.finId ? getDebt(t.finId) : null;
  const commonFields = {
    credor: inst, valorBem: num('pfin-bem'),
    dataInicio: document.getElementById('pfin-inicio')?.value || '',
    frequencia: document.getElementById('pfin-freq')?.value || 'mensal',
    observacoes: (document.getElementById('pfin-obs')?.value || '').trim(),
    titulo: (p && (p.nome || p.name)) || inst,
  };
  if (existing) {
    // Edição direta da dívida: saldo informado → amortizadoInicial derivado, preservando pagamentos.
    const pagosCents = _debtPaymentsOf(existing.id).reduce((s, pp) => s + _c(pp.valor), 0);
    const idx = D.debts.indexOf(existing);
    D.debts[idx] = _normDebt(Object.assign({}, existing, {
      credor: inst, valorBem: commonFields.valorBem, valorOriginal: financiado,
      amortizadoInicial: _r(_c(financiado) - _c(saldo) - pagosCents),
      dataInicio: commonFields.dataInicio, periodicidade: commonFields.frequencia,
      observacoes: commonFields.observacoes, tipo: 'financiamento', atualizadoEm: Date.now(),
    }));
    save();
  } else {
    const link = kind === 'veh' ? { vehicleId: t.patId } : { patrimonioId: t.patId };
    _patUpsertFinDebt(link, Object.assign({ valorFinanciado: financiado, saldo }, commonFields));
    save();
  }
  closeOverlay('pat-fin-sheet');
  _finRerender(kind, t.patId);
  gdToast(existing ? 'Financiamento atualizado.' : 'Financiamento adicionado.');
}

// ── Pagamento de financiamento: registra um pagamento na dívida (uma despesa) ──
var _pagFinTarget = null; // { patId, finId(=debtId) }
function openPagFinForm(patId, finId, kind) {
  if (_patEncerradoBloqueado(patId)) return;
  const f = getDebt(finId);
  if (!f) return;
  // Bloqueio de pagamento após quitação: sem saldo, não há o que pagar.
  if (_debtSaldoCents(f) <= 0) { gdToast('Este financiamento já está quitado.', { type: 'info' }); return; }
  _pagFinTarget = { patId: patId, finId: finId, kind: kind || 'pat' };
  const sum = document.getElementById('pagfin-summary');
  if (sum) sum.innerHTML =
    `<div class="pagfin-sum-row"><span>${escHtml(f.credor || 'Financiamento')}</span><span>Saldo <b>${R(_debtSaldo(f))}</b></span></div>`;
  document.getElementById('pagfin-valor-lbl').textContent = `Valor (${currSym}) *`;
  document.getElementById('pagfin-valor').value = '';
  document.getElementById('pagfin-data').value = todayStr();
  document.getElementById('pagfin-desc').value = '';
  const catSel = document.getElementById('pagfin-cat');
  if (catSel) catSel.innerHTML = (D.expCats || []).map(c => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('');
  const btn = document.getElementById('pagfin-save-btn'); if (btn) btn.disabled = false;
  openOverlay('pat-pagfin-sheet');
}

function salvarPagamentoFin() {
  const t = _pagFinTarget;
  if (!t) return;
  const f = getDebt(t.finId);
  if (!f) { closeOverlay('pat-pagfin-sheet'); return; }
  const btn = document.getElementById('pagfin-save-btn');
  if (btn && btn.disabled) return; // impede duplo toque
  // Bloqueio de pagamento após quitação (revalida no salvar).
  if (_debtSaldoCents(f) <= 0) { closeOverlay('pat-pagfin-sheet'); gdToast('Este financiamento já está quitado.', { type: 'info' }); return; }
  const valor = Number(document.getElementById('pagfin-valor')?.value) || 0;
  if (valor <= 0) { gdToast('Informe um valor válido.', { type: 'error' }); return; }
  // Não permite pagar além do saldo (evita amortização a mais / saldo negativo).
  const valorAplicado = Math.min(valor, _debtSaldo(f));
  const data = localDateKey(document.getElementById('pagfin-data')?.value) || dateStr(new Date());
  const cat = document.getElementById('pagfin-cat')?.value || (D.expCats[0] || 'Outros');
  const descIn = (document.getElementById('pagfin-desc')?.value || '').trim();
  if (btn) btn.disabled = true;
  _debtRegistrarPagamento(f.id, { valor: valorAplicado, data, categoria: cat, descricao: descIn || `Financiamento — ${f.credor || 'pagamento'}` });
  const _kind = t.kind || 'pat';
  const _owner = t.patId;
  _pagFinTarget = null;
  haptic(10); save();
  closeOverlay('pat-pagfin-sheet');
  _finRerender(_kind, _owner);
  refreshAfterDayEdit();
  gdToast('Pagamento registrado. Lançamento criado em Despesas.', { type: 'success' });
}

function deletePatFin(patId, finId, kind) {
  if (_patEncerradoBloqueado(patId)) return;
  const f = getDebt(finId);
  if (!f) return;
  const nPag = _debtPaymentsOf(finId).length;
  gdConfirm({
    title: 'Excluir financiamento',
    msg: `Excluir o financiamento${f.credor ? ` de "${f.credor}"` : ''}? O saldo devedor deixa de reduzir o patrimônio líquido. ${nPag > 0 ? `As ${nPag} despesa(s) já registrada(s) permanecem no histórico.` : ''}`,
    confirmText: 'Excluir',
    variant: 'danger',
    onConfirm: () => {
      // Remove a dívida e seus marcadores (vínculo ativo); despesas ficam no histórico.
      D.debtPayments = (D.debtPayments || []).filter(pp => pp.debtId !== finId);
      D.debts = (D.debts || []).filter(x => x.id !== finId);
      save();
      _finRerender(kind || 'pat', patId);
      gdToast('Financiamento excluído.', { type: 'success' });
    },
  });
}

// ── Eventos manuais do histórico ──
function openPatEvtForm(patId) {
  if (_patEncerradoBloqueado(patId)) return;
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
  if (_patEncerradoBloqueado(patId)) return;
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
  const statusK = ({ em_uso:'ativo', na_oficina:'ativo', a_venda:'ativo', vendido:'encerrado', arquivado:'encerrado' })[v.status] || 'ativo';
  const readonly = statusK !== 'ativo';           // vendido/encerrado = somente leitura
  const venda = readonly ? _patVendaOf(id) : null;
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
    ? _patEmptyState('pendencia', 'Nenhuma pendência aberta', 'Use “+ Vincular” para acompanhar pendências deste veículo aqui.')
    : pends.map(p => `
        <div class="pat-fin-item" style="cursor:default">
          <div class="pat-fin-body">
            <div class="pat-fin-name">${escHtml(p.title)}</div>
            <div class="pat-fin-sub">${(PEND_PRIO_NAMES[p.priority] || '')}${p.estimatedValue ? ' · ' + R(p.estimatedValue) : ''}</div>
          </div>
          ${readonly ? '' : `<button class="pat-mini-del" onclick="unlinkVehPend('${v.id}','${p.id}')" aria-label="Desvincular pendência">${_patTrashSvg()}</button>`}
        </div>`).join('');

  // ── Despesas vinculadas (canônico: vehicleId + índice legado; exclui pagamentos de dívida) ──
  const exps = _expensesDoBem(v.id)
    .filter(e => !(e.meta && e.meta.source === 'debt'))
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const expHtml = exps.length === 0
    ? _patEmptyState('despesa', 'Nenhuma despesa vinculada', 'Registre um gasto e escolha este veículo em “Relacionado a”. Ele aparece aqui e no custo do mês.')
    : exps.map(e => `
        <div class="pat-fin-item" style="cursor:default">
          <div class="pat-fin-body">
            <div class="pat-fin-name">${escHtml(e.description || e.category)}</div>
            <div class="pat-fin-sub">${fmtShort(e.date)} · ${escHtml(e.category)}</div>
          </div>
          <div class="pat-fin-right">
            <span class="pat-fin-saldo" style="color:var(--rd)">−${R(e.amount)}</span>
            ${readonly ? '' : `<button class="pat-mini-del" onclick="unlinkVehExp('${v.id}','${e.id}')" aria-label="Desvincular despesa">${_patTrashSvg()}</button>`}
          </div>
        </div>`).join('');

  // ── Custo deste mês (só veículo ativo): uso/manutenção + financiamento, sem dupla contagem ──
  const custo = readonly ? null : _vehCustoMes(v.id);
  const custoHtml = custo ? `
    <div class="pat-det-sec-head"><div class="sec-label" style="margin:0">Custo deste mês</div></div>
    <div class="pat-list-group" style="margin-bottom:0"><div class="veh-custo-card">
      <div class="veh-custo-row"><span>Uso e manutenção</span><span>${R(custo.uso)}</span></div>
      <div class="veh-custo-row"><span>Financiamento</span><span>${R(custo.fin)}</span></div>${custo.aquisicao > 0 ? `
      <div class="veh-custo-row"><span>Aquisição</span><span>${R(custo.aquisicao)}</span></div>` : ''}
      <div class="veh-custo-row veh-custo-total"><span>Total desembolsado</span><span>${R(custo.total)}</span></div>
    </div></div>` : '';

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
  const histHtml = `
    <div class="pat-det-sec-head"><div class="sec-label" style="margin:0">Histórico</div></div>
    <div class="pat-list-group pat-det-lastgroup">
      ${histItems.length === 0
        ? _patEmptyState('historico', 'Nenhum evento ainda', 'Atualizações de km e reavaliações do veículo aparecem aqui.')
        : histItems.map(e => `
        <div class="pat-hist-item">
          <div class="pat-hist-dot-col"><span class="pat-hist-dot ${e.kind === 'aval' ? 'pat-hist-dot-aval' : ''}"></span></div>
          <div class="pat-hist-body">
            <div class="pat-hist-title">${e.title.startsWith('<') ? e.title : escHtml(e.title)}</div>
            ${e.body ? `<div class="pat-hist-val">${e.body}</div>` : ''}
            <div class="pat-hist-date">${_patFmtDate(e.data)}</div>
          </div>
        </div>`).join('')}
    </div>`;

  // ── Financiamento do veículo (mesmo fluxo do imóvel; fonte única D.debts) ──
  // Bem encerrado (vendido) = somente leitura: sem adicionar financiamento/vínculos.
  const vehDebts = _debtsForVehicle(v.id);
  const finVehHtml = (readonly && vehDebts.length === 0) ? '' : `
    <div class="pat-det-sec-head"><div class="sec-label" style="margin:0">Financiamento</div></div>
    ${vehDebts.length === 0
      ? `<button class="btn btn-secondary" style="width:100%" onclick="openPatFinForm('${v.id}','','veh')">Este bem é financiado — adicionar</button>`
      : `<div class="pat-list-group" style="margin-bottom:0">${vehDebts.map(f => _finCardHtml(f, v.id, 'veh', readonly)).join('')}</div>`}`;

  const safePhoto = _vehSafePhoto(v.photo);
  const photoHtml = safePhoto
    ? `<img src="${escHtml(safePhoto)}" alt="${escHtml(v.name)}" onerror="_vehImgError(this)">`
    : _vehIconSvg(26);

  cont.innerHTML = `
    ${_pageHeader("_backToPatHomePreserveScroll()", 'Veículo', `
      <div class="phr-actions">
        ${readonly ? '' : `<button class="btn-pill" onclick="openVehForm('${v.id}')">Editar</button>`}
        <button class="pat-kebab-btn" onclick="openVehMenu('${v.id}')" aria-label="Mais ações do veículo">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true" focusable="false"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>
        </button>
      </div>`)}

    <div class="card pat-det-hero${statusK !== 'ativo' ? ' pat-hero-inactive' : ''}">
      ${_patStateBanner(statusK, 'veiculo')}
      <div class="pat-det-hero-row">
        <div class="pat-list-photo pat-det-photo${safePhoto ? '' : ' pat-ico-veiculo'}">${photoHtml}</div>
        <div class="pat-det-hero-info">
          <div class="pat-det-name">${escHtml(v.name)}</div>
          ${sub ? `<div class="pat-det-sub-line">${escHtml(sub)}</div>` : ''}
          <div class="pat-list-meta">
            <span class="pat-chip pat-chip-veiculo">Veículo</span>
            ${statusK === 'ativo' ? `<span class="pat-status s-${statusK}"><span class="pat-status-dot"></span><span class="pat-status-lbl">${escHtml(statusLbl)}</span></span>` : ''}
          </div>
          ${(v.plate || (v.km != null && v.km !== '')) ? `<div class="pat-det-sub-line" style="margin-top:4px">${[v.plate ? escHtml(v.plate) : '', (v.km != null && v.km !== '') ? Number(v.km).toLocaleString('pt-BR') + ' km' : ''].filter(Boolean).join(' · ')}</div>` : ''}
        </div>
      </div>
      <div class="pat-det-valblock">
        <div class="pat-det-val-lbl">Valor atual estimado</div>
        ${valorInformado
          ? `<div class="pat-det-val">${R(pat.valorEstimado)}</div>`
          : `<div class="pat-det-val-empty">Valor não informado</div>`}
      </div>
    </div>

    ${venda ? _patVendaSummaryHtml(venda) : ''}

    ${custoHtml}

    ${finVehHtml}

    ${hasInfo ? `
    <div class="pat-det-sec-head"><div class="sec-label" style="margin:0">Informações do veículo</div></div>
    <div class="pat-list-group" style="margin-bottom:0">
      ${infoRows.map(r => `<div class="pat-det-row"><span class="pat-det-row-lbl">${escHtml(r[0])}</span><span class="pat-det-row-val">${escHtml(r[1])}</span></div>`).join('')}
      ${v.notes ? `<div class="pat-det-row pat-det-row-notes"><span class="pat-det-row-lbl">Observações</span><span class="pat-det-row-val pat-det-row-val-notes">${escHtml(v.notes)}</span></div>` : ''}
    </div>` : ''}

    ${(!readonly || pends.length) ? `
    <div class="pat-det-sec-head">
      <div class="sec-label" style="margin:0">Pendências</div>
      ${readonly ? '' : `<button class="pat-link-add" onclick="openVehLinkPend('${v.id}')">+ Vincular</button>`}
    </div>
    <div class="pat-list-group" style="margin-bottom:0">${pendHtml}</div>` : ''}

    ${(!readonly || exps.length) ? `
    <div class="pat-det-sec-head">
      <div class="sec-label" style="margin:0">Despesas</div>
      <div style="display:flex;gap:12px;align-items:center">
        ${exps.length ? `<button class="pat-link-add" onclick="abrirDespesasDoBem('${v.id}')">Ver despesas</button>` : ''}
        ${readonly ? '' : `<button class="pat-link-add" onclick="openVehLinkExp('${v.id}')">+ Vincular</button>`}
      </div>
    </div>
    <div class="pat-list-group" style="margin-bottom:0">${expHtml}</div>` : ''}

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
  const encerrado = _patLifecycleOf(id) === 'encerrado';
  const lifeLbl = document.getElementById('vmenu-life-lbl');
  if (lifeLbl) lifeLbl.textContent = encerrado ? 'Reabrir' : 'Marcar como vendido';
  const statusOpt = document.getElementById('vmenu-status-opt');
  if (statusOpt) statusOpt.style.display = encerrado ? 'none' : ''; // "Alterar status" só em bem ativo
  openOverlay('veh-menu-sheet');
}
function vehMenuStatus() {
  closeOverlay('veh-menu-sheet');
  if (_vehMenuTarget) openVehStatus(_vehMenuTarget);
}
// Botão de ciclo de vida: vender (ativo) / reabrir (encerrado).
function vehMenuArchive() {
  closeOverlay('veh-menu-sheet');
  const id = _vehMenuTarget; if (!id) return;
  if (_patLifecycleOf(id) === 'encerrado') reabrirBem(id); else venderBem(id);
}
function vehMenuDelete() {
  closeOverlay('veh-menu-sheet');
  if (_vehMenuTarget) excluirBemGuardado(_vehMenuTarget);
}
function _vehDoDelete(id) {
  const v = (D.vehicles || []).find(x => x.id === id); if (!v) return;
  gdConfirm({
    title: 'Excluir veículo', variant: 'danger', confirmText: 'Excluir',
    msg: 'Excluir permanentemente este veículo? Esta ação não pode ser desfeita.',
    onConfirm: () => {
      D.vehicles = (D.vehicles || []).filter(x => x.id !== id);
      save(); renderPatrimonioHome();
      gdToast('Veículo excluído definitivamente.', { type: 'success' });
    },
  });
}
