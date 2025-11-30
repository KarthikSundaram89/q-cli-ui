#!/bin/bash
# Check Q CLI auth status and relogin if needed

if ! q whoami &>/dev/null; then
    echo "Q CLI auth expired, attempting relogin..."
    q login --refresh-token
    systemctl restart q-cli-ui.service
fi
