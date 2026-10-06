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
0:{"P":null,"c":["","operations","edge-agents"],"q":"","i":false,"f":[[["",{"children":["operations",{"children":["edge-agents",{"children":["__PAGE__",{},"$undefined","$undefined",4608]},"$undefined","$undefined",4608]},"$undefined","$undefined",4608]},"$undefined","$undefined",4628],[["$","$L1",null,{"loading":[["$","div","l",{"className":"workspace-loading","role":"status","aria-live":"polite","aria-label":"Loading workspace","children":[["$","div",null,{"className":"loading-line loading-title"}],["$","div",null,{"className":"loading-line loading-description"}],["$","div",null,{"className":"loading-cards","children":[["$","div","0",{"className":"loading-card"}],["$","div","1",{"className":"loading-card"}],["$","div","2",{"className":"loading-card"}],["$","div","3",{"className":"loading-card"}]]}],["$","div",null,{"className":"loading-panel"}],["$","span",null,{"className":"sr-only","children":"Loading workspace. Please wait."}]]}],[],null],"children":["$","$2","c",{"children":[[["$","link","0",{"rel":"stylesheet","href":"/_next/static/css/a7a4e057d37b565c.css","precedence":"next","crossOrigin":"$undefined","nonce":"$undefined"}],["$","link","1",{"rel":"stylesheet","href":"/_next/static/css/0ed19f67bb871160.css","precedence":"next","crossOrigin":"$undefined","nonce":"$undefined"}],["$","link","2",{"rel":"stylesheet","href":"/_next/static/css/0fd97d10fcd9e9c0.css","precedence":"next","crossOrigin":"$undefined","nonce":"$undefined"}],["$","link","3",{"rel":"stylesheet","href":"/_next/static/css/2e10263ad06d4bcf.css","precedence":"next","crossOrigin":"$undefined","nonce":"$undefined"}],["$","link","4",{"rel":"stylesheet","href":"/_next/static/css/661ec4c733cac905.css","precedence":"next","crossOrigin":"$undefined","nonce":"$undefined"}]],["$","html",null,{"lang":"en","suppressHydrationWarning":true,"children":[["$","head",null,{"children":[["$","link",null,{"rel":"manifest","href":"/manifest.json"}],["$","meta",null,{"name":"theme-color","content":"#0f172a"}],["$","meta",null,{"name":"mobile-web-app-capable","content":"yes"}],["$","meta",null,{"name":"apple-mobile-web-app-capable","content":"yes"}],["$","meta",null,{"name":"apple-mobile-web-app-status-bar-style","content":"black-translucent"}],["$","meta",null,{"name":"apple-mobile-web-app-title","content":"KryptonVision"}],["$","link",null,{"rel":"apple-touch-icon","href":"/apple-touch-icon.png"}],["$","script",null,{"dangerouslySetInnerHTML":{"__html":"$3"}}]]}],"$L4"]}]]}]}],{"children":["$L5",{"children":["$L6",{"children":["$L7",{},null,false,null]},null,false,"$8"]},null,false,null]},null,false,null],"$L9",false]],"m":"$undefined","G":["$a",[]],"S":true,"h":null,"r":"$undefined","s":"$undefined","a":"$undefined","l":"$undefined","p":"$undefined","d":"$undefined","b":"ujsN4gQGDkd0Ha09lMF1s"}
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
15:I[99568,["7262","static/chunks/0677a558-a23046a32c7928b9.js","9568","static/chunks/9568-7ca6b233e1ab382e.js","5579","static/chunks/5579-fced5d19ac2e8d0f.js","4638","static/chunks/4638-dba3882c30048e5b.js","4581","static/chunks/4581-5a7e74a9598ac05d.js","1368","static/chunks/1368-a88b40770c3cdc7e.js","6697","static/chunks/6697-a816069a4515480c.js","9813","static/chunks/9813-e3ae068688bb8ebc.js","8409","static/chunks/8409-2fdb343290c60984.js","5129","static/chunks/5129-f1223ee82ef1522e.js","5317","static/chunks/app/operations/page-a1a74fe2d7b71d91.js"],""]
16:I[80688,["9568","static/chunks/9568-7ca6b233e1ab382e.js","2979","static/chunks/2979-0e2110e567163a60.js","63","static/chunks/63-de877bf1de2740c8.js","4804","static/chunks/4804-963d4acc87fa8c54.js","688","static/chunks/688-9db53a20092b016c.js","1142","static/chunks/app/operations/layout-8e6fc9047014ec6c.js"],"AppLayout"]
1e:I[31872,[],"ViewportBoundary"]
20:I[31872,[],"MetadataBoundary"]
21:"$Sreact.suspense"
4:["$","body",null,{"suppressHydrationWarning":true,"children":["$","$Lb",null,{"children":["$","$Lc",null,{"children":["$","$Ld",null,{"children":["$","$Le",null,{"children":["$","$Lf",null,{"children":["$","$L10",null,{"children":["$","$L11",null,{"children":["$","$L12",null,{"parallelRouterKey":"children","error":"$13","errorStyles":[],"errorScripts":null,"template":["$","$L14",null,{}],"templateStyles":"$undefined","templateScripts":"$undefined","notFound":[["$","section",null,{"className":"workspace-state","children":[["$","span",null,{"className":"workspace-state-icon","children":["$","svg",null,{"ref":"$undefined","xmlns":"http://www.w3.org/2000/svg","width":26,"height":26,"viewBox":"0 0 24 24","fill":"none","stroke":"currentColor","strokeWidth":2,"strokeLinecap":"round","strokeLinejoin":"round","className":"lucide lucide-search","children":[["$","circle","4ej97u",{"cx":"11","cy":"11","r":"8"}],["$","path","1qie3q",{"d":"m21 21-4.3-4.3"}],"$undefined"]}]}],["$","p",null,{"className":"eyebrow-label","children":"Page not found"}],["$","h1",null,{"children":"Let's get you back to work"}],["$","p",null,{"children":"This page may have moved, or the address may be incorrect. Find the feature you need in the workspace directory."}],["$","div",null,{"className":"workspace-state-actions","children":[["$","$L15",null,{"href":"/modules","className":"ui-button ui-button-primary","children":"Browse workspace"}],["$","$L15",null,{"href":"/","className":"ui-button ui-button-outline","children":"Go to overview"}]]}]]}],[]],"forbidden":"$undefined","unauthorized":"$undefined"}]}]}]}]}]}]}]}]}]
5:["$","$2","c",{"children":[null,["$","$L16",null,{"children":["$","div",null,{"className":"product-section-shell operations-section","children":["$","$L12",null,{"parallelRouterKey":"children","error":"$undefined","errorStyles":"$undefined","errorScripts":"$undefined","template":["$","$L14",null,{}],"templateStyles":"$undefined","templateScripts":"$undefined","notFound":"$undefined","forbidden":"$undefined","unauthorized":"$undefined"}]}]}]]}]
6:["$","$2","c",{"children":[null,["$","$L12",null,{"parallelRouterKey":"children","error":"$undefined","errorStyles":"$undefined","errorScripts":"$undefined","template":["$","$L14",null,{}],"templateStyles":"$undefined","templateScripts":"$undefined","notFound":"$undefined","forbidden":"$undefined","unauthorized":"$undefined"}]]}]
7:["$","$2","c",{"children":[["$","div",null,{"className":"min-h-screen bg-slate-950 p-6","children":["$","div",null,{"className":"max-w-7xl mx-auto space-y-4","children":[["$","div",null,{"className":"workspace-heading","children":[["$","h1",null,{"className":"text-2xl font-bold text-slate-100 tracking-tight","children":"Edge Gateways & Fleet Control"}],["$","p",null,{"className":"text-sm text-slate-400 mt-1","children":"Zero-Outage Branch Architecture: Multi-Protocol Discovery (ONVIF/Dahua/Hik/CP PLUS), Store-and-Forward Buffering, Broadband & LTE Failover, and Local Credential Rotation"}],["$","div",null,{"className":"field-visual","aria-hidden":"true","children":[["$","span",null,{"className":"field-visual-coordinate","children":"KRYPTON / FIELD"}],["$","svg",null,{"viewBox":"0 0 320 220","fill":"none","children":[["$","g",null,{"className":"field-art-orbit","stroke":"currentColor","children":[["$","ellipse",null,{"cx":"160","cy":"110","rx":"121","ry":"65","transform":"rotate(-24 160 110)","opacity":".4"}],["$","ellipse",null,{"cx":"160","cy":"110","rx":"112","ry":"57","transform":"rotate(34 160 110)","opacity":".2"}],["$","circle",null,{"cx":"160","cy":"110","r":"85","strokeDasharray":"1 9","opacity":".4"}],["$","circle",null,{"cx":"160","cy":"110","r":"42","fill":"currentColor","fillOpacity":".07","strokeOpacity":".5"}],["$","path",null,{"d":"M 147 96 L 173 96 L 173 122 L 147 122 Z M 160 78 V 91 M 160 127 V 142 M 129 110 H 142 M 178 110 H 192","strokeWidth":"2"}],["$","circle",null,{"cx":"49","cy":"143","r":"6","fill":"currentColor","stroke":"none"}],["$","circle",null,{"cx":"260","cy":"67","r":"4","fill":"currentColor","stroke":"none"}],["$","path",null,{"d":"M 27 192 H 96 M 27 184 V 200 M 291 26 V 66 M 284 26 H 298","opacity":".35"}]]}],["$","g",null,{"className":"field-art-spectrum","stroke":"currentColor","children":[[["$","path","0",{"d":"M 35 182 V 104","strokeWidth":"11","strokeLinecap":"round","opacity":0.2}],["$","path","1",{"d":"M 63 182 V 69.50437487304575","strokeWidth":"11","strokeLinecap":"round","opacity":0.27}],["$","path","2",{"d":"M 91 182 V 49.07718343122","strokeWidth":"11","strokeLinecap":"round","opacity":0.34}],["$","path","3",{"d":"M 119 182 V 51.049296244779455","strokeWidth":"11","strokeLinecap":"round","opacity":0.41000000000000003}],["$","path","4",{"d":"M 147 182 V 74.61642180617655","strokeWidth":"11","strokeLinecap":"round","opacity":0.48000000000000004}],["$","path","5",{"d":"M 175 182 V 110.16712266821618","strokeWidth":"11","strokeLinecap":"round","opacity":0.55}],["$","path","6",{"d":"M 203 182 V 143.20267107348653","strokeWidth":"11","strokeLinecap":"round","opacity":0.6200000000000001}],["$","path","7",{"d":"M 231 182 V 160.2500999346845","strokeWidth":"11","strokeLinecap":"round","opacity":0.6900000000000001}],["$","path","8",{"d":"M 259 182 V 154.35691537604873","strokeWidth":"11","strokeLinecap":"round","opacity":0.76}]],["$","path",null,{"d":"M 27 196 H 300 M 38 40 V 190","opacity":".2"}],["$","path",null,{"d":"M 32 104 C 86 6 118 60 160 61 S 231 191 290 129","strokeWidth":"1.5","strokeDasharray":"3 6","opacity":".5"}],["$","circle",null,{"cx":"160","cy":"61","r":"7","fill":"currentColor","stroke":"none"}]]}],["$","g",null,{"className":"field-art-proof","stroke":"currentColor","children":[["$","path",null,{"d":"M 160 31 L 265 88 L 160 147 L 55 88 Z","fill":"currentColor","fillOpacity":".08","opacity":".7"}],["$","path",null,{"d":"M 55 111 L 160 170 L 265 111 M 55 134 L 160 193 L 265 134","opacity":".4"}],["$","path",null,{"d":"M 160 65 L 185 77 V 99 L 160 119 L 135 99 V 77 Z","fill":"currentColor","fillOpacity":".08"}],["$","path",null,{"d":"M 148 90 L 157 99 L 174 81","strokeWidth":"3"}],["$","path",null,{"d":"M 160 147 V 193 M 55 88 V 134 M 265 88 V 134","opacity":".15","strokeDasharray":"2 5"}]]}],["$","g",null,{"className":"field-art-pulse","stroke":"currentColor","children":[["$","circle",null,{"cx":"160","cy":"110","r":"80","opacity":".15"}],["$","circle",null,{"cx":"160","cy":"110","r":"101","strokeDasharray":"2 8","opacity":".3"}],["$","path",null,{"d":"M 18 110 H 87 L 110 76 L 139 152 L 161 66 L 190 123 L 210 110 H 302","strokeWidth":"2"}],["$","circle",null,{"cx":"161","cy":"66","r":"5","fill":"currentColor","stroke":"none"}],["$","path",null,{"d":"M 55 44 H 103 M 218 180 H 275","opacity":".3"}]]}],["$","g",null,{"className":"field-art-neural","stroke":"currentColor","children":[["$","circle",null,{"className":"field-neural-ring","cx":"160","cy":"110","r":"68","strokeDasharray":"2 8"}],["$","circle",null,{"className":"field-neural-ring","cx":"160","cy":"110","r":"94","strokeDasharray":"1 11"}],["$","g",null,{"className":"field-neural-links","strokeWidth":"1.2","children":[["$","path",null,{"d":"M 44 116 Q 105 75 160 110 M 76 47 Q 121 51 160 110 M 96 177 Q 124 149 160 110 M 160 110 Q 210 53 254 58 M 160 110 Q 224 103 282 116 M 160 110 Q 207 170 250 173"}],"$L17"]}],"$L18","$L19","$L1a"]}]]}],"$L1b"]}]]}],"$L1c"]}]}],null,"$L1d"]}]
9:["$","$2","h",{"children":[null,["$","$L1e",null,{"children":"$L1f"}],["$","div",null,{"hidden":true,"children":["$","$L20",null,{"children":["$","$21",null,{"name":"Next.Metadata","children":"$L22"}]}]}],null]}]
23:I[50699,["8556","static/chunks/app/operations/edge-agents/page-cdb5d6ab58337a7c.js"],"BranchEdgeProductView"]
24:I[31872,[],"OutletBoundary"]
8:C
17:["$","path",null,{"d":"M 44 116 Q 52 71 76 47 M 44 116 Q 63 169 96 177 M 76 47 Q 171 15 254 58 M 254 58 Q 283 78 282 116 M 282 116 Q 279 156 250 173 M 96 177 Q 174 208 250 173"}]
18:["$","g",null,{"className":"field-neural-flow","strokeWidth":"2","strokeLinecap":"round","children":[["$","path",null,{"d":"M 44 116 Q 105 75 160 110 Q 210 53 254 58"}],["$","path",null,{"d":"M 96 177 Q 124 149 160 110 Q 224 103 282 116"}],["$","path",null,{"d":"M 76 47 Q 121 51 160 110 Q 207 170 250 173"}]]}]
19:["$","g",null,{"className":"field-neural-nodes","children":[["$","g","0",{"className":"field-neural-node","children":[["$","circle",null,{"cx":44,"cy":116,"r":"8","fill":"currentColor","fillOpacity":".13"}],["$","circle",null,{"cx":44,"cy":116,"r":"3","fill":"currentColor","stroke":"none"}]]}],["$","g","1",{"className":"field-neural-node","children":[["$","circle",null,{"cx":76,"cy":47,"r":"8","fill":"currentColor","fillOpacity":".13"}],["$","circle",null,{"cx":76,"cy":47,"r":"3","fill":"currentColor","stroke":"none"}]]}],["$","g","2",{"className":"field-neural-node","children":[["$","circle",null,{"cx":96,"cy":177,"r":"8","fill":"currentColor","fillOpacity":".13"}],["$","circle",null,{"cx":96,"cy":177,"r":"3","fill":"currentColor","stroke":"none"}]]}],["$","g","3",{"className":"field-neural-node","children":[["$","circle",null,{"cx":254,"cy":58,"r":"8","fill":"currentColor","fillOpacity":".13"}],["$","circle",null,{"cx":254,"cy":58,"r":"3","fill":"currentColor","stroke":"none"}]]}],["$","g","4",{"className":"field-neural-node","children":[["$","circle",null,{"cx":282,"cy":116,"r":"8","fill":"currentColor","fillOpacity":".13"}],["$","circle",null,{"cx":282,"cy":116,"r":"3","fill":"currentColor","stroke":"none"}]]}],["$","g","5",{"className":"field-neural-node","children":[["$","circle",null,{"cx":250,"cy":173,"r":"8","fill":"currentColor","fillOpacity":".13"}],["$","circle",null,{"cx":250,"cy":173,"r":"3","fill":"currentColor","stroke":"none"}]]}]]}]
1a:["$","g",null,{"className":"field-neural-core","children":[["$","path",null,{"d":"M 160 77 L 188 94 V 126 L 160 143 L 132 126 V 94 Z","fill":"currentColor","fillOpacity":".12","strokeWidth":"1.5"}],["$","circle",null,{"cx":"160","cy":"110","r":"17","fill":"currentColor","fillOpacity":".08"}],["$","path",null,{"d":"M 149 110 H 171 M 160 99 V 121","strokeWidth":"1.4"}],["$","circle",null,{"cx":"160","cy":"110","r":"4","fill":"currentColor","stroke":"none"}]]}]
1b:["$","span",null,{"className":"field-visual-caption","children":"A WIDER PERSPECTIVE"}]
1c:["$","$L23",null,{}]
1d:["$","$L24",null,{"children":["$","$21",null,{"name":"Next.MetadataOutlet","children":"$@25"}]}]
1f:[["$","meta","0",{"charSet":"utf-8"}],["$","meta","1",{"name":"viewport","content":"width=device-width, initial-scale=1"}]]
26:I[12569,[],"IconMark"]
22:[["$","title","0",{"children":"Edge Gateways & Fleet Control | KryptonVision"}],["$","meta","1",{"name":"description","content":"Enterprise Edge Appliance Fleet: Multi-Protocol Device Discovery, WAN Outage Store-and-Forward Buffering, Network Diagnostics, and Local Credential Rotation"}],["$","link","2",{"rel":"manifest","href":"/manifest.webmanifest","crossOrigin":"$undefined"}],["$","meta","3",{"name":"mobile-web-app-capable","content":"yes"}],["$","meta","4",{"name":"apple-mobile-web-app-title","content":"KryptonVision"}],["$","meta","5",{"name":"apple-mobile-web-app-status-bar-style","content":"black-translucent"}],["$","link","6",{"rel":"icon","href":"/icon-192.png"}],["$","link","7",{"rel":"apple-touch-icon","href":"/apple-touch-icon.png"}],["$","$L26","8",{}]]
25:null
