(()=>{var a={};a.id=4851,a.ids=[4851],a.modules={3295:a=>{"use strict";a.exports=require("next/dist/server/app-render/after-task-async-storage.external.js")},8128:a=>{"use strict";a.exports=require("next/dist/server/runtime-reacts.external.js")},9850:(a,b,c)=>{Promise.resolve().then(c.bind(c,74871)),Promise.resolve().then(c.bind(c,18814))},10846:a=>{"use strict";a.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},18814:(a,b,c)=>{"use strict";c.d(b,{EmployeeActivityReport:()=>d});let d=(0,c(92713).registerClientReference)(function(){throw Error("Attempted to call EmployeeActivityReport() from the server but EmployeeActivityReport is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"C:\\Omsystems\\Omsystems\\dashboard\\components\\EmployeeActivityReport.tsx","EmployeeActivityReport")},19121:a=>{"use strict";a.exports=require("next/dist/server/app-render/action-async-storage.external.js")},25194:(a,b,c)=>{"use strict";c.d(b,{EmployeeActivityReport:()=>I});var d=c(26835),e=c(53830),f=c(48575),g=c(28274),h=c(51334),i=c(57242),j=c(25699),k=c(25282),l=c(98289),m=c(1050),n=c(52431);let o=(0,n.A)("UserRound",[["circle",{cx:"12",cy:"8",r:"5",key:"1hypcn"}],["path",{d:"M20 21a8 8 0 0 0-16 0",key:"rfgkzh"}]]),p=(0,n.A)("CalendarDays",[["path",{d:"M8 2v4",key:"1cmpym"}],["path",{d:"M16 2v4",key:"4m81vk"}],["rect",{width:"18",height:"18",x:"3",y:"4",rx:"2",key:"1hopcy"}],["path",{d:"M3 10h18",key:"8toen8"}],["path",{d:"M8 14h.01",key:"6423bh"}],["path",{d:"M12 14h.01",key:"1etili"}],["path",{d:"M16 14h.01",key:"1gbofw"}],["path",{d:"M8 18h.01",key:"lrp35t"}],["path",{d:"M12 18h.01",key:"mhygvu"}],["path",{d:"M16 18h.01",key:"kzsmim"}]]);var q=c(48802),r=c(88491),s=c(67789),t=c(62693),u=c(73007),v=c(99141),w=c(78299),x=c(1623);function y(a,b){(0,x.T)("export","export","activity_report",{actionTarget:"employee_activity_report",actionDescription:"Exported employee activity report as CSV",featureName:"report_export",actionMetadata:{format:"csv",userId:a.user.username,reportPeriod:`${a.period.startDate} to ${a.period.endDate}`}});let c=[];c.push("Employee Activity Report"),c.push(`Employee: ${a.user.display_name} (${a.user.username})`),c.push(`Period: ${a.period.startDate} to ${a.period.endDate}`),c.push(""),c.push("Session Summary"),c.push("Metric,Value"),c.push(`Total Sessions,${a.sessionSummary.total_sessions}`),c.push(`Total Duration,${z(a.sessionSummary.total_duration_seconds)}`),c.push(`Active Duration,${z(a.sessionSummary.active_duration_seconds)}`),c.push(`Idle Duration,${z(a.sessionSummary.idle_duration_seconds)}`),c.push(`Average Session Duration,${z(a.sessionSummary.avg_session_duration_seconds)}`),c.push(""),c.push("Module Usage"),c.push("Module,Visits,Total Time (seconds),Average Time (seconds)"),a.moduleUsage.forEach(a=>{c.push(`${a.page_module},${a.visit_count},${a.total_seconds},${a.avg_seconds}`)}),c.push(""),c.push("Control Room Activity"),c.push("Metric,Value"),c.push(`Monitoring Sessions,${a.controlRoomSummary.total_monitoring_sessions}`),c.push(`Monitoring Time,${z(a.controlRoomSummary.total_monitoring_seconds)}`),c.push(`Branches Monitored,${a.controlRoomSummary.unique_branches_monitored}`),c.push(`Alerts Handled,${a.controlRoomSummary.total_alerts_handled}`),c.push(`Incidents Created,${a.controlRoomSummary.total_incidents_created}`),c.push(`Camera Switches,${a.controlRoomSummary.total_camera_switches}`),c.push(""),a.branchMonitoring.length>0&&(c.push("Branch Monitoring Breakdown"),c.push("Branch,Sessions,Total Time (seconds)"),a.branchMonitoring.forEach(a=>{c.push(`${a.branch_name},${a.monitoring_sessions},${a.total_seconds}`)}),c.push("")),c.push("Action Summary"),c.push("Category,Count"),a.actionSummary.forEach(a=>{c.push(`${a.action_category},${a.action_count}`)}),a.timeline?.length&&(c.push(""),c.push("Complete Login-to-Logout Timeline"),c.push("Time,Event,Title,Description,Module,Branch,Duration Seconds,Outcome,Session"),a.timeline.forEach(a=>{c.push([a.event_time,a.event_type,a.title,a.description,a.module_name,a.branch_name,a.duration_seconds,a.outcome,a.session_id].map(A).join(","))}));let d=new Blob([c.join("\n")],{type:"text/csv;charset=utf-8;"}),e=URL.createObjectURL(d),f=document.createElement("a");f.href=e,f.download=b||`employee-activity-report-${a.period.startDate}-to-${a.period.endDate}.csv`,f.click(),URL.revokeObjectURL(e)}function z(a){let b=Math.floor(a/3600),c=Math.floor(a%3600/60);return`${b}h ${c}m`}function A(a){let b=null==a?"":String(a),c=/^[=+\-@]/.test(b)?`'${b}`:b;return`"${c.replaceAll('"','""')}"`}function B(a){return String(a??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}function C(a){return(0,e.useCallback)((b,c,d)=>{(0,x.T)(b,c,a,d)},[a])}function D(a=0){return new Date(Date.now()-24*a*36e5).toISOString().split("T")[0]??""}function E(a){let b=Number(a??0);return Number.isFinite(b)?b:0}function F(a){return{id:String(a?.id??void 0??""),display_name:String(a?.display_name??a?.displayName??void 0??void 0??a?.username??"Authenticated Operator"),username:String(a?.username??a?.email??void 0??void 0??a?.identitySubject??"")}}function G(a){return Array.isArray(a)?a.map(a=>({event_id:String(a.event_id??""),event_type:String(a.event_type??"user_action"),event_time:String(a.event_time??""),session_id:a.session_id?String(a.session_id):null,page_visit_id:a.page_visit_id?String(a.page_visit_id):null,module_name:a.module_name?String(a.module_name):null,title:String(a.title??"Activity"),description:String(a.description??""),duration_seconds:null==a.duration_seconds?null:E(a.duration_seconds),branch_id:a.branch_id?String(a.branch_id):null,branch_name:a.branch_name?String(a.branch_name):null,outcome:a.outcome?String(a.outcome):null,metadata:a.metadata&&"object"==typeof a.metadata?a.metadata:{}})):[]}async function H(a){let b=await a.json().catch(()=>({}));if(!a.ok){let c=b?.message??b?.error;throw Error("control_plane_unavailable"===c?"The control plane is temporarily unavailable. Check the deployed service connection and try again.":c||`Request failed with status ${a.status}`)}return b}function I({apiBaseUrl:a="/api/control",accessToken:b,currentUserId:c,showAllUsers:n=!1}){let A,N,O,[P,Q]=(0,e.useState)("seven-days"),[R,S]=(0,e.useState)(D(7)),[T,U]=(0,e.useState)(D()),[V,W]=(0,e.useState)(c??""),[X,Y]=(0,e.useState)([]),[Z,$]=(0,e.useState)(null),[_,aa]=(0,e.useState)([]),[ab,ac]=(0,e.useState)(0),[ad,ae]=(0,e.useState)([]),[af,ag]=(0,e.useState)(!1),[ah,ai]=(0,e.useState)(!0),[aj,ak]=(0,e.useState)(!1),[al,am]=(0,e.useState)(null),[an,ao]=(0,e.useState)(null),ap=(A=C("activity_report"),(0,e.useCallback)((a,b)=>{A("button_click","navigation",{actionTarget:a,actionDescription:`Clicked ${a}`,featureName:b?.featureName,actionMetadata:b?.metadata})},[A])),aq=(N=C("activity_report"),(0,e.useCallback)((a,b,c)=>{N("export","export",{actionTarget:a,actionDescription:`Exported ${b} records as ${c}`,actionMetadata:{exportType:a,recordCount:b,format:c,timestamp:new Date().toISOString()}})},[N])),ar=(O=C("activity_report"),(0,e.useCallback)((a,b)=>{O("filter_change","data_view",{actionTarget:a,actionDescription:`Applied filter: ${a}`,actionMetadata:{filterName:a,valueType:Array.isArray(b)?"array":typeof b,selectionCount:Array.isArray(b)?b.length:+(null!=b),timestamp:new Date().toISOString()}})},[O])),as=(0,e.useMemo)(()=>{let a={"Content-Type":"application/json"};return b&&(a.authorization=`Bearer ${b}`,a["x-sentinel-session"]=b),{credentials:"include",cache:"no-store",headers:a}},[b]);(0,e.useCallback)(async()=>{if(n){ak(!0),ao(null);try{let b=await fetch(`${a}/v1/users?limit=100`,as),c=await H(b);Y((c.data??[]).map(F))}catch(a){Y([]),ao(a instanceof Error?`${a.message} Showing your activity instead.`:"Employee directory unavailable. Showing your activity instead.")}finally{ak(!1)}}},[a,as,n]);let at=(0,e.useCallback)(async()=>{if(R&&T){if(R>T){am("Start date must be before the end date."),$(null),ai(!1);return}ai(!0),am(null);try{var b;let d=V||c,e=new URLSearchParams({startDate:R,endDate:T});d&&e.set("userId",d);let f=new URLSearchParams(e);f.set("limit","200"),f.set("offset","0");let g=new URLSearchParams;d&&g.set("userId",d),g.set("from",`${R}T00:00:00.000Z`),g.set("to",`${T}T23:59:59.999Z`),g.set("limit","100");let[h,i,j]=await Promise.all([fetch(`${a}/v1/activity/report/comprehensive?${e}`,as),fetch(`${a}/v1/activity/timeline?${f}`,as),fetch(`${a}/v1/audit/access-logs?${g}`,as)]),[k,l]=await Promise.all([H(h),H(i)]),m=j.ok?await H(j):{data:[]};$({user:F(k?.user),period:{startDate:String(k?.period?.startDate??""),endDate:String(k?.period?.endDate??"")},sessionSummary:{total_sessions:E(k?.sessionSummary?.total_sessions),total_duration_seconds:E(k?.sessionSummary?.total_duration_seconds),active_duration_seconds:E(k?.sessionSummary?.active_duration_seconds),idle_duration_seconds:E(k?.sessionSummary?.idle_duration_seconds),avg_session_duration_seconds:E(k?.sessionSummary?.avg_session_duration_seconds),first_login:k?.sessionSummary?.first_login??null,last_logout:k?.sessionSummary?.last_logout??null},moduleUsage:Array.isArray(k?.moduleUsage)?k.moduleUsage.map(a=>({page_module:String(a.page_module??"other"),visit_count:E(a.visit_count),total_seconds:E(a.total_seconds),avg_seconds:E(a.avg_seconds)})):[],controlRoomSummary:{total_monitoring_sessions:E(k?.controlRoomSummary?.total_monitoring_sessions),total_monitoring_seconds:E(k?.controlRoomSummary?.total_monitoring_seconds),unique_branches_monitored:E(k?.controlRoomSummary?.unique_branches_monitored),total_alerts_handled:E(k?.controlRoomSummary?.total_alerts_handled),total_incidents_created:E(k?.controlRoomSummary?.total_incidents_created),total_camera_switches:E(k?.controlRoomSummary?.total_camera_switches)},branchMonitoring:Array.isArray(k?.branchMonitoring)?k.branchMonitoring.map(a=>({branch_name:String(a.branch_name??"Unassigned branch"),branch_node_id:String(a.branch_node_id??""),monitoring_sessions:E(a.monitoring_sessions),total_seconds:E(a.total_seconds)})):[],actionSummary:Array.isArray(k?.actionSummary)?k.actionSummary.map(a=>({action_category:String(a.action_category??"other"),action_count:E(a.action_count)})):[]}),aa(G(l.data)),ac(E(l.total)),ae((b=m.data,Array.isArray(b)?b.map(a=>({id:String(a.id??""),accessTimestamp:String(a.accessTimestamp??""),accessType:String(a.accessType??"access"),accessResult:a.accessResult??null,cameraName:a.cameraName??null,branchName:a.branchName??null,userName:a.userName??null,durationSeconds:null==a.durationSeconds?null:E(a.durationSeconds)})).filter(a=>!!a.id):[]))}catch(a){$(null),aa([]),ac(0),ae([]),am(a instanceof Error?a.message:"Unable to load the employee activity report.")}finally{ai(!1)}}},[a,c,T,as,V,R]),au=(0,e.useCallback)(async()=>{if(!af&&!(_.length>=ab)){ag(!0);try{let b=new URLSearchParams({startDate:R,endDate:T,limit:"200",offset:String(_.length)}),d=V||c;d&&b.set("userId",d);let e=await fetch(`${a}/v1/activity/timeline?${b}`,as),f=await H(e);aa(a=>[...a,...G(f.data)]),ac(E(f.total))}catch(a){am(a instanceof Error?a.message:"Unable to load more activity events.")}finally{ag(!1)}}},[a,c,T,as,V,R,_.length,af,ab]),av=a=>{Z&&(aq("employee_activity_report",Z.moduleUsage.length,a),function(a,b){let{format:c,filename:d}=b;switch(c){case"pdf":var e;let f,g;(0,x.T)("export","export","activity_report",{actionTarget:"employee_activity_report",actionDescription:"Exported employee activity report as PDF",featureName:"report_export",actionMetadata:{format:"pdf",userId:a.user.username,reportPeriod:`${a.period.startDate} to ${a.period.endDate}`}}),e=a,f=`
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Employee Activity Report</title>
  <style>
    @media print {
      @page { margin: 20mm; }
      body { margin: 0; }
    }
    
    body {
      font-family: Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 210mm;
      margin: 0 auto;
      padding: 20px;
    }
    
    h1 {
      color: #1e40af;
      border-bottom: 3px solid #1e40af;
      padding-bottom: 10px;
    }
    
    h2 {
      color: #1e40af;
      margin-top: 30px;
      border-bottom: 2px solid #e5e7eb;
      padding-bottom: 5px;
    }
    
    .header-info {
      background: #f3f4f6;
      padding: 15px;
      border-radius: 8px;
      margin: 20px 0;
    }
    
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
      margin: 20px 0;
    }
    
    .stat-card {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 15px;
    }
    
    .stat-label {
      font-size: 12px;
      color: #6b7280;
      text-transform: uppercase;
      margin-bottom: 5px;
    }
    
    .stat-value {
      font-size: 24px;
      font-weight: bold;
      color: #1e40af;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    
    th, td {
      text-align: left;
      padding: 12px;
      border-bottom: 1px solid #e5e7eb;
    }
    
    th {
      background: #f3f4f6;
      font-weight: bold;
      color: #1f2937;
    }
    
    tr:hover {
      background: #f9fafb;
    }
    
    .progress-bar {
      height: 8px;
      background: #e5e7eb;
      border-radius: 4px;
      overflow: hidden;
      margin-top: 5px;
    }
    
    .progress-fill {
      height: 100%;
      background: #1e40af;
    }
    
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 2px solid #e5e7eb;
      text-align: center;
      color: #6b7280;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <h1>Employee Activity Report</h1>
  
  <div class="header-info">
    <p><strong>Employee:</strong> ${e.user.display_name} (${e.user.username})</p>
    <p><strong>Report Period:</strong> ${e.period.startDate} to ${e.period.endDate}</p>
    <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
  </div>
  
  <h2>Session Summary</h2>
  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-label">Total Sessions</div>
      <div class="stat-value">${e.sessionSummary.total_sessions}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Total Time</div>
      <div class="stat-value">${z(e.sessionSummary.total_duration_seconds)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Average Session</div>
      <div class="stat-value">${z(e.sessionSummary.avg_session_duration_seconds)}</div>
    </div>
  </div>

  ${e.timeline?.length?`
    <h2>Complete Login-to-Logout Timeline</h2>
    <table>
      <thead><tr><th>Time</th><th>Event</th><th>Activity</th><th>Module / Branch</th><th>Duration / Outcome</th></tr></thead>
      <tbody>
        ${e.timeline.map(a=>`
          <tr>
            <td>${B(new Date(a.event_time).toLocaleString())}</td>
            <td>${B(String(a.event_type).replace(/_/g," "))}</td>
            <td>${B(a.title)}<br><small>${B(a.description||"")}</small></td>
            <td>${B(a.module_name||"Platform")}${a.branch_name?` / ${B(a.branch_name)}`:""}</td>
            <td>${null==a.duration_seconds?B(a.outcome||"Recorded"):z(a.duration_seconds)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `:""}
  
  <h2>Module Usage</h2>
  <table>
    <thead>
      <tr>
        <th>Module</th>
        <th>Visits</th>
        <th>Total Time</th>
        <th>Percentage</th>
      </tr>
    </thead>
    <tbody>
      ${e.moduleUsage.map(a=>{let b=e.moduleUsage.reduce((a,b)=>a+b.total_seconds,0),c=(a.total_seconds/b*100).toFixed(1);return`
          <tr>
            <td style="text-transform: capitalize;">${a.page_module.replace(/_/g," ")}</td>
            <td>${a.visit_count}</td>
            <td>${z(a.total_seconds)}</td>
            <td>
              ${c}%
              <div class="progress-bar">
                <div class="progress-fill" style="width: ${c}%"></div>
              </div>
            </td>
          </tr>
        `}).join("")}
    </tbody>
  </table>
  
  <h2>Control Room Activity</h2>
  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-label">Monitoring Time</div>
      <div class="stat-value">${z(e.controlRoomSummary.total_monitoring_seconds)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Branches Monitored</div>
      <div class="stat-value">${e.controlRoomSummary.unique_branches_monitored}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Alerts Handled</div>
      <div class="stat-value">${e.controlRoomSummary.total_alerts_handled}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Incidents Created</div>
      <div class="stat-value">${e.controlRoomSummary.total_incidents_created}</div>
    </div>
  </div>
  
  ${e.branchMonitoring.length>0?`
    <h2>Branch Monitoring Breakdown</h2>
    <table>
      <thead>
        <tr>
          <th>Branch</th>
          <th>Sessions</th>
          <th>Total Time</th>
        </tr>
      </thead>
      <tbody>
        ${e.branchMonitoring.slice(0,20).map(a=>`
          <tr>
            <td>${a.branch_name}</td>
            <td>${a.monitoring_sessions}</td>
            <td>${z(a.total_seconds)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `:""}
  
  <h2>Action Summary</h2>
  <div class="stats-grid">
    ${e.actionSummary.map(a=>`
      <div class="stat-card">
        <div class="stat-label" style="text-transform: capitalize;">${a.action_category.replace(/_/g," ")}</div>
        <div class="stat-value">${a.action_count}</div>
      </div>
    `).join("")}
  </div>
  
  <div class="footer">
    <p>Employee Activity Tracking System | Generated on ${new Date().toLocaleString()}</p>
  </div>
</body>
</html>
  `,(g=window.open("","_blank"))?(g.document.write(f),g.document.close(),g.onload=()=>{g.focus(),g.print()}):alert("Please allow popups to export PDF");break;case"excel":y(a,d?.replace(".xlsx",".csv")||void 0);break;case"csv":y(a,d);break;default:throw Error(`Unsupported export format: ${c}`)}}({...Z,timeline:_},{format:a}))},aw=a=>{let b=Math.floor(a/3600),c=Math.floor(a%3600/60);return b>0?`${b}h ${c}m`:`${c}m`},ax=(a,b)=>b>0?Math.min(100,a/b*100):0,ay=Z?.moduleUsage.reduce((a,b)=>a+b.total_seconds,0)??0,az=Z?.actionSummary.reduce((a,b)=>a+b.action_count,0)??0;return(0,d.jsxs)("div",{className:"employee-report-page",children:[(0,d.jsx)(w.W,{eyebrow:"Audit & workforce intelligence",title:"Employee activity report",description:"Review authenticated sessions, module usage, control-room monitoring, branch coverage and operator actions from one auditable view.",icon:f.A,actions:(0,d.jsxs)("div",{className:"employee-report-hero-state",children:[(0,d.jsx)(g.A,{size:17}),(0,d.jsxs)("div",{children:[(0,d.jsx)("span",{children:"Data source"}),(0,d.jsx)("strong",{children:"Authenticated control plane"})]})]})}),(0,d.jsxs)("section",{className:"employee-report-controls",children:[(0,d.jsxs)("div",{className:"employee-report-filter-grid",children:[n&&(0,d.jsxs)("label",{children:[(0,d.jsx)("span",{children:"Employee"}),(0,d.jsxs)("select",{value:V,onChange:a=>{var b;W(b=a.target.value),ar("selected_user",b||"my_activity")},disabled:aj,children:[(0,d.jsx)("option",{value:"",children:"My activity"}),X.map(a=>(0,d.jsx)("option",{value:a.id,children:a.display_name},a.id))]})]}),(0,d.jsxs)("label",{children:[(0,d.jsx)("span",{children:"Report window"}),(0,d.jsxs)("select",{value:P,onChange:a=>{var b;Q(b=a.target.value),"custom"!==b&&(S(D("seven-days"===b?7:"four-weeks"===b?28:90)),U(D()),ar("report_period",b))},children:[(0,d.jsx)("option",{value:"seven-days",children:"Last 7 days"}),(0,d.jsx)("option",{value:"four-weeks",children:"Last 4 weeks"}),(0,d.jsx)("option",{value:"quarter",children:"Last 90 days"}),(0,d.jsx)("option",{value:"custom",children:"Custom range"})]})]}),(0,d.jsxs)("label",{children:[(0,d.jsx)("span",{children:"Start date"}),(0,d.jsx)("input",{type:"date",value:R,onChange:a=>{Q("custom"),S(a.target.value),ar("start_date",a.target.value)}})]}),(0,d.jsxs)("label",{children:[(0,d.jsx)("span",{children:"End date"}),(0,d.jsx)("input",{type:"date",value:T,onChange:a=>{Q("custom"),U(a.target.value),ar("end_date",a.target.value)}})]})]}),(0,d.jsxs)("div",{className:"employee-report-control-actions",children:[(0,d.jsxs)("button",{type:"button",className:"employee-report-refresh",onClick:()=>{ap("refresh_report"),at()},disabled:ah,children:[(0,d.jsx)(h.A,{className:ah?"spin":"",size:15}),"Refresh"]}),(0,d.jsxs)("button",{type:"button",onClick:()=>av("pdf"),disabled:!Z||ah,children:[(0,d.jsx)(i.A,{size:15}),"PDF"]}),(0,d.jsxs)("button",{type:"button",onClick:()=>av("excel"),disabled:!Z||ah,children:[(0,d.jsx)(j.A,{size:15}),"Excel"]}),(0,d.jsxs)("button",{type:"button",onClick:()=>av("csv"),disabled:!Z||ah,children:[(0,d.jsx)(k.A,{size:15}),"CSV"]})]})]}),an&&(0,d.jsxs)("div",{className:"employee-report-notice",children:[(0,d.jsx)(l.A,{size:16}),(0,d.jsx)("span",{children:an})]}),al&&(0,d.jsxs)("div",{className:"employee-report-error",role:"alert",children:[(0,d.jsx)(l.A,{size:18}),(0,d.jsxs)("div",{children:[(0,d.jsx)("strong",{children:"Report could not be loaded"}),(0,d.jsx)("span",{children:al})]}),(0,d.jsx)("button",{type:"button",onClick:()=>void at(),children:"Try again"})]}),ah?(0,d.jsxs)("div",{className:"employee-report-loading",children:[(0,d.jsx)(m.A,{className:"spin",size:28}),(0,d.jsx)("strong",{children:"Building employee activity report"}),(0,d.jsx)("span",{children:"Loading sessions, monitoring and audit activity…"})]}):Z?(0,d.jsxs)(d.Fragment,{children:[(0,d.jsxs)("section",{className:"employee-report-identity",children:[(0,d.jsx)("span",{className:"employee-report-avatar",children:(0,d.jsx)(o,{size:25})}),(0,d.jsxs)("div",{children:[(0,d.jsx)("p",{children:"Selected employee"}),(0,d.jsx)("h2",{children:Z.user.display_name}),(0,d.jsx)("span",{children:Z.user.username||"Authenticated operator"})]}),(0,d.jsxs)("div",{className:"employee-report-period",children:[(0,d.jsx)(p,{size:16}),(0,d.jsxs)("span",{children:[(0,d.jsx)("small",{children:"Report period"}),(0,d.jsxs)("strong",{children:[Z.period.startDate," — ",Z.period.endDate]})]})]})]}),(0,d.jsxs)("section",{className:"employee-report-stats",children:[(0,d.jsx)(J,{icon:q.A,label:"Sessions",value:Z.sessionSummary.total_sessions.toLocaleString(),detail:"Authenticated logins"}),(0,d.jsx)(J,{icon:r.A,label:"Active time",value:aw(Z.sessionSummary.active_duration_seconds),detail:`${aw(Z.sessionSummary.idle_duration_seconds)} idle`}),(0,d.jsx)(J,{icon:s.A,label:"Monitoring time",value:aw(Z.controlRoomSummary.total_monitoring_seconds),detail:`${Z.controlRoomSummary.total_monitoring_sessions} control-room sessions`}),(0,d.jsx)(J,{icon:t.A,label:"Branches covered",value:Z.controlRoomSummary.unique_branches_monitored.toLocaleString(),detail:"Unique monitored branches"}),(0,d.jsx)(J,{icon:u.A,label:"Recorded actions",value:az.toLocaleString(),detail:"Auditable operator actions"})]}),(0,d.jsxs)("div",{className:"employee-report-primary-grid",children:[(0,d.jsxs)("section",{className:"employee-report-panel",children:[(0,d.jsx)(K,{icon:r.A,eyebrow:"Engagement",title:"Module usage",description:"Time spent across operational workspaces"}),(0,d.jsxs)("div",{className:"employee-module-list",children:[Z.moduleUsage.map(a=>{let b=ax(a.total_seconds,ay);return(0,d.jsxs)("article",{children:[(0,d.jsxs)("div",{children:[(0,d.jsx)("span",{className:"employee-module-icon",children:(0,d.jsx)(r.A,{size:15})}),(0,d.jsxs)("div",{children:[(0,d.jsx)("strong",{children:a.page_module.replaceAll("_"," ")}),(0,d.jsxs)("small",{children:[a.visit_count," visits \xb7 ",aw(a.avg_seconds)," average"]})]}),(0,d.jsx)("em",{children:aw(a.total_seconds)})]}),(0,d.jsx)("div",{className:"employee-module-track",children:(0,d.jsx)("i",{style:{width:`${b}%`}})}),(0,d.jsxs)("span",{children:[b.toFixed(1),"% of measured module time"]})]},a.page_module)}),0===Z.moduleUsage.length&&(0,d.jsx)(M,{text:"No module visits were recorded during this period."})]})]}),(0,d.jsxs)("section",{className:"employee-report-panel",children:[(0,d.jsx)(K,{icon:s.A,eyebrow:"Control room",title:"Monitoring activity",description:"Response and live-monitoring workload"}),(0,d.jsxs)("div",{className:"employee-monitoring-grid",children:[(0,d.jsx)(L,{label:"Camera switches",value:Z.controlRoomSummary.total_camera_switches,icon:v.A}),(0,d.jsx)(L,{label:"Alerts handled",value:Z.controlRoomSummary.total_alerts_handled,icon:l.A}),(0,d.jsx)(L,{label:"Incidents created",value:Z.controlRoomSummary.total_incidents_created,icon:g.A}),(0,d.jsx)(L,{label:"Monitoring share",value:`${ax(Z.controlRoomSummary.total_monitoring_seconds,Z.sessionSummary.total_duration_seconds).toFixed(1)}%`,icon:q.A})]}),(0,d.jsxs)("div",{className:"employee-last-activity",children:[(0,d.jsxs)("span",{children:[(0,d.jsx)(q.A,{size:15}),"Last recorded activity"]}),(0,d.jsx)("strong",{children:Z.sessionSummary.last_logout?new Date(Z.sessionSummary.last_logout).toLocaleString():"Active or not yet logged out"})]})]})]}),(0,d.jsxs)("div",{className:"employee-report-secondary-grid",children:[(0,d.jsxs)("section",{className:"employee-report-panel",children:[(0,d.jsx)(K,{icon:t.A,eyebrow:"Coverage",title:"Branch monitoring",description:"Top branches by monitoring time"}),(0,d.jsxs)("div",{className:"employee-branch-table",children:[(0,d.jsxs)("div",{className:"employee-table-head",children:[(0,d.jsx)("span",{children:"Branch"}),(0,d.jsx)("span",{children:"Sessions"}),(0,d.jsx)("span",{children:"Monitoring time"})]}),Z.branchMonitoring.slice(0,10).map(a=>(0,d.jsxs)("div",{className:"employee-table-row",children:[(0,d.jsxs)("span",{children:[(0,d.jsx)("i",{}),(0,d.jsx)("strong",{children:a.branch_name})]}),(0,d.jsx)("span",{children:a.monitoring_sessions}),(0,d.jsx)("span",{children:aw(a.total_seconds)})]},`${a.branch_node_id}-${a.branch_name}`)),0===Z.branchMonitoring.length&&(0,d.jsx)(M,{text:"No branch monitoring was recorded during this period."})]})]}),(0,d.jsxs)("section",{className:"employee-report-panel",children:[(0,d.jsx)(K,{icon:u.A,eyebrow:"Audit trail",title:"Action summary",description:"Recorded actions by category"}),(0,d.jsxs)("div",{className:"employee-action-grid",children:[Z.actionSummary.map(a=>(0,d.jsxs)("article",{children:[(0,d.jsx)("span",{children:a.action_category.replaceAll("_"," ")}),(0,d.jsx)("strong",{children:a.action_count.toLocaleString()}),(0,d.jsxs)("small",{children:[ax(a.action_count,az).toFixed(1),"% of actions"]})]},a.action_category)),0===Z.actionSummary.length&&(0,d.jsx)(M,{text:"No auditable actions were recorded during this period."})]})]})]}),(0,d.jsxs)("section",{className:"employee-report-panel employee-timeline-panel",children:[(0,d.jsxs)("div",{className:"employee-timeline-heading",children:[(0,d.jsx)(K,{icon:g.A,eyebrow:"Video-access audit",title:"Recent access activity",description:"Authorized video viewing, playback, download, and export events in the selected window"}),(0,d.jsxs)("span",{children:[ad.length.toLocaleString()," recent events"]})]}),(0,d.jsxs)("div",{className:"employee-timeline-table",children:[(0,d.jsxs)("div",{className:"employee-timeline-head",children:[(0,d.jsx)("span",{children:"Time"}),(0,d.jsx)("span",{children:"Access"}),(0,d.jsx)("span",{children:"Camera / branch"}),(0,d.jsx)("span",{children:"Result"})]}),ad.map(a=>(0,d.jsxs)("article",{className:"employee-timeline-row",children:[(0,d.jsx)("time",{dateTime:a.accessTimestamp,children:a.accessTimestamp?new Date(a.accessTimestamp).toLocaleString():"—"}),(0,d.jsxs)("div",{children:[(0,d.jsx)("span",{className:"employee-event-type",children:a.accessType.replaceAll("_"," ")}),(0,d.jsx)("strong",{children:a.userName||"Authenticated user"})]}),(0,d.jsxs)("div",{children:[(0,d.jsx)("strong",{children:a.cameraName||"Video resource"}),(0,d.jsx)("small",{children:a.branchName||"Authorized branch scope"})]}),(0,d.jsxs)("div",{children:[(0,d.jsx)("strong",{children:a.accessResult||"success"}),(0,d.jsx)("small",{children:null==a.durationSeconds?"Audit event":aw(a.durationSeconds)})]})]},a.id)),0===ad.length&&(0,d.jsx)(M,{text:"No branch-authorized video access events were recorded during this period."})]})]}),(0,d.jsxs)("section",{className:"employee-report-panel employee-timeline-panel",children:[(0,d.jsxs)("div",{className:"employee-timeline-heading",children:[(0,d.jsx)(K,{icon:r.A,eyebrow:"Login-to-logout evidence",title:"Complete employee timeline",description:"Page entries and exits, interactions, monitoring context and verified server transactions"}),(0,d.jsxs)("span",{children:[_.length.toLocaleString()," of ",ab.toLocaleString()," events"]})]}),(0,d.jsxs)("div",{className:"employee-timeline-table",children:[(0,d.jsxs)("div",{className:"employee-timeline-head",children:[(0,d.jsx)("span",{children:"Time"}),(0,d.jsx)("span",{children:"Event"}),(0,d.jsx)("span",{children:"Workspace / branch"}),(0,d.jsx)("span",{children:"Duration / result"})]}),_.map(a=>(0,d.jsxs)("article",{className:"employee-timeline-row",children:[(0,d.jsx)("time",{dateTime:a.event_time,children:a.event_time?new Date(a.event_time).toLocaleString():"—"}),(0,d.jsxs)("div",{children:[(0,d.jsx)("span",{className:`employee-event-type employee-event-${a.event_type}`,children:a.event_type.replaceAll("_"," ")}),(0,d.jsx)("strong",{children:a.title}),(0,d.jsx)("small",{children:a.description})]}),(0,d.jsxs)("div",{children:[(0,d.jsx)("strong",{children:a.module_name?.replaceAll("_"," ")||"Platform"}),(0,d.jsx)("small",{children:a.branch_name||"No branch scope"})]}),(0,d.jsxs)("div",{children:[(0,d.jsx)("strong",{children:null==a.duration_seconds?a.outcome||"Recorded":aw(a.duration_seconds)}),(0,d.jsx)("small",{children:a.session_id?`Session ${a.session_id.slice(0,8)}`:"Immutable audit event"})]})]},a.event_id)),0===_.length&&(0,d.jsx)(M,{text:"No login-to-logout events were recorded during this period."})]}),_.length<ab&&(0,d.jsxs)("button",{type:"button",className:"employee-timeline-more",onClick:()=>void au(),disabled:af,children:[af?(0,d.jsx)(m.A,{className:"spin",size:15}):(0,d.jsx)(r.A,{size:15}),"Load more events"]})]})]}):null]})}function J({icon:a,label:b,value:c,detail:e}){return(0,d.jsxs)("article",{children:[(0,d.jsx)("span",{children:(0,d.jsx)(a,{size:17})}),(0,d.jsxs)("div",{children:[(0,d.jsx)("small",{children:b}),(0,d.jsx)("strong",{children:c}),(0,d.jsx)("p",{children:e})]})]})}function K({icon:a,eyebrow:b,title:c,description:e}){return(0,d.jsxs)("header",{className:"employee-panel-header",children:[(0,d.jsx)("span",{children:(0,d.jsx)(a,{size:18})}),(0,d.jsxs)("div",{children:[(0,d.jsx)("p",{children:b}),(0,d.jsx)("h3",{children:c}),(0,d.jsx)("small",{children:e})]})]})}function L({icon:a,label:b,value:c}){return(0,d.jsxs)("article",{children:[(0,d.jsx)("span",{children:(0,d.jsx)(a,{size:16})}),(0,d.jsx)("strong",{children:"number"==typeof c?c.toLocaleString():c}),(0,d.jsx)("small",{children:b})]})}function M({text:a}){return(0,d.jsxs)("div",{className:"employee-report-empty",children:[(0,d.jsx)(u.A,{size:21}),(0,d.jsx)("span",{children:a})]})}},28354:a=>{"use strict";a.exports=require("util")},29294:a=>{"use strict";a.exports=require("next/dist/server/app-render/work-async-storage.external.js")},33873:a=>{"use strict";a.exports=require("path")},38522:a=>{"use strict";a.exports=require("node:zlib")},41025:a=>{"use strict";a.exports=require("next/dist/server/app-render/dynamic-access-async-storage.external.js")},46060:a=>{"use strict";a.exports=require("next/dist/shared/lib/no-fallback-error.external.js")},48575:(a,b,c)=>{"use strict";c.d(b,{A:()=>d});let d=(0,c(52431).A)("Users",[["path",{d:"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2",key:"1yyitq"}],["circle",{cx:"9",cy:"7",r:"4",key:"nufk8"}],["path",{d:"M22 21v-2a4 4 0 0 0-3-3.87",key:"kshegd"}],["path",{d:"M16 3.13a4 4 0 0 1 0 7.75",key:"1da9ce"}]])},50018:(a,b,c)=>{Promise.resolve().then(c.bind(c,39071)),Promise.resolve().then(c.bind(c,25194))},56132:(a,b,c)=>{"use strict";c.r(b),c.d(b,{__next_app__:()=>s,handler:()=>u,routeModule:()=>t});var d=c(31357),e=c(1305),f=c(57326),g=c(18045),h={};for(let a in g)0>["default","__next_app__","routeModule","handler"].indexOf(a)&&(h[a]=()=>g[a]);c.d(b,h);let i=(0,d.p)(()=>Promise.resolve().then(c.bind(c,92564))),j=(0,d.p)(()=>Promise.resolve().then(c.bind(c,48158))),k=(0,d.p)(()=>Promise.resolve().then(c.bind(c,66656))),l=(0,d.p)(()=>Promise.resolve().then(c.t.bind(c,75765,23))),m=(0,d.p)(()=>Promise.resolve().then(c.bind(c,21912))),n=(0,d.p)(()=>Promise.resolve().then(c.t.bind(c,53532,23))),o=(0,d.p)(()=>Promise.resolve().then(c.t.bind(c,4175,23))),p=(0,d.p)(()=>Promise.resolve().then(c.t.bind(c,75765,23))),q={children:["",{children:["activity-report",{children:["__PAGE__",{},{page:[(0,d.p)(()=>Promise.resolve().then(c.bind(c,76242))),"C:\\Omsystems\\Omsystems\\dashboard\\app\\activity-report\\page.tsx"]}]},{"global-error":[p,"next/dist/client/components/builtin/global-error.js"],metadata:{icon:[],apple:[],openGraph:[],twitter:[],manifest:"/manifest.webmanifest"}},[]]},{layout:[i,"C:\\Omsystems\\Omsystems\\dashboard\\app\\layout.tsx"],error:[j,"C:\\Omsystems\\Omsystems\\dashboard\\app\\error.tsx"],loading:[k,"C:\\Omsystems\\Omsystems\\dashboard\\app\\loading.tsx"],"global-error":[l,"next/dist/client/components/builtin/global-error.js"],"not-found":[m,"C:\\Omsystems\\Omsystems\\dashboard\\app\\not-found.tsx"],forbidden:[n,"next/dist/client/components/builtin/forbidden.js"],unauthorized:[o,"next/dist/client/components/builtin/unauthorized.js"],metadata:{icon:[],apple:[],openGraph:[],twitter:[],manifest:"/manifest.webmanifest"}},[]]}.children,r=(0,e.H)({tree:q,page:"/activity-report/page",pathname:"/activity-report",require:c,loadChunk:()=>Promise.resolve(),interopDefault:f.T}),s=r.__next_app__,t=r.routeModule,u=r.handler},63033:a=>{"use strict";a.exports=require("next/dist/server/app-render/work-unit-async-storage.external.js")},74871:(a,b,c)=>{"use strict";c.d(b,{AppLayout:()=>e});var d=c(92713);(0,d.registerClientReference)(function(){throw Error("Attempted to call navigation() from the server but navigation is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"C:\\Omsystems\\Omsystems\\dashboard\\components\\app-layout.tsx","navigation"),(0,d.registerClientReference)(function(){throw Error("Attempted to call menuKey() from the server but menuKey is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"C:\\Omsystems\\Omsystems\\dashboard\\components\\app-layout.tsx","menuKey"),(0,d.registerClientReference)(function(){throw Error("Attempted to call defaultMenuAccessForRole() from the server but defaultMenuAccessForRole is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"C:\\Omsystems\\Omsystems\\dashboard\\components\\app-layout.tsx","defaultMenuAccessForRole"),(0,d.registerClientReference)(function(){throw Error("Attempted to call getAuthorizedNavigation() from the server but getAuthorizedNavigation is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"C:\\Omsystems\\Omsystems\\dashboard\\components\\app-layout.tsx","getAuthorizedNavigation"),(0,d.registerClientReference)(function(){throw Error("Attempted to call getVisibleNavigation() from the server but getVisibleNavigation is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"C:\\Omsystems\\Omsystems\\dashboard\\components\\app-layout.tsx","getVisibleNavigation"),(0,d.registerClientReference)(function(){throw Error("Attempted to call hasCustomMenuConfiguration() from the server but hasCustomMenuConfiguration is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"C:\\Omsystems\\Omsystems\\dashboard\\components\\app-layout.tsx","hasCustomMenuConfiguration"),(0,d.registerClientReference)(function(){throw Error("Attempted to call quickActions() from the server but quickActions is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"C:\\Omsystems\\Omsystems\\dashboard\\components\\app-layout.tsx","quickActions");let e=(0,d.registerClientReference)(function(){throw Error("Attempted to call AppLayout() from the server but AppLayout is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"C:\\Omsystems\\Omsystems\\dashboard\\components\\app-layout.tsx","AppLayout")},76242:(a,b,c)=>{"use strict";c.r(b),c.d(b,{default:()=>g});var d=c(22037),e=c(74871),f=c(18814);function g(){return(0,d.jsx)(e.AppLayout,{children:(0,d.jsx)(f.EmployeeActivityReport,{apiBaseUrl:"/api/control",showAllUsers:!0})})}},76812:(a,b,c)=>{"use strict";c.d(b,{T:()=>e});var d=c(26835);function e(){return(0,d.jsxs)("div",{className:"field-visual","aria-hidden":"true",children:[(0,d.jsx)("span",{className:"field-visual-coordinate",children:"KRYPTON / FIELD"}),(0,d.jsxs)("svg",{viewBox:"0 0 320 220",fill:"none",children:[(0,d.jsxs)("g",{className:"field-art-orbit",stroke:"currentColor",children:[(0,d.jsx)("ellipse",{cx:"160",cy:"110",rx:"121",ry:"65",transform:"rotate(-24 160 110)",opacity:".4"}),(0,d.jsx)("ellipse",{cx:"160",cy:"110",rx:"112",ry:"57",transform:"rotate(34 160 110)",opacity:".2"}),(0,d.jsx)("circle",{cx:"160",cy:"110",r:"85",strokeDasharray:"1 9",opacity:".4"}),(0,d.jsx)("circle",{cx:"160",cy:"110",r:"42",fill:"currentColor",fillOpacity:".07",strokeOpacity:".5"}),(0,d.jsx)("path",{d:"M 147 96 L 173 96 L 173 122 L 147 122 Z M 160 78 V 91 M 160 127 V 142 M 129 110 H 142 M 178 110 H 192",strokeWidth:"2"}),(0,d.jsx)("circle",{cx:"49",cy:"143",r:"6",fill:"currentColor",stroke:"none"}),(0,d.jsx)("circle",{cx:"260",cy:"67",r:"4",fill:"currentColor",stroke:"none"}),(0,d.jsx)("path",{d:"M 27 192 H 96 M 27 184 V 200 M 291 26 V 66 M 284 26 H 298",opacity:".35"})]}),(0,d.jsxs)("g",{className:"field-art-spectrum",stroke:"currentColor",children:[[0,1,2,3,4,5,6,7,8].map(a=>(0,d.jsx)("path",{d:`M ${35+28*a} 182 V ${104-57*Math.sin(.65*a)}`,strokeWidth:"11",strokeLinecap:"round",opacity:.2+.07*a},a)),(0,d.jsx)("path",{d:"M 27 196 H 300 M 38 40 V 190",opacity:".2"}),(0,d.jsx)("path",{d:"M 32 104 C 86 6 118 60 160 61 S 231 191 290 129",strokeWidth:"1.5",strokeDasharray:"3 6",opacity:".5"}),(0,d.jsx)("circle",{cx:"160",cy:"61",r:"7",fill:"currentColor",stroke:"none"})]}),(0,d.jsxs)("g",{className:"field-art-proof",stroke:"currentColor",children:[(0,d.jsx)("path",{d:"M 160 31 L 265 88 L 160 147 L 55 88 Z",fill:"currentColor",fillOpacity:".08",opacity:".7"}),(0,d.jsx)("path",{d:"M 55 111 L 160 170 L 265 111 M 55 134 L 160 193 L 265 134",opacity:".4"}),(0,d.jsx)("path",{d:"M 160 65 L 185 77 V 99 L 160 119 L 135 99 V 77 Z",fill:"currentColor",fillOpacity:".08"}),(0,d.jsx)("path",{d:"M 148 90 L 157 99 L 174 81",strokeWidth:"3"}),(0,d.jsx)("path",{d:"M 160 147 V 193 M 55 88 V 134 M 265 88 V 134",opacity:".15",strokeDasharray:"2 5"})]}),(0,d.jsxs)("g",{className:"field-art-pulse",stroke:"currentColor",children:[(0,d.jsx)("circle",{cx:"160",cy:"110",r:"80",opacity:".15"}),(0,d.jsx)("circle",{cx:"160",cy:"110",r:"101",strokeDasharray:"2 8",opacity:".3"}),(0,d.jsx)("path",{d:"M 18 110 H 87 L 110 76 L 139 152 L 161 66 L 190 123 L 210 110 H 302",strokeWidth:"2"}),(0,d.jsx)("circle",{cx:"161",cy:"66",r:"5",fill:"currentColor",stroke:"none"}),(0,d.jsx)("path",{d:"M 55 44 H 103 M 218 180 H 275",opacity:".3"})]}),(0,d.jsxs)("g",{className:"field-art-neural",stroke:"currentColor",children:[(0,d.jsx)("circle",{className:"field-neural-ring",cx:"160",cy:"110",r:"68",strokeDasharray:"2 8"}),(0,d.jsx)("circle",{className:"field-neural-ring",cx:"160",cy:"110",r:"94",strokeDasharray:"1 11"}),(0,d.jsxs)("g",{className:"field-neural-links",strokeWidth:"1.2",children:[(0,d.jsx)("path",{d:"M 44 116 Q 105 75 160 110 M 76 47 Q 121 51 160 110 M 96 177 Q 124 149 160 110 M 160 110 Q 210 53 254 58 M 160 110 Q 224 103 282 116 M 160 110 Q 207 170 250 173"}),(0,d.jsx)("path",{d:"M 44 116 Q 52 71 76 47 M 44 116 Q 63 169 96 177 M 76 47 Q 171 15 254 58 M 254 58 Q 283 78 282 116 M 282 116 Q 279 156 250 173 M 96 177 Q 174 208 250 173"})]}),(0,d.jsxs)("g",{className:"field-neural-flow",strokeWidth:"2",strokeLinecap:"round",children:[(0,d.jsx)("path",{d:"M 44 116 Q 105 75 160 110 Q 210 53 254 58"}),(0,d.jsx)("path",{d:"M 96 177 Q 124 149 160 110 Q 224 103 282 116"}),(0,d.jsx)("path",{d:"M 76 47 Q 121 51 160 110 Q 207 170 250 173"})]}),(0,d.jsx)("g",{className:"field-neural-nodes",children:[[44,116],[76,47],[96,177],[254,58],[282,116],[250,173]].map(([a,b],c)=>(0,d.jsxs)("g",{className:"field-neural-node",children:[(0,d.jsx)("circle",{cx:a,cy:b,r:"8",fill:"currentColor",fillOpacity:".13"}),(0,d.jsx)("circle",{cx:a,cy:b,r:"3",fill:"currentColor",stroke:"none"})]},c))}),(0,d.jsxs)("g",{className:"field-neural-core",children:[(0,d.jsx)("path",{d:"M 160 77 L 188 94 V 126 L 160 143 L 132 126 V 94 Z",fill:"currentColor",fillOpacity:".12",strokeWidth:"1.5"}),(0,d.jsx)("circle",{cx:"160",cy:"110",r:"17",fill:"currentColor",fillOpacity:".08"}),(0,d.jsx)("path",{d:"M 149 110 H 171 M 160 99 V 121",strokeWidth:"1.4"}),(0,d.jsx)("circle",{cx:"160",cy:"110",r:"4",fill:"currentColor",stroke:"none"})]})]})]}),(0,d.jsx)("span",{className:"field-visual-caption",children:"A WIDER PERSPECTIVE"})]})}},78299:(a,b,c)=>{"use strict";c.d(b,{W:()=>i});var d=c(26835),e=c(30978),f=c.n(e),g=c(78907),h=c(76812);function i({eyebrow:a="Operations workspace",title:b,description:c,icon:e,actions:j,backHref:k="/",backLabel:l="Command center",tone:m="navy"}){return(0,d.jsxs)("header",{className:`page-hero field-hero page-hero-${m}`,children:[(0,d.jsxs)("div",{className:"page-hero-copy",children:[(0,d.jsx)("span",{className:"page-hero-icon",children:(0,d.jsx)(e,{size:23})}),(0,d.jsxs)("div",{children:[(0,d.jsx)("p",{className:"page-hero-eyebrow",children:a}),(0,d.jsx)("h1",{children:b}),(0,d.jsx)("p",{className:"page-hero-description",children:c})]})]}),(0,d.jsx)(h.T,{}),(0,d.jsxs)("div",{className:"page-hero-actions",children:[(0,d.jsxs)(f(),{href:k,className:"page-hero-back",children:[(0,d.jsx)(g.A,{size:16}),(0,d.jsx)("span",{children:l})]}),j]})]})}},78907:(a,b,c)=>{"use strict";c.d(b,{A:()=>d});let d=(0,c(52431).A)("ArrowLeft",[["path",{d:"m12 19-7-7 7-7",key:"1l729n"}],["path",{d:"M19 12H5",key:"x3x0zl"}]])}};var b=require("../../webpack-runtime.js");b.C(a);var c=b.X(0,[7773,4730,3767],()=>b(b.s=56132));module.exports=c})();