let songs = [];
let queue = [];
let wishList = [];
let currentQueueId = '';
let currentPage = 'queue';
let mainCat = '全部';   // ✅ 預設改成全部
let subCat = '全部';
let leaderboardPage = 1;
let lastQueueSignature = '';

// ✅ 加入「全部」
const MAIN_CATS = ['全部','女歌手','男歌手','其他'];

const OTHER_SUBTAGS = ['日','英','韓','Rap','情歌對唱','嗨歌/怪歌','舞蹈'];
const MEDALS = ['🥇','🥈','🥉'];
const PAGE_SIZE = 24;
const $ = id => document.getElementById(id);

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

function rebuildSubtagChips(){
  const box = $('catChips');
  if(!box) return;

  box.innerHTML = '';

  let subtags = [];

  // ✅ 全部時不顯示子分類
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

// ✅ ⭐⭐⭐ 核心修正：分類邏輯
function filterSongsByCategory(list){
  let out;

  // 🔥 全部分類
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
