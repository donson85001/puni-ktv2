
let songs = [];
let queue = [];
let wishlist = [];
let settings = { queue_limit: 10 };
let currentPage='queue';
const MAIN_CATS=['女歌手','男歌手','其他'];
const OTHER_SUBTAGS=['日','英','韓','Rap','情歌對唱','嗨歌/怪歌','舞蹈'];
const LEADERBOARD_PAGE_SIZE=24;
const LEADERBOARD_TOTAL_PAGES=4;
let leaderboardPage=1;
let mainCat='女歌手';
let subCat='全部';
const $=(id)=>document.getElementById(id);
let lastFast='', lastSongs='', lastWish='', lastSettings='';
let syncingFast=false, syncingSlow=false;
init();
function init(){
  document.querySelectorAll('.nav').forEach(btn=>btn.addEventListener('click',()=>{ document.querySelectorAll('.nav').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); currentPage=btn.dataset.page; show(currentPage); renderCurrentPage(true); }));
  $('songSearchBtn')?.addEventListener('click',()=>renderSongs(true));
  $('songSearch')?.addEventListener('input', debounce(()=>renderSongs(true),120));
  $('toggleCats')?.addEventListener('click',()=> $('catPanel')?.classList.toggle('hidden'));
  $('wishForm')?.addEventListener('submit', submitWish);
  syncSlow(true).then(()=>syncFast(true));
  setInterval(()=>syncFast(false),1500);
  setInterval(()=>syncSlow(false),45000);
}
function debounce(fn, ms){ let t=null; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args), ms); }; }
function setStatus(t){ $('syncStatus') && ($('syncStatus').textContent=t); }
function show(name){ document.querySelectorAll('.page').forEach(p=>p.classList.add('hidden')); $('page-'+name)?.classList.remove('hidden'); }
function renderCurrentPage(force=false){ if(currentPage==='queue') renderQueue(force); if(currentPage==='songs') renderSongs(force); if(currentPage==='leaderboard') renderLeaderboard(force); if(currentPage==='wishlist') renderWishlist(force); }
function rebuildMainCatChips(){ const box=$('mainCatChips'); if(!box) return; box.innerHTML=''; MAIN_CATS.forEach(c=>{ const b=document.createElement('button'); b.className='chip chip-block '+(c===mainCat?'chip-active':''); b.textContent=c; b.onclick=()=>{ mainCat=c; subCat='全部'; rebuildMainCatChips(); rebuildSubtagChips(); renderSongs(true);}; box.appendChild(b); }); }
function buildSingerSubtags(allSongs, category){ const list=allSongs.filter(s=>s.category===category), count={}; for(const s of list){ const a=(s.artist||'').trim(); if(!a) continue; count[a]=(count[a]||0)+1;} const multi=Object.keys(count).filter(a=>count[a]>=2).sort((a,b)=>a.localeCompare(b,'zh-Hant')); return [...multi,'其他(單曲歌手)']; }
function rebuildSubtagChips(){ const box=$('catChips'); if(!box) return; box.innerHTML=''; let subtags=[]; if(mainCat==='女歌手'||mainCat==='男歌手') subtags=buildSingerSubtags(songs, mainCat); if(mainCat==='其他') subtags=OTHER_SUBTAGS; ['全部',...subtags].forEach(t=>{ const b=document.createElement('button'); b.className='chip chip-block '+(t===subCat?'chip-active':''); b.textContent=t; b.onclick=()=>{ subCat=t; rebuildSubtagChips(); renderSongs(true); }; box.appendChild(b);}); }
function filterSongsByCategory(allSongs){ let list=allSongs.filter(s=>s.category===mainCat); if(mainCat==='女歌手'||mainCat==='男歌手'){ if(subCat!=='全部'){ if(subCat==='其他(單曲歌手)'){ const cnt={}; for(const s of list){ const a=(s.artist||'').trim(); if(!a) continue; cnt[a]=(cnt[a]||0)+1;} list=list.filter(s=>(cnt[(s.artist||'').trim()]||0)===1);} else list=list.filter(s=>(s.artist||'').trim()===subCat); }} if(mainCat==='其他' && subCat!=='全部') list=list.filter(s=>(s.subtag||'')===subCat); return list; }
function makeSongCard(s){ return `<div class="song song-card"><div class="song-title">${esc(s.title||'')}${s.practice?` <span class="badge">⭐ 練習中</span>`:''}</div><div class="song-artist">${esc(s.artist || (s.category==='其他' ? (s.subtag||'') : ''))}</div><div class="song-actions"><span class="pill">${esc(s.category||'未分類')}</span><span class="pill">播放 ${Number(s.plays||0)}</span></div></div>`; }
function queueStatusBadge(q){ if(q.status==='playing') return `<span class="inline-state state-playing">正在播放</span>`; if(q.status==='done') return `<span class="inline-state state-done">已唱</span>`; return ''; }
function renderQueue(){
  const box=$('homeQueue'), statQueue=$('statQueue'), statSongs=$('statSongs'), statPractice=$('statPractice');
  if(statQueue) statQueue.textContent=String(queue.filter(q=>q.status!=='done').length);
  if(statSongs) statSongs.textContent=String(songs.length);
  if(statPractice) statPractice.textContent=String(songs.filter(s=>s.practice).length);
  if(!box) return;
  if(!queue.length){ box.innerHTML='<div class="empty-state">等待聊天室點歌中…</div>'; return; }
  box.innerHTML=queue.slice(0, Number(settings.queue_limit||10)).map((q,idx)=>{
    const byName=displayUserName(q.by), who=byName?`🎯 ${esc(byName)}`:'';
    const subline=esc((q.artist || (q.category==='其他' ? (q.subtag||'') : '')).trim());
    const rowClass=q.status==='playing'?'row row-playing':q.status==='done'?'row row-done':'row';
    return `<div class="${rowClass}"><div class="row-left"><div class="row-meta">${queueStatusBadge(q)}</div><div class="row-title"><span class="rank">${idx+1}</span>${esc(q.title||'')}${q.practice?' ⭐':''}</div><div class="row-sub">${who}${who&&subline?' · ':''}${subline}</div></div></div>`;
  }).join('');
}
function renderSongs(){
  const grid=$('songGrid'); if(!grid) return;
  if(!songs.length){ grid.innerHTML='<div class="empty-state grid-span-all">歌曲載入中…</div>'; return; }
  rebuildMainCatChips(); rebuildSubtagChips();
  const q=($('songSearch')?.value||'').trim().toLowerCase();
  let list=filterSongsByCategory(songs).sort((a,b)=>(b.plays||0)-(a.plays||0));
  if(q) list=list.filter(s=> String(s.title||'').toLowerCase().includes(q)||String(s.artist||'').toLowerCase().includes(q)||String(s.subtag||'').toLowerCase().includes(q));
  const shown=list.slice(0,120);
  if(!shown.length){ grid.innerHTML='<div class="empty-state grid-span-all">沒有歌曲</div>'; return; }
  grid.innerHTML=shown.map(makeSongCard).join('');
}
function renderLeaderboard(){
  const box=$('leaderboardList'); if(!box) return;
  if(!songs.length){ box.innerHTML='<div class="empty-state grid-span-all">排行榜載入中…</div>'; renderLeaderboardPager(); return; }
  const sorted=[...songs].sort((a,b)=>(b.plays||0)-(a.plays||0));
  const start=(leaderboardPage-1)*LEADERBOARD_PAGE_SIZE;
  const shown=sorted.slice(start,start+LEADERBOARD_PAGE_SIZE);
  const medals=['🥇','🥈','🥉'];
  box.innerHTML=shown.map((s,idx)=>{
    const rankNo=start+idx+1;
    const topClass=rankNo===1?'lb-top1':rankNo===2?'lb-top2':rankNo===3?'lb-top3':'';
    return `<div class="song song-card leaderboard-card ${topClass}"><div class="song-title"><span class="rank ${rankNo<=3?'rank-medal':''}">${medals[rankNo-1]||rankNo}</span>${esc(s.title||'')}${s.practice?' ⭐':''}</div><div class="song-artist">${esc(s.artist || (s.category==='其他' ? (s.subtag||'') : ''))}</div><div class="song-actions"><span class="pill">${esc(s.category||'')}</span><span class="pill">播放 ${Number(s.plays||0)}</span></div></div>`;
  }).join('');
  renderLeaderboardPager();
}
function renderLeaderboardPager(){
  const pager=$('leaderboardPager'); if(!pager) return;
  pager.innerHTML=`<span class="pager-label">第 ${leaderboardPage} / ${LEADERBOARD_TOTAL_PAGES} 頁</span>` + Array.from({length:LEADERBOARD_TOTAL_PAGES},(_,i)=>{ const page=i+1; return `<button type="button" class="btn ${page===leaderboardPage?'btn-primary':''}" data-lbpage="${page}">${page}</button>`; }).join('');
  pager.querySelectorAll('[data-lbpage]').forEach(btn=>btn.onclick=()=>{ leaderboardPage=Number(btn.dataset.lbpage||1); renderLeaderboard(true); });
}
function renderWishlist(){
  const box=$('wishList'); if(!box) return;
  if(!wishlist.length){ box.innerHTML='<div class="empty-state grid-span-all">還沒有許願</div>'; return; }
  box.innerHTML=wishlist.map(w=>{ const raw=String(w.text||''); const song=raw.includes('|||')?raw.split('|||').slice(1).join('|||').trim():raw.trim(); return `<div class="song song-card wish-card"><div class="song-title">${esc(song)}</div><div class="song-actions"><span class="pill">${w.ts ? new Date(Number(w.ts||0)).toLocaleString() : '剛剛'}</span></div></div>`; }).join('');
}
async function submitWish(e){
  e.preventDefault();
  const name=($('wishName')?.value||'').trim(), song=($('wishSong')?.value||'').trim(), msg=$('wishMsg');
  if(!song){ if(msg) msg.textContent='請輸入許願歌名'; return; }
  try{ await api('wish',{text:`${name}|||${song}`}); $('wishName').value=''; $('wishSong').value=''; if(msg) msg.textContent='已送出許願 ✨'; await syncSlow(true); }
  catch(err){ if(msg) msg.textContent='送出失敗：'+(err?.message||String(err)); }
  setTimeout(()=>{ if(msg) msg.textContent=''; },1800);
}
async function syncFast(forceRender){
  if(syncingFast) return;
  syncingFast=true;
  try{
    const q1=await api('queue');
    const nextQueue=q1.data||[];
    const sig=JSON.stringify(nextQueue.map(x=>[x.id,x.title,x.by,x.artist,x.status]));
    if(sig!==lastFast||forceRender){ queue=nextQueue; lastFast=sig; if(currentPage==='queue'||forceRender) renderQueue(); }
    if(!syncingSlow) setStatus('已同步：'+new Date().toLocaleTimeString());
  }catch(e){ setStatus('同步失敗：'+(e?.message||String(e))); }finally{ syncingFast=false; }
}
async function syncSlow(forceRender){
  if(syncingSlow) return;
  syncingSlow=true;
  try{
    const [s1,w1,st1]=await Promise.all([api('songs'),api('wishlist'),api('settings')]);
    const nextSongs=s1.data||[], nextWish=w1.data||[], nextSettings=st1.data||{};
    const sigSongs=JSON.stringify(nextSongs.map(x=>[x.id,x.title,x.artist,x.plays,x.practice,x.category,x.subtag]));
    const sigWish=JSON.stringify(nextWish.map(x=>[x.id,x.text,x.ts]));
    const sigSettings=JSON.stringify(nextSettings);
    if(sigSongs!==lastSongs){ songs=nextSongs; lastSongs=sigSongs; }
    if(sigWish!==lastWish){ wishlist=nextWish; lastWish=sigWish; }
    if(sigSettings!==lastSettings){ settings=nextSettings; lastSettings=sigSettings; }
    if(forceRender || currentPage==='songs') renderSongs();
    if(forceRender || currentPage==='leaderboard') renderLeaderboard();
    if(forceRender || currentPage==='wishlist') renderWishlist();
    if(forceRender || currentPage==='queue') renderQueue();
    setStatus('已同步：'+new Date().toLocaleTimeString());
  }catch(e){ setStatus('同步失敗：'+(e?.message||String(e))); }finally{ syncingSlow=false; }
}
