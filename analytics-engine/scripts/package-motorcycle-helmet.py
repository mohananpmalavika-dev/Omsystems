"""Package the pinned Apache-2.0 motorcycle-helmet ONNX export and weights."""
import argparse
import hashlib
from pathlib import Path
import tempfile
import urllib.request

import onnx

REVISION = "4ea2eb67301722073555448b477178330e40f7d1"
SOURCE = f"https://huggingface.co/vivekvar/helmet-v5/resolve/{REVISION}/models/"
ARTIFACTS = {
    "helmet_v5e_head.onnx": "410d439f78d7bd86e9e83763db30e5ba00a70b4642439d640c0df1d288bd5dc8",
    "helmet_v5e_head.onnx.data": "911a3ec0533276fc5bff11351ecadb23318d9ff8e8fcd76f939efdd0e9920346",
}
PACKAGED_SHA256 = "b50a2ec2354db804a2f4d14b726bec24d5de0966340fc66477f53f8ec3159e6e"


def digest(file: Path) -> str:
    return hashlib.sha256(file.read_bytes()).hexdigest()


def package(source_directory: Path, output: Path, download: bool) -> None:
    for name, expected in ARTIFACTS.items():
        source = source_directory / name
        if download:
            with urllib.request.urlopen(SOURCE + name, timeout=120) as response:
                source.write_bytes(response.read())
        if digest(source) != expected:
            raise ValueError(f"Checksum mismatch for {name}")
    model = onnx.load(source_directory / "helmet_v5e_head.onnx")
    onnx.checker.check_model(model)
    # Embed the external weights so runtime/provisioning only handles one
    # checksum-verified file, without a separate mutable weights dependency.
    with tempfile.TemporaryDirectory() as work:
        packaged = Path(work) / "helmet-motorcycle.onnx"
        onnx.save_model(model, packaged, save_as_external_data=False)
        if digest(packaged) != PACKAGED_SHA256:
            raise ValueError("Packaged ONNX checksum differs from the reviewed artifact")
        if output.exists() and digest(output) != PACKAGED_SHA256:
            raise FileExistsError(f"Refusing to replace a different model: {output}")
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_bytes(packaged.read_bytes())
    print(f"Verified motorcycle helmet model: {output} ({PACKAGED_SHA256})")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-directory", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    arguments = parser.parse_args()
    if arguments.source_directory:
        package(arguments.source_directory, arguments.output, download=False)
    else:
        with tempfile.TemporaryDirectory() as directory:
            package(Path(directory), arguments.output, download=True)
