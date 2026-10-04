from pathlib import Path
import subprocess

root=Path(__file__).resolve().parent.parent
files=['analytics-engine/src/detectors/helmet-detector.ts','analytics-engine/test/helmet-false-alarms.test.ts','analytics-engine/test/specialty-inference.test.ts']
history=subprocess.check_output(['git','log','--format=%H','--',files[0]],cwd=root,text=True).splitlines()
baseline=None
for revision in history:
    source=subprocess.check_output(['git','show',revision+':'+files[0]],cwd=root)
    if b'super("helmet", "1.1.3")' in source:
        baseline=revision
        break
assert baseline, 'Original 1.1.3 source must be found'
patch=subprocess.check_output(['git','diff',baseline,'--',*files],cwd=root)
(root/'scratch/helmet-localization-required-proposal.patch').write_bytes(patch)
for name in files:
    (root/name).write_bytes(subprocess.check_output(['git','show',baseline+':'+name],cwd=root))
proposal_report=root/'reports/helmet-new-false-alert-study-2026-10-04.json'
if proposal_report.exists():
    (root/'reports/helmet-localization-mitigation-replay-2026-10-04.json').write_bytes(proposal_report.read_bytes())
print('Retained original 1.1.3 source and tests; unapproved mitigation archived separately. Baseline '+baseline)
