let plateCounts = {}; 
let totalHistory = [];
let actionHistory = [];
let budget = Infinity;
let myChart = null;
let wakeLock = null; 

let currentTotalAmount = 0; 
let platesAddedInLastAction = 0; 

let presets = [
    { name: "スシロー", color: "#d32f2f", prices: [120, 180, 260, 360] },
    { name: "くら寿司", color: "#2e7d32", prices: [115, 165, 250] },
    { name: "はま寿司", color: "#0277bd", prices: [110, 165, 319] }
];
let currentPresetIndex = 0;
let currentSessionPrices = []; 

const priceSelect = document.getElementById('price-select');
const plateCountInput = document.getElementById('plate-count');
const towerContainer = document.getElementById('sushi-tower');

window.onload = () => {
    loadData();
    renderPresetChips();
    initChart();
    if(localStorage.getItem('theme') === 'dark') document.body.setAttribute('data-theme', 'dark');
};

function loadData() {
    let saved = localStorage.getItem('sushi_log_v23_data');
    if (!saved) saved = localStorage.getItem('sushi_log_v22_data'); 
    
    if (saved) {
        const data = JSON.parse(saved);
        presets = data.presets || presets;
        totalHistory = data.totalHistory || [];
    }
}

function saveData() {
    const data = { presets, totalHistory };
    localStorage.setItem('sushi_log_v23_data', JSON.stringify(data));
}

async function requestWakeLock() {
    if ('wakeLock' in navigator) {
        try { wakeLock = await navigator.wakeLock.request('screen'); } 
        catch (err) { console.error(`${err.name}, ${err.message}`); }
    }
}

function renderPresetChips() {
    const container = document.getElementById('preset-selector');
    container.innerHTML = '';
    presets.forEach((p, i) => {
        const btn = document.createElement('div');
        btn.className = 'preset-chip';
        btn.style.borderLeft = `5px solid ${p.color}`;
        btn.innerHTML = `<strong>${p.name}</strong><br><small>${p.prices.join('円, ')}円</small>`;
        btn.onclick = () => {
            currentPresetIndex = i;
            startSession();
        };
        container.appendChild(btn);
    });
}

function startSession() {
    const p = presets[currentPresetIndex];
    document.getElementById('current-shop-name').innerText = p.name;
    document.getElementById('app-bar').style.borderBottom = `4px solid ${p.color}`;
    document.documentElement.style.setProperty('--primary', p.color);
    
    currentSessionPrices = [...p.prices];
    updatePriceSelectAndChips();

    plateCounts = {};
    actionHistory = []; 
    currentTotalAmount = 0;
    document.getElementById('output-area').innerHTML = ''; 
    document.getElementById('title-screen').classList.add('hidden');
    document.getElementById('main-screen').classList.remove('hidden');
    
    requestWakeLock();
    addLog(`${p.name} でのセッションを開始しました。`);
    updateAll();
}

function updatePriceSelectAndChips() {
    priceSelect.innerHTML = '';
    currentSessionPrices.forEach(price => {
        const opt = document.createElement('option');
        opt.value = price;
        opt.innerText = `${price}円`;
        priceSelect.appendChild(opt);
    });
    renderQuickAddButtons(currentSessionPrices);
}

function renderQuickAddButtons(prices) {
    const container = document.getElementById('quick-add-buttons');
    container.innerHTML = '';
    prices.forEach(price => {
        const btn = document.createElement('button');
        btn.className = 'chip';
        btn.innerText = `+${price}円`;
        btn.onclick = () => {
            platesAddedInLastAction = 1; 
            actionHistory.push({ price: price, count: 1 });
            plateCounts[price] = (plateCounts[price] || 0) + 1;
            addLog(`${price}円のお皿を 1 枚追加しました。`);
            updateAll();
        };
        container.appendChild(btn);
    });
}

document.getElementById('add-custom-price-btn').onclick = () => {
    const inputField = document.getElementById('custom-price-input');
    const newPrice = parseInt(inputField.value);
    if (!newPrice || newPrice <= 0) { alert("正しい金額を入力してください"); return; }
    if (!currentSessionPrices.includes(newPrice)) {
        currentSessionPrices.push(newPrice);
        currentSessionPrices.sort((a, b) => a - b);
        updatePriceSelectAndChips();
        addLog(`【新規】${newPrice}円のお皿をメニューに追加しました。`);
    }
    priceSelect.value = newPrice;
    inputField.value = '';
};

document.getElementById('open-settings').onclick = () => {
    const list = document.getElementById('settings-list');
    list.innerHTML = '';
    presets.forEach((p, i) => {
        const div = document.createElement('div');
        div.className = 'settings-item card';
        div.innerHTML = `
            <input type="text" value="${p.name}" onchange="presets[${i}].name=this.value">
            <div style="display:flex; gap:8px; margin-top:8px;">
                <input type="color" value="${p.color}" onchange="presets[${i}].color=this.value">
                <input type="text" value="${p.prices.join(',')}" onchange="presets[${i}].prices=this.value.split(',').map(Number)">
                <button class="btn-danger-small" onclick="presets.splice(${i},1); document.getElementById('open-settings').click();">削除</button>
            </div>
        `;
        list.appendChild(div);
    });
    document.getElementById('settings-modal').classList.remove('hidden');
};
document.getElementById('add-new-preset').onclick = () => {
    presets.push({ name: "新しいお店", color: "#666666", prices: [100, 200] });
    document.getElementById('open-settings').click();
};
document.getElementById('close-settings').onclick = () => {
    saveData();
    renderPresetChips();
    document.getElementById('settings-modal').classList.add('hidden');
};

document.getElementById('help-button').onclick = () => document.getElementById('help-modal').classList.remove('hidden');
document.getElementById('close-help').onclick = () => document.getElementById('help-modal').classList.add('hidden');
document.getElementById('action-menu-button').onclick = () => document.getElementById('action-menu-modal').classList.remove('hidden');
document.getElementById('close-action-menu').onclick = () => document.getElementById('action-menu-modal').classList.add('hidden');

function undoLastAction() {
    if (actionHistory.length === 0) return;
    const last = actionHistory.pop();
    if (plateCounts[last.price]) {
        plateCounts[last.price] -= last.count;
        if (plateCounts[last.price] <= 0) delete plateCounts[last.price];
        platesAddedInLastAction = 0; 
        addLog(`【取消】${last.price}円のお皿の操作を元に戻しました。`);
        updateAll();
    }
}

function addLog(message) {
    const outputArea = document.getElementById('output-area');
    const time = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    outputArea.innerHTML = `<div style="font-size: 0.9em; margin-bottom: 4px; border-bottom: 1px dashed var(--border); padding-bottom: 2px;">[${time}] ${message}</div>` + outputArea.innerHTML;
}

function animateValue(obj, start, end, duration) {
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const easeOutQuart = 1 - Math.pow(1 - progress, 4);
        obj.innerHTML = Math.floor(start + easeOutQuart * (end - start)).toLocaleString();
        if (progress < 1) window.requestAnimationFrame(step);
    };
    window.requestAnimationFrame(step);
}

function updateAll() {
    const total = Object.entries(plateCounts).reduce((acc, [p, c]) => acc + (p * c), 0);
    const totalDisplay = document.getElementById('total-display');
    animateValue(totalDisplay, currentTotalAmount, total, 600);
    currentTotalAmount = total;

    updateTower();
    updateChart();
    updateTexts(total);
    updateStatsArea(total);
    updateHistoryArea();
}

function updateTower() {
    towerContainer.innerHTML = '';
    const color = presets[currentPresetIndex].color;
    
    let domPlates = [];
    Object.entries(plateCounts).forEach(([price, count]) => {
        for (let i = 0; i < count; i++) {
            const p = document.createElement('div');
            p.className = 'plate-visual';
            p.style.backgroundColor = color;
            p.style.opacity = Math.min(1.0, 0.4 + (price / 1000));
            domPlates.push(p);
        }
    });

    if (platesAddedInLastAction > 0 && domPlates.length >= platesAddedInLastAction) {
        for (let i = domPlates.length - platesAddedInLastAction; i < domPlates.length; i++) {
            domPlates[i].classList.add('drop-in');
        }
    }
    
    domPlates.forEach((p, index) => {
        towerContainer.appendChild(p);
        if ((index + 1) % 10 === 0) {
            const marker = document.createElement('div');
            marker.className = 'tower-marker';
            marker.innerHTML = `<span>${index + 1}</span>`;
            towerContainer.appendChild(marker);
        }
    });

    // ★変更：最後に追加されたDOM要素へスクロールさせることで確実に一番上へフォーカス
    if (platesAddedInLastAction > 0) {
        setTimeout(() => {
            const lastAddedElement = towerContainer.lastElementChild;
            if (lastAddedElement) {
                lastAddedElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }, 50);
    }
    
    platesAddedInLastAction = 0; 
}

function initChart() {
    const ctx = document.getElementById('price-chart').getContext('2d');
    myChart = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: [], datasets: [{ data: [], backgroundColor: ['#ff5252', '#448aff', '#4caf50', '#ffeb3b', '#9c27b0'] }] },
        options: { plugins: { legend: { display: false } }, cutout: '75%', animation: { duration: 500 } }
    });
}

function updateChart() {
    myChart.data.labels = Object.keys(plateCounts).map(p => `${p}円`);
    myChart.data.datasets[0].data = Object.values(plateCounts);
    myChart.update();

    const totalPlates = Object.values(plateCounts).reduce((acc, c) => acc + c, 0);
    document.getElementById('chart-center-text').innerText = `${totalPlates}枚`;
}

function updateTexts(total) {
    const summaryArea = document.getElementById('summary-area');
    const undoBtnHtml = actionHistory.length > 0 
        ? `<button onclick="undoLastAction()" class="btn-outline" style="width:100%; margin-bottom:10px; cursor:pointer;">↩️ 1つ取り消す</button>` 
        : '';
        
    summaryArea.innerHTML = undoBtnHtml + Object.entries(plateCounts)
        .map(([p, c]) => `<div>${p}円 x ${c}枚 = ${(p*c).toLocaleString()}円</div>`).join('');
    
    const budgetDisp = document.getElementById('budget-display');
    const guide = document.getElementById('budget-guide');
    if (budget !== Infinity) {
        budgetDisp.innerText = `予算: ${budget.toLocaleString()}円 (残: ${(budget - total).toLocaleString()}円)`;
        guide.style.display = 'block';
        if (total > budget) { guide.innerText = "⚠️ 予算オーバーです！"; guide.style.color = "var(--danger)"; } 
        else if (total > budget * 0.9) { guide.innerText = "🚨 まもなく予算到達です！"; guide.style.color = "orange"; } 
        else { guide.innerText = "予算内です。"; guide.style.color = "green"; }
    } else {
        budgetDisp.innerText = "予算: 未設定";
        guide.style.display = 'none';
    }
}

function updateStatsArea(totalAmount) {
    let totalPlates = 0, maxCount = 0, mostEatenPrice = 0;
    for (const [price, count] of Object.entries(plateCounts)) {
        totalPlates += count;
        if (count > maxCount) { maxCount = count; mostEatenPrice = price; }
    }
    const statsArea = document.getElementById('stats-area');
    if (totalPlates > 0) {
        const averagePrice = (totalAmount / totalPlates).toFixed(1);
        statsArea.innerHTML = `
            <div><strong>総枚数:</strong> ${totalPlates} 枚</div>
            <div><strong>平均単価:</strong> ${averagePrice} 円</div>
            <div style="margin-top: 5px;"><strong>一番多く食べたお皿:</strong><br> ${mostEatenPrice}円 (${maxCount}枚)</div>
        `;
    } else { statsArea.innerHTML = "<div>お皿のデータがありません</div>"; }
}

function updateHistoryArea() {
    const historyArea = document.getElementById('history-area');
    if (totalHistory.length === 0) { historyArea.innerHTML = "<div>過去の記録はありません</div>"; return; }
    historyArea.innerHTML = totalHistory.map((t, i) => `<div>セッション ${i + 1}: <strong>${t.toLocaleString()} 円</strong></div>`).join('');
}

document.getElementById('count-plus').onclick = () => plateCountInput.value++;
document.getElementById('count-minus').onclick = () => { if (plateCountInput.value > -99) plateCountInput.value--; };

document.getElementById('add-plate-button').onclick = () => {
    const p = priceSelect.value;
    const c = parseInt(plateCountInput.value);
    
    platesAddedInLastAction = c > 0 ? c : 0;
    
    actionHistory.push({ price: p, count: c });
    plateCounts[p] = (plateCounts[p] || 0) + c;
    if (plateCounts[p] <= 0) delete plateCounts[p];
    
    const actionStr = c > 0 ? "追加" : "削除";
    addLog(`${p}円のお皿を ${Math.abs(c)} 枚${actionStr}しました。`);
    
    updateAll();
    plateCountInput.value = 1;
};

document.getElementById('back-to-title').onclick = () => {
    document.getElementById('main-screen').classList.add('hidden');
    document.getElementById('title-screen').classList.remove('hidden');
    document.documentElement.style.setProperty('--primary', '#d32f2f');
    if (wakeLock !== null) wakeLock.release().then(() => { wakeLock = null; });
};

document.getElementById('theme-toggle').onclick = () => {
    const isDark = document.body.hasAttribute('data-theme');
    if (isDark) document.body.removeAttribute('data-theme');
    else document.body.setAttribute('data-theme', 'dark');
    localStorage.setItem('theme', isDark ? 'light' : 'dark');
};

document.getElementById('save-button').onclick = () => {
    const total = Object.entries(plateCounts).reduce((acc, [p, c]) => acc + (p * c), 0);
    if (total > 0) {
        totalHistory.push(total); saveData(); updateAll();
        addLog(`セッションを保存しました。`); alert("データを保存しました！");
    }
    document.getElementById('close-action-menu').click();
};

document.getElementById('reset-button').onclick = () => {
    if (confirm("現在のお皿のデータをリセットしますか？")) {
        const total = Object.entries(plateCounts).reduce((acc, [p, c]) => acc + (p * c), 0);
        if (total > 0) totalHistory.push(total); 
        plateCounts = {}; actionHistory = []; currentTotalAmount = 0; saveData(); updateAll();
        addLog("データをリセットしました。");
    }
    document.getElementById('close-action-menu').click();
};

document.getElementById('set-budget-button').onclick = () => {
    const val = prompt("予算設定（円）", budget === Infinity ? "" : budget);
    if (val !== null) { 
        budget = parseInt(val) || Infinity; updateAll(); 
        addLog(`予算を ${budget === Infinity ? "未設定" : budget + "円"} に設定しました。`);
    }
    document.getElementById('close-action-menu').click();
};

document.getElementById('export-csv-button').onclick = () => {
    if (Object.keys(plateCounts).length === 0) { alert("出力するデータがありません。"); return; }
    let csvContent = "data:text/csv;charset=utf-8,\uFEFF金額(円),枚数,小計(円)\n"; 
    let total = 0;
    for (const [price, count] of Object.entries(plateCounts)) {
        const subtotal = price * count; total += subtotal;
        csvContent += `${price},${count},${subtotal}\n`;
    }
    csvContent += `合計,,${total}\n`;
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `sushilog_${new Date().toISOString().slice(0,10).replace(/-/g, "")}.csv`);
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    addLog("CSVファイルを出力しました。");
    document.getElementById('close-action-menu').click();
};