// common.js (robust: timeout + retry + clear error)
// ✅ Works for BOTH audience & streamer
// ✅ Avoids "stuck on syncing..." forever

// 你現在的後端 /exec（你給的）
const API = "https://script.google.com/macros/s/AKfycbzMGl_ZT-UsSXueAe1z5BLtyBmseIuqTw2M9idkz5DHHwZhSXzidnzb9NrwRHL3Mlhi/exec";

function esc(s){
  return String(s||"").replace(/[&<>"]/g,a=>({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;"
  }[a]));
}

function toast(msg){
  console.log(msg);
}

// ---------- core ----------
async function api(action, payloadObj = null, opt = {}) {
  const timeoutMs = opt.timeoutMs ?? 10000; // ✅ 10s
  const retries = opt.retries ?? 1;         // ✅ retry once
  const cacheBust = opt.cacheBust ?? true;

  let lastErr = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(new Error("timeout")), timeoutMs);

    try {
      const url = new URL(API);
      url.searchParams.set("action", action);

      if (payloadObj && Object.keys(payloadObj).length) {
        url.searchParams.set("payload", JSON.stringify(payloadObj));
      }

      // ✅ avoid cached / weird proxy
      if (cacheBust) url.searchParams.set("_", String(Date.now()));

      const res = await fetch(url.toString(), {
        method: "GET",
        cache: "no-store",
        signal: ctrl.signal,
      });

      const text = await res.text();

      // non-200 也要當錯
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${text.slice(0,120)}`);
      }

      // Apps Script 常會回 HTML（權限/部署），這裡直接抓出來當錯
      if (!text.trim().startsWith("{") && !text.trim().startsWith("[")) {
        throw new Error("API not JSON: " + text.slice(0,120));
      }

      const json = JSON.parse(text);

      // 後端回 ok:false 也要當錯（讓 UI 顯示原因）
      if (json && json.ok === false) {
        throw new Error(json.error || "API ok:false");
      }

      return json;
    } catch (e) {
      lastErr = e;
      // timeout/網路問題 -> 重試
      if (attempt < retries) continue;
      throw lastErr;
    } finally {
      clearTimeout(t);
    }
  }

  // should never reach
  throw lastErr || new Error("unknown api error");
}
