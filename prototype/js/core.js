/* Smart Cash prototype — state, rules, accounts, workflow, notifications, export, backup, import. */
(function(){
const D = window.SCDATA, GEO = window.SCGEO || [];
const SC = window.SC = {};

/* ------------------------------------------------------------------ languages */
SC.LANGS = [
  {code:"ar", native:"العربية", en:"Arabic", dir:"rtl"}, {code:"en", native:"English", en:"English", dir:"ltr"},
  {code:"fr", native:"Français", en:"French", dir:"ltr"}, {code:"ur", native:"اردو", en:"Urdu", dir:"rtl"},
  {code:"hi", native:"हिन्दी", en:"Hindi", dir:"ltr"}, {code:"bn", native:"বাংলা", en:"Bengali", dir:"ltr"},
  {code:"fil", native:"Filipino", en:"Filipino", dir:"ltr"}, {code:"ml", native:"മലയാളം", en:"Malayalam", dir:"ltr"},
  {code:"ne", native:"नेपाली", en:"Nepali", dir:"ltr"}, {code:"id", native:"Bahasa Indonesia", en:"Indonesian", dir:"ltr"},
  {code:"fa", native:"فارسی", en:"Persian", dir:"rtl"}, {code:"tr", native:"Türkçe", en:"Turkish", dir:"ltr"},
];

/* ------------------------------------------------------------------ storage */
const store = {
  get(k, d){ try{ const v = localStorage.getItem("sc2."+k); return v===null ? d : v }catch{ return d } },
  set(k, v){ try{ localStorage.setItem("sc2."+k, v); return true }catch{ return false } },
};
SC.store = store;
SC.WS = ["personal","business","enterprise"];
SC.ws = SC.WS.includes(store.get("ws","")) ? store.get("ws","") : "enterprise";
function loadState(){
  let s = null;
  try{ const raw = store.get("state."+SC.ws, null); if(raw){ const x = JSON.parse(raw); if(x && x.v === D.VERSION) s = x } }catch{}
  s = s || D.seedFor(SC.ws);
  s.plan ||= SC.ws; s.integrations ||= D.integrationDefaults(s.plan); s.waOutbox ||= [];
  return s;
}
SC.S = loadState();
let userIdx = null;
const reindex = () => { userIdx = new Map(SC.S.users.map(u=>[u.id,u])) };
reindex(); SC.reindex = reindex;
SC.save = () => { if(!store.set("state."+SC.ws, JSON.stringify(SC.S))) SC.saveFailed = true };
SC.reset = () => { SC.S = D.seedFor(SC.ws); reindex(); SC.save(); idbClear() };
SC.switchWs = ws => { if(!SC.WS.includes(ws) || ws===SC.ws) return; SC.save(); SC.ws = ws; store.set("ws", ws); SC.S = loadState(); reindex() };
SC.plan = () => SC.S.plan;
SC.orgName = () => pickName(SC.S.org?.name);

/* images (IndexedDB) */
let idbP = null;
function idb(){ if(idbP) return idbP; idbP = new Promise(res=>{ try{ const rq = indexedDB.open("smartcash", 1); rq.onupgradeneeded = () => rq.result.createObjectStore("img"); rq.onsuccess = () => res(rq.result); rq.onerror = () => res(null) }catch{ res(null) } }); return idbP }
SC.imgPut = async (id, blob) => { const db = await idb(); if(!db) return false; return new Promise(r=>{ try{ const tx = db.transaction("img","readwrite"); tx.objectStore("img").put(blob, id); tx.oncomplete=()=>r(true); tx.onerror=()=>r(false) }catch{ r(false) } }) };
SC.imgGet = async (id) => { const db = await idb(); if(!db) return null; return new Promise(r=>{ try{ const q = db.transaction("img").objectStore("img").get(id); q.onsuccess=()=>r(q.result||null); q.onerror=()=>r(null) }catch{ r(null) } }) };
async function idbClear(){ const db = await idb(); if(!db) return; try{ db.transaction("img","readwrite").objectStore("img").clear() }catch{} }

/* ------------------------------------------------------------------ i18n & format */
SC.ui = {lang: store.get("lang","ar"), theme: store.get("theme","system")};
SC.lang = () => SC.LANGS.find(l=>l.code===SC.ui.lang) || SC.LANGS[0];
SC.t = (k, vars) => {
  const I = window.SCI18N || {};
  let s = (I[SC.ui.lang] && I[SC.ui.lang][k]) ?? (I.en && I.en[k]) ?? k;
  if(vars) for(const [a,b] of Object.entries(vars)) s = s.split("{"+a+"}").join(b);
  return s;
};
SC.tn = k => { const I = window.SCI18N||{}; return (I.en && I.en[k]!==undefined) ? SC.t(k) : k };
const pickName = n => Array.isArray(n) ? (SC.ui.lang==="ar" ? n[0] : n[1]) : (n || "");
SC.nm = k => D.NAMES[k] ? pickName(D.NAMES[k]) : (k || "");
SC.esc = s => String(s ?? "").replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
SC.fmt = n => Number(n||0).toLocaleString("en-US",{minimumFractionDigits:2, maximumFractionDigits:2});
SC.fmt0 = n => Number(n||0).toLocaleString("en-US",{maximumFractionDigits:0});
SC.cur = () => SC.t("cur");
const pad = n => String(n).padStart(2,"0");
const riy = iso => new Date(new Date(iso).getTime() + 3*3600e3);
SC.dt = iso => { if(!iso) return ""; const d = riy(iso); return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth()+1)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` };
SC.dd = iso => { if(!iso) return ""; const d = riy(iso); return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth()+1)}/${d.getUTCFullYear()}` };
SC.ago = iso => { const m = Math.round((Date.now()-new Date(iso))/60000); if(m<1) return SC.t("just_now"); if(m<60) return SC.t("min_ago",{n:m}); const h = Math.round(m/60); if(h<24) return SC.t("h_ago",{n:h}); return SC.dt(iso) };
SC.fno = n => "BT-" + String(n).padStart(6,"0");
SC.now = () => new Date().toISOString();
SC.r2 = D.r2;

/* ------------------------------------------------------------------ geography & org */
SC.GEO = GEO;
SC.region = k => GEO.find(r=>r.k===k);
SC.regionOfGov = g => GEO.find(r=>r.gov.some(x=>x[0]===g));
SC.govName = g => { const r = SC.regionOfGov(g); const x = r && r.gov.find(v=>v[0]===g); return x ? (SC.ui.lang==="ar" ? x[1] : x[2]) : (g||"") };
SC.regionName = k => { const r = SC.region(k); return r ? (SC.ui.lang==="ar" ? r.ar : r.en) : (k||"") };
SC.branch = id => SC.S.branches.find(b=>b.id===id);
SC.branchName = id => pickName(SC.branch(id)?.name) || id || "";
SC.project = id => SC.S.projects.find(p=>p.id===id);
SC.projName = id => pickName(SC.project(id)?.name) || id || "";

/* ------------------------------------------------------------------ people & permissions */
SC.user = id => { if(!userIdx || userIdx.size !== SC.S.users.length) reindex(); return userIdx.get(id) };
SC.me = () => SC.S.session && SC.user(SC.S.session.user);
SC.uname = id => { const u = SC.user(id); return u ? pickName(u.name) : (id||"") };
SC.first = id => SC.uname(id).split(" ")[0];
SC.can = p => { const m = SC.me(); return !!m && (D.PERMS[m.role]||[]).includes(p) };
SC.roleOf = id => SC.user(id)?.role;
SC.sees = (rec) => {
  const m = SC.me(); if(!m) return false;
  const ownerId = rec.by || rec.holder, owner = SC.user(ownerId);
  switch(D.SCOPE[m.role]){
    case "self":    return ownerId === m.id;
    case "team":    return ownerId === m.id || owner?.reportsTo === m.id;
    case "project": return rec.project === m.project;
    case "branch":  return rec.branch === m.branch;
    default:        return true;
  }
};
SC.visibleInvoices = () => SC.S.invoices.filter(SC.sees);
SC.inbox = () => { const m = SC.me(); if(!m) return []; return SC.S.invoices.filter(i => i.status==="review" && i.steps[i.idx]===m.role && i.by!==m.id && SC.sees(i)) };
SC.poInbox = () => { const m = SC.me(); return m?.role==="pm" ? SC.S.pos.filter(p=>p.status==="pending" && p.project===m.project) : [] };
/* who should be told when an invoice reaches a step */
SC.approversFor = (inv, role) => {
  const owner = SC.user(inv.by);
  if(role==="supervisor") return owner?.reportsTo ? [owner.reportsTo] : [];
  if(role==="engineer"||role==="pm") return SC.S.users.filter(u=>u.role===role && u.project===inv.project && u.status==="active").map(u=>u.id);
  if(role==="accountant") return SC.S.users.filter(u=>u.role==="accountant" && u.branch===inv.branch && u.status==="active").map(u=>u.id);
  if(role==="owner") return SC.S.users.filter(u=>u.role==="owner" && u.status==="active").map(u=>u.id);
  return SC.S.users.filter(u=>u.role===role && u.status==="active").map(u=>u.id);
};

/* ------------------------------------------------------------------ audit & notifications */
SC.audit = (ev, d) => { const m = SC.me(); SC.S.audit.unshift({t:SC.now(), by:m?.id||null, ev, d:d||""}); if(SC.S.audit.length>500) SC.S.audit.length = 500 };
SC.notify = (to, k, ref, extra) => {
  const me = SC.me()?.id; const list = [...new Set([].concat(to).filter(Boolean))].filter(x=>x!==me);
  list.forEach(id=>SC.S.notifs.unshift({id:"N"+(++SC.S.seq.n), to:id, k, ref, by:me||null, t:SC.now(), read:false, ...(extra||{})}));
  if(SC.S.notifs.length>800) SC.S.notifs.length = 800;
  const wa = SC.S.integrations?.wa;
  if(wa?.connected && wa.events?.[k]) list.forEach(id=>{ const u = SC.user(id); if(u && u.phone && u.phone!=="—"){
    SC.S.waOutbox.unshift({to:id, phone:u.phone, k, ref, by:me||null, t:SC.now(), status:"sent", ...(extra||{})}); } });
  if(SC.S.waOutbox.length>200) SC.S.waOutbox.length = 200;
};
SC.myNotifs = () => { const m = SC.me(); return m ? SC.S.notifs.filter(n=>n.to===m.id) : [] };
SC.unread = () => SC.myNotifs().filter(n=>!n.read).length;
SC.markRead = id => { const n = SC.S.notifs.find(x=>x.id===id); if(n) n.read = true };
SC.markAllRead = () => SC.myNotifs().forEach(n=>n.read=true);
const admins = () => SC.S.users.filter(u=>D.PERMS[u.role]?.includes("approve_accounts") && u.status==="active").map(u=>u.id);

/* ------------------------------------------------------------------ passwords & accounts */
SC.hash = async (pw, salt) => { const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${pw}`)); return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("") };
SC.policy = pw => { const p = String(pw||""); if(p.length<8) return "pw_short"; if(!/[A-Za-z]/.test(p) || !/\d/.test(p)) return "pw_mix"; return null };
SC.tempPassword = () => { const a = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"; const r = new Uint32Array(8); crypto.getRandomValues(r); const s = [...r].map(x=>a[x%a.length]).join(""); return `Sc-${s.slice(0,4)}-${s.slice(4)}7` };
async function checkPw(u, pw){ if(!u.pw) return pw === D.PASSWORD; return (await SC.hash(pw, u.id)) === u.pw }
async function setPw(u, pw, mustChange){ u.pw = await SC.hash(pw, u.id); u.mustChange = !!mustChange; u.pwAt = SC.now(); u.fails = 0; if(u.status==="locked") u.status = "active" }
SC.findLogin = ident => { const id = String(ident||"").trim().toLowerCase(); return SC.S.users.find(x => x.email.toLowerCase()===id || (x.emp && x.emp.toLowerCase()===id)) };

SC.login = (userId, via) => {
  const u = SC.user(userId); if(!u || u.status!=="active") return false;
  SC.S.session = {user:u.id, t:SC.now(), via};
  u.sessions.unshift({device:"dev_this", place:"Riyadh", t:SC.now(), via}); u.sessions.length = Math.min(u.sessions.length, 8);
  SC.audit("au_login", via); return true;
};
SC.passwordLogin = async (ident, pass) => {
  const u = SC.findLogin(ident);
  if(!u) return "err_login";
  if(u.status==="pending") return "err_pending";
  if(u.status==="disabled") return "err_inactive";
  if(u.status==="locked") return "err_locked";
  if(!(await checkPw(u, pass))){
    u.fails = (u.fails||0) + 1;
    if(u.fails >= 5){ u.status = "locked"; SC.S.audit.unshift({t:SC.now(), by:u.id, ev:"au_locked", d:u.emp}); SC.notify(admins(), "n_locked", {type:"user", id:u.id}) }
    SC.save(); return u.status==="locked" ? "err_locked" : "err_login";
  }
  u.fails = 0; SC.login(u.id, "password"); SC.save();
  return u.mustChange ? "must_change" : null;
};
SC.googleLogin = (gmail) => {
  const u = SC.S.users.find(x => x.google && x.google.toLowerCase()===gmail.toLowerCase());
  if(!u) return "err_google_unlinked";
  if(u.status!=="active") return u.status==="pending" ? "err_pending" : u.status==="locked" ? "err_locked" : "err_inactive";
  SC.login(u.id, "google"); SC.save(); return null;
};
SC.logout = () => { SC.audit("au_logout"); SC.S.session = null; SC.save() };
SC.changePassword = async (oldPw, newPw, confirm) => {
  const u = SC.me(); if(!u) return "err_not_allowed";
  if(!u.mustChange && !(await checkPw(u, oldPw))) return "err_old_pw";
  if(newPw !== confirm) return "pw_mismatch";
  const p = SC.policy(newPw); if(p) return p;
  if(await checkPw(u, newPw)) return "pw_same";
  await setPw(u, newPw, false); SC.audit("au_pw_change"); SC.save(); return null;
};
SC.requestReset = (ident) => {
  const u = SC.findLogin(ident);
  if(u && u.status!=="pending" && !SC.S.requests.some(r=>r.kind==="reset" && r.user===u.id && r.status==="open")){
    SC.S.requests.unshift({id:"RQ-"+String(++SC.S.seq.rq).padStart(4,"0"), kind:"reset", user:u.id, t:SC.now(), status:"open"});
    admins().forEach(a=>SC.S.notifs.unshift({id:"N"+(++SC.S.seq.n), to:a, k:"n_reset_request", ref:{type:"user", id:u.id}, by:u.id, t:SC.now(), read:false}));
    SC.S.audit.unshift({t:SC.now(), by:u.id, ev:"au_reset_request", d:u.emp});
  }
  SC.save(); return null;    // same answer whether or not the account exists
};
SC.requestAccount = (d) => {
  const email = String(d.email||"").trim().toLowerCase();
  if(!d.name) return "err_name";
  if(!/^\S+@\S+\.\S+$/.test(email)) return "err_email";
  if(SC.S.users.some(u=>u.email.toLowerCase()===email)) return "err_email_taken";
  const id = "u_"+Date.now().toString(36);
  SC.S.users.push({id, name:[d.name, d.name], role:null, emp:"", email, google:null, reportsTo:null, branch:d.branch||null, project:null, limit:0,
    phone:d.phone||"—", status:"pending", pw:null, mustChange:true, fails:0, demo:false, sessions:[], request:{t:SC.now(), wantRole:d.role||"technician", note:d.note||""}});
  reindex();
  admins().forEach(a=>SC.S.notifs.unshift({id:"N"+(++SC.S.seq.n), to:a, k:"n_account_request", ref:{type:"user", id}, by:null, t:SC.now(), read:false}));
  SC.S.audit.unshift({t:SC.now(), by:null, ev:"au_account_request", d:email}); SC.save(); return null;
};
const nextEmp = role => { const p = {technician:"T",supervisor:"S",engineer:"E",pm:"M",accountant:"A",procurement:"P",finance:"F",admin:"IT"}[role]; let n = 3000; SC.S.users.forEach(u=>{ const m = (u.emp||"").match(new RegExp("^"+p+"-(\\d+)$")); if(m) n = Math.max(n, +m[1]) }); return `${p}-${n+1}` };
SC.createUser = async (d) => {
  if(!SC.can("users")) return {err:"err_not_allowed"};
  const email = String(d.email||"").trim().toLowerCase();
  if(!d.name) return {err:"err_name"};
  if(!/^\S+@\S+\.\S+$/.test(email)) return {err:"err_email"};
  if(SC.S.users.some(u=>u.email.toLowerCase()===email)) return {err:"err_email_taken"};
  const id = "u_"+Date.now().toString(36), temp = SC.tempPassword();
  const u = {id, name:[d.nameAr||d.name, d.name], role:d.role, emp:nextEmp(d.role), email, google:null, reportsTo:d.reportsTo||null, branch:d.branch||null,
    project:d.project||null, limit:D.DEFAULT_LIMIT[d.role] ?? 0, phone:d.phone||"—", status:"active", pw:null, mustChange:true, fails:0, demo:false, sessions:[]};
  SC.S.users.push(u); reindex(); await setPw(u, temp, true);
  SC.audit("au_user_add", `${u.emp} · ${d.role}`); SC.save(); return {user:u, temp};
};
SC.approveAccount = async (id, d) => {
  const u = SC.user(id); if(!u || u.status!=="pending" || !SC.can("approve_accounts")) return {err:"err_not_allowed"};
  Object.assign(u, {role:d.role, branch:d.branch||u.branch, project:d.project||null, reportsTo:d.reportsTo||null, limit:D.DEFAULT_LIMIT[d.role] ?? 0, emp:nextEmp(d.role), status:"active"});
  delete u.request; const temp = SC.tempPassword(); await setPw(u, temp, true);
  SC.audit("au_account_approved", `${u.emp} · ${u.email}`); SC.S.notifs.forEach(n=>{ if(n.ref?.id===id && n.k==="n_account_request") n.read = true }); SC.save();
  return {user:u, temp};
};
SC.rejectAccount = (id) => { const k = SC.S.users.findIndex(u=>u.id===id && u.status==="pending"); if(k<0) return "err_not_allowed"; const u = SC.S.users[k]; SC.S.users.splice(k,1); reindex(); SC.audit("au_account_rejected", u.email); SC.save(); return null };
SC.adminReset = async (id) => {
  const u = SC.user(id); if(!u || !SC.can("reset_password")) return {err:"err_not_allowed"};
  const temp = SC.tempPassword(); await setPw(u, temp, true);
  SC.S.requests.filter(r=>r.user===id && r.status==="open").forEach(r=>{ r.status = "done"; r.by = SC.me().id; r.done = SC.now() });
  SC.S.notifs.forEach(n=>{ if(n.ref?.id===id && n.k==="n_reset_request") n.read = true });
  SC.audit("au_pw_reset", u.emp); SC.save(); return {user:u, temp};
};
SC.setStatus = (id, status) => { const u = SC.user(id); if(!u || !SC.can("users")) return "err_not_allowed"; if(u.id===SC.me().id) return "err_self_deactivate"; u.status = status; if(status==="active") u.fails = 0; SC.audit("au_status", `${u.emp} · ${status}`); return null };
SC.pendingAccounts = () => SC.S.users.filter(u=>u.status==="pending");
SC.openResets = () => SC.S.requests.filter(r=>r.kind==="reset" && r.status==="open");
SC.lockedUsers = () => SC.S.users.filter(u=>u.status==="locked");

/* ------------------------------------------------------------------ branches & projects */
SC.addBranch = (d) => {
  if(!SC.can("add_branch")) return "err_not_allowed";
  if(!d.nameAr && !d.nameEn) return "err_name";
  if(!d.gov) return "err_gov";
  const id = (d.code||"").toUpperCase().replace(/[^A-Z]/g,"").slice(0,4) || ("B"+(++SC.S.seq.br));
  if(SC.branch(id)) return "err_code_taken";
  SC.S.branches.push({id, name:[d.nameAr||d.nameEn, d.nameEn||d.nameAr], region:SC.regionOfGov(d.gov).k, gov:d.gov});
  SC.audit("au_branch_add", id); return null;
};
SC.addProject = (d) => {
  if(!SC.can("add_project")) return {err:"err_not_allowed"};
  if(!d.nameAr && !d.nameEn) return {err:"err_name"};
  if(!d.branch) return {err:"err_branch"};
  if(!(d.budget>0)) return {err:"err_budget"};
  const n = SC.S.projects.filter(p=>p.branch===d.branch).length + 1;
  const id = `P-${d.branch}-${String(n).padStart(2,"0")}`;
  const b = SC.branch(d.branch), gov = d.gov || b.gov;
  const p = {id, name:[d.nameAr||d.nameEn, d.nameEn||d.nameAr], branch:d.branch, region:SC.regionOfGov(gov).k, gov, pm:d.pm||null, budget:SC.r2(d.budget), status:"active", created:SC.now()};
  SC.S.projects.push(p);
  if(d.pm){ const pm = SC.user(d.pm); pm.project = id; pm.branch = d.branch; SC.notify(d.pm, "n_project_assigned", {type:"project", id}) }
  SC.audit("au_project_add", `${id} · ${SC.fmt0(p.budget)}`); return {project:p};
};
SC.updateProject = (id, d) => {
  const p = SC.project(id); if(!p || !(SC.can("add_project"))) return "err_not_allowed";
  if(d.budget!==undefined){ if(!(d.budget>0)) return "err_budget"; SC.audit("au_budget", `${id} · ${SC.fmt0(p.budget)} → ${SC.fmt0(d.budget)}`); p.budget = SC.r2(d.budget) }
  if(d.pm!==undefined && d.pm!==p.pm){ SC.audit("au_project_pm", `${id} · ${p.pm||"—"} → ${d.pm||"—"}`); p.pm = d.pm || null; if(d.pm){ const u = SC.user(d.pm); u.project = id; u.branch = p.branch; SC.notify(d.pm,"n_project_assigned",{type:"project", id}) } }
  return null;
};
SC.projectStats = (id) => {
  const p = SC.project(id); const inv = SC.S.invoices.filter(i=>i.project===id);
  const spent = SC.r2(inv.filter(i=>i.status==="approved").reduce((s,i)=>s+i.total - SC.credited(i),0));
  const pending = SC.r2(inv.filter(i=>i.status==="review"||i.status==="returned").reduce((s,i)=>s+i.total,0));
  const pos = SC.r2(SC.S.pos.filter(o=>o.project===id && o.status!=="pending").reduce((s,o)=>s+SC.poTotal(o)*1.15,0));
  const advances = SC.S.advances.filter(a=>a.project===id);
  const issued = SC.r2(advances.reduce((s,a)=>s+a.moves.filter(m=>m.kind!=="refund").reduce((x,m)=>x+m.amt,0),0));
  const team = SC.S.users.filter(u=>u.project===id && u.status!=="pending");
  const used = SC.r2(spent + pos), pct = p.budget ? used / p.budget : 0;
  return {p, spent, pending, pos, used, issued, advances:advances.length, team:team.length, pct, level: pct>=1 ? "over" : pct>=.8 ? "near" : "ok"};
};

/* ------------------------------------------------------------------ advances */
SC.adv = id => SC.S.advances.find(a=>a.id===id);
SC.advOf = userId => SC.S.advances.find(a=>a.holder===userId && a.status==="active");
SC.advStats = a => {
  const inv = SC.S.invoices.filter(i=>i.adv===a.id), sum = arr => SC.r2(arr.reduce((s,i)=>s+i.total,0));
  const issued = SC.r2(a.moves.filter(m=>m.kind==="issue"||m.kind==="topup").reduce((s,m)=>s+m.amt,0));
  const refunded = SC.r2(a.moves.filter(m=>m.kind==="refund").reduce((s,m)=>s+m.amt,0));
  const approved = sum(inv.filter(i=>i.status==="approved")), credits = SC.r2(inv.reduce((s,i)=>s+SC.credited(i),0));
  const review = sum(inv.filter(i=>i.status==="review")), returned = sum(inv.filter(i=>i.status==="returned")), rejected = sum(inv.filter(i=>i.status==="rejected"));
  return {issued, approved, credits, review, returned, rejected, refunded, balance: SC.r2(issued - approved + credits - refunded)};
};
SC.issueAdvance = (d) => {
  if(!SC.can("issue_advance")) return {err:"err_not_allowed"};
  const u = SC.user(d.holder); if(!u || u.status!=="active") return {err:"err_holder"};
  if(!(d.amount>0)) return {err:"enter_amount"};
  if(SC.advOf(u.id)) return {err:"err_unsettled"};
  const a = {id:"CU-"+String(++SC.S.seq.cu).padStart(6,"0"), holder:u.id, type:d.type||"employee", project:u.project, branch:u.branch, status:"active", due:d.due||"",
    moves:[{kind:"issue", amt:SC.r2(d.amount), t:SC.now(), by:SC.me().id, note:d.note||""}]};
  SC.S.advances.unshift(a);
  SC.notify([u.id, ...SC.approversFor({by:u.id, project:u.project, branch:u.branch}, "accountant")], "n_advance_issued", {type:"advance", id:a.id}, {amt:a.moves[0].amt});
  SC.audit("au_advance", `${a.id} · ${u.emp} · ${SC.fmt(a.moves[0].amt)}`); return {adv:a};
};
SC.topUp = (advId, amount, note) => {
  if(!SC.can("topup")) return "err_not_allowed"; const a = SC.adv(advId); if(!a || a.status!=="active") return "err_not_allowed";
  if(!(amount>0)) return "enter_amount";
  a.moves.push({kind:"topup", amt:SC.r2(amount), t:SC.now(), by:SC.me().id, note:note||""});
  SC.notify(a.holder, "n_topup", {type:"advance", id:a.id}, {amt:SC.r2(amount)});
  SC.audit("au_topup", `${a.id} · ${SC.fmt(amount)}`); return null;
};

/* ------------------------------------------------------------------ folders */
SC.folder = no => SC.S.folders.find(f=>f.no===+no);
SC.folderInv = no => SC.S.invoices.filter(i=>i.folder===+no).sort((a,b)=>a.seq-b.seq);
SC.folderStats = no => {
  const inv = SC.folderInv(no), s = st => SC.r2(inv.filter(i=>st.includes(i.status)).reduce((a,i)=>a+i.total,0));
  return {n:inv.length, total:SC.r2(inv.reduce((a,i)=>a+i.total,0)), vat:SC.r2(inv.reduce((a,i)=>a+i.vat,0)), approved:s(["approved"]), pending:s(["review","returned"]),
    rejected:s(["rejected"]), withdrawn:s(["withdrawn"]), from: inv[0]?.date, to: inv.at(-1)?.date};
};
SC.folderVisible = f => { const a = SC.adv(f.adv); return a && SC.sees({holder:a.holder, project:a.project, branch:a.branch}) };
SC.currentFolder = advId => SC.S.folders.find(x=>x.adv===advId && x.status==="open") || null;       // read-only (no side effects)
SC.nextFolderNo = advId => SC.currentFolder(advId)?.no ?? SC.S.seq.folder;
const openFolderFor = advId => { let f = SC.currentFolder(advId); if(!f){ f = {no:SC.S.seq.folder++, adv:advId, status:"open", sigs:{}}; SC.S.folders.push(f); SC.audit("au_folder_open", SC.fno(f.no)) } return f };
SC.closeFolder = (f, reason, note) => {
  f.status = "closed"; f.reason = reason; f.note = note||""; f.closedAt = SC.now(); f.closedBy = SC.me()?.id;
  const a = SC.adv(f.adv); SC.notify(SC.approversFor({by:a.holder, project:a.project, branch:a.branch}, "accountant"), "n_folder_closed", {type:"folder", id:f.no});
  SC.audit("au_folder_close", `${SC.fno(f.no)} · ${reason}`);
};
SC.signFolder = (f) => {
  const m = SC.me(); const role = m.role==="owner" ? "owner" : m.role==="finance" ? "finance" : "accountant";
  f.sigs[role] = {by:m.id, t:SC.now()};
  if(f.sigs.owner || (f.sigs.accountant && f.sigs.finance)){ f.status = "approved"; SC.notify(SC.adv(f.adv).holder, "n_folder_approved", {type:"folder", id:f.no}) }
  else if(f.status==="closed") f.status = "in_review";
  SC.audit("au_sign", SC.fno(f.no));
};

/* ------------------------------------------------------------------ invoice workflow */
SC.inv = id => SC.S.invoices.find(i=>i.id===id);
SC.addHist = (inv, ev, extra) => inv.hist.push({t:SC.now(), ev, by:SC.me()?.id, ...extra});
SC.pathFor = (total, cat) => SC.S.plan==="business" ? ["owner"] : D.path(total, cat);
SC.newInvoice = (d) => {
  const m = SC.me(), a = SC.advOf(m.id);
  if(!a) return {err:"err_no_advance"};
  const f = openFolderFor(a.id), seq = SC.folderInv(f.no).length + 1;
  const inv = {id:"EX-"+String(++SC.S.seq.ex).padStart(7,"0"), folder:f.no, seq, adv:a.id, by:m.id, project:a.project, branch:a.branch,
    sup:d.sup||null, supName:d.supName||null, vatNo:d.vatNo||null, invNo:d.invNo||"", kind:d.kind, cat:d.cat, date:d.date||SC.now(),
    sub:SC.r2(d.total-d.vat), vat:d.vat, total:d.total, items:d.items||[], src:d.src, status:"review", steps:SC.pathFor(d.total, d.cat), idx:0, retStep:null,
    hist:[], credits:[], comments:[], hash:d.hash||null, img:!!d.img, note:d.note||""};
  SC.addHist(inv, "captured", {via:d.via});
  SC.addHist(inv, d.src==="qr" ? "read_qr" : d.src==="ai" ? "read_ai" : "manual");
  SC.addHist(inv, "foldered", {folder:f.no, seq});
  SC.S.invoices.push(inv);
  let closed = null; if(seq >= 30){ SC.closeFolder(f, "reached_30"); closed = f.no }
  SC.notify(SC.approversFor(inv, inv.steps[0]), "n_inbox", {type:"invoice", id:inv.id});
  SC.audit("au_submit", `${inv.id} · ${SC.fno(f.no)} #${seq}`);
  return {inv, closed};
};
SC.mayDecide = inv => { const m = SC.me(); return !!m && inv.status==="review" && inv.steps[inv.idx]===m.role && inv.by!==m.id && SC.sees(inv) && SC.can("approve") };
SC.approve = (inv, note) => {
  if(!SC.mayDecide(inv)) return "err_not_allowed";
  const isLast = inv.idx === inv.steps.length - 1;
  if(isLast && inv.total > SC.advStats(SC.adv(inv.adv)).balance + 0.001) return "err_overdraft";
  SC.addHist(inv, "approved", {step:inv.steps[inv.idx], note});
  inv.idx++;
  if(inv.idx >= inv.steps.length){ inv.status = "approved"; SC.addHist(inv, "posted"); SC.notify(inv.by, "n_approved", {type:"invoice", id:inv.id}) }
  else SC.notify(SC.approversFor(inv, inv.steps[inv.idx]), "n_inbox", {type:"invoice", id:inv.id});
  SC.audit("au_approve", `${inv.id} · ${SC.t("role_"+inv.steps[inv.idx-1])}`);
  return null;
};
SC.bulkApprove = ids => { let ok = 0, fail = 0; ids.forEach(id=>{ const i = SC.inv(id); if(i && !SC.approve(i)) ok++; else fail++ }); return {ok, fail} };
SC.returnInv = (inv, note) => {
  if(!SC.mayDecide(inv)) return "err_not_allowed";
  inv.status = "returned"; inv.retStep = inv.idx; SC.addHist(inv, "returned", {step:inv.steps[inv.idx], note});
  SC.notify(inv.by, "n_returned", {type:"invoice", id:inv.id}); SC.audit("au_return", inv.id); return null;
};
SC.reject = (inv, note) => {
  if(!SC.mayDecide(inv)) return "err_not_allowed";
  inv.status = "rejected"; SC.addHist(inv, "rejected", {step:inv.steps[inv.idx], note});
  SC.notify(inv.by, "n_rejected", {type:"invoice", id:inv.id}); SC.audit("au_reject", inv.id); return null;
};
SC.mayWithdraw = inv => { const m = SC.me(); return !!m && inv.by===m.id && inv.status==="review" && inv.idx===0 };
SC.withdraw = inv => { if(!SC.mayWithdraw(inv)) return "err_not_allowed"; inv.status = "withdrawn"; SC.addHist(inv, "withdrawn"); SC.audit("au_withdraw", inv.id); return null };
SC.mayEdit = inv => { const m = SC.me(); return !!m && inv.by===m.id && (inv.status==="returned" || (inv.status==="review" && inv.idx===0)) };
SC.resubmit = (inv, ch) => {
  if(!SC.mayEdit(inv)) return "err_not_allowed";
  const wasReturned = inv.status==="returned", changed = [];
  if(ch.total && ch.total !== inv.total){ changed.push(`${SC.fmt(inv.total)} → ${SC.fmt(ch.total)}`); inv.total = ch.total; inv.vat = D.vatOf(ch.total, inv.kind); inv.sub = SC.r2(inv.total-inv.vat) }
  if(ch.cat && ch.cat !== inv.cat){ changed.push(`${SC.t("cat_"+inv.cat)} → ${SC.t("cat_"+ch.cat)}`); inv.cat = ch.cat }
  if(ch.invNo!==undefined && ch.invNo !== inv.invNo){ changed.push(`${SC.t("inv_no")}: ${ch.invNo}`); inv.invNo = ch.invNo }
  const newSteps = SC.pathFor(inv.total, inv.cat), same = newSteps.join()===inv.steps.join();
  inv.steps = newSteps; inv.idx = wasReturned && same ? inv.retStep : 0; inv.status = "review";
  SC.addHist(inv, wasReturned ? "resubmitted" : "edited", {note:[ch.note, changed.join(" · ")].filter(Boolean).join(" — ")});
  SC.notify(SC.approversFor(inv, inv.steps[inv.idx]), "n_inbox", {type:"invoice", id:inv.id});
  SC.audit(wasReturned ? "au_resubmit" : "au_edit", inv.id); return null;
};
SC.credited = inv => SC.r2((inv.credits||[]).reduce((s,c)=>s+c.amt,0));
SC.mayCredit = inv => inv.status==="approved" && SC.can("credit_note") && SC.sees(inv) && SC.credited(inv) < inv.total && !SC.folder(inv.folder)?.locked;
SC.credit = (inv, amt, reason) => {
  if(!SC.mayCredit(inv)) return "err_not_allowed";
  if(!(amt>0) || amt > SC.r2(inv.total - SC.credited(inv)) + 0.001) return "err_credit_amount";
  const cn = "CN-"+String(++SC.S.seq.cn).padStart(6,"0");
  inv.credits.push({cn, amt:SC.r2(amt), reason, by:SC.me().id, t:SC.now()});
  SC.addHist(inv, "credit", {cn, amt:SC.r2(amt), note:reason});
  SC.notify(inv.by, "n_credit", {type:"invoice", id:inv.id}, {amt:SC.r2(amt)}); SC.audit("au_credit", `${cn} · ${inv.id}`); return null;
};
/* comments: owner and everyone who acted on it are told */
SC.comment = (kind, id, text) => {
  const m = SC.me(); text = String(text||"").trim(); if(!text) return "err_comment_empty";
  if(!SC.can("comment") && !SC.can("users")) return "err_not_allowed";
  const rec = kind==="invoice" ? SC.inv(id) : SC.pr(id); if(!rec) return "err_not_allowed";
  (rec.comments ||= []).push({by:m.id, t:SC.now(), text});
  const people = new Set([rec.by]); (rec.hist||[]).forEach(h=>h.by && people.add(h.by)); rec.comments.forEach(c=>people.add(c.by));
  if(kind==="invoice" && rec.status==="review") SC.approversFor(rec, rec.steps[rec.idx]).forEach(x=>people.add(x));
  SC.notify([...people], "n_comment", {type:kind, id});
  if(kind==="invoice") SC.addHist(rec, "commented");
  SC.audit("au_comment", id); return null;
};

/* duplicate & sanity checks */
SC.checks = (d) => {
  const out = [], others = SC.S.invoices.filter(i => !["rejected","withdrawn"].includes(i.status));
  if(d.hash && others.some(i=>i.hash===d.hash)) out.push({sev:"critical", k:"flag_dup_image"});
  if(d.vatNo && d.invNo && others.some(i=>i.vatNo===d.vatNo && i.invNo===d.invNo)) out.push({sev:"critical", k:"flag_dup_number"});
  const dup = others.find(i => ((i.sup && i.sup===d.sup) || (d.vatNo && i.vatNo===d.vatNo)) && Math.abs(i.total-d.total)<0.01 && Math.abs(new Date(i.date)-new Date(d.date)) < 3*864e5);
  if(dup) out.push({sev:"warning", k:"flag_dup_claim", v:{id:dup.id}});
  if(d.kind==="tax_simplified"||d.kind==="tax_standard"){
    if(!d.vatNo) out.push({sev:"critical", k:"flag_vat_missing"});
    else if(!/^3\d{13}3$/.test(d.vatNo)) out.push({sev:"critical", k:"flag_vat_format"});
    const exp = D.vatOf(d.total, d.kind); if(Math.abs(exp - d.vat) > 0.05) out.push({sev:"warning", k:"flag_vat_mismatch", v:{e:SC.fmt(exp)}});
  } else if(d.vat > 0) out.push({sev:"critical", k:"flag_vat_on_regular"});
  if(d.items && d.items.length){ const s = SC.r2(d.items.reduce((a,x)=>a+(+x[3]||0),0)); if(Math.abs(s - d.total) > 0.05) out.push({sev:"warning", k:"flag_total_mismatch", v:{s:SC.fmt(s)}}) }
  if(!(d.total>0)) out.push({sev:"critical", k:"flag_no_total"});
  const a = SC.advOf(SC.me()?.id);
  if(!a) out.push({sev:"critical", k:"err_no_advance"});
  else { const st = SC.advStats(a); if(d.total > st.balance - st.review) out.push({sev:"warning", k:"flag_low_balance"}) }
  return out;
};

/* ------------------------------------------------------------------ suppliers & procurement */
SC.sup = k => SC.S.suppliers.find(s=>s.k===k);
SC.supNm = k => pickName(SC.sup(k)?.name) || SC.nm(k);
SC.addSupplier = (d) => {
  if(!SC.can("add_supplier")) return {err:"err_not_allowed"};
  if(!d.nameAr && !d.nameEn) return {err:"err_name"};
  const vat = (d.vat||"").replace(/\s/g,"");
  if(vat && !/^3\d{13}3$/.test(vat)) return {err:"flag_vat_format"};
  if(vat && SC.S.suppliers.some(s=>s.vat===vat)) return {err:"err_vat_taken"};
  if(d.cr && !/^\d{10}$/.test(d.cr)) return {err:"err_cr"};
  if(!d.gov) return {err:"err_gov"};
  const k = "s_"+Date.now().toString(36);
  const s = {k, name:[d.nameAr||d.nameEn, d.nameEn||d.nameAr], vat:vat||null, cr:d.cr||null, cats:[d.cat||"other"], gov:d.gov, rating:null, phone:d.phone||"—", by:SC.me().id, t:SC.now()};
  SC.S.suppliers.push(s); SC.notify(SC.S.users.filter(u=>u.role==="procurement" && u.status==="active").map(u=>u.id), "n_supplier_added", {type:"supplier", id:k});
  SC.audit("au_supplier_add", `${pickName(s.name)}${vat?` · ${vat}`:""}`); return {supplier:s};
};
SC.pr = id => SC.S.prs.find(p=>p.id===id);
SC.po = id => SC.S.pos.find(p=>p.id===id);
SC.newPR = (item, qty) => {
  const m = SC.me(); const R = (k)=> (k*9301+49297)%233280/233280;
  const base = {i_pads:85,i_oilf:33,i_oil:96,i_cable:410,i_helmet:39,i_gloves:15.5,i_drill:240,i_tape:12,i_paper:115,i_water:19}[item] || 50;
  const quotes = ["noor","aman","rowad"].map((k,j)=>({sup:k, price:SC.r2(base*(0.94+R(qty*7+j*13+SC.S.seq.pr)*0.16)), days:1+((qty+j)%4)}));
  const pr = {id:"PR-"+String(++SC.S.seq.pr).padStart(6,"0"), by:m.id, project:m.project, t:SC.now(), status:"new", lines:[{item, qty}], quotes, comments:[]};
  SC.S.prs.unshift(pr); SC.notify(SC.S.users.filter(u=>u.role==="procurement" && u.status==="active").map(u=>u.id), "n_pr_new", {type:"pr", id:pr.id});
  SC.audit("au_pr", pr.id); return pr;
};
SC.rejectPR = (pr, note) => { if(!SC.can("create_po") || pr.status!=="new") return "err_not_allowed"; pr.status = "rejected"; pr.note = note; (pr.comments ||= []).push({by:SC.me().id, t:SC.now(), text:note}); SC.notify(pr.by, "n_pr_rejected", {type:"pr", id:pr.id}); SC.audit("au_pr_reject", pr.id); return null };
SC.createPO = (pr, sup) => {
  const q = pr.quotes.find(x=>x.sup===sup), total = SC.r2(pr.lines.reduce((s,l)=>s+l.qty*q.price,0));
  const po = {id:"PO-"+String(++SC.S.seq.po).padStart(6,"0"), pr:pr.id, sup, project:pr.project, by:SC.me().id, t:SC.now(),
    status: total > 5000 ? "pending" : "ordered", lines:pr.lines.map(l=>({item:l.item, qty:l.qty, price:q.price, rec:0, inv:0})), receipts:[], invoice:null};
  pr.status = "ordered"; pr.po = po.id; SC.S.pos.unshift(po);
  SC.notify(pr.by, "n_pr_ordered", {type:"po", id:po.id});
  if(po.status==="pending") SC.notify(SC.S.users.filter(u=>u.role==="pm" && u.project===po.project).map(u=>u.id), "n_po", {type:"po", id:po.id});
  SC.audit("au_po", `${po.id} · ${SC.fmt(total)}`); return po;
};
SC.poTotal = po => SC.r2(po.lines.reduce((s,l)=>s+l.qty*l.price,0));
SC.approvePO = po => { po.status = "ordered"; po.approvedBy = SC.me().id; SC.notify(po.by, "n_po_approved", {type:"po", id:po.id}); SC.audit("au_po_approve", po.id) };
SC.receivePO = (po, qtys) => { po.lines.forEach((l,i)=>{ l.rec = Math.min(l.qty, (l.rec||0) + (+qtys[i]||0)) }); po.receipts.push({by:SC.me().id, t:SC.now(), q:qtys.map(Number)}); po.status = po.lines.every(l=>l.rec>=l.qty) ? "received" : "partial"; SC.notify(po.by, "n_po_received", {type:"po", id:po.id}); SC.audit("au_receipt", po.id) };
SC.matchPO = (po, invNo, qtys) => { po.lines.forEach((l,i)=>{ l.inv = +qtys[i]||0 }); po.invoice = {no:invNo, total:SC.r2(po.lines.reduce((s,l)=>s+l.inv*l.price,0)*1.15), t:SC.now()}; po.status = po.lines.every(l=>l.inv===l.rec && l.rec===l.qty) ? "matched" : "mismatch"; if(po.status==="mismatch") SC.notify(SC.S.users.filter(u=>u.role==="finance").map(u=>u.id), "n_po_mismatch", {type:"po", id:po.id}); SC.audit("au_match", `${po.id} · ${po.status}`) };
SC.lineMatch = l => l.inv===0 ? "none" : (l.inv===l.rec && l.rec===l.qty) ? "ok" : "bad";

/* ------------------------------------------------------------------ analytics */
SC.spendSeries = (invs, days=30) => {
  const end = new Date(); end.setUTCHours(23,59,59,999);
  const out = Array.from({length:days},(_,k)=>({d:new Date(end.getTime() - (days-1-k)*864e5), v:0}));
  invs.filter(i=>i.status==="approved"||i.status==="review").forEach(i=>{ const k = days-1-Math.floor((end - new Date(i.date))/864e5); if(k>=0 && k<days) out[k].v += i.total });
  return out;
};
SC.byCategory = (invs) => { const by = {}; invs.filter(i=>i.status==="approved").forEach(i=>by[i.cat]=(by[i.cat]||0)+i.total); return Object.entries(by).sort((a,b)=>b[1]-a[1]) };

/* ------------------------------------------------------------------ capabilities */
const cap = name => (window.claude && typeof window.claude.use==="function") ? window.claude.use(name).catch(()=>null) : Promise.resolve(null);
SC.saveFile = async (filename, data) => { const dl = await cap("downloads"); if(!dl) return "err_download_unavailable"; try{ await dl.save({filename, data}); return null }catch(e){ return e && e.code==="declined" ? "err_download_declined" : "err_download_unavailable" } };
SC.aiAvailable = async () => { const s = await cap("sample"); if(!s) return null; try{ const l = await s.limits(); return l && l.images ? s : null }catch{ return null } };

/* ------------------------------------------------------------------ Excel */
const kindT = k => SC.t("kind_"+k), stT = s => SC.t("st_"+s);
function invRow(i){
  return {[SC.t("x_folder")]:SC.fno(i.folder), [SC.t("x_seq")]:i.seq, [SC.t("x_expense")]:i.id, [SC.t("date")]:SC.dd(i.date), [SC.t("supplier")]:i.supName || SC.supNm(i.sup),
    [SC.t("vat_no")]:i.vatNo||"", [SC.t("inv_no")]:i.invNo, [SC.t("x_kind")]:kindT(i.kind), [SC.t("category")]:SC.t("cat_"+i.cat), [SC.t("project")]:SC.projName(i.project),
    [SC.t("x_branch")]:SC.branchName(i.branch), [SC.t("subtotal")]:i.sub, [SC.t("vat_short")]:i.vat, [SC.t("total")]:i.total, [SC.t("x_credit")]:SC.credited(i),
    [SC.t("x_status")]:stT(i.status), [SC.t("x_step")]: i.status==="review" ? SC.t("role_"+i.steps[i.idx]) : "", [SC.t("x_by")]:SC.uname(i.by), [SC.t("x_advance")]:i.adv};
}
SC.xlsx = async (filename, sheets) => {
  if(!window.XLSX) return "err_xlsx";
  const wb = XLSX.utils.book_new(); if(SC.lang().dir==="rtl") wb.Workbook = {Views:[{RTL:true}]};
  for(const [name, rows] of sheets){
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{"":""}]); const keys = Object.keys(rows[0]||{});
    ws["!cols"] = keys.map(k=>({wch: Math.min(40, Math.max(10, String(k).length+2, ...rows.slice(0,50).map(r=>String(r[k]??"").length+2)))}));
    XLSX.utils.book_append_sheet(wb, ws, String(name).slice(0,31));
  }
  const err = await SC.saveFile(filename, new Blob([XLSX.write(wb, {bookType:"xlsx", type:"array"})]));
  if(!err) SC.audit("au_export", filename); return err;
};
SC.exportFolder = (no) => {
  const f = SC.folder(no), a = SC.adv(f.adv), st = SC.folderStats(no);
  const summary = [[SC.t("folder"), SC.fno(no)], [SC.t("x_advance"), a.id], [SC.t("x_holder"), SC.uname(a.holder)], [SC.t("project"), SC.projName(a.project)], [SC.t("x_branch"), SC.branchName(a.branch)],
    [SC.t("x_period"), `${SC.dd(st.from)} – ${SC.dd(st.to)}`], [SC.t("x_count"), `${st.n} / 30`], [SC.t("total"), st.total], [SC.t("vat_short"), st.vat],
    [SC.t("approved"), st.approved], [SC.t("pending"), st.pending], [SC.t("rejected"), st.rejected], [SC.t("x_status"), SC.t("fs_"+f.status)],
    [SC.t("x_close_reason"), f.reason ? SC.t("r_"+f.reason) : ""],
    [SC.t("r_accountant_sig"), f.sigs.accountant ? `${SC.uname(f.sigs.accountant.by)} · ${SC.dt(f.sigs.accountant.t)}` : ""],
    [SC.t("r_finance_sig"), f.sigs.finance ? `${SC.uname(f.sigs.finance.by)} · ${SC.dt(f.sigs.finance.t)}` : ""]].map(([k,v])=>({[SC.t("x_field")]:k, [SC.t("x_value")]:v}));
  return SC.xlsx(`${SC.fno(no)}.xlsx`, [[SC.t("x_summary"), summary], [SC.t("x_invoices"), SC.folderInv(no).map(invRow)]]);
};
/* accounting journal for an approved folder; exporting it locks the folder (no more returns or edits) */
const ACCT = {fuel:"5101 Fuel & oil", parts:"5102 Repairs & parts", tools:"5103 Tools & supplies", hosp:"5104 Hospitality", transport:"5105 Transport", office:"5106 Office supplies", site:"5107 Site expenses", comms:"5108 Telecom", emergency:"5109 Emergency", other:"5199 Other expenses"};
SC.journalRows = (no) => {
  const f = SC.folder(no), a = SC.adv(f.adv), rows = [], inv = SC.folderInv(no).filter(i=>i.status==="approved");
  const by = {}; let vat = 0, total = 0;
  inv.forEach(i=>{ const net = SC.r2(i.sub - (SC.credited(i) ? SC.credited(i)*i.sub/i.total : 0)); by[i.cat] = SC.r2((by[i.cat]||0) + net); vat = SC.r2(vat + i.vat - (SC.credited(i) ? SC.credited(i)*i.vat/i.total : 0)); total = SC.r2(total + i.total - SC.credited(i)) });
  const date = SC.dd(SC.now()), ref = SC.fno(no), cc = `${a.project} · ${a.branch}`;
  const map = SC.S.integrations?.erp?.mapping || {}, acc = (k, label) => `${map[k] || ACCT[k]?.split(" ")[0] || ""} ${label}`.trim();
  Object.entries(by).forEach(([c,v])=>rows.push({[SC.t("date")]:date, [SC.t("x_ref")]:ref, [SC.t("x_account")]:acc(c, ACCT[c].split(" ").slice(1).join(" ")), [SC.t("x_cost_center")]:cc, [SC.t("x_debit")]:v, [SC.t("x_credit_col")]:""}));
  if(vat) rows.push({[SC.t("date")]:date, [SC.t("x_ref")]:ref, [SC.t("x_account")]:acc("vat","Input VAT 15%"), [SC.t("x_cost_center")]:cc, [SC.t("x_debit")]:SC.r2(vat), [SC.t("x_credit_col")]:""});
  rows.push({[SC.t("date")]:date, [SC.t("x_ref")]:ref, [SC.t("x_account")]:acc("advance",`Petty cash advance ${a.id}`), [SC.t("x_cost_center")]:cc, [SC.t("x_debit")]:"", [SC.t("x_credit_col")]:total});
  return rows;
};
SC.exportJournal = async (no) => {
  const f = SC.folder(no); if(!SC.can("journal") || f.status!=="approved") return "err_not_allowed";
  const err = await SC.xlsx(`${SC.fno(no)}-journal.xlsx`, [[SC.t("x_journal"), SC.journalRows(no)]]);
  if(!err && !f.locked){ f.locked = true; f.lockedAt = SC.now(); f.lockedBy = SC.me().id; SC.audit("au_lock", SC.fno(no)) }
  return err;
};
SC.exportAll = () => {
  const m = SC.me(), all = SC.can("export_all"), inv = all ? SC.S.invoices : SC.visibleInvoices();
  const folders = SC.S.folders.filter(f=>all || SC.folderVisible(f)).map(f=>{ const s = SC.folderStats(f.no), a = SC.adv(f.adv); return {[SC.t("folder")]:SC.fno(f.no), [SC.t("x_advance")]:a.id,
    [SC.t("x_holder")]:SC.uname(a.holder), [SC.t("x_count")]:s.n, [SC.t("total")]:s.total, [SC.t("vat_short")]:s.vat, [SC.t("approved")]:s.approved, [SC.t("pending")]:s.pending,
    [SC.t("rejected")]:s.rejected, [SC.t("x_status")]:SC.t("fs_"+f.status), [SC.t("x_close_reason")]: f.reason ? SC.t("r_"+f.reason) : ""}});
  const log = []; inv.forEach(i=>i.hist.forEach(h=>log.push({[SC.t("date")]:SC.dt(h.t), [SC.t("x_expense")]:i.id, [SC.t("x_event")]:SC.t("ev_"+h.ev), [SC.t("x_role")]: h.step ? SC.t("role_"+h.step) : "",
    [SC.t("x_by")]:SC.uname(h.by), [SC.t("x_note")]: h.note ? SC.tn(h.note) : (h.cn||"")})));
  const advs = SC.S.advances.filter(a=>all || SC.sees({holder:a.holder, project:a.project, branch:a.branch})).map(a=>{ const s = SC.advStats(a); return {[SC.t("x_advance")]:a.id,
    [SC.t("x_holder")]:SC.uname(a.holder), [SC.t("x_emp")]:SC.user(a.holder)?.emp, [SC.t("project")]:SC.projName(a.project), [SC.t("x_branch")]:SC.branchName(a.branch), [SC.t("issued")]:s.issued, [SC.t("approved")]:s.approved,
    [SC.t("x_credit")]:s.credits, [SC.t("under_review")]:s.review, [SC.t("remaining")]:s.balance}});
  const sheets = [[SC.t("x_invoices"), inv.map(invRow)], [SC.t("tab_folders"), folders], [SC.t("x_advances"), advs], [SC.t("x_approvals_log"), log]];
  if(all || ["procurement","pm","engineer","accountant"].includes(m.role)) sheets.push([SC.t("x_pos"), SC.S.pos.filter(p=>all||m.role==="procurement"||p.project===m.project).map(p=>({[SC.t("x_po")]:p.id,
    [SC.t("supplier")]:SC.supNm(p.sup), [SC.t("project")]:SC.projName(p.project), [SC.t("total")]:SC.poTotal(p), [SC.t("x_status")]:SC.t("po_"+p.status), [SC.t("x_invoice")]:p.invoice?.no||"", [SC.t("date")]:SC.dd(p.t)}))]);
  if(all){
    sheets.push([SC.t("x_projects"), SC.S.projects.map(p=>{ const s = SC.projectStats(p.id); return {[SC.t("x_code")]:p.id, [SC.t("x_name")]:pickName(p.name), [SC.t("x_branch")]:SC.branchName(p.branch),
      [SC.t("governorate")]:SC.govName(p.gov), [SC.t("role_pm")]:SC.uname(p.pm), [SC.t("budget")]:p.budget, [SC.t("x_used")]:s.used, [SC.t("x_team")]:s.team} })]);
    sheets.push([SC.t("x_users"), SC.S.users.map(u=>({[SC.t("x_name")]:pickName(u.name), [SC.t("x_emp")]:u.emp, [SC.t("x_role")]:u.role?SC.t("role_"+u.role):"", [SC.t("email")]:u.email,
      Google:u.google||"", [SC.t("x_branch")]:SC.branchName(u.branch), [SC.t("project")]:SC.projName(u.project), [SC.t("x_limit")]: u.limit===null ? SC.t("unlimited") : u.limit,
      [SC.t("x_reports_to")]: u.reportsTo ? SC.uname(u.reportsTo) : "", [SC.t("x_status")]: SC.t("us_"+u.status)}))]);
    sheets.push([SC.t("suppliers"), SC.S.suppliers.map(s=>({[SC.t("x_name")]:pickName(s.name), [SC.t("vat_no")]:s.vat||"", [SC.t("x_cr")]:s.cr||"", [SC.t("category")]:s.cats.map(c=>SC.t("cat_"+c)).join(", "), [SC.t("governorate")]:SC.govName(s.gov), [SC.t("phone")]:s.phone}))]);
  }
  return SC.xlsx(`smart-cash-${SC.dd(SC.now()).split("/").reverse().join("-")}.xlsx`, sheets);
};
SC.exportStatement = (advId) => {
  const a = SC.adv(advId), ev = []; let bal = 0;
  a.moves.forEach(mv=>ev.push({t:mv.t, d:SC.t("mv_"+mv.kind)+(mv.note?` · ${mv.note}`:""), amt: mv.kind==="refund" ? -mv.amt : mv.amt}));
  SC.S.invoices.filter(i=>i.adv===a.id && i.status==="approved").forEach(i=>{ const p = i.hist.find(h=>h.ev==="posted"); ev.push({t:p?.t||i.date, d:`${i.id} · ${SC.fno(i.folder)} #${i.seq} · ${i.supName||SC.supNm(i.sup)}`, amt:-i.total}); i.credits.forEach(c=>ev.push({t:c.t, d:`${c.cn} · ${i.id}`, amt:c.amt})) });
  const rows = ev.sort((x,y)=>new Date(x.t)-new Date(y.t)).map(e=>{ bal = SC.r2(bal+e.amt); return {[SC.t("date")]:SC.dt(e.t), [SC.t("x_desc")]:e.d, [SC.t("x_in")]: e.amt>0?e.amt:"", [SC.t("x_out")]: e.amt<0?-e.amt:"", [SC.t("bal")]:bal} });
  return SC.xlsx(`${a.id}-statement.xlsx`, [[SC.t("x_statement"), rows]]);
};

/* ------------------------------------------------------------------ backup */
SC.receiptPng = (i) => new Promise(res=>{
  const c = document.createElement("canvas"); c.width = 480; c.height = 720; const g = c.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0,0,480,720); g.fillStyle = "#111"; g.textAlign = "center"; g.font = "700 22px sans-serif"; g.fillText(i.supName || SC.supNm(i.sup), 240, 60);
  g.font = "15px sans-serif"; g.fillStyle = "#555"; g.fillText(SC.t("kind_"+i.kind), 240, 88); g.textAlign = "left"; g.fillStyle = "#111"; g.font = "16px monospace";
  [["VAT", i.vatNo||"—"],["No.", i.invNo||"—"],["Date", SC.dd(i.date)],["",""],["Sub", SC.fmt(i.sub)],["VAT 15%", SC.fmt(i.vat)],["TOTAL", SC.fmt(i.total)+" SAR"]].forEach(([k,v],j)=>{ g.fillText(k, 40, 150+j*34); g.textAlign="right"; g.fillText(v, 440, 150+j*34); g.textAlign="left" });
  g.fillStyle = "#999"; g.fillText(`${SC.fno(i.folder)} #${i.seq} · ${i.id}`, 40, 680); c.toBlob(b=>res(b), "image/png");
});
SC.backup = async (photosOnly) => {
  if(!window.JSZip) return "err_zip";
  const zip = new JSZip(), all = SC.can("backup_all") || SC.can("export_all"), inv = all ? SC.S.invoices : SC.visibleInvoices();
  if(!photosOnly) zip.file("smart-cash-data.json", JSON.stringify({app:"smart-cash", v:SC.S.v, at:SC.now(), state: all ? SC.S : {...SC.S, users:SC.S.users.map(u=>({...u, pw:null}))}}, null, 1));
  const dir = zip.folder("photos");
  for(const i of inv){ const name = `${SC.fno(i.folder)}/${String(i.seq).padStart(2,"0")}_${i.id}`; const real = i.img ? await SC.imgGet(i.id) : null;
    if(real) dir.file(`${name}.${(real.type||"image/jpeg").split("/")[1].replace("jpeg","jpg")}`, real); else { const png = await SC.receiptPng(i); if(png) dir.file(`${name}.png`, png) } }
  const blob = await zip.generateAsync({type:"blob", compression:"DEFLATE"});
  const err = await SC.saveFile(`smart-cash-${photosOnly?"photos":"backup"}-${new Date().toISOString().slice(0,16).replace(/[:T]/g,"-")}.zip`, blob);
  if(!err){ SC.S.backups.last = SC.now(); SC.audit("au_backup", photosOnly ? "photos" : "full") } return err;
};
SC.restore = async (file) => {
  try{
    let data;
    if(/\.json$/i.test(file.name)) data = JSON.parse(await file.text());
    else { if(!window.JSZip) return "err_zip"; const zip = await JSZip.loadAsync(file); const j = zip.file("smart-cash-data.json"); if(!j) return "err_restore_file"; data = JSON.parse(await j.async("string"));
      for(const p of Object.values(zip.files).filter(f=>!f.dir && /^photos\/.+\.(jpe?g|webp)$/i.test(f.name))){ const id = (p.name.match(/(EX-\d{7})/)||[])[1]; if(id) await SC.imgPut(id, await p.async("blob")) } }
    if(!data || data.app!=="smart-cash" || !data.state || data.state.v!==D.VERSION) return "err_restore_file";
    const session = SC.S.session; SC.S = data.state; SC.S.session = session; reindex(); SC.audit("au_restore", file.name); SC.save(); return null;
  }catch{ return "err_restore_file" }
};

/* ------------------------------------------------------------------ WhatsApp */
SC.waNum = phone => String(phone||"").replace(/[^\d]/g,"").replace(/^0+/,"").replace(/^5/,"9665");
SC.waLink = (phone, text) => `https://wa.me/${SC.waNum(phone)}?text=${encodeURIComponent(text)}`;
SC.waBalanceText = (c) => { const b = c.entries.reduce((s,e)=>s+(e.dir==="gave"?e.amt:-e.amt),0), me = SC.me();
  return SC.t(b>0 ? "wa_owes" : b<0 ? "wa_we_owe" : "wa_settled", {name:SC.nm(c.n)||c.name, me:SC.uname(me?.id), amt:SC.fmt(Math.abs(b)), org:SC.orgName()}) };
SC.waCustodyText = (c) => { const st = SC.pcStats(c);
  return SC.t(c.dir==="received" ? "wa_custody_received" : "wa_custody_given", {name:SC.nm(c.party)||c.party, me:SC.uname(SC.me()?.id), amt:SC.fmt(st.total), spent:SC.fmt(st.spent), bal:SC.fmt(st.balance), n:c.spent.length}) };
SC.waInvoiceText = (i) => SC.t("wa_invoice_status", {id:i.id, st:SC.t("st_"+i.status), amt:SC.fmt(i.total), sup:i.supName||SC.supNm(i.sup)});
SC.waConnect = (number) => { const wa = SC.S.integrations.wa; if(!/^\+?\d[\d\s]{8,}$/.test(String(number||"").trim())) return "err_phone"; wa.connected = true; wa.number = String(number).trim(); SC.audit("au_wa_connect", wa.number); return null };
SC.waDisconnect = () => { const wa = SC.S.integrations.wa; wa.connected = false; SC.audit("au_wa_disconnect", wa.number) };
SC.waText = (m) => SC.t(m.k, {who:SC.uname(m.by)||SC.t("system"), amt:m.amt?SC.fmt(m.amt):""}) + (m.ref?.id ? ` · ${m.ref.type==="folder"?SC.fno(m.ref.id):m.ref.id}` : "");

/* ------------------------------------------------------------------ ERP & accounting systems */
SC.ERP = [
  {k:"sap", name:"SAP S/4HANA", tier:"enterprise", fmt:"xlsx", api:"OData · Journal Entry API"},
  {k:"oracle", name:"Oracle Fusion / NetSuite", tier:"enterprise", fmt:"csv", api:"REST · FBDI"},
  {k:"dynamics", name:"Microsoft Dynamics 365", tier:"enterprise", fmt:"xlsx", api:"Business Central API"},
  {k:"odoo", name:"Odoo", tier:"business", fmt:"csv", api:"JSON-RPC · account.move"},
  {k:"zoho", name:"Zoho Books", tier:"business", fmt:"csv", api:"REST · journals"},
  {k:"quickbooks", name:"QuickBooks Online", tier:"business", fmt:"csv", api:"REST · JournalEntry"},
  {k:"qoyod", name:"Qoyod قيود", tier:"business", fmt:"xlsx", api:"REST · قيود يومية"},
  {k:"daftra", name:"Daftra دفترة", tier:"business", fmt:"xlsx", api:"REST · journals"},
];
SC.erp = () => SC.S.integrations.erp;
SC.erpConnect = (k, d) => { if(!SC.can("integrations")) return "err_not_allowed"; if(!/^https:\/\/\S+\.\S+/.test(String(d.url||""))) return "err_url"; if(!String(d.company||"").trim()) return "err_company";
  SC.erp().connections[k] = {status:"connected", url:d.url.trim(), company:d.company.trim(), at:SC.now()}; SC.audit("au_erp_connect", k); return null };
SC.erpDisconnect = k => { delete SC.erp().connections[k]; SC.audit("au_erp_disconnect", k) };
SC.erpPending = () => SC.S.folders.filter(f=>f.status==="approved" && !f.locked);
SC.erpPush = (k) => {
  if(!SC.can("integrations") || !SC.erp().connections[k]) return {err:"err_not_allowed"};
  const out = []; SC.erpPending().forEach(f=>{
    const rows = SC.journalRows(f.no), total = SC.r2(rows.reduce((s,r)=>s+(+r[SC.t("x_debit")]||0),0));
    f.locked = true; f.lockedAt = SC.now(); f.lockedBy = SC.me().id;
    const e = {t:SC.now(), sys:k, folder:f.no, lines:rows.length, total, status:"ok", ref:`${k.toUpperCase()}-${Date.now().toString(36).toUpperCase()}${f.no}`};
    SC.erp().log.unshift(e); out.push(e);
  });
  SC.erp().connections[k].last = SC.now(); SC.audit("au_erp_push", `${k} · ${out.length}`); return {sent:out};
};
SC.erpFile = async (k) => {
  const sys = SC.ERP.find(x=>x.k===k), rows = [];
  SC.S.folders.filter(f=>f.status==="approved").forEach(f=>SC.journalRows(f.no).forEach(r=>rows.push(r)));
  if(!rows.length) return "err_nothing_to_export";
  if(sys.fmt==="csv"){
    const keys = Object.keys(rows[0]), q = v => `"${String(v??"").replace(/"/g,'""')}"`;
    const csv = "\ufeff" + [keys.map(q).join(","), ...rows.map(r=>keys.map(k=>q(r[k])).join(","))].join("\r\n");
    const err = await SC.saveFile(`${k}-journal-${SC.dd(SC.now()).split("/").reverse().join("")}.csv`, new Blob([csv], {type:"text/csv"})); if(!err) SC.audit("au_export", `${k} csv`); return err;
  }
  return SC.xlsx(`${k}-journal-${SC.dd(SC.now()).split("/").reverse().join("")}.xlsx`, [[SC.t("x_journal"), rows]]);
};

/* ------------------------------------------------------------------ individual: personal expenses & custody */
SC.P = () => SC.S.personal;
SC.monthKey = iso => { const d = riy(iso); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}` };
SC.thisMonth = () => SC.monthKey(SC.now());
SC.pMonth = (mk) => { const ex = SC.P().expenses.filter(e=>SC.monthKey(e.t)===mk); const by = {}; ex.forEach(e=>by[e.cat]=(by[e.cat]||0)+e.amt); return {ex, total:SC.r2(ex.reduce((s,e)=>s+e.amt,0)), by} };
SC.addPExpense = (d) => { if(!(d.amt>0)) return "enter_amount"; if(!D.PCATS.includes(d.cat)) return "err_category";
  const e = {id:"PE-"+String(++SC.S.seq.pe).padStart(4,"0"), t:d.t||SC.now(), cat:d.cat, amt:SC.r2(d.amt), note:d.note||"", cust:d.cust||null};
  SC.P().expenses.push(e);
  if(d.cust){ const c = SC.P().custodies.find(x=>x.id===d.cust); if(c) c.spent.push({t:e.t, amt:e.amt, note:e.note, cat:e.cat, pe:e.id}) }
  const mk = SC.monthKey(e.t), lim = SC.P().budgets[e.cat], used = SC.pMonth(mk).by[e.cat]||0;
  if(lim && used > lim*0.8) SC.S.notifs.unshift({id:"N"+(++SC.S.seq.n), to:SC.me().id, k: used>lim ? "n_budget_over" : "n_budget_near", ref:{type:"pcat", id:e.cat}, by:null, t:SC.now(), read:false});
  return null };
SC.pcStats = c => { const total = SC.r2(c.moves.reduce((s,m)=>s+(m.kind==="return"?-m.amt:m.amt),0)), spent = SC.r2(c.spent.reduce((s,x)=>s+x.amt,0)); return {total, spent, balance:SC.r2(total-spent)} };
SC.addCustody = (d) => { if(!String(d.party||"").trim()) return {err:"err_name"}; if(!(d.amount>0)) return {err:"enter_amount"};
  const c = {id:"PC-"+String(++SC.S.seq.pc).padStart(3,"0"), dir:d.dir==="given"?"given":"received", party:d.party.trim(), phone:d.phone||"", amount:SC.r2(d.amount), t:SC.now(), status:"open", moves:[{kind:"issue", amt:SC.r2(d.amount), t:SC.now()}], spent:[]};
  SC.P().custodies.unshift(c); return {c} };
SC.custodySpend = (c, d) => { if(!(d.amt>0)) return "enter_amount"; const st = SC.pcStats(c); if(d.amt > st.balance + 0.001) return "err_custody_balance";
  c.spent.push({t:SC.now(), amt:SC.r2(d.amt), note:d.note||"", cat:d.cat||"other"}); return null };
SC.custodyTopup = (c, amt) => { if(!(amt>0)) return "enter_amount"; c.moves.push({kind:"topup", amt:SC.r2(amt), t:SC.now()}); return null };
SC.custodySettle = (c) => { const st = SC.pcStats(c); if(st.balance>0) c.moves.push({kind:"return", amt:st.balance, t:SC.now()}); c.status = "settled"; c.settledAt = SC.now(); return null };

/* ------------------------------------------------------------------ importing an invoice photo */
SC.sha256 = async (blob) => { try{ const b = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()); return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("") }catch{ return null } };
SC.shrink = (file) => new Promise(res=>{ const url = URL.createObjectURL(file), img = new Image();
  img.onload = () => { const k = Math.min(1, 1600/Math.max(img.width, img.height)), c = document.createElement("canvas"); c.width = Math.round(img.width*k); c.height = Math.round(img.height*k);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); c.toBlob(b=>{ URL.revokeObjectURL(url); res({blob:b, canvas:c}) }, "image/jpeg", 0.85) };
  img.onerror = () => { URL.revokeObjectURL(url); res(null) }; img.src = url });
SC.parseZatca = (text) => { try{ const bytes = Uint8Array.from(atob(String(text).trim()), c=>c.charCodeAt(0)), out = {}; let i = 0; const dec = new TextDecoder();
  while(i < bytes.length){ const tag = bytes[i], len = bytes[i+1]; out[tag] = dec.decode(bytes.slice(i+2, i+2+len)); i += 2+len }
  if(!out[1] || !out[2] || !out[4]) return null; return {supName:out[1], vatNo:out[2], date:out[3] ? new Date(out[3]).toISOString() : SC.now(), total:+out[4], vat:+(out[5]||0)} }catch{ return null } };
SC.readQR = (canvas) => { if(!window.jsQR) return null; try{ const d = canvas.getContext("2d").getImageData(0,0,canvas.width,canvas.height); const r = jsQR(d.data, d.width, d.height); return r ? SC.parseZatca(r.data) : null }catch{ return null } };
SC.aiRead = async (sample, blob) => {
  const prompt = `You read one photo of a purchase invoice or receipt from Saudi Arabia. Reply with JSON only, no prose:
{"supplier_name":string,"vat_number":string|null,"invoice_number":string|null,"date":"YYYY-MM-DDTHH:MM"|null,"kind":"tax_simplified"|"tax_standard"|"regular"|"purchase"|"credit_note"|"other","category":"fuel"|"parts"|"tools"|"hosp"|"transport"|"office"|"site"|"comms"|"emergency"|"other","items":[{"name":string,"qty":number,"unit_price":number,"total":number}],"subtotal":number|null,"vat_amount":number|null,"total":number,"confidence":number}
Use "regular" when there is no VAT registration number. Numbers use a dot as decimal separator. If a field is not printed, use null.`;
  try{ const r = await sample.json(prompt, {images:[blob], modelTier:"default"}); if(!r || typeof r.total!=="number") return null;
    return {supName:r.supplier_name||"", vatNo:r.vat_number||null, invNo:r.invoice_number||"", date:r.date?new Date(r.date).toISOString():SC.now(), kind:D.KINDS.includes(r.kind)?r.kind:"regular",
      cat:D.CATS.includes(r.category)?r.category:"other", items:(r.items||[]).map(x=>[x.name, +x.qty||1, +x.unit_price||0, +x.total||0]), total:SC.r2(r.total), vat:SC.r2(r.vat_amount||0), conf:r.confidence} }catch{ return null }
};
})();
