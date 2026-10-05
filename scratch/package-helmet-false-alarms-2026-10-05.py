import tarfile
from pathlib import Path
files=[
 ('analytics-engine/dist/analytics-engine/src/detectors/helmet-detector.js','helmet-detector.js'),
 ('analytics-engine/src/detectors/helmet-detector.ts','helmet-detector.ts'),
 ('scratch/validate-helmet-false-alarms-2026-10-05.mjs','validate.mjs'),
 ('scratch/helmet-false-f5781a86-8527-4a30-a94a-3f256555fbcb.jpg','false-131901.jpg'),
 ('scratch/helmet-false-f0b4f55e-00c0-442c-a0e1-3d6a05150bdf.jpg','false-124130.jpg'),
 ('scratch/helmet-new-false-alert-raw.jpg','previous-bare-head.jpg'),
 ('C:/Users/Dhanya/Downloads/incident-snapshot-1791120703973.jpg','wearer-raised.jpg'),
 ('scratch/helmet-alert-ch6.jpg','wearer-compact.jpg'),
 ('tmp/helmet-channel-6.jpg','wearer-standard.jpg'),
]
for n,id in enumerate(['1791040935773','1791040925724','1791040917135','1791040909261','1791006290219'],1):
 files.append((f'C:/Users/Dhanya/Downloads/incident-snapshot-{id}.jpg',f'previous-false-{n}.jpg'))
with tarfile.open('scratch/helmet-false-alarms-20261005.tar.gz','w:gz') as archive:
 for source,name in files:archive.add(Path(source),arcname=name)
print('Packaged detector 1.1.7 and eleven replay fixtures')
