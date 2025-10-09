chrome.runtime.onInstalled.addListener(function() {
    console.log('Content Blocker extension installed');
    updateBlockingRules();
});

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === 'updateRules') {
        updateBlockingRules();
    }
});

async function updateBlockingRules() {
    try {
        // Get blocked URLs from storage
        const result = await chrome.storage.sync.get(['blockedUrls']);
        const blockedUrls = result.blockedUrls || [];
        
        // Clear existing rules
        const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
        const ruleIdsToRemove = existingRules.map(rule => rule.id);
        
        if (ruleIdsToRemove.length > 0) {
            await chrome.declarativeNetRequest.updateDynamicRules({
                removeRuleIds: ruleIdsToRemove
            });
        }
        
        // Create new rules for blocked URLs
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
        
        console.log(`Updated blocking rules for ${blockedUrls.length} URLs`);
    } catch (error) {
        console.error('Error updating blocking rules:', error);
    }
}