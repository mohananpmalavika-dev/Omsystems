"""Train only a small head classifier; no images or features leave this computer."""
import hashlib
import json
from pathlib import Path
import torch

torch.set_num_threads(2)
torch.manual_seed(20261007)
rows=json.loads(Path('reports/helmet-semantic-features-2026-10-07.json').read_text())
for row in rows:
    # The earlier reported miss is feedback for camera adaptation; the newly
    # captured RGB walking pass remains completely outside training.
    if 'tmp/kollam-live-' in row['file']:
        row['split']='train'
        row['group']='kollam-feedback'
    elif 'tmp/pilot-wearer-' in row['file']:
        row['split']='test'
training=[r for r in rows if r['split']=='train']
testing=[r for r in rows if r['split']=='test']
assert not {r['file'] for r in training} & {r['file'] for r in testing}
assert not any('kollam-raw-pass' in r['file'] for r in training)
prototypes=json.loads(Path('tmp/helmet-clip-candidate-20261007/prototypes.json').read_text())['prototypes']
positive=next(p['vector'] for p in prototypes if p['label']=='motorcycle_helmet')
negative=next(p['vector'] for p in prototypes if p['label']=='bare_head')
prior=50*(torch.tensor(positive,dtype=torch.float64)-torch.tensor(negative,dtype=torch.float64))
weight=prior.clone().requires_grad_()
bias=torch.tensor(0.,dtype=torch.float64,requires_grad=True)
x=torch.tensor([r['feature'] for r in training],dtype=torch.float64)
y=torch.tensor([int(r['expectedHelmet']) for r in training],dtype=torch.float64)
counts=torch.bincount(y.long())
sample_weight=torch.where(y==1,.5/counts[1],.5/counts[0])
optimizer=torch.optim.LBFGS([weight,bias],lr=1,max_iter=150,line_search_fn='strong_wolfe',tolerance_grad=1e-8)

def closure():
    optimizer.zero_grad()
    logits=x@weight+bias
    error=torch.nn.functional.binary_cross_entropy_with_logits(logits,y,reduction='none')
    loss=(error*sample_weight).sum()+.0001*((weight-prior).square().sum()+bias.square())
    loss.backward()
    return loss

optimizer.step(closure)
with torch.no_grad():
    evaluations=[]
    for row in rows:
        probability=torch.sigmoid(torch.tensor(row['feature'],dtype=torch.float64)@weight+bias).item()
        evaluations.append({k:v for k,v in row.items() if k!='feature'}|{'wearingHelmetConfidence':probability})
summary={}
for split in ['train','test']:
    selected=[r for r in evaluations if r['split']==split]
    positives=[r['wearingHelmetConfidence'] for r in selected if r['expectedHelmet']]
    negatives=[r['wearingHelmetConfidence'] for r in selected if not r['expectedHelmet']]
    summary[split]={'images':len({r['file'] for r in selected}),'crops':len(selected),
                    'minPositive':min(positives),'maxNegative':max(negatives),
                    'falsePositivesAt080':sum(p>=.8 for p in negatives),
                    'missedPositivesAt080':sum(p<.8 for p in positives)}
artifact={'schemaVersion':1,'dimensions':512,'weights':weight.detach().tolist(),'bias':bias.item(),
          'featureModelSha256':'583fd1110a514667812fee7d684952aaf82a99b959760c8d7dca7e0ab9839299',
          'trainingFeatureSha256':hashlib.sha256(Path('reports/helmet-semantic-features-2026-10-07.json').read_bytes()).hexdigest(),
          'seed':20261007,'regularization':.0001,'trainingImages':sorted({r['file'] for r in training}),
          'heldOutImages':sorted({r['file'] for r in testing}), 'summary':summary}
stage=Path('tmp/helmet-clip-candidate-20261007')
(stage/'head-probe.json').write_text(json.dumps(artifact,indent=2),encoding='utf-8')
Path('reports/helmet-head-probe-validation-2026-10-07.json').write_text(json.dumps({'summary':summary,'evaluations':evaluations},indent=2),encoding='utf-8')
print(json.dumps(summary,indent=2))
