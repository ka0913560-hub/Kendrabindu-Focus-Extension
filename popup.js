const allowListTextarea = document.getElementById('allowList');
const blockListTextarea = document.getElementById('blockList');
const focusModeToggle = document.getElementById('focusModeToggle');
const saveButton = document.getElementById('saveButton');
const statusMessage = document.getElementById('statusMessage');

// Function to load settings from Chrome storage
const loadSettings = () => {
    chrome.storage.sync.get(['allowList', 'blockList', 'focusMode'], (result) => {
        if (result.allowList) {
            allowListTextarea.value = result.allowList.join('\n');
        }
        if (result.blockList) {
            blockListTextarea.value = result.blockList.join('\n');
        }
        // Set the toggle state
        focusModeToggle.checked = result.focusMode || false;
    });
};

// Function to save settings to Chrome storage
const saveSettings = () => {
    // Split the textarea content into an array of lines, trimming whitespace
    const allowList = allowListTextarea.value.split('\n').map(item => item.trim()).filter(Boolean);
    const blockList = blockListTextarea.value.split('\n').map(item => item.trim()).filter(Boolean);
    const focusMode = focusModeToggle.checked;

    // Save the data to Chrome's sync storage
    chrome.storage.sync.set({ allowList, blockList, focusMode }, () => {
        statusMessage.textContent = 'Settings saved!';
        setTimeout(() => {
            statusMessage.textContent = '';
        }, 2000);
    });
};

// Add event listeners for the button and the toggle switch
saveButton.addEventListener('click', saveSettings);
focusModeToggle.addEventListener('change', () => {
    // When the toggle is changed, we'll save the settings immediately
    saveSettings();
    // Query for the active tab to send a message to its content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        // Check if a valid tab was found and its URL is not a Chrome internal page
        if (tabs && tabs.length > 0) {
            // We use .catch() to silently handle the error when the content script is not running on a page.
            // This is expected on internal Chrome pages (e.g., `chrome://extensions`).
            chrome.tabs.sendMessage(tabs[0].id, { type: 'RELOAD_STATE' }).catch(error => {
                console.log("Could not establish connection to content script, possibly on an internal Chrome page.");
            });
        }
    });
});

// Load the settings when the popup is opened
document.addEventListener('DOMContentLoaded', loadSettings);


