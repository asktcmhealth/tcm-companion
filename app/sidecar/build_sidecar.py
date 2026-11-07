"""Build the text sidecar (main.exe) with PyInstaller.

Run this instead of calling `pyinstaller main.spec` directly:

    python build_sidecar.py

PyInstaller's module scan recurses through the whole import chain
(transformers -> huggingface_hub -> filelock ...). With the default thread
stack, Python's compile() overflows the C stack deep in that chain and the
scanner silently marks hundreds of modules (filelock, much of torch, ...) as
"invalid" -- they are then missing from main.exe, which fails at startup with
"No module named 'filelock._api'". Running the build in a thread with a large
stack avoids it. After a build, `grep -c "^invalid module named"
build/main/warn-main.txt` should print 0.
"""

import sys
import threading

threading.stack_size(256 * 1024 * 1024 - 4096)

result = {"code": 1}


def run():
    import PyInstaller.__main__ as pyi

    try:
        pyi.run(["main.spec", "--noconfirm", "--clean"])
        result["code"] = 0
    except SystemExit as exc:
        result["code"] = exc.code or 0


thread = threading.Thread(target=run)
thread.start()
thread.join()
sys.exit(result["code"])
