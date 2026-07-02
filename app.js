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
  };
}

let D = (() => {
  try { const s = localStorage.getItem('gdcash_v1'); if(s) return JSON.parse(s); } catch(e){}
  return defaultData();
})();

function save() { try { localStorage.setItem('gdcash_v1', JSON.stringify(D)); } catch(e){} }

function exportData() {
  const blob = new Blob([JSON.stringify(D, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `gdcash-backup-${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(url);
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
  return sign+'$ '+Math.abs(n).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
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
function sumDayIncome(date)       { const i=getDayIncome(date); return D.platforms.reduce((s,p)=>s+(i[p.id]||0),0); }
function sumPlatWeek(pid,off=0)   { return weekDates(off).reduce((s,d)=>{const i=getDayIncome(d);return s+(i[pid]||0);},0); }
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
function sumMonthPlat(pid,off=0) { const dates=monthDates(off); return dates.reduce((s,d)=>{const i=getDayIncome(d);return s+(i[pid]||0);},0); }
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
  if(curInc===0&&curExp===0){alerts.push({t:'info',icon:'📝',msg:'Nenhum dado esta semana. Comece lançando suas receitas!'});return alerts;}
  if(curInc>0&&bal<0) alerts.push({t:'bad',icon:'🔴',msg:`Saldo da semana <b>negativo</b> (${R(bal)}). Gastos acima das receitas.`});
  if(prevExp>0){const d=((curExp-prevExp)/prevExp)*100;
    if(d>25) alerts.push({t:'bad',icon:'📈',msg:`Gastos ${Math.round(d)}% acima da semana passada (+${R(curExp-prevExp)}).`});
    else if(d<-15&&curExp>0) alerts.push({t:'ok',icon:'📉',msg:`Você gastou ${Math.round(Math.abs(d))}% menos que na semana passada. 👏`});
  }
  if(curInc===0&&curExp>0) alerts.push({t:'warn',icon:'💡',msg:'Há gastos mas nenhuma receita registrada. Lembre de lançar seus ganhos!'});
  if(D.emergency.target>0&&(D.emergency.current/D.emergency.target)<0.3)
    alerts.push({t:'warn',icon:'🛡️',msg:`Reserva em ${Math.round(D.emergency.current/D.emergency.target*100)}% da meta.`});
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

  const dayInc=sumDayIncome(date), dayExp=sumDayExpenses(date), dayBal=dayInc-dayExp;
  const rv=document.getElementById('result-val');
  rv.textContent=R(dayBal); rv.className='result-val '+(dayBal>=0?'pos':'neg');

  const addSec=document.getElementById('add-exp-section');
  addSec.style.opacity=isOff?'0.4':'1';
  addSec.style.pointerEvents=isOff?'none':'auto';
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
          <span class="v-green">${w.wI>0?R(w.wI):'—'}</span>
          <span class="${w.wL>=0?'v-green':'v-red'}">${w.wI>0?R(w.wL):'—'}</span>
        </span>
      </div>
      <div class="s2s-bar-wrap"><div class="s2s-bar-fill" style="width:${Math.min(100,(w.wI/maxWI)*100)}%"></div></div>
    </div>`).join('');
  const totalHTML=`
    <div class="s2s-total">
      <span class="s2s-total-lbl">Total do mês</span>
      <span class="s2s-vals">
        <span class="v-green">${R(totalI)}</span>
        <span class="${totalL>=0?'v-green':'v-red'}">${R(totalL)}</span>
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
  if(tab==='reserva') renderReserva();
  if(tab==='fixos')   renderFixos();
}

// ══════════════════════════════════════════
// INIT
// ══════════════════════════════════════════
renderSemana();
