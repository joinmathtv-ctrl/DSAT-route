/* ===== 저장/공통 ===== */
const ATTEMPT_KEY='dsat_attempts_v1';
function loadAttempts(){ try{ return JSON.parse(localStorage.getItem(ATTEMPT_KEY)||'[]'); }catch(_e){ return []; } }
function saveAttempts(a){ try{ localStorage.setItem(ATTEMPT_KEY, JSON.stringify(a)); }catch(_e){} }

/* 세트별 기본 프리셋(보기용) 로컬 저장 */
const PRESET_DEFAULT_KEY = 'dsat_preset_defaults';
function loadPresetDefaults(){ try{ return JSON.parse(localStorage.getItem(PRESET_DEFAULT_KEY)||'{}'); }catch(_e){ return {}; } }
function savePresetDefaults(obj){ try{ localStorage.setItem(PRESET_DEFAULT_KEY, JSON.stringify(obj)); }catch(_e){} }

/* ===== Filter Persistence (1-B) ===== */
const FILTER_KEY = 'dsat_dashboard_filters_v1';
let FILTERS_READY = false; // 초기 세팅 중 불필요 저장 방지

function loadFilters() {
  try { return JSON.parse(localStorage.getItem(FILTER_KEY) || '{}'); } catch { return {}; }
}
function saveFilters(filters) {
  if (!FILTERS_READY) return;
  try { localStorage.setItem(FILTER_KEY, JSON.stringify(filters)); } catch {}
}
function snapshotFiltersFromUI() {
  const from = document.getElementById('fromDate').value || '';
  const to   = document.getElementById('toDate').value || '';
  return {
    baseId: document.getElementById('baseSelect').value || '',
    kind:   document.getElementById('kindSelect').value || '',
    preset: document.getElementById('presetSelect').value || '',
    from, to
  };
}
function applySavedFiltersToUI() {
  const f = loadFilters();
  const byId = (id)=>document.getElementById(id);

  if (f.baseId && byId('baseSelect').querySelector(`option[value="${CSS.escape(f.baseId)}"]`)) {
    byId('baseSelect').value = f.baseId;
  }
  if (f.kind && byId('kindSelect').querySelector(`option[value="${CSS.escape(f.kind)}"]`)) {
    byId('kindSelect').value = f.kind;
  }
  if (f.preset && byId('presetSelect').querySelector(`option[value="${CSS.escape(f.preset)}"]`)) {
    byId('presetSelect').value = f.preset;
  }
  if (f.from) byId('fromDate').value = f.from;
  if (f.to)   byId('toDate').value   = f.to;
}

/* ===== Chart.js 공통 옵션 (툴팁/호버 강화, 1-C) ===== */
const chartCommonOptions = {
  responsive: true,
  interaction: { mode: 'nearest', intersect: false },
  plugins: {
    tooltip: {
      callbacks: {
        title: (items) => {
          const it = items[0];
          const att = it.raw && it.raw.__att;
          if (!att) return it.label || 'Attempt';
          const d = new Date(att.ts ?? att.date ?? 0);
          const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
          return `Set ${att.title || att.baseId || '-'} · ${ds}`;
        },
        label: (item) => `Value: ${item.formattedValue}`,
        afterLabel: (item) => {
          const att = item.raw && item.raw.__att;
          if (!att) return '';
          const rw = att.sections?.rw?.correct ?? att.scores?.rw?.raw ?? '-';
          const m  = att.sections?.math?.correct ?? att.scores?.math?.raw ?? '-';
          return `RW raw: ${rw}\nMath raw: ${m}`;
        }
      }
    },
    legend: { display: true }
  },
  scales: {
    x: {
      type: 'linear',
      ticks: {
        autoSkip: true,
        maxRotation: 0,
        callback: (val) => formatDateTick(val)
      },
      grid: { display: false }
    }
  },
  parsing: false
};

function formatDateTick(ms){
  if (!ms || isNaN(ms)) return '';
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

/* ===== 곡선 계산 ===== */
function interp(points,x){
  const pts=[...points].sort((a,b)=>a[0]-b[0]); if(!pts.length) return 0;
  if(x<=pts[0][0]) return Math.round(pts[0][1]);
  if(x>=pts[pts.length-1][0]) return Math.round(pts[pts.length-1][1]);
  for(let i=1;i<pts.length;i++){ const [x0,y0]=pts[i-1],[x1,y1]=pts[i]; if(x<=x1){ const t=(x-x0)/(x1-x0); return Math.round(y0+t*(y1-y0)); } }
  return Math.round(pts[pts.length-1][1]);
}
function scaledFromCurve(points, correct, total){
  const maxX=Math.max(...points.map(p=>p[0]));
  const x=(maxX<=100)?(total? correct/total*100 : 0):correct;
  return interp(points,x);
}
function chooseCurves(presetName, attempt){
  const PRESETS=(window.CURVE_PRESETS||{});
  if(presetName && PRESETS[presetName]) return PRESETS[presetName];
  if(attempt?.curvePreset && PRESETS[attempt.curvePreset]) return PRESETS[attempt.curvePreset];
  return PRESETS.default || { rw:[[0,200],[100,800]], math:[[0,200],[100,800]] };
}
function ensureScaled(attempt, viewPreset){
  const curves = chooseCurves(viewPreset, attempt);
  let rw = {correct:0,total:0,scaled:0};
  let math = {correct:0,total:0,scaled:0};
  if(attempt.sections){
    rw.correct   = attempt.sections.rw?.correct ?? 0;
    rw.total     = attempt.sections.rw?.total ?? 0;
    math.correct = attempt.sections.math?.correct ?? 0;
    math.total   = attempt.sections.math?.total ?? 0;
  }
  rw.scaled   = scaledFromCurve(curves.rw,   rw.correct,   rw.total);
  math.scaled = scaledFromCurve(curves.math, math.correct, math.total);
  const sat_total = rw.scaled + math.scaled;
  return { ...attempt, sections:{ rw, math }, sat_total };
}

/* ===== UI 요소 ===== */
const $base   = document.getElementById('baseSelect');
const $kind   = document.getElementById('kindSelect');
const $preset = document.getElementById('presetSelect');
const $count  = document.getElementById('countInfo');
const $tbody  = document.querySelector('#attemptTable tbody');
const $cmpA   = document.getElementById('cmpA');
const $cmpB   = document.getElementById('cmpB');
const $cmpOut = document.getElementById('cmpOut');
const $skillSel = document.getElementById('skillSelect');
const $from  = document.getElementById('fromDate');
const $to    = document.getElementById('toDate');
const $agg   = document.getElementById('aggMode');
const $aggCard = document.getElementById('aggCard');
const $aggOut  = document.getElementById('aggOut');
const $aggCaption = document.getElementById('aggCaption');
let LINE=null, BAR=null, SKILL_LINE=null;

/* ===== 옵션 구성 ===== */
function groupBaseOptions(list){
  const map=new Map();
  list.forEach(a=>{
    if(!map.has(a.baseId)) map.set(a.baseId,{ baseId:a.baseId, titleSet:new Set(), lastTs:0 });
    const rec=map.get(a.baseId);
    if(a.title) rec.titleSet.add(a.title);
    rec.lastTs = Math.max(rec.lastTs,a.ts);
  });
  return [...map.values()].sort((a,b)=> b.lastTs-a.lastTs).map(rec=>{
    const label = rec.titleSet.size? [...rec.titleSet].pop() : rec.baseId;
    return { value: rec.baseId, label };
  });
}
function fillBase(list){
  $base.innerHTML='';
  groupBaseOptions(list).forEach(opt=>{
    const o=document.createElement('option'); o.value=opt.value; o.textContent=opt.label; $base.appendChild(o);
  });

  // 저장된 baseId가 있으면 우선 적용
  const saved = loadFilters();
  if (saved.baseId && $base.querySelector(`option[value="${CSS.escape(saved.baseId)}"]`)) {
    $base.value = saved.baseId;
  }

  // 세트별 기본 프리셋 자동 선택(단, 저장된 preset이 있으면 저장값 우선)
  const def=loadPresetDefaults(); const baseId=$base.value;
  if(def[baseId] && ($preset.querySelector(`option[value="${def[baseId]}"]`))){
    if (!saved.preset) $preset.value=def[baseId];
  }
}
function fillPreset(){
  const PRESETS = window.CURVE_PRESETS||{};
  $preset.innerHTML='';
  Object.keys(PRESETS).forEach(name=>{
    const o=document.createElement('option'); o.value=name; o.textContent=name; $preset.appendChild(o);
  });
  if(PRESETS.default) $preset.value='default';

  // 저장된 preset 복원
  const saved = loadFilters();
  if (saved.preset && $preset.querySelector(`option[value="${CSS.escape(saved.preset)}"]`)) {
    $preset.value = saved.preset;
  }
}
function fmtDate(ts){
  const d=new Date(ts), z=n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}`;
}

/* ===== 날짜/필터 유틸 ===== */
function parseDateInput(v){
  if(!v) return null;
  const t = Date.parse(v + 'T00:00:00');
  return Number.isFinite(t) ? t : null;
}
function endOfDay(ts){ return ts + 24*60*60*1000 - 1; }

/* ===== 데이터 현재 뷰 ===== */
function currentRows(){
  const all = loadAttempts().sort((a,b)=> b.ts-a.ts);
  if(!$base.options.length) fillBase(all);
  if(!$preset.options.length) fillPreset();

  const baseId = $base.value || (all[0]?.baseId ?? '');
  const kind = $kind.value;

  // 날짜 필터
  const fromTs = parseDateInput($from.value);
  const toTsRaw = parseDateInput($to.value);
  const toTs = toTsRaw!==null ? endOfDay(toTsRaw) : null;

  // 세트별 기본 프리셋 우선 → 없으면 선택값 → (저장값은 fillPreset에서 적용됨)
  const def=loadPresetDefaults(); const basePreset = def[baseId];
  const presetName = ($preset.value || basePreset || null);

  const filtered = all.filter(a=>{
    if(a.baseId!==baseId) return false;
    if(kind && a.kind!==kind) return false;
    if(fromTs!==null && a.ts < fromTs) return false;
    if(toTs!==null && a.ts > toTs) return false;
    return true;
  });

  $count.textContent = `${filtered.length} attempts`;
  return { rows: filtered.map(a=> ensureScaled(a, presetName)), presetName, baseId, fromTs, toTs };
}

/* ===== 표/차트 ===== */
function renderTable(rows){
  $tbody.innerHTML='';
  rows.forEach(a=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`
      <td>${fmtDate(a.ts)}</td>
      <td>${a.title||a.baseId||''}</td>
      <td>${a.kind}</td>
      <td class="right">${a.sections.rw.correct}/${a.sections.rw.total} · <b>${a.sections.rw.scaled}</b></td>
      <td class="right">${a.sections.math.correct}/${a.sections.math.total} · <b>${a.sections.math.scaled}</b></td>
      <td class="right"><b>${a.sat_total}</b></td>
      <td class="right">${a.curvePreset||'—'}</td>`;
    tr.style.cursor='pointer';
    tr.addEventListener('click', ()=> openAttemptDetail(a));
    $tbody.appendChild(tr);
  });
}

/* === 1-C 적용: 모든 시계열 차트에 공통 옵션 + __att 바인딩 === */
function renderCharts(rows){
  const chronological = [...rows].sort((a,b)=> a.ts-b.ts);

  // 포인트 생성 (툴팁에서 원본 시도 접근 가능하도록 __att 포함)
  const pointsTotal = chronological.map(a => ({ x: a.ts, y: a.sat_total, __att: a }));
  const pointsRW    = chronological.map(a => ({ x: a.ts, y: a.sections.rw.scaled, __att: a }));
  const pointsMath  = chronological.map(a => ({ x: a.ts, y: a.sections.math.scaled, __att: a }));

  // Line: Total SAT
  const c1=document.getElementById('satLine'); if(LINE) LINE.destroy();
  LINE = new Chart(c1, {
    type:'line',
    data:{ datasets:[{ label:'Total SAT', data:pointsTotal, tension:.25, pointRadius:3 }]},
    options:{
      ...chartCommonOptions,
      plugins:{
        ...chartCommonOptions.plugins,
        tooltip:{
          ...chartCommonOptions.plugins.tooltip,
          callbacks:{
            ...chartCommonOptions.plugins.tooltip.callbacks,
            label:(item)=> `Total: ${item.formattedValue}`
          }
        }
      },
      scales:{
        ...chartCommonOptions.scales,
        y:{ suggestedMin:400, suggestedMax:1600, grid:{ color:'#eee' } }
      }
    }
  });

  // Stacked Bar: RW/Math Scaled over time
  const c2=document.getElementById('sectionBar'); if(BAR) BAR.destroy();
  BAR = new Chart(c2, {
    type:'bar',
    data:{
      datasets:[
        { label:'RW',   data:pointsRW,   stack:'sat' },
        { label:'Math', data:pointsMath, stack:'sat' }
      ]
    },
    options:{
      ...chartCommonOptions,
      plugins:{
        ...chartCommonOptions.plugins,
        tooltip:{
          ...chartCommonOptions.plugins.tooltip,
          callbacks:{
            ...chartCommonOptions.plugins.tooltip.callbacks,
            label:(item)=> `${item.dataset.label}: ${item.formattedValue}`
          }
        }
      },
      scales:{
        ...chartCommonOptions.scales,
        y:{ suggestedMin:200, suggestedMax:1600, stacked:true, grid:{ color:'#eee' } },
        x:{ ...chartCommonOptions.scales.x, stacked:true }
      }
    }
  });
}

/* ===== 스킬 ===== */
function allSkillNames(rows){
  const s=new Set();
  rows.forEach(a=> Object.keys(a.skills||{}).forEach(k=> s.add(k)));
  return [...s].sort();
}
function fillSkillSelect(rows){
  const skills = allSkillNames(rows);
  $skillSel.innerHTML='';
  skills.forEach(k=>{ const o=document.createElement('option'); o.value=k; o.textContent=k; $skillSel.appendChild(o); });
}
function classForPct(p){ if(p>=95) return 'c-95'; if(p>=85) return 'c-85'; if(p>=70) return 'c-70'; if(p>=50) return 'c-50'; return 'c-0'; }
function renderHeatmap(rows){
  const heatHdr=document.getElementById('heatHdr');
  const heatBody=document.getElementById('heatBody');
  heatHdr.innerHTML=''; heatBody.innerHTML='';

  const skills = allSkillNames(rows);
  // 헤더
  const hdrRow=document.createElement('div'); hdrRow.className='heat-row';
  const left=document.createElement('div'); left.className='skill-name'; left.style.fontWeight='700'; left.textContent='Skill';
  hdrRow.appendChild(left);
  rows.forEach((a,i)=>{
    const d=document.createElement('div'); d.className='cell'; d.style.fontWeight='700';
    d.title=fmtDate(a.ts); d.textContent=String(i+1);
    hdrRow.appendChild(d);
  });
  heatHdr.appendChild(hdrRow);

  // 바디
  skills.forEach(sk=>{
    const row=document.createElement('div'); row.className='heat-row';
    const name=document.createElement('div'); name.className='skill-name'; name.textContent=sk;
    row.appendChild(name);
    rows.forEach(a=>{
      const s=a.skills?.[sk];
      const acc = s && s.total ? Math.round((s.correct/s.total)*100) : null;
      const cell=document.createElement('div'); cell.className='cell ' + (acc===null?'':classForPct(acc));
      cell.textContent = acc===null ? '—' : String(acc);
      cell.title = acc===null ? `${sk}: data none` : `${sk}: ${s.correct}/${s.total} (${acc}%)`;
      row.appendChild(cell);
    });
    heatBody.appendChild(row);
  });
}

/* === 1-C 적용: 스킬 트렌드도 {x,y,__att} + 공통옵션 사용 === */
function renderSkillTrend(rows){
  const key=$skillSel.value;
  const chronological = [...rows].sort((a,b)=> a.ts-b.ts);
  const points = chronological.map(a=>{
    const s=a.skills?.[key];
    const val = (s && s.total)? Math.round((s.correct/s.total)*100) : null;
    return val===null ? { x:a.ts, y:null, __att:a } : { x:a.ts, y:val, __att:a };
  });

  const c=document.getElementById('skillLine'); if(SKILL_LINE) SKILL_LINE.destroy();
  SKILL_LINE = new Chart(c,{
    type:'line',
    data:{ datasets:[{ label:key||'Skill', data:points, spanGaps:true, tension:.2 }]},
    options:{
      ...chartCommonOptions,
      plugins:{
        ...chartCommonOptions.plugins,
        tooltip:{
          ...chartCommonOptions.plugins.tooltip,
          callbacks:{
            ...chartCommonOptions.plugins.tooltip.callbacks,
            label:(item)=> `Acc: ${item.formattedValue}%`
          }
        }
      },
      scales:{
        ...chartCommonOptions.scales,
        y:{ suggestedMin:0, suggestedMax:100, grid:{ color:'#eee' } }
      }
    }
  });
}

/* ===== 비교/상세 ===== */
function fillCompare(rows){
  const opts = rows.map((a,i)=>({ key:String(a.ts), label:`#${i+1} • ${fmtDate(a.ts)} • ${a.kind} • ${a.sat_total}` }));
  [$cmpA,$cmpB].forEach(sel=>{
    sel.innerHTML=''; opts.forEach(o=>{ const op=document.createElement('option'); op.value=o.key; op.textContent=o.label; sel.appendChild(op); });
  });
  if(opts.length>=2){ $cmpA.selectedIndex=0; $cmpB.selectedIndex=1; }
}
function renderCompare(rows){
  $cmpOut.innerHTML = '';

  const keyA = $cmpA.value, keyB = $cmpB.value;
  const A = rows.find(a => String(a.ts) === keyA);
  const B = rows.find(a => String(a.ts) === keyB);

  if (!A || !B) {
    $cmpOut.innerHTML = '<div class="muted">비교하려면 두 시도를 선택하세요.</div>';
    return;
  }

  // 공통 카드 템플릿
  function card(title, aVal, bVal, fmt = (v)=>v, extraClass=''){
    const bothNum = (typeof aVal === 'number') && (typeof bVal === 'number');
    const delta = bothNum ? (bVal - aVal) : null;
    const sign = delta === null ? '' : (delta > 0 ? '+' : '');
    const color = delta === null ? '' : (delta >= 0 ? 'ok' : 'bad');
    return `
      <div class="card ${extraClass}">
        <div class="head"><div class="title">${title}</div></div>
        <div style="display:flex; justify-content:space-between; gap:8px">
          <div><div class="muted">A</div><div><b>${fmt(aVal)}</b></div></div>
          <div><div class="muted">B</div><div><b>${fmt(bVal)}</b></div></div>
          <div><div class="muted">Δ</div><div><span class="badge ${color}">${delta===null?'—': (sign + delta)}</span></div></div>
        </div>
      </div>`;
  }

  // 1행: Total SAT (전체폭)
  const row1 = card('Total SAT', A.sat_total, B.sat_total, v => v, 'cmp-span-all');

  // 2행: Scaled 2장
  const row2 = [
    card('RW (Scaled)',   A.sections.rw.scaled,   B.sections.rw.scaled),
    card('Math (Scaled)', A.sections.math.scaled, B.sections.math.scaled)
  ].join('');

  // 3행: Raw 2장
  const row3 = [
    card('RW Raw',   A.sections.rw.correct,   B.sections.rw.correct),
    card('Math Raw', B.sections.math.correct, B.sections.math.correct)
  ].join('');

  $cmpOut.innerHTML = row1 + row2 + row3;
}

/* ===== 집계 렌더러 ===== */
function renderAggregations(rows){
  const mode = $agg.value;
  if(!mode){
    $aggCard.style.display='none';
    $aggOut.innerHTML='';
    return;
  }

  const keyFn = (a)=> mode==='byPreset' ? (a.curvePreset || '—') : a.baseId;

  const groups = new Map();
  rows.forEach(a=>{
    const k = keyFn(a);
    if(!groups.has(k)) groups.set(k, []);
    groups.get(k).push(a);
  });

  const stats = [...groups.entries()].map(([k,arr])=>{
    const n = arr.length;
    const avg = (list, pick)=> Math.round(list.reduce((s,x)=> s + pick(x), 0) / n);
    const rwScaledAvg   = avg(arr, x=> x.sections.rw.scaled);
    const mathScaledAvg = avg(arr, x=> x.sections.math.scaled);
    const satAvg        = avg(arr, x=> x.sat_total);
    const rwRawAvg   = Math.round(arr.reduce((s,x)=> s + (x.sections.rw.correct / (x.sections.rw.total||1)), 0) / n * 100);
    const mathRawAvg = Math.round(arr.reduce((s,x)=> s + (x.sections.math.correct / (x.sections.math.total||1)), 0) / n * 100);
    const latestTs = Math.max(...arr.map(x=> x.ts));
    return { key:k, n, satAvg, rwScaledAvg, mathScaledAvg, rwRawAvg, mathRawAvg, latestTs };
  });

  stats.sort((a,b)=>{
    if(b.n!==a.n) return b.n - a.n;
    if(b.satAvg!==a.satAvg) return b.satAvg - a.satAvg;
    return String(a.key).localeCompare(String(b.key));
  });

  const thMode = (mode==='byPreset') ? '프리셋' : '세트';
  const rowsHTML = stats.map(s=>`
    <tr>
      <td>${s.key}</td>
      <td class="right">${s.n}</td>
      <td class="right"><b>${s.satAvg}</b></td>
      <td class="right">${s.rwScaledAvg}</td>
      <td class="right">${s.mathScaledAvg}</td>
      <td class="right">${s.rwRawAvg}%</td>
      <td class="right">${s.mathRawAvg}%</td>
      <td>${new Date(s.latestTs).toLocaleDateString()}</td>
    </tr>
  `).join('');

  $aggOut.innerHTML = `
    <div class="muted" style="font-size:13px; margin-bottom:6px">
      평균은 위의 모든 필터(세트/보기/날짜/프리셋 재계산) 적용 후 남은 시도만 포함됩니다.
    </div>
    <table style="width:100%; border-collapse:collapse; font-size:14px">
      <thead>
        <tr>
          <th style="text-align:left">${thMode}</th>
          <th class="right">시도수</th>
          <th class="right">총점 평균</th>
          <th class="right">RW Scaled 평균</th>
          <th class="right">Math Scaled 평균</th>
          <th class="right">RW 정답률</th>
          <th class="right">Math 정답률</th>
          <th style="text-align:left">최근 일자</th>
        </tr>
      </thead>
      <tbody>${rowsHTML}</tbody>
    </table>
  `;

  $aggCaption.textContent = (mode==='byPreset') ? '프리셋별 집계' : '세트별 집계';
  $aggCard.style.display = 'block';
}

/* ===== 시도 상세 모달 ===== */
const detailBack=document.getElementById('detailBack');
const detailBody=document.getElementById('detailBody');
document.getElementById('detailClose').onclick=()=>{ detailBack.style.display='none'; detailBody.innerHTML=''; };

function openAttemptDetail(a){
  const skills = Object.entries(a.skills||{}).map(([k,v])=>{
    const acc = v.total? Math.round((v.correct/v.total)*100) : 0;
    return { k, correct:v.correct, total:v.total, acc };
  }).sort((x,y)=> y.acc - x.acc);
  const top = skills.slice(0,5), bottom = skills.slice(-5);

  detailBody.innerHTML = `
    <div class="head"><div class="title">시도 상세 — ${fmtDate(a.ts)}</div></div>
    <div class="grid" style="grid-template-columns:1fr 1fr; gap:12px">
      <div class="card">
        <div class="head"><div class="title">요약</div></div>
        <div>세트: <b>${a.title||a.baseId||''}</b></div>
        <div>종류: <b>${a.kind}</b></div>
        <div style="margin-top:6px">RW: <b>${a.sections.rw.correct}/${a.sections.rw.total}</b> → <b>${a.sections.rw.scaled}</b></div>
        <div>Math: <b>${a.sections.math.correct}/${a.sections.math.total}</b> → <b>${a.sections.math.scaled}</b></div>
        <div style="margin-top:6px">총점: <b>${a.sat_total}</b></div>
        <div class="muted" style="margin-top:6px">프리셋(실제 기록): ${a.curvePreset||'—'}</div>
      </div>
      <div class="card">
        <div class="head"><div class="title">스킬 Top/Bottom</div></div>
        <div class="grid" style="grid-template-columns:1fr 1fr; gap:10px">
          <div>
            <div class="muted" style="margin-bottom:6px">Top 5</div>
            ${top.map(s=>`<div>${s.k} — <b>${s.acc}%</b> <span class="muted">(${s.correct}/${s.total})</span></div>`).join('') || '<div class="muted">데이터 없음</div>'}
          </div>
          <div>
            <div class="muted" style="margin-bottom:6px">Bottom 5</div>
            ${bottom.map(s=>`<div>${s.k} — <b>${s.acc}%</b> <span class="muted">(${s.correct}/${s.total})</span></div>`).join('') || '<div class="muted">데이터 없음</div>'}
          </div>
        </div>
      </div>
    </div>`;
  detailBack.style.display='block';
}

/* ===== 커브 에디터 ===== */
const curveBack=document.getElementById('curveBack');
const curveClose=document.getElementById('curveClose');
const editPreset=document.getElementById('editPreset');
const newPresetName=document.getElementById('newPresetName');
const rwPoints=document.getElementById('rwPoints');
const mathPoints=document.getElementById('mathPoints');

curveClose.onclick=()=>{ curveBack.style.display='none'; };

function openCurveEditor(){
  const PRESETS = window.CURVE_PRESETS||{};
  editPreset.innerHTML='';
  Object.keys(PRESETS).forEach(name=>{
    const o=document.createElement('option'); o.value=name; o.textContent=name; editPreset.appendChild(o);
  });
  editPreset.value = $preset.value || 'default';
  loadPresetToForm(editPreset.value);
  curveBack.style.display='block';
}
function loadPresetToForm(name){
  const PRESETS = window.CURVE_PRESETS||{};
  const p = PRESETS[name] || PRESETS.default;
  rwPoints.value = JSON.stringify(p.rw||[], null, 2);
  mathPoints.value = JSON.stringify(p.math||[], null, 2);
}
document.getElementById('openCurveEditor').onclick=openCurveEditor;
editPreset.addEventListener('change', ()=> loadPresetToForm(editPreset.value));

document.getElementById('dupBtn').onclick=()=>{
  const name = (newPresetName.value||'').trim();
  if(!name){ alert('새 프리셋 이름을 입력하세요.'); return; }
  const PRESETS=window.CURVE_PRESETS||{};
  try{
    PRESETS[name] = {
      rw: JSON.parse(rwPoints.value||'[]'),
      math: JSON.parse(mathPoints.value||'[]')
    };
    alert(`프리셋 "${name}" 추가됨`);
    fillPreset(); $preset.value=name;
    openCurveEditor();
  }catch(e){ alert('JSON 파싱 실패: '+e.message); }
};
document.getElementById('delBtn').onclick=()=>{
  const name = editPreset.value;
  if(!name || name==='default'){ alert('default는 삭제할 수 없습니다.'); return; }
  if(confirm(`프리셋 "${name}"을(를) 삭제할까요?`)){
    delete window.CURVE_PRESETS[name];
    fillPreset(); openCurveEditor();
  }
};
document.getElementById('saveCurveBtn').onclick=()=>{
  const name = editPreset.value;
  try{
    const rw=JSON.parse(rwPoints.value||'[]');
    const mh=JSON.parse(mathPoints.value||'[]');
    window.CURVE_PRESETS[name] = { rw, math: mh };
    alert(`"${name}" 저장됨`);
    fillPreset();
  }catch(e){ alert('JSON 파싱 실패: '+e.message); }
};

/* ===== Export/Import/Print ===== */
/* ▼▼▼ 3-1 패치: 버전 래핑 Export + 구/신 포맷 Import 지원 ▼▼▼ */
document.getElementById('exportBtn').onclick = ()=>{
  const all = loadAttempts().sort((a,b)=> b.ts-a.ts);
  const payload = {
    format: 'dsat_attempts',
    version: '1.0.0',
    app: 'dsat-dashboard',
    createdAt: new Date().toISOString(),
    attempts: all
  };
  const blob = new Blob([JSON.stringify(payload,null,2)],{type:'application/json;charset=utf-8;'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download=`dsat_attempts_${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
};

document.getElementById('importBtn').onclick=()=>{
  const inp=document.createElement('input'); inp.type='file'; inp.accept='application/json';
  inp.onchange=async (e)=>{
    const f=e.target.files?.[0]; if(!f) return;
    try{
      const text=await f.text(); 
      const parsed=JSON.parse(text);

      let attempts = null;
      // 신포맷: { format, version, attempts }
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        if (parsed.format !== 'dsat_attempts') {
          throw new Error('알 수 없는 파일 형식입니다 (format 필드 불일치).');
        }
        if (!Array.isArray(parsed.attempts)) {
          throw new Error('파일에 attempts 배열이 없습니다.');
        }
        const ver = String(parsed.version||'1.0.0');
        if (!/^1\./.test(ver)) {
          console.warn('미검증 버전 감지:', ver);
        }
        attempts = parsed.attempts;
      }
      // 구포맷: 배열 단독
      else if (Array.isArray(parsed)) {
        attempts = parsed;
      }
      else{
        throw new Error('지원하지 않는 JSON 구조입니다.');
      }

      // 가벼운 스키마 체크
      const ok = attempts.every(a => typeof a.ts === 'number' && a.baseId && a.kind && a.sections);
      if (!ok) throw new Error('시도 레코드 스키마가 올바르지 않습니다.');

      saveAttempts(attempts);
      renderAll();
      alert('가져오기 완료');
    }catch(err){ alert('가져오기 실패: '+(err?.message||err)); }
  };
  inp.click();
};
/* ▲▲▲ 3-1 패치 끝 ▲▲▲ */

document.getElementById('printBtn').onclick=()=> window.print();

/* ===== 딥링크: 연습페이지에서 리뷰 자동 시작 ===== */
function goPractice(url){ location.href = url; }
document.getElementById('startSkillReviewBtn').addEventListener('click', ()=>{
  const key = document.getElementById('skillSelect').value;
  if(!key){ alert('스킬을 먼저 선택하세요.'); return; }
  goPractice(`./index.html?review=skill&value=${encodeURIComponent(key)}`);
});
document.getElementById('startWrongReviewBtn').addEventListener('click', ()=>{
  goPractice('./index.html?review=wrong');
});
document.getElementById('startFlaggedReviewBtn').addEventListener('click', ()=>{
  goPractice('./index.html?review=flagged');
});

/* ===== 렌더 & 이벤트 ===== */
function renderAll(){
  const { rows } = currentRows();
  renderTable(rows);
  renderCharts(rows);
  renderHeatmap(rows);
  fillCompare(rows);
  renderCompare(rows);
  fillSkillSelect(rows);
  renderSkillTrend(rows);
  renderAggregations(rows); // ★ 집계 추가
}

/* — 이벤트에 '저장' 연결 (1-B) — */
function onFilterChanged() {
  saveFilters(snapshotFiltersFromUI());
  renderAll();
}
$base.addEventListener('change', onFilterChanged);
$kind.addEventListener('change', onFilterChanged);
$preset.addEventListener('change', onFilterChanged);
document.getElementById('fromDate').addEventListener('change', onFilterChanged);
document.getElementById('toDate').addEventListener('change', onFilterChanged);

document.getElementById('cmpBtn').addEventListener('click', ()=> renderAll());
document.getElementById('openDetailA').addEventListener('click', ()=>{
  const { rows } = currentRows(); const A=rows.find(r=> String(r.ts)===$cmpA.value); if(A) openAttemptDetail(A);
});
document.getElementById('openDetailB').addEventListener('click', ()=>{
  const { rows } = currentRows(); const B=rows.find(r=> String(r.ts)===$cmpB.value); if(B) openAttemptDetail(B);
});
$skillSel.addEventListener('change', ()=>{ const { rows } = currentRows(); renderSkillTrend(rows); });

// 집계 모드 변경
document.getElementById('aggMode').addEventListener('change', ()=> renderAll());

// 전체 로그 삭제(안전 확인)
document.getElementById('clearBtn').addEventListener('click', ()=>{
  if(confirm('로컬에 저장된 모든 시도 로그를 삭제할까요?')){
    saveAttempts([]);
    renderAll();
  }
});

/* 추천: 변동 큰 스킬 자동 선택 */
document.getElementById('skillAllBtn').onclick=()=>{
  const { rows } = currentRows();
  const last = rows.slice(0,5).reverse(); // 과거→현재
  const accs = {};
  last.forEach(a=>{
    Object.entries(a.skills||{}).forEach(([k,v])=>{
      if(!accs[k]) accs[k]=[];
      accs[k].push(v.total? (v.correct/v.total*100) : null);
    });
  });
  const varList = Object.entries(accs).map(([k,arr])=>{
    const vals = arr.filter(x=> x!==null);
    if(vals.length<2) return [k,-1];
    const avg = vals.reduce((s,x)=>s+x,0)/vals.length;
    const v = vals.reduce((s,x)=>s+(x-avg)**2,0)/vals.length;
    return [k,v];
  }).filter(([,v])=> v>=0).sort((a,b)=> b[1]-a[1]);
  if(!varList.length){ alert('변동을 계산할 데이터가 부족합니다.'); return; }
  $skillSel.value = varList[0][0];
  renderSkillTrend(rows);
};

/* ===== Bootstrap: 옵션 채우고 필터 복원 후 렌더 ===== */
(function bootstrapDashboard(){
  // 옵션 박스가 비어 있을 수 있어 먼저 채움
  const all = loadAttempts().sort((a,b)=> b.ts-a.ts);
  if(!$base.options.length) fillBase(all);
  if(!$preset.options.length) fillPreset();

  // 저장된 필터를 UI에 반영
  applySavedFiltersToUI();

  // 이제부터 변경 저장 허용
  FILTERS_READY = true;

  // 최초 렌더
  renderAll();
})();

/* 모달 외부 클릭 닫기 */
[document.getElementById('detailBack'), document.getElementById('curveBack')].forEach(back=>{
  back.addEventListener('click', (e)=>{ if(e.target===back) back.style.display='none'; });
});
