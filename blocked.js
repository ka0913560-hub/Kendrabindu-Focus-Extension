// blocked.js - Script for blocked page
// No inline scripts to comply with CSP

document.addEventListener('DOMContentLoaded', function() {
    // Display the blocked URL
    const blockedUrlElement = document.getElementById('blockedUrl');
    if (blockedUrlElement) {
        blockedUrlElement.textContent = window.location.href;
    }
    
    // Back button handler
    const backBtn = document.getElementById('backBtn');
    if (backBtn) {
        backBtn.addEventListener('click', function() {
            if (window.history.length > 1) {
                window.history.back();
            } else {
                window.location.href = 'about:blank';
            }
        });
    }
    
    // Settings button handler
    const settingsBtn = document.getElementById('settingsBtn');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', function() {
            try {
                chrome.runtime.sendMessage({action: 'openPopup'});
            } catch (e) {
                alert('Please click the Kendra Bindu extension icon in your browser toolbar to manage your filters.');
            }
        });
    }
});
