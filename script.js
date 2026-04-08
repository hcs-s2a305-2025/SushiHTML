// ==========================================
// 1. グローバル変数と状態管理
// ==========================================
let plateCounts = {};             // 食べたお皿の記録（例: { 120: 3 } => 120円が3枚）
let totalHistory = [];            // 過去の食事履歴（日付、店名、金額）を保存する配列
let actionHistory = [];           // 「1つ取り消す(Undo)」機能のための操作履歴
let budget = Infinity;            // 設定された予算（初期値は無限大 = 未設定）
let myChart = null;               // Chart.js（円グラフ）の本体を格納する変数
let wakeLock = null;              // スマホ画面の消灯を防ぐためのオブジェクト

let currentTotalAmount = 0;       // アニメーション用の現在金額
let platesAddedInLastAction = 0;  // お皿落下アニメーション用の追加枚数記録

// 初期から用意されているお店のデータ（プリセット）
let presets = [
    { name: "スシロー", color: "#d32f2f", prices: [120, 140, 180, 200, 260, 360] },
    { name: "くら寿司", color: "#2e7d32", prices: [110, 120, 130, 150, 170, 190, 210, 240, 270, 280, 390] },
    { name: "はま寿司", color: "#0277bd", prices: [110, 132, 176, 231, 319] }
];
let currentPresetIndex = 0;       // 現在選ばれているお店の番号
let currentSessionPrices = [];    // 現在のお店で有効な金額リスト

// DOM要素のキャッシュ
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
    
    // ダークモード設定の復元
    if (localStorage.getItem('theme') === 'dark') {
        document.body.setAttribute('data-theme', 'dark');
    }

    // PWA: Service Workerの登録
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').catch(err => console.log('SW登録失敗:', err));
    }

    // 全ての数値入力欄で、タップ時に自動で全選択する（入力しやすくする）
    document.querySelectorAll('input[type="number"]').forEach(input => {
        input.addEventListener('focus', function() {
            this.select();
        });
    });
};

// XSS対策（特殊文字のエスケープ）
function escapeHTML(str) {
    return String(str).replace(/[&<>'"]/g, match => {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[match];
    });
}

// スマホのバイブレーション機能
function triggerVibrate(ms) { 
    if (navigator.vibrate) {
        navigator.vibrate(ms);
    }
}

// ローカルストレージからデータを読み込む
function loadData() {
    const saved = localStorage.getItem('sushi_log_app_data'); 
    if (saved) {
        try {
            const data = JSON.parse(saved);
            presets = data.presets || presets;
            totalHistory = data.totalHistory || [];
        } catch (e) { 
            console.error("データの読み込みに失敗:", e); 
        }
    }
}

// ローカルストレージにデータを保存する
function saveData() { 
    localStorage.setItem('sushi_log_app_data', JSON.stringify({ presets, totalHistory })); 
}

// 画面の自動消灯をブロックする
async function requestWakeLock() {
    if ('wakeLock' in navigator) {
        try { 
            wakeLock = await navigator.wakeLock.request('screen'); 
        } catch (err) {
            console.error("WakeLockエラー:", err);
        }
    }
}


// ==========================================
// 3. カスタムUI（ポップアップの代わり）
// ==========================================

// 画面下からフワッと出る通知メッセージ
function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast-msg';
    toast.innerText = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}

// 確認用モーダル (標準の confirm の代わり)
function showConfirm(msg, onOk) {
    document.getElementById('custom-confirm-msg').innerText = msg;
    const modal = document.getElementById('custom-confirm-modal');
    modal.classList.remove('hidden');
    
    document.getElementById('custom-confirm-cancel').onclick = () => {
        modal.classList.add('hidden');
    };
    
    document.getElementById('custom-confirm-ok').onclick = () => { 
        modal.classList.add('hidden'); 
        onOk(); 
    };
}

// 入力用モーダル (標準の prompt の代わり)
function showPrompt(msg, defaultValue, onOk) {
    document.getElementById('custom-prompt-msg').innerText = msg;
    const input = document.getElementById('custom-prompt-input');
    input.value = defaultValue;
    const modal = document.getElementById('custom-prompt-modal');
    modal.classList.remove('hidden');
    
    // 開いた瞬間にフォーカスを当てる
    setTimeout(() => input.focus(), 100);
    
    document.getElementById('custom-prompt-cancel').onclick = () => {
        modal.classList.add('hidden');
    };
    
    document.getElementById('custom-prompt-ok').onclick = () => { 
        modal.classList.add('hidden'); 
        onOk(input.value); 
    };
}


// ==========================================
// 4. 画面の遷移・描画処理
// ==========================================

// タイトル画面の「お店を選ぶボタン」を生成
function renderPresetChips() {
    const container = document.getElementById('preset-selector');
    container.innerHTML = '';
    
    presets.forEach((preset, index) => {
        const btn = document.createElement('div');
        btn.className = 'preset-chip';
        btn.style.borderLeft = `5px solid ${escapeHTML(preset.color)}`;
        btn.innerHTML = `<strong>${escapeHTML(preset.name)}</strong><br><small>${preset.prices.join('円, ')}円</small>`;
        
        btn.onclick = () => { 
            currentPresetIndex = index; 
            triggerVibrate(30); 
            startSession(); 
        };
        container.appendChild(btn);
    });
}

// 食事記録を開始する
function startSession() {
    const preset = presets[currentPresetIndex];
    document.getElementById('current-shop-name').innerText = escapeHTML(preset.name);
    document.getElementById('app-bar').style.borderBottom = `4px solid ${escapeHTML(preset.color)}`;
    document.documentElement.style.setProperty('--primary', escapeHTML(preset.color));
    
    currentSessionPrices = [...preset.prices];
    updatePriceSelectAndChips();

    // データの初期化
    plateCounts = {}; 
    actionHistory = []; 
    currentTotalAmount = 0;
    
    // お会計モーダルの入力をリセット
    document.getElementById('checkout-discount').value = '0';
    document.getElementById('checkout-split').value = '1';
    document.getElementById('checkout-late-night').checked = false;
    document.getElementById('checkout-tax').checked = false;
    document.getElementById('rate-late-night').value = '10'; 
    document.getElementById('rate-tax').value = '10';

    document.getElementById('output-area').innerHTML = ''; 
    document.getElementById('title-screen').classList.add('hidden');
    document.getElementById('main-screen').classList.remove('hidden');
    
    requestWakeLock();
    addLog(`${escapeHTML(preset.name)} での記録を開始しました。`);
    updateAll(); 
}

// 単価のプルダウンとクイック追加ボタンの更新
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
            applyPlateChange(price, 1); 
        };
        container.appendChild(btn);
    });
}


// ==========================================
// 5. データ更新・計算処理（コアロジック）
// ==========================================

// すべての表示を最新状態に更新する
function updateAll() {
    const total = Object.entries(plateCounts).reduce((acc, [price, count]) => acc + (price * count), 0);
    
    // 合計金額のアニメーション
    animateValue(document.getElementById('total-display'), currentTotalAmount, total, 600);
    currentTotalAmount = total;

    updateTower(); 
    updateChart(); 
    updateTexts(total); 
    updateStatsArea(total); 
    updateHistoryArea();
}

// お皿タワーの描画
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

    // 直近で追加されたお皿に落下アニメーションを付与
    if (platesAddedInLastAction > 0 && domPlates.length >= platesAddedInLastAction) {
        for (let i = domPlates.length - platesAddedInLastAction; i < domPlates.length; i++) {
            domPlates[i].classList.add('drop-in');
        }
    }
    
    const spacer = document.createElement('div');
    spacer.style.marginTop = 'auto';
    towerContainer.appendChild(spacer);

    // 下から順に配置
    for (let i = domPlates.length - 1; i >= 0; i--) {
        domPlates[i].style.zIndex = i + 1;
        towerContainer.appendChild(domPlates[i]);
        
        // 10枚ごとにマーカーを表示
        if ((i + 1) % 10 === 0) {
            const marker = document.createElement('div');
            marker.className = 'tower-marker'; 
            marker.innerHTML = `<span>${i + 1}</span>`;
            towerContainer.appendChild(marker);
        }
    }

    if (platesAddedInLastAction > 0) {
        setTimeout(() => towerContainer.scrollTo({ top: 0, behavior: 'smooth' }), 50);
    }
    platesAddedInLastAction = 0; 
}

// 円グラフの初期化
function initChart() {
    const ctx = document.getElementById('price-chart').getContext('2d');
    myChart = new Chart(ctx, {
        type: 'doughnut', 
        data: { 
            labels: [], 
            datasets: [{ 
                data: [], 
                backgroundColor: ['#ff5252', '#448aff', '#4caf50', '#ffeb3b', '#9c27b0'] 
            }] 
        },
        options: { 
            plugins: { legend: { display: false } }, 
            cutout: '75%', 
            animation: { duration: 500 } 
        }
    });
}

// 円グラフの更新
function updateChart() {
    myChart.data.labels = Object.keys(plateCounts).map(price => `${price}円`);
    myChart.data.datasets[0].data = Object.values(plateCounts);
    myChart.update();
    
    // 中央のテキスト（合計枚数）を更新
    const totalPlates = Object.values(plateCounts).reduce((a, b) => a + b, 0);
    document.getElementById('chart-center-text').innerText = `${totalPlates}枚`;
}

// 内訳と予算アラートの更新
function updateTexts(total) {
    const summaryArea = document.getElementById('summary-area');
    const undoBtnHtml = actionHistory.length > 0 
        ? `<button onclick="undoLastAction()" class="btn-outline" style="width:100%; margin-bottom:10px;">↩️ 1つ取り消す</button>` 
        : '';
        
    summaryArea.innerHTML = undoBtnHtml + Object.entries(plateCounts)
        .map(([price, count]) => `<div>${price}円 x ${count}枚 = ${(price * count).toLocaleString()}円</div>`)
        .join('');
    
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

// 統計情報の更新
function updateStatsArea(totalAmount) {
    let totalPlates = 0, maxCount = 0, mostEatenPrice = 0;
    
    for (const [price, count] of Object.entries(plateCounts)) {
        totalPlates += count;
        if (count > maxCount) { 
            maxCount = count; 
            mostEatenPrice = price; 
        }
    }
    
    const statsArea = document.getElementById('stats-area');
    if (totalPlates > 0) {
        statsArea.innerHTML = `
            <div><strong>総枚数:</strong> ${totalPlates} 枚</div>
            <div><strong>平均単価:</strong> ${(totalAmount / totalPlates).toFixed(1)} 円</div>
            <div style="margin-top: 5px;"><strong>一番多く食べたお皿:</strong><br> ${mostEatenPrice}円 (${maxCount}枚)</div>
        `;
    } else { 
        statsArea.innerHTML = "<div>データがありません</div>"; 
    }
}

// 履歴の更新
function updateHistoryArea() {
    const historyArea = document.getElementById('history-area');
    if (totalHistory.length === 0) { 
        historyArea.innerHTML = "<div>過去の記録はありません</div>"; 
        return; 
    }
    
    historyArea.innerHTML = totalHistory.map(item => {
        // 古いバージョンのデータ（数値のみ）への対応
        if (typeof item === 'number') {
            return `<div>[旧データ]: <strong>${item.toLocaleString()} 円</strong></div>`;
        }
        // 新しい形式のデータ（日付や店舗名あり）
        return `
            <div style="font-size:0.85rem; padding: 4px 0; border-bottom:1px solid var(--border);">
                <span style="color:var(--text-sub)">${escapeHTML(item.date)} (${escapeHTML(item.shop)})</span><br>
                <strong style="font-size:1.1rem">${item.total.toLocaleString()} 円</strong>
            </div>`;
    }).join('');
}


// ==========================================
// 6. 各種アクション・ユーザー操作の処理
// ==========================================

// ログの追加
function addLog(message) {
    const outputArea = document.getElementById('output-area');
    const time = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    outputArea.innerHTML = `
        <div style="font-size: 0.9em; margin-bottom: 4px; border-bottom: 1px dashed var(--border); padding-bottom: 2px;">
            [${time}] ${message}
        </div>` + outputArea.innerHTML;
}

// お皿の削除アニメーション
function removePlateWithAnimation(price, callback) {
    const visualPlates = document.getElementById('sushi-tower').children;
    let target = null;
    
    for (let i = 0; i < visualPlates.length; i++) {
        if (visualPlates[i].classList.contains('plate-visual')) { 
            target = visualPlates[i]; 
            break; 
        }
    }
    
    if (target) {
        target.classList.add('pop-out'); 
        triggerVibrate(30);
        setTimeout(callback, 200); 
    } else { 
        callback(); 
    }
}

// お皿の追加・削除のコア処理
function applyPlateChange(price, count) {
    platesAddedInLastAction = count > 0 ? count : 0;
    actionHistory.push({ price: price, count: count });
    
    plateCounts[price] = (plateCounts[price] || 0) + count;
    // 枚数が0以下になったらデータを削除
    if (plateCounts[price] <= 0) {
        delete plateCounts[price]; 
    }
    
    addLog(`${price}円のお皿を ${Math.abs(count)} 枚${count > 0 ? "追加" : "削除"}しました。`);
    updateAll();
    
    // 入力欄を1に戻す
    document.getElementById('plate-count').value = 1; 
}

// 操作の取り消し（Undo）
window.undoLastAction = function() {
    if (actionHistory.length === 0) return;
    
    const last = actionHistory.pop(); 
    if (plateCounts[last.price]) {
        removePlateWithAnimation(last.price, () => {
            plateCounts[last.price] -= last.count; 
            if (plateCounts[last.price] <= 0) {
                delete plateCounts[last.price]; 
            }
            platesAddedInLastAction = 0; 
            addLog(`【取消】${last.price}円の操作を元に戻しました。`);
            updateAll();
        });
    }
};

// 金額のカウントアップアニメーション
function animateValue(obj, start, end, duration) {
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const easeOutQuart = 1 - Math.pow(1 - progress, 4);
        obj.innerHTML = Math.floor(start + easeOutQuart * (end - start)).toLocaleString();
        
        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    };
    window.requestAnimationFrame(step);
}

// 新規金額の追加ボタン
document.getElementById('add-custom-price-btn').onclick = () => {
    const inputField = document.getElementById('custom-price-input');
    const newPrice = parseInt(inputField.value);
    
    if (!newPrice || newPrice <= 0) { 
        showToast("⚠️ 正しい金額を入力してください"); 
        return; 
    }
    
    if (!currentSessionPrices.includes(newPrice)) {
        currentSessionPrices.push(newPrice);
        currentSessionPrices.sort((a, b) => a - b);
        updatePriceSelectAndChips(); 
        addLog(`【新規】${escapeHTML(newPrice)}円を追加しました。`);
    }
    
    document.getElementById('price-select').value = newPrice; 
    inputField.value = ''; 
    triggerVibrate(30);
};

// 枚数の＋－ボタン
document.getElementById('count-plus').onclick = () => { 
    document.getElementById('plate-count').value++; 
    triggerVibrate(20); 
};
document.getElementById('count-minus').onclick = () => { 
    if (document.getElementById('plate-count').value > -99) {
        document.getElementById('plate-count').value--; 
    }
    triggerVibrate(20); 
};

// お皿を確定ボタン
document.getElementById('add-plate-button').onclick = () => {
    const price = document.getElementById('price-select').value;
    const count = parseInt(document.getElementById('plate-count').value);
    
    if (isNaN(count) || count === 0) return; 

    if (count < 0) { 
        removePlateWithAnimation(price, () => applyPlateChange(price, count)); 
    } else { 
        triggerVibrate(50); 
        applyPlateChange(price, count); 
    }
};


// ==========================================
// 7. モーダルと管理設定の制御
// ==========================================

// プリセット（お店）の編集
document.getElementById('open-settings').onclick = () => {
    const list = document.getElementById('settings-list');
    list.innerHTML = '';
    
    presets.forEach((preset, index) => {
        const div = document.createElement('div');
        div.className = 'settings-item card';
        div.innerHTML = `
            <input type="text" value="${escapeHTML(preset.name)}" onchange="presets[${index}].name=this.value">
            <div style="display:flex; gap:8px; margin-top:8px;">
                <input type="color" value="${escapeHTML(preset.color)}" onchange="presets[${index}].color=this.value">
                <input type="text" value="${preset.prices.join(',')}" onchange="presets[${index}].prices=this.value.split(',').map(Number)">
                <button class="btn-danger-small" onclick="presets.splice(${index},1); document.getElementById('open-settings').click();">削除</button>
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

// ヘルプ・アバウト・管理メニューの開閉
const openHelp = () => document.getElementById('help-modal').classList.remove('hidden');
document.getElementById('help-button').onclick = openHelp; 
document.getElementById('title-help-button').onclick = openHelp;
document.getElementById('close-help').onclick = () => document.getElementById('help-modal').classList.add('hidden');

document.getElementById('title-about-button').onclick = () => document.getElementById('about-modal').classList.remove('hidden');
document.getElementById('close-about').onclick = () => document.getElementById('about-modal').classList.add('hidden');

document.getElementById('action-menu-button').onclick = () => document.getElementById('action-menu-modal').classList.remove('hidden');
document.getElementById('close-action-menu').onclick = () => document.getElementById('action-menu-modal').classList.add('hidden');

// タイトル画面に戻る
document.getElementById('back-to-title').onclick = () => {
    document.getElementById('main-screen').classList.add('hidden');
    document.getElementById('title-screen').classList.remove('hidden');
    document.documentElement.style.setProperty('--primary', '#d32f2f'); 
    if (wakeLock !== null) {
        wakeLock.release().then(() => { wakeLock = null; });
    }
};

// ダークモードの切り替え
const toggleTheme = () => {
    const isDark = document.body.hasAttribute('data-theme');
    if (isDark) {
        document.body.removeAttribute('data-theme');
    } else {
        document.body.setAttribute('data-theme', 'dark');
    }
    localStorage.setItem('theme', isDark ? 'light' : 'dark');
};
document.getElementById('theme-toggle').onclick = toggleTheme; 
document.getElementById('title-theme-toggle').onclick = toggleTheme;

// 管理メニュー：保存
document.getElementById('save-button').onclick = () => {
    document.getElementById('close-action-menu').click();
    
    if (currentTotalAmount > 0) {
        const now = new Date();
        const dateStr = `${now.getFullYear()}/${now.getMonth()+1}/${now.getDate()} ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
        totalHistory.unshift({ date: dateStr, shop: presets[currentPresetIndex].name, total: currentTotalAmount }); 
        
        saveData(); 
        updateAll();
        addLog(`セッションを保存しました。`); 
        showToast("✅ データを保存しました");
    } else { 
        showToast("⚠️ 保存するデータがありません"); 
    }
};

// 管理メニュー：リセット
document.getElementById('reset-button').onclick = () => {
    document.getElementById('close-action-menu').click();
    
    showConfirm("現在のお皿のデータをリセットしますか？", () => {
        plateCounts = {}; 
        actionHistory = []; 
        currentTotalAmount = 0; 
        
        saveData(); 
        updateAll(); 
        addLog("データをリセットしました。"); 
        showToast("♻️ データをリセットしました");
    });
};

// 管理メニュー：予算設定
document.getElementById('set-budget-button').onclick = () => {
    document.getElementById('close-action-menu').click();
    
    showPrompt("予算設定（円）", budget === Infinity ? "" : budget, (val) => {
        budget = parseInt(val) || Infinity; 
        updateAll(); 
        addLog(`予算を ${budget === Infinity ? "未設定" : budget + "円"} に設定しました。`); 
        showToast("💰 予算を設定しました");
    });
};

// 管理メニュー：CSV出力
document.getElementById('export-csv-button').onclick = () => {
    document.getElementById('close-action-menu').click();
    
    if (Object.keys(plateCounts).length === 0) { 
        showToast("⚠️ 出力するデータがありません"); 
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
    link.setAttribute("download", `sushilog_${new Date().toISOString().slice(0,10).replace(/-/g, "")}.csv`);
    
    document.body.appendChild(link); 
    link.click(); 
    document.body.removeChild(link);
    
    showToast("📄 CSVファイルを出力しました");
};


// ==========================================
// 8. お会計モーダル（デザイン統一版）
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    const checkoutModal = document.getElementById('checkout-modal');
    
    // 各種UI部品の取得
    const chkPlatesTotal = document.getElementById('checkout-plates-total');
    const chkLateNight = document.getElementById('checkout-late-night');
    const rateLateNight = document.getElementById('rate-late-night'); 
    const chkTax = document.getElementById('checkout-tax');
    const rateTax = document.getElementById('rate-tax'); 
    const chkDiscount = document.getElementById('checkout-discount');
    const chkFinalTotal = document.getElementById('checkout-final-total');
    const chkSplit = document.getElementById('checkout-split');
    const chkPerPerson = document.getElementById('checkout-per-person');
    const chkRemainder = document.getElementById('checkout-remainder');

    // お会計の再計算
    function calculateCheckout() {
        let calcTotal = currentTotalAmount;
        chkPlatesTotal.innerText = calcTotal.toLocaleString();

        // 1. 深夜・サービス料
        if (chkLateNight.checked) {
            const rate = parseFloat(rateLateNight.value) || 0;
            calcTotal += Math.floor(calcTotal * (rate / 100));
        }

        // 2. 外税計算
        if (chkTax.checked) {
            const rate = parseFloat(rateTax.value) || 0;
            calcTotal += Math.floor(calcTotal * (rate / 100));
        }
        
        // 3. 割引クーポン
        calcTotal -= (parseInt(chkDiscount.value) || 0);
        if (calcTotal < 0) calcTotal = 0; 
        
        chkFinalTotal.innerText = calcTotal.toLocaleString();

        // 4. 割り勘計算
        const splitCount = parseInt(chkSplit.value) || 1;
        if (splitCount > 0) {
            chkPerPerson.innerText = Math.floor(calcTotal / splitCount).toLocaleString();
            chkRemainder.innerText = (calcTotal % splitCount).toLocaleString();
        } else {
            chkPerPerson.innerText = "0";
            chkRemainder.innerText = "0";
        }
    }

    // 計算のリアルタイム反映
    const inputElements = [chkLateNight, rateLateNight, chkTax, rateTax, chkDiscount, chkSplit];
    inputElements.forEach(el => {
        if (el) {
            el.addEventListener('input', calculateCheckout);
            el.addEventListener('change', calculateCheckout);
        }
    });

    // お会計モーダルを開く
    document.getElementById('open-checkout-modal').addEventListener('click', () => {
        calculateCheckout(); 
        checkoutModal.classList.remove('hidden');
    });
    
    // お会計モーダルを閉じる
    document.getElementById('close-checkout-modal').addEventListener('click', () => {
        checkoutModal.classList.add('hidden');
    });

    // 割り勘人数のステッパー（＋）
    document.getElementById('split-plus').addEventListener('click', () => {
        chkSplit.value++;
        calculateCheckout();
        triggerVibrate(20);
    });
    
    // 割り勘人数のステッパー（－）
    document.getElementById('split-minus').addEventListener('click', () => {
        if (chkSplit.value > 1) {
            chkSplit.value--;
            calculateCheckout();
            triggerVibrate(20);
        }
    });

    // 割引クーポンのクリアボタン
    document.getElementById('clear-discount-btn').addEventListener('click', () => {
        chkDiscount.value = 0;
        calculateCheckout();
        triggerVibrate(20);
    });
});