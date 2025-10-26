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
    const focusModeBtn = document.getElementById('focusModeBtn');
    const themeButtons = document.querySelectorAll('.theme-btn');
    const reminderIntervalSelect = document.getElementById('reminderInterval');
    
    // Bindu controls
    const focusRingToggle = document.getElementById('focusRingToggle');
    const binduStyleSelect = document.getElementById('binduStyleSelect');
    const resetFocusBtn = document.getElementById('resetFocusBtn');
    const focusLevelValue = document.getElementById('focusLevelValue');
    const focusStatusText = document.getElementById('focusStatusText');

    let blockedUrls = [];
    let blockedKeywords = [];
    let keywordMode = 'block';
    let focusMode = true;
    let currentTheme = 'green';
    let reminderInterval = 10;
    let focusRingEnabled = true;
    let binduStyle = 'glow';
    let currentFocusLevel = 50;
    const SCREEN_TIME_KEY = 'screenTimeSeconds';

    loadData();

    addUrlBtn.addEventListener('click', addUrl);
    addKeywordBtn.addEventListener('click', addKeyword);
    blockModeRadio.addEventListener('change', updateKeywordMode);
    allowModeRadio.addEventListener('change', updateKeywordMode);
    focusModeBtn.addEventListener('click', toggleFocusMode);
    reminderIntervalSelect.addEventListener('change', updateReminderInterval);
    
    // Bindu event listeners
    if (focusRingToggle) {
        focusRingToggle.addEventListener('change', toggleFocusRing);
    }
    if (binduStyleSelect) {
        binduStyleSelect.addEventListener('change', changeBinduStyle);
    }
    if (resetFocusBtn) {
        resetFocusBtn.addEventListener('click', resetFocus);
    }
    
    themeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            changeTheme(btn.getAttribute('data-theme'));
        });
    });
    
    urlInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') addUrl();
    });
    
    keywordInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') addKeyword();
    });

    function loadData() {
        chrome.storage.sync.get(['blockedUrls', 'blockedKeywords', 'keywordMode', 'focusMode', 'themeColor', 'reminderInterval'], function(result) {
            blockedUrls = result.blockedUrls || [];
            blockedKeywords = result.blockedKeywords || [];
            keywordMode = result.keywordMode || 'block';
            focusMode = result.focusMode !== undefined ? result.focusMode : true;
            currentTheme = result.themeColor || 'green';
            reminderInterval = result.reminderInterval || 10;
            
            if (keywordMode === 'allow') {
                allowModeRadio.checked = true;
            } else {
                blockModeRadio.checked = true;
            }
            
            applyTheme(currentTheme, false);
            reminderIntervalSelect.value = reminderInterval;
            
            updateDisplay();
            updateFocusModeUI();
            updateScreenTimeDisplay();
        });
    }

    function updateScreenTimeDisplay() {
        chrome.storage.local.get([SCREEN_TIME_KEY], function(res) {
            const seconds = Number(res[SCREEN_TIME_KEY] || 0);
            const mins = Math.floor(seconds / 60);
            const valueSpan = document.getElementById('screenTimeValue');
            if (valueSpan) {
                valueSpan.textContent = mins;
            }
        });
    }

    chrome.storage.onChanged.addListener(function(changes, areaName) {
        if (areaName === 'local' && changes[SCREEN_TIME_KEY]) {
            updateScreenTimeDisplay();
        }
    });

    function toggleFocusMode() {
        focusMode = !focusMode;
        chrome.storage.sync.set({ focusMode: focusMode }, function() {
            updateFocusModeUI();
            chrome.runtime.sendMessage({
                action: 'updateRules',
                urls: blockedUrls,
                keywords: blockedKeywords,
                keywordMode: keywordMode,
                focusMode: focusMode
            });
            const statusText = focusMode ? 'Focus Mode enabled - blocking active' : 'Focus Mode disabled - blocking paused';
            showMessage(statusText, 'success');
        });
    }

    function updateFocusModeUI() {
        if (focusMode) {
            focusModeBtn.classList.add('active');
            focusModeBtn.innerHTML = '<span class="icon-toggle">🟢</span><span id="focusModeText">Focus Mode ON</span>';
        } else {
            focusModeBtn.classList.remove('active');
            focusModeBtn.innerHTML = '<span class="icon-toggle">🔘</span><span id="focusModeText">Enable Focus Mode</span>';
        }
    }

    function addUrl() {
        const url = urlInput.value.trim();
        if (!url) {
            showMessage('Please enter a URL', 'error');
            return;
        }

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
        showMessage('Keyword added to ' + modeText + ' list!', 'success');
    }

    function updateKeywordMode() {
        keywordMode = blockModeRadio.checked ? 'block' : 'allow';
        saveData();
        const modeText = keywordMode === 'block' ? 'blocking' : 'allow-only';
        showMessage('Switched to ' + modeText + ' mode', 'success');
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
            keywordMode: keywordMode,
            focusMode: focusMode
        }, function() {
            updateDisplay();
            chrome.runtime.sendMessage({
                action: 'updateRules',
                urls: blockedUrls,
                keywords: blockedKeywords,
                keywordMode: keywordMode,
                focusMode: focusMode
            });
            
            try {
                chrome.tabs.query({ url: '*://*.youtube.com/*' }, function(tabs) {
                    tabs.forEach(tab => {
                        chrome.tabs.sendMessage(tab.id, { type: 'KB_REFRESH_RULES' }).catch(() => {});
                    });
                });
            } catch (err) {
                console.debug('YouTube refresh error:', err);
            }
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
        stats.innerHTML = blockedUrls.length + ' URLs blocked - ' + blockedKeywords.length + ' keywords ' + modeText;
    }

    function showMessage(message, type) {
        statusMessage.textContent = message;
        statusMessage.className = 'status-message ' + type;
        statusMessage.style.display = 'block';
        setTimeout(() => {
            statusMessage.style.display = 'none';
        }, 3000);
    }

    function changeTheme(theme) {
        currentTheme = theme;
        applyTheme(theme, true);
        
        chrome.storage.sync.set({ themeColor: theme }, function() {
            console.log('Theme saved:', theme);
        });
    }

    function applyTheme(theme, showMsg) {
        const themes = {
            green: 'linear-gradient(135deg, #0caa34 0%, #d2d823 100%)',
            black: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)',
            blue: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)'
        };
        
        document.body.style.background = themes[theme] || themes.green;
        
        themeButtons.forEach(btn => {
            if (btn.getAttribute('data-theme') === theme) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        
        if (showMsg) {
            const themeName = theme.charAt(0).toUpperCase() + theme.slice(1);
            showMessage(themeName + ' theme applied!', 'success');
        }
    }

    function updateReminderInterval() {
        const newInterval = parseInt(reminderIntervalSelect.value);
        reminderInterval = newInterval;
        
        chrome.storage.sync.set({ reminderInterval: newInterval }, function() {
            chrome.runtime.sendMessage({
                action: 'updateReminderInterval',
                interval: newInterval
            }, function(response) {
                showMessage('Reminder set to every ' + newInterval + ' minutes', 'success');
            });
        });
    }

    // ====== BINDU FUNCTIONS ======

    function toggleFocusRing() {
        focusRingEnabled = focusRingToggle.checked;
        chrome.storage.sync.set({ focusRingEnabled: focusRingEnabled }, function() {
            const statusText = focusRingEnabled ? 'Focus Rings enabled!' : 'Focus Rings disabled';
            showMessage(statusText, 'success');
            if (focusRingEnabled) {
                requestFocusUpdate();
            }
        });
    }

    function changeBinduStyle() {
        binduStyle = binduStyleSelect.value;
        chrome.storage.sync.set({ binduStyle: binduStyle }, function() {
            showMessage('Bindu style changed to ' + binduStyle, 'success');
            requestFocusUpdate();
        });
    }

    function resetFocus() {
        chrome.runtime.sendMessage({ type: 'RESET_FOCUS' }, function(response) {
            if (response && response.success) {
                currentFocusLevel = 50;
                updateFocusDisplay();
                showMessage('Focus reset to 50%', 'success');
            }
        });
    }

    function requestFocusUpdate() {
        chrome.runtime.sendMessage({ type: 'GET_FOCUS_STATE' }, function(response) {
            if (response) {
                currentFocusLevel = response.focusLevel || 50;
                updateFocusDisplay();
            }
        });
    }

    function updateFocusDisplay() {
        if (focusLevelValue) {
            focusLevelValue.textContent = currentFocusLevel;
        }
        
        if (focusStatusText) {
            let status = 'Centered & Calm';
            if (currentFocusLevel < 30) {
                status = 'Distracted';
            } else if (currentFocusLevel < 50) {
                status = 'Scattered Mind';
            } else if (currentFocusLevel < 80) {
                status = 'Focused & Productive';
            } else {
                status = 'Calm & Centered';
            }
            focusStatusText.textContent = status;
        }
    }

    // Listen for focus updates from background
    chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
        if (request.type === 'FOCUS_UPDATE' && focusRingEnabled) {
            currentFocusLevel = request.focusLevel || 50;
            updateFocusDisplay();
        }
    });

    // Load Bindu settings on startup
    function loadBinduSettings() {
        chrome.storage.sync.get(['focusRingEnabled', 'binduStyle'], function(result) {
            focusRingEnabled = result.focusRingEnabled !== undefined ? result.focusRingEnabled : true;
            binduStyle = result.binduStyle || 'glow';
            
            if (focusRingToggle) {
                focusRingToggle.checked = focusRingEnabled;
            }
            if (binduStyleSelect) {
                binduStyleSelect.value = binduStyle;
            }
            
            requestFocusUpdate();
        });
    }

    // Call on load
    loadBinduSettings();

    // ====== CANVAS ANIMATION ======

    const canvas = document.getElementById('binduCanvas');
    let animationFrame = null;
    let frameCount = 0;

    if (canvas) {
        const ctx = canvas.getContext('2d');
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;

        function drawBindu() {
            if (!focusRingEnabled) return;

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Determine color based on focus level
            let color = '#FF6B6B'; // Red (0-30%)
            if (currentFocusLevel >= 30 && currentFocusLevel < 50) {
                color = '#FFA500'; // Orange (30-50%)
            } else if (currentFocusLevel >= 50 && currentFocusLevel < 80) {
                color = '#51CF66'; // Green (50-80%)
            } else if (currentFocusLevel >= 80) {
                color = '#4ECDC4'; // Blue/Cyan (80-100%)
            }

            // Draw based on style
            if (binduStyle === 'glow') {
                drawGlowStyle(ctx, centerX, centerY, color);
            } else if (binduStyle === 'ripple') {
                drawRippleStyle(ctx, centerX, centerY, color);
            } else if (binduStyle === 'minimal') {
                drawMinimalStyle(ctx, centerX, centerY, color);
            }

            frameCount++;
            animationFrame = requestAnimationFrame(drawBindu);
        }

        function drawGlowStyle(ctx, x, y, color) {
            // Main circle with pulsing glow
            const pulse = Math.sin(frameCount * 0.05) * 10 + 10;
            const baseRadius = 40;
            
            // Outer glow
            ctx.fillStyle = color;
            ctx.globalAlpha = 0.3;
            ctx.beginPath();
            ctx.arc(x, y, baseRadius + pulse + 20, 0, Math.PI * 2);
            ctx.fill();

            // Middle glow
            ctx.globalAlpha = 0.5;
            ctx.beginPath();
            ctx.arc(x, y, baseRadius + pulse + 10, 0, Math.PI * 2);
            ctx.fill();

            // Inner circle (bright)
            ctx.globalAlpha = 1;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(x, y, baseRadius, 0, Math.PI * 2);
            ctx.fill();

            ctx.globalAlpha = 1;
        }

        function drawRippleStyle(ctx, x, y, color) {
            // Center dot
            ctx.fillStyle = color;
            ctx.globalAlpha = 1;
            ctx.beginPath();
            ctx.arc(x, y, 8, 0, Math.PI * 2);
            ctx.fill();

            // Ripples expanding
            const rippleCount = 3;
            for (let i = 0; i < rippleCount; i++) {
                const ripplePhase = (frameCount + i * 20) % 120;
                const rippleRadius = (ripplePhase / 120) * 50;
                const rippleOpacity = 1 - (ripplePhase / 120);

                ctx.strokeStyle = color;
                ctx.globalAlpha = rippleOpacity * 0.6;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(x, y, rippleRadius, 0, Math.PI * 2);
                ctx.stroke();
            }

            ctx.globalAlpha = 1;
        }

        function drawMinimalStyle(ctx, x, y, color) {
            // Rotating dot
            const angle = (frameCount * 0.05) * (Math.PI / 180);
            const radius = 20;
            
            const dotX = x + Math.cos(angle) * radius;
            const dotY = y + Math.sin(angle) * radius;

            // Center point
            ctx.fillStyle = color;
            ctx.globalAlpha = 0.3;
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fill();

            // Rotating dot (bright)
            ctx.globalAlpha = 1;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(dotX, dotY, 6, 0, Math.PI * 2);
            ctx.fill();

            ctx.globalAlpha = 1;
        }

        // Start animation
        drawBindu();

        // Update canvas when focus changes
        const originalUpdateFocusDisplay = updateFocusDisplay;
        updateFocusDisplay = function() {
            originalUpdateFocusDisplay();
            // Canvas will update automatically in animation loop
        };
    }
});

