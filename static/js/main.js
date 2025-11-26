// main.js - client-side logic to fetch and render weather data, unit toggle, and PWA registration

document.addEventListener('DOMContentLoaded', () => {
  const citiesGrid = document.getElementById('citiesGrid');
  const featuredCard = document.getElementById('featuredCard');
  const searchForm = document.getElementById('searchForm');
  const searchCity = document.getElementById('searchCity');
  const searchFeedback = document.getElementById('searchFeedback');

  const unitToggle = document.getElementById('unitToggle');
  const unitLabel = document.getElementById('unitLabel');

  const modal = new bootstrap.Modal(document.getElementById('detailModal'));
  const modalTitle = document.getElementById('modalTitle');

  const UNIT_KEY = 'weather_app_unit'; // 'imperial' or 'metric'
  const DEFAULT_UNIT = 'imperial'; // Fahrenheit default

  // Helper: get current unit from localStorage
  function currentUnit() {
    return localStorage.getItem(UNIT_KEY) || DEFAULT_UNIT;
  }

  function setUnit(unit) {
    localStorage.setItem(UNIT_KEY, unit);
    // Update UI label
    unitLabel.textContent = (unit === 'imperial') ? '°F' : '°C';
    // Optionally refetch default cities to show new units
    fetchDefaultCities();
  }

  // Initialize unit toggle
  (function initUnitToggle() {
    const unit = currentUnit();
    unitToggle.checked = (unit === 'metric'); // checked means Celsius
    unitLabel.textContent = (unit === 'imperial') ? '°F' : '°C';
    unitToggle.addEventListener('change', () => {
      setUnit(unitToggle.checked ? 'metric' : 'imperial');
    });
  })();

  // helper to format unix timestamp using timezone offset
  function formatTime(unixSec, tzOffsetSec) {
    if (!unixSec) return 'N/A';
    const d = new Date((unixSec + (tzOffsetSec || 0)) * 1000);
    return d.toUTCString().replace('GMT', '');
  }

  function iconUrl(iconCode) {
    return `https://openweathermap.org/img/wn/${iconCode}@2x.png`;
  }

  function createCityCard(w) {
    const col = document.createElement('div');
    col.className = 'col-12 col-sm-6 col-md-4';

    const card = document.createElement('div');
    card.className = 'card p-3 city-card glass h-100';
    card.setAttribute('role','button');
    card.setAttribute('tabindex','0');

    // provide a fallback if icon missing
    const icon = w.icon ? iconUrl(w.icon) : '';

    card.innerHTML = `
      <div class="d-flex align-items-center">
        <img src="${icon}" alt="${w.description || ''}" width="64" height="64" class="me-3" loading="lazy">
        <div class="flex-grow-1">
          <h5 class="mb-0">${w.city}, ${w.country}</h5>
          <div class="small text-muted">${w.description}</div>
        </div>
        <div class="text-end">
          <div class="fs-4">${w.temperature}°</div>
          <div class="small text-muted">Feels ${w.feels_like}°</div>
        </div>
      </div>
    `;

    card.addEventListener('click', () => showDetails(w));
    card.addEventListener('keypress', (e) => { if (e.key === 'Enter') showDetails(w); });
    col.appendChild(card);
    return col;
  }

  function showDetails(w) {
    modalTitle.textContent = `${w.city}, ${w.country}`;
    document.getElementById('modalIcon').src = w.icon ? iconUrl(w.icon) : '';
    document.getElementById('modalDesc').textContent = w.description;
    document.getElementById('modalTemp').textContent = w.temperature;
    document.getElementById('modalFeels').textContent = w.feels_like;
    document.getElementById('modalHumidity').textContent = w.humidity;
    document.getElementById('modalWind').textContent = w.wind_speed;
    document.getElementById('modalPressure').textContent = w.pressure;
    document.getElementById('modalVisibility').textContent = (typeof w.visibility === 'number') ? w.visibility : w.visibility;
    document.getElementById('modalSunrise').textContent = formatTime(w.sunrise, w.timezone);
    document.getElementById('modalSunset').textContent = formatTime(w.sunset, w.timezone);
    document.getElementById('modalTZ').textContent = w.timezone || 0;

    // featured card also updated
    document.getElementById('featuredIcon').src = w.icon ? iconUrl(w.icon) : '';
    document.getElementById('featuredCity').textContent = `${w.city}, ${w.country}`;
    document.getElementById('featuredDesc').textContent = w.description;
    document.getElementById('featuredTemp').textContent = w.temperature;
    document.getElementById('featuredFeels').textContent = w.feels_like;
    document.getElementById('featuredHumidity').textContent = w.humidity;
    document.getElementById('featuredWind').textContent = w.wind_speed;
    document.getElementById('featuredVisibility').textContent = w.visibility;

    featuredCard.classList.remove('d-none');

    modal.show();
  }

  async function fetchDefaultCities() {
    citiesGrid.innerHTML = '';
    // show skeletons while loading
    for (let i=0;i<6;i++){
      const col = document.createElement('div');
      col.className = 'col-12 col-sm-6 col-md-4';
      col.innerHTML = `<div class="skeleton"></div>`;
      citiesGrid.appendChild(col);
    }

    try {
      const res = await fetch('/api/cities');
      if (!res.ok) throw new Error('Failed to load default cities');
      const data = await res.json();

      // Convert units if needed (server returns imperial)
      const unit = currentUnit();

      function toMetricIfNeeded(item) {
        if (!item || item.error) return item;
        if (unit === 'metric') {
          // Convert Fahrenheit to Celsius: (F - 32) * 5/9
          const convert = (v) => (v === null || v === undefined) ? v : Math.round((v - 32) * 5 / 9);
          return Object.assign({}, item, {
            temperature: convert(item.temperature),
            feels_like: convert(item.feels_like),
            // wind_speed conversion: mph -> m/s (approx) OR keep mph for simplicity;
            // we'll convert mph -> m/s here if desired (1 mph = 0.44704 m/s). Keeping as is for simplicity.
          });
        }
        return item;
      }

      citiesGrid.innerHTML = '';
      data.forEach(item => {
        if (item.error) {
          const el = document.createElement('div');
          el.className = 'col-12 col-sm-6 col-md-4';
          el.innerHTML = `<div class="card p-3 glass text-dark"><strong>${item.city}</strong><div class="text-muted small mt-2">${item.error}</div></div>`;
          citiesGrid.appendChild(el);
        } else {
          const converted = toMetricIfNeeded(item);
          citiesGrid.appendChild(createCityCard(converted));
        }
      });
    } catch (err) {
      citiesGrid.innerHTML = `<div class="col-12"><div class="alert alert-danger">Unable to load cities: ${err.message}</div></div>`;
    }
  }

  searchForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const raw = searchCity.value.trim();
    if (!raw) {
      searchFeedback.textContent = 'Please enter a city name (optionally "City, State, Country").';
      searchFeedback.classList.remove('d-none');
      return;
    }
    searchFeedback.classList.add('d-none');

    // parse simple comma-separated parts
    const parts = raw.split(',').map(p => p.trim());
    const [city, state, country] = parts;

    try {
      const q = new URL('/api/weather', window.location.origin);
      q.searchParams.set('city', city || '');
      if (state) q.searchParams.set('state', state);
      if (country) q.searchParams.set('country', country);

      const res = await fetch(q);
      const data = await res.json();
      if (!res.ok) {
        searchFeedback.textContent = data.error || 'Search failed';
        searchFeedback.classList.remove('d-none');
        return;
      }

      // Convert units if needed
      const unit = currentUnit();
      if (unit === 'metric') {
        const convert = (v) => (v === null || v === undefined) ? v : Math.round((v - 32) * 5 / 9);
        if (data.temperature !== null) data.temperature = convert(data.temperature);
        if (data.feels_like !== null) data.feels_like = convert(data.feels_like);
      }

      showDetails(data);
    } catch (err) {
      searchFeedback.textContent = `Search error: ${err.message}`;
      searchFeedback.classList.remove('d-none');
    }
  });

  // PWA: register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => {
        console.log('Service worker registered:', reg.scope);
      })
      .catch(err => {
        console.warn('Service worker registration failed:', err);
      });
  }

  // initialize
  fetchDefaultCities();
});