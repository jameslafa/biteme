#!/bin/bash
set -e

echo "🔍 Parsing recipes..."
cargo run --manifest-path recipe-parser/Cargo.toml --release -- --lint

echo ""
echo "✅ Done! Check docs/recipes.json"
