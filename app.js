/* ============================================================
   FitTrack — app.js
   Vanilla JS | No frameworks | Offline-first PWA
   ============================================================ */

'use strict';

// ── Service Worker Registration ───────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js')
      .then(reg => console.log('[SW] Registered:', reg.scope))
      .catch(err => console.warn('[SW] Registration failed:', err));
  });
}

// ── Constants & Config ────────────────────────────────────────
const MET_VALUES = {
  Running: 9.8,
  Pushups: 8.0,
  Situps:  3.8,
  Planks:  3.5
};

const EXERCISE_ICONS = {
  Running: '🏃',
  Pushups: '💪',
  Situps:  '🧘',
  Planks:  '🏋️'
};

const LS_ACTIVITIES = 'fittrack_activities';
const LS_WEIGHT     = 'fittrack_weight';

// ── State ─────────────────────────────────────────────────────
let activities    = loadActivities();
let bodyWeight    = parseFloat(localStorage.getItem(LS_WEIGHT)) || 0;
let currentFilter = 'All';

// GPS state
let gpsWatchId     = null;
let gpsTracking    = false;
let gpsCoords      = [];   // [{lat, lng, ts}]
let gpsDistance    = 0;    // km
let gpsStartTime   = null;
let gpsTimerInterval = null;

// ── Utility: localStorage ─────────────────────────────────────
function loadActivities() {
  try {
    return JSON.parse(localStorage.getItem(LS_ACTIVITIES)) || [];
  } catch { return []; }
}

function saveActivities() {
  localStorage.setItem(LS_ACTIVITIES, JSON.stringify(activities));
}

// ── Utility: Toast ────────────────────────────────────────────
let toastTimer = null;
function showToast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 2800);
}

// ── Calorie Calculation (MET) ─────────────────────────────────
/**
 * Calories = MET × Weight (kg) × Duration (hours)
 * @param {string} exerciseType
 * @param {number} durationMinutes
 * @param {number} weightKg
 * @returns {number} kcal (rounded to 1 decimal)
 */
function calculateCalories(exerciseType, durationMinutes, weightKg) {
  if (!weightKg || weightKg <= 0) return 0;
  const met      = MET_VALUES[exerciseType] || 5;
  const hours    = durationMinutes / 60;
  const calories = met * weightKg * hours;
  return Math.round(calories * 10) / 10;
}

// ── Streak Calculation ────────────────────────────────────────
function calculateStreak() {
  if (!activities.length) return 0;

  // Get unique dates (YYYY-MM-DD) sorted descending
  const uniqueDates = [...new Set(activities.map(a => a.date))].sort().reverse();
  if (!uniqueDates.length) return 0;

  const today    = getLocalDateStr(new Date());
  const yesterday = getLocalDateStr(new Date(Date.now() - 86400000));

  // Streak must include today or yesterday to be "current"
  if (uniqueDates[0] !== today && uniqueDates[0] !== yesterday) return 0;

  let streak = 1;
  for (let i = 1; i < uniqueDates.length; i++) {
    const prev = new Date(uniqueDates[i - 1]);
    const curr = new Date(uniqueDates[i]);
    const diffDays = Math.round((prev - curr) / 86400000);
    if (diffDays === 1) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

function getLocalDateStr(date) {
  return date.toLocaleDateString('en-CA'); // YYYY-MM-DD
}

// ── Haversine Formula ─────────────────────────────────────────
/**
 * Calculate distance in km between two lat/lng points.
 */
function haversine(lat1, lng1, lat2, lng2) {
  const R  = 6371; // Earth radius in km
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;
  const a  = Math.sin(Δφ/2) ** 2 +
             Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) ** 2;
  const c  = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// ── GPS Tracking ──────────────────────────────────────────────
function startGPS() {
  if (!('geolocation' in navigator)) {
    showToast('Geolocation not supported on this device.', 'error');
    return;
  }

  gpsTracking   = true;
  gpsCoords     = [];
  gpsDistance   = 0;
  gpsStartTime  = Date.now();

  updateGPSUI(true);

  // Elapsed time counter
  gpsTimerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - gpsStartTime) / 1000);
    const m = Math.floor(elapsed / 60);
    const s = elapsed % 60;
    document.getElementById('gps-time').textContent = `${m}:${s.toString().padStart(2,'0')}`;
  }, 1000);

  gpsWatchId = navigator.geolocation.watchPosition(
    pos => {
      const { latitude: lat, longitude: lng } = pos.coords;
      const ts = Date.now();

      if (gpsCoords.length > 0) {
        const prev = gpsCoords[gpsCoords.length - 1];
        const dist = haversine(prev.lat, prev.lng, lat, lng);
        // Filter tiny GPS jitter (< 2m movements)
        if (dist > 0.002) {
          gpsDistance += dist;
          gpsCoords.push({ lat, lng, ts });
        }
      } else {
        gpsCoords.push({ lat, lng, ts });
      }

      document.getElementById('gps-dist').textContent   = gpsDistance.toFixed(2);
      document.getElementById('gps-points').textContent = gpsCoords.length;
      document.getElementById('gps-status-text').textContent = 'Tracking — GPS signal acquired';
    },
    err => {
      let msg = 'GPS error';
      if (err.code === 1) msg = 'Location permission denied';
      if (err.code === 2) msg = 'GPS signal unavailable';
      if (err.code === 3) msg = 'GPS request timed out';
      showToast(msg, 'error');
      document.getElementById('gps-status-text').textContent = msg;
    },
    { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 }
  );
}

function stopGPS() {
  if (gpsWatchId !== null) {
    navigator.geolocation.clearWatch(gpsWatchId);
    gpsWatchId = null;
  }
  clearInterval(gpsTimerInterval);
  gpsTracking = false;
  updateGPSUI(false);
  document.getElementById('gps-status-text').textContent =
    `Track stopped — ${gpsDistance.toFixed(2)} km recorded`;

  // Auto-fill duration from elapsed time
  if (gpsStartTime) {
    const elapsedMin = Math.round((Date.now() - gpsStartTime) / 60000);
    if (elapsedMin > 0) {
      document.getElementById('exercise-duration').value = elapsedMin;
      updateCaloriePreview();
    }
  }
}

function updateGPSUI(tracking) {
  const btn = document.getElementById('btn-track');
  const dot = document.getElementById('gps-dot');
  if (tracking) {
    btn.classList.add('tracking');
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
      <rect x="6" y="6" width="12" height="12" rx="1"/>
    </svg> Stop Track`;
    dot.classList.add('active');
  } else {
    btn.classList.remove('tracking');
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="16" height="16">
      <circle cx="12" cy="12" r="10"/><polygon points="10,8 16,12 10,16"/>
    </svg> Start Track`;
    dot.classList.remove('active');
  }
}

// ── Calorie Preview (live update) ─────────────────────────────
function updateCaloriePreview() {
  const type     = document.getElementById('exercise-type').value;
  const duration = parseFloat(document.getElementById('exercise-duration').value);
  const el       = document.getElementById('calorie-preview');

  if (!duration || duration <= 0) { el.textContent = '—'; return; }
  if (!bodyWeight) { el.textContent = '?'; return; }

  const cal = calculateCalories(type, duration, bodyWeight);
  el.textContent = cal > 0 ? cal.toFixed(0) : '—';
}

// ── Log Activity ──────────────────────────────────────────────
function logActivity() {
  const type     = document.getElementById('exercise-type').value;
  const duration = parseFloat(document.getElementById('exercise-duration').value);
  const notes    = document.getElementById('exercise-notes').value.trim();
  const fiveMin  = document.getElementById('fivemin-log').value.trim();

  if (!duration || duration <= 0) {
    showToast('Please enter a valid duration.', 'error');
    return;
  }

  if (!bodyWeight) {
    showToast('Set your body weight in Settings for accurate calories.', 'error');
    // Allow save anyway with 0 cal
  }

  const calories = calculateCalories(type, duration, bodyWeight);
  const distance = type === 'Running' ? parseFloat(gpsDistance.toFixed(2)) : null;

  const entry = {
    id:            Date.now(),
    date:          getLocalDateStr(new Date()),
    timestamp:     new Date().toISOString(),
    exercise_type: type,
    duration:      duration,
    calories_burned: calories,
    distance:      distance,
    notes:         notes || null,
    five_min_log:  (type === 'Running' && fiveMin) ? fiveMin : null,
    gps_points:    (type === 'Running' && gpsCoords.length > 0) ? gpsCoords.length : 0
  };

  activities.unshift(entry);
  saveActivities();

  // Reset form
  document.getElementById('exercise-duration').value = '';
  document.getElementById('exercise-notes').value    = '';
  document.getElementById('fivemin-log').value       = '';
  document.getElementById('calorie-preview').textContent = '—';

  // Reset GPS if running
  if (gpsTracking) stopGPS();
  gpsCoords   = [];
  gpsDistance = 0;
  gpsStartTime = null;
  document.getElementById('gps-dist').textContent   = '0.00';
  document.getElementById('gps-points').textContent = '0';
  document.getElementById('gps-time').textContent   = '0:00';
  document.getElementById('gps-status-text').textContent = 'GPS ready — press Start Track to begin';

  showToast(`✅ ${type} saved! ${calories > 0 ? calories + ' kcal' : ''}`, 'success');

  // Switch to dashboard
  setTimeout(() => navigateTo('dashboard'), 800);
}

// ── Render: Dashboard ─────────────────────────────────────────
function renderDashboard() {
  // Streak
  document.getElementById('dash-streak').textContent = calculateStreak();

  // Totals
  const totalCal = activities.reduce((s, a) => s + (a.calories_burned || 0), 0);
  document.getElementById('dash-total').textContent = activities.length;
  document.getElementById('dash-kcal').textContent  = Math.round(totalCal);

  // Week bar
  renderWeekBar();

  // Recent 10 activities
  const list = document.getElementById('activity-list');
  if (!activities.length) {
    list.innerHTML = `<div class="empty-state">
      <div class="empty-icon">🏃</div>
      <p>No activities yet.<br/>Log your first workout!</p>
    </div>`;
    return;
  }
  list.innerHTML = activities.slice(0, 10).map(a => activityItemHTML(a)).join('');
}

function renderWeekBar() {
  const container = document.getElementById('week-bar');
  const today     = new Date();
  const days      = [];

  // Build last 7 days (Mon–Sun layout starting 6 days ago)
  for (let i = 6; i >= 0; i--) {
    const d    = new Date(today);
    d.setDate(today.getDate() - i);
    days.push(d);
  }

  const activityDates = new Set(activities.map(a => a.date));
  const todayStr      = getLocalDateStr(today);
  const dayNames      = ['Su','Mo','Tu','We','Th','Fr','Sa'];

  container.innerHTML = days.map(d => {
    const ds          = getLocalDateStr(d);
    const hasActivity = activityDates.has(ds);
    const isToday     = ds === todayStr;
    const dotClass    = `day-dot${hasActivity ? ' has-activity' : ''}${isToday ? ' today' : ''}`;
    const dayLetter   = dayNames[d.getDay()];
    return `<div class="week-day">
      <div class="${dotClass}">${hasActivity ? '✓' : ''}</div>
      <div class="day-name">${dayLetter}</div>
    </div>`;
  }).join('');
}

// ── Render: History ───────────────────────────────────────────
function renderHistory() {
  const list = document.getElementById('history-list');
  const filtered = currentFilter === 'All'
    ? activities
    : activities.filter(a => a.exercise_type === currentFilter);

  if (!filtered.length) {
    list.innerHTML = `<div class="empty-state">
      <div class="empty-icon">📋</div>
      <p>No ${currentFilter === 'All' ? '' : currentFilter + ' '}activities logged.</p>
    </div>`;
    return;
  }

  list.innerHTML = filtered.map(a => activityItemHTML(a, true)).join('');
}

// ── Shared: Activity Item HTML ────────────────────────────────
function activityItemHTML(a, showDate = false) {
  const icon    = EXERCISE_ICONS[a.exercise_type] || '🏅';
  const distStr = a.distance != null ? `${a.distance} km ·` : '';
  const dateStr = showDate
    ? `<span>${formatDate(a.date)}</span>`
    : `<span>${formatTime(a.timestamp)}</span>`;

  return `<div class="activity-item">
    <div class="activity-icon">${icon}</div>
    <div class="activity-body">
      <div class="activity-type">${a.exercise_type}</div>
      <div class="activity-meta">
        <span>⏱ ${a.duration} min</span>
        ${a.distance != null ? `<span>📍 ${a.distance} km</span>` : ''}
        ${dateStr}
      </div>
      ${a.five_min_log ? `<div style="font-size:0.68rem;color:var(--warn2);margin-top:3px;">⏱ 5-min: ${truncate(a.five_min_log, 50)}</div>` : ''}
    </div>
    <div class="activity-calories">
      ${a.calories_burned ? a.calories_burned.toFixed(0) : '—'}
      <small>KCAL</small>
    </div>
  </div>`;
}

// ── Render: Settings ──────────────────────────────────────────
function renderSettings() {
  const display = document.getElementById('settings-weight-display');
  display.innerHTML = bodyWeight
    ? `${bodyWeight} <small>kg</small>`
    : `— <small>kg</small>`;

  if (bodyWeight) {
    document.getElementById('weight-input').value = bodyWeight;
  }

  // MET table
  const tbody = document.getElementById('met-table');
  tbody.innerHTML = Object.entries(MET_VALUES).map(([ex, met]) =>
    `<tr>
      <td style="padding:6px 0;border-bottom:1px solid var(--border);color:var(--text);">
        ${EXERCISE_ICONS[ex]} ${ex}
      </td>
      <td style="padding:6px 0;border-bottom:1px solid var(--border);text-align:right;
                 font-family:var(--font-disp);color:var(--accent);font-size:1rem;">
        ${met}
      </td>
    </tr>`
  ).join('');
}

// ── Header weight display ─────────────────────────────────────
function renderHeaderWeight() {
  const el = document.getElementById('header-weight');
  el.textContent = bodyWeight ? `${bodyWeight} kg` : '';
}

// ── Navigation ────────────────────────────────────────────────
function navigateTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  document.getElementById(`page-${page}`).classList.add('active');
  document.querySelector(`.nav-btn[data-page="${page}"]`).classList.add('active');

  // Render page-specific content
  if (page === 'dashboard') renderDashboard();
  if (page === 'history')   renderHistory();
  if (page === 'settings')  renderSettings();
}

// ── Helpers ───────────────────────────────────────────────────
function formatDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00'); // noon avoids tz shift
  return d.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
}

function formatTime(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return d.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });
}

function truncate(str, max) {
  return str.length > max ? str.slice(0, max) + '…' : str;
}

// ── Event Listeners ───────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

  // Nav buttons
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.page));
  });

  // Exercise type change → show/hide GPS card and 5-min section
  const exerciseSelect = document.getElementById('exercise-type');
  exerciseSelect.addEventListener('change', () => {
    const isRunning = exerciseSelect.value === 'Running';
    document.getElementById('gps-card').classList.toggle('visible', isRunning);
    document.getElementById('fivemin-section').classList.toggle('visible', isRunning);
    updateCaloriePreview();
  });

  // Duration input → update calorie preview
  document.getElementById('exercise-duration').addEventListener('input', updateCaloriePreview);

  // GPS Start/Stop button
  document.getElementById('btn-track').addEventListener('click', () => {
    if (gpsTracking) {
      stopGPS();
    } else {
      startGPS();
    }
  });

  // Log activity button
  document.getElementById('btn-log').addEventListener('click', logActivity);

  // Save weight
  document.getElementById('btn-save-weight').addEventListener('click', () => {
    const val = parseFloat(document.getElementById('weight-input').value);
    if (!val || val < 30 || val > 300) {
      showToast('Please enter a valid weight (30–300 kg).', 'error');
      return;
    }
    bodyWeight = val;
    localStorage.setItem(LS_WEIGHT, val);
    renderSettings();
    renderHeaderWeight();
    showToast(`✅ Weight saved: ${val} kg`, 'success');
  });

  // Clear data
  document.getElementById('btn-clear-data').addEventListener('click', () => {
    if (confirm('Delete ALL activity data? This cannot be undone.')) {
      activities = [];
      saveActivities();
      showToast('All activity data cleared.', 'error');
      renderSettings();
    }
  });

  // History filter buttons
  document.querySelectorAll('#history-filters button').forEach(btn => {
    btn.addEventListener('click', () => {
      currentFilter = btn.dataset.filter;
      document.querySelectorAll('#history-filters button').forEach(b => {
        b.style.borderColor = '';
        b.style.color = '';
      });
      btn.style.borderColor = 'var(--accent)';
      btn.style.color = 'var(--accent)';
      renderHistory();
    });
  });

  // ── Init ───────────────────────────────────────────────────
  renderDashboard();
  renderHeaderWeight();

  // Show GPS card if Running is default
  if (exerciseSelect.value === 'Running') {
    document.getElementById('gps-card').classList.add('visible');
    document.getElementById('fivemin-section').classList.add('visible');
  }
});
