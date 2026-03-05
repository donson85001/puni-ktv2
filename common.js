// common.js
// 把這裡改成你 Apps Script Web App 的部署網址（/exec）
const API = "https://script.google.com/macros/s/AKfycbzzE30Yr6i4L2LkrMI_Jrku-7y9ENSrYtL5kLT0POs4NsNQci6IGB6FJFHp5LecNalN/exec";

async function api(action, params={}){
  const url = new URL(API);
  url.searchParams.set("action", action);
  Object.entries(params).forEach(([k,v])=>url.searchParams.set(k, v));
  const r = await fetch(url.toString(), { method: "GET" });
  return r.json();
}
