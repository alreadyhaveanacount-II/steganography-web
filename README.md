# Advanced LSB Steganography Tool

A sophisticated steganography tool that combines **ChaCha20**, **DSSS**, **PBKDF2** and **randomized pixel selection** to hide any file type inside images with minimal detectable changes.

---
## Building

### Windows (MSVC/PowerShell)
```
build.bat
```

### Linux

```
chmod +x build.sh
./build.sh
```

---

## Features

- **📁 Hide Any File** - Hide text, images, executables, or any binary data inside PNG images
- **🎯 Random Pixel Selection** - Password-driven CSPRNG determines pixel order (no sequential patterns)
- **🧂 Salt Support** - Separate salts for encryption and steganography layers
- **⚡ WebAssembly** - High-performance Rust backend compiled to WASM with O3 optimizations
- **🖼️ Zero Quality Loss** - Original image dimensions preserved, imperceptible changes

---

## Security notes

- Key Derivation - 600k PBKDF2 iterations (OWASP recommended)
- Two-Layer Security - Separate salts for encryption and steganography
- Educational / experimental

---

## Limitations

- No Authentication - No HMAC; corrupted data may decode to garbage
- PNG Required - JPEG compression destroys LSB data
- Password Recovery - No backdoor; lost password = lost data
