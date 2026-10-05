import json
import pathlib
import shutil
import tarfile
root=pathlib.Path(__file__).resolve().parent.parent
stage=root/'tmp/helmet-recurrence-validation-1.1.9'
stage.mkdir(exist_ok=True)
rows=json.loads((root/'reports/helmet-batch-false-alarms-2026-10-05-study.json').read_text())
samples=[]
for index,row in enumerate(rows):
    file=f'sample-{index+1}.jpg'
    shutil.copyfile(row['file'],stage/file)
    samples.append({'file':file,'expected':index>=20,'raised':index==20})
previous=[
    'scratch/helmet-false-f5781a86-8527-4a30-a94a-3f256555fbcb.jpg',
    'scratch/helmet-false-f0b4f55e-00c0-442c-a0e1-3d6a05150bdf.jpg',
    'scratch/helmet-new-false-alert-raw.jpg',
    *[f'C:/Users/Dhanya/Downloads/incident-snapshot-{id}.jpg' for id in ['1791040935773','1791040925724','1791040917135','1791040909261','1791006290219']],
    'C:/Users/Dhanya/Downloads/incident-snapshot-1791202017341.jpg',
]
for index,source in enumerate(previous):
    file=f'previous-{index+1}.jpg'
    shutil.copyfile(source,stage/file)
    samples.append({'file':file,'expected':False})
(stage/'samples.json').write_text(json.dumps(samples,indent=2))
for source,target in [
    ('tmp/helmet-recurrence-build-1.1.9/analytics-engine/src/detectors/helmet-detector.js','helmet-detector.js'),
    ('analytics-engine/src/detectors/helmet-detector.ts','helmet-detector.ts'),
    ('scratch/validate-helmet-batch-2026-10-05.mjs','validate.mjs'),
]:
    shutil.copyfile(root/source,stage/target)
assert 'super("helmet", "1.1.9")' in (stage/'helmet-detector.js').read_text()
with tarfile.open(root/'scratch/helmet-recurrence-1.1.9-20261005.tar.gz','w:gz') as archive:
    for path in stage.iterdir():archive.add(path,arcname=path.name)
print(f'Prepared {len(samples)} fixtures; compiled detector 1.1.9')
