// audience.js
async function loadSongs(){
  const data = await api("songs");
  const box = document.getElementById("songs");
  box.innerHTML = "";
  data.forEach(s=>{
    const el = document.createElement("div");
    el.className = "song";
    el.innerHTML = `
      <b>${escapeHtml(s.title)}</b> - ${escapeHtml(s.artist)}
      ${s.practice ? '<span class="badge">⭐</span>' : ''}
      <button onclick="suggest('${escapeHtmlAttr(s.id)}')">點歌</button>
    `;
    box.appendChild(el);
  });
}

async function suggest(id){
  await api("suggest", { songId: id, by: "viewer" });
  alert("已送出點歌");
  await refreshPanels();
}

async function leaderboard(){
  const data = await api("leaderboard");
  const box = document.getElementById("leader");
  box.innerHTML = "";
  data.slice(0,50).forEach((s,i)=>{
    const el = document.createElement("div");
    el.className = "song";
    el.innerHTML = `
      <span class="rank">${i+1}</span>
      ${escapeHtml(s.title)} - ${escapeHtml(s.artist)}
      <button onclick="suggest('${escapeHtmlAttr(s.id)}')">點歌</button>
      <span class="muted">(${Number(s.plays||0)} 次)</span>
    `;
    box.appendChild(el);
  });
}

async function wish(){
  const name = document.getElementById("wname").value.trim() || "匿名";
  const song = document.getElementById("wsong").value.trim();
  if(!song) return;
  await api("wish", { text: name + "|||"+ song });
  document.getElementById("wsong").value = "";
  alert("已送出許願");
  await refreshPanels();
}

async function refreshPanels(){
  await leaderboard();
  await loadQueuePreview();
  await loadWishlistPreview();
}

async function loadQueuePreview(){
  const data = await api("queue");
  const box = document.getElementById("queuePreview");
  box.innerHTML = "";
  data.slice(0,10).forEach((q,i)=>{
    const el=document.createElement("div");
    el.className="song";
    el.innerHTML = `<span class="rank">${i+1}</span>${escapeHtml(q.title||q.songTitle||"")}`;
    box.appendChild(el);
  });
}

async function loadWishlistPreview(){
  const data = await api("wishlist");
  const box = document.getElementById("wishPreview");
  box.innerHTML = "";
  data.slice(0,10).forEach(w=>{
    const text = (w.text||"");
    const song = text.includes("|||") ? text.split("|||").slice(1).join("|||") : text;
    const el=document.createElement("div");
    el.className="song";
    el.innerHTML = escapeHtml(song);
    box.appendChild(el);
  });
}

function escapeHtml(s){
  return (s??"").toString().replace(/[&<>"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]));
}
function escapeHtmlAttr(s){
  return escapeHtml(s).replace(/"/g,"&quot;");
}

loadSongs();
refreshPanels();
