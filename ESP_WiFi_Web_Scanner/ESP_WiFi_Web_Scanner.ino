/*
 *  🌐 UNIVERSAL ESP Wi-Fi RADAR / WEB SCANNER
 *  -----------------------------------------
 *  Supports: ESP32, ESP32-S3, ESP8266
 *  Features:
 *  - REST API for Node.js Integration (/data)
 *  - JSON API for Modern UI (/json)
 *  - Premium Web Dashboard (/)
 *  - Auto-Antenna Switching (ESP32-S3 compatible)
 */

#if defined(ESP8266)
  #include <ESP8266WiFi.h>
  #include <ESP8266WebServer.h>
  typedef ESP8266WebServer WebServerType;
#elif defined(ESP32)
  #include <WiFi.h>
  #include <WebServer.h>
  typedef WebServer WebServerType;
#else
  #error "Bu kart desteklenmiyor. Lütfen ESP32 veya ESP8266 seçin."
#endif

// ⌨️ Ayarlar
const char* ssid_ap = "ESP_Radar_System";
const char* password_ap = "12345678";

WebServerType server(80);
String latestDataCSV = "";
String latestDataJSON = "[]";

// 🔐 Şifreleme tipini metne çevirir
String getEncryptionType(uint8_t type) {
#if defined(ESP32)
  switch (type) {
    case WIFI_AUTH_OPEN: return "Açık";
    case WIFI_AUTH_WEP: return "WEP";
    case WIFI_AUTH_WPA_PSK: return "WPA";
    case WIFI_AUTH_WPA2_PSK: return "WPA2";
    case WIFI_AUTH_WPA_WPA2_PSK: return "WPA+WPA2";
    case WIFI_AUTH_WPA2_ENTERPRISE: return "WPA2-EAP";
    case WIFI_AUTH_WPA3_PSK: return "WPA3";
    case WIFI_AUTH_WPA2_WPA3_PSK: return "WPA2+WPA3";
    default: return "Bilinmiyor";
  }
#elif defined(ESP8266)
  switch (type) {
    case ENC_TYPE_NONE: return "Açık";
    case ENC_TYPE_WEP: return "WEP";
    case ENC_TYPE_TKIP: return "WPA";
    case ENC_TYPE_CCMP: return "WPA2";
    case ENC_TYPE_AUTO: return "Otomatik";
    default: return "Bilinmiyor";
  }
#endif
}

// 📡 Mevcut server.js ile uyumlu CSV Endpoint
void handleDataCSV() {
  server.send(200, "text/plain", latestDataCSV);
}

// 📊 Yeni Modern Arayüz için JSON Endpoint
void handleDataJSON() {
  server.send(200, "application/json", latestDataJSON);
}

// 🌐 Ana Web Sayfası (Modern Tasarım)
void handleRoot() {
  String page = R"rawliteral(
<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ESP Wi-Fi Radar</title>
    <style>
        :root {
            --primary: #4f46e5;
            --bg: #0f172a;
            --card: #1e293b;
            --text: #f8fafc;
        }
        body {
            font-family: 'Segoe UI', system-ui, sans-serif;
            background-color: var(--bg);
            color: var(--text);
            margin: 0;
            padding: 20px;
            display: flex;
            flex-direction: column;
            align-items: center;
        }
        .container {
            width: 100%;
            max-width: 800px;
        }
        header {
            text-align: center;
            margin-bottom: 30px;
            background: linear-gradient(135deg, #6366f1, #4f46e5);
            padding: 20px;
            border-radius: 16px;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
        }
        header h1 { margin: 0; font-size: 1.8rem; }
        header p { margin: 5px 0 0; opacity: 0.8; font-size: 0.9rem; }
        
        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 15px;
            margin-bottom: 20px;
        }
        .stat-card {
            background: var(--card);
            padding: 15px;
            border-radius: 12px;
            text-align: center;
            border: 1px solid rgba(255,255,255,0.05);
        }
        .stat-val { font-size: 1.5rem; font-weight: bold; color: #818cf8; }
        .stat-label { font-size: 0.8rem; opacity: 0.6; }

        .radar-table {
            width: 100%;
            background: var(--card);
            border-radius: 16px;
            overflow: hidden;
            border-collapse: collapse;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        }
        .radar-table th {
            background: rgba(255,255,255,0.05);
            padding: 15px;
            text-align: left;
            font-size: 0.85rem;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            opacity: 0.7;
        }
        .radar-table td {
            padding: 15px;
            border-top: 1px solid rgba(255,255,255,0.05);
            font-size: 0.95rem;
        }
        .radar-table tr:hover { background: rgba(255,255,255,0.02); }
        
        .rssi-badge {
            padding: 4px 8px;
            border-radius: 6px;
            font-weight: bold;
            font-size: 0.85rem;
        }
        .rssi-strong { background: #059669; color: white; }
        .rssi-medium { background: #d97706; color: white; }
        .rssi-weak { background: #dc2626; color: white; }

        .loader {
            width: 20px;
            height: 20px;
            border: 3px solid rgba(255,255,255,.3);
            border-radius: 50%;
            border-top-color: #fff;
            animation: spin 1s ease-in-out infinite;
            display: inline-block;
            vertical-align: middle;
            margin-right: 10px;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
    </style>
</head>
<body>

<div class="container">
    <header>
        <h1>📡 QuakeRadar: Canlı Tespit Sistemi</h1>
        <p>Wi-Fi Sinyal Analiz Sistemi</p>
    </header>

    <div class="stats">
        <div class="stat-card">
            <div class="stat-val" id="count">0</div>
            <div class="stat-label">Bulunan Cihaz</div>
        </div>
        <div class="stat-card">
            <div class="stat-val" id="best-rssi">-</div>
            <div class="stat-label">En Güçlü Sinyal</div>
        </div>
    </div>

    <table class="radar-table">
        <thead>
            <tr>
                <th>SSID (Cihaz İsmi)</th>
                <th>Sinyal (RSSI)</th>
                <th>Kanal</th>
                <th>Güvenlik</th>
            </tr>
        </thead>
        <tbody id="radar-body">
            <tr><td colspan="4" style="text-align:center; padding:40px;">Veri bekleniyor...</td></tr>
        </tbody>
    </table>
    
    <p style="text-align: center; font-size: 0.8rem; opacity: 0.4; margin-top: 20px;">
        <span class="loader"></span> Canlı İzleme Aktif
    </p>
</div>

<script>
    function getRssiClass(rssi) {
        if (rssi >= -60) return 'rssi-strong';
        if (rssi >= -80) return 'rssi-medium';
        return 'rssi-weak';
    }

    async function updateData() {
        try {
            const res = await fetch('/json');
            const data = await res.json();
            
            const body = document.getElementById('radar-body');
            body.innerHTML = '';
            
            let strongest = -120;
            
            if (data.length === 0) {
                body.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:40px;">Yakınlarda Wi-Fi sinyali bulunamadı.</td></tr>';
            } else {
                data.forEach(net => {
                    if (net.rssi > strongest) strongest = net.rssi;
                    
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td style="font-weight:600;">${net.ssid || '<Gizli Ağ>'}</td>
                        <td><span class="rssi-badge ${getRssiClass(net.rssi)}">${net.rssi} dBm</span></td>
                        <td>${net.ch}</td>
                        <td style="opacity:0.7; font-size:0.8rem;">${net.enc}</td>
                    `;
                    body.appendChild(row);
                });
            }
            
            document.getElementById('count').textContent = data.length;
            document.getElementById('best-rssi').textContent = data.length > 0 ? strongest + ' dBm' : '-';
            
        } catch (e) {
            console.error("Veri güncelleme hatası:", e);
        }
    }

    setInterval(updateData, 2000);
    updateData();
</script>

</body>
</html>
  )rawliteral";

  server.send(200, "text/html", page);
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n--- RADAR SİSTEMİ BAŞLATILIYOR ---");

  // 🔌 Anten ve Güç Ayarları (ESP32-S3 Özel)
#if defined(ESP32)
  pinMode(3, OUTPUT);    // RF switch power on
  digitalWrite(3, LOW);
  pinMode(14, OUTPUT);   // select external antenna
  digitalWrite(14, HIGH);
#endif

  // 📡 Access Point Kurulumu
  WiFi.softAP(ssid_ap, password_ap);
  Serial.print("Access Point Başlatıldı: ");
  Serial.println(ssid_ap);
  Serial.print("IP Adresi: ");
  Serial.println(WiFi.softAPIP());

  // 🛣️ Rotalar
  server.on("/", handleRoot);
  server.on("/data", handleDataCSV);
  server.on("/json", handleDataJSON);

  server.begin();
  Serial.println("Web Sunucu Hazır.");
}

unsigned long lastScanTime = 0;
bool scanInProgress = false;

void loop() {
  // 🖥️ Web istemcilerini yönet (HER ZAMAN ÇALIŞMALI)
  server.handleClient();

  // 🔍 Tarama yönetimi
  if (!scanInProgress) {
    // Her 5 saniyede bir yeni tarama başlat
    if (millis() - lastScanTime > 5000 || lastScanTime == 0) {
      Serial.println("Arka plan taraması başlatıldı...");
      WiFi.scanNetworks(true); // 'true' = Asenkron tarama başlat
      scanInProgress = true;
    }
  } else {
    // Tarama bitti mi kontrol et
    int n = WiFi.scanComplete();
    
    if (n >= 0) {
      Serial.print("Tarama bitti, ");
      Serial.print(n);
      Serial.println(" ağ bulundu.");
      
      latestDataCSV = "";
      latestDataJSON = "[";
      
      for (int i = 0; i < n; i++) {
        String ssid = WiFi.SSID(i);
        int32_t rssi = WiFi.RSSI(i);
        uint8_t ch = WiFi.channel(i);
        String enc = getEncryptionType(WiFi.encryptionType(i));

        // CSV Güncelle
        latestDataCSV += String(millis()) + "," + ssid + "," + String(rssi) + "\n";
        
      // JSON Güncelle
        latestDataJSON += "{\"ssid\":\"" + ssid + "\",\"rssi\":" + String(rssi) + 
                          ",\"ch\":" + String(ch) + ",\"enc\":\"" + enc + "\"}";
        if (i < n - 1) latestDataJSON += ",";

        // 🔌 KABLO (SERIAL) ÇIKIŞI EKLE
        // Format: [SCAN]ssid,rssi
        Serial.print("[SCAN]");
        Serial.print(ssid);
        Serial.print(",");
        Serial.println(rssi);
      }
      latestDataJSON += "]";
      
      // Sonuçları temizle
      WiFi.scanDelete();
      lastScanTime = millis();
      scanInProgress = false;
      Serial.println("[DONE] Tarama tamamlandı.");
    } else if (n == -2) {
      // Tarama henüz bitmedi, hiçbir şey yapma (server.handleClient çalışmaya devam eder)
    }
  }
}
