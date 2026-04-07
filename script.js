let plateCounts = {}; 
let totalHistory = [];
let actionHistory = [];
let budget = Infinity;
let myChart = null;
let wakeLock = null; 

// 店舗プリセット初期データ
let presets = [
    { name: "スシロー", color: "#d32f2f", prices: [120, 180, 260, 360] },
    { name: "くら寿司", color: "#2e7d32", prices: [115, 165, 250] },
    { name: "はま寿司", color: "#0277bd", prices: [110, 165, 319] }
];
let currentPresetIndex = 0;
let currentSessionPrices = []; // ★現在のセッションで有効な金額リスト

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
    const saved = localStorage.getItem('sushi_log_v20_data');
    if (saved) {
        const data = JSON.parse(saved);
        presets = data.presets || presets;
        totalHistory = data.totalHistory || [];
    }
}

function saveData() {
    const data = { presets, totalHistory };
    localStorage.setItem('sushi_log_v20_data', JSON.stringify(data));
}

async function requestWakeLock() {
    if ('wakeLock' in navigator) {
        try {
            wakeLock = await navigator.wakeLock.request('screen');
        } catch (err) {
            console.error(`${err.name}, ${err.message}`);
        }
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
    
    // セッション用の価格リストを初期化
    currentSessionPrices = [...p.prices];
    updatePriceSelectAndChips();

    plateCounts = {};
    actionHistory = []; 
    document.getElementById('output-area').innerHTML = ''; 
    document.getElementById('title-screen').classList.add('hidden');
    document.getElementById('main-screen').classList.remove('hidden');
    
    requestWakeLock();
    addLog(`${p.name} でのセッションを開始しました。`);
    updateAll();
}

// ★追加：セレクトボックスとチップを更新する共通関数
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
            actionHistory.push({ price: price, count: 1 });
            plateCounts[price] = (plateCounts[price] || 0) + 1;
            addLog(`${price}円のお皿を 1 枚追加しました。`);
            updateAll();
        };
        container.appendChild(btn);
    });
}

// ★追加：カスタム金額の追加処理
document.getElementById('add-custom-price-btn').onclick = () => {
    const inputField = document.getElementById('custom-price-input');
    const newPrice = parseInt(inputField.value);
    
    if (!newPrice || newPrice <= 0) {
        alert("正しい金額を入力してください");
        return;
    }
    
    if (!currentSessionPrices.includes(newPrice)) {
        currentSessionPrices.push(newPrice);
        currentSessionPrices.sort((a, b) => a - b); // 金額順に並び替え
        updatePriceSelectAndChips();
        addLog(`【新規】${newPrice}円のお皿をメニューに追加しました。`);
    }
    
    priceSelect.value = newPrice; // セレクトボックスを追加した金額に合わせる
    inputField.value = ''; // 入力欄をクリア
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

function undoLastAction() {
    if (actionHistory.length === 0) return;
    const last = actionHistory.pop();
    if (plateCounts[last.price]) {
        plateCounts[last.price] -= last.count;
        if (plateCounts[last.price] <= 0) delete plateCounts[last.price];
        addLog(`【取消】${last.price}円のお皿の操作を元に戻しました。`);
        updateAll();
    }
}

function addLog(message) {
    const outputArea = document.getElementById('output-area');
    const time = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    outputArea.innerHTML = `<div style="font-size: 0.9em; margin-bottom: 4px; border-bottom: 1px dashed var(--border); padding-bottom: 2px;">[${time}] ${message}</div>` + outputArea.innerHTML;
}

function updateAll() {
    const total = Object.entries(plateCounts).reduce((acc, [p, c]) => acc + (p * c), 0);
    document.getElementById('total-display').innerText = total.toLocaleString();
    updateTower();
    updateChart();
    updateTexts(total);
    updateStatsArea(total);
    updateHistoryArea();
}

function updateTower() {
    towerContainer.innerHTML = '';
    const color = presets[currentPresetIndex].color;
    let totalStacked = 0; // ★追加：積み上げた枚数のカウンター

    Object.entries(plateCounts).forEach(([price, count]) => {
        for (let i = 0; i < count; i++) {
            totalStacked++;
            const p = document.createElement('div');
            p.className = 'plate-visual';
            p.style.backgroundColor = color;
            p.style.opacity = Math.min(1.0, 0.5 + (price / 1000));
            towerContainer.appendChild(p);

            // ★追加：10枚ごとに目盛りを挿入
            if (totalStacked % 10 === 0) {
                const marker = document.createElement('div');
                marker.className = 'tower-marker';
                marker.innerHTML = `<span>${totalStacked}</span>`;
                towerContainer.appendChild(marker);
            }
        }
    });
}

function initChart() {
    const ctx = document.getElementById('price-chart').getContext('2d');
    myChart = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: [], datasets: [{ data: [], backgroundColor: ['#ff5252', '#448aff', '#4caf50', '#ffeb3b', '#9c27b0'] }] },
        options: { plugins: { legend: { display: false } }, cutout: '75%' } // cutoutを少し広げて文字を見やすく
    });
}

function updateChart() {
    myChart.data.labels = Object.keys(plateCounts).map(p => `${p}円`);
    myChart.data.datasets[0].data = Object.values(plateCounts);
    myChart.update();

    // ★追加：総枚数を計算して中央テキストに反映
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
        
        if (total > budget) {
            guide.innerText = "⚠️ 予算オーバーです！";
            guide.style.color = "var(--danger)";
        } else if (total > budget * 0.9) {
            guide.innerText = "🚨 まもなく予算到達です！";
            guide.style.color = "orange";
        } else {
            guide.innerText = "予算内です。";
            guide.style.color = "green";
        }
    } else {
        budgetDisp.innerText = "予算: 未設定";
        guide.style.display = 'none';
    }
}

function updateStatsArea(totalAmount) {
    let totalPlates = 0;
    let maxCount = 0;
    let mostEatenPrice = 0;

    for (const [price, count] of Object.entries(plateCounts)) {
        totalPlates += count;
        if (count > maxCount) {
            maxCount = count;
            mostEatenPrice = price;
        }
    }

    const statsArea = document.getElementById('stats-area');
    if (totalPlates > 0) {
        const averagePrice = (totalAmount / totalPlates).toFixed(1);
        statsArea.innerHTML = `
            <div><strong>総枚数:</strong> ${totalPlates} 枚</div>
            <div><strong>平均単価:</strong> ${averagePrice} 円</div>
            <div style="margin-top: 5px;"><strong>一番多く食べたお皿:</strong><br> ${mostEatenPrice}円 (${maxCount}枚)</div>
        `;
    } else {
        statsArea.innerHTML = "<div>お皿のデータがありません</div>";
    }
}

function updateHistoryArea() {
    const historyArea = document.getElementById('history-area');
    if (totalHistory.length === 0) {
        historyArea.innerHTML = "<div>過去のセッション記録はありません</div>";
        return;
    }
    historyArea.innerHTML = totalHistory.map((t, i) => `<div>セッション ${i + 1}: <strong>${t.toLocaleString()} 円</strong></div>`).join('');
}

document.getElementById('count-plus').onclick = () => plateCountInput.value++;
document.getElementById('count-minus').onclick = () => {
    if (plateCountInput.value > -99) plateCountInput.value--;
};

document.getElementById('add-plate-button').onclick = () => {
    const p = priceSelect.value;
    const c = parseInt(plateCountInput.value);
    
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
    
    if (wakeLock !== null) {
        wakeLock.release().then(() => { wakeLock = null; });
    }
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
        totalHistory.push(total);
        saveData();
        updateAll();
        addLog(`セッションを保存しました。合計: ${total.toLocaleString()}円`);
        alert("データを保存しました！");
    } else {
        alert("保存する金額がありません。");
    }
};

document.getElementById('reset-button').onclick = () => {
    if (confirm("現在のお皿のデータをリセットしますか？")) {
        const total = Object.entries(plateCounts).reduce((acc, [p, c]) => acc + (p * c), 0);
        if (total > 0) totalHistory.push(total); 
        
        plateCounts = {};
        actionHistory = [];
        saveData();
        updateAll();
        addLog("データをリセットしました。");
    }
};

document.getElementById('set-budget-button').onclick = () => {
    const val = prompt("予算設定（円）", budget === Infinity ? "" : budget);
    if (val !== null) { 
        budget = parseInt(val) || Infinity; 
        updateAll(); 
        addLog(`予算を ${budget === Infinity ? "未設定" : budget + "円"} に設定しました。`);
    }
};

document.getElementById('export-csv-button').onclick = () => {
    if (Object.keys(plateCounts).length === 0) {
        alert("出力するデータがありません。");
        return;
    }
    
    let csvContent = "data:text/csv;charset=utf-8,\uFEFF金額(円),枚数,小計(円)\n"; 
    let total = 0;
    
    for (const [price, count] of Object.entries(plateCounts)) {
        const subtotal = price * count;
        total += subtotal;
        csvContent += `${price},${count},${subtotal}\n`;
    }
    csvContent += `合計,,${total}\n`;
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    const dateStr = new Date().toISOString().slice(0,10).replace(/-/g, "");
    link.setAttribute("download", `sushilog_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    addLog("CSVファイルを出力しました。");
};