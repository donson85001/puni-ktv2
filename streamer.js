let currentQueueId = '';
let lastQueueFingerprint = '';
let lastRenderedCurrentQueueId = '';
let authed = false;
let currentPage = 'queue';
let songs = [];
let queue = [];
let wishList = [];
let settings = { obs_limit: 30 };
let mainCat = '女歌手';
let subCat = '全部';
let leaderboardPage = 1;

const MAIN_CATS = ['女歌手','男歌手','其他'];
const OTHER_SUBTAGS = ['日','英','韓','Rap','情歌對唱','嗨歌/怪歌','舞蹈'];
const OBS_LIMITS = [5,10,15,20,25,30];
const OBS_PAGE_SIZE = 15;
const MEDALS = ['🥇','🥈','🥉'];
const LEADERBOARD_PAGE_SIZE = 24;
const FAST_MS = 2000;
const SLOW_MS = 12000;
const LS_AUTH = 'puni_streamer_authed';
const $ = id => document.getElementById(id);

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
  authed=true;
  $('gate').style.display='none';
  $('app').style.display='block';

  syncAll(true);

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
  const count={};

  allSongs
    .filter(s=>s.category===category)
    .forEach(s=>{
      const a=(s.artist||'').trim();
      if(a) count[a]=(count[a]||0)+1;
    });

  return [
    ...Object.keys(count)
      .filter(a=>count[a]>=2)
      .sort((a,b)=>a.localeCompare(b,'zh-Hant')),
    '其他(單曲歌手)'
  ];
}

function rebuildSubtagChips(){
  const box=$('catChips');
  if(!box) return;

  box.innerHTML='';

  let subtags=[];

  if(mainCat==='女歌手'||mainCat==='男歌手') subtags=buildSingerSubtags(songs, mainCat);
  if(mainCat==='其他') subtags=OTHER_SUBTAGS;

  ['全部',...subtags].forEach(t=>{
    const b=document.createElement('button');
    b.className='chip ' + (t===subCat?'chip-active':'');
    b.textContent=t;
    b.onclick=()=>{
      subCat=t;
      rebuildSubtagChips();
      renderSongs();
    };
    box.appendChild(b);
  });
}

function filterSongsByCategory(list){
  let out=list.filter(s=>s.category===mainCat);

  if((mainCat==='女歌手'||mainCat==='男歌手')&&subCat!=='全部'){
    if(subCat==='其他(單曲歌手)'){
      const count={};

      out.forEach(s=>{
        const a=(s.artist||'').trim();
        if(a) count[a]=(count[a]||0)+1;
      });

      out=out.filter(s=>(count[(s.artist||'').trim()]||0)===1);
    }else{
      out=out.filter(s=>(s.artist||'').trim()===subCat);
    }
  }

  if(mainCat==='其他'&&subCat!=='全部'){
    out=out.filter(s=>(s.subtag||'')===subCat);
  }

  return out;
}

function makeSongCard(s){
  return `
    <div class="song-card">
      <div class="song-title">
        ${esc(s.title||'')}
        ${s.practice?' <span class="badge">⭐ 練習中</span>':''}
      </div>
      <div class="song-artist">${esc(s.artist || s.subtag || '')}</div>
      <div class="song-actions">
        <span class="pill">${esc(s.category||'')}</span>
        <span class="pill">播放 ${Number(s.plays||0)}</span>
        <button class="btn btn-mini btn-primary" data-songid="${esc(s.id)}">加入 Queue</button>
      </div>
    </div>
  `;
}

function wireSongButtons(scope=document){
  scope.querySelectorAll('[data-songid]').forEach(btn=>{
    btn.onclick=async()=>{
      try{
        await api('addqueue',{songId:btn.dataset.songid, by:'主播'});
        await syncFast(true);
      }catch(e){
        alert('加入 Queue 失敗：'+(e?.message||String(e)));
      }
    };
  });
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
          <button class="btn btn-mini btn-primary btn-icon" title="設成現在播放" data-current="${esc(q.id)}" ${current?'disabled':''}>▶</button>
          <button class="btn btn-mini btn-yt" title="搜尋 YouTube" data-yt="${ytQuery}">YT</button>
          <button class="btn btn-mini" data-up="${esc(q.id)}">▲</button>
          <button class="btn btn-mini" data-down="${esc(q.id)}">▼</button>
          <button class="btn btn-mini btn-primary" data-played="${esc(q.id)}">單首 +1</button>
          <button class="btn btn-mini btn-danger" data-remove="${esc(q.id)}">移除</button>
        </div>
      </div>
    `;
  }).join('');

  box.querySelectorAll('[data-current]').forEach(btn=>{
    btn.onclick=async()=>{
      const nextId = btn.dataset.current;
      const prevId = currentQueueId;

      try{
        btn.disabled = true;

        await api('setcurrent', { queueId: nextId });

        currentQueueId = nextId;
        renderQueue();

        setTimeout(async () => {
          try{
            await syncFast(true);
          }catch(_){}
        }, 300);

      }catch(e){
        currentQueueId = prevId;
        renderQueue();
        alert('設成現在播放失敗：' + (e?.message || String(e)));
      }finally{
        btn.disabled = false;
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
      await api('movequeue',{queueId:btn.dataset.up,direction:'up'});
      await syncFast(true);
    };
  });

  box.querySelectorAll('[data-down]').forEach(btn=>{
    btn.onclick=async()=>{
      await api('movequeue',{queueId:btn.dataset.down,direction:'down'});
      await syncFast(true);
    };
  });

  box.querySelectorAll('[data-played]').forEach(btn=>{
    btn.onclick=async()=>{
      const id = btn.dataset.played;
      const item = queue.find(x=>String(x.id)===String(id));

      await api('removequeue',{queueId:id});

      await api('played',{
        queueId:id,
        title:item?.title||'',
        artist:item?.artist||''
      });

      await syncAll(true);
    };
  });

  box.querySelectorAll('[data-remove]').forEach(btn=>{
    btn.onclick=async()=>{
      await api('removequeue',{queueId:btn.dataset.remove});
      await syncFast(true);
    };
  });

  fitQueueSongNames(box);
  scheduleMarqueeRefresh(box);
  lastQueueFingerprint = makeQueueFingerprint(queue);
  lastRenderedCurrentQueueId = String(currentQueueId || '');
}

function renderSongs(){
  const grid=$('songGrid');
  if(!grid) return;

  if(!songs.length){
    grid.innerHTML='<div class="empty-state">歌曲載入中…</div>';
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

function parseWishDate(dateValue, timeValue){
  const rawDate = String(dateValue || '').trim();
  const rawTime = String(timeValue || '').trim();

  if(!rawDate && !rawTime) return null;

  let year = '';
  let month = '';
  let day = '';

  const ymd = rawDate.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if(ymd){
    year = Number(ymd[1]);
    month = Number(ymd[2]);
    day = Number(ymd[3]);
  }else{
    const dateObj = new Date(rawDate);
    if(!Number.isNaN(dateObj.getTime())){
      year = dateObj.getFullYear();
      month = dateObj.getMonth() + 1;
      day = dateObj.getDate();
    }
  }

  let hour = 0;
  let minute = 0;
  let second = 0;

  const zhTime = rawTime.match(/(上午|下午)\s*(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if(zhTime){
    hour = Number(zhTime[2]);
    minute = Number(zhTime[3]);
    second = Number(zhTime[4] || 0);

    if(zhTime[1] === '下午' && hour < 12) hour += 12;
    if(zhTime[1] === '上午' && hour === 12) hour = 0;
  }else{
    const normalTime = rawTime.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if(normalTime){
      hour = Number(normalTime[1]);
      minute = Number(normalTime[2]);
      second = Number(normalTime[3] || 0);
    }
  }

  if(year && month && day){
    return new Date(year, month - 1, day, hour, minute, second);
  }

  const fallback = new Date(`${rawDate} ${rawTime}`);
  if(!Number.isNaN(fallback.getTime())) return fallback;

  return null;
}

function formatWishDateTime(dateValue, timeValue){
  const d = parseWishDate(dateValue, timeValue);

  if(!d) return '';

  const month = String(d.getMonth() + 1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');

  let hour = d.getHours();
  const minute = String(d.getMinutes()).padStart(2,'0');
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
  try{
    const q1 = await api('queue');
    const newQueue = q1.data || [];
    const newCurrentQueueId = String(q1.currentQueueId || currentQueueId || '');
    const newFingerprint = makeQueueFingerprint(newQueue);
    const queueChanged = newFingerprint !== lastQueueFingerprint;
    const currentChanged = newCurrentQueueId !== lastRenderedCurrentQueueId;

    queue = newQueue;
    currentQueueId = newCurrentQueueId;

    if(force || (currentPage==='queue' && (queueChanged || currentChanged))){
      renderQueue();
      lastQueueFingerprint = newFingerprint;
      lastRenderedCurrentQueueId = newCurrentQueueId;
    }

    setStatus('已同步：'+new Date().toLocaleTimeString());
  }catch(e){
    setStatus('同步失敗：'+(e?.message||String(e)));
  }
}

async function syncSlow(force){
  try{
    const [s1,w1,st]=await Promise.all([
      api('songs'),
      api('wish_list'),
      api('settings')
    ]);

    songs=s1.data||[];
    wishList=w1.data||[];
    settings={ obs_limit:Number((st.data||{}).obs_limit||30), ...(st.data||{}) };

    if(!OBS_LIMITS.includes(Number(settings.obs_limit))) settings.obs_limit = 30;

    buildObsControls();
    updateObsUrl();

    if(force||currentPage==='songs') renderSongs();
    if(force||currentPage==='leaderboard') renderLeaderboard();
    if(force||currentPage==='wish') renderWishList();

    setStatus('已同步：'+new Date().toLocaleTimeString());
  }catch(e){
    setStatus('同步失敗：'+(e?.message||String(e)));
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
  if(!queue.length) return;

  for(const q of queue){
    await api('removequeue',{queueId:q.id});

    await api('played',{
      queueId:q.id,
      title:q.title||'',
      artist:q.artist||''
    });
  }

  await syncFast(true);
}

async function bulkRemoveQueue(){
  if(!queue.length) return;
  await api('bulkremove');
  await syncFast(true);
}

window.addEventListener('resize', debounce(()=>{
  scheduleMarqueeRefresh(document);
}, 120));