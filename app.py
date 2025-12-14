"""
Weather App - A simple Flask application to display weather conditions
(Modified to add a simple thread-safe in-memory TTL cache and service worker route)
"""
import os
import time
import threading
import logging
import re
from collections import OrderedDict
from datetime import datetime
from typing import Tuple
from flask import Flask, render_template, request, jsonify, send_from_directory

import requests
from dotenv import load_dotenv

load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__, static_folder='static', template_folder='templates')

# Disable caching for static files in development
@app.after_request
def add_no_cache_headers(response):
    """
    Add no-cache headers to prevent browser caching during development.
    
    Args:
        response: Flask response object
        
    Returns:
        Flask response object with no-cache headers added
    """
    if app.debug:
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate, max-age=0'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
    return response

# Simple rate limiting (in-memory, per IP)
_rate_limit_store = {}
_rate_limit_lock = threading.Lock()
RATE_LIMIT_REQUESTS = 100  # requests per window
RATE_LIMIT_WINDOW = 3600  # 1 hour in seconds

def check_rate_limit(ip_address: str) -> bool:
    """
    Check if IP address has exceeded rate limit.
    
    Args:
        ip_address: Client IP address
        
    Returns:
        True if within the limit, False if it exceeded
    """
    current_time = time.time()
    with _rate_limit_lock:
        if ip_address not in _rate_limit_store:
            _rate_limit_store[ip_address] = {'count': 1, 'window_start': current_time}
            return True
        
        record = _rate_limit_store[ip_address]
        # Reset window if expired
        if current_time - record['window_start'] > RATE_LIMIT_WINDOW:
            record['count'] = 1
            record['window_start'] = current_time
            return True
        
        # Check limit
        if record['count'] >= RATE_LIMIT_REQUESTS:
            return False
        
        record['count'] += 1
        return True

# Request logging and rate limiting middleware
@app.before_request
def log_request_info():
    """Log incoming requests and enforce rate limiting"""
    client_ip = request.remote_addr or 'unknown'
    logger.info(f'Request: {request.method} {request.path} from {client_ip}')
    
    # Rate limiting for API endpoints
    if request.path.startswith('/api/') and request.path != '/api/health':
        if not check_rate_limit(client_ip):
            logger.warning(f'Rate limit exceeded for {client_ip}')
            return jsonify({'error': 'Rate limit exceeded. Please try again later.'}), 429
    
    if request.args:
        logger.debug(f'Query params: {dict(request.args)}')

# OpenWeatherMap API configuration
WEATHER_API_KEY = os.getenv('WEATHER_API_KEY', '')
WEATHER_API_URL = 'https://api.openweathermap.org/data/2.5/weather'
FORECAST_API_URL = 'https://api.openweathermap.org/data/2.5/forecast'
WEATHER_UNITS = 'imperial'  # Fahrenheit by default

# Cache configuration (thread-safe simple TTL cache)
try:
    CACHE_TTL = int(os.getenv('CACHE_TTL', '300'))  # seconds
except ValueError:
    CACHE_TTL = 300
try:
    CACHE_MAXSIZE = int(os.getenv('CACHE_MAXSIZE', '256'))
except ValueError:
    CACHE_MAXSIZE = 256

_cache_lock = threading.Lock()
_cache = OrderedDict()  # key -> {"ts": epoch_seconds, "value": result_dict}

def _cache_get(key):
    with _cache_lock:
        entry = _cache.get(key)
        if not entry:
            return None
        if (time.time() - entry['ts']) > CACHE_TTL:
            # expired
            try:
                del _cache[key]
            except KeyError:
                pass
            return None
        # move key to end to mark as recently used
        _cache.move_to_end(key)
        # return a shallow copy to avoid external mutation
        return dict(entry['value'])

def _cache_set(key, value):
    with _cache_lock:
        # evict if necessary
        while len(_cache) >= CACHE_MAXSIZE:
            _cache.popitem(last=False)
        _cache[key] = {"ts": time.time(), "value": dict(value)}


def calculate_weather_severity(temperature, wind_speed, rain_amount, has_thunderstorm, has_tornado, visibility, humidity):
    """
    Calculate weather severity index based on multiple meteorological factors.
    
    This function evaluates weather conditions and assigns a severity level (Low, Moderate, High)
    based on temperature extremes, wind speed, precipitation, severe weather events, visibility, and humidity.
    
    Args:
        temperature: Temperature in Fahrenheit
        wind_speed: Wind speed in mph
        rain_amount: Rainfall amount in mm
        has_thunderstorm: Boolean indicating thunderstorm presence
        has_tornado: Boolean indicating tornado warning
        visibility: Visibility in meters
        humidity: Humidity percentage (0-100)
    
    Returns:
        Tuple[str, int]: (severity_index, severity_score)
            - severity_index: 'Low', 'Moderate', or 'High'
            - severity_score: Numeric score (0-100) representing overall severity
    """
    score = 0
    
    # Temperature factor (penalize extreme temperatures)
    # Ideal range: 60-80°F (15-27°C)
    temp_deviation = abs(temperature - 70)
    if temp_deviation > 30:  # Very extreme (>100°F or <40°F)
        score += 30
    elif temp_deviation > 20:  # Extreme (90-100°F or 40-50°F)
        score += 20
    elif temp_deviation > 10:  # Moderate deviation
        score += 10
    
    # Wind speed factor
    if wind_speed > 50:  # Hurricane force
        score += 30
    elif wind_speed > 30:  # Strong winds
        score += 20
    elif wind_speed > 15:  # Moderate winds
        score += 10
    
    # Precipitation factor
    if rain_amount > 50:  # Heavy rainfall (>50mm)
        score += 25
    elif rain_amount > 20:  # Moderate rainfall
        score += 15
    elif rain_amount > 5:  # Light rainfall
        score += 5
    
    # Severe weather events (highest priority)
    if has_tornado:
        score += 50  # Tornado is always high severity
    elif has_thunderstorm:
        score += 25  # Thunderstorms significantly increase severity
    
    # Visibility factor
    visibility_km = visibility / 1000 if visibility else 10
    if visibility_km < 0.5:  # Very poor visibility
        score += 20
    elif visibility_km < 2:  # Poor visibility
        score += 10
    elif visibility_km < 5:  # Reduced visibility
        score += 5
    
    # Humidity factor (extreme humidity can indicate discomfort or storm conditions)
    if humidity > 90:  # Very high humidity
        score += 10
    elif humidity < 20:  # Very low humidity (dry conditions)
        score += 5
    
    # Cap score at 100
    score = min(score, 100)
    
    # Determine severity index
    if score >= 60:
        severity_index = 'High'
    elif score >= 30:
        severity_index = 'Moderate'
    else:
        severity_index = 'Low'
    
    return severity_index, round(score)

# Validate API key on startup
if not WEATHER_API_KEY or WEATHER_API_KEY == 'your_api_key_here':
    print("⚠️  WARNING: WEATHER_API_KEY not set or using placeholder value.")
    print("   Please create a .env file with your OpenWeatherMap API key.")
    print("   Get a free API key at: https://openweathermap.org/api")
    print("   Format: WEATHER_API_KEY=your_actual_api_key_here")
elif len(WEATHER_API_KEY) < 20:
    print("⚠️  WARNING: API key appears to be invalid (too short).")
    print("   OpenWeatherMap API keys are typically 32 characters long.")

# Default cities to display (unchanged)
DEFAULT_CITIES = [
    {'name': 'Fremont', 'state': 'CA', 'country': 'US'},
    {'name': 'New York', 'state': 'NY', 'country': 'US'},
    {'name': 'Thanjavur', 'state': 'Tamil Nadu', 'country': 'IN'},
    {'name': 'Chennai', 'state': 'Tamil Nadu', 'country': 'IN'},
    {'name': 'Beijing', 'state': '', 'country': 'CN'},
    {'name': 'Tokyo', 'state': '', 'country': 'JP'},
    {'name': 'Budapest', 'state': '', 'country': 'HU'},
    {'name': 'Phuket', 'state': '', 'country': 'TH'},
    {'name': 'Dubai', 'state': '', 'country': 'AE'},
]


def get_weather_data(city_name='', state='', country='', lat=None, lon=None):
    """
    Fetch weather data from OpenWeatherMap API with a thread-safe TTL cache.
    
    Can fetch by city name or by coordinates.

    Returns a dict containing either weather information or an 'error' key.
    """
    if not WEATHER_API_KEY:
        return {'error': 'Weather API key not configured. Please set WEATHER_API_KEY in .env file'}

    units = WEATHER_UNITS
    
    # Build cache key and params based on query type
    if lat is not None and lon is not None:
        cache_key = f"coords:{lat},{lon}|{units}"
        params = {
            'lat': lat,
            'lon': lon,
            'appid': WEATHER_API_KEY,
            'units': units
        }
    else:
        # Build query string for city search
        query_parts = [city_name]
        if state:
            query_parts.append(state)
        if country:
            query_parts.append(country)
        
        query = ','.join(query_parts)
        cache_key = f"{query}|{units}"
        params = {
            'q': query,
            'appid': WEATHER_API_KEY,
            'units': units
        }

    cached = _cache_get(cache_key)
    if cached:
        return cached

    try:
        response = requests.get(WEATHER_API_URL, params=params, timeout=10)

        # Handle specific HTTP error codes
        if response.status_code == 401:
            return {
                'error': 'Invalid API key. Please check your OpenWeatherMap API key in the .env file. '
                         'Make sure the key is valid and activated. Get a free key at: https://openweathermap.org/api'
            }
        elif response.status_code == 404:
            return {'error': f'City \"{query}\" not found. Please check the city name and try again.'}
        elif response.status_code == 429:
            return {
                'error': 'API rate limit exceeded. Please wait a moment and try again. '
                         'Free tier allows 60 calls/minute.'
            }

        response.raise_for_status()
        data = response.json()

        # Check for rain/precipitation
        weather_id = data['weather'][0].get('id', 0) if data.get('weather') else 0
        rain_amount = data.get('rain', {}).get('1h', 0) or data.get('rain', {}).get('3h', 0) or 0
        
        # Determine if umbrella is needed
        # Weather IDs 500-531 indicate rain/drizzle/thunderstorm
        # Also check if there's actual rain amount
        needs_umbrella = (weather_id >= 500 and weather_id < 600) or rain_amount > 0
        
        # Check for thunderstorms (weather IDs 200-232)
        has_thunderstorm = weather_id >= 200 and weather_id < 300
        
        # Check for tornado (weather ID 781)
        has_tornado = weather_id == 781

        # Calculate weather severity index based on multiple factors
        severity_index, severity_score = calculate_weather_severity(
            temperature=data['main']['temp'] if data.get('main') and data['main'].get('temp') is not None else 70,
            wind_speed=data['wind']['speed'] if data.get('wind') and data['wind'].get('speed') is not None else 0,
            rain_amount=rain_amount,
            has_thunderstorm=has_thunderstorm,
            has_tornado=has_tornado,
            visibility=data.get('visibility', 10000),
            humidity=data.get('main', {}).get('humidity', 50)
        )

        # Format the response
        weather_info = {
            'city': data.get('name', city_name if city_name else 'Unknown'),
            'country': data.get('sys', {}).get('country', ''),
            'temperature': round(data['main']['temp']) if data.get('main') and data['main'].get('temp') is not None else None,
            'feels_like': round(data['main']['feels_like']) if data.get('main') and data['main'].get('feels_like') is not None else None,
            'description': data['weather'][0]['description'].title() if data.get('weather') else '',
            'icon': data['weather'][0]['icon'] if data.get('weather') else '',
            'humidity': data.get('main', {}).get('humidity'),
            'wind_speed': round(data['wind']['speed'], 1) if data.get('wind') and data['wind'].get('speed') is not None else None,
            'pressure': data.get('main', {}).get('pressure'),
            'visibility': round(data.get('visibility', 0) / 1000, 1) if data.get('visibility') else 'N/A',
            'sunrise': data.get('sys', {}).get('sunrise'),
            'sunset': data.get('sys', {}).get('sunset'),
            'timezone': data.get('timezone', 0),
            'rain_amount': round(rain_amount, 1) if rain_amount else 0,
            'needs_umbrella': needs_umbrella,
            'has_thunderstorm': has_thunderstorm,
            'has_tornado': has_tornado,
            'severity_index': severity_index,
            'severity_score': severity_score
        }

        # Cache only successful formatted response
        _cache_set(cache_key, weather_info)

        return weather_info
    except requests.exceptions.Timeout:
        return {'error': 'Request timeout: The weather service took too long to respond. Please try again.'}
    except requests.exceptions.ConnectionError:
        return {'error': 'Connection error: Unable to reach the weather service. Please check your internet connection.'}
    except requests.exceptions.RequestException as e:
        return {'error': f'Failed to fetch weather data: {str(e)}'}
    except KeyError as e:
        return {'error': f'Unexpected API response format: Missing key {str(e)}'}
    except Exception as e:
        return {'error': f'An unexpected error occurred: {str(e)}'}


@app.route('/')
def index():
    """
    Render the main weather app page.
    
    Returns:
        HTML template: The main index.html template with weather app UI
    """
    return render_template('index.html')


@app.route('/api/weather', methods=['GET'])
def get_weather():
    """API endpoint to get weather for a specific location (by city name or coordinates)"""
    # Check if using coordinates
    lat = request.args.get('lat', '').strip()
    lon = request.args.get('lon', '').strip()
    
    if lat and lon:
        # Validate coordinates
        try:
            lat_float = float(lat)
            lon_float = float(lon)
            
            if not (-90 <= lat_float <= 90):
                return jsonify({'error': 'Latitude must be between -90 and 90'}), 400
            if not (-180 <= lon_float <= 180):
                return jsonify({'error': 'Longitude must be between -180 and 180'}), 400
            
            weather_data = get_weather_data(lat=lat_float, lon=lon_float)
        except ValueError:
            return jsonify({'error': 'Invalid latitude or longitude values'}), 400
    else:
        # Use city name
        city = request.args.get('city', '').strip()
        state = request.args.get('state', '').strip()
        country = request.args.get('country', '').strip()

        # Validate input
        is_valid, error_msg = validate_city_input(city, state, country)
        if not is_valid:
            logger.warning(f'Invalid input: {error_msg} for city={city}, state={state}, country={country}')
            return jsonify({'error': error_msg}), 400

        weather_data = get_weather_data(city, state, country)

    if 'error' in weather_data:
        return jsonify(weather_data), 400

    return jsonify(weather_data)


@app.route('/api/cities', methods=['GET'])
def get_default_cities():
    """API endpoint to get weather for all default cities"""
    cities_weather = []

    for city_info in DEFAULT_CITIES:
        weather = get_weather_data(
            city_info['name'],
            city_info['state'],
            city_info['country']
        )
        if 'error' not in weather:
            cities_weather.append(weather)
        else:
            # Include error info for debugging
            cities_weather.append({
                'city': city_info['name'],
                'error': weather.get('error', 'Unknown error')
            })

    return jsonify(cities_weather)


def get_forecast_data(city_name='', state='', country='', lat=None, lon=None):
    """
    Fetch 5-day weather forecast from OpenWeatherMap API.
    
    Returns a dict containing forecast data or an 'error' key.
    """
    if not WEATHER_API_KEY:
        return {'error': 'Weather API key not configured'}
    
    units = WEATHER_UNITS
    
    # Build cache key and params
    if lat is not None and lon is not None:
        cache_key = f"forecast:coords:{lat},{lon}|{units}"
        params = {
            'lat': lat,
            'lon': lon,
            'appid': WEATHER_API_KEY,
            'units': units
        }
    else:
        query_parts = [city_name]
        if state:
            query_parts.append(state)
        if country:
            query_parts.append(country)
        
        query = ','.join(query_parts)
        cache_key = f"forecast:{query}|{units}"
        params = {
            'q': query,
            'appid': WEATHER_API_KEY,
            'units': units
        }
    
    cached = _cache_get(cache_key)
    if cached:
        return cached
    
    try:
        response = requests.get(FORECAST_API_URL, params=params, timeout=10)
        
        if response.status_code == 401:
            return {'error': 'Invalid API key'}
        elif response.status_code == 404:
            return {'error': 'Location not found'}
        elif response.status_code == 429:
            return {'error': 'API rate limit exceeded'}
        
        response.raise_for_status()
        data = response.json()
        
        # Process forecast data - group by day and get daily summary
        daily_forecasts = {}
        
        for item in data.get('list', []):
            dt = datetime.fromtimestamp(item['dt'])
            date_key = dt.strftime('%Y-%m-%d')
            
            if date_key not in daily_forecasts:
                daily_forecasts[date_key] = {
                    'date': date_key,
                    'day_name': dt.strftime('%A'),
                    'temps': [],
                    'descriptions': [],
                    'icons': [],
                    'humidity': [],
                    'wind_speed': [],
                    'pop': []  # Probability of precipitation
                }
            
            daily_forecasts[date_key]['temps'].append(item['main']['temp'])
            daily_forecasts[date_key]['descriptions'].append(item['weather'][0]['description'])
            daily_forecasts[date_key]['icons'].append(item['weather'][0]['icon'])
            daily_forecasts[date_key]['humidity'].append(item['main']['humidity'])
            daily_forecasts[date_key]['wind_speed'].append(item['wind']['speed'])
            daily_forecasts[date_key]['pop'].append(item.get('pop', 0) * 100)
        
        # Calculate daily averages and select most common icon
        forecast_list = []
        for date_key in sorted(daily_forecasts.keys())[:5]:  # 5 days
            day_data = daily_forecasts[date_key]
            
            # Get most common icon (typically midday icon)
            icon = max(set(day_data['icons']), key=day_data['icons'].count)
            # Get most common description
            description = max(set(day_data['descriptions']), key=day_data['descriptions'].count)
            
            forecast_list.append({
                'date': day_data['date'],
                'day_name': day_data['day_name'],
                'temp_min': round(min(day_data['temps'])),
                'temp_max': round(max(day_data['temps'])),
                'temp_avg': round(sum(day_data['temps']) / len(day_data['temps'])),
                'description': description.title(),
                'icon': icon,
                'humidity': round(sum(day_data['humidity']) / len(day_data['humidity'])),
                'wind_speed': round(sum(day_data['wind_speed']) / len(day_data['wind_speed']), 1),
                'precipitation_chance': round(max(day_data['pop']))
            })
        
        forecast_info = {
            'city': data.get('city', {}).get('name', city_name if city_name else 'Unknown'),
            'country': data.get('city', {}).get('country', ''),
            'forecasts': forecast_list
        }
        
        _cache_set(cache_key, forecast_info)
        return forecast_info
        
    except requests.exceptions.Timeout:
        return {'error': 'Request timeout'}
    except requests.exceptions.ConnectionError:
        return {'error': 'Connection error'}
    except requests.exceptions.RequestException as e:
        return {'error': f'Failed to fetch forecast: {str(e)}'}
    except Exception as e:
        return {'error': f'Unexpected error: {str(e)}'}


@app.route('/api/forecast', methods=['GET'])
def get_forecast():
    """API endpoint to get 5-day weather forecast"""
    # Check if using coordinates
    lat = request.args.get('lat', '').strip()
    lon = request.args.get('lon', '').strip()
    
    if lat and lon:
        try:
            lat_float = float(lat)
            lon_float = float(lon)
            
            if not (-90 <= lat_float <= 90):
                return jsonify({'error': 'Latitude must be between -90 and 90'}), 400
            if not (-180 <= lon_float <= 180):
                return jsonify({'error': 'Longitude must be between -180 and 180'}), 400
            
            forecast_data = get_forecast_data(lat=lat_float, lon=lon_float)
        except ValueError:
            return jsonify({'error': 'Invalid latitude or longitude values'}), 400
    else:
        # Use city name
        city = request.args.get('city', '').strip()
        state = request.args.get('state', '').strip()
        country = request.args.get('country', '').strip()

        is_valid, error_msg = validate_city_input(city, state, country)
        if not is_valid:
            return jsonify({'error': error_msg}), 400

        forecast_data = get_forecast_data(city, state, country)

    if 'error' in forecast_data:
        return jsonify(forecast_data), 400

    return jsonify(forecast_data)


# Offline page route for service worker fallback
@app.route('/offline')
def offline_page():
    return render_template('_offline.html')


# Serve the service worker at the root so it can control the whole scope
@app.route('/sw.js')
def service_worker():
    """
    Serve the service worker file with no-cache headers.
    
    Returns:
        Service worker JavaScript file with appropriate headers
    """
    response = send_from_directory(os.path.join(app.root_path, 'static', 'js'), 'sw.js')
    # Always prevent caching of the service worker itself
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response


@app.route('/api/health', methods=['GET'])
def health_check():
    """
    Health check endpoint to monitor application status.
    
    Returns:
        JSON response with application health status and timestamp
    """
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.utcnow().isoformat(),
        'cache_size': len(_cache),
        'cache_maxsize': CACHE_MAXSIZE
    })


@app.route('/api/metrics', methods=['GET'])
def get_metrics():
    """
    Get application metrics for monitoring.
    
    Returns:
        JSON response with cache statistics and rate limit info
    """
    with _rate_limit_lock:
        active_ips = len(_rate_limit_store)
        total_requests = sum(r['count'] for r in _rate_limit_store.values())
    
    cache_hits = sum(1 for entry in _cache.values() 
                     if (time.time() - entry['ts']) <= CACHE_TTL)
    
    return jsonify({
        'cache': {
            'size': len(_cache),
            'max_size': CACHE_MAXSIZE,
            'ttl_seconds': CACHE_TTL,
            'hits': cache_hits,
            'utilization_percent': round((len(_cache) / CACHE_MAXSIZE) * 100, 2) if CACHE_MAXSIZE > 0 else 0
        },
        'rate_limiting': {
            'active_ips': active_ips,
            'total_requests': total_requests,
            'limit_per_window': RATE_LIMIT_REQUESTS,
            'window_seconds': RATE_LIMIT_WINDOW
        },
        'timestamp': datetime.utcnow().isoformat()
    })


def validate_city_input(city: str, state: str = '', country: str = '') -> Tuple[bool, str]:
    """
    Validate city search input to prevent injection and invalid data.
    
    Args:
        city: City name
        state: State/province name
        country: Country code
        
    Returns:
        Tuple of (is_valid, error_message)
    """
    if not city or not city.strip():
        return False, 'City name is required'
    
    # Basic length validation
    if len(city) > 100:
        return False, 'City name is too long (max 100 characters)'
    
    if state and len(state) > 100:
        return False, 'State name is too long (max 100 characters)'
    
    if country and len(country) > 10:
        return False, 'Country code is too long (max 10 characters)'
    
    # Basic character validation (allow letters, spaces, hyphens, apostrophes, commas)
    valid_pattern = re.compile(r"^[a-zA-Z\s\-\',\.]+$")
    
    if not valid_pattern.match(city.strip()):
        return False, 'City name contains invalid characters'
    
    if state and not valid_pattern.match(state.strip()):
        return False, 'State name contains invalid characters'
    
    if country and not re.match(r'^[A-Z]{2,3}$', country.strip().upper()):
        return False, 'Country code must be 2-3 uppercase letters'
    
    return True, ''


if __name__ == '__main__':
    logger.info('Starting Weather App server...')
    app.run(debug=True, host='0.0.0.0', port=5000)
