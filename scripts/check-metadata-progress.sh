#!/bin/bash

echo "Checking metadata update progress..."
echo ""

# Check if process is still running
if ps -p 3118 > /dev/null 2>&1; then
    echo "✅ Update process is still running (PID: 3118)"
else
    echo "⚠️  Update process has completed or stopped"
fi

echo ""
echo "Recent log output:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
tail -20 /tmp/metadata-update.log

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "To see full log: cat /tmp/metadata-update.log"
echo "To watch live: tail -f /tmp/metadata-update.log"
