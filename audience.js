function normalizeWishSong(s){return String(s||'').replace(/　/g,' ').replace(/\s+/g,' ').trim().toLowerCase();}

let songs = [];
let queue = [];
let wishList = [];
let currentQueueId = '';
let currentPage = 'queue';

// ✅ 改這裡
let mainCat = '全部';
let subCat = '全部';

let leaderboardPage = 1;
let lastQueueSignature = '';

// ✅ 加全部
const MAIN_CATS = ['全部','女歌手','男歌手','其他'];

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

  // ✅ 全部不顯示細分類
  if(mainCat === '全部'){
    subtags = [];
  }
  else if(mainCat === '女歌手' || mainCat === '男歌手'){
    subtags = buildSingerSubtags(songs, mainCat);
  }
  else if(mainCat === '其他'){
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

// ✅ ⭐⭐⭐ 核心修正
function filterSongsByCategory(list){
  let out;

  if(mainCat === '全部'){
    out = [...list];
  }else{
    out = list.filter(s => s.category === mainCat);
  }

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

function renderSongs(){
  const grid = $('songGrid');
  if(!grid) return;

  rebuildMainCatChips();
  rebuildSubtagChips();

  let list = filterSongsByCategory(songs)
    .sort((a,b) => (b.plays || 0) - (a.plays || 0));

  grid.innerHTML = list.slice(0,120).map(s => `
    <div class="song-card">
      <div class="song-title">${s.title}</div>
      <div class="song-artist">${s.artist || s.subtag || ''}</div>
    </div>
  `).join('');
}

// ⚠️ 保留同步功能（不然頁面會死）
async function syncFast(force){
  try{
    const res = await api('queue');
    queue = res.data || [];
    currentQueueId = String(res.currentQueueId || '');
    if(force || currentPage === 'queue') renderCurrentPage();
  }catch(e){}
}

async function syncSlow(force){
  try{
    const [s1] = await Promise.all([api('songs')]);
    songs = s1.data || [];
    if(force || currentPage === 'songs') renderSongs();
  }catch(e){}
}
