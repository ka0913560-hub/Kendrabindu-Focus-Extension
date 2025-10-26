chrome.runtime.onInstalled.addListener(function() {
    console.log('Content Blocker extension installed');
    updateBlockingRules();
    // Initialize screen-time and reminder alarms when the extension is installed
    initializeScreenTimeTracking();
    // Initialize Focus Tracking & Bindu Visualization
    initializeFocusTracking();
});

// Also initialize on startup (service worker may be restarted)
chrome.runtime.onStartup.addListener(function() {
    initializeScreenTimeTracking();
    initializeFocusTracking();
});

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === 'updateRules') {
        updateBlockingRules();
    }
    if (request.action === 'updateReminderInterval') {
        updateReminderAlarm(request.interval);
        sendResponse({ success: true });
    }
    return true; // Keep channel open for async response
});

async function updateBlockingRules() {
    try {
        // Get blocked URLs and focus mode state from storage
        const result = await chrome.storage.sync.get(['blockedUrls', 'focusMode']);
        const blockedUrls = result.blockedUrls || [];
        const focusMode = result.focusMode !== undefined ? result.focusMode : true; // default to true
        
        // Clear existing rules
        const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
        const ruleIdsToRemove = existingRules.map(rule => rule.id);
        
        if (ruleIdsToRemove.length > 0) {
            await chrome.declarativeNetRequest.updateDynamicRules({
                removeRuleIds: ruleIdsToRemove
            });
        }
        
        // If Focus Mode is disabled, don't add any blocking rules (pause blocking)
        if (!focusMode) {
            console.log('Focus Mode is OFF - blocking paused');
            return;
        }
        
        // Create new rules for blocked URLs (only if Focus Mode is ON)
        const newRules = blockedUrls.map((url, index) => ({
            id: index + 1,
            priority: 1,
            action: {
                type: 'redirect',
                redirect: {
                    extensionPath: '/blocked.html'
                }
            },
            condition: {
                urlFilter: `*://*${url}/*`,
                resourceTypes: ['main_frame']
            }
        }));
        
        if (newRules.length > 0) {
            await chrome.declarativeNetRequest.updateDynamicRules({
                addRules: newRules
            });
        }
        
        console.log(`Updated blocking rules for ${blockedUrls.length} URLs (Focus Mode: ${focusMode ? 'ON' : 'OFF'})`);
    } catch (error) {
        console.error('Error updating blocking rules:', error);
    }
}

// -----------------------------
// Screen-Time Tracker & Reminders
// -----------------------------

// Storage keys used:
// - screenTimeSeconds (number): total seconds of browsing today
// - lastTick (number): timestamp (ms) of last increment to avoid double-count

const SCREEN_TIME_KEY = 'screenTimeSeconds';
const LAST_TICK_KEY = 'lastTick';

const ALARM_TICK = 'screen_time_tick'; // every 1 minute
const ALARM_REMINDER = 'focus_reminder'; // every 10 minutes
const ALARM_DAILY_RESET = 'daily_reset';

function initializeScreenTimeTracking() {
    // Ensure storage keys exist
    chrome.storage.local.get([SCREEN_TIME_KEY, LAST_TICK_KEY], (res) => {
        if (res[SCREEN_TIME_KEY] == null) {
            chrome.storage.local.set({ [SCREEN_TIME_KEY]: 0 });
        }
        if (res[LAST_TICK_KEY] == null) {
            chrome.storage.local.set({ [LAST_TICK_KEY]: Date.now() });
        }
    });

    // Create recurring alarms
    // 1 minute tick for screen time accumulation
    chrome.alarms.create(ALARM_TICK, { periodInMinutes: 1 });

    // Focus reminder with user's chosen interval
    createReminderAlarm();

    // Schedule daily reset at next midnight
    scheduleMidnightResetAlarm();
}

// Create reminder alarm with saved interval
function createReminderAlarm() {
    chrome.storage.sync.get(['reminderInterval'], (result) => {
        const interval = result.reminderInterval || 10;
        chrome.alarms.create(ALARM_REMINDER, { periodInMinutes: interval });
        console.log('Reminder alarm set to', interval, 'minutes');
    });
}

// Update reminder alarm when user changes interval
function updateReminderAlarm(newInterval) {
    chrome.alarms.clear(ALARM_REMINDER, (wasCleared) => {
        console.log('Old reminder cleared:', wasCleared);
        chrome.alarms.create(ALARM_REMINDER, { periodInMinutes: newInterval });
        console.log('New reminder alarm:', newInterval, 'minutes');
    });
}

function scheduleMidnightResetAlarm() {
    const now = new Date();
    const next = new Date(now);
    next.setHours(24, 0, 5, 0); // a few seconds after midnight
    const when = next.getTime();
    // Create alarm that fires once at next midnight, then we'll recreate it for next day
    chrome.alarms.create(ALARM_DAILY_RESET, { when });
}

// Helper: check if Focus Mode is enabled in storage (common keys: 'focusMode' or 'focus_mode')
function isFocusModeEnabled(callback) {
    chrome.storage.sync.get(['focusMode', 'focus_mode'], (res) => {
        const enabled = res.focusMode !== undefined ? res.focusMode : (!!res.focus_mode);
        callback(enabled);
    });
}

// Helper: best-effort check whether browser window is active/focused.
// If windows API isn't available (no permission), assume active and count time.
function isBrowserActive(callback) {
    try {
        if (!chrome.windows || !chrome.windows.getAll) {
            // No windows permission, assume active
            callback(true);
            return;
        }

        chrome.windows.getAll({ populate: false }, (wins) => {
            if (chrome.runtime.lastError) {
                // API error, assume active to keep counting
                callback(true);
                return;
            }
            // Consider active if at least one window is focused
            const active = wins && wins.length > 0 && wins.some(w => w.focused === true);
            callback(active);
        });
    } catch (e) {
        // Exception, assume active
        callback(true);
    }
}

// Alarm handler
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (!alarm || !alarm.name) return;

    if (alarm.name === ALARM_TICK) {
        // Per-minute tick: add 60 seconds if browser is active
        chrome.storage.local.get([SCREEN_TIME_KEY, LAST_TICK_KEY], (res) => {
            const prevSeconds = Number(res[SCREEN_TIME_KEY] || 0);
            const now = Date.now();

            // Only count time if browser appears active
            isBrowserActive((active) => {
                if (active) {
                    // Add 60 seconds (1 minute) for this tick
                    const updated = prevSeconds + 60;
                    chrome.storage.local.set({
                        [SCREEN_TIME_KEY]: updated,
                        [LAST_TICK_KEY]: now
                    });
                } else {
                    // Browser not active, just update lastTick without adding time
                    chrome.storage.local.set({ [LAST_TICK_KEY]: now });
                }
            });
        });
    }

    if (alarm.name === ALARM_REMINDER) {
        // Fire focus reminder based on user's interval
        isFocusModeEnabled((enabled) => {
            if (enabled) return; // pause reminders when Focus Mode is ON

            // Only show reminder if browser active
            isBrowserActive((active) => {
                if (!active) return;

                // Get interval for message
                chrome.storage.sync.get(['reminderInterval'], (result) => {
                    const interval = result.reminderInterval || 10;
                    
                    // Show notification if notifications API available
                    try {
                        if (chrome.notifications && chrome.notifications.create) {
                            const notifOptions = {
                                type: 'basic',
                                iconUrl: 'icons/icon48.png',
                                title: 'Focus Reminder',
                                message: `You've been browsing for ${interval} minutes. Take a deep breath or refocus on your task.`,
                                priority: 1
                            };
                            chrome.notifications.create('', notifOptions);
                        } else {
                            // Fallback
                            chrome.runtime.sendMessage({ 
                                type: 'focus_reminder', 
                                text: `You've been browsing for ${interval} minutes. Take a deep breath or refocus on your task.` 
                            });
                        }
                    } catch (e) {
                        console.warn('Notification error:', e);
                    }
                });
            });
        });
    }

    if (alarm.name === ALARM_DAILY_RESET) {
        // Reset daily counters
        chrome.storage.local.set({ [SCREEN_TIME_KEY]: 0, [LAST_TICK_KEY]: Date.now() }, () => {
            // Re-schedule next midnight
            scheduleMidnightResetAlarm();
        });
    }
});

// ======================================
// Dynamic Mind Focus Rings (Bindu) Tracking
// ======================================

const FOCUS_SETTINGS = {
    TAB_SWITCH_PENALTY: -20,
    DISTRACTION_SITE_PENALTY: -30,
    IDLE_PENALTY: -5,
    CONTINUOUS_FOCUS_GAIN: 2,
    FOCUS_THRESHOLD: 30000, // 30 seconds to start gaining focus
};

let focusState = {
    focusLevel: 50, // 0-100, starts neutral
    currentTabId: null,
    currentUrl: '',
    isIdle: false,
    isBrowserFocused: true,
    lastActivityTime: Date.now(),
    continuousFocusStart: Date.now(),
    focusRingEnabled: true,
    binduStyle: 'glow', // 'glow', 'ripple', 'minimal'
};

// Initialize focus tracking on startup
function initializeFocusTracking() {
    console.log('Initializing Focus Tracking & Bindu Visualization...');
    
    // Load user preferences
    chrome.storage.sync.get(['focusRingEnabled', 'binduStyle'], (result) => {
        focusState.focusRingEnabled = result.focusRingEnabled !== undefined ? result.focusRingEnabled : true;
        focusState.binduStyle = result.binduStyle || 'glow';
        console.log('Focus Ring Settings loaded:', focusState);
    });
    
    // Get initial active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length > 0) {
            focusState.currentTabId = tabs[0].id;
            focusState.currentUrl = tabs[0].url || '';
            focusState.continuousFocusStart = Date.now();
        }
    });
    
    // Set up event listeners
    setupFocusEventListeners();
    
    // Start focus accumulation loop
    startFocusUpdateLoop();
    
    // Broadcast initial state
    broadcastFocusUpdate();
}

function setupFocusEventListeners() {
    // Listen for tab switches
    chrome.tabs.onActivated.addListener((activeInfo) => {
        const newTabId = activeInfo.tabId;
        
        if (newTabId !== focusState.currentTabId) {
            console.log(`Tab switched from ${focusState.currentTabId} to ${newTabId}`);
            
            // Penalty for tab switch
            decreaseFocusLevel(FOCUS_SETTINGS.TAB_SWITCH_PENALTY);
            
            // Update current tab
            focusState.currentTabId = newTabId;
            focusState.lastActivityTime = Date.now();
            focusState.continuousFocusStart = Date.now();
            
            // Get new tab URL
            chrome.tabs.get(newTabId, (tab) => {
                focusState.currentUrl = tab.url || '';
                checkIfDistractingSite();
            });
        }
    });
    
    // Listen for window focus changes
    chrome.windows.onFocusChanged.addListener((windowId) => {
        if (windowId === chrome.windows.WINDOW_ID_NONE) {
            // User switched away from browser
            focusState.isBrowserFocused = false;
            decreaseFocusLevel(5);
            console.log('Browser lost focus');
        } else {
            // User switched back to browser
            focusState.isBrowserFocused = true;
            focusState.lastActivityTime = Date.now();
            console.log('Browser regained focus');
        }
    });
    
    // Listen for idle state changes (check every 10 seconds)
    chrome.idle.onStateChanged.addListener((newState) => {
        const isIdle = newState === 'idle' || newState === 'locked';
        if (isIdle && !focusState.isIdle) {
            focusState.isIdle = true;
            console.log('User went idle');
            decreaseFocusLevel(FOCUS_SETTINGS.IDLE_PENALTY);
        } else if (!isIdle && focusState.isIdle) {
            focusState.isIdle = false;
            focusState.lastActivityTime = Date.now();
            console.log('User became active again');
        }
    });
    
    // Listen for storage changes (e.g., user toggled settings)
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'sync') {
            if (changes.focusRingEnabled) {
                focusState.focusRingEnabled = changes.focusRingEnabled.newValue;
                console.log('Focus Ring Enabled:', focusState.focusRingEnabled);
            }
            if (changes.binduStyle) {
                focusState.binduStyle = changes.binduStyle.newValue;
                console.log('Bindu Style changed to:', focusState.binduStyle);
            }
            if (changes.focusMode) {
                // Reset focus when Focus Mode is toggled
                const newMode = changes.focusMode.newValue;
                if (newMode) {
                    // Focus Mode turned ON - boost focus level
                    increaseFocusLevel(15);
                } else {
                    // Focus Mode turned OFF - slight penalty
                    decreaseFocusLevel(10);
                }
            }
        }
    });
}

function checkIfDistractingSite() {
    chrome.storage.sync.get(['blockedUrls'], (result) => {
        const blockedUrls = result.blockedUrls || [];
        const url = focusState.currentUrl.toLowerCase();
        
        // Check if current site is in blocked list
        const isDistractingSite = blockedUrls.some(blocked => url.includes(blocked.toLowerCase()));
        
        if (isDistractingSite) {
            console.log('Distraction site detected:', focusState.currentUrl);
            decreaseFocusLevel(FOCUS_SETTINGS.DISTRACTION_SITE_PENALTY);
        }
    });
}

function startFocusUpdateLoop() {
    // Update focus level every 5 seconds
    setInterval(() => {
        if (focusState.isBrowserFocused && !focusState.isIdle) {
            // Continuous focus: gradually increase if staying on same tab
            const timeOnTab = Date.now() - focusState.continuousFocusStart;
            
            if (timeOnTab > FOCUS_SETTINGS.FOCUS_THRESHOLD) {
                // Reward continuous focus
                increaseFocusLevel(FOCUS_SETTINGS.CONTINUOUS_FOCUS_GAIN);
            }
        } else if (focusState.isIdle) {
            // Idle penalty applied per interval
            decreaseFocusLevel(1);
        }
        
        // Broadcast update to popup
        broadcastFocusUpdate();
    }, 5000);
    
    // Smooth decay when not focused
    setInterval(() => {
        if (!focusState.isBrowserFocused || focusState.isIdle) {
            // Natural decay of focus
            decreaseFocusLevel(2);
        }
    }, 10000);
}

function increaseFocusLevel(amount) {
    focusState.focusLevel = Math.min(100, focusState.focusLevel + amount);
    console.log(`Focus increased to ${focusState.focusLevel}`);
}

function decreaseFocusLevel(amount) {
    focusState.focusLevel = Math.max(0, focusState.focusLevel - amount);
    console.log(`Focus decreased to ${focusState.focusLevel}`);
}

function broadcastFocusUpdate() {
    // Send focus state to all popup windows
    chrome.runtime.sendMessage({
        type: 'FOCUS_UPDATE',
        focusLevel: focusState.focusLevel,
        isBrowserFocused: focusState.isBrowserFocused,
        isIdle: focusState.isIdle,
        currentUrl: focusState.currentUrl,
        binduStyle: focusState.binduStyle
    }).catch((err) => {
        // Popup not open, that's fine
        // console.debug('Popup not listening:', err);
    });
    
    // Also update local storage for popup to read
    chrome.storage.local.set({
        focusLevel: focusState.focusLevel,
        isBrowserFocused: focusState.isBrowserFocused,
        isIdle: focusState.isIdle,
        currentUrl: focusState.currentUrl
    });
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'GET_FOCUS_STATE') {
        sendResponse({
            focusLevel: focusState.focusLevel,
            isBrowserFocused: focusState.isBrowserFocused,
            isIdle: focusState.isIdle,
            currentUrl: focusState.currentUrl,
            binduStyle: focusState.binduStyle
        });
        return true;
    }
    
    if (request.type === 'RESET_FOCUS') {
        focusState.focusLevel = 50;
        focusState.continuousFocusStart = Date.now();
        broadcastFocusUpdate();
        sendResponse({ success: true });
        return true;
    }
});
