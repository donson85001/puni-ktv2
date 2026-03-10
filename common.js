const API = "https://script.google.com/macros/s/AKfycbybndsLOSY0jdSG5mGRymWErC-SHATmnOnlKQDj6ZKlr6HkvLbOffeGSObLrAOR62ex/exec";

function esc(s){
  return String(s ?? "").replace(/[&<>\"]/g, ch => ({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;'
  })[ch]);
}

function debounce(fn, ms){
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

async function api(action, payload = null, opt = {}){
  const timeoutMs = opt.timeoutMs ?? 12000;
  const retries = opt.retries ?? 1;
  let lastErr = null;

  for(let attempt=0; attempt<=retries; attempt++){
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try{
      const url = new URL(API);
      url.searchParams.set('action', action);
      if(payload && typeof payload === 'object'){
        url.searchParams.set('payload', JSON.stringify(payload));
        Object.entries(payload).forEach(([k,v]) => {
          if(v !== undefined && v !== null) url.searchParams.set(k, String(v));
        });
      }
      url.searchParams.set('_', String(Date.now()));
      const res = await fetch(url.toString(), {cache:'no-store', signal:ctrl.signal});
      const txt = await res.text();
      if(!res.ok) throw new Error(`HTTP ${res.status}: ${txt.slice(0,160)}`);
      const trimmed = txt.trim();
      if(trimmed === 'ok') return {ok:true, data:'ok'};
      if(!trimmed.startsWith('{') && !trimmed.startsWith('[')) throw new Error('API not JSON: ' + trimmed.slice(0,160));
      const data = JSON.parse(trimmed);
      if(data && data.ok === false) throw new Error(data.message || data.error || 'API ok:false');
      return data;
    }catch(err){
      lastErr = err;
      if(attempt < retries) continue;
      throw lastErr;
    }finally{
      clearTimeout(timer);
    }
  }
  throw lastErr || new Error('unknown api error');
}

function openYoutubeSearch(title){
  const q = String(title || '').trim();
  if(!q) return;
  window.open('https://www.youtube.com/results?search_query=' + encodeURIComponent(q), '_blank', 'noopener,noreferrer');
}
