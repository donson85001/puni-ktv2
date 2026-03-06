let songs = [];
let queue = [];
let wishlist = [];
let currentPage = "queue";
let mainCat = "女歌手";
let subCat = "全部";
let leaderboardPage = 1;
const LEADERBOARD_PAGE_SIZE = 24;
const LEADERBOARD_TOTAL_PAGES = 4;

const FAST_MS = 8000;
const SLOW_MS = 60000;
const MAIN_CATS = ["女歌手", "男歌手", "其他"];
const OTHER_SUBTAGS = ["台語", "對唱", "團體", "特別", "日", "英", "韓"];
const $ = (id)=>document.getElementById(id);

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
      render();
    };
  });

  $("songSearchBtn")?.addEventListener("click", ()=>renderSongs(true));
  $("songSearch")?.addEventListener("input", debounce(()=>renderSongs(true), 120));
  $("toggleCats")?.addEventListener("click", ()=> $("catPanel")?.classList.toggle("hidden"));
  $("wishForm")?.addEventListener("submit", submitWish);

  syncSlow(true);
  syncFast(true);
  setInterval(()=>syncFast(false), FAST_MS);
  setInterval(()=>syncSlow(false), SLOW_MS);
}

function debounce(fn,ms){ let t=null; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args),ms); }; }
function setStatus(t){ if($("syncStatus")) $("syncStatus").textContent=t; }
function setWishMsg(t){ if($("wishMsg")) $("wishMsg").textContent=t; }

function render(){
  renderStats();
  if(currentPage==="queue") renderQueuePage();
  if(currentPage==="songs"){
    rebuildMainCatChips();
    rebuildSubtagChips();
    renderSongs();
  }
  if(currentPage==="leaderboard") renderLeaderboard();
  if(currentPage==="wishlist") renderWishlist();
}

function renderStats(){
  $("statQueue") && ($("statQueue").textContent = String(queue.length));
  $("statSongs") && ($("statSongs").textContent = String(songs.length));
  $("statPractice") && ($("statPractice").textContent = String(songs.filter(s=>s.practice).length));
}

function renderQueuePage(){
  const box = $("homeQueue");
  if(!box) return;
  if(!queue.length){
    box.innerHTML = `<div class="empty-state">目前還沒有播放清單，去聊天室敲碗第一首吧 ✨</div>`;
    return;
  }
  box.innerHTML = queue.map((q,i)=>{
    const who = q.by ? `🎯 ${esc(q.by)}` : "";
    const sub = esc(q.artist || (q.category==="其他" ? (q.subtag||"") : ""));
    const whoLine = (who && sub) ? `${who} · ${sub}` : (who || sub || "聊天室點歌中");
    return `
      <div class="row">
        <div class="row-left">
          <div class="row-title"><span class="rank">${i+1}</span>${esc(q.title||"")}${q.practice ? " ⭐" : ""}<span class="pill">${esc(q.category||"")}</span></div>
          <div class="row-sub">${whoLine}</div>
        </div>
      </div>`;
  }).join("");
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
  box.innerHTML = "";
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

function makeSongCard(s){
  return `
    <div class="song song-card">
      <div class="song-title">${esc(s.title||"")}${s.practice?` <span class="badge">⭐ 練習中</span>`:""}</div>
      <div class="song-artist">${esc(s.artist || (s.category==="其他" ? (s.subtag||"") : ""))}</div>
      <div class="song-actions">
        <span class="pill">${esc(s.category||"未分類")}</span>
        <span class="pill">播放 ${s.plays||0}</span>
      </div>
    </div>`;
}

function renderSongs(){
  const grid = $("songGrid");
  if(!grid) return;
  if(!songs.length){
    grid.innerHTML = `<div class="empty-state grid-span-all">歌曲載入中…</div>`;
    return;
  }

  const q = ($("songSearch")?.value||"").toLowerCase();
  let list = filterSongsByCategory(songs).sort((a,b)=>(b.plays||0)-(a.plays||0));
  if(q){
    list = list.filter(s=>
      (s.title||"").toLowerCase().includes(q) ||
      (s.artist||"").toLowerCase().includes(q) ||
      (s.subtag||"").toLowerCase().includes(q)
    );
  }

  if(!list.length){
    grid.innerHTML = `<div class="empty-state grid-span-all">沒有符合的歌曲，換個關鍵字試試看～</div>`;
    return;
  }
  grid.innerHTML = list.slice(0, 120).map(makeSongCard).join("");
}

function renderLeaderboard(){
  const box = $("leaderboardList");
  if(!box) return;
  const sorted = [...songs].sort((a,b)=>(b.plays||0)-(a.plays||0));
  const start=(leaderboardPage-1)*LEADERBOARD_PAGE_SIZE;
  const list = sorted.slice(start, start + LEADERBOARD_PAGE_SIZE);
  if(!list.length){
    box.innerHTML = `<div class="empty-state grid-span-all">排行榜還在整理中</div>`;
    renderLeaderboardPager();
    return;
  }
  box.innerHTML = list.map((s,i)=>`
    <div class="song song-card leaderboard-card">
      <div class="song-title"><span class="rank">${start+i+1}</span>${esc(s.title||"")}${s.practice?" ⭐":""}</div>
      <div class="song-artist">${esc(s.artist || (s.category==="其他" ? (s.subtag||"") : ""))}</div>
      <div class="song-actions">
        <span class="pill">${esc(s.category||"")}</span>
        <span class="pill">播放 ${s.plays||0}</span>
      </div>
    </div>`).join("");
  renderLeaderboardPager();
}

function renderWishlist(){
  const box = $("wishList");
  if(!box) return;
  if(!wishlist.length){
    box.innerHTML = `<div class="empty-state grid-span-all">還沒有許願，來當第一個 ✨</div>`;
    return;
  }
  box.innerHTML = wishlist.map(w=>{
    const raw=String(w.text||"");
    const song=raw.includes("|||") ? raw.split("|||").slice(1).join("|||").trim() : raw.trim();
    return `
      <div class="song song-card wish-card">
        <div class="song-title">${esc(song)}</div>
        <div class="song-artist">觀眾許願中</div>
        <div class="song-actions"><span class="pill">${w.ts ? new Date(Number(w.ts||0)).toLocaleString() : "剛剛"}</span></div>
      </div>`;
  }).join("");
}

async function submitWish(e){
  e.preventDefault();
  const name = ($("wishName")?.value||"").trim();
  const song = ($("wishSong")?.value||"").trim();
  if(!song) return setWishMsg("請先填許願歌名");
  try{
    setWishMsg("送出中…");
    await api("addwish", {text:`${name}|||${song}`}, {timeoutMs:12000,retries:1});
    $("wishSong") && ($("wishSong").value="");
    $("wishName") && ($("wishName").value="");
    setWishMsg("已送出許願 ✨");
    await syncSlow(true);
  }catch(e2){
    setWishMsg("送出失敗：" + (e2?.message||String(e2)));
  }
}

async function syncFast(forceRender){
  try{
    const q1 = await api("queue", null, {timeoutMs:10000,retries:1});
    const nextQueue = q1.data || [];
    const sig = JSON.stringify(nextQueue.map(x=>[x.id,x.title,x.by,x.artist,x.category,x.practice]));
    if(sig !== lastQueueSig || forceRender){
      queue = nextQueue;
      lastQueueSig = sig;
      if(forceRender || currentPage==="queue") renderQueuePage();
      renderStats();
    }
    setStatus("已同步："+new Date().toLocaleTimeString());
  }catch(e){
    setStatus("同步失敗");
  }
}

async function syncSlow(forceRender){
  try{
    const [s1,w1] = await Promise.all([
      api("songs", null, {timeoutMs:15000,retries:1}),
      api("wishlist", null, {timeoutMs:15000,retries:1}),
    ]);
    const nextSongs = s1.data || [];
    const nextWish = w1.data || [];
    const songsSig = JSON.stringify(nextSongs.map(x=>[x.id,x.title,x.artist,x.subtag,x.plays,x.practice,x.category]));
    const wishSig = JSON.stringify(nextWish.map(x=>[x.id,x.text,x.ts]));
    if(songsSig !== lastSongsSig || forceRender){
      songs = nextSongs;
      lastSongsSig = songsSig;
      rebuildMainCatChips();
      rebuildSubtagChips();
      if(forceRender || currentPage==="songs") renderSongs();
      if(forceRender || currentPage==="leaderboard") renderLeaderboard();
      renderStats();
    }
    if(wishSig !== lastWishSig || forceRender){
      wishlist = nextWish;
      lastWishSig = wishSig;
      if(forceRender || currentPage==="wishlist") renderWishlist();
    }
    setStatus("已同步："+new Date().toLocaleTimeString());
  }catch(e){
    setStatus("同步失敗");
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
    renderLeaderboard();
  });
}
