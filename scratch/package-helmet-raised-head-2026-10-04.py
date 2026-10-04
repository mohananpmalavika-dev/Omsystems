import tarfile
from pathlib import Path
with tarfile.open('scratch/helmet-raised-head-update-20261004.tar.gz','w:gz') as archive:
    for source,name in [
        ('analytics-engine/dist/analytics-engine/src/detectors/helmet-detector.js','helmet-detector.js'),
        ('analytics-engine/src/detectors/helmet-detector.ts','helmet-detector.ts'),
        ('reports/helmet-raised-head-regression-replay.json','replay.json'),
        ('C:/Users/Dhanya/Downloads/incident-snapshot-1791120703973.jpg','missed-helmet.jpg'),
    ]:
        archive.add(Path(source),arcname=name)
print('Packaged detector 1.1.5 and isolated replay evidence')
