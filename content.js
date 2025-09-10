console.log('Kendra Bindu content script loaded.');

// This message listener isn't strictly necessary for the current functionality,
// but it's good practice to have it in case you want to send messages from
// the popup or background script in the future.
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Currently, we don't need to do anything, but this is where you would
    // add logic to respond to messages from other parts of your extension.
    if (request.type === 'RELOAD_STATE') {
        // You could add logic here to update the UI of the current page
        // or re-evaluate the blocking status, if needed.
    }
});