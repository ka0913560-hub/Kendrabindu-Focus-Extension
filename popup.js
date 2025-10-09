document.addEventListener('DOMContentLoaded', function() {
    const urlInput = document.getElementById('urlInput');
    const keywordInput = document.getElementById('keywordInput');
    const addUrlBtn = document.getElementById('addUrl');
    const addKeywordBtn = document.getElementById('addKeyword');
    const urlList = document.getElementById('urlList');
    const keywordList = document.getElementById('keywordList');
    const statusMessage = document.getElementById('statusMessage');
    const stats = document.getElementById('stats');
    const blockModeRadio = document.getElementById('blockMode');
    const allowModeRadio = document.getElementById('allowMode');

    let blockedUrls = [];
    let blockedKeywords = [];
    let keywordMode = 'block'; // 'block' or 'allow'

    // Load existing data
    loadData();

    // Event listeners
    addUrlBtn.addEventListener('click', addUrl);
    addKeywordBtn.addEventListener('click', addKeyword);
    blockModeRadio.addEventListener('change', updateKeywordMode);
    allowModeRadio.addEventListener('change', updateKeywordMode);
    
    urlInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') addUrl();
    });
    
    keywordInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') addKeyword();
    });

    function loadData() {
        chrome.storage.sync.get(['blockedUrls', 'blockedKeywords', 'keywordMode'], function(result) {
            blockedUrls = result.blockedUrls || [];
            blockedKeywords = result.blockedKeywords || [];
            keywordMode = result.keywordMode || 'block';
            
            // Set radio button based on saved mode
            if (keywordMode === 'allow') {
                allowModeRadio.checked = true;
            } else {
                blockModeRadio.checked = true;
            }
            
            updateDisplay();
        });
    }

    function addUrl() {
        const url = urlInput.value.trim();
        if (!url) {
            showMessage('Please enter a URL', 'error');
            return;
        }

        // Clean up URL
        const cleanUrl = url.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
        
        if (blockedUrls.includes(cleanUrl)) {
            showMessage('URL already blocked', 'error');
            return;
        }

        blockedUrls.push(cleanUrl);
        saveData();
        urlInput.value = '';
        showMessage('URL blocked successfully!', 'success');
    }

    function addKeyword() {
        const keyword = keywordInput.value.trim().toLowerCase();
        if (!keyword) {
            showMessage('Please enter a keyword', 'error');
            return;
        }

        if (blockedKeywords.includes(keyword)) {
            showMessage('Keyword already added', 'error');
            return;
        }

        blockedKeywords.push(keyword);
        saveData();
        keywordInput.value = '';
        const modeText = keywordMode === 'block' ? 'blocked' : 'allowed';
        showMessage(`Keyword added to ${modeText} list!`, 'success');
    }

    function updateKeywordMode() {
        keywordMode = blockModeRadio.checked ? 'block' : 'allow';
        saveData();
        const modeText = keywordMode === 'block' ? 'blocking' : 'allow-only';
        showMessage(`Switched to ${modeText} mode`, 'success');
    }

    function removeUrl(url) {
        const index = blockedUrls.indexOf(url);
        if (index > -1) {
            blockedUrls.splice(index, 1);
            saveData();
            showMessage('URL unblocked', 'success');
        }
    }

    function removeKeyword(keyword) {
        const index = blockedKeywords.indexOf(keyword);
        if (index > -1) {
            blockedKeywords.splice(index, 1);
            saveData();
            showMessage('Keyword removed', 'success');
        }
    }

    function saveData() {
        chrome.storage.sync.set({
            blockedUrls: blockedUrls,
            blockedKeywords: blockedKeywords,
            keywordMode: keywordMode
        }, function() {
            updateDisplay();
            // Notify background script to update rules
            chrome.runtime.sendMessage({
                action: 'updateRules',
                urls: blockedUrls,
                keywords: blockedKeywords,
                keywordMode: keywordMode
            });
        });
    }

    function updateDisplay() {
        updateUrlList();
        updateKeywordList();
        updateStats();
    }

    function updateUrlList() {
        if (blockedUrls.length === 0) {
            urlList.innerHTML = '<div class="empty-state">No blocked URLs</div>';
            return;
        }

        urlList.innerHTML = '';
        blockedUrls.forEach(url => {
            const listItem = document.createElement('div');
            listItem.className = 'list-item';
            
            const urlSpan = document.createElement('span');
            urlSpan.textContent = url;
            
            const removeBtn = document.createElement('button');
            removeBtn.className = 'remove-btn';
            removeBtn.textContent = 'Remove';
            removeBtn.addEventListener('click', () => removeUrl(url));
            
            listItem.appendChild(urlSpan);
            listItem.appendChild(removeBtn);
            urlList.appendChild(listItem);
        });
    }

    function updateKeywordList() {
        if (blockedKeywords.length === 0) {
            keywordList.innerHTML = '<div class="empty-state">No keywords added</div>';
            return;
        }

        keywordList.innerHTML = '';
        blockedKeywords.forEach(keyword => {
            const listItem = document.createElement('div');
            listItem.className = 'list-item';
            
            const keywordSpan = document.createElement('span');
            keywordSpan.textContent = keyword;
            
            const removeBtn = document.createElement('button');
            removeBtn.className = 'remove-btn';
            removeBtn.textContent = 'Remove';
            removeBtn.addEventListener('click', () => removeKeyword(keyword));
            
            listItem.appendChild(keywordSpan);
            listItem.appendChild(removeBtn);
            keywordList.appendChild(listItem);
        });
    }

    function updateStats() {
        const modeText = keywordMode === 'block' ? 'blocked' : 'allowed';
        stats.innerHTML = `${blockedUrls.length} URLs blocked • ${blockedKeywords.length} keywords ${modeText}`;
    }

    function showMessage(message, type) {
        statusMessage.textContent = message;
        statusMessage.className = `status-message ${type}`;
        statusMessage.style.display = 'block';
        setTimeout(() => {
            statusMessage.style.display = 'none';
        }, 3000);
    }
});