import asyncio
import re
import time
import json

import aiosqlite
from discord.ext import commands

# ─── Constants ────────────────────────────────────────────────────────────────
NEONUTIL_BOT_ID = 851436490415931422
DB_PATH         = "utils/data/db.sqlite"

# Trigger keywords (ketik di channel bot dari akun sendiri)
TRIGGER_SCAN     = "meta scan"     # scan zoo → rekomendasi team
TRIGGER_WEAPONS  = "meta weapons"  # scan weapon inventory
TRIGGER_TEMPLATE = "meta template" # ambil meta template NeonUtil
TRIGGER_APPLY        = "meta apply"         # terapkan rekomendasi team
TRIGGER_WEAPON_APPLY = "meta weapon apply"  # equip weapon terbaik ke team

# Scoring weights per role
ATTACKER_W = {"str": 2.5, "mag": 1.5, "wp": -0.3, "hp": 0.2, "pr": 0.1, "mr": 0.1}
SUPPORT_W  = {"wp": 3.0,  "mag": 1.5, "pr": 0.5,  "mr": 0.5, "hp": 0.3, "str": 0.1}
TANK_W     = {"hp": 2.0,  "pr": 1.8,  "mr": 1.8,  "wp": 0.5, "mag": 0.3, "str": 0.1}

CLASS_ROLE_MAP = {
    "attacker": "attacker", "mag-attacker": "attacker", "str-attacker": "attacker",
    "mag-hybrid": "attacker", "str-hybrid": "attacker",
    "support": "support", "healer": "support", "healer/replenisher": "support",
    "tank": "tank", "str-hybrid tank": "tank", "mag-hybrid tank": "tank",
    "hybrid tank": "tank", "mag-hybrid tank": "tank",
}

# Nama animal di zoo → nama yang NeonUtil kenali (kalau berbeda)
ANIMAL_NAME_MAP = {
    "baby_chick": "chick",
    "rooster":    "chicken",
    "cat":        "cat2",
}

# Meta templates NeonUtil yang diketahui
META_TEMPLATES = {
    "rstaff_pruption": "Rstaff-Pruption — best streaking (~60 lvl+), viability ★★★★",
    "tshdbr":          "Triple Sac Hybrid Double Rstaff",
    "r1prup":          "Rstaff1-Pruption (level 65+)",
    "rpruption_fish":  "Rstaff-Pruption-Fish",
    "dbr_new":         "Double Rstaff (New)",
    "rd_new":          "discharge_rstall_2025",
    "frstaff":         "Fstaff-Rstaff",
}


# ─── Weapon Passive Scoring ──────────────────────────────────────────────────
PASSIVE_SCORES = {
    "rsac": ("tank", 10), "esac": ("tank", 10), "msac": ("tank", 10),
    "rrstaff": ("tank", 9), "mrstaff": ("tank", 9), "prstaff": ("tank", 8),
    "mshield": ("tank", 8), "eshield": ("tank", 7), "rshield": ("tank", 6), "ushield": ("tank", 5),
    "ehp": ("tank", 5), "rhp": ("tank", 4), "chp": ("tank", 3),
    "ethorns": ("tank", 4), "rthorns": ("tank", 3),
    "emr": ("tank", 3), "rmr": ("tank", 2), "mmr": ("tank", 2),
    "ecrune": ("support", 10), "mcrune": ("support", 10),
    "rcrune": ("support", 8), "ucrune": ("support", 6), "ccrune": ("support", 4),
    "rhealstaff": ("support", 8), "phealstaff": ("support", 8), "uhealstaff": ("support", 6),
    "ewp": ("support", 5), "rwp": ("support", 4), "cwp": ("support", 3),
    "elifesteal": ("support", 4), "rlifesteal": ("support", 3),
    "emanatap": ("support", 5), "rmanatap": ("support", 4), "umanatap": ("support", 3),
    "esythe": ("attacker", 10), "rsythe": ("attacker", 8), "usythe": ("attacker", 6),
    "egslay": ("attacker", 8), "rgslay": ("attacker", 6),
    "eawand": ("attacker", 8), "rawand": ("attacker", 7),
    "edstrike": ("attacker", 7), "rdstrike": ("attacker", 6),
    "eenrage": ("attacker", 5), "renrage": ("attacker", 4),
    "eswarm": ("attacker", 4), "rswarm": ("attacker", 3),
    "ekkaze": ("attacker", 5), "rkkaze": ("attacker", 4), "ukkaze": ("attacker", 3),
    "esafeguard": ("any", 3), "rsafeguard": ("any", 2), "usafeguard": ("any", 2),
    "cabsolve": ("any", 2), "eabsolve": ("any", 3), "cadapt": ("any", 2),
}

def score_weapon_for_role(weapon, role):
    passives = weapon.get("passives", [])
    if isinstance(passives, str):
        import json as _j
        try: passives = _j.loads(passives)
        except: passives = []
    score = 0
    for p in passives:
        p_lower = p.lower()
        for key, (p_role, p_score) in PASSIVE_SCORES.items():
            if key in p_lower:
                if p_role == role or p_role == "any":
                    score += p_score
                else:
                    score -= 1
                break
    quality = weapon.get("quality", 0)
    score += (quality / 100) * 5
    return round(score, 2)

# ─── Helpers ──────────────────────────────────────────────────────────────────

def convert_superscript(text):
    table = {"⁰":"0","¹":"1","²":"2","³":"3","⁴":"4",
             "⁵":"5","⁶":"6","⁷":"7","⁸":"8","⁹":"9"}
    result = "".join(table.get(c, c) for c in text)
    try:
        return int(result)
    except ValueError:
        return 0

def score_animal(stats, weights):
    return sum(stats.get(k, 0) * w for k, w in weights.items())

def detect_role_from_class(class_text):
    clean = class_text.lower().split(":")[0].strip()
    for key, role in CLASS_ROLE_MAP.items():
        if key in clean:
            return role
    return "unknown"

def clean_name(raw):
    """Strip emoji tag sisa dari title NeonUtil embed."""
    name = re.sub(r'^[^a-zA-Z0-9_]+', '', raw)
    if '>' in name:
        name = name.split('>')[-1]
    return name.strip().lower()

# ─── DB helpers ───────────────────────────────────────────────────────────────

async def db_exec(sql, params=()):
    async with aiosqlite.connect(DB_PATH, timeout=5) as db:
        await db.execute(sql, params)
        await db.commit()

async def db_fetch(sql, params=()):
    async with aiosqlite.connect(DB_PATH, timeout=5) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(sql, params) as cur:
            return await cur.fetchall()

async def ensure_tables():
    await db_exec("""
        CREATE TABLE IF NOT EXISTS animal_stats (
            name TEXT PRIMARY KEY, rank TEXT DEFAULT '',
            hp INTEGER DEFAULT 0, str INTEGER DEFAULT 0,
            mag INTEGER DEFAULT 0, wp INTEGER DEFAULT 0,
            pr INTEGER DEFAULT 0, mr INTEGER DEFAULT 0,
            total INTEGER DEFAULT 0, class TEXT DEFAULT '',
            role TEXT DEFAULT 'unknown', cached_at INTEGER DEFAULT 0
        )
    """)
    await db_exec("""
        CREATE TABLE IF NOT EXISTS weapon_inventory (
            weapon_id TEXT PRIMARY KEY, name TEXT DEFAULT '',
            quality REAL DEFAULT 0.0, rank TEXT DEFAULT '',
            passives TEXT DEFAULT '', cached_at INTEGER DEFAULT 0
        )
    """)
    # Migrate: tambah kolom baru kalau belum ada
    try:
        await db_exec("ALTER TABLE weapon_inventory ADD COLUMN equipped_to TEXT DEFAULT ''")
    except Exception:
        pass

# ─── Main Cog ─────────────────────────────────────────────────────────────────

class Meta(commands.Cog):
    def __init__(self, bot):
        self.bot     = bot
        self.stopped = False

        # Zoo scan state
        self.scanning        = False
        self.pending_queries = []
        self.current_query   = None
        self.timeout_task    = None
        self.zoo_animals     = {}
        self.scan_results    = {}

        # Last recommendation (untuk meta apply)
        self.last_recommendation = None  # {"attacker": name, "support": name, "tank": name}

        # Weapon scan state
        self.weapon_scanning = False
        self.weapon_dump_until = 0.0
        self.weapon_all = []
        self.weapon_applying = False
        self._wep_waiting    = False
        self._wep_success    = False
        self._wep_keywords   = []

        # Template state
        self.template_pending = False

        try:
            with open("utils/emojis.json", "r", encoding="utf-8") as f:
                self.emoji_dict = json.load(f)
        except Exception:
            self.emoji_dict = {}

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    async def cog_load(self):
        await ensure_tables()

    async def cog_unload(self):
        self.stopped = True
        self._cancel_timeout()

    # ── Zoo Parsing ───────────────────────────────────────────────────────────

    def parse_zoo(self, content):
        result = {}
        for emoji_key, data in self.emoji_dict.items():
            if emoji_key not in content:
                continue
            idx   = content.find(emoji_key)
            after = content[idx + len(emoji_key):]
            sup   = re.match(r"([⁰¹²³⁴⁵⁶⁷⁸⁹]+)", after)
            if sup:
                count = convert_superscript(sup.group(1))
                if count > 0:
                    result[data["name"]] = {"count": count, "rank": data["rank"]}
        return result

    # ── neond Embed Parsing ───────────────────────────────────────────────────

    def parse_neond_embed(self, embed):
        try:
            raw_title = (embed.title or "").strip()
            name = clean_name(raw_title)
            if not name:
                return None
            stats = {
                "name": name, "hp": 0, "str": 0, "mag": 0,
                "wp": 0, "pr": 0, "mr": 0, "total": 0,
                "class": "", "role": "unknown",
            }
            for field in embed.fields:
                fname  = field.name  or ""
                fvalue = field.value or ""
                if "Base stats" in fname:
                    m = re.search(r"\((\d+)\s+total\)", fname)
                    if m:
                        stats["total"] = int(m.group(1))
                    nums = [int(n) for n in re.findall(r"\b\d{1,2}\b", fvalue)]
                    if len(nums) >= 6:
                        stats["hp"]  = nums[0]; stats["str"] = nums[1]; stats["mag"] = nums[2]
                        stats["wp"]  = nums[3]; stats["pr"]  = nums[4]; stats["mr"]  = nums[5]
                elif fname == "Class":
                    class_clean = re.sub(r"<a?:[^>]+>", "", fvalue).strip().rstrip(":").strip()
                    class_clean = class_clean.replace("__", "").strip()
                    stats["class"] = class_clean
                    stats["role"]  = detect_role_from_class(class_clean)
            return stats
        except Exception:
            return None

    # ── Weapon Embed Parsing (owo wep) ────────────────────────────────────────

    def parse_weapon_component(self, text):
        """
        Parse weapon data dari component type=17 (raw WS payload OwO wep).
        Format: `WEAPONID` <emoji><emoji> **Weapon Name** quality%
        Confirmed dari on_socket_raw_receive dump.
        """
        weapons = []
        try:
            pattern = re.compile(r"`([A-Z0-9]{5,6})`[^`]*?\*\*(.+?)\*\*\s+(\d+(?:\.\d+)?)%")
            for m in pattern.finditer(text):
                wid     = m.group(1)
                wname   = m.group(2).strip()
                quality = float(m.group(3))
                # Extract passive emoji names dari antara ID dan nama weapon
                between  = text[text.find(f"`{wid}`"):m.start(2)]
                passives = re.findall(r"<a?:([a-zA-Z0-9_]+):\d+>", between)
                # Hapus rank icons (common, rare, epic, dll)
                rank_names = {"common","uncommon","rare","epic","mythic","legendary",
                              "gem","fabled","hidden","distorted"}
                passives = [p for p in passives if p.lower() not in rank_names]
                weapons.append({
                    "id":       wid,
                    "name":     wname,
                    "quality":  quality,
                    "passives": passives,
                })
        except Exception:
            pass
        return weapons

    # ── Template Embed Parsing (nt v ...) ────────────────────────────────────

    def parse_template_embed(self, embed):
        try:
            raw_title = (embed.title or "").strip()
            desc      = (embed.description or "").strip()
            full_text = desc
            for field in embed.fields:
                full_text += "\n" + (field.value or "")

            composition = []
            comp_pattern = re.compile(
                r"\[(\d)\]\s*L\.(\d+)\s*.+?\|\s*(.+?)\s+(\d+(?:\.\d+)?)%"
            )
            for m in comp_pattern.finditer(full_text):
                composition.append({
                    "slot":     int(m.group(1)),
                    "level":    int(m.group(2)),
                    "weapons":  re.sub(r"<a?:[^>]+>", "", m.group(3)).strip(),
                    "coverage": float(m.group(4)),
                })

            viability = ""
            for field in embed.fields:
                fname = field.name or ""
                if "Viability" in fname:
                    viability = (field.value or "").strip()

            return {
                "title":       raw_title,
                "viability":   viability,
                "composition": composition,
                "description": desc[:400],
            }
        except Exception:
            return None

    # ── DB Operations ─────────────────────────────────────────────────────────

    async def get_cached_animal(self, name):
        rows = await db_fetch("SELECT * FROM animal_stats WHERE name = ?", (name,))
        return dict(rows[0]) if rows else None

    async def save_animal_stats(self, stats, rank=""):
        await db_exec(
            """INSERT OR REPLACE INTO animal_stats
               (name, rank, hp, str, mag, wp, pr, mr, total, class, role, cached_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (stats["name"], rank, stats["hp"], stats["str"], stats["mag"],
             stats["wp"], stats["pr"], stats["mr"], stats["total"],
             stats["class"], stats["role"], int(time.time()))
        )

    async def save_weapons(self, weapons):
        for w in weapons:
            await db_exec(
                """INSERT OR REPLACE INTO weapon_inventory
                   (weapon_id, name, quality, rank, passives, equipped_to, cached_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (w["id"], w["name"], w["quality"], "", "[]",
                 w.get("equipped_to", ""), int(time.time()))
            )

    # ── Zoo Scan ──────────────────────────────────────────────────────────────

    async def start_scan(self):
        if self.scanning:
            await self.bot.log("⚠️ Meta scan sudah berjalan.", "#924444")
            return
        self.scanning = True
        self.zoo_animals = {}; self.scan_results = {}
        self.pending_queries = []; self.current_query = None
        self.last_recommendation = None
        await self.bot.log("🔍 Meta scan dimulai — request zoo...", "#6c63ff")
        await self.bot.send(
            self.bot.settings_dict["setprefix"] + self.bot.alias["zoo"]["normal"]
        )

    async def _after_zoo_parsed(self):
        to_query = []
        for name in self.zoo_animals:
            cached = await self.get_cached_animal(name)
            if cached:
                self.scan_results[name] = {**cached, **self.zoo_animals[name]}
            else:
                to_query.append(name)
        cached_count = len(self.zoo_animals) - len(to_query)
        await self.bot.log(
            f"📋 Zoo: {len(self.zoo_animals)} animal | "
            f"{cached_count} cache | {len(to_query)} query NeonUtil",
            "#6c63ff",
        )
        if to_query:
            self.pending_queries = to_query
            await self._query_next()
        else:
            await self._run_optimizer()

    async def _query_next(self):
        if self.stopped or not self.pending_queries:
            await self._run_optimizer()
            return
        self.current_query = self.pending_queries.pop(0)
        neon_name = ANIMAL_NAME_MAP.get(self.current_query, self.current_query)
        await self.bot.log(
            f"🔎 [{len(self.pending_queries)} sisa] neond {neon_name}", "#a0a0be"
        )
        await self.bot.send(f"neond {neon_name}")
        self._cancel_timeout()
        self.timeout_task = asyncio.create_task(self._query_timeout())

    async def _query_timeout(self):
        await asyncio.sleep(10)
        if self.current_query:
            await self.bot.log(f"⏱ Timeout '{self.current_query}', skip.", "#924444")
            self.current_query = None
            await asyncio.sleep(1)
            await self._query_next()

    def _cancel_timeout(self):
        if self.timeout_task and not self.timeout_task.done():
            self.timeout_task.cancel()
        self.timeout_task = None

    # ── Optimizer ─────────────────────────────────────────────────────────────

    async def _run_optimizer(self):
        self.scanning = False
        animals = list(self.scan_results.values())
        if not animals:
            await self.bot.log("❌ Tidak ada data stats.", "#ef4444")
            return

        def best_for(weights, role_hint=None):
            def scored(a):
                s = score_animal(a, weights)
                if role_hint and a.get("role") == role_hint:
                    s += 5
                return s
            return max(animals, key=scored)

        attacker = best_for(ATTACKER_W, "attacker")
        support  = best_for(SUPPORT_W,  "support")
        tank     = best_for(TANK_W,     "tank")

        # Simpan untuk meta apply
        self.last_recommendation = {
            "attacker": attacker["name"],
            "support":  support["name"],
            "tank":     tank["name"],
        }

        def fmt(a):
            return (
                f"{a['name']} [{a.get('rank','?')}] "
                f"HP:{a.get('hp',0)} STR:{a.get('str',0)} MAG:{a.get('mag',0)} "
                f"WP:{a.get('wp',0)} PR:{a.get('pr',0)} MR:{a.get('mr',0)} "
                f"| {a.get('class','-') or '-'}"
            )

        await self.bot.log(
            "━━━━━━━━━━━━━━━━━━━━━━\n"
            "🧠 META TEAM REKOMENDASI\n"
            "━━━━━━━━━━━━━━━━━━━━━━\n"
            f"⚔️  [1] Attacker → {fmt(attacker)}\n"
            f"💚  [2] Support  → {fmt(support)}\n"
            f"🛡️  [3] Tank     → {fmt(tank)}\n"
            "━━━━━━━━━━━━━━━━━━━━━━\n"
            f"📊 {len(animals)} animal di-scan\n"
            "💡 Ketik 'meta apply' untuk terapkan ke team sekarang",
            "#22c55e",
        )

    # ── Auto Apply Team ───────────────────────────────────────────────────────

    async def apply_team(self):
        if not self.last_recommendation:
            await self.bot.log(
                "❌ Belum ada rekomendasi. Jalankan 'meta scan' dulu.", "#924444"
            )
            return

        rec = self.last_recommendation
        await self.bot.log(
            f"⚙️ Applying team:\n"
            f"  [1] {rec['attacker']}\n"
            f"  [2] {rec['support']}\n"
            f"  [3] {rec['tank']}",
            "#6c63ff",
        )

        positions = [
            (1, rec["attacker"]),
            (2, rec["support"]),
            (3, rec["tank"]),
        ]

        async def send_team_cmd(arguments, log_msg):
            """Kirim satu team command, tunggu sampai keluar dari queue."""
            await self.bot.put_queue({
                "cmd_name":      "team",
                "cmd_arguments": arguments,
                "prefix":        True,
                "checks":        False,
                "id":            "team",
                "removed":       False,
            })
            await self.bot.log(log_msg, "#a0a0be")
            # Tunggu command keluar dari queue (max 10 detik)
            for _ in range(20):
                await asyncio.sleep(0.5)
                if not self.bot.cmds_state.get("team", {}).get("in_queue", False):
                    break
            # Extra delay antar command biar OwO tidak rate limit
            await asyncio.sleep(self.bot.random.uniform(2.0, 3.0))

        # Remove lalu add per slot satu-satu — team tidak boleh kosong semua
        for pos, animal_name in positions:
            try:
                await send_team_cmd(f"remove {pos}", f"🗑️ Remove pos {pos}...")
                await send_team_cmd(f"add {animal_name} {pos}", f"✅ Add pos {pos} → {animal_name}")
            except Exception as e:
                await self.bot.log(f"❌ Gagal pos {pos}: {e}", "#ef4444")

        await self.bot.log("🎉 Team berhasil diapply!", "#22c55e")


    # ── Auto Weapon Apply ─────────────────────────────────────────────────────

    async def apply_weapons(self):
        """
        Equip weapon terbaik ke tiap animal di team berdasarkan role.
        Flow: unequip lama → tunggu response OwO → equip baru → tunggu response → next slot
        """
        if self.weapon_applying:
            await self.bot.log("⚠️ Weapon apply sudah berjalan.", "#924444")
            return
        if not self.last_recommendation:
            await self.bot.log(
                "❌ Belum ada rekomendasi. Jalankan 'meta scan' dulu.", "#924444"
            )
            return

        self.weapon_applying = True
        rec = self.last_recommendation

        rows = await db_fetch("SELECT * FROM weapon_inventory")
        if not rows:
            await self.bot.log(
                "❌ Weapon DB kosong. Jalankan 'meta weapons' dulu.", "#924444"
            )
            self.weapon_applying = False
            return

        weapons = [dict(r) for r in rows]

        role_map = {
            rec["attacker"]: "attacker",
            rec["support"]:  "support",
            rec["tank"]:     "tank",
        }

        def best_weapon_for(role, exclude_ids=None):
            exclude_ids = exclude_ids or []
            candidates = [w for w in weapons if w["weapon_id"] not in exclude_ids]
            if not candidates:
                return None
            return max(candidates, key=lambda w: score_weapon_for_role(w, role))

        used_ids = []
        assignments = {}
        for animal_name, role in role_map.items():
            best = best_weapon_for(role, exclude_ids=used_ids)
            if best:
                assignments[animal_name] = best
                used_ids.append(best["weapon_id"])

        preview = "\n".join(
            f"  [{role_map[a]}] {a} → {w['name']} ({w['weapon_id']}) "
            f"| {w['quality']}% | score: {score_weapon_for_role(w, role_map[a])}"
            for a, w in assignments.items()
        )
        await self.bot.log(
            f"⚔️ Weapon plan:\n{preview}\n⏳ Applying...",
            "#6c63ff",
        )

        prefix = self.bot.settings_dict["setprefix"]

        async def send_and_wait(cmd, success_keywords, timeout=10):
            """
            Kirim command weapon, tunggu response OwO yang mengandung keyword sukses.
            Returns True kalau sukses, False kalau timeout.
            """
            self._wep_waiting = True
            self._wep_success = False
            self._wep_keywords = success_keywords

            await self.bot.send(f"{prefix}weapon {cmd}")

            # Tunggu sampai on_message detect response, max timeout detik
            for _ in range(timeout * 2):
                await asyncio.sleep(0.5)
                if not self._wep_waiting:
                    break

            # Extra jeda biar OwO tidak rate limit — weapon basecd di misc.json = 1s
            # tambah random 2-4s untuk keamanan
            await asyncio.sleep(self.bot.random.uniform(2.5, 4.0))
            return self._wep_success

        # Per slot: unequip lama dulu, baru equip baru
        for animal_name, weapon in assignments.items():
            role = role_map[animal_name]
            await self.bot.log(
                f"🔄 Slot {role}: {animal_name}", "#a0a0be"
            )

            # Cek apakah ada weapon lama di DB untuk animal ini
            old_rows = await db_fetch(
                "SELECT weapon_id, name FROM weapon_inventory WHERE equipped_to = ?",
                (animal_name,)
            )
            for old_row in old_rows:
                old_id = old_row["weapon_id"]
                if old_id == weapon["weapon_id"]:
                    continue  # sama, skip
                ok = await send_and_wait(
                    f"unequip {old_id}",
                    ["no longer wielding", "unequipped", "removed"],
                )
                if ok:
                    await self.bot.log(f"  🗑️ Unequip {old_id}", "#a0a0be")
                    await db_exec(
                        "UPDATE weapon_inventory SET equipped_to = '' WHERE weapon_id = ?",
                        (old_id,)
                    )
                else:
                    await self.bot.log(f"  ⚠️ Unequip {old_id} timeout, lanjut...", "#924444")

            # Equip weapon baru
            ok = await send_and_wait(
                f"{weapon['weapon_id']} {animal_name}",
                ["is now wielding", "now wielding"],
            )
            if ok:
                await self.bot.log(
                    f"  ✅ Equip {weapon['name']} → {animal_name}", "#22c55e"
                )
                await db_exec(
                    "UPDATE weapon_inventory SET equipped_to = ? WHERE weapon_id = ?",
                    (animal_name, weapon["weapon_id"])
                )
            else:
                await self.bot.log(
                    f"  ⚠️ Equip {weapon['name']} timeout/gagal", "#924444"
                )

        self.weapon_applying = False
        self._wep_waiting = False
        await self.bot.log("🎉 Weapon apply selesai!", "#22c55e")

    # ── Weapon Scan ───────────────────────────────────────────────────────────

    async def start_weapon_scan(self):
        if self.weapon_scanning:
            await self.bot.log("⚠️ Weapon scan sudah berjalan.", "#924444")
            return
        self.weapon_scanning = True
        self.weapon_all = []  # reset akumulasi
        await self.bot.log(
            "⚔️ Weapon scan dimulai — request wwep...", "#6c63ff"
        )
        # Pakai NeonUtil neonw my — weapon list yang sudah di-register ke NeonUtil
        # Syarat: sudah registrasi dulu via 'neonw inv on' + klik semua halaman owow manual
        await self.bot.send("neonw my")
        asyncio.create_task(self._weapon_scan_timeout())

    async def _weapon_scan_timeout(self):
        await asyncio.sleep(30)
        if self.weapon_scanning:
            self.weapon_scanning = False
            await self.bot.log(
                "⏱ Weapon scan timeout — embed OwO tidak terdeteksi dalam 30s.",
                "#924444",
            )

    # ── Template Query ────────────────────────────────────────────────────────

    async def start_template_query(self):
        if self.template_pending:
            await self.bot.log("⚠️ Template query sudah berjalan.", "#924444")
            return
        self.template_pending = True
        template_list = "\n".join(
            f"  {tid}: {desc}" for tid, desc in META_TEMPLATES.items()
        )
        await self.bot.log(
            f"📌 Meta templates tersedia:\n{template_list}\n"
            "🔍 Query detail: rstaff_pruption...",
            "#6c63ff",
        )
        await self.bot.send("nt v rstaff_pruption")
        self.template_pending = False


    # ── on_socket_raw_receive — intercept raw WS payload ─────────────────────

    @commands.Cog.listener()
    async def on_socket_raw_receive(self, msg):
        if not self.weapon_scanning:
            return
        if time.time() > self.weapon_dump_until:
            return
        try:
            import json as _json
            import components_v2 as comp
            data = _json.loads(msg) if isinstance(msg, str) else {}
            t = data.get("t")
            if data.get("op") != 0 or t not in ("MESSAGE_CREATE", "MESSAGE_UPDATE"):
                return
            d = data.get("d", {})
            if str(d.get("author", {}).get("id", "")) != str(self.bot.owo_bot_id):
                return

            # Pakai components_v2 seperti boss.py
            message = comp.message.get_message_obj(d)
            if not message.components:
                return

            # Cari text_display yang berisi weapon list
            page_text  = None
            next_btn   = None

            # Parse langsung dari raw JSON (lebih reliable dari components_v2)
            raw_components = d.get("components", [])

            # Recursive search di raw JSON
            def raw_find(comps):
                page = None
                next_cid = None
                next_btn_data = None
                for c in comps:
                    t = c.get("type")
                    content = c.get("content", "")
                    if t == 10 and "`" in content and "**" in content:
                        page = content
                    elif t == 2:  # button
                        cid = c.get("custom_id", "")
                        disabled = c.get("disabled", False)
                        if cid == "paged_next" and not disabled:
                            next_cid = cid
                            next_btn_data = c
                    # Recurse ke children
                    for attr in ("components",):
                        children = c.get(attr, [])
                        if children:
                            p, nc, nb = raw_find(children)
                            if p: page = p
                            if nc: next_cid = nc; next_btn_data = nb
                return page, next_cid, next_btn_data

            page_text, next_cid, next_btn_data = raw_find(raw_components)

            if not page_text:
                return

            weapons = self.parse_weapon_component(page_text)
            if not weapons:
                return

            self.weapon_all.extend(weapons)

            # Cari page info (label "1/4") dari raw JSON
            def find_page_label(comps):
                for c in comps:
                    if c.get("type") == 2 and c.get("custom_id") == "noop":
                        return c.get("label", "")
                    sub = c.get("components", [])
                    if sub:
                        result = find_page_label(sub)
                        if result: return result
                return ""

            page_label = find_page_label(raw_components)
            # Parse current/total dari label "1/4"
            cur_page, total_pages = 0, 0
            if "/" in page_label:
                try:
                    cur_page  = int(page_label.split("/")[0])
                    total_pages = int(page_label.split("/")[1])
                except ValueError:
                    pass

            await self.bot.log(
                f"📄 {len(weapons)} weapon | halaman {page_label} | total: {len(self.weapon_all)}",
                "#a0a0be",
            )

            # Stop jika sudah di halaman terakhir atau sudah wrap around
            is_last = (cur_page > 0 and total_pages > 0 and cur_page >= total_pages)
            if next_cid and not is_last:
                asyncio.create_task(
                    self._click_weapon_interaction(d, next_cid)
                )
            else:
                await self._finish_weapon_scan()

        except Exception as e:
            await self.bot.log(f"raw_ws err: {e}", "#924444")

    async def _click_weapon_interaction(self, d, custom_id):
        """Klik tombol via Discord interactions API langsung (aiohttp)."""
        await asyncio.sleep(1.5)
        import aiohttp, json as _json
        try:
            msg_id    = d.get("id")
            channel_id = d.get("channel_id")
            guild_id  = str(d.get("guild_id") or "")

            # Cari component_id dari button paged_next di raw JSON
            def find_btn_id(comps):
                for c in comps:
                    if c.get("type") == 2 and c.get("custom_id") == custom_id:
                        return c.get("id")
                    sub = c.get("components", [])
                    if sub:
                        r = find_btn_id(sub)
                        if r: return r
                return None

            component_id = find_btn_id(d.get("components", []))

            payload = {
                "type": 3,
                "guild_id": guild_id,
                "channel_id": channel_id,
                "message_id": msg_id,
                "application_id": str(self.bot.owo_bot_id),
                "session_id": self.bot.ws.session_id,
                "data": {
                    "component_type": 2,
                    "custom_id": custom_id,
                },
            }
            if component_id:
                payload["data"]["component_id"] = component_id

            headers = dict(self.bot.local_headers)
            headers["Content-Type"] = "application/json"

            async with aiohttp.ClientSession() as session:
                async with session.post(
                    "https://discord.com/api/v9/interactions",
                    data=_json.dumps(payload),
                    headers=headers,
                ) as resp:
                    if resp.status in (200, 204):
                        await self.bot.log("▶ Next page interaction sent", "#a0a0be")
                    else:
                        body = await resp.text()
                        await self.bot.log(
                            f"⚠️ Interaction failed: {resp.status} | {body[:100]}",
                            "#924444",
                        )
                        await self._finish_weapon_scan()
        except Exception as e:
            await self.bot.log(f"⚠️ Gagal send interaction: {e}", "#924444")
            await self._finish_weapon_scan()

    async def _finish_weapon_scan(self):
        """Simpan semua weapon ke DB dan reset state."""
        self.weapon_scanning = False
        if not self.weapon_all:
            await self.bot.log("⚠️ Tidak ada weapon yang berhasil di-scan.", "#924444")
            return
        await self.save_weapons(self.weapon_all)
        lines = "\n".join(
            f"  {w['id']} | {w['name']} | {w['quality']}% | {w.get('passives', [])}"
            for w in self.weapon_all
        )
        total = len(self.weapon_all)
        self.weapon_all = []
        await self.bot.log(
            f"⚔️ Weapon scan selesai — {total} weapon tersimpan:\n{lines}\n"
            "💾 DB updated.",
            "#22c55e",
        )

    # ── on_message ────────────────────────────────────────────────────────────

    @commands.Cog.listener()
    async def on_message(self, message):
        if self.stopped:
            return



        if message.channel.id != self.bot.cm.id:
            return
        try:
            # ── Triggers (dari akun sendiri) ──────────────────────────────────
            if message.author.id == self.bot.user.id:
                content = message.content.lower().strip()
                if content == TRIGGER_SCAN:
                    asyncio.create_task(self.start_scan())
                    return
                if content == TRIGGER_WEAPONS:
                    self.weapon_scanning = True
                    self.weapon_dump_until = time.time() + 60
                    await self.bot.log("⚔️ Weapon scan dimulai...", "#6c63ff")
                    await self.bot.send(
                        self.bot.settings_dict["setprefix"] + "wep"
                    )
                    return
                if content == TRIGGER_TEMPLATE:
                    asyncio.create_task(self.start_template_query())
                    return
                if content == TRIGGER_APPLY:
                    asyncio.create_task(self.apply_team())
                    return
                if content == TRIGGER_WEAPON_APPLY:
                    asyncio.create_task(self.apply_weapons())
                    return

            # ── OwO weapon command response ───────────────────────────────────
            if (
                self._wep_waiting
                and message.author.id == self.bot.owo_bot_id
                and message.content
            ):
                content_lower = message.content.lower()
                if any(k in content_lower for k in self._wep_keywords):
                    self._wep_waiting = False
                    self._wep_success = True
                elif any(k in content_lower for k in [
                    "slow down", "rate limit", "too fast", "cooldown"
                ]):
                    self._wep_waiting = False
                    self._wep_success = False
                    await self.bot.log("⏱ OwO rate limit weapon, tunggu...", "#924444")

            # ── OwO zoo response ──────────────────────────────────────────────
            if (
                self.scanning
                and message.author.id == self.bot.owo_bot_id
                and "'s zoo!" in message.content
                and self.bot.get_nick(message) in message.content
            ):
                self.zoo_animals = self.parse_zoo(message.content)
                if not self.zoo_animals:
                    await self.bot.log("⚠️ Zoo kosong / gagal parse.", "#924444")
                    self.scanning = False
                    return
                await self.bot.log(
                    f"🦁 {len(self.zoo_animals)} animal aktif ditemukan.", "#6c63ff"
                )
                await self._after_zoo_parsed()
                return

            # ── OwO weapon inventory response ─────────────────────────────────
            if (
                self.weapon_scanning
                and message.author.id in (self.bot.owo_bot_id, NEONUTIL_BOT_ID)
                and message.embeds
            ):
                for embed in message.embeds:
                    title       = embed.title       or ""
                    author_name = (embed.author.name if embed.author else "") or ""
                    desc        = embed.description or ""
                    fields_text = " ".join((f.name or "") + " " + (f.value or "") for f in embed.fields)

                    # Skip battle embed
                    if "goes into battle" in author_name:
                        continue

                    is_weapon_embed = (
                        "Weapon" in title
                        or "Weapon" in author_name
                        or "weapon" in desc.lower()
                        or "Weapon Filters" in fields_text
                        or "Sort by Weapon" in fields_text
                    )
                    if not is_weapon_embed:
                        continue

                    weapons = self.parse_weapon_embed(embed)
                    if weapons:
                        await self.save_weapons(weapons)
                        lines = "\n".join(
                            f"  {w['id']} | {w['name']} | {w['quality']}%"
                            + (f" → {w['equipped_to']}" if w.get("equipped_to") else "")
                            for w in weapons
                        )
                        await self.bot.log(
                            f"⚔️ {len(weapons)} weapon ditemukan:\n{lines}\n"
                            "💾 Tersimpan ke DB.",
                            "#22c55e",
                        )
                    else:
                        await self.bot.log(
                            "⚠️ Weapon embed terdeteksi tapi gagal parse.\n"
                            f"title={title!r} | author={author_name!r}",
                            "#924444",
                        )
                    self.weapon_scanning = False
                    break

            # ── NeonUtil: neond ────────────────────────────────────────────────
            if (
                self.scanning
                and message.author.id == NEONUTIL_BOT_ID
                and self.current_query
                and message.embeds
            ):
                for embed in message.embeds:
                    stats = self.parse_neond_embed(embed)
                    if not stats:
                        continue
                    q = self.current_query.lower()
                    n = stats["name"]
                    # Juga cek mapped name
                    mapped = ANIMAL_NAME_MAP.get(q, q)
                    if not (q == n or q in n or n in q or mapped == n or mapped in n):
                        continue

                    self._cancel_timeout()
                    rank = self.zoo_animals.get(self.current_query, {}).get("rank", "")
                    await self.save_animal_stats(stats, rank)
                    self.scan_results[self.current_query] = {
                        **stats, **self.zoo_animals.get(self.current_query, {})
                    }
                    await self.bot.log(
                        f"✅ {stats['name']} | "
                        f"HP:{stats['hp']} STR:{stats['str']} MAG:{stats['mag']} "
                        f"WP:{stats['wp']} PR:{stats['pr']} MR:{stats['mr']} "
                        f"| {stats['class'] or 'unknown'}",
                        "#22c55e",
                    )
                    self.current_query = None
                    await asyncio.sleep(self.bot.random.uniform(2.0, 3.0))
                    await self._query_next()
                    break

            # ── NeonUtil: template (nt v ...) ─────────────────────────────────
            if (
                message.author.id == NEONUTIL_BOT_ID
                and message.embeds
            ):
                for embed in message.embeds:
                    title = embed.title or ""
                    # Template embed ditandai dengan "—" di judul
                    if "\u2014" not in title and "—" not in title:
                        continue
                    result = self.parse_template_embed(embed)
                    if not result:
                        continue
                    comp_lines = "\n".join(
                        f"  [{c['slot']}] L.{c['level']} | "
                        f"weapon: {c['weapons']} | coverage: {c['coverage']}%"
                        for c in result["composition"]
                    ) or "  (gagal parse composition)"
                    await self.bot.log(
                        f"📋 {result['title']}\n"
                        f"⭐ Viability: {result['viability']}\n"
                        f"📝 {result['description'][:250]}\n"
                        f"Composition:\n{comp_lines}\n"
                        "─────────────────\n"
                        "💡 Bandingkan dengan zoo kamu via 'meta scan'",
                        "#6c63ff",
                    )
                    break

        except Exception as e:
            await self.bot.log(f"Error - {e}, meta on_message()", "#c25560")


async def setup(bot):
    await bot.add_cog(Meta(bot))
