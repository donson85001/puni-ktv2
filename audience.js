let songs = [];
let queue = [];
let wishlist = [];

let currentPage = "queue";
let mainCat = "女歌手";
let subCat = "全部";
let leaderboardPage = 1;

const MAIN_CATS = ["女歌手","男歌手","其他"];
const OTHER_SUBTAGS = ["日","英","韓","Rap","情歌對唱","嗨歌/怪歌","舞蹈"];
const MEDALS = ["🥇","🥈","🥉"];
const LEADERBOARD_PAGE_SIZE = 24;
const LEADERBOARD_TOTAL_PAGES = 4;
const FAST_MS = 2000;
const SLOW_MS = 25000;
const $ = (id)=>document.getElementById(id);

let syncingFast = false;
let syncingSlow = false;
let lastQueueSig = "";
let lastSongsSig = "";
let lastWishSig = "";

init();

function init(){
  document.querySelectorAll(".nav").forEach(btn=>{
    btn.onclick=()=>{
      document.querySelectorAll(".nav").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      currentPage = btn.dataset.page;
      document.querySelectorAll(".page").forEach(p=>p.classList.add("hidden"));
      $("page-"+currentPage)?.classList.remove("hidden");
      renderCurrentPage(true);
    };
  });

  $("songSearchBtn")?.addEventListener("click", ()=>renderSongs(true));
  $("songSearch")?.addEventListener("input", debounce(()=>renderSongs(true),120));
  $("toggleCats")?.addEventListener("click", ()=> $("catPanel")?.classList.toggle("hidden"));
  $("wishForm")?.addEventListener("submit", async(e)=>{
    e.preventDefault();
    await sendWish();
  });

  syncSlow(true);
  syncFast(true);
  setInterval(()=>syncFast(false), FAST_MS);
  setInterval(()=>syncSlow(false), SLOW_MS);
}

function debounce(fn,ms){ let t=null; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args),ms); }; }
function setStatus(t){ $("syncStatus") && ($("syncStatus").textContent=t); }
function setWishMsg(t){ $("wishMsg") && ($("wishMsg").textContent=t); }

function renderCurrentPage(force=false){
  if(currentPage==="queue") return renderQueue(force);
  if(currentPage==="songs") return renderSongs(force);
  if(currentPage==="leaderboard") return renderLeaderboard(force);
  if(currentPage==="wishlist") return renderWishlist(force);
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

function renderQueue(){
  const box = $("homeQueue");
  if(!box) return;
  $("statQueue").textContent = String(queue.length || 0);
  $("statSongs").textContent = String(songs.length || 0);
  $("statPractice").textContent = String((songs||[]).filter(s=>s.practice).length || 0);

  if(!queue.length){
    box.innerHTML = `<div class="empty-state">目前沒有播放清單，等聊天室點歌就會顯示在這裡 ✨</div>`;
    return;
  }

  box.innerHTML = queue.map((q, i) => {
    const who = q.by ? `🎯 ${esc(q.by)}` : "";
    const sub = esc(q.artist || (q.category==="其他" ? (q.subtag||"") : ""));
    const whoLine = (who && sub) ? `${who} · ${sub}` : (who || sub);
    const currentBadge = i === 0 ? `<span class="badge">▶ 現在播放</span>` : "";
    return `
      <div class="row">
        <div class="row-left">
          <div class="row-title"><span class="rank">${i+1}</span>${currentBadge}${esc(q.title||"")}${q.practice ? " ⭐" : ""}<span class="pill">${esc(q.category||"")}</span></div>
          <div class="row-sub">${whoLine}</div>
        </div>
      </div>
    `;
  }).join("");
}

function renderSongs(){
  const grid = $("songGrid");
  if(!grid) return;
  if(!songs.length){
    grid.innerHTML = `<div class="empty-state grid-span-all">歌曲載入中…</div>`;
    return;
  }

  rebuildMainCatChips();
  rebuildSubtagChips();

  const q = ($("songSearch")?.value||"").trim().toLowerCase();
  let list = filterSongsByCategory(songs).sort((a,b)=>(b.plays||0)-(a.plays||0));
  if(q){
    list = list.filter(s=>{
      return String(s.title||"").toLowerCase().includes(q) ||
             String(s.artist||"").toLowerCase().includes(q) ||
             String(s.subtag||"").toLowerCase().includes(q);
    });
  }

  const shown = list.slice(0, 120);
  if(!shown.length){
    grid.innerHTML = `<div class="empty-state grid-span-all">沒有歌曲</div>`;
    return;
  }

  grid.innerHTML = shown.map(s=>`
    <div class="song song-card">
      <div class="song-title">${esc(s.title||"")}${s.practice?` <span class="badge">⭐ 練習中</span>`:""}</div>
      <div class="song-artist">${esc(s.artist || (s.category==="其他" ? (s.subtag||"") : ""))}</div>
      <div class="song-actions">
        <span class="pill">${esc(s.category||"未分類")}</span>
        <span class="pill">播放 ${Number(s.plays||0)}</span>
      </div>
    </div>
  `).join("");
}

function renderLeaderboard(){
  const box = $("leaderboardList");
  if(!box) return;
  if(!songs.length){
    box.innerHTML = `<div class="empty-state grid-span-all">排行榜載入中…</div>`;
    renderLeaderboardPager();
    return;
  }

  const sorted=[...songs].sort((a,b)=>(b.plays||0)-(a.plays||0));
  const start=(leaderboardPage-1)*LEADERBOARD_PAGE_SIZE;
  const shown=sorted.slice(start,start+LEADERBOARD_PAGE_SIZE);
  box.innerHTML = shown.map((s,idx)=>{
    const absolute = start + idx;
    const isTop = absolute < 3;
    const rankLabel = absolute < 3 ? `<span class="medal">${MEDALS[absolute]}</span>` : `<span class="rank">${absolute+1}</span>`;
    return `
      <div class="song song-card leaderboard-card ${isTop ? 'top-3' : ''}">
        ${isTop ? `<div class="top-ribbon">TOP ${absolute+1}</div>` : ''}
        <div class="song-title">${rankLabel}${esc(s.title||"")}${s.practice?" ⭐":""}</div>
        <div class="song-artist">${esc(s.artist || (s.category==="其他" ? (s.subtag||"") : ""))}</div>
        <div class="song-actions">
          <span class="pill">${esc(s.category||"")}</span>
          <span class="pill">播放 ${Number(s.plays||0)}</span>
        </div>
      </div>
    `;
  }).join("");
  renderLeaderboardPager();
}

function renderWishlist(){
  const box=$("wishList");
  if(!box) return;
  if(!wishlist.length){
    box.innerHTML = `<div class="empty-state grid-span-all">還沒有許願</div>`;
    return;
  }

  box.innerHTML = wishlist.map(w=>{
    const raw = String(w.text||"");
    const song = raw.includes("|||") ? raw.split("|||").slice(1).join("|||").trim() : raw.trim();
    return `
      <div class="song song-card wish-card">
        <div class="song-title">${esc(song)}</div>
        <div class="song-artist">來自觀眾的許願歌單</div>
        <div class="song-actions">
          <span class="pill">${w.ts ? new Date(Number(w.ts||0)).toLocaleString() : "剛剛"}</span>
        </div>
      </div>
    `;
  }).join("");
}

async function sendWish(){
  const name = $("wishName")?.value.trim() || "";
  const song = $("wishSong")?.value.trim() || "";
  if(!song) return setWishMsg("請先輸入許願歌名");
  setWishMsg("送出中…");
  try{
    const text = `${name}|||${song}`;
    await api("wish", {text}, {timeoutMs:10000,retries:1});
    if($("wishSong")) $("wishSong").value = "";
    if($("wishName")) $("wishName").value = "";
    setWishMsg("許願已送出 ✨");
    await syncSlow(true);
  }catch(e){
    setWishMsg("送出失敗：" + (e?.message||String(e)));
  }
  setTimeout(()=>setWishMsg(""), 1800);
}

async function syncFast(forceRender){
  if(syncingFast) return;
  syncingFast = true;
  try{
    const q1 = await api("queue", null, {timeoutMs:10000,retries:1});
    const nextQueue = q1.data || [];
    const sig = JSON.stringify(nextQueue.map(x=>[x.id,x.title,x.by,x.artist,x.category,x.practice]));
    if(sig !== lastQueueSig || forceRender){
      queue = nextQueue;
      lastQueueSig = sig;
      if(currentPage === "queue" || forceRender) renderQueue();
    }
    if(!syncingSlow) setStatus("已同步："+new Date().toLocaleTimeString());
  }catch(e){
    setStatus("同步失敗：" + (e?.message||String(e)));
  }finally{
    syncingFast = false;
  }
}

async function syncSlow(forceRender){
  if(syncingSlow) return;
  syncingSlow = true;
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

    if(songsChanged){ songs = nextSongs; lastSongsSig = songsSig; }
    if(wishChanged){ wishlist = nextWish; lastWishSig = wishSig; }

    if(forceRender || (songsChanged && currentPage === "songs")) renderSongs();
    if(forceRender || (songsChanged && currentPage === "leaderboard")) renderLeaderboard();
    if(forceRender || (wishChanged && currentPage === "wishlist")) renderWishlist();
    if(forceRender || (songsChanged && currentPage === "queue")) renderQueue();

    setStatus("已同步："+new Date().toLocaleTimeString());
  }catch(e){
    setStatus("同步失敗：" + (e?.message||String(e)));
  }finally{
    syncingSlow = false;
  }
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
