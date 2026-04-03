#!/bin/bash
echo "🔨 Building Rust WASM with release optimizations..."

# Build with wasm-pack
cd rust-src
wasm-pack build --target web --release --out-dir ../static/pkg
cd ..

# Optional: wasm-opt (if installed)
if command -v wasm-opt &> /dev/null; then
    echo "⚡ Running wasm-opt O3..."
    wasm-opt -O3 static/pkg/rust_src_bg.wasm -o static/pkg/rust_src_bg.wasm
fi

echo "✅ Build complete!"
ls -lh static/pkg/
