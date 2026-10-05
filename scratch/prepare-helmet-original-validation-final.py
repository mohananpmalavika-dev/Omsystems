import pathlib
source=pathlib.Path('scratch/validate-helmet-batch-candidate-2026-10-05.sh').read_text()
start=source.index('# Original snapshots stay')
end=source.index('trap - ERR',start)
prefix='''set -Eeuo pipefail
stage=/tmp/sentinel-helmet-batch-1.1.8-20261005
source_root=/opt/sentinel-grid
candidate=sentinel-gcp-analytics-engine:helmet-batch-1.1.8-20261005
test "$(grep -c '^VALIDATED ' "$stage/supplied-validation.log")" = 62
test "$(sha256sum "$stage/helmet-detector.js" | cut -d ' ' -f 1)" = 05dcd0c6a20271dac47821283a561a578306b51f6c96594d4d3fced4bc4e1a19
trap 'grep -E "^(FAILED|SUMMARY|SCORES)|Error:" "$stage/original-validation.log" 2>/dev/null || true' ERR
'''
pathlib.Path('scratch/validate-helmet-batch-originals-final-2026-10-05.sh').write_text(prefix+source[start:end]+'trap - ERR\n',newline='\n')
