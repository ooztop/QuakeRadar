const express = require('express');
const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const path = require('path');
const readline = require('readline');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 8765;
const ADMIN_SECRET = 'QUAKE_SECRET_2024';

// Veri yapıları
const users = new Map(); 
const allUsersByName = new Map();
const alertedUsers = new Set(); 
const admins = new Set(); 
let isRadarActive = false; // Radar durum takibi

app.use(express.static('public'));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public/admin.html')));

function logToAdmin(text, level = 'info') {
    console.log(`[${level.toUpperCase()}] ${text}`);
    const msg = JSON.stringify({ type: 'LOG', payload: { text, level } });
    admins.forEach(admin => {
        if (admin.readyState === WebSocket.OPEN) admin.send(msg);
    });
}

function updateAdminUserList() {
    const userList = Array.from(users.values());
    const msg = JSON.stringify({ type: 'UPDATE_USERS', payload: userList });
    admins.forEach(admin => {
        if (admin.readyState === WebSocket.OPEN) admin.send(msg);
    });
}

function updateRadarStatus(status) {
    isRadarActive = status;
    const msg = JSON.stringify({ type: 'RADAR_STATUS', payload: isRadarActive });
    admins.forEach(admin => {
        if (admin.readyState === WebSocket.OPEN) admin.send(msg);
    });
}

function broadcast(msg) {
    const data = JSON.stringify(msg);
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN && !admins.has(client)) {
            client.send(data);
        }
    });
}

wss.on('connection', (ws) => {
    const connectionId = Math.random().toString(36).substr(2, 9);
    let currentRole = 'CLIENT';

    ws.on('message', (data) => {
        try {
            const msg = JSON.parse(data);

            if (msg.type === 'ADMIN_AUTH') {
                if (msg.payload.secret === ADMIN_SECRET) {
                    admins.add(ws);
                    currentRole = 'ADMIN';
                    logToAdmin('Yönetici paneli yetkilendirildi.', 'success');
                    updateAdminUserList();
                    ws.send(JSON.stringify({ type: 'RADAR_STATUS', payload: isRadarActive }));
                }
                return;
            }

            if (msg.type === 'RADAR_CONNECTED') {
                currentRole = 'RADAR';
                updateRadarStatus(true);
                logToAdmin('🚀 Drone Radar Sistemi Bağlandı!', 'success');
                return;
            }

            if (msg.type === 'ADMIN_COMMAND') {
                if (!admins.has(ws)) return;
                handleCommand(msg.payload);
                return;
            }

            if (msg.type === 'REGISTER') {
                const userData = { ...msg.payload, id: connectionId, status: 'SAFE', coords: null };
                users.set(ws, userData);
                const searchKey = (userData.hotspotName || userData.name).toLowerCase();
                allUsersByName.set(searchKey, userData);
                logToAdmin(`Yeni Cihaz: ${userData.name}`, 'success');
                updateAdminUserList();
            }

            if (msg.type === 'STATUS') {
                const user = users.get(ws);
                if (user) {
                    user.status = msg.payload.status;
                    user.coords = msg.payload.coords;
                    updateAdminUserList();
                }
            }

            if (msg.type === 'LOCATION_UPDATE') {
                const user = users.get(ws);
                if (user && msg.payload) {
                    user.coords = { latitude: msg.payload.latitude, longitude: msg.payload.longitude };
                    updateAdminUserList();
                }
            }

            if (msg.type === 'RADAR_SCAN') {
                const { ssid, rssi } = msg.payload;
                const ssidLower = ssid.toLowerCase();
                for (let [key, user] of allUsersByName) {
                    if (ssidLower.includes(key) || key.includes(ssidLower)) {
                        if (!alertedUsers.has(key)) {
                            logToAdmin(`🚨 RADAR TESPİTİ: ${user.name} bulundu!`, 'alert');
                            broadcast({ type: 'TARGET_FOUND', payload: { name: user.name, ssid: ssid, rssi: rssi } });
                            alertedUsers.add(key);
                        }
                        break;
                    }
                }
            }

        } catch (e) {
            console.error('Mesaj hatası:', e.message);
        }
    });

    ws.on('close', () => {
        if (currentRole === 'ADMIN') {
            admins.delete(ws);
        } else if (currentRole === 'RADAR') {
            updateRadarStatus(false);
            logToAdmin('⚠️ Radar Sistemi Bağlantısı Kesildi!', 'alert');
        } else {
            const user = users.get(ws);
            if (user) {
                logToAdmin(`${user.name} ayrıldı.`, 'system');
                users.delete(ws);
                updateAdminUserList();
            }
        }
    });
});

function handleCommand(cmd) {
    if (cmd === 'deprem') {
        broadcast({ type: 'EARTHQUAKE_ALERT' });
    } else if (cmd === 'konum') {
        broadcast({ type: 'LOCATION_REQUEST' });
    } else if (cmd === 'reset') {
        alertedUsers.clear();
        // Tüm kullanıcıları 'SAFE' durumuna döndür
        users.forEach(user => {
            user.status = 'SAFE';
        });
        broadcast({ type: 'RESET' });
        updateAdminUserList();
        logToAdmin('🔄 Sistem sıfırlandı. Tüm kullanıcılar güvenli moda çekildi.', 'system');
    }
}

server.listen(PORT, () => {
    console.log(`🚀 Sunucu aktif: Port ${PORT}`);
});
