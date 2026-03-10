let songs = [];
let queue = [];
let wishList = [];
let currentQueueId = '';
let currentPage = 'queue';
let mainCat = '女歌手';
let subCat = '全部';
let leaderboardPage = 1;
const MAIN_CATS = ['女歌手','男歌手','其他'];
const OTHER_SUBTAGS = ['日','英','韓','Rap','情歌對唱','嗨歌/怪歌','舞蹈'];
const MEDALS = ['🥇','🥈','🥉'];
const PAGE_SIZE = 24;
const $ = id => document.getElementById(id);

init();

function init(){
  document.querySelectorAll('.nav').forEach(btn => btn.onclick = () => {
    document.querySelectorAll('.nav').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentPage = btn.dataset.page;
    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
    $('page-' + currentPage)?.classList.remove('hidden');
    renderCurrentPage();
  });

  $('songSearchBtn')?.addEventListener('click', renderSongs);
  $('songSearch')?.addEventListener('input', debounce(renderSongs,120));
  $('toggleCats')?.addEventListener('click', ()=> $('catPanel')?.classList.toggle('hidden'));
  $('wishForm')?.addEventListener('submit', submitWish);

  syncSlow(true);
  syncFast(true);

  setInterval(()=>syncFast(false), 2000);
  setInterval(()=>syncSlow(false), 15000);
}

function setStatus(t){
  if($('syncStatus')) $('syncStatus').textContent = t;
}

function setWishMsg(t){
  if($('wishMsg')) $('wishMsg').textContent = t;
}

/* 只允許一條 current，其餘全部普通 */
function queueState(q, idx){
  const qid = String(q.id || '');
  const cid = String(currentQueueId || '');

  if(cid && qid === cid) return 'current';
  if(q.isCurrent || String(q.status || '') === 'current') return 'current';

  const hasCurrent = queue.some(x =>
    String(x.id || '') === cid ||
    x.isCurrent ||
    String(x.status || '') === 'current'
  );

  if(idx === 0 && !hasCurrent) return 'current';

  return 'pending';
}

function renderCurrentPage(){
  if(currentPage === 'queue') renderQueue();
  if(currentPage === 'songs') renderSongs();
  if(currentPage === 'leaderboard') renderLeaderboard();
  if(currentPage === 'wish') renderWishList();
}

function rebuildMainCatChips(){
  const box = $('mainCatChips');
  if(!box) return;

  box.innerHTML = '';

  MAIN_CATS.forEach(c => {
    const b = document.createElement('button');
    b.className = 'chip ' + (c === mainCat ? 'chip-active' : '');
    b.textContent = c;
    b.onclick = () => {
      mainCat = c;
      subCat = '全部';
      rebuildMainCatChips();
      rebuildSubtagChips();
      renderSongs();
    };
    box.appendChild(b);
  });
}

function buildSingerSubtags(allSongs, category){
  const count = {};

  allSongs
    .filter(s => s.category === category)
    .forEach(s => {
      const a = (s.artist || '').trim();
      if(a) count[a] = (count[a] || 0) + 1;
    });

  return [
    ...Object.keys(count)
      .filter(a => count[a] >= 2)
      .sort((a,b) => a.localeCompare(b,'zh-Hant')),
    '其他(單曲歌手)'
  ];
}

function rebuildSubtagChips(){
  const box = $('catChips');
  if(!box) return;

  box.innerHTML = '';

  let subtags = [];

  if(mainCat === '女歌手' || mainCat === '男歌手'){
    subtags = buildSingerSubtags(songs, mainCat);
  }

  if(mainCat === '其他'){
    subtags = OTHER_SUBTAGS;
  }

  ['全部', ...subtags].forEach(t => {
    const b = document.createElement('button');
    b.className = 'chip ' + (t === subCat ? 'chip-active' : '');
    b.textContent = t;
    b.onclick = () => {
      subCat = t;
      rebuildSubtagChips();
      renderSongs();
    };
    box.appendChild(b);
  });
}

function filterSongsByCategory(list){
  let out = list.filter(s => s.category === mainCat);

  if((mainCat === '女歌手' || mainCat === '男歌手') && subCat !== '全部'){
    if(subCat === '其他(單曲歌手)'){
      const count = {};

      out.forEach(s => {
        const a = (s.artist || '').trim();
        if(a) count[a] = (count[a] || 0) + 1;
      });

      out = out.filter(s => (count[(s.artist || '').trim()] || 0) === 1);
    }else{
      out = out.filter(s => (s.artist || '').trim() === subCat);
    }
  }

  if(mainCat === '其他' && subCat !== '全部'){
    out = out.filter(s => (s.subtag || '') === subCat);
  }

  return out;
}

function renderQueue(){
  const box = $('homeQueue');
  if(!box) return;

  $('statQueue').textContent = String(queue.length || 0);
  $('statSongs').textContent = String(songs.length || 0);
  $('statPractice').textContent = String((songs || []).filter(s => s.practice).length || 0);

  if(!queue.length){
    box.innerHTML = '<div class="empty-state">目前沒有播放清單 ✨</div>';
    return;
  }

  box.innerHTML = queue.map((q,i) => {
    const state = queueState(q,i);
    const badge = state === 'current' ? '<span class="badge badge-now">▶ 現在播放</span>' : '';

    return `
      <div class="queue-row ${state === 'current' ? 'now-playing-row' : ''}">
        <div class="queue-rank">${i+1}</div>
        <div class="queue-main">
          <div class="queue-title-line">
            ${badge}
            <span class="queue-song-name">${esc(q.title || '')}</span>
          </div>
          <div class="queue-meta-line">
            ${esc(q.artist || '')}${q.by ? ' · 點歌：' + esc(q.by) : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function renderSongs(){
  const grid = $('songGrid');
  if(!grid) return;

  if(!songs.length){
    grid.innerHTML = '<div class="empty-state">歌曲載入中…</div>';
    return;
  }

  rebuildMainCatChips();
  rebuildSubtagChips();

  const q = ($('songSearch')?.value || '').trim().toLowerCase();
  let list = filterSongsByCategory(songs).sort((a,b) => (b.plays || 0) - (a.plays || 0));

  if(q){
    list = list.filter(s =>
      String(s.title || '').toLowerCase().includes(q) ||
      String(s.artist || '').toLowerCase().includes(q) ||
      String(s.subtag || '').toLowerCase().includes(q)
    );
  }

  const shown = list.slice(0,120);

  if(!shown.length){
    grid.innerHTML = '<div class="empty-state">沒有歌曲</div>';
    return;
  }

  grid.innerHTML = shown.map(s => `
    <div class="song-card">
      <div class="song-title">
        ${esc(s.title || '')}
        ${s.practice ? ' <span class="badge">⭐ 練習中</span>' : ''}
      </div>
      <div class="song-artist">${esc(s.artist || s.subtag || '')}</div>
      <div class="song-actions">
        <span class="pill">${esc(s.category || '')}</span>
        <span class="pill">播放 ${Number(s.plays || 0)}</span>
      </div>
    </div>
  `).join('');
}

function renderLeaderboard(){
  const box = $('leaderboardList');
  const pager = $('leaderboardPager');
  if(!box || !pager) return;

  const sorted = [...songs].sort((a,b) => (b.plays || 0) - (a.plays || 0));
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));

  if(leaderboardPage > totalPages) leaderboardPage = totalPages;

  const start = (leaderboardPage - 1) * PAGE_SIZE;
  const shown = sorted.slice(start, start + PAGE_SIZE);

  box.innerHTML = shown.map((s,idx) => {
    const rank = start + idx + 1;
    const medal = rank <= 3 ? MEDALS[rank - 1] : `#${rank}`;

    return `
      <div class="song-card">
        <div class="top-ribbon">${medal}</div>
        <div class="song-title">${esc(s.title || '')}</div>
        <div class="song-artist">${esc(s.artist || s.subtag || '')}</div>
        <div class="song-actions">
          <span class="pill">${esc(s.category || '')}</span>
          <span class="pill">播放 ${Number(s.plays || 0)}</span>
        </div>
      </div>
    `;
  }).join('');

  pager.innerHTML = Array.from({length: totalPages}, (_,i) => `
    <button class="btn btn-mini ${i+1 === leaderboardPage ? 'btn-primary' : ''}" data-lb="${i+1}">${i+1}</button>
  `).join('');

  pager.querySelectorAll('[data-lb]').forEach(btn => {
    btn.onclick = () => {
      leaderboardPage = Number(btn.dataset.lb);
      renderLeaderboard();
    };
  });
}

function renderWishList(){
  const box = $('wishList');
  if(!box) return;

  if(!wishList.length){
    box.innerHTML = '<div class="empty-state">還沒有許願</div>';
    return;
  }

  const ordered = [...wishList].reverse();
  box.classList.add('wish-grid','wish-grid-audience');

  box.innerHTML = ordered.map(w => `
    <article class="wish-card wish-card-audience">
      <div class="wish-song">${esc(w.song || '')}</div>
    </article>
  `).join('');
}

async function submitWish(e){
  e.preventDefault();

  const song = ($('wishSong')?.value || '').trim();
  const user = ($('wishUser')?.value || '').trim();

  if(!song){
    setWishMsg('請先輸入歌名');
    return;
  }

  try{
    setWishMsg('送出中…');
    await api('wish_add', { song, user });
    $('wishSong').value = '';
    $('wishUser').value = '';
    setWishMsg('已送到許願池 💖');
    await syncSlow(true);
  }catch(err){
    setWishMsg('送出失敗：' + (err?.message || String(err)));
  }
}

async function syncFast(force){
  try{
    const res = await api('queue');
    queue = res.data || [];
    currentQueueId = String(res.currentQueueId || currentQueueId || '');

    if(force || currentPage === 'queue') renderQueue();
    setStatus('已同步：' + new Date().toLocaleTimeString());
  }catch(e){
    setStatus('同步失敗：' + (e?.message || String(e)));
  }
}

async function syncSlow(force){
  try{
    const [s1,w1] = await Promise.all([
      api('songs'),
      api('wish_list')
    ]);

    songs = s1.data || [];
    wishList = w1.data || [];

    if(force || currentPage === 'songs') renderSongs();
    if(force || currentPage === 'leaderboard') renderLeaderboard();
    if(force || currentPage === 'wish') renderWishList();

    setStatus('已同步：' + new Date().toLocaleTimeString());
  }catch(e){
    setStatus('同步失敗：' + (e?.message || String(e)));
  }
}