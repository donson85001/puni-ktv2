const MAIN = ["女歌手","男歌手","其他"];
const OTHER = ["日","英","韓","RAP","嗨歌","對唱"];
let songs = [];
let queue = [];
let wishlist = [];
let cat = "全部";

const $ = (id)=>document.getElementById(id);

init();

function init(){
  document.querySelectorAll(".nav").forEach(btn=>{
    btn.onclick=()=>{
      document.querySelectorAll(".nav").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      show(btn.dataset.page);
    };
  });

  $("songSearchBtn").onclick=()=>renderSongs($("songSearch").value.trim());
  $("songSearch").addEventListener("keydown", e=>{ if(e.key==="Enter") renderSongs(e.target.value.trim()); });

  $("toggleCats").onclick=()=>{
    const p=$("catPanel");
    p.style.display = (p.style.display==="none" ? "block" : "none");
  };

  $("wishBtn").onclick=submitWish;

  buildCatChips();

  show("home");
  sync(true);
  setInterval(()=>sync(false), 5000);
}

function show(name){
  document.querySelectorAll(".page").forEach(p=>p.classList.add("hidden"));
  $("page-"+name).classList.remove("hidden");
  if(name==="songs") $("catPanel").style.display="block";
}

function buildCatChips(){
  const box=$("catChips");
  box.innerHTML="";
  ["全部",...MAIN,...OTHER].forEach(c=>{
    const b=document.createElement("button");
    b.className="chip " + (c===cat ? "chip-active":"");
    b.textContent=c;
    b.onclick=()=>{ cat=c; buildCatChips(); renderAll(); };
    box.appendChild(b);
  });
}

function applyCat(list){
  if(cat==="全部") return list;
  if(MAIN.includes(cat)) return list.filter(s=>s.category===cat);
  if(OTHER.includes(cat)) return list.filter(s=>s.category===cat);
  return list;
}

async function sync(force){
  $("syncStatus").textContent="同步中…";
  try{
    const [s1,s2,s3] = await Promise.all([
      api("songs"),
      api("queue"),
      api("wishlist"),
    ]);
    songs = (s1.data||s1||[]);
    queue = (s2.data||s2||[]);
    wishlist = (s3.data||s3||[]);
    $("syncStatus").textContent="已同步：" + new Date().toLocaleTimeString();
    renderAll();
  }catch(e){
    $("syncStatus").textContent="同步失敗";
  }
}

function renderAll(){
  renderHomeQueue();
  renderSongs($("songSearch")?.value?.trim()||"");
  renderLeaderboard();
  renderWishlist();
}

function renderHomeQueue(){
  const box=$("homeQueue");
  box.innerHTML = queue.length ? "" : `<div class="muted small">Queue 是空的</div>`;
  queue.slice(0,10).forEach((q,idx)=>{
    const el=document.createElement("div");
    el.className="row";
    el.innerHTML=`
      <div class="row-left">
        <div class="row-title"><span class="rank">${idx+1}</span> ${esc(q.title||"")}${q.practice?" ⭐":""}</div>
        <div class="row-sub">${esc(q.artist||"")}</div>
      </div>
      <div class="row-actions"><span class="pill">Queue</span></div>
    `;
    box.appendChild(el);
  });
}

function renderSongs(query){
  const grid=$("songGrid");
  const q=(query||"").toLowerCase();
  let list = applyCat(songs);
  if(q) list = list.filter(s=>String(s.title||"").toLowerCase().includes(q) || String(s.artist||"").toLowerCase().includes(q));
  grid.innerHTML = list.length ? "" : `<div class="muted small">沒有歌曲</div>`;
  list.forEach(s=>grid.appendChild(songCard(s)));
}

function songCard(s){
  const el=document.createElement("div");
  el.className="song";
  el.innerHTML=`
    <div class="song-title">${esc(s.title||"")}${s.practice?` <span class="badge">⭐ 練習中</span>`:""}</div>
    <div class="song-artist">${esc(s.artist||"")} · <span class="muted">${esc(s.category||"")}</span></div>
    <div class="song-actions">
      <button class="btn btn-mini btn-primary">點歌</button>
      <span class="pill">播放 ${Number(s.plays||0)}</span>
    </div>
  `;
  el.querySelector("button").onclick = async ()=>{
    // 觀眾：進 pending（主播再決定）
    await api("suggest", { songId: s.id, by: "viewer" });
    toast("已送出點歌（待主播確認）");
  };
  return el;
}

async function renderLeaderboard(){
  const box=$("leaderboardList");
  const data = await api("leaderboard").catch(()=>({data:[]}));
  const list = (data.data||data||[]).slice(0,50);

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
        <button class="btn btn-mini btn-primary">點歌</button>
      </div>
    `;
    row.querySelector("button").onclick = async ()=>{
      await api("suggest", { songId: s.id, by: "viewer" });
      toast("已送出點歌（待主播確認）");
    };
    box.appendChild(row);
  });
}

async function submitWish(){
  const name=$("wishName").value.trim() || "匿名";
  const song=$("wishSong").value.trim();
  if(!song) return;
  await api("wish", { text: encodeWish(name, song) });
  $("wishSong").value="";
  toast("已送出許願");
  await sync(true);
}

function renderWishlist(){
  const box=$("wishList");
  box.innerHTML = wishlist.length ? "" : `<div class="muted small">還沒有許願</div>`;
  wishlist.slice(0,50).forEach(w=>{
    const {song} = decodeWish(w.text||"");
    const row=document.createElement("div");
    row.className="row";
    row.innerHTML=`
      <div class="row-left">
        <div class="row-title">${esc(song)}</div>
        <div class="row-sub">${new Date(Number(w.ts||0)).toLocaleString()}</div>
      </div>
      <div class="row-actions"><span class="pill">Wish</span></div>
    `;
    box.appendChild(row);
  });
}
