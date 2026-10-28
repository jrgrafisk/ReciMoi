#!/data/data/com.termux/files/usr/bin/sh
# Installerer ReciMoi i Termux (Android) og sætter automatisk start op.
# Kør:  curl -fsSL https://raw.githubusercontent.com/jrgrafisk/ReciMoi/main/termux/install.sh | sh
set -e
pkg update -y
pkg install -y python git
[ -d "$HOME/ReciMoi" ] || git clone https://github.com/jrgrafisk/ReciMoi "$HOME/ReciMoi"

cat > "$HOME/recimoi-start.sh" <<'EOS'
#!/data/data/com.termux/files/usr/bin/sh
termux-wake-lock 2>/dev/null
cd "$HOME/ReciMoi" && exec python3 server.py --host 127.0.0.1 >> "$HOME/recimoi.log" 2>&1
EOS
chmod +x "$HOME/recimoi-start.sh"

# Automatisk start når telefonen tændes (kræver appen Termux:Boot)
mkdir -p "$HOME/.termux/boot"
cp "$HOME/recimoi-start.sh" "$HOME/.termux/boot/recimoi"

echo
echo "Færdig. Start serveren nu med:  ~/recimoi-start.sh &"
echo "Åbn derefter  http://localhost:8000  i Chrome og vælg 'Installér app'."
