
const params = new URLSearchParams(location.search);
const listEl = document.getElementById('list');
const syncTextEl = document.getElementById('syncText');
const headerEl = document.getElementById('header');
const showTitle = params.get('title') !== '0';
const transparent = params.get('transparent') === '1';
let syncing = false;
let lastSig = '';
let currentLimit = 10;
if(!showTitle && headerEl) headerEl.style.display='none';
if(transparent) document.body.style.background='transparent';
if(syncTextEl) syncTextEl.style.display='none';
sync(true);
setInterval(updateQueue,1500);
async function sync(force){
  if(syncing) return;
  syncing = true;
  try{
    const [q, st] = await Promise.all([api('queue',null,{timeoutMs:10000,retries:1}), api('settings',null,{timeoutMs:10000,retries:1})]);
    const queue = q.data || [];
    currentLimit = Number(st?.data?.queue_limit || 10);
    const sig = JSON.stringify([currentLimit, queue.map(x=>[x.id,x.title,x.by,x.artist,x.category,x.practice,x.status])]);
    if(force || sig !== lastSig){ lastSig = sig; render(queue); }
  }catch(e){
    listEl.innerHTML = `<div class="obs-item"><div class="obs-title">同步失敗</div><div class="obs-sub">${esc(e?.message || String(e))}</div></div>`;
  }finally{ syncing = false; }
}
function render(queue){
  const shown = queue.slice(0, currentLimit);
  if(!shown.length){
    listEl.innerHTML = `<div class="obs-item"><div class="obs-title">（空）</div><div class="obs-sub">等待聊天室點歌中…</div></div>`;
    return;
  }
  listEl.innerHTML = shown.map((x,i)=>{
    const singer = esc(x.artist || (x.category==='其他' ? (x.subtag||'') : ''));
    const by = esc(displayUserName(x.by));
    const rowClass = x.status==='playing' ? 'obs-item obs-playing' : x.status==='done' ? 'obs-item obs-done' : 'obs-item';
    const state = x.status==='playing' ? '<span class="obs-state obs-state-playing">正在播放</span>' : x.status==='done' ? '<span class="obs-state obs-state-done">已唱</span>' : '';
    const sub = singer ? `${by} · ${singer}` : by;
    return `<div class="${rowClass}"><div class="obs-title">${state}<span class="obs-rank">${i+1}</span>${esc(x.title||'')}${x.practice?' ⭐':''}<span class="obs-pill">${esc(x.category||'')}</span></div><div class="obs-sub">${sub}</div></div>`;
  }).join('');
}
