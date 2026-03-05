// streamer.js (smooth version - less lag)
// - Sync every 6s (configurable)
// - No overlapping sync (lock)
// - Render ONLY when data changed (hash)
// - Render ONLY current page
// - Force sync after actions (approve/addqueue/played/remove)

let authed = false;
let currentPage = "queue";

let songs = [];
let queue = [];
let pending = [];
let wishlist = [];

const MAIN_CATS = ["女歌手","男歌手","其他"];
const OTHER_SUBTAGS = ["日","英","韓","Rap","情歌對唱","嗨歌/怪歌","舞蹈"];

let mainCat = "女歌手";
let subCat = "全部";

const SYNC_MS = 6000; // ✅ 你嫌慢可改 4000；嫌卡就提高到 8000

const $ = (id) => document.getElementById(id);

let syncTimer = null;
let syncing = false;

// 用 hash 判斷資料是否變更（避免每次都重畫）
let hashSongs = "";
let hashQueue = "";
let hashPending = "";
let hashWishlist = "";

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

      if(currentPage==="songs") $("catPanel") && ($("catPanel").style.display="block");
      // ✅ 切頁時只渲染目前頁面
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

  // OBS URL（可有可無）
  const obsUrl = $("obsUrl");
  if (obsUrl) {
    obsUrl.textContent = location.href.replace(/streamer\.html(\?.*)?$/i, "obs.html") + "?limit=10&transparent=1&title=1";
  }
}

async function login(){
  const pw = ($("pw")?.value||"").trim();
  const gateMsg = $("gateMsg");

  // ✅ 先驗證
  const r = await api("verify",{password:pw}).catch(()=>({ok:false}));
  if(!r.ok){
    if (gateMsg) gateMsg.textContent="密碼錯誤或後端未部署成功";
    return;
  }

  authed = true;
  $("gate") && ($("gate").style.display="none");
  $("app") && ($("app").style.display="block");

  // 初次建分類
  rebuildMainCatChips();

  // 初次同步 + 啟動定時同步
  await sync(true);
  syncTimer = setInterval(()=>sync(false), SYNC_MS);

  currentPage = "queue";
  show("queue");
  renderCurrentPage();
}

function show(name){
  document.querySelectorAll(".page").forEach(p=>p.classList.add("hidden"));
  $("page-"+name)?.classList.remove("hidden");
}

/* ========= helpers ========= */

function debounce(fn, ms){
  let t = null;
  return (...args)=>{
    clearTimeout(t);
    t = setTimeout(()=>fn(...args), ms);
  };
}

function fastHash(obj){
  // 快速 hash（足夠用來判斷「有沒有變」）
  // 注意：後端回資料順序要穩定，否則會一直變
  try{
    const s = JSON.stringify(obj);
    let h = 2166136261;
    for(let i=0;i<s.length;i++){
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return String(h >>> 0);
  }catch(e){
    return String(Date.now());
  }
}

function setStatus(text){
  const el = $("syncStatus");
  if(el) el.textContent = text;
}

/* ========= Category chips ========= */

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
    b.onclick=()=>{
      subCat=t;
      rebuildSubtagChips();
      renderSongs();
    };
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
    if(subCat!=="全部"){
      list = list.filter(s => (s.subtag||"")===subCat);
    }
  }

  return list;
}

/* ========= Render (only current page) ========= */

function renderCurrentPage(){
  if(!authed) return;
  if(currentPage==="queue"){
    renderQueue();
    renderPending();
    return;
  }
  if(currentPage==="songs"){
    renderSongs();
    return;
  }
  if(currentPage==="leaderboard"){
    renderLeaderboard();
    return;
  }
  if(currentPage==="wishlist"){
    renderWishlist();
    return;
  }
}

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
      await api("played",{queueId:q.id});
      toast("已唱 +1");
      await sync(true); // ✅ 動作後立刻同步
    };
    btns[1].onclick=async()=>{
      await api("removequeue",{queueId:q.id});
      toast("已移除");
      await sync(true);
    };

    frag.appendChild(row);
  });

  box.replaceChildren(frag);
}

function renderPending(){
  const box = $("pendingList");
  if(!box) return;

  if(!pending.length){
    box.innerHTML = `<div class="muted small">沒有待通過</div>`;
    return;
  }

  const frag = document.createDocumentFragment();
  pending.forEach((p)=>{
    const row=document.createElement("div");
    row.className="row";
    row.innerHTML=`
      <div class="row-left">
        <div class="row-title">${esc(p.title||"")}${p.practice?" ⭐":""} <span class="pill">${esc(p.category||"")}</span></div>
        <div class="row-sub">${esc(p.artist || (p.category==="其他" ? (p.subtag||"") : ""))} · ${new Date(Number(p.ts||0)).toLocaleString()}</div>
      </div>
      <div class="row-actions">
        <button class="btn btn-mini btn-primary">通過</button>
      </div>
    `;
    row.querySelector("button").onclick=async()=>{
      await api("approve",{pendingId:p.id});
      toast("已通過");
      await sync(true);
    };
    frag.appendChild(row);
  });

  box.replaceChildren(frag);
}

function renderSongs(){
  const grid=$("songGrid");
  if(!grid) return;

  const q=($("songSearch")?.value||"").trim().toLowerCase();

  let list = filterSongsByCategory(songs);

  // 依播放次數排序：多的在上
  list.sort((a,b)=>(b.plays||0)-(a.plays||0));

  if(q){
    list = list.filter(s=>{
      const t=String(s.title||"").toLowerCase();
      const a=String(s.artist||"").toLowerCase();
      const st=String(s.subtag||"").toLowerCase();
      return t.includes(q)||a.includes(q)||st.includes(q);
    });
  }

  if(!list.length){
    grid.innerHTML = `<div class="muted small">沒有歌曲</div>`;
    return;
  }

  const frag = document.createDocumentFragment();
  list.forEach(s=>{
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
      await api("addqueue",{songId:s.id});
      toast("已加入 Queue");
      await sync(true);
    };
    frag.appendChild(el);
  });

  grid.replaceChildren(frag);
}

function renderLeaderboard(){
  const box=$("leaderboardList");
  if(!box) return;

  const sorted=[...songs].sort((a,b)=>(b.plays||0)-(a.plays||0)).slice(0,60);

  if(!sorted.length){
    box.innerHTML=`<div class="muted small">沒有資料</div>`;
    return;
  }

  const frag = document.createDocumentFragment();
  sorted.forEach((s,idx)=>{
    const row=document.createElement("div");
    row.className="row";
    row.innerHTML=`
      <div class="row-left">
        <div class="row-title"><span class="rank">${idx+1}</span> ${esc(s.title||"")}${s.practice?" ⭐":""} <span class="pill">${esc(s.category||"")}</span></div>
        <div class="row-sub">${esc(s.artist || (s.category==="其他" ? (s.subtag||"") : ""))}</div>
      </div>
      <div class="row-actions">
        <span class="pill">播放 ${Number(s.plays||0)}</span>
        <button class="btn btn-mini btn-primary">加入 Queue</button>
      </div>
    `;
    row.querySelector("button").onclick=async()=>{
      await api("addqueue",{songId:s.id});
      toast("已加入 Queue");
      await sync(true);
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

  const frag = document.createDocumentFragment();
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
    `;
    frag.appendChild(row);
  });

  box.replaceChildren(frag);
}

/* ========= Sync ========= */

async function sync(forceRender){
  if(!authed) return;
  if(syncing) return; // ✅ 防止重疊同步造成卡頓
  syncing = true;

  setStatus("同步中…");

  try{
    const [s1,s2,s3,s4] = await Promise.all([
      api("songs"),
      api("queue"),
      api("pending"),
      api("wishlist"),
    ]);

    const newSongs = s1.data || [];
    const newQueue = s2.data || [];
    const newPending = s3.data || [];
    const newWishlist = s4.data || [];

    const hS = fastHash(newSongs);
    const hQ = fastHash(newQueue);
    const hP = fastHash(newPending);
    const hW = fastHash(newWishlist);

    const songsChanged = (hS !== hashSongs);
    const queueChanged = (hQ !== hashQueue);
    const pendingChanged = (hP !== hashPending);
    const wishChanged = (hW !== hashWishlist);

    songs = newSongs; queue = newQueue; pending = newPending; wishlist = newWishlist;

    // 更新 hash
    hashSongs = hS; hashQueue = hQ; hashPending = hP; hashWishlist = hW;

    // ✅ 資料變了才重畫（或動作後強制重畫）
    if (songsChanged) rebuildMainCatChips();

    if (forceRender || songsChanged || queueChanged || pendingChanged || wishChanged) {
      renderCurrentPage();
    }

    setStatus("已同步：" + new Date().toLocaleTimeString());
  } catch (e) {
    setStatus("同步失敗：" + (e && e.message ? e.message : String(e)));
  } finally {
    syncing = false;
  }
}
