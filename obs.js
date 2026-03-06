const params = new URLSearchParams(location.search);
const listEl = document.getElementById("list");
const syncTextEl = document.getElementById("syncText");
const headerEl = document.getElementById("header");

const showTitle = params.get("title") !== "0";
const transparent = params.get("transparent") === "1";
const presetLimit = parseInt(params.get("limit") || "10", 10);
const limit = Number.isFinite(presetLimit) ? Math.max(1, Math.min(30, presetLimit)) : 10;
let syncing = false;
let lastSig = "";

if(!showTitle && headerEl) headerEl.style.display = "none";
if(transparent) document.body.style.background = "transparent";

sync(true);
setInterval(()=>sync(false), 1500);

async function sync(force){
  if(syncing) return;
  syncing = true;
  try{
    const q = await api("queue", null, {timeoutMs:10000,retries:1});
    const queue = q.data || [];
    const sig = JSON.stringify(queue.map(x=>[x.id,x.title,x.by,x.artist,x.category,x.practice]));
    if(force || sig !== lastSig){
      lastSig = sig;
      render(queue);
    }
    syncTextEl.textContent = "已同步：" + new Date().toLocaleTimeString();
  }catch(e){
    listEl.innerHTML = `<div class="obs-item"><div class="obs-title">同步失敗</div><div class="obs-sub">${esc(e?.message || String(e))}</div></div>`;
    syncTextEl.textContent = "同步失敗";
  }finally{
    syncing = false;
  }
}

function render(queue){
  const shown = queue.slice(0, limit);
  if(!shown.length){
    listEl.innerHTML = `<div class="obs-item"><div class="obs-title">（空）</div><div class="obs-sub">等待聊天室點歌中…</div></div>`;
    return;
  }

  listEl.innerHTML = shown.map((x,i)=>{
    const singer = esc(x.artist || (x.category==="其他" ? (x.subtag||"") : ""));
    const by = x.by ? `🎯 ${esc(x.by)}` : "聊天室點歌";
    const sub = singer ? `${by} · ${singer}` : by;
    return `
      <div class="obs-item">
        <div class="obs-title"><span class="obs-rank">${i+1}</span>${esc(x.title||"")}${x.practice?" ⭐":""}<span class="obs-pill">${esc(x.category||"")}</span></div>
        <div class="obs-sub">${sub}</div>
      </div>
    `;
  }).join("");
}
