/*
 * script.js — OwO- Main Dashboard
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

// ── Chart defaults ───────────────────────────────────────────
const gridColor = "rgba(102, 64, 199, 0.3)";

function baseChartOptions(extra = {}) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        devicePixelRatio: 2,
        plugins: { legend: { position: "top" } },
        ...extra
    };
}

function randomColors(count) {
    return Array.from({ length: count }, () => {
        const h = Math.floor(Math.random() * 360);
        return `hsl(${h}, 80%, 60%)`;
    });
}

// ── Console log ───────────────────────────────────────────────
function updateConsole(html) {
    const el = document.getElementById("messages");
    if (!el) return;
    el.innerHTML = html || "<span style='color:#666'>Tidak ada log.</span>";
    el.scrollTop = el.scrollHeight;
}

async function loadConsole() {
    const data = await fetchData("/api/console", false);
    if (data !== null) updateConsole(data);
}

// ── Overview Cards ────────────────────────────────────────────
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
                backgroundColor: randomColors(data.count.length),
                hoverOffset: 6
            }]
        },
        options: baseChartOptions({
            plugins: { legend: { position: "left" } }
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

    new Chart(ctx, {
        type: "line",
        data: data.data,
        options: baseChartOptions({
            scales: {
                x: {
                    type: "category",
                    ticks: { maxRotation: 45, minRotation: 30 },
                    grid: { color: gridColor }
                },
                y: {
                    beginAtZero: true,
                    stacked: true,
                    ticks: { stepSize: 200 },
                    grid: { color: gridColor }
                }
            }
        })
    });
}

function uptimeCalc(arr) {
    if (!arr || arr.length < 2) return "00:00:00";
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

    new Chart(ctx, {
        type: "bar",
        data: {
            labels: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
            datasets: [{
                label: "Minutes Ran",
                data: data.runtime_data,
                backgroundColor: [
                    "rgb(190,128,248)", "rgb(170,88,247)", "rgb(130,45,209)",
                    "rgb(121,28,209)", "rgb(102,10,189)", "rgb(78,4,146)", "rgb(53,3,100)"
                ]
            }]
        },
        options: baseChartOptions({
            scales: {
                x: { grid: { color: gridColor } },
                y: { beginAtZero: true, grid: { color: gridColor } }
            }
        })
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
                "12 AM","1 AM","2 AM","3 AM","4 AM","5 AM","6 AM",
                "7 AM","8 AM","9 AM","10 AM","11 AM",
                "12 PM","1 PM","2 PM","3 PM","4 PM","5 PM","6 PM",
                "7 PM","8 PM","9 PM","10 PM","11 PM"
            ],
            datasets: [
                {
                    label: "Wins",
                    data: data.win_data,
                    fill: false,
                    borderColor: "rgb(0,200,0)",
                    backgroundColor: "rgb(0,200,0)",
                    tension: 0.2
                },
                {
                    label: "Losses",
                    data: data.lose_data,
                    borderColor: "rgb(220,53,69)",
                    backgroundColor: "rgb(220,53,69)",
                    tension: 0.2
                }
            ]
        },
        options: baseChartOptions({
            scales: {
                x: { title: { display: true, text: "Time of Day" }, grid: { color: gridColor } },
                y: { beginAtZero: true, title: { display: true, text: "Win/Loss count" }, grid: { color: gridColor } }
            }
        })
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

    // Auto-refresh console setiap 5 detik
    setInterval(loadConsole, 5000);
});
