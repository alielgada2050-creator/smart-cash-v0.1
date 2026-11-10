#!/usr/bin/env python3
"""Builds the installable web app (PWA) into ../dist from ../prototype. Run: python3 app/build.py"""
import os, re, shutil, json, glob
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src, out = os.path.join(root,"prototype"), os.path.join(root,"dist")
shutil.rmtree(out, ignore_errors=True); os.makedirs(out)
shutil.copytree(os.path.join(src,"js"), os.path.join(out,"js"))
for f in ("icon-192.png","icon-512.png","icon-maskable.png","apple-touch-icon.png","favicon.svg"):
    shutil.copy(os.path.join(root,"app",f), out)
body = open(os.path.join(src,"smart-cash.html"),encoding="utf-8").read()
body = re.sub(r"<title>.*?</title>\n","",body,count=1)
body = body.replace('<meta name="claude:viewport-fit-sides" content="cover">\n',"")
head = '''<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>سمارت كاش · Smart Cash</title>
<meta name="theme-color" content="#000000">
<meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"><meta name="apple-mobile-web-app-title" content="Smart Cash">
<link rel="manifest" href="manifest.webmanifest"><link rel="icon" href="favicon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="apple-touch-icon.png">
<script>window.SC_PROD=1</script>
<style>html,body{margin:0;height:100%}</style>
'''
open(os.path.join(out,"index.html"),"w",encoding="utf-8").write(head+body.replace("</body>","")+"\n</body></html>\n")
json.dump({"name":"سمارت كاش — Smart Cash","short_name":"Smart Cash","lang":"ar","dir":"rtl","start_url":"./index.html","scope":"./","display":"standalone","orientation":"any",
 "background_color":"#000000","theme_color":"#000000","description":"إدارة المصروفات والعهد والفواتير",
 "icons":[{"src":"icon-192.png","sizes":"192x192","type":"image/png"},{"src":"icon-512.png","sizes":"512x512","type":"image/png"},{"src":"icon-maskable.png","sizes":"512x512","type":"image/png","purpose":"maskable"}]},
 open(os.path.join(out,"manifest.webmanifest"),"w",encoding="utf-8"),ensure_ascii=False,indent=1)
files = ["./","index.html","manifest.webmanifest","icon-192.png","icon-512.png","favicon.svg"]+sorted(os.path.relpath(p,out).replace(os.sep,"/") for p in glob.glob(out+"/js/**/*.js",recursive=True))
sw = '''const V="smartcash-v0.8", CORE=%s;
self.addEventListener("install",e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",e=>{ const r=e.request; if(r.method!=="GET") return;
  e.respondWith(caches.match(r).then(hit=>{ const net=fetch(r).then(res=>{ if(res&&(res.ok||res.type==="opaque")){ const cp=res.clone(); caches.open(V).then(c=>c.put(r,cp)) } return res }).catch(()=>hit||(r.mode==="navigate"?caches.match("index.html"):undefined)); return hit||net })) });
''' % json.dumps(files)
open(os.path.join(out,"sw.js"),"w").write(sw)
print("built", out, len(files), "core files")
