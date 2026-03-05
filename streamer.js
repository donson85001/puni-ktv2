// streamer.js (GET only)

let authed = false;

let songs = [];
let queue = [];
let pending = [];
let wishlist = [];

const MAIN_CATS = ["女歌手","男歌手","其他"];
const OTHER_SUBTAGS = ["日","英","韓","Rap","情歌對唱","嗨歌/怪歌","舞蹈"];

let mainCat = "女歌手";
let subCat = "全部";

const $ = (id) => document.getElementById(id);

init();

function init(){
  $("loginBtn").onclick = login;
  $("pw").addEventListener("keydown", (e)=>{ if(e.key==="Enter") login(); });

  document.querySelectorAll(".nav").forEach((btn)=>{
    btn.onclick = ()=>{
      document.querySelectorAll(".nav").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      show(btn.dataset.page);

      if(btn.dataset.page==="songs") $("catPanel").style.display="block";
    };
  });

  $("songSearchBtn").onclick = renderSongs;
  $("songSearch").addEventListener("input", renderSongs);

  $("toggleCats").onclick = ()=>{
    const p = $("catPanel");
    p.style.display = p.style.display==="none" ? "block" : "none";
  };
}

async function login(){
  const pw = ($("pw").value||"").trim();
  const r = await api("verify",{password:pw}).catch(()=>({ok:false}));
  if(!r.ok){
    $("gateMsg").textContent="密碼錯誤或後端未部署成功";
    return;
  }

  authed = true;
  $("gate").style.display="none";
  $("app").style.display="block";

  rebuildMainCatChips();
  await sync();
  setInterval(sync, 3000);
}

function show(name){
  document.querySelectorAll(".page").forEach(p=>p.classList.add("hidden"));
  $("page-"+name).classList.remove("hidden");
}

/* ===== 分類 chips ===== */

function rebuildMainCatChips(){
  const panel = $("catPanel");
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

/* ===== Render ===== */

function renderQueue(){
  const box = $("queueList");
  box.innerHTML = queue.length ? "" : `<div class="muted small">Queue 是空的</div>`;

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
    btns[0].onclick=async()=>{ await api("played",{queueId:q.id}); toast("已唱 +1"); await sync(); };
    btns[1].onclick=async()=>{ await api("removequeue",{queueId:q.id}); toast("已移除"); await sync(); };
    box.appendChild(row);
  });
}

function renderPending(){
  const box = $("pendingList");
  box.innerHTML = pending.length ? "" : `<div class="muted small">沒有待通過</div>`;

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
    row.querySelector("button").onclick=async()=>{ await api("approve",{pendingId:p.id}); toast("已通過"); await sync(); };
    box.appendChild(row);
  });
}

function renderSongs(){
  const grid=$("songGrid");
  const q=($("songSearch").value||"").trim().toLowerCase();

  let list=filterSongsByCategory(songs);

  // ✅ 依播放次數排序：多的在上
  list.sort((a,b)=>(b.plays||0)-(a.plays||0));

  if(q){
    list=list.filter(s=>{
      const t=String(s.title||"").toLowerCase();
      const a=String(s.artist||"").toLowerCase();
      const st=String(s.subtag||"").toLowerCase();
      return t.includes(q)||a.includes(q)||st.includes(q);
    });
  }

  grid.innerHTML=list.length?"":`<div class="muted small">沒有歌曲</div>`;

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
    el.querySelector("button").onclick=async()=>{ await api("addqueue",{songId:s.id}); toast("已加入 Queue"); await sync(); };
    grid.appendChild(el);
  });
}

function renderLeaderboard(){
  const box=$("leaderboardList");
  box.innerHTML="";

  const sorted=[...songs].sort((a,b)=>(b.plays||0)-(a.plays||0)).slice(0,60);
  if(!sorted.length){ box.innerHTML=`<div class="muted small">沒有資料</div>`; return; }

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
    row.querySelector("button").onclick=async()=>{ await api("addqueue",{songId:s.id}); toast("已加入 Queue"); await sync(); };
    box.appendChild(row);
  });
}

function renderWishlist(){
  const box=$("wishList");
  box.innerHTML = wishlist.length ? "" : `<div class="muted small">還沒有許願</div>`;

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
    box.appendChild(row);
  });
}

/* ===== Sync ===== */

async function sync(){
  if(!authed) return;
  $("syncStatus").textContent="同步中…";
  try{
    const [s1,s2,s3,s4] = await Promise.all([
      api("songs"),
      api("queue"),
      api("pending"),
      api("wishlist")
    ]);

    songs = s1.data || [];
    queue = s2.data || [];
    pending = s3.data || [];
    wishlist = s4.data || [];

    rebuildMainCatChips();
    renderQueue();
    renderPending();
    renderSongs();
    renderLeaderboard();
    renderWishlist();

    $("syncStatus").textContent="已同步："+new Date().toLocaleTimeString();
  }catch(e){
    $("syncStatus").textContent="同步失敗";
  }
}
