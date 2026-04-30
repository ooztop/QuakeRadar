const express = require('express');
const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const path = require('path');
const readline = require('readline');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 8765;
const ADMIN_SECRET = 'QUAKE_SECRET_2024'; // Profesyonel panel için gizli anahtar

// Veri yapıları
const users = new Map(); // ws -> { name, bloodType, hotspotName, ... }
const allUsersByName = new Map(); // hotspotName -> userData
const alertedUsers = new Set(); 
const admins = new Set(); // Admin WebSocket bağlantıları

// Express Ayarları
app.use(express.static('public'));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public/admin.html')));

// Yardımcı Fonksiyonlar
function logToAdmin(text, level = 'info') {
    console.log(`[${level.toUpperCase()}] ${text}`);
    const msg = JSON.stringify({ type: 'LOG', payload: { text, level } });
    admins.forEach(admin => {
        if (admin.readyState === WebSocket.OPEN) admin.send(msg);
    });
}

function updateAdminUserList() {
    const userList = Array.from(users.values()).map(u => ({ name: u.name, bloodType: u.bloodType }));
    const msg = JSON.stringify({ type: 'UPDATE_USERS', payload: userList });
    admins.forEach(admin => {
        if (admin.readyState === WebSocket.OPEN) admin.send(msg);
    });
}

function broadcast(msg) {
    const data = JSON.stringify(msg);
    wss.clients.forEach((client) => {
        // Adminlere sistem mesajlarını gönderme (onlar LOG üzerinden alıyor)
        if (client.readyState === WebSocket.OPEN && !admins.has(client)) {
            client.send(data);
        }
    });
}

// WebSocket Mantığı
wss.on('connection', (ws) => {
    logToAdmin('Yeni bir bağlantı kuruldu.', 'system');

    ws.on('message', (data) => {
        try {
            const msg = JSON.parse(data);

            // --- ADMIN KONTROLLERİ ---
            if (msg.type === 'ADMIN_AUTH') {
                if (msg.payload.secret === ADMIN_SECRET) {
                    admins.add(ws);
                    logToAdmin('Yönetici paneli yetkilendirildi.', 'success');
                    updateAdminUserList();
                }
                return;
            }

            if (msg.type === 'ADMIN_COMMAND') {
                if (!admins.has(ws)) return;
                handleCommand(msg.payload);
                return;
            }

            // --- KULLANICI / ESP32 MANTİĞI ---
            if (msg.type === 'REGISTER') {
                const userData = msg.payload;
                users.set(ws, userData);
                const searchKey = (userData.hotspotName || userData.name).toLowerCase();
                allUsersByName.set(searchKey, userData);
                
                logToAdmin(`Kayıt Alındı: ${userData.name} (${userData.bloodType})`, 'success');
                updateAdminUserList();
            }

            if (msg.type === 'STATUS') {
                const user = users.get(ws) || { name: 'Bilinmeyen' };
                const isTrapped = msg.payload.status === 'TRAPPED';
                const statusText = isTrapped ? '🆘 ENKAZDA!' : '✅ GÜVENDE';
                
                logToAdmin(`${user.name} durumu: ${statusText}`, isTrapped ? 'alert' : 'success');
                
                if (msg.payload.coords) {
                    logToAdmin(`📍 Konum: ${msg.payload.coords.latitude}, ${msg.payload.coords.longitude}`, 'info');
                }
            }

            if (msg.type === 'RADAR_SCAN') {
                const { ssid, rssi } = msg.payload;
                const ssidLower = ssid.toLowerCase();
                
                for (let [key, user] of allUsersByName) {
                    if (ssidLower.includes(key) || key.includes(ssidLower)) {
                        if (!alertedUsers.has(key)) {
                            logToAdmin(`🚨 RADAR TESPİTİ: ${user.name} bulundu! (SSID: ${ssid}, Güç: ${rssi}dBm)`, 'alert');
                            broadcast({
                                type: 'TARGET_FOUND',
                                payload: { name: user.name, ssid: ssid, rssi: rssi }
                            });
                            alertedUsers.add(key);
                        }
                        break;
                    }
                }
            }

            if (msg.type === 'LOCATION_UPDATE') {
                const user = users.get(ws) || { name: 'Bilinmeyen' };
                logToAdmin(`📡 ${user.name} için anlık konum güncellendi.`, 'info');
            }

        } catch (e) {
            console.error('Mesaj hatası:', e.message);
        }
    });

    ws.on('close', () => {
        if (admins.has(ws)) {
            admins.delete(ws);
            console.log('Yönetici paneli ayrıldı.');
        } else {
            const user = users.get(ws);
            if (user) {
                logToAdmin(`${user.name} bağlantısı kesildi.`, 'system');
                users.delete(ws);
                updateAdminUserList();
            }
        }
    });
});

// Komut İşleme Merkezi
function handleCommand(cmd) {
    if (cmd === 'deprem') {
        logToAdmin('🚨 DEPREM UYARISI TÜM CİHAZLARA GÖNDERİLİYOR!', 'alert');
        broadcast({ type: 'EARTHQUAKE_ALERT' });
    } else if (cmd === 'konum') {
        logToAdmin('📍 Tüm kullanıcılardan konum talebi yapılıyor...', 'info');
        broadcast({ type: 'LOCATION_REQUEST' });
    } else if (cmd === 'reset') {
        alertedUsers.clear();
        broadcast({ type: 'RESET' });
        logToAdmin('🔄 Sistem sıfırlandı.', 'system');
    }
}

// Terminalden de kontrol edilebilsin (Yerel testler için)
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.on('line', (input) => handleCommand(input.trim().toLowerCase()));

server.listen(PORT, () => {
    console.log('\n🚨 QUAKERADAR PROFESSIONAL SERVER');
    console.log('=====================================');
    console.log(`🚀 Sunucu adresi: http://localhost:${PORT}`);
    console.log(`📱 Admin Paneli: http://localhost:${PORT}`);
    console.log('=====================================\n');
});
