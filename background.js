// Function to check if a URL should be blocked or allowed
const checkUrl = (url, allowList, blockList) => {
    // First, check the allow list for any matches
    for (const item of allowList) {
        if (url.includes(item)) {
            console.log(`URL ${url} is on the allow list. Allowing.`);
            return false; // Return false to indicate that the URL should NOT be blocked
        }
    }
    
    // If it's not on the allow list, check the block list
    for (const item of blockList) {
        if (url.includes(item)) {
            console.log(`URL ${url} is on the block list. Blocking.`);
            return true; // Return true to indicate that the URL should be blocked
        }
    }

    // If no match is found, the URL is not blocked
    console.log(`URL ${url} is not on the block list. Allowing.`);
    return false;
};

// Listener for web navigation events
chrome.webNavigation.onBeforeNavigate.addListener((details) => {
    // We only care about the main frame of a page
    if (details.frameId !== 0) {
        return;
    }

    // Get the current settings from storage
    chrome.storage.sync.get(['allowList', 'blockList', 'focusMode'], (result) => {
        const allowList = result.allowList || [];
        const blockList = result.blockList || [];
        const focusMode = result.focusMode || false;

        // If focus mode is on, check if the URL should be blocked
        if (focusMode && checkUrl(details.url, allowList, blockList)) {
            // Redirect the user to a custom blocked page
            chrome.tabs.update(details.tabId, { url: chrome.runtime.getURL('blocked.html') });
        }
    });
});
