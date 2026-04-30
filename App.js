import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';

const SERVER_URL = 'quakeradar.onrender.com';

// ─────────────────────────────────────────────────────────────────────────────

// Ekran sabitleri
const SCREEN = {
  REGISTER: 'REGISTER',
  NORMAL: 'NORMAL',
  EARTHQUAKE: 'EARTHQUAKE',
  SAFE: 'SAFE',
  TRAPPED: 'TRAPPED',
};

export default function App() {
  const [screen, setScreen] = useState(SCREEN.REGISTER);
  const [connected, setConnected] = useState(false);
  const [coords, setCoords] = useState(null);
  const [locLoading, setLocLoading] = useState(false);
  const [isDroneActive, setIsDroneActive] = useState(false);

  // Kayıt formu
  const [form, setForm] = useState({
    name: '',
    bloodType: '',
    hotspotName: '', // Yeni: Radar için Hotspot adı
    emergency1: '',
    emergency2: '',
    homeLocation: '',
  });

  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);
  const userDataRef = useRef(null);
  const locationWatcher = useRef(null); // Canlı konum takibi

  // ── WebSocket bağlantısı ────────────────────────────────────────────────────
  useEffect(() => {
    const connect = () => {
      const ws = new WebSocket(`wss://${SERVER_URL}`);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        // Kayıtlı kullanıcı varsa yeniden gönder
        if (userDataRef.current) {
          ws.send(JSON.stringify({ type: 'REGISTER', payload: userDataRef.current }));
        }
      };

      ws.onmessage = ({ data }) => {
        const msg = JSON.parse(data);
        if (msg.type === 'EARTHQUAKE_ALERT') handleEarthquakeAlert();
        if (msg.type === 'RESET') {
          setScreen(SCREEN.NORMAL);
          setIsDroneActive(false);
        }
        if (msg.type === 'LOCATION_REQUEST') sendFreshLocation(ws);
        
        // Yeni: Drone ve Hedef Bildirimleri
        if (msg.type === 'DRONE_STATUS') {
          setIsDroneActive(msg.payload === 'CONNECTED');
        }
        if (msg.type === 'TARGET_FOUND') {
          Alert.alert(
            "🎯 Hedef Tespit Edildi!",
            `${msg.payload.name} isimli kullanıcı drone kapsama alanına girdi.\n(Sinyal: ${msg.payload.rssi} dBm)`,
            [{ text: "Tamam" }]
          );
        }
      };

      ws.onclose = () => {
        setConnected(false);
        reconnectTimer.current = setTimeout(connect, 3000);
      };

      ws.onerror = () => ws.close();
    };

    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, []);

  // ── Deprem uyarısı: canlı konum takibi başlat, ilk konumu hemen gönder ──────
  const handleEarthquakeAlert = async () => {
    setScreen(SCREEN.EARTHQUAKE);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      // İlk konumu hemen al ve sunucuya gönder
      const first = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setCoords(first.coords);
      wsRef.current?.send(JSON.stringify({
        type: 'LOCATION_UPDATE',
        payload: { latitude: first.coords.latitude, longitude: first.coords.longitude },
      }));

      // Canlı takip başlat — konum değiştikçe ekran güncellenir
      locationWatcher.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 5 },
        (loc) => setCoords(loc.coords)
      );
    } catch (_) { }
  };

  // ── Ekran değişince canlı takibi durdur ───────────────────────────────────
  useEffect(() => {
    if (screen !== SCREEN.EARTHQUAKE) {
      locationWatcher.current?.remove();
      locationWatcher.current = null;
    }
  }, [screen]);

  // ── Sunucu konum isteyince güncel konum gönder ─────────────────────────────
  const sendFreshLocation = async (ws) => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        ws.send(JSON.stringify({ type: 'LOCATION_UPDATE', payload: null }));
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setCoords(loc.coords); // Ekranı da güncelle
      ws.send(JSON.stringify({
        type: 'LOCATION_UPDATE',
        payload: { latitude: loc.coords.latitude, longitude: loc.coords.longitude },
      }));
    } catch (_) {
      ws.send(JSON.stringify({ type: 'LOCATION_UPDATE', payload: null }));
    }
  };

  // ── Kayıt formu gönder ─────────────────────────────────────────────────────
  const handleRegister = () => {
    if (!form.name || !form.bloodType || !form.emergency1 || !form.homeLocation) {
      Alert.alert('Eksik Bilgi', 'Lütfen tüm zorunlu alanları doldurun.');
      return;
    }
    // Hotspot ismi boşsa Gerçek İsminden türet
    const finalForm = {
      ...form,
      hotspotName: form.hotspotName || form.name.replace(/\s+/g, '_')
    };
    userDataRef.current = finalForm;
    // WebSocket açıksa hemen gönder, değilse onopen'da zaten gönderiliyor
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'REGISTER', payload: finalForm }));
    }
    setScreen(SCREEN.NORMAL);
  };

  // ── Ev konumunu otomatik al ────────────────────────────────────────────────
  const getHomeLocation = async () => {
    setLocLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('İzin Gerekli', 'Konum izni verilmedi.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({});
      const locStr = `${loc.coords.latitude.toFixed(5)}, ${loc.coords.longitude.toFixed(5)}`;
      setForm((f) => ({ ...f, homeLocation: locStr }));
    } catch (_) {
      Alert.alert('Hata', 'Konum alınamadı.');
    } finally {
      setLocLoading(false);
    }
  };

  // ── Durum bildir ───────────────────────────────────────────────────────────
  const reportStatus = async (status) => {
    if (status === 'TRAPPED') {
      // Enkazda: butona basıldığı ANdaki en güncel konumu al
      let latestCoords = coords;
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        latestCoords = loc.coords;
        setCoords(loc.coords);
      } catch (_) { }
      wsRef.current?.send(JSON.stringify({
        type: 'STATUS',
        payload: {
          status: 'TRAPPED',
          coords: latestCoords
            ? { latitude: latestCoords.latitude, longitude: latestCoords.longitude }
            : null,
        },
      }));
      setScreen(SCREEN.TRAPPED);
    } else {
      // Güvende: mevcut koordinatla gönder
      wsRef.current?.send(JSON.stringify({
        type: 'STATUS',
        payload: {
          status: 'SAFE',
          coords: coords
            ? { latitude: coords.latitude, longitude: coords.longitude }
            : null,
        },
      }));
      setScreen(SCREEN.SAFE);
    }
  };

  // ── EKRANLAR ───────────────────────────────────────────────────────────────

  if (screen === SCREEN.REGISTER) {
    return (
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.registerContainer}>
          <Text style={styles.logo}>🛡️</Text>
          <Text style={styles.title}>QuakeRadar</Text>
          <Text style={styles.subtitle}>Deprem öncesinde bilgilerinizi kaydedin</Text>

          <Field
            label="Ad Soyad *"
            placeholder="Örn: Mahmut Yılmaz"
            value={form.name}
            onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
          />
          <Field
            label="Kan Grubu *"
            placeholder="Örn: A Rh+"
            value={form.bloodType}
            onChangeText={(v) => setForm((f) => ({ ...f, bloodType: v }))}
          />
          <Field
            label="Acil Durum Kişisi 1 *"
            placeholder="İsim ve telefon"
            value={form.emergency1}
            onChangeText={(v) => setForm((f) => ({ ...f, emergency1: v }))}
          />
          <Field
            label="📡 Kişisel Erişim Noktası (Hotspot) Adı"
            placeholder="Radar için isim (Örn: Omer_Radar)"
            value={form.hotspotName}
            onChangeText={(v) => setForm((f) => ({ ...f, hotspotName: v }))}
          />
          <Field
            label="Acil Durum Kişisi 2"
            placeholder="İsim ve telefon (opsiyonel)"
            value={form.emergency2}
            onChangeText={(v) => setForm((f) => ({ ...f, emergency2: v }))}
          />

          <Text style={styles.label}>Ev Konumu *</Text>
          <View style={styles.locationRow}>
            <TextInput
              style={[styles.input, styles.locationInput]}
              placeholder="Koordinat veya adres"
              value={form.homeLocation}
              onChangeText={(v) => setForm((f) => ({ ...f, homeLocation: v }))}
            />
            <TouchableOpacity style={styles.locBtn} onPress={getHomeLocation} disabled={locLoading}>
              {locLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.locBtnText}>📍</Text>
              )}
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.primaryBtn} onPress={handleRegister}>
            <Text style={styles.primaryBtnText}>Kaydet ve Devam Et</Text>
          </TouchableOpacity>
        </ScrollView>
        <StatusBar style="dark" />
      </KeyboardAvoidingView>
    );
  }

  if (screen === SCREEN.NORMAL) {
    return (
      <View style={[styles.center, { backgroundColor: '#f0f4ff' }]}>
        <Text style={{ fontSize: 60 }}>🟢</Text>
        <Text style={styles.title}>Sistem Aktif</Text>
        <Text style={styles.subtitle}>Deprem uyarısı bekleniyor...</Text>
        <View style={styles.infoCard}>
          <Text style={styles.infoRow}>👤 {form.name}</Text>
          <Text style={styles.infoRow}>🩸 {form.bloodType}</Text>
          <Text style={styles.infoRow}>📞 {form.emergency1}</Text>
          <Text style={styles.infoRow}>🏠 {form.homeLocation}</Text>
        </View>
        <Text style={[styles.connBadge, { color: connected ? '#2ecc71' : '#e74c3c', textAlign: 'center' }]}>
          {connected ? '🟢 Sunucuya bağlı' : '🔴 Sunucu bekleniyor...'}
        </Text>
        {isDroneActive && (
          <View style={{ marginTop: 10, backgroundColor: '#eef2ff', padding: 8, borderRadius: 8, borderWidth: 1, borderColor: '#cad4ff' }}>
            <Text style={{ color: '#4f46e5', fontWeight: 'bold', fontSize: 12 }}>🚀 Drone Aktif & Tarama Yapıyor</Text>
          </View>
        )}
        <StatusBar style="dark" />
      </View>
    );
  }

  if (screen === SCREEN.EARTHQUAKE) {
    const lat = coords?.latitude?.toFixed(6);
    const lon = coords?.longitude?.toFixed(6);
    return (
      <View style={[styles.center, { backgroundColor: '#1a0000' }]}>
        <Text style={{ fontSize: 70 }}>🚨</Text>
        <Text style={[styles.title, { color: '#ff4444', fontSize: 30 }]}>DEPREM!</Text>
        <Text style={[styles.subtitle, { color: '#ff9999' }]}>
          Güvenli konuma geçin!
        </Text>

        {coords ? (
          <View style={[styles.infoCard, { backgroundColor: '#2d0000', borderColor: '#ff4444' }]}>
            <Text style={{ color: '#ff9999', fontSize: 12, marginBottom: 4 }}>📍 Anlık Konumunuz</Text>
            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 15 }}>
              {lat}, {lon}
            </Text>
          </View>
        ) : (
          <View style={[styles.infoCard, { backgroundColor: '#2d0000' }]}>
            <ActivityIndicator color="#ff4444" />
            <Text style={{ color: '#ff9999', marginTop: 8 }}>Konum alınıyor...</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.statusBtn, { backgroundColor: '#2ecc71' }]}
          onPress={() => reportStatus('SAFE')}
        >
          <Text style={styles.statusBtnText}>✅ Güvendeyim</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.statusBtn, { backgroundColor: '#e74c3c', marginTop: 12 }]}
          onPress={() => reportStatus('TRAPPED')}
        >
          <Text style={styles.statusBtnText}>🆘 Enkazda</Text>
        </TouchableOpacity>
        <StatusBar style="light" />
      </View>
    );
  }

  if (screen === SCREEN.SAFE) {
    return (
      <View style={[styles.center, { backgroundColor: '#0d2b0d' }]}>
        <Text style={{ fontSize: 80 }}>✅</Text>
        <Text style={[styles.title, { color: '#2ecc71' }]}>Güvendesiniz</Text>
        <Text style={[styles.subtitle, { color: '#a8e6a8' }]}>
          Güvenli bir konumda bekleyin.{'\n'}Yetkililer sizinle iletişime geçecektir.
        </Text>
        <StatusBar style="light" />
      </View>
    );
  }

  if (screen === SCREEN.TRAPPED) {
    return (
      <View style={[styles.center, { backgroundColor: '#1a0a00' }]}>
        <Text style={{ fontSize: 80 }}>🆘</Text>
        <Text style={[styles.title, { color: '#e74c3c' }]}>Yardım Yolda!</Text>
        <Text style={[styles.subtitle, { color: '#ffaa88' }]}>
          Ekiplere durumunuzla alakalı{'\n'}mesaj gönderildi.
        </Text>

        <View style={{ backgroundColor: '#ffcccc', padding: 15, borderRadius: 10, marginTop: 10 }}>
          <Text style={{ color: '#900', fontWeight: 'bold', textAlign: 'center' }}>
            ⚠️ İNTERNET YOKSA/ÇEKMİYORSA:
          </Text>
          <Text style={{ color: '#900', textAlign: 'center', marginTop: 5, fontSize: 13 }}>
            Arama kurtarma cihazlarının (radar) sizi bulabilmesi için cihazınızın "Kişisel Erişim Noktası"nı (Wi-Fi Hotspot) açın!{'\n'}
            İsmini: <Text style={{ fontWeight: 'bold' }}>{form.hotspotName || form.name}</Text> yapın.
          </Text>
        </View>

        {coords && (
          <View style={[styles.infoCard, { backgroundColor: '#2d0000', borderColor: '#e74c3c' }]}>
            <Text style={{ color: '#ffaa88', fontSize: 12 }}>📍 İletilen Konumunuz</Text>
            <Text style={{ color: '#fff', fontWeight: 'bold', marginTop: 4 }}>
              {coords.latitude.toFixed(6)}, {coords.longitude.toFixed(6)}
            </Text>
          </View>
        )}
        <Text style={{ color: '#ff8866', marginTop: 20, fontSize: 13 }}>
          Hareket etmeyin, sesli sinyal verin.
        </Text>
        <StatusBar style="light" />
      </View>
    );
  }

  return null;
}

// ── Yardımcı bileşenler ────────────────────────────────────────────────────
function Field({ label, placeholder, value, onChangeText }) {
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        value={value}
        onChangeText={onChangeText}
        placeholderTextColor="#aaa"
      />
    </>
  );
}

// ── Stiller ────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  flex: { flex: 1 },

  registerContainer: {
    padding: 24,
    paddingTop: 60,
    backgroundColor: '#f8f9ff',
    flexGrow: 1,
  },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },

  logo: { fontSize: 50, textAlign: 'center', marginBottom: 8 },

  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#111',
    textAlign: 'center',
    marginBottom: 6,
  },

  subtitle: {
    fontSize: 15,
    color: '#555',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },

  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    marginBottom: 6,
    marginTop: 14,
  },

  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dde',
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: '#111',
  },

  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  locationInput: { flex: 1 },

  locBtn: {
    backgroundColor: '#3355ff',
    borderRadius: 12,
    width: 50,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },

  locBtnText: { fontSize: 22 },

  primaryBtn: {
    backgroundColor: '#3355ff',
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
    marginTop: 30,
    shadowColor: '#3355ff',
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },

  primaryBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },

  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    width: '100%',
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#e0e4ff',
    gap: 8,
  },

  infoRow: {
    fontSize: 14,
    color: '#333',
    paddingVertical: 2,
  },

  connBadge: {
    marginTop: 20,
    fontSize: 13,
    fontWeight: '600',
  },

  statusBtn: {
    width: '90%',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginTop: 24,
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },

  statusBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
});
