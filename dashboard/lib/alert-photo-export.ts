export async function downloadAlertPhotoReport(input: {
  format:'xlsx'|'pdf'; alertIds:string[]; filters:string; headers:Record<string,string>; signal?:AbortSignal;
}) {
  const response=await fetch('/api/control/v1/analytics/alerts/export',{
    method:'POST',credentials:'include',cache:'no-store',signal:input.signal,
    headers:{...input.headers,'content-type':'application/json'},
    body:JSON.stringify({format:input.format,alertIds:input.alertIds,filters:input.filters}),
  });
  if(!response.ok){
    const body=await response.json().catch(()=>null);
    throw new Error(body?.message || (response.status===403 ? 'You do not have permission to export these alerts.' : `Photo report could not be generated (HTTP ${response.status}).`));
  }
  const blob=await response.blob();
  const expected=input.format==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if(!blob.size || !blob.type.includes(expected))throw new Error('The reporting service did not return a valid download. Please try again.');
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');
  link.href=url;link.download=`alerts-with-photos-${new Date().toISOString().slice(0,10)}.${input.format}`;
  document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  return {rows:Number(response.headers.get('x-report-rows') || input.alertIds.length),photos:Number(response.headers.get('x-report-photos') || 0)};
}
