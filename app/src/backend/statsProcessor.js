const fs = require("fs");
const path = require("path");
const glob = require("glob");
const crypto = require("crypto");
const { BrowserWindow } = require("electron");

const { SlippiGame } = require("@slippi/slippi-js");

// Characters indexed by internal Slippi character ID
const characters = [
  "Captain Falcon", "Donkey Kong", "Fox", "Mr. Game & Watch", "Kirby", "Bowser", "Link", "Luigi", "Mario", "Marth", "Mewtwo", "Ness", "Peach", "Pikachu", "Ice Climbers", "Jigglypuff", "Samus", "Yoshi", "Zelda", "Sheik", "Falco", "Young Link", "Dr. Mario", "Roy", "Pichu", "Ganondorf", "Master Hand", "Male Wireframe", "Female Wireframe", "Giga Bowser", "Crazy Hand", "Sandbag", "Popo", "Unknown"
];

const characters_lowercase = characters.map(c => c.toLowerCase());

const stages = [
  null, null, "Fountain of Dreams", "Pokémon Stadium", "Princess Peach's Castle", "Kongo Jungle", "Brinstar", "Corneria", "Yoshi's Story", "Onett", "Mute City", "Rainbow Cruise", "Jungle Japes", "Great Bay", "Hyrule Temple", "Brinstar Depths", "Yoshi's Island", "Green Greens", "Fourside", "Mushroom Kingdom I", "Mushroom Kingdom II", null, "Venom", "Poké Floats", "Big Blue", "Icicle Mountain", "Icetop", "Flat Zone", "Dream Land N64", "Yoshi's Island N64", "Kongo Jungle N64", "Battlefield", "Final Destination"
];

let cancelRequested = false;

function cancelAnalysis() {
  cancelRequested = true;
}

function secondsToHMS(seconds) {
  const format = val =>
    `0${Math.floor(val)}`.replace(/^0+(\d\d)/, "$1");
  const hours = seconds / 3600;
  const minutes = (seconds % 3600) / 60;
  return [hours, minutes, seconds % 60].map(format).join(":");
}

function extractIdentity(metaPlayer) {
  if (!metaPlayer || !metaPlayer.names) {
    return {
      tagLower: null,
      displayName: "",
      connectCode: ""
    };
  }

  const displayName = metaPlayer.names.netplay || "";
  const connectCode = metaPlayer.names.code || "";
  const tagLower = [
    displayName?.toLowerCase(),
    connectCode?.toLowerCase()
  ].filter(Boolean);

  return {
    tagLower,
    displayName,
    connectCode
  };
}

function matchesAnyTag(identity, wantedListLower) {
  if (!wantedListLower || wantedListLower.length === 0) return true; // no filter
  if (!identity.tagLower || identity.tagLower.length === 0) return false;

  return identity.tagLower.some(playerTag =>
    wantedListLower.some(req => playerTag.includes(req))
  );
}

function isIgnoredOpponent(identity, ignoredLower) {
  if (!ignoredLower || ignoredLower.length === 0) return false;
  if (!identity.tagLower || identity.tagLower.length === 0) return false;

  return identity.tagLower.some(playerTag =>
    ignoredLower.some(ign => playerTag.includes(ign))
  );
}

function resolveCharacterFilter(requestedCharLower) {
  if (!requestedCharLower) return null;
  const idx = characters_lowercase.indexOf(requestedCharLower.toLowerCase());
  if (idx === -1) {
    return null;
  }
  return { num: idx, name: characters[idx] };
}

function hashReplayFile(filePath) {
  try {
    const buf = fs.readFileSync(filePath);
    const hash = crypto.createHash("md5").update(buf).digest("hex");
    return hash;
  } catch {
    return null;
  }
}

function loadCache(cacheFilePath) {
  try {
    const raw = fs.readFileSync(cacheFilePath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.results) {
      return { results: {} };
    }
    return parsed;
  } catch {
    return { results: {} };
  }
}

function writeCache(cacheFilePath, cacheObj, meta) {
  const data = {
    statsVersion: meta?.statsVersion || "ui-port",
    slippiJsVersion: meta?.slippiJsVersion || "unknown",
    user_player_arg: meta?.userPlayerArg || "",
    results: cacheObj.results || {}
  };

  fs.writeFileSync(cacheFilePath, JSON.stringify(data));
}

function processSingleReplay({
  file,
  gameData,
  wantedPlayersLower,
  wantedOpponentLower,
  ignoredOpponentsLower,
  playerCharacterFilter,
  opponentCharacterFilter
}) {
  const data = {};

  try {
    const {
      settings,
      metadata,
      stats,
      latestFramePercents,
      total_seconds
    } = gameData;

    const playersMeta = metadata?.players || [];

    const p0 = extractIdentity(playersMeta[0]);
    const p1 = extractIdentity(playersMeta[1]);

    if (!p0 || !p1 || !p0.displayName || !p1.displayName) {
      console.warn(`Skipping replay: missing player info in ${file}`);
      return null;
    }

    if (playersMeta.length < 2 || !settings.players || settings.players.length < 2) {
      return {
        total_seconds,
        game_seconds: 0 // won't add to counted_seconds since we can't analyze it
      };
    }

    const p0MatchesYou = matchesAnyTag(p0, wantedPlayersLower);
    const p1MatchesYou = matchesAnyTag(p1, wantedPlayersLower);

    const p0MatchesOppFilter = matchesAnyTag(p0, wantedOpponentLower);
    const p1MatchesOppFilter = matchesAnyTag(p1, wantedOpponentLower);

    let playerIndex = null;
    let opponentIndex = null;

    if (wantedOpponentLower && wantedOpponentLower.length > 0) {
      if (p0MatchesYou && p1MatchesOppFilter) {
        playerIndex = 0;
        opponentIndex = 1;
      } else if (p1MatchesYou && p0MatchesOppFilter) {
        playerIndex = 1;
        opponentIndex = 0;
      } else {
        return {
          total_seconds,
          game_seconds: 0
        };
      }
    } else {
      if (p0MatchesYou && !p1MatchesYou) {
        playerIndex = 0;
        opponentIndex = 1;
      } else if (p1MatchesYou && !p0MatchesYou) {
        playerIndex = 1;
        opponentIndex = 0;
      } else if (p0MatchesYou && p1MatchesYou) {
        playerIndex = 0;
        opponentIndex = 1;
      } else {
        return {
          total_seconds,
          game_seconds: 0
        };
      }
    }

    const playerIdentity = playerIndex === 0 ? p0 : p1;
    const opponentIdentity = opponentIndex === 0 ? p0 : p1;

    if (isIgnoredOpponent(opponentIdentity, ignoredOpponentsLower)) {
      return {
        total_seconds,
        game_seconds: 0
      };
    }

    const playerCharId = settings.players[playerIndex]?.characterId;
    const oppCharId = settings.players[opponentIndex]?.characterId;

    const playerCharName = characters[playerCharId] || "Unknown";
    const oppCharName = characters[oppCharId] || "Unknown";

    if (
      playerCharacterFilter &&
      playerCharacterFilter.num !== playerCharId
    ) {
      return {
        total_seconds,
        game_seconds: 0
      };
    }

    if (
      opponentCharacterFilter &&
      opponentCharacterFilter.num !== oppCharId
    ) {
      return {
        total_seconds,
        game_seconds: 0
      };
    }

    const latestPercPlayer = latestFramePercents[playerIndex];
    const latestPercOpp = latestFramePercents[opponentIndex];

    const playerKills = (stats?.overall?.[playerIndex]?.killCount) || 0;
    const opponentKills = (stats?.overall?.[opponentIndex]?.killCount) || 0;

    const game_seconds = Math.floor(total_seconds || 0);

    if (game_seconds < 30) {
      return {
        total_seconds,
        game_seconds: 0
      };
    }
    if (playerKills === 0 && opponentKills === 0) {
      return {
        total_seconds,
        game_seconds: 0
      };
    }

    const moreKills = playerKills > opponentKills;
    const lowerPercent = (playerKills === opponentKills) && (latestPercPlayer < latestPercOpp);

    const didWin = moreKills || lowerPercent;

    let stageId = Number(settings?.stageId);
    if (isNaN(stageId) || stageId < 0 || stageId >= stages.length) {
      stageId = null;
    }
    const stageName = stageId !== null ? stages[stageId] || `Unknown (${stageId})` : "Unknown";

    data.total_games = 1;
    data.total_wins = didWin ? 1 : 0;
    data.total_seconds = total_seconds;
    data.game_seconds = game_seconds;

    data.player_character_num = playerCharId;
    data.player_character_name = playerCharName;
    data.opponent_character_num = oppCharId;
    data.opponent_character_name = oppCharName;

    data.stage_num = stageId;
    data.stage_name = stages[stageId] || "Unknown Stage";

    data.player_name = playerIdentity.displayName || "";
    data.player_code = playerIdentity.connectCode || "";

    data.opponent_name = opponentIdentity.displayName || "";
    data.opponent_code = opponentIdentity.connectCode || "";

    return data;

  } catch (err) {

    return {
      total_seconds: gameData?.total_seconds || 0,
      game_seconds: 0
    };
  }
}

async function analyzeReplays(folderPath, options = {}) {
  const {
    playerTags = [],
    opponentTags = [],
    ignoredOpponents = [],
    playerCharacter = null,
    opponentCharacter = null
  } = options;

  const wantedPlayersLower = playerTags.map(s => s.toLowerCase().trim()).filter(Boolean);
  const wantedOpponentLower = opponentTags.map(s => s.toLowerCase().trim()).filter(Boolean);
  const ignoredOpponentsLower = ignoredOpponents.map(s => s.toLowerCase().trim()).filter(Boolean);

  const playerCharacterFilter = resolveCharacterFilter(playerCharacter);
  const opponentCharacterFilter = resolveCharacterFilter(opponentCharacter);

  const cacheFilePath = path.join(folderPath, "replayCache.json");
  const cache = loadCache(cacheFilePath);

  let total_games = 0;
  let total_wins = 0;
  let total_seconds = 0;
  let counted_seconds = 0;

  const character_totals = [];
  const character_wins = [];
  const character_playtime = [];

  const nickname_totals = {};
  const nickname_wins = {};
  const nickname_playtime = {};

  const code_totals = {};
  const code_wins = {};
  const code_playtime = {};

  const opponent_totals = {};
  const opponent_wins = {};
  const opponent_playtime = {};

  const stage_totals = [];
  const stage_wins = [];
  const stage_playtime = [];

  const character_head_to_head = Array(34).fill().map(() =>
    Array(34).fill().map((_, i) => [0, 0, characters[i]])
  );

  let final_player_name = "";
  let final_opponent_name = "";
  let real_player_code = "";
  let real_opponent_code = "";

const normalizedPath = path.resolve(folderPath);
const pattern = `${normalizedPath.replace(/\\/g, "/")}/**/*.slp`;
const files = glob.sync(pattern, { nodir: true }).sort();

console.log(`Found ${files.length} replay files in`, normalizedPath);

let new_replays = 0;

cancelRequested = false;
let skippedCount = 0;

const win = BrowserWindow.getAllWindows()[0];

for (let i = 0; i < files.length; i++) {
  if (cancelRequested) {
    console.log("Analysis cancelled by user.");
    if (win) win.webContents.send("progress-update", { cancelled: true });
    break;
  }

  await new Promise((resolve) => setImmediate(resolve));

  const file = files[i];

  try {

    const hash = hashReplayFile(file);
    let gameData;

    if (hash && cache.results[hash]) {
      gameData = cache.results[hash];
    } else {
      const game = new SlippiGame(file);
      const settings = game.getSettings();
      const metadata = game.getMetadata();
      const stats = game.getStats();

      const latestFrame = game.getLatestFrame();
      const frameIndex = latestFrame?.frame ?? 0;
      const total_seconds = frameIndex / 60;

      const latestFramePercents = [];
      if (latestFrame && latestFrame.players) {
        latestFrame.players.forEach((pl) => {
          latestFramePercents.push(pl.post.percent);
        });
      } else {
        latestFramePercents.push(999);
        latestFramePercents.push(999);
      }

      gameData = {
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
        new_replays += 1;
      }
    }

    const result = processSingleReplay({
      file,
      gameData,
      wantedPlayersLower,
      wantedOpponentLower,
      ignoredOpponentsLower,
      playerCharacterFilter,
      opponentCharacterFilter,
    });

    if (!result) {
      skippedCount++;
      continue;
    }

    if (
      result.stage_num === null ||
      result.stage_num === undefined ||
      isNaN(result.stage_num) ||
      !stages[result.stage_num]
    ) {
      skippedCount++;
      continue;
    }

    total_games += result.total_games || 0;
    total_wins += result.total_wins || 0;
    total_seconds += result.total_seconds || 0;
    counted_seconds += result.game_seconds || 0;

  const stageId = result.stage_num;

  if (
    stageId === null ||
    stageId === undefined ||
    isNaN(stageId) ||
    !stages[stageId]
  ) {
    skippedCount++;
    return;
  }

  const stageName = stages[stageId];

  if (!stage_totals[stageName]) stage_totals[stageName] = 0;
  if (!stage_wins[stageName]) stage_wins[stageName] = 0;
  if (!stage_playtime[stageName]) stage_playtime[stageName] = 0;

  stage_totals[stageName]++;
  if (result.total_wins) stage_wins[stageName]++;
  stage_playtime[stageName] += result.game_seconds || 0;

  if (!matchups) var matchups = {};
  const playerCharacter = result.player_character_name;
  const opponentCharacter = result.opponent_character_name;

  if (
    !playerCharacter ||
    !opponentCharacter ||
    playerCharacter === "Unknown" ||
    opponentCharacter === "Unknown" ||
    playerCharacter === "undefined" ||
    opponentCharacter === "undefined"
  ) {
    continue;
  }

  if (!matchups[playerCharacter]) {
    matchups[playerCharacter] = {};
  }
  if (!matchups[playerCharacter][opponentCharacter]) {
    matchups[playerCharacter][opponentCharacter] = {
      games: 0,
      wins: 0,
      totalSeconds: 0,
    };
  }
  matchups[playerCharacter][opponentCharacter].games++;
  if (result.total_wins) matchups[playerCharacter][opponentCharacter].wins++;
  matchups[playerCharacter][opponentCharacter].totalSeconds += result.game_seconds;



  } catch (err) {
    console.error("Error parsing replay:", file, err.message);
  }

  if (win) {
    win.webContents.send("progress-update", {
      processed: i + 1,
      total: files.length,
    });
  }
}

cancelRequested = false;

  writeCache(cacheFilePath, cache, {
    userPlayerArg: wantedPlayersLower.join(",")
  });

  cancelRequested = false;

  if (!total_games) {
    return {
      foundGames: false,
      message: "No games found matching requested parameters.",
      filters: {
        playerTags,
        opponentTags,
        playerCharacter,
        opponentCharacter,
        ignoredOpponents
      },
      summary: {
        totalGames: 0,
        totalWins: 0,
        winRate: 0,
        analyzedTime: "00:00:00",
        totalTimeAllReplays: secondsToHMS(total_seconds || 0),
        new_replays
      },
      stages: [],
      nicknames: [],
      codes: [],
      opponents: [],
      matchups: []
    };
  }

  const win_rate = total_games
    ? ((total_wins / total_games) * 100).toFixed(2)
    : "0.00";

  const stageResults = [];

  for (const [stageName, games] of Object.entries(stage_totals)) {
    const wins = stage_wins[stageName] || 0;
    const playtime = stage_playtime[stageName] || 0;
    const winrateForStage = games
      ? ((wins / games) * 100).toFixed(2)
      : "0.00";

    stageResults.push({
      stage: stageName,
      wins,
      games,
      winrate: winrateForStage,
      playtime: secondsToHMS(playtime),
    });
  }

  stageResults.sort((a, b) => b.games - a.games);

  const sortedStageResults = {};
  for (const row of stageResults) {
    sortedStageResults[row.stage] = {
      games: row.games,
      wins: row.wins,
      winrate: row.winrate,
      playtime: row.playtime,
    };
  }

  const nickname_results = Object.keys(nickname_totals).map(name => {
    const games = nickname_totals[name] || 0;
    const wins = nickname_wins[name] || 0;
    const play = nickname_playtime[name] || 0;
    const nr = games ? ((wins / games) * 100).toFixed(2) : "0.00";
    return {
      nickname: name,
      games,
      wins,
      winrate: nr,
      playtime: secondsToHMS(play)
    };
  });

  const code_results = Object.keys(code_totals).map(code => {
    const games = code_totals[code] || 0;
    const wins = code_wins[code] || 0;
    const play = code_playtime[code] || 0;
    const cr = games
      ? ((wins / games) * 100).toFixed(2)
      : "0.00";
    return {
      code,
      games,
      wins,
      winrate: cr,
      playtime: secondsToHMS(play)
    };
  });

  const opponent_results = Object.keys(opponent_totals).map(code => {
    const games = opponent_totals[code] || 0;
    const wins = opponent_wins[code] || 0;
    const play = opponent_playtime[code] || 0;
    const orr = games
      ? ((wins / games) * 100).toFixed(2)
      : "0.00";
    return {
      opponentCode: code,
      games,
      wins,
      winrate: orr,
      playtime: secondsToHMS(play)
    };
  });

  opponent_results.sort((a, b) => b.games - a.games);

  const matchup_results = [];
  for (let pChar = 0; pChar < character_head_to_head.length; pChar++) {
    for (let oChar = 0; oChar < character_head_to_head[pChar].length; oChar++) {
      const cell = character_head_to_head[pChar][oChar];
      const wins = cell[0];
      const games = cell[1];
      const oppCharName = cell[2];
      if (games > 0) {
        const wr = ((wins / games) * 100).toFixed(2);
        matchup_results.push({
          yourCharacter: characters[pChar],
          opponentCharacter: oppCharName,
          games,
          wins,
          winrate: wr
        });
      }
    }
  }

  matchup_results.sort((a, b) => b.games - a.games);

  const resultObject = {
    foundGames: true,
    filters: {
      playerTags,
      opponentTags,
      playerCharacter,
      opponentCharacter,
      ignoredOpponents
    },
    identity: {
      playerName: final_player_name,
      playerCode: real_player_code,
      opponentName: final_opponent_name,
      opponentCode: real_opponent_code
    },
    summary: {
      totalGames: total_games,
      totalWins: total_wins,
      winRate: win_rate,
      analyzedTime: secondsToHMS(counted_seconds),
      totalTimeAllReplays: secondsToHMS(total_seconds),
      newReplaysCached: new_replays,
      totalReplaysScanned: files.length,
      skippedReplays: skippedCount
    },
    stages: sortedStageResults,
    nicknames: nickname_results,
    codes: code_results,
    opponents: opponent_results,
    matchups: matchups || matchup_results
  };

  return resultObject;
}

module.exports = {
  analyzeReplays,
  cancelAnalysis
};
