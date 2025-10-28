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
              <summary style={{ fontWeight: "bold", cursor: "pointer" }}>
                {char}
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
      </div>
    )}
  </div>
);

}

createRoot(document.getElementById("root")).render(<App />);
