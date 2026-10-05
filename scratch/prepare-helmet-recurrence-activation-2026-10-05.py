import pathlib
source=pathlib.Path('scratch/activate-helmet-batch-2026-10-05.sh').read_text()
source=source.replace('sentinel-helmet-batch-1.1.8','sentinel-helmet-recurrence-1.1.9')
source=source.replace('helmet-batch-1.1.8','helmet-recurrence-1.1.9')
source=source.replace('"1.1.8"','"1.1.9"')
source=source.replace('supplied-validation.log")" = 62','supplied-validation.log")" = 64')
source=source.replace('original-validation.log")" = 32','original-validation.log")" = 68')
pathlib.Path('scratch/activate-helmet-recurrence-2026-10-05.sh').write_text(source,newline='\n')
