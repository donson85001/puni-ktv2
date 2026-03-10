const listEl = document.getElementById('list');
const syncTextEl = document.getElementById('syncText');
const headerEl = document.getElementById('header');
const bodyEl = document.body;
const params = new URLSearchParams(location.search);
const showTitle = params.get('title') !== '0';
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
    const song = esc(item.title || '');
    const prefix = state === 'current' ? '▶' : '';
    const displayIndex = buildDisplayIndex(fullIndex + 1);

    return `
      <div class="obs-item fixed-obs-item ${state === 'current' ? 'is-current' : ''}">
        <div class="obs-num fixed-obs-num">${prefix}${displayIndex}</div>
        <div class="obs-main fixed-obs-main">
          <div class="obs-title fixed-obs-title">${song}</div>
        </div>
        <div class="obs-side fixed-obs-side">
          <div class="obs-meta fixed-obs-meta">${who}</div>
        </div>
      </div>
    `;
  }).join('');
}