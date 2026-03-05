/* ===== 狀態 ===== */

let songs = [];
let queue = [];
let wishlist = [];

const MAIN_CATS = ["女歌手","男歌手","其他"];
const OTHER_SUBTAGS = ["日","英","韓","Rap","情歌對唱","嗨歌/怪歌","舞蹈"];

let mainCat = "女歌手";
let subCat = "全部";

/* ===== 工具 ===== */

function esc(s){
  return String(s||"").replace(/[&<>"]/g,a=>({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;"
  }[a]));
}

function toast(msg){
  console.log(msg);
}

/* ===== 初始化 ===== */

function init(){

  /* sidebar 切頁 */
  document.querySelectorAll(".nav").forEach(btn=>{
    btn.onclick=()=>{
      document.querySelectorAll(".nav").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");

      const p=btn.dataset.page;
      document.querySelectorAll(".page").forEach(x=>x.classList.add("hidden"));
      document.getElementById("page-"+p).classList.remove("hidden");
    };
  });

  /* 搜尋 */
  document.getElementById("songSearchBtn").onclick=renderSongs;
  document.getElementById("songSearch").oninput=renderSongs;

  /* 顯示/隱藏分類 */
  document.getElementById("toggleCats").onclick=()=>{
    const p=document.getElementById("catPanel");
    p.style.display=p.style.display==="none"?"block":"none";
  };

  /* 許願 */
  document.getElementById("wishBtn").onclick=sendWish;

  injectMainCatButtons();

  sync();

  setInterval(sync,5000);
}

/* ===== 大分類按鈕 ===== */

function injectMainCatButtons(){

  const panel=document.getElementById("catPanel");

  const old=panel.querySelector(".maincats");
  if(old) old.remove();

  const wrap=document.createElement("div");
  wrap.className="maincats";
  wrap.style.marginBottom="10px";

  MAIN_CATS.forEach(c=>{
    const b=document.createElement("button");
    b.className="chip "+(c===mainCat?"chip-active":"");
    b.textContent=c;

    b.onclick=()=>{
      mainCat=c;
      subCat="全部";
      injectMainCatButtons();
      rebuildSubtagChips();
      renderSongs();
    };

    wrap.appendChild(b);
  });

  panel.prepend(wrap);
}

/* ===== 子分類 ===== */

function buildSingerSubtags(allSongs,category){

  const list=allSongs.filter(s=>s.category===category);

  const count={};

  for(const s of list){
    const a=(s.artist||"").trim();
    if(!a) continue;
    count[a]=(count[a]||0)+1;
  }

  const multi=Object.keys(count)
    .filter(a=>count[a]>=2)
    .sort((a,b)=>a.localeCompare(b,"zh-Hant"));

  return [...multi,"其他(單曲歌手)"];
}

function rebuildSubtagChips(){

  const box=document.getElementById("catChips");
  box.innerHTML="";

  let subtags=[];

  if(mainCat==="女歌手"||mainCat==="男歌手")
    subtags=buildSingerSubtags(songs,mainCat);

  if(mainCat==="其他")
    subtags=OTHER_SUBTAGS;

  const all=["全部",...subtags];

  all.forEach(t=>{

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

/* ===== 分類過濾 ===== */

function filterSongs(list){

  let out=list.filter(s=>s.category===mainCat);

  if(mainCat==="女歌手"||mainCat==="男歌手"){

    if(subCat!=="全部"){

      if(subCat==="其他(單曲歌手)"){

        const cnt={};

        for(const s of out){
          const a=(s.artist||"").trim();
          if(!a) continue;
          cnt[a]=(cnt[a]||0)+1;
        }

        out=out.filter(s=>(cnt[(s.artist||"").trim()]||0)===1);

      }else{

        out=out.filter(s=>(s.artist||"").trim()===subCat);

      }
    }
  }

  if(mainCat==="其他"){

    if(subCat!=="全部")
      out=out.filter(s=>(s.subtag||"")===subCat);

  }

  return out;
}

/* ===== 畫歌曲 ===== */

function renderSongs(){

  const grid=document.getElementById("songGrid");

  const q=(document.getElementById("songSearch").value||"")
  .toLowerCase();

  let list=filterSongs(songs);

  if(q){

    list=list.filter(s=>
      (s.title||"").toLowerCase().includes(q) ||
      (s.artist||"").toLowerCase().includes(q)
    );

  }

  grid.innerHTML="";

  if(!list.length){
    grid.innerHTML=`<div class="muted small">沒有歌曲</div>`;
    return;
  }

  list.forEach(s=>{

    const el=document.createElement("div");
    el.className="song";

    el.innerHTML=`
      <div class="song-title">
        ${esc(s.title)}
        ${s.practice?` ⭐`:``}
      </div>

      <div class="song-artist">
        ${mainCat==="其他"
          ? esc(s.subtag||"")
          : esc(s.artist||"")}
      </div>

      <button class="btn btn-primary btn-mini">
        點歌
      </button>
    `;

    el.querySelector("button").onclick=async()=>{
      await api("suggest",{songId:s.id,by:"viewer"});
      toast("已送出點歌");
    };

    grid.appendChild(el);

  });
}

/* ===== 排行榜 ===== */

function renderLeaderboard(){

  const box=document.getElementById("leaderboardList");
  box.innerHTML="";

  const sorted=[...songs]
  .sort((a,b)=>(b.plays||0)-(a.plays||0))
  .slice(0,50);

  sorted.forEach((s,i)=>{

    const el=document.createElement("div");
    el.className="list-item";

    el.innerHTML=`
      <span class="rank">${i+1}</span>
      ${esc(s.title)} - ${esc(s.artist)}
      <span class="muted">(${s.plays||0})</span>
      <button class="btn btn-mini btn-primary">點歌</button>
    `;

    el.querySelector("button").onclick=async()=>{
      await api("suggest",{songId:s.id,by:"viewer"});
      toast("已送出點歌");
    };

    box.appendChild(el);

  });
}

/* ===== 播放清單 ===== */

function renderQueue(){

  const box=document.getElementById("homeQueue");
  box.innerHTML="";

  queue.forEach((q,i)=>{

    const el=document.createElement("div");
    el.className="list-item";

    el.innerHTML=`
      <span class="rank">${i+1}</span>
      ${esc(q.title)}
    `;

    box.appendChild(el);

  });
}

/* ===== 許願池 ===== */

async function sendWish(){

  const name=document.getElementById("wishName").value.trim()||"匿名";
  const song=document.getElementById("wishSong").value.trim();

  if(!song) return;

  await api("wish",{text:name+"|||"+song});

  document.getElementById("wishSong").value="";

}

function renderWish(){

  const box=document.getElementById("wishList");
  box.innerHTML="";

  wishlist.forEach(w=>{

    const raw=w.text||"";
    const song=raw.includes("|||") ? raw.split("|||")[1] : raw;

    const el=document.createElement("div");
    el.className="list-item";

    el.textContent=song;

    box.appendChild(el);

  });
}

/* ===== 同步 ===== */

async function sync(){

  try{

    const s1=await api("songs");
    songs=s1.data||s1||[];

    const s2=await api("queue");
    queue=s2.data||s2||[];

    const s3=await api("wishlist");
    wishlist=s3.data||s3||[];

    rebuildSubtagChips();
    renderSongs();
    renderLeaderboard();
    renderQueue();
    renderWish();

    document.getElementById("syncStatus").textContent="同步成功";

  }catch(e){

    document.getElementById("syncStatus").textContent="同步失敗";

  }

}

init();
