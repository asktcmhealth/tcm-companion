# -*- mode: python ; coding: utf-8 -*-
from PyInstaller.utils.hooks import copy_metadata

datas = []
datas += copy_metadata('torchcodec')
datas += copy_metadata('torch')
datas += copy_metadata('transformers')
datas += copy_metadata('tokenizers')
datas += copy_metadata('safetensors')
datas += copy_metadata('huggingface_hub')
datas += copy_metadata('regex')
datas += copy_metadata('tqdm')
datas += copy_metadata('filelock')
datas += copy_metadata('pyyaml')
datas += copy_metadata('requests')
datas += copy_metadata('packaging')
datas += copy_metadata('numpy')


a = Analysis(
    ['main.py'],
    pathex=['../../benchmark'],
    binaries=[],
    datas=datas,
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='main',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
