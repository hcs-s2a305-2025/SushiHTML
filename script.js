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
    const saved = localStorage.getItem('sushi_log_v19_data');
    if (saved) {
        const data = JSON.parse(saved);
        presets = data.presets || presets;
        totalHistory = data.totalHistory || [];
    }
}

function saveData() {
    const data = { presets, totalHistory };
    localStorage.setItem('sushi_log_v19_data', JSON.stringify(data));
}

// ★追加：画面消灯を防ぐ関数
async function requestWakeLock() {
    if ('wakeLock' in navigator) {
        try {
            wakeLock = await navigator.wakeLock.request('screen');
        } catch (err) {
            console.error(`${err.name}, ${err.message}`);
        }
    }
}

// プリセット選択画面の描画
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
    
    priceSelect.innerHTML = '';
    p.prices.forEach(price => {
        const opt = document.createElement('option');
        opt.value = price;
        opt.innerText = `${price}円`;
        priceSelect.appendChild(opt);
    });

    renderQuickAddButtons(p.prices);

    plateCounts = {};
    actionHistory = []; // 履歴リセット
    document.getElementById('title-screen').classList.add('hidden');
    document.getElementById('main-screen').classList.remove('hidden');
    
    requestWakeLock(); // ★追加：セッション開始時に常時点灯リクエスト
    updateAll();
}

// クイック追加ボタンを描画
function renderQuickAddButtons(prices) {
    const container = document.getElementById('quick-add-buttons');
    container.innerHTML = '';
    prices.forEach(price => {
        const btn = document.createElement('button');
        btn.className = 'chip';
        btn.innerText = `+${price}円`;
        btn.onclick = () => {
            // ★変更：履歴に追加
            actionHistory.push({ price: price, count: 1 });
            plateCounts[price] = (plateCounts[price] || 0) + 1;
            updateAll();
        };
        container.appendChild(btn);
    });
}

// 設定モーダルの制御
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

// ★追加：Undo（1手戻す）関数
function undoLastAction() {
    if (actionHistory.length === 0) return;
    const last = actionHistory.pop();
    if (plateCounts[last.price]) {
        plateCounts[last.price] -= last.count;
        if (plateCounts[last.price] <= 0) delete plateCounts[last.price];
        updateAll();
    }
}

// 共通更新処理
function updateAll() {
    const total = Object.entries(plateCounts).reduce((acc, [p, c]) => acc + (p * c), 0);
    document.getElementById('total-display').innerText = total.toLocaleString();
    updateTower();
    updateChart();
    updateTexts(total);
}

function updateTower() {
    towerContainer.innerHTML = '';
    const color = presets[currentPresetIndex].color;
    Object.entries(plateCounts).forEach(([price, count]) => {
        for (let i = 0; i < count; i++) {
            const p = document.createElement('div');
            p.className = 'plate-visual';
            p.style.backgroundColor = color;
            p.style.opacity = 0.5 + (price / 1000); 
            towerContainer.appendChild(p);
        }
    });
}

function initChart() {
    const ctx = document.getElementById('price-chart').getContext('2d');
    myChart = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: [], datasets: [{ data: [], backgroundColor: ['#ff5252', '#448aff', '#4caf50', '#ffeb3b', '#9c27b0'] }] },
        options: { plugins: { legend: { display: false } }, cutout: '70%' }
    });
}

function updateChart() {
    myChart.data.labels = Object.keys(plateCounts).map(p => `${p}円`);
    myChart.data.datasets[0].data = Object.values(plateCounts);
    myChart.update();
}

function updateTexts(total) {
    // ★変更：Undoボタンを動的に表示
    const summaryArea = document.getElementById('summary-area');
    const undoBtnHtml = actionHistory.length > 0 
        ? `<button onclick="undoLastAction()" class="btn-outline" style="width:100%; margin-bottom:10px; cursor:pointer;">↩️ 1つ取り消す</button>` 
        : '';
        
    summaryArea.innerHTML = undoBtnHtml + Object.entries(plateCounts)
        .map(([p, c]) => `<div>${p}円 x ${c}枚 = ${p*c}円</div>`).join('');
    
    const budgetDisp = document.getElementById('budget-display');
    const guide = document.getElementById('budget-guide');
    if (budget !== Infinity) {
        budgetDisp.innerText = `予算: ${budget}円 (残: ${budget - total}円)`;
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

// ボタン操作
document.getElementById('count-plus').onclick = () => plateCountInput.value++;
document.getElementById('count-minus').onclick = () => {
    if (plateCountInput.value > -99) plateCountInput.value--;
};

document.getElementById('add-plate-button').onclick = () => {
    const p = priceSelect.value;
    const c = parseInt(plateCountInput.value);
    
    // ★変更：履歴に追加
    actionHistory.push({ price: p, count: c });
    
    plateCounts[p] = (plateCounts[p] || 0) + c;
    if (plateCounts[p] <= 0) delete plateCounts[p];
    
    updateAll();
    plateCountInput.value = 1;
};

document.getElementById('back-to-title').onclick = () => {
    document.getElementById('main-screen').classList.add('hidden');
    document.getElementById('title-screen').classList.remove('hidden');
    document.documentElement.style.setProperty('--primary', '#d32f2f');
    
    // ★追加：タイトルに戻る際はWake Lockを解除
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

document.getElementById('reset-button').onclick = () => {
    if (confirm("リセットしますか？")) {
        plateCounts = {};
        actionHistory = [];
        updateAll();
    }
};

document.getElementById('set-budget-button').onclick = () => {
    const val = prompt("予算設定（円）", budget === Infinity ? "" : budget);
    if (val !== null) { budget = parseInt(val) || Infinity; updateAll(); }
};