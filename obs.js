// obs.js
async function loop(){
  const data = await api("queue");
  const now = data[0];
  const next = data.slice(1, 6);

  document.getElementById("now").innerText = now ? (now.title||"") : "None";

  const box = document.getElementById("next");
  box.innerHTML = "";
  next.forEach(s=>{
    const el=document.createElement("div");
    el.innerText = (s.title||"");
    box.appendChild(el);
  });
}

setInterval(loop, 2000);
loop();
