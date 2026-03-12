function normalizeWishSong(s){return String(s||'').replace(/　/g,' ').replace(/\s+/g,' ').trim().toLowerCase();}

let songs = [];
let queue = [];
let wishList = [];
let currentQueueId = '';
let currentPage = 'queue';
let mainCat = '女歌手';
let subCat = '全部';
let leaderboardPage = 1;
let lastQueueSignature = '';
const MAIN_CATS = ['女歌手','男歌手','其他'];
const OTHER_SUBTAGS = ['日','英','韓','Rap','情歌對唱','嗨歌/怪歌','舞蹈'];
const MEDALS = ['🥇','🥈','🥉'];
const PAGE_SIZE = 24;
const $ = id => document.getElementById(id);

document.addEventListener('DOMContentLoaded',init);

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
function getQueueSignature(list, currentId){
  return JSON.stringify({
    currentId: String(currentId || ''),
    items: (list || []).map(q => ({
      id: String(q.id || ''),
      title: String(q.title || ''),
      artist: String(q.artist || ''),
      by: String(q.by || ''),
      status: String(q.status || ''),
      isCurrent: !!q.isCurrent
    }))
  });
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


function fitQueueSongNames(scope=document){
  const rows = scope.querySelectorAll('.queue-row');

  rows.forEach(row=>{
    const holder = row.querySelector('.queue-song-name');
    const text = row.querySelector('.queue-song-text');
    if(!holder || !text) return;

    holder.style.removeProperty('--mq-x');
    text.style.removeProperty('font-size');
    text.style.whiteSpace = 'nowrap';

    if(row.classList.contains('now-playing-row')) return;

    let size = 24;
    const lenClass = holder.classList.contains('qlen-3') ? 'qlen-3' : holder.classList.contains('qlen-2') ? 'qlen-2' : '';
    if(lenClass === 'qlen-2') size = 21;
    if(lenClass === 'qlen-3') size = 18;

    const min = 11;
    text.style.fontSize = size + 'px';

    while(text.scrollWidth > holder.clientWidth && size > min){
      size -= 1;
      text.style.fontSize = size + 'px';
    }
  });
}

function stopMarqueeHolder(holder){
  if(!holder) return;

  if(holder._stopMarquee){
    holder._stopMarquee();
    holder._stopMarquee = null;
  }

  if(holder._mqRaf){
    cancelAnimationFrame(holder._mqRaf);
    holder._mqRaf = null;
  }

  holder.removeAttribute('data-marquee');
  holder.classList.remove('is-marquee-active');

  const originalText = String(holder.dataset.marqueeText || holder.textContent || '').trim();
  holder.style.removeProperty('--mq-x');
  holder.innerHTML = `<span class="queue-song-text">${esc(originalText)}</span>`;
}

function runHorizontalMarquee(holder, options){
  if(!holder) return false;

  const {
    textClass,
    speed = 70,
    varName = '--mq-x',
    onlyWhenOverflow = false,
  } = options || {};

  const plainText = holder.querySelector(`.${textClass}`);
  if(!plainText) return false;

  const holderWidth = Math.ceil(holder.clientWidth || 0);
  const textWidth = Math.ceil(plainText.scrollWidth || 0);

  if(!holderWidth || !textWidth) return false;
  if(onlyWhenOverflow && textWidth <= holderWidth) return false;

  const originalText = String(holder.dataset.marqueeText || plainText.textContent || '').trim();

  holder.classList.add('is-marquee-active');
  holder.setAttribute('data-marquee', 'on');

  // 改成只放一份文字，完整滑完再重來
  holder.innerHTML = `
    <span class="queue-song-track">
      <span class="${textClass}">${esc(originalText)}</span>
    </span>
  `;

  const track = holder.querySelector('.queue-song-track');
  if(!track) return false;

  let offset = holderWidth;      // 從容器右邊外面開始
  let lastTs = null;
  let running = true;
  const resetPoint = -textWidth; // 整條文字完全離開左邊才重置

  function tick(ts){
    if(!running) return;

    if(lastTs == null) lastTs = ts;
    const dt = Math.max(0, (ts - lastTs) / 1000);
    lastTs = ts;

    offset -= speed * dt;

    if(offset <= resetPoint){
      offset = holderWidth;
    }

    holder.style.setProperty(varName, `${offset}px`);
    holder._mqRaf = requestAnimationFrame(tick);
  }

  holder.style.setProperty(varName, `${offset}px`);
  holder._mqRaf = requestAnimationFrame(tick);

  holder._stopMarquee = () => {
    running = false;
    if(holder._mqRaf){
      cancelAnimationFrame(holder._mqRaf);
      holder._mqRaf = null;
    }
  };

  return true;
}

function applyNowPlayingMarquee(scope=document){
  const rows = scope.querySelectorAll('.queue-row');

  rows.forEach(row=>{
    const holder = row.querySelector('.queue-song-name');
    if(!holder) return;

    const originalText = String(row.dataset.title || holder.textContent || '').trim();
    holder.dataset.marqueeText = originalText;
    stopMarqueeHolder(holder);

    if(!row.classList.contains('now-playing-row')) return;

runHorizontalMarquee(holder, {
  textClass: 'queue-song-text',
  speed: 70,
  varName: '--mq-x',
  onlyWhenOverflow: false,
});
  });
}

function scheduleMarqueeRefresh(scope=document){
  requestAnimationFrame(()=>{
    requestAnimationFrame(()=>{
      fitQueueSongNames(scope);
      applyNowPlayingMarquee(scope);
    });
  });

  if(document.fonts && document.fonts.ready){
    document.fonts.ready.then(()=>{
      requestAnimationFrame(()=>{
        fitQueueSongNames(scope);
        applyNowPlayingMarquee(scope);
      });
    }).catch(()=>{});
  }
}

window.addEventListener('resize', debounce(()=>{
  fitQueueSongNames(document);
  applyNowPlayingMarquee(document);
}, 120));


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

    const rawTitle = String(q.title || '');
    const titleLenClass =
      rawTitle.length >= 18 ? 'qlen-3' :
      rawTitle.length >= 11 ? 'qlen-2' : '';

    return `
      <div class="queue-row ${state === 'current' ? 'now-playing-row' : ''}" data-title="${esc(rawTitle)}">
        <div class="queue-rank">${i+1}</div>
        <div class="queue-main">
          <div class="queue-title-line">
            ${badge}
            <span class="queue-song-name ${titleLenClass}">
              <span class="queue-song-text">${esc(rawTitle)}</span>
            </span>
          </div>
          <div class="queue-meta-line">
            ${esc(q.artist || '')}${q.by ? ' · 點歌：' + esc(q.by) : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');

  fitQueueSongNames(box);
  scheduleMarqueeRefresh(box);
lastQueueSignature = getQueueSignature(queue, currentQueueId);
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
  if(!song){ setWishMsg('請先輸入歌名'); return; }

  const normalized = normalizeWishSong(song);
  const duplicated = (wishList||[]).some(w=>normalizeWishSong(w.song)===normalized);
  if(duplicated){ setWishMsg('許願池已有這首歌囉 💡'); return; }

  try{
    setWishMsg('送出中…');
    await api('wish_add',{song,user});
    $('wishSong').value=''; $('wishUser').value='';
    setWishMsg('已送到許願池 💖');
    await syncSlow(true);
  }catch(err){
    setWishMsg('送出失敗：'+(err?.message||String(err)));
  }
}

async function syncFast(force){
  try{
    const res = await api('queue');

    const newQueue = res.data || [];
    const newCurrentQueueId = String(res.currentQueueId || '');

    const newSignature = getQueueSignature(newQueue, newCurrentQueueId);
    const changed = newSignature !== lastQueueSignature;

    queue = newQueue;
    currentQueueId = newCurrentQueueId || currentQueueId || '';

    if(force || (currentPage === 'queue' && changed)){
      renderQueue();
      lastQueueSignature = newSignature;
    }

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