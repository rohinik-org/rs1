#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo "==> build"
pnpm build

echo "==> typecheck"
pnpm typecheck

echo "==> test"
pnpm test

echo "==> no 'as any' in src/index.ts"
if grep -q 'as any' src/index.ts; then
  echo "FAIL: 'as any' found in src/index.ts" >&2
  exit 1
fi

echo "==> zero runtime dependencies"
DEPS=$(node -e "const p=require('./package.json'); console.log(Object.keys(p.dependencies||{}).length)")
if [ "$DEPS" != "0" ]; then
  echo "FAIL: found $DEPS runtime dependencies" >&2
  exit 1
fi

echo "==> no ML framework names in dist/index.js"
for name in torch tensorflow onnxruntime sklearn mlflow xgboost; do
  if grep -q "$name" dist/index.js; then
    echo "FAIL: '$name' found in dist/index.js" >&2
    exit 1
  fi
done

echo ""
echo "ALL GATES PASSED"
