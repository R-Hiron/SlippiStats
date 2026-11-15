import React, { useEffect, useState } from "react";
import { stockIconSrc } from "./clipSettings";

export default function GameView({ game, playerTag, theme, onBack, onClip }) {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      const res = await window.api.getGameSummary(game.file, playerTag);
      if (cancelled) return;
      if (res?.error) {
        setError(res.error);
        setSummary(null);
      } else {
        setSummary(res);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [game.file, playerTag]);

  return (
    <div className="game-view">
      <div className="clip-panel-header">
        <button type="button" className="btn-secondary" onClick={onBack}>
          ← Back to list
        </button>
        <button type="button" onClick={() => onClip(summary || game)}>
          Clip this game
        </button>
      </div>

      {loading && (
        <div className="clip-loading">
          <div className="spinner" />
          <p>Loading summary...</p>
        </div>
      )}

      {error && <p className="clip-error">{error}</p>}

      {summary && !loading && (
        <>
          <div className="game-view-hero">
            <div className="game-view-players">
              {summary.players.map((p) => (
                <div key={p.index} className="game-view-player">
                  <img
                    src={stockIconSrc(p.characterName, theme)}
                    alt={p.characterName}
                    onError={(e) => {
                      e.currentTarget.src = "./StockIcons/Placeholder.png";
                    }}
                  />
                  <div>
                    <strong>
                      {p.displayName}
                      {p.isWinner ? " 👑" : ""}
                      {p.isYou ? " (you)" : ""}
                    </strong>
                    <div className="text-muted">
                      {p.characterName}
                      {p.connectCode ? ` · ${p.connectCode}` : ""}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="game-view-meta">
              <div><span className="text-muted">Stage</span> {summary.stageName}</div>
              <div><span className="text-muted">Duration</span> {summary.durationLabel}</div>
              <div><span className="text-muted">Date</span> {summary.dateLabel || "—"}</div>
              <div><span className="text-muted">File</span> {summary.fileName}</div>
            </div>
          </div>

          <div className="game-view-stats">
            {summary.players.map((p, i) => {
              const o = summary.overall?.[i] || {};
              return (
                <div key={p.index} className="game-view-stat-card">
                  <h3>{p.displayName}</h3>
                  <div className="stat-grid">
                    <div><span>Kills</span><strong>{o.kills}</strong></div>
                    <div><span>Damage</span><strong>{o.damageDone}</strong></div>
                    <div><span>Openings / Kill</span><strong>{o.openingsPerKill}</strong></div>
                    <div><span>Neutral Wins</span><strong>{o.neutralWins}</strong></div>
                    <div><span>IPM</span><strong>{o.inputsPerMinute}</strong></div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
