import concurrent.futures
import json
import pathlib
import requests

repos=['2vhoc/helmet-detection-traffic','Iam-tsr/yolo8n-helmet-detection','AXERA-TECH/Helmet-axera','vivekvar/helmet-v5','sharathhhhh/safetyHelmet-detection-yolov8']
def inspect(repo):
    response=requests.get('https://huggingface.co/api/models/'+repo,timeout=30)
    response.raise_for_status()
    data=response.json()
    pathlib.Path('tmp/helmet-model-'+repo.replace('/','-')+'.json').write_text(json.dumps(data,indent=2))
    return {'repo':repo,'sha':data.get('sha'),'license':data.get('cardData',{}).get('license'),'files':[x['rfilename'] for x in data.get('siblings',[]) if x['rfilename'].endswith(('.onnx','.yaml','.json','.py','.md'))]}
with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
    futures=[pool.submit(inspect,repo) for repo in repos]
    for future in concurrent.futures.as_completed(futures):
        try:print(json.dumps(future.result()))
        except Exception as error:print(type(error).__name__,str(error))
