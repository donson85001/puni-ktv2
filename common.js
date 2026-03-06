// common.js (final stable)
const API = "https://script.google.com/macros/s/AKfycbwDxe0ylZu0lyDjTY3YFoteQqvZQK_w14a8pFj7SmRjgzWZS7Zv6vev7Lrpt1MhloMK/exec";

function esc(s){
  return String(s||"").replace(/[&<>"]/g,a=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[a]));
}

function displayUserName(s){ return String(s||"").trim() || "聊天室點歌"; }
function statusLabel(status){ return status==='playing' ? '正在播放' : status==='done' ? '已唱' : '待播'; }

async function api(action, payloadObj = null, opt = {}) {
  const timeoutMs = opt.timeoutMs ?? 12000;
  const retries = opt.retries ?? 1;
  const cacheBust = opt.cacheBust ?? true;
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(new Error('timeout')), timeoutMs);
    try {
      const url = new URL(API);
      url.searchParams.set('action', action);
      if (payloadObj && Object.keys(payloadObj).length) url.searchParams.set('payload', JSON.stringify(payloadObj));
      if (cacheBust) url.searchParams.set('_', String(Date.now()));
      const res = await fetch(url.toString(), { method:'GET', cache:'no-store', signal:ctrl.signal });
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0,180)}`);
      if (!text.trim().startsWith('{') && !text.trim().startsWith('[')) throw new Error('API not JSON: ' + text.slice(0,180));
      const json = JSON.parse(text);
      if (json && json.ok === false) throw new Error(json.error || 'API ok:false');
      return json;
    } catch (e) {
      lastErr = e;
      if (attempt < retries) continue;
      throw lastErr;
    } finally { clearTimeout(t); }
  }
  throw lastErr || new Error('unknown api error');
}