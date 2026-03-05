// ✅ 改這一行成你的 Apps Script /exec
const API = "https://script.google.com/macros/s/AKfycbzDzDqkoAXJK0eRBOi_bd6S4mAsnSvPUgqLQ0Y23amJ-mGumPueV47pgzuzLHTN_gRS/exec";

function api(action, params = {}) {
  return new Promise((resolve, reject) => {
    const cb = "cb_" + Math.random().toString(36).slice(2);
    const url = new URL(API);
    url.searchParams.set("action", action);
    url.searchParams.set("callback", cb);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

    const script = document.createElement("script");

    window[cb] = (data) => {
      try { delete window[cb]; } catch {}
      script.remove();
      resolve(data);
    };

    script.onerror = () => {
      try { delete window[cb]; } catch {}
      script.remove();
      reject(new Error("JSONP load failed"));
    };

    script.src = url.toString();
    document.body.appendChild(script);
  });
}

function esc(s){
  return (s??"").toString().replace(/[&<>"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]));
}

let toastTimer=null;
function toast(msg){
  let t = document.getElementById("toast");
  if(!t){
    t = document.createElement("div");
    t.id="toast";
    t.style.cssText = `
      position:fixed; left:50%; bottom:24px; transform:translateX(-50%);
      background:rgba(20,20,35,.92); border:1px solid rgba(145,70,255,.55);
      color:#fff; padding:10px 12px; border-radius:14px; box-shadow: 0 12px 30px rgba(0,0,0,.45);
      z-index:99; font-weight:900; font-size:13px;
    `;
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.display="block";
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>{ t.style.display="none"; }, 1400);
}

const WISH_SEP="|||";
function decodeWish(text){
  const raw = String(text||"");
  const idx = raw.indexOf(WISH_SEP);
  if(idx===-1) return {name:"", song:raw.trim()};
  return {name:raw.slice(0,idx).trim(), song:raw.slice(idx+WISH_SEP.length).trim()};
}
function encodeWish(name, song){
  const n=(name||"匿名").trim().slice(0,30);
  const s=(song||"").trim().slice(0,80);
  return `${n}${WISH_SEP}${s}`;
}
