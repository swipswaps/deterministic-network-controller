# 🛰️ Broadcom Recovery Kit v38.2

A deterministic, multi-layer recovery system for Broadcom Wi-Fi chipsets on Linux (Fedora/X11/GNOME).

This project is designed around a **single recovery engine** with optional layers for automation, UI, and system integration.

---

## 🧠 System Architecture

### LEVEL 1 — CORE ENGINE
- `fix-wifi.sh`

### LEVEL 2 — AUTOMATION (OPTIONAL)
- systemd timer (autonomous recovery)

### LEVEL 3 — INTERFACES (OPTIONAL)
- Web dashboard (Node.js)
- Tray applet (Python)

### LEVEL 4 — SYSTEM INTEGRATION (OPTIONAL)
- NOPASSWD sudo
- system-wide binary installation
- desktop entry

> You do not need to install all layers.  
> Choose the level that matches your use case.

---

## 🚀 Quick Start (Minimal Mode)

Run the recovery engine directly:

```bash
chmod +x fix-wifi.sh
./fix-wifi.sh
```

This is the core functionality of the entire system.

---

## ⚙️ Installation Modes

### 🟢 Mode A — Minimal (CLI Only)

```bash
git clone <your-repo-url>
cd broadcom-recovery-kit
chmod +x fix-wifi.sh
./fix-wifi.sh
```

### 🔵 Mode B — System-Wide + Automation

```bash
sudo cp fix-wifi.sh /usr/local/bin/fix-wifi
sudo chmod +x /usr/local/bin/fix-wifi
```

#### 🤖 Autonomous Recovery (Optional)

Enable background self-healing using systemd.

**Create service:**
```bash
sudo tee /etc/systemd/system/fix-wifi.service << 'EOF'
[Unit]
Description=Wi-Fi Recovery Engine

[Service]
Type=oneshot
ExecStart=/usr/local/bin/fix-wifi --force
EOF
```

**Create timer:**
```bash
sudo tee /etc/systemd/system/fix-wifi.timer << 'EOF'
[Unit]
Description=Periodic Wi-Fi Recovery

[Timer]
OnBootSec=1min
OnUnitActiveSec=5min

[Install]
WantedBy=timers.target
EOF
```

**Enable:**
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now fix-wifi.timer
```

This mode turns the system into a self-healing network node.

---

## 🖥️ Control Interfaces (Optional)

### Web Dashboard (Node.js)

```bash
npm install
npm run dev
```

Access at: [http://localhost:3000](http://localhost:3000)

### Tray Applet (X11)

```bash
pip install pystray pillow requests
python3 tray_applet.py &
```

---

## 🔐 Optional: Silent Execution Mode

Only enable if you understand the security implications.

```bash
sudo visudo
```

**Add:**
```text
owner ALL=(ALL) NOPASSWD: /usr/local/bin/fix-wifi
```

Enables UI-triggered recovery without password prompts.

---

## 📦 Offline Recovery Bundle

Generate firmware + driver bundle for air-gapped systems:

```bash
./prepare-bundle.sh
```

---

## 📁 Project Structure

- `fix-wifi.sh` → Core recovery engine (deterministic logic)
- `prepare-bundle.sh` → Offline firmware bundling
- `server.ts` → Backend bridge (UI → system)
- `src/App.tsx` → Web UI
- `tray_applet.py` → System tray bridge

---

## ⚠️ Important Notes

- This system operates at kernel + hardware level.
- Avoid mixing manual nmcli overrides with automated control modes.
- Do not manually kill network services when using this system.
- Choose one control layer per environment (manual, systemd, or UI).

---

## 🧩 Design Principles

- **Deterministic execution** (no hidden state)
- **No hardcoded interface assumptions**
- **NetworkManager remains in control**
- **Modular layers**, optional activation
- **Failover via orchestration**, not destruction

---

## 🏁 Summary

| Mode | Purpose |
| :--- | :--- |
| **Minimal** | Run `fix-wifi.sh` manually |
| **System** | Install globally |
| **Automated** | systemd self-healing |
| **Full Stack** | UI + tray + automation |
