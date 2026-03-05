let authed = false;
let songs = [];
let queue = [];
let wishlist = [];
let leader = [];

const $ = (id)=>document.getElementById(id);

init();

function init(){
  $("loginBtn").onclick = login;
  $("pw").addEventListener("keydown", e=>{ if(e.key==="Enter") login(); });

  document.querySelectorAll(".nav").forEach(btn=>{
    btn.onclick=()=>{
      document.querySelectorAll(".nav").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      show(btn.dataset.page);
    };
  });

  $("songSearchBtn").onclick=()=>renderSongs($("songSearch").value.trim());
  $("songSearch").addEventListener("keydown", e=>{ if(e.key==="Enter") renderSongs(e.target.value.trim()); });

  const obs = location.href.replace(/streamer\.html(\?.*)?$/i, "obs.html") + "?limit=10&transparent=1&title=1";
  $("obsUrl").textContent = obs;
}

async function login(){
  const pw = $("pw").value.trim();
  const res = await api("verify", { password: pw }).catch(()=>({ok:false}));
  if(!res.ok){
    $("gateMsg").textContent = "密碼錯誤";
    return;
  }
  authed = true;
  $("gate").style.display="none";
  $("app").style.display="block";
  show("queue");
  await sync(true);
  setInterval(()=>sync(false), 3000);
}

function show(name){
  document.querySelectorAll(".page").forEach(p=>p.classList.add("hidden"));
  $("page-"+name).classList.remove("hidden");
}

async function sync(force){
  if(!authed) return;
  $("syncStatus").textContent="同步中…";
  try{
    const [s1,s2,s3,s4] = await Promise.all([
      api("songs"),
      api("queue"),
      api("wishlist"),
      api("leaderboard"),
    ]);
    songs = (s1.data||s1||[]);
    queue = (s2.data||s2||[]);
    wishlist = (s3.data||s3||[]);
    leader = (s4.data||s4||[]);
    $("syncStatus").textContent="已同步：" + new Date().toLocaleTimeString();
    renderAll();
  }catch(e){
    $("syncStatus").textContent="同步失敗";
  }
}

function renderAll(){
  renderQueue();
  renderSongs($("songSearch")?.value?.trim()||"");
  renderLeaderboard();
  renderWishlist();
}

function renderQueue(){
  const box=$("queueList");
  box.innerHTML = queue.length ? "" : `<div class="muted small">Queue 是空的</div>`;
  queue.forEach((q,idx)=>{
    const row=document.createElement("div");
    row.className="row";
    row.innerHTML=`
      <div class="row-left">
        <div class="row-title"><span class="rank">${idx+1}</span> ${esc(q.title||"")}${q.practice?" ⭐":""} <span class="pill">${esc(q.category||"")}</span></div>
        <div class="row-sub">${esc(q.artist||"")}</div>
      </div>
      <div class="row-actions">
        <button class="btn btn-mini btn-primary">已唱 +1</button>
        <button class="btn btn-mini">移除</button>
      </div>
    `;
    const btns=row.querySelectorAll("button");
    btns[0].onclick=async()=>{ await api("played",{queueId:q.id}); toast("已唱 +1"); await sync(true); };
    btns[1].onclick=async()=>{ await api("removequeue",{queueId:q.id}); toast("已移除"); await sync(true); };
    box.appendChild(row);
  });
}

function renderSongs(query){
  const grid=$("songGrid");
  const q=(query||"").toLowerCase();
  let list = songs;
  if(q) list = list.filter(s=>String(s.title||"").toLowerCase().includes(q) || String(s.artist||"").toLowerCase().includes(q));
  grid.innerHTML = list.length ? "" : `<div class="muted small">沒有歌曲</div>`;
  list.forEach(s=>{
    const el=document.createElement("div");
    el.className="song";
    el.innerHTML=`
      <div class="song-title">${esc(s.title||"")}${s.practice?` <span class="badge">⭐ 練習中</span>`:""}</div>
      <div class="song-artist">${esc(s.artist||"")} · <span class="muted">${esc(s.category||"")}</span></div>
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
    grid.appendChild(el);
  });
}

function renderLeaderboard(){
  const box=$("leaderboardList");
  const list = leader.slice(0,60);
  box.innerHTML = list.length ? "" : `<div class="muted small">沒有資料</div>`;
  list.forEach((s,idx)=>{
    const row=document.createElement("div");
    row.className="row";
    row.innerHTML=`
      <div class="row-left">
        <div class="row-title"><span class="rank">${idx+1}</span> ${esc(s.title||"")}${s.practice?" ⭐":""} <span class="pill">${esc(s.category||"")}</span></div>
        <div class="row-sub">${esc(s.artist||"")}</div>
      </div>
      <div class="row-actions">
        <span class="muted small">${Number(s.plays||0)} 次</span>
        <button class="btn btn-mini btn-primary">加入 Queue</button>
      </div>
    `;
    row.querySelector("button").onclick=async()=>{
      await api("addqueue",{songId:s.id});
      toast("已加入 Queue");
      await sync(true);
    };
    box.appendChild(row);
  });
}

function renderWishlist(){
  const box=$("wishList");
  box.innerHTML = wishlist.length ? "" : `<div class="muted small">還沒有許願</div>`;
  wishlist.slice(0,100).forEach(w=>{
    const {name,song} = decodeWish(w.text||"");
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
      await api("deletewish",{wishId:w.id});
      toast("已刪除");
      await sync(true);
    };
    box.appendChild(row);
  });
}
