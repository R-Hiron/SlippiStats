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
  const [character, setCharacter] = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ processed: 0, total: 0 });
  const [matchLogs, setMatchLogs] = useState([]);
  const [rankedOnly, setRankedOnly] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);

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
      setUpdateAvailable(true);
    });
    window.api.update.onDownloaded(() => {
      setUpdateReady(true);
    });
  }, []);

  React.useEffect(() => {
    const unsub = window.api.onMatchLog((msg) => {
      setMatchLogs((prev) => [msg, ...prev].slice(0, 50)); // keep last 50
    });
    return unsub;
  }, []);

  const analyze = async () => {
    if (!folder || !tag) {
      alert("Please select a folder and enter your tag first.");
      return;
    }

    setLoading(true);
    setResults(null);

    const options = {
      playerTags: [tag],
      opponentTags: [],
      ignoredOpponents: [],
      playerCharacter: character || null,
      opponentCharacter: null,
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

  return (
    <div className="container">
    <div style={{ padding: "2rem", fontFamily: "sans-serif", maxWidth: 800 }}>
      {updateAvailable && (
        <div style={{ background: "#ffcc00", padding: "1rem", marginBottom: "1rem" }}>
          A new update is downloading...
        </div>
      )}

      {updateReady && (
        <div style={{ background: "#4ade80", padding: "1rem", marginBottom: "1rem" }}>
          Update ready!  
          <button
            style={{ marginLeft: "1rem" }}
            onClick={() => window.api.update.quitAndInstall()}
          >
            Restart & Install
          </button>
        </div>
      )}

      <h1>Slippi Stats Desktop</h1>

      <button onClick={selectFolder}>Select Replay Folder</button>
      <p>
        <strong>Selected Folder:</strong>{" "}
        {folder || <span style={{ color: "#888" }}>None selected</span>}
      </p>

      <input
        placeholder="Enter Player Tag (e.g. RILY#420)"
        value={tag}
        onChange={(e) => setTag(e.target.value)}
        style={{ display: "block", margin: "0.5rem 0", width: "100%" }}
      />
      <input id="rankedOnly" type="checkbox" checked={rankedOnly} onChange={(e) => setRankedOnly(e.target.checked)} />
      <label htmlFor="rankedOnly">Ranked Only</label>


      <input
        placeholder="Character (optional)"
        value={character}
        onChange={(e) => setCharacter(e.target.value)}
        style={{ display: "block", marginBottom: "1rem", width: "100%" }}
      />
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
                      rate >= 60
                        ? "winrate-good"
                        : rate < 40
                        ? "winrate-bad"
                        : "winrate-neutral";
                    return (
                      <tr key={opp}>
                        <td>{opp}</td>
                        <td>{data.games}</td>
                        <td>{data.wins}</td>
                        <td className={color}>{rate}%</td>
                      </tr>
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

          <div className="card">
            <h3>L-Cancel Rate</h3>
            <p>{results.misc.avgLcancelRate}</p>
            <h5>Succeeded / Failed L-Cancels</h5>
            <h4>{results.misc.lCancelSuccessTotal} / {results.misc.lCancelFailTotal}</h4>
          </div>

          <div className="card">
            <h3>Total Wavedashes</h3>
            <p>{results.misc.wavedashTotal}</p>
            <h5>Average per Game</h5>
            <h4>{results.misc.avgWavedashes}</h4>
          </div>

          <div className="card">
            <h3>Total Rolls</h3>
            <p>{results.misc.rollTotal}</p>
            <h5>Average per Game</h5>
            <h4>{results.misc.avgRolls}</h4>
          </div>

          <div className="card">
            <h3>Ledge Grabs</h3>
            <p>{results.misc.ledgegrabTotal}</p>
            <h5>Average per Game</h5>
            <h4>{results.misc.avgLedgegrabs}</h4>
          </div>

          <div className="card">
            <h3>Dash Dances</h3>
            <p>{results.misc.dashDanceTotal}</p>
            <h5>Average per Game</h5>
            <h4>{results.misc.avgDashDances}</h4>
          </div>

          <div className="card">
            <h3>Tech Success Rate</h3>
            <p>{results.misc.techSuccessRate}</p>
            <h5>Succeeded / Failed L-Cancels</h5>
            <h4>{results.misc.techSuccessTotal} / {results.misc.techFailTotal}</h4>
          </div>

          <div className="card">
            <h3>Stocks Taken / Lost</h3>
            <p>{results.misc.totalStocksTaken} / {results.misc.totalStocksLost}</p>
          </div>

          <div className="card">
            <h3>Most Used Throw</h3>
            <p>{results.misc.topThrowDir.toUpperCase()} – {results.misc.topThrowCount}</p>
          </div>

          <div className="card">
            <h3>Best Win Streak</h3>
            <p>{results.misc.bestWinStreak}</p>
          </div>

        </div>

      </div>
    )}
  </div>
);

}

createRoot(document.getElementById("root")).render(<App />);
