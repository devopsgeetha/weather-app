```markdown
## Progressive Web App & Caching (PWA)

The main purpose of this repo is to demo the pr review is automated from a remote Github action [Link](https://github.com/marketplace/actions/ai-pr-reviewer-with-rag) with a minimal setup. This repository now includes a rich front-end and PWA support (service worker + manifest) plus a small thread-safe in-memory cache on the server to reduce API calls. A beautiful, modern and robust Python web application to display the real-time weather conditions for any place on the planet Earth. Built with Flask and featuring a responsive, gradient-based UI.

Quick setup:
1. Create a `.env` file with your OpenWeatherMap API key:
   ```
   WEATHER_API_KEY=your_actual_api_key_here
   ```
   Optional cache config:
   ```
   CACHE_TTL=300         # seconds, default 300
   CACHE_MAXSIZE=256     # default 256 entries
   ```

2. Add PWA icons:
   Place icon PNG files under `static/icons/`:
   - `icon-192.png` (192x192)
   - `icon-512.png` (512x512)

   If you don't add icons, the manifest has references to placeholder paths; add icons to enable "Add to Home screen" installation.

3. Run locally:
   ```
   pip install -r requirements.txt   # requests, python-dotenv
   python app.py
   ```
   Open http://localhost:5000 in your browser.

4. Test features:
   - Search for cities using the search bar (examples: "Fremont, CA, US", "Chennai, IN").
   - Toggle units (°F/°C) using the switch in the header. Default is Fahrenheit (°F).
   - Click any city card to view details in the modal.
   - To test offline behavior:
     - Load the app once (so assets are cached).
     - Go offline (disable network) and refresh — the service worker should serve cached assets or the offline fallback page. API requests will return cached data if within the configured TTL.

Notes:
- The server-side cache only caches successful weather responses (to prevent caching error responses).
- The service worker manages a separate runtime cache for API responses and attaches a simple timestamp to cached responses to enforce a TTL.
- If you want the service worker to control the entire application scope, it is exposed at `/sw.js` via a Flask route.

If you'd like, I can open a PR with these changes — I prepared everything and can push the patch branch for you if you provide repository push access. Otherwise you can apply the files locally and push them to a branch named `rich-ui-pwa-cache`.
```
