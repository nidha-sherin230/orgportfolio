/**
 * CareSync Medicine Tracker & Reminder
 * Core Application Logic (script.js)
 */

// ==================== STATE MANAGEMENT ====================
let state = {
  profiles: [],
  activeProfileId: null,
  medicines: [],
  logs: [],
  settings: {
    darkMode: false,
    voiceReminder: true,
    systemNotifications: false
  }
};

// Global variables for UI tracking
let selectedCalendarDate = new Date();
let currentCalendarViewDate = new Date(); // Month/Year display
let currentFilter = 'today';
let searchQuery = '';
let deleteTargetId = null;
let lastTriggeredReminders = new Set(); // Keep track of triggered warnings to avoid repeating within same minute

// DOM Elements
const elements = {
  body: document.body,
  profileBtn: document.getElementById('profileBtn'),
  currentProfileName: document.getElementById('currentProfileName'),
  profileDropdown: document.getElementById('profileDropdown'),
  profileList: document.getElementById('profileList'),
  addNewProfileBtn: document.getElementById('addNewProfileBtn'),
  themeToggle: document.getElementById('themeToggle'),
  userGreeting: document.getElementById('userGreeting'),
  heroSubtitle: document.getElementById('heroSubtitle'),
  progressFraction: document.getElementById('progressFraction'),
  progressPercentage: document.getElementById('progressPercentage'),
  progressBarFill: document.getElementById('progressBarFill'),
  
  // Stats
  statTotalMeds: document.getElementById('statTotalMeds'),
  statTodayMeds: document.getElementById('statTodayMeds'),
  statTakenToday: document.getElementById('statTakenToday'),
  statMissedToday: document.getElementById('statMissedToday'),
  
  // Timeline
  timelineDateHeader: document.getElementById('timelineDateHeader'),
  addMedicineBtn: document.getElementById('addMedicineBtn'),
  searchInput: document.getElementById('searchInput'),
  filterTabs: document.querySelectorAll('.filter-tab'),
  timelineContainer: document.getElementById('timelineContainer'),
  
  // Calendar
  prevMonthBtn: document.getElementById('prevMonth'),
  nextMonthBtn: document.getElementById('nextMonth'),
  calendarMonthYear: document.getElementById('calendarMonthYear'),
  calendarDays: document.getElementById('calendarDays'),
  
  // Stock Tracker
  refillStockBtn: document.getElementById('refillStockBtn'),
  stockListContainer: document.getElementById('stockListContainer'),
  
  // Preferences
  systemNotifToggle: document.getElementById('systemNotifToggle'),
  notifStatusText: document.getElementById('notifStatusText'),
  voiceReminderToggle: document.getElementById('voiceReminderToggle'),
  
  // Backup / Export
  exportPdfBtn: document.getElementById('exportPdfBtn'),
  exportJsonBtn: document.getElementById('exportJsonBtn'),
  importJsonBtnTrigger: document.getElementById('importJsonBtnTrigger'),
  importJsonFileInput: document.getElementById('importJsonFileInput'),
  
  // Modals
  medicineModal: document.getElementById('medicineModal'),
  medicineForm: document.getElementById('medicineForm'),
  modalTitle: document.getElementById('modalTitle'),
  customFreqGroup: document.getElementById('customFreqGroup'),
  deleteConfirmModal: document.getElementById('deleteConfirmModal'),
  confirmDeleteBtn: document.getElementById('confirmDeleteBtn'),
  deleteTargetName: document.getElementById('deleteTargetName'),
  profileModal: document.getElementById('profileModal'),
  profileForm: document.getElementById('profileForm'),
  refillStockModal: document.getElementById('refillStockModal'),
  refillListContainer: document.getElementById('refillListContainer'),
  saveRefillBtn: document.getElementById('saveRefillBtn'),
  
  // Toast
  toastContainer: document.getElementById('toastContainer'),
  reminderSound: document.getElementById('reminderSound')
};

// ==================== LOCAL STORAGE PERSISTENCE ====================
function loadState() {
  try {
    const localProfiles = localStorage.getItem('cs_profiles');
    const localActiveProfileId = localStorage.getItem('cs_active_profile_id');
    const localMedicines = localStorage.getItem('cs_medicines');
    const localLogs = localStorage.getItem('cs_logs');
    const localSettings = localStorage.getItem('cs_settings');

    if (localProfiles) state.profiles = JSON.parse(localProfiles);
    if (localMedicines) state.medicines = JSON.parse(localMedicines);
    if (localLogs) state.logs = JSON.parse(localLogs);
    if (localSettings) state.settings = { ...state.settings, ...JSON.parse(localSettings) };

    // Setup default profile if none exists
    if (state.profiles.length === 0) {
      const defaultProfile = { id: 'p_' + Date.now(), name: 'Primary Patient' };
      state.profiles.push(defaultProfile);
      state.activeProfileId = defaultProfile.id;
    } else {
      state.activeProfileId = localActiveProfileId || state.profiles[0].id;
    }

    saveState();
    applySettings();
  } catch (error) {
    console.error('Error loading localStorage state:', error);
    showToast('Load Error', 'Failed to retrieve saved data. Starting fresh.', 'error');
  }
}

function saveState() {
  localStorage.setItem('cs_profiles', JSON.stringify(state.profiles));
  localStorage.setItem('cs_active_profile_id', state.activeProfileId);
  localStorage.setItem('cs_medicines', JSON.stringify(state.medicines));
  localStorage.setItem('cs_logs', JSON.stringify(state.logs));
  localStorage.setItem('cs_settings', JSON.stringify(state.settings));
}

function applySettings() {
  // Dark Mode
  if (state.settings.darkMode) {
    elements.body.classList.add('dark-mode');
    elements.themeToggle.innerHTML = '<i class="fa-solid fa-sun"></i>';
  } else {
    elements.body.classList.remove('dark-mode');
    elements.themeToggle.innerHTML = '<i class="fa-solid fa-moon"></i>';
  }

  // Toggles
  elements.systemNotifToggle.checked = state.settings.systemNotifications;
  elements.voiceReminderToggle.checked = state.settings.voiceReminder;

  // Check Notification API permission
  if ('Notification' in window) {
    if (Notification.permission === 'granted') {
      elements.notifStatusText.textContent = 'Enabled';
    } else if (Notification.permission === 'denied') {
      elements.notifStatusText.textContent = 'Blocked by Browser';
      elements.systemNotifToggle.checked = false;
      state.settings.systemNotifications = false;
    } else {
      elements.notifStatusText.textContent = 'Permission Required';
    }
  } else {
    elements.notifStatusText.textContent = 'Not Supported';
    elements.systemNotifToggle.disabled = true;
  }
}

// ==================== DATE UTILITIES ====================
function formatDateString(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function parseDateOnly(dateStr) {
  const parts = dateStr.split('-');
  // Use local timezone rather than UTC to construct correct date
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

/**
 * Validates if a medicine is scheduled to be taken on a specific date
 */
function isMedicineScheduledOnDate(medicine, targetDate) {
  const start = parseDateOnly(medicine.startDate);
  const target = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
  
  // Cannot be scheduled before the start date
  if (target < start) return false;
  
  if (medicine.frequency === 'Daily') {
    return true;
  } else if (medicine.frequency === 'Weekly') {
    // Matches the same day of the week
    return target.getDay() === start.getDay();
  } else if (medicine.frequency === 'Custom') {
    const diffTime = target.getTime() - start.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    const interval = parseInt(medicine.customInterval) || 2;
    return diffDays % interval === 0;
  }
  return false;
}

// ==================== CORE CALCULATIONS (STATS & PROGRESS) ====================
function updateDashboardData() {
  const profileMeds = state.medicines.filter(m => m.profileId === state.activeProfileId);
  const todayStr = formatDateString(selectedCalendarDate);
  const activeTodayMeds = profileMeds.filter(m => isMedicineScheduledOnDate(m, selectedCalendarDate));
  
  // Calculate Taken / Missed for the selected date
  let takenCount = 0;
  let missedCount = 0;
  
  activeTodayMeds.forEach(med => {
    const log = state.logs.find(l => l.medId === med.id && l.date === todayStr && l.profileId === state.activeProfileId);
    if (log) {
      if (log.status === 'taken') takenCount++;
      else if (log.status === 'missed') missedCount++;
    }
  });

  // Calculate stats for "Today" specifically for stats cards (independent of calendar selections)
  const realToday = new Date();
  const realTodayStr = formatDateString(realToday);
  const realTodayMeds = profileMeds.filter(m => isMedicineScheduledOnDate(m, realToday));
  
  let realTakenCount = 0;
  let realMissedCount = 0;
  realTodayMeds.forEach(med => {
    const log = state.logs.find(l => l.medId === med.id && l.date === realTodayStr && l.profileId === state.activeProfileId);
    if (log) {
      if (log.status === 'taken') realTakenCount++;
      else if (log.status === 'missed') realMissedCount++;
    }
  });

  // Populate Dashboard Stats Cards
  elements.statTotalMeds.textContent = profileMeds.length;
  elements.statTodayMeds.textContent = realTodayMeds.length;
  elements.statTakenToday.textContent = realTakenCount;
  elements.statMissedToday.textContent = realMissedCount;

  // Update Greeting
  const activeProfile = state.profiles.find(p => p.id === state.activeProfileId);
  const hour = new Date().getHours();
  let greetingWord = 'Good Day';
  if (hour < 12) greetingWord = 'Good Morning';
  else if (hour < 17) greetingWord = 'Good Afternoon';
  else greetingWord = 'Good Evening';
  
  elements.userGreeting.textContent = `${greetingWord}, ${activeProfile ? activeProfile.name : 'Guest'}`;
  
  // Update completion widget (based on SELECTED date in schedule view)
  const isSelectedToday = todayStr === formatDateString(new Date());
  elements.heroSubtitle.textContent = isSelectedToday 
    ? "Keep your health synced. Here's your schedule for today."
    : `Viewing schedule for selected date: ${selectedCalendarDate.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}`;

  const totalCount = activeTodayMeds.length;
  elements.progressFraction.textContent = `${takenCount} of ${totalCount} taken`;
  
  const completionPercentage = totalCount > 0 ? Math.round((takenCount / totalCount) * 100) : 0;
  elements.progressPercentage.textContent = `${completionPercentage}%`;
  elements.progressBarFill.style.width = `${completionPercentage}%`;
}

// ==================== TOAST MESSAGES ====================
function showToast(title, message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let iconClass = 'fa-circle-info';
  if (type === 'success') iconClass = 'fa-circle-check';
  else if (type === 'warning') iconClass = 'fa-triangle-exclamation';
  else if (type === 'error') iconClass = 'fa-circle-xmark';

  toast.innerHTML = `
    <div class="toast-icon"><i class="fa-solid ${iconClass}"></i></div>
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      <div class="toast-message">${message}</div>
    </div>
  `;

  elements.toastContainer.appendChild(toast);

  // Automatically remove toast after CSS animation ends (3s total)
  setTimeout(() => {
    toast.remove();
  }, 3000);
}

// ==================== RENDERING COMPONENT - TIMELINE ====================
function renderTimeline() {
  elements.timelineContainer.innerHTML = '';
  
  const profileMeds = state.medicines.filter(m => m.profileId === state.activeProfileId);
  const targetDateStr = formatDateString(selectedCalendarDate);
  
  // Filter medicines based on selected filters
  let filteredMeds = profileMeds;

  // Step 1: Filter by search input name
  if (searchQuery.trim() !== '') {
    filteredMeds = filteredMeds.filter(m => m.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }

  // Step 2: Apply main schedule categorization rules
  if (currentFilter === 'today') {
    filteredMeds = filteredMeds.filter(m => isMedicineScheduledOnDate(m, selectedCalendarDate));
  } else if (currentFilter === 'upcoming') {
    // Show medicines scheduled for future dates (next 7 days)
    const futureMeds = [];
    for (let i = 1; i <= 7; i++) {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + i);
      const medsForDay = profileMeds.filter(m => isMedicineScheduledOnDate(m, futureDate));
      
      medsForDay.forEach(med => {
        if (!futureMeds.some(fm => fm.med.id === med.id && formatDateString(fm.date) === formatDateString(futureDate))) {
          futureMeds.push({ med, date: futureDate });
        }
      });
    }
    
    // Custom timeline rendering for upcoming
    renderUpcomingTimeline(futureMeds);
    return;
  } else if (currentFilter === 'taken') {
    // Scheduled today AND taken
    filteredMeds = filteredMeds.filter(m => {
      const scheduled = isMedicineScheduledOnDate(m, selectedCalendarDate);
      const log = state.logs.find(l => l.medId === m.id && l.date === targetDateStr && l.profileId === state.activeProfileId);
      return scheduled && log && log.status === 'taken';
    });
  } else if (currentFilter === 'missed') {
    // Scheduled today AND missed
    filteredMeds = filteredMeds.filter(m => {
      const scheduled = isMedicineScheduledOnDate(m, selectedCalendarDate);
      const log = state.logs.find(l => l.medId === m.id && l.date === targetDateStr && l.profileId === state.activeProfileId);
      return scheduled && log && log.status === 'missed';
    });
  }
  // If 'all', we render all profile medicines

  if (filteredMeds.length === 0) {
    renderEmptyState();
    return;
  }

  // Sort chronologically by schedule time
  filteredMeds.sort((a, b) => a.time.localeCompare(b.time));

  // Render cards
  filteredMeds.forEach(med => {
    const log = state.logs.find(l => l.medId === med.id && l.date === targetDateStr && l.profileId === state.activeProfileId);
    const status = log ? log.status : 'pending';
    
    // Choose icon base styling
    let typeIcon = 'fa-tablets';
    let typeClass = 'type-tablet';
    if (med.type === 'Capsule') { typeIcon = 'fa-capsules'; typeClass = 'type-capsule'; }
    else if (med.type === 'Syrup') { typeIcon = 'fa-prescription-bottle-medical'; typeClass = 'type-syrup'; }
    else if (med.type === 'Injection') { typeIcon = 'fa-syringe'; typeClass = 'type-injection'; }
    else if (med.type === 'Drops') { typeIcon = 'fa-droplet'; typeClass = 'type-drops'; }

    const card = document.createElement('div');
    card.className = `med-card status-${status}`;
    card.dataset.id = med.id;

    let stockText = '';
    let isLowStock = false;
    if (med.currentStock !== undefined && med.currentStock !== null && med.currentStock !== '') {
      const stock = parseInt(med.currentStock);
      const threshold = parseInt(med.stockThreshold) || 0;
      isLowStock = stock <= threshold;
      stockText = `<span class="meta-badge ${isLowStock ? 'stock-badge low' : ''}"><i class="fa-solid fa-box-archive"></i> Stock: ${stock} left</span>`;
    }

    card.innerHTML = `
      <div class="med-card-main">
        <div class="med-info-block">
          <div class="med-type-icon" style="background-color: var(--${typeClass})">
            <i class="fa-solid ${typeIcon}"></i>
          </div>
          <div class="med-details">
            <h4>${escapeHTML(med.name)}</h4>
            <div class="med-meta">
              <span class="meta-item"><i class="fa-regular fa-clock"></i> ${formatTime12h(med.time)}</span>
              <span class="meta-item"><i class="fa-solid fa-capsules"></i> ${escapeHTML(med.dosage)}</span>
              <span class="meta-item meta-badge">${med.frequency}</span>
              ${stockText}
            </div>
          </div>
        </div>

        <div class="med-actions">
          <!-- Toggle taken status -->
          <button class="btn-action taken-btn ${status === 'taken' ? 'active' : ''}" title="Mark as Taken" onclick="toggleMedStatus('${med.id}', 'taken')">
            <i class="fa-solid fa-check"></i>
          </button>
          <button class="btn-action missed-btn ${status === 'missed' ? 'active' : ''}" title="Mark as Missed" onclick="toggleMedStatus('${med.id}', 'missed')">
            <i class="fa-solid fa-xmark"></i>
          </button>
          
          <button class="btn-action" title="View details/notes" onclick="toggleCardExpand('${med.id}')">
            <i class="fa-solid fa-circle-info"></i>
          </button>
          <button class="btn-action" title="Edit reminder" onclick="openEditMedicineModal('${med.id}')">
            <i class="fa-solid fa-pen-to-square"></i>
          </button>
          <button class="btn-action" title="Delete reminder" onclick="triggerDeleteMedicine('${med.id}')">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>

      <div class="card-expand-area hidden" id="expand-${med.id}">
        <div><strong>Directions / Notes:</strong> ${escapeHTML(med.notes) || 'No instructions provided.'}</div>
        <div><strong>Started On:</strong> ${med.startDate}</div>
        ${med.frequency === 'Custom' ? `<div><strong>Interval:</strong> Every ${med.customInterval} days</div>` : ''}
      </div>
    `;
    
    elements.timelineContainer.appendChild(card);
  });
}

function renderUpcomingTimeline(futureMeds) {
  if (futureMeds.length === 0) {
    renderEmptyState("No upcoming reminders for the next 7 days.");
    return;
  }

  // Sort by date then by time
  futureMeds.sort((a, b) => {
    const dateDiff = a.date - b.date;
    if (dateDiff !== 0) return dateDiff;
    return a.med.time.localeCompare(b.med.time);
  });

  futureMeds.forEach(item => {
    const med = item.med;
    const dateStr = formatDateString(item.date);
    
    let typeIcon = 'fa-tablets';
    let typeClass = 'type-tablet';
    if (med.type === 'Capsule') { typeIcon = 'fa-capsules'; typeClass = 'type-capsule'; }
    else if (med.type === 'Syrup') { typeIcon = 'fa-prescription-bottle-medical'; typeClass = 'type-syrup'; }
    else if (med.type === 'Injection') { typeIcon = 'fa-syringe'; typeClass = 'type-injection'; }
    else if (med.type === 'Drops') { typeIcon = 'fa-droplet'; typeClass = 'type-drops'; }

    const formattedDate = item.date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

    const card = document.createElement('div');
    card.className = `med-card status-pending`;
    
    card.innerHTML = `
      <div class="med-card-main">
        <div class="med-info-block">
          <div class="med-type-icon" style="background-color: var(--${typeClass})">
            <i class="fa-solid ${typeIcon}"></i>
          </div>
          <div class="med-details">
            <h4>${escapeHTML(med.name)}</h4>
            <div class="med-meta">
              <span class="meta-item"><i class="fa-regular fa-calendar"></i> ${formattedDate}</span>
              <span class="meta-item"><i class="fa-regular fa-clock"></i> ${formatTime12h(med.time)}</span>
              <span class="meta-item"><i class="fa-solid fa-capsules"></i> ${escapeHTML(med.dosage)}</span>
            </div>
          </div>
        </div>
        <div class="med-actions">
          <button class="btn-action" title="Jump to Calendar Date" onclick="selectCalendarDateAction('${dateStr}')">
            <i class="fa-solid fa-arrow-right-to-bracket"></i>
          </button>
        </div>
      </div>
    `;

    elements.timelineContainer.appendChild(card);
  });
}

function renderEmptyState(message = "No medicine reminders match this view.") {
  elements.timelineContainer.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon"><i class="fa-solid fa-face-smile-beam"></i></div>
      <h3>Looking Clean!</h3>
      <p>${message}</p>
    </div>
  `;
}

// Inline JS Click Triggers
window.toggleCardExpand = function(medId) {
  const el = document.getElementById(`expand-${medId}`);
  if (el) el.classList.toggle('hidden');
};

window.selectCalendarDateAction = function(dateStr) {
  selectedCalendarDate = parseDateOnly(dateStr);
  currentCalendarViewDate = new Date(selectedCalendarDate);
  currentFilter = 'today';
  
  // Update Filter Tabs active style
  elements.filterTabs.forEach(t => {
    if (t.dataset.filter === 'today') t.classList.add('active');
    else t.classList.remove('active');
  });

  updateDashboardData();
  renderTimeline();
  renderCalendar();
};

window.toggleMedStatus = function(medId, status) {
  const targetDateStr = formatDateString(selectedCalendarDate);
  const logIndex = state.logs.findIndex(l => l.medId === medId && l.date === targetDateStr && l.profileId === state.activeProfileId);
  const med = state.medicines.find(m => m.id === medId);
  
  if (logIndex > -1) {
    const existingLog = state.logs[logIndex];
    if (existingLog.status === status) {
      // Toggle off completely
      state.logs.splice(logIndex, 1);
      // Refund Stock
      adjustStock(med, 1); 
    } else {
      // Switch status
      const oldStatus = existingLog.status;
      existingLog.status = status;
      existingLog.timestamp = Date.now();
      
      // Stock adjustments
      if (oldStatus === 'taken' && status === 'missed') {
        adjustStock(med, 1); // Refund since missed doesn't consume stock
      } else if (oldStatus === 'missed' && status === 'taken') {
        adjustStock(med, -1); // Consume stock
      }
    }
  } else {
    // Create new log
    state.logs.push({
      id: 'l_' + Date.now(),
      medId: medId,
      date: targetDateStr,
      status: status,
      timestamp: Date.now(),
      profileId: state.activeProfileId
    });
    
    // Consume stock if taken
    if (status === 'taken') {
      adjustStock(med, -1);
    }
  }

  saveState();
  updateDashboardData();
  renderTimeline();
  renderStockWidget();
  renderCalendar();
};

function adjustStock(medicine, amount) {
  if (!medicine) return;
  if (medicine.currentStock !== undefined && medicine.currentStock !== null && medicine.currentStock !== '') {
    let stock = parseInt(medicine.currentStock) + amount;
    medicine.currentStock = Math.max(0, stock);
    
    // Check low stock alarm triggers
    const threshold = parseInt(medicine.stockThreshold) || 0;
    if (amount < 0 && medicine.currentStock <= threshold) {
      showToast('Low Stock Alert', `${medicine.name} has only ${medicine.currentStock} left!`, 'warning');
    }
  }
}

// ==================== RENDERING COMPONENT - CALENDAR ====================
function renderCalendar() {
  elements.calendarDays.innerHTML = '';
  
  const year = currentCalendarViewDate.getFullYear();
  const month = currentCalendarViewDate.getMonth();
  
  // Set month label header
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  elements.calendarMonthYear.textContent = `${monthNames[month]} ${year}`;
  
  const firstDayIndex = new Date(year, month, 1).getDay();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const prevLastDay = new Date(year, month, 0).getDate();

  const profileMeds = state.medicines.filter(m => m.profileId === state.activeProfileId);
  const todayStr = formatDateString(new Date());
  const selectedStr = formatDateString(selectedCalendarDate);

  // Render empty padding days from previous month
  for (let x = firstDayIndex; x > 0; x--) {
    const dayDiv = document.createElement('div');
    dayDiv.className = 'calendar-day empty';
    elements.calendarDays.appendChild(dayDiv);
  }

  // Render actual month days
  for (let i = 1; i <= lastDay; i++) {
    const dayDate = new Date(year, month, i);
    const dayStr = formatDateString(dayDate);
    
    const dayDiv = document.createElement('div');
    dayDiv.className = 'calendar-day';
    dayDiv.textContent = i;
    
    // Mark today
    if (dayStr === todayStr) {
      dayDiv.classList.add('today');
    }
    
    // Mark selected
    if (dayStr === selectedStr) {
      dayDiv.classList.add('selected');
    }
    
    // Mark active medications check
    const hasMed = profileMeds.some(m => isMedicineScheduledOnDate(m, dayDate));
    if (hasMed) {
      dayDiv.classList.add('has-medicine');
    }
    
    // Click Day handler
    dayDiv.addEventListener('click', () => {
      selectedCalendarDate = dayDate;
      updateDashboardData();
      renderTimeline();
      renderCalendar();
    });
    
    elements.calendarDays.appendChild(dayDiv);
  }
}

// ==================== RENDERING COMPONENT - STOCK TRACKER ====================
function renderStockWidget() {
  elements.stockListContainer.innerHTML = '';
  
  const profileMeds = state.medicines.filter(m => 
    m.profileId === state.activeProfileId && 
    m.currentStock !== undefined && 
    m.currentStock !== null && 
    m.currentStock !== ''
  );

  if (profileMeds.length === 0) {
    elements.stockListContainer.innerHTML = `<p class="toggle-desc text-center">No medicines set up with stock tracking.</p>`;
    return;
  }

  profileMeds.forEach(med => {
    const stock = parseInt(med.currentStock);
    const threshold = parseInt(med.stockThreshold) || 0;
    const isLow = stock <= threshold;
    const isNone = stock === 0;

    let badgeClass = 'normal';
    let badgeText = `${stock} left`;
    
    if (isNone) {
      badgeClass = 'none';
      badgeText = 'Empty';
    } else if (isLow) {
      badgeClass = 'low';
      badgeText = `${stock} left (Low)`;
    }

    const item = document.createElement('div');
    item.className = 'stock-item';
    item.innerHTML = `
      <div class="stock-item-info">
        <h4>${escapeHTML(med.name)}</h4>
        <p>Limit threshold: ${threshold} • ${med.dosage}</p>
      </div>
      <span class="stock-badge ${badgeClass}">${badgeText}</span>
    `;

    elements.stockListContainer.appendChild(item);
  });
}

// ==================== SCHEDULER & ALARM ALERTS ====================
function startAlertScheduler() {
  // Check clock time triggers every 30 seconds
  setInterval(() => {
    const now = new Date();
    const currentDayStr = formatDateString(now);
    
    // Convert now time to HH:MM key format
    const currentHour = String(now.getHours()).padStart(2, '0');
    const currentMin = String(now.getMinutes()).padStart(2, '0');
    const timeStr = `${currentHour}:${currentMin}`;
    
    // Filter medicines active today for current active profile
    const todayMeds = state.medicines.filter(m => 
      m.profileId === state.activeProfileId && 
      isMedicineScheduledOnDate(m, now) && 
      m.time === timeStr
    );

    todayMeds.forEach(med => {
      // Generate unique alarm key to avoid retriggering within same minute
      const alarmKey = `${med.id}:${currentDayStr}:${timeStr}`;
      
      if (!lastTriggeredReminders.has(alarmKey)) {
        lastTriggeredReminders.add(alarmKey);
        
        // Trigger alerts
        triggerReminderAlarms(med);
      }
    });
    
    // Clear old elements from triggering records (older than 1 hour) to keep memory clean
    if (now.getMinutes() === 0 && now.getSeconds() < 30) {
      lastTriggeredReminders.clear();
    }
  }, 30000);
}

function triggerReminderAlarms(med) {
  // 1. Audio sound beep
  elements.reminderSound.currentTime = 0;
  elements.reminderSound.play().catch(e => console.log('Sound playback blocked by browser sandbox:', e));

  // 2. Styled toast popup
  showToast('Reminder Alarm', `It's time to take ${med.dosage} of ${med.name}!`, 'info');

  // 3. Desktop Notifications API
  if (state.settings.systemNotifications && 'Notification' in window) {
    if (Notification.permission === 'granted') {
      new Notification(`CareSync Medication Alarm`, {
        body: `It is time to take ${med.dosage} of ${med.name}.`,
        icon: 'https://cdn-icons-png.flaticon.com/512/3004/3004458.png',
        tag: med.id
      });
    }
  }

  // 4. Voice reminder TTS
  if (state.settings.voiceReminder && 'speechSynthesis' in window) {
    const text = `Attention. It is time to take ${med.dosage} of your medicine, ${med.name}.`;
    const utterance = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.speak(utterance);
  }
}

// ==================== PROFILE MANAGEMENT ====================
function renderProfiles() {
  elements.profileList.innerHTML = '';
  
  state.profiles.forEach(profile => {
    const isActive = profile.id === state.activeProfileId;
    const item = document.createElement('li');
    item.className = `profile-item ${isActive ? 'active' : ''}`;
    
    // Let user delete extra profiles, but force at least 1 profile
    const deleteBtnHtml = state.profiles.length > 1 
      ? `<button class="delete-profile-btn" onclick="deleteProfile(event, '${profile.id}')" title="Delete Profile"><i class="fa-solid fa-trash-can"></i></button>`
      : '';
      
    item.innerHTML = `
      <span onclick="switchProfile('${profile.id}')">${escapeHTML(profile.name)}</span>
      ${deleteBtnHtml}
    `;

    elements.profileList.appendChild(item);
  });

  const activeProfile = state.profiles.find(p => p.id === state.activeProfileId);
  elements.currentProfileName.textContent = activeProfile ? activeProfile.name : 'Guest';
}

window.switchProfile = function(profileId) {
  state.activeProfileId = profileId;
  saveState();
  
  // Refresh layout components
  renderProfiles();
  elements.profileDropdown.classList.add('hidden');
  
  selectedCalendarDate = new Date();
  currentCalendarViewDate = new Date();
  
  updateDashboardData();
  renderTimeline();
  renderCalendar();
  renderStockWidget();
  showToast('Profile Switched', `Welcome back to your workspace.`, 'success');
};

window.deleteProfile = function(event, profileId) {
  event.stopPropagation();
  
  if (state.profiles.length <= 1) {
    showToast('Delete Blocked', 'You must keep at least one active profile.', 'warning');
    return;
  }

  // Remove profile medicines & logs
  state.medicines = state.medicines.filter(m => m.profileId !== profileId);
  state.logs = state.logs.filter(l => l.profileId !== profileId);
  state.profiles = state.profiles.filter(p => p.id !== profileId);

  // Switch if deleted active
  if (state.activeProfileId === profileId) {
    state.activeProfileId = state.profiles[0].id;
  }

  saveState();
  renderProfiles();
  updateDashboardData();
  renderTimeline();
  renderCalendar();
  renderStockWidget();
  showToast('Profile Deleted', 'The profile and its associated logs were deleted.', 'info');
};

// ==================== FORMS AND MODALS HANDLERS ====================
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('hidden');
    // Lock scroll
    document.body.style.overflow = 'hidden';
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('hidden');
    // Restore scroll
    document.body.style.overflow = '';
  }
}

// Reset Medicine Form
function resetMedicineForm() {
  elements.medicineForm.reset();
  document.getElementById('medId').value = '';
  elements.customFreqGroup.classList.add('hidden');
  
  // Clear validation flags
  document.querySelectorAll('.form-group.error').forEach(g => g.classList.remove('error'));
  
  // Set default start date to today
  document.getElementById('medDate').value = formatDateString(new Date());
}

window.openEditMedicineModal = function(medId) {
  const med = state.medicines.find(m => m.id === medId);
  if (!med) return;

  resetMedicineForm();
  
  elements.modalTitle.textContent = 'Edit Medicine Reminder';
  document.getElementById('medId').value = med.id;
  document.getElementById('medName').value = med.name;
  document.getElementById('medType').value = med.type;
  document.getElementById('medDosage').value = med.dosage;
  document.getElementById('medTime').value = med.time;
  document.getElementById('medDate').value = med.startDate;
  document.getElementById('medFrequency').value = med.frequency;
  document.getElementById('medNotes').value = med.notes || '';
  
  if (med.frequency === 'Custom') {
    elements.customFreqGroup.classList.remove('hidden');
    document.getElementById('customIntervalDays').value = med.customInterval || 2;
  }

  document.getElementById('medCurrentStock').value = med.currentStock !== undefined ? med.currentStock : '';
  document.getElementById('medStockAlertThreshold').value = med.stockThreshold !== undefined ? med.stockThreshold : '';

  openModal('medicineModal');
};

window.triggerDeleteMedicine = function(medId) {
  const med = state.medicines.find(m => m.id === medId);
  if (!med) return;
  deleteTargetId = medId;
  elements.deleteTargetName.textContent = med.name;
  openModal('deleteConfirmModal');
};

function handleMedicineFormSubmit(e) {
  e.preventDefault();
  
  // Check Custom UI validation
  let hasErrors = false;
  
  const medId = document.getElementById('medId').value;
  const name = document.getElementById('medName').value.trim();
  const type = document.getElementById('medType').value;
  const dosage = document.getElementById('medDosage').value.trim();
  const time = document.getElementById('medTime').value;
  const startDate = document.getElementById('medDate').value;
  const frequency = document.getElementById('medFrequency').value;
  const customInterval = document.getElementById('customIntervalDays').value;
  const currentStock = document.getElementById('medCurrentStock').value;
  const stockThreshold = document.getElementById('medStockAlertThreshold').value;
  const notes = document.getElementById('medNotes').value.trim();

  // Validate Name
  if (!name) {
    document.getElementById('medName').parentElement.classList.add('error');
    hasErrors = true;
  } else {
    document.getElementById('medName').parentElement.classList.remove('error');
  }

  // Validate Dosage
  if (!dosage) {
    document.getElementById('medDosage').parentElement.classList.add('error');
    hasErrors = true;
  } else {
    document.getElementById('medDosage').parentElement.classList.remove('error');
  }

  // Validate Time
  if (!time) {
    document.getElementById('medTime').parentElement.classList.add('error');
    hasErrors = true;
  } else {
    document.getElementById('medTime').parentElement.classList.remove('error');
  }

  // Validate Date
  if (!startDate) {
    document.getElementById('medDate').parentElement.classList.add('error');
    hasErrors = true;
  } else {
    document.getElementById('medDate').parentElement.classList.remove('error');
  }

  // Validate custom frequency
  if (frequency === 'Custom' && (!customInterval || parseInt(customInterval) < 1)) {
    elements.customFreqGroup.classList.add('error');
    hasErrors = true;
  } else {
    elements.customFreqGroup.classList.remove('error');
  }

  if (hasErrors) return;

  const medData = {
    id: medId || 'm_' + Date.now(),
    name,
    type,
    dosage,
    time,
    startDate,
    frequency,
    customInterval: frequency === 'Custom' ? parseInt(customInterval) : null,
    currentStock: currentStock !== '' ? Math.max(0, parseInt(currentStock)) : null,
    stockThreshold: stockThreshold !== '' ? Math.max(0, parseInt(stockThreshold)) : null,
    notes,
    profileId: state.activeProfileId,
    createdDate: Date.now()
  };

  if (medId) {
    // Update existing medicine
    const index = state.medicines.findIndex(m => m.id === medId);
    if (index > -1) {
      state.medicines[index] = medData;
      showToast('Medicine Updated', `${name} scheduled reminder saved.`, 'success');
    }
  } else {
    // Add new medicine
    state.medicines.push(medData);
    showToast('Medicine Added', `${name} scheduled successfully.`, 'success');
  }

  saveState();
  closeModal('medicineModal');
  updateDashboardData();
  renderTimeline();
  renderCalendar();
  renderStockWidget();
}

function handleProfileFormSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('profileName').value.trim();
  
  if (!name) {
    document.getElementById('profileName').parentElement.classList.add('error');
    return;
  }
  document.getElementById('profileName').parentElement.classList.remove('error');

  const newProfile = {
    id: 'p_' + Date.now(),
    name: name
  };

  state.profiles.push(newProfile);
  state.activeProfileId = newProfile.id;
  
  saveState();
  closeModal('profileModal');
  renderProfiles();
  
  selectedCalendarDate = new Date();
  currentCalendarViewDate = new Date();
  
  updateDashboardData();
  renderTimeline();
  renderCalendar();
  renderStockWidget();
  showToast('Profile Created', `Welcome to CareSync workspace for ${name}.`, 'success');
}

// Manage/Refill Stock Modal Loader
function openRefillStockModal() {
  elements.refillListContainer.innerHTML = '';
  const profileMeds = state.medicines.filter(m => m.profileId === state.activeProfileId);
  
  if (profileMeds.length === 0) {
    elements.refillListContainer.innerHTML = '<p class="text-center subtitle">Please add medicines before managing stock.</p>';
    elements.saveRefillBtn.disabled = true;
    openModal('refillStockModal');
    return;
  }
  
  elements.saveRefillBtn.disabled = false;

  profileMeds.forEach(med => {
    const item = document.createElement('div');
    item.className = 'refill-item';
    
    const stockVal = med.currentStock !== null && med.currentStock !== undefined ? med.currentStock : '';
    const alertVal = med.stockThreshold !== null && med.stockThreshold !== undefined ? med.stockThreshold : '';

    item.innerHTML = `
      <span>${escapeHTML(med.name)} (${escapeHTML(med.dosage)})</span>
      <input type="number" class="refill-stock-input" data-med-id="${med.id}" placeholder="Current Stock" min="0" value="${stockVal}">
      <input type="number" class="refill-alert-input" data-med-id="${med.id}" placeholder="Low Stock Limit" min="0" value="${alertVal}">
    `;
    elements.refillListContainer.appendChild(item);
  });

  openModal('refillStockModal');
}

function saveRefillStock() {
  const stockInputs = elements.refillListContainer.querySelectorAll('.refill-stock-input');
  const alertInputs = elements.refillListContainer.querySelectorAll('.refill-alert-input');
  
  stockInputs.forEach(input => {
    const medId = input.dataset.medId;
    const med = state.medicines.find(m => m.id === medId);
    if (med) {
      const val = input.value;
      med.currentStock = val !== '' ? Math.max(0, parseInt(val)) : null;
    }
  });

  alertInputs.forEach(input => {
    const medId = input.dataset.medId;
    const med = state.medicines.find(m => m.id === medId);
    if (med) {
      const val = input.value;
      med.stockThreshold = val !== '' ? Math.max(0, parseInt(val)) : null;
    }
  });

  saveState();
  closeModal('refillStockModal');
  renderStockWidget();
  renderTimeline();
  showToast('Stock Saved', 'Medication quantities updated successfully.', 'success');
}

// ==================== JSON DATA EXPORT / IMPORT ====================
function exportDataAsJson() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 2));
  const downloadAnchorNode = document.createElement('a');
  downloadAnchorNode.setAttribute("href", dataStr);
  
  const activeProfile = state.profiles.find(p => p.id === state.activeProfileId);
  const nameLabel = activeProfile ? activeProfile.name.toLowerCase().replace(/\s+/g, '_') : 'backup';
  
  downloadAnchorNode.setAttribute("download", `caresync_${nameLabel}_data.json`);
  document.body.appendChild(downloadAnchorNode); // Required for Firefox
  downloadAnchorNode.click();
  downloadAnchorNode.remove();
  showToast('Data Backup', 'JSON data downloaded successfully.', 'info');
}

function handleJsonImport(e) {
  const fileReader = new FileReader();
  const file = e.target.files[0];
  
  if (!file) return;

  fileReader.onload = function(event) {
    try {
      const parsedData = JSON.parse(event.target.result);
      
      // Basic validation checks
      if (parsedData.profiles && parsedData.medicines && parsedData.logs) {
        state.profiles = parsedData.profiles;
        state.medicines = parsedData.medicines;
        state.logs = parsedData.logs;
        if (parsedData.settings) state.settings = { ...state.settings, ...parsedData.settings };
        
        // Match active profiles
        if (state.profiles.length > 0) {
          state.activeProfileId = parsedData.activeProfileId || state.profiles[0].id;
        }

        saveState();
        applySettings();
        renderProfiles();
        
        selectedCalendarDate = new Date();
        currentCalendarViewDate = new Date();
        
        updateDashboardData();
        renderTimeline();
        renderCalendar();
        renderStockWidget();
        
        showToast('Restore Success', 'All local backups synced successfully.', 'success');
      } else {
        showToast('Restore Failed', 'JSON template schema is invalid.', 'error');
      }
    } catch (err) {
      showToast('Restore Failed', 'File is corrupted or not a valid JSON structure.', 'error');
    }
  };
  
  fileReader.readAsText(file);
  
  // Clear input
  elements.importJsonFileInput.value = '';
}

// ==================== SYSTEM ACTIONS & EVENT BINDINGS ====================
function setupEventListeners() {
  // Profile Selector Toggle
  elements.profileBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    elements.profileDropdown.classList.toggle('hidden');
  });

  document.addEventListener('click', () => {
    elements.profileDropdown.classList.add('hidden');
  });

  elements.profileDropdown.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  elements.addNewProfileBtn.addEventListener('click', () => {
    elements.profileDropdown.classList.add('hidden');
    document.getElementById('profileForm').reset();
    document.getElementById('profileName').parentElement.classList.remove('error');
    openModal('profileModal');
  });

  // Theme Toggler
  elements.themeToggle.addEventListener('click', () => {
    state.settings.darkMode = !state.settings.darkMode;
    saveState();
    applySettings();
  });

  // Action Buttons
  elements.addMedicineBtn.addEventListener('click', () => {
    resetMedicineForm();
    elements.modalTitle.textContent = 'Add New Medicine';
    openModal('medicineModal');
  });

  // Frequency Dropdown Condition Group Display
  document.getElementById('medFrequency').addEventListener('change', (e) => {
    if (e.target.value === 'Custom') {
      elements.customFreqGroup.classList.remove('hidden');
    } else {
      elements.customFreqGroup.classList.add('hidden');
    }
  });

  // Modal Closers
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      closeModal(btn.dataset.closeModal);
    });
  });

  // Form Submissions
  elements.medicineForm.addEventListener('submit', handleMedicineFormSubmit);
  elements.profileForm.addEventListener('submit', handleProfileFormSubmit);

  // Deletion confirm triggers
  elements.confirmDeleteBtn.addEventListener('click', () => {
    if (deleteTargetId) {
      // Filter out medication records
      state.medicines = state.medicines.filter(m => m.id !== deleteTargetId);
      // Filter out logs
      state.logs = state.logs.filter(l => l.medId !== deleteTargetId);
      
      saveState();
      closeModal('deleteConfirmModal');
      updateDashboardData();
      renderTimeline();
      renderCalendar();
      renderStockWidget();
      showToast('Medicine Deleted', 'Reminder removed from database.', 'info');
      deleteTargetId = null;
    }
  });

  // Refill Manage Stock events
  elements.refillStockBtn.addEventListener('click', openRefillStockModal);
  elements.saveRefillBtn.addEventListener('click', saveRefillStock);

  // Search Input Handler
  elements.searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    renderTimeline();
  });

  // Filters Switch Tab Handlers
  elements.filterTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      elements.filterTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentFilter = tab.dataset.filter;
      renderTimeline();
    });
  });

  // Calendar Navigate Buttons
  elements.prevMonthBtn.addEventListener('click', () => {
    currentCalendarViewDate.setMonth(currentCalendarViewDate.getMonth() - 1);
    renderCalendar();
  });

  elements.nextMonthBtn.addEventListener('click', () => {
    currentCalendarViewDate.setMonth(currentCalendarViewDate.getMonth() + 1);
    renderCalendar();
  });

  // Sound preferences selectors
  elements.voiceReminderToggle.addEventListener('change', (e) => {
    state.settings.voiceReminder = e.target.checked;
    saveState();
    showToast('Preferences Saved', `Voice reminders ${state.settings.voiceReminder ? 'enabled' : 'disabled'}.`, 'info');
  });

  elements.systemNotifToggle.addEventListener('change', (e) => {
    if (e.target.checked) {
      if (!('Notification' in window)) {
        showToast('Error', 'Notifications not supported in this browser.', 'error');
        elements.systemNotifToggle.checked = false;
        return;
      }
      
      Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
          state.settings.systemNotifications = true;
          elements.notifStatusText.textContent = 'Enabled';
          showToast('Notifications Enabled', 'You will receive alarms directly on your device desktop.', 'success');
        } else {
          state.settings.systemNotifications = false;
          elements.systemNotifToggle.checked = false;
          elements.notifStatusText.textContent = 'Blocked by User';
          showToast('Notifications Blocked', 'Please enable browser permissions manually.', 'warning');
        }
        saveState();
      });
    } else {
      state.settings.systemNotifications = false;
      elements.notifStatusText.textContent = 'Disabled';
      saveState();
      showToast('Notifications Disabled', 'System alarm push alerts are disabled.', 'info');
    }
  });

  // PDF schedule generation trigger
  elements.exportPdfBtn.addEventListener('click', () => {
    // Inject printable report date attribute metadata
    const todayStr = new Date().toLocaleString();
    document.body.setAttribute('data-print-date', todayStr);
    window.print();
  });

  // JSON files tools triggers
  elements.exportJsonBtn.addEventListener('click', exportDataAsJson);
  elements.importJsonBtnTrigger.addEventListener('click', () => {
    elements.importJsonFileInput.click();
  });
  elements.importJsonFileInput.addEventListener('change', handleJsonImport);
}

// ==================== HELPER FORMATTING FUNCTIONS ====================
function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

function formatTime12h(time24h) {
  if (!time24h) return '';
  const parts = time24h.split(':');
  let hours = parseInt(parts[0]);
  const minutes = parts[1];
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; // the hour '0' should be '12'
  return `${hours}:${minutes} ${ampm}`;
}

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', () => {
  loadState();
  setupEventListeners();
  renderProfiles();
  updateDashboardData();
  renderTimeline();
  renderCalendar();
  renderStockWidget();
  startAlertScheduler();
  
  // Clean initialization log
  console.log('CareSync offline database and alarms scheduler listening.');
});
