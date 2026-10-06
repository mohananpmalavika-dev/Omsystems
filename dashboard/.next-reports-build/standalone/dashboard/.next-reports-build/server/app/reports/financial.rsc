1:I[91133,[],"LoadingBoundaryProvider"]
2:"$Sreact.fragment"
a:I[57567,[],"default",1]
:HL["/_next/static/css/a7a4e057d37b565c.css","style"]
:HL["/_next/static/css/0ed19f67bb871160.css","style"]
:HL["/_next/static/css/0fd97d10fcd9e9c0.css","style"]
:HL["/_next/static/css/2e10263ad06d4bcf.css","style"]
:HL["/_next/static/css/661ec4c733cac905.css","style"]
3:T10b3,
(function() {
  try {
    var stored = localStorage.getItem('sentinel-grid-active-theme');
    var theme = (stored === 'light' || stored === 'navy' || stored === 'emerald' || stored === 'dark') ? stored : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.colorScheme = theme === 'light' ? 'light' : 'dark';
    if (theme === 'light') {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
      document.documentElement.classList.add('dark');
    }
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'light');
    document.documentElement.classList.add('light');
  }

  // Register PWA Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
      if (false) {
        // A worker installed by an earlier preview can retain development CSS.
        var workerUrl = new URL('/sw.js', window.location.origin).href;
        var hadPreviewWorker = navigator.serviceWorker.controller && navigator.serviceWorker.controller.scriptURL === workerUrl;
        Promise.all([
          navigator.serviceWorker.getRegistrations().then(function(registrations) {
            return Promise.all(registrations.filter(function(reg) {
              var worker = reg.active || reg.waiting || reg.installing;
              return worker && worker.scriptURL === workerUrl;
            }).map(function(reg) { return reg.unregister(); }));
          }),
          window.caches ? caches.keys().then(function(names) {
            return Promise.all(names.filter(function(name) { return name.indexOf('kryptonvision-pwa-') === 0; }).map(function(name) { return caches.delete(name); }));
          }) : Promise.resolve()
        ]).then(function() {
          if (hadPreviewWorker && !sessionStorage.getItem('sentinel_preview_cache_recovered')) {
            sessionStorage.setItem('sentinel_preview_cache_recovered', '1');
            window.location.reload();
          }
        }).catch(function(err) { console.debug('Preview cache cleanup:', err); });
        return;
      }
      navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then(function(reg) {
        reg.update();
      }).catch(function(err) {
        console.debug('ServiceWorker registration:', err);
      });
    });
  }

  // Auto-recover from ChunkLoadError (timeout / hash mismatch after new deployments)
  function handleChunkFailure(targetUrlOrMsg, isScriptTag) {
    var str = (targetUrlOrMsg || '') + '';
    var isChunkError = /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module/i.test(str);
    var isScriptFailure = isScriptTag === true && str.indexOf('/_next/static/chunks/') !== -1;
    if (isChunkError || isScriptFailure) {
      var guardKey = 'sentinel_chunk_reload_guard';
      var lastReload = sessionStorage.getItem(guardKey);
      var now = Date.now();
      if (!lastReload || (now - parseInt(lastReload, 10)) > 20000) {
        sessionStorage.setItem(guardKey, String(now));
        console.warn('[ChunkRecovery] Outdated or timed-out script chunk detected, refreshing application...', str);
        window.location.reload();
      }
    }
  }

  window.addEventListener('error', function(event) {
    if (!event) return;
    if (event.error && (event.error.name === 'ChunkLoadError' || /Loading chunk/i.test(event.error.message))) {
      handleChunkFailure(event.error.message, false);
      return;
    }
    if (event.message && /Loading chunk|ChunkLoadError/i.test(event.message)) {
      handleChunkFailure(event.message, false);
      return;
    }
    var target = event.target || event.srcElement;
    if (target && target.tagName === 'SCRIPT' && target.src && target.src.indexOf('/_next/static/chunks/') !== -1) {
      handleChunkFailure(target.src, true);
    }
  }, true);

  window.addEventListener('unhandledrejection', function(event) {
    if (!event || !event.reason) return;
    var reason = event.reason;
    var msg = (reason && (reason.message || reason.stack || reason)) + '';
    if (/Loading chunk|ChunkLoadError/i.test(msg)) {
      handleChunkFailure(msg, false);
    }
  });
})();
8:X
0:{"P":null,"c":["","reports","financial"],"q":"","i":false,"f":[[["",{"children":["reports",{"children":["financial",{"children":["__PAGE__",{},"$undefined","$undefined",4608]},"$undefined","$undefined",4608]},"$undefined","$undefined",4608]},"$undefined","$undefined",4628],[["$","$L1",null,{"loading":[["$","div","l",{"className":"workspace-loading","role":"status","aria-live":"polite","aria-label":"Loading workspace","children":[["$","div",null,{"className":"loading-line loading-title"}],["$","div",null,{"className":"loading-line loading-description"}],["$","div",null,{"className":"loading-cards","children":[["$","div","0",{"className":"loading-card"}],["$","div","1",{"className":"loading-card"}],["$","div","2",{"className":"loading-card"}],["$","div","3",{"className":"loading-card"}]]}],["$","div",null,{"className":"loading-panel"}],["$","span",null,{"className":"sr-only","children":"Loading workspace. Please wait."}]]}],[],null],"children":["$","$2","c",{"children":[[["$","link","0",{"rel":"stylesheet","href":"/_next/static/css/a7a4e057d37b565c.css","precedence":"next","crossOrigin":"$undefined","nonce":"$undefined"}],["$","link","1",{"rel":"stylesheet","href":"/_next/static/css/0ed19f67bb871160.css","precedence":"next","crossOrigin":"$undefined","nonce":"$undefined"}],["$","link","2",{"rel":"stylesheet","href":"/_next/static/css/0fd97d10fcd9e9c0.css","precedence":"next","crossOrigin":"$undefined","nonce":"$undefined"}],["$","link","3",{"rel":"stylesheet","href":"/_next/static/css/2e10263ad06d4bcf.css","precedence":"next","crossOrigin":"$undefined","nonce":"$undefined"}],["$","link","4",{"rel":"stylesheet","href":"/_next/static/css/661ec4c733cac905.css","precedence":"next","crossOrigin":"$undefined","nonce":"$undefined"}]],["$","html",null,{"lang":"en","suppressHydrationWarning":true,"children":[["$","head",null,{"children":[["$","link",null,{"rel":"manifest","href":"/manifest.json"}],["$","meta",null,{"name":"theme-color","content":"#0f172a"}],["$","meta",null,{"name":"mobile-web-app-capable","content":"yes"}],["$","meta",null,{"name":"apple-mobile-web-app-capable","content":"yes"}],["$","meta",null,{"name":"apple-mobile-web-app-status-bar-style","content":"black-translucent"}],["$","meta",null,{"name":"apple-mobile-web-app-title","content":"KryptonVision"}],["$","link",null,{"rel":"apple-touch-icon","href":"/apple-touch-icon.png"}],["$","script",null,{"dangerouslySetInnerHTML":{"__html":"$3"}}]]}],"$L4"]}]]}]}],{"children":["$L5",{"children":["$L6",{"children":["$L7",{},null,false,null]},null,false,"$8"]},null,false,"$8"]},null,false,null],"$L9",false]],"m":"$undefined","G":["$a",[]],"S":true,"h":null,"r":"$undefined","s":"$undefined","a":"$undefined","l":"$undefined","p":"$undefined","d":"$undefined","b":"ujsN4gQGDkd0Ha09lMF1s"}
b:I[41097,["7262","static/chunks/0677a558-a23046a32c7928b9.js","9568","static/chunks/9568-7ca6b233e1ab382e.js","2979","static/chunks/2979-0e2110e567163a60.js","63","static/chunks/63-de877bf1de2740c8.js","4804","static/chunks/4804-963d4acc87fa8c54.js","688","static/chunks/688-9db53a20092b016c.js","4638","static/chunks/4638-dba3882c30048e5b.js","5390","static/chunks/5390-e7c394a62cf25257.js","7177","static/chunks/app/layout-70336ea03221bdbf.js"],"ThemeProvider"]
c:I[83174,["7262","static/chunks/0677a558-a23046a32c7928b9.js","9568","static/chunks/9568-7ca6b233e1ab382e.js","2979","static/chunks/2979-0e2110e567163a60.js","63","static/chunks/63-de877bf1de2740c8.js","4804","static/chunks/4804-963d4acc87fa8c54.js","688","static/chunks/688-9db53a20092b016c.js","4638","static/chunks/4638-dba3882c30048e5b.js","5390","static/chunks/5390-e7c394a62cf25257.js","7177","static/chunks/app/layout-70336ea03221bdbf.js"],"OrgBrandingProvider"]
d:I[47057,["7262","static/chunks/0677a558-a23046a32c7928b9.js","9568","static/chunks/9568-7ca6b233e1ab382e.js","2979","static/chunks/2979-0e2110e567163a60.js","63","static/chunks/63-de877bf1de2740c8.js","4804","static/chunks/4804-963d4acc87fa8c54.js","688","static/chunks/688-9db53a20092b016c.js","4638","static/chunks/4638-dba3882c30048e5b.js","5390","static/chunks/5390-e7c394a62cf25257.js","7177","static/chunks/app/layout-70336ea03221bdbf.js"],"NotificationsProvider"]
e:I[95375,["7262","static/chunks/0677a558-a23046a32c7928b9.js","9568","static/chunks/9568-7ca6b233e1ab382e.js","2979","static/chunks/2979-0e2110e567163a60.js","63","static/chunks/63-de877bf1de2740c8.js","4804","static/chunks/4804-963d4acc87fa8c54.js","688","static/chunks/688-9db53a20092b016c.js","4638","static/chunks/4638-dba3882c30048e5b.js","5390","static/chunks/5390-e7c394a62cf25257.js","7177","static/chunks/app/layout-70336ea03221bdbf.js"],"SessionProvider"]
f:I[23935,["7262","static/chunks/0677a558-a23046a32c7928b9.js","9568","static/chunks/9568-7ca6b233e1ab382e.js","2979","static/chunks/2979-0e2110e567163a60.js","63","static/chunks/63-de877bf1de2740c8.js","4804","static/chunks/4804-963d4acc87fa8c54.js","688","static/chunks/688-9db53a20092b016c.js","4638","static/chunks/4638-dba3882c30048e5b.js","5390","static/chunks/5390-e7c394a62cf25257.js","7177","static/chunks/app/layout-70336ea03221bdbf.js"],"ActivityMonitor"]
10:I[51587,["7262","static/chunks/0677a558-a23046a32c7928b9.js","9568","static/chunks/9568-7ca6b233e1ab382e.js","2979","static/chunks/2979-0e2110e567163a60.js","63","static/chunks/63-de877bf1de2740c8.js","4804","static/chunks/4804-963d4acc87fa8c54.js","688","static/chunks/688-9db53a20092b016c.js","4638","static/chunks/4638-dba3882c30048e5b.js","5390","static/chunks/5390-e7c394a62cf25257.js","7177","static/chunks/app/layout-70336ea03221bdbf.js"],"PerformanceMonitorProvider"]
11:I[97716,["7262","static/chunks/0677a558-a23046a32c7928b9.js","9568","static/chunks/9568-7ca6b233e1ab382e.js","2979","static/chunks/2979-0e2110e567163a60.js","63","static/chunks/63-de877bf1de2740c8.js","4804","static/chunks/4804-963d4acc87fa8c54.js","688","static/chunks/688-9db53a20092b016c.js","4638","static/chunks/4638-dba3882c30048e5b.js","5390","static/chunks/5390-e7c394a62cf25257.js","7177","static/chunks/app/layout-70336ea03221bdbf.js"],"ApplicationShell"]
12:I[91133,[],""]
13:I[31276,["9568","static/chunks/9568-7ca6b233e1ab382e.js","8039","static/chunks/app/error-a1fed67f802b1f1b.js"],"default"]
14:I[4297,[],""]
15:I[99568,["9568","static/chunks/9568-7ca6b233e1ab382e.js","4345","static/chunks/app/not-found-c4bbf3127a06b698.js"],""]
16:I[1076,[],"ClientPageRoot"]
17:I[50061,["9568","static/chunks/9568-7ca6b233e1ab382e.js","2979","static/chunks/2979-0e2110e567163a60.js","63","static/chunks/63-de877bf1de2740c8.js","4804","static/chunks/4804-963d4acc87fa8c54.js","688","static/chunks/688-9db53a20092b016c.js","2356","static/chunks/2356-16f03974497ace3f.js","6469","static/chunks/app/reports/financial/page-c12fa2738e5bc1c9.js"],"default"]
1a:I[31872,[],"OutletBoundary"]
1b:"$Sreact.suspense"
1d:I[31872,[],"ViewportBoundary"]
1f:I[31872,[],"MetadataBoundary"]
4:["$","body",null,{"suppressHydrationWarning":true,"children":["$","$Lb",null,{"children":["$","$Lc",null,{"children":["$","$Ld",null,{"children":["$","$Le",null,{"children":["$","$Lf",null,{"children":["$","$L10",null,{"children":["$","$L11",null,{"children":["$","$L12",null,{"parallelRouterKey":"children","error":"$13","errorStyles":[],"errorScripts":null,"template":["$","$L14",null,{}],"templateStyles":"$undefined","templateScripts":"$undefined","notFound":[["$","section",null,{"className":"workspace-state","children":[["$","span",null,{"className":"workspace-state-icon","children":["$","svg",null,{"ref":"$undefined","xmlns":"http://www.w3.org/2000/svg","width":26,"height":26,"viewBox":"0 0 24 24","fill":"none","stroke":"currentColor","strokeWidth":2,"strokeLinecap":"round","strokeLinejoin":"round","className":"lucide lucide-search","children":[["$","circle","4ej97u",{"cx":"11","cy":"11","r":"8"}],["$","path","1qie3q",{"d":"m21 21-4.3-4.3"}],"$undefined"]}]}],["$","p",null,{"className":"eyebrow-label","children":"Page not found"}],["$","h1",null,{"children":"Let's get you back to work"}],["$","p",null,{"children":"This page may have moved, or the address may be incorrect. Find the feature you need in the workspace directory."}],["$","div",null,{"className":"workspace-state-actions","children":[["$","$L15",null,{"href":"/modules","className":"ui-button ui-button-primary","children":"Browse workspace"}],["$","$L15",null,{"href":"/","className":"ui-button ui-button-outline","children":"Go to overview"}]]}]]}],[]],"forbidden":"$undefined","unauthorized":"$undefined"}]}]}]}]}]}]}]}]}]
5:["$","$2","c",{"children":[null,["$","$L12",null,{"parallelRouterKey":"children","error":"$undefined","errorStyles":"$undefined","errorScripts":"$undefined","template":["$","$L14",null,{}],"templateStyles":"$undefined","templateScripts":"$undefined","notFound":"$undefined","forbidden":"$undefined","unauthorized":"$undefined"}]]}]
6:["$","$2","c",{"children":[null,["$","$L12",null,{"parallelRouterKey":"children","error":"$undefined","errorStyles":"$undefined","errorScripts":"$undefined","template":["$","$L14",null,{}],"templateStyles":"$undefined","templateScripts":"$undefined","notFound":"$undefined","forbidden":"$undefined","unauthorized":"$undefined"}]]}]
7:["$","$2","c",{"children":[["$","$L16",null,{"Component":"$17","serverProvidedParams":{"searchParams":{},"params":{},"promises":["$@18","$@19"]}}],null,["$","$L1a",null,{"children":["$","$1b",null,{"name":"Next.MetadataOutlet","children":"$@1c"}]}]]}]
9:["$","$2","h",{"children":[null,["$","$L1d",null,{"children":"$L1e"}],["$","div",null,{"hidden":true,"children":["$","$L1f",null,{"children":["$","$1b",null,{"name":"Next.Metadata","children":"$L20"}]}]}],null]}]
8:C
18:{}
19:"$7:props:children:0:props:serverProvidedParams:params"
1e:[["$","meta","0",{"charSet":"utf-8"}],["$","meta","1",{"name":"viewport","content":"width=device-width, initial-scale=1"}]]
21:I[12569,[],"IconMark"]
1c:null
20:[["$","title","0",{"children":"KryptonVision | Security Operations"}],["$","meta","1",{"name":"description","content":"Multi-branch CCTV monitoring and security operations"}],["$","link","2",{"rel":"manifest","href":"/manifest.webmanifest","crossOrigin":"$undefined"}],["$","meta","3",{"name":"mobile-web-app-capable","content":"yes"}],["$","meta","4",{"name":"apple-mobile-web-app-title","content":"KryptonVision"}],["$","meta","5",{"name":"apple-mobile-web-app-status-bar-style","content":"black-translucent"}],["$","link","6",{"rel":"icon","href":"/icon-192.png"}],["$","link","7",{"rel":"apple-touch-icon","href":"/apple-touch-icon.png"}],["$","$L21","8",{}]]
