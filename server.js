const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const sqlite3 = require('sqlite3').verbose();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());

// --- ВАРИАНТЫ СКИНОВ ---
const MOON_VARIANTS = [
    'https://cdn.changes.tg/gifts/models/Astral%20Shard/lottie/Aquamarine.json',
    'https://cdn.changes.tg/gifts/models/Astral%20Shard/lottie/Aquarium.json',
    'https://cdn.changes.tg/gifts/models/Astral%20Shard/lottie/Arctite.json',
    'https://cdn.changes.tg/gifts/models/Astral%20Shard/lottie/Barbed.json',
    'https://cdn.changes.tg/gifts/models/Astral%20Shard/lottie/Black%20Diamond.json',
    'https://cdn.changes.tg/gifts/models/Astral%20Shard/lottie/Blender.json',
    'https://cdn.changes.tg/gifts/models/Astral%20Shard/lottie/Crystal%20Punk.json'
];

const MEDAL_VARIANTS = [
    'https://cdn.changes.tg/gifts/models/Victory%20Medal/lottie/Aegis.json',
    'https://cdn.changes.tg/gifts/models/Victory%20Medal/lottie/Brewmaster.json',
    'https://cdn.changes.tg/gifts/models/Victory%20Medal/lottie/Bronze.json',
    'https://cdn.changes.tg/gifts/models/Victory%20Medal/lottie/Candy%20King.json',
    'https://cdn.changes.tg/gifts/models/Victory%20Medal/lottie/Clown.json',
    'https://cdn.changes.tg/gifts/models/Victory%20Medal/lottie/Crown%20Jewel.json',
    'https://cdn.changes.tg/gifts/models/Victory%20Medal/lottie/Crown%20of%20Grace.json',
    'https://cdn.changes.tg/gifts/models/Victory%20Medal/lottie/Gold.json',
    'https://cdn.changes.tg/gifts/models/Victory%20Medal/lottie/Inventor.json',
    'https://cdn.changes.tg/gifts/models/Victory%20Medal/lottie/Noble%20Prize.json',
    'https://cdn.changes.tg/gifts/models/Victory%20Medal/lottie/King%20Troll.json',
    'https://cdn.changes.tg/gifts/models/Victory%20Medal/lottie/Ton%20Titan.json',
    'https://cdn.changes.tg/gifts/models/Victory%20Medal/lottie/Viking.json',
    'https://cdn.changes.tg/gifts/models/Victory%20Medal/lottie/Veteran.json',
    'https://cdn.changes.tg/gifts/models/Victory%20Medal/lottie/The%20Founder.json'
];

// --- БАЗА ДАННЫХ ---
const db = new sqlite3.Database('database.db'); // Файл, чтобы данные сохранялись

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        telegram_id INTEGER PRIMARY KEY,
        username TEXT,
        balance INTEGER DEFAULT 100000
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS shop_items (
        id INTEGER PRIMARY KEY,
        name TEXT,
        icon TEXT,
        price INTEGER,
        type TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS user_assets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        item_id INTEGER,
        serial_number INTEGER,
        pattern TEXT DEFAULT NULL,
        background TEXT DEFAULT NULL,
        rarity_pattern REAL DEFAULT 0,
        rarity_bg REAL DEFAULT 0,
        is_upgraded INTEGER DEFAULT 0,
        original_owner TEXT,
        custom_icon TEXT DEFAULT NULL
    )`);

    // Заполняем магазин (если пусто)
    db.get("SELECT count(*) as count FROM shop_items", (err, row) => {
        if (row.count === 0) {
            const stmt = db.prepare("INSERT INTO shop_items (id, name, icon, price, type) VALUES (?, ?, ?, ?, ?)");
            stmt.run(1, 'Moon', 'https://cdn.changes.tg/gifts/models/Astral%20Shard/lottie/Original.json', 5000, 'gift');
            stmt.run(2, 'Voodoo Doll', '🧸', 2500, 'gift');
            stmt.run(3, 'Skull', '💀', 1000, 'gift');
            stmt.run(4, 'Victory Medal', 'https://cdn.changes.tg/gifts/models/Victory%20Medal/lottie/Original.json', 10000, 'gift');
            stmt.run(5, 'B-Day Candle', 'https://cdn.changes.tg/gifts/models/B-Day%20Candle/lottie/Original.json', 20000, 'auction');
            stmt.finalize();
        }
    });
});

// --- КОНФИГ ---
const PATTERNS = [
    { name: 'Turkey', rarity: 20 },
    { name: 'Star', rarity: 15 },
    { name: 'Hearts', rarity: 5 },
    { name: 'Matrix', rarity: 2 }
];
const BACKGROUNDS = [
    { name: 'Black', rarity: 1.2, color: '#111111' },
    { name: 'Midnight', rarity: 10, color: '#191970' },
    { name: 'Forest', rarity: 15, color: '#013220' },
    { name: 'Lava', rarity: 5, color: '#4a0404' }
];

function getRandomAttr(array) { return array[Math.floor(Math.random() * array.length)]; }

// --- API ---

app.post('/api/login', (req, res) => {
    const { tg_id, username } = req.body;
    
    // Проверяем, есть ли юзер. Если есть - обновляем никнейм (вдруг сменил). Если нет - создаем.
    db.get("SELECT * FROM users WHERE telegram_id = ?", [tg_id], (err, user) => {
        if (!user) {
            db.run("INSERT INTO users (telegram_id, username) VALUES (?, ?)", [tg_id, username], () => {
                sendUserData(res, tg_id, username, 100000);
            });
        } else {
            // Обновляем никнейм, чтобы был актуальный
            db.run("UPDATE users SET username = ? WHERE telegram_id = ?", [username, tg_id], () => {
                sendUserData(res, tg_id, username, user.balance);
            });
        }
    });
});

function sendUserData(res, tg_id, username, balance) {
    db.all(`
        SELECT ua.*, si.name, COALESCE(ua.custom_icon, si.icon) as icon, si.price as base_price, si.type as item_type 
        FROM user_assets ua 
        JOIN shop_items si ON ua.item_id = si.id 
        WHERE ua.user_id = ?`, 
    [tg_id], (err, assets) => {
        res.json({ balance: balance, assets: assets, username: username });
    });
}

app.get('/api/shop', (req, res) => {
    db.all("SELECT * FROM shop_items", (err, rows) => {
        res.json(rows);
    });
});

// ПОКУПКА
app.post('/api/buy', (req, res) => {
    const { tg_id, item_id, username } = req.body;
    
    db.get("SELECT * FROM users WHERE telegram_id = ?", [tg_id], (err, user) => {
        db.get("SELECT * FROM shop_items WHERE id = ?", [item_id], (err, item) => {
            if (user.balance < item.price) return res.json({ error: "Мало звезд" });
            if (item.type === 'auction') return res.json({ error: "Этот предмет только через аукцион!" });

            const newBalance = user.balance - item.price;
            db.run("UPDATE users SET balance = ? WHERE telegram_id = ?", [newBalance, tg_id]);

            db.get("SELECT COUNT(*) as count FROM user_assets WHERE item_id = ?", [item_id], (err, row) => {
                const serial = row.count + 1;
                db.run(`INSERT INTO user_assets (user_id, item_id, serial_number, original_owner) VALUES (?, ?, ?, ?)`, 
                    [tg_id, item_id, serial, username], 
                    function(err) {
                        res.json({ success: true, newBalance, asset: {
                            id: this.lastID, item_id, serial_number: serial, name: item.name, icon: item.icon, 
                            is_upgraded: 0, original_owner: username, base_price: item.price, item_type: item.type
                        }});
                    }
                );
            });
        });
    });
});

// АУКЦИОН (СТАВКА)
app.post('/api/bid', (req, res) => {
    const { tg_id, item_id, amount, username } = req.body;
    
    db.get("SELECT * FROM users WHERE telegram_id = ?", [tg_id], (err, user) => {
        // Проверка баланса
        if (user.balance < amount) return res.json({ error: "Недостаточно звезд для ставки!" });
        
        db.get("SELECT * FROM shop_items WHERE id = ?", [item_id], (err, item) => {
            // Списываем ставку
            const newBalance = user.balance - amount;
            db.run("UPDATE users SET balance = ? WHERE telegram_id = ?", [newBalance, tg_id]);

            // Выдаем предмет
            db.get("SELECT COUNT(*) as count FROM user_assets WHERE item_id = ?", [item_id], (err, row) => {
                const serial = row.count + 1;
                db.run(`INSERT INTO user_assets (user_id, item_id, serial_number, original_owner) VALUES (?, ?, ?, ?)`, 
                    [tg_id, item_id, serial, username], 
                    function(err) {
                        res.json({ success: true, newBalance, asset: {
                            id: this.lastID, item_id, serial_number: serial, name: item.name, icon: item.icon, 
                            is_upgraded: 0, original_owner: username, base_price: amount, item_type: 'auction'
                        }});
                    }
                );
            });
        });
    });
});

app.post('/api/upgrade', (req, res) => {
    const { tg_id, asset_id } = req.body;
    const UPGRADE_PRICE = 2000; 

    db.get("SELECT * FROM users WHERE telegram_id = ?", [tg_id], (err, user) => {
        db.get("SELECT * FROM user_assets WHERE id = ?", [asset_id], (err, asset) => {
            
            if (asset.is_upgraded === 1) return res.json({ error: "Предмет уже улучшен!" });
            if (user.balance < UPGRADE_PRICE) return res.json({ error: "Мало звезд" });

            const pat = getRandomAttr(PATTERNS);
            const bg = getRandomAttr(BACKGROUNDS);
            
            let newIcon = null;
            if (asset.item_id === 1) newIcon = getRandomAttr(MOON_VARIANTS);
            else if (asset.item_id === 4) newIcon = getRandomAttr(MEDAL_VARIANTS);

            const newBalance = user.balance - UPGRADE_PRICE;
            db.run("UPDATE users SET balance = ? WHERE telegram_id = ?", [newBalance, tg_id]);

            db.run(`UPDATE user_assets SET pattern = ?, rarity_pattern = ?, background = ?, rarity_bg = ?, is_upgraded = 1, custom_icon = ? WHERE id = ?`, 
                [pat.name, pat.rarity, bg.name, bg.rarity, newIcon, asset_id], 
                () => {
                    res.json({ success: true, newBalance, updates: { 
                        pattern: pat.name, rarity_pattern: pat.rarity,
                        background: bg.name, rarity_bg: bg.rarity,
                        new_icon: newIcon
                    }});
                }
            );
        });
    });
});

// --- FRONTEND ---
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <script src="https://unpkg.com/@lottiefiles/lottie-player@latest/dist/lottie-player.js"></script>
    <script src="https://telegram.org/js/telegram-web-app.js"></script>
    <title>NFTGifter</title>
    <style>
        :root { --bg-color: #17212b; --card-bg: #232e3c; --text-color: #ffffff; --secondary-text: #707579; --accent: #2ea6ff; --gold: #ffc107; --red: #ff5252; --btn-bg: #2b3541; --modal-overlay: #000; }
        body { background-color: var(--bg-color); color: var(--text-color); font-family: -apple-system, BlinkMacSystemFont, Roboto, sans-serif; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
        
        .header { text-align: center; padding: 20px 0; }
        .avatar-placeholder { font-size: 60px; margin-bottom: 10px; animation: float 3s ease-in-out infinite; }
        @keyframes float { 0% { transform: translateY(0px); } 50% { transform: translateY(-10px); } 100% { transform: translateY(0px); } }
        
        .stars-balance { display: inline-flex; align-items: center; background: rgba(0,0,0,0.2); padding: 5px 12px; border-radius: 20px; font-weight: bold; color: var(--gold); position: absolute; top: 15px; right: 15px; }
        
        .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; padding: 0 15px 100px; margin-top: 10px; }
        .card { background-color: var(--card-bg); border-radius: 12px; aspect-ratio: 1; display: flex; align-items: center; justify-content: center; position: relative; overflow: hidden; border: 1px solid transparent; transition: all 0.2s; }
        .card:active { transform: scale(0.95); }
        .card-icon { width: 80%; height: 80%; display: flex; align-items: center; justify-content: center; font-size: 40px; z-index: 2; pointer-events: none; }
        
        .ribbon { position: absolute; top: 10px; right: -28px; width: 100px; background: var(--gold); color: #000; text-align: center; font-size: 10px; font-weight: 800; transform: rotate(45deg); padding: 4px 0; z-index: 3;}
        .ribbon.auction { background: #3d60d8; color: white; }
        
        .bottom-nav { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: rgba(30, 40, 50, 0.95); backdrop-filter: blur(10px); border-radius: 20px; padding: 5px; display: flex; gap: 5px; box-shadow: 0 5px 20px rgba(0,0,0,0.5); z-index: 1000; }
        .nav-item { padding: 10px 20px; border-radius: 15px; color: var(--secondary-text); text-decoration: none; font-size: 14px; display: flex; flex-direction: column; align-items: center; gap: 4px; cursor: pointer; }
        .nav-item.active { background-color: var(--card-bg); color: var(--accent); }

        /* MODAL COMMON */
        .modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: var(--modal-overlay); z-index: 2000; flex-direction: column; }
        .modal.open { display: flex; animation: fadeIn 0.2s; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

        /* === ФИКС РАЗМЕРОВ МОДАЛКИ (Чтобы влезало без растягивания) === */
        .modal-header-bg { 
            position: relative; 
            flex-shrink: 0; /* Не сжимать */
            height: auto; 
            min-height: 280px; /* Фикс высота, поменьше чем было */
            display: flex; 
            flex-direction: column; 
            align-items: center; 
            justify-content: center; 
            background-color: #1a1a1a; 
            transition: background 0.5s; 
            overflow: hidden; 
            padding-bottom: 20px;
        }
        .pattern-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; opacity: 0.1; background-size: 40px 40px; pointer-events: none; }
        .close-btn-float { position: absolute; top: 15px; right: 15px; background: rgba(0,0,0,0.3); color: #fff; border-radius: 20px; padding: 5px 12px; font-size: 14px; cursor: pointer; z-index: 10; }
        
        /* Уменьшил иконку, чтобы влезала на мелких экранах */
        .modal-main-icon { 
            width: 140px; 
            height: 140px; 
            display: flex; align-items: center; justify-content: center; 
            font-size: 80px; 
            margin-bottom: 5px; 
            margin-top: 10px;
            z-index: 2; 
            filter: drop-shadow(0 0 20px rgba(0,0,0,0.5)); 
        }
        
        .modal-title { font-size: 22px; font-weight: bold; margin: 0; z-index: 2; }
        .modal-subtitle { color: rgba(255,255,255,0.6); font-size: 13px; margin-top: 2px; z-index: 2; }
        .modal-body { background: var(--bg-color); flex: 1; padding: 15px; border-radius: 20px 20px 0 0; margin-top: -20px; z-index: 5; position: relative; overflow-y: auto; }
        
        .action-btn { background: #4b4b4b; color: white; border-radius: 12px; padding: 12px; text-align: center; font-weight: bold; margin-bottom: 15px; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; border: 1px solid rgba(255,255,255,0.1); }
        .owner-row { background: var(--card-bg); border-radius: 12px; padding: 10px 15px; display: flex; align-items: center; justify-content: space-between; margin-bottom: 15px; }
        .owner-info h4 { margin: 0; font-size: 14px; }
        .owner-info p { margin: 0; font-size: 12px; color: var(--secondary-text); }
        .btn-go { background: var(--accent); color: white; border: none; padding: 6px 12px; border-radius: 16px; font-size: 12px; font-weight: bold; }
        .attributes-list { background: var(--card-bg); border-radius: 12px; overflow: hidden; }
        .attr-row { display: flex; align-items: center; padding: 12px 15px; border-bottom: 1px solid rgba(0,0,0,0.1); }
        .attr-row:last-child { border-bottom: none; }
        .attr-icon-box { width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; font-size: 20px; margin-right: 15px; }
        .attr-details { flex: 1; }
        .attr-name { font-size: 14px; font-weight: bold; display: block; }
        .attr-value { font-size: 13px; color: var(--secondary-text); }
        .val-blue { color: var(--accent); }

        /* --- AUCTION MODAL SPECIFIC (DARK THEME 1-in-1) --- */
        .auction-modal-content {
            background-color: #18191d; /* Темный фон как на скрине */
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            align-items: center;
            position: relative;
            padding-top: 20px;
        }
        .auction-header {
            width: 100%;
            text-align: center;
            position: relative;
            margin-bottom: 20px;
        }
        .auction-title { font-size: 20px; font-weight: bold; color: #fff; margin-bottom: 4px; }
        .auction-subtitle { font-size: 14px; color: #707579; }
        
        .auction-close {
            position: absolute; right: 20px; top: 0px;
            width: 28px; height: 28px;
            background: rgba(255,255,255,0.1);
            border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
            cursor: pointer;
            color: #ccc;
            font-size: 16px;
        }
        
        /* Синий тег цены */
        .auction-bid-tag {
            background: #235c97;
            color: #ffffff;
            padding: 8px 20px;
            border-radius: 20px;
            font-weight: bold;
            font-size: 18px;
            margin-bottom: 20px;
        }
        
        .auction-main-icon {
            width: 180px;
            height: 180px;
            margin-bottom: 20px;
            filter: drop-shadow(0 0 40px rgba(0,0,0,0.5));
        }
        
        /* Прогресс бар (имитация как на скрине полоска) */
        .progress-container {
            width: 90%;
            height: 6px;
            background: #2c2e33;
            border-radius: 3px;
            margin-bottom: 20px;
            position: relative;
        }
        .progress-bar {
            width: 30%;
            height: 100%;
            background: #707579;
            border-radius: 3px;
        }
        
        .auction-footer {
            margin-top: auto;
            width: 100%;
            padding: 20px;
            box-sizing: border-box;
            background: #18191d;
        }
        
        .btn-auction {
            background: #1274c4; /* Насыщенный синий */
            color: white;
            width: 100%;
            padding: 16px;
            border-radius: 12px;
            font-size: 16px;
            font-weight: 600;
            border: none;
            cursor: pointer;
        }
        
        .auction-info-text {
            color: #555;
            font-size: 13px;
            text-align: center;
            margin-bottom: 15px;
        }

        /* --- VICTORY POPUP --- */
        .popup-overlay {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.8);
            z-index: 3000;
            display: none;
            align-items: center;
            justify-content: center;
        }
        .popup-card {
            background: #1c242d;
            width: 80%;
            border-radius: 20px;
            padding: 25px;
            text-align: center;
            position: relative;
            animation: popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        }
        @keyframes popIn { from { transform: scale(0.8); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        .popup-confetti { font-size: 50px; margin-bottom: 15px; display: block; }
        .popup-title { font-size: 22px; font-weight: bold; margin-bottom: 10px; color: white; }
        .popup-desc { color: #8a9aa8; font-size: 14px; line-height: 1.5; margin-bottom: 25px; }
        .popup-btn { background: #2f3842; color: white; padding: 12px 30px; border-radius: 12px; border: none; font-weight: bold; font-size: 16px; width: 100%; cursor: pointer;}
        .popup-close-x { position: absolute; top: 15px; right: 15px; background: rgba(255,255,255,0.1); width: 24px; height: 24px; border-radius: 50%; color: #aaa; display: flex; align-items: center; justify-content: center; cursor: pointer; }

    </style>
</head>
<body>

    <div class="stars-balance">⭐ <span id="balance">...</span></div>

    <div class="header">
        <div class="avatar-placeholder">🐸</div>
        <h1>Магазин</h1>
        <p style="color:#707579; font-size:14px">Купи, улучши и владей</p>
    </div>

    <div class="grid" id="grid"></div>

    <div class="bottom-nav">
        <div class="nav-item" onclick="switchTab('gifts')" id="tab-gifts">🎁 подарки</div>
        <div class="nav-item active" onclick="switchTab('store')" id="tab-store">🏪 магазин</div>
    </div>

    <!-- STANDARD MODAL -->
    <div class="modal" id="modal">
        <div class="modal-header-bg" id="modalHeaderBg">
            <div class="pattern-overlay" id="patternOverlay"></div>
            <div class="close-btn-float" onclick="closeModal()">Закрыть</div>
            
            <div class="modal-main-icon" id="mIcon"></div>
            <div class="modal-title" id="mTitle"></div>
            <div class="modal-subtitle" id="mSubtitle"></div>
        </div>

        <div class="modal-body">
            <div class="action-btn" id="actionBtn" onclick="handleAction()">
                <div id="actionIcon" class="action-icon"></div>
                <div id="actionText"></div>
            </div>

            <div class="owner-row">
                <div class="owner-info">
                    <h4>Владелец</h4>
                    <p id="ownerName"></p>
                </div>
                <button class="btn-go">Перейти</button>
            </div>

            <div class="attributes-list" id="attrList"></div>
            <div style="text-align:center; margin-top:15px; color:#707579; font-size:12px">@NFTGifterBot</div>
        </div>
    </div>

    <!-- AUCTION MODAL (FIXED DESIGN) -->
    <div class="modal" id="auctionModal">
        <div class="auction-modal-content">
            <div class="auction-header">
                <div class="auction-title">Размещение ставки</div>
                <div class="auction-subtitle">Раунд 10 из 30</div>
                <div class="auction-close" onclick="closeAuctionModal()">✕</div>
            </div>
            
            <div class="auction-bid-tag">3690</div>
            
            <div class="progress-container">
                <div class="progress-bar"></div>
            </div>

            <div class="auction-main-icon" id="auctionIcon"></div>
            
            <div class="auction-footer">
                <div class="auction-info-text">В каждом раунде будет разыграно <b>3 шт.</b></div>
                <button class="btn-auction" onclick="placeBid()">Сделать ставку</button>
            </div>
            
            <div style="position:absolute; bottom:5px; color:#555; font-size:12px">@NFTGifterBot</div>
        </div>
    </div>

    <!-- VICTORY POPUP -->
    <div class="popup-overlay" id="victoryPopup">
        <div class="popup-card">
            <div class="popup-close-x" onclick="closeVictory()">✕</div>
            <div class="popup-confetti">🎉</div>
            <div class="popup-title">Победа!</div>
            <div class="popup-desc">
                Вы победили в аукционе за подарок <span id="winItemName">Item</span> и заняли 1 место. Вы получили <span id="winItemName2">Item</span> #25. Поздравляем!
            </div>
            <button class="popup-btn" onclick="closeVictory()">OK</button>
        </div>
    </div>

    <script>
        const tg = window.Telegram.WebApp;
        tg.expand();
        
        // --- ПОЛУЧЕНИЕ РЕАЛЬНОГО ЮЗЕРА ---
        // Если открыто в Телеграм - берем реальные данные.
        // Если в браузере - берем тестовые.
        const tgUser = tg.initDataUnsafe?.user;
        const USER_ID = tgUser ? tgUser.id : 123456;
        const USERNAME = tgUser ? (tgUser.username || tgUser.first_name) : "IlyaTest";

        let userBalance = 0;
        let storeItems = [];
        let myAssets = [];
        let currentTab = 'store'; 
        let selectedItem = null;

        const ICONS = { model: '💠', pattern: '🦄', bg: '⬛', price: '⭐' };

        // ОПТИМИЗИРОВАННЫЙ РЕНДЕР
        function renderIcon(iconData, isLarge = false) {
            if (iconData.startsWith('http')) {
                return \`<lottie-player 
                    src="\${iconData}" 
                    background="transparent" 
                    speed="1" 
                    style="width: 100%; height: 100%;" 
                    loop 
                    autoplay
                    class="lottie-anim"
                ></lottie-player>\`;
            } else {
                return iconData;
            }
        }

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const player = entry.target;
                if (entry.isIntersecting) player.play(); else player.pause();
            });
        }, { threshold: 0.1 });

        function observeLotties() {
            document.querySelectorAll('lottie-player').forEach(player => observer.observe(player));
        }

        async function init() {
            // ЛОГИН С РЕАЛЬНЫМИ ДАННЫМИ
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ tg_id: USER_ID, username: USERNAME })
            });
            const data = await res.json();
            userBalance = data.balance;
            myAssets = data.assets;
            updateBalance();

            const shopRes = await fetch('/api/shop');
            storeItems = await shopRes.json();
            render();
        }

        function updateBalance() { document.getElementById('balance').innerText = userBalance.toLocaleString(); }

        function switchTab(tab) {
            currentTab = tab;
            document.getElementById('tab-store').classList.toggle('active', tab === 'store');
            document.getElementById('tab-gifts').classList.toggle('active', tab === 'gifts');
            render();
        }

        function render() {
            const grid = document.getElementById('grid');
            grid.innerHTML = '';
            const data = currentTab === 'store' ? storeItems : myAssets;

            if(data.length === 0 && currentTab === 'gifts') {
                grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:#777;padding:20px">Пусто</div>';
                return;
            }

            data.forEach(item => {
                const card = document.createElement('div');
                card.className = 'card';
                if (currentTab === 'store' && item.type === 'auction') {
                    card.onclick = () => openAuctionModal(item);
                } else {
                    card.onclick = () => openModal(item);
                }
                
                let ribbon = '';
                if(currentTab === 'store' && item.type === 'auction') ribbon = '<div class="ribbon auction">AUCTION</div>';
                if(currentTab === 'gifts' && item.is_upgraded) ribbon = '<div class="ribbon">UPGRADED</div>';

                card.innerHTML = \`\${ribbon}<div class="card-icon">\${renderIcon(item.icon)}</div>\`;
                grid.appendChild(card);
            });
            observeLotties();
        }

        // --- STANDARD MODAL LOGIC ---
        function openModal(item) {
            selectedItem = item;
            const isMine = currentTab === 'gifts';
            
            document.getElementById('mIcon').innerHTML = renderIcon(item.icon);
            document.getElementById('mTitle').innerText = item.name;
            document.getElementById('mSubtitle').innerText = isMine 
                ? \`предмет #\${item.serial_number}, выпущен @NFTGifter\` 
                : 'Покупка из магазина';
            
            document.getElementById('ownerName').innerText = isMine ? item.original_owner : 'Магазин';

            const headerBg = document.getElementById('modalHeaderBg');
            const patternOverlay = document.getElementById('patternOverlay');
            
            if (isMine && item.is_upgraded) {
                const bgMap = { 'Black': '#111', 'Midnight': '#191970', 'Forest': '#013220', 'Lava': '#4a0404' };
                headerBg.style.backgroundColor = bgMap[item.background] || '#1a1a1a';
                
                if(item.pattern === 'Turkey') patternOverlay.style.backgroundImage = 'radial-gradient(#ffffff33 2px, transparent 2px)'; 
                else if(item.pattern === 'Star') patternOverlay.style.backgroundImage = 'linear-gradient(45deg, #ffffff22 25%, transparent 25%)';
                else patternOverlay.style.backgroundImage = 'none';
            } else {
                headerBg.style.backgroundColor = '#1a1a1a';
                patternOverlay.style.backgroundImage = 'radial-gradient(#ffffff11 1px, transparent 1px)';
            }

            const btn = document.getElementById('actionBtn');
            const btnText = document.getElementById('actionText');
            const btnIcon = document.getElementById('actionIcon');
            
            if (!isMine) {
                btnText.innerText = \`Купить за \${item.price} звёзд\`;
                btnIcon.innerText = '🛒';
                btn.style.background = '#2ea6ff';
            } else if (!item.is_upgraded) {
                btnText.innerText = "Улучшить предмет (2000 ⭐)";
                btnIcon.innerText = '⬆️';
                btn.style.background = 'linear-gradient(45deg, #ffc107, #ff9800)';
                btn.style.color = '#000';
            } else {
                btnText.innerText = "предложить сделку";
                btnIcon.innerText = '$';
                btn.style.background = '#3f3f3f';
                btn.style.color = '#fff';
            }

            const list = document.getElementById('attrList');
            list.innerHTML = '';
            const modelIcon = item.icon.startsWith('http') ? '💠' : item.icon;
            addAttrRow(list, modelIcon, 'Модель', \`\${item.name} <span class="val-blue">100%</span>\`);

            if (isMine && item.is_upgraded) {
                addAttrRow(list, ICONS.pattern, 'Узор', \`\${item.pattern} <span class="val-blue">\${item.rarity_pattern}%</span>\`);
                addAttrRow(list, ICONS.bg, 'Фон', \`\${item.background} <span class="val-blue">\${item.rarity_bg}%</span>\`);
            } else if (isMine) {
                 addAttrRow(list, '❓', 'Состояние', 'Базовое');
            }

            const priceVal = isMine ? (item.base_price * (item.is_upgraded ? 2 : 1)) : item.price;
            addAttrRow(list, ICONS.price, 'Стоимость', \`\${priceVal} звёзд\`);

            document.getElementById('modal').classList.add('open');
        }

        // --- AUCTION MODAL LOGIC ---
        function openAuctionModal(item) {
            selectedItem = item;
            document.getElementById('auctionIcon').innerHTML = renderIcon(item.icon);
            document.getElementById('auctionModal').classList.add('open');
        }

        function closeAuctionModal() {
            document.getElementById('auctionModal').classList.remove('open');
        }

        async function placeBid() {
            const btn = document.querySelector('.btn-auction');
            const originalText = btn.innerText;
            btn.innerText = "Обработка...";
            btn.disabled = true;

            const res = await fetch('/api/bid', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ tg_id: USER_ID, item_id: selectedItem.id, amount: 20000, username: USERNAME })
            });
            const data = await res.json();
            
            btn.innerText = originalText;
            btn.disabled = false;

            if(data.success) {
                userBalance = data.newBalance;
                myAssets.push(data.asset);
                updateBalance();
                closeAuctionModal();
                showVictoryPopup(selectedItem.name);
                tg.HapticFeedback.notificationOccurred('success');
            } else {
                alert(data.error);
            }
        }

        function showVictoryPopup(itemName) {
            document.getElementById('winItemName').innerText = itemName;
            document.getElementById('winItemName2').innerText = itemName;
            document.getElementById('victoryPopup').style.display = 'flex';
            for(let i=0; i<5; i++) {
                setTimeout(() => tg.HapticFeedback.impactOccurred('light'), i * 100);
            }
        }

        function closeVictory() {
            document.getElementById('victoryPopup').style.display = 'none';
        }

        function addAttrRow(container, icon, label, valueHtml) {
            const div = document.createElement('div');
            div.className = 'attr-row';
            div.innerHTML = \`<div class="attr-icon-box">\${icon}</div><div class="attr-details"><span class="attr-name">\${label}</span><span class="attr-value">\${valueHtml}</span></div>\`;
            container.appendChild(div);
        }

        function closeModal() { document.getElementById('modal').classList.remove('open'); }

        async function handleAction() {
            if (currentTab === 'store') {
                const res = await fetch('/api/buy', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ tg_id: USER_ID, item_id: selectedItem.id, username: USERNAME })
                });
                const data = await res.json();
                if(data.success) {
                    userBalance = data.newBalance;
                    myAssets.push(data.asset);
                    updateBalance();
                    closeModal();
                    tg.showPopup({title: 'Успех', message: 'Предмет куплен!', buttons: [{type: 'ok'}]});
                } else alert(data.error);
            } 
            else if (!selectedItem.is_upgraded) {
                const res = await fetch('/api/upgrade', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ tg_id: USER_ID, asset_id: selectedItem.id })
                });
                const data = await res.json();
                if(data.success) {
                    userBalance = data.newBalance;
                    selectedItem.is_upgraded = 1;
                    selectedItem.pattern = data.updates.pattern;
                    selectedItem.rarity_pattern = data.updates.rarity_pattern;
                    selectedItem.background = data.updates.background;
                    selectedItem.rarity_bg = data.updates.rarity_bg;
                    if (data.updates.new_icon) selectedItem.icon = data.updates.new_icon;
                    updateBalance();
                    openModal(selectedItem);
                    tg.HapticFeedback.notificationOccurred('success');
                } else alert(data.error);
            } else {
                tg.showPopup({title: 'Инфо', message: 'Скоро...', buttons: [{type: 'ok'}]});
            }
        }

        init();
    </script>
</body>
</html>
    `);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server: http://localhost:${PORT}`);
});
