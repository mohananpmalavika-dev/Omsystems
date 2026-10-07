import json
from pathlib import Path
from tokenizers import Tokenizer

stage = Path('tmp/helmet-clip-candidate-20261007')
taxonomy = {
    'motorcycle_helmet': [
        'a photograph of a person wearing a motorcycle helmet.',
        "a close-up of a motorcycle helmet covering a person's head.",
        'a person wearing a motorcycle helmet with an open visor.',
        'a person wearing a full-face motorcycle helmet.',
        "the back of a motorcycle helmet worn on a person's head.",
        'a side view of a person wearing a motorcycle helmet.',
        'a close-up of a black motorcycle helmet.',
    ],
    'bare_head': [
        'a photograph of a person with an uncovered bare head.',
        "a close-up of a person's bare head, hair and face.",
        'a photograph of human hair on a bare head.',
        "the back of a person's uncovered head and hair.",
    ],
    'cap_or_hat': ['a person wearing a baseball cap.', 'a person wearing a cloth hat.'],
    'hood_or_headscarf': ['a person wearing a hood.', 'a person wearing a headscarf or turban.'],
    'furniture': ['the backrest and headrest of an empty office chair.', 'a close-up of furniture.'],
    'background_object': ['a bag or dark object on a chair.', 'a CCTV timestamp overlay.', 'a close-up of a paddle.'],
}
tokenizer = Tokenizer.from_file(str(stage / 'tokenizer.json'))
tokenizer.enable_padding(pad_id=49407, pad_token='<|endoftext|>', length=77)
tokenizer.enable_truncation(max_length=77)
rows=[]
for label,prompts in taxonomy.items():
    for prompt in prompts:
        encoded=tokenizer.encode(prompt)
        rows.append({'label':label,'prompt':prompt,'ids':encoded.ids,'mask':encoded.attention_mask})
(stage / 'prompts.json').write_text(json.dumps(rows, indent=2), encoding='utf-8')
print(json.dumps({'classes':list(taxonomy), 'prompts':len(rows)}))
