"""Correct a confirmed helmet pose using local frozen features; retain independent regression data."""
import hashlib,json
from pathlib import Path
import torch
torch.set_num_threads(2)
torch.manual_seed(20261008)
rows=json.loads(Path('reports/helmet-semantic-features-2026-10-07.json').read_text())
for row in rows:
    if 'tmp/kollam-live-' in row['file']:
        row['split']='train'
        row['group']='kollam-feedback'
    elif 'tmp/pilot-wearer-' in row['file']:
        row['split']='test'
rows+=json.loads(Path('reports/helmet-channel4-feedback-features-2026-10-07.json').read_text())
rows+=json.loads(Path('reports/bettiah-walking-feedback-features-2026-10-08.json').read_text())
training=[r for r in rows if r['split']=='train']
testing=[r for r in rows if r['split']=='test']
assert not {r['file'] for r in training}&{r['file'] for r in testing}
assert not any('kollam-raw-pass' in r['file'] for r in training)
assert not any('frame-037' in r['file'] or 'frame-038' in r['file'] for r in training)
old=json.loads(Path('tmp/helmet-clip-candidate-20261007/head-probe.json').read_text())
prior=torch.tensor(old['weights'],dtype=torch.float64)
prior_bias=torch.tensor(old['bias'],dtype=torch.float64)
weight=prior.clone().requires_grad_()
bias=prior_bias.clone().requires_grad_()
x=torch.tensor([r['feature'] for r in training],dtype=torch.float64)
y=torch.tensor([int(r['expectedHelmet']) for r in training],dtype=torch.float64)
counts=torch.bincount(y.long())
sample_weight=torch.where(y==1,.5/counts[1],.5/counts[0])
optimizer=torch.optim.LBFGS([weight,bias],lr=1,max_iter=150,line_search_fn='strong_wolfe',tolerance_grad=1e-8)
def closure():
    optimizer.zero_grad()
    logits=x@weight+bias
    error=torch.nn.functional.binary_cross_entropy_with_logits(logits,y,reduction='none')
    loss=(error*sample_weight).sum()+.0001*((weight-prior).square().sum()+(bias-prior_bias).square())
    loss.backward()
    return loss
optimizer.step(closure)
with torch.no_grad():
    evaluations=[]
    for row in rows:
        p=torch.sigmoid(torch.tensor(row['feature'],dtype=torch.float64)@weight+bias).item()
        evaluations.append({k:v for k,v in row.items() if k!='feature'}|{'wearingHelmetConfidence':p})
summary={}
for split in ['train','test']:
    selected=[r for r in evaluations if r['split']==split]
    pos=[r['wearingHelmetConfidence'] for r in selected if r['expectedHelmet']]
    neg=[r['wearingHelmetConfidence'] for r in selected if not r['expectedHelmet']]
    summary[split]={'images':len({r['file'] for r in selected}),'crops':len(selected),'minPositive':min(pos),
       'maxNegative':max(neg),'falsePositivesAt080':sum(p>=.8 for p in neg),'missedPositivesAt080':sum(p<.8 for p in pos)}
feedback=[r['wearingHelmetConfidence'] for r in evaluations if r['group']=='bettiah-bent-forward-feedback']
summary['bettiahFeedback']={'trainingFrames':1,'crops':len(feedback),'minPositive':min(feedback),
   'scope':'Training reproduction; not evidence of general accuracy on unseen Bettiah scenes'}
artifact={'schemaVersion':1,'dimensions':512,'weights':weight.detach().tolist(),'bias':bias.item(),
 'featureModelSha256':old['featureModelSha256'],'priorProbeSha256':hashlib.sha256(Path('tmp/helmet-clip-candidate-20261007/head-probe.json').read_bytes()).hexdigest(),
 'feedbackFeatureSha256':hashlib.sha256(Path('reports/bettiah-walking-feedback-features-2026-10-08.json').read_bytes()).hexdigest(),
 'seed':20261008,'regularization':.0001,'trainingImages':sorted({r['file'] for r in training}),
 'heldOutImages':sorted({r['file'] for r in testing}),'summary':summary}
stage=Path('tmp/bettiah-walking-fix-20261008')
(stage/'head-probe.json').write_text(json.dumps(artifact,indent=2),encoding='utf-8')
Path('reports/bettiah-walking-probe-validation-2026-10-08.json').write_text(json.dumps({'summary':summary,'evaluations':evaluations},indent=2),encoding='utf-8')
print(json.dumps(summary,indent=2))
assert summary['train']['falsePositivesAt080']==0 and summary['train']['missedPositivesAt080']==0
assert summary['test']['falsePositivesAt080']==0 and summary['test']['missedPositivesAt080']==0
assert min(feedback)>=.9,'Feedback evidence needs to support the existing strong alert gate'
