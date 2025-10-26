// This script runs on all websites to provide additional URL blocking functionality
// The main URL blocking is handled by declarativeNetRequest in background.js
// This script provides visual feedback and handles edge cases

let blockedUrls = [];
let focusMode = true; // default to enabled

// Load blocked URLs and focus mode
chrome.storage.sync.get(['blockedUrls', 'focusMode'], function(result) {
    blockedUrls = result.blockedUrls || [];
    focusMode = result.focusMode !== undefined ? result.focusMode : true;
    
    // Only check URL if Focus Mode is enabled
    if (focusMode) {
        checkCurrentUrl();
    }
});

// Listen for storage changes
chrome.storage.onChanged.addListener(function(changes, namespace) {
    if (namespace === 'sync') {
        if (changes.blockedUrls) {
            blockedUrls = changes.blockedUrls.newValue || [];
        }
        if (changes.focusMode) {
            focusMode = changes.focusMode.newValue !== undefined ? changes.focusMode.newValue : true;
        }
        
        // Only check URL if Focus Mode is enabled
        if (focusMode) {
            checkCurrentUrl();
        }
    }
});

function checkCurrentUrl() {
    // Skip blocking if Focus Mode is OFF
    if (!focusMode) {
        return;
    }
    
    const currentHost = window.location.hostname.replace(/^www\./, '');
    const currentUrl = window.location.href;
    
    const isBlocked = blockedUrls.some(blockedUrl => {
        const cleanBlockedUrl = blockedUrl.replace(/^www\./, '');
        return currentHost.includes(cleanBlockedUrl) || currentUrl.includes(cleanBlockedUrl);
    });
    
    if (isBlocked && !window.location.pathname.includes('blocked.html')) {
        // If somehow the declarativeNetRequest didn't catch it, redirect manually
        showBlockedPage();
    }
}

function showBlockedPage() {
    document.documentElement.innerHTML = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Site Blocked</title>
            <style>
                body {
                    margin: 0;
                    padding: 0;
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                
                .container {
                    text-align: center;
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 20px;
                    padding: 50px;
                    backdrop-filter: blur(10px);
                    box-shadow: 0 8px 32px rgba(31, 38, 135, 0.37);
                    max-width: 500px;
                }
                
                .icon {
                    font-size: 80px;
                    margin-bottom: 20px;
                    opacity: 0.9;
                }
                
                h1 {
                    font-size: 32px;
                    margin-bottom: 20px;
                    font-weight: 300;
                }
                
                p {
                    font-size: 18px;
                    margin-bottom: 30px;
                    opacity: 0.8;
                    line-height: 1.6;
                }
                
                .url {
                    background: rgba(255, 255, 255, 0.2);
                    padding: 15px;
                    border-radius: 10px;
                    font-family: monospace;
                    font-size: 16px;
                    margin: 20px 0;
                    word-break: break-all;
                }
                
                .buttons {
                    display: flex;
                    gap: 15px;
                    justify-content: center;
                    flex-wrap: wrap;
                }
                
                button {
                    padding: 15px 25px;
                    border: none;
                    border-radius: 10px;
                    background: rgba(255, 255, 255, 0.2);
                    color: white;
                    cursor: pointer;
                    font-size: 16px;
                    font-weight: 500;
                    transition: all 0.3s ease;
                    backdrop-filter: blur(5px);
                }
                
                button:hover {
                    background: rgba(255, 255, 255, 0.3);
                    transform: translateY(-2px);
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
                }
                
                .back-btn {
                    background: rgba(76, 175, 80, 0.3);
                }
                
                .settings-btn {
                    background: rgba(255, 193, 7, 0.3);
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="icon">🛡️</div>
                <h1>Site Blocked</h1>
                <p>This website has been blocked by your content filter.</p>
                <div class="url">${window.location.hostname}</div>
                <div class="buttons">
                    <button class="back-btn" onclick="history.back()">
                        ← Go Back
                    </button>
                    <button class="settings-btn" onclick="openExtensionSettings()">
                        ⚙️ Settings
                    </button>
                </div>
            </div>
            
            <script>
                function openExtensionSettings() {
                    // This will only work if the extension has the appropriate permissions
                    try {
                        chrome.runtime.sendMessage({action: 'openOptions'});
                    } catch (e) {
                        alert('Please open the extension popup to modify settings');
                    }
                }
            </script>
        </body>
        </html>
    `;
}