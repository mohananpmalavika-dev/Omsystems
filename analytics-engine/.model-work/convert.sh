#!/bin/sh
set -eu

# This script is for the checked-in Paddle inference bundle. The production
# Dockerfile is the canonical reproducible path and also verifies the source
# archive and generated ONNX checksums.
if command -v apt-get >/dev/null 2>&1; then
  apt-get update
  apt-get install -y --no-install-recommends libgomp1
  rm -rf /var/lib/apt/lists/*
fi

python -m pip install --no-cache-dir paddlepaddle==2.6.2 paddle2onnx==1.2.6 six==1.16.0
paddle2onnx \
  --model_dir /work/safety_helmet_infer \
  --model_filename inference.pdmodel \
  --params_filename inference.pdiparams \
  --save_file /work/helmet.onnx \
  --opset_version 11 \
  --enable_onnx_checker True
