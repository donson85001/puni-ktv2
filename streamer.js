// streamer.js (Queue only, fast on mobile)
// - NO pending anymore
// - Fast sync: queue every 2000ms
// - Slow sync: songs + wishlist every 25000ms
// - Leaderboard rendered in song-card style (same as 點歌)

let authed = false;
let currentPage = "queue";

let songs = [];
let queue = [];
let wishlist = [];

const MAIN_CATS = ["女歌手","男歌手","其他"];
const OTHER_SUBTAGS = ["日","英","韓","Rap","情歌對唱","嗨歌/怪歌","舞蹈"];

let mainCat = "女歌手";
let subCat = "全部";

const FAST_MS = 2000;
const SLOW_MS = 25000;

const $ = (id) => document.getElementById(id);

let syncingFast = false;
let syncingSlow = false;

init();

function init(){
  $("loginBtn")?.addEventListener("click", login);
  $("pw")?.addEventListener("keydown", (e)=>{ if(e.key==="Enter") login(); });

  document.querySelectorAll(".nav").forEach((btn)=>{
    btn.addEventListener("click", ()=>{
      document.querySelectorAll(".nav").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      currentPage = btn.dataset.page;
      show(currentPage);
      renderCurrentPage();
    });
  });

  $("songSearchBtn")?.addEventListener("click", renderSongs);
  $("songSearch")?.addEventListener("input", debounce(renderSongs, 120));

  $("toggleCats")?.addEventListener("click", ()=>{
    const p = $("catPanel");
    if(!p) return;
    p.style.display = (p.style.display==="none" ? "block" : "none");
  });

  const obsUrl = $("obsUrl");
  if (obsUrl) {
    obsUrl.textContent = location.href.replace(/streamer\.html(\?.*)?$/i, "obs.html") + "?full=1";
  }
}

function debounce(fn, ms){
  let t=null;
  return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args), ms); };
}
function setStatus(t){ $("syncStatus") && ($("syncStatus").textContent=t); }

async function login(){
  const pw = ($("pw")?.value||"").trim();
  const gateMsg = $("gateMsg");

  try{
    const r = await api("verify",{password:pw},{timeoutMs:10000,retries:1});
    if(!r.ok){ gateMsg && (gateMsg.textContent="密碼錯誤或後端未部署成功"); return; }
  }catch(e){
    gateMsg && (gateMsg.textContent="登入失敗：" + (e?.message||String(e)));
    return;
  }

  authed = true;
  $("gate") && ($("gate").style.display="none");
  $("app") && ($("app").style.display="block");

  rebuildMainCatChips();

  // first sync
  setStatus("同步中…");
  await syncSlow(true);
  await syncFast(true);
  setStatus("已同步：" + new Date().toLocaleTimeString());

  setInterval(()=>syncFast(false), FAST_MS);
  setInterval(()=>syncSlow(false), SLOW_MS);

  currentPage = "queue";
  show("queue");
  renderCurrentPage();
}

function show(name){
  document.querySelectorAll(".page").forEach(p=>p.classList.add("hidden"));
  $("page-"+name)?.classList.remove("hidden");
}

function renderCurrentPage(){
  if(!authed) return;
  if(currentPage==="queue") return renderQueue();
  if(currentPage==="songs") return renderSongs();
  if(currentPage==="leaderboard") return renderLeaderboard();
  if(currentPage==="wishlist") return renderWishlist();
}

/* ===== categories ===== */

function rebuildMainCatChips(){
  const panel = $("catPanel");
  const chips = $("catChips");
  if(!panel || !chips) return;

  let wrap = panel.querySelector("[data-maincats='1']");
  if(!wrap){
    wrap = document.createElement("div");
    wrap.dataset.maincats="1";
    wrap.className="panel-body";
    wrap.style.marginBottom="10px";
    panel.insertBefore(wrap, panel.firstChild);
  }
  wrap.innerHTML="";

  MAIN_CATS.forEach(c=>{
    const b=document.createElement("button");
    b.className="chip "+(c===mainCat?"chip-active":"");
    b.textContent=c;
    b.onclick=()=>{
      mainCat=c;
      subCat="全部";
      rebuildMainCatChips();
      rebuildSubtagChips();
      renderSongs();
    };
    wrap.appendChild(b);
  });

  rebuildSubtagChips();
}

function buildSingerSubtags(allSongs, category){
  const list = allSongs.filter(s=>s.category===category);
  const count = {};
  for(const s of list){
    const a=(s.artist||"").trim();
    if(!a) continue;
    count[a]=(count[a]||0)+1;
  }
  const multi = Object.keys(count).filter(a=>count[a]>=2).sort((a,b)=>a.localeCompare(b,"zh-Hant"));
  return [...multi,"其他(單曲歌手)"];
}

function rebuildSubtagChips(){
  const box = $("catChips");
  if(!box) return;
  box.innerHTML="";

  let subtags=[];
  if(mainCat==="女歌手"||mainCat==="男歌手") subtags=buildSingerSubtags(songs, mainCat);
  if(mainCat==="其他") subtags=OTHER_SUBTAGS;

  ["全部",...subtags].forEach(t=>{
    const b=document.createElement("button");
    b.className="chip "+(t===subCat?"chip-active":"");
    b.textContent=t;
    b.onclick=()=>{ subCat=t; rebuildSubtagChips(); renderSongs(); };
    box.appendChild(b);
  });
}

function filterSongsByCategory(allSongs){
  let list = allSongs.filter(s=>s.category===mainCat);

  if(mainCat==="女歌手"||mainCat==="男歌手"){
    if(subCat!=="全部"){
      if(subCat==="其他(單曲歌手)"){
        const cnt={};
        for(const s of list){
          const a=(s.artist||"").trim();
          if(!a) continue;
          cnt[a]=(cnt[a]||0)+1;
        }
        list = list.filter(s => (cnt[(s.artist||"").trim()]||0)===1);
      }else{
        list = list.filter(s => (s.artist||"").trim()===subCat);
      }
    }
  }

  if(mainCat==="其他"){
    if(subCat!=="全部") list = list.filter(s => (s.subtag||"")===subCat);
  }

  return list;
}

/* ===== render ===== */

function renderQueue(){
  const box = $("queueList");
  if(!box) return;

  if(!queue.length){
    box.innerHTML = `<div class="muted small">Queue 是空的</div>`;
    return;
  }

  const frag = document.createDocumentFragment();
  queue.forEach((q,idx)=>{
    const row=document.createElement("div");
    row.className="row";
    row.innerHTML=`
      <div class="row-left">
        <div class="row-title"><span class="rank">${idx+1}</span> ${esc(q.title||"")}${q.practice?" ⭐":""} <span class="pill">${esc(q.category||"")}</span></div>
        <div class="row-sub">${esc(q.artist || (q.category==="其他" ? (q.subtag||"") : ""))}</div>
      </div>
      <div class="row-actions">
        <button class="btn btn-mini btn-primary">已唱 +1</button>
        <button class="btn btn-mini">移除</button>
      </div>
    `;

    const btns=row.querySelectorAll("button");
    btns[0].onclick=async()=>{
      await api("played",{queueId:q.id},{timeoutMs:10000,retries:1});
      await syncFast(true);
      await syncSlow(false); // plays changed
    };
    btns[1].onclick=async()=>{
      await api("removequeue",{queueId:q.id},{timeoutMs:10000,retries:1});
      await syncFast(true);
    };

    frag.appendChild(row);
  });

  box.replaceChildren(frag);
}

function renderSongs(){
  const grid=$("songGrid");
  if(!grid) return;

  if(!songs.length){
    grid.innerHTML = `<div class="muted small">歌曲載入中…</div>`;
    return;
  }

  const q=($("songSearch")?.value||"").trim().toLowerCase();
  let list = filterSongsByCategory(songs);
  list.sort((a,b)=>(b.plays||0)-(a.plays||0));

  if(q){
    list=list.filter(s=>{
      const t=String(s.title||"").toLowerCase();
      const a=String(s.artist||"").toLowerCase();
      const st=String(s.subtag||"").toLowerCase();
      return t.includes(q)||a.includes(q)||st.includes(q);
    });
  }

  const MAX=250;
  const shown=list.slice(0,MAX);

  if(!shown.length){
    grid.innerHTML=`<div class="muted small">沒有歌曲</div>`;
    return;
  }

  const frag=document.createDocumentFragment();
  shown.forEach(s=>{
    const el=document.createElement("div");
    el.className="song";
    el.innerHTML=`
      <div class="song-title">${esc(s.title||"")}${s.practice?` <span class="badge">⭐ 練習中</span>`:""}</div>
      <div class="song-artist">${mainCat==="其他" ? `<span class="muted">${esc(s.subtag||"")}</span>` : esc(s.artist||"")}</div>
      <div class="song-actions">
        <button class="btn btn-mini btn-primary">加入 Queue</button>
        <span class="pill">播放 ${Number(s.plays||0)}</span>
      </div>
    `;
    el.querySelector("button").onclick=async()=>{
      await await api("addqueue", { songId: s.id, by: "主播" }),{timeoutMs:10000,retries:1});
      await syncFast(true);
    };
    frag.appendChild(el);
  });
  grid.replaceChildren(frag);
}

function renderLeaderboard(){
  const box=$("leaderboardList");
  if(!box) return;

  if(!songs.length){
    box.innerHTML = `<div class="muted small">排行榜載入中…</div>`;
    return;
  }

  const sorted=[...songs].sort((a,b)=>(b.plays||0)-(a.plays||0)).slice(0,80);

  const frag=document.createDocumentFragment();
  sorted.forEach((s,idx)=>{
    const row=document.createElement("div");
    row.className="row songlike";
    row.innerHTML=`
      <div class="row-left">
        <div class="row-title"><span class="rank">${idx+1}</span> ${esc(s.title||"")}${s.practice?" ⭐":""}</div>
        <div class="row-sub">${esc(s.artist || (s.category==="其他" ? (s.subtag||"") : ""))} · <span class="pill">${esc(s.category||"")}</span></div>
      </div>
      <div class="row-actions">
        <span class="pill">播放 ${Number(s.plays||0)}</span>
        <button class="btn btn-mini btn-primary">加入 Queue</button>
      </div>
    `;
    row.querySelector("button").onclick=async()=>{
      await api("addqueue", { songId: s.id, by: "主播" }),{timeoutMs:10000,retries:1});
      await syncFast(true);
    };
    frag.appendChild(row);
  });

  box.replaceChildren(frag);
}

function renderWishlist(){
  const box=$("wishList");
  if(!box) return;

  if(!wishlist.length){
    box.innerHTML = `<div class="muted small">還沒有許願</div>`;
    return;
  }

  const frag=document.createDocumentFragment();
  wishlist.forEach(w=>{
    const raw=String(w.text||"");
    const name=raw.includes("|||") ? raw.split("|||")[0].trim() : "";
    const song=raw.includes("|||") ? raw.split("|||").slice(1).join("|||").trim() : raw.trim();

    const row=document.createElement("div");
    row.className="row";
    row.innerHTML=`
      <div class="row-left">
        <div class="row-title">${esc(song)}</div>
        <div class="row-sub">許願者：${esc(name)} · ${new Date(Number(w.ts||0)).toLocaleString()}</div>
      </div>
      <div class="row-actions">
        <button class="btn btn-mini">刪除</button>
      </div>
    `;
    row.querySelector("button").onclick=async()=>{
      await api("deletewish",{wishId:w.id},{timeoutMs:10000,retries:1});
      await syncSlow(true);
    };
    frag.appendChild(row);
  });

  box.replaceChildren(frag);
}

/* ===== sync ===== */

async function syncFast(forceRender){
  if(!authed || syncingFast) return;
  syncingFast=true;
  try{
    const q1 = await api("queue",null,{timeoutMs:10000,retries:1});
    queue = q1.data || [];
    if(forceRender || currentPage==="queue") renderQueue();
    if(!syncingSlow) setStatus("已同步：" + new Date().toLocaleTimeString());
  }catch(e){
    setStatus("同步失敗：" + (e?.message||String(e)));
  }finally{
    syncingFast=false;
  }
}

async function syncSlow(forceRender){
  if(!authed || syncingSlow) return;
  syncingSlow=true;
  try{
    const [s1,w1] = await Promise.all([
      api("songs",null,{timeoutMs:15000,retries:1}),
      api("wishlist",null,{timeoutMs:15000,retries:1}),
    ]);
    songs = s1.data || [];
    wishlist = w1.data || [];

    rebuildMainCatChips();

    if(forceRender || currentPage==="songs") renderSongs();
    if(forceRender || currentPage==="leaderboard") renderLeaderboard();
    if(forceRender || currentPage==="wishlist") renderWishlist();

    setStatus("已同步：" + new Date().toLocaleTimeString());
  }catch(e){
    setStatus("同步失敗：" + (e?.message||String(e)));
  }finally{
    syncingSlow=false;
  }
}
