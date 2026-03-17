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
    // Jika toggle enabled, langsung load/unload cog
    if (path[path.length - 1] === "enabled") {
        await toggleCog(path.slice(0, -1), value);
    }
}

async function patchGlobal(path, value) {
    await apiPatch("/api/global_settings", { path, value });
}

// ═══════════════════════════════════════════════════════════
// INIT — load all data on page load
// ═══════════════════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", async () => {
    const [s, g, c] = await Promise.all([
        apiGet("/api/settings"),
        apiGet("/api/global_settings"),
        apiGet("/api/channels")
    ]);

    if (s) { settingsData = s.data; renderCommands(); renderGamble(); renderOther(); }
    if (g) { globalData = g.data; renderGlobalToggles(); renderCaptcha(); renderBattery(); }
    if (c) { channelData = c; renderChannels(); }
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

        // Cooldown row (jika ada)
        const cdRow = cfg.cooldown ? `
            <div class="cmd-extra-row">
                <span class="setting-desc">Cooldown (detik)</span>
                <div class="range-inputs">
                    <input type="number" class="num-input" value="${cfg.cooldown[0]}" id="cd-min-${name}" min="1">
                    <span>–</span>
                    <input type="number" class="num-input" value="${cfg.cooldown[1]}" id="cd-max-${name}" min="1">
                    <button class="btn-save" onclick="saveCooldown('${name}')">Save</button>
                </div>
            </div>` : "";

        card.innerHTML = `
            <div class="setting-row" style="border-bottom: ${cfg.cooldown ? '1px solid rgba(130,100,230,0.12)' : 'none'}; padding-bottom: 10px;">
                <div class="setting-info">
                    <span class="setting-label">${name}</span>
                    <span class="setting-desc">${getCommandDesc(name)}</span>
                </div>
                <label class="toggle">
                    <input type="checkbox" ${cfg.enabled ? "checked" : ""}
                        onchange="patchSettings(['commands','${name}','enabled'], this.checked)">
                    <span class="slider"></span>
                </label>
            </div>
            ${cdRow}
        `;
        container.appendChild(card);
    });
}

async function saveCooldown(name) {
    const min = parseInt(document.getElementById(`cd-min-${name}`).value);
    const max = parseInt(document.getElementById(`cd-max-${name}`).value);
    if (isNaN(min) || isNaN(max) || min < 1 || max < min) {
        return showToast("Cooldown tidak valid (min harus < max)", "error");
    }
    await patchSettings(["commands", name, "cooldown"], [min, max]);
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

    simpleToggles.forEach(({ label, desc, path, val }) => {
        const row = document.createElement("div");
        row.className = "setting-row";
        row.innerHTML = `
            <div class="setting-info">
                <span class="setting-label">${label}</span>
                <span class="setting-desc">${desc}</span>
            </div>
            <label class="toggle">
                <input type="checkbox" ${val ? "checked" : ""}
                    onchange="patchSettings(${JSON.stringify(path)}, this.checked)">
                <span class="slider"></span>
            </label>
        `;
        container.appendChild(row);
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

    toggles.forEach(({ label, desc, path, val }) => {
        const row = document.createElement("div");
        row.className = "setting-row";
        row.innerHTML = `
            <div class="setting-info">
                <span class="setting-label">${label}</span>
                <span class="setting-desc">${desc}</span>
            </div>
            <label class="toggle">
                <input type="checkbox" ${val ? "checked" : ""}
                    onchange="patchGlobal(${JSON.stringify(path)}, this.checked)">
                <span class="slider"></span>
            </label>
        `;
        container.appendChild(row);
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

    toggles.forEach(({ label, desc, path, val }) => {
        const row = document.createElement("div");
        row.className = "setting-row";
        row.innerHTML = `
            <div class="setting-info">
                <span class="setting-label">${label}</span>
                <span class="setting-desc">${desc}</span>
            </div>
            <label class="toggle">
                <input type="checkbox" ${val ? "checked" : ""}
                    onchange="patchGlobal(${JSON.stringify(path)}, this.checked)">
                <span class="slider"></span>
            </label>
        `;
        container.appendChild(row);
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
