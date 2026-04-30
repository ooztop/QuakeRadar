const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const { WebSocket } = require('ws');
const readline = require('readline');

// 🔌 AYARLAR
const APP_SERVER_URL = 'wss://quakeradar.onrender.com'; // Ana sunucu adresi (Render)
const SERIAL_BAUD = 115200;

let port;
let parser;
let ws;
let isDroneConnected = false;

let currentScan = [];
let lastScan = [];

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.on('line', (input) => {
    const cmd = input.trim().toLowerCase();
    if (cmd === 'log' || cmd === 'aglar' || cmd === '') {
        console.log('\n📋 --- SON TARANAN AĞLAR ---');
        if (lastScan.length === 0) {
            console.log('  Henüz tamamlanmış bir tarama verisi yok veya bomboş.');
        } else {
            lastScan.forEach((net, index) => {
                console.log(`  [${index+1}] SSID: ${net.ssid} | Sinyal: ${net.rssi} dBm`);
            });
            console.log(`  (Toplam: ${lastScan.length} ağ)`);
        }
        console.log('------------------------------\n');
    }
});

console.log('\n🚀 RADAR SİSTEMİ BAŞLATILIYOR (DRONE)');
console.log('=====================================');

// 1. WebSocket Sunucusuna Bağlan (App Server)
function connectToAppServer() {
    ws = new WebSocket(APP_SERVER_URL);

    ws.on('open', () => {
        console.log('✅ Ana sunucuya bağlandı (App Server)');
        ws.send(JSON.stringify({ type: 'RADAR_CONNECTED' }));
        isDroneConnected = true;
    });

    ws.on('close', () => {
        console.log('⚠️  Ana sunucu bağlantısı kapandı. Tekrar bağlanıyor...');
        isDroneConnected = false;
        setTimeout(connectToAppServer, 3000);
    });

    ws.on('error', (err) => {
        console.error('❌ WebSocket hatası:', err.message);
    });
}

// 2. USB / Serial Portu Bul ve Bağlan
async function setupSerial() {
    try {
        const ports = await SerialPort.list();
        console.log('🔍 Bağlı USB Cihazlar taranıyor...');
        
        const espPortInfo = ports.find(p => 
            p.path.includes('usbserial') || 
            p.path.includes('usbmodem') || 
            p.manufacturer?.includes('Silicon Labs') || 
            p.manufacturer?.includes('WCH')
        );

        if (espPortInfo) {
            console.log(`✅ ESP Cihazı Bulundu: ${espPortInfo.path}`);
            connectToSerial(espPortInfo.path);
        } else {
            console.log('⚠️  ESP cihazı otomatik bulunamadı. Tekrar taranıyor...');
            setTimeout(setupSerial, 5000);
        }
    } catch (err) {
        console.error('❌ Port listeleme hatası:', err.message);
    }
}

function connectToSerial(path) {
    port = new SerialPort({
        path: path,
        baudRate: SERIAL_BAUD,
        autoOpen: true
    });

    parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' }));

    port.on('open', () => {
        console.log(`📡 [SERIAL] ${path} bağlantısı açıldı. Veri bekleniyor...`);
    });

    parser.on('data', (data) => {
        // ESP tarafında [SCAN] önekiyle gönderdiğimiz veriyi ayıklıyoruz
        if (data.startsWith('[SCAN]')) {
            const content = data.replace('[SCAN]', '').trim();
            const parts = content.split(',');
            
            if (parts.length >= 2) {
                const ssid = parts[0] || '<Gizli Ağ>';
                const rssi = parseInt(parts[1]);

                currentScan.push({ ssid, rssi });

                // RADAR LOG (Artık her birini değil, sadece sistemi kirletmemek adına loglamıyoruz)
                // console.log(`📡 [SCAN LOG] SSID: ${ssid} | Sinyal: ${rssi} dBm`);

                // Ana sunucuya gönder
                if (isDroneConnected) {
                    ws.send(JSON.stringify({
                        type: 'RADAR_SCAN',
                        payload: { ssid, rssi }
                    }));
                }
            }
        } else if (data.startsWith('[DONE]')) {
            lastScan = [...currentScan];
            currentScan = [];
            console.log('✅ Tarama turu tamamlandı. (Ağları görmek için "log" yazın veya Enter\'a basın)');
        } else {
            if (data.trim()) console.log(`ℹ️ [ESP]: ${data}`);
        }
    });

    port.on('error', (err) => {
        console.error('❌ Serial Port Hatası:', err.message);
        setTimeout(setupSerial, 5000);
    });

    port.on('close', () => {
        console.log('🔌 Serial bağlantı kapandı.');
        setTimeout(setupSerial, 5000);
    });
}

// Başlat
connectToAppServer();
setupSerial();
