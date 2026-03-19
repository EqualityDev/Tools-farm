/*
 * script.js — OwO Tools Main Dashboard
 * Handles charts, console log, and overview cards
 */

// ── Password ─────────────────────────────────────────────────
var password = localStorage.getItem("password");
if (!password) {
    password = prompt("Enter Dashboard Password:");
    if (password) {
        localStorage.setItem("password", password);
    } else {
        alert("Password diperlukan!");
        location.reload();
    }
}

// ── Fetch helper ─────────────────────────────────────────────
async function fetchData(endpoint, isJson = true) {
    try {
        const res = await fetch(endpoint, {
            method: "GET",
            headers: { password }
        });

        if (res.status === 401) {
            localStorage.removeItem("password");
            alert("Password salah! Silakan refresh dan coba lagi.");
            location.reload();
            return null;
        }

        if (!res.ok) throw new Error("Request gagal: " + res.status);
        if (!isJson) return await res.text();

        const data = await res.json();
        if (data.status !== "success") throw new Error("API error");
        return data;

    } catch (e) {
        console.error("fetchData error:", endpoint, e);
        return null;
    }
}

// ── Chart theme ───────────────────────────────────────────────
const ACCENT        = "#6c63ff";
const ACCENT_LIGHT  = "#8b84ff";
const ACCENT_DIM    = "rgba(108, 99, 255, 0.15)";
const GRID_COLOR    = "rgba(255, 255, 255, 0.05)";
const TEXT_COLOR    = "#a0a0be";
const GREEN         = "#22c55e";
const RED           = "#ef4444";

// Chart.js global defaults
Chart.defaults.color = TEXT_COLOR;
Chart.defaults.font.family = "'Space Grotesk', sans-serif";
Chart.defaults.font.size = 11;

function baseChartOptions(extra = {}) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        devicePixelRatio: 2,
        plugins: {
            legend: {
                position: "top",
                labels: {
                    color: TEXT_COLOR,
                    boxWidth: 10,
                    padding: 12,
                    font: { size: 11 }
                }
            }
        },
        ...extra
    };
}

function chartScales(extra = {}) {
    return {
        x: {
            grid: { color: GRID_COLOR },
            ticks: { color: TEXT_COLOR },
            ...extra.x
        },
        y: {
            beginAtZero: true,
            grid: { color: GRID_COLOR },
            ticks: { color: TEXT_COLOR },
            ...extra.y
        }
    };
}

function accentColors(count) {
    const palette = [
        "#6c63ff", "#8b84ff", "#a89dff", "#4ade80", "#22c55e",
        "#f59e0b", "#ef4444", "#06b6d4", "#ec4899", "#a78bfa",
        "#34d399", "#fb923c", "#60a5fa", "#f472b6", "#e879f9"
    ];
    return Array.from({ length: count }, (_, i) => palette[i % palette.length]);
}

// ── Console ───────────────────────────────────────────────────
function updateConsole(html) {
    const el = document.getElementById("messages");
    if (!el) return;
    el.innerHTML = html || "<span style='color:#5a5a7a'>Tidak ada log.</span>";
    el.scrollTop = el.scrollHeight;
}

async function loadConsole() {
    const data = await fetchData("/api/console", false);
    if (data !== null) updateConsole(data);
}

// ── Cards ─────────────────────────────────────────────────────
function setCard(id, value) {
    const el = document.getElementById(id);
    if (el) el.innerText = value ?? "—";
}

// ── Charts ───────────────────────────────────────────────────

async function loadTotalCommandsChart() {
    const data = await fetchData("/api/fetch_cmd_data");
    if (!data) return;

    const total = data.count.reduce((a, b) => a + b, 0);
    setCard("total_commands_card", total.toLocaleString());

    const ctx = document.getElementById("total_commands");
    if (!ctx) return;

    new Chart(ctx, {
        type: "doughnut",
        data: {
            labels: data.command_names,
            datasets: [{
                label: "Times sent",
                data: data.count,
                backgroundColor: accentColors(data.count.length),
                borderColor: "transparent",
                hoverOffset: 6
            }]
        },
        options: baseChartOptions({
            plugins: {
                legend: {
                    position: "left",
                    labels: { color: TEXT_COLOR, boxWidth: 10, padding: 10 }
                }
            }
        })
    });
}

async function loadCowoncyChart() {
    const data = await fetchData("/api/fetch_cowoncy_data");
    if (!data) return;

    setCard("total_cash_card", data.total_cash?.toLocaleString());
    setCard("total_captchas_card", data.total_captchas?.toLocaleString());

    const ctx = document.getElementById("cowoncy_earnings");
    if (!ctx) return;

    // Override warna dataset agar sesuai tema
    if (data.data && data.data.datasets) {
        const colors = accentColors(data.data.datasets.length);
        data.data.datasets.forEach((ds, i) => {
            ds.borderColor = colors[i];
            ds.backgroundColor = colors[i].replace(")", ", 0.15)").replace("rgb", "rgba");
            ds.pointBackgroundColor = colors[i];
            ds.pointRadius = 2;
            ds.tension = 0.3;
        });
    }

    new Chart(ctx, {
        type: "line",
        data: data.data,
        options: baseChartOptions({
            scales: chartScales({
                x: { type: "category", ticks: { maxRotation: 45, minRotation: 30 } }
            })
        })
    });
}

function uptimeCalc(arr) {
    if (!arr || arr.length < 2) return "—";
    let sec = arr[1] - arr[0];
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.round(sec % 60);
    return [h, m, s].map(v => String(v).padStart(2, "0")).join(":");
}

async function loadWeeklyRuntimeChart() {
    const data = await fetchData("/api/fetch_weekly_runtime");
    if (!data) return;

    setCard("total_uptime_card", uptimeCalc(data.current_uptime));

    const ctx = document.getElementById("weekly_runtimes");
    if (!ctx) return;

    const barColors = [
        "rgba(108,99,255,0.9)", "rgba(108,99,255,0.8)", "rgba(108,99,255,0.7)",
        "rgba(108,99,255,0.6)", "rgba(108,99,255,0.5)", "rgba(108,99,255,0.4)",
        "rgba(108,99,255,0.3)"
    ];

    new Chart(ctx, {
        type: "bar",
        data: {
            labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
            datasets: [{
                label: "Minutes Ran",
                data: data.runtime_data,
                backgroundColor: barColors,
                borderColor: ACCENT,
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: baseChartOptions({ scales: chartScales() })
    });
}

async function loadGambleChart() {
    const data = await fetchData("/api/fetch_gamble_data");
    if (!data) return;

    const ctx = document.getElementById("gamble_earnings");
    if (!ctx) return;

    new Chart(ctx, {
        type: "line",
        data: {
            labels: [
                "12AM","1AM","2AM","3AM","4AM","5AM","6AM",
                "7AM","8AM","9AM","10AM","11AM",
                "12PM","1PM","2PM","3PM","4PM","5PM","6PM",
                "7PM","8PM","9PM","10PM","11PM"
            ],
            datasets: [
                {
                    label: "Wins",
                    data: data.win_data,
                    fill: false,
                    borderColor: GREEN,
                    backgroundColor: GREEN,
                    pointRadius: 2,
                    tension: 0.3
                },
                {
                    label: "Losses",
                    data: data.lose_data,
                    borderColor: RED,
                    backgroundColor: RED,
                    pointRadius: 2,
                    tension: 0.3
                }
            ]
        },
        options: baseChartOptions({ scales: chartScales() })
    });
}

// ── Init ──────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
    await Promise.allSettled([
        loadTotalCommandsChart(),
        loadCowoncyChart(),
        loadWeeklyRuntimeChart(),
        loadGambleChart(),
        loadConsole()
    ]);

    setInterval(loadConsole, 5000);
});
