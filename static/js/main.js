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

  // Dark mode functionality
  const DARK_MODE_KEY = 'weather_app_dark_mode';
  
  function isDarkMode() {
    const saved = localStorage.getItem(DARK_MODE_KEY);
    if (saved !== null) {
      return saved === 'true';
    }
    // Check system preference
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  
  function setDarkMode(enabled) {
    localStorage.setItem(DARK_MODE_KEY, enabled);
    if (enabled) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
    updateDarkModeIcon(enabled);
  }
  
  function updateDarkModeIcon(isDark) {
    const darkModeBtn = document.getElementById('darkModeToggle');
    if (darkModeBtn) {
      const icon = darkModeBtn.querySelector('i');
      if (icon) {
        icon.className = isDark ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
      }
    }
  }
  
  // Initialize dark mode
  (function initDarkMode() {
    const isDark = isDarkMode();
    setDarkMode(isDark);
    
    const darkModeBtn = document.getElementById('darkModeToggle');
    if (darkModeBtn) {
      darkModeBtn.addEventListener('click', () => {
        const currentlyDark = document.body.classList.contains('dark-mode');
        setDarkMode(!currentlyDark);
        showToast(`${!currentlyDark ? 'Dark' : 'Light'} mode enabled`, 'info');
      });
    }
  })();
  
  // Geolocation functionality
  async function getUserLocation() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation not supported by your browser'));
        return;
      }
      
      navigator.geolocation.getCurrentPosition(
        position => resolve(position.coords),
        error => {
          let message = 'Unable to get your location';
          switch(error.code) {
            case error.PERMISSION_DENIED:
              message = 'Location permission denied. Please enable location access.';
              break;
            case error.POSITION_UNAVAILABLE:
              message = 'Location information unavailable.';
              break;
            case error.TIMEOUT:
              message = 'Location request timed out.';
              break;
          }
          reject(new Error(message));
        },
        { timeout: 10000, maximumAge: 300000 }
      );
    });
  }
  
  async function fetchWeatherByCoords(lat, lon) {
    const q = new URL('/api/weather', window.location.origin);
    q.searchParams.set('lat', lat);
    q.searchParams.set('lon', lon);
    
    const res = await fetch(q);
    const data = await res.json();
    
    if (!res.ok) {
      throw new Error(data.error || 'Failed to fetch weather');
    }
    
    return data;
  }
  
  // Geolocation button handler
  const locationBtn = document.getElementById('locationBtn');
  if (locationBtn) {
    locationBtn.addEventListener('click', async () => {
      locationBtn.classList.add('loading');
      locationBtn.disabled = true;
      
      try {
        showToast('Getting your location...', 'info');
        const coords = await getUserLocation();
        
        showToast('Fetching weather for your location...', 'info');
        const data = await fetchWeatherByCoords(coords.latitude, coords.longitude);
        
        // Convert units if needed
        const unit = currentUnit();
        if (unit === 'metric') {
          const convert = (v) => (v === null || v === undefined) ? v : Math.round((v - 32) * 5 / 9);
          if (data.temperature !== null) data.temperature = convert(data.temperature);
          if (data.feels_like !== null) data.feels_like = convert(data.feels_like);
        }
        
        showToast(`Weather loaded for ${data.city}`, 'success');
        showDetails(data);
      } catch (err) {
        showToast(err.message, 'error');
        console.error('Geolocation error:', err);
      } finally {
        locationBtn.classList.remove('loading');
        locationBtn.disabled = false;
      }
    });
  }

  // Favorite cities feature
  const FAVORITES_KEY = 'weather_app_favorites';
  
  function getFavorites() {
    const favs = localStorage.getItem(FAVORITES_KEY);
    return favs ? JSON.parse(favs) : [];
  }

  function saveFavorites(favorites) {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  }

  function toggleFavorite(city, country) {
    const favorites = getFavorites();
    const key = `${city},${country}`;
    const index = favorites.findIndex(f => f.key === key);
    
    if (index > -1) {
      favorites.splice(index, 1);
      showToast(`${city} removed from favorites`, 'info');
    } else {
      favorites.push({ key, city, country, added: new Date().toISOString() });
      showToast(`${city} added to favorites`, 'success');
    }
    saveFavorites(favorites);
    return index === -1; // Returns true if added, false if removed
  }

  function isFavorite(city, country) {
    const favorites = getFavorites();
    const key = `${city},${country}`;
    return favorites.some(f => f.key === key);
  }

  // Toast notification system
  function showToast(message, type = 'info') {
    let toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.id = 'toastContainer';
      toastContainer.className = 'toast-container position-fixed top-0 end-0 p-3';
      toastContainer.style.zIndex = '9999';
      document.body.appendChild(toastContainer);
    }
    const toast = document.createElement('div');
    toast.className = `toast align-items-center text-white bg-${type === 'error' ? 'danger' : type === 'success' ? 'success' : 'info'} border-0`;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'assertive');
    toast.setAttribute('aria-atomic', 'true');
    toast.innerHTML = `
      <div class="d-flex">
        <div class="toast-body">${message}</div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
      </div>
    `;
    toastContainer.appendChild(toast);
    const bsToast = new bootstrap.Toast(toast, { delay: 3000 });
    bsToast.show();
    toast.addEventListener('hidden.bs.toast', () => toast.remove());
  }

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + K to focus search
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      searchCity.focus();
    }
    // Ctrl/Cmd + D to toggle dark mode
    if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
      e.preventDefault();
      const darkModeBtn = document.getElementById('darkModeToggle');
      if (darkModeBtn) darkModeBtn.click();
    }
    // Ctrl/Cmd + L to trigger geolocation
    if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
      e.preventDefault();
      const locationBtn = document.getElementById('locationBtn');
      if (locationBtn && !locationBtn.disabled) locationBtn.click();
    }
    // Escape to close modal
    if (e.key === 'Escape' && modal._isShown) {
      modal.hide();
    }
    // Ctrl/Cmd + Shift + R to refresh (but prevent default browser refresh)
    if ((e.ctrlKey || e.metaKey) && e.key === 'r' && e.shiftKey) {
      e.preventDefault();
      const refreshBtn = document.getElementById('refreshBtn');
      if (refreshBtn) refreshBtn.click();
    }
  });

  // helper to format unix timestamp using timezone offset
  function formatTime(unixSec, tzOffsetSec) {
    if (!unixSec) return 'N/A';
    const d = new Date((unixSec + (tzOffsetSec || 0)) * 1000);
    return d.toUTCString().replace('GMT', '');
  }

  function iconUrl(iconCode) {
    return `https://openweathermap.org/img/wn/${iconCode}@2x.png`;
  }

  async function loadAirQuality(lat, lon, badgeElement) {
    try {
      const res = await fetch(`/api/air-quality?lat=${lat}&lon=${lon}`);
      const data = await res.json();
      
      if (!res.ok || data.error) {
        badgeElement.remove();
        return;
      }
      
      const aqi = data.aqi;
      const label = data.aqi_label;
      
      // AQI color coding
      const aqiColors = {
        1: '#10b981', // Good - Green
        2: '#84cc16', // Fair - Light Green
        3: '#f59e0b', // Moderate - Yellow/Orange
        4: '#ef4444', // Poor - Red
        5: '#991b1b'  // Very Poor - Dark Red
      };
      
      const color = aqiColors[aqi] || '#6c757d';
      badgeElement.className = 'aqi-badge';
      badgeElement.style.background = `linear-gradient(135deg, ${color}22, ${color}11)`;
      badgeElement.style.color = color;
      badgeElement.style.border = `1.5px solid ${color}`;
      badgeElement.innerHTML = `<i class="fa-solid fa-wind"></i> AQI: ${label}`;
      badgeElement.title = data.aqi_description;
      
      // Make badge clickable to show details
      badgeElement.style.cursor = 'pointer';
      badgeElement.addEventListener('click', (e) => {
        e.stopPropagation();
        showAQIDetails(data);
      });
      
    } catch (err) {
      badgeElement.remove();
      console.error('Failed to load AQI:', err);
    }
  }

  function showAQIDetails(data) {
    const modalEl = document.createElement('div');
    modalEl.className = 'modal fade';
    
    const aqiColors = {
      1: '#10b981',
      2: '#84cc16',
      3: '#f59e0b',
      4: '#ef4444',
      5: '#991b1b'
    };
    
    const color = aqiColors[data.aqi] || '#6c757d';
    
    modalEl.innerHTML = `
      <div class="modal-dialog modal-lg">
        <div class="modal-content glass">
          <div class="modal-header">
            <h5 class="modal-title">
              <i class="fa-solid fa-wind"></i> Air Quality Index
              <span class="aqi-badge ms-2" style="background: linear-gradient(135deg, ${color}22, ${color}11); color: ${color}; border: 1.5px solid ${color};">
                ${data.aqi_label}
              </span>
            </h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="alert" style="background: ${color}22; border-color: ${color}; color: ${color};">
              <strong>${data.aqi_label}:</strong> ${data.aqi_description}
            </div>
            
            <h6 class="mt-3 mb-3">Air Pollutants (μg/m³)</h6>
            <div class="row g-3">
              <div class="col-6 col-md-3">
                <div class="card glass p-2 text-center">
                  <small class="text-muted">PM2.5</small>
                  <strong>${data.components.pm2_5}</strong>
                </div>
              </div>
              <div class="col-6 col-md-3">
                <div class="card glass p-2 text-center">
                  <small class="text-muted">PM10</small>
                  <strong>${data.components.pm10}</strong>
                </div>
              </div>
              <div class="col-6 col-md-3">
                <div class="card glass p-2 text-center">
                  <small class="text-muted">O₃</small>
                  <strong>${data.components.o3}</strong>
                </div>
              </div>
              <div class="col-6 col-md-3">
                <div class="card glass p-2 text-center">
                  <small class="text-muted">NO₂</small>
                  <strong>${data.components.no2}</strong>
                </div>
              </div>
              <div class="col-6 col-md-3">
                <div class="card glass p-2 text-center">
                  <small class="text-muted">SO₂</small>
                  <strong>${data.components.so2}</strong>
                </div>
              </div>
              <div class="col-6 col-md-3">
                <div class="card glass p-2 text-center">
                  <small class="text-muted">CO</small>
                  <strong>${data.components.co}</strong>
                </div>
              </div>
              <div class="col-6 col-md-3">
                <div class="card glass p-2 text-center">
                  <small class="text-muted">NO</small>
                  <strong>${data.components.no}</strong>
                </div>
              </div>
              <div class="col-6 col-md-3">
                <div class="card glass p-2 text-center">
                  <small class="text-muted">NH₃</small>
                  <strong>${data.components.nh3}</strong>
                </div>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(modalEl);
    const aqiModal = new bootstrap.Modal(modalEl);
    aqiModal.show();
    modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove());
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
    
    // Format sunrise/sunset
    const sunrise = formatTime(w.sunrise, w.timezone);
    const sunset = formatTime(w.sunset, w.timezone);
    
    // Format visibility
    const visibility = (typeof w.visibility === 'number') ? w.visibility : (w.visibility || 'N/A');

    // Shorten sunrise/sunset to just time
    const sunriseTime = sunrise.includes(',') ? sunrise.split(',')[1].trim() : sunrise;
    const sunsetTime = sunset.includes(',') ? sunset.split(',')[1].trim() : sunset;
    
    // Umbrella indicator
    const needsUmbrella = w.needs_umbrella === true || w.needs_umbrella === 'true' || (w.rain_amount && w.rain_amount > 0);
    const umbrellaIcon = needsUmbrella 
      ? '<i class="fa-solid fa-umbrella" style="font-size: 1.1rem; color: #3b82f6;" title="Umbrella needed - Rain expected"></i>'
      : '<i class="fa-solid fa-umbrella" style="font-size: 1.1rem; color: #94a3b8; opacity: 0.4;" title="No umbrella needed - No rain expected"></i>';
    
    // Thunderstorm indicator
    const hasThunderstorm = w.has_thunderstorm === true || w.has_thunderstorm === 'true';
    const thunderstormIcon = hasThunderstorm
      ? '<i class="fa-solid fa-bolt" style="font-size: 1.1rem; color: #f59e0b;" title="Thunderstorm expected - Take caution"></i>'
      : '';
    
    // Tornado indicator
    const hasTornado = w.has_tornado === true || w.has_tornado === 'true';
    const tornadoIcon = hasTornado
      ? '<i class="fa-solid fa-triangle-exclamation" style="font-size: 1.1rem; color: #ef4444;" title="Tornado warning - Seek shelter immediately"></i>'
      : '';
    
    // Combine all weather indicators
    const weatherIndicators = `${umbrellaIcon}${thunderstormIcon}${tornadoIcon}`;

    // Severity Badge
    let severityBadge = '';
    const severityIdx = w.severity_index || 'Low';
    const severityClass = severityIdx === 'High' ? 'high' : (severityIdx === 'Moderate' ? 'mod' : 'low');
    severityBadge = `<span class="severity-badge ${severityClass}">${severityIdx}</span>`;
    
    // Add pulsing effect for high severity
    if (severityIdx === 'High') {
      card.classList.add('severity-high');
    }
    
    // Favorite button
    const isFav = isFavorite(w.city, w.country);
    const favoriteBtn = `<button class="btn btn-sm btn-link p-0 favorite-btn" 
      data-city="${w.city}" 
      data-country="${w.country}"
      title="${isFav ? 'Remove from favorites' : 'Add to favorites'}"
      style="color: ${isFav ? '#ffc107' : '#6c757d'}; text-decoration: none;">
      <i class="fa-solid fa-star${isFav ? '' : '-o'}"></i>
    </button>`;
    
    // Air Quality Badge (will be loaded asynchronously)
    const aqiBadge = w.lat && w.lon 
      ? `<span class="aqi-badge loading" data-lat="${w.lat}" data-lon="${w.lon}">
           <i class="fa-solid fa-spinner fa-spin"></i> AQI
         </span>`
      : '';

    card.innerHTML = `
      <div class="city-card-header">
        <div class="d-flex align-items-center justify-content-between">
          <div class="d-flex align-items-center">
            <img src="${icon}" alt="${w.description || ''}" width="40" height="40" class="me-2" loading="lazy">
            <div>
              <h5 class="mb-0 d-flex align-items-center gap-2">
                ${w.city}
                ${weatherIndicators}
                ${severityBadge}
                ${aqiBadge}
                ${favoriteBtn}
              </h5>
              <div class="text-muted" style="font-size: 0.7rem; line-height: 1.1;">${w.country} • ${w.description}</div>
            </div>
          </div>
          <div class="text-end">
            <div class="display-6 fw-bold mb-0">${w.temperature}°</div>
            <div class="text-muted" style="font-size: 0.65rem;">Feels ${w.feels_like}°</div>
          </div>
        </div>
      </div>
      <div class="city-card-details">
        <div class="detail-row detail-row-inline">
          <div class="detail-item">
            <span class="detail-label">Temp</span>
            <span class="detail-value">${w.temperature}° (${w.feels_like}°)</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Humidity</span>
            <span class="detail-value">${w.humidity || 'N/A'}%</span>
          </div>
        </div>
        <div class="detail-row detail-row-inline">
          <div class="detail-item">
            <span class="detail-label">Wind</span>
            <span class="detail-value">${w.wind_speed || 'N/A'} mph</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Pressure</span>
            <span class="detail-value">${w.pressure || 'N/A'} hPa</span>
          </div>
        </div>
        <div class="detail-row detail-row-inline">
          <div class="detail-item">
            <span class="detail-label">Visibility</span>
            <span class="detail-value">${visibility} km</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Rain</span>
            <span class="detail-value">${w.rain_amount || 0} mm</span>
          </div>
        </div>
        <div class="detail-row detail-row-inline sun-times-row">
          <div class="detail-item sun-time sunrise" aria-label="Sunrise time">
            <i class="fa-solid fa-sun sun-icon"></i>
            <div>
              <span class="sun-label">Sunrise</span>
              <span class="sun-value">${sunriseTime}</span>
            </div>
          </div>
          <div class="detail-item sun-time sunset" aria-label="Sunset time">
            <i class="fa-solid fa-moon sun-icon"></i>
            <div>
              <span class="sun-label">Sunset</span>
              <span class="sun-value">${sunsetTime}</span>
            </div>
          </div>
        </div>
      </div>
      <div class="card-footer" style="background: transparent; border-top: 1px solid rgba(99, 102, 241, 0.1); padding-top: 0.75rem;">
        <button class="btn btn-sm btn-outline-primary w-100 forecast-btn" data-city="${w.city}" data-country="${w.country}">
          <i class="fa-solid fa-calendar-days"></i> View 5-Day Forecast
        </button>
      </div>
    `;

    // Favorite button handler
    const favBtn = card.querySelector('.favorite-btn');
    if (favBtn) {
      favBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const city = favBtn.dataset.city;
        const country = favBtn.dataset.country;
        const isFav = toggleFavorite(city, country);
        favBtn.style.color = isFav ? '#ffc107' : '#6c757d';
        const icon = favBtn.querySelector('i');
        icon.className = isFav ? 'fa-solid fa-star' : 'fa-solid fa-star-o';
        favBtn.title = isFav ? 'Remove from favorites' : 'Add to favorites';
      });
    }

    // Load AQI data asynchronously
    const aqiBadgeEl = card.querySelector('.aqi-badge');
    if (aqiBadgeEl && w.lat && w.lon) {
      loadAirQuality(w.lat, w.lon, aqiBadgeEl);
    // Forecast button handler
    const forecastBtn = card.querySelector('.forecast-btn');
    if (forecastBtn) {
      forecastBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const city = forecastBtn.dataset.city;
        const country = forecastBtn.dataset.country;
        await showForecast(city, country);
      });
    }

    card.addEventListener('click', () => showDetails(w));
    card.addEventListener('keypress', (e) => { if (e.key === 'Enter') showDetails(w); });
    col.appendChild(card);
    return col;
  }

  async function showForecast(city, country) {
    try {
      showToast('Loading forecast...', 'info');
      
      const q = new URL('/api/forecast', window.location.origin);
      q.searchParams.set('city', city);
      if (country) q.searchParams.set('country', country);
      
      const res = await fetch(q);
      const data = await res.json();
      
      if (!res.ok || data.error) {
        showToast(data.error || 'Failed to load forecast', 'error');
        return;
      }
      
      // Convert units if needed
      const unit = currentUnit();
      const unitSymbol = unit === 'metric' ? '°C' : '°F';
      
      let forecastHtml = '<div class="row g-3">';
      
      data.forecasts.forEach(day => {
        let tempMin = day.temp_min;
        let tempMax = day.temp_max;
        
        if (unit === 'metric') {
          const convert = (v) => Math.round((v - 32) * 5 / 9);
          tempMin = convert(tempMin);
          tempMax = convert(tempMax);
        }
        
        forecastHtml += `
          <div class="col-12 col-md-6 col-lg-4">
            <div class="card glass p-3">
              <div class="d-flex justify-content-between align-items-center mb-2">
                <div>
                  <h6 class="mb-0">${day.day_name}</h6>
                  <small class="text-muted">${day.date}</small>
                </div>
                <img src="${iconUrl(day.icon)}" alt="${day.description}" width="50" height="50">
              </div>
              <div class="mb-2">
                <div class="d-flex justify-content-between align-items-center">
                  <span class="text-muted small">High</span>
                  <span class="fw-bold" style="color: var(--danger);">${tempMax}${unitSymbol}</span>
                </div>
                <div class="d-flex justify-content-between align-items-center">
                  <span class="text-muted small">Low</span>
                  <span class="fw-bold" style="color: var(--accent-primary);">${tempMin}${unitSymbol}</span>
                </div>
              </div>
              <div class="small text-muted">${day.description}</div>
              <div class="mt-2 small">
                <div class="d-flex justify-content-between">
                  <span><i class="fa-solid fa-droplet"></i> ${day.precipitation_chance}%</span>
                  <span><i class="fa-solid fa-wind"></i> ${day.wind_speed} mph</span>
                </div>
              </div>
            </div>
          </div>
        `;
      });
      
      forecastHtml += '</div>';
      
      // Create forecast modal
      const modalEl = document.createElement('div');
      modalEl.className = 'modal fade';
      modalEl.innerHTML = `
        <div class="modal-dialog modal-xl">
          <div class="modal-content glass">
            <div class="modal-header">
              <h5 class="modal-title"><i class="fa-solid fa-calendar-days"></i> 5-Day Forecast - ${data.city}, ${data.country}</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">${forecastHtml}</div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
            </div>
          </div>
        </div>
      `;
      
      document.body.appendChild(modalEl);
      const forecastModal = new bootstrap.Modal(modalEl);
      forecastModal.show();
      modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove());
      
      showToast(`Forecast loaded for ${data.city}`, 'success');
      
    } catch (err) {
      showToast('Failed to load forecast', 'error');
      console.error('Forecast error:', err);
    }
  }

  function showDetails(w) {
    // Build weather indicators for modal
    const needsUmbrella = w.needs_umbrella === true || w.needs_umbrella === 'true' || (w.rain_amount && w.rain_amount > 0);
    const hasThunderstorm = w.has_thunderstorm === true || w.has_thunderstorm === 'true';
    const hasTornado = w.has_tornado === true || w.has_tornado === 'true';
    
    let indicators = '';
    if (needsUmbrella) indicators += '<i class="fa-solid fa-umbrella" style="font-size: 1rem; color: #3b82f6; margin-left: 0.5rem;" title="Umbrella needed"></i>';
    if (hasThunderstorm) indicators += '<i class="fa-solid fa-bolt" style="font-size: 1rem; color: #f59e0b; margin-left: 0.5rem;" title="Thunderstorm expected"></i>';
    if (hasTornado) indicators += '<i class="fa-solid fa-triangle-exclamation" style="font-size: 1rem; color: #ef4444; margin-left: 0.5rem;" title="Tornado warning"></i>';
    
    modalTitle.innerHTML = `${w.city}, ${w.country}${indicators}`;
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

    // featured card also updated
    document.getElementById('featuredIcon').src = w.icon ? iconUrl(w.icon) : '';
    // Build weather indicators for featured card
    let featuredIndicators = '';
    if (needsUmbrella) featuredIndicators += '<i class="fa-solid fa-umbrella" style="font-size: 1rem; color: #3b82f6; margin-left: 0.5rem;" title="Umbrella needed"></i>';
    if (hasThunderstorm) featuredIndicators += '<i class="fa-solid fa-cloud-bolt" style="font-size: 1rem; color: #f59e0b; margin-left: 0.5rem;" title="Thunderstorm expected"></i>';
    if (hasTornado) featuredIndicators += '<i class="fa-solid fa-tornado" style="font-size: 1rem; color: #ef4444; margin-left: 0.5rem;" title="Tornado warning"></i>';
    
    // Add severity to modal title
    const sevIdx = w.severity_index || 'Low';
    const sevClass = sevIdx === 'High' ? 'high' : (sevIdx === 'Moderate' ? 'mod' : 'low');
    const sevBadge = `<span class="severity-badge ${sevClass}" style="font-size: 0.6em; vertical-align: middle;">${sevIdx} SEVERITY</span>`;
    
    modalTitle.innerHTML = `${w.city}, ${w.country}${indicators} ${sevBadge}`;
    
    // Add severity to featured card
    document.getElementById('featuredCity').innerHTML = `${w.city}, ${w.country}${featuredIndicators} ${sevBadge}`;
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
    const skeletonCount = 6;
    for (let i = 0; i < skeletonCount; i++) {
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

    // Show loading state
    searchCity.disabled = true;
    const searchBtn = searchForm.querySelector('button[type="submit"]');
    const originalBtnText = searchBtn.innerHTML;
    searchBtn.disabled = true;
    searchBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Searching...';

    try {
      const q = new URL('/api/weather', window.location.origin);
      q.searchParams.set('city', city || '');
      if (state) q.searchParams.set('state', state);
      if (country) q.searchParams.set('country', country);

      const res = await fetch(q);
      const data = await res.json();
      
      // Reset button state
      searchCity.disabled = false;
      searchBtn.disabled = false;
      searchBtn.innerHTML = originalBtnText;
      
      if (!res.ok) {
        const errorMsg = data.error || 'Search failed';
        searchFeedback.textContent = errorMsg;
        searchFeedback.classList.remove('d-none');
        showToast(errorMsg, 'error');
        return;
      }
      
      showToast(`Weather data loaded for ${data.city}`, 'success');

      // Convert units if needed
      const unit = currentUnit();
      if (unit === 'metric') {
        const convert = (v) => (v === null || v === undefined) ? v : Math.round((v - 32) * 5 / 9);
        if (data.temperature !== null) data.temperature = convert(data.temperature);
        if (data.feels_like !== null) data.feels_like = convert(data.feels_like);
      }

      showDetails(data);
    } catch (err) {
      // Reset button state on error
      searchCity.disabled = false;
      const searchBtn = searchForm.querySelector('button[type="submit"]');
      searchBtn.disabled = false;
      searchBtn.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> Search';
      
      const errorMsg = `Search error: ${err.message}`;
      searchFeedback.textContent = errorMsg;
      searchFeedback.classList.remove('d-none');
      showToast(errorMsg, 'error');
    }
  });

  // Refresh button handler
  const refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      refreshBtn.disabled = true;
      refreshBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
      fetchDefaultCities().finally(() => {
        refreshBtn.disabled = false;
        refreshBtn.innerHTML = '<i class="fa-solid fa-arrow-rotate-right"></i>';
      });
    });
  }

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

  // View favorites button
  const viewFavoritesBtn = document.getElementById('viewFavoritesBtn');
  if (viewFavoritesBtn) {
    viewFavoritesBtn.addEventListener('click', () => {
      const favorites = getFavorites();
      if (favorites.length === 0) {
        showToast('No favorite cities yet. Click the star icon on any city card to add it.', 'info');
        return;
      }
      
      citiesGrid.innerHTML = '';
      citiesGrid.innerHTML = '<div class="col-12"><h6 class="mb-3">Favorite Cities</h6></div>';
      
      // Fetch weather for each favorite
      const fetchPromises = favorites.map(fav => {
        const [city, country] = fav.key.split(',');
        return fetch(`/api/weather?city=${encodeURIComponent(city)}&country=${encodeURIComponent(country)}`)
          .then(res => res.json())
          .then(data => {
            if (!data.error) {
              const unit = currentUnit();
              if (unit === 'metric') {
                const convert = (v) => (v === null || v === undefined) ? v : Math.round((v - 32) * 5 / 9);
                data.temperature = convert(data.temperature);
                data.feels_like = convert(data.feels_like);
              }
              citiesGrid.appendChild(createCityCard(data));
            }
          })
          .catch(err => console.error(`Failed to load ${city}:`, err));
      });
      
      Promise.all(fetchPromises).then(() => {
        if (citiesGrid.children.length === 1) {
          citiesGrid.innerHTML = '<div class="col-12"><div class="alert alert-info">Failed to load favorite cities. They may have been removed.</div></div>';
        }
      });
    });
  }

  // View metrics button
  const viewMetricsBtn = document.getElementById('viewMetricsBtn');
  if (viewMetricsBtn) {
    viewMetricsBtn.addEventListener('click', async () => {
      try {
        const res = await fetch('/api/metrics');
        const data = await res.json();
        
        const metricsHtml = `
          <div class="card glass p-4">
            <h5 class="mb-3">Application Metrics</h5>
            <div class="row">
              <div class="col-md-6 mb-3">
                <h6>Cache Statistics</h6>
                <ul class="list-unstyled">
                  <li>Size: ${data.cache.size} / ${data.cache.max_size}</li>
                  <li>Utilization: ${data.cache.utilization_percent}%</li>
                  <li>TTL: ${data.cache.ttl_seconds}s</li>
                  <li>Hits: ${data.cache.hits}</li>
                </ul>
              </div>
              <div class="col-md-6 mb-3">
                <h6>Rate Limiting</h6>
                <ul class="list-unstyled">
                  <li>Active IPs: ${data.rate_limiting.active_ips}</li>
                  <li>Total Requests: ${data.rate_limiting.total_requests}</li>
                  <li>Limit: ${data.rate_limiting.limit_per_window} / ${data.rate_limiting.window_seconds}s</li>
                </ul>
              </div>
            </div>
            <div class="mt-3">
              <small class="text-muted">Last updated: ${new Date(data.timestamp).toLocaleString()}</small>
            </div>
          </div>
        `;
        
        const modal = new bootstrap.Modal(document.createElement('div'));
        const modalEl = document.createElement('div');
        modalEl.className = 'modal fade';
        modalEl.innerHTML = `
          <div class="modal-dialog">
            <div class="modal-content glass">
              <div class="modal-header">
                <h5 class="modal-title">Application Metrics</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
              </div>
              <div class="modal-body">${metricsHtml}</div>
              <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
              </div>
            </div>
          </div>
        `;
        document.body.appendChild(modalEl);
        const metricsModal = new bootstrap.Modal(modalEl);
        metricsModal.show();
        modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove());
      } catch (err) {
        showToast('Failed to load metrics', 'error');
        console.error('Metrics error:', err);
      }
    });
  }

  // Health check on load
  fetch('/api/health')
    .then(res => res.json())
    .then(data => {
      console.log('App health status:', data);
    })
    .catch(err => {
      console.warn('Health check failed:', err);
    });

  // initialize
  fetchDefaultCities();
});