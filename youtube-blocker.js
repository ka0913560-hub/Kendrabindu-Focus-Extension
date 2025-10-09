let blockedKeywords = [];
let keywordMode = 'block'; // 'block' or 'allow'
let observer = null;

// Load blocked keywords and mode
chrome.storage.sync.get(['blockedKeywords', 'keywordMode'], function(result) {
    blockedKeywords = result.blockedKeywords || [];
    keywordMode = result.keywordMode || 'block';
    console.log('YouTube Blocker loaded:', {keywords: blockedKeywords, mode: keywordMode});
    
    if (blockedKeywords.length > 0) {
        initializeYouTubeBlocker();
    }
});

// Listen for storage changes
chrome.storage.onChanged.addListener(function(changes, namespace) {
    if (namespace === 'sync') {
        let shouldReinitialize = false;
        
        if (changes.blockedKeywords) {
            blockedKeywords = changes.blockedKeywords.newValue || [];
            shouldReinitialize = true;
        }
        if (changes.keywordMode) {
            keywordMode = changes.keywordMode.newValue || 'block';
            shouldReinitialize = true;
        }
        
        console.log('YouTube Blocker updated:', {keywords: blockedKeywords, mode: keywordMode});
        
        if (shouldReinitialize && blockedKeywords.length > 0) {
            // Clear existing blocks first
            clearAllBlocks();
            initializeYouTubeBlocker();
        } else if (blockedKeywords.length === 0 && observer) {
            observer.disconnect();
            observer = null;
            clearAllBlocks();
        }
    }
});

function clearAllBlocks() {
    // Remove all existing overlays
    const overlays = document.querySelectorAll('.content-blocker-overlay');
    overlays.forEach(overlay => overlay.remove());
    
    // Remove blocked attributes
    const blockedElements = document.querySelectorAll('[data-content-blocked]');
    blockedElements.forEach(element => {
        element.removeAttribute('data-content-blocked');
    });
}

function initializeYouTubeBlocker() {
    console.log('Initializing YouTube blocker in', keywordMode, 'mode with keywords:', blockedKeywords);
    
    // Initial scan
    blockYouTubeContent();
    
    // Set up observer for dynamic content
    if (observer) {
        observer.disconnect();
    }
    
    observer = new MutationObserver(function(mutations) {
        let shouldBlock = false;
        mutations.forEach(function(mutation) {
            if (mutation.addedNodes.length > 0) {
                shouldBlock = true;
            }
        });
        
        if (shouldBlock) {
            setTimeout(blockYouTubeContent, 100);
        }
    });
    
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

function blockYouTubeContent() {
    if (blockedKeywords.length === 0) return;
    
    // Block video items in various YouTube layouts
    const selectors = [
        'ytd-video-renderer',           // Home page videos
        'ytd-grid-video-renderer',      // Grid layout videos
        'ytd-compact-video-renderer',   // Sidebar videos
        'ytd-playlist-video-renderer',  // Playlist videos
        'ytd-rich-item-renderer',       // Rich grid items
        'ytd-movie-renderer',           // Movie items
        'ytd-radio-renderer',           // Radio/playlist items
        'ytd-channel-renderer',         // Channel items
        'ytd-shelf-renderer',           // Shelves
        'yt-horizontal-list-renderer'   // Horizontal lists
    ];
    
    selectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(element => {
            if (element.hasAttribute('data-content-blocked')) return;
            
            const textContent = element.textContent.toLowerCase();
            const hasKeyword = blockedKeywords.some(keyword => 
                textContent.includes(keyword.toLowerCase())
            );
            
            let shouldBlock = false;
            if (keywordMode === 'block') {
                // Block mode: hide content that contains keywords
                shouldBlock = hasKeyword;
            } else {
                // Allow mode: hide content that doesn't contain keywords
                shouldBlock = !hasKeyword;
            }
            
            if (shouldBlock) {
                blockElement(element, hasKeyword);
            }
        });
    });
    
    // Also check video titles in search results and recommendations
    const titleElements = document.querySelectorAll('#video-title, .ytd-video-meta-block #video-title, h3 a[href*="/watch"]');
    titleElements.forEach(titleElement => {
        const container = findVideoContainer(titleElement);
        if (container && !container.hasAttribute('data-content-blocked')) {
            const title = titleElement.textContent.toLowerCase();
            const hasKeyword = blockedKeywords.some(keyword => 
                title.includes(keyword.toLowerCase())
            );
            
            let shouldBlock = false;
            if (keywordMode === 'block') {
                // Block mode: hide content that contains keywords
                shouldBlock = hasKeyword;
            } else {
                // Allow mode: hide content that doesn't contain keywords
                shouldBlock = !hasKeyword;
            }
            
            if (shouldBlock) {
                blockElement(container, hasKeyword);
            }
        }
    });
}

function findVideoContainer(element) {
    let current = element;
    const containerSelectors = [
        'ytd-video-renderer',
        'ytd-grid-video-renderer',
        'ytd-compact-video-renderer',
        'ytd-playlist-video-renderer',
        'ytd-rich-item-renderer'
    ];
    
    while (current && current !== document.body) {
        if (containerSelectors.some(selector => current.matches && current.matches(selector))) {
            return current;
        }
        current = current.parentElement;
    }
    return null;
}

function blockElement(element, hasKeyword) {
    element.setAttribute('data-content-blocked', 'true');
    element.style.position = 'relative';
    element.style.overflow = 'hidden';
    
    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'content-blocker-overlay';
    overlay.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: linear-gradient(135deg, rgba(244, 67, 54, 0.9), rgba(233, 30, 99, 0.9));
        color: white;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        font-family: 'Roboto', Arial, sans-serif;
        font-size: 14px;
        font-weight: 500;
        z-index: 1000;
        backdrop-filter: blur(5px);
        border-radius: 4px;
        text-align: center;
        padding: 20px;
        box-sizing: border-box;
    `;
    
    const icon = document.createElement('div');
    icon.style.cssText = `
        font-size: 24px;
        margin-bottom: 8px;
        opacity: 0.9;
    `;
    icon.textContent = keywordMode === 'block' ? '🚫' : '🔒';
    
    const message = document.createElement('div');
    message.style.cssText = `
        margin-bottom: 10px;
        line-height: 1.4;
    `;
    
    if (keywordMode === 'block') {
        message.textContent = 'Content blocked by keyword filter';
    } else {
        message.textContent = 'Content hidden - not in allowed keywords';
    }
    
    const showButton = document.createElement('button');
    showButton.style.cssText = `
        background: rgba(255, 255, 255, 0.2);
        border: none;
        color: white;
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 500;
        transition: all 0.2s ease;
    `;
    showButton.textContent = 'Show anyway';
    showButton.onmouseover = () => showButton.style.background = 'rgba(255, 255, 255, 0.3)';
    showButton.onmouseout = () => showButton.style.background = 'rgba(255, 255, 255, 0.2)';
    
    showButton.addEventListener('click', function(e) {
        e.stopPropagation();
        e.preventDefault();
        overlay.remove();
        element.removeAttribute('data-content-blocked');
    });
    
    overlay.appendChild(icon);
    overlay.appendChild(message);
    overlay.appendChild(showButton);
    
    element.appendChild(overlay);
    
    // Prevent clicks on the blocked element
    element.addEventListener('click', function(e) {
        if (element.hasAttribute('data-content-blocked')) {
            e.stopPropagation();
            e.preventDefault();
        }
    }, true);
}