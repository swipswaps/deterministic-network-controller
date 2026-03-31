# Broadcom Network Controller & Recovery Kit (v0700)

An autonomous, deterministic, and forensic-aware network recovery engine designed specifically for Broadcom Wi-Fi chipsets on Linux (Fedora/RHEL/CentOS).

## 🚀 Overview

Broadcom wireless adapters on Linux are notorious for "soft-locking" or dropping connections under specific power-management states or kernel transitions. This kit provides a robust, three-tier solution to ensure 99.9% network uptime through autonomous self-healing.

### The Three Tiers:
1.  **The Engine (`fix-wifi.sh`)**: A Bash-based PID (Proportional-Integral-Derivative) controller that monitors network health and executes recovery sequences.
2.  **The Bridge (`server.ts`)**: An Express.js backend that provides a secure API to the engine and the forensic database.
3.  **The Dashboard (`App.tsx`)**: A modern React interface for real-time telemetry, command auditing, and manual overrides.

---

## 🛠 Architecture & Design

### PID Control Loop
Inspired by Betaflight flight controllers, the engine uses a PID loop to calculate a "Control Signal" based on network health.
-   **Proportional (Kp)**: Immediate response to health drops.
-   **Integral (Ki)**: Corrects long-term drift and persistent outages (with Anti-Windup protection).
-   **Derivative (Kd)**: Dampens rapid fluctuations to prevent jitter.

### Forensic Observability
Every action is recorded in an SQLite database (`recovery_state.db`):
-   **Milestones**: High-level system events.
-   **Commands**: Verbatim shell commands, exit codes, and `stderr/stdout` buffers.
-   **Stats**: Success/failure tracking per connection UUID.

---

## 📦 Installation & Setup

### Prerequisites
-   **Linux Distribution**: Fedora (tested), RHEL, or CentOS.
-   **Hardware**: Broadcom BCM43xx series (e.g., MacBook Pro, Dell XPS).
-   **Dependencies**: `sqlite3`, `nmcli`, `ping`, `getent`, `ip`, `timeout`, `flock`.

### Quick Start
1.  **Clone the repository** to your local machine.
2.  **Install dependencies**:
    ```bash
    npm install
    ```
3.  **Configure Sudo**:
    The server needs to run the recovery script with elevated privileges. Add the following to your `/etc/sudoers` (replace `<user>` and `<path>`):
    ```text
    <user> ALL=(ALL) NOPASSWD: /usr/local/bin/fix-wifi
    ```
4.  **Start the Controller**:
    ```bash
    # Start the background engine
    ./fix-wifi.sh &
    
    # Start the dashboard
    npm run dev
    ```

---

## ⚙️ Configuration

### Environment Variables
| Variable | Default | Description |
| :--- | :--- | :--- |
| `PROJECT_ROOT` | `pwd` | Base directory for logs and DB. |
| `AUTO_REENABLE_NETWORKING` | `1` | Automatically toggle NM networking on. |
| `Kp`, `Ki`, `Kd` | `800, 50, 300` | PID gains (scaled by 1000). |

### PID Tuning Guide
-   **Increase `Kp`** if the system is too slow to react to a total disconnect.
-   **Increase `Ki`** if the system stays in a "Degrading" state without recovering.
-   **Increase `Kd`** if the system toggles `nmcli` off/on too frequently during minor jitter.

---

## 🔍 Troubleshooting (Broadcom Specific)

### 1. "Firmware Missing" Errors
If `dmesg | grep brcm` shows firmware load failures:
-   **Fix**: Install `broadcom-bt-firmware` and `b43-firmware`.
-   **Fedora**: `sudo dnf install b43-fwcutter broadcom-wl`.

### 2. `nmcli` Connection Activation Failed
If the dashboard shows `FAILURE_1` on connection activation:
-   **Reason**: Usually a WPA supplicant timeout or incorrect regulatory domain.
-   **Fix**: Set your regulatory domain: `sudo iw reg set US` (or your country code).

### 3. Script Fails to Start (Lock Error)
If you see `Another instance is already running`:
-   **Fix**: Check for stale lock files: `rm fix-wifi.lock`. Ensure no other `fix-wifi.sh` processes are active.

### 4. Dashboard Shows "Connection Lost"
-   **Fix**: Ensure the Express server is running (`npm run dev`) and that the `recovery_state.db` file is readable by the Node.js process.

---

## 📊 Database Schema

### `milestones`
| Column | Type | Description |
| :--- | :--- | :--- |
| `timestamp` | DATETIME | ISO-8601 event time. |
| `name` | TEXT | Event identifier (e.g., `RECOVERY_START`). |
| `details` | TEXT | Contextual information. |

### `commands`
| Column | Type | Description |
| :--- | :--- | :--- |
| `timestamp` | DATETIME | Execution time. |
| `command` | TEXT | The verbatim shell command. |
| `exit_code` | INTEGER | `0` for success, `>0` for failure. |
| `output` | TEXT | Combined `stdout` and `stderr`. |

---

## 🛡 Security
-   **Single Instance**: Uses `flock` to prevent race conditions on hardware state.
-   **SQL Safety**: All database interactions use parameterized queries to prevent SQL injection.
-   **Minimal Surface**: The Express server only exposes read-only endpoints for the database, with the exception of the `/api/recover` trigger.

---
*Created by Jose J Melendez | v0700*
