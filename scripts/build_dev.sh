#!/bin/bash
# 用法：./scripts/build_dev.sh
# 保留增量建置快取，沿用專案的 Developer ID 簽章，不製作 DMG。
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_DIR="${PROJECT_DIR}/build/cache"
APP_PATH="${PROJECT_DIR}/build/XIV on Mac in TC.app"

xcodebuild \
    -project "${PROJECT_DIR}/XIV on Mac in TC.xcodeproj" \
    -scheme "XIV on Mac" \
    -configuration Debug \
    -destination 'platform=macOS,arch=arm64' \
    -derivedDataPath "$BUILD_DIR" \
    CONFIGURATION_BUILD_DIR="${PROJECT_DIR}/build" \
    build

if [ ! -d "$APP_PATH" ]; then
    echo "錯誤：建置完成後找不到 app：$APP_PATH" >&2
    exit 1
fi

printf '\n測試 app 已建立：\n%s\n\n可直接在 Finder 中開啟；此版本沿用正式版的帳號與設定。\n' "$APP_PATH"
