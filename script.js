// ==========================================
// 1. グローバル変数と状態管理
// ==========================================
let plateCounts = {};             // 食べたお皿の記録 {金額: 枚数}
let totalHistory = [];            // 過去のセッションの合計金額履歴
let actionHistory = [];           // Undo(取り消し)用の操作履歴
let budget = Infinity;            // 設定された予算
let myChart = null;               // Chart.jsのインスタンス
let wakeLock = null;              // 画面消灯防止用オブジェクト

let currentTotalAmount = 0;       // アニメーションカウントアップ用の一時保存金額
let platesAddedInLastAction = 0;  // 落下アニメーション制御用

// 店舗の初期プリセットデータ
let presets = [
    { name: "スシロー", color: "#d32f2f", prices: [120, 140, 180, 200, 260, 360] },
    { name: "くら寿司", color: "#2e7d32", prices: [110, 120, 130, 150, 170, 190, 210, 240, 270, 280, 390] },
    { name: "はま寿司", color: "#0277bd", prices: [110, 132, 176, 231, 319] }
];
let currentPresetIndex = 0;       // 現在選択されている店舗のインデックス
let currentSessionPrices = [];    // 現在のセッションで有効な価格リスト（カスタム追加用）

// 頻繁にアクセスするDOM要素
const priceSelect = document.getElementById('price-select');
const plateCountInput = document.getElementById('plate-count');
const towerContainer = document.getElementById('sushi-tower');


// ==========================================
// 2. 初期化・ユーティリティ関数
// ==========================================

window.onload = () => {
    loadData();
    renderPresetChips();
    initChart();
    // ダークモードの復元
    if(localStorage.getItem('theme') === 'dark') document.body.setAttribute('data-theme', 'dark');
};

// XSS（スクリプトインジェクション）対策：HTML特殊文字を無害化する
function escapeHTML(str) {
    return String(str).replace(/[&<>'"]/g, function(match) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[match];
    });
}

// スマホのバイブレーション（振動）を呼び出す
function triggerVibrate(ms) {
    if (navigator.vibrate) navigator.vibrate(ms);
}

// データの読み込み (v29から順に古いデータを探す)
function loadData() {
    let saved = localStorage.getItem('sushi_log_v29_data') || 
                localStorage.getItem('sushi_log_v28_data') || 
                localStorage.getItem('sushi_log_v27_data');
    if (saved) {
        const data = JSON.parse(saved);
        presets = data.presets || presets;
        totalHistory = data.totalHistory || [];
    }
}

// データの保存
function saveData() {
    const data = { presets, totalHistory };
    localStorage.setItem('sushi_log_v29_data', JSON.stringify(data));
}

// 画面の自動消灯をブロックするリクエスト
async function requestWakeLock() {
    if ('wakeLock' in navigator) {
        try { wakeLock = await navigator.wakeLock.request('screen'); } 
        catch (err) { console.error(`${err.name}, ${err.message}`); }
    }
}


// ==========================================
// 3. 画面の遷移・描画処理
// ==========================================

// タイトル画面：店舗ボタンの生成
function renderPresetChips() {
    const container = document.getElementById('preset-selector');
    container.innerHTML = '';
    presets.forEach((p, i) => {
        const btn = document.createElement('div');
        btn.className = 'preset-chip';
        btn.style.borderLeft = `5px solid ${escapeHTML(p.color)}`;
        btn.innerHTML = `<strong>${escapeHTML(p.name)}</strong><br><small>${p.prices.join('円, ')}円</small>`;
        btn.onclick = () => {
            currentPresetIndex = i;
            triggerVibrate(30);
            startSession();
        };
        container.appendChild(btn);
    });
}

// お店を選んでセッション開始
function startSession() {
    const p = presets[currentPresetIndex];
    document.getElementById('current-shop-name').innerText = escapeHTML(p.name);
    document.getElementById('app-bar').style.borderBottom = `4px solid ${escapeHTML(p.color)}`;
    document.documentElement.style.setProperty('--primary', escapeHTML(p.color));
    
    currentSessionPrices = [...p.prices];
    updatePriceSelectAndChips();

    plateCounts = {};
    actionHistory = []; 
    currentTotalAmount = 0;
    
    // お会計計算エリアのリセット
    document.getElementById('discount-val').value = '';
    document.getElementById('split-count').value = '1';

    document.getElementById('output-area').innerHTML = ''; 
    document.getElementById('title-screen').classList.add('hidden');
    document.getElementById('main-screen').classList.remove('hidden');
    
    requestWakeLock();
    addLog(`${escapeHTML(p.name)} でのセッションを開始しました。`);
    updateAll(); // 全画面更新
}

// ドロップダウンとクイック追加ボタン（チップ）の更新
function updatePriceSelectAndChips() {
    priceSelect.innerHTML = '';
    currentSessionPrices.forEach(price => {
        const opt = document.createElement('option');
        opt.value = price;
        opt.innerText = `${price}円`;
        priceSelect.appendChild(opt);
    });
    
    const container = document.getElementById('quick-add-buttons');
    container.innerHTML = '';
    currentSessionPrices.forEach(price => {
        const btn = document.createElement('button');
        btn.className = 'chip';
        btn.innerText = `+${price}円`;
        btn.onclick = () => {
            triggerVibrate(40); 
            platesAddedInLastAction = 1; // 落下アニメーションの対象は1枚
            actionHistory.push({ price: price, count: 1 });
            plateCounts[price] = (plateCounts[price] || 0) + 1;
            addLog(`${price}円のお皿を 1 枚追加しました。`);
            updateAll();
        };
        container.appendChild(btn);
    });
}


// ==========================================
// 4. データ更新・計算処理（コアロジック）
// ==========================================

// すべてのUI（タワー、グラフ、金額、ログ）を最新状態に更新する
function updateAll() {
    const total = Object.entries(plateCounts).reduce((acc, [p, c]) => acc + (p * c), 0);
    
    // 合計金額のカウントアップアニメーション
    const totalDisplay = document.getElementById('total-display');
    animateValue(totalDisplay, currentTotalAmount, total, 600);
    currentTotalAmount = total;

    updateTower();
    updateChart();
    updateTexts(total);
    updateStatsArea(total);
    updateHistoryArea();
    updateCheckoutArea(total);
}

// お皿タワーの描画とアニメーション
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

    // 最後に追加された枚数分だけ落下アニメーション用のクラスを付与
    if (platesAddedInLastAction > 0 && domPlates.length >= platesAddedInLastAction) {
        for (let i = domPlates.length - platesAddedInLastAction; i < domPlates.length; i++) {
            domPlates[i].classList.add('drop-in');
        }
    }
    
    // 画面下部に押し付けるためのスペーサー
    const spacer = document.createElement('div');
    spacer.style.marginTop = 'auto';
    towerContainer.appendChild(spacer);

    // 配列の後ろ（新しい皿）から順に上から積んでいく
    for (let i = domPlates.length - 1; i >= 0; i--) {
        domPlates[i].style.zIndex = i + 1;
        towerContainer.appendChild(domPlates[i]);
        
        // 10枚ごとにマーカーを挿入
        if ((i + 1) % 10 === 0) {
            const marker = document.createElement('div');
            marker.className = 'tower-marker';
            marker.innerHTML = `<span>${i + 1}</span>`;
            towerContainer.appendChild(marker);
        }
    }

    // 要素追加後、スクロール位置を一番上にリセット
    if (platesAddedInLastAction > 0) {
        setTimeout(() => towerContainer.scrollTo({ top: 0, behavior: 'smooth' }), 50);
    }
    platesAddedInLastAction = 0; // アニメフラグのリセット
}

// 円グラフの初期化と更新
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

// 内訳テキスト・予算ガイドの更新
function updateTexts(total) {
    const summaryArea = document.getElementById('summary-area');
    const undoBtnHtml = actionHistory.length > 0 
        ? `<button onclick="undoLastAction()" class="btn-outline" style="width:100%; margin-bottom:10px; cursor:pointer;">↩️ 1つ取り消す</button>` : '';
        
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

// 統計情報（平均単価など）の更新
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

// お会計（割り勘・割引）のリアルタイム計算
function updateCheckoutArea(total) {
    const discountVal = parseFloat(document.getElementById('discount-val').value) || 0;
    const discountType = document.getElementById('discount-type').value;
    let splitCount = parseInt(document.getElementById('split-count').value) || 1;
    if (splitCount < 1) splitCount = 1;

    let discountedTotal = total;
    if (discountType === 'yen') discountedTotal -= discountVal;
    else if (discountType === 'percent') discountedTotal -= total * (discountVal / 100);
    
    if (discountedTotal < 0) discountedTotal = 0;
    
    const perPerson = Math.ceil(discountedTotal / splitCount);

    document.getElementById('discounted-total').innerText = Math.floor(discountedTotal).toLocaleString();
    document.getElementById('per-person-amount').innerText = perPerson.toLocaleString();
}


// ==========================================
// 5. 各種アクション・イベントリスナー
// ==========================================

// ログの出力
function addLog(message) {
    const outputArea = document.getElementById('output-area');
    const time = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    outputArea.innerHTML = `<div style="font-size: 0.9em; margin-bottom: 4px; border-bottom: 1px dashed var(--border); padding-bottom: 2px;">[${time}] ${message}</div>` + outputArea.innerHTML;
}

// 1つ取り消す（Undo）
function undoLastAction() {
    if (actionHistory.length === 0) return;
    const last = actionHistory.pop();
    if (plateCounts[last.price]) {
        plateCounts[last.price] -= last.count;
        if (plateCounts[last.price] <= 0) delete plateCounts[last.price];
        platesAddedInLastAction = 0; 
        addLog(`【取消】${last.price}円のお皿の操作を元に戻しました。`);
        triggerVibrate(30);
        updateAll();
    }
}

// 数字のカウントアップアニメーション
function animateValue(obj, start, end, duration) {
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const easeOutQuart = 1 - Math.pow(1 - progress, 4); // 滑らかな減速イージング
        obj.innerHTML = Math.floor(start + easeOutQuart * (end - start)).toLocaleString();
        if (progress < 1) window.requestAnimationFrame(step);
    };
    window.requestAnimationFrame(step);
}

// 新規カスタム金額の追加ボタン
document.getElementById('add-custom-price-btn').onclick = () => {
    const inputField = document.getElementById('custom-price-input');
    const newPrice = parseInt(inputField.value);
    if (!newPrice || newPrice <= 0) { alert("正しい金額を入力してください"); return; }
    
    if (!currentSessionPrices.includes(newPrice)) {
        currentSessionPrices.push(newPrice);
        currentSessionPrices.sort((a, b) => a - b);
        updatePriceSelectAndChips();
        addLog(`【新規】${escapeHTML(newPrice)}円のお皿を追加しました。`);
    }
    priceSelect.value = newPrice;
    inputField.value = '';
    triggerVibrate(30);
};

// お会計計算エリアの入力監視（即時反映用）
document.getElementById('discount-val').addEventListener('input', () => updateAll());
document.getElementById('discount-type').addEventListener('change', () => updateAll());
document.getElementById('split-count').addEventListener('input', () => updateAll());

// 枚数の増減ステッパー
document.getElementById('count-plus').onclick = () => { plateCountInput.value++; triggerVibrate(20); };
document.getElementById('count-minus').onclick = () => { if (plateCountInput.value > -99) plateCountInput.value--; triggerVibrate(20); };

// メインの「お皿を確定」ボタン
document.getElementById('add-plate-button').onclick = () => {
    triggerVibrate(50); 
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

// ==========================================
// 6. モーダルとヘッダーの制御
// ==========================================

// ★設定モーダル
document.getElementById('open-settings').onclick = () => {
    const list = document.getElementById('settings-list');
    list.innerHTML = '';
    presets.forEach((p, i) => {
        const div = document.createElement('div');
        div.className = 'settings-item card';
        div.innerHTML = `
            <input type="text" value="${escapeHTML(p.name)}" onchange="presets[${i}].name=this.value">
            <div style="display:flex; gap:8px; margin-top:8px;">
                <input type="color" value="${escapeHTML(p.color)}" onchange="presets[${i}].color=this.value">
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
    document.getElementById('open-settings').click(); // 再描画
};
document.getElementById('close-settings').onclick = () => {
    saveData();
    renderPresetChips();
    document.getElementById('settings-modal').classList.add('hidden');
};

// ★ヘルプ・About・管理メニュー等の共通開閉処理
const openHelp = () => document.getElementById('help-modal').classList.remove('hidden');
document.getElementById('help-button').onclick = openHelp;
document.getElementById('title-help-button').onclick = openHelp;
document.getElementById('close-help').onclick = () => document.getElementById('help-modal').classList.add('hidden');

// タイトル画面のAbout(このアプリについて)
document.getElementById('title-about-button').onclick = () => document.getElementById('about-modal').classList.remove('hidden');
document.getElementById('close-about').onclick = () => document.getElementById('about-modal').classList.add('hidden');

// 管理メニュー
document.getElementById('action-menu-button').onclick = () => document.getElementById('action-menu-modal').classList.remove('hidden');
document.getElementById('close-action-menu').onclick = () => document.getElementById('action-menu-modal').classList.add('hidden');

// タイトルに戻る
document.getElementById('back-to-title').onclick = () => {
    document.getElementById('main-screen').classList.add('hidden');
    document.getElementById('title-screen').classList.remove('hidden');
    document.documentElement.style.setProperty('--primary', '#d32f2f');
    if (wakeLock !== null) wakeLock.release().then(() => { wakeLock = null; });
};

// ★テーマ切替の共通処理
const toggleTheme = () => {
    const isDark = document.body.hasAttribute('data-theme');
    if (isDark) document.body.removeAttribute('data-theme');
    else document.body.setAttribute('data-theme', 'dark');
    localStorage.setItem('theme', isDark ? 'light' : 'dark');
};
document.getElementById('theme-toggle').onclick = toggleTheme;
document.getElementById('title-theme-toggle').onclick = toggleTheme;


// メニュー内の個別機能（保存・リセット・CSV等）
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