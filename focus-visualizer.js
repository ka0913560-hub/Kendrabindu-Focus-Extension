/**
 * Dynamic Mind Focus Rings (Bindu Visualization)
 * Tracks user focus state and communicates with popup for real-time visualization
 */

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
    setupEventListeners();
    
    // Start focus accumulation loop
    startFocusUpdateLoop();
    
    // Broadcast initial state
    broadcastFocusUpdate();
}

function setupEventListeners() {
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
    }
    
    if (request.type === 'RESET_FOCUS') {
        focusState.focusLevel = 50;
        focusState.continuousFocusStart = Date.now();
        broadcastFocusUpdate();
        sendResponse({ success: true });
    }
});

// Export for use in background.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { initializeFocusTracking, focusState };
}
