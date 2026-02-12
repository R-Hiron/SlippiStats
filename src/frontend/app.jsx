console.log("🌈 [RENDERER] app.jsx loaded at", new Date().toISOString());

import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import "./app.css";

function formatPlaytime(hms) {
  if (!hms) return "0s";
  const parts = hms.split(":").map(Number);
  if (parts.length !== 3) return hms;

  const [h, m, s] = parts;
  let out = "";
  if (h > 0) out += `${h}h `;
  if (m > 0 || h > 0) out += `${m}m `;
  out += `${s}s`;
  return out.trim();
}


function App() {
  const [folder, setFolder] = useState(() => {
    return localStorage.getItem("replayFolder") || "";
  });
  const [tag, setTag] = useState(() => {
    return localStorage.getItem("playerTag") || "";
  });
  const [opponentTag, setOpponentTag] = useState("");
  const [charactersSelected, setCharactersSelected] = useState([]);
  const [opponentCharactersSelected, setOpponentCharactersSelected] = useState([]);
  const allCharacters = [
    "Fox","Falco","Marth","Sheik","Captain_Falcon","Jigglypuff","Peach","Pikachu",
    "Ice_Climbers","Samus","Yoshi","Luigi","Mario","Dr_Mario","Donkey_Kong",
    "Link","Zelda","Ganondorf","Young_Link","Mewtwo","Mr_Game_And_Watch","Roy",
    "Pichu","Kirby","Bowser","Ness"
  ];
  const defaultCustomTheme = {
    "--bg-dark": "#0f0f0f",
    "--bg-panel": "#181818",
    "--bg-card": "#222222",
    "--card-accent": "#3b82f6",
    "--text-main": "#ffffff",
    "--text-muted": "#a0a0a0",
    "--accent": "#3b82f6",
    "--accent-hover": "#2563eb",
    "--good": "#22c55e",
    "--bad": "#ef4444"};
  const CUSTOM_KEYS = [
    "--bg-dark",
    "--bg-panel",
    "--bg-card",
    "--card-accent",
    "--text-main",
    "--text-muted",
    "--accent",
    "--accent-hover",
    "--good",
    "--bad",
  ];
  const [customTheme, setCustomTheme] = useState(JSON.parse(localStorage.getItem("customThemeTokens")) || defaultCustomTheme);
  const [miscStatToggles, setMiscStatToggles] = useState(
    JSON.parse(localStorage.getItem("miscStatToggles")) || {
      lcancels: true,
      wavedashes: true,
      rolls: true,
      ledgeGrabs: true,
      dashDances: true,
      techs: true,
      stocks: true,
      throws: true,
      streaks: true
    }
  );
  const getStockIcon = (characterName, theme) => {
    if (characterName === "Luigi" && theme === "Sandon05") return "Luigi_White.png";
    return `${characterName}.png`;};
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ processed: 0, total: 0 });
  const [matchLogs, setMatchLogs] = useState([]);
  const [rankedOnly, setRankedOnly] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  const [updateMessage, setUpdateMessage] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [theme, setTheme] = useState(localStorage.getItem("theme") || "dark");
  const [openMatchupRows, setOpenMatchupRows] = useState(() => new Set());
  const [sandonUnlocked, setSandonUnlocked] = useState(localStorage.getItem("sandonUnlocked") === "1");
  const playerTagRef = React.useRef(null);
  const selectFolder = async () => {
    const selected = await window.api.selectFolder();
    if (selected) setFolder(selected);
  };

  React.useEffect(() => {
    const unsubscribe = window.api.onProgress((data) => {
      setProgress(data);
    });
    return unsubscribe;
  }, []);

  React.useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  React.useEffect(() => {
    if (tag) {
      localStorage.setItem("playerTag", tag);
    }
  }, [tag]);
  React.useEffect(() => {
    if (folder) {
      localStorage.setItem("replayFolder", folder);
    }
  }, [folder]);

  React.useEffect(() => {
    window.api.update.onAvailable(() => {
      setUpdateMessage("A new update is downloading...");
      window.api.update.downloadUpdate();
      setUpdateAvailable(true);
    });
    window.api.update.onDownloaded(() => {
      setUpdateMessage("Update ready! Restarting...");
      setUpdateReady(true);
    });
  }, []);

  React.useEffect(() => {
    const unsub = window.api.onMatchLog((msg) => {
      setMatchLogs((prev) => [msg, ...prev].slice(0, 50)); // keep last 50
    });
    return unsub;
  }, []);

  React.useEffect(() => {
    localStorage.setItem("miscStatToggles", JSON.stringify(miscStatToggles));
  }, [miscStatToggles]);

  React.useEffect(() => {
  const savedTheme = localStorage.getItem("theme") || "dark";
    if (savedTheme === "Sandon05" && !sandonUnlocked) {
      setTheme("dark");
      localStorage.setItem("theme", "dark");
    } else {
      setTheme(savedTheme);
    }
  }, [sandonUnlocked]);
  
  React.useEffect(() => {
    if (theme === "custom") {
      Object.entries(customTheme).forEach(([key, value]) => {
        document.documentElement.style.setProperty(key, value);
      });
      localStorage.setItem("customThemeTokens", JSON.stringify(customTheme));
    } else {
      // ✅ remove inline overrides so CSS themes can take over again
      CUSTOM_KEYS.forEach((key) => {
        document.documentElement.style.removeProperty(key);
      });
    }
  }, [theme, customTheme]); 

  function iconName(str) {
    return str
      .replace(/\./g, "")
      .replace(/&/g, "And")
      .trim()
      .replace(/\s+/g, "_");
  }
  function stockIconBaseName(name) {
    const base = iconName(name);

    if (theme === "Sandon05" && base === "Luigi") return "Luigi_White";

    return base;
  }

 
  function toggleMatchupRow(key) {
    setOpenMatchupRows(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const analyze = async () => {
    if (!folder || !tag) {
      alert("Please select a folder and enter your tag first.");
      return;
    }

    setLoading(true);
    setResults(null);

    const options = {
      playerTags: [tag],
      opponentTags: opponentTag ? [opponentTag] : [],
      ignoredOpponents: [],
      playerCharacter: charactersSelected.length > 0 ? charactersSelected : null,
      opponentCharacter: opponentCharactersSelected.length > 0 ? opponentCharactersSelected : null,
      rankedOnly,
    };
    try {
      const res = await window.api.analyzeReplays(folder, options);
      console.log("Analysis Results:", res);
      setResults(res);
    } catch (err) {
      console.error("Error analyzing replays:", err);
      alert("An error occurred during analysis. Check the console for details.");
    } finally {
      setLoading(false);
    }
  };

  window.api?.getVersion?.().then(v => {
    console.log("🌈 [RENDERER] Version from preload:", v);
  }).catch(err => {
    console.error("🌈 [RENDERER] Version call failed:", err);
  });

  function CharacterDropdown({ allCharacters, selected, setSelected }) {
    const [open, setOpen] = useState(false);

    const toggleChar = (c) => {
      if (selected.includes(c)) {
        setSelected(selected.filter(x => x !== c));
      } else {
        setSelected([...selected, c]);
      }
    };

    return (
      <div style={{ marginBottom: "1rem", position: "relative" }}>
        <div
          onClick={() => setOpen(!open)}
          style={{
            padding: "0.6rem",
            background: "var(--bg-panel)",
            borderRadius: 6,
            border: "1px solid #333",
            cursor: "pointer",
          }}
        >
          {selected.length === 0 ? "Filter by Character..." : `${selected.length} selected`}
        </div>

        {open && (
          <div
            style={{
              position: "absolute",
              top: "110%",
              left: 0,
              width: "100%",
              maxHeight: "200px",
              overflowY: "auto",
              background: "var(--bg-card)",
              border: "1px solid #444",
              borderRadius: 6,
              zIndex: 999,
            }}
          >
            {allCharacters.map((c) => (
              <div
                key={c}
                onClick={() => toggleChar(c)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "6px 8px",
                  cursor: "pointer",
                  background: selected.includes(c) ? "rgba(0,0,0,0.1)" : "transparent"
                }}
              >
                <img
                  src={`./StockIcons/${stockIconBaseName(c)}.png`}
                  style={{ width: 20, height: 20, marginRight: 8 }}
                />
                {c.replace(/_/g, " ")}
              </div>
            ))}
          </div>
        )}

        {/* Selected tags */}
        <div style={{ display: "flex", flexWrap: "wrap", marginTop: "8px", gap: "6px" }}>
          {selected.map((c) => (
            <div
              key={c}
              style={{
                display: "flex",
                alignItems: "center",
                background: "var(--accent)",
                padding: "4px 8px",
                borderRadius: 20,
                color: "white",
                fontSize: "0.85rem",
              }}
            >
              <img
                src={`./StockIcons/${stockIconBaseName(c)}.png`}
                style={{ width: 20, height: 20, marginRight: 8 }}
              />
              {c.replace(/_/g, " ")}
              <span
                onClick={() => setSelected(selected.filter(x => x !== c))}
                style={{
                  marginLeft: 6,
                  cursor: "pointer",
                  fontWeight: "bold",
                }}
              >
                ✕
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container">
    <div style={{ padding: "2rem", fontFamily: "sans-serif", maxWidth: 800 }}>
      {updateAvailable && (
        <div style={{ background: "#ffcc00", padding: "1rem", marginBottom: "1rem" }}>
          {updateMessage || "A new update is downloading..."}
        </div>
      )}

      {updateReady && (
        <div style={{ background: "#4ade80", padding: "1rem", marginBottom: "1rem" }}>
          {updateMessage || "Update ready!"}
          <button
            style={{ marginLeft: "1rem" }}
            onClick={() => window.api.update.install()}
          >
            Restart & Install
          </button>
        </div>
      )}

      <div
        style={{
          position: "fixed",
          top: "10px",
          right: "10px",
          background: "var(--bg-panel)",
          padding: "8px 12px",
          borderRadius: "6px",
          cursor: "pointer",
          userSelect: "none",
          zIndex: 1000,
        }}
        onClick={() => setSettingsOpen((prev) => !prev)}
      >
        ⚙️
      </div>

      {settingsOpen && (
        <div
          style={{
            position: "fixed",
            top: "60px",
            right: "10px",
            width: "320px",
            background: "var(--bg-panel)",
            border: "1px solid #333",
            borderRadius: "8px",
            padding: "1rem",
            zIndex: 999,
            boxShadow: "0 2px 10px rgba(0,0,0,0.4)",
            maxHeight: "70vh",
            overflowY: "auto",
            paddingRight: "0.75rem",
          }}
        >
          <h3 style={{ marginTop: 0 }}>Settings</h3>

          <label style={{ display: "block", marginBottom: "0.5rem" }}>
            Theme:
          </label>
          <select
            style={{
              width: "100%",
              padding: "0.5rem",
              borderRadius: "6px",
              background: "var(--bg-card)",
              color: "var(--text-main)",
              border: "1px solid #444",
            }}
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
          >
            <option value="dark">Dark</option>
            <option value="light">Light</option>
            <option value="slippi">Slippi Theme</option>
            <option value="custom">Custom</option>
            {sandonUnlocked && (
              <option value="Sandon05">Sandon05</option>
            )}
          </select>
          {theme === "custom" && (
            <div className="custom-theme-editor">
              <h3>Custom Theme Editor</h3>
              {Object.entries(customTheme).map(([key, value]) => (
                <div key={key} className="theme-row">
                  <label>{key}</label>
                  <input
                    type="color"
                    value={value}
                    onChange={(e) =>
                      setCustomTheme({
                        ...customTheme,
                        [key]: e.target.value
                      })
                    }
                  />
                  <input
                    type="text"
                    value={value}
                    onChange={(e) =>
                      setCustomTheme({
                        ...customTheme,
                        [key]: e.target.value
                      })
                    }
                  />
                </div>
              ))}
            </div>
          )}
          <div className="misc-toggle-section">
            <h3>Misc Stats</h3>
            {Object.keys(miscStatToggles).map((key) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={miscStatToggles[key]}
                  onChange={() =>
                    setMiscStatToggles({
                      ...miscStatToggles,
                      [key]: !miscStatToggles[key]
                    })
                  }
                />
                {key}
              </label>
            ))}
          </div>

        </div>
      )}


      <h1>Slippi Stats Desktop</h1>

      <button onClick={selectFolder}>Select Replay Folder</button>
      <p>
        <strong>Selected Folder:</strong>{" "}
        {folder || <span style={{ color: "#888" }}>None selected</span>}
      </p>

      <input
        placeholder="Enter Player Tag (e.g. GLTY#837)"
        ref={playerTagRef}
        value={tag}
        onChange={(e) => {
          const value = e.target.value;
          setTag(value);

          const normalized = value.trim().replace(/\s+/g, " ").toLowerCase();
          if (normalized === "i play yellow luigi") {
            localStorage.setItem("sandonUnlocked", "1");
            setSandonUnlocked(true);
            setTag("");
          }
        }}
        style={{ display: "block", margin: "0.5rem 0", width: "100%" }}
      />
      <CharacterDropdown
        allCharacters={allCharacters}
        selected={charactersSelected}
        setSelected={setCharactersSelected}
      />
      <input
        placeholder="Filter Opponent Tag (optional)"
        value={opponentTag}
        onChange={(e) => setOpponentTag(e.target.value)}
        style={{ display: "block", margin: "0.5rem 0", width: "100%" }}
      />
      <CharacterDropdown
        allCharacters={allCharacters}
        selected={opponentCharactersSelected}
        setSelected={setOpponentCharactersSelected}
      />
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        margin: "0.5rem 0"
      }}>
        <input
          id="rankedOnly"
          type="checkbox"
          checked={rankedOnly}
          onChange={(e) => setRankedOnly(e.target.checked)}
          style={{
            width: "18px",
            height: "18px",
            cursor: "pointer"
          }}
        />
        <label htmlFor="rankedOnly" style={{ cursor: "pointer" }}>
          Ranked Only
        </label>
      </div>
      <button onClick={analyze} disabled={loading}>
        {loading ? "Analyzing..." : "Analyze"}
      </button>
    </div>
    {loading && (
  <div className="overlay">
    <div className="spinner" />
    {progress.total > 0 && (
      <>
        <p style={{ marginBottom: "0.5rem" }}>
          Analyzing replays {progress.processed} / {progress.total}
        </p>
        <div style={{ 
            maxHeight: "180px",
            overflowY: "auto",
            fontSize: "0.9rem",
            marginBottom: "10px",
            paddingRight: "6px"
          }}>
            {matchLogs.map((log, i) => {
              const color = log.userWon ? "#4ade80" : "#f87171"; // green/red
              return (
                <div key={i} style={{ color, marginBottom: "4px" }}>
                  {log.p1} vs {log.p2} on {log.stage} – {log.userWon ? "Win" : "Loss"}
                </div>
              );
            })}
          </div>
        <div
          style={{
            width: "60%",
            maxWidth: 400,
            background: "#333",
            borderRadius: 8,
            overflow: "hidden",
            height: 16,
            marginBottom: "0.5rem",
          }}
        >
          <div
            style={{
              background: "#4a90e2",
              width: `${(progress.processed / progress.total) * 100}%`,
              height: "100%",
              transition: "width 0.2s ease",
            }}
          />
        </div>
        <p>{Math.round((progress.processed / progress.total) * 100)}%</p>
      </>
    )}
    {progress.total === 0 && <p>Analyzing replays...</p>}
    <button
    style={{
      marginTop: "1rem",
      background: "#f87171",
      border: "none",
      color: "white",
      padding: "0.6rem 1.2rem",
      borderRadius: 8,
      cursor: "pointer",
      fontWeight: 600,
    }}
    onClick={() => {
      window.api.cancelAnalysis();
      setLoading(false);
      setProgress({ processed: 0, total: 0 });
    }}>
    Cancel
  </button>
  </div>
)}
        {/* --- Results section --- */}
    {results && results.foundGames && (
      <div className="results">
        {/* --- Summary cards --- */}
        <div className="summary-cards">
          <div className="card">
            <h3>Total Games</h3>
            <p>{results.summary.totalGames}</p>
          </div>
          <div className="card">
            <h3>Total Wins</h3>
            <p>{results.summary.totalWins}</p>
          </div>
          <div className="card">
            <h3>Win Rate</h3>
            <p
              className={
                results.summary.winRate >= 60
                  ? "winrate-good"
                  : results.summary.winRate < 40
                  ? "winrate-bad"
                  : "winrate-neutral"
              }
            >
              {results.summary.winRate}%
            </p>
          </div>
          <div className="card">
            <h3>Total Playtime</h3>
            <p>{formatPlaytime(results.summary.totalTimeAllReplays)}</p>
          </div>
        </div>
        {results.summary.skippedReplays > 0 && (
              <p style={{ color: "#aaa", marginTop: "0.5rem" }}>
                {results.summary.skippedReplays} replays skipped due to missing or unreadable data.
              </p>
            )}

        {/* --- Top Stages --- */}
        <h2>Top Stages</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Stage</th>
              <th>Games</th>
              <th>Wins</th>
              <th>Winrate</th>
              <th>Playtime</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(results.stages || {}).map(([stage, data], i) => (
              <tr key={i}>
                <td>{stage}</td>
                <td>{data.games}</td>
                <td>{data.wins}</td>
                <td
                  className={
                    Math.round((data.wins / data.games) * 100) >= 60
                      ? "winrate-good"
                      : Math.round((data.wins / data.games) * 100) < 40
                      ? "winrate-bad"
                      : "winrate-neutral"
                  }
                >
                  {Math.round((data.wins / data.games) * 100)}%
                </td>
                <td>{formatPlaytime(data.playtime)}</td>
              </tr>
            ))}
          </tbody>
        </table>


        {/* --- Top Matchups --- */}
        <h2>Top Matchups</h2>
        {results.matchups && Object.keys(results.matchups).length > 0 ? (
          Object.entries(results.matchups).map(([char, opponents]) => (
            <details key={char} style={{ marginBottom: "1rem" }}>
              <summary>
                <img
                  src={`./StockIcons/${stockIconBaseName(char)}.png`}
                  style={{ width: 20, height: 20, marginRight: 8 }}
                />
                {char}
                {formatPlaytime(results.characterPlaytime?.[char]) && (
                  <span style={{ marginLeft: '0.5rem', color: '#ccc', fontWeight: 'normal' }}>
                    – {formatPlaytime(results.characterPlaytime[char])}
                  </span>
                )}
              </summary>
              <table className="table" style={{ marginTop: "0.5rem" }}>
                <thead>
                  <tr>
                    <th>Opponent</th>
                    <th>Games</th>
                    <th>Wins</th>
                    <th>Winrate</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(opponents).map(([opp, data]) => {
                    const rate = Math.round((data.wins / data.games) * 100);
                    const color =
                      rate >= 60 ? "winrate-good" : rate < 40 ? "winrate-bad" : "winrate-neutral";

                    const rowKey = `${char}::${opp}`;
                    const isOpen = openMatchupRows.has(rowKey);
                    const stagesObj = data.stages || {};
                    const stageRows = Object.entries(stagesObj)
                      .map(([stageName, s]) => {
                        const sr = s.games ? Math.round((s.wins / s.games) * 100) : 0;
                        return {
                          stageName,
                          games: s.games || 0,
                          wins: s.wins || 0,
                          winrate: sr,
                          totalSeconds: s.totalSeconds || 0,
                        };
                      })
                      .sort((a, b) => b.games - a.games);

                    return (
                      <React.Fragment key={rowKey}>
                        <tr
                          onClick={() => toggleMatchupRow(rowKey)}
                          style={{ cursor: "pointer" }}
                          title="Click to view stage breakdown"
                        >
                          <td>
                            <img
                              src={`./StockIcons/${stockIconBaseName(opp)}.png`}
                              style={{ width: 20, height: 20, marginRight: 8 }}
                            />
                            {opp}
                          </td>
                          <td>{data.games}</td>
                          <td>{data.wins}</td>
                          <td className={color}>{rate}%</td>
                        </tr>

                        {isOpen && (
                          <tr>
                            <td colSpan={4} style={{ padding: 0 }}>
                              <div style={{ padding: "0 0 1rem 0", background: "var(--bg-dark)" }}>

                                {stageRows.length === 0 ? (
                                  <div style={{ color: "var(--text-muted)" }}>
                                    No stage breakdown available (re-run analysis after updating backend).
                                  </div>
                                ) : (
                                  <table className="table stage-breakdown" style={{ marginLeft: "1rem", marginBottom: 0 }}>
                                    <thead>
                                      <tr>
                                        <th>Stage</th>
                                        <th>Games</th>
                                        <th>Wins</th>
                                        <th>Winrate</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {stageRows.map((s) => {
                                        const stageColor =
                                          s.winrate >= 60
                                            ? "winrate-good"
                                            : s.winrate < 40
                                            ? "winrate-bad"
                                            : "winrate-neutral";
                                        return (
                                          <tr key={s.stageName}>
                                            <td>{s.stageName}</td>
                                            <td>{s.games}</td>
                                            <td>{s.wins}</td>
                                            <td className={stageColor}>{s.winrate}%</td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </details>
          ))
        ) : (
          <p>No matchup data found.</p>
        )}
        {/* --- Misc. Stats --- */}
        <h2>Misc Stats</h2>
        <div className="summary-cards">

        {miscStatToggles.lcancels && (
          <div className="card">
            <h1 className="StatsHeaders">L-Cancels</h1>
            <h3>L-Cancel Rate</h3>
            <p>{results.misc.avgLcancelRate}</p>
            <h3>Succeeded / Failed L-Cancels</h3>
            <h5>{results.misc.lCancelSuccessTotal} / {results.misc.lCancelFailTotal}</h5>
          </div>
        )}

        {miscStatToggles.wavedashes && (
          <div className="card">
            <h1 className="StatsHeaders">Wavedashes</h1>
            <h3>Average per Game</h3>
            <p>{results.misc.avgWavedashes}</p>
            <h3>Total Wavedashes</h3>
            <h5>{results.misc.wavedashTotal}</h5>
          </div>
        )}

        {miscStatToggles.rolls && (
          <div className="card">
            <h1 className="StatsHeaders">Rolls</h1>
            <h3>Average per Game</h3>
            <p>{results.misc.avgRolls}</p>
            <h3>Total Rolls</h3>
            <h5>{results.misc.rollTotal}</h5>
          </div>
        )}

        {miscStatToggles.ledgeGrabs && (
          <div className="card">
            <h1 className="StatsHeaders">Ledge Grabs</h1>
            <h3>Average per Game</h3>
            <p>{results.misc.avgLedgegrabs}</p>
            <h3>Total Ledge Grabs</h3>
            <h5>{results.misc.ledgegrabTotal}</h5>
          </div>
        )}
        {miscStatToggles.dashDances && (
          <div className="card">
            <h1 className="StatsHeaders">Dash Dances</h1>
            <h3>Average per Game</h3>
            <p>{results.misc.avgDashDances}</p>
            <h3>Total Dash Dances</h3>
            <h5>{results.misc.dashDanceTotal}</h5>
          </div>
        )}
        {miscStatToggles.techs && (
          <div className="card">
            <h1 className="StatsHeaders">Techs</h1>
            <h3>Tech Success Rate</h3>
            <p>{results.misc.techSuccessRate}</p>
            <h3>Succeeded / Failed Techs</h3>
            <h5>{results.misc.techSuccessTotal} / {results.misc.techFailTotal}</h5>
          </div>
        )}
        {miscStatToggles.stocks && (
          <div className="card">
            <h1 className="StatsHeaders">Stocks</h1>
            <h3>Stocks Taken / Lost</h3>
            <p>{results.misc.totalStocksTaken} / {results.misc.totalStocksLost}</p>
          </div>
        )}
        {miscStatToggles.throws && (
          <div className="card">
            <h1 className="StatsHeaders">Throws</h1>
            <h3>Most Used Throw</h3>
            <p>{results.misc.topThrowDir.toUpperCase()} – {results.misc.topThrowCount}</p>
          </div>
        )}
        {miscStatToggles.streaks && (
          <div className="card">
            <h1 className="StatsHeaders">Streaks</h1>
            <h3>Best Win Streak</h3>
            <p>{results.misc.bestWinStreak}</p>
            <h3>Best Loss Streak</h3>
            <h5>{results.misc.bestLossStreak}</h5>
          </div>
        )}
        </div>

      </div>
    )}
  </div>
);

}

createRoot(document.getElementById("root")).render(<App />);
