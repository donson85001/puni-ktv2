let authed = false;
let currentPage = "queue";

let songs = [];
let queue = [];
let wishlist = [];

const MAIN_CATS = ["女歌手","男歌手","其他"];
const OTHER_SUBTAGS = ["日","英","韓","Rap","情歌對唱","嗨歌/怪歌","舞蹈"];
const OBS_LIMITS = [5,10,15,20,25,30];

let mainCat = "女歌手";
let subCat = "全部";
let leaderboardPage = 1;
const LEADERBOARD_PAGE_SIZE = 24;
const LEADERBOARD_TOTAL_PAGES = 4;
let obsLimit = Number(localStorage.getItem("puni_streamer_obs_limit") || 10);
if(!OBS_LIMITS.includes(obsLimit)) obsLimit = 10;

const FAST_MS = 1500;
const SLOW_MS = 45000;
const LS_AUTH = "puni_streamer_authed";
const $ = (id) => document.getElementById(id);

let syncingFast = false;
let syncingSlow = false;
let lastQueueSig = "";
let lastSongsSig = "";
let lastWishSig = "";

init();

function init(){
  $("loginBtn")?.addEventListener("click", login);
  $("pw")?.addEventListener("keydown", (e)=>{ if(e.key==="Enter") login(); });
  $("logoutBtn")?.addEventListener("click", logout);

  document.querySelectorAll(".nav").forEach((btn)=>{
    btn.addEventListener("click", ()=>{
      document.querySelectorAll(".nav").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      currentPage = btn.dataset.page;
      show(currentPage);
      renderCurrentPage(true);
    });
  });

  $("songSearchBtn")?.addEventListener("click", ()=>renderSongs(true));
  $("songSearch")?.addEventListener("input", debounce(()=>renderSongs(true), 120));
  $("toggleCats")?.addEventListener("click", ()=> $("catPanel")?.classList.toggle("hidden"));
  $("copyObsUrlBtn")?.addEventListener("click", copyObsUrl);
  $("bulkPlayedBtn")?.addEventListener("click", bulkPlayedQueue);
  $("bulkRemoveBtn")?.addEventListener("click", bulkRemoveQueue);
  buildObsControls();
  updateObsUrl();

  if(localStorage.getItem(LS_AUTH)==="1") enterApp_();
}

function debounce(fn, ms){ let t=null; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args), ms); }; }
function setStatus(t){ $("syncStatus") && ($("syncStatus").textContent=t); }
function setGateMsg_(t){ $("gateMsg") && ($("gateMsg").textContent = t); }

async function login(){
  const pw = ($("pw")?.value||"").trim();
  if(!pw) return setGateMsg_("請輸入密碼");
  try{
    setGateMsg_("登入中…");
    const r = await api("verify", {password:pw}, {timeoutMs:12000,retries:1});
    if(!r || !r.ok){
      setGateMsg_("登入失敗：密碼錯誤或後端未更新");
      return;
    }
    localStorage.setItem(LS_AUTH,"1");
    enterApp_();
  }catch(e){
    setGateMsg_("登入失敗：" + (e?.message||String(e)));
  }
}

function logout(){
  localStorage.removeItem(LS_AUTH);
  authed = false;
  syncingFast = false;
  syncingSlow = false;
  $("app") && ($("app").style.display="none");
  $("gate") && ($("gate").style.display="grid");
  $("pw") && ($("pw").value="");
  setGateMsg_("已登出");
}

function enterApp_(){
  authed = true;
  $("gate") && ($("gate").style.display="none");
  $("app") && ($("app").style.display="block");

  (async ()=>{
    setStatus("同步中…");
    await syncSlow(true);
    await syncFast(true);
    if(!window.__puniStreamerTimers){
      window.__puniStreamerTimers = true;
      setInterval(()=>syncFast(false), FAST_MS);
      setInterval(()=>syncSlow(false), SLOW_MS);
    }
    currentPage = "queue";
    show("queue");
    renderCurrentPage(true);
  })();
}

function show(name){
  document.querySelectorAll(".page").forEach(p=>p.classList.add("hidden"));
  $("page-"+name)?.classList.remove("hidden");
}

function renderCurrentPage(force=false){
  if(!authed) return;
  if(currentPage==="queue") return renderQueue(force);
  if(currentPage==="songs") return renderSongs(force);
  if(currentPage==="leaderboard") return renderLeaderboard(force);
  if(currentPage==="wishlist") return renderWishlist(force);
}

function setQueueBatchButtonsState(){
  const hasQueue = queue.length > 0;
  [$("bulkPlayedBtn"), $("bulkRemoveBtn")].forEach(btn=>{
    if(!btn) return;
    btn.disabled = !hasQueue;
    btn.classList.toggle("is-disabled", !hasQueue);
  });
}

function rebuildMainCatChips(){
  const box = $("mainCatChips");
  if(!box) return;
  box.innerHTML = "";
  MAIN_CATS.forEach(c=>{
    const b=document.createElement("button");
    b.className="chip chip-block "+(c===mainCat?"chip-active":"");
    b.textContent=c;
    b.onclick=()=>{
      mainCat=c;
      subCat="全部";
      rebuildMainCatChips();
      rebuildSubtagChips();
      renderSongs(true);
    };
    box.appendChild(b);
  });
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
    b.className="chip chip-block "+(t===subCat?"chip-active":"");
    b.textContent=t;
    b.onclick=()=>{ subCat=t; rebuildSubtagChips(); renderSongs(true); };
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

  if(mainCat==="其他" && subCat!=="全部") list = list.filter(s => (s.subtag||"")===subCat);
  return list;
}

function makeSongCard(s, opts={}){
  const canQueue = opts.canQueue !== false;
  return `
    <div class="song song-card">
      <div class="song-title">${esc(s.title||"")}${s.practice?` <span class="badge">⭐ 練習中</span>`:""}</div>
      <div class="song-artist">${esc(s.artist || (s.category==="其他" ? (s.subtag||"") : ""))}</div>
      <div class="song-actions">
        <span class="pill">${esc(s.category||"未分類")}</span>
        <span class="pill">播放 ${Number(s.plays||0)}</span>
        ${canQueue ? `<button class="btn btn-mini btn-primary" data-songid="${esc(s.id)}">加入 Queue</button>` : ""}
      </div>
    </div>
  `;
}

function wireSongQueueButtons(scope=document){
  scope.querySelectorAll("[data-songid]").forEach(btn=>{
    btn.onclick=async()=>{
      await api("addqueue", {songId:btn.dataset.songid, by:"主播"}, {timeoutMs:10000,retries:1});
      await syncFast(true);
    };
  });
}

function renderQueue(){
  const box = $("queueList");
  if(!box) return;
  setQueueBatchButtonsState();
  if(!queue.length){
    box.innerHTML = `<div class="empty-state">Queue 是空的，聊天室一來歌就會跳上來 ✨</div>`;
    return;
  }

  box.innerHTML = queue.map((q,idx)=>{
    const who = q.by ? `🎯 ${esc(q.by)}` : "";
    const subline = esc((q.artist || (q.category==="其他" ? (q.subtag||"") : "")).trim());
    return `
      <div class="row">
        <div class="row-left">
          <div class="row-title"><span class="rank">${idx+1}</span>${esc(q.title||"")}${q.practice?" ⭐":""} <span class="pill">${esc(q.category||"")}</span></div>
          <div class="row-sub">${who}${who && subline ? " · " : ""}${subline}</div>
        </div>
        <div class="row-actions">
          <button class="btn btn-mini btn-primary" data-played="${esc(q.id)}">單首 +1</button>
          <button class="btn btn-mini btn-danger" data-remove="${esc(q.id)}">移除</button>
        </div>
      </div>`;
  }).join("");

  box.querySelectorAll("[data-played]").forEach(btn=>btn.onclick=async()=>{
    await api("played", {queueId:btn.dataset.played}, {timeoutMs:10000,retries:1});
    await syncFast(true);
    await syncSlow(true);
  });
  box.querySelectorAll("[data-remove]").forEach(btn=>btn.onclick=async()=>{
    await api("removequeue", {queueId:btn.dataset.remove}, {timeoutMs:10000,retries:1});
    await syncFast(true);
  });
}

function renderSongs(){
  const grid=$("songGrid");
  if(!grid) return;
  if(!songs.length){
    grid.innerHTML = `<div class="empty-state grid-span-all">歌曲載入中…</div>`;
    return;
  }

  rebuildMainCatChips();
  rebuildSubtagChips();

  const q=($("songSearch")?.value||"").trim().toLowerCase();
  let list = filterSongsByCategory(songs).sort((a,b)=>(b.plays||0)-(a.plays||0));
  if(q){
    list=list.filter(s=>{
      const t=String(s.title||"").toLowerCase();
      const a=String(s.artist||"").toLowerCase();
      const st=String(s.subtag||"").toLowerCase();
      return t.includes(q)||a.includes(q)||st.includes(q);
    });
  }

  const shown=list.slice(0,120);
  if(!shown.length){
    grid.innerHTML=`<div class="empty-state grid-span-all">沒有歌曲</div>`;
    return;
  }

  grid.innerHTML = shown.map(s=>makeSongCard(s,{canQueue:true})).join("");
  wireSongQueueButtons(grid);
}

function renderLeaderboard(){
  const box=$("leaderboardList");
  if(!box) return;
  if(!songs.length){
    box.innerHTML = `<div class="empty-state grid-span-all">排行榜載入中…</div>`;
    renderLeaderboardPager();
    return;
  }

  const sorted=[...songs].sort((a,b)=>(b.plays||0)-(a.plays||0));
  const start=(leaderboardPage-1)*LEADERBOARD_PAGE_SIZE;
  const shown=sorted.slice(start,start+LEADERBOARD_PAGE_SIZE);
  box.innerHTML = shown.map((s,idx)=>`
    <div class="song song-card leaderboard-card">
      <div class="song-title"><span class="rank">${start+idx+1}</span>${esc(s.title||"")}${s.practice?" ⭐":""}</div>
      <div class="song-artist">${esc(s.artist || (s.category==="其他" ? (s.subtag||"") : ""))}</div>
      <div class="song-actions">
        <span class="pill">${esc(s.category||"")}</span>
        <span class="pill">播放 ${Number(s.plays||0)}</span>
        <button class="btn btn-mini btn-primary" data-songid="${esc(s.id)}">加入 Queue</button>
      </div>
    </div>
  `).join("");
  renderLeaderboardPager();
  wireSongQueueButtons(box);
}

function renderWishlist(){
  const box=$("wishList");
  if(!box) return;
  if(!wishlist.length){
    box.innerHTML = `<div class="empty-state grid-span-all">還沒有許願</div>`;
    return;
  }

  box.innerHTML = wishlist.map(w=>{
    const raw=String(w.text||"");
    const name=raw.includes("|||") ? raw.split("|||")[0].trim() : "";
    const song=raw.includes("|||") ? raw.split("|||").slice(1).join("|||").trim() : raw.trim();
    return `
      <div class="song song-card wish-card streamer-wish-card">
        <div class="song-title">${esc(song)}</div>
        <div class="song-artist">許願人：${esc(name || "未填")}</div>
        <div class="song-actions">
          <span class="pill">${w.ts ? new Date(Number(w.ts||0)).toLocaleString() : "剛剛"}</span>
          <button class="btn btn-mini btn-danger" data-deletewish="${esc(w.id)}">刪除</button>
        </div>
      </div>`;
  }).join("");

  box.querySelectorAll("[data-deletewish]").forEach(btn=>btn.onclick=async()=>{
    await api("deletewish", {wishId:btn.dataset.deletewish}, {timeoutMs:10000,retries:1});
    await syncSlow(true);
  });
}


async function bulkPlayedQueue(){
  if(!queue.length) return;
  const btn = $("bulkPlayedBtn");
  const old = btn?.textContent || "";
  if(btn){ btn.disabled = true; btn.textContent = "處理中…"; }
  try{
    const ids = queue.map(q=>q.id).filter(Boolean);
    for(const id of ids){
      await api("played", {queueId:id}, {timeoutMs:12000,retries:1});
    }
    await syncFast(true);
    await syncSlow(true);
  }catch(e){
    alert("一鍵全部 +1 失敗：" + (e?.message||String(e)));
  }finally{
    if(btn){ btn.textContent = old || "一鍵全部 +1"; }
    setQueueBatchButtonsState();
  }
}

async function bulkRemoveQueue(){
  if(!queue.length) return;
  const btn = $("bulkRemoveBtn");
  const old = btn?.textContent || "";
  if(btn){ btn.disabled = true; btn.textContent = "刪除中…"; }
  try{
    const ids = queue.map(q=>q.id).filter(Boolean);
    for(const id of ids){
      await api("removequeue", {queueId:id}, {timeoutMs:12000,retries:1});
    }
    await syncFast(true);
  }catch(e){
    alert("一鍵全部刪除失敗：" + (e?.message||String(e)));
  }finally{
    if(btn){ btn.textContent = old || "一鍵全部刪除"; }
    setQueueBatchButtonsState();
  }
}

async function syncFast(forceRender){
  if(!authed || syncingFast) return;
  syncingFast=true;
  try{
    const q1 = await api("queue", null, {timeoutMs:10000,retries:1});
    const nextQueue = q1.data || [];
    const sig = JSON.stringify(nextQueue.map(x=>[x.id,x.title,x.by,x.artist,x.category,x.practice]));
    if(sig !== lastQueueSig || forceRender){
      queue = nextQueue;
      lastQueueSig = sig;
      if(currentPage==="queue" || forceRender) renderQueue();
      else setQueueBatchButtonsState();
    }
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
      api("songs", null, {timeoutMs:15000,retries:1}),
      api("wishlist", null, {timeoutMs:15000,retries:1}),
    ]);

    const nextSongs = s1.data || [];
    const nextWish = w1.data || [];
    const songsSig = JSON.stringify(nextSongs.map(x=>[x.id,x.title,x.artist,x.subtag,x.plays,x.practice,x.category]));
    const wishSig = JSON.stringify(nextWish.map(x=>[x.id,x.text,x.ts]));

    const songsChanged = songsSig !== lastSongsSig;
    const wishChanged = wishSig !== lastWishSig;

    if(songsChanged){
      songs = nextSongs;
      lastSongsSig = songsSig;
      rebuildMainCatChips();
      rebuildSubtagChips();
    }
    if(wishChanged){
      wishlist = nextWish;
      lastWishSig = wishSig;
    }

    if(forceRender || (songsChanged && currentPage==="songs")) renderSongs();
    if(forceRender || (songsChanged && currentPage==="leaderboard")) renderLeaderboard();
    if(forceRender || (wishChanged && currentPage==="wishlist")) renderWishlist();

    setStatus("已同步：" + new Date().toLocaleTimeString());
  }catch(e){
    setStatus("同步失敗：" + (e?.message||String(e)));
  }finally{
    syncingSlow=false;
  }
}

function buildObsControls(){
  const box = $("obsLimitControls");
  if(!box) return;
  box.innerHTML = "";
  OBS_LIMITS.forEach(n=>{
    const b = document.createElement("button");
    b.className = "chip chip-block obs-limit-btn " + (n===obsLimit ? "chip-active" : "");
    b.textContent = `${n} 首`;
    b.onclick = ()=>{
      obsLimit = n;
      localStorage.setItem("puni_streamer_obs_limit", String(n));
      buildObsControls();
      updateObsUrl();
    };
    box.appendChild(b);
  });
}

function updateObsUrl(){
  const obsUrl = $("obsUrl");
  if (!obsUrl) return;
  const base = location.href.replace(/streamer\.html(\?.*)?$/i, "obs.html");
  obsUrl.textContent = `${base}?limit=${obsLimit}&title=1`;
}


function renderLeaderboardPager(){
  const pager = $("leaderboardPager");
  if(!pager) return;
  pager.innerHTML = `<span class="pager-label">第 ${leaderboardPage} / ${LEADERBOARD_TOTAL_PAGES} 頁</span>` +
    Array.from({length: LEADERBOARD_TOTAL_PAGES}, (_,i)=>{
      const page=i+1;
      return `<button type="button" class="btn ${page===leaderboardPage?"btn-primary":""}" data-lbpage="${page}">${page}</button>`;
    }).join("");
  pager.querySelectorAll("[data-lbpage]").forEach(btn=>btn.onclick=()=>{
    leaderboardPage = Number(btn.dataset.lbpage||1);
    renderLeaderboard(true);
  });
}

async function copyObsUrl(){
  const text = $("obsUrl")?.textContent?.trim() || "";
  const msg = $("copyObsMsg");
  if(!text) return;
  try{
    await navigator.clipboard.writeText(text);
    if(msg) msg.textContent = "已複製到剪貼簿 ✨";
  }catch(e){
    const ta=document.createElement("textarea"); ta.value=text; document.body.appendChild(ta); ta.select();
    try{ document.execCommand("copy"); if(msg) msg.textContent = "已複製到剪貼簿 ✨"; }
    catch(err){ if(msg) msg.textContent = "複製失敗，請手動複製"; }
    ta.remove();
  }
  setTimeout(()=>{ if(msg) msg.textContent = ""; }, 1800);
}
