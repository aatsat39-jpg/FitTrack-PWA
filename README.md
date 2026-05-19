# FitTrack — Offline-First Exercise PWA

A fully offline-capable Progressive Web App for tracking workouts, daily streaks, and calories. Built with plain HTML5, CSS3, and Vanilla JavaScript — no frameworks.

---

## 📁 Project Structure

```
FitTrack-PWA/
├── index.html          ← Single-page app shell
├── style.css           ← All styles (industrial dark theme)
├── app.js              ← All logic: GPS, MET, streaks, localStorage
├── service-worker.js   ← Offline caching (cache-first strategy)
├── manifest.json       ← PWA manifest for Android installation
├── icons/
│   ├── icon-192.png    ← Home screen icon
│   └── icon-512.png    ← Splash screen icon
└── README.md
```

---

## 🚀 Setup & Deployment

### Option A — Serve Locally (for testing)

```bash
# Python 3
python3 -m http.server 8080

# Node.js (npx)
npx serve .
```

Then open `http://localhost:8080` in Chrome/Edge.

### Option B — Android Installation

1. Deploy to any HTTPS host (GitHub Pages, Netlify, Vercel, Firebase Hosting — all free).
2. Open the URL in **Chrome for Android**.
3. Chrome will show an **"Add to Home Screen"** banner, or tap ⋮ → **Install App**.
4. The app launches in standalone mode (no browser chrome) and works fully offline.

> **⚠️ HTTPS is required** for Service Workers and Geolocation API to work. `localhost` is exempt for testing.

### Option C — GitHub Pages (Simplest)

```bash
git init && git add . && git commit -m "FitTrack PWA"
git remote add origin https://github.com/YOUR_USERNAME/fittrack-pwa.git
git push -u origin main
# Enable Pages in repo Settings → Pages → Branch: main
```

---

## ✨ Features

| Feature | Details |
|---|---|
| **Offline-first** | Service worker caches all assets on first load |
| **Installable** | PWA manifest for Android home screen installation |
| **Dashboard** | Streak counter, total sessions, weekly activity bar |
| **Log Activity** | Running, Pushups, Situps, Planks with duration |
| **MET Calories** | `Calories = MET × Weight(kg) × Duration(h)` |
| **GPS Tracking** | `watchPosition` + Haversine formula for distance |
| **5-Minute Log** | Running-specific field for physical sensations at ~5 min |
| **localStorage** | All data stored on-device, no server needed |
| **History** | Filterable full activity log |
| **Settings** | Body weight input, MET reference table |

---

## 🔬 Technical Details

### MET Values
```
Running  → 9.8
Pushups  → 8.0
Situps   → 3.8
Planks   → 3.5
```

### Haversine Formula (Distance)
```js
// Earth radius = 6371 km
const a = sin²(Δφ/2) + cos(φ1)·cos(φ2)·sin²(Δλ/2)
distance = 2R · atan2(√a, √(1−a))
```

### Data Structure (localStorage)
```json
{
  "id": 1700000000000,
  "date": "2025-01-15",
  "timestamp": "2025-01-15T08:30:00.000Z",
  "exercise_type": "Running",
  "duration": 35,
  "calories_burned": 342.3,
  "distance": 4.82,
  "notes": "Good pace today",
  "five_min_log": "Breathing steady, legs warm at 5 min",
  "gps_points": 128
}
```

### Service Worker Strategy
- **Install**: Pre-caches `index.html`, `style.css`, `app.js`, `manifest.json`
- **Fetch**: Cache-first, falls back to network, dynamically caches new responses
- **Activate**: Removes stale caches on update

---

## 📱 Browser Compatibility

| Feature | Chrome Android | Firefox | Safari iOS |
|---|---|---|---|
| Service Worker | ✅ | ✅ | ✅ |
| Install prompt | ✅ | ❌ | Manual |
| Geolocation | ✅ | ✅ | ✅ |
| localStorage | ✅ | ✅ | ✅ |

---

*All data lives entirely on your device. No accounts, no servers, no tracking.*
