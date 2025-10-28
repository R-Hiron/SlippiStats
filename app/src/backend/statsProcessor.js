// Core modules / deps
const fs = require("fs");
const path = require("path");
const glob = require("glob");
const crypto = require("crypto");
const { BrowserWindow } = require("electron");


// Slippi parser
const { SlippiGame } = require("@slippi/slippi-js");

// ----- Static reference data from original script -----

// Characters indexed by internal Slippi character ID
const characters = [
  "Captain Falcon", "Donkey Kong", "Fox", "Mr. Game & Watch", "Kirby", "Bowser", "Link", "Luigi", "Mario", "Marth", "Mewtwo", "Ness", "Peach", "Pikachu", "Ice Climbers", "Jigglypuff", "Samus", "Yoshi", "Zelda", "Sheik", "Falco", "Young Link", "Dr. Mario", "Roy", "Pichu", "Ganondorf", "Master Hand", "Male Wireframe", "Female Wireframe", "Giga Bowser", "Crazy Hand", "Sandbag", "Popo", "Unknown"
];

const characters_lowercase = characters.map(c => c.toLowerCase());

// Stages indexed by internal Slippi stage ID.
// (These indexes map to game.getSettings().stageId)
const stages = [
  null, null,
  "Fountain of Dreams", "Pokémon Stadium", "Princess Peach's Castle", "Kongo Jungle",
  "Brinstar", "Corneria", "Yoshi's Story", "Onett", "Mute City", "Rainbow Cruise",
  "Jungle Japes", "Great Bay", "Hyrule Temple", "Brinstar Depths",
  "Yoshi's Island", "Green Greens", "Fourside", "Mushroom Kingdom I",
  "Mushroom Kingdom II", null, "Venom", "Poké Floats", "Big Blue",
  "Icicle Mountain", "Icetop", "Flat Zone", "Dream Land N64",
  "Yoshi's Island N64", "Kongo Jungle N64", "Battlefield", "Final Destination"
];

let cancelRequested = false;

function cancelAnalysis() {
  cancelRequested = true;
}

// ------------------------------------------------------
// Utility
// ------------------------------------------------------

function secondsToHMS(seconds) {
  const format = val =>
    `0${Math.floor(val)}`.replace(/^0+(\d\d)/, "$1");
  const hours = seconds / 3600;
  const minutes = (seconds % 3600) / 60;
  return [hours, minutes, seconds % 60].map(format).join(":");
}

// Safely pull name/code info for a player slot.
// Returns { tagLower, displayName, connectCode }
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
    tagLower,            // array of lowercase forms we can match against
    displayName,         // pretty name
    connectCode          // e.g. ABCD#123
  };
}

// Check if ANY of the player's tags match ANY of the wanted values.
function matchesAnyTag(identity, wantedListLower) {
  if (!wantedListLower || wantedListLower.length === 0) return true; // no filter
  if (!identity.tagLower || identity.tagLower.length === 0) return false;

  // does any known tag (netplay name OR connect code) match any requested?
  return identity.tagLower.some(playerTag =>
    wantedListLower.some(req => playerTag.includes(req))
  );
}

// Check if this opponent is in ignored list
function isIgnoredOpponent(identity, ignoredLower) {
  if (!ignoredLower || ignoredLower.length === 0) return false;
  if (!identity.tagLower || identity.tagLower.length === 0) return false;

  return identity.tagLower.some(playerTag =>
    ignoredLower.some(ign => playerTag.includes(ign))
  );
}

// Convert a requested character string like "falco" into (num, properName)
function resolveCharacterFilter(requestedCharLower) {
  if (!requestedCharLower) return null;
  const idx = characters_lowercase.indexOf(requestedCharLower.toLowerCase());
  if (idx === -1) {
    return null; // invalid character request
  }
  return { num: idx, name: characters[idx] };
}

// Hash replay contents to use for caching so we don't rescan unchanged games
function hashReplayFile(filePath) {
  try {
    const buf = fs.readFileSync(filePath);
    const hash = crypto.createHash("md5").update(buf).digest("hex");
    return hash;
  } catch {
    return null;
  }
}

// Load / init cache from replay folder
function loadCache(cacheFilePath) {
  try {
    const raw = fs.readFileSync(cacheFilePath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.results) {
      return { results: {} };
    }
    return parsed;
  } catch {
    // No cache yet
    return { results: {} };
  }
}

// Write updated cache to disk
function writeCache(cacheFilePath, cacheObj, meta) {
  const data = {
    // optional meta
    statsVersion: meta?.statsVersion || "ui-port",
    slippiJsVersion: meta?.slippiJsVersion || "unknown",
    user_player_arg: meta?.userPlayerArg || "",
    results: cacheObj.results || {}
  };

  fs.writeFileSync(cacheFilePath, JSON.stringify(data));
}

// ------------------------------------------------------
// processSingleReplay
// This is the heart of per-game extraction. It's adapted from the
// original processGame() + loadGameData() steps, but returns structured data
// instead of printing logs.
// ------------------------------------------------------

function processSingleReplay({
  file,
  gameData,
  wantedPlayersLower,
  wantedOpponentLower,
  ignoredOpponentsLower,
  playerCharacterFilter,
  opponentCharacterFilter
}) {
  // We'll return a stat object describing this game OR null if ignored.
  // Final shape mirrors what your original processGame fed into processResults.
  const data = {};

  // if loadGameData failed in original, it would skip. We assume gameData
  // already handled reading SlippiGame and basic parse -> we'll do it inline
  try {
    const {
      settings,
      metadata,
      stats,
      latestFramePercents,
      total_seconds
    } = gameData;

    // Some very old (pre-July 2020) replays could have missing metadata.
    // If no metadata players, skip counting as a match, but DO count toward total_seconds in overall time.
    const playersMeta = metadata?.players || [];

    // Build identity info for both player slots
    const p0 = extractIdentity(playersMeta[0]);
    const p1 = extractIdentity(playersMeta[1]);

    if (!p0 || !p1 || !p0.displayName || !p1.displayName) {
      console.warn(`Skipping replay: missing player info in ${file}`);
      return null;
    }

    // We'll consider only 1v1 (just like original script ignoring doubles/unreadable weird stuff)
    // Original script implicitly assumed two players and skipped 2v2 logic.
    // If it’s not 2 valid players, we still count total time (for "total_seconds")
    // but we can't form matchup stats
    if (playersMeta.length < 2 || !settings.players || settings.players.length < 2) {
      return {
        total_seconds,
        game_seconds: 0 // won't add to counted_seconds since we can't analyze it
      };
    }

    // Determine which slot is "you" and which is "opponent"
    // The CLI tool allowed multiple self-tags and multiple opponent-tags.
    // We mimic that logic.

    // candidate: you are p0
    const p0MatchesYou = matchesAnyTag(p0, wantedPlayersLower);
    const p1MatchesYou = matchesAnyTag(p1, wantedPlayersLower);

    // candidate: opponent is p0 or p1
    const p0MatchesOppFilter = matchesAnyTag(p0, wantedOpponentLower);
    const p1MatchesOppFilter = matchesAnyTag(p1, wantedOpponentLower);

    // Pick a viewpoint. Priority:
    // - If we specified opponent filter, try to build (you vs them) using both filters.
    // - Else just treat "you" as whoever matched player list.
    let playerIndex = null;
    let opponentIndex = null;

    if (wantedOpponentLower && wantedOpponentLower.length > 0) {
      // We want a specific opponent
      if (p0MatchesYou && p1MatchesOppFilter) {
        playerIndex = 0;
        opponentIndex = 1;
      } else if (p1MatchesYou && p0MatchesOppFilter) {
        playerIndex = 1;
        opponentIndex = 0;
      } else {
        // Doesn't match requested pairing
        return {
          total_seconds,
          game_seconds: 0
        };
      }
    } else {
      // No specific opponent asked for, just match self.
      if (p0MatchesYou && !p1MatchesYou) {
        playerIndex = 0;
        opponentIndex = 1;
      } else if (p1MatchesYou && !p0MatchesYou) {
        playerIndex = 1;
        opponentIndex = 0;
      } else if (p0MatchesYou && p1MatchesYou) {
        // mirror match with two of your own tags? ambiguous.
        // We'll just pick p0 as player, p1 as opponent
        playerIndex = 0;
        opponentIndex = 1;
      } else {
        // neither slot belongs to requested player(s)
        return {
          total_seconds,
          game_seconds: 0
        };
      }
    }

    // If we got here, we have a viewpoint.
    const playerIdentity = playerIndex === 0 ? p0 : p1;
    const opponentIdentity = opponentIndex === 0 ? p0 : p1;

    // filter: ignored opponents list
    if (isIgnoredOpponent(opponentIdentity, ignoredOpponentsLower)) {
      return {
        total_seconds,
        game_seconds: 0
      };
    }

    // Grab character IDs
    const playerCharId = settings.players[playerIndex]?.characterId;
    const oppCharId = settings.players[opponentIndex]?.characterId;

    const playerCharName = characters[playerCharId] || "Unknown";
    const oppCharName = characters[oppCharId] || "Unknown";

    // character filters, same logic as original:
    // - If user requested "my character = falco", and this game I'm not Falco -> skip
    if (
      playerCharacterFilter &&
      playerCharacterFilter.num !== playerCharId
    ) {
      return {
        total_seconds,
        game_seconds: 0
      };
    }

    // - If user requested "their character = marth", and opponent isn't Marth -> skip
    if (
      opponentCharacterFilter &&
      opponentCharacterFilter.num !== oppCharId
    ) {
      return {
        total_seconds,
        game_seconds: 0
      };
    }

    // Determine game length and win/loss
    const latestPercPlayer = latestFramePercents[playerIndex];
    const latestPercOpp = latestFramePercents[opponentIndex];

    // Stock counts / KOs
    // Original logic:
    //   player_kills = stats[player_num]
    //   opponent_kills = stats[opponent_num]
    // It read from stats.overall[x].killCount.
    const playerKills = (stats?.overall?.[playerIndex]?.killCount) || 0;
    const opponentKills = (stats?.overall?.[opponentIndex]?.killCount) || 0;

    // Game seconds
    const game_seconds = Math.floor(total_seconds || 0);

    // Ignore short/no-kill games like the original:
    // if under 30 seconds -> skip
    if (game_seconds < 30) {
      return {
        total_seconds,
        game_seconds: 0
      };
    }
    // if both got 0 kills -> skip
    if (playerKills === 0 && opponentKills === 0) {
      return {
        total_seconds,
        game_seconds: 0
      };
    }

    // Win rules:
    // more kills OR equal kills but lower percent at end
    const moreKills = playerKills > opponentKills;
    const lowerPercent = (playerKills === opponentKills) && (latestPercPlayer < latestPercOpp);

    const didWin = moreKills || lowerPercent;

    // Stage ID
    let stageId = Number(settings?.stageId);
    if (isNaN(stageId) || stageId < 0 || stageId >= stages.length) {
      stageId = null;
    }
    const stageName = stageId !== null ? stages[stageId] || `Unknown (${stageId})` : "Unknown";


    // Fill data object that processResults() in the old script depended on
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
    // If replay can't be parsed, match original behavior:
    // count total_seconds if we got it from cached gameData,
    // but otherwise skip stats.
    return {
      total_seconds: gameData?.total_seconds || 0,
      game_seconds: 0
    };
  }
}


// ------------------------------------------------------
// Public main function: analyzeReplays
// ------------------------------------------------------

/**
 * analyzeReplays(folderPath, options)
 *
 * folderPath: string (root folder that contains .slp files, or has subfolders)
 *
 * options: {
 *   playerTags:          [ "rily#420", "rily" ]  // REQUIRED: you / your alts
 *   opponentTags:        [ "zimp#721" ]          // OPTIONAL
 *   ignoredOpponents:    [ "coach#000" ]         // OPTIONAL
 *   playerCharacter:     "falco"                 // OPTIONAL (your char filter, lowercase)
 *   opponentCharacter:   "marth"                 // OPTIONAL (opponent char filter, lowercase)
 * }
 *
 * Returns an object shaped for UI consumption.
 */
async function analyzeReplays(folderPath, options = {}) {
  // Normalize and sanitize inputs
  const {
    playerTags = [],           // required logically, but we won't hard crash
    opponentTags = [],
    ignoredOpponents = [],
    playerCharacter = null,
    opponentCharacter = null
  } = options;

  // Lowercase all filters for matching
  const wantedPlayersLower = playerTags.map(s => s.toLowerCase().trim()).filter(Boolean);
  const wantedOpponentLower = opponentTags.map(s => s.toLowerCase().trim()).filter(Boolean);
  const ignoredOpponentsLower = ignoredOpponents.map(s => s.toLowerCase().trim()).filter(Boolean);

  const playerCharacterFilter = resolveCharacterFilter(playerCharacter);
  const opponentCharacterFilter = resolveCharacterFilter(opponentCharacter);

  // Cache lives in the same folder as replays
  const cacheFilePath = path.join(folderPath, "replayCache.json");
  const cache = loadCache(cacheFilePath);

  // We gather stats across all games here, similar to the original top-level vars.
  let total_games = 0;
  let total_wins = 0;
  let total_seconds = 0;
  let counted_seconds = 0;

  // Arrays / maps to accumulate breakdowns
  // Keys are character IDs, stage IDs, etc.
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

  // A 2D matchup matrix: character_head_to_head[playerCharId][oppCharId] = [wins, games, oppCharName]
  const character_head_to_head = Array(34).fill().map(() =>
    Array(34).fill().map((_, i) => [0, 0, characters[i]])
  );

  // We'll also keep track of “last seen” names and codes to present summary info
  let final_player_name = "";
  let final_opponent_name = "";
  let real_player_code = "";
  let real_opponent_code = "";

  // Find all replays recursively under folderPath
  // (like original glob("**/*.slp"))
  // Normalize path and wrap in quotes to handle spaces
  // Find all replays recursively under folderPath
const normalizedPath = path.resolve(folderPath);
const pattern = `${normalizedPath.replace(/\\/g, "/")}/**/*.slp`;
const files = glob.sync(pattern, { nodir: true }).sort();

console.log(`Found ${files.length} replay files in`, normalizedPath);

let new_replays = 0;

// Reset cancel flag at start
cancelRequested = false;
let skippedCount = 0; // count replays we skip due to unreadable or invalid data

// Get the main window reference
const win = BrowserWindow.getAllWindows()[0];

// ---- main replay loop ----
for (let i = 0; i < files.length; i++) {
  // Check for cancel
  if (cancelRequested) {
    console.log("Analysis cancelled by user.");
    if (win) win.webContents.send("progress-update", { cancelled: true });
    break;
  }

  // Let Electron handle UI events so Cancel works instantly
  await new Promise((resolve) => setImmediate(resolve));

  const file = files[i];

  try {
    // --- your original replay reading logic ---
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

    // --- process one replay ---
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

    // Skip games with missing or invalid stage info
    if (
      result.stage_num === null ||
      result.stage_num === undefined ||
      isNaN(result.stage_num) ||
      !stages[result.stage_num]
    ) {
      skippedCount++;
      continue;
    }



    // --- accumulate results ---
    total_games += result.total_games || 0;
    total_wins += result.total_wins || 0;
    total_seconds += result.total_seconds || 0;
    counted_seconds += result.game_seconds || 0;


  // ===== Aggregate per-stage stats using readable names =====
  const stageId = result.stage_num;

  // If stageId is invalid, count it as skipped instead of "Unknown"
  if (
    stageId === null ||
    stageId === undefined ||
    isNaN(stageId) ||
    !stages[stageId]
  ) {
    skippedCount++;
    return; // skip this replay
  }

  const stageName = stages[stageId];

  // Initialize if not present
  if (!stage_totals[stageName]) stage_totals[stageName] = 0;
  if (!stage_wins[stageName]) stage_wins[stageName] = 0;
  if (!stage_playtime[stageName]) stage_playtime[stageName] = 0;

  // Update counts
  stage_totals[stageName]++;
  if (result.total_wins) stage_wins[stageName]++;
  stage_playtime[stageName] += result.game_seconds || 0;


  // ===== Aggregate matchups (grouped by your character) =====
  if (!matchups) var matchups = {}; // initialize if not yet defined
  const playerCharacter = result.player_character_name;
  const opponentCharacter = result.opponent_character_name;

  // Skip adding invalid or undefined characters
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

  // --- send progress update ---
  if (win) {
    win.webContents.send("progress-update", {
      processed: i + 1,
      total: files.length,
    });
  }
}

// Reset cancel flag after loop ends
cancelRequested = false;


  // After loop, update cache file on disk
  writeCache(cacheFilePath, cache, {
    userPlayerArg: wantedPlayersLower.join(",")
  });

  cancelRequested = false;

  // If we literally had no valid games, return an object that UI can handle
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

  // Compute high-level winrate
  const win_rate = total_games
    ? ((total_wins / total_games) * 100).toFixed(2)
    : "0.00";

  // Build stage results (now keyed by readable stage name, not numeric ID)
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



  // sort by games played (desc)
  stageResults.sort((a, b) => b.games - a.games);

  // convert to an object keyed by stage name
  const sortedStageResults = {};
  for (const row of stageResults) {
    sortedStageResults[row.stage] = {
      games: row.games,
      wins: row.wins,
      winrate: row.winrate,
      playtime: row.playtime,
    };
  }


  // nickname stats (your aliases)
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

  // connect code stats (your connect codes)
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

  // opponent stats (by their code)
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
  // You could sort opponent_results by games or by winrate if you want to rank
  opponent_results.sort((a, b) => b.games - a.games);

  // matchup matrix → flatten meaningful pairs
  // We only care about cells where games > 0
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
  // Sort by games desc so most common matchups show first
  matchup_results.sort((a, b) => b.games - a.games);

  // Build final object for UI
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

// Expose the function so Electron's main process can call it
module.exports = {
  analyzeReplays,
  cancelAnalysis
};
