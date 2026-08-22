#!/bin/bash
# Sentinel Grid Edge Agent - Uninstaller

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

INSTALL_DIR="/opt/sentinel-grid/edge-agent"
SERVICE_NAME="sentinel-grid-edge-agent"

echo ""
echo "======================================"
echo "  Uninstalling Sentinel Grid"
echo "======================================"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}❌ Please run as root (use sudo)${NC}"
    exit 1
fi

# Confirm uninstall
echo -e "${YELLOW}Are you sure you want to uninstall Sentinel Grid Edge Agent?${NC}"
echo "This will stop monitoring cameras at this branch location."
read -p "Type 'yes' to confirm: " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "Uninstall cancelled."
    exit 0
fi

echo ""
echo "Uninstalling..."

# Stop service
if systemctl is-active --quiet $SERVICE_NAME; then
    echo "Stopping service..."
    systemctl stop $SERVICE_NAME
    echo "✅ Service stopped"
fi

# Disable service
if systemctl is-enabled --quiet $SERVICE_NAME; then
    echo "Disabling service..."
    systemctl disable $SERVICE_NAME
    echo "✅ Service disabled"
fi

# Remove service file
if [ -f "/etc/systemd/system/$SERVICE_NAME.service" ]; then
    echo "Removing service..."
    rm "/etc/systemd/system/$SERVICE_NAME.service"
    systemctl daemon-reload
    echo "✅ Service removed"
fi

# Ask about files
echo ""
echo -e "${YELLOW}Remove all files including configuration and logs?${NC}"
read -p "Type 'yes' to remove all files: " REMOVE_FILES

if [ "$REMOVE_FILES" = "yes" ]; then
    if [ -d "$INSTALL_DIR" ]; then
        echo "Removing files..."
        rm -rf "$INSTALL_DIR"
        echo "✅ Files removed"
    fi
else
    echo "Files preserved at: $INSTALL_DIR"
fi

echo ""
echo "======================================"
echo "  Uninstall Complete"
echo "======================================"
echo ""
