// audience.js

let songs = [];
let queue = [];
let wishlist = [];

let currentPage = "home";

const FAST_MS = 2000;
const SLOW_MS = 25000;

const $ = (id)=>document.getElementById(id);

init();

function init(){

  document.querySelectorAll(".nav").forEach(btn=>{
    btn.onclick=()=>{
      document.querySelectorAll(".nav").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");

      currentPage = btn.dataset.page;

      document.querySelectorAll(".page").forEach(p=>p.classList.add("hidden"));
      $("page-"+currentPage).classList.remove("hidden");

      render();
    };
  });

  $("songSearchBtn")?.addEventListener("click", renderSongs);
  $("songSearch")?.addEventListener("input", debounce(renderSongs,120));

  $("wishBtn")?.addEventListener("click", sendWish);

  syncSlow(true);
  syncFast(true);

  setInterval(()=>syncFast(false), FAST_MS);
  setInterval(()=>syncSlow(false), SLOW_MS);
}

function debounce(fn,ms){
  let t=null;
  return (...args)=>{
    clearTimeout(t);
    t=setTimeout(()=>fn(...args),ms);
  };
}

function setStatus(t){
  $("syncStatus").textContent=t;
}

function render(){
  if(currentPage==="home") renderHome();
  if(currentPage==="songs") renderSongs();
  if(currentPage==="leaderboard") renderLeaderboard();
  if(currentPage==="wishlist") renderWishlist();
}

/* -------------------- */
/* HOME */
/* -------------------- */

function renderHome(){

  const box = $("homeQueue");

  if(!queue.length){
    box.innerHTML = `<div class="muted small">目前沒有播放清單</div>`;
    return;
  }

  const frag = document.createDocumentFragment();

  queue.forEach((q,i)=>{

    const row = document.createElement("div");
    row.className="row";

    const who = q.by ? `🎯 ${q.by}` : "";

    const sub = q.artist || (q.category==="其他" ? (q.subtag||"") : "");

    row.innerHTML=`
      <div class="row-left">
        <div class="row-title">
          <span class="rank">${i+1}</span>
          ${esc(q.title||"")}
          ${q.practice?" ⭐":""}
          <span class="pill">${esc(q.category||"")}</span>
        </div>
        <div class="row-sub">
          ${who}
          ${who && sub ? " · " : ""}
          ${esc(sub)}
        </div>
      </div>
    `;

    frag.appendChild(row);
  });

  box.replaceChildren(frag);
}

/* -------------------- */
/* SONGS */
/* -------------------- */

function renderSongs(){

  const grid = $("songGrid");
  const q = ($("songSearch")?.value||"").toLowerCase();

  let list = [...songs];

  if(q){
    list = list.filter(s=>{
      return (
        (s.title||"").toLowerCase().includes(q) ||
        (s.artist||"").toLowerCase().includes(q) ||
        (s.subtag||"").toLowerCase().includes(q)
      );
    });
  }

  list.sort((a,b)=> (b.plays||0)-(a.plays||0));

  const frag = document.createDocumentFragment();

  list.forEach(s=>{

    const el=document.createElement("div");
    el.className="song";

    el.innerHTML=`
      <div class="song-title">
        ${esc(s.title||"")}
        ${s.practice?`<span class="badge">⭐ 練習中</span>`:""}
      </div>

      <div class="song-artist">
        ${esc(s.artist || (s.category==="其他" ? (s.subtag||"") : ""))}
      </div>

      <div class="song-actions">
        <button class="btn btn-mini btn-primary">點歌</button>
        <span class="pill">播放 ${s.plays||0}</span>
      </div>
    `;

    el.querySelector("button").onclick=async()=>{
      await api("addqueue",{songId:s.id,by:"觀眾"});
      await syncFast(true);
    };

    frag.appendChild(el);
  });

  grid.replaceChildren(frag);
}

/* -------------------- */
/* LEADERBOARD */
/* -------------------- */

function renderLeaderboard(){

  const box = $("leaderboardList");

  const list=[...songs].sort((a,b)=>(b.plays||0)-(a.plays||0));

  const frag = document.createDocumentFragment();

  list.forEach((s,i)=>{

    const row=document.createElement("div");
    row.className="song";

    row.innerHTML=`
      <div class="song-title">
        <span class="rank">${i+1}</span>
        ${esc(s.title)}
        ${s.practice?" ⭐":""}
      </div>

      <div class="song-artist">
        ${esc(s.artist || (s.category==="其他" ? (s.subtag||"") : ""))}
      </div>

      <div class="song-actions">
        <button class="btn btn-mini btn-primary">點歌</button>
        <span class="pill">播放 ${s.plays||0}</span>
      </div>
    `;

    row.querySelector("button").onclick=async()=>{
      await api("addqueue",{songId:s.id,by:"觀眾"});
      await syncFast(true);
    };

    frag.appendChild(row);
  });

  box.replaceChildren(frag);
}

/* -------------------- */
/* WISHLIST */
/* -------------------- */

function renderWishlist(){

  const box=$("wishList");

  if(!wishlist.length){
    box.innerHTML=`<div class="muted small">目前沒有許願</div>`;
    return;
  }

  const frag=document.createDocumentFragment();

  wishlist.forEach(w=>{

    const raw = String(w.text||"");

    const name = raw.includes("|||") ? raw.split("|||")[0] : "";
    const song = raw.includes("|||") ? raw.split("|||")[1] : raw;

    const row=document.createElement("div");
    row.className="row";

    row.innerHTML=`
      <div class="row-left">
        <div class="row-title">${esc(song)}</div>
        <div class="row-sub">許願者：${esc(name)}</div>
      </div>
    `;

    frag.appendChild(row);
  });

  box.replaceChildren(frag);
}

async function sendWish(){

  const name = $("wishName").value.trim();
  const song = $("wishSong").value.trim();

  if(!song) return;

  const text = `${name}|||${song}`;

  await api("wish",{text});

  $("wishSong").value="";

  await syncSlow(true);
}

/* -------------------- */
/* SYNC */
/* -------------------- */

async function syncFast(forceRender){

  try{

    const q1 = await api("queue");

    queue = q1.data || [];

    if(forceRender || currentPage==="home") renderHome();

    setStatus("已同步："+new Date().toLocaleTimeString());

  }catch(e){

    setStatus("同步失敗");

  }
}

async function syncSlow(forceRender){

  try{

    const s1 = await api("songs");
    const w1 = await api("wishlist");

    songs = s1.data || [];
    wishlist = w1.data || [];

    if(forceRender) render();

  }catch(e){

    setStatus("同步失敗");

  }
}

/* -------------------- */

function esc(s){
  return String(s||"").replace(/[&<>"]/g,a=>({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;"
  }[a]));
}
