// ==================== 서버 권한 체크 & 구매/시작 ====================
async function onClickStartFromCatalog(baseId){
  // 1) 최신 권한 상태 조회
  await MYSETS?.refresh(true);

  if (!MYSETS || !MYSETS.has(baseId)) {
    // 2) 구매 안내
    if (!confirm('You do not own this set. Purchase now?')) return;

    try {
      // 2-1) DSAT_SYNC config 우선 사용 (없으면 SYNC_API_BASE)
      const base = (window.DSAT_SYNC?.getConfig?.().baseUrl || window.SYNC_API_BASE || '').replace(/\/$/,'');
      const res = await fetch(base + '/api/purchaseSet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // ※ 서버 setId와 정확히 일치해야 함 (예: 'SAT-Blue-1')
        body: JSON.stringify({ setId: baseId })
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);

      // 2-2) 구매 직후 권한 재확인
      await MYSETS.refresh(true);
      if (MYSETS.has(baseId)) {
        alert('Purchased. Starting now.');
        location.href = `./index.html?base=${encodeURIComponent(baseId)}${onlyQuery()}`;
        return;
      }

      // 2-3) (데모 환경 UX) 서버 반영 지연 시 로컬 소유로 폴백
      if (typeof getOwnedDemo === 'function' && typeof setOwnedDemo === 'function') {
        const owned = getOwnedDemo();
        if (!owned.includes(baseId)) {
          owned.push(baseId);
          setOwnedDemo(owned);
        }
        alert('Purchased (local fallback). Starting now.');
        location.href = `./index.html?base=${encodeURIComponent(baseId)}${onlyQuery()}`;
        return;
      }

      alert('Purchased, but not visible yet. Please refresh My Sets.');
    } catch (e) {
      alert('Purchase failed: ' + (e.message || e));
    }
    return;
  }

  // 이미 소유 중이면 바로 시작
  location.href = `./index.html?base=${encodeURIComponent(baseId)}${onlyQuery()}`;
}

// ==================== [MYSETS-lite] (랜딩 전용) ====================
(function(){
  if (window.MYSETS) return;
  const KEY='dsat_mysets_v1';
  let cache=null; const CACHE_MS=5*60*1000;

  function load(){ try{ return JSON.parse(localStorage.getItem(KEY)||'null'); }catch{ return null; } }
  function save(v){ try{ localStorage.setItem(KEY, JSON.stringify(v)); }catch{} }

  async function refresh(force=false){
    const now=Date.now();
    if(!force && cache && (now-(cache.ts||0) < CACHE_MS)) return cache.sets||[];

    const base = (window.DSAT_SYNC?.getConfig?.().baseUrl || window.SYNC_API_BASE || '').replace(/\/$/,'');
    let sets=[];
    try{
      const r = await fetch(base+'/api/mySets');
      const j = await r.json();
      sets = Array.isArray(j?.sets) ? j.sets : [];
    }catch(_){}
    cache = { ts: Date.now(), sets };
    save(cache);
    return sets;
  }
  function list(){ const loc=load(); return cache?.sets || loc?.sets || []; }
  function has(id){ return !!list().find(s=> s.id===id); }

  window.MYSETS = { refresh, list, has };
})();

// ==================== 카탈로그(수정 가능) ====================
const CATALOG = [
  {
    id: 'default',
    title: 'Sample DSAT Set',
    subtitle: 'RW + Math · 4 Modules',
    url: './questions.json',
    thumb: './img/thumb_default.jpg',
    tags: ['sample','rw','math'],
    price: '₩0 (Sample)'
  },
  {
    id: 'step3',
    title: 'Practice Set (Step3 Demo)',
    subtitle: 'Auto-save / Tolerance / Additional Questions Demo',
    url: './questions_step3.json',
    thumb: './img/thumb_step3.jpg',
    tags: ['practice','math','rw','demo'],
    price: '₩4,900'
  }
];

// ==================== 모드 상태 (Full / RW / Math) ====================
const ONLY_KEY = 'dsat_landing_only'; // '', 'rw', 'math'
function getOnly(){ return localStorage.getItem(ONLY_KEY) || ''; }
function setOnly(v){
  localStorage.setItem(ONLY_KEY, v || '');
  syncModeUI();
  updateModeBadge();
}
function onlyQuery(){
  const v = getOnly();
  return v ? `&only=${encodeURIComponent(v)}` : '';
}
function syncModeUI(){
  const only = getOnly();
  document.querySelectorAll('#modeSeg .seg-btn').forEach(btn=>{
    const active = ((btn.dataset.only || '') === only);
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });
}
function updateModeBadge(){
  const only = getOnly();
  const badge = document.getElementById('modeBadge');
  if (badge) badge.textContent = 'Mode: ' + (only==='' ? 'Full' : (only==='rw' ? 'RW only' : 'Math only'));
}

// ==================== 역할/플래그 (URL→localStorage) ====================
const ROLE_KEY = 'dsat_role';  // 'user' | 'teacher' | 'admin'
const DEV_KEY  = 'dsat_dev';   // '1' | ''
function initFlagsFromURL(){
  const usp = new URLSearchParams(location.search);
  if (usp.get('dev') === '1') localStorage.setItem(DEV_KEY, '1');
  if (usp.get('admin') === '1') localStorage.setItem(ROLE_KEY, 'admin');
  if (usp.get('role')) localStorage.setItem(ROLE_KEY, usp.get('role')); // admin/teacher/user
}
function isDev(){ return localStorage.getItem(DEV_KEY) === '1'; }
function getRole(){ return localStorage.getItem(ROLE_KEY) || 'user'; }

// ==================== 공통 유틸 ====================
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
function h(tag, attrs={}, html=''){
  const el = document.createElement(tag);
  Object.entries(attrs).forEach(([k,v])=>{
    if (k==='class') el.className=v;
    else if (k==='dataset'){ Object.entries(v).forEach(([kk,vv])=> el.dataset[kk]=vv); }
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  });
  if (html!==undefined && html!==null) el.innerHTML = html;
  return el;
}
function toast(msg){ alert(msg); }

// ==================== 최근 실행 ====================
function addRecent(rec){
  const key='dsat_recents';
  const arr = JSON.parse(localStorage.getItem(key) || '[]');
  const filtered = arr.filter(x=> !(x.type===rec.type && x.value===rec.value && (x.mode||'')===(rec.mode||'')));
  filtered.unshift({...rec, ts: Date.now()});
  localStorage.setItem(key, JSON.stringify(filtered.slice(0,8)));
}
function renderRecentsTab(){
  const box = $('#recentsGrid');
  const empty = $('#recentsEmpty');
  if (!box || !empty) return;
  box.innerHTML='';
  const arr = JSON.parse(localStorage.getItem('dsat_recents') || '[]');
  if(!arr.length){ empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');

  arr.forEach(r=>{
    const card = h('div',{class:'card item'});
    const body = h('div',{class:'body'});
    const modeTxt = r.mode ? (r.mode==='rw' ? ' [RW]' : ' [Math]') : ' [Full]';
    body.appendChild(h('div',{class:'title'}, (r.title || r.value) + modeTxt));
    body.appendChild(h('div',{class:'sub muted'}, new Date(r.ts).toLocaleString()));
    card.appendChild(body);

    const foot = h('div',{class:'foot'});
    const go = h('button',{class:'btn primary'}, 'Continue');
    go.onclick = ()=> {
      const savedOnly = r.mode || '';
      setOnly(savedOnly);
      if(r.type==='url'){
        location.href = `./index.html?set=${encodeURIComponent(r.value)}${onlyQuery()}`;
      }else{
        toast('Local files cannot auto-restart due to security. Please reselect the file in developer mode.');
      }
    };
    foot.appendChild(go);
    card.appendChild(foot);
    box.appendChild(card);
  });
}

// ==================== 시작(세트 실행) ====================
function startFromURL(url, title){
  try{ addRecent({type:'url', value:url, title, mode:getOnly()}); }catch(_e){ }
  location.href = `./index.html?set=${encodeURIComponent(url)}${onlyQuery()}`;
}
async function startFromFile(file, title='Local JSON'){
  const text = await file.text();
  localStorage.setItem('dsat_launch_blob', text);
  try{ addRecent({type:'file', value:title || file.name, title:(title||file.name), mode:getOnly()}); }catch(_e){ }
  location.href = `./index.html?source=blob${onlyQuery()}`;
}

// ==================== 소유/구매 (데모 로컬 저장) ====================
const OWNED_KEY = 'dsat_owned_demo';
function getOwnedDemo(){
  try{ return JSON.parse(localStorage.getItem(OWNED_KEY)||'[]'); }catch(_e){ return []; }
}
function setOwnedDemo(list){
  localStorage.setItem(OWNED_KEY, JSON.stringify(list||[]));
  updateOwnedCount();
}
let OWNED_SERVER = new Set();
async function refreshOwnedServer(){
  try{
    const sets = await MYSETS.refresh(true);
    OWNED_SERVER = new Set(sets.map(s=> s.id));
  }catch(_){ OWNED_SERVER = new Set(); }
}
function isOwned(setId){
  return OWNED_SERVER.has(setId) || getOwnedDemo().includes(setId);
}
async function buySet(setId){
  // 데모 결제(로컬): 실제 서비스에선 서버 결제 사용
  const owned = getOwnedDemo();
  if(!owned.includes(setId)) owned.push(setId);
  setOwnedDemo(owned);
  toast('Purchase (demo) complete! You can start from "My Sets" tab.');
  renderAll();
}

// ==================== 카드 렌더 ====================
function makeCard(item){
  const outer = h('div',{class:'card item', dataset:{id:item.id}});

  const th = h('div',{class:'thumb'});
  const img = new Image();
  img.alt = item.title; img.src = item.thumb || '';
  img.onload = ()=> th.appendChild(img);
  img.onerror = ()=> th.innerHTML = '<div class="fallback">📝</div>';
  outer.appendChild(th);

  const body = h('div',{class:'body'});
  body.appendChild(h('div',{class:'title'}, item.title));
  body.appendChild(h('div',{class:'sub'}, item.subtitle || ''));
  const tags = h('div',{class:'tags'});
  (item.tags||[]).forEach(t=> tags.appendChild(h('span',{class:'tag'}, t)));
  body.appendChild(tags);
  outer.appendChild(body);

  const foot = h('div',{class:'foot'});
  if (isOwned(item.id)) {
    const run = h('button',{class:'btn primary'}, 'Start/Continue');
    // 카탈로그 항목은 url 기반 세트(데모). 서버 baseId 세트는 Owned 탭에서 onClickStartFromCatalog 사용.
    run.onclick = ()=> {
      if (item.url) startFromURL(item.url, item.title);
      else onClickStartFromCatalog(item.id); // url이 없고 baseId만 있는 카드는 서버 세트로 처리
    };
    foot.appendChild(run);
  } else {
    foot.appendChild(h('div',{class:'price'}, item.price ? `${item.price}` : 'Paid Set'));
    const buy = h('button',{class:'btn primary'}, 'Buy');
    buy.onclick = ()=> buySet(item.id);
    foot.appendChild(buy);
  }
  outer.appendChild(foot);

  return outer;
}

// ==================== 탭 렌더 ====================
function renderCatalog(){
  const grid = $('#catalogGrid');
  const empty = $('#catalogEmpty');
  if (!grid || !empty) return;
  grid.innerHTML = '';
  const list = filterAndSort(CATALOG);
  if (!list.length){ empty.classList.remove('hidden'); }
  else {
    empty.classList.add('hidden');
    list.forEach(it=> grid.appendChild(makeCard(it)));
  }
  syncGridMode();
}

function renderOwned(){
  const grid = $('#ownedGrid');
  const empty = $('#ownedEmpty');
  if (!grid || !empty) return;
  grid.innerHTML = '';

  // 1) 카탈로그에 있는 것 중 소유한 카드
  const ownedFromCatalog = CATALOG.filter(it=> isOwned(it.id));
  ownedFromCatalog.forEach(it=> grid.appendChild(makeCard(it)));

  // 2) 서버에 있으나 카탈로그에 없는 세트도 버튼으로 노출 (baseId로 시작)
  const serverOnly = (window.MYSETS?.list?.() || []).filter(s => !CATALOG.some(c => c.id === s.id));
  serverOnly.forEach(s=>{
    const card = h('div',{class:'card item'});
    card.appendChild(h('div',{class:'body'},
      `<div class="title">${s.title || s.id}</div><div class="sub muted">${s.id}</div>`));
    const foot = h('div',{class:'foot'});
    const run = h('button',{class:'btn primary'}, 'Start');
    run.onclick = ()=> onClickStartFromCatalog(s.id); // baseId 기준 시작
    foot.appendChild(run);
    card.appendChild(foot);
    grid.appendChild(card);
  });

  // 비었는지 표시
  if (!grid.childElementCount) empty.classList.remove('hidden');
  else empty.classList.add('hidden');

  syncGridMode();
}

function renderAll(){
  renderCatalog();
  renderOwned();
  renderRecentsTab();
  updateOwnedCount();
}

// ==================== 검색/정렬 ====================
function filterAndSort(items){
  const q = ($('#q')?.value || '').trim().toLowerCase();
  const tag = $('#tag')?.value || '';
  const sort = $('#sort')?.value || 'recommended';

  let list = items.slice();

  if (q){
    const terms = q.split(/\s+/).filter(Boolean);
    list = list.filter(it=>{
      const hay = [it.title, it.subtitle, ...(it.tags||[])].join(' ').toLowerCase();
      return terms.every(t => hay.includes(t));
    });
  }
  if (tag){
    list = list.filter(it => (it.tags||[]).map(s=>s.toLowerCase()).includes(tag.toLowerCase()));
  }

  if (sort==='title'){
    list.sort((a,b)=> a.title.localeCompare(b.title,'ko'));
  } else if (sort==='new'){
    list.sort((a,b)=> (b.createdAt||0)-(a.createdAt||0));
  } else if (sort==='popular'){
    list.sort((a,b)=> a.id.localeCompare(b.id));
  } // recommended = 원래 순서
  return list;
}

$('#q')?.addEventListener('input', ()=> renderCatalog());
$('#clearQ')?.addEventListener('click', ()=>{ const q=$('#q'); if(q){ q.value=''; renderCatalog(); }});
$('#tag')?.addEventListener('change', ()=> renderCatalog());
$('#sort')?.addEventListener('change', ()=> renderCatalog());

// ==================== 보기(그리드/리스트) ====================
function syncGridMode(){
  const isList = $('#gridBtn')?.getAttribute('aria-pressed')==='false';
  ['#catalogGrid','#ownedGrid','#recentsGrid'].forEach(sel=>{
    const node = $(sel);
    if(!node) return;
    node.classList.toggle('list', !!isList);
  });
}
$('#gridBtn')?.addEventListener('click', ()=>{
  $('#gridBtn')?.setAttribute('aria-pressed','true');
  $('#listBtn')?.setAttribute('aria-pressed','false');
  syncGridMode();
});
$('#listBtn')?.addEventListener('click', ()=>{
  $('#gridBtn')?.setAttribute('aria-pressed','false');
  $('#listBtn')?.setAttribute('aria-pressed','true');
  syncGridMode();
});

// ==================== 탭 전환 ====================
$$('.tabs .tab').forEach(tab=>{
  tab.addEventListener('click', ()=>{
    const target = tab.dataset.tab;
    $$('.tabs .tab').forEach(t=>{
      const active = (t===tab);
      t.classList.toggle('active', active);
      t.setAttribute('aria-selected', active?'true':'false');
    });
    $$('.tabview').forEach(v=> v.classList.remove('active'));
    const view = document.getElementById(`view-${target}`);
    if (view) view.classList.add('active');
  });
});

// ==================== 모드 UI 이벤트 ====================
$$('#modeSeg .seg-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    setOnly(btn.dataset.only || '');
  });
});

// ==================== Owned 배지 (서버+로컬 합집합) ====================
function updateOwnedCount(){
  const local = new Set(getOwnedDemo());
  OWNED_SERVER.forEach(id => local.add(id));
  const n = local.size;
  const badge = $('#ownedCount');
  if (badge) badge.textContent = `Owned ${n}`;
}

// ==================== 관리자 탭/개발자 로더 표시 ====================
function updateRoleBadges(){
  const rb = $('#roleBadge');
  const role = getRole();
  const dev  = isDev();
  const isAdmin = (role==='admin' || role==='teacher');

  $$('.tab.admin').forEach(x=> x.classList.toggle('hidden', !isAdmin));

  if (rb){
    if (isAdmin || dev){
      rb.classList.remove('hidden');
      rb.textContent = `ROLE: ${role.toUpperCase()}${dev?' + DEV':''}`;
    } else {
      rb.classList.add('hidden');
    }
  }

  const devSec = $('#devLoader');
  if (devSec) devSec.classList.toggle('hidden', !dev);
}

// (옵션) 관리자 UI를 숨기려면 false 유지
const isAdmin = false;
if (!isAdmin) {
  const adminTabs = document.querySelectorAll('.admin');
  adminTabs.forEach(tab => tab.classList.add('hidden'));
}

// ==================== 개발자 로더 ====================
function initDevLoader(){
  const dev = isDev();
  const devSec = $('#devLoader');
  if (!devSec || !dev) return;

  $('#resetBtn').onclick = ()=>{ $('#jsonUrl').value=''; $('#jsonFile').value=''; };
  $('#startBtn').onclick = async ()=>{
    const url = $('#jsonUrl').value.trim();
    const file = $('#jsonFile').files[0];
    if(url){ startFromURL(url, 'Custom URL'); return; }
    if(file){
      try{ await startFromFile(file, file.name); }
      catch(e){ toast('파일 읽기 실패: ' + e.message); }
      return;
    }
    toast('JSON URL을 입력하거나 로컬 JSON 파일을 선택하세요.');
  };
}

// ==================== 초기화 ====================
function init(){
  initFlagsFromURL();          // URL → localStorage
  updateRoleBadges();          // 관리자/개발자 표시
  syncModeUI();                // 모드 버튼 상태
  updateModeBadge();           // 헤더 모드 배지
  refreshOwnedServer().then(()=> renderAll()); // 서버 권한 반영 후 렌더
  initDevLoader();
}
document.addEventListener('DOMContentLoaded', init);
