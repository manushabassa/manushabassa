from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.backends import default_backend
from cryptography.fernet import Fernet
import base64
import os

def derive_key(password: str, salt: bytes) -> bytes:
    """Derives a 32-byte encryption key from the password and salt."""
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=480000,
        backend=default_backend()
    )
    return base64.urlsafe_b64encode(kdf.derive(password.encode()))

def encrypt_file(file_path: str, password: str):
    """Encrypts the file using a password."""
    salt = os.urandom(16)
    key = derive_key(password, salt)
    fernet = Fernet(key)

    with open(file_path, 'rb') as f:
        data = f.read()

    encrypted = fernet.encrypt(data)

    with open(file_path + '.enc', 'wb') as f:
        f.write(salt + encrypted)

    print(f"✅ Encrypted: {file_path} -> {file_path}.enc")

def decrypt_file(file_path: str, password: str):
    """Decrypts the file using a password."""
    with open(file_path, 'rb') as f:
        salt = f.read(16)
        encrypted_data = f.read()

    key = derive_key(password, salt)
    fernet = Fernet(key)

    try:
        decrypted = fernet.decrypt(encrypted_data)
        original_name = file_path.replace('.enc', '')
        with open(original_name + '.dec', 'wb') as f:
            f.write(decrypted)
        print(f"✅ Decrypted: {file_path} -> {original_name}.dec")
    except Exception as e:
        print("❌ Decryption failed. Wrong password or corrupted file.")

# Example usage
if __name__ == "__main__":
    import sys

    if len(sys.argv) < 4:
        print("Usage:\n  python minicrypt.py [encrypt|decrypt] <file> <password>")
        sys.exit(1)

    action, file, pwd = sys.argv[1], sys.argv[2], sys.argv[3]

    if action == "encrypt":
        encrypt_file(file, pwd)
    elif action == "decrypt":
        decrypt_file(file, pwd)
    else:
        print("Invalid action. Use 'encrypt' or 'decrypt'.")
