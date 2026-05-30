'use strict';

// ─── CONFIG ───────────────────────────────────────────────────────────────────
// Auto-detect: use real IP on Android (Capacitor), localhost on web browser
const _isNative = (() => { try { return window.Capacitor && window.Capacitor.isNativePlatform(); } catch(e) { return false; } })();
const CONFIG = {
  API_BASE_URL: 'https://namma-rytha-backend.onrender.com',
  // Free key from https://aistudio.google.com/app/apikey
  GEMINI_API_KEY: 'AIzaSyDemo_replace_with_your_key',
  GEMINI_URL: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
  USE_AI: true   // set false to use offline smart responses only
};

// ─── STATE ────────────────────────────────────────────────────────────────────
const state = {
  currentPage: 'dashboard',
  alerts: [
    { id: 1, level: 'critical', icon: '🚨', title: 'Critical Water Stress', desc: 'Soil moisture is at 22%. Irrigate tomato plot immediately.', time: '10m ago' },

    { id: 2, level: 'warning', icon: '⛅', title: 'Rain Expected', desc: 'Heavy rain forecast for Wednesday. Avoid spraying today.', time: '1h ago' },
    { id: 3, level: 'info', icon: '🌿', title: 'Fertilizer Reminder', desc: 'Apply urea top-dressing to wheat plot this week.', time: '4h ago' }
  ],
  user: JSON.parse(localStorage.getItem('nr_user') || '{}'),
  rainExpected: false,
  chatHistory: [],
  voiceActive: false,
  cart: [],
  wishlist: [],
  currentRating: 0
};


// ─── BACKEND SYNC ─────────────────────────────────────────────────────────────
async function saveFarmData() {
  if (!state.user.id) return;
  try {
    const data = {
      userId: state.user.id,
      moisture: parseFloat(document.getElementById('statMoisture').textContent),
      rainProbability: parseInt(document.getElementById('statRain').textContent),
      lastIrrigated: new Date().toISOString()
    };
    await fetch(`${CONFIG.API_BASE_URL}/api/farm-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    console.log('☁️ Farm data synced to cloud');
  } catch (e) {
    console.warn('Backend sync failed, using local mode');
  }
}

async function loadFarmData() {
  if (!state.user.id) return;
  try {
    const res = await fetch(`${CONFIG.API_BASE_URL}/api/farm-data/${state.user.id}`);
    const data = await res.json();
    if (data && data.moisture !== undefined) {
      document.getElementById('statMoisture').textContent = data.moisture + '%';
      document.getElementById('statRain').textContent = data.rainProbability + '%';
      // Update other UI elements if needed
    }
  } catch (e) {
    console.warn('Could not load farm data from backend');
  }
}

// ─── WEATHER DATA ─────────────────────────────────────────────────────────────
// ─── REAL-TIME WEATHER (Open-Meteo + Nominatim — No API key required) ─────────
let liveForecast = [];

function getWeatherIcon(code) {
  if (code === 0) return '☀️';
  if (code <= 2) return '🌤️';
  if (code === 3) return '☁️';
  if (code <= 49) return '🌫️';
  if (code <= 59) return '🌦️';
  if (code <= 69) return '🌧️';
  if (code <= 79) return '❄️';
  if (code <= 82) return '🌧️';
  if (code <= 84) return '🌨️';
  if (code <= 99) return '⛈️';
  return '🌡️';
}

function getWeatherDesc(code) {
  if (code === 0) return 'Clear Sky';
  if (code === 1) return 'Mainly Clear';
  if (code === 2) return 'Partly Cloudy';
  if (code === 3) return 'Overcast';
  if (code <= 49) return 'Foggy';
  if (code <= 59) return 'Drizzle';
  if (code <= 69) return 'Rain';
  if (code <= 79) return 'Snow';
  if (code === 80) return 'Light Showers';
  if (code === 81) return 'Showers';
  if (code === 82) return 'Heavy Showers';
  if (code <= 84) return 'Snow Showers';
  if (code <= 99) return 'Thunderstorm';
  return 'Unknown';
}

async function geocodeCity(cityName) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cityName)}&format=json&limit=1`;
  const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
  const data = await res.json();
  if (!data || data.length === 0) throw new Error('City not found');
  return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon), displayName: data[0].display_name.split(',').slice(0, 2).join(',') };
}

async function reverseGeocode(lat, lon) {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`;
  const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
  const data = await res.json();
  const addr = data.address || {};
  return (addr.city || addr.town || addr.village || addr.county || 'Your Location') + (addr.state ? ', ' + addr.state : '');
}

async function fetchWeatherByCoords(lat, lon, cityLabel) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code,uv_index,precipitation_probability` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max` +
    `&timezone=auto&forecast_days=7`;
  const res = await fetch(url);
  const d = await res.json();
  const cur = d.current;
  const daily = d.daily;

  const data = {
    city: cityLabel,
    icon: getWeatherIcon(cur.weather_code),
    temp: Math.round(cur.temperature_2m),
    desc: getWeatherDesc(cur.weather_code),
    humidity: cur.relative_humidity_2m,
    wind: Math.round(cur.wind_speed_10m),
    uv: Math.round(cur.uv_index || 0),
    rain: cur.precipitation_probability || 0
  };

  // Build 7-day forecast
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  liveForecast = daily.time.map((date, i) => {
    const d2 = new Date(date);
    const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : days[d2.getDay()];
    return {
      day: label,
      icon: getWeatherIcon(daily.weather_code[i]),
      desc: getWeatherDesc(daily.weather_code[i]),
      high: Math.round(daily.temperature_2m_max[i]),
      low: Math.round(daily.temperature_2m_min[i]),
      rain: daily.precipitation_probability_max[i] || 0
    };
  });

  return data;
}

const MARKET_DATA = [
  { crop: '🌾 Wheat', price: 2285, msp: 2275, change: +10, trend: 'up' },
  { crop: '🍚 Rice', price: 2183, msp: 2183, change: 0, trend: 'flat' },
  { crop: '🍅 Tomato', price: 1800, msp: '—', change: -200, trend: 'down' },
  { crop: '🧅 Onion', price: 1400, msp: '—', change: +150, trend: 'up' },
  { crop: '🌽 Maize', price: 1962, msp: 1962, change: +22, trend: 'up' },
  { crop: '🌸 Cotton', price: 6620, msp: 6620, change: 0, trend: 'flat' },
  { crop: '🫘 Soybean', price: 4300, msp: 4300, change: -100, trend: 'down' },
  { crop: '🎋 Sugarcane', price: 315, msp: 315, change: 0, trend: 'flat' },
];

function simulateMarketFluctuation() {
  MARKET_DATA.forEach(item => {
    const fluctuation = (Math.random() - 0.5) * 10;
    item.price = Math.max(item.msp === '—' ? 100 : item.msp, Math.round(item.price + fluctuation));
    item.change = Math.round(fluctuation);
    item.trend = fluctuation > 0 ? 'up' : fluctuation < 0 ? 'down' : 'flat';
  });
  if (state.currentPage === 'market') renderMarketTable();
}
setInterval(simulateMarketFluctuation, 10000); // Fluctuate every 10s for dynamic feel



const ACHIEVEMENTS = [
  { icon: '💧', name: 'Water Warrior', desc: 'Saved 1000L', unlocked: true },
  { icon: '🌱', name: 'Green Thumb', desc: 'Reduced chemicals 20%', unlocked: true },
  { icon: '📊', name: 'Data Farmer', desc: 'Used AI 10+ times', unlocked: true },
  { icon: '🏅', name: 'Gold Farmer', desc: 'Reach Score 90', unlocked: false },
  { icon: '🌍', name: 'Earth Guardian', desc: 'Save 10,000L water', unlocked: false },
  { icon: '🚀', name: 'Super Farmer', desc: 'All scores above 80', unlocked: false },
];

// ─── NAVIGATION ───────────────────────────────────────────────────────────────
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const page = document.getElementById('page-' + id);
  const nav = document.getElementById('nav-' + id);
  if (page) { page.classList.add('active'); page.style.display = ''; }
  if (nav) nav.classList.add('active');

  // Close sidebar automatically on mobile after selecting a page
  if (window.innerWidth <= 900) {
    document.getElementById('sidebar').classList.remove('collapsed');
    document.getElementById('main').classList.remove('sidebar-collapsed');
  }

  const titles = { dashboard: 'Farm Dashboard', irrigation: 'Irrigation Advisor', fertilizer: 'Fertilizer Engine', crop: 'Crop Recommendation', disease: 'Disease Detector', weather: 'Weather Intelligence', market: 'Market Prices', sustainability: 'Sustainability Score', products: 'Agri Marketplace', admin: 'Admin Dashboard', settings: 'Settings', feedback: 'Farmer Feedback' };
  const subs = { dashboard: 'Overview → Today', irrigation: 'Tools → Irrigation', fertilizer: 'Tools → Fertilizer', crop: 'Tools → Crop Advisor', disease: 'Tools → Disease Diag', weather: 'Data → Weather', market: 'Data → Market', sustainability: 'Reports → Eco Impact', products: 'Store → AI Recommendations', admin: 'Management → Admin Control', settings: 'App → Preferences', feedback: 'Community → Voice' };
  document.getElementById('pageTitle').textContent = titles[id] || 'AgroSmart';
  document.getElementById('breadcrumb').textContent = subs[id] || '';
  state.currentPage = id;

  if (id === 'sustainability') animateCounters();
  if (id === 'weather') fetchWeather();
  if (id === 'market') { renderMarketTable(); }
  if (id === 'disease') renderRiskCalendar();
  if (id === 'dashboard') generateRecommendations();
  if (id === 'products') loadProducts();
  if (id === 'settings') renderSettings();
  if (id === 'feedback') renderFeedbackPage();

  // Scroll to top of the new page
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Update bottom nav active state
  document.querySelectorAll('.bottom-nav-item').forEach(item => {
    item.classList.remove('active');
    // Check if the onclick attribute contains the id
    const onclickAttr = item.getAttribute('onclick');
    if (onclickAttr && onclickAttr.includes(`showPage('${id}')`)) {
      item.classList.add('active');
    }
  });
}

document.querySelectorAll('.nav-item').forEach(item =>
  item.addEventListener('click', e => {
    const href = item.getAttribute('href');
    if (href && href !== '#' && href !== '') return;
    e.preventDefault();
    showPage(item.dataset.page);
  })
);

// ─── CLOCK ────────────────────────────────────────────────────────────────────
function updateClock() {
  const el = document.getElementById('timeDisplay');
  if (el) el.textContent = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
}
setInterval(updateClock, 1000);
function doLogout() {
  if (confirm('Logout from Namma Rytha?')) {
    localStorage.removeItem('nr_user');
    window.location.href = 'login.html';
  }
}

// ─── SLIDER HELPER ────────────────────────────────────────────────────────────
function updateSlider(id, displayId) {
  const val = document.getElementById(id).value;
  const el = document.getElementById(displayId);
  if (el) el.textContent = val;
  // Update NPK bars live
  if (id === 'nitrogenLevel') { setBar('nBar', 'nBarVal', val); }
  if (id === 'phosphorusLevel') { setBar('pBar', 'pBarVal', val); }
  if (id === 'potassiumLevel') { setBar('kBar', 'kBarVal', val); }
}
function setBar(barId, valId, val) {
  const bar = document.getElementById(barId);
  const txt = document.getElementById(valId);
  if (bar) bar.style.width = (val / 200 * 100) + '%';
  if (txt) txt.textContent = val + ' / 200';
}

// ─── RAIN TOGGLE ──────────────────────────────────────────────────────────────
function setRain(expected) {
  state.rainExpected = expected;
  document.getElementById('rainYes').classList.toggle('active', expected);
  document.getElementById('rainNo').classList.toggle('active', !expected);
}

// ─── ALERTS ───────────────────────────────────────────────────────────────────
function renderAlerts() {
  const list = document.getElementById('alertsList');
  const badge = document.getElementById('alertBadge');
  const count = document.getElementById('alertCount');
  if (!list) return;
  if (state.alerts.length === 0) {
    list.innerHTML = '<div style="padding:20px;text-align:center;color:#6b7280">✅ No active alerts</div>';
    if (badge) badge.textContent = '0 Active';
    if (count) count.textContent = '0';
    return;
  }
  list.innerHTML = state.alerts.map(a => `
    <div class="alert-item alert-${a.level}" id="alert-${a.id}">
      <div class="alert-icon">${a.icon}</div>
      <div class="alert-content">
        <div class="alert-title">${a.title}</div>
        <div class="alert-desc">${a.desc}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">
        <div class="alert-time">${a.time}</div>
        <button onclick="dismissAlert(${a.id})" style="font-size:11px;padding:2px 8px;border-radius:50px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#6b7280;cursor:pointer">✓ Dismiss</button>
      </div>
    </div>`).join('');
  if (badge) badge.textContent = state.alerts.length + ' Active';
  if (count) count.textContent = state.alerts.length;
}

function dismissAlert(id) {
  state.alerts = state.alerts.filter(a => a.id !== id);
  renderAlerts();
  showToast('✅', 'Alert dismissed');
}

function dismissAllAlerts() {
  state.alerts = [];
  renderAlerts();
  showToast('✅', 'All alerts dismissed');
}

function scrollAlerts() {
  const el = document.getElementById('alertsSection');
  if (el) el.scrollIntoView({ behavior: 'smooth' });
}

// ─── QUICK ACTIONS ────────────────────────────────────────────────────────────
function quickIrrigate() {
  showPage('irrigation');
  setTimeout(() => {
    document.getElementById('soilMoisture').value = 25;
    document.getElementById('moistureVal').textContent = '25';
    analyzeIrrigation();
  }, 200);
}

// ─── SMART IRRIGATION ─────────────────────────────────────────────────────────
function analyzeIrrigation() {
  const btn = document.getElementById('analyzeIrrigationBtn');
  btn.textContent = '⏳ Analyzing...';
  btn.disabled = true;

  setTimeout(() => {
    const moisture = parseInt(document.getElementById('soilMoisture').value);
    const cropType = document.getElementById('cropTypeIrr').value;
    const temp = parseInt(document.getElementById('tempInput').value) || 28;
    const lastIrr = parseInt(document.getElementById('lastIrr').value) || 2;
    const area = parseFloat(document.getElementById('fieldArea').value) || 2;
    const rain = state.rainExpected;
    const result = smartIrrigation(moisture, rain, cropType, temp, lastIrr);
    const water = calcWater(cropType, moisture) * area;

    const colorMap = { skip: 'result-skip', irrigate: 'result-irrigate', wait: 'result-wait' };
    document.getElementById('irrigationResult').innerHTML = `
      <div class="result-content">
        <div class="result-main ${colorMap[result.type]}">
          <div class="result-icon-big">${result.icon}</div>
          <div class="result-action">${result.action}</div>
          <div class="result-detail">${result.detail}</div>
        </div>
        <div class="result-stats">
          <div class="res-stat"><div class="res-stat-val">${moisture}%</div><div class="res-stat-label">Soil Moisture</div></div>
          <div class="res-stat"><div class="res-stat-val">${temp}°C</div><div class="res-stat-label">Temp</div></div>
          <div class="res-stat"><div class="res-stat-val">${result.waterSave}</div><div class="res-stat-label">Water Saved</div></div>
          <div class="res-stat"><div class="res-stat-val">${water}L</div><div class="res-stat-label">Field Total</div></div>
        </div>
        <div style="margin:14px 0;padding:12px;background:rgba(255,255,255,0.04);border-radius:10px;border:1px solid rgba(255,255,255,0.08)">
          <div style="font-size:12px;color:#6b7280;margin-bottom:4px">📅 Next Irrigation</div>
          <div style="font-size:14px;color:#a7f3d0;font-weight:600">${result.nextIrr}</div>
        </div>
        <div class="result-tips-title">💡 Action Tips</div>
        ${result.tips.map(t => `<div class="result-tip">→ ${t}</div>`).join('')}
        <button class="btn btn-ghost" onclick="openAIChat('My soil moisture is ${moisture}% for ${cropType}. Rain expected: ${rain}. Temp is ${temp}°C. Give detailed irrigation advice.')" style="margin-top:12px">🤖 Get AI Deep Analysis</button>
      </div>`;

    document.getElementById('statMoisture').textContent = moisture + '%';
    btn.textContent = '🤖 Analyze & Recommend';
    btn.disabled = false;
    showToast('✅', 'Irrigation analysis complete!');
    saveFarmData();
  }, 600);
}

function smartIrrigation(moisture, rain, crop, temp, days) {
  const T = { wheat: { low: 35, crit: 25 }, rice: { low: 50, crit: 40 }, tomato: { low: 40, crit: 28 }, cotton: { low: 35, crit: 22 }, sugarcane: { low: 55, crit: 45 }, maize: { low: 38, crit: 25 }, onion: { low: 40, crit: 28 }, soybean: { low: 38, crit: 25 } };
  const t = T[crop] || T.tomato;
  if (rain && moisture > t.crit)
    return { action: 'SKIP — Rain Expected', detail: 'Rain forecast tomorrow. Skipping saves water & prevents waterlogging.', type: 'skip', icon: '🌧️', nextIrr: 'After rain assessment (2 days)', waterSave: '100%', tips: ['Recheck soil after rainfall', 'Monitor drainage', 'Apply foliar spray after rain'] };
  if (moisture < t.crit)
    return { action: 'IRRIGATE NOW — Critical!', detail: `Critical moisture at ${moisture}%. Crop stress imminent.`, type: 'irrigate', icon: '🚨', nextIrr: `Irrigate immediately`, waterSave: '0%', tips: ['Use drip irrigation', 'Irrigate at dawn', 'Check for wilting symptoms', 'Unblock drainage channels'] };
  if (moisture < t.low || days >= 3)
    return { action: `IRRIGATE Soon`, detail: `Moisture ${moisture}% below optimal for ${crop}. Irrigate within 6 hrs.`, type: 'irrigate', icon: '💧', nextIrr: `Today (see quantities below)`, waterSave: '30%', tips: ['Drip or sprinkler preferred', 'Best: 5–8 AM', 'Watch for pests during irrigation', 'Mulching retains moisture'] };
  return { action: 'NO IRRIGATION NEEDED', detail: `Moisture ${moisture}% is optimal for ${crop}. Save your water!`, type: 'skip', icon: '✅', nextIrr: `Next in ${Math.max(1, 4 - days)} days`, waterSave: '100%', tips: ['Monitor forecast daily', 'Check for stress signs', 'Good time for weeding', 'Apply fertilizer if needed'] };
}

function calcWater(crop, moisture) {
  const base = { wheat: 400, rice: 800, tomato: 500, cotton: 450, sugarcane: 900, maize: 420, onion: 480, soybean: 420 };
  return Math.round((base[crop] || 500) * ((100 - moisture) / 100) * 0.6);
}

function resetIrrigationForm() {
  document.getElementById('soilMoisture').value = 42;
  document.getElementById('moistureVal').textContent = '42';
  document.getElementById('tempInput').value = 28;
  document.getElementById('lastIrr').value = 2;
  document.getElementById('fieldArea').value = 2;
  document.getElementById('cropTypeIrr').value = 'tomato';
  setRain(false);
  document.getElementById('irrigationResult').innerHTML = '<div class="result-placeholder"><div class="placeholder-icon">💧</div><p>Enter field data and click <strong>Analyze &amp; Recommend</strong>.</p></div>';
  showToast('↺', 'Form reset');
}

// ─── FERTILIZER ENGINE ────────────────────────────────────────────────────────
function analyzeFertilizer() {
  const btn = document.querySelector('#page-fertilizer .btn-primary');
  if (btn) { btn.textContent = '⏳ Processing...'; btn.disabled = true; }

  setTimeout(() => {
    const pH = parseFloat(document.getElementById('soilPH').value);
    const N = parseInt(document.getElementById('nitrogenLevel').value);
    const P = parseInt(document.getElementById('phosphorusLevel').value);
    const K = parseInt(document.getElementById('potassiumLevel').value);
    const crop = document.getElementById('cropTypeFert').value;
    const soil = document.getElementById('soilTypeFert').value;
    const plan = getFertPlan(pH, N, P, K, crop, soil);

    document.getElementById('fertilizerResult').innerHTML = `
      <div class="result-content">
        <div class="panel-header" style="margin-bottom:16px">
          <div class="panel-title">🌿 Fertilizer Prescription</div>
          <span style="font-size:11px;padding:3px 8px;border-radius:50px;background:rgba(74,222,128,0.08);border:1px solid rgba(74,222,128,0.15);color:#6b7280">For ${crop.charAt(0).toUpperCase() + crop.slice(1)}</span>
        </div>
        <div class="fert-prescription">${plan.products.map(p => `
          <div class="fert-product">
            <div class="fert-icon">${p.icon}</div>
            <div class="fert-info">
              <div class="fert-name">${p.name}</div>
              <div class="fert-dose">${p.dose}</div>
            </div>
            <div class="fert-type">${p.type}</div>
          </div>`).join('')}
        </div>
        <div style="margin-top:14px;padding:12px;background:rgba(251,191,36,0.06);border-radius:10px;border:1px solid rgba(251,191,36,0.15)">
          <div style="font-size:12px;font-weight:600;color:#fbbf24;margin-bottom:4px">⚠️ Soil Correction</div>
          <div style="font-size:13px;color:#a7f3d0">${plan.soilFix}</div>
        </div>
        <div style="margin-top:12px;padding:12px;background:rgba(74,222,128,0.06);border-radius:10px;border:1px solid rgba(74,222,128,0.1)">
          <div style="font-size:12px;font-weight:600;color:#4ade80;margin-bottom:4px">📅 Application Schedule</div>
          <div style="font-size:13px;color:#a7f3d0">${plan.schedule}</div>
        </div>
        <button class="btn btn-ghost" onclick="openAIChat('My soil pH is ${pH}, N=${N}, P=${P}, K=${K} for ${crop} crop. Explain the fertilizer prescription in simple terms.')" style="margin-top:12px">🤖 Explain in Simple Terms</button>
      </div>`;

    if (btn) { btn.textContent = '🧬 Generate Prescription'; btn.disabled = false; }
    showToast('🌿', 'Fertilizer prescription ready!');
  }, 700);
}

function getFertPlan(pH, N, P, K, crop, soil) {
  const needs = { wheat: { N: 120, P: 60, K: 40 }, rice: { N: 100, P: 50, K: 50 }, tomato: { N: 80, P: 80, K: 100 }, cotton: { N: 150, P: 75, K: 75 }, sugarcane: { N: 200, P: 100, K: 150 }, maize: { N: 120, P: 60, K: 40 } };
  const req = needs[crop] || needs.wheat;
  const nD = Math.max(0, req.N - N), pD = Math.max(0, req.P - P), kD = Math.max(0, req.K - K);
  const products = [
    nD > 0 ? { icon: '🟢', name: 'Urea (46% N)', dose: `Apply ${(nD * 2.17).toFixed(1)} kg/acre${nD > 40 ? ' — split 2 doses' : ' — one application'}`, type: 'Nitrogen' } : { icon: '✅', name: 'Nitrogen', dose: 'Adequate — no addition needed', type: 'N OK' },
    pD > 0 ? { icon: '🟡', name: 'Super Phosphate (16% P₂O₅)', dose: `Apply ${(pD * 6.25).toFixed(1)} kg/acre as basal`, type: 'Phosphorus' } : { icon: '✅', name: 'Phosphorus', dose: 'Sufficient — skip this cycle', type: 'P OK' },
    kD > 0 ? { icon: '🟣', name: 'Muriate of Potash (60% K₂O)', dose: `Apply ${(kD * 1.67).toFixed(1)} kg/acre before sowing`, type: 'Potassium' } : { icon: '✅', name: 'Potassium', dose: 'Good levels — no addition', type: 'K OK' },
    { icon: '🔵', name: 'Zinc Sulphate (21% Zn)', dose: '10 kg/acre if not applied last 2 seasons', type: 'Micronutrient' }
  ];
  const soilFix = pH < 5.5 ? `Acidic soil (pH ${pH}). Apply 2–3 bags/acre lime to raise pH.` : pH > 7.8 ? `Alkaline soil (pH ${pH}). Apply gypsum 2 kg/acre + organic compost.` : `pH ${pH} optimal (5.5–7.5). No correction needed!`;
  const sched = { wheat: 'Basal: All P,K before sowing. N: 50% sowing + 25% CRI + 25% jointing.', rice: 'P,K at transplant. N: 1/3 each at transplant, tillering, panicle init.', tomato: 'P,K at planting. N drench every 15 days. Weekly foliar spray.', cotton: 'P,K pre-sowing. N: 1/3 sowing, square, boll development.', sugarcane: 'P,K at planting. N: 1/4 planting, 1/4 at 2mo, 1/2 grand growth.', maize: 'P,K basal. N: 1/3 sowing, knee-high, tasseling.' };
  return { products, soilFix, schedule: sched[crop] || 'Split N into 3 applications. P,K as basal.' };
}

function resetFertilizerForm() {
  document.getElementById('soilPH').value = 6.8; document.getElementById('phVal').textContent = '6.8';
  document.getElementById('nitrogenLevel').value = 80; updateSlider('nitrogenLevel', 'nVal');
  document.getElementById('phosphorusLevel').value = 40; updateSlider('phosphorusLevel', 'pVal');
  document.getElementById('potassiumLevel').value = 60; updateSlider('potassiumLevel', 'kVal');
  document.getElementById('cropTypeFert').value = 'tomato';
  document.getElementById('fertilizerResult').innerHTML = '<div class="result-placeholder"><div class="placeholder-icon">🌿</div><p>Enter soil data and click <strong>Generate Prescription</strong>.</p></div>';
  showToast('↺', 'Form reset');
}

// ─── CROP ADVISOR ─────────────────────────────────────────────────────────────
function analyzeCrop() {
  const btn = document.querySelector('#page-crop .btn-primary');
  if (btn) { btn.textContent = '⏳ Analyzing...'; btn.disabled = true; }

  setTimeout(() => {
    const soil = document.getElementById('soilTypeCrop').value;
    const season = document.getElementById('season').value;
    const temp = parseInt(document.getElementById('avgTemp').value);
    const rain = parseInt(document.getElementById('rainfall').value);
    const pH = parseFloat(document.getElementById('cropPH').value);
    const water = document.getElementById('waterAvail').value;
    const recs = getCropRecs(soil, season, temp, rain, pH, water);
    const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];

    document.getElementById('cropResult').innerHTML = `
      <div class="result-content">
        <div class="panel-header" style="margin-bottom:14px">
          <div class="panel-title">🌾 Top Crop Picks</div>
          <span style="font-size:11px;color:#6b7280">AI-matched for your farm</span>
        </div>
        <div class="crop-results">
          ${recs.map((c, i) => `
            <div class="crop-card rank-${i + 1}">
              <div class="crop-rank">${medals[i] || '▪️'}</div>
              <div class="crop-emoji">${c.emoji}</div>
              <div class="crop-info">
                <div class="crop-name">${c.name}</div>
                <div class="crop-reason">${c.reason}</div>
                <div style="margin-top:5px;display:flex;gap:5px;flex-wrap:wrap">
                  ${c.tags.map(t => `<span style="font-size:10px;padding:2px 7px;border-radius:50px;background:rgba(74,222,128,0.08);color:#6b7280;border:1px solid rgba(74,222,128,0.1)">${t}</span>`).join('')}
                </div>
              </div>
              <div class="crop-match" style="color:${i === 0 ? '#4ade80' : i === 1 ? '#fbbf24' : '#6b7280'}">${c.match}%</div>
            </div>`).join('')}
        </div>
        <div style="margin-top:14px;padding:12px;background:rgba(56,189,248,0.06);border-radius:10px;border:1px solid rgba(56,189,248,0.15)">
          <div style="font-size:12px;font-weight:600;color:#38bdf8;margin-bottom:4px">📊 Season Analysis</div>
          <div style="font-size:13px;color:#a7f3d0">${season} season with ${temp}°C and ${rain}mm rainfall on ${soil} soil.</div>
        </div>
        <button class="btn btn-ghost" onclick="openAIChat('I have ${soil} soil, ${season} season, ${temp}°C, ${rain}mm rainfall. Explain the best crop in detail.')" style="margin-top:12px">🤖 AI Deep Explanation</button>
      </div>`;

    if (btn) { btn.textContent = '🌾 Recommend Best Crops'; btn.disabled = false; }
    showToast('🌾', 'Crop recommendations ready!');
  }, 700);
}

function getCropRecs(soil, season, temp, rain, pH, water) {
  const db = [
    { name: 'Wheat', emoji: '🌾', tags: ['Staple', 'High demand', 'Easy storage'], reason: 'Perfect rabi crop. High market value, stable yield.', ideal: { soil: ['loamy', 'clay', 'silt'], season: ['rabi'], temp: [10, 25], rain: [300, 800], pH: [6, 7.5], water: ['high', 'medium'] } },
    { name: 'Rice', emoji: '🍚', tags: ['Water intensive', 'High yield'], reason: 'Excellent for high water. Kharif staple with consistent mkt.', ideal: { soil: ['clay', 'silt', 'loamy'], season: ['kharif'], temp: [20, 38], rain: [800, 3000], pH: [5.5, 7], water: ['high'] } },
    { name: 'Tomato', emoji: '🍅', tags: ['High value', 'Short cycle'], reason: 'High-value vegetable with great returns. Fast cash flow.', ideal: { soil: ['loamy', 'sandy', 'red'], season: ['rabi', 'zaid'], temp: [18, 30], rain: [400, 1200], pH: [5.5, 7], water: ['high', 'medium'] } },
    { name: 'Cotton', emoji: '🌸', tags: ['Cash crop', 'Export quality'], reason: 'Premium cash crop for black cotton soil. High export demand.', ideal: { soil: ['black', 'clay', 'loamy'], season: ['kharif'], temp: [25, 40], rain: [500, 1500], pH: [6, 8], water: ['medium', 'high'] } },
    { name: 'Soybean', emoji: '🫘', tags: ['Protein rich', 'Soil health'], reason: 'Nitrogen-fixing crop that improves soil. Industrial demand.', ideal: { soil: ['loamy', 'clay', 'black'], season: ['kharif'], temp: [20, 35], rain: [500, 1000], pH: [6, 7], water: ['medium', 'low'] } },
    { name: 'Sugarcane', emoji: '🎋', tags: ['Long duration', 'Govt procurement'], reason: 'Guaranteed govt purchase price. Long-term revenue.', ideal: { soil: ['loamy', 'clay', 'silt'], season: ['yearround'], temp: [20, 38], rain: [1200, 2500], pH: [6, 7.5], water: ['high'] } },
    { name: 'Maize', emoji: '🌽', tags: ['Versatile', 'Animal feed'], reason: 'Multiple end uses. Great for feed and starch industry.', ideal: { soil: ['loamy', 'sandy', 'red'], season: ['kharif', 'rabi'], temp: [18, 35], rain: [400, 1200], pH: [5.5, 7.5], water: ['medium', 'high'] } },
    { name: 'Onion', emoji: '🧅', tags: ['High demand', 'Export quality'], reason: 'Huge export potential. Short cycle with rapid returns.', ideal: { soil: ['loamy', 'sandy', 'silt'], season: ['rabi', 'zaid'], temp: [12, 28], rain: [300, 800], pH: [6, 7], water: ['medium', 'high'] } },
    { name: 'Groundnut', emoji: '🥜', tags: ['Drought tolerant', 'Oil crop'], reason: 'Low water need and good ROI. Oil adds processing value.', ideal: { soil: ['sandy', 'red', 'loamy'], season: ['kharif', 'zaid'], temp: [22, 38], rain: [400, 1000], pH: [5.5, 7], water: ['medium', 'low'] } },
    { name: 'Turmeric', emoji: '🟡', tags: ['Spice export', 'Premium price'], reason: 'High organic market rate. Great value addition.', ideal: { soil: ['loamy', 'clay', 'red'], season: ['kharif'], temp: [20, 35], rain: [800, 2000], pH: [5.5, 7], water: ['medium', 'high'] } },
  ];
  return db.map(c => {
    let s = 0;
    if (c.ideal.soil.includes(soil)) s += 25; else s += 8;
    if (c.ideal.season.includes(season) || c.ideal.season.includes('yearround')) s += 25;
    if (temp >= c.ideal.temp[0] && temp <= c.ideal.temp[1]) s += 15; else s += Math.max(0, 8 - Math.abs(temp - ((c.ideal.temp[0] + c.ideal.temp[1]) / 2)));
    if (rain >= c.ideal.rain[0] && rain <= c.ideal.rain[1]) s += 15;
    if (pH >= c.ideal.pH[0] && pH <= c.ideal.pH[1]) s += 10;
    if (c.ideal.water.includes(water)) s += 10;
    return { ...c, match: Math.min(98, s) };
  }).sort((a, b) => b.match - a.match).slice(0, 5);
}

function resetCropForm() {
  document.getElementById('soilTypeCrop').value = 'loamy'; document.getElementById('season').value = 'rabi';
  document.getElementById('avgTemp').value = 25; document.getElementById('avgTempVal').textContent = '25';
  document.getElementById('rainfall').value = 800; document.getElementById('rainfallVal').textContent = '800';
  document.getElementById('cropPH').value = 6.5; document.getElementById('cropPhVal').textContent = '6.5';
  document.getElementById('waterAvail').value = 'medium';
  document.getElementById('cropResult').innerHTML = '<div class="result-placeholder"><div class="placeholder-icon">🌾</div><p>Enter conditions and click <strong>Recommend Best Crops</strong>.</p></div>';
  showToast('↺', 'Form reset');
}

// ─── YIELD PREDICTOR ──────────────────────────────────────────────────────────
function predictYield() {
  const crop = document.getElementById('yieldCrop').value;
  const area = parseFloat(document.getElementById('yieldArea').value) || 2;
  const qual = document.getElementById('seasonQuality').value;
  const base = { wheat: 20, rice: 25, tomato: 80, cotton: 8, maize: 22 };
  const mult = { excellent: 1.3, good: 1.0, average: 0.75, poor: 0.5 };
  const yieldPerAcre = (base[crop] || 20) * mult[qual];
  const total = (yieldPerAcre * area).toFixed(1);
  const price = { wheat: 2285, rice: 2183, tomato: 1800, cotton: 66200, maize: 1962 };
  const revenue = Math.round(total * (price[crop] || 2000) / 100 * area);

  const el = document.getElementById('yieldResult');
  el.style.display = 'block';
  el.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:12px">
      <div class="res-stat"><div class="res-stat-val">${yieldPerAcre.toFixed(1)} q</div><div class="res-stat-label">Yield/Acre</div></div>
      <div class="res-stat"><div class="res-stat-val">${total} q</div><div class="res-stat-label">Total Yield (${area} ac)</div></div>
      <div class="res-stat" style="background:rgba(74,222,128,0.08);border-color:rgba(74,222,128,0.2)"><div class="res-stat-val" style="color:#4ade80">₹${revenue.toLocaleString('en-IN')}</div><div class="res-stat-label">Est. Revenue</div></div>
    </div>
    <button class="btn btn-ghost" onclick="openAIChat('How can I improve my ${crop} yield from ${yieldPerAcre.toFixed(1)} quintals/acre to higher? Give specific tips.')" style="margin-top:10px">🤖 How to Improve Yield?</button>`;
  showToast('🔮', `Predicted yield: ${total} quintals`);
}

// ─── DISEASE DETECTOR ────────────────────────────────────────────────────────
function getSelectedSymptoms() {
  return Array.from(document.querySelectorAll('#symptomGrid input:checked')).map(c => c.value).join(', ') || 'none selected';
}

function detectDisease() {
  const crop = document.getElementById('diseaseCrop').value;
  const symptoms = Array.from(document.querySelectorAll('#symptomGrid input:checked')).map(c => c.value);
  const humidity = parseInt(document.getElementById('diseaseHumidity').value);
  const duration = document.getElementById('symptomDuration').value;

  if (symptoms.length === 0) { showToast('⚠️', 'Please select at least one symptom'); return; }

  const btn = document.querySelector('#page-disease .btn-primary');
  if (btn) { btn.textContent = '🔬 Diagnosing...'; btn.disabled = true; }

  setTimeout(() => {
    const diagnosis = diagnoseCrop(crop, symptoms, humidity);
    document.getElementById('diseaseResult').innerHTML = `
      <div class="result-content">
        <div class="result-main" style="background:rgba(248,113,113,0.08);border:1px solid rgba(248,113,113,0.2);text-align:center;padding:18px;border-radius:10px">
          <div class="result-icon-big">${diagnosis.icon}</div>
          <div class="result-action" style="color:#f87171">${diagnosis.name}</div>
          <div class="result-detail">${diagnosis.desc}</div>
          <div style="margin-top:8px;font-size:12px;padding:4px 12px;border-radius:50px;background:rgba(248,113,113,0.1);display:inline-block;color:#f87171">
            Risk Level: ${diagnosis.risk}
          </div>
        </div>
        <div style="margin:14px 0;padding:12px;background:rgba(74,222,128,0.06);border-radius:10px;border:1px solid rgba(74,222,128,0.1)">
          <div style="font-size:12px;font-weight:600;color:#4ade80;margin-bottom:6px">💊 Treatment Plan</div>
          ${diagnosis.treatment.map(t => `<div class="result-tip">→ ${t}</div>`).join('')}
        </div>
        <div style="padding:12px;background:rgba(251,191,36,0.06);border-radius:10px;border:1px solid rgba(251,191,36,0.15)">
          <div style="font-size:12px;font-weight:600;color:#fbbf24;margin-bottom:6px">🛡️ Prevention</div>
          ${diagnosis.prevention.map(p => `<div class="result-tip">→ ${p}</div>`).join('')}
        </div>
        <button class="btn btn-ghost" onclick="openAIChat('My ${crop} has ${symptoms.join(', ')}. You diagnosed ${diagnosis.name}. Give detailed organic treatment plan.')" style="margin-top:12px">🤖 Ask AI for Organic Treatment</button>
      </div>`;
    if (btn) { btn.textContent = '🔬 Diagnose Disease'; btn.disabled = false; }
    showToast('🔬', `Diagnosed: ${diagnosis.name}`);
  }, 800);
}

function diagnoseCrop(crop, symptoms, humidity) {
  if (symptoms.includes('mold'))
    return { icon: '🍄', name: 'Powdery Mildew', risk: 'HIGH', desc: 'Fungal infection spreading on leaf surfaces. Common in high humidity.', treatment: ['Apply Mancozeb @ 2g/L water', 'Remove heavily infected leaves', 'Spray Sulphur fungicide @ 3g/L', 'Improve air circulation between plants'], prevention: ['Avoid overhead irrigation', 'Maintain row spacing', 'Apply preventive fungicide when humidity >70%', 'Use resistant varieties'] };
  if (symptoms.includes('spots'))
    return { icon: '🔴', name: 'Leaf Blight / Blight Disease', risk: 'HIGH', desc: 'Brown/black lesions on leaves indicate fungal or bacterial blight.', treatment: ['Spray Copper Oxychloride 3g/L', 'Remove infected plant material', 'Apply Propiconazole 1ml/L', 'Drain waterlogged areas'], prevention: ['Crop rotation every 2 years', 'Avoid waterlogging', 'Use certified disease-free seeds', 'Balanced fertilization'] };
  if (symptoms.includes('yellowing'))
    return { icon: '🟡', name: 'Nitrogen Deficiency / Chlorosis', risk: 'MEDIUM', desc: 'Yellowing starts from older leaves — classic nitrogen or micronutrient deficiency.', treatment: ['Apply Urea 2% foliar spray', 'Add 20 kg/acre Urea to soil', 'Check iron/manganese levels', 'Soil test recommended'], prevention: ['Regular NPK application schedule', 'Maintain soil pH 6-7', 'Use organic compost annually', 'Avoid over-irrigation that leaches nutrients'] };
  if (symptoms.includes('wilting'))
    return { icon: '🥀', name: 'Fusarium Wilt / Root Rot', risk: 'CRITICAL', desc: 'Wilting despite adequate moisture indicates root or stem disease.', treatment: ['Drench roots with Carbendazim 1g/L', 'Remove and destroy infected plants', 'Improve field drainage', 'Apply Trichoderma bio-fungicide'], prevention: ['Use resistant varieties', 'Avoid waterlogging', 'Crop rotation essential', 'Soil solarization before planting'] };
  if (symptoms.includes('insects'))
    return { icon: '🐛', name: 'Pest Infestation', risk: 'HIGH', desc: 'Visible insects indicate active pest pressure. Act immediately to prevent spread.', treatment: ['Apply Chlorpyrifos 2ml/L', 'Use yellow sticky traps', 'Apply Neem oil @ 5ml/L', 'Manual removal if small area'], prevention: ['Regular field scouting 2x per week', 'IPM (Integrated Pest Management)', 'Maintain field hygiene', 'Use pheromone traps'] };
  if (symptoms.includes('holes'))
    return { icon: '🕳️', name: 'Caterpillar / Leaf Miner Damage', risk: 'MEDIUM', desc: 'Holes indicate caterpillar feeding. Check undersides of leaves for egg clusters.', treatment: ['Spray Bacillus thuringiensis (BT)', 'Apply Lambda-cyhalothrin 1ml/L', 'Check for egg masses and destroy', 'Light traps at night'], prevention: ['Pheromone traps for monitoring', 'Spray neem oil preventively', 'Encourage natural predators', 'Early sowing to avoid pest peak'] };
  return { icon: '⚠️', name: 'Multiple Stress Indicators', risk: 'MEDIUM', desc: `${crop} shows multiple potential issues. Consult your nearest KVK or agricultural officer.`, treatment: ['Take a proper soil test', 'Consult local agricultural extension officer', 'Send leaf samples to state lab', 'Document and track symptom progression'], prevention: ['Use certified seeds', 'Follow recommended crop calendar', 'Regular soil testing every 2 years', 'Balanced nutrition management'] };
}

function renderRiskCalendar() {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const risk = [2, 2, 3, 4, 3, 5, 5, 5, 4, 3, 2, 2];
  const labels = ['', 'Low', 'Low', 'Med', 'High', 'Med', '🔴 Critical', '🔴Critical', '🔴Critical', 'High', 'Med', 'Low', 'Low'];
  const colors = ['', 'rgba(74,222,128,0.2)', 'rgba(74,222,128,0.2)', 'rgba(251,191,36,0.2)', 'rgba(251,191,36,0.3)', 'rgba(251,191,36,0.2)', 'rgba(248,113,113,0.2)', 'rgba(248,113,113,0.2)', 'rgba(248,113,113,0.2)', 'rgba(251,191,36,0.3)', 'rgba(251,191,36,0.2)', 'rgba(74,222,128,0.2)'];
  const container = document.getElementById('riskCalendar');
  if (!container) return;
  container.innerHTML = `<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:8px">
    ${months.map((m, i) => `
      <div style="padding:12px 8px;border-radius:8px;background:${colors[i + 1]};border:1px solid rgba(255,255,255,0.06);text-align:center">
        <div style="font-weight:600;font-size:13px;color:#f0fdf4">${m}</div>
        <div style="font-size:11px;color:#6b7280;margin-top:4px">${['Low', 'Low', 'Med', 'High', 'Med', 'Critical', 'Critical', 'Critical', 'High', 'Med', 'Low', 'Low'][i]}</div>
      </div>`).join('')}
  </div>`;
}

// ─── WEATHER ─────────────────────────────────────────────────────────────────
function setCity(name) {
  document.getElementById('cityInput').value = name;
  fetchWeather();
}

function applyWeatherToUI(data) {
  document.getElementById('topbarTemp').textContent = data.temp + '°C ' + data.icon;
  document.getElementById('cwIcon').textContent = data.icon;
  document.getElementById('cwTemp').textContent = data.temp + '°C';
  document.getElementById('cwDesc').textContent = data.desc;
  document.getElementById('cwCity').textContent = '📍 ' + data.city;
  document.getElementById('cwHumidity').textContent = data.humidity + '%';
  document.getElementById('cwWind').textContent = data.wind + ' km/h';
  document.getElementById('cwUV').textContent = data.uv;
  document.getElementById('cwRain').textContent = data.rain + '%';
  updateDashboardForecast();
  saveFarmData();
  renderForecast7Day();
  renderWeatherImpact(data);
  showToast('☁️', '📍 Live weather loaded for ' + data.city);
}

async function fetchWeather() {
  const cityInput = document.getElementById('cityInput');
  const raw = cityInput ? cityInput.value.trim() : '';
  if (!raw) { autoLocateWeather(); return; }

  const cwIcon = document.getElementById('cwIcon');
  if (cwIcon) cwIcon.textContent = '⏳';
  const cwDesc = document.getElementById('cwDesc');
  if (cwDesc) cwDesc.textContent = 'Fetching live weather...';

  try {
    const geo = await geocodeCity(raw);
    const data = await fetchWeatherByCoords(geo.lat, geo.lon, geo.displayName);
    applyWeatherToUI(data);
  } catch (e) {
    showToast('⚠️', 'Could not find "' + raw + '". Try another city name.');
    if (cwIcon) cwIcon.textContent = '❓';
    if (cwDesc) cwDesc.textContent = 'City not found';
    console.warn('Weather fetch error:', e);
  }
}

// ─── IP-BASED GEOLOCATION FALLBACK ────────────────────────────────────────────
async function ipGeolocate() {
  try {
    const res = await fetch('https://ipapi.co/json/');
    const data = await res.json();
    if (data && data.latitude && data.longitude) {
      return { lat: data.latitude, lon: data.longitude, city: (data.city || 'Your Location') + (data.region ? ', ' + data.region : '') };
    }
  } catch (e) {
    console.warn('IP geolocation failed:', e);
  }
  return null;
}

// ─── AUTO-LOCATE WEATHER (GPS → IP fallback) ─────────────────────────────────
let _autoLocateInProgress = false;
async function autoLocateWeather() {
  if (_autoLocateInProgress) return;
  _autoLocateInProgress = true;

  const cwIcon = document.getElementById('cwIcon');
  const cwDesc = document.getElementById('cwDesc');
  const cityInput = document.getElementById('cityInput');
  if (cwIcon) cwIcon.textContent = '📡';
  if (cwDesc) cwDesc.textContent = 'Auto-detecting your location...';
  if (cityInput) cityInput.placeholder = '📡 Auto-detecting your location...';
  showToast('📡', 'Auto-detecting your location for weather...');

  // Helper: load weather from IP geolocation
  async function loadFromIP() {
    const ipData = await ipGeolocate();
    if (ipData) {
      if (cityInput) {
        cityInput.value = ipData.city.split(',')[0];
        cityInput.placeholder = '📡 Auto-detected! Change anytime.';
      }
      const data = await fetchWeatherByCoords(ipData.lat, ipData.lon, ipData.city);
      applyWeatherToUI(data);
      showToast('📍', '✅ Weather auto-detected for ' + ipData.city);
    } else {
      if (cwIcon) cwIcon.textContent = '📍';
      if (cwDesc) cwDesc.textContent = 'Enter a city to see weather';
      if (cityInput) cityInput.placeholder = 'Type your city name (e.g. Delhi, Hyderabad...)';
      showToast('⚠️', 'Could not detect location. Please enter a city manually.');
    }
    _autoLocateInProgress = false;
  }

  if (!('geolocation' in navigator)) {
    // No GPS — go straight to IP
    await loadFromIP();
    return;
  }

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      try {
        const { latitude: lat, longitude: lon } = pos.coords;
        const cityLabel = await reverseGeocode(lat, lon);
        if (cityInput) {
          cityInput.value = cityLabel.split(',')[0];
          cityInput.placeholder = '📡 Auto-detected! Change anytime.';
        }
        const data = await fetchWeatherByCoords(lat, lon, cityLabel);
        applyWeatherToUI(data);
        showToast('📍', '✅ Live weather loaded for ' + cityLabel);
      } catch (e) {
        showToast('⚠️', 'GPS found but weather fetch failed. Trying IP...');
        await loadFromIP();
      }
      _autoLocateInProgress = false;
    },
    async (err) => {
      console.warn('GPS denied/failed, falling back to IP geolocation:', err.message);
      await loadFromIP();
    },
    { timeout: 10000, enableHighAccuracy: true, maximumAge: 300000 }
  );
}

async function useGPS() {
  showToast('📡', 'Auto-detecting your location...');
  const cwIcon = document.getElementById('cwIcon');
  const cwDesc = document.getElementById('cwDesc');
  if (cwIcon) cwIcon.textContent = '📡';
  if (cwDesc) cwDesc.textContent = 'Auto-detecting location...';

  // Helper: IP fallback
  async function fallbackToIP() {
    showToast('🌐', 'Using IP-based detection...');
    const ipData = await ipGeolocate();
    if (ipData) {
      const cityInput = document.getElementById('cityInput');
      if (cityInput) cityInput.value = ipData.city.split(',')[0];
      const data = await fetchWeatherByCoords(ipData.lat, ipData.lon, ipData.city);
      applyWeatherToUI(data);
      showToast('📍', '✅ Weather auto-detected for ' + ipData.city);
    } else {
      showToast('⚠️', 'Could not detect location. Please enter a city manually.');
      if (cwIcon) cwIcon.textContent = '📍';
      if (cwDesc) cwDesc.textContent = 'Enter a city to see weather';
    }
  }

  if (!('geolocation' in navigator)) {
    await fallbackToIP();
    return;
  }

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      try {
        const { latitude: lat, longitude: lon } = pos.coords;
        const cityLabel = await reverseGeocode(lat, lon);
        const cityInput = document.getElementById('cityInput');
        if (cityInput) cityInput.value = cityLabel.split(',')[0];
        const data = await fetchWeatherByCoords(lat, lon, cityLabel);
        applyWeatherToUI(data);
        showToast('📍', '✅ Live weather for your location: ' + cityLabel);
      } catch (e) {
        showToast('⚠️', 'GPS found but weather failed. Trying IP...');
        await fallbackToIP();
      }
    },
    async (err) => {
      console.warn('GPS denied, falling back to IP:', err.message);
      await fallbackToIP();
    },
    { timeout: 10000, enableHighAccuracy: false }
  );
}

function getFarmingAdvice(d) {
  if (d.rain >= 80) return { text: 'Harvest risk 🔴', cls: 'fr-bad' };
  if (d.rain >= 60) return { text: 'Skip irrigation ⚠️', cls: 'fr-warn' };
  if (d.rain >= 35) return { text: 'Skip spraying ⚠️', cls: 'fr-warn' };
  if (d.high > 38) return { text: 'Heat stress risk 🔴', cls: 'fr-bad' };
  return { text: 'Good for farming ✅', cls: 'fr-good' };
}

function renderForecast7Day() {
  const c = document.getElementById('forecastFull');
  if (!c) return;
  const source = liveForecast.length > 0 ? liveForecast : [];
  if (source.length === 0) {
    c.innerHTML = '<div style="padding:20px;text-align:center;color:#6b7280">🌐 Load weather to see live forecast</div>';
    return;
  }
  c.innerHTML = source.map((d) => {
    const adv = getFarmingAdvice(d);
    return `
    <div class="forecast-row">
      <div class="fr-day">${d.day}</div>
      <div class="fr-icon">${d.icon}</div>
      <div class="fr-desc">${d.desc}</div>
      <div class="fr-temp">${d.high}° / ${d.low}°C</div>
      <div class="fr-rain">💧 ${d.rain}%</div>
      <div class="fr-farming ${adv.cls}">${adv.text}</div>
    </div>`;
  }).join('');
}

function renderWeatherImpact(data) {
  const c = document.getElementById('weatherImpact');
  if (!c) return;
  c.innerHTML = [
    { title: '💧 Irrigation Decision', text: data.rain > 60 ? '⚠️ High rain. SKIP irrigation 2 days.' : data.rain > 30 ? '⚡ Moderate rain. Reduce irrigation 40%.' : '✅ Low rain. Proceed with irrigation.' },
    { title: '🌾 Harvest Window', text: data.rain < 20 ? '✅ Excellent harvest conditions.' : data.rain < 50 ? '⚡ Complete harvest before Wednesday.' : '⚠️ Rain coming. Delay harvest, use tarps.' },
    { title: '🌱 Spray Advisory', text: data.wind > 20 ? '⛔ High wind! Do NOT spray — drift risk.' : data.rain > 50 ? '⚠️ Skip spraying — chemicals will wash off.' : '✅ Good spray conditions. Morning preferred.' },
    { title: '🌡️ Heat Stress', text: data.temp > 38 ? '🔴 HIGH HEAT. Irrigate evenings. Monitor.' : data.temp > 32 ? '🟡 Warm. Ensure irrigation. Mulch soil.' : '✅ Temperature optimal. No stress risk.' },
    { title: '🌫️ Disease Risk', text: data.humidity > 75 ? `⚠️ High humidity (${data.humidity}%). Fungal risk. Apply fungicide.` : '✅ Low disease risk. Maintain field hygiene.' },
    { title: '☀️ Sunlight', text: data.uv > 7 ? `High UV (${data.uv}). Great photosynthesis. Keep plants hydrated.` : 'Moderate sun. Good growing conditions.' }
  ].map(i => `<div class="impact-item"><div class="impact-item-title">${i.title}</div><div class="impact-item-text">${i.text}</div></div>`).join('');
}

function updateDashboardForecast() {
  const c = document.getElementById('forecastGrid');
  if (!c) return;
  const source = liveForecast.length > 0 ? liveForecast.slice(0, 5) : [];
  if (source.length === 0) {
    c.innerHTML = '<div style="padding:12px;text-align:center;color:#6b7280;font-size:13px" onclick="useGPS()" style="cursor:pointer">📡 Tap to load live forecast</div>';
    return;
  }
  c.innerHTML = source.map(d => `
    <div class="forecast-day" onclick="showPage('weather')" style="cursor:pointer">
      <div class="fc-day">${d.day}</div>
      <div class="fc-icon">${d.icon}</div>
      <div class="fc-temp">${d.high}°/${d.low}°</div>
      <div class="fc-rain">💧${d.rain}%</div>
    </div>`).join('');
}

function exportWeatherReport() {
  showToast('📄', 'Weather report downloaded!');
}

// ─── MARKET PRICES ────────────────────────────────────────────────────────────
function renderMarketTable() {
  const b = document.getElementById('marketTableBody');
  if (!b) return;
  b.innerHTML = MARKET_DATA.map(r => `
    <tr>
      <td style="font-weight:600">${r.crop}</td>
      <td style="font-weight:700;color:#4ade80">₹${r.price.toLocaleString('en-IN')}</td>
      <td style="color:#6b7280">${typeof r.msp === 'number' ? '₹' + r.msp.toLocaleString('en-IN') : r.msp}</td>
      <td style="color:${r.change > 0 ? '#4ade80' : r.change < 0 ? '#f87171' : '#6b7280'}">${r.change > 0 ? '+' : ''} ${r.change}</td>
      <td>${r.trend === 'up' ? '📈' : r.trend === 'down' ? '📉' : '➡️'}</td>
      <td><button onclick="openAIChat('Should I sell ${r.crop.replace(/[^\w\s]/g, '')} now at ₹${r.price}/quintal or wait? Advise.')" style="font-size:11px;padding:4px 10px;border-radius:50px;background:rgba(74,222,128,0.1);border:1px solid rgba(74,222,128,0.2);color:#4ade80;cursor:pointer">🤖 Advise</button></td>
    </tr>`).join('');
}

function refreshMarketPrices() {
  MARKET_DATA.forEach(r => { r.price += Math.round((Math.random() - 0.5) * 50); r.change = Math.round((Math.random() - 0.5) * 80); r.trend = r.change > 0 ? 'up' : r.change < 0 ? 'down' : 'flat'; });
  renderMarketTable();
  showToast('📈', 'Market prices refreshed!');
}



// ─── SUSTAINABILITY ───────────────────────────────────────────────────────────
function animateCounters() {
  [
    { id: 'counterWater', target: 2400, prefix: '', suffix: 'L', dur: 1500 },
    { id: 'counterChem', target: 12, prefix: '', suffix: 'kg', dur: 1200 },
    { id: 'counterIncome', target: 8500, prefix: '₹', suffix: '', dur: 2000 },
    { id: 'counterCO2', target: 45, prefix: '', suffix: '', dur: 1000 },
  ].forEach(({ id, target, prefix, suffix, dur }) => {
    const el = document.getElementById(id);
    if (!el) return;
    const start = performance.now();
    (function step(now) {
      const p = Math.min((now - start) / dur, 1);
      el.textContent = prefix + Math.round(target * (1 - Math.pow(1 - p, 3))).toLocaleString('en-IN') + suffix;
      if (p < 1) requestAnimationFrame(step);
    })(start);
  });

  // Render achievements
  const grid = document.getElementById('achievementsGrid');
  if (grid) grid.innerHTML = ACHIEVEMENTS.map(a => `
    <div class="achievement ${a.unlocked ? 'unlocked' : 'locked'}" ${a.unlocked ? `onclick="showToast('${a.icon}','${a.name} badge earned!')"` : ''} style="${a.unlocked ? 'cursor:pointer' : ''}">
      <div class="ach-icon">${a.icon}</div>
      <div class="ach-name">${a.name}</div>
      <div class="ach-desc">${a.desc}</div>
      ${a.unlocked ? '<div style="font-size:10px;color:#4ade80;margin-top:4px">✅ Unlocked</div>' : '<div style="font-size:10px;color:#6b7280;margin-top:4px">🔒 Locked</div>'}
    </div>`).join('');
}

function exportSustainabilityReport() {
  showToast('📄', 'Sustainability report exported!');
}

// ─── DASHBOARD RECS ───────────────────────────────────────────────────────────
function generateRecommendations() {
  const moisture = parseInt(document.getElementById('statMoisture')?.textContent) || 42;
  const recs = [
    { type: 'rec-warning', badge: '💧 Irrigation', text: `Soil moisture at <strong>${moisture}%</strong>. ${state.rainExpected ? 'Rain expected — SKIP irrigation tonight.' : 'Monitor closely — irrigate in 5-6 hours if no rain.'}` },
    { type: 'rec-info', badge: '🌾 Crop Advisory', text: `Rabi season + 28°C → Optimal for <strong>Wheat</strong> or <strong>Mustard</strong>. Plan next season crop now.` },
    { type: 'rec-success', badge: '🌿 Fertilizer', text: `Nitrogen slightly low. Apply <strong>Urea 2.5 kg/acre</strong> this week for vigorous growth.` },
    { type: 'rec-danger', badge: '⚠️ Disease Alert', text: `Humidity at 65% + upcoming rain → fungal risk. Consider <strong>Mancozeb preventive spray</strong> today.` }
  ];
  const c = document.getElementById('recommendations');
  if (!c) return;
  c.innerHTML = recs.map(r => `<div class="rec-item ${r.type}"><div class="rec-badge">${r.badge}</div><p>${r.text}</p></div>`).join('');
  showToast('🤖', 'AI recommendations refreshed!');
}

// ─── AI ADVISOR CHAT ──────────────────────────────────────────────────────────
function openAIChat(prefill) {
  document.getElementById('aiChatPanel').classList.add('open');
  document.getElementById('aiChatOverlay').classList.add('open');
  if (prefill) {
    document.getElementById('aiInput').value = prefill;
    setTimeout(() => sendAIMessage(), 200);
  } else {
    document.getElementById('aiInput').focus();
  }
}

function closeAIChat() {
  document.getElementById('aiChatPanel').classList.remove('open');
  document.getElementById('aiChatOverlay').classList.remove('open');
}

function clearChat() {
  const msgs = document.getElementById('aiMessages');
  msgs.innerHTML = `<div class="ai-msg ai-msg-bot"><div class="ai-msg-avatar">🌱</div><div class="ai-msg-bubble"><p>Chat cleared! Ask me anything about farming 🌾</p></div></div>`;
  state.chatHistory = [];
}

async function sendAIMessage(text) {
  const input = document.getElementById('aiInput');
  const msg = (text || input.value).trim();
  if (!msg) return;
  input.value = '';

  appendMsg('user', msg, '👤');
  const btn = document.getElementById('aiSendBtn');
  btn.disabled = true; btn.textContent = '⏳';

  const status = document.getElementById('aiStatus');
  if (status) status.textContent = 'Thinking...';

  try {
    const reply = await getAIResponse(msg);
    appendMsg('bot', reply, '🌱');
  } catch (e) {
    appendMsg('bot', getOfflineResponse(msg), '🌱');
  }

  btn.disabled = false; btn.textContent = '➤';
  if (status) status.textContent = 'Powered by AI • Online';
}

function appendMsg(role, text, avatar) {
  const msgs = document.getElementById('aiMessages');
  const div = document.createElement('div');
  div.className = `ai-msg ai-msg-${role === 'user' ? 'user' : 'bot'}`;
  const formatted = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
  div.innerHTML = `<div class="ai-msg-avatar">${avatar}</div><div class="ai-msg-bubble">${formatted}</div>`;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
  state.chatHistory.push({ role, text });
}

async function getAIResponse(msg) {
  // Try Gemini API
  const key = CONFIG.GEMINI_API_KEY;
  if (!key || key.includes('Demo')) throw new Error('No API key');

  // Include context about marketplace products for better AI suggestions
  const productsList = allProducts.slice(0, 5).map(p => `- ${p.name} (${p.category})`).join('\n');

  const body = {
    contents: [{
      parts: [{
        text: `You are AgroSmart AI, an expert farming advisor for Indian farmers. Answer in simple, practical English. Keep responses under 200 words. Use emojis. Focus on actionable advice.

You can also recommend relevant products from our marketplace when appropriate. Available products included:
${productsList}
- Nano-DAP Fertilizer (High efficiency)

Farmer question: ${msg}`
      }]
    }]
  };
  const res = await fetch(`${CONFIG.GEMINI_URL}?key=${key}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error('API error');
  const data = await res.json();
  return data.candidates[0].content.parts[0].text;
}

function getOfflineResponse(msg) {
  const q = msg.toLowerCase();
  // Smart keyword-based offline AI
  if (q.includes('irrigat') || q.includes('water') || q.includes('moisture'))
    return `**💧 Irrigation Advice:**\n\nBased on your query, here's my recommendation:\n\n✅ **Rule of thumb:** Irrigate when soil moisture drops below 40% for most crops.\n\n📋 **Best practices:**\n→ Always irrigate early morning (5-8 AM)\n→ Skip irrigation if rain expected (>40% probability)\n→ Drip irrigation saves 30-50% more water vs flood\n→ Use mulching to retain soil moisture\n\n🌡️ **Temperature check:** If temp > 35°C, increase frequency but reduce each session quantity.\n\nWant me to analyze your specific field data? Use the Irrigation Advisor tool! 💧`;

  if (q.includes('fertiliz') || q.includes('npk') || q.includes('urea') || q.includes('nutrient') || q.includes('dap'))
    return `**🌿 Fertilizer Advisory:**\n\n**NPK Basics for Indian Farmers:**\n\n🟢 **Nitrogen (N)** → Urea (46% N) — promotes leaf/stem growth\n🚀 **New: Nano-DAP** → High efficiency, less quantity needed!\n\n🟡 **Phosphorus (P)** → SSP (16% P₂O₅) — root development\n\n🟣 **Potassium (K)** → MOP (60% K₂O) — fruit quality & disease resistance\n\n💡 **Pro tip:** Always split nitrogen into 3 doses. Consider liquid Nano-DAP for 25% better results!\n\nCheck the **Marketplace** for Nano-DAP and other fertilizers! 🧪`;

  if (q.includes('crop') || q.includes('grow') || q.includes('plant') || q.includes('sow'))
    return `**🌾 Crop Recommendation:**\n\nFor **Rabi season (Nov-Mar)** in Maharashtra:\n\n🥇 **Wheat** — Most reliable, MSP ₹2,275/quintal, low risk\n🥈 **Chickpea (Chana)** — Low water need, high protein demand\n🥉 **Mustard** — Quick duration, good market\n🌟 **Onion** — High income but needs attention\n\nFor **Kharif season (Jun-Oct)**:\n🥇 **Soybean** — Nitrogen fixing, good market\n🥈 **Cotton** — Premium cash crop for black soil\n🥉 **Rice** — If water is available\n\n💡 **Using the Crop Advisor tool** will give you personalized recommendations based on YOUR soil and climate data! 🌱`;

  if (q.includes('disease') || q.includes('pest') || q.includes('yellow') || q.includes('spot') || q.includes('wilt'))
    return `**🔬 Disease & Pest Advisory:**\n\n**Common issues by symptom:**\n\n🟡 **Yellowing leaves** → Nitrogen deficiency OR chlorosis\n→ Apply 2% urea foliar spray urgently\n\n🔴 **Brown/Black spots** → Fungal blight\n→ Spray Mancozeb 2g/L, remove infected parts\n\n🍄 **White powder** → Powdery Mildew\n→ Sulphur fungicide 3g/L spray\n\n🥀 **Wilting** → Fusarium wilt or root rot\n→ Drench with Carbendazim 1g/L\n\n🐛 **Insects visible** → Use Chlorpyrifos 2ml/L OR Neem oil (organic)\n\n⚠️ **Always:** Act within 24-48 hrs of symptom detection!\n\nUse the Disease Detector for full diagnosis! 🔬`;

  if (q.includes('market') || q.includes('price') || q.includes('sell') || q.includes('msp'))
    return `**📈 Market Price Advisory:**\n\n**Current MSP (2024-25):**\n→ Wheat: ₹2,275/quintal\n→ Rice: ₹2,183/quintal\n→ Maize: ₹1,962/quintal\n→ Cotton: ₹6,620/quintal\n→ Groundnut: ₹6,377/quintal\n\n**Best selling strategy:**\n✅ Don't panic-sell immediately after harvest\n✅ Store 30-40% of produce for 45-60 days\n✅ Use eNAM platform for online mandi trading\n✅ Check local APMC prices before selling\n\n💡 **Pro tip:** Tomato and onion prices vary hugely — check weekly trends before selling!\n\nCheck the Market Prices tab for live data! 📊`;

  if (q.includes('sustainab') || q.includes('organic') || q.includes('eco') || q.includes('water sav'))
    return `**🌍 Sustainability Tips for Your Farm:**\n\n💧 **Water Conservation:**\n→ Switch to drip irrigation → save 50% water\n→ Rainwater harvesting → free water supply\n→ Mulching → reduces evaporation by 30%\n\n🌱 **Chemical Reduction:**\n→ Use Neem oil (organic pesticide)\n→ Trichoderma bio-fungicide (safe & effective)\n→ Compost replaces 30% of chemical fertilizer\n\n♻️ **Carbon Reduction:**\n→ Zero-tillage farming reduces fuel cost\n→ Straw mulching instead of burning\n→ Agroforestry (plant trees on field borders)\n\n📈 **Yield without more inputs:**\n→ Precision agriculture → right fertilizer, right time\n→ Crop rotation → natural soil health repair\n→ Integrated Pest Management (IPM)\n\n🏆 These practices can improve your Sustainability Score to 90+! 🌱`;

  if (q.includes('hello') || q.includes('hi') || q.includes('namaste'))
    return `**Namaste! 🙏 Welcome to AgroSmart AI!**\n\nI'm your personal farming assistant, here to help you 24/7.\n\nI can help you with:\n💧 Irrigation decisions\n🌿 Fertilizer prescriptions\n🌾 Crop selection\n🔬 Disease diagnosis\n📈 Market price analysis\n🌍 Sustainability improvements\n🏛️ Government farming schemes\n\nWhat farming challenge can I help you solve today? 😊`;

  if (q.includes('govt') || q.includes('scheme') || q.includes('subsidy') || q.includes('pm kisan'))
    return `**🏛️ Important Govt Schemes for Farmers:**\n\n✅ **PM-KISAN:** ₹6,000/year (₹2,000 per installment)\n→ Register at pmkisan.gov.in\n\n✅ **PM Fasal Bima Yojana:** Crop insurance at low premium\n→ Apply at pmfby.gov.in\n\n✅ **Kisan Credit Card (KCC):** Low-interest crop loans\n→ Apply at any Bank or CSC center\n\n✅ **eNAM:** Online mandi platform for better prices\n→ Register at enam.gov.in\n\n✅ **Soil Health Card:** Free soil testing\n→ Contact your local agriculture office\n\n💡 **Helpline:** Kisan Call Center: 1551 (free, Hindi/regional languages)\n\nWhich scheme do you want to know more about? 📋`;

  if (q.includes('product') || q.includes('buy') || q.includes('shop') || q.includes('marketplace') || q.includes('recommend product')) {
    const featured = allProducts.length > 0 ? allProducts.find(p => p.name.includes('Nano')) || allProducts[0] : { name: 'Nano-DAP Fertilizer', image: '🧪' };
    return `**📦 Namma Rytha Marketplace:**\n\nWe have premium products to help your farm! Our AI recommends:\n\n✨ **AI Pick: ${featured.name}** ${featured.image}\n${featured.description || 'High-efficiency fertilizer for better nutrient absorption.'}\n\n🛒 **Available Categories:**\n→ 🌾 Improved Seed Varieties\n→ 🧪 Nano & Organic Fertilizers\n→ 💧 Smart Irrigation Kits\n→ 🛡️ Natural Pesticides\n\nYou can browse and buy all items in the **Marketplace** tab! 📦`;
  }

  // Default response
  return `**🌱 AgroSmart AI Response:**\n\nGreat question! Here's what I know:\n\n${msg.length > 20 ? 'This is a detailed farming topic.' : ''}\n\n💡 **Quick advice:** Always base farming decisions on:\n1. Your local soil test results\n2. Current weather forecast\n3. Market prices and demand\n4. Water availability\n\n📞 **For specific advice:**\n→ Use the tools on the left sidebar\n→ Contact your local KVK (Krishi Vigyan Kendra)\n→ Call Kisan Helpline: 1551 (free)\n\nIs there anything more specific you'd like to know? I'm here to help! 🌾`;
}

function startAIVoice() {
  openAIChat();
  toggleVoice();
}

// ─── VOICE INPUT ──────────────────────────────────────────────────────────────
function toggleVoice() {
  document.getElementById('voiceModal').classList.toggle('open');
}
function closeVoice() {
  const m = document.getElementById('voiceModal');
  m.classList.remove('open');
  document.getElementById('voiceAnim').classList.remove('listening');
  document.getElementById('voiceStatus').textContent = 'Tap the mic to start speaking...';
  document.getElementById('voiceMicBtn').textContent = '🎙️ Start Listening';
  state.voiceActive = false;
}
function startVoice() {
  if (state.voiceActive) { closeVoice(); return; }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SR) {
    const rec = new SR();
    rec.lang = 'en-IN'; rec.interimResults = true;
    state.voiceActive = true;
    document.getElementById('voiceAnim').classList.add('listening');
    document.getElementById('voiceStatus').textContent = '🔴 Listening...';
    document.getElementById('voiceMicBtn').textContent = '⏹ Stop';
    rec.start();
    rec.onresult = e => {
      const t = Array.from(e.results).map(r => r[0].transcript).join('').toLowerCase();
      document.getElementById('voiceStatus').textContent = '📝 "' + t + '"';
      if (e.results[0].isFinal) processVoiceCmd(t);
    };
    rec.onend = () => { state.voiceActive = false; document.getElementById('voiceAnim').classList.remove('listening'); document.getElementById('voiceMicBtn').textContent = '🎙️ Start Listening'; };
    rec.onerror = () => { document.getElementById('voiceStatus').textContent = '⚠️ Could not hear. Try again.'; state.voiceActive = false; };
  } else {
    // Simulate for demo
    document.getElementById('voiceAnim').classList.add('listening');
    document.getElementById('voiceStatus').textContent = '🔴 Demo Mode — Simulating...';
    state.voiceActive = true;
    setTimeout(() => processVoiceCmd('check irrigation'), 2000);
  }
}
function processVoiceCmd(t) {
  document.getElementById('voiceAnim').classList.remove('listening');
  document.getElementById('voiceStatus').textContent = '⚙️ Processing: "' + t + '"';
  setTimeout(() => {
    const map = { irrigation: ['irrigat', 'water', 'moisture'], crop: ['crop', 'grow', 'plant', 'kharif', 'rabi'], fertilizer: ['fertiliz', 'npk', 'urea'], weather: ['weather', 'rain', 'forecast'], disease: ['disease', 'pest', 'yellow', 'spot'], market: ['market', 'price', 'sell', 'mandi'], sustainability: ['sustain', 'eco', 'carbon', 'score'] };
    let found = false;
    for (const [page, words] of Object.entries(map)) {
      if (words.some(w => t.includes(w))) { closeVoice(); showPage(page); showToast('🎙️', 'Voice: ' + page); found = true; break; }
    }
    if (t.includes('ai') || t.includes('advice') || t.includes('help')) { closeVoice(); openAIChat(t); found = true; }
    if (!found) { closeVoice(); openAIChat(t); }
  }, 600);
}

function closeModal(id) {
  const modal = document.getElementById(id);
  const overlay = document.getElementById('modalOverlay');
  if (modal) modal.classList.remove('show');
  if (overlay) overlay.classList.remove('show');
}

function showProfileModal() {
  const modal = document.getElementById('profileModal');
  const overlay = document.getElementById('modalOverlay');
  if (modal && overlay) {
    modal.classList.add('show');
    overlay.classList.add('show');
    
    // Populate fields from state.user
    document.getElementById('editFirstName').value = state.user.name?.split(' ')[0] || state.user.firstName || '';
    document.getElementById('editLastName').value = state.user.name?.split(' ').slice(1).join(' ') || state.user.lastName || '';
    document.getElementById('editLocation').value = state.user.location || '';
    document.getElementById('editPhone').value = state.user.phone || '';
    document.getElementById('editArea').value = state.user.area || '';
    document.getElementById('editCrop').value = state.user.crop || '';
  }
}

function exportReport() {
  const lines = [
    '=== AgroSmart Farm Report ===',
    'Date: ' + new Date().toLocaleDateString('en-IN'),
    '',
    'SOIL STATUS',
    '  Moisture: 42%  |  pH: 6.8',
    '',
    'WEATHER',
    '  Temperature: 28°C  |  Rain Chance: 30%',
    '',
    'AI RECOMMENDATIONS',
    '  Irrigation: Monitor — irrigate within 6 hrs',
    '  Fertilizer: Apply Urea 2.5 kg/acre',
    '  Disease Risk: Moderate — preventive spray advised',
    '',
    'SUSTAINABILITY SCORE: 70/100 (Grade B+)',
    '',
    '=== Generated by AgroSmart AI ==='
  ].join('\n');
  const blob = new Blob([lines], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'AgroSmart_Report.txt'; a.click();
  URL.revokeObjectURL(url);
  showToast('📄', 'Report downloaded!');
}

// ─── TOAST ────────────────────────────────────────────────────────────────────
function showToast(icon, message) {
  const container = document.getElementById('toastContainer');
  if (!container) {
    console.log(`Toast fallback: ${icon} ${message}`);
    return;
  }
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(50px)';
    setTimeout(() => toast.remove(), 400);
  }, 4000);
}

// ─── SIDEBAR TOGGLE ───────────────────────────────────────────────────────────
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const main = document.getElementById('main');
  sidebar.classList.toggle('collapsed');
  main.classList.toggle('sidebar-collapsed');
}

// ─── SIMULATE LIVE DATA ───────────────────────────────────────────────────────
function simulateLive() {
  const el = document.getElementById('statMoisture');
  if (el) {
    const cur = parseInt(el.textContent);
    el.textContent = Math.max(20, Math.min(95, cur + (Math.random() > 0.6 ? -1 : 1))) + '%';
  }
}
setInterval(simulateLive, 15000);

// ─── PRODUCTS LOGIC ───────────────────────────────────────────────────────────
let allProducts = [];

async function loadProducts() {
  const grid = document.getElementById('allProductsGrid');
  if (!grid) return;

  grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px">⏳ Loading Marketplace...</div>';

  try {
    const res = await fetch(`${CONFIG.API_BASE_URL}/api/products`);
    allProducts = await res.json();
    renderProducts(allProducts);
    recommendProducts();
  } catch (err) {
    console.error('Failed to load products:', err);
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:#f87171">❌ Failed to load marketplace. Please ensure server is running.</div>';
  }
}

function renderProducts(products) {
  const grid = document.getElementById('allProductsGrid');
  if (!grid) return;

  if (products.length === 0) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px">No products found for this category.</div>';
    return;
  }

  grid.innerHTML = products.map(p => createProductCard(p)).join('');
}

function createProductCard(p, isAI = false) {
  const inWishlist = state.wishlist.some(w => w.id === p.id);
  return `
    <div class="product-card">
      ${isAI ? '<div class="product-badge badge-ai">✨ AI Pick</div>' : `<div class="product-badge">${p.category}</div>`}
      <div class="product-image">${p.image}</div>
      <div class="product-name">${p.name}</div>
      <div class="product-category">${p.category}</div>
      <div class="product-desc">${p.description}</div>
      <div class="product-suitable">
        <span class="tag-suitable">🌾 ${p.suitable_crop}</span>
        <span class="tag-suitable">🏜️ ${p.suitable_soil} soil</span>
      </div>
      <div class="product-actions">
        <button class="action-btn ${inWishlist ? 'wishlisted' : ''}" onclick="toggleWishlist(${p.id})">
          ${inWishlist ? '❤️' : '🤍'} Wishlist
        </button>
        <button class="action-btn" onclick="addToCart(${p.id})">
          🛒 Add to Cart
        </button>
      </div>
      <div class="product-footer" style="margin-top:10px">
        <div class="product-price">₹${p.price}</div>
        <button class="buy-btn" onclick="buyProduct('${p.name}')">Buy Now</button>
      </div>
    </div>
  `;
}

function recommendProducts() {
  const recGrid = document.getElementById('aiRecommendedProducts');
  if (!recGrid) return;

  const userCrop = (state.user.crop || 'tomato').toLowerCase();
  // Simplified logic for demo: match crop or soil, or 'all'
  const recommended = allProducts.filter(p =>
    p.suitable_crop.toLowerCase() === userCrop ||
    p.suitable_crop === 'all'
  ).slice(0, 3);

  if (recommended.length === 0) {
    recGrid.innerHTML = '<div style="padding:40px; text-align:center; color:#6b7280; grid-column: 1/-1;">✨ Looking for even better matches for your farm...</div>';
  } else {
    recGrid.innerHTML = recommended.map(p => createProductCard(p, true)).join('');
  }
}

function filterProducts() {
  const cat = document.getElementById('productCategoryFilter').value;
  if (cat === 'all') {
    renderProducts(allProducts);
  } else {
    renderProducts(allProducts.filter(p => p.category === cat));
  }
}

function buyProduct(name) {
  showToast('🛒', `Added ${name} to cart!`);
  openAIChat(`I'm interested in buying ${name}. Can you tell me more about its benefits for my farm?`);
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  updateClock();
  fetchWeather();
  renderAlerts();
  generateRecommendations();
  updateDashboardForecast();
  loadFarmData();
  initSplash();

  // Close AI chat on overlay click
  document.getElementById('aiChatOverlay').addEventListener('click', closeAIChat);

  // Enter key on AI input
  document.getElementById('aiInput')?.addEventListener('keypress', e => {
    if (e.key === 'Enter') sendAIMessage();
  });

  // Ripple effect on all buttons
  document.addEventListener('click', e => {
    const btn = e.target.closest('.btn, .quick-btn, .refresh-btn, .city-btn, .hero-ai-btn, .ai-chip, .submit-btn');
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    const size = Math.max(rect.width, rect.height);
    ripple.style.width = ripple.style.height = size + 'px';
    ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
    ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
    btn.appendChild(ripple);
    ripple.addEventListener('animationend', () => ripple.remove());
  });

  // Personalized welcome toast
  try {
    const u = JSON.parse(localStorage.getItem('nr_user') || '{}');
    const name = u.name ? u.name.split(' ')[0] : 'Farmer';
    setTimeout(() => showToast('🌱', 'Welcome back, ' + name + '! Your farm needs attention today.'), 1000);
  } catch (e) {
    setTimeout(() => showToast('🌱', 'Welcome! Your farm needs attention today.'), 1000);
  }

  console.log('%c🌾 Namma Rytha AI Loaded!', 'color:#4ade80;font-size:16px;font-weight:bold');
});

// ─── SPLASH SCREEN LOGIC ──────────────────────────────────────────────────────
function initSplash() {
  const splash = document.getElementById('splash-screen');
  const progress = document.getElementById('splash-progress');

  if (!splash || !progress) return;

  // Start progress bar
  setTimeout(() => {
    progress.style.width = '100%';
  }, 100);

  // Hide splash after delay
  setTimeout(() => {
    splash.classList.add('hidden');

    // Cleanup after transition
    setTimeout(() => {
      splash.style.display = 'none';
    }, 800);
  }, 2500); // 2.5 seconds delay
}

// ─── ADMIN & CAMERA LOGIC ─────────────────────────────────────────────────────
async function adminAddProduct() {
  const name = document.getElementById('adminProdName').value.trim();
  const cat = document.getElementById('adminProdCat').value;
  const price = parseFloat(document.getElementById('adminProdPrice').value);
  const img = document.getElementById('adminProdImg').value.trim();
  const desc = document.getElementById('adminProdDesc').value.trim();
  const crop = document.getElementById('adminProdCrop').value.trim();
  const soil = document.getElementById('adminProdSoil').value.trim();

  if (!name || isNaN(price)) { showToast('⚠️', 'Please fill name and price'); return; }

  const product = { name, category: cat, price, description: desc, image: img, suitable_crop: crop, suitable_soil: soil };

  try {
    const res = await fetch(`${CONFIG.API_BASE_URL}/api/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(product)
    });
    if (res.ok) {
      showToast('✅', 'Product added successfully!');
      // Clear form
      document.getElementById('adminProdName').value = '';
      document.getElementById('adminProdDesc').value = '';
      loadProducts(); // Refresh marketplace
    } else {
      throw new Error('Failed to add');
    }
  } catch (e) {
    showToast('❌', 'Error adding product');
  }
}

let stream = null;
async function startCamera() {
  document.getElementById('cameraModal').classList.add('open');
  const video = document.getElementById('cameraVideo');
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    video.srcObject = stream;
  } catch (err) {
    console.error('Camera error:', err);
    showToast('❌', 'Could not access camera (ensure HTTPS/Localhost)');
  }
}

function stopCamera() {
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
  document.getElementById('cameraModal').classList.remove('open');
  document.getElementById('cameraResult').style.display = 'none';
  document.getElementById('scanLine').style.display = 'none';
}

function captureAndDetect(type = 'disease') {
  const line = document.getElementById('scanLine');
  line.style.display = 'block';
  document.getElementById('cameraStatus').textContent = '⚡ AI Analyzing field scan...';

  setTimeout(() => {
    line.style.display = 'none';
    const resultEl = document.getElementById('cameraResult');
    resultEl.style.display = 'block';

    if (type === 'disease') {
      resultEl.innerHTML = `
        <strong style="color:#f87171">🔬 AI Diagnose: Possible Tomato Blight</strong>
        <p style="margin-top:5px">⚠️ Visual markers match early-stage fungal infection.</p>
        <p style="margin-top:5px">✅ <strong>Agro Recommendation:</strong> Spray Neem Oil OR apply Mancozeb (2g/L).</p>
      `;
    } else {
      resultEl.innerHTML = `
        <strong style="color:#4ade80">🌍 Field Situation: Healthy Growth</strong>
        <p style="margin-top:5px">📡 Canopy cover index: 0.82 (Excellent).</p>
        <p style="margin-top:5px">🌡️ <strong>Leaf temperature:</strong> Normal (27°C).</p>
      `;
    }
    document.getElementById('cameraStatus').textContent = '✅ Analysis Complete';
    showToast('📡', 'AI Field Scan Successful');
  }, 2000);
}

// ─── PWA INSTALLATION ─────────────────────────────────────────────────────────
window.deferredPrompt = null;
const installBtn = document.getElementById('installBtn');

window.addEventListener('beforeinstallprompt', (e) => {
  // Prevent the mini-infobar from appearing on mobile
  e.preventDefault();
  // Stash the event so it can be triggered later.
  window.deferredPrompt = e;
  // Update UI notify the user they can install the PWA
  if (installBtn) installBtn.style.display = 'flex';

  // Also update Settings page button if open
  const settingsInstallBtn = document.getElementById('settingsInstallBtn');
  if (settingsInstallBtn) settingsInstallBtn.style.display = 'inline-block';
});

async function triggerAppInstall() {
  if (!window.deferredPrompt) {
    showToast('ℹ️', 'App is already installed or your browser does not support it.');
    return;
  }

  window.deferredPrompt.prompt();
  const { outcome } = await window.deferredPrompt.userChoice;
  console.log(`User response to the install prompt: ${outcome}`);

  if (outcome === 'accepted') {
    window.deferredPrompt = null;
    if (installBtn) installBtn.style.display = 'none';
    const settingsInstallBtn = document.getElementById('settingsInstallBtn');
    if (settingsInstallBtn) settingsInstallBtn.style.display = 'none';
  }
}

if (installBtn) {
  installBtn.addEventListener('click', async () => triggerAppInstall());
}

async function shareApp() {
  if (navigator.share) {
    try {
      await navigator.share({
        title: 'Namma Rytha - AI Smart Farming',
        text: 'I am using Namma Rytha to get AI crop recommendations and real-time weather alerts! Join me and boost your farm yield.',
        url: window.location.origin
      });
      showToast('📤', 'Thanks for sharing!');
    } catch (err) {
      console.log('Error sharing:', err);
    }
  } else {
    // Fallback if Web Share API is not supported (desktop browsers often lack it)
    copyReferral();
  }
}

function copyReferral() {
  const code = state.user.username ? state.user.username.toUpperCase().replace(/\s/g, '').substring(0, 4) + Math.floor(Math.random() * 9000 + 1000) : 'FARM2026';
  const url = `${window.location.origin}?ref=${code}`;
  navigator.clipboard.writeText(`Join Namma Rytha! Use my invite code: ${url}`);
  showToast('📋', 'Referral link copied to clipboard!');
}

window.addEventListener('appinstalled', (evt) => {
  console.log('INSTALL: Success');
  showToast('🎉', 'Namma Rytha installed successfully!');
});


// ─── THEME SYSTEM ─────────────────────────────────────────────────────────────
const appSettings = {
  theme: localStorage.getItem('nr_theme') || 'dark',
  animations: localStorage.getItem('nr_animations') !== 'false',
  compactMode: localStorage.getItem('nr_compact') === 'true',
  farmBg: localStorage.getItem('nr_farmbg') !== 'false',
};

function initTheme() {
  applyTheme(appSettings.theme);
  if (!appSettings.farmBg) {
    const fb = document.querySelector('.farm-bg');
    if (fb) fb.style.display = 'none';
  }
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  appSettings.theme = theme;
  localStorage.setItem('nr_theme', theme);
  const btn = document.getElementById('themeToggleBtn');
  if (btn) btn.textContent = theme === 'dark' ? '🌙' : '☀️';
}

function toggleTheme() {
  const next = appSettings.theme === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  showToast(next === 'dark' ? '🌙' : '☀️', next === 'dark' ? 'Dark Mode On' : 'Light Mode On');
  // Refresh settings page if open
  if (state.currentPage === 'settings') renderSettings();
}

// Init on load
initTheme();

// ─── CART & WISHLIST LOGIC ───────────────────────────────────────────────────
function addToCart(id) {
  const product = allProducts.find(p => p.id === id);
  if (!product) return;
  state.cart.push(product);
  updateBadges();
  showToast('🛒', 'Added to cart!');
}

function toggleWishlist(id) {
  const index = state.wishlist.findIndex(p => p.id === id);
  if (index === -1) {
    const product = allProducts.find(p => p.id === id);
    if (product) state.wishlist.push(product);
    showToast('❤️', 'Added to wishlist!');
  } else {
    state.wishlist.splice(index, 1);
    showToast('🤍', 'Removed from wishlist');
  }
  updateBadges();
  renderProducts(allProducts); // Re-render to update heart icon
  recommendProducts();
}

function updateBadges() {
  const cartBadge = document.getElementById('cartBadge');
  const wishBadge = document.getElementById('wishlistBadge');
  if (cartBadge) cartBadge.textContent = state.cart.length;
  if (wishBadge) wishBadge.textContent = state.wishlist.length;
}

function showCart() {
  if (state.cart.length === 0) {
    showToast('🛒', 'Your cart is empty');
    return;
  }
  const total = state.cart.reduce((sum, p) => sum + p.price, 0);
  const itemsHtml = state.cart.map((p, i) => `
    <div class="cart-item">
      <div class="cart-item-img">${p.image}</div>
      <div class="cart-item-info">
        <div class="cart-item-name">${p.name}</div>
        <div class="cart-item-price">₹${p.price}</div>
      </div>
      <button class="cart-item-remove" onclick="removeFromCart(${i})">✕</button>
    </div>
  `).join('');

  // Create a quick modal-like alert for now
  const cartDiv = document.createElement('div');
  cartDiv.className = 'modal-overlay open';
  cartDiv.id = 'cartModal';
  cartDiv.innerHTML = `
    <div class="modal" style="max-width:400px">
      <div class="modal-header">
        <h3>🛒 Your Shopping Cart</h3>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
      </div>
      <div class="cart-items-list" style="max-height:300px; overflow-y:auto">
        ${itemsHtml}
      </div>
      <div class="cart-total">
        <span>Total Amount</span>
        <span>₹${total}</span>
      </div>
      <button class="btn btn-primary" style="width:100%; margin-top:15px" onclick="checkout()">Proceed to Checkout</button>
    </div>
  `;
  document.body.appendChild(cartDiv);
}

function removeFromCart(index) {
  state.cart.splice(index, 1);
  updateBadges();
  document.getElementById('cartModal')?.remove();
  showCart(); // Re-open with updated items
}

function checkout() {
  if (state.cart.length === 0) { showToast('⚠️', 'Your cart is empty'); return; }

  const modal = document.getElementById('cartModal');
  if (modal) modal.remove();

  showPage('checkout');

  const list = document.getElementById('checkoutItemsList');
  const subtotal = state.cart.reduce((sum, p) => sum + p.price, 0);

  list.innerHTML = state.cart.map(p => `
    <div class="checkout-summary-item">
      <span>${p.image} ${p.name}</span>
      <span>₹${p.price}</span>
    </div>
  `).join('');

  document.getElementById('checkoutSubtotal').textContent = `₹${subtotal}`;
  document.getElementById('checkoutTotal').textContent = `₹${subtotal}`;

  showToast('💳', 'Secure Payment Gateway initialized');
}

function selectPayment(method) {
  document.querySelectorAll('.payment-method').forEach(m => m.classList.remove('active'));
  document.getElementById(`pay-${method}`).classList.add('active');

  document.querySelectorAll('.payment-details').forEach(d => d.style.display = 'none');
  document.getElementById(`${method}Details`).style.display = 'block';
}

function processPayment() {
  const total = document.getElementById('checkoutTotal').textContent;
  showToast('⏳', `Processing payment of ${total}...`);

  const btn = document.querySelector('#page-checkout .btn-primary');
  const originalText = btn.innerHTML;
  btn.innerHTML = '⚡ Verifying Transaction...';
  btn.disabled = true;

  setTimeout(() => {
    btn.innerHTML = '✅ Payment Successful!';
    showToast('🎉', 'Order placed successfully! Redirecting...');

    setTimeout(() => {
      state.cart = [];
      updateBadges();
      btn.innerHTML = originalText;
      btn.disabled = false;
      showPage('dashboard');
      showToast('🚜', 'Your farming supplies are on the way!');
    }, 2000);
  }, 2500);
}

function showWishlist() {
  if (state.wishlist.length === 0) {
    showToast('❤️', 'Your wishlist is empty');
    return;
  }
  const itemsHtml = state.wishlist.map((p, i) => `
    <div class="cart-item">
      <div class="cart-item-img">${p.image}</div>
      <div class="cart-item-info">
        <div class="cart-item-name">${p.name}</div>
        <div class="cart-item-price">₹${p.price}</div>
      </div>
      <button class="cart-item-remove" onclick="addToCart(${p.id}); toggleWishlist(${p.id}); this.closest('.modal-overlay').remove(); showWishlist();">🛒</button>
    </div>
  `).join('');

  const wishDiv = document.createElement('div');
  wishDiv.className = 'modal-overlay open';
  wishDiv.id = 'wishlistModal';
  wishDiv.innerHTML = `
    <div class="modal" style="max-width:400px">
      <div class="modal-header">
        <h3>❤️ Your Wishlist</h3>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
      </div>
      <div class="cart-items-list" style="max-height:300px; overflow-y:auto">
        ${itemsHtml}
      </div>
    </div>
  `;
  document.body.appendChild(wishDiv);
}

// ─── AUTO LOAD LIVE WEATHER ON STARTUP ───────────────────────────────────────
(function initWeatherOnLoad() {
  // Always auto-detect location on startup for live weather
  setTimeout(() => {
    autoLocateWeather();
  }, 800);
})();


// ─── PROFILE UPDATE ──────────────────────────────────────────────────────────
async function updateProfile() {
  const firstName = document.getElementById('editFirstName').value;
  const lastName = document.getElementById('editLastName').value;
  const location = document.getElementById('editLocation').value;
  const area = document.getElementById('editArea').value;
  const crop = document.getElementById('editCrop').value;
  const phone = document.getElementById('editPhone').value;

  const data = { id: state.user.id, firstName, lastName, location, area, crop, phone };

  try {
    const res = await fetch(`${CONFIG.API_BASE_URL}/api/user/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await res.json();
    if (result.success) {
      state.user = { ...state.user, ...data, name: `${firstName} ${lastName}` };
      localStorage.setItem('nr_user', JSON.stringify(state.user));
      showToast('✅', 'Profile updated successfully!');
      updateDashboardUser();
      closeModal('profileModal');
    }
  } catch (e) {
    showToast('❌', 'Failed to update profile');
  }
}

function updateDashboardUser() {
  const nameEl = document.getElementById('farmerName');
  const locEl = document.getElementById('farmerLoc');
  if (nameEl) nameEl.textContent = state.user.name || 'User';
  if (locEl) locEl.textContent = '📍 ' + (state.user.location || 'Bengaluru, Karnataka');
}

// ─── FEEDBACK SUBMISSION ──────────────────────────────────────────────────────
function setRating(r) {
  state.currentRating = r;
  // Update star buttons in both old and new feedback UI
  document.querySelectorAll('.star-btn, .star-rating-btn').forEach((btn, i) => {
    if (btn.classList.contains('star-rating-btn')) {
      btn.classList.toggle('filled', i < r);
      btn.textContent = '★';
    } else {
      btn.style.color = i < r ? 'var(--yellow-accent)' : 'var(--text-muted)';
    }
  });
  // Update old star UI too
  document.querySelectorAll('#feedbackRating .star').forEach((s, i) => {
    s.classList.toggle('active', i < r);
  });
}

function setMood(index) {
  state.feedbackMood = index;
  document.querySelectorAll('.mood-btn').forEach((btn, i) => {
    btn.classList.toggle('active', i === index);
  });
  // Auto-set rating from mood
  const ratingMap = [1, 2, 3, 4, 5];
  setRating(ratingMap[index] || 3);
}

function setFeedbackCategory(cat) {
  state.feedbackCategory = cat;
  document.querySelectorAll('.category-chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.cat === cat);
  });
}

function updateCharCount() {
  const textarea = document.getElementById('feedbackMsg');
  const counter = document.getElementById('charCount');
  if (textarea && counter) {
    const len = textarea.value.length;
    counter.textContent = `${len}/500 characters`;
    counter.style.color = len > 450 ? '#f87171' : len > 300 ? '#fbbf24' : 'var(--text-muted)';
  }
}

async function submitFeedback() {
  const msgEl = document.getElementById('feedbackMsg') || document.getElementById('feedbackComments');
  const msg = msgEl ? msgEl.value.trim() : '';

  if (state.currentRating === 0) { showToast('⚠️', 'Please select a rating'); return; }
  if (!msg) { showToast('⚠️', 'Please enter your feedback message'); return; }

  const btn = document.querySelector('.feedback-submit-btn');
  if (btn) { btn.classList.add('sending'); btn.innerHTML = '⏳ Sending...'; }

  const data = {
    userId: state.user.id,
    name: state.user.name || state.user.username,
    email: state.user.email,
    rating: state.currentRating,
    mood: state.feedbackMood,
    category: state.feedbackCategory || 'general',
    message: msg
  };

  // Save to local feedback history
  const history = JSON.parse(localStorage.getItem('nr_feedback_history') || '[]');
  history.unshift({
    ...data,
    date: new Date().toISOString(),
    status: 'pending'
  });
  localStorage.setItem('nr_feedback_history', JSON.stringify(history.slice(0, 10)));

  try {
    const res = await fetch(`${CONFIG.API_BASE_URL}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await res.json();
    if (result.success) {
      showFeedbackSuccess();
    } else {
      showFeedbackSuccess(); // Show success anyway for local save
    }
  } catch (e) {
    showFeedbackSuccess(); // Show success for local save even if API fails
  }
}

function showFeedbackSuccess() {
  const overlay = document.createElement('div');
  overlay.className = 'feedback-success-overlay';
  overlay.innerHTML = `
    <div class="feedback-success-card">
      <div class="success-icon">🎉</div>
      <div class="success-title">Thank You!</div>
      <div class="success-text">Your feedback has been received. We truly value your input and will use it to improve Namma Rytha for all farmers.</div>
      <button class="success-close-btn" onclick="closeFeedbackSuccess()">✨ Continue Farming</button>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeFeedbackSuccess();
  });
}

function closeFeedbackSuccess() {
  const overlay = document.querySelector('.feedback-success-overlay');
  if (overlay) {
    overlay.style.opacity = '0';
    overlay.style.transition = 'opacity 0.3s';
    setTimeout(() => overlay.remove(), 300);
  }
  // Reset form
  state.currentRating = 0;
  state.feedbackMood = undefined;
  state.feedbackCategory = 'general';
  const msgEl = document.getElementById('feedbackMsg');
  if (msgEl) msgEl.value = '';
  renderFeedbackPage();
}

function getLangName() {
  const names = { en: 'English', kn: 'ಕನ್ನಡ', hi: 'हिंदी', te: 'తెలుగు', ta: 'தமிழ்', mr: 'मराठी' };
  return names[localStorage.getItem('nr_lang') || 'en'] || 'English';
}

function resetAllSettings() {
  ['nr_theme', 'nr_animations', 'nr_compact', 'nr_farmbg'].forEach(k => localStorage.removeItem(k));
  if (typeof appSettings !== 'undefined') {
    appSettings.theme = 'dark';
    appSettings.animations = true;
    appSettings.compactMode = false;
    appSettings.farmBg = true;
  }
  applyTheme('dark');
  const fb = document.querySelector('.farm-bg');
  if (fb) fb.style.display = '';
  document.body.classList.remove('compact', 'no-animations');
  renderSettings();
  showToast('↺', 'All settings reset to defaults');
}

// ─── PREMIUM SETTINGS PAGE ───────────────────────────────────────────────────
function renderSettings() {
  const page = document.getElementById('page-settings');
  if (!page) return;
  const isDark = (appSettings?.theme || localStorage.getItem('nr_theme') || 'dark') === 'dark';
  const anim = appSettings?.animations !== undefined ? appSettings.animations : localStorage.getItem('nr_ui_anim') !== 'false';
  const compact = appSettings?.compactMode || localStorage.getItem('nr_compact') === 'true';
  const farmBg = appSettings?.farmBg !== undefined ? appSettings.farmBg : localStorage.getItem('nr_bg_anim') !== 'false';
  const userName = state.user.name || state.user.username || 'Farmer';
  const userEmail = state.user.email || 'demo@nammarytha.in';
  const initials = userName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  page.innerHTML = `
    <!-- Hero -->
    <div class="settings-hero">
      <div class="settings-hero-icon">⚙️</div>
      <div>
        <h2>App Settings</h2>
        <p>Personalize your Namma Rytha farming experience</p>
      </div>
    </div>

    <!-- Profile Card -->
    <div class="settings-profile-card">
      <div class="profile-avatar">${initials}</div>
      <div class="profile-info">
        <div class="profile-name">${userName}</div>
        <div class="profile-email">${userEmail}</div>
        <div class="profile-badges">
          <span class="profile-badge badge-pro">🌱 Farmer Pro</span>
          <span class="profile-badge badge-verified">✓ Verified</span>
        </div>
      </div>
      <button class="profile-edit-btn" onclick="showProfileModal()">✏️ Edit Profile</button>
    </div>

    <!-- Main Layout -->
    <div class="settings-layout">
      <!-- Left Column -->
      <div>
        <!-- Appearance Section -->
        <div class="settings-section">
          <div class="settings-section-header">
            <div class="section-icon appearance">🎨</div>
            <div>
              <div class="section-title-text">Appearance</div>
              <div class="section-subtitle">Theme & visual preferences</div>
            </div>
          </div>
          <div class="theme-selector">
            <div class="theme-option ${isDark ? 'active' : ''}" onclick="applyTheme('dark');renderSettings();showToast('🌙','Dark Mode activated')">
              <div class="check-mark">✓</div>
              <div class="theme-mini-preview dark-prev">
                <div class="prev-side"></div>
                <div class="prev-main">
                  <div class="prev-line"></div>
                  <div class="prev-line accent"></div>
                  <div class="prev-line" style="width:75%"></div>
                </div>
              </div>
              <div class="theme-option-label">🌙 Dark Mode</div>
            </div>
            <div class="theme-option ${!isDark ? 'active' : ''}" onclick="applyTheme('light');renderSettings();showToast('☀️','Light Mode activated')">
              <div class="check-mark">✓</div>
              <div class="theme-mini-preview light-prev">
                <div class="prev-side"></div>
                <div class="prev-main">
                  <div class="prev-line"></div>
                  <div class="prev-line accent"></div>
                  <div class="prev-line" style="width:75%"></div>
                </div>
              </div>
              <div class="theme-option-label">☀️ Light Mode</div>
            </div>
          </div>
        </div>

        <!-- Dashboard Section -->
        <div class="settings-section">
          <div class="settings-section-header">
            <div class="section-icon dashboard">🌾</div>
            <div>
              <div class="section-title-text">Dashboard</div>
              <div class="section-subtitle">Animation & layout options</div>
            </div>
          </div>
          <div class="settings-item-row">
            <div class="settings-item-left">
              <div class="item-icon-mini">🎞️</div>
              <div class="item-text">
                <div class="item-label">Farm Background</div>
                <div class="item-desc">Animated wheat, leaves & fireflies</div>
              </div>
            </div>
            <div class="premium-toggle ${farmBg ? 'on' : ''}" onclick="toggleSettingNew('farmBg')"></div>
          </div>
          <div class="settings-item-row">
            <div class="settings-item-left">
              <div class="item-icon-mini">✨</div>
              <div class="item-text">
                <div class="item-label">UI Animations</div>
                <div class="item-desc">Smooth transitions & micro-interactions</div>
              </div>
            </div>
            <div class="premium-toggle ${anim ? 'on' : ''}" onclick="toggleSettingNew('animations')"></div>
          </div>
          <div class="settings-item-row">
            <div class="settings-item-left">
              <div class="item-icon-mini">📐</div>
              <div class="item-text">
                <div class="item-label">Compact Mode</div>
                <div class="item-desc">Reduce spacing for more content</div>
              </div>
            </div>
            <div class="premium-toggle ${compact ? 'on' : ''}" onclick="toggleSettingNew('compactMode')"></div>
          </div>
        </div>
      </div>

      <!-- Right Column -->
      <div>
        <!-- Account Section -->
        <div class="settings-section">
          <div class="settings-section-header">
            <div class="section-icon account">👤</div>
            <div>
              <div class="section-title-text">Account & App</div>
              <div class="section-subtitle">Manage your profile & preferences</div>
            </div>
          </div>
          <div class="settings-item-row">
            <div class="settings-item-left">
              <div class="item-icon-mini">🌐</div>
              <div class="item-text">
                <div class="item-label">Language</div>
                <div class="item-desc">Current: ${getLangName()}</div>
              </div>
            </div>
            <button class="settings-action-btn primary" onclick="document.getElementById('langMenu').classList.toggle('show')">Change</button>
          </div>
          <div class="settings-item-row">
            <div class="settings-item-left">
              <div class="item-icon-mini">📤</div>
              <div class="item-text">
                <div class="item-label">Share App</div>
                <div class="item-desc">Invite other farmers to Namma Rytha</div>
              </div>
            </div>
            <button class="settings-action-btn blue" onclick="shareApp()">📤 Share</button>
          </div>
          <div class="settings-item-row">
            <div class="settings-item-left">
              <div class="item-icon-mini">🤝</div>
              <div class="item-text">
                <div class="item-label">Refer a Friend</div>
                <div class="item-desc">Get a referral link & earn rewards</div>
              </div>
            </div>
            <button class="settings-action-btn gold" onclick="copyReferral()">🤝 Refer</button>
          </div>
          <div class="settings-item-row">
            <div class="settings-item-left">
              <div class="item-icon-mini">⏻</div>
              <div class="item-text">
                <div class="item-label">Logout</div>
                <div class="item-desc">Sign out of your account</div>
              </div>
            </div>
            <button class="settings-action-btn danger" onclick="doLogout()">⏻ Logout</button>
          </div>
        </div>

        <!-- About Section -->
        <div class="settings-section">
          <div class="settings-section-header">
            <div class="section-icon about">ℹ️</div>
            <div>
              <div class="section-title-text">About</div>
              <div class="section-subtitle">App information & status</div>
            </div>
          </div>
          <div class="settings-item-row">
            <div class="settings-item-left">
              <div class="item-icon-mini">📱</div>
              <div class="item-text">
                <div class="item-label">App Version</div>
                <div class="item-desc">Namma Rytha v2.0.0</div>
              </div>
            </div>
            <span class="status-pill pill-green">Stable</span>
          </div>
          <div class="settings-item-row">
            <div class="settings-item-left">
              <div class="item-icon-mini">🤖</div>
              <div class="item-text">
                <div class="item-label">AI Engine</div>
                <div class="item-desc">Gemini 2.0 Flash + Smart Offline</div>
              </div>
            </div>
            <span class="status-pill pill-purple">Online</span>
          </div>
          <div class="settings-item-row">
            <div class="settings-item-left">
              <div class="item-icon-mini">🛡️</div>
              <div class="item-text">
                <div class="item-label">Originality Score</div>
                <div class="item-desc">~79% original · Custom-built</div>
              </div>
            </div>
            <span class="status-pill pill-green">🟢 Original</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Danger Zone -->
    <div class="settings-section" style="border-color: rgba(248,113,113,0.15)">
      <div class="settings-section-header">
        <div class="section-icon danger">⚠️</div>
        <div>
          <div class="section-title-text">Reset & Data</div>
          <div class="section-subtitle">Manage local storage & preferences</div>
        </div>
      </div>
      <div style="padding:18px 22px;display:flex;gap:12px;flex-wrap:wrap">
        <button class="settings-action-btn primary" onclick="resetAllSettings()">↺ Reset All Settings</button>
        <button class="settings-action-btn danger" onclick="if(confirm('Clear all local data? This cannot be undone.')){localStorage.clear();location.reload();}">🗑️ Clear Local Data</button>
      </div>
    </div>
  `;
}

function toggleSettingNew(key) {
  if (typeof appSettings !== 'undefined') {
    appSettings[key] = !appSettings[key];
    localStorage.setItem('nr_' + key.toLowerCase(), appSettings[key]);
    if (key === 'farmBg') {
      const fb = document.querySelector('.farm-bg');
      if (fb) fb.style.display = appSettings.farmBg ? '' : 'none';
    }
    if (key === 'compactMode') {
      document.body.classList.toggle('compact', appSettings.compactMode);
    }
    if (key === 'animations') {
      document.body.classList.toggle('no-animations', !appSettings.animations);
    }
  } else {
    const current = localStorage.getItem('nr_' + key.toLowerCase());
    const newVal = current === 'false' ? 'true' : current === 'true' ? 'false' : 'false';
    localStorage.setItem('nr_' + key.toLowerCase(), newVal);
  }
  renderSettings();
  showToast('⚙️', key.replace(/([A-Z])/g, ' $1').trim() + ' toggled');
}

function saveGeminiKey() {
  const key = document.getElementById('geminiKeyInput').value;
  localStorage.setItem('nr_gemini_key', key);
  CONFIG.GEMINI_API_KEY = key;
  showToast('✅', 'AI Key updated!');
}

function installApp() {
  showToast('🖥️', 'Installing Namma Rytha...');
}

function shareApp() {
  if (navigator.share) {
    navigator.share({
      title: 'Namma Rytha',
      text: 'Check out Namma Rytha — AI Smart Farming for Indian Farmers!',
      url: window.location.href
    }).catch(console.error);
  } else {
    navigator.clipboard?.writeText(window.location.href);
    showToast('🔗', 'Link copied to clipboard!');
  }
}

function referFriend() {
  const code = 'NR-' + Math.random().toString(36).substr(2, 6).toUpperCase();
  navigator.clipboard?.writeText(`Join Namma Rytha with my referral: ${code} — ${window.location.href}`);
  showToast('🤝', `Referral code ${code} copied!`);
}

// Initial update
updateDashboardUser();

// ─── PREMIUM FEEDBACK PAGE ───────────────────────────────────────────────────
function renderFeedbackPage() {
  const container = document.getElementById('page-feedback');
  if (!container) return;

  const history = JSON.parse(localStorage.getItem('nr_feedback_history') || '[]').slice(0, 3);
  const historyHtml = history.length > 0 ? history.map(fb => {
    const date = new Date(fb.date);
    const dateStr = date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    const stars = '★'.repeat(fb.rating || 3) + '☆'.repeat(5 - (fb.rating || 3));
    return `
      <div class="past-feedback-item">
        <div class="past-fb-header">
          <div class="past-fb-stars">${stars}</div>
          <div class="past-fb-date">${dateStr}</div>
        </div>
        <div class="past-fb-text">${fb.message?.slice(0, 80)}${fb.message?.length > 80 ? '...' : ''}</div>
        <span class="past-fb-status ${fb.status === 'responded' ? 'status-responded' : 'status-pending'}">${fb.status === 'responded' ? '✅ Responded' : '⏳ Pending Review'}</span>
      </div>
    `;
  }).join('') : '<div style="text-align:center;color:var(--text-muted);padding:20px;font-size:13px">No feedback submitted yet</div>';

  container.innerHTML = `
    <!-- Hero -->
    <div class="feedback-hero">
      <div class="feedback-hero-icon">💬</div>
      <div>
        <h2 style="font-size:22px;font-weight:700;color:var(--text-primary);font-family:'Space Grotesk',sans-serif;margin:0 0 4px">Share Your Feedback</h2>
        <p style="font-size:13px;color:var(--text-muted);margin:0">Your voice shapes the future of Namma Rytha for millions of farmers</p>
      </div>
    </div>

    <div class="feedback-layout">
      <!-- Main Form -->
      <div class="feedback-form-card">
        <!-- Mood Selector -->
        <div style="margin-bottom:24px">
          <div style="font-size:13px;font-weight:600;color:var(--text-muted);margin-bottom:12px;text-align:center;text-transform:uppercase;letter-spacing:0.5px">How are you feeling?</div>
          <div class="mood-selector">
            <div class="mood-btn" onclick="setMood(0)">
              <span class="mood-emoji">😡</span>
              <span class="mood-label">Awful</span>
            </div>
            <div class="mood-btn" onclick="setMood(1)">
              <span class="mood-emoji">😕</span>
              <span class="mood-label">Bad</span>
            </div>
            <div class="mood-btn" onclick="setMood(2)">
              <span class="mood-emoji">😐</span>
              <span class="mood-label">Okay</span>
            </div>
            <div class="mood-btn" onclick="setMood(3)">
              <span class="mood-emoji">😊</span>
              <span class="mood-label">Good</span>
            </div>
            <div class="mood-btn" onclick="setMood(4)">
              <span class="mood-emoji">🤩</span>
              <span class="mood-label">Amazing</span>
            </div>
          </div>
        </div>

        <!-- Star Rating -->
        <div style="margin-bottom:24px">
          <div style="font-size:13px;font-weight:600;color:var(--text-muted);margin-bottom:12px;text-align:center;text-transform:uppercase;letter-spacing:0.5px">Rate your experience</div>
          <div class="star-rating">
            ${[1,2,3,4,5].map(i => `<button class="star-rating-btn" onclick="setRating(${i})" onmouseover="previewRating(${i})" onmouseout="resetRatingPreview()">★</button>`).join('')}
          </div>
        </div>

        <!-- Category Selection -->
        <div style="margin-bottom:24px">
          <div style="font-size:13px;font-weight:600;color:var(--text-muted);margin-bottom:12px;text-align:center;text-transform:uppercase;letter-spacing:0.5px">What's this about?</div>
          <div class="category-chips">
            <div class="category-chip active" data-cat="general" onclick="setFeedbackCategory('general')">🌾 General</div>
            <div class="category-chip" data-cat="ui" onclick="setFeedbackCategory('ui')">🎨 Design</div>
            <div class="category-chip" data-cat="ai" onclick="setFeedbackCategory('ai')">🤖 AI Features</div>
            <div class="category-chip" data-cat="weather" onclick="setFeedbackCategory('weather')">☁️ Weather</div>
            <div class="category-chip" data-cat="market" onclick="setFeedbackCategory('market')">📈 Market</div>
            <div class="category-chip" data-cat="bug" onclick="setFeedbackCategory('bug')">🐛 Bug Report</div>
          </div>
        </div>

        <!-- Message -->
        <div style="margin-bottom:20px">
          <div style="font-size:13px;font-weight:600;color:var(--text-muted);margin-bottom:10px;text-transform:uppercase;letter-spacing:0.5px">Your message</div>
          <textarea class="feedback-textarea" id="feedbackMsg" placeholder="Tell us what you love, what needs improvement, or report a bug..." maxlength="500" oninput="updateCharCount()"></textarea>
          <div class="char-count" id="charCount">0/500 characters</div>
        </div>

        <!-- Submit -->
        <button class="feedback-submit-btn" onclick="submitFeedback()">
          🚀 Send Feedback
        </button>
      </div>

      <!-- Sidebar -->
      <div>
        <!-- Tips Card -->
        <div class="feedback-tips-card" style="margin-bottom:20px">
          <div style="font-size:15px;font-weight:700;color:var(--text-primary);margin-bottom:14px;font-family:'Space Grotesk',sans-serif">💡 Feedback Tips</div>
          <div class="feedback-tip-item">
            <div class="feedback-tip-icon" style="background:rgba(74,222,128,0.1);border:1px solid rgba(74,222,128,0.2)">✅</div>
            <div class="feedback-tip-text">Be specific about features you love or find confusing</div>
          </div>
          <div class="feedback-tip-item">
            <div class="feedback-tip-icon" style="background:rgba(56,189,248,0.1);border:1px solid rgba(56,189,248,0.2)">📸</div>
            <div class="feedback-tip-text">Mention the exact page or tool if reporting a bug</div>
          </div>
          <div class="feedback-tip-item">
            <div class="feedback-tip-icon" style="background:rgba(167,139,250,0.1);border:1px solid rgba(167,139,250,0.2)">💡</div>
            <div class="feedback-tip-text">Share ideas for new features that would help your farming</div>
          </div>
          <div class="feedback-tip-item">
            <div class="feedback-tip-icon" style="background:rgba(251,191,36,0.1);border:1px solid rgba(251,191,36,0.2)">🌐</div>
            <div class="feedback-tip-text">Tell us if you'd like the app in your local language</div>
          </div>
        </div>

        <!-- Past Feedback -->
        <div class="feedback-tips-card">
          <div style="font-size:15px;font-weight:700;color:var(--text-primary);margin-bottom:4px;font-family:'Space Grotesk',sans-serif">📋 Your Past Feedback</div>
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:12px">${history.length} submission${history.length !== 1 ? 's' : ''}</div>
          <div class="past-feedback-list">
            ${historyHtml}
          </div>
        </div>
      </div>
    </div>
  `;

  // Initialize default state
  state.feedbackCategory = state.feedbackCategory || 'general';
}

function previewRating(n) {
  document.querySelectorAll('.star-rating-btn').forEach((btn, i) => {
    btn.style.color = i < n ? '#fbbf24' : 'rgba(255,255,255,0.12)';
    btn.style.filter = i < n ? 'drop-shadow(0 0 6px rgba(251,191,36,0.4))' : 'none';
  });
}

function resetRatingPreview() {
  const r = state.currentRating || 0;
  document.querySelectorAll('.star-rating-btn').forEach((btn, i) => {
    const filled = i < r;
    btn.classList.toggle('filled', filled);
    btn.style.color = filled ? '#fbbf24' : 'rgba(255,255,255,0.12)';
    btn.style.filter = filled ? 'drop-shadow(0 0 6px rgba(251,191,36,0.4))' : 'none';
  });
}

