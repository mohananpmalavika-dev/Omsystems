import json,pathlib,shutil,tarfile,sys
root=pathlib.Path(__file__).resolve().parent.parent
stage=root/'tmp/helmet-head-validation-1.2.0';stage.mkdir(exist_ok=True)
previous=json.loads((root/'reports/helmet-batch-false-alarms-2026-10-05-study.json').read_text())
rows=[{'source':row['file'],'expected':i>=20,'raised':i==20} for i,row in enumerate(previous)]
for source in ['scratch/helmet-false-f5781a86-8527-4a30-a94a-3f256555fbcb.jpg','scratch/helmet-false-f0b4f55e-00c0-442c-a0e1-3d6a05150bdf.jpg','scratch/helmet-new-false-alert-raw.jpg',*[f'C:/Users/Dhanya/Downloads/incident-snapshot-{id}.jpg' for id in ['1791040935773','1791040925724','1791040917135','1791040909261','1791006290219','1791202017341','1791204590121','1791204562457','1791204377566']]]:
 rows.append({'source':source,'expected':False})
samples=[]
for i,row in enumerate(rows):
 file=f'sample-{i+1}.jpg';source=row.pop('source')
 if '--local-fixtures' in sys.argv: shutil.copyfile(source,stage/file)
 samples.append({'file':file,**row})
(stage/'samples.json').write_text(json.dumps(samples,indent=2),newline='\n')
files=['detectors/helmet-detector','inference/configured-model-inference','inference/yolo-detection-inference','inference/helmet-head-verification']
for file in files:
 for suffix,directory,source in [('.js','runtime','tmp/helmet-head-build-1.2.0/analytics-engine/src'),('.ts','source','analytics-engine/src')]:
  target=stage/directory/(file+suffix);target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(root/source/(file+suffix),target)
shutil.copyfile(root/'analytics-engine/models/manifest.json',stage/'manifest.json')
shutil.copyfile(root/'analytics-engine/models/safety/helmet-head-localizer.onnx',stage/'helmet-head-localizer.onnx')
shutil.copyfile(root/'analytics-engine/models/safety/helmet-head-localizer.LICENSE',stage/'helmet-head-localizer.LICENSE')
shutil.copyfile(root/'scratch/validate-helmet-batch-2026-10-05.mjs',stage/'validate.mjs')
assert 'super("helmet", "1.2.0")' in (stage/'runtime/detectors/helmet-detector.js').read_text()
with tarfile.open(root/'scratch/helmet-head-code-1.2.0-20261005.tar.gz','w:gz') as archive:
 for name in ['runtime','source','manifest.json','helmet-head-localizer.onnx','helmet-head-localizer.LICENSE','validate.mjs']:
  archive.add(stage/name,arcname=name)
with tarfile.open(root/'scratch/helmet-head-code-1.2.0-20261005.tar.gz') as archive:
 assert not any(member.name.endswith(('.jpg','.png','.jpeg')) for member in archive.getmembers())
print(f'Prepared code/public-model-only archive; image copying requires --local-fixtures')
