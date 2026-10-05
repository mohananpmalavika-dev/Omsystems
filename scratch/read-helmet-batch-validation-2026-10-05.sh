set -e
stage=/tmp/sentinel-helmet-batch-1.1.8-20261005
grep -E '^(VALIDATED|FAILED|SCORES|SUMMARY)|Error:|ENOENT|EACCES' "$stage/original-validation.log" || true
