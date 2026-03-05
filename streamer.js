// streamer.js
async function verify(){
  const pw = document.getElementById("pw").value;
  const res = await api("verify", { password: pw });
  if(res.ok){
    document.getElementById("login").style.display = "none";
    document.getElementById("panel").style.display = "block";
    await refreshAll();
  }else{
    alert("密碼錯誤");
  }
}

async function refreshAll(){
  await loadQueue();
  await loadWishlist();
}

async function loadQueue(){
  const data = await api("queue");
  const box = document.getElementById("queue");
  box.innerHTML = "";
  data.forEach((q,idx)=>{
    const el=document.createElement("div");
    el.className="song";
    el.innerHTML = `
      <span class="rank">${idx+1}</span>
      <b>${escapeHtml(q.title||"")}</b> - ${escapeHtml(q.artist||"")}
      <button onclick="played('${escapeHtmlAttr(q.id)}')">已唱 +1</button>
      <button onclick="removeQueue('${escapeHtmlAttr(q.id)}')">移除</button>
    `;
    box.appendChild(el);
  });
}

async function played(id){
  await api("played", { queueId: id });
  await refreshAll();
}

async function removeQueue(id){
  await api("removequeue", { queueId: id });
  await refreshAll();
}

async function loadWishlist(){
  const data = await api("wishlist");
  const box = document.getElementById("wishlist");
  box.innerHTML = "";
  data.slice(0,100).forEach(w=>{
    const raw = (w.text||"");
    let name="", song=raw;
    if(raw.includes("|||")){
      const parts = raw.split("|||");
      name = parts[0] || "";
      song = parts.slice(1).join("|||");
    }
    const el=document.createElement("div");
    el.className="song";
    el.innerHTML = `
      <b>${escapeHtml(song)}</b>
      <span class="muted">（許願者：${escapeHtml(name||"")}）</span>
      <button onclick="delWish('${escapeHtmlAttr(w.id)}')">刪除</button>
    `;
    box.appendChild(el);
  });
}

async function delWish(id){
  await api("deletewish", { wishId: id });
  await refreshAll();
}

function escapeHtml(s){
  return (s??"").toString().replace(/[&<>"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]));
}
function escapeHtmlAttr(s){
  return escapeHtml(s).replace(/"/g,"&quot;");
}
