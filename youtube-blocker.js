// ============================================
// KENDRA BINDU - YouTube Keyword Blocker
// ============================================

// State management (using scoped names to avoid conflicts)
let kbState = {
    blockedKeywords: [],
    keywordMode: 'block', // 'block' or 'allow'
    focusModeState: true,
    isInitialized: false
};

let kbObserver = null;
let kbDebounceTimer = null;
const KB_DEBOUNCE_DELAY = 250; // ms

console.debug('[KB] 🎬 YouTube Blocker Script Starting...');

// ============================================
// INITIAL LOAD - Get settings from storage
// ============================================
try {
    chrome.storage.sync.get(['blockedKeywords', 'keywordMode', 'focusMode'], function(result) {
        if (chrome.runtime.lastError) {
            console.warn('[KB] ⚠️ Storage error:', chrome.runtime.lastError);
            return;
        }
        
        kbState.blockedKeywords = result.blockedKeywords || [];
        kbState.keywordMode = result.keywordMode || 'block';
        kbState.focusModeState = result.focusMode !== undefined ? result.focusMode : true;
        
        console.debug('[KB] 📦 Initial Settings Loaded', {
            focusMode: kbState.focusModeState,
            keywordMode: kbState.keywordMode,
            keywordsCount: kbState.blockedKeywords.length,
            keywords: kbState.blockedKeywords
        });
        
        // Start blocker if conditions are met
        if (kbState.focusModeState && kbState.blockedKeywords.length > 0) {
            console.debug('[KB] ✅ Conditions met - Initializing blocker');
            initializeYouTubeBlocker();
        } else {
            const reason = !kbState.focusModeState ? 'Focus Mode OFF' : 'No keywords';
            console.debug('[KB] ⏸️ Blocker not initialized - Reason:', reason);
        }
    });
} catch (err) {
    console.error('[KB] ❌ Error during initial load:', err);
}

// ============================================
// LISTEN FOR STORAGE CHANGES
// ============================================
try {
    chrome.storage.onChanged.addListener(function(changes, namespace) {
        if (namespace !== 'sync') return;
        
        let settingsChanged = false;
        
        if (changes.blockedKeywords) {
            kbState.blockedKeywords = changes.blockedKeywords.newValue || [];
            settingsChanged = true;
            console.debug('[KB] 🔄 Keywords updated:', kbState.blockedKeywords);
        }
        
        if (changes.keywordMode) {
            kbState.keywordMode = changes.keywordMode.newValue || 'block';
            settingsChanged = true;
            console.debug('[KB] 🔄 Mode updated:', kbState.keywordMode);
        }
        
        if (changes.focusMode) {
            kbState.focusModeState = changes.focusMode.newValue !== undefined ? changes.focusMode.newValue : true;
            settingsChanged = true;
            console.debug('[KB] 🔄 Focus Mode updated:', kbState.focusModeState);
        }
        
        if (!settingsChanged) return;
        
        // Re-initialize if needed
        if (kbState.focusModeState && kbState.blockedKeywords.length > 0) {
            console.debug('[KB] 🔄 Restarting blocker with new settings...');
            if (kbState.isInitialized) {
                clearAllBlocks();
            }
            setTimeout(() => initializeYouTubeBlocker(), 100);
        } else {
            console.debug('[KB] ⏸️ Stopping blocker');
            if (kbState.isInitialized) {
                clearAllBlocks();
                stopObserver();
                kbState.isInitialized = false;
            }
        }
    });
} catch (err) {
    console.error('[KB] ❌ Storage listener error:', err);
}

// ============================================
// MAIN INITIALIZATION
// ============================================
function initializeYouTubeBlocker() {
    try {
        if (kbState.isInitialized) {
            console.debug('[KB] ℹ️ Already initialized');
            return;
        }
        
        if (!kbState.focusModeState) {
            console.debug('[KB] ⛔ Focus Mode is OFF - Cannot initialize');
            return;
        }
        
        if (kbState.blockedKeywords.length === 0) {
            console.debug('[KB] ⛔ No keywords - Cannot initialize');
            return;
        }
        
        kbState.isInitialized = true;
        console.debug('[KB] 🚀 Initializing YouTube Blocker');
        console.debug('[KB] Mode:', kbState.keywordMode);
        console.debug('[KB] Keywords:', kbState.blockedKeywords);
        
        // Run initial scan
        console.debug('[KB] 🔍 Running initial scan...');
        blockYouTubeContent();
        
        // Run additional scans with delays to catch dynamically loaded content
        setTimeout(() => blockYouTubeContent(), 800);
        setTimeout(() => blockYouTubeContent(), 1600);
        setTimeout(() => blockYouTubeContent(), 3000);
        
        // Start observing for new content
        startObserver();
        
        console.debug('[KB] ✅ Blocker initialized successfully');
    } catch (err) {
        console.error('[KB] ❌ Initialization error:', err);
    }
}

// ============================================
// OBSERVER - Watch for new videos
// ============================================
function startObserver() {
    try {
        if (kbObserver) {
            kbObserver.disconnect();
        }
        
        kbObserver = new MutationObserver(function(mutations) {
            // Debounce: only check after mutations settle
            if (kbDebounceTimer) {
                clearTimeout(kbDebounceTimer);
            }
            
            kbDebounceTimer = setTimeout(() => {
                if (kbState.focusModeState && kbState.blockedKeywords.length > 0) {
                    blockYouTubeContent();
                }
            }, KB_DEBOUNCE_DELAY);
        });
        
        kbObserver.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: false,
            characterData: false
        });
        
        console.debug('[KB] 👁️ Observer started - Watching for new videos');
    } catch (err) {
        console.error('[KB] ❌ Observer error:', err);
    }
}

function stopObserver() {
    try {
        if (kbObserver) {
            kbObserver.disconnect();
            kbObserver = null;
            console.debug('[KB] 👁️ Observer stopped');
        }
    } catch (err) {
        console.error('[KB] ❌ Stop observer error:', err);
    }
}

// ============================================
// BLOCK VIDEOS - Main filtering logic
// ============================================
function blockYouTubeContent() {
    try {
        // Safety checks
        if (!kbState.focusModeState) {
            console.debug('[KB] ⛔ Focus Mode OFF - Skipping block');
            return;
        }
        
        if (kbState.blockedKeywords.length === 0) {
            console.debug('[KB] ⛔ No keywords - Skipping block');
            return;
        }
        
        // Video container selectors for different YouTube layouts
        const SELECTORS = [
            'ytd-rich-item-renderer',      // Home feed, Search results
            'ytd-video-renderer',           // Playlist, recommendations
            'ytd-grid-video-renderer',      // Grid layout
            'ytd-compact-video-renderer'    // Sidebar recommendations
        ];
        
        let stats = {
            processed: 0,
            blocked: 0,
            allowed: 0,
            errors: 0
        };
        
        SELECTORS.forEach(selector => {
            try {
                const elements = document.querySelectorAll(selector);
                
                elements.forEach(element => {
                    try {
                        // Skip if already processed
                        if (element.hasAttribute('data-kb-processed')) {
                            return;
                        }
                        
                        // Mark as processed
                        element.setAttribute('data-kb-processed', 'true');
                        stats.processed++;
                        
                        // Get video title safely
                        const titleElement = element.querySelector('#video-title');
                        let videoTitle = '';
                        
                        if (titleElement && titleElement.innerText) {
                            videoTitle = titleElement.innerText.trim();
                        } else if (titleElement && titleElement.textContent) {
                            videoTitle = titleElement.textContent.trim();
                        } else {
                            // Fallback: search for any text in element
                            videoTitle = element.textContent || '';
                        }
                        
                        const titleLower = videoTitle.toLowerCase();
                        
                        // Check if any keyword matches
                        let keywordFound = false;
                        let matchedKeyword = '';
                        
                        for (const keyword of kbState.blockedKeywords) {
                            const keywordLower = keyword.toLowerCase().trim();
                            if (titleLower.includes(keywordLower)) {
                                keywordFound = true;
                                matchedKeyword = keyword;
                                break;
                            }
                        }
                        
                        // Determine if should block
                        let shouldBlock = false;
                        if (kbState.keywordMode === 'block') {
                            // Block mode: hide videos with keywords
                            shouldBlock = keywordFound;
                        } else {
                            // Allow mode: hide videos without keywords
                            shouldBlock = !keywordFound;
                        }
                        
                        // Apply action
                        if (shouldBlock) {
                            applyBlockOverlay(element, kbState.keywordMode);
                            stats.blocked++;
                        } else {
                            stats.allowed++;
                        }
                    } catch (err) {
                        console.debug('[KB] ⚠️ Element error:', err.message);
                        stats.errors++;
                    }
                });
            } catch (err) {
                console.debug('[KB] ⚠️ Selector error:', err.message);
            }
        });
        
        // Log summary if anything was processed
        if (stats.processed > 0) {
            console.debug('[KB] 📊 Scan Summary:', stats);
        }
        
    } catch (err) {
        console.error('[KB] ❌ Error in blockYouTubeContent:', err);
    }
}

// ============================================
// APPLY OVERLAY - Visual block indicator
// ============================================
function applyBlockOverlay(element, mode) {
    try {
        // Don't re-block if already blocked
        if (element.hasAttribute('data-kb-blocked')) {
            return;
        }
        
        element.setAttribute('data-kb-blocked', 'true');
        element.style.position = 'relative';
        element.style.overflow = 'hidden';
        
        // Create overlay container
        const overlay = document.createElement('div');
        overlay.className = 'kb-overlay';
        overlay.setAttribute('data-kb-overlay', 'true');
        overlay.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: linear-gradient(135deg, rgba(244, 67, 54, 0.92), rgba(233, 30, 99, 0.92));
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            border-radius: 12px;
            padding: 20px;
            box-sizing: border-box;
            backdrop-filter: blur(8px);
            color: white;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        `;
        
        // Icon
        const icon = document.createElement('div');
        icon.textContent = kbState.keywordMode === 'block' ? '🚫' : '🔒';
        icon.style.fontSize = '40px';
        icon.style.marginBottom = '8px';
        
        // Message
        const message = document.createElement('div');
        message.textContent = kbState.keywordMode === 'block' 
            ? 'Blocked by Keyword Filter' 
            : 'Not in Allowed Keywords';
        message.style.cssText = `
            font-size: 14px;
            font-weight: 600;
            text-align: center;
            margin-bottom: 10px;
            line-height: 1.3;
        `;
        
        // Show Anyway button
        const button = document.createElement('button');
        button.textContent = 'Show Anyway';
        button.style.cssText = `
            background: rgba(255, 255, 255, 0.25);
            border: 1px solid rgba(255, 255, 255, 0.4);
            color: white;
            padding: 8px 16px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 600;
            transition: all 0.2s ease;
            font-family: inherit;
        `;
        
        button.onmouseover = () => {
            button.style.background = 'rgba(255, 255, 255, 0.35)';
        };
        
        button.onmouseout = () => {
            button.style.background = 'rgba(255, 255, 255, 0.25)';
        };
        
        button.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            overlay.remove();
            element.removeAttribute('data-kb-blocked');
        };
        
        // Assemble overlay
        overlay.appendChild(icon);
        overlay.appendChild(message);
        overlay.appendChild(button);
        element.appendChild(overlay);
    } catch (err) {
        console.error('[KB] ❌ Overlay error:', err);
    }
}

// ============================================
// CLEAR BLOCKS - Remove all overlays
// ============================================
function clearAllBlocks() {
    try {
        // Remove all overlays
        document.querySelectorAll('[data-kb-overlay]').forEach(overlay => {
            overlay.remove();
        });
        
        // Remove all markers
        document.querySelectorAll('[data-kb-processed]').forEach(element => {
            element.removeAttribute('data-kb-processed');
            element.removeAttribute('data-kb-blocked');
            if (element.style.position === 'relative') {
                element.style.position = '';
            }
            if (element.style.overflow === 'hidden') {
                element.style.overflow = '';
            }
        });
        
        console.debug('[KB] 🧹 All blocks cleared');
    } catch (err) {
        console.error('[KB] ❌ Clear blocks error:', err);
    }
}

// ============================================
// MESSAGE LISTENER - For popup refresh signal
// ============================================
try {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'KB_REFRESH_RULES') {
            console.debug('[KB] 📨 Refresh signal received from popup');
            if (kbState.isInitialized) {
                clearAllBlocks();
                setTimeout(() => blockYouTubeContent(), 100);
            }
            sendResponse({ success: true });
        }
        return true;
    });
} catch (err) {
    console.error('[KB] ❌ Message listener error:', err);
}

// ============================================
// DEBUG FUNCTIONS - Console helpers
// ============================================
try {
    window.kbDebug = {
        status: function() {
            console.log('[KB] === BLOCKER STATUS ===');
            console.log('Initialized:', kbState.isInitialized);
            console.log('Focus Mode:', kbState.focusModeState);
            console.log('Mode:', kbState.keywordMode);
            console.log('Keywords:', kbState.blockedKeywords);
            console.log('Observer active:', kbObserver !== null);
            
            const stats = {
                videosFound: document.querySelectorAll('ytd-rich-item-renderer, ytd-video-renderer').length,
                processedElements: document.querySelectorAll('[data-kb-processed]').length,
                blockedElements: document.querySelectorAll('[data-kb-blocked]').length,
                overlaysActive: document.querySelectorAll('[data-kb-overlay]').length
            };
            console.table(stats);
        },
        
        test: function() {
            console.log('[KB] 🧪 Running test scan...');
            blockYouTubeContent();
        },
        
        clear: function() {
            console.log('[KB] 🧹 Clearing all blocks...');
            clearAllBlocks();
        },
        
        unblock: function() {
            console.log('[KB] 🔓 Unblocking all videos...');
            document.querySelectorAll('[data-kb-blocked]').forEach(el => {
                el.removeAttribute('data-kb-blocked');
                document.querySelectorAll('[data-kb-overlay]').forEach(o => o.remove());
            });
        },
        
        refresh: function() {
            console.log('[KB] 🔄 Manual refresh...');
            if (kbState.isInitialized) {
                clearAllBlocks();
                setTimeout(() => blockYouTubeContent(), 100);
            }
        }
    };
} catch (err) {
    console.error('[KB] ❌ Debug object error:', err);
}

console.debug('[KB] ✅ YouTube Blocker script loaded - type kbDebug.status() for info');
