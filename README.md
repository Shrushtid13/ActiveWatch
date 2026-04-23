# ActiveWatch Command Suite 🛡️

**ActiveWatch** is a modern, full-stack application featuring a high-fidelity **Arcade Portal** for users, seamlessly integrated with a real-time **Telemetry Command Console** for administrators. It utilizes WebSockets to track live user engagement, game session data, and connection stability.

---

## 🚀 Overview

The system architecture is composed of three primary layers:
1. **Command Console (Admin)**: A centralized, secure dashboard for monitoring active users, latency metrics, and engagement history.
2. **Arcade Portal (User)**: A sleek interactive hub where users can play a suite of custom arcade games while their activity telemetry is securely recorded in the background.
3. **Real-time Engine (Backend)**: A Node.js socket server that handles bi-directional data flow, role-based authentication, and session persistence.

## ✨ Core Features

### 🎮 The Arcade Suite
Five bespoke arcade games designed for visual excellence, featuring dynamic color gradients and the *Righteous* arcade font:
* **✨ Lumina Link**: Establish resonance between floating light nodes.
* **🎯 Neon Strike**: A fast-paced, precision reflex shooting gallery.
* **⚡ Binary Blitz**: High-speed reaction tap sequence protocol.
* **🧩 Zen Match**: A glowing cognitive memory grid matching game.
* **🫧 Pixel Pop**: Color synchronization and reaction speed test.

### 📊 Real-time Telemetry Monitoring
* **Live Tracking**: Monitor user status (Online/Idle/Critical) via an automated watchdog script.
* **Latency Meters**: Real-time RTT (Round Trip Time) ping tracking in milliseconds.
* **Activity Logs**: Persistent session history stored natively on the server.
* **Favored Game Analytics**: Automatic identification of the most-played arcade game per user.

### 🎨 Design System
* **Typography**: *Righteous* (Arcade Titles), *Inter* (Headlines & UI), & *JetBrains Mono* (Telemetry Data).
* **Aesthetics**: Minimalist dark-mode interface injected with vibrant arcade gradients, glowing accents, bespoke SVGs (Shield & Gamepad Favicons), and premium spacing.

## 🛠️ Technology Stack
* **Frontend Portals**: React.js (Vite), Tailwind CSS (for structure/layout), Vanilla CSS (for glowing visual effects).
* **Backend Server**: Node.js, Express, Socket.io.
* **Data Transmission**: WebSockets for sub-100ms real-time telemetry updates.

---

## 🔒 Security Protocol
ActiveWatch employs an enterprise-grade authentication and authorization framework featuring:
* **Encrypted Authentication**: Securely hashed endpoint passwords utilizing standard `bcrypt` algorithms.
* **Super-Admin Architecture**: A hardcoded master role (`super_admin`) serves as the core system orchestrator.
* **Dynamic Role Promotion**: Only an authenticated Master Admin has the authority to promote normal users to authorized administrative viewers, or revoke privileges entirely from the Command Console.
* **Local Session Persistence**: Advanced front-end connections (for both the Admin Console and User Arcade Portal) safely persist identity arrays in local storage, seamlessly recovering sessions and UI states during browser reloading or accidental disconnects.

---

## ⚡ Quick Start

### Prerequisites
* Node.js (v16 or higher)
* npm

### Installation
1. Clone the repository and navigate into it:
   ```bash
   git clone <your-repo-url>
   cd activewatch
   ```
2. Install dependencies for all workspace packages. (Execute this in the root directory):
   ```bash
   npm run install:all
   ```
*(Note: If you do not have an `install:all` script in your root `package.json`, simply run `npm install` inside the `backend/`, `frontend/`, and `admin-dashboard/` directories separately).*

### Running the Project
The project uses `concurrently` to launch all core services with a single command:
```bash
npm run dev
```

* **Real-time Backend**: [http://localhost:3008](http://localhost:3008)
* **User Arcade Portal**: [http://localhost:5173](http://localhost:5173)
* **Admin Command Console**: [http://localhost:5174](http://localhost:5174)

---

## 📁 Repository Structure
```text
.
├── admin-dashboard/    # React-based Admin Command Console
├── backend/            # Socket.io Server, Auth, & History Storage
├── frontend/           # React-based User Arcade Portal
└── README.md           # Documentation
```

---
*Developed for ActiveWatch Network Oversight &copy; 2026*
