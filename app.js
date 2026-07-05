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
  if (active === 'semana')  renderSemana();
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
      renderSemana();
      checkGoalNotifications();
    } else {
      currentUser = null;
      loginScreen.style.display = 'flex';
      avatarBtn.style.display   = 'none';
    }
  });
}

function signInWithGoogle() {
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider).catch(err => {
    if (err.code === 'auth/popup-blocked' || err.code === 'auth/popup-closed-by-user') {
      auth.signInWithRedirect(provider);
    } else {
      alert('Erro ao entrar: ' + err.message);
    }
  });
}

function confirmSignOut() {
  if (confirm('Sair da sua conta?')) auth.signOut();
}

async function loadFromCloud() {
  try {
    const doc = await db.collection('users').doc(currentUser.uid).collection('data').doc('main').get();
    if (doc.exists) {
      D = { ...defaultData(), ...doc.data() };
      if (!D.goals) D.goals = [];
      if (!D.weeklyGoal) D.weeklyGoal = 0;
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
function changeWeek(dir) { weekOffset+=dir; selDayIdx=0; renderSemana(); }

// ══════════════════════════════════════════
// INCOME HELPERS
// ══════════════════════════════════════════
function getDayIncome(date)       { return D.dailyIncome[date]||{}; }
function setDayIncome(date,pid,v) { if(!D.dailyIncome[date])D.dailyIncome[date]={}; D.dailyIncome[date][pid]=parseFloat(v)||0; save(); }
function paidItemsForDate(date)   { return (D.incomeItems||[]).filter(it=>it.date===date&&it.status==='paid'); }
function sumDayIncome(date)       {
  const i=getDayIncome(date);
  const fromQuick=D.platforms.reduce((s,p)=>s+(i[p.id]||0),0);
  const fromItems=paidItemsForDate(date).reduce((s,it)=>s+it.amount,0);
  return fromQuick+fromItems;
}
function sumPlatWeek(pid,off=0)   {
  return weekDates(off).reduce((s,d)=>{
    const i=getDayIncome(d);
    const fromItems=(D.incomeItems||[]).filter(it=>it.date===d&&it.platformId===pid&&it.status==='paid').reduce((a,it)=>a+it.amount,0);
    return s+(i[pid]||0)+fromItems;
  },0);
}
function sumWeekIncome(off=0)     { return D.platforms.reduce((s,p)=>s+sumPlatWeek(p.id,off),0); }
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
  const dates=monthDates(off);
  return D.platforms.reduce((s,p)=>s+dates.reduce((ss,d)=>{const i=getDayIncome(d);return ss+(i[p.id]||0);},0),0);
}
function sumMonthExpenses(off=0) { const dates=monthDates(off); return D.expenses.filter(e=>dates.includes(e.date)).reduce((s,e)=>s+e.amount,0); }
function sumMonthPlat(pid,off=0) {
  const dates=monthDates(off);
  return dates.reduce((s,d)=>{
    const i=getDayIncome(d);
    const fromItems=(D.incomeItems||[]).filter(it=>it.date===d&&it.platformId===pid&&it.status==='paid').reduce((a,it)=>a+it.amount,0);
    return s+(i[pid]||0)+fromItems;
  },0);
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
// ALERTS
// ══════════════════════════════════════════
function buildAlerts() {
  const alerts=[];
  const curInc=sumWeekIncome(weekOffset), curExp=sumWeekExpenses(weekOffset), bal=curInc-curExp;
  const prevExp=sumWeekExpenses(weekOffset-1);
  const lastBackup = localStorage.getItem('gdcash_last_backup');
  if (!lastBackup) {
    localStorage.setItem('gdcash_last_backup', todayStr());
  } else {
    const daysSince = Math.round((new Date()-parseDate(lastBackup))/(1000*60*60*24));
    if (daysSince >= 30) alerts.push({t:'warn',icon:'💾',msg:`Faz <b>${daysSince} dias</b> sem backup. <u style="cursor:pointer" onclick="exportData()">Toque aqui pra salvar agora</u> e não perder seus dados.`});
  }
  if(curInc===0&&curExp===0){alerts.push({t:'info',icon:'📝',msg:'Nenhum dado esta semana. Comece lançando suas receitas!'});return alerts;}
  if(D.weeklyGoal>0){
    const wg=D.weeklyGoal, dates=weekDates(weekOffset), now=new Date(); now.setHours(0,0,0,0);
    const daysLeft=dates.filter(d=>parseDate(d)>now).length;
    const left=wg-curInc;
    if(curInc>=wg) alerts.push({t:'ok',icon:'🎯',msg:`Meta da semana atingida! Você fez <b>${R(curInc)}</b> de <b>${R(wg)}</b>. 🎉`});
    else if(daysLeft>0&&left>0) alerts.push({t:'info',icon:'🎯',msg:`Meta da semana: faltam <b>${R(left)}</b> em ${daysLeft} dia${daysLeft!==1?'s':''}.`});
  }
  if(curInc>0&&bal<0) alerts.push({t:'bad',icon:'🔴',msg:`Saldo da semana <b>negativo</b> (${R(bal)}). Gastos acima das receitas.`});
  if(prevExp>0){const d=((curExp-prevExp)/prevExp)*100;
    if(d>25) alerts.push({t:'bad',icon:'📈',msg:`Gastos ${Math.round(d)}% acima da semana passada (+${R(curExp-prevExp)}).`});
    else if(d<-15&&curExp>0) alerts.push({t:'ok',icon:'📉',msg:`Você gastou ${Math.round(Math.abs(d))}% menos que na semana passada. 👏`});
  }
  if(curInc===0&&curExp>0) alerts.push({t:'warn',icon:'💡',msg:'Há gastos mas nenhuma receita registrada. Lembre de lançar seus ganhos!'});
  if(D.emergency.target>0&&(D.emergency.current/D.emergency.target)<0.3)
    alerts.push({t:'warn',icon:'🛡️',msg:`Reserva em ${Math.round(D.emergency.current/D.emergency.target*100)}% da meta.`});
  const today=new Date(); today.setHours(0,0,0,0);
  (D.goals||[]).forEach(g=>{
    if(g.saved>=g.target) return;
    const dl=parseDate(g.deadline), daysLeft=Math.round((dl-today)/(1000*60*60*24));
    if(daysLeft<0||daysLeft>60) return;
    const pct=g.target>0?Math.round((g.saved/g.target)*100):0;
    const left=R(g.target-g.saved);
    if(daysLeft<=7) alerts.push({t:'bad',icon:g.emoji||'🎯',msg:`<b>${g.name}</b>: prazo em ${daysLeft===0?'hoje!':daysLeft+' dia'+(daysLeft!==1?'s':'')+' !'} Faltam <b>${left}</b> (${pct}% completo).`});
    else alerts.push({t:'warn',icon:g.emoji||'🎯',msg:`<b>${g.name}</b>: ${daysLeft} dias restantes. Faltam ${left} (${pct}% completo).`});
  });
  return alerts;
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
  let offset=0, paths='';
  items.forEach(it=>{
    const len=(it.value/total)*circ;
    paths+=`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${it.color}" stroke-width="16"
      stroke-dasharray="${len} ${circ-len}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})"/>`;
    offset+=len;
  });
  svg.innerHTML = paths;
  legend.innerHTML = items.map(it=>`
    <div class="legend-item">
      <span class="legend-dot" style="background:${it.color}"></span>
      <span class="legend-label">${it.label}</span>
      <span class="legend-pct">${Math.round(it.value/total*100)}%</span>
      <span class="legend-val">${R(it.value)}</span>
    </div>`).join('');
}

// ══════════════════════════════════════════
// RENDER: SEMANA
// ══════════════════════════════════════════
function renderSemana() {
  const dates=weekDates(weekOffset);
  document.getElementById('week-lbl').innerHTML=`Semana <b>${fmtShort(dates[0])} – ${fmtShort(dates[6])}</b>`;
  const inc=sumWeekIncome(weekOffset), exp=sumWeekExpenses(weekOffset), liq=inc-exp;
  document.getElementById('ws-inc').textContent=R(inc);
  document.getElementById('ws-exp').textContent=R(exp);
  document.getElementById('ws-liq').textContent=R(liq);
  document.getElementById('hero-semana').className='hero-card '+(liq>=0?'pos':'neg');

  document.getElementById('plat-cards').innerHTML=D.platforms.map(p=>`
    <div class="plat-c" style="border-top-color:${p.color}" onclick="openPlatSettings()">
      <div class="plat-c-name" style="color:${p.color}">${p.name}</div>
      <div class="plat-c-val">${R(sumPlatWeek(p.id,weekOffset))}</div>
    </div>`).join('');

  document.getElementById('days-grid').innerHTML=dates.map((d,i)=>{
    const hasData=Object.values(getDayIncome(d)).some(v=>v>0)||getDayExpenses(d).length>0;
    const isOff=D.daysOff.includes(d);
    const dt=parseDate(d);
    return `<div class="day-btn${i===selDayIdx?' sel':''}${hasData?' has-data':''}${isOff?' off':''}" onclick="selectDay(${i})">
      <div class="day-lbl">${WEEK_DAYS[i]}</div>
      <div class="day-num">${dt.getDate()}</div>
      <div class="day-dot"></div>
    </div>`;
  }).join('');

  renderDayDetail();
  renderWeekGoal();
  renderAvg5w();

  const alerts=buildAlerts();
  document.getElementById('alerts-box').innerHTML=alerts.map(a=>`
    <div class="alert-item a-${a.t}"><span>${a.icon}</span><span>${a.msg}</span></div>`).join('');

  populateExpCatSel();
}

function selectDay(idx) { selDayIdx=idx; renderSemana(); }

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
  grid.innerHTML=D.platforms.map(p=>`
    <div class="inc-inp-wrap">
      <div class="inc-inp-lbl" style="color:${p.color}">${p.name}</div>
      <input class="inc-inp" type="number" min="0" step="0.01" placeholder="0.00"
        value="${inc[p.id]||''}"
        onchange="setDayIncome('${date}','${p.id}',this.value);renderDayDetail()"
        ${isOff?'disabled':''}>
    </div>`).join('');

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
  save(); renderSemana();
}

function deleteIncomeItem(id) {
  D.incomeItems=(D.incomeItems||[]).filter(it=>it.id!==id);
  save(); renderSemana();
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
  save(); renderSemana();
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
  save(); renderSemana();
}

function deleteExpense(id) { D.expenses=D.expenses.filter(e=>e.id!==id); save(); renderSemana(); }

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
  document.getElementById('mes-inc').textContent=R(inc);
  document.getElementById('mes-exp').textContent=R(exp);
  document.getElementById('mes-liq').textContent=R(liq);
  document.getElementById('mes-resv').textContent=R(resv);
  document.getElementById('hero-mes').className='hero-card '+(liq>=0?'pos':'neg');

  const platItems=D.platforms.map(p=>({label:p.name,value:sumMonthPlat(p.id,monthOffset),color:p.color})).filter(i=>i.value>0);
  renderDonut('plat-donut','plat-legend',platItems);

  const dates=monthDates(monthOffset);
  const mExps=D.expenses.filter(e=>dates.includes(e.date));
  const catMap={};
  mExps.forEach(e=>{ catMap[e.category]=(catMap[e.category]||0)+e.amount; });
  const catItems=Object.entries(catMap).sort((a,b)=>b[1]-a[1]).map(([label,value],i)=>({label,value,color:PALETTE[i%PALETTE.length]}));
  renderDonut('cat-donut','cat-legend',catItems);

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
// QUICK ADD
// ══════════════════════════════════════════
let qaType = 'exp';

function openQuickAdd() {
  qaType = 'exp';
  document.getElementById('qa-type-exp').classList.add('active');
  document.getElementById('qa-type-inc').classList.remove('active');
  document.getElementById('qa-cat-wrap').style.display = '';
  document.getElementById('qa-plat-wrap').style.display = 'none';
  document.getElementById('qa-val').value = '';
  document.getElementById('qa-desc').value = '';
  document.getElementById('qa-date').value = todayStr();
  document.getElementById('qa-cat').innerHTML = D.expCats.map(c=>`<option value="${c}">${c}</option>`).join('');
  openOverlay('modal-quickadd');
  setTimeout(()=>document.getElementById('qa-val').focus(), 300);
}

function setQaType(type) {
  qaType = type;
  document.getElementById('qa-type-exp').classList.toggle('active', type==='exp');
  document.getElementById('qa-type-inc').classList.toggle('active', type==='inc');
  document.getElementById('qa-cat-wrap').style.display = type==='exp' ? '' : 'none';
  document.getElementById('qa-plat-wrap').style.display = type==='inc' ? '' : 'none';
  if (type==='inc') {
    document.getElementById('qa-plat').innerHTML = D.platforms.map(p=>`<option value="${p.id}">${p.name}</option>`).join('');
  }
}

function saveQuickAdd() {
  const val = parseFloat(document.getElementById('qa-val').value);
  const date = document.getElementById('qa-date').value || todayStr();
  const desc = document.getElementById('qa-desc').value.trim();
  if (!val || val <= 0) { alert('Informe um valor válido.'); return; }
  if (qaType === 'exp') {
    const cat = document.getElementById('qa-cat').value;
    D.expenses.push({ id:uid(), date, category:cat, amount:val, description:desc });
  } else {
    const pid = document.getElementById('qa-plat').value;
    if (!D.dailyIncome[date]) D.dailyIncome[date] = {};
    D.dailyIncome[date][pid] = (D.dailyIncome[date][pid]||0) + val;
  }
  save();
  closeOverlay('modal-quickadd');
  // refresh visible tab
  const activeTab = document.querySelector('.page.active')?.id?.replace('page-','');
  if (activeTab === 'semana') renderSemana();
  else if (activeTab === 'mes') renderMes();
}

// ══════════════════════════════════════════
// AVG LAST 5 WEEKS
// ══════════════════════════════════════════
function getCompletedWeeksWithData(maxWeeks=5, lookbackLimit=20) {
  const results = [];
  const now = new Date(); now.setHours(0,0,0,0);
  let lookback = 1;
  while (results.length < maxWeeks && lookback <= lookbackLimit) {
    const off = -lookback;
    // Only include weeks that have fully ended (sunday of that week < today)
    const dates = weekDates(off);
    const weekEnd = parseDate(dates[6]); weekEnd.setHours(23,59,59);
    if (weekEnd >= now) { lookback++; continue; }
    const inc = sumWeekIncome(off);
    if (inc > 0) results.push({ off, inc, label: `${fmtShort(dates[0])} – ${fmtShort(dates[6])}` });
    lookback++;
  }
  return results;
}

let avg5wDetailOpen = false;

function renderAvg5w() {
  const el = document.getElementById('avg5w-card');
  if (!el) return;

  const weeks = getCompletedWeeksWithData();
  if (weeks.length === 0) { el.innerHTML = ''; return; }

  const isProvisional = weeks.length < 5;
  const avg = weeks.reduce((s,w)=>s+w.inc,0) / weeks.length;
  const goal = D.weeklyGoal || 0;
  const diff = goal > 0 ? avg - goal : null;

  // Status line
  let statusClass = 'neutral', statusTxt = '';
  if (isProvisional) {
    statusTxt = `Calculando… ${weeks.length} de 5 semanas`;
    statusClass = 'neutral';
  } else if (diff === null) {
    statusTxt = 'Sem meta definida';
    statusClass = 'neutral';
  } else if (Math.abs(diff) < 0.5) {
    statusTxt = 'Dentro da meta';
    statusClass = 'on';
  } else if (diff > 0) {
    statusTxt = `${R(diff)} acima da meta`;
    statusClass = 'above';
  } else {
    statusTxt = `${R(Math.abs(diff))} abaixo da meta`;
    statusClass = 'below';
  }

  const detailRows = weeks.map(w=>`
    <div class="avg5w-row">
      <span class="avg5w-row-lbl">${w.label}</span>
      <span class="avg5w-row-val">${R(w.inc)}</span>
    </div>`).join('');

  el.innerHTML = `
    <div class="avg5w-card" onclick="toggleAvg5wDetail()">
      <div class="avg5w-main-row">
        <span class="avg5w-title">Média ${isProvisional?'':'5 '}semanas</span>
        <span class="avg5w-val">${isProvisional ? '—' : R(avg)}</span>
      </div>
      <div class="avg5w-status ${statusClass}">${statusTxt}</div>
      <div class="avg5w-detail" style="display:${avg5wDetailOpen?'':'none'}">
        ${detailRows}
      </div>
    </div>`;
}

function toggleAvg5wDetail() {
  avg5wDetailOpen = !avg5wDetailOpen;
  renderAvg5w();
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
  save(); closeOverlay('modal-week-goal'); renderWeekGoal(); renderAvg5w();
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

// ══════════════════════════════════════════
// TABS
// ══════════════════════════════════════════
function switchTab(tab) {
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'));
  document.getElementById('page-'+tab).classList.add('active');
  document.querySelector(`[data-tab="${tab}"]`)?.classList.add('active');
  if(tab==='semana')  renderSemana();
  if(tab==='mes')     renderMes();
  if(tab==='reserva')   renderReserva();
  if(tab==='fixos')     renderFixos();
  if(tab==='conversor') loadConversorRates();
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
// INIT
// ══════════════════════════════════════════
if (CLOUD_ENABLED) {
  initFirebase(); // renders app after auth
} else {
  renderSemana();
  checkGoalNotifications();
}
