const listEl = document.getElementById('list');
const syncTextEl = document.getElementById('syncText');
const headerEl = document.getElementById('header');
const bodyEl = document.body;
const params = new URLSearchParams(location.search);
const showTitle = params.get('title') !== '0';
const OBS_MARQUEE_GAP = 2;
const page = Math.max(1, Math.min(2, Number(params.get('page') || '1')));
const PAGE_SIZE = 15;
const VALID_LIMITS = [5, 10, 15, 20, 25, 30];
let syncing = false;
let lastSig = '';

if (!showTitle && headerEl) headerEl.style.display = 'none';

if (headerEl) {
  headerEl.innerHTML = `
    <div class="obs-head-title">今日歌單｜第 ${page} 頁</div>
    <img src="cute.gif" class="cute" alt="cute" />
  `;
}

sync(true);
setInterval(() => sync(false), 1500);

function normalizeLimit(raw) {
  const n = Number(raw || 30);
  return VALID_LIMITS.includes(n) ? n : 30;
}

/* 只允許一條 current，其餘全部普通 */
function queueState(q, idx, queue, currentQueueId) {
  const qid = String(q.id || '');
  const cid = String(currentQueueId || '');

  if (cid && qid === cid) return 'current';
  if (q.isCurrent || String(q.status || '') === 'current') return 'current';

  const hasCurrent = queue.some(x =>
    String(x.id || '') === cid ||
    x.isCurrent ||
    String(x.status || '') === 'current'
  );

  if (idx === 0 && !hasCurrent) return 'current';

  return 'pending';
}

function buildDisplayIndex(n) {
  return String(n);
}

function setLimitClass(limit) {
  if (!bodyEl) return;
  bodyEl.classList.remove(
    'obs-limit-5',
    'obs-limit-10',
    'obs-limit-15',
    'obs-limit-20',
    'obs-limit-25',
    'obs-limit-30'
  );
  bodyEl.classList.add(`obs-limit-${limit}`);
}

function renderError(message) {
  listEl.innerHTML = `
    <div class="obs-item fixed-obs-item is-error is-current">
      <div class="obs-main fixed-obs-main">
        <div class="obs-title fixed-obs-title">同步失敗</div>
        <div class="obs-meta fixed-obs-meta" style="text-align:left; margin-top:8px;">${esc(message)}</div>
      </div>
    </div>
  `;
  if (syncTextEl) syncTextEl.textContent = '同步失敗';
}

async function sync(force) {
  if (syncing) return;
  syncing = true;

  try {
    const [queueRes, settingsRes] = await Promise.all([
      api('queue'),
      api('settings').catch(() => ({ data: { obs_limit: 30 } }))
    ]);

    const fullQueue = queueRes.data || [];
    const currentQueueId = String(queueRes.currentQueueId || '');
    const limit = normalizeLimit(settingsRes?.data?.obs_limit);

    setLimitClass(limit);

    const limitedQueue = fullQueue.slice(0, limit);
    const start = (page - 1) * PAGE_SIZE;
    const shown = limitedQueue.slice(start, start + PAGE_SIZE);

    const sig = JSON.stringify({
      page,
      limit,
      currentQueueId,
      rows: shown.map(x => [x.id, x.title, x.artist, x.by, x.status, x.isCurrent])
    });

    if (force || sig !== lastSig) {
      lastSig = sig;
      render(shown, limitedQueue, start, currentQueueId, limit);
      fitObsTitles(listEl);
      scheduleObsMarqueeRefresh(listEl);
    }

    if (syncTextEl) {
      syncTextEl.textContent = `已同步：${new Date().toLocaleTimeString()}｜上限 ${limit} 首`;
    }
  } catch (e) {
    renderError(e?.message || String(e));
  } finally {
    syncing = false;
  }
}

function render(pageQueue, fullQueue, start, currentQueueId, limit) {
  if (!listEl) return;

  if (!pageQueue.length) {
    const emptyText = page === 1 ? '等待聊天室點歌中…' : `目前上限 ${limit} 首，第 2 頁沒有資料`;
    listEl.innerHTML = `
      <div class="obs-item fixed-obs-item is-empty ${page === 1 ? 'is-current' : ''}">
        <div class="obs-main fixed-obs-main">
          <div class="obs-title fixed-obs-title">${emptyText}</div>
          <div class="obs-meta fixed-obs-meta" style="text-align:left; margin-top:8px;">尚無歌曲</div>
        </div>
      </div>
    `;
    return;
  }

  listEl.innerHTML = pageQueue.map((item, i) => {
    const fullIndex = start + i;
    const state = queueState(item, fullIndex, fullQueue, currentQueueId);
    const who = esc((item.by || item.artist || '').trim());
    const rawSong = String(item.title || '');
    const song = esc(rawSong);
    const prefix = state === 'current' ? '▶' : '';
    const displayIndex = buildDisplayIndex(fullIndex + 1);

    return `
      <div class="obs-item fixed-obs-item ${state === 'current' ? 'is-current' : ''}" data-title="${esc(rawSong)}">
        <div class="obs-num fixed-obs-num">${prefix}${displayIndex}</div>
        <div class="obs-main fixed-obs-main">
          <div class="obs-title fixed-obs-title"><span class="obs-title-text">${song}</span></div>
        </div>
        <div class="obs-side fixed-obs-side">
          <div class="obs-meta fixed-obs-meta">${who}</div>
        </div>
      </div>
    `;
  }).join('');
}


function fitObsTitles(scope=document){
  const rows = scope.querySelectorAll('.obs-item');

  rows.forEach(row => {
    const holder = row.querySelector('.obs-title');
    const text = row.querySelector('.obs-title-text');
    if (!holder || !text) return;

    holder.style.removeProperty('--obs-mq-x');
    text.style.removeProperty('font-size');
    text.style.whiteSpace = 'nowrap';

    if (row.classList.contains('is-current')) return;

    let size = 14;
    const min = 9;
    text.style.fontSize = size + 'px';

    while (text.scrollWidth > holder.clientWidth && size > min) {
      size -= 1;
      text.style.fontSize = size + 'px';
    }
  });
}

function stopObsMarquee(holder) {
  if (!holder) return;

  if (holder._stopMarquee) {
    holder._stopMarquee();
    holder._stopMarquee = null;
  }

  if (holder._mqRaf) {
    cancelAnimationFrame(holder._mqRaf);
    holder._mqRaf = null;
  }

  holder.classList.remove('obs-marquee-holder');
  holder.removeAttribute('data-marquee');
  holder.style.removeProperty('--obs-mq-x');

  const originalText = String(holder.dataset.marqueeText || holder.textContent || '').trim();
  holder.innerHTML = `<span class="obs-title-text">${esc(originalText)}</span>`;
}

function runObsMarquee(holder) {
  if (!holder) return false;

  const plainText = holder.querySelector('.obs-title-text');
  if (!plainText) return false;

  const holderWidth = holder.clientWidth || holder.getBoundingClientRect().width || 0;
  const textWidth = plainText.scrollWidth || plainText.getBoundingClientRect().width || 0;
  if (!holderWidth || !textWidth) return false;

  const originalText = String(holder.dataset.marqueeText || plainText.textContent || '').trim();
  const gap = 2;
  const speed = 32;

  holder.classList.add('obs-marquee-holder');
  holder.setAttribute('data-marquee', 'on');
  holder.innerHTML = `
    <span class="obs-title-track">
      <span class="obs-title-text">${esc(originalText)}</span>
      <span class="obs-title-gap" aria-hidden="true"></span>
      <span class="obs-title-text" aria-hidden="true">${esc(originalText)}</span>
      <span class="obs-title-gap" aria-hidden="true"></span>
      <span class="obs-title-text" aria-hidden="true">${esc(originalText)}</span>
    </span>
  `;

  const track = holder.querySelector('.obs-title-track');
  const gapNodes = holder.querySelectorAll('.obs-title-gap');
  const textNodes = holder.querySelectorAll('.obs-title-text');
  if (!track || !gapNodes.length || !textNodes.length) return false;

  gapNodes.forEach(node => {
    node.style.width = `${gap}px`;
    node.style.minWidth = `${gap}px`;
    node.style.flex = `0 0 ${gap}px`;
  });

  const firstTextWidth = textNodes[0].scrollWidth || textNodes[0].getBoundingClientRect().width || textWidth;
  const segmentWidth = firstTextWidth + gap;
  if (!segmentWidth) return false;

  let offset = 0;
  let lastTs = null;
  let running = true;

  function tick(ts) {
    if (!running) return;

    if (lastTs == null) lastTs = ts;
    const dt = Math.max(0, (ts - lastTs) / 1000);
    lastTs = ts;

    offset -= speed * dt;

    if (offset <= -segmentWidth) {
      offset += segmentWidth;
    }

    holder.style.setProperty('--obs-mq-x', `${offset}px`);
    holder._mqRaf = requestAnimationFrame(tick);
  }

  holder.style.setProperty('--obs-mq-x', '0px');
  holder._mqRaf = requestAnimationFrame(tick);

  holder._stopMarquee = () => {
    running = false;
    if (holder._mqRaf) {
      cancelAnimationFrame(holder._mqRaf);
      holder._mqRaf = null;
    }
  };

  return true;
}

function applyObsNowPlayingMarquee(scope=document) {
  const rows = scope.querySelectorAll('.obs-item');

  rows.forEach(row => {
    const titleEl = row.querySelector('.obs-title');
    if (!titleEl) return;

    const originalText = String(row.dataset.title || titleEl.textContent || '').trim();
    titleEl.dataset.marqueeText = originalText;
    stopObsMarquee(titleEl);

    if (!row.classList.contains('is-current')) return;

    runObsMarquee(titleEl);
  });
}

function scheduleObsMarqueeRefresh(scope=document) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      fitObsTitles(scope);
      applyObsNowPlayingMarquee(scope);
    });
  });

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      requestAnimationFrame(() => {
        fitObsTitles(scope);
        applyObsNowPlayingMarquee(scope);
      });
    }).catch(() => {});
  }
}

window.addEventListener('resize', debounce(() => {
  fitObsTitles(listEl);
  applyObsNowPlayingMarquee(listEl);
}, 120));
