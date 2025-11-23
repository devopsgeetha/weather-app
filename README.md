# 🌤️ Weather App

A beautiful, modern and robust Python web application to display the real-time weather conditions for any place on the planet Earth. Built with Flask and featuring a responsive, gradient-based UI.

## ✨ Features

- **Global Weather Search**: Search for weather conditions in any city worldwide
- **Major Cities Display**: Pre-configured weather display for important cities:
  - Fremont, CA, USA
  - New York, USA
  - Los Angeles, USA
  - Chennai, India
  - Beijing, China
  - Tokyo, Japan
  - Budapest, Hungary
- **Modern UI**: Beautiful gradient design with smooth animations
- **Real-time Data**: Live weather updates from OpenWeatherMap API
- **Detailed Information**: Temperature, humidity, wind speed, pressure, visibility, sunrise/sunset times
- **Responsive Design**: Works perfectly on desktop, tablet, and mobile devices

## 🚀 Quick Start

### Prerequisites

- Python 3.7 or higher
- OpenWeatherMap API key (free at [openweathermap.org](https://openweathermap.org/api))

### Installation

1. **Clone or navigate to the project directory:**
   ```bash
   cd weather-app
   ```

2. **Create a virtual environment (recommended):**
   ```bash
   python -m venv venv
   
   # On Windows:
   venv\Scripts\activate
   
   # On macOS/Linux:
   source venv/bin/activate
   ```

3. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

4. **Set up environment variables:**
   ```bash
   # Copy the example file
   cp .env.example .env
   
   # Edit .env and add your OpenWeatherMap API key
   # Get your free API key from: https://openweathermap.org/api
   ```

5. **Run the application:**
   ```bash
   python app.py
   ```

6. **Open your browser:**
   Navigate to `http://localhost:5000`

## 📋 Configuration

### Getting an OpenWeatherMap API Key

1. Visit [OpenWeatherMap](https://openweathermap.org/api)
2. Sign up for a free account
3. Navigate to API keys section
4. Generate a new API key
5. Copy the key to your `.env` file:
   ```
   WEATHER_API_KEY=your_actual_api_key_here
   ```

### Customizing Default Cities

Edit the `DEFAULT_CITIES` list in `app.py` to add or modify the cities displayed on the main page:

```python
DEFAULT_CITIES = [
    {'name': 'Your City', 'state': 'State', 'country': 'Country Code'},
    # ...
]
```

## 🏗️ Project Structure

```
weather-app/
├── app.py                 # Main Flask application
├── requirements.txt       # Python dependencies
├── .env.example          # Environment variables template
├── .gitignore            # Git ignore file
├── README.md             # This file
├── templates/
│   └── index.html        # Main HTML template
└── static/
    ├── css/
    │   └── style.css     # Stylesheet
    └── js/
        └── app.js        # JavaScript functionality
```

## 🎨 Features in Detail

### Search Functionality
- Type any city name in the search box
- Press Enter or click Search
- View detailed weather information instantly

### Weather Information Displayed
- **Temperature**: Current temperature in Fahrenheit
- **Feels Like**: Perceived temperature
- **Description**: Weather condition description
- **Humidity**: Air humidity percentage
- **Wind Speed**: Wind speed in miles per hour
- **Pressure**: Atmospheric pressure in hPa
- **Visibility**: Visibility distance in kilometers
- **Sunrise/Sunset**: Local sunrise and sunset times

## 🔧 API Endpoints

- `GET /` - Main page
- `GET /api/weather?city=<city_name>&state=<state>&country=<country>` - Get weather for a specific location
- `GET /api/cities` - Get weather for all default cities

## 🛠️ Technologies Used

- **Backend**: Flask (Python web framework)
- **Frontend**: HTML5, CSS3, JavaScript (Vanilla)
- **API**: OpenWeatherMap API
- **Styling**: Custom CSS with gradient design
- **Fonts**: Google Fonts (Poppins)

## 📱 Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## 🤝 Contributing

Feel free to fork this project and submit pull requests for any improvements!

## 📝 License

This project is open source and available under the MIT License.

## 🙏 Acknowledgments

- Weather data provided by [OpenWeatherMap](https://openweathermap.org/)
- Icons from OpenWeatherMap
- Fonts from [Google Fonts](https://fonts.google.com/)

## 🐛 Troubleshooting

### API Key Issues
- Make sure your API key is correctly set in the `.env` file
- Verify the API key is active on OpenWeatherMap
- Free tier allows 60 calls/minute and 1,000,000 calls/month

### City Not Found
- Try using the format: "City, Country Code" (e.g., "London, GB")
- Some cities may require state/province information
- Check spelling of city names

### Connection Errors
- Ensure you have an active internet connection
- Check if OpenWeatherMap API is accessible
- Verify firewall settings aren't blocking requests

---

**Enjoy checking the weather! ☀️🌧️⛅**

