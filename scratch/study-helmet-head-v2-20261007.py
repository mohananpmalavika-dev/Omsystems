import json
import math
from pathlib import Path
import torch
from torchvision.models import efficientnet_b0
from torchvision.transforms.functional import to_tensor, normalize
from PIL import Image

torch.set_num_threads(4)
model = efficientnet_b0(weights=None)
model.classifier[1] = torch.nn.Linear(1280, 2)
checkpoint = torch.load('tmp/helmet-head-v2-20261007/helmet_head_v2.pt', map_location='cpu', weights_only=True)
model.load_state_dict(checkpoint.get('model', checkpoint))
model.eval()
inputs = json.loads(Path('reports/kollam-localization-study-2026-10-07.json').read_text())
output = []
for item in inputs:
    image = Image.open(item['file']).convert('RGB')
    width, height = image.size
    scores = []
    for head in item['full']:
        b = head['boundingBox']
        values = []
        for padding in [0, .15]:
            left = max(0, math.floor((b['x'] - b['width'] * padding) * width))
            top = max(0, math.floor((b['y'] - b['height'] * padding) * height))
            right = min(width, math.ceil((b['x'] + b['width'] * (1 + padding)) * width))
            bottom = min(height, math.ceil((b['y'] + b['height'] * (1 + padding)) * height))
            crop = image.crop((left, top, right, bottom))
            scale = 224 / max(crop.size)
            nw, nh = max(1, int(crop.width * scale)), max(1, int(crop.height * scale))
            resized = crop.resize((nw, nh))
            padded = Image.new('RGB', (224, 224), (0, 0, 0))
            padded.paste(resized, ((224-nw)//2, (224-nh)//2))
            tensor = normalize(to_tensor(padded), [.485, .456, .406], [.229, .224, .225])
            with torch.inference_mode():
                value = model(tensor.unsqueeze(0)).softmax(dim=1)[0, 0].item()
            values.append(value)
        scores.append({'head': head, 'scores': values})
    row = {'file': item['file'], 'scores': scores}
    output.append(row)
    print(json.dumps(row), flush=True)
Path('reports/helmet-head-v2-study-2026-10-07.json').write_text(json.dumps(output, indent=2), encoding='utf-8')
