/*
 * settings.js — OwO-Dusk Settings Dashboard
 * Handles tab switching, data loading, and API calls
 */

// ── Auth ────────────────────────────────────────────────────
var password = localStorage.getItem("password") || prompt("Enter Password");
if (password) {
    localStorage.setItem("password", password);
} else {
    alert("Password is required.");
    location.reload();
}

// ── State ───────────────────────────────────────────────────
let settingsData = null;
let captchaSettings = null;
let globalData = null;
let channelData = null;
let consoleInterval = null;

// ── Tab switching ───────────────────────────────────────────
document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
        document.querySelectorAll(".tab-content").forEach(c => {
            c.classList.add("hidden");
            c.classList.remove("active");
        });
        btn.classList.add("active");
        const tab = document.getElementById("tab-" + btn.dataset.tab);
        tab.classList.remove("hidden");
        tab.classList.add("active");

        // Load console logs lazily
        if (btn.dataset.tab === "console" && !consoleInterval) {
            loadConsole();
            consoleInterval = setInterval(loadConsole, 5000);
        }
    });
});

// ── API helpers ─────────────────────────────────────────────
async function apiGet(endpoint) {
    const res = await fetch(endpoint, { headers: { password } });
    if (res.status === 401) { showToast("Wrong password!", "error"); return null; }
    const json = await res.json();
    return json.status === "success" ? json : null;
}

async function apiPatch(endpoint, body) {
    const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", password },
        body: JSON.stringify(body)
    });
    const json = await res.json();
    if (json.status === "success") {
        showToast("✅ Saved!", "success");
    } else {
        showToast("❌ Error: " + (json.message || "unknown"), "error");
    }
    return json;
}

// Map settings path ke nama cog
const cogMap = {
    "commands.hunt": "hunt",
    "commands.battle": "battle",
    "commands.sell": "sell",
    "commands.sac": "sell",
    "commands.pray": "pray",
    "commands.curse": "pray",
    "commands.lottery": "lottery",
    "commands.lvlGrind": "level",
    "commands.cookie": "cookie",
    "commands.shop": "shop",
    "commands.owo": "owo",
    "commands.autoHuntBot": "huntbot",
    "commands.customCommands": "customcommands",
    "gamble.coinflip": "coinflip",
    "gamble.slots": "slots",
    "gamble.blackjack": "blackjack",
    "bossBattle": "boss",
    "giveawayJoiner": "giveaway",
    "autoUse.gems": "gems",
};

async function toggleCog(path, value) {
    const key = path.join(".");
    const cogName = cogMap[key];
    if (!cogName) return;
    const action = value ? "load" : "unload";
    await fetch("/api/toggle_cog", {
        method: "POST",
        headers: { "Content-Type": "application/json", password },
        body: JSON.stringify({ cog: cogName, action })
    });
}

async function restartBot() {
    try {
        const res = await fetch('/api/restart', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', password }
        });
        const json = await res.json();
        if (json.status === 'success') {
            showToast('🔄 Bot restart dalam 5 detik...', 'success');
            setTimeout(() => {
                location.reload();
            }, 5000);
        } else {
            showToast('❌ Gagal restart: ' + json.message, 'error');
        }
    } catch (e) {
        showToast('🔄 Bot sedang restart...', 'success');
        setTimeout(() => {
            location.reload();
        }, 5000);
    }
}

// ── Toast ───────────────────────────────────────────────────
let toastTimeout;
function showToast(msg, type = "success") {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.className = "toast " + type;
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => { t.classList.add("hidden"); }, 2500);
}

// ── Patch helpers ────────────────────────────────────────────
async function patchSettings(path, value) {
    await apiPatch("/api/settings", { path, value });
    // Update settingsData in memory
    let ref = settingsData;
    for (let i = 0; i < path.length - 1; i++) {
        ref = ref[path[i]];
    }
    ref[path[path.length - 1]] = value;
    // Jika toggle enabled, langsung load/unload cog
    if (path[path.length - 1] === "enabled") {
        await toggleCog(path.slice(0, -1), value);
    }
}

async function patchGlobal(path, value) {
    await apiPatch("/api/global_settings", { path, value });
    // Update globalData in memory
    let ref = globalData;
    for (let i = 0; i < path.length - 1; i++) {
        ref = ref[path[i]];
    }
    ref[path[path.length - 1]] = value;
}

// ═══════════════════════════════════════════════════════════
// INIT — load all data on page load
// ═══════════════════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", async () => {

    const [s, g, c, cs] = await Promise.all([
        apiGet("/api/settings"),
        apiGet("/api/global_settings"),
        apiGet("/api/channels"),
        apiGet("/api/captcha_settings")
    ]);

    if (s) { settingsData = s.data; renderCommands(); renderGamble(); renderOther(); renderGems(); }
    if (g) { globalData = g.data; renderGlobalToggles(); renderCaptcha(); renderBattery(); }
    if (c) { channelData = c; renderChannels(); }
    if (cs) { captchaSettings = cs.data; renderCaptchaSolver(); }
});

// ═══════════════════════════════════════════════════════════
// TAB 1: CHANNELS & WEBHOOK
// ═══════════════════════════════════════════════════════════
function renderChannels() {
    if (!channelData) return;
    const { channelSwitcher, webhook } = channelData;

    document.getElementById("webhook-enabled").checked = webhook.enabled;
    document.getElementById("webhook-url").value = webhook.webhookUrl === "Your webhook URL here!" ? "" : webhook.webhookUrl;
    document.getElementById("webhook-useless").checked = globalData?.webhook?.webhookUselessLog || false;
    document.getElementById("channelSwitcher-enabled").checked = channelSwitcher.enabled;

    const [min, max] = channelSwitcher.interval || [300, 600];
    document.getElementById("cs-interval-min").value = min;
    document.getElementById("cs-interval-max").value = max;

    renderUserCards(channelSwitcher.users || []);
}

function renderUserCards(users) {
    const container = document.getElementById("users-container");
    container.innerHTML = "";
    users.forEach((user, idx) => {
        container.appendChild(createUserCard(user, idx));
    });
}

function createUserCard(user, idx) {
    const card = document.createElement("div");
    card.className = "user-card";
    card.dataset.idx = idx;

    card.innerHTML = `
        <div class="user-card-header">
            <label>User ID:</label>
            <input type="number" class="num-input" style="width:160px;" value="${user.userid}" 
                   onchange="updateUserField(${idx}, 'userid', parseInt(this.value))">
            <button class="btn-danger" onclick="removeUser(${idx})">✕ Remove</button>
        </div>
        <div class="sub-heading">Channels</div>
        <div class="channels-list" id="channels-list-${idx}">
            ${user.channels.map((ch, ci) => channelTag(ch, idx, ci)).join("")}
        </div>
        <div class="add-channel-row">
            <input type="number" class="num-input" style="width:160px;" 
                   placeholder="Channel ID" id="new-ch-${idx}">
            <button class="btn-add" onclick="addChannel(${idx})">＋ Add Channel</button>
        </div>
    `;
    return card;
}

function channelTag(channelId, userIdx, chIdx) {
    return `<div class="channel-tag">
        ${channelId}
        <button onclick="removeChannel(${userIdx}, ${chIdx})">✕</button>
    </div>`;
}

function updateUserField(userIdx, field, value) {
    channelData.channelSwitcher.users[userIdx][field] = value;
}

function addUser() {
    channelData.channelSwitcher.users.push({ userid: 0, channels: [] });
    renderUserCards(channelData.channelSwitcher.users);
}

function removeUser(idx) {
    channelData.channelSwitcher.users.splice(idx, 1);
    renderUserCards(channelData.channelSwitcher.users);
}

function addChannel(userIdx) {
    const input = document.getElementById(`new-ch-${userIdx}`);
    const val = parseInt(input.value);
    if (!val) return showToast("Enter a valid Channel ID", "error");
    channelData.channelSwitcher.users[userIdx].channels.push(val);
    renderUserCards(channelData.channelSwitcher.users);
}

function removeChannel(userIdx, chIdx) {
    channelData.channelSwitcher.users[userIdx].channels.splice(chIdx, 1);
    renderUserCards(channelData.channelSwitcher.users);
}

function saveCSInterval() {
    const min = parseInt(document.getElementById("cs-interval-min").value);
    const max = parseInt(document.getElementById("cs-interval-max").value);
    if (isNaN(min) || isNaN(max)) return showToast("Invalid interval values", "error");
    channelData.channelSwitcher.interval = [min, max];
    patchGlobal(["channelSwitcher", "interval"], [min, max]);
}

async function saveWebhookUrl() {
    const url = document.getElementById("webhook-url").value.trim();
    await apiPatch("/api/channels", { webhookUrl: url });
}

async function saveChannels() {
    await apiPatch("/api/channels", { channelSwitcher: channelData.channelSwitcher });
}

// ═══════════════════════════════════════════════════════════
// TAB 2: COMMANDS
// ═══════════════════════════════════════════════════════════
function renderCommands() {
    const container = document.getElementById("commands-container");
    container.innerHTML = "";
    const cmds = settingsData.commands;
    Object.entries(cmds).forEach(([name, cfg]) => {
        const card = document.createElement("div");
        card.className = "cmd-card";
        card.innerHTML = buildCommandCard(name, cfg);
        container.appendChild(card);

        // Pasang addEventListener setelah appendChild
        // Toggle enabled
        const enabledCb = card.querySelector(`#enabled-${name}`);
        if (enabledCb) enabledCb.addEventListener("change", function() {
            patchSettings(["commands", name, "enabled"], this.checked);
        });

        // pingUser
        const pingCb = card.querySelector(`#ping-${name}`);
        if (pingCb) pingCb.addEventListener("change", function() {
            patchSettings(["commands", name, "pingUser"], this.checked);
        });

        // customChannel enabled
        const ccCb = card.querySelector(`#cc-enabled-${name}`);
        if (ccCb) ccCb.addEventListener("change", function() {
            patchSettings(["commands", name, "customChannel", "enabled"], this.checked);
        });

        // autoHuntBot upgrader
        const upgraderCb = card.querySelector(`#upgrader-enabled`);
        if (upgraderCb) upgraderCb.addEventListener("change", function() {
            patchSettings(["commands", "autoHuntBot", "upgrader", "enabled"], this.checked);
        });

        // autoHuntBot traits
        if (name === "autoHuntBot") {
            ["efficiency","duration","cost","gain","exp","radar"].forEach(t => {
                const traitCb = card.querySelector(`#trait-${t}`);
                if (traitCb) traitCb.addEventListener("change", function() {
                    patchSettings(["commands","autoHuntBot","upgrader","traits",t], this.checked);
                });
            });
        }

        // rarity checkboxes
        if (cfg.rarity) {
            ["c","u","r","e","m","l","g"].forEach(r => {
                const rarityCb = card.querySelector(`#rarity-${name}-${r}`);
                if (rarityCb) rarityCb.addEventListener("change", function() {
                    saveRarity(name, r, this.checked);
                });
            });
        }
    });
}

function buildCommandCard(name, cfg) {
    const desc = getCommandDesc(name);
    const hasBorder = hasExtraFields(name, cfg);

    let html = `
        <div class="setting-row" style="border-bottom:${hasBorder ? '1px solid rgba(181,101,29,0.2)' : 'none'}; padding-bottom:10px;">
            <div class="setting-info">
                <span class="setting-label">${name}</span>
                <span class="setting-desc">${desc}</span>
            </div>
            <label class="toggle">
                <input type="checkbox" id="enabled-${name}" ${cfg.enabled ? "checked" : ""}>
                <span class="slider"></span>
            </label>
        </div>
    `;

    // Cooldown
    if (cfg.cooldown) {
        html += `
        <div class="cmd-extra-row">
            <span class="setting-desc">Cooldown (detik)</span>
            <div class="range-inputs">
                <input type="number" class="num-input" value="${cfg.cooldown[0]}" id="cd-min-${name}" min="1">
                <span>–</span>
                <input type="number" class="num-input" value="${cfg.cooldown[1]}" id="cd-max-${name}" min="1">
                <button class="btn-save" onclick="saveCooldown('${name}')">Save</button>
            </div>
        </div>`;
    }

    // Rarity (sell, sac)
    if (cfg.rarity) {
        const rarities = ["c","u","r","e","m","l","g"];
        const rarityLabels = {"c":"Common","u":"Uncommon","r":"Rare","e":"Epic","m":"Mythical","l":"Legendary","g":"Gem"};
        html += `
        <div class="cmd-extra-row" style="flex-wrap:wrap; gap:6px;">
            <span class="setting-desc" style="width:100%">Rarity</span>
            <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:4px;">
                ${rarities.map(r => `
                <label style="display:flex; align-items:center; gap:4px; color:var(--text-primary); font-size:0.85rem; cursor:pointer;">
                    <input type="checkbox" id="rarity-${name}-${r}" ${cfg.rarity.includes(r) ? "checked" : ""}
                        style="cursor:pointer;">
                    ${rarityLabels[r]}
                </label>`).join("")}
            </div>
        </div>`;
    }

    // Userid (cookie)
    if (cfg.hasOwnProperty("userid") && !Array.isArray(cfg.userid)) {
        html += `
        <div class="cmd-extra-row">
            <span class="setting-desc">User ID Target</span>
            <div class="input-group">
                <input type="number" class="num-input" style="width:160px;" id="userid-${name}" value="${cfg.userid || ""}">
                <button class="btn-save" onclick="saveUserid('${name}')">Save</button>
            </div>
        </div>`;
    }

    // Userid array (pray, curse)
    if (Array.isArray(cfg.userid)) {
        html += `
        <div class="cmd-extra-row" style="flex-direction:column; align-items:flex-start; gap:6px;">
            <span class="setting-desc">User IDs</span>
            <div id="userid-list-${name}" style="display:flex; flex-wrap:wrap; gap:6px;">
                ${cfg.userid.map((uid, i) => `
                <div class="channel-tag">
                    ${uid}
                    <button onclick="removeUserId('${name}', ${i})">✕</button>
                </div>`).join("")}
            </div>
            <div class="add-channel-row">
                <input type="number" class="num-input" style="width:160px;" placeholder="User ID" id="new-uid-${name}">
                <button class="btn-add" onclick="addUserId('${name}')">＋ Add</button>
            </div>
        </div>`;
    }

    // Ping user toggle
    if (cfg.hasOwnProperty("pingUser")) {
        html += `
        <div class="cmd-extra-row">
            <span class="setting-desc">Ping User</span>
            <label class="toggle">
                <input type="checkbox" id="ping-${name}" ${cfg.pingUser ? "checked" : ""}>
                <span class="slider"></span>
            </label>
        </div>`;
    }

    // Custom channel
    if (cfg.customChannel) {
        html += `
        <div class="cmd-extra-row">
            <span class="setting-desc">Custom Channel</span>
            <label class="toggle">
                <input type="checkbox" id="cc-enabled-${name}" ${cfg.customChannel.enabled ? "checked" : ""}>
                <span class="slider"></span>
            </label>
        </div>
        <div class="cmd-extra-row">
            <span class="setting-desc">Custom Channel ID</span>
            <div class="input-group">
                <input type="number" class="num-input" style="width:160px;" id="customch-${name}" value="${cfg.customChannel.channelId || 0}">
                <button class="btn-save" onclick="saveCustomChannel('${name}')">Save</button>
            </div>
        </div>`;
    }

    // Shop items
    if (name === "shop" && cfg.itemsToBuy) {
        html += `
        <div class="cmd-extra-row" style="flex-direction:column; align-items:flex-start; gap:6px;">
            <span class="setting-desc">Items to Buy (Ring ID 1-7)</span>
            <div id="shop-items-list" style="display:flex; flex-wrap:wrap; gap:6px;">
                ${cfg.itemsToBuy.map((item, i) => `
                <div class="channel-tag">
                    Ring ${item}
                    <button onclick="removeShopItem(${i})">✕</button>
                </div>`).join("")}
            </div>
            <div class="add-channel-row">
                <input type="number" class="num-input" style="width:80px;" placeholder="1-7" id="new-shop-item" min="1" max="7">
                <button class="btn-add" onclick="addShopItem()">＋ Add</button>
            </div>
        </div>`;
    }

    // autoHuntBot
    if (name === "autoHuntBot") {
        const traits = ["efficiency", "duration", "cost", "gain", "exp", "radar"];
        const priorities = cfg.upgrader?.priorities || {};
        const traitEnabled = cfg.upgrader?.traits || {};
        const sleeptime = cfg.upgrader?.sleeptime || [10, 15];

        html += `
        <div class="cmd-extra-row">
            <span class="setting-desc">Cash to Spend</span>
            <div class="input-group">
                <input type="number" class="num-input" style="width:110px;" id="huntbot-cash" value="${cfg.cashToSpend || 10000}" min="0">
                <button class="btn-save" onclick="patchSettings(['commands','autoHuntBot','cashToSpend'], parseInt(document.getElementById('huntbot-cash').value))">Save</button>
            </div>
        </div>
        <div class="cmd-extra-row">
            <span class="setting-desc">Upgrader</span>
            <label class="toggle">
                <input type="checkbox" id="upgrader-enabled" ${cfg.upgrader?.enabled ? "checked" : ""}>
                <span class="slider"></span>
            </label>
        </div>
        <div class="cmd-extra-row">
            <span class="setting-desc">Upgrader Sleep (detik)</span>
            <div class="range-inputs">
                <input type="number" class="num-input" value="${sleeptime[0]}" id="hb-sleep-min" min="1">
                <span>–</span>
                <input type="number" class="num-input" value="${sleeptime[1]}" id="hb-sleep-max" min="1">
                <button class="btn-save" onclick="saveHuntbotSleep()">Save</button>
            </div>
        </div>
        <div class="cmd-extra-row" style="flex-direction:column; align-items:flex-start; gap:8px;">
            <span class="setting-desc">Traits & Priorities</span>
            <div style="display:flex; flex-direction:column; gap:6px; width:100%;">
                ${traits.map(t => `
                <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap;">
                    <label style="display:flex; align-items:center; gap:6px; color:var(--text-primary); font-size:0.88rem; cursor:pointer; min-width:120px;">
                        <input type="checkbox" id="trait-${t}" ${traitEnabled[t] ? "checked" : ""} style="cursor:pointer;">
                        ${t.charAt(0).toUpperCase() + t.slice(1)}
                    </label>
                    <div class="input-group">
                        <span style="color:var(--text-dim); font-size:0.78rem;">Priority</span>
                        <input type="number" class="num-input" style="width:60px;" id="priority-${t}" value="${priorities[t] || 1}" min="1" max="10">
                        <button class="btn-save" onclick="saveHuntbotPriority('${t}')">Save</button>
                    </div>
                </div>`).join("")}
            </div>
        </div>`;
    }

    // lottery amount
    if (name === "lottery" && cfg.hasOwnProperty("amount")) {
        html += `
        <div class="cmd-extra-row">
            <span class="setting-desc">Amount</span>
            <div class="input-group">
                <input type="number" class="num-input" style="width:100px;" id="lottery-amount" value="${cfg.amount}" min="1">
                <button class="btn-save" onclick="patchSettings(['commands','lottery','amount'], parseInt(document.getElementById('lottery-amount').value))">Save</button>
            </div>
        </div>`;
    }

    return html;
}

function hasExtraFields(name, cfg) {
    return cfg.cooldown || cfg.rarity || cfg.hasOwnProperty("userid") ||
           cfg.hasOwnProperty("pingUser") || cfg.customChannel ||
           name === "shop" || name === "autoHuntBot" || name === "lottery";
}

async function saveHuntbotSleep() {
    const min = parseInt(document.getElementById("hb-sleep-min").value);
    const max = parseInt(document.getElementById("hb-sleep-max").value);
    if (isNaN(min) || isNaN(max) || min < 1 || max < min) {
        return showToast("Sleep time tidak valid", "error");
    }
    await patchSettings(["commands", "autoHuntBot", "upgrader", "sleeptime"], [min, max]);
}

async function saveHuntbotPriority(trait) {
    const val = parseInt(document.getElementById(`priority-${trait}`).value);
    if (isNaN(val) || val < 1 || val > 10) {
        return showToast("Priority harus 1-10", "error");
    }
    await patchSettings(["commands", "autoHuntBot", "upgrader", "priorities", trait], val);
}

async function saveCooldown(name) {
    const min = parseInt(document.getElementById(`cd-min-${name}`).value);
    const max = parseInt(document.getElementById(`cd-max-${name}`).value);
    if (isNaN(min) || isNaN(max) || min < 1 || max < min) {
        return showToast("Cooldown tidak valid (min harus < max)", "error");
    }
    await patchSettings(["commands", name, "cooldown"], [min, max]);
}

async function saveRarity(name, rarity, checked) {
    const current = settingsData.commands[name].rarity || [];
    let updated;
    if (checked) {
        if (!current.includes(rarity)) updated = [...current, rarity];
        else updated = current;
    } else {
        updated = current.filter(r => r !== rarity);
    }
    settingsData.commands[name].rarity = updated;
    await patchSettings(["commands", name, "rarity"], updated);
}

async function saveUserid(name) {
    const val = parseInt(document.getElementById(`userid-${name}`).value);
    if (isNaN(val)) return showToast("User ID tidak valid", "error");
    await patchSettings(["commands", name, "userid"], val);
}

async function addUserId(name) {
    const input = document.getElementById(`new-uid-${name}`);
    const val = parseInt(input.value);
    if (!val) return showToast("User ID tidak valid", "error");
    const current = settingsData.commands[name].userid || [];
    if (!current.includes(val)) {
        const updated = [...current, val];
        settingsData.commands[name].userid = updated;
        await patchSettings(["commands", name, "userid"], updated);
        renderCommands();
    }
    input.value = "";
}

async function removeUserId(name, idx) {
    const current = settingsData.commands[name].userid || [];
    current.splice(idx, 1);
    settingsData.commands[name].userid = current;
    await patchSettings(["commands", name, "userid"], current);
    renderCommands();
}

async function saveCustomChannel(name) {
    const val = parseInt(document.getElementById(`customch-${name}`).value);
    if (isNaN(val)) return showToast("Channel ID tidak valid", "error");
    await patchSettings(["commands", name, "customChannel", "channelId"], val);
}

async function addShopItem() {
    const input = document.getElementById("new-shop-item");
    const val = parseInt(input.value);
    if (!val || val < 1 || val > 7) return showToast("Item ID harus 1-7", "error");
    const current = settingsData.commands.shop.itemsToBuy || [];
    if (!current.includes(val)) {
        const updated = [...current, val];
        settingsData.commands.shop.itemsToBuy = updated;
        await patchSettings(["commands", "shop", "itemsToBuy"], updated);
        renderCommands();
    }
    input.value = "";
}

async function removeShopItem(idx) {
    const current = settingsData.commands.shop.itemsToBuy || [];
    current.splice(idx, 1);
    settingsData.commands.shop.itemsToBuy = current;
    await patchSettings(["commands", "shop", "itemsToBuy"], current);
    renderCommands();
}

function renderGamble() {
    const container = document.getElementById("gamble-container");
    container.innerHTML = "";
    const g = settingsData.gamble;

    // Allotted amount
    const allotRow = document.createElement("div");
    allotRow.className = "cmd-card";
    allotRow.innerHTML = `
        <div class="setting-row">
            <div class="setting-info">
                <span class="setting-label">Allotted Amount</span>
                <span class="setting-desc">Total cash yang dialokasikan untuk gambling</span>
            </div>
            <div class="input-group">
                <input type="number" class="num-input" style="width:110px;" id="gamble-allotted" value="${g.allottedAmount}" min="0">
                <button class="btn-save" onclick="patchSettings(['gamble','allottedAmount'], parseInt(document.getElementById('gamble-allotted').value))">Save</button>
            </div>
        </div>
    `;
    container.appendChild(allotRow);

    // Per-game cards
    ["coinflip", "slots", "blackjack"].forEach(name => {
        const cfg = g[name];
        const card = document.createElement("div");
        card.className = "cmd-card";
        card.innerHTML = `
            <div class="setting-row" style="border-bottom:1px solid rgba(130,100,230,0.12); padding-bottom:10px;">
                <div class="setting-info">
                    <span class="setting-label">${name}</span>
                </div>
                <label class="toggle">
                    <input type="checkbox" ${cfg.enabled ? "checked" : ""}
                        onchange="patchSettings(['gamble','${name}','enabled'], this.checked)">
                    <span class="slider"></span>
                </label>
            </div>
            <div class="cmd-extra-row">
                <span class="setting-desc">Start Value</span>
                <div class="input-group">
                    <input type="number" class="num-input" style="width:100px;" id="g-start-${name}" value="${cfg.startValue}" min="1">
                    <button class="btn-save" onclick="patchSettings(['gamble','${name}','startValue'], parseInt(document.getElementById('g-start-${name}').value))">Save</button>
                </div>
            </div>
            <div class="cmd-extra-row">
                <span class="setting-desc">Multiplier on Lose</span>
                <div class="input-group">
                    <input type="number" class="num-input" style="width:100px;" id="g-mult-${name}" value="${cfg.multiplierOnLose}" min="1" step="0.1">
                    <button class="btn-save" onclick="patchSettings(['gamble','${name}','multiplierOnLose'], parseFloat(document.getElementById('g-mult-${name}').value))">Save</button>
                </div>
            </div>
            <div class="cmd-extra-row">
                <span class="setting-desc">Cooldown (detik)</span>
                <div class="range-inputs">
                    <input type="number" class="num-input" value="${cfg.cooldown[0]}" id="g-cd-min-${name}" min="1">
                    <span>–</span>
                    <input type="number" class="num-input" value="${cfg.cooldown[1]}" id="g-cd-max-${name}" min="1">
                    <button class="btn-save" onclick="saveGambleCooldown('${name}')">Save</button>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

async function saveGambleCooldown(name) {
    const min = parseInt(document.getElementById(`g-cd-min-${name}`).value);
    const max = parseInt(document.getElementById(`g-cd-max-${name}`).value);
    if (isNaN(min) || isNaN(max) || min < 1 || max < min) {
        return showToast("Cooldown tidak valid", "error");
    }
    await patchSettings(["gamble", name, "cooldown"], [min, max]);
}

function renderOther() {
    const container = document.getElementById("other-container");
    container.innerHTML = "";
    const s = settingsData;

    const simpleToggles = [
        { label: "Boss Battle", desc: "Auto-join boss battles", path: ["bossBattle", "enabled"], val: s.bossBattle.enabled },
        { label: "Giveaway Joiner", desc: "Auto-join giveaways", path: ["giveawayJoiner", "enabled"], val: s.giveawayJoiner.enabled },
        { label: "Sleep Mode", desc: "Randomly pause activity", path: ["sleep", "enabled"], val: s.sleep.enabled },
        { label: "Misspell", desc: "Simulate human typos", path: ["misspell", "enabled"], val: s.misspell.enabled },
        { label: "Auto Daily", desc: "Claim daily reward automatically", path: ["autoDaily"], val: s.autoDaily },
        { label: "Cash Check", desc: "Monitor cash balance", path: ["cashCheck"], val: s.cashCheck },
        { label: "Auto Lootbox", desc: "Open lootboxes automatically", path: ["autoUse", "autoLootbox"], val: s.autoUse.autoLootbox },
        { label: "Auto Crate", desc: "Open crates automatically", path: ["autoUse", "autoCrate"], val: s.autoUse.autoCrate },
        { label: "Custom Commands", desc: "Enable custom command list", path: ["customCommands", "enabled"], val: s.customCommands.enabled },
    ];

    simpleToggles.forEach(({ label, desc, path, val }, idx) => {
        const uid = "ot_" + idx;
        const row = document.createElement("div");
        row.className = "setting-row";
        row.innerHTML = `
            <div class="setting-info">
                <span class="setting-label">${label}</span>
                <span class="setting-desc">${desc}</span>
            </div>
            <label class="toggle">
                <input type="checkbox" id="${uid}" ${val ? "checked" : ""}>
                <span class="slider"></span>
            </label>
        `;
        container.appendChild(row);
        document.getElementById(uid).addEventListener("change", function() {
            patchSettings(path, this.checked);
        });
    });
}

function getCommandDesc(name) {
    const descs = {
        hunt: "Hunt for animals", battle: "Battle other users", sell: "Sell animals",
        sac: "Sacrifice animals", pray: "Pray for users", curse: "Curse other users",
        lottery: "Enter the lottery", lvlGrind: "Grind for XP", cookie: "Send cookies",
        shop: "Buy items from shop", owo: "Send owo command", autoHuntBot: "Automated hunt bot"
    };
    return descs[name] || "";
}


// ═══════════════════════════════════════════════════════════
// CAPTCHA SOLVER SETTINGS
// ═══════════════════════════════════════════════════════════
async function patchCaptcha(path, value) {
    const res = await fetch("/api/captcha_settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", password },
        body: JSON.stringify({ path, value })
    });
    const json = await res.json();
    if (json.status === "success") {
        showToast("✅ Saved!", "success");
    } else {
        showToast("❌ Error: " + (json.message || "unknown"), "error");
    }
}

function renderCaptchaSolver() {
    const container = document.getElementById("captcha-solver-container");
    if (!container || !captchaSettings) return;
    container.innerHTML = "";

    const items = [
        {
            label: "Notify When Solving",
            desc: "Tampilkan notifikasi saat mencoba solve captcha",
            path: ["notifications", "notify_when_attempting_to_solve"],
            val: captchaSettings.notifications?.notify_when_attempting_to_solve,
            type: "toggle"
        },
        {
            label: "Image Solver",
            desc: "Solver gratis dengan akurasi ~90% (perlu setup.py)",
            path: ["image_solver", "enabled"],
            val: captchaSettings.image_solver?.enabled,
            type: "toggle"
        },
        {
            label: "HCaptcha Solver (Berbayar)",
            desc: "Solver via YesCaptcha API — berbayar, gunakan dengan risiko sendiri",
            path: ["hcaptcha_solver", "enabled"],
            val: captchaSettings.hcaptcha_solver?.enabled,
            type: "toggle"
        },
        {
            label: "YesCaptcha API Key",
            desc: "API key dari yescaptcha.com",
            path: ["hcaptcha_solver", "api_key"],
            val: captchaSettings.hcaptcha_solver?.api_key,
            type: "text"
        },
        {
            label: "Retries",
            desc: "Jumlah percobaan ulang saat gagal solve (rekomendasi: 3)",
            path: ["hcaptcha_solver", "retries"],
            val: captchaSettings.hcaptcha_solver?.retries,
            type: "number"
        }
    ];

    items.forEach(({ label, desc, path, val, type }, idx) => {
        const row = document.createElement("div");
        row.className = "setting-row";

        if (type === "toggle") {
            const uid = "cs_" + idx;
            row.innerHTML = `
                <div class="setting-info">
                    <span class="setting-label">${label}</span>
                    <span class="setting-desc">${desc}</span>
                </div>
                <label class="toggle">
                    <input type="checkbox" id="${uid}" ${val ? "checked" : ""}>
                    <span class="slider"></span>
                </label>
            `;
            container.appendChild(row);
            document.getElementById(uid).addEventListener("change", function() {
                patchCaptcha(path, this.checked);
            });
        } else if (type === "text") {
            const uid = "cs_text_" + idx;
            row.innerHTML = `
                <div class="setting-info">
                    <span class="setting-label">${label}</span>
                    <span class="setting-desc">${desc}</span>
                </div>
                <div class="input-group">
                    <input type="text" class="text-input" id="${uid}" value="${val || ""}" placeholder="API Key...">
                    <button class="btn-save" onclick="saveCaptchaText('${uid}', ${JSON.stringify(path)})">Save</button>
                </div>
            `;
            container.appendChild(row);
        } else if (type === "number") {
            const uid = "cs_num_" + idx;
            row.innerHTML = `
                <div class="setting-info">
                    <span class="setting-label">${label}</span>
                    <span class="setting-desc">${desc}</span>
                </div>
                <div class="input-group">
                    <input type="number" class="num-input" id="${uid}" value="${val || 3}" min="1" max="10">
                    <button class="btn-save" onclick="saveCaptchaNum('${uid}', ${JSON.stringify(path)})">Save</button>
                </div>
            `;
            container.appendChild(row);
        }
    });
}

async function saveCaptchaText(uid, path) {
    const val = document.getElementById(uid).value.trim();
    await patchCaptcha(path, val);
}

async function saveCaptchaNum(uid, path) {
    const val = parseInt(document.getElementById(uid).value);
    if (isNaN(val) || val < 1) return showToast("Nilai tidak valid", "error");
    await patchCaptcha(path, val);
}


// ═══════════════════════════════════════════════════════════
// GEM SETTINGS
// ═══════════════════════════════════════════════════════════
function renderGems() {
    const container = document.getElementById("gems-container");
    if (!container || !settingsData) return;
    container.innerHTML = "";

    const gems = settingsData.autoUse.gems;
    const tiers = ["common","uncommon","rare","epic","mythical","legendary","fabled"];
    const gemTypes = [
        { key: "huntGem", label: "Hunt Gem" },
        { key: "empoweredGem", label: "Empowered Gem" },
        { key: "luckyGem", label: "Lucky Gem" },
        { key: "specialGem", label: "Special Gem" }
    ];

    // Enable gems toggle
    const enableRow = document.createElement("div");
    enableRow.className = "cmd-card";
    const enableUid = "gems_enabled";
    enableRow.innerHTML = `
        <div class="setting-row" style="border-bottom:none; padding-bottom:0;">
            <div class="setting-info">
                <span class="setting-label">Auto Use Gems</span>
                <span class="setting-desc">Aktifkan penggunaan gem otomatis</span>
            </div>
            <label class="toggle">
                <input type="checkbox" id="${enableUid}" ${gems.enabled ? "checked" : ""}>
                <span class="slider"></span>
            </label>
        </div>
    `;
    container.appendChild(enableRow);
    document.getElementById(enableUid).addEventListener("change", function() {
        patchSettings(["autoUse","gems","enabled"], this.checked);
    });

    // Options
    const optCard = document.createElement("div");
    optCard.className = "cmd-card";
    const lowestUid = "gems_lowest";
    const disableUid = "gems_disable";
    optCard.innerHTML = `
        <div class="setting-row" style="border-bottom:1px solid rgba(181,101,29,0.15); padding-bottom:10px;">
            <div class="setting-info">
                <span class="setting-label">Lowest to Highest</span>
                <span class="setting-desc">Pakai gem dari tier terendah dulu</span>
            </div>
            <label class="toggle">
                <input type="checkbox" id="${lowestUid}" ${gems.order.lowestToHighest ? "checked" : ""}>
                <span class="slider"></span>
            </label>
        </div>
        <div class="setting-row" style="border-bottom:none; padding-bottom:0;">
            <div class="setting-info">
                <span class="setting-label">Disable Hunt if No Gems</span>
                <span class="setting-desc">Matikan hunt jika tidak ada gem tersedia</span>
            </div>
            <label class="toggle">
                <input type="checkbox" id="${disableUid}" ${gems.disable_hunts_if_no_gems ? "checked" : ""}>
                <span class="slider"></span>
            </label>
        </div>
    `;
    container.appendChild(optCard);
    document.getElementById(lowestUid).addEventListener("change", function() {
        patchSettings(["autoUse","gems","order","lowestToHighest"], this.checked);
    });
    document.getElementById(disableUid).addEventListener("change", function() {
        patchSettings(["autoUse","gems","disable_hunts_if_no_gems"], this.checked);
    });

    // Tiers
    const tierCard = document.createElement("div");
    tierCard.className = "cmd-card";
    tierCard.innerHTML = `<div class="sub-heading" style="margin-top:0;">Tiers</div>`;
    tiers.forEach((tier, idx) => {
        const uid = "tier_" + tier;
        const row = document.createElement("div");
        row.className = "setting-row";
        row.style.borderBottom = idx < tiers.length-1 ? "1px solid rgba(181,101,29,0.12)" : "none";
        row.innerHTML = `
            <div class="setting-info">
                <span class="setting-label">${tier.charAt(0).toUpperCase() + tier.slice(1)}</span>
            </div>
            <label class="toggle">
                <input type="checkbox" id="${uid}" ${gems.tiers[tier] ? "checked" : ""}>
                <span class="slider"></span>
            </label>
        `;
        tierCard.appendChild(row);
        container.appendChild(tierCard);
        document.getElementById(uid)?.addEventListener("change", function() {
            patchSettings(["autoUse","gems","tiers",tier], this.checked);
        });
    });

    // Gem Types
    const typeCard = document.createElement("div");
    typeCard.className = "cmd-card";
    typeCard.innerHTML = `<div class="sub-heading" style="margin-top:0;">Jenis Gem</div>`;
    gemTypes.forEach(({ key, label }, idx) => {
        const uid = "gemtype_" + key;
        const row = document.createElement("div");
        row.className = "setting-row";
        row.style.borderBottom = idx < gemTypes.length-1 ? "1px solid rgba(181,101,29,0.12)" : "none";
        row.innerHTML = `
            <div class="setting-info">
                <span class="setting-label">${label}</span>
            </div>
            <label class="toggle">
                <input type="checkbox" id="${uid}" ${gems.gemsToUse[key] ? "checked" : ""}>
                <span class="slider"></span>
            </label>
        `;
        typeCard.appendChild(row);
        container.appendChild(typeCard);
        document.getElementById(uid)?.addEventListener("change", function() {
            patchSettings(["autoUse","gems","gemsToUse",key], this.checked);
        });
    });
}

// ═══════════════════════════════════════════════════════════
// TAB 3: GLOBAL SETTINGS
// ═══════════════════════════════════════════════════════════
function renderGlobalToggles() {
    const container = document.getElementById("global-toggles-container");
    container.innerHTML = "";
    const g = globalData;

    const toggles = [
        { label: "Typing Indicator", desc: "Show typing indicator while bot types", path: ["typingIndicator"], val: g.typingIndicator },
        { label: "Silent Text Messages", desc: "Send messages silently", path: ["silentTextMessages"], val: g.silentTextMessages },
        { label: "Offline Status", desc: "Appear offline on Discord", path: ["offlineStatus"], val: g.offlineStatus },
        { label: "Battery Check", desc: "Pause bot when battery is low", path: ["batteryCheck", "enabled"], val: g.batteryCheck.enabled },
        { label: "Open Captcha Website", desc: "Auto-open captcha solve URL", path: ["captcha", "openCaptchaWebsite"], val: g.captcha.openCaptchaWebsite },
        { label: "Stop if Captcha Fails", desc: "Stop bot if captcha cannot be solved", path: ["captcha", "stopCodeIfFailedToSolve"], val: g.captcha.stopCodeIfFailedToSolve },
    ];

    toggles.forEach(({ label, desc, path, val }, idx) => {
        const uid = "gt_" + idx;
        const row = document.createElement("div");
        row.className = "setting-row";
        row.innerHTML = `
            <div class="setting-info">
                <span class="setting-label">${label}</span>
                <span class="setting-desc">${desc}</span>
            </div>
            <label class="toggle">
                <input type="checkbox" id="${uid}" ${val ? "checked" : ""}>
                <span class="slider"></span>
            </label>
        `;
        container.appendChild(row);
        document.getElementById(uid).addEventListener("change", function() {
            patchGlobal(path, this.checked);
        });
    });
}

function renderCaptcha() {
    const container = document.getElementById("captcha-container");
    container.innerHTML = "";
    const cap = globalData.captcha;

    const toggles = [
        { label: "Enable Notifications", desc: "Show captcha alert notifications", path: ["captcha","notifications","enabled"], val: cap.notifications.enabled },
        { label: "Play Audio Alert", desc: "Play beep on captcha detected", path: ["captcha","playAudio","enabled"], val: cap.playAudio.enabled },
        { label: "Termux Vibrate", desc: "Vibrate phone on captcha", path: ["captcha","termux","vibrate","enabled"], val: cap.termux.vibrate.enabled },
        { label: "Termux Text-to-Speech", desc: "Speak alert on captcha", path: ["captcha","termux","textToSpeech","enabled"], val: cap.termux.textToSpeech.enabled },
        { label: "Recurring Alerts", desc: "Repeat alert multiple times", path: ["captcha","notifications","reccur","enabled"], val: cap.notifications.reccur.enabled },
    ];

    toggles.forEach(({ label, desc, path, val }, idx) => {
        const uid = "ct_" + idx;
        const row = document.createElement("div");
        row.className = "setting-row";
        row.innerHTML = `
            <div class="setting-info">
                <span class="setting-label">${label}</span>
                <span class="setting-desc">${desc}</span>
            </div>
            <label class="toggle">
                <input type="checkbox" id="${uid}" ${val ? "checked" : ""}>
                <span class="slider"></span>
            </label>
        `;
        container.appendChild(row);
        document.getElementById(uid).addEventListener("change", function() {
            patchGlobal(path, this.checked);
        });
    });
}

function renderBattery() {
    const container = document.getElementById("battery-container");
    const bat = globalData.batteryCheck;
    container.innerHTML = `
        <div class="setting-row">
            <div class="setting-info">
                <span class="setting-label">Minimum Battery %</span>
                <span class="setting-desc">Bot pauses below this percentage</span>
            </div>
            <div class="input-group">
                <input type="number" class="num-input" value="${bat.minPercentage}" id="bat-min" min="1" max="100">
                <button class="btn-save" onclick="patchGlobal(['batteryCheck','minPercentage'], parseInt(document.getElementById('bat-min').value))">Save</button>
            </div>
        </div>
        <div class="setting-row">
            <div class="setting-info">
                <span class="setting-label">Check Interval (seconds)</span>
                <span class="setting-desc">How often to check battery level</span>
            </div>
            <div class="input-group">
                <input type="number" class="num-input" value="${bat.refreshInterval}" id="bat-interval" min="10">
                <button class="btn-save" onclick="patchGlobal(['batteryCheck','refreshInterval'], parseInt(document.getElementById('bat-interval').value))">Save</button>
            </div>
        </div>
    `;
}

// ═══════════════════════════════════════════════════════════
// TAB 4: CONSOLE LOGS
// ═══════════════════════════════════════════════════════════
async function loadConsole() {
    try {
        const res = await fetch("/api/console", { headers: { password } });
        if (!res.ok) return;
        const text = await res.text();
        const el = document.getElementById("console-messages");
        el.innerHTML = text;
        el.scrollTop = el.scrollHeight;
    } catch (e) {
        console.error("Console fetch error:", e);
    }
}
