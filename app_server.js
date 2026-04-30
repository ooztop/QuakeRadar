const { WebSocketServer, WebSocket } = require('ws');
const readline = require('readline');

const PORT = 8765;

// Veri yapıları
const trappedUsers = new Set();
const users = new Map(); // ws -> { name, bloodType, hotspotName, ... }
const allUsersByName = new Map(); // hotspotName -> userData
const alertedUsers = new Set(); // Tek seferlik uyarı takibi

const wss = new WebSocketServer({ port: PORT });

console.log('\n🚨 QUAKERADAR - ACİL DURUM SİSTEMİ');
console.log('=====================================');
console.log(`✅ WebSocket sunucu hazır → ws://localhost:${PORT}`);
console.log('\nKomutlar:');
console.log('  deprem     → Deprem uyarısı gönder');
console.log('  konum      → Enkazda olanlardan güncel konum iste');
console.log('  liste      → Bağlı kullanıcıları listele');
console.log('  reset      → Sistemi sıfırla (normal moda dön)');
console.log('=====================================\n');

wss.on('connection', (ws) => {
    console.log('📱 Yeni cihaz bağlandı.');

    ws.on('message', (data) => {
        try {
            const msg = JSON.parse(data);

            // 1. KULLANICI KAYDI
            if (msg.type === 'REGISTER') {
                const userData = msg.payload;
                users.set(ws, userData);
                
                // Hotspot bears search key
                const searchKey = (userData.hotspotName || userData.name).toLowerCase();
                allUsersByName.set(searchKey, userData);

                console.log(`\n👤 Kayıt: ${userData.name} | Kan: ${userData.bloodType}`);
                console.log(`   📡 Hotspot Adı: ${userData.hotspotName || 'Varsayılan'}`);
                console.log(`   Acil 1: ${userData.emergency1} | Acil 2: ${userData.emergency2}`);
                console.log(`   Ev: ${userData.homeLocation}`);
            }

            // 2. DURUM BİLDİRİMİ
            if (msg.type === 'STATUS') {
                const user = users.get(ws) || {};
                const statusEmoji = msg.payload.status === 'SAFE' ? '✅' : '🆘';
                const statusText = msg.payload.status === 'SAFE' ? 'GÜVENDE' : 'ENKAZDA';
                console.log(`\n${statusEmoji} DURUM | ${user.name || 'Bilinmeyen'} → ${statusText}`);
                
                if (msg.payload.coords) {
                    console.log(`   📍 Konum: ${msg.payload.coords.latitude}, ${msg.payload.coords.longitude}`);
                }

                if (msg.payload.status === 'TRAPPED') {
                    trappedUsers.add(ws);
                    console.log(`   🚑 KURTARMA EKİBİ GÖNDERİLİYOR!`);
                    console.log(`   👥 Acil Kişiler: ${user.emergency1}, ${user.emergency2}`);
                } else {
                    trappedUsers.delete(ws);
                }
            }

            // 3. RADAR SUNUCUSUNDAN GELEN VERİ (DRONE)
            if (msg.type === 'RADAR_CONNECTED') {
                console.log('\n🚀 [DRONE] Radar sistemi bağlandı ve hazır!');
                // Uygulamadaki tüm kullanıcılara 'drone bağlandı' bilgisi gitmesine gerek kalmadığı için kapatıldı
                // broadcast({ type: 'DRONE_STATUS', payload: 'CONNECTED' });
            }

            if (msg.type === 'RADAR_SCAN') {
                const { ssid, rssi } = msg.payload;
                const ssidLower = ssid.toLowerCase();
                
                // Radar sistemi için tüm wifileri terminale yazma (sadece eşleşmeleri göster)
                // console.log(`📡 [RADAR LOG] SSID: ${ssid} | RSSI: ${rssi} dBm`);

                // EŞLEŞME KONTROLÜ
                for (let [key, user] of allUsersByName) {
                    if (ssidLower.includes(key) || key.includes(ssidLower)) {
                        if (!alertedUsers.has(key)) {
                            console.log('\n************************************************');
                            console.log(`🚨 [RADAR] HEDEF TESPİT EDİLDİ!`);
                            console.log(`👤 Kişinin Adı: ${user.name}`);
                            console.log(`📡 Bulunan SSID: ${ssid} (Güç: ${rssi} dBm)`);
                            console.log(`📞 Acil İletişim: ${user.emergency1}`);
                            console.log('************************************************\n');
                            
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

            // 4. KONUM GÜNCELLEMESİ
            if (msg.type === 'LOCATION_UPDATE') {
                const user = users.get(ws) || {};
                console.log(`\n📡 ANLİK KONUM GELDİ`);
                console.log('─────────────────────────────────────');
                console.log(`  👤 ${user.name || 'Bilinmeyen'} | 🩸 ${user.bloodType || '-'}`);
                if (user.emergency1) console.log(`  📞 Acil 1: ${user.emergency1}`);
                if (user.homeLocation) console.log(`  🏠 Ev: ${user.homeLocation}`);
                if (msg.payload && msg.payload.latitude) {
                    console.log(`  📍 Şu anki konum: ${msg.payload.latitude}, ${msg.payload.longitude}`);
                } else {
                    console.log('  ⚠️  Konum alınamadı.');
                }
                console.log('─────────────────────────────────────');
            }

        } catch (e) {
            console.error('Mesaj işleme hatası:', e.message);
        }
    });

    ws.on('close', () => {
        const user = users.get(ws);
        console.log(`📱 Bağlantı kesildi${user ? ': ' + user.name : ''}.`);
        users.delete(ws);
        trappedUsers.delete(ws);
    });
});

// Terminal Komutları
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.on('line', (input) => {
    const cmd = input.trim().toLowerCase();
    
    if (cmd === 'deprem') {
        const count = wss.clients.size;
        console.log(`\n🚨 DEPREM UYARISI GÖNDERİLİYOR → ${count} cihaz`);
        broadcast({ type: 'EARTHQUAKE_ALERT' });
        
        console.log('\n📋 EN SON KAYITLI KULLANICI BİLGİLERİ:');
        console.log('─────────────────────────────────────');
        if (users.size === 0) {
            console.log('  Kayıtlı kullanıcı yok.');
        } else {
            let i = 1;
            users.forEach((user) => {
                console.log(`  [${i++}] 👤 ${user.name} | 🩸 ${user.bloodType}`);
                console.log(`       📞 Acil 1: ${user.emergency1}`);
                console.log(`       🏠 Ev: ${user.homeLocation}`);
            });
        }
        console.log('─────────────────────────────────────');

    } else if (cmd === 'konum') {
        if (trappedUsers.size === 0) {
            console.log('⚠️  Enkazda bildiren kullanıcı yok.');
            return;
        }
        console.log(`\n📡 KONUM TALEBİ GÖNDERİLİYOR → ${trappedUsers.size} kişi`);
        trappedUsers.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ type: 'LOCATION_REQUEST' }));
            }
        });

    } else if (cmd === 'liste') {
        console.log(`\n📋 Bağlı cihaz sayısı: ${wss.clients.size}`);
        users.forEach((user) => {
            console.log(`  - ${user.name} | ${user.bloodType}`);
        });

    } else if (cmd === 'reset') {
        alertedUsers.clear();
        broadcast({ type: 'RESET' });
        console.log('\n🔄 Sistem sıfırlandı (Normal moda dönüldü).');
    } else if (cmd) {
        console.log('❓ Bilinmeyen komut. (deprem / konum / liste / reset)');
    }
});

function broadcast(msg) {
    const data = JSON.stringify(msg);
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) client.send(data);
    });
}
