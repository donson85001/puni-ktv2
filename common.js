// common.js (GET only - avoid CORS issues on GitHub Pages)

const API = "https://script.google.com/macros/s/AKfycbz4nuUA7KXBJWEKZW4Q5hpBsOGy3cD_f-vyu0nUHys3ySc1akT-YBXnnIMFqXnlj2zS/exec";

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

// api(action, payloadObj)
// → GET /exec?action=xxx&payload=JSON.stringify(payloadObj)
async function api(action, payloadObj){
  const url = new URL(API);
  url.searchParams.set("action", action);
  if (payloadObj && Object.keys(payloadObj).length){
    url.searchParams.set("payload", JSON.stringify(payloadObj));
  }

  const res = await fetch(url.toString(), { method: "GET" });
  const text = await res.text();

  // 有時候 Apps Script 回來不是 JSON（部署/權限/錯誤）
  try{
    return JSON.parse(text);
  }catch(e){
    throw new Error("API not JSON: " + text.slice(0,200));
  }
}
