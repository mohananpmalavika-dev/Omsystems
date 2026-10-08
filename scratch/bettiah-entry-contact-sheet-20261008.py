from PIL import Image, ImageDraw
from pathlib import Path
root=Path('scratch/bettiah-entry-20261008')
for channel in (2,5):
    files=sorted((root/f'ch{channel}').glob('frame-*.jpg'))
    print('channel',channel,'frames',len(files))
    for page in range((len(files)+19)//20):
        chosen=files[page*20:(page+1)*20]
        sheet=Image.new('RGB',(1600,5*250),(22,24,28))
        draw=ImageDraw.Draw(sheet)
        for i,f in enumerate(chosen):
            im=Image.open(f); im.thumbnail((400,220))
            x=(i%4)*400;y=(i//4)*250
            sheet.paste(im,(x,y+25));draw.text((x+6,y+6),f'CH{channel} {f.name}  nominal +{(int(f.stem.split("-")[1])-1)*2}s',fill='white')
        sheet.save(root/f'ch{channel}-review-{page+1}.jpg',quality=92)
