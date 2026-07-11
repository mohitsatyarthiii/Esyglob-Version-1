#!/bin/bash
echo "=== APP CRASH DEBUG ==="

echo "1. Cleaning logs..."
adb logcat -c

echo "2. Starting log monitoring..."
echo "Press Ctrl+C to stop"

adb logcat | while read line; do
  if echo "$line" | grep -qE "FATAL|AndroidRuntime|ReactNativeJS.*ERROR|CRASH"; then
    echo "🔥 CRASH DETECTED!"
    echo "$line"
    echo "=== Full crash log ==="
    adb logcat -d | grep -A 20 -B 20 "$line"
    break
  fi
done