"""
Weather App - A simple Flask application to display weather conditions
"""
import os
from flask import Flask, render_template, request, jsonify
import requests
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

# OpenWeatherMap API configuration
WEATHER_API_KEY = os.getenv('WEATHER_API_KEY', '')
WEATHER_API_URL = 'https://api.openweathermap.org/data/2.5/weather'

# Validate API key on startup
if not WEATHER_API_KEY or WEATHER_API_KEY == 'your_api_key_here':
    print("⚠️  WARNING: WEATHER_API_KEY not set or using placeholder value.")
    print("   Please create a .env file with your OpenWeatherMap API key.")
    print("   Get a free API key at: https://openweathermap.org/api")
    print("   Format: WEATHER_API_KEY=your_actual_api_key_here")
elif len(WEATHER_API_KEY) < 20:
    print("⚠️  WARNING: API key appears to be invalid (too short).")
    print("   OpenWeatherMap API keys are typically 32 characters long.")

# Default cities to display
DEFAULT_CITIES = [
    {'name': 'Fremont', 'state': 'CA', 'country': 'US'},
    {'name': 'New York', 'state': 'NY', 'country': 'US'},
    {'name': 'Los Angeles', 'state': 'CA', 'country': 'US'},
    {'name': 'Chennai', 'state': 'Tamil Nadu', 'country': 'IN'},
    {'name': 'Beijing', 'state': '', 'country': 'CN'},
    {'name': 'Tokyo', 'state': '', 'country': 'JP'},
    {'name': 'Budapest', 'state': '', 'country': 'HU'},
    {'name': 'Phuket', 'state': '', 'country': 'TH'},
    {'name': 'Dubai', 'state': '', 'country': 'AE'},
]


def get_weather_data(city_name, state='', country=''):
    """
    Fetch weather data from OpenWeatherMap API
    
    Args:
        city_name: Name of the city
        state: State/Province (optional)
        country: Country code (optional)
    
    Returns:
        dict: Weather data or error message
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
    
    params = {
        'q': query,
        'appid': WEATHER_API_KEY,
        'units': 'imperial'  # Use Fahrenheit
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
            return {'error': f'City "{query}" not found. Please check the city name and try again.'}
        elif response.status_code == 429:
            return {
                'error': 'API rate limit exceeded. Please wait a moment and try again. '
                        'Free tier allows 60 calls/minute.'
            }
        
        response.raise_for_status()
        data = response.json()
        
        # Format the response
        weather_info = {
            'city': data['name'],
            'country': data['sys']['country'],
            'temperature': round(data['main']['temp']),
            'feels_like': round(data['main']['feels_like']),
            'description': data['weather'][0]['description'].title(),
            'icon': data['weather'][0]['icon'],
            'humidity': data['main']['humidity'],
            'wind_speed': round(data['wind']['speed'], 1),
            'pressure': data['main']['pressure'],
            'visibility': round(data.get('visibility', 0) / 1000, 1) if data.get('visibility') else 'N/A',
            'sunrise': data['sys']['sunrise'],
            'sunset': data['sys']['sunset'],
            'timezone': data.get('timezone', 0)
        }
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


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)

