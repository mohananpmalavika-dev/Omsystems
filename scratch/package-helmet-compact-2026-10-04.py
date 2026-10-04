import tarfile
from pathlib import Path
with tarfile.open('scratch/helmet-compact-update-20261004.tar.gz','w:gz') as archive:
    for source,name in [('analytics-engine/dist/analytics-engine/src/detectors/helmet-detector.js','helmet-detector.js'),('analytics-engine/src/detectors/helmet-detector.ts','helmet-detector.ts'),('reports/helmet-compact-replay-2026-10-04.json','replay.json')]:
        archive.add(Path(source),arcname=name)
print('Packaged helmet detector 1.1.2 with source and replay evidence')
