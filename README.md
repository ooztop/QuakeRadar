# 🛡️ SafeLink: IoT-Based Disaster Recovery & Radar System

SafeLink is an emergency communication and victim detection system designed for earthquake disaster management. It uses a hybrid architecture consisting of a Cloud Server, a Mobile Application (Expo), and an IoT Radar (ESP32) to locate victims via Wi-Fi signals even without cellular network availability.

## 🏗️ System Architecture

The project consists of three main components:

1.  **Central Cloud Server (`app_server.js`)**: A Node.js WebSocket server that coordinates communication between victims and rescue teams. It can be hosted on any VPS.
2.  **Mobile Application (Expo/React Native)**: Used by citizens to register their emergency information and report their status (SAFE/TRAPPED).
3.  **IoT Radar Forwarder (`radar_server.js` + ESP32)**: A physical scanning device (attached to drones or search teams) that scans for victims' Wi-Fi hotspots and reports detections to the central server in real-time.

---

## 🚀 Getting Started

### 1. Central Server (Cloud)
Located in the root directory.
```bash
# Install dependencies
npm install

# Run the server
node app_server.js
```

### 2. Mobile Application
The app is built with Expo.
```bash
# Start Expo
npx expo start
```
*Note: Ensure the `SERVER_IP` in `App.js` points to your server's IP/Domain.*

### 3. IoT Radar System (Hardware)
1.  Upload `ESP_WiFi_Web_Scanner.ino` (located in `/ESP_WiFi_Web_Scanner`) to your ESP32 board using Arduino IDE.
2.  Connect the ESP32 to your laptop via USB.
3.  Run the forwarder script:
```bash
node radar_server.js
```

---

## 🛠️ Tech Stack
- **Backend:** Node.js, WebSocket (`ws`)
- **Frontend:** React Native, Expo, Expo Location
- **Hardware:** ESP32 (C++/Arduino), SerialPort Integration
- **DevOps:** Git, GitHub

## 📜 Features
- ✅ Real-time victim registration and status tracking.
- ✅ Automated "Earthquake Alert" broadcast.
- ✅ Victim detection via Wi-Fi Signal Strength (RSSI) without internet.
- ✅ Live location tracking for rescue teams.

---

## 👤 Author
**Omer Oztop**
*Bitirme Projesi - 2026*
