// ==========================================
// 1. グローバル変数と状態管理
// ==========================================
// アプリ全体で共有して使用するデータを定義します。

let plateCounts = {};             // 食べたお皿の記録（例: { 120: 3, 150: 2 } => 120円が3枚、150円が2枚）
let totalHistory = [];            // 過去の食事の合計金額を保存する配列
let actionHistory = [];           // 「1つ取り消す(Undo)」機能を実装するための操作履歴
let budget = Infinity;            // 設定された予算（初期値は無限大 = 未設定）
let myChart = null;               // Chart.js（円グラフ）の本体を格納する変数
let wakeLock = null;              // スマホ画面が勝手に暗くなるのを防ぐためのオブジェクト

let currentTotalAmount = 0;       // アニメーションで数字をカウントアップさせるための現在金額
let platesAddedInLastAction = 0;  // 最後に何枚追加されたか（お皿落下アニメーションに使用）

// 初期から用意されているお店のデータ（プリセット）
let presets = [
    { name: "スシロー", color: "#d32f2f", prices: [120, 140, 180, 200, 260, 360] },
    { name: "くら寿司", color: "#2e7d32", prices: [110, 120, 130, 150, 170, 190, 210, 240, 270, 280, 390] },
    { name: "はま寿司", color: "#0277bd", prices: [110, 132, 176, 231, 319] }
];
let currentPresetIndex = 0;       // 現在選択されているお店が配列の何番目かを記憶
let currentSessionPrices = [];    // 現在のお店で有効な金額リスト（ユーザーが後から追加できるように変数化）

// 何度もアクセスするHTML要素は、最初に変数に入れておくと処理が速くなります
const priceSelect = document.getElementById('price-select');
const plateCountInput = document.getElementById('plate-count');
const towerContainer = document.getElementById('sushi-tower');


// ==========================================
// 2. 初期化・ユーティリティ（便利）関数
// ==========================================

// 画面の読み込みが完了した直後に実行される処理
window.onload = () => {
    loadData();             // ローカルストレージから過去のデータを復元
    renderPresetChips();    // タイトル画面にお店のボタンを生成
    initChart();            // 円グラフの準備
    
    // ダークモード設定が保存されていれば復元
    if (localStorage.getItem('theme') === 'dark') {
        document.body.setAttribute('data-theme', 'dark');
    }
};

// XSS（悪意のあるプログラムの実行）を防ぐため、HTMLの特殊文字を無害な文字に変換する関数
function escapeHTML(str) {
    return String(str).replace(/[&<>'"]/g, function(match) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[match];
    });
}

// スマホをブルッと震わせる機能（対応端末のみ）
function triggerVibrate(ms) {
    if (navigator.vibrate) navigator.vibrate(ms);
}

// データの読み込み
function loadData() {
    // 汎用的なキー名で保存データを取得（将来のバージョンアップにも対応しやすい）
    const saved = localStorage.getItem('sushi_log_app_data'); 
    if (saved) {
        try {
            const data = JSON.parse(saved);
            presets = data.presets || presets;
            totalHistory = data.totalHistory || [];
        } catch (e) {
            console.error("データの読み込みに失敗しました:", e);
        }
    }
}

// データの保存
function saveData() {
    const data = { presets, totalHistory };
    localStorage.setItem('sushi_log_app_data', JSON.stringify(data));
}

// 画面の自動消灯をブロックするリクエスト（ブラウザが対応している場合のみ）
async function requestWakeLock() {
    if ('wakeLock' in navigator) {
        try { 
            wakeLock = await navigator.wakeLock.request('screen'); 
        } catch (err) { 
            console.error(`WakeLock Error: ${err.name}, ${err.message}`); 
        }
    }
}


// ==========================================
// 3. 画面の遷移・描画処理
// ==========================================

// タイトル画面の「お店を選ぶボタン」を生成する処理
function renderPresetChips() {
    const container = document.getElementById('preset-selector');
    container.innerHTML = '';
    
    presets.forEach((preset, index) => {
        const btn = document.createElement('div');
        btn.className = 'preset-chip';
        // 左側の縦線をテーマカラーにする
        btn.style.borderLeft = `5px solid ${escapeHTML(preset.color)}`;
        btn.innerHTML = `<strong>${escapeHTML(preset.name)}</strong><br><small>${preset.prices.join('円, ')}円</small>`;
        
        // ボタンを押した時の処理
        btn.onclick = () => {
            currentPresetIndex = index;
            triggerVibrate(30);
            startSession(); // 食事の記録を開始
        };
        container.appendChild(btn);
    });
}

// お店を選んで「食事記録（セッション）」を開始する処理
function startSession() {
    const preset = presets[currentPresetIndex];
    
    // ヘッダーにお店の名前とカラーを反映
    document.getElementById('current-shop-name').innerText = escapeHTML(preset.name);
    document.getElementById('app-bar').style.borderBottom = `4px solid ${escapeHTML(preset.color)}`;
    document.documentElement.style.setProperty('--primary', escapeHTML(preset.color));
    
    // 選択したお店の金額リストをコピーして準備
    currentSessionPrices = [...preset.prices];
    updatePriceSelectAndChips();

    // 各種データを初期化（0に戻す）
    plateCounts = {};
    actionHistory = []; 
    currentTotalAmount = 0;
    
    // お会計計算エリアのリセット
    document.getElementById('checkout-discount').value = '0';
    document.getElementById('checkout-split').value = '1';
    document.getElementById('checkout-late-night').checked = false;
    document.getElementById('checkout-tax').checked = false;

    // ログエリアをクリア
    document.getElementById('output-area').innerHTML = ''; 
    
    // 画面の切り替え（タイトルを隠し、メイン画面を表示）
    document.getElementById('title-screen').classList.add('hidden');
    document.getElementById('main-screen').classList.remove('hidden');
    
    // 画面が消えないようにロックし、ログを残す
    requestWakeLock();
    addLog(`${escapeHTML(preset.name)} でのセッションを開始しました。`);
    updateAll(); // 画面全体の表示を最新に更新
}

// 単価のプルダウンメニューと、素早く追加できる「チップボタン」の更新
function updatePriceSelectAndChips() {
    // 1. プルダウン（select）の更新
    priceSelect.innerHTML = '';
    currentSessionPrices.forEach(price => {
        const opt = document.createElement('option');
        opt.value = price;
        opt.innerText = `${price}円`;
        priceSelect.appendChild(opt);
    });
    
    // 2. チップボタンの更新
    const container = document.getElementById('quick-add-buttons');
    container.innerHTML = '';
    currentSessionPrices.forEach(price => {
        const btn = document.createElement('button');
        btn.className = 'chip';
        btn.innerText = `+${price}円`;
        
        // チップボタンを押したときの処理（1枚即座に追加）
        btn.onclick = () => {
            triggerVibrate(40); 
            platesAddedInLastAction = 1; // 落下アニメーションの対象は1枚
            
            // 取消(Undo)用に履歴を保存
            actionHistory.push({ price: price, count: 1 });
            // お皿のカウントを増やす
            plateCounts[price] = (plateCounts[price] || 0) + 1;
            
            addLog(`${price}円のお皿を 1 枚追加しました。`);
            updateAll(); // 画面を更新
        };
        container.appendChild(btn);
    });
}


// ==========================================
// 4. データ更新・計算処理（コアロジック）
// ==========================================

// ★重要★ すべてのUI（タワー、グラフ、金額、ログ）を最新のデータ状態に合わせて更新する関数
function updateAll() {
    // 現在の合計金額を計算（金額 × 枚数 をすべて足す）
    const total = Object.entries(plateCounts).reduce((acc, [price, count]) => acc + (price * count), 0);
    
    // 合計金額をアニメーションしながら表示
    const totalDisplay = document.getElementById('total-display');
    animateValue(totalDisplay, currentTotalAmount, total, 600);
    currentTotalAmount = total;

    updateTower();         // お皿タワーの更新
    updateChart();         // 円グラフの更新
    updateTexts(total);    // 内訳テキスト・予算アラートの更新
    updateStatsArea(total);// 統計情報の更新
    updateHistoryArea();   // 履歴エリアの更新
}

// お皿タワーの描画と落下アニメーション処理
function updateTower() {
    towerContainer.innerHTML = ''; // 一旦空にする
    const color = presets[currentPresetIndex].color;
    let domPlates = [];
    
    // 食べたお皿の数だけ、HTMLのdiv要素（お皿の見た目）を作成
    Object.entries(plateCounts).forEach(([price, count]) => {
        for (let i = 0; i < count; i++) {
            const p = document.createElement('div');
            p.className = 'plate-visual';
            p.style.backgroundColor = color;
            // 高いお皿ほど色が濃く（不透明に）なるギミック
            p.style.opacity = Math.min(1.0, 0.4 + (price / 1000));
            domPlates.push(p);
        }
    });

    // 直近で追加されたお皿にだけ、落下するアニメーション用のクラスを付与
    if (platesAddedInLastAction > 0 && domPlates.length >= platesAddedInLastAction) {
        for (let i = domPlates.length - platesAddedInLastAction; i < domPlates.length; i++) {
            domPlates[i].classList.add('drop-in');
        }
    }
    
    // お皿を下から積み上げるための見えないスペーサー
    const spacer = document.createElement('div');
    spacer.style.marginTop = 'auto';
    towerContainer.appendChild(spacer);

    // 古いお皿が下、新しいお皿が上に来るように後ろから配置
    for (let i = domPlates.length - 1; i >= 0; i--) {
        domPlates[i].style.zIndex = i + 1;
        towerContainer.appendChild(domPlates[i]);
        
        // 10枚ごとに目印（マーカー）を挿入
        if ((i + 1) % 10 === 0) {
            const marker = document.createElement('div');
            marker.className = 'tower-marker';
            marker.innerHTML = `<span>${i + 1}</span>`;
            towerContainer.appendChild(marker);
        }
    }

    // 新しいお皿が追加されたら、一番上が見えるようにスクロール
    if (platesAddedInLastAction > 0) {
        setTimeout(() => towerContainer.scrollTo({ top: 0, behavior: 'smooth' }), 50);
    }
    platesAddedInLastAction = 0; // アニメーションのフラグをリセット
}

// 円グラフの初期化（初回のみ実行）
function initChart() {
    const ctx = document.getElementById('price-chart').getContext('2d');
    myChart = new Chart(ctx, {
        type: 'doughnut', // ドーナツ型
        data: { 
            labels: [], 
            datasets: [{ 
                data: [], 
                // グラフの色分け（最大5種類想定）
                backgroundColor: ['#ff5252', '#448aff', '#4caf50', '#ffeb3b', '#9c27b0'] 
            }] 
        },
        options: { 
            plugins: { legend: { display: false } }, // 凡例は非表示
            cutout: '75%',                           // ドーナツの穴の大きさ
            animation: { duration: 500 } 
        }
    });
}

// 円グラフのデータを最新にして再描画
function updateChart() {
    myChart.data.labels = Object.keys(plateCounts).map(price => `${price}円`);
    myChart.data.datasets[0].data = Object.values(plateCounts);
    myChart.update();

    // グラフの中央に表示する「合計〇枚」のテキストを更新
    const totalPlates = Object.values(plateCounts).reduce((acc, count) => acc + count, 0);
    document.getElementById('chart-center-text').innerText = `${totalPlates}枚`;
}

// 内訳一覧テキストと、予算アラートの更新
function updateTexts(total) {
    const summaryArea = document.getElementById('summary-area');
    
    // 取り消しボタンの作成（履歴があれば表示）
    const undoBtnHtml = actionHistory.length > 0 
        ? `<button onclick="undoLastAction()" class="btn-outline" style="width:100%; margin-bottom:10px; cursor:pointer;">↩️ 1つ取り消す</button>` : '';
        
    // 「120円 x 3枚 = 360円」のようなテキストを生成
    summaryArea.innerHTML = undoBtnHtml + Object.entries(plateCounts)
        .map(([price, count]) => `<div>${price}円 x ${count}枚 = ${(price * count).toLocaleString()}円</div>`)
        .join('');
    
    // 予算設定に応じたメッセージ表示の処理
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

// 統計情報（総枚数、平均単価、一番食べたお皿）の算出と表示
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

// 過去の合計金額の履歴を表示
function updateHistoryArea() {
    const historyArea = document.getElementById('history-area');
    if (totalHistory.length === 0) { 
        historyArea.innerHTML = "<div>過去の記録はありません</div>"; 
        return; 
    }
    historyArea.innerHTML = totalHistory.map((total, index) => 
        `<div>セッション ${index + 1}: <strong>${total.toLocaleString()} 円</strong></div>`
    ).join('');
}


// ==========================================
// 5. 各種アクション・イベントリスナー（ユーザー操作の処理）
// ==========================================

// 画面下部の履歴ログエリアにテキストを追加する関数
function addLog(message) {
    const outputArea = document.getElementById('output-area');
    const time = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    // 新しいログが上に来るように追加
    outputArea.innerHTML = `<div style="font-size: 0.9em; margin-bottom: 4px; border-bottom: 1px dashed var(--border); padding-bottom: 2px;">[${time}] ${message}</div>` + outputArea.innerHTML;
}

// 1つ前の操作を取り消す（Undo）
window.undoLastAction = function() {
    if (actionHistory.length === 0) return;
    
    const last = actionHistory.pop(); // 最後の履歴を取り出す
    if (plateCounts[last.price]) {
        plateCounts[last.price] -= last.count; // カウントを戻す
        if (plateCounts[last.price] <= 0) {
            delete plateCounts[last.price]; // 0枚になったらキーごと削除
        }
        platesAddedInLastAction = 0; 
        addLog(`【取消】${last.price}円のお皿の操作を元に戻しました。`);
        triggerVibrate(30);
        updateAll();
    }
};

// 数字がパラパラとカウントアップするアニメーション関数
function animateValue(obj, start, end, duration) {
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const easeOutQuart = 1 - Math.pow(1 - progress, 4); // 後半になるにつれゆっくりになる計算（イージング）
        obj.innerHTML = Math.floor(start + easeOutQuart * (end - start)).toLocaleString();
        
        if (progress < 1) {
            window.requestAnimationFrame(step); // まだ途中なら次を描画
        }
    };
    window.requestAnimationFrame(step);
}

// 「新しい金額を追加」ボタンを押したときの処理
document.getElementById('add-custom-price-btn').onclick = () => {
    const inputField = document.getElementById('custom-price-input');
    const newPrice = parseInt(inputField.value);
    
    if (!newPrice || newPrice <= 0) { 
        alert("正しい金額を入力してください"); 
        return; 
    }
    
    // まだリストにない金額なら追加して並び替える
    if (!currentSessionPrices.includes(newPrice)) {
        currentSessionPrices.push(newPrice);
        currentSessionPrices.sort((a, b) => a - b);
        updatePriceSelectAndChips(); // UIを更新
        addLog(`【新規】${escapeHTML(newPrice)}円の設定を追加しました。`);
    }
    
    priceSelect.value = newPrice; // 追加した金額を自動選択状態にする
    inputField.value = '';
    triggerVibrate(30);
};

// 枚数の「＋」「－」ボタン
document.getElementById('count-plus').onclick = () => { 
    plateCountInput.value++; 
    triggerVibrate(20); 
};
document.getElementById('count-minus').onclick = () => { 
    if (plateCountInput.value > -99) plateCountInput.value--; // マイナスの入力も一応許可（削除用）
    triggerVibrate(20); 
};

// メインの「お皿を確定」ボタンを押したときの処理
document.getElementById('add-plate-button').onclick = () => {
    triggerVibrate(50); 
    const price = priceSelect.value;
    const count = parseInt(plateCountInput.value);
    
    if(isNaN(count) || count === 0) return; // 0枚の場合は何もしない

    platesAddedInLastAction = count > 0 ? count : 0;
    actionHistory.push({ price: price, count: count });
    
    plateCounts[price] = (plateCounts[price] || 0) + count;
    if (plateCounts[price] <= 0) delete plateCounts[price]; // 0枚以下なら削除
    
    const actionStr = count > 0 ? "追加" : "削除";
    addLog(`${price}円のお皿を ${Math.abs(count)} 枚${actionStr}しました。`);
    
    updateAll();
    plateCountInput.value = 1; // 入力欄を1に戻す
};


// ==========================================
// 6. モーダル（ポップアップ画面）と各種設定の制御
// ==========================================

// ★プリセット（お店）編集モーダル
document.getElementById('open-settings').onclick = () => {
    const list = document.getElementById('settings-list');
    list.innerHTML = '';
    
    // 現在のプリセット配列の中身をHTMLの入力欄として展開
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
    document.getElementById('open-settings').click(); // リストを再描画するためにもう一度クリック扱いにする
};

document.getElementById('close-settings').onclick = () => {
    saveData();             // 変更を保存
    renderPresetChips();    // タイトル画面のボタンを作り直す
    document.getElementById('settings-modal').classList.add('hidden');
};

// ★ヘルプ・About・管理メニュー等の共通開閉処理
const openHelp = () => document.getElementById('help-modal').classList.remove('hidden');
document.getElementById('help-button').onclick = openHelp;
document.getElementById('title-help-button').onclick = openHelp;
document.getElementById('close-help').onclick = () => document.getElementById('help-modal').classList.add('hidden');

document.getElementById('title-about-button').onclick = () => document.getElementById('about-modal').classList.remove('hidden');
document.getElementById('close-about').onclick = () => document.getElementById('about-modal').classList.add('hidden');

document.getElementById('action-menu-button').onclick = () => document.getElementById('action-menu-modal').classList.remove('hidden');
document.getElementById('close-action-menu').onclick = () => document.getElementById('action-menu-modal').classList.add('hidden');

// 左上の「←」ボタンでタイトルに戻る
document.getElementById('back-to-title').onclick = () => {
    document.getElementById('main-screen').classList.add('hidden');
    document.getElementById('title-screen').classList.remove('hidden');
    document.documentElement.style.setProperty('--primary', '#d32f2f'); // 色をデフォルトに戻す
    
    // 画面ロック（WakeLock）を解除する
    if (wakeLock !== null) {
        wakeLock.release().then(() => { wakeLock = null; });
    }
};

// ★ダークモード／ライトモード切替処理
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

// 管理メニュー内の個別機能
document.getElementById('save-button').onclick = () => {
    // 現在の合計金額を履歴に保存
    if (currentTotalAmount > 0) {
        totalHistory.push(currentTotalAmount); 
        saveData(); 
        updateAll();
        addLog(`セッションを保存しました。`); 
        alert("データを保存しました！");
    }
    document.getElementById('close-action-menu').click();
};

document.getElementById('reset-button').onclick = () => {
    if (confirm("現在のお皿のデータをリセットしますか？")) {
        if (currentTotalAmount > 0) totalHistory.push(currentTotalAmount); 
        // データを初期化
        plateCounts = {}; 
        actionHistory = []; 
        currentTotalAmount = 0; 
        saveData(); 
        updateAll();
        addLog("データをリセットしました。");
    }
    document.getElementById('close-action-menu').click();
};

document.getElementById('set-budget-button').onclick = () => {
    const val = prompt("予算設定（円）", budget === Infinity ? "" : budget);
    if (val !== null) { 
        budget = parseInt(val) || Infinity; 
        updateAll(); 
        addLog(`予算を ${budget === Infinity ? "未設定" : budget + "円"} に設定しました。`);
    }
    document.getElementById('close-action-menu').click();
};

document.getElementById('export-csv-button').onclick = () => {
    if (Object.keys(plateCounts).length === 0) { 
        alert("出力するデータがありません。"); 
        return; 
    }
    // CSV形式（カンマ区切りテキスト）を生成。先頭の\uFEFFはExcelの文字化け防止(BOM)
    let csvContent = "data:text/csv;charset=utf-8,\uFEFF金額(円),枚数,小計(円)\n"; 
    let total = 0;
    
    for (const [price, count] of Object.entries(plateCounts)) {
        const subtotal = price * count; 
        total += subtotal;
        csvContent += `${price},${count},${subtotal}\n`;
    }
    csvContent += `合計,,${total}\n`;
    
    // ダウンロード用の見えないリンクを作ってクリックさせるテクニック
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    // 今日の日付をファイル名に含める
    link.setAttribute("download", `sushilog_${new Date().toISOString().slice(0,10).replace(/-/g, "")}.csv`);
    document.body.appendChild(link); 
    link.click(); 
    document.body.removeChild(link);
    
    addLog("CSVファイルを出力しました。");
    document.getElementById('close-action-menu').click();
};


// ==========================================
// 7. お会計モーダルと詳細計算ロジック
// ==========================================

document.addEventListener("DOMContentLoaded", () => {
    const checkoutModal = document.getElementById('checkout-modal');
    
    const chkPlatesTotal = document.getElementById('checkout-plates-total');
    const chkLateNight = document.getElementById('checkout-late-night');
    const chkTax = document.getElementById('checkout-tax');
    const chkDiscount = document.getElementById('checkout-discount');
    const chkFinalTotal = document.getElementById('checkout-final-total');
    const chkSplit = document.getElementById('checkout-split');
    const chkPerPerson = document.getElementById('checkout-per-person');
    const chkRemainder = document.getElementById('checkout-remainder');

    // お会計の再計算を行う関数
    function calculateCheckout() {
        // 安全にJavaScript側で保持している合計金額を利用する
        let baseTotal = currentTotalAmount;
        
        chkPlatesTotal.innerText = baseTotal.toLocaleString();
        let calcTotal = baseTotal;

        // 1. 深夜料金 (10%加算・切り捨て)
        if (chkLateNight.checked) {
            calcTotal += Math.floor(calcTotal * 0.1);
        }

        // 2. 外税計算 (ここまでの合計に対してさらに10%加算・切り捨て)
        if (chkTax.checked) {
            calcTotal += Math.floor(calcTotal * 0.1);
        }
        
        // 3. 割引クーポンの適用
        calcTotal -= (parseInt(chkDiscount.value) || 0);
        if (calcTotal < 0) calcTotal = 0; // マイナス防止

        // 最終合計を表示
        chkFinalTotal.innerText = calcTotal.toLocaleString();

        // 4. 割り勘計算 (割り切れる額と、余りを計算)
        const splitCount = parseInt(chkSplit.value) || 1;
        if (splitCount > 0) {
            const perPerson = Math.floor(calcTotal / splitCount); // 切り捨てで1人あたりを算出
            const remainder = calcTotal % splitCount;             // あまり
            
            chkPerPerson.innerText = perPerson.toLocaleString();
            chkRemainder.innerText = remainder.toLocaleString();
        } else {
            chkPerPerson.innerText = "0";
            chkRemainder.innerText = "0";
        }
    }

    // チェックボックスや入力欄が変更されたら即座に再計算を実行
    const inputElements = [chkLateNight, chkTax, chkDiscount, chkSplit];
    inputElements.forEach(el => {
        if (el) {
            el.addEventListener('input', calculateCheckout);
            el.addEventListener('change', calculateCheckout);
        }
    });

    // 「お会計に進む」ボタン
    document.getElementById('open-checkout-modal').addEventListener('click', () => {
        calculateCheckout(); // 開く直前に最新の金額で計算
        checkoutModal.classList.remove('hidden');
    });

    // 「閉じる」ボタン
    document.getElementById('close-checkout-modal').addEventListener('click', () => {
        checkoutModal.classList.add('hidden');
    });
});