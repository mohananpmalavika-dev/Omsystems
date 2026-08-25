#!/bin/sh
set -eu
python -m pip install --no-cache-dir six==1.16.0 paddle2onnx==1.0.9
paddle2onnx \
  --model_dir /work/safety_helmet_infer \
  --model_filename inference.pdmodel \
  --params_filename inference.pdiparams \
  --save_file /work/helmet.onnx \
  --opset_version 11 \
  --enable_onnx_checker True
