let currentQueueId = '';
let lastQueueFingerprint = '';
let lastRenderedCurrentQueueId = '';
let authed = false;
let currentPage = 'queue';
let songs = [];
let queue = [];
let wishList = [];
let settings = { obs_limit: 30 };
let mainCat = '全部';
let subCat = '全部';
let leaderboardPage = 1;
let queueActionBusy = false;
let bulkPlayedBusy = false;
let fastSyncInFlight = false;
let slowSyncInFlight = false;
let fastSyncQueued = false;
let slowSyncQueued = false;
const MAIN_CATS = ['全部','女歌手','男歌手','其他'];
const OTHER_SUBTAGS = ['日','英','韓','Rap','情歌對唱','嗨歌/怪歌','舞蹈'];
const OBS_LIMITS = [5,10,15,20,25,30];
const OBS_PAGE_SIZE = 15;
const MEDALS = ['🥇','🥈','🥉'];
const LEADERBOARD_PAGE_SIZE = 24;
const FAST_MS = 2000;
const SLOW_MS = 12000;
const LS_AUTH = 'puni_streamer_authed';
const $ = id => document.getElementById(id);
const LIVE_BUS_NAME = 'puni_live_bus_v1';
const LIVE_BUS_KEY = 'puni_live_bus_payload_v1';
const liveBus = ('BroadcastChannel' in window) ? new BroadcastChannel(LIVE_BUS_NAME) : null;


function emitLiveEvent(type, payload = {}) {
  const packet = {
    type,
    payload,
    ts: Date.now()
  };

  try {
    liveBus?.postMessage(packet);
  } catch (_) {}

  try {
    localStorage.setItem(LIVE_BUS_KEY, JSON.stringify(packet));
  } catch (_) {}
}
init();

function init(){
  $('loginBtn')?.addEventListener('click', login);
  $('pw')?.addEventListener('keydown', e=>{
    if(e.key==='Enter') login();
  });
  $('logoutBtn')?.addEventListener('click', logout);
  $('songSearchBtn')?.addEventListener('click', renderSongs);
  $('songSearch')?.addEventListener('input', debounce(renderSongs,120));
  $('toggleCats')?.addEventListener('click', ()=> $('catPanel')?.classList.toggle('hidden'));
  $('copyObsUrlBtn1')?.addEventListener('click', ()=>copyObsUrl(1));
  $('copyObsUrlBtn2')?.addEventListener('click', ()=>copyObsUrl(2));
  $('openObsUrlBtn1')?.addEventListener('click', ()=>openObsUrl(1));
  $('openObsUrlBtn2')?.addEventListener('click', ()=>openObsUrl(2));
  $('bulkPlayedBtn')?.addEventListener('click', bulkPlayedQueue);
  $('bulkRemoveBtn')?.addEventListener('click', bulkRemoveQueue);

  document.querySelectorAll('.nav').forEach(btn=>btn.addEventListener('click', ()=>{
    document.querySelectorAll('.nav').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    currentPage = btn.dataset.page;
    document.querySelectorAll('.page').forEach(p=>p.classList.add('hidden'));
    $('page-'+currentPage)?.classList.remove('hidden');
    renderCurrentPage();
  }));

  buildObsControls();
  updateObsUrl();

  if(localStorage.getItem(LS_AUTH)==='1') enterApp();
}

function setStatus(t){
  if($('syncStatus')) $('syncStatus').textContent=t;
}

function setGateMsg(t){
  if($('gateMsg')) $('gateMsg').textContent=t;
}


function setBulkLoading(isLoading, label=''){
  const btn = $('bulkPlayedBtn');
  if(!btn) return;
  btn.disabled = !!isLoading || queueActionBusy;
  btn.textContent = isLoading ? (label || '處理中…') : '一鍵全部 +1';
}

function appendBulkLog(message){
  const box = $('bulkLog') || $('bulkLogList') || $('bulkLogBox');
  if(!box) return;

  const line = `[${new Date().toLocaleTimeString('zh-TW', { hour12:false })}] ${message}`;

  if(box.tagName === 'TEXTAREA'){
    box.value = line + "\n" + box.value;
    return;
  }

  const row = document.createElement('div');
  row.textContent = line;
  box.prepend(row);
}

function lockQueueActions(){
  queueActionBusy = true;

  document.querySelectorAll('[data-remove],[data-played],[data-current],[data-up],[data-down]').forEach(btn=>{
    btn.disabled = true;
  });

  const bulkRemoveBtn = $('bulkRemoveBtn');
  if(bulkRemoveBtn) bulkRemoveBtn.disabled = true;

  setBulkLoading(bulkPlayedBusy, bulkPlayedBusy ? '處理中…' : '一鍵全部 +1');
}

function unlockQueueActions(){
  queueActionBusy = false;

  const bulkRemoveBtn = $('bulkRemoveBtn');
  if(bulkRemoveBtn) bulkRemoveBtn.disabled = false;

  setBulkLoading(bulkPlayedBusy, bulkPlayedBusy ? '處理中…' : '一鍵全部 +1');
  renderQueue();
}

/* 只保留一條 current，其餘全部普通樣式 */
function queueState(q, idx){
  const qid = String(q.id || '');
  const currentId = String(currentQueueId || '');

  if(currentId && qid === currentId) return 'current';
  if(q.isCurrent || String(q.status || '') === 'current') return 'current';

  const hasCurrent = queue.some(x =>
    String(x.id || '') === currentId ||
    x.isCurrent ||
    String(x.status || '') === 'current'
  );

  if(idx === 0 && !hasCurrent) return 'current';

  return 'pending';
}
function getCurrentQueueIndex(list, fallbackCurrentId = currentQueueId){
  const currentId = String(fallbackCurrentId || '');

  if(currentId){
    const exactIdx = list.findIndex(x => String(x.id || '') === currentId);
    if(exactIdx >= 0) return exactIdx;
  }

  const flaggedIdx = list.findIndex(x =>
    x.isCurrent || String(x.status || '') === 'current'
  );
  if(flaggedIdx >= 0) return flaggedIdx;

  return list.length ? 0 : -1;
}

function getQueueItemForFinish(list, fallbackCurrentId = currentQueueId){
  const idx = getCurrentQueueIndex(list, fallbackCurrentId);
  if(idx < 0 || !list[idx]) return null;
  return {
    idx,
    item: list[idx]
  };
}

function getQueueItemById(list, queueId){
  const id = String(queueId || '');
  const idx = list.findIndex(x => String(x.id || '') === id);
  if(idx < 0 || !list[idx]) return null;
  return {
    idx,
    item: list[idx]
  };
}
async function login(){
  const pw=($('pw')?.value||'').trim();

  if(!pw) return setGateMsg('請輸入密碼');

  try{
    const res=await api('verify',{password:pw});
    if(!res.ok) return setGateMsg('密碼錯誤');

    localStorage.setItem(LS_AUTH,'1');
    enterApp();
  }catch(e){
    setGateMsg('登入失敗：'+(e?.message||String(e)));
  }
}

function logout(){
  localStorage.removeItem(LS_AUTH);
  authed=false;
  $('app').style.display='none';
  $('gate').style.display='grid';
}

function enterApp(){
  authed = true;
  $('gate').style.display = 'none';
  $('app').style.display = 'block';

  // 跟觀眾頁一樣，先各自啟動同步
  syncSlow(true);
  syncFast(true);

  setInterval(()=>{
    if(authed) syncFast(false);
  }, FAST_MS);

  setInterval(()=>{
    if(authed) syncSlow(false);
  }, SLOW_MS);
}

function renderCurrentPage(){
  if(currentPage==='queue') renderQueue();
  if(currentPage==='songs') renderSongs();
  if(currentPage==='leaderboard') renderLeaderboard();
  if(currentPage==='wish') renderWishList();
}

function rebuildMainCatChips(){
  const box=$('mainCatChips');
  if(!box) return;

  box.innerHTML='';

  MAIN_CATS.forEach(c=>{
    const b=document.createElement('button');
    b.className='chip ' + (c===mainCat?'chip-active':'');
    b.textContent=c;
    b.onclick=()=>{
      mainCat=c;
      subCat='全部';
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
      if (a) count[a] = (count[a] || 0) + 1;
    });

  return [
    ...Object.keys(count)
      .filter(a => count[a] >= 2)
      .sort((a, b) => a.localeCompare(b, 'zh-Hant')),
    '其他(單曲歌手)'
  ];
}

function rebuildSubtagChips(){
  const box = $('catChips');
  if (!box) return;

  box.innerHTML = '';

  // 大分類是「全部」時，小分類整塊直接隱藏
  if (mainCat === '全部') {
    subCat = '全部';
    box.classList.add('hidden');
    return;
  }

  box.classList.remove('hidden');

  let subtags = [];
  if (mainCat === '女歌手' || mainCat === '男歌手') {
    subtags = buildSingerSubtags(songs, mainCat);
  } else if (mainCat === '其他') {
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
  let out;

  if (mainCat === '全部') {
    out = [...list];
  } else {
    out = list.filter(s => s.category === mainCat);
  }

  if ((mainCat === '女歌手' || mainCat === '男歌手') && subCat !== '全部') {
    if (subCat === '其他(單曲歌手)') {
      const count = {};
      out.forEach(s => {
        const a = (s.artist || '').trim();
        if (a) count[a] = (count[a] || 0) + 1;
      });
      out = out.filter(s => (count[(s.artist || '').trim()] || 0) === 1);
    } else {
      out = out.filter(s => (s.artist || '').trim() === subCat);
    }
  }

  if (mainCat === '其他' && subCat !== '全部') {
    out = out.filter(s => (s.subtag || '') === subCat);
  }

  return out;
}
function fitQueueSongNames(scope=document){
  const rows = scope.querySelectorAll('.queue-row');

  rows.forEach(row=>{
    const holder = row.querySelector('.queue-song-name');
    const text = row.querySelector('.queue-song-text');
    if(!holder || !text) return;

    holder.classList.remove('is-marquee-active');
    holder.style.removeProperty('--mq-x');
    text.style.removeProperty('font-size');
    text.style.whiteSpace = 'nowrap';

    if(row.classList.contains('now-playing-row')) return;

    let size = 26;
    const min = 12;
    text.style.fontSize = size + 'px';

    while(text.scrollWidth > holder.clientWidth && size > min){
      size -= 1;
      text.style.fontSize = size + 'px';
    }
  });
}

function stopMarqueeHolder(holder, baseClass){
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
  holder.classList.remove('is-marquee-active', 'marquee-holder', 'obs-marquee-holder');
  holder.style.removeProperty('--mq-x');
  holder.style.removeProperty('--obs-mq-x');

  if(baseClass === 'queue-song-text'){
    const originalText = String(holder.dataset.marqueeText || holder.textContent || '').trim();
    holder.innerHTML = `<span class="queue-song-text">${esc(originalText)}</span>`;
  }else if(baseClass === 'obs-title-text'){
    const originalText = String(holder.dataset.marqueeText || holder.textContent || '').trim();
    holder.innerHTML = `<span class="obs-title-text">${esc(originalText)}</span>`;
  }
}

















function runHorizontalMarquee(holder, options){
  if(!holder) return false;

  const {
    textClass,
    trackClass = 'queue-song-track',
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

  holder.innerHTML = `
    <span class="${trackClass}">
      <span class="${textClass}">${esc(originalText)}</span>
    </span>
  `;

  const track = holder.querySelector(`.${trackClass}`);
  if(!track) return false;

  let offset = holderWidth;
  let lastTs = null;
  let running = true;
  const resetPoint = -textWidth;

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
    stopMarqueeHolder(holder, 'queue-song-text');

    if(!row.classList.contains('now-playing-row')) return;

    runHorizontalMarquee(holder, {
      textClass: 'queue-song-text',
      trackClass: 'queue-song-track',
      speed: 70,
      varName: '--mq-x',
      onlyWhenOverflow: false,
    });
  });
}

function applyObsTitleMarquee(scope=document){
  const rows = scope.querySelectorAll('.obs-item');

  rows.forEach(row=>{
    const holder = row.querySelector('.obs-title');
    if(!holder) return;

    const originalText = String(row.dataset.title || holder.textContent || '').trim();
    holder.dataset.marqueeText = originalText;
    stopMarqueeHolder(holder, 'obs-title-text');

    if(!row.classList.contains('is-current')) return;

    runHorizontalMarquee(holder, {
      textClass: 'obs-title-text',
      trackClass: 'obs-title-track',
      speed: 54,
      varName: '--obs-mq-x',
      onlyWhenOverflow: false,
    });
  });
}

function scheduleMarqueeRefresh(scope=document){
  requestAnimationFrame(()=>{
    requestAnimationFrame(()=>{
      applyNowPlayingMarquee(scope);
      applyObsTitleMarquee(scope);
    });
  });

  if(document.fonts && document.fonts.ready){
    document.fonts.ready.then(()=>{
      requestAnimationFrame(()=>{
        applyNowPlayingMarquee(scope);
        applyObsTitleMarquee(scope);
      });
    }).catch(()=>{});
  }
}

function makeQueueFingerprint(list){
  return JSON.stringify((list || []).map((q, i)=>({
    i,
    id: String(q.id || ''),
    title: String(q.title || ''),
    artist: String(q.artist || ''),
    by: String(q.by || ''),
    isCurrent: !!q.isCurrent,
    status: String(q.status || '')
  })));
}

function renderQueue(){
  const box=$('queueList');
  if(!box) return;

  if(!queue.length){
    box.innerHTML='<div class="empty-state">Queue 是空的 ✨</div>';
    lastQueueFingerprint = makeQueueFingerprint(queue);
    lastRenderedCurrentQueueId = String(currentQueueId || '');
    return;
  }

  box.innerHTML=queue.map((q,i)=>{
    const state=queueState(q,i);
    const who=q.by ? `點歌：${esc(q.by)}` : '';
    const current = state==='current';
    const ytQuery = encodeURIComponent(`${q.title||''} ${q.artist||''}`.trim());

    const rawTitle = String(q.title || '');
    const titleLenClass =
      rawTitle.length >= 18 ? 'qlen-3' :
      rawTitle.length >= 11 ? 'qlen-2' : '';

    return `
      <div class="queue-row ${current ? 'now-playing-row' : ''}" data-title="${esc(rawTitle)}">
        <div class="queue-rank">${i+1}</div>
        <div class="queue-main">
          <div class="queue-title-line">
            ${current?'<span class="badge badge-now">▶</span>':''}
            <span class="queue-song-name ${titleLenClass}"><span class="queue-song-text">${esc(rawTitle)}</span></span>
            <span class="pill">${esc(q.artist||'')}</span>
          </div>
          <div class="queue-meta-line">${who}</div>
        </div>
        <div class="queue-actions">
          <button class="btn btn-mini btn-primary btn-icon" title="設成現在播放" data-current="${esc(q.id)}" ${current || queueActionBusy ? 'disabled':''}>▶</button>
          <button class="btn btn-mini btn-yt" title="搜尋 YouTube" data-yt="${ytQuery}">YT</button>
          <button class="btn btn-mini" data-up="${esc(q.id)}" ${queueActionBusy ? 'disabled':''}>▲</button>
          <button class="btn btn-mini" data-down="${esc(q.id)}" ${queueActionBusy ? 'disabled':''}>▼</button>
          <button class="btn btn-mini btn-primary" data-played="${esc(q.id)}" ${queueActionBusy ? 'disabled':''}>單首 +1</button>
          <button class="btn btn-mini btn-danger" data-remove="${esc(q.id)}" ${queueActionBusy ? 'disabled':''}>移除</button>
        </div>
      </div>
    `;
  }).join('');

  box.querySelectorAll('[data-current]').forEach(btn=>{
    btn.onclick = async () => {
      if(queueActionBusy){
        alert('目前有其他播放清單操作進行中，請稍候。');
        return;
      }

      const nextId = String(btn.dataset.current || '');
      const prevId = String(currentQueueId || '');

      if(!nextId || nextId === prevId) return;

      try{
        lockQueueActions();
        btn.disabled = true;

        // 先改本機畫面，讓「現在播放」立刻反應
        currentQueueId = nextId;
        renderQueue();

        // 通知同機 audience / obs 立即更新
        emitLiveEvent('current', { queueId: nextId });

        // 再送後端
        const res = await api('setcurrent', { queueId: nextId });
        if(!res || res.ok === false){
          throw new Error(res?.error || 'setcurrent failed');
        }

        // 最後做輕同步
        await syncFast(true);
      }catch(e){
        currentQueueId = prevId;
        renderQueue();
        emitLiveEvent('current', { queueId: prevId });
        alert('設成現在播放失敗：' + (e?.message || String(e)));
      }finally{
        unlockQueueActions();
      }
    };
  });

  box.querySelectorAll('[data-yt]').forEach(btn=>{
    btn.onclick=()=>{
      window.open(`https://www.youtube.com/results?search_query=${btn.dataset.yt}`, '_blank');
    };
  });

  box.querySelectorAll('[data-up]').forEach(btn=>{
    btn.onclick=async()=>{
      if(queueActionBusy){
        alert('目前有其他播放清單操作進行中，請稍候。');
        return;
      }

      try{
        lockQueueActions();
        await api('movequeue',{queueId:btn.dataset.up,direction:'up'});
        await syncFast(true);
      }catch(e){
        alert('上移失敗：' + (e?.message || String(e)));
      }finally{
        unlockQueueActions();
      }
    };
  });

  box.querySelectorAll('[data-down]').forEach(btn=>{
    btn.onclick=async()=>{
      if(queueActionBusy){
        alert('目前有其他播放清單操作進行中，請稍候。');
        return;
      }

      try{
        lockQueueActions();
        await api('movequeue',{queueId:btn.dataset.down,direction:'down'});
        await syncFast(true);
      }catch(e){
        alert('下移失敗：' + (e?.message || String(e)));
      }finally{
        unlockQueueActions();
      }
    };
  });

  

  box.querySelectorAll('[data-played]').forEach(btn=>{
    btn.onclick = async () => {
      if(queueActionBusy){
        alert('目前有其他播放清單操作進行中，請稍候。');
        return;
      }

      const id = String(btn.dataset.played || '').trim();
      if(!id) return;

      try{
        lockQueueActions();
        btn.disabled = true;

        // 先抓最新 queue，避免用到舊畫面資料
        await syncFast(true);

        const found = getQueueItemById(queue, id);
        if(!found?.item){
          throw new Error('找不到這首歌，可能已被其他頁面處理');
        }

        const { item, idx } = found;
        const currentIdx = getCurrentQueueIndex(queue);
        const isCurrentItem = idx === currentIdx;

        setStatus(`單首 +1 處理中：${item.title || id}`);

        const res = await api(
          'finishqueue',
          { queueId: id },
          { timeoutMs: 15000, retries: 2 }
        );

        if(!res || res.ok === false){
          throw new Error(res?.error || 'finishqueue failed');
        }

        // 完成後再同步，不要先在前端刪歌
        await syncFast(true);

        // 成功後才通知其他頁面刷新
        emitLiveEvent('queue-touch');

        // 如果完成的是現在播放那首，就把目前 current 一起通知出去
        if(isCurrentItem){
          emitLiveEvent('current', { queueId: String(currentQueueId || '') });
        }

        setStatus(`單首 +1 完成：${item.title || '已完成'}`);
      }catch(e){
        await syncFast(true).catch(()=>{});
        alert('單首 +1 失敗：' + (e?.message || String(e)));
      }finally{
        unlockQueueActions();
      }
    };
  });

  box.querySelectorAll('[data-remove]').forEach(btn=>{
    btn.onclick=async()=>{
      if(queueActionBusy){
        alert('目前有其他播放清單操作進行中，請稍候。');
        return;
      }

      try{
        lockQueueActions();
        await api('removequeue',{queueId:btn.dataset.remove});
        await syncFast(true);
      }catch(e){
        alert('移除失敗：' + (e?.message || String(e)));
      }finally{
        unlockQueueActions();
      }
    };
  });

  fitQueueSongNames(box);
  scheduleMarqueeRefresh(box);
  lastQueueFingerprint = makeQueueFingerprint(queue);
  lastRenderedCurrentQueueId = String(currentQueueId || '');
}


function makeSongCard(s){
  return `
    <div class="song-card">
      <div class="song-title">
        ${esc(s.title || '')}${s.practice ? ' <span class="badge">⭐ 練習中</span>' : ''}
      </div>
      <div class="song-artist">${esc(s.artist || s.subtag || '')}</div>
      <div class="song-actions">
        <span class="pill">${esc(s.category || '')}</span>
        <span class="pill">播放 ${Number(s.plays || 0)}</span>
        <button class="btn btn-mini btn-primary" data-songid="${esc(s.id)}">加入 Queue</button>
      </div>
    </div>
  `;
}

function wireSongButtons(scope=document){
  scope.querySelectorAll('[data-songid]').forEach(btn=>{
    btn.onclick = async()=>{
      const songId = btn.dataset.songid;
      if(!songId) return;

      try{
        btn.disabled = true;
        setStatus('加入 Queue 中…');

        const res = await api('queue_add', { songId });
        if(!res || res.ok === false){
          throw new Error(res?.error || 'queue_add failed');
        }

        emitLiveEvent('queue-touch');
        await syncFast(true);
        setStatus('已加入 Queue');
      }catch(e){
        alert('加入 Queue 失敗：' + (e?.message || String(e)));
      }finally{
        btn.disabled = false;
      }
    };
  });
}


function renderSongs(){
  const grid=$('songGrid');
  if(!grid) return;

if(!songs.length){
  rebuildMainCatChips();
  rebuildSubtagChips();
  grid.innerHTML = '<div class="empty-state">歌曲載入中…</div>';
  return;
}

  rebuildMainCatChips();
  rebuildSubtagChips();

  const q=($('songSearch')?.value||'').trim().toLowerCase();
  let list=filterSongsByCategory(songs).sort((a,b)=>(b.plays||0)-(a.plays||0));

  if(q){
    list=list.filter(s=>
      String(s.title||'').toLowerCase().includes(q) ||
      String(s.artist||'').toLowerCase().includes(q) ||
      String(s.subtag||'').toLowerCase().includes(q)
    );
  }

  const shown=list.slice(0,120);

  grid.innerHTML=shown.length
    ? shown.map(makeSongCard).join('')
    : '<div class="empty-state">沒有歌曲</div>';

  wireSongButtons(grid);
}

function renderLeaderboard(){
  const box=$('leaderboardList');
  const pager=$('leaderboardPager');
  if(!box||!pager) return;

  const sorted=[...songs].sort((a,b)=>(b.plays||0)-(a.plays||0));
  const totalPages=Math.max(1,Math.ceil(sorted.length/LEADERBOARD_PAGE_SIZE));

  if(leaderboardPage>totalPages) leaderboardPage=totalPages;

  const start=(leaderboardPage-1)*LEADERBOARD_PAGE_SIZE;
  const shown=sorted.slice(start,start+LEADERBOARD_PAGE_SIZE);

  box.innerHTML=shown.map((s,idx)=>{
    const rank=start+idx+1;
    const medal=rank<=3?MEDALS[rank-1]:`#${rank}`;

    return `
      <div class="song-card">
        <div class="top-ribbon">${medal}</div>
        <div class="song-title">${esc(s.title||'')}</div>
        <div class="song-artist">${esc(s.artist || s.subtag || '')}</div>
        <div class="song-actions">
          <span class="pill">${esc(s.category||'')}</span>
          <span class="pill">播放 ${Number(s.plays||0)}</span>
          <button class="btn btn-mini btn-primary" data-songid="${esc(s.id)}">加入 Queue</button>
        </div>
      </div>
    `;
  }).join('');

  pager.innerHTML = Array.from({length:totalPages},(_,i)=>`
    <button class="btn btn-mini ${i+1===leaderboardPage?'btn-primary':''}" data-lb="${i+1}">${i+1}</button>
  `).join('');

  pager.querySelectorAll('[data-lb]').forEach(btn=>{
    btn.onclick=()=>{
      leaderboardPage=Number(btn.dataset.lb);
      renderLeaderboard();
    };
  });

  wireSongButtons(box);
}

function getTaipeiPartsFromDate(value){
  const d = new Date(value);
  if(Number.isNaN(d.getTime())) return null;

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(d);

  const map = {};
  parts.forEach(p => {
    if(p.type !== 'literal') map[p.type] = p.value;
  });

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second)
  };
}

function parseWishDate(dateValue, timeValue){
  const rawDate = String(dateValue || '').trim();
  const rawTime = String(timeValue || '').trim();

  if(!rawDate && !rawTime) return null;

  let year = 0;
  let month = 0;
  let day = 0;
  let hour = 0;
  let minute = 0;
  let second = 0;

  // 1) 日期：先處理 Apps Script / Sheet 送來的 ISO 字串
  if(rawDate.includes('T')){
    const p = getTaipeiPartsFromDate(rawDate);
    if(p){
      year = p.year;
      month = p.month;
      day = p.day;
    }
  }

  // 2) 日期：一般 yyyy/MM/dd 或 yyyy-MM-dd
  if(!year || !month || !day){
    const ymd = rawDate.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if(ymd){
      year = Number(ymd[1]);
      month = Number(ymd[2]);
      day = Number(ymd[3]);
    }
  }

  // 3) 時間：先處理 ISO 字串（例如 1899-12-30T15:21:58.000Z）
  if(rawTime.includes('T')){
    const p = getTaipeiPartsFromDate(rawTime);
    if(p){
      hour = p.hour;
      minute = p.minute;
      second = p.second;
    }
  }

  // 4) 時間：中文 上午/下午
  if(rawTime && hour === 0 && minute === 0 && second === 0){
    const zhTime = rawTime.match(/(上午|下午)\s*(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if(zhTime){
      hour = Number(zhTime[2]);
      minute = Number(zhTime[3]);
      second = Number(zhTime[4] || 0);

      if(zhTime[1] === '下午' && hour < 12) hour += 12;
      if(zhTime[1] === '上午' && hour === 12) hour = 0;
    }
  }

  // 5) 時間：一般 HH:mm:ss
  if(rawTime && hour === 0 && minute === 0 && second === 0){
    const normalTime = rawTime.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if(normalTime){
      hour = Number(normalTime[1]);
      minute = Number(normalTime[2]);
      second = Number(normalTime[3] || 0);
    }
  }

  if(year && month && day){
    return { year, month, day, hour, minute, second };
  }

  return null;
}

function formatWishDateTime(dateValue, timeValue){
  const d = parseWishDate(dateValue, timeValue);
  if(!d) return '';

  const month = String(d.month).padStart(2, '0');
  const day = String(d.day).padStart(2, '0');

  let hour = Number(d.hour || 0);
  const minute = String(d.minute || 0).padStart(2, '0');

  const period = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12 || 12;

  return `${month}/${day}・${period} ${hour}:${minute}`;
}

function renderWishList(){
  const box=$('wishList');
  if(!box) return;

  if(!wishList.length){
    box.innerHTML='<div class="empty-state">還沒有許願</div>';
    return;
  }

  const ordered=[...wishList].reverse();
  box.classList.add('wish-grid');

  box.innerHTML=ordered.map(w=>`
    <article class="wish-card streamer-wish-card">
      <div class="wish-card-top">
        <span class="wish-time">${esc(formatWishDateTime(w.date, w.time))}</span>
      </div>
      <div class="wish-song">${esc(w.song||'')}</div>
      <div class="wish-user">許願者：${esc(w.user || '匿名')}</div>
      <div class="wish-card-actions">
        <button class="btn btn-mini btn-danger" data-delwish="${esc(w.id)}">刪除</button>
      </div>
    </article>
  `).join('');

  box.querySelectorAll('[data-delwish]').forEach(btn=>{
    btn.onclick=async()=>{
      await api('wish_remove',{id:btn.dataset.delwish});
      await syncSlow(true);
    };
  });
}

async function syncFast(force){
  if(fastSyncInFlight){
    if(force) fastSyncQueued = true;
    return;
  }

  fastSyncInFlight = true;

  try{
    const q1 = await api('queue', null, { timeoutMs: 25000, retries: 2 });
    const newQueue = q1.data || [];
    const newCurrentQueueId = String(q1.currentQueueId || currentQueueId || '');
    const newFingerprint = makeQueueFingerprint(newQueue);
    const queueChanged = newFingerprint !== lastQueueFingerprint;
    const currentChanged = newCurrentQueueId !== lastRenderedCurrentQueueId;

    queue = newQueue;
    currentQueueId = newCurrentQueueId;

    if(!queueActionBusy && (force || (currentPage === 'queue' && (queueChanged || currentChanged)))){
      renderQueue();
      lastQueueFingerprint = newFingerprint;
      lastRenderedCurrentQueueId = newCurrentQueueId;
    }

    setStatus('已同步：' + new Date().toLocaleTimeString());
  }catch(e){
    setStatus('同步失敗：' + (e?.message || String(e)));
  }finally{
    fastSyncInFlight = false;
    if(fastSyncQueued){
      fastSyncQueued = false;
      syncFast(false);
    }
  }
}

async function syncSlow(force){
  if(slowSyncInFlight){
    if(force) slowSyncQueued = true;
    return;
  }

  slowSyncInFlight = true;

  let slowError = null;

  try{
    try{
      const s1 = await api('songs', null, { timeoutMs: 30000, retries: 2 });
      songs = Array.isArray(s1) ? s1 : (Array.isArray(s1?.data) ? s1.data : []);
    }catch(e){
      slowError = 'songs：' + (e?.message || String(e));
      songs = [];
    }

    try{
      const w1 = await api('wish_list', null, { timeoutMs: 30000, retries: 2 });
      wishList = Array.isArray(w1) ? w1 : (Array.isArray(w1?.data) ? w1.data : []);
    }catch(e){
      if(!slowError) slowError = 'wish_list：' + (e?.message || String(e));
      wishList = [];
    }

    try{
      const st = await api('settings', null, { timeoutMs: 25000, retries: 2 });
      const settingsData =
        (st && typeof st === 'object' && !Array.isArray(st))
          ? (st.data && typeof st.data === 'object' ? st.data : st)
          : {};

      settings = {
        obs_limit: Number(settingsData.obs_limit || 30),
        ...settingsData
      };
    }catch(e){
      if(!slowError) slowError = 'settings：' + (e?.message || String(e));
      settings = { obs_limit: 30 };
    }

    if(!OBS_LIMITS.includes(Number(settings.obs_limit))) settings.obs_limit = 30;

    buildObsControls();
    updateObsUrl();

    if(force || currentPage === 'songs') renderSongs();
    if(force || currentPage === 'leaderboard') renderLeaderboard();
    if(force || currentPage === 'wish') renderWishList();

    if(slowError){
      setStatus('部分同步失敗：' + slowError);
      return;
    }

    setStatus('已同步：' + new Date().toLocaleTimeString());
  }finally{
    slowSyncInFlight = false;
    if(slowSyncQueued){
      slowSyncQueued = false;
      syncSlow(false);
    }
  }
}

async function syncAll(force){
  await syncSlow(force);
  await syncFast(force);
}

function buildObsControls(){
  const box=$('obsLimitControls');
  if(!box) return;

  const limit=Number(settings?.obs_limit||30);

  box.innerHTML='';

  OBS_LIMITS.forEach(n=>{
    const b=document.createElement('button');
    b.className='chip ' + (n===limit?'chip-active':'');
    b.textContent=`${n} 首`;
    b.onclick=async()=>{
      try{
        await api('setobslimit',{limit:n});
      }catch(e){}
      settings.obs_limit=n;
      buildObsControls();
      updateObsUrl();
    };
    box.appendChild(b);
  });
}

function getObsUrl(page=1){
  return new URL(`obs.html?title=1&transparent=1&page=${page}`, location.href).href;
}

function updateObsUrl(){
  const box1=$('obsUrl1');
  const box2=$('obsUrl2');

  if(box1) box1.textContent=getObsUrl(1);
  if(box2) box2.textContent=getObsUrl(2);
}

async function copyObsUrl(page){
  const text=getObsUrl(page);
  await navigator.clipboard.writeText(text);

  const msg=$(`copyObsMsg${page}`);
  if(msg){
    msg.textContent='已複製';
    setTimeout(()=>{
      msg.textContent='';
    },1500);
  }
}

function openObsUrl(page){
  window.open(getObsUrl(page), '_blank');
}

async function bulkPlayedQueue(){
  if(queueActionBusy){
    alert('目前有其他播放清單操作進行中，請稍候。');
    return;
  }

  if(bulkPlayedBusy){
    alert('一鍵全部 +1 還在處理中，請等目前這次完成。');
    return;
  }

  await syncFast(true);

  if(!queue.length){
    alert('目前 Queue 是空的，沒有可以 +1 的歌曲。');
    return;
  }

  let success = 0;
  let failed = 0;
  const initialTotal = queue.length;
  const maxSteps = initialTotal + 5; // 防呆，避免異常狀況卡死 loop

  bulkPlayedBusy = true;
  lockQueueActions();
  setBulkLoading(true, `處理中 0/${initialTotal}`);
  setStatus(`一鍵全部 +1 處理中：0/${initialTotal}`);
  appendBulkLog(`開始一鍵全部 +1，共 ${initialTotal} 首`);

  try{
    let processed = 0;

    while(processed < maxSteps){
      await syncFast(true);

      if(!queue.length){
        break;
      }

      const target = getQueueItemForFinish(queue);
      if(!target?.item){
        appendBulkLog('停止：目前找不到可處理的 current / queue 項目');
        break;
      }

      const item = target.item;
      const qid = String(item.id || '').trim();
      const title = item.title || `第 ${processed + 1} 首`;

      if(!qid){
        failed++;
        processed++;
        appendBulkLog(`略過：${title}（缺少 queueId）`);
        setBulkLoading(true, `處理中 ${processed}/${initialTotal}`);
        setStatus(`一鍵全部 +1 處理中：${processed}/${initialTotal}`);
        break;
      }

      try{
        const res = await api(
          'finishqueue',
          { queueId: qid },
          { timeoutMs: 15000, retries: 2 }
        );

        if(!res || res.ok === false){
          throw new Error(res?.error || 'finishqueue failed');
        }

        success++;
        processed++;
        appendBulkLog(`完成：${title}`);
      }catch(err){
        failed++;
        processed++;
        appendBulkLog(`失敗：${title}｜${err?.message || String(err)}`);
        setBulkLoading(true, `處理中 ${processed}/${initialTotal}`);
        setStatus(`一鍵全部 +1 處理中：${processed}/${initialTotal}`);
        break;
      }

      setBulkLoading(true, `處理中 ${processed}/${initialTotal}`);
      setStatus(`一鍵全部 +1 處理中：${processed}/${initialTotal}`);
    }

    await syncFast(true);
    emitLiveEvent('queue-touch');
    emitLiveEvent('current', { queueId: String(currentQueueId || '') });

    setStatus(`一鍵全部 +1 完成：成功 ${success} 首，失敗 ${failed} 首`);
    appendBulkLog(`批次完成：成功 ${success} 首，失敗 ${failed} 首`);
  }catch(e){
    setStatus('一鍵全部 +1 失敗：' + (e?.message || String(e)));
    appendBulkLog('批次失敗：' + (e?.message || String(e)));
    alert('一鍵全部 +1 失敗：' + (e?.message || String(e)));
  }finally{
    bulkPlayedBusy = false;
    setBulkLoading(false);
    unlockQueueActions();
  }
}

async function bulkRemoveQueue(){
  if(queueActionBusy){
    alert('目前有其他播放清單操作進行中，請稍候。');
    return;
  }

  if(!queue.length) return;

  try{
    lockQueueActions();
    await api('bulkremove');
    await syncFast(true);
  }catch(e){
    alert('一鍵清空失敗：' + (e?.message || String(e)));
  }finally{
    unlockQueueActions();
  }
}

window.addEventListener('resize', debounce(()=>{
  scheduleMarqueeRefresh(document);
}, 120));
