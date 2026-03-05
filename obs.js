const params = new URLSearchParams(location.search);
const limit = Math.max(1, Math.min(50, parseInt(params.get("limit") || "10", 10)));
const showTitle = (params.get("title") !== "0");
const transparent = (params.get("transparent") === "1");

if(!showTitle) {
  const h=document.getElementById("header");
  if(h) h.style.display="none";
}
if(transparent) document.body.style.background="transparent";

let last=0;
sync(true);
setInterval(()=>sync(false), 2000);

async function sync(force){
  const now=Date.now();
  if(!force && now-last<1200) return;
  last=now;

  try{
    const q = await api("queue");
    const queue = (q.data||q||[]);
    render(queue);
    document.getElementById("syncText").textContent = "已同步：" + new Date().toLocaleTimeString();
  }catch(e){
    document.getElementById("syncText").textContent = "同步失敗";
  }
}

function render(queue){
  const nowTitle=document.getElementById("nowTitle");
  const nowArtist=document.getElementById("nowArtist");
  const nextList=document.getElementById("nextList");

  if(!queue.length){
    nowTitle.textContent="（尚無歌曲）";
    nowArtist.textContent="";
    nextList.innerHTML="";
    return;
  }

  const now=queue[0];
  nowTitle.textContent = now.title || "";
  nowArtist.textContent = [now.artist||"", now.category||""].filter(Boolean).join(" · ");

  const rest=queue.slice(1, 1+limit);
  nextList.innerHTML = rest.length ? "" : `<div style="color:var(--muted)">沒有下一首</div>`;
  rest.forEach((s,idx)=>{
    const div=document.createElement("div");
    div.className="item";
    div.textContent = `${idx+1}. ${s.title || ""}`;
    nextList.appendChild(div);
  });
}
