"""
Weather App - A simple Flask application to display weather conditions
(Modified to add a simple thread-safe in-memory TTL cache and service worker route)
"""
import os
import time
import threading
from collections import OrderedDict
from flask import Flask, render_template, request, jsonify, send_from_directory

import requests
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__, static_folder='static', template_folder='templates')

# Disable caching for static files in development
@app.after_request
def add_no_cache_headers(response):
    """Add no-cache headers to prevent browser caching during development"""
    if app.debug:
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate, max-age=0'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
    return response

# OpenWeatherMap API configuration
WEATHER_API_KEY = os.getenv('WEATHER_API_KEY', '')
WEATHER_API_URL = 'https://api.openweathermap.org/data/2.5/weather'
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


def get_weather_data(city_name, state='', country=''):
    """
    Fetch weather data from OpenWeatherMap API with a thread-safe TTL cache.

    Returns a dict containing either weather information or an 'error' key.
    """
    if not WEATHER_API_KEY:
        return {'error': 'Weather API key not configured. Please set WEATHER_API_KEY in .env file'}

    # Build query string
    query_parts = [city_name]
    if state:
        query_parts.append(state)
    if country:
        query_parts.append(country)

    query = ','.join(query_parts)
    units = WEATHER_UNITS

    cache_key = f"{query}|{units}"
    cached = _cache_get(cache_key)
    if cached:
        return cached

    params = {
        'q': query,
        'appid': WEATHER_API_KEY,
        'units': units
    }

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

        # Format the response
        weather_info = {
            'city': data.get('name', city_name),
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
            'has_tornado': has_tornado
        }

        # Cache only successful formatted response
        _cache_set(cache_key, weather_info)

        return weather_info
    except requests.exceptions.RequestException as e:
        return {'error': f'Failed to fetch weather data: {str(e)}'}
    except KeyError as e:
        return {'error': f'Unexpected API response format: {str(e)}'}
    except Exception as e:
        return {'error': f'An error occurred: {str(e)}'}


@app.route('/')
def index():
    """Render the main page"""
    return render_template('index.html')


@app.route('/api/weather', methods=['GET'])
def get_weather():
    """API endpoint to get weather for a specific location"""
    city = request.args.get('city', '')
    state = request.args.get('state', '')
    country = request.args.get('country', '')

    if not city:
        return jsonify({'error': 'City name is required'}), 400

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


# Offline page route for service worker fallback
@app.route('/offline')
def offline_page():
    return render_template('_offline.html')


# Serve the service worker at the root so it can control the whole scope
@app.route('/sw.js')
def service_worker():
    # Serve the compiled/standalone service worker file from static/js/sw.js
    # This ensures register('/sw.js') has the proper scope '/'
    response = send_from_directory(os.path.join(app.root_path, 'static', 'js'), 'sw.js')
    # Always prevent caching of the service worker itself
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=int(os.getenv('PORT', 5001)))