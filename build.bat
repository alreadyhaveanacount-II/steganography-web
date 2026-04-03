@echo off
echo 🔨 Building Rust WASM with release optimizations...

:: Clean old build
if exist static\pkg rmdir /s /q static\pkg

:: Build with wasm-pack
cd rust-src
call wasm-pack build --target web --release --out-dir ../static/pkg
cd ..

:: Optional: wasm-opt (if installed)
where wasm-opt >nul 2>nul
if %errorlevel% equ 0 (
    echo ⚡ Running wasm-opt O3...
    wasm-opt -O3 static/pkg/rust_src_bg.wasm -o static/pkg/rust_src_bg.wasm
)

echo ✅ Build complete!
dir static\pkg