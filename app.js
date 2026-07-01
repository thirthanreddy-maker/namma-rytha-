'use strict';

// ─── CONFIG ───────────────────────────────────────────────────────────────────
// Auto-detect: use real IP on Android (Capacitor), localhost on web browser
const _isNative = (() => { try { return window.Capacitor && window.Capacitor.isNativePlatform(); } catch(e) { return false; } })();
const CONFIG = {
  API_BASE_URL: (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && !_isNative
    ? ''
    : (window.location.protocol === 'file:' || window.location.hostname === '')
      ? 'http://localhost:3000'
      : 'https://namma-rytha-backend.onrender.com',
  // Free key from https://aistudio.google.com/app/apikey
  GEMINI_API_KEY: localStorage.getItem('nr_gemini_key') || 'DEMO_KEY',
  GEMINI_URL: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
  USE_AI: true   // set false to use offline smart responses only
};

// ─── STATE ────────────────────────────────────────────────────────────────────
const state = {
  currentPage: 'dashboard',
  activeSettingsTab: 'profile',
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


async function logUserActivity(action, details = '') {
  if (!state.user || !state.user.id) return;
  try {
    await fetch(`${CONFIG.API_BASE_URL}/api/activity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: state.user.id,
        userName: state.user.name || state.user.email || 'Farmer',
        action: action,
        details: details
      })
    });
  } catch (e) {
    console.error('Failed to log user activity:', e);
  }
}

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
    `&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,uv_index,is_day` +
    `&hourly=precipitation_probability` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max` +
    `&timezone=auto&forecast_days=7`;
  const res = await fetch(url);
  const d = await res.json();
  const cur = d.current;
  const daily = d.daily;

  // precipitation_probability is only available in hourly, not current.
  // Pick the maximum value for today's remaining hours (next 12 hours) as current rain chance.
  let rainProbability = 0;
  if (d.hourly && d.hourly.precipitation_probability && d.hourly.time) {
    const now = new Date(cur.time);
    const next12 = d.hourly.time
      .map((t, i) => ({ t: new Date(t), v: d.hourly.precipitation_probability[i] }))
      .filter(x => x.t >= now && x.t <= new Date(now.getTime() + 12 * 3600 * 1000))
      .map(x => x.v);
    rainProbability = next12.length > 0 ? Math.max(...next12) : 0;
  }

  const data = {
    city: cityLabel,
    icon: getWeatherIcon(cur.weather_code),
    temp: Math.round(cur.temperature_2m),
    feelsLike: Math.round(cur.apparent_temperature || cur.temperature_2m),
    desc: getWeatherDesc(cur.weather_code),
    humidity: cur.relative_humidity_2m,
    wind: Math.round(cur.wind_speed_10m),
    uv: Math.round(cur.uv_index || 0),
    rain: rainProbability
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

// Real-time market data is fetched dynamically.



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

  const titles = { dashboard: 'Farm Dashboard', irrigation: 'Irrigation Advisor', fertilizer: 'Fertilizer Engine', crop: 'Crop Recommendation', disease: 'Disease Detector', weather: 'Weather Intelligence', market: 'Market Prices', sustainability: 'Sustainability Score', products: 'Tools & Accessories', admin: 'Admin Dashboard', settings: 'Settings', feedback: 'Farmer Feedback' };
  const titleKeys = { dashboard: 'farm_dashboard_title', irrigation: 'smart_irrigation_title', fertilizer: 'fertilizer_title', crop: 'crop_advisor_title', disease: 'disease_title', weather: 'weather_title', market: 'market_title', sustainability: 'sustainability_title', products: 'marketplace', settings: 'settings', feedback: 'feedback_title' };
  const subs = { dashboard: 'Overview → Today', irrigation: 'Tools → Irrigation', fertilizer: 'Tools → Fertilizer', crop: 'Tools → Crop Advisor', disease: 'Tools → Disease Diag', weather: 'Data → Weather', market: 'Data → Market', sustainability: 'Reports → Eco Impact', products: 'Shop → Tools & Accessories', admin: 'Management → Admin Control', settings: 'App → Preferences', feedback: 'Community → Voice' };
  
  // Use translated title if language is set
  const currentLang = localStorage.getItem('nr_lang') || 'en';
  let pageTitle = titles[id] || 'AgroSmart';
  if (typeof TRANSLATIONS !== 'undefined' && TRANSLATIONS[currentLang] && titleKeys[id]) {
    pageTitle = TRANSLATIONS[currentLang][titleKeys[id]] || pageTitle;
  }
  state.currentPage = id;

  // Re-apply translations to the newly visible page
  if (typeof applyLocalTranslations === 'function' && currentLang !== 'en') {
    setTimeout(() => { applyLocalTranslations(currentLang); }, 50);
  }

  // ─── AUTO-POPULATE DATA HOOKS ON TAB CHANGE ───
  if (id === 'irrigation') {
    const moistureInput = document.getElementById('soilMoisture');
    if (moistureInput) {
      const liveMoisture = parseFloat(document.getElementById('statMoisture')?.textContent) || 42;
      moistureInput.value = liveMoisture;
      const moistureVal = document.getElementById('moistureVal');
      if (moistureVal) moistureVal.textContent = liveMoisture;
      
      // Update the track color/fill of the slider
      updateSlider('soilMoisture', 'moistureVal');
    }
    const tempInput = document.getElementById('tempInput');
    if (tempInput && state._liveWeather) {
      tempInput.value = state._liveWeather.temp;
    }
    if (state._liveWeather) {
      setRain(state._liveWeather.rain >= 50);
    }
  }

  if (id === 'crop') {
    const avgTempInput = document.getElementById('avgTemp');
    if (avgTempInput) {
      const liveTemp = state._liveWeather ? state._liveWeather.temp : 25;
      avgTempInput.value = liveTemp;
      const avgTempVal = document.getElementById('avgTempVal');
      if (avgTempVal) avgTempVal.textContent = liveTemp;
    }
    const seasonSelect = document.getElementById('season');
    if (seasonSelect) {
      const month = new Date().getMonth();
      let season = 'rabi';
      if (month >= 5 && month <= 9) { // Jun to Oct
        season = 'kharif';
      } else if (month >= 2 && month <= 4) { // Mar to May
        season = 'zaid';
      }
      seasonSelect.value = season;
    }
    const rainfallInput = document.getElementById('rainfall');
    if (rainfallInput) {
      const month = new Date().getMonth();
      const estimatedRainfall = (month >= 5 && month <= 9) ? 1200 : 600;
      rainfallInput.value = estimatedRainfall;
      const rainfallVal = document.getElementById('rainfallVal');
      if (rainfallVal) rainfallVal.textContent = estimatedRainfall;
    }
    const cropPHInput = document.getElementById('cropPH');
    if (cropPHInput) {
      const livePH = parseFloat(document.getElementById('statPH')?.textContent) || 6.8;
      cropPHInput.value = livePH;
      const cropPhVal = document.getElementById('cropPhVal');
      if (cropPhVal) cropPhVal.textContent = livePH;
    }
  }

  if (id === 'disease') {
    const disHumInput = document.getElementById('diseaseHumidity');
    if (disHumInput && state._liveWeather) {
      disHumInput.value = state._liveWeather.humidity;
      const humVal = document.getElementById('humidityVal');
      if (humVal) humVal.textContent = state._liveWeather.humidity;
    }
  }

  // Pre-select crop type based on user profile crop
  if (state.user && state.user.crop) {
    const crop = state.user.crop;
    const cIrr = document.getElementById('cropTypeIrr');
    if (cIrr) cIrr.value = crop;
    
    const cFert = document.getElementById('cropTypeFert');
    if (cFert) cFert.value = crop;
    
    const cDis = document.getElementById('diseaseCrop');
    if (cDis) cDis.value = crop;
  }

  logUserActivity('view_page', `Visited ${titles[id] || id}`);

  if (id === 'sustainability') animateCounters();
  if (id === 'weather') fetchWeather();
  if (id === 'market') { autoInitMarketPrices(); }
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

    // Hook for real-time sustainability update
    const waterSavedPercent = parseInt(result.waterSave) || 0;
    const waterSavedToday = Math.round(water * (waterSavedPercent / 100));
    incrementSustainabilityTelemetry({
      irrigationChecks: 1,
      waterSaved: waterSavedToday > 0 ? waterSavedToday : 100
    });
    logUserActivity('irrigation_check', `Performed smart irrigation analysis (moisture: ${moisture}%, crop: ${cropType}, saved: ${waterSavedToday}L)`);
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

    // Hook for real-time sustainability update
    incrementSustainabilityTelemetry({
      fertilizerChecks: 1,
      chemReduced: 2 // average of 2 kg chemical reduction by target NPK application
    });
    logUserActivity('fertilizer_check', `Generated precision fertilizer recommendation for ${crop} in ${soil} soil`);
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
  // Store live weather globally for recommendations and alerts
  state._liveWeather = data;

  document.getElementById('topbarTemp').textContent = data.temp + '°C ' + data.icon;
  document.getElementById('cwIcon').textContent = data.icon;
  document.getElementById('cwTemp').textContent = data.temp + '°C';
  document.getElementById('cwDesc').textContent = data.desc;
  document.getElementById('cwCity').textContent = '📍 ' + data.city;
  document.getElementById('cwHumidity').textContent = data.humidity + '%';
  document.getElementById('cwWind').textContent = data.wind + ' km/h';
  document.getElementById('cwUV').textContent = data.uv;
  document.getElementById('cwRain').textContent = data.rain + '%';

  // "Feels Like" stat
  const cwFL = document.getElementById('cwFeelsLike');
  if (cwFL) cwFL.textContent = (data.feelsLike !== undefined ? data.feelsLike : data.temp) + '°C';

  // Sync dashboard stat cards with live weather
  const statTemp = document.getElementById('statTemp');
  if (statTemp) statTemp.textContent = data.temp + '°C';
  const statRain = document.getElementById('statRain');
  if (statRain) statRain.textContent = data.rain + '%';

  updateDashboardForecast();
  saveFarmData();
  renderForecast7Day();
  renderWeatherImpact(data);

  // Update recommendations and alerts with real live data
  generateRecommendations();
  if (typeof generateLiveAlerts === 'function') generateLiveAlerts(data);

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
    { timeout: 10000, enableHighAccuracy: true, maximumAge: 30000 }
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
let realTimeMarketData = [];

function toggleMarketEngineFields() {
  const mode = document.getElementById('marketEngineMode')?.value || 'india';
  const localField = document.getElementById('marketLocationField');
  const globalFields = document.getElementById('marketGlobalFields');
  const autoDetectBtn = document.getElementById('marketAutoDetectBtn');

  if (mode === 'india') {
    if (localField) localField.style.display = 'block';
    if (globalFields) globalFields.style.display = 'none';
  } else {
    if (localField) localField.style.display = 'none';
    if (globalFields) globalFields.style.display = 'grid';
  }
}

async function fetchGlobalAICropPrices(crop, loc, key) {
  const prompt = `Search for current, real-time market prices of crop "${crop}" in location/market "${loc}". Search for local board of trade, wholesale rates, or commodity markets. Fetch latest daily rates for the past 24-48 hours. Return a JSON array with one or more records. Be realistic and search-grounded.`;

  const body = {
    contents: [{
      parts: [{ text: prompt }]
    }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          records: {
            type: 'ARRAY',
            description: 'List of crop price records found in search.',
            items: {
              type: 'OBJECT',
              properties: {
                commodity: { type: 'STRING', description: 'Name of the crop or commodity (e.g. Maize, Soft Red Winter Wheat)' },
                market: { type: 'STRING', description: 'Specific market, exchange, or city name where this price is active (e.g. Chicago Board of Trade, Nairobi Wholesale Market)' },
                min_price: { type: 'STRING', description: 'Minimum price or bid price per unit' },
                modal_price: { type: 'STRING', description: 'Average/modal or settle price per unit' },
                max_price: { type: 'STRING', description: 'Maximum price or ask price per unit' },
                unit: { type: 'STRING', description: 'Weight/volume unit (e.g. bushel, ton, kg, bag, quintal)' },
                currency: { type: 'STRING', description: 'Currency symbol or code (e.g. $, KES, €, ₹)' }
              },
              required: ['commodity', 'market', 'min_price', 'modal_price', 'max_price', 'unit', 'currency']
            }
          }
        },
        required: ['records']
      }
    },
    tools: [
      {
        google_search: {}
      }
    ]
  };

  const res = await fetch(`${CONFIG.GEMINI_URL}?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error('Gemini error response:', errorText);
    throw new Error('API Request Failed');
  }

  const data = await res.json();
  const textOutput = data.candidates[0].content.parts[0].text;
  const parsed = JSON.parse(textOutput);
  return parsed.records || [];
}

function getMockMandiPrices(location, cropFilter = '') {
  const crops = [
    { commodity: 'Wheat (Gehun)', min_price: 2150, max_price: 2400, modal_price: 2280, unit: 'quintal', currency: '₹' },
    { commodity: 'Paddy (Dhan)', min_price: 2100, max_price: 2350, modal_price: 2200, unit: 'quintal', currency: '₹' },
    { commodity: 'Maize (Makka)', min_price: 1950, max_price: 2200, modal_price: 2080, unit: 'quintal', currency: '₹' },
    { commodity: 'Onion (Pyaj)', min_price: 1200, max_price: 2200, modal_price: 1750, unit: 'quintal', currency: '₹' },
    { commodity: 'Tomato', min_price: 800, max_price: 1600, modal_price: 1150, unit: 'quintal', currency: '₹' },
    { commodity: 'Potato (Aloo)', min_price: 1100, max_price: 1700, modal_price: 1400, unit: 'quintal', currency: '₹' },
    { commodity: 'Cotton (Kapas)', min_price: 6200, max_price: 7000, modal_price: 6650, unit: 'quintal', currency: '₹' },
    { commodity: 'Turmeric (Haldi)', min_price: 6400, max_price: 7500, modal_price: 6900, unit: 'quintal', currency: '₹' },
    { commodity: 'Soybean', min_price: 4200, max_price: 4800, modal_price: 4550, unit: 'quintal', currency: '₹' },
    { commodity: 'Groundnut', min_price: 6000, max_price: 6800, modal_price: 6400, unit: 'quintal', currency: '₹' }
  ];

  let filtered = crops;
  if (cropFilter) {
    filtered = crops.filter(c => c.commodity.toLowerCase().includes(cropFilter.toLowerCase()));
  }

  let hash = 0;
  for (let i = 0; i < location.length; i++) {
    hash = location.charCodeAt(i) + ((hash << 5) - hash);
  }
  const pct = (hash % 15) / 100; // -14% to +14%

  return filtered.map(c => {
    const min = Math.round(c.min_price * (1 + pct));
    const max = Math.round(c.max_price * (1 + pct));
    const modal = Math.round(c.modal_price * (1 + pct));
    return {
      commodity: c.commodity,
      market: location + ' Mandi',
      min_price: min,
      max_price: max,
      modal_price: modal,
      unit: c.unit,
      currency: c.currency
    };
  });
}

function getMockGlobalPrices(crop, location) {
  const baseCrops = {
    wheat: { min_price: 220, max_price: 260, modal_price: 240, unit: 'ton', currency: '$' },
    maize: { min_price: 180, max_price: 220, modal_price: 200, unit: 'ton', currency: '$' },
    corn: { min_price: 180, max_price: 220, modal_price: 200, unit: 'ton', currency: '$' },
    coffee: { min_price: 1.80, max_price: 2.40, modal_price: 2.10, unit: 'lb', currency: '$' },
    tea: { min_price: 2.20, max_price: 3.00, modal_price: 2.60, unit: 'kg', currency: '$' },
    rice: { min_price: 400, max_price: 480, modal_price: 440, unit: 'ton', currency: '$' },
    soybean: { min_price: 380, max_price: 440, modal_price: 410, unit: 'ton', currency: '$' },
    cotton: { min_price: 0.70, max_price: 0.90, modal_price: 0.80, unit: 'lb', currency: '$' },
    cocoa: { min_price: 3200, max_price: 3800, modal_price: 3500, unit: 'ton', currency: '$' }
  };

  const cropKey = crop.toLowerCase();
  let base = baseCrops[cropKey];
  if (!base) {
    for (const [k, v] of Object.entries(baseCrops)) {
      if (cropKey.includes(k) || k.includes(cropKey)) {
        base = v;
        break;
      }
    }
  }

  if (!base) {
    base = { min_price: 100, max_price: 150, modal_price: 125, unit: 'unit', currency: '$' };
  }

  let hash = 0;
  for (let i = 0; i < location.length; i++) {
    hash = location.charCodeAt(i) + ((hash << 5) - hash);
  }
  const pct = (hash % 20) / 100; // -19% to +19%

  const min = (base.min_price * (1 + pct)).toFixed(2);
  const max = (base.max_price * (1 + pct)).toFixed(2);
  const modal = (base.modal_price * (1 + pct)).toFixed(2);

  return [{
    commodity: crop.charAt(0).toUpperCase() + crop.slice(1),
    market: location + ' Trade Board',
    min_price: min,
    max_price: max,
    modal_price: modal,
    unit: base.unit,
    currency: base.currency
  }];
}

async function fetchRealTimeMarketPrices() {
  const engineMode = document.getElementById('marketEngineMode')?.value || 'india';
  const tableBody = document.getElementById('marketTableBody');
  const updateTimeEl = document.getElementById('marketUpdateTime');

  const key = CONFIG.GEMINI_API_KEY;
  const hasValidKey = key && !key.includes('Demo') && key.startsWith('AIzaSy');

  if (engineMode === 'india') {
    // ─── DOMESTIC APMC MANDI SEARCH ───
    const apiKey = '579b464db66ec23bdd000001cdd3946e44ce4aad7209ff7b23ac571b'; // Public key
    const cityInput = document.getElementById('marketCityInput');
    const cityName = cityInput && cityInput.value.trim() !== '' ? cityInput.value.trim() : 'Pune';

    if (tableBody) {
      tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:20px;">⏳ Fetching APMC mandi prices for ${cityName}...</td></tr>`;
    }

    try {
      const formattedCity = cityName.charAt(0).toUpperCase() + cityName.slice(1).toLowerCase();
      const url = `https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070?api-key=${apiKey}&format=json&filters[district]=${encodeURIComponent(formattedCity)}&limit=50`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Agmarknet API Request Failed');
      
      const data = await res.json();
      if (data && data.records && data.records.length > 0) {
        realTimeMarketData = data.records;
        renderMarketTable();
        showToast('📈', `Mandi prices for ${formattedCity} refreshed!`);
        if (updateTimeEl) updateTimeEl.textContent = new Date().toLocaleTimeString('en-IN');
      } else {
        // Fallback 1: Try Gemini AI Search Grounding for APMC if API key exists
        if (hasValidKey) {
          if (tableBody) {
            tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:20px;">🔍 No direct data in APMC API. Querying live AI prices for ${cityName}...</td></tr>`;
          }
          const prompt = `Search for current, real-time APMC mandi market wholesale prices of agricultural crops in "${cityName}, India" for the past 24-48 hours. Return a JSON array with records containing fields: commodity, market, min_price, modal_price, max_price, unit (e.g. quintal), currency (e.g. ₹).`;
          const records = await fetchGlobalAICropPrices(cityName, cityName, key);
          if (records && records.length > 0) {
            realTimeMarketData = records.map((r, idx) => ({
              id: idx,
              commodity: r.commodity,
              market: r.market || cityName,
              min_price: r.min_price || '0',
              modal_price: r.modal_price || '0',
              max_price: r.max_price || '0',
              unit: r.unit || 'quintal',
              currency: r.currency || '₹'
            }));
            renderMarketTable();
            showToast('🤖', `AI Mandi prices for ${formattedCity} loaded!`);
            if (updateTimeEl) updateTimeEl.textContent = new Date().toLocaleTimeString('en-IN') + ' (AI Grounded)';
          } else {
            throw new Error('AI search returned no records');
          }
        } else {
          throw new Error('No records and no AI key');
        }
      }
    } catch (err) {
      console.warn('Agmarknet/AI search failed, using local mock data:', err);
      // Fallback 2: Generate high-quality local mock data
      realTimeMarketData = getMockMandiPrices(cityName);
      renderMarketTable();
      showToast('💡', `Estimated mandi prices loaded (Offline Mode)`);
      if (updateTimeEl) updateTimeEl.textContent = 'Offline Demo';
    }
  } else {
    // ─── GLOBAL AI MARKET SEARCH ───
    const cropInput = document.getElementById('marketCropInput');
    const locInput = document.getElementById('marketGlobalLocInput');
    const crop = cropInput && cropInput.value.trim() !== '' ? cropInput.value.trim() : 'Wheat';
    const loc = locInput && locInput.value.trim() !== '' ? locInput.value.trim() : 'Chicago, USA';

    if (tableBody) {
      tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:20px;">⏳ Searching global prices for ${crop} in ${loc} using AI Grounding...</td></tr>`;
    }

    if (hasValidKey) {
      try {
        const records = await fetchGlobalAICropPrices(crop, loc, key);
        if (records && records.length > 0) {
          realTimeMarketData = records.map((r, index) => ({
            id: index,
            commodity: r.commodity || crop,
            market: r.market || loc,
            min_price: r.min_price || 'N/A',
            modal_price: r.modal_price || 'N/A',
            max_price: r.max_price || 'N/A',
            unit: r.unit || 'ton',
            currency: r.currency || '$'
          }));
          renderMarketTable();
          showToast('🌍', `Global prices for ${crop} in ${loc} retrieved!`);
          if (updateTimeEl) updateTimeEl.textContent = new Date().toLocaleTimeString('en-IN');
        } else {
          throw new Error('AI search returned no records');
        }
      } catch (err) {
        console.warn('Global AI search failed, using global mock data:', err);
        realTimeMarketData = getMockGlobalPrices(crop, loc);
        renderMarketTable();
        showToast('💡', `Estimated global prices loaded (Offline Mode)`);
        if (updateTimeEl) updateTimeEl.textContent = 'Offline Demo';
      }
    } else {
      // Offline fallback for global mode
      realTimeMarketData = getMockGlobalPrices(crop, loc);
      renderMarketTable();
      showToast('💡', `Estimated global prices loaded (Offline Mode)`);
      if (updateTimeEl) updateTimeEl.textContent = 'Offline Demo';
    }
  }
}

// ─── MARKET PAGE: ALIAS + AUTO-DETECT HELPERS ───────────────────────────────

/**
 * Called when the market page opens. Pre-fills the city input from the user's
 * saved location profile and immediately fetches nearest mandi prices.
 */
function autoInitMarketPrices() {
  const cityInput = document.getElementById('marketCityInput');
  if (cityInput) {
    // Only pre-fill if field is empty (don't overwrite a manual entry on tab switch)
    if (!cityInput.value.trim()) {
      // Extract the first part of the user's stored location (e.g. "Raichur, Karnataka" → "Raichur")
      const profileLocation = state.user && state.user.location ? state.user.location : '';
      const city = profileLocation.split(',')[0].trim();
      if (city) {
        cityInput.value = city;
        showToast('📍', `Showing mandi prices for ${city} (from your profile)`);
      }
    }
  }
  // If we already have data, render it immediately; then fetch fresh data in background
  if (realTimeMarketData.length > 0) renderMarketTable();
  fetchRealTimeMarketPrices();
}

/** Alias used by the HTML refresh button */
function refreshMarketPrices() {
  fetchRealTimeMarketPrices();
}

/**
 * Auto-detect the user's current city via GPS → IP-geolocation fallback,
 * then fetch mandi prices for that city.
 */
async function useDetectedCityForMarket() {
  const cityInput = document.getElementById('marketCityInput');
  const btn = document.getElementById('marketAutoDetectBtn');
  if (btn) { btn.disabled = true; btn.textContent = '📡 Detecting...'; }
  showToast('📡', 'Detecting your location for mandi prices...');

  async function setMarketCity(city) {
    if (cityInput) cityInput.value = city;
    if (btn) { btn.disabled = false; btn.textContent = '📡 Use Auto-Detected'; }
    showToast('📍', `Fetching mandi prices for ${city}...`);
    await fetchRealTimeMarketPrices();
  }

  // Fallback: IP-based geolocation
  async function fallbackToIP() {
    const ipData = await ipGeolocate();
    if (ipData) {
      await setMarketCity(ipData.city.split(',')[0].trim());
    } else {
      // Last resort: use profile location
      const profileLocation = state.user && state.user.location ? state.user.location : '';
      const city = profileLocation.split(',')[0].trim() || 'Bengaluru';
      showToast('ℹ️', `Could not detect GPS/IP. Using profile location: ${city}`);
      await setMarketCity(city);
    }
    if (btn) { btn.disabled = false; btn.textContent = '📡 Use Auto-Detected'; }
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
        await setMarketCity(cityLabel.split(',')[0].trim());
      } catch (e) {
        console.warn('GPS market detect failed, trying IP:', e);
        await fallbackToIP();
      }
    },
    async (err) => {
      console.warn('GPS denied for market, trying IP:', err.message);
      await fallbackToIP();
    },
    { timeout: 8000, enableHighAccuracy: true, maximumAge: 60000 }
  );
}

const MSP_MAP = {
  'wheat': 2275,
  'paddy': 2183,
  'rice': 2183,
  'maize': 2090,
  'turmeric': 6850,
  'onion': 1800,
  'potato': 1500,
  'tomato': 1200,
  'cotton': 6620,
  'sugarcane': 315,
  'groundnut': 6377,
  'soybean': 4600,
  'mustard': 5650,
  'ragi': 3846,
  'jowar': 3180,
  'bajra': 2500
};

function getCropMSP(cropName) {
  const name = cropName.toLowerCase();
  for (const [key, value] of Object.entries(MSP_MAP)) {
    if (name.includes(key)) {
      return value;
    }
  }
  return null;
}

function getHistoricalPriceTrend(cropName, marketName, currentPrice) {
  const str = cropName + marketName;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const pctChange = ((hash % 80) / 10);
  const sign = pctChange >= 0 ? '+' : '';
  const isUp = pctChange >= 0;
  
  const points = [];
  const range = currentPrice * 0.1;
  for (let i = 0; i < 7; i++) {
    const factor = (i - 3) / 3;
    const trendFactor = pctChange * 0.01 * factor * currentPrice;
    const sineFactor = Math.sin(hash + i) * range * 0.3;
    const ptVal = Math.round(currentPrice + trendFactor + sineFactor);
    points.push(ptVal);
  }
  points[6] = Math.round(currentPrice);
  
  const minVal = Math.min(...points);
  const maxVal = Math.max(...points);
  const valRange = maxVal - minVal || 1;
  
  const width = 60;
  const height = 18;
  const padding = 2;
  
  const svgPoints = points.map((p, idx) => {
    const x = (idx / 6) * width;
    const y = padding + (height - padding * 2) * (1 - (p - minVal) / valRange);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  return {
    pctChange: sign + pctChange.toFixed(1) + '%',
    isUp,
    svgPoints
  };
}

function renderMarketTable() {
  const b = document.getElementById('marketTableBody');
  if (!b) return;
  if (realTimeMarketData.length === 0) return;

  b.innerHTML = realTimeMarketData.map(r => {
    const cropName = r.commodity;
    const marketName = r.market;
    const currency = r.currency || '₹';
    const unit = r.unit ? ` per ${r.unit}` : ' per quintal';
    
    const rawModal = parseFloat(String(r.modal_price).replace(/[^0-9.]/g, '')) || 0;

    const minP = String(r.min_price).startsWith(currency) ? r.min_price : `${currency}${r.min_price}`;
    const modP = String(r.modal_price).startsWith(currency) ? r.modal_price : `${currency}${r.modal_price}`;
    const maxP = String(r.max_price).startsWith(currency) ? r.max_price : `${currency}${r.max_price}`;

    // Get MSP status
    const msp = getCropMSP(cropName);
    let mspBadge = '<span style="color:#6b7280;font-size:11px;">N/A</span>';
    if (msp) {
      const isAbove = rawModal >= msp;
      const diffPct = Math.abs(((rawModal - msp) / msp) * 100).toFixed(0);
      if (isAbove) {
        mspBadge = `<span style="padding:3px 8px;border-radius:50px;font-size:11px;background:rgba(74,222,128,0.1);color:#4ade80;font-weight:600;border:1px solid rgba(74,222,128,0.2);">🟢 Above MSP (+${diffPct}%)</span>`;
      } else {
        mspBadge = `<span style="padding:3px 8px;border-radius:50px;font-size:11px;background:rgba(248,113,113,0.1);color:#f87171;font-weight:600;border:1px solid rgba(248,113,113,0.2);">🔴 Below MSP (-${diffPct}%)</span>`;
      }
    }

    // Get trend
    const trend = getHistoricalPriceTrend(cropName, marketName, rawModal || 2000);
    const trendColor = trend.isUp ? '#4ade80' : '#f87171';
    const trendArrow = trend.isUp ? '↗️' : '↘️';

    return `
    <tr>
      <td style="font-weight:600; color:white;">${cropName}</td>
      <td style="color:#fbbf24">${marketName}</td>
      <td style="color:#a7f3d0">${minP} - ${maxP}${unit}</td>
      <td style="font-weight:700;color:#38bdf8">${modP}${unit}</td>
      <td>${mspBadge}</td>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <svg width="65" height="20" style="overflow:visible; stroke:${trendColor}; stroke-width:2; fill:none;">
            <polyline points="${trend.svgPoints}" />
          </svg>
          <span style="font-size:11px;font-weight:600;color:${trendColor}">${trendArrow} ${trend.pctChange}</span>
        </div>
      </td>
      <td><button onclick="openAIChat('Should I sell ${cropName.replace(/[^\\w\\s]/g, '')} at ${marketName} now at modal price ${modP} per ${r.unit || 'unit'} or wait? Advise.')" style="font-size:11px;padding:4px 10px;border-radius:50px;background:rgba(74,222,128,0.1);border:1px solid rgba(74,222,128,0.2);color:#4ade80;cursor:pointer">🤖 Advise</button></td>
    </tr>`;
  }).join('');

  // Populate crop dropdown options for profit planner
  populatePlannerDropdown();
}

function populatePlannerDropdown() {
  const select = document.getElementById('plannerCropSelect');
  if (!select) return;
  
  const currentVal = select.value;
  select.innerHTML = '<option value="">-- Choose from Search Results --</option>' + 
    realTimeMarketData.map((r, idx) => `
      <option value="${idx}">${r.commodity} (${r.market})</option>
    `).join('');
    
  if (currentVal && parseInt(currentVal) < realTimeMarketData.length) {
    select.value = currentVal;
  } else if (realTimeMarketData.length > 0) {
    select.value = "0"; // default to first result
  }
  
  calculatePlannerRevenue();
}

function calculatePlannerRevenue() {
  const select = document.getElementById('plannerCropSelect');
  const qtyInput = document.getElementById('plannerQuantity');
  const costInput = document.getElementById('plannerCost');
  
  const revEl = document.getElementById('plannerRevenue');
  const costEl = document.getElementById('plannerTotalCost');
  const netEl = document.getElementById('plannerNetProfit');
  const profitCard = document.getElementById('plannerProfitCard');
  const profitLabel = document.getElementById('plannerProfitLabel');
  
  if (!select || !qtyInput || !costInput || !revEl || !costEl || !netEl) return;
  
  const idx = parseInt(select.value);
  if (isNaN(idx) || idx >= realTimeMarketData.length) {
    revEl.textContent = '₹0';
    costEl.textContent = '₹0';
    netEl.textContent = '₹0';
    if (profitCard) {
      profitCard.style.borderColor = 'rgba(255,255,255,0.08)';
      profitCard.style.background = 'rgba(255,255,255,0.02)';
    }
    if (profitLabel) profitLabel.textContent = 'Estimated Net Profit';
    return;
  }
  
  const item = realTimeMarketData[idx];
  const rate = parseFloat(String(item.modal_price).replace(/[^0-9.]/g, '')) || 0;
  const qty = parseFloat(qtyInput.value) || 0;
  const costPerUnit = parseFloat(costInput.value) || 0;
  
  const grossRev = rate * qty;
  const totalCost = costPerUnit * qty;
  const netProfit = grossRev - totalCost;
  const currency = item.currency || '₹';
  
  revEl.textContent = currency + Math.round(grossRev).toLocaleString('en-IN');
  costEl.textContent = currency + Math.round(totalCost).toLocaleString('en-IN');
  
  netEl.textContent = (netProfit >= 0 ? '' : '-') + currency + Math.round(Math.abs(netProfit)).toLocaleString('en-IN');
  
  if (profitCard) {
    if (netProfit >= 0) {
      profitCard.style.borderColor = 'rgba(74,222,128,0.3)';
      profitCard.style.background = 'rgba(74,222,128,0.04)';
      netEl.style.color = '#4ade80';
      if (profitLabel) profitLabel.textContent = 'Estimated Net Profit 🥬';
    } else {
      profitCard.style.borderColor = 'rgba(248,113,113,0.3)';
      profitCard.style.background = 'rgba(248,113,113,0.04)';
      netEl.style.color = '#f87171';
      if (profitLabel) profitLabel.textContent = 'Estimated Net Loss ⚠️';
    }
  }
}

function refreshMarketPrices() {
  fetchRealTimeMarketPrices();
}

function useDetectedCityForMarket() {
  const cwCity = document.getElementById('cwCity');
  const mode = document.getElementById('marketEngineMode')?.value || 'india';
  const targetInput = mode === 'india' ? document.getElementById('marketCityInput') : document.getElementById('marketGlobalLocInput');
  
  if (cwCity && targetInput) {
    let loc = cwCity.textContent.replace('📡 ', '').split(',')[0].trim();
    if (loc && loc !== 'Auto-detecting...' && loc !== 'Detecting location...') {
      targetInput.value = loc;
      fetchRealTimeMarketPrices();
      showToast('📍', `Using detected location: ${loc}`);
    } else {
      showToast('⚠️', 'Please auto-detect location in the Weather tab first.');
    }
  }
}

// Initial fetch on load
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    if(state.currentPage === 'market') fetchRealTimeMarketPrices();
  }, 1000);
  initAgriNews();
});

// ─── AGRI-NEWS & MARKET TRENDS ────────────────────────────────────────────────
let agriNewsData = [
  {
    category: "Market Watch",
    title: "Tomato prices expected to rise 20% next month in Karnataka mandis.",
    summary: "Historical trends suggest peak demand during June-July.",
    content: "According to trade analysts and historical mandis data, tomato prices are projected to rise by up to 20% in the next 3-4 weeks across major mandis in Karnataka, including Bengaluru and Kolar. This is primarily due to seasonal supply fluctuations and increased demand in neighboring states. Farmers are advised to plan their harvests accordingly to secure optimal returns.",
    date: "June 2, 2026",
    source: "APMC Trade Bulletin"
  },
  {
    category: "Weather Insight",
    title: "IMD predicts normal monsoon for South Interior Karnataka.",
    summary: "Prepare your seedbeds and drainage systems by mid-May.",
    content: "The India Meteorological Department (IMD) has announced a normal monsoon forecast for the southern interior region of Karnataka. Rainfall is expected to begin on schedule, supporting kharif crop sowing. Agricultural scientists advise farmers to focus on land preparation, clear drainage channels to avoid waterlogging, and select certified seeds for early sowing.",
    date: "May 28, 2026",
    source: "IMD Agricultural Bulletin"
  },
  {
    category: "Govt Policy",
    title: "New 80% subsidy for Drip Irrigation sets under PMKSY.",
    summary: "Contact your local Raitha Samparka Kendra for application details.",
    content: "The state government has announced a massive 80% subsidy for small and marginal farmers looking to install micro-irrigation systems under the Pradhan Mantri Krishi Sinchayee Yojana (PMKSY). This scheme aims to boost water use efficiency. Farmers can apply online or visit their local Raitha Samparka Kendra with land records to claim the subsidy benefits.",
    date: "June 1, 2026",
    source: "Karnataka Department of Agriculture"
  }
];

function initAgriNews() {
  renderAgriNews();
  // Auto-fetch latest news on load if API key is active
  const key = CONFIG.GEMINI_API_KEY;
  if (key && !key.includes('Demo')) {
    setTimeout(() => {
      fetchLatestAgriNews(key).then(articles => {
        if (articles && articles.length > 0) {
          agriNewsData = articles;
          renderAgriNews();
          console.log('Agri-News refreshed automatically from web search!');
        }
      }).catch(err => console.error('Auto agri-news fetch failed:', err));
    }, 2000);
  }
}

function renderAgriNews() {
  const slider = document.getElementById('newsSlider');
  if (!slider) return;

  if (agriNewsData.length === 0) {
    slider.innerHTML = '<div style="padding:20px; color:var(--text-muted);">No news articles available.</div>';
    return;
  }

  slider.innerHTML = agriNewsData.map((article, idx) => {
    let catColor = 'var(--green-primary)';
    if (article.category.toLowerCase().includes('weather')) catColor = 'var(--blue-accent)';
    else if (article.category.toLowerCase().includes('policy') || article.category.toLowerCase().includes('govt')) catColor = 'var(--purple-accent)';
    else if (article.category.toLowerCase().includes('tech')) catColor = '#10b981';

    return `
      <div class="news-card" onclick="showNewsArticle(${idx})" style="min-width:280px; flex:0 0 280px; background:rgba(255,255,255,0.03); padding:18px; border-radius:12px; border:1px solid var(--border); scroll-snap-align: start; transition: transform 0.3s; cursor:pointer;" onmouseover="this.style.transform='translateY(-5px)'" onmouseout="this.style.transform='translateY(0)'">
        <div style="font-size:10px; color:${catColor}; margin-bottom:8px; font-weight:700; text-transform:uppercase">${article.category}</div>
        <div style="font-size:14px; font-weight:600; margin-bottom:8px; line-height:1.4; color:var(--text-primary);">${article.title}</div>
        <div style="font-size:12px; color:var(--text-muted); line-height:1.4;">${article.summary}</div>
      </div>
    `;
  }).join('');
}

function showNewsArticle(index) {
  const article = agriNewsData[index];
  if (!article) return;

  document.getElementById('newsModalTitle').textContent = article.title;
  document.getElementById('newsModalCategory').textContent = article.category;
  document.getElementById('newsModalDate').textContent = article.date;
  document.getElementById('newsModalSource').textContent = article.source;

  let catColor = 'var(--green-primary)';
  if (article.category.toLowerCase().includes('weather')) catColor = 'var(--blue-accent)';
  else if (article.category.toLowerCase().includes('policy') || article.category.toLowerCase().includes('govt')) catColor = 'var(--purple-accent)';
  
  const catEl = document.getElementById('newsModalCategory');
  catEl.textContent = article.category;
  catEl.style.color = catColor;
  catEl.style.borderColor = catColor.replace(')', ', 0.3)').replace('var(--', 'rgba(var(--');
  
  // Format body text with bolding and line breaks
  const formatted = article.content.replace(/\\*\\*(.*?)\\*\\*/g, '<strong>$1</strong>').replace(/\\n/g, '<br>');
  document.getElementById('newsModalContent').innerHTML = formatted;

  const modal = document.getElementById('agriNewsModal');
  if (modal) modal.classList.add('show');
}

async function fetchLatestAgriNews(key) {
  const prompt = `Search the web for the latest agricultural news, crop market trends, weather alerts, and government policy updates for farmers. Provide 4-5 highly relevant, recent articles from the past 48 hours. Format the output strictly as a JSON object containing a "records" array of articles.`;

  const body = {
    contents: [{
      parts: [{ text: prompt }]
    }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          records: {
            type: 'ARRAY',
            description: 'List of current agricultural news articles.',
            items: {
              type: 'OBJECT',
              properties: {
                category: { type: 'STRING', description: 'News category (e.g. Market Watch, Weather Insight, Govt Policy, Technology)' },
                title: { type: 'STRING', description: 'Headline of the news article' },
                summary: { type: 'STRING', description: 'Brief 1-sentence summary' },
                content: { type: 'STRING', description: 'Detailed article body of 2-3 paragraphs' },
                date: { type: 'STRING', description: 'Article date or post date' },
                source: { type: 'STRING', description: 'News publisher source' }
              },
              required: ['category', 'title', 'summary', 'content', 'date', 'source']
            }
          }
        },
        required: ['records']
      }
    },
    tools: [
      {
        google_search: {}
      }
    ]
  };

  const res = await fetch(`${CONFIG.GEMINI_URL}?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    throw new Error('News API request failed');
  }

  const data = await res.json();
  const textOutput = data.candidates[0].content.parts[0].text;
  const parsed = JSON.parse(textOutput);
  return parsed.records || [];
}

async function refreshAgriNews() {
  const key = CONFIG.GEMINI_API_KEY;
  showToast('🔄', 'Fetching latest agri-news...');

  if (!key || key.includes('Demo')) {
    showToast('⚠️', 'Agri-News requires a Gemini API Key in Settings.');
    return;
  }

  try {
    const articles = await fetchLatestAgriNews(key);
    if (articles && articles.length > 0) {
      agriNewsData = articles;
      renderAgriNews();
      showToast('📰', 'Agri-News refreshed from web search!');
    } else {
      showToast('⚠️', 'No new articles found today.');
    }
  } catch (err) {
    console.error('Failed to refresh news:', err);
    showToast('❌', 'Error updating news. Check key.');
  }
}



// ─── SUSTAINABILITY ───────────────────────────────────────────────────────────
function getSustainabilityStats() {
  const userId = state.user.id || 0;
  
  // Retrieve metrics from localStorage, default to baseline numbers if not set
  const baseWaterSaved = localStorage.getItem(`nr_water_saved_total_${userId}`) !== null 
    ? parseFloat(localStorage.getItem(`nr_water_saved_total_${userId}`)) 
    : 2400;
  const baseChemReduced = localStorage.getItem(`nr_chem_reduced_total_${userId}`) !== null 
    ? parseFloat(localStorage.getItem(`nr_chem_reduced_total_${userId}`)) 
    : 12;
  const baseIncomeIncreased = localStorage.getItem(`nr_income_increased_total_${userId}`) !== null 
    ? parseFloat(localStorage.getItem(`nr_income_increased_total_${userId}`)) 
    : 8500;
  const baseCO2Saved = localStorage.getItem(`nr_co2_saved_total_${userId}`) !== null 
    ? parseFloat(localStorage.getItem(`nr_co2_saved_total_${userId}`)) 
    : 45;
  
  const irrigationChecks = localStorage.getItem(`nr_irrigation_checks_${userId}`) !== null 
    ? parseInt(localStorage.getItem(`nr_irrigation_checks_${userId}`)) 
    : 4;
  const fertilizerChecks = localStorage.getItem(`nr_fertilizer_checks_${userId}`) !== null 
    ? parseInt(localStorage.getItem(`nr_fertilizer_checks_${userId}`)) 
    : 3;
  const diseaseChecks = localStorage.getItem(`nr_disease_checks_${userId}`) !== null 
    ? parseInt(localStorage.getItem(`nr_disease_checks_${userId}`)) 
    : 2;
  const ordersCount = localStorage.getItem(`nr_orders_placed_${userId}`) !== null 
    ? parseInt(localStorage.getItem(`nr_orders_placed_${userId}`)) 
    : 1;

  // Persist default values if it is the first time
  if (localStorage.getItem(`nr_water_saved_total_${userId}`) === null) {
    localStorage.setItem(`nr_water_saved_total_${userId}`, baseWaterSaved);
    localStorage.setItem(`nr_chem_reduced_total_${userId}`, baseChemReduced);
    localStorage.setItem(`nr_income_increased_total_${userId}`, baseIncomeIncreased);
    localStorage.setItem(`nr_co2_saved_total_${userId}`, baseCO2Saved);
    localStorage.setItem(`nr_irrigation_checks_${userId}`, irrigationChecks);
    localStorage.setItem(`nr_fertilizer_checks_${userId}`, fertilizerChecks);
    localStorage.setItem(`nr_disease_checks_${userId}`, diseaseChecks);
    localStorage.setItem(`nr_orders_placed_${userId}`, ordersCount);
  }

  // Calculate specific scores based on farm activity
  const waterScore = Math.min(98, 60 + (irrigationChecks * 2));
  const chemScore = Math.min(98, 60 + (fertilizerChecks * 5));
  const yieldScore = Math.min(98, 65 + (diseaseChecks * 3) + (ordersCount * 5));
  const carbonScore = Math.min(98, 55 + (irrigationChecks * 1) + (fertilizerChecks * 1) + (ordersCount * 3));

  const overallScore = Math.round((waterScore + chemScore + yieldScore + carbonScore) / 4);

  let grade = 'B';
  let gradeText = 'Developing sustainable farmer. Try more AI recommendations.';
  let gradeClass = 'grade-b';
  
  if (overallScore >= 90) {
    grade = 'A+';
    gradeText = 'Exemplary Eco-Farmer! Leading the path to green agriculture.';
    gradeClass = 'grade-a';
  } else if (overallScore >= 80) {
    grade = 'A';
    gradeText = 'Excellent sustainable farmer! Outstanding use of precision tools.';
    gradeClass = 'grade-a';
  } else if (overallScore >= 70) {
    grade = 'B+';
    gradeText = 'Good sustainable farmer! Keep improving to reach Grade A.';
    gradeClass = 'grade-b';
  } else if (overallScore >= 60) {
    grade = 'B';
    gradeText = 'Developing sustainable farmer. Try more AI recommendations.';
    gradeClass = 'grade-b';
  } else {
    grade = 'C';
    gradeText = 'Needs improvement. Switch to precision farming tools.';
    gradeClass = 'grade-c';
  }

  return {
    waterSaved: baseWaterSaved,
    chemReduced: baseChemReduced,
    incomeIncreased: baseIncomeIncreased,
    co2Saved: baseCO2Saved,
    irrigationChecks,
    fertilizerChecks,
    diseaseChecks,
    ordersCount,
    waterScore,
    chemScore,
    yieldScore,
    carbonScore,
    overallScore,
    grade,
    gradeText,
    gradeClass
  };
}

function updateSustainabilityUI() {
  const stats = getSustainabilityStats();

  // 1. Update Mini Dashboard circular gauges
  const waterMiniText = document.querySelector('.score-mini-grid .score-mini-item:nth-child(1) span');
  const waterMiniCircle = document.querySelector('.score-mini-grid .score-mini-item:nth-child(1) .score-mini-circle');
  if (waterMiniText) waterMiniText.textContent = stats.waterScore;
  if (waterMiniCircle) waterMiniCircle.style.setProperty('--pct', stats.waterScore + '%');

  const ecoMiniText = document.querySelector('.score-mini-grid .score-mini-item:nth-child(2) span');
  const ecoMiniCircle = document.querySelector('.score-mini-grid .score-mini-item:nth-child(2) .score-mini-circle');
  if (ecoMiniText) ecoMiniText.textContent = stats.chemScore;
  if (ecoMiniCircle) ecoMiniCircle.style.setProperty('--pct', stats.chemScore + '%');

  const yieldMiniText = document.querySelector('.score-mini-grid .score-mini-item:nth-child(3) span');
  const yieldMiniCircle = document.querySelector('.score-mini-grid .score-mini-item:nth-child(3) .score-mini-circle');
  if (yieldMiniText) yieldMiniText.textContent = stats.yieldScore;
  if (yieldMiniCircle) yieldMiniCircle.style.setProperty('--pct', stats.yieldScore + '%');

  // 2. Update overall score on sustainability page
  const overallScoreText = document.getElementById('overallScore');
  if (overallScoreText) overallScoreText.textContent = stats.overallScore;

  const overallRing = document.getElementById('overallRing');
  if (overallRing) {
    const offset = Math.round(314 * (1 - stats.overallScore / 100));
    overallRing.setAttribute('stroke-dashoffset', offset);
  }

  // 3. Update Grade display and text description
  const gradeDisplay = document.getElementById('gradeDisplay');
  if (gradeDisplay) {
    gradeDisplay.textContent = 'Grade: ' + stats.grade;
    gradeDisplay.className = 'grade-badge ' + stats.gradeClass;
  }
  
  const gradeTextEl = document.querySelector('.score-grade .grade-text');
  if (gradeTextEl) gradeTextEl.textContent = stats.gradeText;

  // 4. Update the breakdown metric cards
  // Water Efficiency
  const waterMetricVal = document.querySelector('#page-sustainability .score-metric:nth-child(1) .metric-score');
  const waterMetricFill = document.querySelector('#page-sustainability .score-metric:nth-child(1) .metric-fill');
  const waterMetricDesc = document.querySelector('#page-sustainability .score-metric:nth-child(1) .metric-desc');
  if (waterMetricVal) waterMetricVal.textContent = stats.waterScore + '/100';
  if (waterMetricFill) waterMetricFill.style.width = stats.waterScore + '%';
  if (waterMetricDesc) waterMetricDesc.textContent = `You saved ~${Math.round(stats.waterSaved).toLocaleString('en-IN')}L of water this month vs conventional irrigation`;

  // Chemical Reduction
  const chemMetricVal = document.querySelector('#page-sustainability .score-metric:nth-child(2) .metric-score');
  const chemMetricFill = document.querySelector('#page-sustainability .score-metric:nth-child(2) .metric-fill');
  const chemMetricDesc = document.querySelector('#page-sustainability .score-metric:nth-child(2) .metric-desc');
  if (chemMetricVal) chemMetricVal.textContent = stats.chemScore + '/100';
  if (chemMetricFill) chemMetricFill.style.width = stats.chemScore + '%';
  if (chemMetricDesc) chemMetricDesc.textContent = `Fertilizer usage reduced by ${Math.round(15 + (stats.fertilizerChecks * 1.5))}% using smart recommendations`;

  // Yield Improvement
  const yieldMetricVal = document.querySelector('#page-sustainability .score-metric:nth-child(3) .metric-score');
  const yieldMetricFill = document.querySelector('#page-sustainability .score-metric:nth-child(3) .metric-fill');
  const yieldMetricDesc = document.querySelector('#page-sustainability .score-metric:nth-child(3) .metric-desc');
  if (yieldMetricVal) yieldMetricVal.textContent = stats.yieldScore + '/100';
  if (yieldMetricFill) yieldMetricFill.style.width = stats.yieldScore + '%';
  if (yieldMetricDesc) yieldMetricDesc.textContent = `Estimated yield increased by ${Math.round(10 + (stats.diseaseChecks * 2) + (stats.ordersCount * 2))}% using AI recommendations`;

  // Carbon Footprint
  const carbonMetricVal = document.querySelector('#page-sustainability .score-metric:nth-child(4) .metric-score');
  const carbonMetricFill = document.querySelector('#page-sustainability .score-metric:nth-child(4) .metric-fill');
  const carbonMetricDesc = document.querySelector('#page-sustainability .score-metric:nth-child(4) .metric-desc');
  if (carbonMetricVal) carbonMetricVal.textContent = stats.carbonScore + '/100';
  if (carbonMetricFill) carbonMetricFill.style.width = stats.carbonScore + '%';
  if (carbonMetricDesc) carbonMetricDesc.textContent = `CO₂ emissions reduced by ${Math.round(10 + (stats.co2Saved * 0.1))}% via precision farming`;

  // Update achievements unlock status
  ACHIEVEMENTS[0].unlocked = stats.waterSaved >= 1000;
  ACHIEVEMENTS[1].unlocked = stats.chemScore >= 75;
  ACHIEVEMENTS[2].unlocked = (stats.irrigationChecks + stats.fertilizerChecks + stats.diseaseChecks) >= 10;
  ACHIEVEMENTS[3].unlocked = stats.overallScore >= 90;
  ACHIEVEMENTS[4].unlocked = stats.waterSaved >= 10000;
  ACHIEVEMENTS[5].unlocked = stats.waterScore >= 80 && stats.chemScore >= 80 && stats.yieldScore >= 80 && stats.carbonScore >= 80;

  // Sync to database
  if (state.user && state.user.id) {
    fetch(`${CONFIG.API_BASE_URL}/api/user/update-sustainability`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: state.user.id, score: stats.overallScore })
    }).catch(err => console.error('Failed to update backend sustainability score:', err));
  }
}

function incrementSustainabilityTelemetry(delta) {
  const userId = state.user.id || 0;
  
  if (delta.irrigationChecks) {
    const v = (parseInt(localStorage.getItem(`nr_irrigation_checks_${userId}`)) || 4) + delta.irrigationChecks;
    localStorage.setItem(`nr_irrigation_checks_${userId}`, v);
  }
  if (delta.fertilizerChecks) {
    const v = (parseInt(localStorage.getItem(`nr_fertilizer_checks_${userId}`)) || 3) + delta.fertilizerChecks;
    localStorage.setItem(`nr_fertilizer_checks_${userId}`, v);
  }
  if (delta.diseaseChecks) {
    const v = (parseInt(localStorage.getItem(`nr_disease_checks_${userId}`)) || 2) + delta.diseaseChecks;
    localStorage.setItem(`nr_disease_checks_${userId}`, v);
  }
  if (delta.ordersCount) {
    const v = (parseInt(localStorage.getItem(`nr_orders_placed_${userId}`)) || 1) + delta.ordersCount;
    localStorage.setItem(`nr_orders_placed_${userId}`, v);
  }
  if (delta.waterSaved) {
    const v = (parseFloat(localStorage.getItem(`nr_water_saved_total_${userId}`)) || 2400) + delta.waterSaved;
    localStorage.setItem(`nr_water_saved_total_${userId}`, v);
  }
  if (delta.chemReduced) {
    const v = (parseFloat(localStorage.getItem(`nr_chem_reduced_total_${userId}`)) || 12) + delta.chemReduced;
    localStorage.setItem(`nr_chem_reduced_total_${userId}`, v);
  }
  if (delta.incomeIncreased) {
    const v = (parseFloat(localStorage.getItem(`nr_income_increased_total_${userId}`)) || 8500) + delta.incomeIncreased;
    localStorage.setItem(`nr_income_increased_total_${userId}`, v);
  }
  if (delta.co2Saved) {
    const v = (parseFloat(localStorage.getItem(`nr_co2_saved_total_${userId}`)) || 45) + delta.co2Saved;
    localStorage.setItem(`nr_co2_saved_total_${userId}`, v);
  }

  // Reload UI
  updateSustainabilityUI();
}

function animateCounters() {
  const stats = getSustainabilityStats();

  [
    { id: 'counterWater', target: stats.waterSaved, prefix: '', suffix: 'L', dur: 1500 },
    { id: 'counterChem', target: stats.chemReduced, prefix: '', suffix: 'kg', dur: 1200 },
    { id: 'counterIncome', target: stats.incomeIncreased, prefix: '₹', suffix: '', dur: 2000 },
    { id: 'counterCO2', target: stats.co2Saved, prefix: '', suffix: '', dur: 1000 },
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
  const stats = getSustainabilityStats();
  const reportText = `================================================
NAMMA RYTHA (OUR FARMER) SUSTAINABILITY REPORT
Generated on: ${new Date().toLocaleDateString('en-IN')} ${new Date().toLocaleTimeString('en-IN')}
Farmer Name: ${state.user.name || 'Namma Rytha Farmer'}
Email: ${state.user.email || 'N/A'}
================================================

Overall Sustainability Rating:
------------------------------------------------
Score: ${stats.overallScore}/100
Grade: ${stats.grade}
Status: ${stats.gradeText}

Detailed Metric Breakdown:
------------------------------------------------
1. Water Efficiency Score: ${stats.waterScore}/100
   * Total Water Saved: ${stats.waterSaved.toLocaleString('en-IN')} Litres
   * Irrigation Advisories Checked: ${stats.irrigationChecks} times

2. Chemical Fertilizer Reduction: ${stats.chemScore}/100
   * Total Chemicals Reduced: ${stats.chemReduced.toLocaleString('en-IN')} kg
   * Precision NPK Prescriptions Generated: ${stats.fertilizerChecks} times

3. Crop Yield Improvement Index: ${stats.yieldScore}/100
   * Projected Yield Increase: ${Math.round(10 + (stats.diseaseChecks * 2) + (stats.ordersCount * 2))}%
   * AI Crop Disease Scans Run: ${stats.diseaseChecks} times
   * Smart/Eco Farming Inputs Purchased: ${stats.ordersCount} times

4. Carbon Footprint Reduction Score: ${stats.carbonScore}/100
   * Total CO2 Emissions Prevented: ${stats.co2Saved.toLocaleString('en-IN')} kg

Unlocked Badges & Achievements:
------------------------------------------------
${ACHIEVEMENTS.map(a => `${a.unlocked ? '✅ [UNLOCKED]' : '🔒 [LOCKED]'} ${a.name} (${a.desc})`).join('\n')}

================================================
Thank you for practicing sustainable, climate-smart agriculture.
Together, we protect our soil, conserve our water, and feed the nation.
🌾 Green Farming, Smart Farming! 🌍
================================================`;

  const blob = new Blob([reportText], { type: 'text/plain;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `Sustainability_Report_${state.user.name || 'Farmer'}.txt`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('📄', 'Sustainability report downloaded!');
}

// ─── DASHBOARD RECS ───────────────────────────────────────────────────────────
// ─── LIVE DASHBOARD WEATHER SYNC ─────────────────────────────────────────────
// Syncs dashboard stat cards (temp, rain) from live Open-Meteo data
async function syncDashboardWeather() {
  try {
    // Use stored live weather if already fetched
    if (state._liveWeather) {
      _applyWeatherToDashboard(state._liveWeather);
      return;
    }
    // Auto-detect location via GPS → IP fallback
    const coords = await new Promise((resolve) => {
      if (!('geolocation' in navigator)) { resolve(null); return; }
      navigator.geolocation.getCurrentPosition(
        pos => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        () => resolve(null),
        { timeout: 6000, maximumAge: 60000 }
      );
    }) || await ipGeolocate();

    if (!coords) return;
    const data = await fetchWeatherByCoords(coords.lat || coords.latitude, coords.lon || coords.longitude, coords.city || 'Your Location');
    state._liveWeather = data;
    _applyWeatherToDashboard(data);
  } catch (e) {
    console.warn('Dashboard weather sync failed:', e);
  }
}

function _applyWeatherToDashboard(data) {
  // Temperature stat card
  const statTemp = document.getElementById('statTemp');
  if (statTemp) statTemp.textContent = data.temp + '°C';

  // Rain probability stat card
  const statRain = document.getElementById('statRain');
  if (statRain) statRain.textContent = data.rain + '%';

  // Topbar weather pill
  const topbarTemp = document.getElementById('topbarTemp');
  if (topbarTemp) topbarTemp.textContent = data.temp + '°C ' + data.icon;

  // Store for recommendations
  state._liveWeather = data;

  // Refresh recommendations with live data
  generateRecommendations();

  // Refresh live alerts
  generateLiveAlerts(data);
}

// ─── LIVE WEATHER-DRIVEN ALERTS ───────────────────────────────────────────────
function generateLiveAlerts(weatherData) {
  const now = new Date();
  const timeStr = 'Just now';
  const alerts = [];

  // Rain alert
  if (weatherData.rain >= 70) {
    alerts.push({ id: 101, level: 'critical', icon: '🌧️', title: 'Heavy Rain Alert', desc: `${weatherData.rain}% chance of heavy rain. Avoid spraying, cover stored crops, check drainage.`, time: timeStr });
  } else if (weatherData.rain >= 40) {
    alerts.push({ id: 102, level: 'warning', icon: '⛅', title: 'Rain Expected', desc: `${weatherData.rain}% rain probability. Skip irrigation today — rain may cover your crop's water needs.`, time: timeStr });
  }

  // Heat stress alert
  if (weatherData.temp >= 38) {
    alerts.push({ id: 103, level: 'critical', icon: '🌡️', title: 'Extreme Heat Stress', desc: `Temperature is ${weatherData.temp}°C. Irrigate in early morning/evening only. Watch for wilting.`, time: timeStr });
  } else if (weatherData.temp >= 33) {
    alerts.push({ id: 104, level: 'warning', icon: '☀️', title: 'High Temperature Warning', desc: `${weatherData.temp}°C detected. Mulch soil to retain moisture. Ensure crops are well irrigated.`, time: timeStr });
  }

  // Humidity / fungal risk
  if (weatherData.humidity >= 80) {
    alerts.push({ id: 105, level: 'critical', icon: '🍄', title: 'High Fungal Risk', desc: `Humidity at ${weatherData.humidity}% — prime conditions for powdery mildew and blight. Apply Mancozeb 2g/L today.`, time: timeStr });
  } else if (weatherData.humidity >= 65) {
    alerts.push({ id: 106, level: 'warning', icon: '💧', title: 'Elevated Humidity', desc: `Humidity ${weatherData.humidity}%. Monitor crops for early disease signs. Improve field ventilation.`, time: timeStr });
  }

  // UV / spray advisory
  if (weatherData.uv >= 8) {
    alerts.push({ id: 107, level: 'info', icon: '☀️', title: 'High UV Index', desc: `UV index is ${weatherData.uv}. Spray chemicals before 8 AM or after 5 PM. Wear protective gear.`, time: timeStr });
  }

  // Wind advisory
  if (weatherData.wind >= 25) {
    alerts.push({ id: 108, level: 'warning', icon: '💨', title: 'High Wind Speed', desc: `Wind at ${weatherData.wind} km/h. Do NOT spray pesticides/herbicides — severe drift risk.`, time: timeStr });
  }

  // Always keep at least one info item
  if (alerts.length === 0) {
    alerts.push({ id: 109, level: 'info', icon: '✅', title: 'Good Farming Conditions', desc: `Temp ${weatherData.temp}°C, Humidity ${weatherData.humidity}%, Wind ${weatherData.wind} km/h — conditions are optimal for field work today.`, time: timeStr });
  }

  // Replace static alerts with live ones (keep any user-added alerts)
  state.alerts = alerts;
  renderAlerts();
}

// ─── LIVE-DATA RECOMMENDATIONS ────────────────────────────────────────────────
function generateRecommendations() {
  const moisture = parseInt(document.getElementById('statMoisture')?.textContent) || 42;
  const weather = state._liveWeather;

  // Use live data if available, else use sensible defaults
  const temp = weather ? weather.temp : 28;
  const rain = weather ? weather.rain : 30;
  const humidity = weather ? weather.humidity : 65;
  const uv = weather ? weather.uv : 5;
  const wind = weather ? weather.wind : 10;

  // Determine current season based on month
  const month = new Date().getMonth() + 1; // 1-12
  let season = 'Rabi';
  if (month >= 6 && month <= 10) season = 'Kharif';
  else if (month >= 3 && month <= 5) season = 'Zaid';

  // Crop suggestions by season and temp
  let cropSug = 'Wheat or Mustard';
  if (season === 'Kharif') cropSug = temp > 30 ? 'Cotton or Soybean' : 'Rice or Maize';
  else if (season === 'Zaid') cropSug = 'Tomato, Onion, or Groundnut';

  const recs = [
    {
      type: rain >= 60 ? 'rec-info' : moisture < 35 ? 'rec-danger' : 'rec-warning',
      badge: '💧 Irrigation',
      text: rain >= 60
        ? `Rain probability is <strong>${rain}%</strong> today — <strong>SKIP irrigation</strong>. Let the rain do the work.`
        : moisture < 35
        ? `Soil moisture critically low at <strong>${moisture}%</strong>. <strong>Irrigate immediately</strong> — crop stress risk!`
        : `Soil moisture at <strong>${moisture}%</strong>. ${rain > 30 ? `Rain expected (${rain}%) — monitor before irrigating.` : 'Irrigate within 6 hours if no rain.'}`
    },
    {
      type: 'rec-info',
      badge: '🌾 Crop Advisory',
      text: `${season} season + ${temp}°C → Ideal for <strong>${cropSug}</strong>. Plan your next planting cycle now.`
    },
    {
      type: humidity >= 70 ? 'rec-danger' : 'rec-success',
      badge: humidity >= 70 ? '⚠️ Disease Alert' : '🌿 Spray Advisory',
      text: humidity >= 70
        ? `Humidity at <strong>${humidity}%</strong> + ${rain > 30 ? 'rain incoming' : 'warm conditions'} → High fungal risk. Apply <strong>Mancozeb 2g/L</strong> preventively today.`
        : wind >= 20
        ? `Wind speed <strong>${wind} km/h</strong> — avoid spraying today. Drift will reduce effectiveness. Spray after wind drops.`
        : uv >= 7
        ? `UV index <strong>${uv}</strong> — spray early morning (5-8 AM) for best absorption and minimal evaporation.`
        : `Good spray conditions today. Apply foliar nutrients <strong>early morning</strong> for best uptake.`
    },
    {
      type: temp >= 35 ? 'rec-danger' : 'rec-success',
      badge: temp >= 35 ? '🌡️ Heat Alert' : '🌿 Fertilizer',
      text: temp >= 35
        ? `Temperature <strong>${temp}°C</strong> is high — avoid urea top-dressing in heat. Irrigate first, fertilize after soil cools (evening).`
        : `Good weather for fertilizer application. Apply <strong>Urea 2.5 kg/acre</strong> this week before next rain for max absorption.`
    }
  ];

  const c = document.getElementById('recommendations');
  if (!c) return;
  c.innerHTML = recs.map(r => `<div class="rec-item ${r.type}"><div class="rec-badge">${r.badge}</div><p>${r.text}</p></div>`).join('');
  if (weather) showToast('🤖', 'Live AI recommendations updated!');
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
    return `**📦 Namma Rytha Tools & Accessories:**\n\nWe have premium farm tools to help your farm! Our AI recommends:\n\n✨ **AI Pick: ${featured.name}** ${featured.image}\n${featured.description || 'High-quality farm equipment for better productivity.'}\n\n🛒 **Available Categories:**\n→ 🚜 Tractors & Equipment\n→ 💧 Irrigation & Water Systems\n→ 🪚 Hand Tools\n→ 🧴 Sprayers\n→ 🌾 Harvesting Equipment\n→ 📱 Smart Accessories\n→ 🧤 Safety & PPE\n\nYou can browse and buy all items in the **Tools & Accessories** tab! 🛠️`;
  }

  // Default response
  return `**🌱 AgroSmart AI Response:**\n\nGreat question! Here's what I know:\n\n${msg.length > 20 ? 'This is a detailed farming topic.' : ''}\n\n💡 **Quick advice:** Always base farming decisions on:\n1. Your local soil test results\n2. Current weather forecast\n3. Market prices and demand\n4. Water availability\n\n📞 **For specific advice:**\n→ Use the tools on the left sidebar\n→ Contact your local KVK (Krishi Vigyan Kendra)\n→ Call Kisan Helpline: 1551 (free)\n\nIs there anything more specific you'd like to know? I'm here to help! 🌾`;
}

function startAIVoice() {
  openAIChat();
  toggleVoice();
}

// ─── VOICE INPUT ────────────────────────────────────────────────────────────
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
    document.getElementById('voiceMicBtn').textContent = '🛑 Stop';
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

function closeModal(id) {
  const modal = document.getElementById(id);
  const overlay = document.getElementById('modalOverlay');
  if (modal) modal.classList.remove('show');
  if (overlay) overlay.classList.remove('show');
}

function showSettingsProfile() {
  state.activeSettingsTab = 'profile';
  showPage('settings');
  renderSettings();
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

function renderProducts(products) {
  const grid = document.getElementById('allProductsGrid');
  if (!grid) return;
  if (products.length === 0) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px">No products found for this filter.</div>';
    return;
  }
  grid.innerHTML = products.map(p => createProductCard(p)).join('');
}

function starRating(rating) {
  const r = Math.round(rating || 0);
  return '★'.repeat(r) + '☆'.repeat(5 - r);
}

function createProductCard(p, isAI = false) {
  const inWishlist = state.wishlist.some(function(w) { return w.id === p.id; });
  const rating = p.rating || 4.0;
  const brand = p.brand || '';
  const stars = '★'.repeat(Math.floor(rating)) + '☆'.repeat(5 - Math.floor(rating));
  const badgeHtml = isAI
    ? '<span style="background:linear-gradient(135deg,#fb923c,#f59e0b);color:#fff;padding:3px 8px;border-radius:20px;font-size:10px;font-weight:700;">✨ AI Pick</span>'
    : '<span style="background:rgba(251,146,60,0.15);color:#fb923c;padding:3px 8px;border-radius:20px;font-size:10px;border:1px solid rgba(251,146,60,0.3);">' + p.category + '</span>';
  const brandHtml = brand ? '<div style="color:#fb923c;font-size:11px;font-weight:600;">' + brand + '</div>' : '';
  const wishBtn = inWishlist ? '❤️' : '🤍';
  const wishTitle = inWishlist ? 'Remove from wishlist' : 'Add to wishlist';
  const safeName = (p.name || '').replace(/"/g, '&quot;');
  return (
    '<div class="product-card" style="position:relative;display:flex;flex-direction:column;gap:8px;">' +
      '<div style="position:absolute;top:10px;left:10px;z-index:2;">' + badgeHtml + '</div>' +
      '<div class="product-image" style="font-size:48px;text-align:center;padding:24px 0 8px;">' + (p.image || '🛠️') + '</div>' +
      '<div style="padding:0 12px 12px;flex:1;display:flex;flex-direction:column;gap:6px;">' +
        '<div class="product-name" style="font-weight:700;font-size:14px;line-height:1.3;">' + p.name + '</div>' +
        brandHtml +
        '<div style="color:#f59e0b;font-size:13px;letter-spacing:1px;" title="Rating: ' + rating + '/5">' + stars + ' <span style="color:#9ca3af;font-size:11px;">' + rating + '</span></div>' +
        '<div class="product-desc" style="color:#9ca3af;font-size:12px;line-height:1.5;flex:1;">' + p.description + '</div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px;">' +
          '<span style="background:rgba(74,222,128,0.1);color:#4ade80;padding:2px 8px;border-radius:50px;font-size:10px;border:1px solid rgba(74,222,128,0.2);">🌾 ' + (p.suitable_crop || 'all') + '</span>' +
        '</div>' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;">' +
          '<div style="font-size:18px;font-weight:800;color:#4ade80;">₹' + Number(p.price).toLocaleString('en-IN') + '</div>' +
          '<div style="display:flex;gap:6px;">' +
            '<button onclick="toggleWishlist(' + p.id + ')" style="background:none;border:none;font-size:18px;cursor:pointer;padding:4px;" title="' + wishTitle + '">' + wishBtn + '</button>' +
            '<button onclick="addToCart(' + p.id + ')" style="background:rgba(74,222,128,0.1);border:1px solid rgba(74,222,128,0.3);color:#4ade80;padding:6px 12px;border-radius:8px;cursor:pointer;font-size:12px;">+Cart</button>' +
          '</div>' +
        '</div>' +
        '<button onclick="buyProduct(&quot;' + safeName + '&quot;)" style="width:100%;background:linear-gradient(135deg,#fb923c,#f59e0b);border:none;color:#fff;padding:10px;border-radius:10px;cursor:pointer;font-weight:700;font-size:13px;margin-top:4px;">Buy Now ➡️</button>' +
      '</div>' +
    '</div>'
  );
}

// ─── TOAST ────────────────────────────────────────────────────────────────────
function showToast(icon, message) {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.style.position = 'fixed';
    container.style.bottom = '110px';
    container.style.right = '28px';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '10px';
    container.style.zIndex = '9999';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.style.position = 'relative';
  toast.style.bottom = 'auto';
  toast.style.right = 'auto';
  toast.style.margin = '0';
  toast.style.pointerEvents = 'auto';
  toast.innerHTML = `<span class="toast-icon">${icon}</span> <span style="flex:1">${message}</span>`;
  container.appendChild(toast);
  
  // Trigger transition
  setTimeout(() => {
    toast.classList.add('show');
  }, 10);

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
  }, 4000);
}

// ─── REAL-TIME NOTIFICATIONS POLLING ──────────────────────────────────────────
let _lastNotificationCheckTime = Date.now();

function startRealTimeNotificationsPolling() {
  if (!state.user || !state.user.email) {
    // Retry in 3 seconds if user info is not loaded yet
    setTimeout(startRealTimeNotificationsPolling, 3000);
    return;
  }

  console.log('📡 Starting real-time notifications listener for:', state.user.email);
  _lastNotificationCheckTime = Date.now();

  setInterval(async () => {
    try {
      const res = await fetch(`${CONFIG.API_BASE_URL}/api/notifications`);
      if (!res.ok) return;
      const list = await res.json();
      
      const newAlerts = list
        .filter(notif => {
          // Verify recipient: matches user's email, or is empty (broadcast for all)
          const isRecipient = !notif.recipientEmail || 
                              notif.recipientEmail.toLowerCase() === state.user.email.toLowerCase() ||
                              notif.userName.toLowerCase().includes('all');
          
          if (!isRecipient) return false;
          
          const notifTime = new Date(notif.timestamp).getTime();
          return notifTime > _lastNotificationCheckTime;
        })
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      if (newAlerts.length > 0) {
        newAlerts.forEach(alert => {
          // 1. Display toast notification
          showToast('🔔', alert.message);
          
          // 2. Append to Dashboard active alerts list
          state.alerts = state.alerts || [];
          state.alerts.unshift({
            id: alert._id || 'notif-' + new Date(alert.timestamp).getTime(),
            level: alert.eventType === 'Suspicious Activity' ? 'critical' : (alert.eventType === 'Weather Alert' ? 'warning' : 'info'),
            icon: alert.eventType === 'Suspicious Activity' ? '🚨' : (alert.eventType === 'Weather Alert' ? '⛅' : '🌿'),
            title: alert.eventType || 'System Alert',
            desc: alert.message,
            time: 'Just now'
          });
          
          // Render alerts list on Dashboard
          renderAlerts();
          
          // 3. Log locally in settings logs
          const logs = JSON.parse(localStorage.getItem('nr_notification_logs') || '[]');
          logs.unshift({
            timestamp: new Date(alert.timestamp).toLocaleTimeString(),
            event: alert.eventType || 'Alert',
            msg: alert.message,
            channels: alert.channels || ['push']
          });
          if (logs.length > 20) logs.pop();
          localStorage.setItem('nr_notification_logs', JSON.stringify(logs));
          
          // Update last check time
          const alertTime = new Date(alert.timestamp).getTime();
          if (alertTime > _lastNotificationCheckTime) {
            _lastNotificationCheckTime = alertTime;
          }
        });
        
        // Re-render settings page if user is currently viewing logs
        if (state.currentPage === 'settings' && state.activeSettingsTab === 'alerts') {
          renderSettings();
        }
      }
    } catch (err) {
      console.warn('Failed to poll notifications:', err.message);
    }
  }, 5000);
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
  grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px">⏳ Loading Tools & Accessories...</div>';
  try {
    const res = await fetch(`${CONFIG.API_BASE_URL}/api/products`);
    allProducts = await res.json();
    renderProducts(allProducts);
    recommendProducts();
  } catch (err) {
    console.error('Failed to load products:', err);
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:#f87171">❌ Failed to load. Please ensure server is running.</div>';
  }
}

function recommendProducts() {
  const recGrid = document.getElementById('aiRecommendedProducts');
  if (!recGrid || allProducts.length === 0) return;
  const userCrop = (state.user.crop || 'all').toLowerCase();
  const recommended = allProducts.filter(p =>
    p.suitable_crop && (p.suitable_crop.toLowerCase() === userCrop || p.suitable_crop.toLowerCase() === 'all')
  ).sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 4);
  if (recommended.length === 0) {
    recGrid.innerHTML = '<div style="padding:40px;text-align:center;color:#6b7280;grid-column:1/-1;">✨ Scanning for best tool matches...</div>';
  } else {
    recGrid.innerHTML = recommended.map(p => createProductCard(p, true)).join('');
  }
}

function filterProducts() {
  const cat = document.getElementById('productCategoryFilter')?.value || 'all';
  const search = (document.getElementById('marketSearch')?.value || '').toLowerCase();
  const sort = document.getElementById('productSortFilter')?.value || 'default';

  let filtered = allProducts.filter(p => {
    const matchCat = cat === 'all' || p.category === cat;
    const matchSearch = !search || p.name.toLowerCase().includes(search) || p.description.toLowerCase().includes(search) || (p.brand || '').toLowerCase().includes(search);
    return matchCat && matchSearch;
  });

  if (sort === 'price-asc') filtered.sort((a, b) => a.price - b.price);
  else if (sort === 'price-desc') filtered.sort((a, b) => b.price - a.price);
  else if (sort === 'rating') filtered.sort((a, b) => (b.rating || 0) - (a.rating || 0));

  renderProducts(filtered);
}

function buyProduct(name) {
  showToast('🛒', `Added ${name} to cart!`);
  openAIChat(`I'm interested in buying ${name}. Can you tell me more about its benefits for my farm?`);
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  initSplash();
  updateClock();
  renderAlerts();
  generateRecommendations();
  updateDashboardForecast();
  loadFarmData();
  updateSustainabilityUI();
  startRealTimeNotificationsPolling();

  // ── REAL-TIME DATA CHAIN ──────────────────────────────────────────────────
  // Step 1: Fetch live weather (also updates dashboard temp, rain, recommendations, alerts)
  fetchWeather();

  // Step 2: Sync dashboard stat cards (temp + rain) independently & quickly
  setTimeout(() => syncDashboardWeather(), 800);

  // Step 3: Auto-fetch market prices for detected city after weather loads
  setTimeout(async () => {
    try {
      // Try to get city from auto-detected weather location
      const cityEl = document.getElementById('cwCity');
      const cityRaw = cityEl ? cityEl.textContent.replace(/[📍📡]/g, '').trim() : '';
      const city = cityRaw && !cityRaw.includes('detecting') && !cityRaw.includes('Auto')
        ? cityRaw.split(',')[0].trim()
        : null;

      const marketCityInput = document.getElementById('marketCityInput');
      if (city && marketCityInput && !marketCityInput.value.trim()) {
        marketCityInput.value = city;
      }
      // Silently pre-fetch market data in background
      await fetchRealTimeMarketPrices();
    } catch(e) { console.warn('Auto market fetch failed:', e); }
  }, 3500);
  // ─────────────────────────────────────────────────────────────────────────

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

  // Handle URL query parameters page routing
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const pageParam = urlParams.get('page');
    if (pageParam) {
      showPage(pageParam);
    }
  } catch (e) {
    console.error('Error parsing query params:', e);
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
  }, 10);

  // Hide splash after delay
  setTimeout(() => {
    splash.classList.add('hidden');

    // Cleanup after transition
    setTimeout(() => {
      splash.style.display = 'none';
    }, 200);
  }, 350); // 350ms delay
}

// ─── CAMERA LOGIC ─────────────────────────────────────────────────────────────

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

    // Hook for real-time sustainability update
    incrementSustainabilityTelemetry({
      diseaseChecks: 1
    });
    logUserActivity('disease_scan', `Scanned field with AI crop disease diagnostic (${type === 'disease' ? 'tomato blight' : 'healthy canopy'})`);
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
  theme: localStorage.getItem('nr_theme') || 'emerald-fields',
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
  // Map old 'dark' keyword to emerald-fields
  const targetTheme = theme === 'dark' ? 'emerald-fields' : theme;
  document.documentElement.setAttribute('data-theme', targetTheme);
  
  appSettings.theme = targetTheme;
  localStorage.setItem('nr_theme', targetTheme);
  
  // Update toggle button icon
  const btn = document.getElementById('themeToggleBtn');
  if (btn) {
    btn.textContent = targetTheme === 'light' ? '☀️' : '🌙';
  }
}

function toggleTheme() {
  const current = appSettings.theme || 'emerald-fields';
  let next = 'light';
  if (current === 'light') {
    // Switch back to the last active dark theme
    next = localStorage.getItem('nr_last_dark_theme') || 'emerald-fields';
  } else {
    // Save current dark theme and switch to light
    localStorage.setItem('nr_last_dark_theme', current);
    next = 'light';
  }
  applyTheme(next);
  showToast(next === 'light' ? '☀️' : '🌙', next === 'light' ? 'Light Mode On' : 'Dark Mode On');
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
  logUserActivity('add_to_cart', `Added ${product.name} (₹${product.price}) to cart`);
}

function toggleWishlist(id) {
  const index = state.wishlist.findIndex(p => p.id === id);
  if (index === -1) {
    const product = allProducts.find(p => p.id === id);
    if (product) {
      state.wishlist.push(product);
      logUserActivity('add_to_wishlist', `Added ${product.name} to wishlist`);
    }
    showToast('❤️', 'Added to wishlist!');
  } else {
    const product = state.wishlist[index];
    state.wishlist.splice(index, 1);
    if (product) {
      logUserActivity('remove_from_wishlist', `Removed ${product.name} from wishlist`);
    }
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

    const totalAmount = parseFloat(total.replace('₹', ''));
    const items = state.cart.map(p => ({ id: p.id, name: p.name, price: p.price, image: p.image }));
    
    fetch(`${CONFIG.API_BASE_URL}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: state.user.id || 0,
        userName: state.user.name || state.user.email || 'Farmer',
        items: JSON.stringify(items),
        total: totalAmount
      })
    }).catch(err => console.error('Failed to submit order:', err));
    
    logUserActivity('place_order', `Placed order of ${total} for ${items.length} item(s)`);

    // Hook for real-time sustainability update
    let extraCO2 = 2; // base CO2 saved per order
    items.forEach(item => {
      const ecoKeywords = ['drip', 'solar', 'timer', 'npk', 'meter', 'gloves', 'shield', 'weeder'];
      const name = item.name.toLowerCase();
      if (ecoKeywords.some(keyword => name.includes(keyword))) {
        extraCO2 += 10;
      }
    });

    incrementSustainabilityTelemetry({
      ordersCount: 1,
      incomeIncreased: Math.round(totalAmount * 0.15),
      co2Saved: extraCO2
    });

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
  const firstName = document.getElementById('settingsFirstName')?.value?.trim() || '';
  const lastName  = document.getElementById('settingsLastName')?.value?.trim()  || '';
  const location  = document.getElementById('settingsLocation')?.value?.trim()  || '';
  const area      = document.getElementById('settingsArea')?.value?.trim()      || '';
  const crop      = document.getElementById('settingsCrop')?.value?.trim()      || '';
  const phone     = document.getElementById('settingsPhone')?.value?.trim()     || '';
  const avatar    = state.user.avatar || '';

  // ── Step 1: Always save locally first so UI never fails ──
  const updatedUser = {
    ...state.user,
    firstName, lastName, location, area, crop, phone, avatar,
    name: `${firstName} ${lastName}`.trim() || state.user.name
  };
  state.user = updatedUser;
  localStorage.setItem('nr_user', JSON.stringify(state.user));
  showToast('✅', 'Profile updated successfully!');
  updateDashboardUser();
  renderSettings();

  // ── Step 2: Try to sync to backend silently (if available) ──
  if (!state.user.id) return; // guest / no account yet
  const data = { id: state.user.id, firstName, lastName, location, area, crop, phone, avatar };
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000); // 6s timeout
    const res = await fetch(`${CONFIG.API_BASE_URL}/api/user/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal: controller.signal
    });
    clearTimeout(timeout);
    const result = await res.json();
    if (!result.success) {
      console.warn('Backend sync notice:', result.error || 'Non-success response');
    }
  } catch (e) {
    // Backend unreachable (sleeping on Render free tier, or offline) — local save already done
    console.warn('Profile backend sync skipped (offline/timeout):', e.message);
  }
}

function updateDashboardUser() {
  const nameEl = document.getElementById('farmerName');
  const locEl = document.getElementById('farmerLoc');
  if (nameEl) nameEl.textContent = state.user.name || 'User';
  if (locEl) locEl.textContent = '📍 ' + (state.user.location || 'Bengaluru, Karnataka');
  
  const avatarEl = document.getElementById('sidebarAvatar');
  if (avatarEl) {
    if (state.user.avatar) {
      avatarEl.innerHTML = `<img src="${state.user.avatar}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;" />`;
    } else {
      avatarEl.innerHTML = '👨‍🌾';
    }
  }
}

function triggerProfilePhotoUpload() {
  document.getElementById('profilePhotoInput')?.click();
}

function handleProfilePhotoUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  if (file.size > 2 * 1024 * 1024) {
    showToast('⚠️', 'Photo must be smaller than 2MB');
    return;
  }
  
  const reader = new FileReader();
  reader.onload = function(e) {
    const base64Data = e.target.result;
    
    // Update local state temporarily (saved to DB on Save)
    state.user.avatar = base64Data;
    
    // Update settings preview container immediately
    const avatarDisplay = document.getElementById('settingsProfileAvatar');
    if (avatarDisplay) {
      avatarDisplay.innerHTML = `<img src="${base64Data}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;" />`;
    }
    
    // Update sidebar avatar immediately
    const sidebarAvatar = document.getElementById('sidebarAvatar');
    if (sidebarAvatar) {
      sidebarAvatar.innerHTML = `<img src="${base64Data}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;" />`;
    }
    
    showToast('📸', 'Photo selected! Click Save Profile Changes to confirm.');
  };
  reader.readAsDataURL(file);
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
    appSettings.theme = 'emerald-fields';
    appSettings.animations = true;
    appSettings.compactMode = false;
    appSettings.farmBg = true;
  }
  applyTheme('emerald-fields');
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
  
  if (!state.activeSettingsTab) {
    state.activeSettingsTab = 'profile';
  }

  const currentTheme = appSettings?.theme || localStorage.getItem('nr_theme') || 'emerald-fields';
  const activeTheme = currentTheme === 'dark' ? 'emerald-fields' : currentTheme;
  const anim = appSettings?.animations !== undefined ? appSettings.animations : localStorage.getItem('nr_ui_anim') !== 'false';
  const compact = appSettings?.compactMode || localStorage.getItem('nr_compact') === 'true';
  const farmBg = appSettings?.farmBg !== undefined ? appSettings.farmBg : localStorage.getItem('nr_bg_anim') !== 'false';
  
  const userName = state.user.name || state.user.username || 'Farmer';
  const userEmail = state.user.email || 'demo@nammarytha.in';
  const initials = userName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  
  // Calculate current eco score
  const sustainStats = getSustainabilityStats();

  let tabContent = '';
  
  if (state.activeSettingsTab === 'profile') {
    const firstName = state.user.firstName || state.user.name?.split(' ')[0] || '';
    const lastName = state.user.lastName || state.user.name?.split(' ').slice(1).join(' ') || '';
    const location = state.user.location || '';
    const phone = state.user.phone || '';
    const area = state.user.area || '';
    const crop = state.user.crop || 'tomato';

    const avatarDisplay = state.user.avatar 
      ? `<img src="${state.user.avatar}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;" />`
      : initials;

    tabContent = `
      <div class="settings-layout">
        <!-- Profile Overview Card -->
        <div class="settings-profile-card" style="margin-bottom:0; flex-direction:column; justify-content:center; align-items:center; height:100%;">
          <div class="profile-avatar editable" id="settingsProfileAvatar" onclick="triggerProfilePhotoUpload()" style="width:96px; height:96px; font-size:38px; position:relative; overflow:hidden;" title="Click to upload profile photo">
            ${avatarDisplay}
          </div>
          <input type="file" id="profilePhotoInput" accept="image/*" style="display:none;" onchange="handleProfilePhotoUpload(event)" />
          <div class="profile-info" style="text-align:center; margin-top:16px;">
            <div class="profile-name" style="font-size:22px;">${userName}</div>
            <div class="profile-email" style="font-size:14px; color:var(--text-muted); margin-top:4px;">${userEmail}</div>
            
            <div class="profile-badges" style="justify-content:center; margin-top:12px;">
              <span class="profile-badge badge-pro">🌱 Farmer Pro</span>
              <span class="profile-badge badge-verified">✓ Verified</span>
            </div>
            
            <div style="margin-top:20px; padding:12px; background:rgba(74,222,128,0.06); border-radius:12px; border:1px solid rgba(74,222,128,0.15)">
              <div style="font-size:12px; color:var(--text-muted)">Eco Score</div>
              <div style="font-size:24px; font-weight:800; color:var(--green-primary); margin-top:4px;">${sustainStats.overallScore}/100</div>
              <div style="font-size:11px; color:#4ade80; margin-top:2px;">Grade: ${sustainStats.grade}</div>
            </div>
          </div>
        </div>

        <!-- Profile Edit Form -->
        <div class="settings-section">
          <div class="settings-section-header">
            <div class="section-icon appearance">📝</div>
            <div>
              <div class="section-title-text">Edit Profile Details</div>
              <div class="section-subtitle">Keep your farm registry updated</div>
            </div>
          </div>
          
          <div style="padding: 22px;">
            <div class="settings-form-grid">
              <div class="settings-input-group">
                <label class="form-label">First Name</label>
                <input type="text" class="form-input" id="settingsFirstName" value="${firstName}" placeholder="e.g. Ramesh" />
              </div>
              <div class="settings-input-group">
                <label class="form-label">Last Name</label>
                <input type="text" class="form-input" id="settingsLastName" value="${lastName}" placeholder="e.g. Gowda" />
              </div>
              <div class="settings-input-group">
                <label class="form-label">Phone Number</label>
                <input type="text" class="form-input" id="settingsPhone" value="${phone}" placeholder="e.g. +91 9876543210" />
              </div>
              <div class="settings-input-group">
                <label class="form-label">Location (District/State)</label>
                <div style="display:flex; gap:8px;">
                  <input type="text" class="form-input" id="settingsLocation" value="${location}" placeholder="e.g. Mandya, Karnataka" style="flex:1;" />
                  <button class="btn btn-secondary" onclick="useDetectedCityForSettingsProfile()" style="width:auto; margin-top:0; padding:10px 14px; border-radius:8px;">📡 Detect</button>
                </div>
              </div>
              <div class="settings-input-group">
                <label class="form-label">Land Size (Acres)</label>
                <input type="number" class="form-input" id="settingsArea" value="${area}" placeholder="e.g. 4" />
              </div>
              <div class="settings-input-group">
                <label class="form-label">Primary Cultivated Crop</label>
                <select class="form-select" id="settingsCrop">
                  <option value="wheat" ${crop === 'wheat' ? 'selected' : ''}>Wheat</option>
                  <option value="rice" ${crop === 'rice' ? 'selected' : ''}>Rice</option>
                  <option value="tomato" ${crop === 'tomato' ? 'selected' : ''}>Tomato</option>
                  <option value="cotton" ${crop === 'cotton' ? 'selected' : ''}>Cotton</option>
                  <option value="maize" ${crop === 'maize' ? 'selected' : ''}>Maize</option>
                  <option value="sugarcane" ${crop === 'sugarcane' ? 'selected' : ''}>Sugarcane</option>
                  <option value="turmeric" ${crop === 'turmeric' ? 'selected' : ''}>Turmeric</option>
                  <option value="onion" ${crop === 'onion' ? 'selected' : ''}>Onion</option>
                  <option value="potato" ${crop === 'potato' ? 'selected' : ''}>Potato</option>
                  <option value="soybean" ${crop === 'soybean' ? 'selected' : ''}>Soybean</option>
                </select>
              </div>
            </div>
            
            <button class="btn btn-primary" onclick="updateProfile()" style="margin-top:24px;">💾 Save Profile Changes</button>
          </div>
        </div>
      </div>
    `;
  } else if (state.activeSettingsTab === 'preferences') {
    tabContent = `
      <div class="settings-layout">
        <!-- Appearance Panel -->
        <div>
          <div class="settings-section">
            <div class="settings-section-header">
              <div class="section-icon appearance">🎨</div>
              <div>
                <div class="section-title-text">Appearance Theme</div>
                <div class="section-subtitle">Visual styling adjustments</div>
              </div>
            </div>
            <div class="theme-selector" style="padding:22px; display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:12px;">
              <!-- Emerald Fields -->
              <div class="theme-option ${activeTheme === 'emerald-fields' ? 'active' : ''}" onclick="applyTheme('emerald-fields');renderSettings();showToast('🌲','Emerald Fields Theme activated')">
                <div class="check-mark">✓</div>
                <div class="theme-mini-preview" style="background:#0a0f0a; border-color:rgba(74,222,128,0.2); position:relative; overflow:hidden; display:flex;">
                  <div class="prev-side" style="background:#111811; border-right:1px solid rgba(74,222,128,0.12); width:30%; height:100%;"></div>
                  <div class="prev-main" style="flex:1; padding:6px; display:flex; flex-direction:column; gap:4px;">
                    <div class="prev-line" style="background:rgba(255,255,255,0.1); height:3px; border-radius:2px;"></div>
                    <div class="prev-line accent" style="background:#4ade80; height:3px; border-radius:2px;"></div>
                    <div class="prev-line" style="background:rgba(255,255,255,0.06); width:75%; height:3px; border-radius:2px;"></div>
                  </div>
                </div>
                <div class="theme-option-label" style="text-align:center; margin-top:6px; font-size:11px; font-weight:600;">🌲 Emerald Fields</div>
              </div>

              <!-- Golden Harvest -->
              <div class="theme-option ${activeTheme === 'golden-harvest' ? 'active' : ''}" onclick="applyTheme('golden-harvest');renderSettings();showToast('🌾','Golden Harvest Theme activated')">
                <div class="check-mark">✓</div>
                <div class="theme-mini-preview" style="background:#140d07; border-color:rgba(251,191,36,0.2); position:relative; overflow:hidden; display:flex;">
                  <div class="prev-side" style="background:#1f140c; border-right:1px solid rgba(251,191,36,0.12); width:30%; height:100%;"></div>
                  <div class="prev-main" style="flex:1; padding:6px; display:flex; flex-direction:column; gap:4px;">
                    <div class="prev-line" style="background:rgba(255,255,255,0.1); height:3px; border-radius:2px;"></div>
                    <div class="prev-line accent" style="background:#fbbf24; height:3px; border-radius:2px;"></div>
                    <div class="prev-line" style="background:rgba(255,255,255,0.06); width:75%; height:3px; border-radius:2px;"></div>
                  </div>
                </div>
                <div class="theme-option-label" style="text-align:center; margin-top:6px; font-size:11px; font-weight:600;">🌾 Golden Harvest</div>
              </div>

              <!-- Ocean Breeze -->
              <div class="theme-option ${activeTheme === 'ocean-breeze' ? 'active' : ''}" onclick="applyTheme('ocean-breeze');renderSettings();showToast('🌊','Ocean Breeze Theme activated')">
                <div class="check-mark">✓</div>
                <div class="theme-mini-preview" style="background:#070f1a; border-color:rgba(56,189,248,0.2); position:relative; overflow:hidden; display:flex;">
                  <div class="prev-side" style="background:#0f1a2e; border-right:1px solid rgba(56,189,248,0.12); width:30%; height:100%;"></div>
                  <div class="prev-main" style="flex:1; padding:6px; display:flex; flex-direction:column; gap:4px;">
                    <div class="prev-line" style="background:rgba(255,255,255,0.1); height:3px; border-radius:2px;"></div>
                    <div class="prev-line accent" style="background:#38bdf8; height:3px; border-radius:2px;"></div>
                    <div class="prev-line" style="background:rgba(255,255,255,0.06); width:75%; height:3px; border-radius:2px;"></div>
                  </div>
                </div>
                <div class="theme-option-label" style="text-align:center; margin-top:6px; font-size:11px; font-weight:600;">🌊 Ocean Breeze</div>
              </div>

              <!-- Midnight Neon -->
              <div class="theme-option ${activeTheme === 'midnight-neon' ? 'active' : ''}" onclick="applyTheme('midnight-neon');renderSettings();showToast('🔮','Midnight Neon Theme activated')">
                <div class="check-mark">✓</div>
                <div class="theme-mini-preview" style="background:#0c0714; border-color:rgba(167,139,250,0.2); position:relative; overflow:hidden; display:flex;">
                  <div class="prev-side" style="background:#150d22; border-right:1px solid rgba(167,139,250,0.12); width:30%; height:100%;"></div>
                  <div class="prev-main" style="flex:1; padding:6px; display:flex; flex-direction:column; gap:4px;">
                    <div class="prev-line" style="background:rgba(255,255,255,0.1); height:3px; border-radius:2px;"></div>
                    <div class="prev-line accent" style="background:#a78bfa; height:3px; border-radius:2px;"></div>
                    <div class="prev-line" style="background:rgba(255,255,255,0.06); width:75%; height:3px; border-radius:2px;"></div>
                  </div>
                </div>
                <div class="theme-option-label" style="text-align:center; margin-top:6px; font-size:11px; font-weight:600;">🔮 Midnight Neon</div>
              </div>

              <!-- Light Meadow -->
              <div class="theme-option ${activeTheme === 'light' ? 'active' : ''}" onclick="applyTheme('light');renderSettings();showToast('☀️','Light Meadow Theme activated')">
                <div class="check-mark">✓</div>
                <div class="theme-mini-preview" style="background:#f0fdf4; border-color:rgba(22,163,74,0.2); position:relative; overflow:hidden; display:flex;">
                  <div class="prev-side" style="background:#ffffff; border-right:1px solid rgba(22,163,74,0.12); width:30%; height:100%;"></div>
                  <div class="prev-main" style="flex:1; padding:6px; display:flex; flex-direction:column; gap:4px;">
                    <div class="prev-line" style="background:rgba(0,0,0,0.05); height:3px; border-radius:2px;"></div>
                    <div class="prev-line accent" style="background:#16a34a; height:3px; border-radius:2px;"></div>
                    <div class="prev-line" style="background:rgba(0,0,0,0.03); width:75%; height:3px; border-radius:2px;"></div>
                  </div>
                </div>
                <div class="theme-option-label" style="text-align:center; margin-top:6px; font-size:11px; font-weight:600;">☀️ Light Meadow</div>
              </div>

              <!-- Sakura Bloom -->
              <div class="theme-option ${activeTheme === 'sakura-bloom' ? 'active' : ''}" onclick="applyTheme('sakura-bloom');renderSettings();showToast('🌸','Sakura Bloom Theme activated')">
                <div class="check-mark">✓</div>
                <div class="theme-mini-preview" style="background:#1a0a14; border-color:rgba(244,114,182,0.2); position:relative; overflow:hidden; display:flex;">
                  <div class="prev-side" style="background:#261220; border-right:1px solid rgba(244,114,182,0.12); width:30%; height:100%;"></div>
                  <div class="prev-main" style="flex:1; padding:6px; display:flex; flex-direction:column; gap:4px;">
                    <div class="prev-line" style="background:rgba(255,255,255,0.1); height:3px; border-radius:2px;"></div>
                    <div class="prev-line accent" style="background:#f472b6; height:3px; border-radius:2px;"></div>
                    <div class="prev-line" style="background:rgba(255,255,255,0.06); width:75%; height:3px; border-radius:2px;"></div>
                  </div>
                </div>
                <div class="theme-option-label" style="text-align:center; margin-top:6px; font-size:11px; font-weight:600;">🌸 Sakura Bloom</div>
              </div>

              <!-- Volcanic Ember -->
              <div class="theme-option ${activeTheme === 'volcanic-ember' ? 'active' : ''}" onclick="applyTheme('volcanic-ember');renderSettings();showToast('🔥','Volcanic Ember Theme activated')">
                <div class="check-mark">✓</div>
                <div class="theme-mini-preview" style="background:#1a0805; border-color:rgba(239,68,68,0.2); position:relative; overflow:hidden; display:flex;">
                  <div class="prev-side" style="background:#261210; border-right:1px solid rgba(239,68,68,0.12); width:30%; height:100%;"></div>
                  <div class="prev-main" style="flex:1; padding:6px; display:flex; flex-direction:column; gap:4px;">
                    <div class="prev-line" style="background:rgba(255,255,255,0.1); height:3px; border-radius:2px;"></div>
                    <div class="prev-line accent" style="background:#ef4444; height:3px; border-radius:2px;"></div>
                    <div class="prev-line" style="background:rgba(255,255,255,0.06); width:75%; height:3px; border-radius:2px;"></div>
                  </div>
                </div>
                <div class="theme-option-label" style="text-align:center; margin-top:6px; font-size:11px; font-weight:600;">🔥 Volcanic Ember</div>
              </div>

              <!-- Aurora Borealis -->
              <div class="theme-option ${activeTheme === 'aurora-borealis' ? 'active' : ''}" onclick="applyTheme('aurora-borealis');renderSettings();showToast('🌌','Aurora Borealis Theme activated')">
                <div class="check-mark">✓</div>
                <div class="theme-mini-preview" style="background:#041210; border-color:rgba(20,184,166,0.2); position:relative; overflow:hidden; display:flex;">
                  <div class="prev-side" style="background:#0a1f1c; border-right:1px solid rgba(20,184,166,0.12); width:30%; height:100%;"></div>
                  <div class="prev-main" style="flex:1; padding:6px; display:flex; flex-direction:column; gap:4px;">
                    <div class="prev-line" style="background:rgba(255,255,255,0.1); height:3px; border-radius:2px;"></div>
                    <div class="prev-line accent" style="background:#14b8a6; height:3px; border-radius:2px;"></div>
                    <div class="prev-line" style="background:rgba(255,255,255,0.06); width:75%; height:3px; border-radius:2px;"></div>
                  </div>
                </div>
                <div class="theme-option-label" style="text-align:center; margin-top:6px; font-size:11px; font-weight:600;">🌌 Aurora Borealis</div>
              </div>
            </div>
          </div>

          <div class="settings-section">
            <div class="settings-section-header">
              <div class="section-icon dashboard">🌾</div>
              <div>
                <div class="section-title-text">App Interactivity</div>
                <div class="section-subtitle">Animation & performance options</div>
              </div>
            </div>
            <div style="padding:8px 0;">
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
                    <div class="item-desc">Transitions & micro-interactions</div>
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
        </div>

        <!-- AI Engine Access -->
        <div class="settings-section">
          <div class="settings-section-header">
            <div class="section-icon account" style="background:rgba(167,139,250,0.12); border-color:rgba(167,139,250,0.2); color:var(--purple-accent);">🔮</div>
            <div>
              <div class="section-title-text">AI Assistant Settings</div>
              <div class="section-subtitle">Manage Google Gemini AI Grounding</div>
            </div>
          </div>
          
          <div style="padding: 22px;">
            <div class="form-group">
              <label class="form-label">Google Gemini API Key</label>
              <div style="display:flex; gap:8px;">
                <input type="password" class="form-input" id="geminiKeyInput" value="${localStorage.getItem('nr_gemini_key') || ''}" placeholder="AIzaSy..." style="flex:1;" />
                <button class="btn btn-secondary" onclick="saveGeminiKey()" style="width:auto; margin-top:0; padding:10px 18px; border-radius:8px;">💾 Save</button>
              </div>
              <div style="font-size:11px; color:var(--text-muted); margin-top:8px; line-height:1.4">
                Enter your key to unlock real-time agricultural news summaries, crop diagnostics advice, and global market price AI search grounding. Key is stored locally in your browser storage.
              </div>
            </div>
            
            <div style="margin-top:20px; padding:12px; background:rgba(167,139,250,0.06); border-radius:12px; border:1px solid rgba(167,139,250,0.15)">
              <div style="font-size:12px; font-weight:600; color:var(--purple-accent); display:flex; align-items:center; gap:6px;">
                <span>💡 Free Keys Available</span>
              </div>
              <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">
                You can get a free, personal API key by signing up with your Google account at the <a href="https://aistudio.google.com/" target="_blank" style="color:var(--purple-accent); text-decoration:underline;">Google AI Studio Console</a>.
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  } else if (state.activeSettingsTab === 'alerts') {
    const rawChannels = localStorage.getItem('nr_notification_channels');
    const channels = rawChannels ? JSON.parse(rawChannels) : ['email', 'sms', 'push'];
    
    const logs = JSON.parse(localStorage.getItem('nr_notification_logs') || '[]');
    let logHtml = '';
    if (logs.length === 0) {
      logHtml = '<div style="color:var(--text-muted); font-size:12px; text-align:center; padding: 20px 0;">No notification history. Use triggers below to send test alerts!</div>';
    } else {
      logs.forEach(log => {
        logHtml += `
          <div style="border-bottom: 1px solid rgba(255,255,255,0.04); padding-bottom:8px; margin-bottom:8px;">
            <div style="display:flex; justify-content:space-between; align-items:center; font-size:11px; color:var(--text-muted);">
              <span>⏱️ ${log.timestamp} • Type: <strong>${log.event}</strong></span>
              <span style="background:rgba(74,222,128,0.1); color:var(--green-primary); padding:2px 6px; border-radius:6px; font-size:9px; font-weight:bold;">${log.channels.join(', ').toUpperCase()}</span>
            </div>
            <div style="font-size:12px; color:var(--text-primary); margin-top:4px; line-height:1.4">${log.msg}</div>
          </div>
        `;
      });
    }

    tabContent = `
      <style>
        .pref-card {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 12px;
          padding: 16px;
          margin-bottom: 12px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          cursor: pointer;
          transition: all 0.3s;
        }
        .pref-card:hover {
          border-color: rgba(74, 222, 128, 0.3);
          background: rgba(74, 222, 128, 0.03);
        }
        .pref-card.active {
          border-color: var(--green-primary);
          background: rgba(74, 222, 128, 0.06);
        }
        .pref-checkbox {
          width: 20px;
          height: 20px;
          border-radius: 6px;
          border: 2px solid rgba(255,255,255,0.2);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          color: #050a05;
          font-weight: bold;
          transition: all 0.3s;
        }
        .pref-card.active .pref-checkbox {
          border-color: var(--green-primary);
          background: var(--green-primary);
        }
        .trigger-btn {
          width: 100%;
          text-align: left;
          justify-content: flex-start;
          height: 44px;
          padding: 0 16px;
          margin-bottom: 8px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          color: var(--text-primary);
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 10px;
          transition: all 0.3s;
        }
        .trigger-btn:hover {
          border-color: var(--green-primary);
          background: rgba(74, 222, 128, 0.05);
        }
        .trigger-btn.danger-btn:hover {
          border-color: #f87171;
          background: rgba(248, 113, 113, 0.05);
        }
      </style>

      <div class="settings-layout">
        <!-- Notification Preferences -->
        <div class="settings-section">
          <div class="settings-section-header">
            <div class="section-icon alerts">🔔</div>
            <div>
              <div class="section-title-text">Alert Delivery Preferences</div>
              <div class="section-subtitle">Select preferred alert channels</div>
            </div>
          </div>
          
          <div style="padding: 22px;">
            <div class="pref-card ${channels.includes('email') ? 'active' : ''}" onclick="toggleAlertChannel('email')">
              <div style="display:flex; align-items:center; gap:12px;">
                <span style="font-size:18px;">✉️</span>
                <div>
                  <div style="font-size:13px; font-weight:600;">Email Alerts</div>
                  <div style="font-size:11px; color:var(--text-muted);">Receive farm telemetry via email inbox</div>
                </div>
              </div>
              <div class="pref-checkbox">${channels.includes('email') ? '✓' : ''}</div>
            </div>
            
            <div class="pref-card ${channels.includes('sms') ? 'active' : ''}" onclick="toggleAlertChannel('sms')">
              <div style="display:flex; align-items:center; gap:12px;">
                <span style="font-size:18px;">💬</span>
                <div>
                  <div style="font-size:13px; font-weight:600;">SMS Notifications</div>
                  <div style="font-size:11px; color:var(--text-muted);">Get instant mobile text alerts</div>
                </div>
              </div>
              <div class="pref-checkbox">${channels.includes('sms') ? '✓' : ''}</div>
            </div>
            
            <div class="pref-card ${channels.includes('push') ? 'active' : ''}" onclick="toggleAlertChannel('push')">
              <div style="display:flex; align-items:center; gap:12px;">
                <span style="font-size:18px;">🔔</span>
                <div>
                  <div style="font-size:13px; font-weight:600;">App Push Notifications</div>
                  <div style="font-size:11px; color:var(--text-muted);">Show popup notification toasts inside app</div>
                </div>
              </div>
              <div class="pref-checkbox">${channels.includes('push') ? '✓' : ''}</div>
            </div>
          </div>
        </div>

        <!-- Manual Event Triggers -->
        <div class="settings-section">
          <div class="settings-section-header">
            <div class="section-icon appearance">⚡</div>
            <div>
              <div class="section-title-text">Event Triggers</div>
              <div class="section-subtitle">Simulate activity to fire alerts</div>
            </div>
          </div>
          
          <div style="padding: 22px;">
            <button class="trigger-btn" id="btnTriggerLogin" onclick="triggerNotificationEvent('Login')">🔓 Simulate User Login</button>
            <button class="trigger-btn" id="btnTriggerPassword" onclick="triggerNotificationEvent('Password Change')">🔑 Simulate Password Update</button>
            <button class="trigger-btn" id="btnTriggerPayment" onclick="triggerNotificationEvent('Payment')">💳 Simulate Order Payment</button>
            <button class="trigger-btn" id="btnTriggerShipment" onclick="triggerNotificationEvent('Shipment')">🚚 Simulate Product Shipment</button>
            <button class="trigger-btn danger-btn" id="btnTriggerSuspicious" onclick="triggerNotificationEvent('Suspicious Activity')" style="color:#f87171;">⚠️ Simulate Suspicious Access</button>
          </div>
        </div>

        <!-- Event Logs -->
        <div class="settings-section" style="grid-column: span 2;">
          <div class="settings-section-header">
            <div class="section-icon reports">📜</div>
            <div>
              <div class="section-title-text">Notification Logs</div>
              <div class="section-subtitle">Historical registry of sent alerts</div>
            </div>
          </div>
          <div style="padding: 22px;">
            <div class="event-log-container" style="max-height: 250px; overflow-y: auto; background: rgba(0,0,0,0.2); border-radius: 10px; border: 1px solid rgba(255,255,255,0.06); padding: 12px; display:flex; flex-direction:column; gap:8px;">
              ${logHtml}
            </div>
          </div>
        </div>
      </div>
    `;
  } else {
    tabContent = `
      <div class="settings-layout">
        <!-- Account Services -->
        <div class="settings-section">
          <div class="settings-section-header">
            <div class="section-icon account">👤</div>
            <div>
              <div class="section-title-text">Account Services</div>
              <div class="section-subtitle">Preferences & credentials</div>
            </div>
          </div>
          <div style="padding:8px 0;">
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
                  <div class="item-desc">Refer other farmers & earn points</div>
                </div>
              </div>
              <button class="settings-action-btn gold" onclick="copyReferral()">🤝 Refer</button>
            </div>
            <div class="settings-item-row">
              <div class="settings-item-left">
                <div class="item-icon-mini">⏻</div>
                <div class="item-text">
                  <div class="item-label">Logout</div>
                  <div class="item-desc">Sign out of your session</div>
                </div>
              </div>
              <button class="settings-action-btn danger" onclick="doLogout()">⏻ Logout</button>
            </div>
          </div>
        </div>

        <!-- About & Health -->
        <div>
          <div class="settings-section">
            <div class="settings-section-header">
              <div class="section-icon about">ℹ️</div>
              <div>
                <div class="section-title-text">System Information</div>
                <div class="section-subtitle">App stats & status</div>
              </div>
            </div>
            <div style="padding:8px 0;">
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
                  <div class="item-icon-mini">🔮</div>
                  <div class="item-text">
                    <div class="item-label">AI Diagnostic</div>
                    <div class="item-desc">Gemini 2.0 Flash</div>
                  </div>
                </div>
                <span class="status-pill pill-purple">Online</span>
              </div>
              <div class="settings-item-row">
                <div class="settings-item-left">
                  <div class="item-icon-mini">🛡️</div>
                  <div class="item-text">
                    <div class="item-label">System Integrity</div>
                    <div class="item-desc">~79% original · Secure sandbox</div>
                  </div>
                </div>
                <span class="status-pill pill-green">🟢 Verified</span>
              </div>
            </div>
          </div>

          <!-- Reset Zone -->
          <div class="settings-section" style="border-color: rgba(248,113,113,0.15);">
            <div class="settings-section-header">
              <div class="section-icon danger">⚠️</div>
              <div>
                <div class="section-title-text">Danger Zone</div>
                <div class="section-subtitle">Reset variables & browser memory</div>
              </div>
            </div>
            <div style="padding:18px 22px;display:flex;gap:12px;flex-wrap:wrap">
              <button class="settings-action-btn primary" onclick="resetAllSettings()">↺ Reset Settings</button>
              <button class="settings-action-btn danger" onclick="if(confirm('Clear all local data? This cannot be undone.')){localStorage.clear();location.reload();}">🗑️ Wipe Storage</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  page.innerHTML = `
    <!-- Settings Tab Header -->
    <div class="settings-hero" style="margin-bottom: 15px;">
      <div class="settings-hero-icon">⚙️</div>
      <div>
        <h2>Settings & Profile Center</h2>
        <p>Personalize crop specifications, user settings, and preferences</p>
      </div>
    </div>

    <!-- Tab Control Switcher -->
    <div class="settings-tabs">
      <button class="settings-tab-btn ${state.activeSettingsTab === 'profile' ? 'active' : ''}" onclick="state.activeSettingsTab = 'profile'; renderSettings();">👨‍🌾 Farmer Profile</button>
      <button class="settings-tab-btn ${state.activeSettingsTab === 'preferences' ? 'active' : ''}" onclick="state.activeSettingsTab = 'preferences'; renderSettings();">🎨 App Preferences</button>
      <button class="settings-tab-btn ${state.activeSettingsTab === 'alerts' ? 'active' : ''}" onclick="state.activeSettingsTab = 'alerts'; renderSettings();">🔔 Alerts & Logs</button>
      <button class="settings-tab-btn ${state.activeSettingsTab === 'system' ? 'active' : ''}" onclick="state.activeSettingsTab = 'system'; renderSettings();">⚙️ System & Account</button>
    </div>

    <!-- Tab Active Workspaces -->
    ${tabContent}
  `;
}

function toggleAlertChannel(channel) {
  const rawChannels = localStorage.getItem('nr_notification_channels');
  let channels = rawChannels ? JSON.parse(rawChannels) : ['email', 'sms', 'push'];
  
  if (channels.includes(channel)) {
    channels = channels.filter(c => c !== channel);
  } else {
    channels.push(channel);
  }
  
  localStorage.setItem('nr_notification_channels', JSON.stringify(channels));
  renderSettings();
  showToast('⚙️', `Preference for ${channel} updated.`);
}

async function triggerNotificationEvent(eventType) {
  const rawChannels = localStorage.getItem('nr_notification_channels');
  const channels = rawChannels ? JSON.parse(rawChannels) : ['email', 'sms', 'push'];
  
  if (channels.length === 0) {
    showToast('⚠️', 'Please select at least one delivery channel first.');
    return;
  }
  
  const triggerBtnId = {
    'Login': 'btnTriggerLogin',
    'Password Change': 'btnTriggerPassword',
    'Payment': 'btnTriggerPayment',
    'Shipment': 'btnTriggerShipment',
    'Suspicious Activity': 'btnTriggerSuspicious'
  }[eventType];
  
  const btn = document.getElementById(triggerBtnId);
  const originalText = btn ? btn.innerHTML : '';
  if (btn) {
    btn.innerHTML = '⏳ Simulating...';
    btn.disabled = true;
  }
  
  try {
    const res = await fetch(`${CONFIG.API_BASE_URL}/api/notifications/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventType,
        userName: state.user.name || 'Farmer',
        crop: state.user.crop || 'rice',
        channels,
        geminiKey: CONFIG.GEMINI_API_KEY
      })
    });
    
    const data = await res.json();
    
    if (res.ok) {
      // Show toast if push is enabled
      if (channels.includes('push')) {
        showToast(eventType === 'Suspicious Activity' ? '🚨' : '🔔', data.message);
      } else {
        showToast('✅', `Alert dispatched via ${channels.join(', ')}.`);
      }
      
      // Append to logs
      const logs = JSON.parse(localStorage.getItem('nr_notification_logs') || '[]');
      logs.unshift({
        timestamp: new Date().toLocaleTimeString(),
        event: eventType,
        msg: data.message,
        channels: channels
      });
      
      // Keep last 20 logs
      if (logs.length > 20) logs.pop();
      
      localStorage.setItem('nr_notification_logs', JSON.stringify(logs));
      
      // Re-render setting tab
      renderSettings();
    } else {
      showToast('❌', data.error || 'Failed to dispatch alert.');
      if (btn) {
        btn.innerHTML = originalText;
        btn.disabled = false;
      }
    }
  } catch (err) {
    showToast('❌', 'Failed to communicate with notification center.');
    if (btn) {
      btn.innerHTML = originalText;
      btn.disabled = false;
    }
  }
}

function useDetectedCityForSettingsProfile() {
  const cwCity = document.getElementById('cwCity');
  const targetInput = document.getElementById('settingsLocation');
  if (cwCity && targetInput && cwCity.textContent && !cwCity.textContent.includes('—')) {
    targetInput.value = cwCity.textContent;
    showToast('📡', 'Location copied from weather station: ' + cwCity.textContent);
  } else {
    // geolocation fallback
    navigator.geolocation.getCurrentPosition(pos => {
      fetchWeatherByCoords(pos.coords.latitude, pos.coords.longitude).then(() => {
        setTimeout(() => {
          const updatedCity = document.getElementById('cwCity')?.textContent;
          if (updatedCity) {
            targetInput.value = updatedCity;
            showToast('✅', 'Auto-detected location: ' + updatedCity);
          }
        }, 1000);
      });
    }, err => {
      showToast('⚠️', 'Weather station location is empty. Enable browser location access.');
    });
  }
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

// ── Floating Particles Animation ──
function initParticles() {
  const canvas = document.createElement('canvas');
  canvas.id = 'particles-canvas';
  canvas.style.cssText = 'position:fixed;inset:0;z-index:0;pointer-events:none;opacity:0.5;';
  document.body.insertBefore(canvas, document.body.firstChild);
  const ctx = canvas.getContext('2d');
  let particles = [];
  let animId;

  function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
  resize();
  window.addEventListener('resize', resize);

  function getThemeColor() {
    const c = getComputedStyle(document.documentElement).getPropertyValue('--green-primary').trim();
    return c || '#4ade80';
  }

  class Particle {
    constructor() { this.reset(); }
    reset() {
      this.x = Math.random() * canvas.width;
      this.y = canvas.height + Math.random() * 100;
      this.size = Math.random() * 2.5 + 1;
      this.speedY = -(Math.random() * 0.5 + 0.15);
      this.speedX = (Math.random() - 0.5) * 0.3;
      this.opacity = Math.random() * 0.5 + 0.1;
      this.life = 0;
      this.maxLife = Math.random() * 400 + 200;
    }
    update() {
      this.y += this.speedY;
      this.x += this.speedX;
      this.life++;
      if (this.life > this.maxLife || this.y < -10) this.reset();
    }
    draw() {
      const progress = this.life / this.maxLife;
      const alpha = this.opacity * (progress < 0.1 ? progress * 10 : progress > 0.8 ? (1 - progress) * 5 : 1);
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fillStyle = getThemeColor();
      ctx.globalAlpha = alpha;
      ctx.fill();
    }
  }

  for (let i = 0; i < 30; i++) {
    const p = new Particle();
    p.y = Math.random() * canvas.height;
    p.life = Math.random() * p.maxLife;
    particles.push(p);
  }

  function animate() {
    if (document.body.classList.contains('no-animations')) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      animId = requestAnimationFrame(animate);
      return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => { p.update(); p.draw(); });
    ctx.globalAlpha = 1;
    animId = requestAnimationFrame(animate);
  }
  animate();
}

// ── Scroll Reveal Animation ──
function initScrollReveal() {
  document.querySelectorAll('.panel, .page-hero, .score-mini-panel').forEach(el => {
    el.classList.add('scroll-reveal');
  });
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('scroll-visible');
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
  document.querySelectorAll('.scroll-reveal').forEach(el => observer.observe(el));
}
setTimeout(initScrollReveal, 800);

// ── 3D Card Tilt Effect ──
function init3DTilt() {
  document.querySelectorAll('.stat-card').forEach(card => {
    card.addEventListener('mousemove', (e) => {
      if (document.body.classList.contains('no-animations')) return;
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const rotateX = ((y - centerY) / centerY) * -8;
      const rotateY = ((x - centerX) / centerX) * 8;
      card.style.transform = `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-5px) scale(1.02)`;
    });
    card.addEventListener('mouseleave', () => {
      card.style.transform = 'perspective(800px) rotateX(0) rotateY(0) translateY(0) scale(1)';
      card.style.transition = 'transform 0.5s ease';
      setTimeout(() => { card.style.transition = ''; }, 500);
    });
  });
}
setTimeout(init3DTilt, 1000);

// Initialize particles after a short delay
setTimeout(initParticles, 1500);

// ─── GLOBAL SEARCH ENGINE ─────────────────────────────────────────────────────
const SEARCH_INDEX = [
  // ── Pages / Navigation ──
  { group: 'Pages', icon: '🏡', title: 'Dashboard', subtitle: 'Overview of farm stats, alerts & AI tips', page: 'dashboard', keywords: 'home overview summary stats farm' },
  { group: 'Pages', icon: '💧', title: 'Irrigation Advisor', subtitle: 'AI-driven soil moisture & water management', page: 'irrigation', keywords: 'water drip irrigation soil moisture schedule' },
  { group: 'Pages', icon: '🌿', title: 'Fertilizer Engine', subtitle: 'NPK recommendations & soil analysis', page: 'fertilizer', keywords: 'npk nitrogen phosphorus potassium fertilizer soil nutrients' },
  { group: 'Pages', icon: '🌾', title: 'Crop Advisor', subtitle: 'AI crop recommendations & yield predictor', page: 'crop', keywords: 'crop advice recommend yield plant seeds' },
  { group: 'Pages', icon: '🔬', title: 'Disease Detector', subtitle: 'Detect crop disease from symptoms', page: 'disease', keywords: 'disease pest infection symptoms cure treatment' },
  { group: 'Pages', icon: '☁️', title: 'Weather Center', subtitle: 'Live weather, forecast & farming impact', page: 'weather', keywords: 'weather rain temperature forecast humidity wind' },
  { group: 'Pages', icon: '📈', title: 'Market Prices', subtitle: 'Mandi rates, revenue planner & trends', page: 'market', keywords: 'mandi market price rates sell crop revenue profit' },
  { group: 'Pages', icon: '🌍', title: 'Sustainability', subtitle: 'Eco-scores, carbon footprint & green tips', page: 'sustainability', keywords: 'carbon eco green environment sustainability score' },
  { group: 'Pages', icon: '📦', title: 'Marketplace', subtitle: 'Tools, seeds & accessories for farmers', page: 'products', keywords: 'shop buy products tools seeds accessories marketplace' },
  { group: 'Pages', icon: '💬', title: 'Feedback', subtitle: 'Rate your experience & send suggestions', page: 'feedback', keywords: 'feedback review rating suggestions complaint' },

  // ── Crops ──
  { group: 'Crops', icon: '🌾', title: 'Wheat', subtitle: 'Irrigation, fertilizer & disease info for wheat', page: 'crop', keywords: 'wheat gehu rabi crop winter' },
  { group: 'Crops', icon: '🌽', title: 'Maize / Corn', subtitle: 'Crop advice for maize cultivation', page: 'crop', keywords: 'maize corn jowar kharif' },
  { group: 'Crops', icon: '🍅', title: 'Tomato', subtitle: 'Tomato disease, irrigation & yield tips', page: 'crop', keywords: 'tomato vegetable tamatar disease irrigation' },
  { group: 'Crops', icon: '🌶️', title: 'Chilli / Pepper', subtitle: 'Spice crop management advice', page: 'crop', keywords: 'chilli pepper mirchi spice crop' },
  { group: 'Crops', icon: '🥜', title: 'Groundnut', subtitle: 'Oilseed crop recommendations', page: 'crop', keywords: 'groundnut peanut oilseed moongfali' },
  { group: 'Crops', icon: '🌱', title: 'Rice / Paddy', subtitle: 'Paddy irrigation and fertilizer schedule', page: 'irrigation', keywords: 'rice paddy chawal kharif water flooding' },
  { group: 'Crops', icon: '🫘', title: 'Soybean', subtitle: 'Protein crop care and disease management', page: 'crop', keywords: 'soybean soya legume protein' },
  { group: 'Crops', icon: '🧅', title: 'Onion', subtitle: 'Onion cultivation and market prices', page: 'market', keywords: 'onion pyaz kanda market price bulb' },
  { group: 'Crops', icon: '🍬', title: 'Sugarcane', subtitle: 'Long-duration crop scheduling', page: 'irrigation', keywords: 'sugarcane ganna sugar jaggery water' },
  { group: 'Crops', icon: '🌻', title: 'Sunflower', subtitle: 'Oilseed sunflower crop tips', page: 'crop', keywords: 'sunflower surajmukhi oilseed crop' },

  // ── Features ──
  { group: 'Features', icon: '🤖', title: 'AI Recommendations', subtitle: 'Gemini-powered farm advice', page: 'dashboard', keywords: 'ai recommendation gemini bot smart advice' },
  { group: 'Features', icon: '🌡️', title: 'Soil Analysis', subtitle: 'Enter NPK levels for advice', page: 'fertilizer', keywords: 'soil npk ph analysis test lab' },
  { group: 'Features', icon: '📅', title: 'Disease Risk Calendar', subtitle: 'Monthly crop disease risk chart', page: 'disease', keywords: 'calendar disease risk monthly season' },
  { group: 'Features', icon: '🗺️', title: 'Weather Map', subtitle: 'Interactive live weather map', page: 'weather', keywords: 'map weather location gps satellite' },
  { group: 'Features', icon: '💰', title: 'Revenue Planner', subtitle: 'Calculate mandi profit from yield', page: 'market', keywords: 'revenue profit planner calculator mandi yield' },
  { group: 'Features', icon: '⚡', title: 'Quick Actions', subtitle: 'Shortcut buttons for common tasks', page: 'dashboard', keywords: 'quick action shortcut refresh report alert' },
  { group: 'Features', icon: '🏆', title: 'Achievements', subtitle: 'Unlock badges for farming milestones', page: 'sustainability', keywords: 'achievement badge milestone unlock reward' },
  { group: 'Features', icon: '📄', title: 'Export Report', subtitle: 'Download your farm summary PDF', page: 'dashboard', keywords: 'export pdf report download summary print' },
  { group: 'Features', icon: '📱', title: 'WhatsApp Report', subtitle: 'Share your farm report via WhatsApp', page: 'dashboard', keywords: 'whatsapp share send report mobile' },
  { group: 'Features', icon: '📍', title: 'Location / GPS', subtitle: 'Set your farm location for weather', page: 'weather', keywords: 'location gps coordinates pin village district' },

  // ── Alerts & Health ──
  { group: 'Alerts', icon: '🚨', title: 'Water Stress Alert', subtitle: 'Soil moisture critically low', page: 'irrigation', keywords: 'water stress alert soil moisture low dry' },
  { group: 'Alerts', icon: '⛅', title: 'Rain Alert', subtitle: 'Heavy rain forecast this week', page: 'weather', keywords: 'rain heavy alert forecast avoid spray' },
  { group: 'Alerts', icon: '🌿', title: 'Fertilizer Reminder', subtitle: 'Time to apply urea top-dressing', page: 'fertilizer', keywords: 'fertilizer reminder urea nitrogen apply schedule' },
];

function highlightMatch(text, query) {
  if (!query) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark>$1</mark>');
}

function runGlobalSearch(query) {
  const dropdown = document.getElementById('searchResultsDropdown');
  const clearBtn = document.getElementById('searchClearBtn');
  clearBtn.style.display = query.length > 0 ? 'block' : 'none';

  if (!query || query.trim().length < 1) {
    dropdown.style.display = 'none';
    return;
  }

  const q = query.toLowerCase().trim();
  const matches = SEARCH_INDEX.filter(item =>
    item.title.toLowerCase().includes(q) ||
    item.subtitle.toLowerCase().includes(q) ||
    item.keywords.toLowerCase().includes(q)
  ).slice(0, 12);

  if (matches.length === 0) {
    dropdown.innerHTML = `<div class="search-no-results">🔍 No results for "<strong>${query}</strong>"</div>`;
    dropdown.style.display = 'block';
    return;
  }

  // Group results
  const groups = {};
  matches.forEach(item => {
    if (!groups[item.group]) groups[item.group] = [];
    groups[item.group].push(item);
  });

  let html = '';
  for (const [groupName, items] of Object.entries(groups)) {
    html += `<div class="search-group-label">${groupName}</div>`;
    items.forEach(item => {
      html += `
        <div class="search-result-item" onclick="searchGoTo('${item.page}')">
          <span class="search-result-icon">${item.icon}</span>
          <div class="search-result-text">
            <div class="search-result-title">${highlightMatch(item.title, query)}</div>
            <div class="search-result-subtitle">${highlightMatch(item.subtitle, query)}</div>
          </div>
          <span class="search-result-arrow">→</span>
        </div>`;
    });
  }

  dropdown.innerHTML = html;
  dropdown.style.display = 'block';
}

function searchGoTo(page) {
  clearGlobalSearch();
  showPage(page);
}

function clearGlobalSearch() {
  const input = document.getElementById('globalSearchInput');
  const dropdown = document.getElementById('searchResultsDropdown');
  const clearBtn = document.getElementById('searchClearBtn');
  input.value = '';
  dropdown.style.display = 'none';
  clearBtn.style.display = 'none';
}

// Close search when clicking outside
document.addEventListener('click', function(e) {
  const wrapper = document.getElementById('globalSearchWrapper');
  if (wrapper && !wrapper.contains(e.target)) {
    const dropdown = document.getElementById('searchResultsDropdown');
    if (dropdown) dropdown.style.display = 'none';
  }
});

// Keyboard shortcut: Ctrl+K or Cmd+K to focus search
document.addEventListener('keydown', function(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    const input = document.getElementById('globalSearchInput');
    if (input) { input.focus(); input.select(); }
  }
  if (e.key === 'Escape') {
    clearGlobalSearch();
  }
});
