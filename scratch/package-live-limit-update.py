import pathlib,tarfile
files=['src/branch-protection/routes.ts','dashboard/app/control-room/page.tsx','dashboard/components/enhanced-camera-grid-model.ts','dashboard/components/camera-tile.tsx','dashboard/test/enhanced-camera-grid-model.test.ts','test/branch-protection.test.ts']
with tarfile.open('scratch/live-limit-144-update.tar.gz','w:gz') as archive:
 for file in files:archive.add(file,arcname=file)
print('Packaged six reviewed source and test files; no environment or camera secrets included.')
