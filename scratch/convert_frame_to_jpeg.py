import json
import numpy as np
from PIL import Image

data = json.load(open('/tmp/frame.json'))
import base64
raw = base64.b64decode(data['imageBase64'])
arr = np.frombuffer(raw, dtype=np.uint8).reshape((360, 640, 3))
img = Image.fromarray(arr)
img.save('/tmp/frame.jpg')
print('Saved /tmp/frame.jpg successfully. Size:', img.size)
