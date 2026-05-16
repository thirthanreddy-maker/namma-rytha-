'use strict';

const mState = {
  cart: [],
  wishlist: [],
  products: [],
  currentPage: 'dashboard'
};

function mShowPage(id) {
  document.querySelectorAll('.m-page').forEach(p => p.style.display = 'none');
  document.querySelectorAll('.m-nav-item').forEach(n => n.classList.remove('active'));
  
  const page = document.getElementById('m-' + id);
  const nav = document.querySelector(`[data-m-page="${id}"]`);
  
  if (page) page.style.display = 'block';
  if (nav) nav.classList.add('active');
  
  mState.currentPage = id;
  if (id === 'marketplace') mLoadProducts();
}

document.querySelectorAll('.m-nav-item').forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    mShowPage(item.dataset.mPage);
  });
});

async function mLoadProducts() {
  const list = document.getElementById('m-products-list');
  if (!list) return;
  
  list.innerHTML = '<div style="text-align:center; padding:20px">⏳ Loading...</div>';
  
  try {
    const res = await fetch('http://localhost:3000/api/products');
    mState.products = await res.json();
    mRenderProducts(mState.products);
  } catch (e) {
    list.innerHTML = '<div style="text-align:center; color:red">Failed to load marketplace</div>';
  }
}

function mRenderProducts(prods) {
  const list = document.getElementById('m-products-list');
  list.innerHTML = prods.map(p => `
    <div class="m-prod-card m-fade">
      <div class="m-prod-img">${p.image}</div>
      <div class="m-prod-info">
        <div class="m-prod-name">${p.name}</div>
        <div class="m-prod-price">₹${p.price}</div>
        <div style="display:flex; gap:10px; margin-top:5px">
           <button class="m-btn" style="padding:6px 12px; font-size:11px" onclick="mAddToCart(${p.id})">🛒 Add</button>
           <button class="m-btn" style="padding:6px 12px; font-size:11px; background:rgba(255,255,255,0.05); color:white" onclick="mBuyNow('${p.name}')">Buy</button>
        </div>
      </div>
    </div>
  `).join('');
}

function mAddToCart(id) {
  const p = mState.products.find(x => x.id === id);
  if (p) {
    mState.cart.push(p);
    document.getElementById('m-cart-badge').textContent = mState.cart.length;
    alert(`Added ${p.name} to cart!`);
  }
}

function mBuyNow(name) {
  alert(`Proceeding to checkout for ${name}...`);
}

function doLogout() {
  if (confirm('Logout?')) window.location.href = 'login.html';
}

// ─── REAL-TIME WEATHER ───────────────────────────────────────────────────────
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

async function fetchWeatherByCoords(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,precipitation_probability`;
  const res = await fetch(url);
  const d = await res.json();
  return {
    temp: Math.round(d.current.temperature_2m),
    icon: getWeatherIcon(d.current.weather_code),
    rain: d.current.precipitation_probability || 0
  };
}

function mLoadWeather() {
  const pill = document.getElementById('m-weather-pill');
  if (pill) pill.textContent = '⏳';
  
  if (!('geolocation' in navigator)) {
    if (pill) pill.textContent = '☀️ 28°C';
    return;
  }
  
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      try {
        const { latitude: lat, longitude: lon } = pos.coords;
        const data = await fetchWeatherByCoords(lat, lon);
        if (pill) pill.textContent = `${data.icon} ${data.temp}°C`;
        const statRain = document.getElementById('statRain');
        if (statRain) statRain.textContent = `${data.rain}%`;
      } catch (e) {
        if (pill) pill.textContent = '☀️ 28°C';
      }
    },
    (err) => {
      if (pill) pill.textContent = '☀️ 28°C';
    },
    { timeout: 10000, enableHighAccuracy: false }
  );
}

// Initializing
window.addEventListener('DOMContentLoaded', () => {
  console.log('Mobile App Initialized 📱');
  mLoadWeather();
});
