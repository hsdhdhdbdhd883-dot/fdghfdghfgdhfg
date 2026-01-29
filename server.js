const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const sqlite3 = require('sqlite3').verbose();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());

// --- СПИСКИ ВАРИАНТОВ (Скины) ---
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

// IDs предметов, которые МОЖНО улучшать сейчас
const UPGRADABLE_IDS = [1, 4]; 

// --- БАЗА ДАННЫХ ---
const db = new sqlite3.Database('database.db'); 

db.serialize(() => {
    // Таблицы
    db.run(`CREATE TABLE IF NOT EXISTS users (
        telegram_id INTEGER PRIMARY KEY,
        username TEXT,
        photo_url TEXT,
        balance INTEGER DEFAULT 100000
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS shop_items (
        id INTEGER PRIMARY KEY,
        name TEXT,
        icon TEXT,
        price INTEGER,
        type TEXT,
        max_supply INTEGER DEFAULT 10000
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

    db.run(`CREATE TABLE IF NOT EXISTS auction_bids (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_id INTEGER,
        user_id INTEGER,
        username TEXT,
        photo_url TEXT,
        amount INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS offers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        asset_id INTEGER,
        buyer_id INTEGER,
        buyer_username TEXT,
        amount INTEGER,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // ЗАПОЛНЕНИЕ МАГАЗИНА
    db.get("SELECT count(*) as count FROM shop_items", (err, row) => {
        if (row.count === 0) {
            const stmt = db.prepare("INSERT INTO shop_items (id, name, icon, price, type, max_supply) VALUES (?, ?, ?, ?, ?, ?)");
            // 1. Moon
            stmt.run(1, 'Astral Shard', 'https://cdn.changes.tg/gifts/models/Astral%20Shard/lottie/Original.json', 5000, 'gift', 10000);
            // 2. Test
            stmt.run(2, 'Test Gift', 'https://cdn.changes.tg/gifts/models/Big%20Year/lottie/Telegram.json', 2500, 'gift', 10000);
            // 4. Medal
            stmt.run(4, 'Victory Medal', 'https://cdn.changes.tg/gifts/models/Victory%20Medal/lottie/Original.json', 10000, 'gift', 10000);
            // 5. Candle (Auction)
            stmt.run(5, 'B-Day Candle', 'https://cdn.changes.tg/gifts/models/B-Day%20Candle/lottie/Original.json', 20000, 'auction', 100);
            
            // НОВЫЕ (ID 6, 7, 8)
            stmt.run(6, 'Artisan Brick', 'https://cdn.changes.tg/gifts/models/Artisan%20Brick/lottie/Original.json', 1500, 'gift', 10000);
            stmt.run(7, 'Clover Pin', 'https://cdn.changes.tg/gifts/models/Clover%20Pin/lottie/Original.json', 3000, 'gift', 10000);
            stmt.run(8, 'Bow Tie', 'https://cdn.changes.tg/gifts/models/Bow%20Tie/lottie/Original.json', 4500, 'gift', 10000);
            
            // НОВЫЕ ПО ЗАПРОСУ (ID 9, 10)
            stmt.run(9, 'Candy Cane', 'https://cdn.changes.tg/gifts/models/Candy%20Cane/lottie/Original.json', 6000, 'gift', 10000);
            stmt.run(10, 'Sakura Flower', 'https://cdn.changes.tg/gifts/models/Sakura%20Flower/lottie/Original.json', 8000, 'gift', 10000);
            
            stmt.finalize();
        }
    });
});

// --- КОНФИГ ---
const PATTERNS = [
    { name: 'Turkey', rarity: 20 },
    { name: 'Star', rarity: 15 },
    { name: 'Hearts', rarity: 5 },
    { name: 'Matrix', rarity: 2 },
    { name: 'Test123', rarity: 0.01 }
];
const BACKGROUNDS = [
    { name: 'Black', rarity: 1.2, color: '#111111' },
    { name: 'Midnight', rarity: 10, color: '#191970' },
    { name: 'Forest', rarity: 15, color: '#013220' },
    { name: 'Lava', rarity: 5, color: '#4a0404' },
    { name: 'Haki', rarity: 5, color: '#204a04' },
    { name: 'Sakura', rarity: 5, color: '#aa0e90' }
];

function getRandomAttr(array) { return array[Math.floor(Math.random() * array.length)]; }

// --- SOCKET.IO ---
io.on('connection', (socket) => {
    socket.on('join_auction', (itemId) => {
        socket.join('auction_' + itemId);
        db.all("SELECT * FROM auction_bids WHERE item_id = ? ORDER BY id DESC LIMIT 20", [itemId], (err, rows) => {
            if(!err) socket.emit('auction_history', rows);
        });
    });
});

// --- API ---

app.post('/api/login', (req, res) => {
    const { tg_id, username, photo_url } = req.body;
    
    // ЛОГИКА ДЛЯ АДМИНА (h3lix_official)
    const adminId = 5000201808;
    const adminUsername = 'h3lix_official';
    
    // Определяем начальный баланс
    let startBalance = 100000;
    if (tg_id == adminId || username === adminUsername) {
        startBalance = 100000000; // 100 лямов
    }

    db.get("SELECT * FROM users WHERE telegram_id = ?", [tg_id], (err, user) => {
        if (!user) {
            db.run("INSERT INTO users (telegram_id, username, photo_url, balance) VALUES (?, ?, ?, ?)", 
                [tg_id, username, photo_url, startBalance], 
                () => { sendUserData(res, tg_id, username, startBalance); }
            );
        } else {
            // Обновляем данные при входе
            db.run("UPDATE users SET username = ?, photo_url = ? WHERE telegram_id = ?", [username, photo_url, tg_id], () => {
                sendUserData(res, tg_id, username, user.balance);
            });
        }
    });
});

function sendUserData(res, tg_id, username, balance) {
    db.all(`SELECT ua.*, si.name, COALESCE(ua.custom_icon, si.icon) as icon, si.price as base_price, si.type as item_type 
            FROM user_assets ua 
            JOIN shop_items si ON ua.item_id = si.id 
            WHERE ua.user_id = ?`, [tg_id], (err, assets) => {
        res.json({ balance: balance, assets: assets, username: username });
    });
}

app.get('/api/shop', (req, res) => { 
    db.all(`SELECT si.*, (SELECT COUNT(*) FROM user_assets WHERE item_id = si.id) as minted_count FROM shop_items si`, (err, rows) => { res.json(rows); }); 
});

app.get('/api/feed', (req, res) => {
    // ОПТИМИЗАЦИЯ: LIMIT 30
    db.all(`
        SELECT ua.*, u.username as owner_name, u.photo_url as owner_photo, si.name, COALESCE(ua.custom_icon, si.icon) as icon, si.price as base_price 
        FROM user_assets ua 
        JOIN shop_items si ON ua.item_id = si.id 
        JOIN users u ON ua.user_id = u.telegram_id
        ORDER BY ua.id DESC LIMIT 30`, (err, rows) => {
            res.json(rows);
    });
});

app.get('/api/offers/:assetId', (req, res) => {
    db.all("SELECT * FROM offers WHERE asset_id = ? AND status = 'pending' ORDER BY amount DESC", [req.params.assetId], (err, rows) => {
        res.json(rows);
    });
});

app.post('/api/make_offer', (req, res) => {
    const { buyer_id, buyer_username, asset_id, amount } = req.body;
    db.get("SELECT * FROM users WHERE telegram_id = ?", [buyer_id], (err, user) => {
        if(user.balance < amount) return res.json({error: "Недостаточно средств"});
        db.get("SELECT * FROM user_assets WHERE id = ?", [asset_id], (err, asset) => {
            if(asset.user_id == buyer_id) return res.json({error: "Это ваш предмет!"});
            db.run(`INSERT INTO offers (asset_id, buyer_id, buyer_username, amount) VALUES (?, ?, ?, ?)`, [asset_id, buyer_id, buyer_username, amount], () => res.json({success: true}));
        });
    });
});

app.post('/api/respond_offer', (req, res) => {
    const { offer_id, action, seller_id } = req.body;
    db.get("SELECT * FROM offers WHERE id = ?", [offer_id], (err, offer) => {
        if(!offer || offer.status !== 'pending') return res.json({error: "Неактуально"});
        if(action === 'decline') {
            db.run("UPDATE offers SET status = 'declined' WHERE id = ?", [offer_id]);
            return res.json({success: true, action: 'declined'});
        }
        if(action === 'accept') {
            db.get("SELECT * FROM users WHERE telegram_id = ?", [offer.buyer_id], (err, buyer) => {
                if(buyer.balance < offer.amount) return res.json({error: "У покупателя нет денег"});
                db.run("UPDATE users SET balance = balance - ? WHERE telegram_id = ?", [offer.amount, offer.buyer_id]);
                db.run("UPDATE users SET balance = balance + ? WHERE telegram_id = ?", [offer.amount, seller_id]);
                db.run("UPDATE user_assets SET user_id = ? WHERE id = ?", [offer.buyer_id, offer.asset_id]);
                db.run("UPDATE offers SET status = 'accepted' WHERE id = ?", [offer_id]);
                res.json({success: true, action: 'accepted'});
            });
        }
    });
});

app.post('/api/buy', (req, res) => {
    const { tg_id, item_id, username } = req.body;
    db.get("SELECT * FROM users WHERE telegram_id = ?", [tg_id], (err, user) => {
        db.get("SELECT * FROM shop_items WHERE id = ?", [item_id], (err, item) => {
            if (user.balance < item.price) return res.json({ error: "Мало звезд" });
            if (item.type === 'auction') return res.json({ error: "Только аукцион!" });
            db.get("SELECT COUNT(*) as count FROM user_assets WHERE item_id = ?", [item_id], (err, row) => {
                if (row.count >= item.max_supply) return res.json({ error: "Распродано!" });
                const newBalance = user.balance - item.price;
                db.run("UPDATE users SET balance = ? WHERE telegram_id = ?", [newBalance, tg_id]);
                const serial = row.count + 1;
                db.run(`INSERT INTO user_assets (user_id, item_id, serial_number, original_owner) VALUES (?, ?, ?, ?)`, [tg_id, item_id, serial, username], function(err) {
                    res.json({ success: true, newBalance, asset: { id: this.lastID, item_id, serial_number: serial, name: item.name, icon: item.icon, is_upgraded: 0, original_owner: username, base_price: item.price, item_type: item.type }});
                });
            });
        });
    });
});

app.post('/api/bid', (req, res) => {
    const { tg_id, item_id, amount, username, photo_url } = req.body;
    db.get("SELECT * FROM users WHERE telegram_id = ?", [tg_id], (err, user) => {
        if (user.balance < amount) return res.json({ error: "Недостаточно звезд!" });
        db.get("SELECT * FROM shop_items WHERE id = ?", [item_id], (err, item) => {
            const newBalance = user.balance - amount;
            db.run("UPDATE users SET balance = ? WHERE telegram_id = ?", [newBalance, tg_id]);
            db.run(`INSERT INTO auction_bids (item_id, user_id, username, photo_url, amount) VALUES (?, ?, ?, ?, ?)`, [item_id, tg_id, username, photo_url, amount], function (err) {
                const bidData = { id: this.lastID, username: username, photo_url: photo_url, amount: amount };
                io.to('auction_' + item_id).emit('new_bid', bidData);
                res.json({ success: true, newBalance: newBalance });
            });
        });
    });
});

app.post('/api/upgrade', (req, res) => {
    const { tg_id, asset_id } = req.body;
    const UPGRADE_PRICE = 2000; 
    db.get("SELECT * FROM users WHERE telegram_id = ?", [tg_id], (err, user) => {
        db.get("SELECT * FROM user_assets WHERE id = ?", [asset_id], (err, asset) => {
            
            if (!UPGRADABLE_IDS.includes(asset.item_id)) {
                return res.json({ error: "Улучшение недоступно" });
            }

            if (asset.is_upgraded === 1) return res.json({ error: "Уже улучшено!" });
            if (user.balance < UPGRADE_PRICE) return res.json({ error: "Мало звезд" });
            
            const pat = getRandomAttr(PATTERNS);
            const bg = getRandomAttr(BACKGROUNDS);
            let newIcon = null;
            if (asset.item_id === 1) newIcon = getRandomAttr(MOON_VARIANTS);
            else if (asset.item_id === 4) newIcon = getRandomAttr(MEDAL_VARIANTS);
            
            const newBalance = user.balance - UPGRADE_PRICE;
            db.run("UPDATE users SET balance = ? WHERE telegram_id = ?", [newBalance, tg_id]);
            db.run(`UPDATE user_assets SET pattern = ?, rarity_pattern = ?, background = ?, rarity_bg = ?, is_upgraded = 1, custom_icon = ? WHERE id = ?`, 
                [pat.name, pat.rarity, bg.name, bg.rarity, newIcon, asset_id], () => {
                    res.json({ success: true, newBalance, updates: { pattern: pat.name, rarity_pattern: pat.rarity, background: bg.name, rarity_bg: bg.rarity, new_icon: newIcon }});
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
    <!-- LOTTIE PLAYER & DOTLOTTIE -->
    <script src="https://unpkg.com/@lottiefiles/lottie-player@latest/dist/lottie-player.js"></script>
    <script src="https://unpkg.com/@lottiefiles/dotlottie-wc@0.8.11/dist/dotlottie-wc.js" type="module"></script>
    
    <script src="https://telegram.org/js/telegram-web-app.js"></script>
    <script src="/socket.io/socket.io.js"></script>
    <title>OpenGifter</title>
    <style>
        /* SF Pro Font Stack */
        :root { 
            --bg-color: #17212b; --card-bg: #232e3c; --text-color: #ffffff; --secondary-text: #707579; --accent: #2ea6ff; --gold: #ffc107; --red: #ff5252; --btn-bg: #2b3541; --modal-overlay: #000; 
        }
        body { 
            background-color: var(--bg-color); color: var(--text-color); 
            font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, Helvetica, Arial, sans-serif; 
            margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; 
        }
        
        .header { text-align: center; padding: 20px 0; }
        .user-avatar-header { width: 80px; height: 80px; border-radius: 50%; margin-bottom: 10px; object-fit: cover; }
        
        .stars-balance { display: inline-flex; align-items: center; background: rgba(0,0,0,0.2); padding: 5px 12px; border-radius: 20px; font-weight: bold; color: var(--gold); position: absolute; top: 15px; right: 15px; gap: 5px; }
        
        .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; padding: 0 15px 100px; margin-top: 10px; }
        .card { background-color: var(--card-bg); border-radius: 12px; aspect-ratio: 1; display: flex; align-items: center; justify-content: center; position: relative; overflow: hidden; border: 1px solid transparent; transition: all 0.2s; }
        .card:active { transform: scale(0.95); }
        .card-icon { width: 80%; height: 80%; display: flex; align-items: center; justify-content: center; font-size: 40px; z-index: 2; pointer-events: none; }
        
        .ribbon { position: absolute; top: 10px; right: -28px; width: 100px; background: var(--gold); color: #000; text-align: center; font-size: 10px; font-weight: 800; transform: rotate(45deg); padding: 4px 0; z-index: 3;}
        .ribbon.auction { background: #3d60d8; color: white; }
        .ribbon.serial { background: #ffc107; color: black; }
        
        .bottom-nav { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: rgba(30, 40, 50, 0.95); backdrop-filter: blur(10px); border-radius: 20px; padding: 5px; display: flex; gap: 5px; box-shadow: 0 5px 20px rgba(0,0,0,0.5); z-index: 1000; }
        .nav-item { padding: 10px 20px; border-radius: 15px; color: var(--secondary-text); text-decoration: none; font-size: 14px; display: flex; flex-direction: column; align-items: center; gap: 4px; cursor: pointer; }
        .nav-item.active { background-color: var(--card-bg); color: var(--accent); }

        /* MODAL */
        .modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: var(--modal-overlay); z-index: 2000; flex-direction: column; }
        .modal.open { display: flex; animation: fadeIn 0.2s; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

        .modal-header-bg { 
            position: relative; flex-shrink: 0; height: auto; min-height: 280px; 
            display: flex; flex-direction: column; align-items: center; justify-content: center; 
            background-color: #1a1a1a; 
            background-image: radial-gradient(rgba(255,255,255,0.1) 15%, transparent 16%), radial-gradient(rgba(255,255,255,0.1) 15%, transparent 16%);
            background-size: 30px 30px;
            background-position: 0 0, 15px 15px;
            transition: background 0.5s; overflow: hidden; padding-bottom: 20px; 
        }
        .pattern-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; opacity: 0.15; background-size: 50px 50px; pointer-events: none; }
        .close-btn-float { position: absolute; top: 15px; right: 15px; background: rgba(0,0,0,0.3); color: #fff; border-radius: 20px; padding: 5px 12px; font-size: 14px; cursor: pointer; z-index: 10; }
        .modal-main-icon { width: 140px; height: 140px; display: flex; align-items: center; justify-content: center; font-size: 80px; margin-bottom: 5px; margin-top: 10px; z-index: 2; filter: drop-shadow(0 0 20px rgba(0,0,0,0.5)); }
        
        .modal-title { font-size: 22px; font-weight: bold; margin: 0; z-index: 2; }
        .modal-subtitle { color: rgba(255,255,255,0.6); font-size: 13px; margin-top: 2px; z-index: 2; }
        .modal-body { background: var(--bg-color); flex: 1; padding: 15px; border-radius: 20px 20px 0 0; margin-top: -20px; z-index: 5; position: relative; overflow-y: auto; }
        
        /* UNIFIED BUTTON STYLE */
        .action-btn { 
            background-color: #007aff; /* Default Blue */
            color: white; 
            border-radius: 12px; 
            padding: 16px; 
            text-align: center; 
            font-weight: bold; 
            font-size: 16px;
            margin-bottom: 15px; 
            display: flex; 
            flex-direction: column; 
            align-items: center; 
            justify-content: center; 
            cursor: pointer; 
            border: none;
            width: 100%;
            box-sizing: border-box;
        }
        .action-btn.disabled { 
            background-color: #2b2f36; 
            color: #707579; 
            cursor: not-allowed; 
        }
        
        .owner-row { background: var(--card-bg); border-radius: 12px; padding: 10px 15px; display: flex; align-items: center; justify-content: space-between; margin-bottom: 15px; }
        .owner-info h4 { margin: 0; font-size: 14px; }
        .owner-info p { margin: 0; font-size: 12px; color: var(--secondary-text); }
        .btn-go { background: var(--accent); color: white; border: none; padding: 6px 12px; border-radius: 16px; font-size: 12px; font-weight: bold; }
        
        .attributes-list { background: var(--card-bg); border-radius: 12px; overflow: hidden; margin-bottom: 20px; }
        .attr-row { display: flex; align-items: center; padding: 12px 15px; border-bottom: 1px solid rgba(0,0,0,0.1); }
        .attr-row:last-child { border-bottom: none; }
        .attr-icon-box { width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; font-size: 20px; margin-right: 15px; }
        .attr-details { flex: 1; }
        .attr-name { font-size: 14px; font-weight: bold; display: block; }
        .attr-value { font-size: 13px; color: var(--secondary-text); display: flex; align-items: center; gap: 5px; }
        .val-blue { color: var(--accent); }

        .offers-title { font-size: 16px; font-weight: bold; margin-bottom: 10px; color: #fff; text-align: center; }
        .offer-item { background: var(--card-bg); padding: 12px; border-radius: 10px; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between; border: 1px solid rgba(255,255,255,0.05); }
        .offer-left { display: flex; align-items: center; gap: 10px; }
        .offer-icon { font-size: 20px; }
        .btn-offer-accept { background: #2ea6ff; border:none; color:white; padding: 6px 12px; border-radius: 8px; font-weight: bold; font-size: 12px; cursor: pointer;}

        .popup-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 3000; display: none; align-items: center; justify-content: center; }
        .popup-card { background: #1c242d; width: 85%; border-radius: 20px; padding: 25px; text-align: center; position: relative; animation: popIn 0.3s; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
        @keyframes popIn { from { transform: scale(0.8); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        .popup-title { font-size: 20px; font-weight: bold; margin-bottom: 10px; color: white; }
        .popup-desc { color: #8a9aa8; font-size: 14px; line-height: 1.5; margin-bottom: 25px; }
        .popup-btn-row { display: flex; gap: 10px; justify-content: center; }
        .popup-btn { flex: 1; padding: 12px; border-radius: 12px; border: none; font-weight: bold; font-size: 16px; cursor: pointer; }
        .btn-primary { background: #2f3842; color: white; }
        .btn-blue { background: #2ea6ff; color: white; }
        .btn-red { background: #ff5252; color: white; }
        .popup-confetti { font-size: 50px; margin-bottom: 15px; display: block; }
        .popup-close-x { position: absolute; top: 15px; right: 15px; background: rgba(255,255,255,0.1); width: 24px; height: 24px; border-radius: 50%; color: #aaa; display: flex; align-items: center; justify-content: center; cursor: pointer; }
        .input-group { margin-bottom: 20px; }
        .input-field { width: 100%; background: #2b2f36; border: 1px solid #3f444e; color: white; padding: 12px; border-radius: 10px; font-size: 16px; box-sizing: border-box; }
        
        /* AUCTION CSS */
        .auction-modal-content { background-color: #18191d; width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; position: relative; padding-top: 20px; }
        .auction-header { width: 100%; text-align: center; position: relative; margin-bottom: 10px; flex-shrink: 0; }
        .auction-title { font-size: 20px; font-weight: bold; color: #fff; margin-bottom: 4px; }
        .auction-subtitle { font-size: 14px; color: #707579; }
        .auction-close { position: absolute; right: 20px; top: 0px; width: 28px; height: 28px; background: rgba(255,255,255,0.1); border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #ccc; font-size: 16px; }
        .auction-bid-tag { background: #235c97; color: #ffffff; padding: 8px 20px; border-radius: 20px; font-weight: bold; font-size: 18px; margin-bottom: 10px; display: flex; align-items: center; gap: 5px; }
        .auction-main-icon { width: 160px; height: 160px; margin-bottom: 15px; filter: drop-shadow(0 0 40px rgba(0,0,0,0.5)); flex-shrink: 0; }
        .bid-slider-container { width: 85%; margin-bottom: 15px; flex-shrink: 0; }
        input[type=range] { width: 100%; -webkit-appearance: none; background: transparent; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; height: 20px; width: 20px; border-radius: 50%; background: #ffffff; cursor: pointer; margin-top: -8px; box-shadow: 0 0 5px rgba(0,0,0,0.5); }
        input[type=range]::-webkit-slider-runnable-track { width: 100%; height: 6px; cursor: pointer; background: #2c2e33; border-radius: 3px; }
        .auction-bids-list { flex: 1; width: 100%; overflow-y: auto; padding: 0 20px; box-sizing: border-box; margin-bottom: 10px; }
        .bid-row { display: flex; align-items: center; padding: 8px 0; border-bottom: 1px solid #2b2f36; }
        .bid-avatar { width: 36px; height: 36px; border-radius: 50%; margin-right: 12px; background: #333; object-fit: cover; }
        .bid-info { flex: 1; }
        .bid-name { font-size: 14px; font-weight: bold; color: #fff; }
        .bid-amount { font-size: 14px; color: #ffc107; font-weight: bold; display: flex; align-items: center; gap: 4px; }
        .auction-footer { width: 100%; padding: 20px; box-sizing: border-box; background: #18191d; flex-shrink: 0; border-top: 1px solid #2b2f36; }
        .btn-auction { background: #1274c4; color: white; width: 100%; padding: 16px; border-radius: 12px; font-size: 16px; font-weight: 600; border: none; cursor: pointer; }
        .auction-info-text { color: #555; font-size: 13px; text-align: center; margin-bottom: 15px; }
    </style>
</head>
<body>

    <div class="stars-balance">
        <dotlottie-wc src="https://lottie.host/f42e58f6-6962-4577-9b8a-356493ceb944/y8oP6MQR1T.lottie" style="width: 24px; height: 24px;" autoplay loop></dotlottie-wc>
        <span id="balance">...</span>
    </div>

    <div class="header">
        <div id="headerAvatarContainer">
             <div class="avatar-placeholder">✊</div>
        </div>
        <h1>Магазин</h1>
        <p style="color:#707579; font-size:14px">OpenGifter</p>
    </div>

    <div class="grid" id="grid"></div>

    <div class="bottom-nav">
        <div class="nav-item" onclick="switchTab('gifts')" id="tab-gifts">Подарки</div>
        <div class="nav-item active" onclick="switchTab('store')" id="tab-store">Магазин</div>
        <div class="nav-item" onclick="switchTab('feed')" id="tab-feed">Лента</div>
    </div>

    <!-- MAIN MODAL (Unified) -->
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

            <div class="owner-row" id="ownerRow">
                <div class="owner-info">
                    <h4>Владелец</h4>
                    <p id="ownerName"></p>
                </div>
                <button class="btn-go">Перейти</button>
            </div>

            <div class="attributes-list" id="attrList"></div>

            <div id="offersContainer" style="display:none;">
                <div class="offers-title">Лучшие предложения</div>
                <div id="offersList"></div>
            </div>
        </div>
    </div>

    <!-- AUCTION MODAL -->
    <div class="modal" id="auctionModal">
        <div class="auction-modal-content">
            <div class="auction-header">
                <div class="auction-title">Размещение ставки</div>
                <div class="auction-subtitle" id="auctionTimer">Осталось 3 мин 00 сек</div>
                <div class="auction-close" onclick="closeAuctionModal()">✕</div>
            </div>
            
            <div class="auction-bid-tag">
                <dotlottie-wc src="https://lottie.host/f42e58f6-6962-4577-9b8a-356493ceb944/y8oP6MQR1T.lottie" style="width: 20px; height: 20px;" autoplay loop></dotlottie-wc>
                <span id="bidAmountDisplay">20000</span>
            </div>
            
            <div class="bid-slider-container">
                <input type="range" id="bidSlider" min="20000" max="100000" step="100" value="20000" oninput="updateBidDisplay(this.value)">
            </div>

            <div class="auction-main-icon" id="auctionIcon"></div>
            
            <div class="auction-bids-list" id="bidsList"></div>
            
            <div class="auction-footer">
                <div class="auction-info-text">В каждом раунде будет разыграно <b>3 шт.</b></div>
                <button class="btn-auction" onclick="placeBid()">Сделать ставку</button>
            </div>
        </div>
    </div>

    <!-- POPUPS -->
    <div class="popup-overlay" id="makeOfferPopup">
        <div class="popup-card">
            <div class="popup-close-x" onclick="closeMakeOffer()">✕</div>
            <div class="popup-title">Предложить сделку</div>
            <div class="popup-desc">Сколько вы готовы заплатить?</div>
            <div class="input-group"><input type="number" id="offerInput" class="input-field" placeholder="Сумма в звездах"></div>
            <button class="popup-btn btn-blue" onclick="sendOffer()">Предложить</button>
        </div>
    </div>

    <div class="popup-overlay" id="respondPopup">
        <div class="popup-card">
            <div class="popup-title" id="respTitle">Активное предложение</div>
            <div class="popup-desc" id="respDesc"></div>
            <div style="font-size: 24px; font-weight: bold; color: #ffc107; margin-bottom: 20px;" id="respPrice"></div>
            <div class="popup-btn-row">
                <button class="popup-btn btn-primary" onclick="confirmDecline()">Отклонить</button>
                <button class="popup-btn btn-blue" onclick="acceptOffer()">Принять</button>
            </div>
        </div>
    </div>

    <div class="popup-overlay" id="declineConfirmPopup">
        <div class="popup-card">
            <div class="popup-title">Отказаться?</div>
            <div class="popup-desc">Пользователь получит уведомление об отказе.</div>
            <div class="popup-btn-row">
                <button class="popup-btn btn-primary" onclick="closeDecline()">Отмена</button>
                <button class="popup-btn btn-blue" onclick="doDecline()">Отказаться</button>
            </div>
        </div>
    </div>

    <div class="popup-overlay" id="msgPopup">
        <div class="popup-card">
            <div class="popup-confetti" id="msgIcon">🎉</div>
            <div class="popup-title" id="msgTitle">Успех</div>
            <div class="popup-desc" id="msgDesc"></div>
            <button class="popup-btn btn-primary" onclick="closeMsg()">OK</button>
        </div>
    </div>

    <div class="popup-overlay" id="victoryPopup">
        <div class="popup-card">
            <div class="popup-close-x" onclick="closeVictory()">✕</div>
            <div class="popup-confetti">🎉</div>
            <div class="popup-title">Победа!</div>
            <div class="popup-desc">Ваша ставка принята! Вы лидер в аукционе за <span id="winItemName">Item</span>.</div>
            <button class="popup-btn" onclick="closeVictory()">OK</button>
        </div>
    </div>

    <script>
        const tg = window.Telegram.WebApp;
        tg.expand();
        const socket = io();
        
        const tgUser = tg.initDataUnsafe?.user;
        const USER_ID = tgUser ? tgUser.id : 123456;
        const USERNAME = tgUser ? (tgUser.username || tgUser.first_name) : "Guest";
        const PHOTO_URL = tgUser?.photo_url || "https://cdn-icons-png.flaticon.com/512/147/147144.png";

        if(tgUser?.photo_url) {
            document.getElementById('headerAvatarContainer').innerHTML = \`<img src="\${PHOTO_URL}" class="user-avatar-header">\`;
        }

        let userBalance = 0;
        let storeItems = [];
        let myAssets = [];
        let feedAssets = [];
        let currentTab = 'store'; 
        let selectedItem = null;
        let selectedOffer = null;
        let currentBidValue = 20000;

        // ПРЕДМЕТЫ, КОТОРЫЕ МОЖНО УЛУЧШАТЬ
        const UPGRADABLE_IDS = [1, 4];

        const STAR_ICON_HTML = \`<dotlottie-wc src="https://lottie.host/f42e58f6-6962-4577-9b8a-356493ceb944/y8oP6MQR1T.lottie" style="width: 18px; height: 18px; display:inline-block; vertical-align: middle;" autoplay loop></dotlottie-wc>\`;
        const BG_COLORS = { 'Black': '#111111', 'Midnight': '#191970', 'Forest': '#013220', 'Lava': '#4a0404' };

        // ОПТИМИЗАЦИЯ: ОДИН OBSERVER
        let observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const player = entry.target;
                if (entry.isIntersecting) player.play(); else player.pause();
            });
        }, { threshold: 0.1 });

        function renderIcon(iconData) {
            if (iconData.startsWith('http')) {
                return \`<lottie-player src="\${iconData}" background="transparent" speed="1" style="width: 100%; height: 100%;" loop autoplay class="lottie-anim"></lottie-player>\`;
            } else { return iconData; }
        }

        function observeLotties() {
            observer.disconnect();
            document.querySelectorAll('lottie-player').forEach(player => observer.observe(player));
        }

        async function init() {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ tg_id: USER_ID, username: USERNAME, photo_url: PHOTO_URL })
            });
            const data = await res.json();
            userBalance = data.balance;
            myAssets = data.assets;
            updateBalance();

            const shopRes = await fetch('/api/shop');
            storeItems = await shopRes.json();
            
            const feedRes = await fetch('/api/feed');
            feedAssets = await feedRes.json();

            render();
            
            const slider = document.getElementById('bidSlider');
            slider.max = userBalance; 
        }

        function updateBalance() { 
            document.getElementById('balance').innerText = userBalance.toLocaleString();
            document.getElementById('bidSlider').max = userBalance; 
        }

        function updateBidDisplay(val) {
            currentBidValue = parseInt(val);
            document.getElementById('bidAmountDisplay').innerText = currentBidValue.toLocaleString();
        }

        function switchTab(tab) {
            currentTab = tab;
            document.getElementById('tab-store').classList.toggle('active', tab === 'store');
            document.getElementById('tab-gifts').classList.toggle('active', tab === 'gifts');
            document.getElementById('tab-feed').classList.toggle('active', tab === 'feed');
            render();
        }

        function render() {
            const grid = document.getElementById('grid');
            grid.innerHTML = '';
            
            let data = [];
            if(currentTab === 'store') data = storeItems;
            else if(currentTab === 'gifts') data = myAssets;
            else if(currentTab === 'feed') data = feedAssets;

            if(data.length === 0 && currentTab === 'gifts') {
                grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:#777;padding:20px">Пусто</div>';
                return;
            }

            data.forEach(item => {
                const card = document.createElement('div');
                card.className = 'card';
                card.onclick = () => openModal(item);
                
                let ribbon = '';
                if(currentTab === 'store') {
                    if(item.type === 'auction') ribbon = '<div class="ribbon auction">AUCTION</div>';
                    else if (item.minted_count >= item.max_supply) ribbon = '<div class="ribbon" style="background:#555">SOLD</div>';
                } else {
                    if(item.is_upgraded || item.serial_number) {
                        ribbon = \`<div class="ribbon serial">#\${item.serial_number}</div>\`;
                    }
                }

                if ((currentTab === 'gifts' || currentTab === 'feed') && item.is_upgraded && item.background) {
                    const color = BG_COLORS[item.background];
                    if (color) {
                        card.style.background = \`linear-gradient(135deg, \${color}, #1a1a1a)\`;
                        card.style.borderColor = 'rgba(255,255,255,0.1)';
                    }
                }

                card.innerHTML = \`\${ribbon}<div class="card-icon">\${renderIcon(item.icon)}</div>\`;
                grid.appendChild(card);
            });
            observeLotties();
        }

        async function openModal(item) {
            selectedItem = item;
            
            let isMine = false;
            if(currentTab === 'gifts') isMine = true;
            if(currentTab === 'feed' && item.user_id == USER_ID) isMine = true;
            
            document.getElementById('mIcon').innerHTML = renderIcon(item.icon);
            document.getElementById('mTitle').innerText = item.name;
            
            let subtitle = 'Покупка из магазина';
            if(item.serial_number) subtitle = \`предмет #\${item.serial_number}, выпущен @h3lix_official\`;
            
            // Если в магазине, и это не улучшаемый предмет - показываем "Подарок можно будет..."
            if(currentTab === 'store' && !UPGRADABLE_IDS.includes(item.id) && item.type !== 'auction') {
                subtitle = "Подарок можно будет улучшить в будущем";
            }
            document.getElementById('mSubtitle').innerText = subtitle;
            
            let ownerName = "Магазин";
            if(item.owner_name) ownerName = item.owner_name;
            else if(item.original_owner) ownerName = item.original_owner;
            if(isMine) ownerName = "Вы";
            document.getElementById('ownerName').innerText = ownerName;

            const headerBg = document.getElementById('modalHeaderBg');
            const patternOverlay = document.getElementById('patternOverlay');
            
            if (item.is_upgraded) {
                const bgMap = BG_COLORS;
                headerBg.style.backgroundColor = bgMap[item.background] || '#1a1a1a';
                if(item.pattern === 'Turkey') patternOverlay.style.backgroundImage = 'radial-gradient(#ffffff33 2px, transparent 2px)'; 
                else if(item.pattern === 'Star') patternOverlay.style.backgroundImage = 'linear-gradient(45deg, #ffffff22 25%, transparent 25%)';
                else patternOverlay.style.backgroundImage = 'none';
            } else {
                headerBg.style.backgroundColor = '#1a1a1a';
                patternOverlay.style.backgroundImage = 'none';
            }

            const btn = document.getElementById('actionBtn');
            const btnText = document.getElementById('actionText');
            const offersContainer = document.getElementById('offersContainer');
            offersContainer.style.display = 'none';
            
            // СБРОС КЛАССОВ КНОПКИ
            btn.className = 'action-btn'; // Вернуть базу
            btn.onclick = null;

            if(currentTab === 'store') {
                if(item.type === 'auction') {
                    btnText.innerText = "Аукцион (Скоро)";
                    btn.onclick = () => openAuctionModal(item);
                } else if(item.minted_count >= item.max_supply) {
                    btnText.innerText = "Распродано";
                    btn.classList.add('disabled');
                } else {
                    btnText.innerText = \`Купить за \${item.price} звёзд\`;
                    btn.onclick = handleAction;
                }
            } else {
                if(isMine) {
                    if(!item.is_upgraded) {
                        if (UPGRADABLE_IDS.includes(item.item_id || item.id)) {
                            btnText.innerText = "Улучшить";
                            btn.onclick = handleAction;
                        } else {
                            btnText.innerText = "Улучшение недоступно";
                            btn.classList.add('disabled');
                        }
                    } else {
                        btnText.innerText = "Продать (Скоро)";
                        btn.classList.add('disabled');
                        loadOffers(item.id);
                    }
                } else {
                    btnText.innerText = "Предложить сделку";
                    btn.onclick = openMakeOffer;
                }
            }

            const list = document.getElementById('attrList');
            list.innerHTML = '';
            
            // 1. МОДЕЛЬ (С ИКОНКОЙ)
            const modelIconHtml = item.icon.startsWith('http') ? \`<div style="width:24px;height:24px">\${renderIcon(item.icon)}</div>\` : '💠';
            addAttrRow(list, modelIconHtml, 'Модель', \`\${item.name} <span class="val-blue">100%</span>\`);

            if (item.is_upgraded) {
                addAttrRow(list, '🦄', 'Узор', \`\${item.pattern} <span class="val-blue">\${item.rarity_pattern}%</span>\`);
                const bgColor = BG_COLORS[item.background] || '#000';
                const bgSquare = \`<div style="width: 24px; height: 24px; background: \${bgColor}; border-radius: 6px; border: 1px solid rgba(255,255,255,0.2);"></div>\`;
                addAttrRow(list, bgSquare, 'Фон', \`\${item.background} <span class="val-blue">\${item.rarity_bg}%</span>\`);
            } else if (item.serial_number) {
                 addAttrRow(list, '❓', 'Состояние', 'Базовое');
            }

            if(item.base_price) {
                addAttrRow(list, STAR_ICON_HTML, 'Стоимость', \`\${item.base_price} звёзд\`);
            }

            document.getElementById('modal').classList.add('open');
        }

        // --- P2P LOGIC ---
        function openMakeOffer() { document.getElementById('makeOfferPopup').style.display = 'flex'; }
        function closeMakeOffer() { document.getElementById('makeOfferPopup').style.display = 'none'; }
        async function sendOffer() {
            const amount = document.getElementById('offerInput').value;
            if(!amount || amount <= 0) return alert("Введите сумму");
            closeMakeOffer();
            const res = await fetch('/api/make_offer', {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ buyer_id: USER_ID, buyer_username: USERNAME, asset_id: selectedItem.id, amount: parseInt(amount) })
            });
            const result = await res.json();
            if(result.success) {
                showMsg('Предложение отправлено!', 'Пользователь получит уведомление.');
                closeModal();
            } else { alert(result.error); }
        }

        async function loadOffers(assetId) {
            const res = await fetch(\`/api/offers/\${assetId}\`);
            const offers = await res.json();
            const container = document.getElementById('offersContainer');
            const list = document.getElementById('offersList');
            list.innerHTML = '';
            if(offers.length > 0) {
                container.style.display = 'block';
                offers.forEach(off => {
                    const div = document.createElement('div');
                    div.className = 'offer-item';
                    div.innerHTML = \`<div class="offer-left"><div class="offer-icon">⭐️</div><div><div style="font-weight:bold">\${off.amount} звезды</div><div style="font-size:12px;color:#777">От \${off.buyer_username}</div></div></div><button class="btn-offer-accept" onclick='openRespondPopup(\${JSON.stringify(off)})'>Принять</button>\`;
                    list.appendChild(div);
                });
            } else { container.style.display = 'none'; }
        }

        function openRespondPopup(offer) {
            selectedOffer = offer;
            document.getElementById('respTitle').innerText = 'Активное предложение';
            document.getElementById('respDesc').innerText = \`\${offer.buyer_username} хочет купить \${selectedItem.name} #\${selectedItem.serial_number}\`;
            document.getElementById('respPrice').innerText = \`\${offer.amount} ⭐️\`;
            document.getElementById('respondPopup').style.display = 'flex';
        }

        async function acceptOffer() {
            document.getElementById('respondPopup').style.display = 'none';
            const res = await fetch('/api/respond_offer', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ offer_id: selectedOffer.id, action: 'accept', seller_id: USER_ID }) });
            const r = await res.json();
            if(r.success) {
                showMsg('Продано!', \`Вы получили \${selectedOffer.amount} звезд.\`);
                myAssets = myAssets.filter(a => a.id !== selectedItem.id);
                userBalance += selectedOffer.amount;
                updateBalance();
                closeModal();
            } else { alert(r.error); }
        }

        function confirmDecline() {
            document.getElementById('respondPopup').style.display = 'none';
            document.getElementById('declineConfirmPopup').style.display = 'flex';
        }
        function closeDecline() { document.getElementById('declineConfirmPopup').style.display = 'none'; }
        async function doDecline() {
            closeDecline();
            const res = await fetch('/api/respond_offer', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ offer_id: selectedOffer.id, action: 'decline' }) });
            showMsg('Отклонено', 'Предложение удалено.');
            closeModal();
        }

        // --- UTILS ---
        function addAttrRow(container, icon, label, valueHtml) {
            const div = document.createElement('div');
            div.className = 'attr-row';
            div.innerHTML = \`<div class="attr-icon-box">\${icon}</div><div class="attr-details"><span class="attr-name">\${label}</span><span class="attr-value">\${valueHtml}</span></div>\`;
            container.appendChild(div);
        }
        function closeModal() { document.getElementById('modal').classList.remove('open'); }
        function showMsg(title, desc) {
            document.getElementById('msgTitle').innerText = title;
            document.getElementById('msgDesc').innerText = desc;
            document.getElementById('msgPopup').style.display = 'flex';
        }
        function closeMsg() { document.getElementById('msgPopup').style.display = 'none'; }

        // --- AUCTION ---
        let auctionInterval;
        function startAuctionTimer() {
            let timeLeft = 180;
            const timerEl = document.getElementById('auctionTimer');
            if(auctionInterval) clearInterval(auctionInterval);
            function update() {
                const m = Math.floor(timeLeft / 60);
                const s = timeLeft % 60;
                timerEl.innerText = \`Осталось \${m} мин \${s < 10 ? '0'+s : s} сек\`;
                if(timeLeft <= 0) { clearInterval(auctionInterval); timerEl.innerText = "Аукцион завершен"; }
                timeLeft--;
            }
            update();
            auctionInterval = setInterval(update, 1000);
        }
        function openAuctionModal(item) {
            selectedItem = item;
            document.getElementById('auctionIcon').innerHTML = renderIcon(item.icon);
            document.getElementById('bidsList').innerHTML = '<div style="color:#777; text-align:center; padding:10px;">Загрузка...</div>';
            socket.emit('join_auction', item.id);
            const slider = document.getElementById('bidSlider');
            slider.value = 20000;
            updateBidDisplay(20000);
            startAuctionTimer();
            document.getElementById('auctionModal').classList.add('open');
        }
        function closeAuctionModal() { if(auctionInterval) clearInterval(auctionInterval); document.getElementById('auctionModal').classList.remove('open'); }
        async function placeBid() {
            const amount = currentBidValue;
            if(amount > userBalance) { alert("Недостаточно средств!"); return; }
            const res = await fetch('/api/bid', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ tg_id: USER_ID, item_id: selectedItem.id, amount: amount, username: USERNAME, photo_url: PHOTO_URL }) });
            const data = await res.json();
            if(data.success) {
                userBalance = data.newBalance;
                updateBalance();
                tg.HapticFeedback.notificationOccurred('success');
            } else { alert(data.error); }
        }
        function closeVictory() { document.getElementById('victoryPopup').style.display = 'none'; }
        socket.on('new_bid', (bidData) => { addBidToList(bidData); });
        socket.on('auction_history', (history) => { const list = document.getElementById('bidsList'); list.innerHTML = ''; history.forEach(bid => addBidToList(bid)); });
        function addBidToList(bid) {
            const list = document.getElementById('bidsList');
            const row = document.createElement('div');
            row.className = 'bid-row';
            row.innerHTML = \`<img src="\${bid.photo_url || 'https://cdn-icons-png.flaticon.com/512/147/147144.png'}" class="bid-avatar"><div class="bid-info"><div class="bid-name">\${bid.username}</div></div><div class="bid-amount">\${STAR_ICON_HTML} \${parseInt(bid.amount).toLocaleString()}</div>\`;
            list.prepend(row);
        }

        // --- ACTIONS ---
        async function handleAction() {
            if(currentTab === 'store') {
                const res = await fetch('/api/buy', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ tg_id: USER_ID, item_id: selectedItem.id, username: USERNAME }) });
                const data = await res.json();
                if(data.success) {
                    userBalance = data.newBalance;
                    myAssets.push(data.asset);
                    updateBalance();
                    closeModal();
                    showMsg('Успех', 'Предмет куплен!');
                } else alert(data.error);
            } else if (currentTab === 'gifts' && !selectedItem.is_upgraded) {
                const res = await fetch('/api/upgrade', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ tg_id: USER_ID, asset_id: selectedItem.id }) });
                const data = await res.json();
                if(data.success) {
                    userBalance = data.newBalance;
                    selectedItem.is_upgraded = 1;
                    Object.assign(selectedItem, data.updates);
                    updateBalance();
                    closeModal();
                    openModal(selectedItem);
                    showMsg('Улучшено!', 'Предмет получил уникальные свойства.');
                } else alert(data.error);
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
