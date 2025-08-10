#!/usr/bin/env python3
"""
MiniCrypt v2
- Password → key via scrypt (memory-hard)
- AES-256-GCM authenticated encryption
- Simple file format with magic+version+salt+nonce
- CLI with prompts, overwrite safety, and clear errors
"""

from __future__ import annotations
import argparse
import os
import sys
import struct
import getpass
from dataclasses import dataclass
from typing import Optional

from cryptography.hazmat.primitives.kdf.scrypt import Scrypt
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.exceptions import InvalidTag

MAGIC = b"MC2\0"   # File magic
VERSION = 2        # Format version
SALT_LEN = 16
NONCE_LEN = 12     # AES-GCM standard nonce size
KEY_LEN = 32
DEFAULT_CHUNK_SIZE = 1024 * 1024  # reserved for future streaming use

# ---- KDF ----

def derive_key_scrypt(password: str, salt: bytes,
                      n: int = 2**15, r: int = 8, p: int = 1,
                      length: int = KEY_LEN) -> bytes:
    """
    Derive a key using scrypt. Parameters balance security and speed on typical machines.
    Increase n for more hardness if you can tolerate slower derivation.
    """
    if not isinstance(salt, (bytes, bytearray)) or len(salt) != SALT_LEN:
        raise ValueError("Salt must be 16 random bytes.")
    kdf = Scrypt(salt=salt, length=length, n=n, r=r, p=p)
    return kdf.derive(password.encode("utf-8"))

# ---- File format helpers ----

@dataclass
class Header:
    magic: bytes = MAGIC
    version: int = VERSION
    salt: bytes = b""
    nonce: bytes = b""

    def pack(self) -> bytes:
        if len(self.salt) != SALT_LEN or len(self.nonce) != NONCE_LEN:
            raise ValueError("Invalid salt or nonce length.")
        # >: big-endian, 4s: magic, B: version, 16s: salt, 12s: nonce
        return struct.pack(">4sB16s12s", self.magic, self.version, self.salt, self.nonce)

    @staticmethod
    def unpack(data: bytes) -> "Header":
        try:
            magic, version, salt, nonce = struct.unpack(">4sB16s12s", data)
        except struct.error as e:
            raise ValueError("File header is malformed.") from e
        if magic != MAGIC:
            raise ValueError("Not a MiniCrypt v2 file, bad magic.")
        if version != VERSION:
            raise ValueError(f"Unsupported version {version}.")
        return Header(magic=magic, version=version, salt=salt, nonce=nonce)

HEADER_LEN = struct.calcsize(">4sB16s12s")

# ---- Core crypto ----

def encrypt_bytes(plaintext: bytes, password: str) -> bytes:
    salt = os.urandom(SALT_LEN)
    nonce = os.urandom(NONCE_LEN)
    key = derive_key_scrypt(password, salt)
    aes = AESGCM(key)
    ciphertext = aes.encrypt(nonce, plaintext, associated_data=None)
    hdr = Header(salt=salt, nonce=nonce).pack()
    return hdr + ciphertext

def decrypt_bytes(blob: bytes, password: str) -> bytes:
    if len(blob) < HEADER_LEN + 16:  # header + minimum GCM tag
        raise ValueError("File too short or corrupted.")
    hdr = Header.unpack(blob[:HEADER_LEN])
    key = derive_key_scrypt(password, hdr.salt)
    aes = AESGCM(key)
    try:
        return aes.decrypt(hdr.nonce, blob[HEADER_LEN:], associated_data=None)
    except InvalidTag as e:
        raise ValueError("Decryption failed, wrong password or corrupted file.") from e

# ---- File IO ----

def read_all(path: str) -> bytes:
    with open(path, "rb") as f:
        return f.read()

def write_all(path: str, data: bytes, overwrite: bool = False) -> None:
    if os.path.exists(path) and not overwrite:
        raise FileExistsError(f"Refusing to overwrite existing file: {path} (use --overwrite)")
    with open(path, "wb") as f:
        f.write(data)

# ---- CLI ----

def cmd_encrypt(in_path: str, out_path: Optional[str], password: Optional[str], overwrite: bool) -> None:
    if not os.path.isfile(in_path):
        raise FileNotFoundError(f"Input file not found: {in_path}")

    if out_path is None:
        out_path = in_path + ".mc2"

    if password is None:
        password = prompt_password(confirm=True)

    data = read_all(in_path)
    blob = encrypt_bytes(data, password)
    write_all(out_path, blob, overwrite=overwrite)
    print(f"✅ Encrypted: {in_path} -> {out_path}")

def cmd_decrypt(in_path: str, out_path: Optional[str], password: Optional[str], overwrite: bool) -> None:
    if not os.path.isfile(in_path):
        raise FileNotFoundError(f"Input file not found: {in_path}")

    if password is None:
        password = prompt_password(confirm=False)

    blob = read_all(in_path)
    plaintext = decrypt_bytes(blob, password)

    if out_path is None:
        # strip trailing .mc2 if present, then add .dec to be explicit
        base = in_path[:-4] if in_path.lower().endswith(".mc2") else in_path
        out_path = base + ".dec"

    write_all(out_path, plaintext, overwrite=overwrite)
    print(f"✅ Decrypted: {in_path} -> {out_path}")

def prompt_password(confirm: bool) -> str:
    pw1 = getpass.getpass("Enter password: ")
    if confirm:
        pw2 = getpass.getpass("Confirm password: ")
        if pw1 != pw2:
            print("❌ Passwords do not match.", file=sys.stderr)
            sys.exit(2)
    if not pw1:
        print("❌ Empty password is not allowed.", file=sys.stderr)
        sys.exit(2)
    return pw1

def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="MiniCrypt v2, AES-256-GCM with scrypt key derivation."
    )
    sub = p.add_subparsers(dest="cmd", required=True)

    def add_common(sp):
        sp.add_argument("input", help="Input file path")
        sp.add_argument("-o", "--output", help="Output file path")
        sp.add_argument("-p", "--password", help="Password, if omitted you will be prompted")
        sp.add_argument("-f", "--overwrite", action="store_true", help="Allow overwriting output file")

    enc = sub.add_parser("encrypt", help="Encrypt a file")
    add_common(enc)

    dec = sub.add_parser("decrypt", help="Decrypt a file")
    add_common(dec)

    return p

def main(argv: list[str]) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    try:
        if args.cmd == "encrypt":
            cmd_encrypt(args.input, args.output, args.password, args.overwrite)
        elif args.cmd == "decrypt":
            cmd_decrypt(args.input, args.output, args.password, args.overwrite)
        else:
            parser.error("Unknown command.")
            return 2
        return 0
    except (FileNotFoundError, FileExistsError, ValueError) as e:
        print(f"❌ {e}", file=sys.stderr)
        return 1

if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
