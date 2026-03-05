// audience.js (sync never stuck)
// Requires: common.js api(), esc(), toast()

let songs = [];
let queue = [];
let wishlist = [];

const MAIN_CATS = ["女歌手","男歌手","其他"];
const OTHER_SUBTAGS = ["日","英","韓","Rap","情歌對唱","嗨歌/怪歌","舞蹈"];

let mainCat = "女歌手";
let subCat  = "全部";

const $ = (id) => document.getElementById(id);

// 防止重疊同步
let syncing = false;

init();

function init() {
  document.querySelectorAll(".nav").forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll(".nav").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      const p = btn.dataset.page;
      document.querySelectorAll(".page").forEach((x) => x.classList.add("hidden"));
      $("page-" + p).classList.remove("hidden");

      if (p === "songs") $("catPanel").style.display = "block";
    };
  });

  $("songSearchBtn").onclick = renderSongs;
  $("songSearch").addEventListener("input", renderSongs);
  $("songSearch").addEventListener("keydown", (e) => { if (e.key === "Enter") renderSongs(); });

  $("toggleCats").onclick = () => {
    const p = $("catPanel");
    p.style.display = p.style.display === "none" ? "block" : "none";
  };

  $("wishBtn").onclick = sendWish;

  rebuildMainCatChips();

  sync();
  setInterval(sync, 5000);
}

/* ===== 分類 chips ===== */

function rebuildMainCatChips() {
  const panel = $("catPanel");

  let wrap = panel.querySelector("[data-maincats='1']");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.dataset.maincats = "1";
    wrap.className = "panel-body";
    wrap.style.marginBottom = "10px";
    panel.insertBefore(wrap, panel.firstChild);
  }
  wrap.innerHTML = "";

  MAIN_CATS.forEach((c) => {
    const b = document.createElement("button");
    b.className = "chip " + (c === mainCat ? "chip-active" : "");
    b.textContent = c;
    b.onclick = () => {
      mainCat = c;
      subCat = "全部";
      rebuildMainCatChips();
      rebuildSubtagChips();
      renderSongs();
    };
    wrap.appendChild(b);
  });

  rebuildSubtagChips();
}

function buildSingerSubtags(allSongs, category) {
  const list = allSongs.filter((s) => s.category === category);
  const count = {};
  for (const s of list) {
    const a = (s.artist || "").trim();
    if (!a) continue;
    count[a] = (count[a] || 0) + 1;
  }
  const multi = Object.keys(count).filter((a) => count[a] >= 2).sort((a,b)=>a.localeCompare(b,"zh-Hant"));
  return [...multi, "其他(單曲歌手)"];
}

function rebuildSubtagChips() {
  const box = $("catChips");
  box.innerHTML = "";

  let subtags = [];
  if (mainCat === "女歌手" || mainCat === "男歌手") subtags = buildSingerSubtags(songs, mainCat);
  if (mainCat === "其他") subtags = OTHER_SUBTAGS;

  ["全部", ...subtags].forEach((t) => {
    const b = document.createElement("button");
    b.className = "chip " + (t === subCat ? "chip-active" : "");
    b.textContent = t;
    b.onclick = () => {
      subCat = t;
      rebuildSubtagChips();
      renderSongs();
    };
    box.appendChild(b);
  });
}

function filterSongsByCategory(allSongs) {
  let list = allSongs.filter((s) => s.category === mainCat);

  if (mainCat === "女歌手" || mainCat === "男歌手") {
    if (subCat !== "全部") {
      if (subCat === "其他(單曲歌手)") {
        const cnt = {};
        for (const s of list) {
          const a = (s.artist || "").trim();
          if (!a) continue;
          cnt[a] = (cnt[a] || 0) + 1;
        }
        list = list.filter((s) => (cnt[(s.artist || "").trim()] || 0) === 1);
      } else {
        list = list.filter((s) => (s.artist || "").trim() === subCat);
      }
    }
  }

  if (mainCat === "其他") {
    if (subCat !== "全部") list = list.filter((s) => (s.subtag || "") === subCat);
  }

  return list;
}

/* ===== Render ===== */

function renderSongs() {
  const grid = $("songGrid");
  const q = ($("songSearch").value || "").trim().toLowerCase();

  let list = filterSongsByCategory(songs);

  // 播放次數多的在上
  list.sort((a,b)=>(b.plays||0)-(a.plays||0));

  if (q) {
    list = list.filter((s) => {
      const t = String(s.title || "").toLowerCase();
      const a = String(s.artist || "").toLowerCase();
      const st = String(s.subtag || "").toLowerCase();
      return t.includes(q) || a.includes(q) || st.includes(q);
    });
  }

  grid.innerHTML = list.length ? "" : `<div class="muted small">沒有歌曲</div>`;

  list.forEach((s) => {
    const el = document.createElement("div");
    el.className = "song";
    el.innerHTML = `
      <div class="song-title">${esc(s.title||"")}${s.practice?` <span class="badge">⭐ 練習中</span>`:""}</div>
      <div class="song-artist">${mainCat==="其他" ? `<span class="muted">${esc(s.subtag||"")}</span>` : esc(s.artist||"")}</div>
      <div class="song-actions">
        <button class="btn btn-mini btn-primary">點歌</button>
        <span class="pill">播放 ${Number(s.plays||0)}</span>
      </div>
    `;
    el.querySelector("button").onclick = async () => {
     await api("addqueue", { songId: s.id });
      toast("已送出點歌（待主播通過）");
    };
    grid.appendChild(el);
  });
}

function renderLeaderboard() {
  const box = $("leaderboardList");
  box.innerHTML = "";

  const sorted = [...songs].sort((a,b)=>(b.plays||0)-(a.plays||0)).slice(0,50);
  if (!sorted.length) { box.innerHTML = `<div class="muted small">沒有資料</div>`; return; }

  sorted.forEach((s, idx) => {
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `
      <div class="row-left">
        <div class="row-title"><span class="rank">${idx+1}</span> ${esc(s.title||"")}${s.practice?" ⭐":""} <span class="pill">${esc(s.category||"")}</span></div>
        <div class="row-sub">${esc(s.artist || (s.category==="其他" ? (s.subtag||"") : ""))}</div>
      </div>
      <div class="row-actions">
        <span class="pill">播放 ${Number(s.plays||0)}</span>
        <button class="btn btn-mini btn-primary">點歌</button>
      </div>
    `;
    row.querySelector("button").onclick = async () => {
      await api("addqueue", { songId: s.id, by: "觀眾" });
      toast("已送出點歌（待主播通過）");
    };
    box.appendChild(row);
  });
}

function renderHomeQueue() {
  const box = $("homeQueue");
  box.innerHTML = queue.length ? "" : `<div class="muted small">Queue 是空的</div>`;
  queue.slice(0,10).forEach((q, idx) => {
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `
      <div class="row-left">
        <div class="row-title"><span class="rank">${idx+1}</span> ${esc(q.title||"")}${q.practice?" ⭐":""}</div>
        <div class="row-sub">${esc(q.artist || (q.category==="其他" ? (q.subtag||"") : ""))}</div>
      </div>
    `;
    box.appendChild(row);
  });
}

function renderWishlist() {
  const box = $("wishList");
  box.innerHTML = wishlist.length ? "" : `<div class="muted small">還沒有許願</div>`;

  wishlist.slice(0,50).forEach((w) => {
    const raw = String(w.text || "");
    const song = raw.includes("|||") ? raw.split("|||").slice(1).join("|||").trim() : raw.trim();
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `
      <div class="row-left">
        <div class="row-title">${esc(song)}</div>
        <div class="row-sub">${new Date(Number(w.ts||0)).toLocaleString()}</div>
      </div>
    `;
    box.appendChild(row);
  });
}

async function sendWish() {
  const name = ($("wishName").value || "").trim() || "匿名";
  const song = ($("wishSong").value || "").trim();
  if (!song) return;

  await api("wish", { text: `${name}|||${song}` });
  $("wishSong").value = "";
  toast("已送出許願");
  await sync();
}

/* ===== Sync (never stuck) ===== */

async function sync() {
  if (syncing) return;
  syncing = true;

  $("syncStatus").textContent = "同步中…";
  try {
    const [s1, s2, s3] = await Promise.all([
      api("songs", null, { timeoutMs: 10000, retries: 1 }),
      api("queue", null, { timeoutMs: 10000, retries: 1 }),
      api("wishlist", null, { timeoutMs: 10000, retries: 1 }),
    ]);

    songs = s1.data || [];
    queue = s2.data || [];
    wishlist = s3.data || [];

    rebuildMainCatChips();
    renderSongs();
    renderLeaderboard();
    renderHomeQueue();
    renderWishlist();

    $("syncStatus").textContent = "已同步：" + new Date().toLocaleTimeString();
  } catch (e) {
    $("syncStatus").textContent = "同步失敗：" + (e && e.message ? e.message : String(e));
  } finally {
    syncing = false;
  }
}
