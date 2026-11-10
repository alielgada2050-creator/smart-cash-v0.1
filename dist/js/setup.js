/* Smart Cash v0.8 — production start: no sample data, first-run workspace setup (owner account), document vault. */
(function(){
const SC = window.SC, D = window.SCDATA, H = SC.h, V = SC.VIEWS, UI = SC.UI, t = SC.t, esc = SC.esc, ic = H.ic, PROD = !!window.SC_PROD;
if(PROD) document.documentElement.classList.add("prod");
Object.assign(SCI18N.en,{su_cta:"Create your workspace",su_cta_hint:"First time here? Set up your organisation and owner account. Nothing is pre-filled.",su_org:"Organisation name",su_name:"Your full name",su_email:"Email",su_pw:"Password",su_pw2:"Confirm password",su_create:"Create and sign in",su_title:"New workspace",su_note:"Data is stored on this device only. Use Backup regularly.",su_err_org:"Enter the organisation name",su_done:"Workspace created",
 dc_title:"Documents",dc_add:"Upload files",dc_empty:"No documents yet. Upload contracts, invoices, IDs or any file.",dc_cat:"Category",dc_c_contract:"Contract",dc_c_invoice:"Invoice",dc_c_id:"ID / licence",dc_c_other:"Other",dc_saved:"Saved {n} file(s)",dc_del:"Delete",dc_dl:"Download",dc_big:"File too large (max 25 MB)",dc_row:"Documents and files",dc_row_hint:"Upload, store and download files on this device"});
Object.assign(SCI18N.ar,{su_cta:"أنشئ مساحة عملك",su_cta_hint:"أول مرة؟ أعدّ مؤسستك وحساب المالك. لا توجد بيانات مسبقة.",su_org:"اسم المؤسسة",su_name:"اسمك الكامل",su_email:"البريد الإلكتروني",su_pw:"كلمة المرور",su_pw2:"تأكيد كلمة المرور",su_create:"إنشاء ودخول",su_title:"مساحة عمل جديدة",su_note:"البيانات تُحفظ على هذا الجهاز فقط. خذ نسخة احتياطية بانتظام.",su_err_org:"أدخل اسم المؤسسة",su_done:"تم إنشاء مساحة العمل",
 dc_title:"المستندات",dc_add:"رفع ملفات",dc_empty:"لا توجد مستندات بعد. ارفع العقود أو الفواتير أو الهويات أو أي ملف.",dc_cat:"التصنيف",dc_c_contract:"عقد",dc_c_invoice:"فاتورة",dc_c_id:"هوية / رخصة",dc_c_other:"أخرى",dc_saved:"تم حفظ {n} ملف",dc_del:"حذف",dc_dl:"تنزيل",dc_big:"الملف كبير (الحد 25 ميجابايت)",dc_row:"المستندات والملفات",dc_row_hint:"ارفع واحفظ ونزّل الملفات على هذا الجهاز"});

/* ---------- clean start ---------- */
const wipe = () => { const S = SC.S;
  ["advances","folders","invoices","prs","pos","contacts","suppliers","notifs","requests","paylinks","waOutbox"].forEach(k=>{ S[k] = [] });
  S.audit = []; S.users = []; S.projects = []; S.session = null;
  if(S.plan==="enterprise") S.branches = [{id:"HQ", name:["المقر الرئيسي","Head office"], region:"riyadh", gov:"riyadh"}];
  if(S.personal){ const p = S.personal; p.expenses = []; p.custodies = []; p.savings = []; p.cash = []; for(const k in (p.budgets||{})) p.budgets[k] = 0 }
  if(S.payset) S.payset = {holder:"", bank:null, iban:"", stc:"", gateway:null};
  if(S.org){ S.org.name = ["",""]; delete S.org.vat; delete S.org.cr }
  S.mode = "live"; S.clean = true; S.needsSetup = true; SC.reindex(); SC.save() };
SC.prodClean = () => { if(PROD && !SC.S.clean){ wipe() } };
if(PROD){ SC.prodClean(); const sw = SC.switchWs; SC.switchWs = ws => { sw(ws); SC.prodClean() }; const rs = SC.reset; SC.reset = () => { rs(); wipe() } }

SC.setupWorkspace = async d => {
  const S = SC.S, name = String(d.name||"").trim(), email = String(d.email||"").trim().toLowerCase(), org = String(d.org||"").trim();
  if(S.plan!=="personal" && !org) return "su_err_org";
  if(!name) return "err_name";
  if(!/^\S+@\S+\.\S+$/.test(email)) return "err_email";
  const pe = SC.policy(d.pw); if(pe) return pe;
  if(d.pw !== d.pw2) return "pw_mismatch";
  const id = {personal:"u_me", business:"u_owner", enterprise:"u_admin"}[S.plan] || "u_admin", role = {personal:"personal", business:"owner", enterprise:"admin"}[S.plan];
  const u = {id, name:[name,name], role, emp:{personal:"—", business:"O-001", enterprise:"IT-001"}[S.plan], email, google:null, reportsTo:null, branch:S.plan==="enterprise"?"HQ":null, project:null,
    limit:D.DEFAULT_LIMIT[role] ?? 0, phone:"—", status:"active", pw:await SC.hash(d.pw, id), mustChange:false, fails:0, demo:false, sessions:[], pwAt:SC.now()};
  S.users = [u]; if(S.plan!=="personal") S.org.name = [org, org]; else S.org.name = [name, name];
  S.needsSetup = false; S.clean = true; S.mode = "live";
  SC.reindex(); SC.login(id, "password"); SC.audit("au_clear_samples", "setup"); SC.save(); return null };

const baseLogin = V.login;
V.login = () => { let h = baseLogin(); if(PROD) h = h.replace(/placeholder="[^"]*@smartcash\.demo"/, 'placeholder="name@company.com"');
  if(!(SC.S.needsSetup || !SC.S.users.length || (SC.S.mode==="live" && !PROD && false))) return h;
  const cta = `<div class="glass card" style="margin:6px 0 4px"><div class="h2">${t("su_cta")}</div><p class="sub" style="margin:6px 0 12px">${t("su_cta_hint")}</p><button class="btn btn-accent" data-act="sheet" data-v="setup">${t("su_cta")}</button></div>`;
  return h.includes('<h1 class="h1">') ? h.replace('<h1 class="h1">', cta+'<h1 class="h1">') : h+cta };

/* ---------- document vault (IndexedDB, device-local) ---------- */
let dbp = null; const docDb = () => dbp || (dbp = new Promise(res => { try{ const rq = indexedDB.open("smartcash-docs",1); rq.onupgradeneeded = () => rq.result.createObjectStore("docs",{keyPath:"id"}); rq.onsuccess = () => res(rq.result); rq.onerror = () => res(null) }catch(e){ res(null) } }));
const tx = async (mode, fn) => { const db = await docDb(); if(!db) return null; return new Promise(res => { const r = fn(db.transaction("docs",mode).objectStore("docs")); r.onsuccess = () => res(r.result); r.onerror = () => res(null) }) };
const key = () => SC.ws+":";
let cache = null, loading = false;
const load = async () => { loading = true; const all = (await tx("readonly", s=>s.getAll())) || []; cache = all.filter(d=>d.id.startsWith(key())).sort((a,b)=>b.t.localeCompare(a.t)); loading = false; SC.render(true) };
const seeAll = () => SC.can && (SC.can("users") || ["owner","finance","admin"].includes(SC.me().role));
const sz = n => n>1048576 ? (n/1048576).toFixed(1)+" MB" : Math.max(1,Math.round(n/1024))+" KB";
const CATS = ["contract","invoice","id","other"];
V.docs = () => { if(!cache && !loading) load();
  const me = SC.me().id, list = (cache||[]).filter(d=>seeAll()||d.by===me), cat = UI.docCat || "other";
  return `<div class="page">${H.nav(t("dc_title"), true)}
   <div class="glass wpad" style="padding:14px"><div class="plabel">${t("dc_cat")}</div><div class="chips">${CATS.map(c=>`<button class="chip" aria-pressed="${cat===c}" data-act="doccat" data-v="${c}">${t("dc_c_"+c)}</button>`).join("")}</div>
    <button class="btn btn-accent" style="margin-top:12px" data-act="docpick">${ic("plus",18)}${t("dc_add")}</button></div>
   ${list.length ? `<div class="glass list" style="margin-top:12px">${list.map(d=>`<div class="row"><span class="ico">${ic("file",20)}</span><div class="grow"><div class="t1">${esc(d.name)}</div><div class="t2 num">${t("dc_c_"+d.cat)} · ${sz(d.size)} · ${SC.dt(d.t)}</div></div><button class="iconbtn" data-act="docdl" data-v="${esc(d.id)}" aria-label="${t("dc_dl")}">${ic("down",16)}</button><button class="iconbtn" data-act="docdel" data-v="${esc(d.id)}" aria-label="${t("dc_del")}">${ic("trash",16)}</button></div>`).join("")}</div>` : (loading ? "" : H.empty("vault", t("dc_empty")))}
   <div class="spacer"></div></div>` };
if(!document.getElementById("file-docs")){ const i = document.createElement("input"); i.type = "file"; i.id = "file-docs"; i.multiple = true; i.hidden = true; document.body.appendChild(i) }
document.addEventListener("change", async e => { if(e.target.id!=="file-docs") return; const fs = [...e.target.files]; e.target.value = ""; let n = 0;
  for(const f of fs){ if(f.size>25*1048576){ H.toast(t("dc_big"), true); continue }
    await tx("readwrite", s=>s.put({id:key()+Date.now().toString(36)+Math.random().toString(36).slice(2,6), name:f.name, type:f.type, size:f.size, t:new Date().toISOString(), by:SC.me().id, cat:UI.docCat||"other", blob:f})); n++ }
  try{ navigator.storage && navigator.storage.persist && navigator.storage.persist() }catch(_){}
  if(n) H.toast(t("dc_saved",{n})); await load() });
document.addEventListener("click", async e => { const b = e.target.closest("[data-act]"); if(!b) return; const a = b.dataset.act, v = b.dataset.v;
  if(a==="docpick") document.getElementById("file-docs").click();
  else if(a==="doccat"){ UI.docCat = v; SC.render(true) }
  else if(a==="docdel"){ await tx("readwrite", s=>s.delete(v)); await load() }
  else if(a==="docdl"){ const d = await tx("readonly", s=>s.get(v)); if(!d) return; const u = URL.createObjectURL(d.blob), x = document.createElement("a"); x.href = u; x.download = d.name; document.body.appendChild(x); x.click(); x.remove(); setTimeout(()=>URL.revokeObjectURL(u), 4000) }
  else if(a==="dosetup"){ const F = UI.sheet.f||{}; const r = await SC.setupWorkspace({org:F.org, name:F.name, email:F.email, pw:F.pw, pw2:F.pw2}); if(r){ UI.sheet.err = r; SC.render(true); return } UI.sheet = null; UI.stack = []; UI.screen = "home"; cache = null; H.toast(t("su_done")); SC.render() } }, true);
const baseMe = V.me;
V.me = () => { let h = baseMe(); if(!SC.me()) return h;
  const row = `<div class="glass list wpad"><button class="row" data-act="go" data-v="docs"><span class="ico">${ic("file",20)}</span><div class="grow"><div class="t1">${t("dc_row")}</div><div class="t2">${t("dc_row_hint")}</div></div></button></div>`;
  const i = h.lastIndexOf('<div class="spacer">'); return i>=0 ? h.slice(0,i)+row+h.slice(i) : h+row };
const prev = SC.sheet2;
SC.sheet2 = (s, wrap, err) => { if(s.type!=="setup") return prev(s, wrap, err); const personal = SC.S.plan==="personal";
  return wrap(`${personal?"":H.fld("org", t("su_org"))}${H.fld("name", t("su_name"))}${H.fld("email", t("su_email"), 'dir="ltr" autocomplete="email"', "email")}${H.fld("pw", t("su_pw"), 'autocomplete="new-password"', "password")}${H.fld("pw2", t("su_pw2"), 'autocomplete="new-password"', "password")}<p class="t2">${t("su_note")}</p>${err}<button class="btn btn-primary" data-act="dosetup">${t("su_create")}</button>`, t("su_title")) };
})();
