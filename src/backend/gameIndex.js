const fs = require("fs");
const path = require("path");
const glob = require("glob");
const crypto = require("crypto");
const { BrowserWindow } = require("electron");
const { SlippiGame } = require("@slippi/slippi-js");

const characters = [
  "Captain Falcon", "Donkey Kong", "Fox", "Mr. Game & Watch", "Kirby", "Bowser",
  "Link", "Luigi", "Mario", "Marth", "Mewtwo", "Ness", "Peach", "Pikachu",
  "Ice Climbers", "Jigglypuff", "Samus", "Yoshi", "Zelda", "Sheik", "Falco",
  "Young Link", "Dr. Mario", "Roy", "Pichu", "Ganondorf", "Master Hand",
  "Male Wireframe", "Female Wireframe", "Giga Bowser", "Crazy Hand", "Sandbag",
  "Popo", "Unknown",
];

const stages = [
  null, null, "Fountain of Dreams", "Pokémon Stadium", "Princess Peach's Castle",
  "Kongo Jungle", "Brinstar", "Corneria", "Yoshi's Story", "Onett", "Mute City",
  "Rainbow Cruise", "Jungle Japes", "Great Bay", "Hyrule Temple", "Brinstar Depths",
  "Yoshi's Island", "Green Greens", "Fourside", "Mushroom Kingdom I",
  "Mushroom Kingdom II", null, "Venom", "Poké Floats", "Big Blue", "Icicle Mountain",
  "Icetop", "Flat Zone", "Dream Land N64", "Yoshi's Island N64", "Kongo Jungle N64",
  "Battlefield", "Final Destination",
];

function hashReplayFile(filePath) {
  try {
    const buf = fs.readFileSync(filePath);
    return crypto.createHash("md5").update(buf).digest("hex");
  } catch {
    return null;
  }
}

function loadCache(cacheFilePath) {
  try {
    const raw = fs.readFileSync(cacheFilePath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.results) return { results: {} };
    return parsed;
  } catch {
    return { results: {} };
  }
}

function writeCache(cacheFilePath, cacheObj) {
  fs.writeFileSync(
    cacheFilePath,
    JSON.stringify({
      statsVersion: "ui-port",
      slippiJsVersion: "unknown",
      user_player_arg: "",
      results: cacheObj.results || {},
    })
  );
}

function extractIdentity(metaPlayer) {
  if (!metaPlayer || !metaPlayer.names) {
    return { displayName: "", connectCode: "", tagLower: [] };
  }
  const displayName = metaPlayer.names.netplay || "";
  const connectCode = metaPlayer.names.code || "";
  const tagLower = [displayName?.toLowerCase(), connectCode?.toLowerCase()].filter(Boolean);
  return { displayName, connectCode, tagLower };
}

function matchesPlayerTag(identity, playerTag) {
  if (!playerTag) return false;
  const wanted = playerTag.trim().toLowerCase();
  if (!wanted) return false;
  return (identity.tagLower || []).some((t) => t.includes(wanted));
}

function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${String(r).padStart(2, "0")}s`;
}

function stageSlug(stageName) {
  if (!stageName) return "unknown";
  return String(stageName)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "") || "unknown";
}

function characterName(charId) {
  if (charId == null || charId < 0 || charId >= characters.length) return "Unknown";
  return characters[charId] || "Unknown";
}

function sendListProgress(processed, total) {
  const win = BrowserWindow.getAllWindows()[0];
  if (win && !win.isDestroyed()) {
    win.webContents.send("clip-list-progress", { processed, total });
  }
}

function loadOrParseGame(file, cache) {
  const hash = hashReplayFile(file);
  if (hash && cache.results[hash]) {
    const cached = cache.results[hash];
    return { gameData: { ...cached, file: cached.file || file }, fromCache: true, hash };
  }

  const game = new SlippiGame(file);
  const settings = game.getSettings();
  const metadata = game.getMetadata();
  const stats = game.getStats();
  const latestFrame = game.getLatestFrame();
  const frameIndex = latestFrame?.frame ?? 0;
  const total_seconds = frameIndex / 60;

  const latestFramePercents = [];
  if (latestFrame?.players) {
    latestFrame.players.forEach((pl) => {
      latestFramePercents.push(pl?.post?.percent ?? 999);
    });
  } else {
    latestFramePercents.push(999, 999);
  }

  const gameData = {
    hash,
    file,
    settings,
    metadata,
    stats,
    total_seconds,
    latestFramePercents,
  };

  if (hash) {
    cache.results[hash] = gameData;
  }

  return { gameData, fromCache: false, hash };
}

function buildGameListItem(gameData, playerTag) {
  const { settings, metadata, stats, total_seconds, latestFramePercents, file } = gameData;
  const playersMeta = metadata?.players || [];
  const p0 = extractIdentity(playersMeta[0]);
  const p1 = extractIdentity(playersMeta[1]);

  const char0 = characterName(settings?.players?.[0]?.characterId);
  const char1 = characterName(settings?.players?.[1]?.characterId);

  let stageId = Number(settings?.stageId);
  if (Number.isNaN(stageId) || stageId < 0 || stageId >= stages.length) stageId = null;
  const stageName = stageId != null ? stages[stageId] || `Unknown (${stageId})` : "Unknown";

  const kills0 = stats?.overall?.[0]?.killCount || 0;
  const kills1 = stats?.overall?.[1]?.killCount || 0;
  const perc0 = latestFramePercents?.[0] ?? 999;
  const perc1 = latestFramePercents?.[1] ?? 999;

  let winnerIndex = null;
  if (kills0 > kills1) winnerIndex = 0;
  else if (kills1 > kills0) winnerIndex = 1;
  else if (perc0 < perc1) winnerIndex = 0;
  else if (perc1 < perc0) winnerIndex = 1;

  const p0IsYou = matchesPlayerTag(p0, playerTag);
  const p1IsYou = matchesPlayerTag(p1, playerTag);
  let youIndex = null;
  if (p0IsYou && !p1IsYou) youIndex = 0;
  else if (p1IsYou && !p0IsYou) youIndex = 1;

  const startAt = metadata?.startAt || null;
  let dateLabel = "";
  if (startAt) {
    try {
      dateLabel = new Date(startAt).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      dateLabel = String(startAt);
    }
  }

  return {
    file,
    fileName: path.basename(file),
    durationSeconds: Math.floor(total_seconds || 0),
    durationLabel: formatDuration(total_seconds),
    stageId,
    stageName,
    stageSlug: stageSlug(stageName),
    startAt,
    dateLabel,
    winnerIndex,
    youIndex,
    players: [
      {
        index: 0,
        displayName: p0.displayName || "Player 1",
        connectCode: p0.connectCode || "",
        characterName: char0,
        kills: kills0,
        isYou: youIndex === 0,
        isWinner: winnerIndex === 0,
      },
      {
        index: 1,
        displayName: p1.displayName || "Player 2",
        connectCode: p1.connectCode || "",
        characterName: char1,
        kills: kills1,
        isYou: youIndex === 1,
        isWinner: winnerIndex === 1,
      },
    ],
  };
}

function buildLightSummary(gameData, playerTag) {
  const item = buildGameListItem(gameData, playerTag);
  const stats = gameData.stats;
  const overall = [0, 1].map((i) => {
    const o = stats?.overall?.[i] || {};
    return {
      kills: o.killCount || 0,
      damageDone: Math.round(o.totalDamage || 0),
      openingsPerKill: o.openingsPerKill?.ratio != null
        ? Number(o.openingsPerKill.ratio).toFixed(2)
        : "—",
      neutralWins: o.neutralWinRatio?.count ?? "—",
      inputsPerMinute: o.inputsPerMinute?.ratio != null
        ? Math.round(o.inputsPerMinute.ratio)
        : "—",
    };
  });

  return {
    ...item,
    overall,
  };
}

async function listGamesInFolder(folderPath, playerTag = "") {
  if (!folderPath || !fs.existsSync(folderPath)) {
    throw new Error("Replay folder not found");
  }

  const pattern = path.join(folderPath, "**/*.slp").replace(/\\/g, "/");
  const files = glob.sync(pattern, { nodir: true, absolute: true });
  files.sort((a, b) => {
    try {
      return fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs;
    } catch {
      return 0;
    }
  });

  const cacheFilePath = path.join(folderPath, "replayCache.json");
  const cache = loadCache(cacheFilePath);
  let wroteCache = false;
  const games = [];

  for (let i = 0; i < files.length; i++) {
    sendListProgress(i, files.length);
    try {
      const { gameData, fromCache } = loadOrParseGame(files[i], cache);
      if (!fromCache) wroteCache = true;
      const settings = gameData.settings;
      if (!settings?.players || settings.players.length < 2) continue;
      games.push(buildGameListItem(gameData, playerTag));
    } catch (err) {
      console.warn(`Skipping replay ${files[i]}:`, err.message);
    }
    if (i % 5 === 0) {
      await new Promise((r) => setImmediate(r));
    }
  }

  sendListProgress(files.length, files.length);
  if (wroteCache) {
    try {
      writeCache(cacheFilePath, cache);
    } catch (err) {
      console.warn("Failed to write replay cache:", err.message);
    }
  }

  return { games, total: games.length, scanned: files.length };
}

async function getGameSummary(filePath, playerTag = "") {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error("Replay file not found");
  }
  const folderPath = path.dirname(filePath);
  const cacheFilePath = path.join(folderPath, "replayCache.json");
  const cache = loadCache(cacheFilePath);
  const { gameData, fromCache } = loadOrParseGame(filePath, cache);
  if (!fromCache) {
    try {
      writeCache(cacheFilePath, cache);
    } catch {
      /* ignore */
    }
  }
  return buildLightSummary(gameData, playerTag);
}

module.exports = {
  listGamesInFolder,
  getGameSummary,
  stageSlug,
  characters,
  stages,
};
