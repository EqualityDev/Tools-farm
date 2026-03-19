#!/bin/bash
# OwO Tools — Auto Installer
# https://github.com/EqualityDev/Tools-farm

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

echo ""
echo -e "${CYAN}${BOLD}"
echo "  ██████╗ ██╗    ██╗ ██████╗     ████████╗ ██████╗  ██████╗ ██╗     ███████╗"
echo "  ██╔═══██╗██║    ██║██╔═══██╗    ╚══██╔══╝██╔═══██╗██╔═══██╗██║     ██╔════╝"
echo "  ██║   ██║██║ █╗ ██║██║   ██║       ██║   ██║   ██║██║   ██║██║     ███████╗"
echo "  ██║   ██║██║███╗██║██║   ██║       ██║   ██║   ██║██║   ██║██║     ╚════██║"
echo "  ╚██████╔╝╚███╔███╔╝╚██████╔╝       ██║   ╚██████╔╝╚██████╔╝███████╗███████║"
echo "   ╚═════╝  ╚══╝╚══╝  ╚═════╝        ╚═╝    ╚═════╝  ╚═════╝ ╚══════╝╚══════╝"
echo -e "${NC}"
echo -e "${YELLOW}  Auto Installer — github.com/EqualityDev/Tools-farm${NC}"
echo ""

# ── Cek Termux ──────────────────────────────────────────────
if [ ! -d "/data/data/com.termux" ]; then
    echo -e "${RED}[!] Script ini hanya untuk Termux (Android).${NC}"
    exit 1
fi

echo -e "${GREEN}[✓] Termux terdeteksi.${NC}"
echo ""

# ── Update & Install packages ────────────────────────────────
echo -e "${CYAN}[1/5] Update & install packages Termux...${NC}"
pkg update -y && pkg upgrade -y
pkg install python git termux-api -y

echo -e "${GREEN}[✓] Packages terinstall.${NC}"
echo ""

# ── Setup storage ────────────────────────────────────────────
echo -e "${CYAN}[2/5] Setup storage permission...${NC}"
termux-setup-storage
sleep 2
echo -e "${GREEN}[✓] Storage ready.${NC}"
echo ""

# ── Clone repo ───────────────────────────────────────────────
echo -e "${CYAN}[3/5] Clone repo OwO Tools...${NC}"
cd /storage/emulated/0 || cd ~
if [ -d "Tools-farm" ]; then
    echo -e "${YELLOW}[!] Folder Tools-farm sudah ada. Update ke versi terbaru...${NC}"
    cd Tools-farm
    python3 updater.py
else
    git clone https://github.com/EqualityDev/Tools-farm.git
    cd Tools-farm
fi
echo -e "${GREEN}[✓] Repo siap.${NC}"
echo ""

# ── Install Python dependencies ──────────────────────────────
echo -e "${CYAN}[4/5] Install Python dependencies...${NC}"
python3 setup.py
echo -e "${GREEN}[✓] Dependencies terinstall.${NC}"
echo ""

# ── Selesai ──────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}[✓] Instalasi selesai!${NC}"
echo ""
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}  Langkah selanjutnya:${NC}"
echo ""
echo -e "  ${CYAN}1.${NC} Edit tokens.txt — masukkan token Discord dan channel ID:"
echo -e "     ${YELLOW}nano /storage/emulated/0/Tools-farm/tokens.txt${NC}"
echo -e "     Format: TOKEN_DISCORD CHANNEL_ID"
echo ""
echo -e "  ${CYAN}2.${NC} Jalankan bot:"
echo -e "     ${YELLOW}cd /storage/emulated/0/Tools-farm && bash run.sh${NC}"
echo ""
echo -e "  ${CYAN}3.${NC} Buka dashboard di browser:"
echo -e "     ${YELLOW}http://localhost:1200${NC}"
echo -e "     Password default: ${YELLOW}owo123${NC}"
echo ""
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${CYAN}  Untuk jalankan bot lagi lain kali:${NC}"
echo -e "  ${YELLOW}cd /storage/emulated/0/Tools-farm && bash run.sh${NC}"
echo ""
