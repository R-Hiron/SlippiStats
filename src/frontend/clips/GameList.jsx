import React from "react";
import { stageBackgroundSrc, stockIconSrc } from "./clipSettings";

function PlayerPill({ player, theme, side }) {
  return (
    <div className={`game-player-pill game-player-${side}`}>
      {player.isWinner && <span className="game-crown" title="Winner">👑</span>}
      <img
        className="game-stock-icon"
        src={stockIconSrc(player.characterName, theme)}
        alt={player.characterName}
        onError={(e) => {
          e.currentTarget.src = "./StockIcons/Placeholder.png";
        }}
      />
      <div className="game-player-text">
        <span className="game-player-name">{player.displayName}</span>
        {player.connectCode ? (
          <span className="game-player-code">{player.connectCode}</span>
        ) : null}
      </div>
    </div>
  );
}

export default function GameList({
  games,
  loading,
  listProgress,
  theme,
  onView,
  onClip,
}) {
  if (loading) {
    return (
      <div className="clip-loading">
        <div className="spinner" />
        <p>
          Loading games
          {listProgress.total > 0
            ? ` ${listProgress.processed} / ${listProgress.total}`
            : "..."}
        </p>
      </div>
    );
  }

  if (!games.length) {
    return (
      <div className="clip-empty">
        <p>No replays found in this folder.</p>
      </div>
    );
  }

  return (
    <div className="game-list">
      {games.map((game) => (
        <article
          key={game.file}
          className="game-card"
          style={{
            backgroundImage: `linear-gradient(90deg, rgba(0,0,0,0.72), rgba(0,0,0,0.45)), url("${stageBackgroundSrc(game.stageSlug)}")`,
          }}
        >
          <div className="game-card-main">
            <div className="game-matchup">
              <PlayerPill player={game.players[0]} theme={theme} side="p1" />
              <span className="game-vs">vs</span>
              <PlayerPill player={game.players[1]} theme={theme} side="p2" />
            </div>

            <div className="game-meta">
              <span>{game.dateLabel || "Unknown date"}</span>
              <span>{game.durationLabel}</span>
              <span>{game.stageName}</span>
            </div>
          </div>

          <div className="game-card-side">
            <div className="game-actions">
              <button type="button" className="btn-secondary" onClick={() => onView(game)}>
                View
              </button>
              <button type="button" onClick={() => onClip(game)}>
                Clip
              </button>
            </div>
            <div className="game-filename" title={game.fileName}>
              {game.fileName}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
