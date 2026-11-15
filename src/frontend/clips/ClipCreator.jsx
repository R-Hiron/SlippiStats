import React, { useEffect, useRef, useState } from "react";
import ClipSetup from "./ClipSetup";
import GameList from "./GameList";
import GameView from "./GameView";
import ClipEditor from "./ClipEditor";
import { clipPathsConfigured, saveClipPaths } from "./clipSettings";

function applyPlayerTagToGames(games, playerTag) {
  const wanted = String(playerTag || "").trim().toLowerCase();
  return (games || []).map((game) => {
    const players = (game.players || []).map((p) => {
      const name = String(p.displayName || "").toLowerCase();
      const code = String(p.connectCode || "").toLowerCase();
      const isYou = Boolean(wanted) && (name.includes(wanted) || code.includes(wanted));
      return { ...p, isYou };
    });
    let youIndex = null;
    if (players[0]?.isYou && !players[1]?.isYou) youIndex = 0;
    else if (players[1]?.isYou && !players[0]?.isYou) youIndex = 1;
    return { ...game, players, youIndex };
  });
}

export default function ClipCreator({
  folder,
  playerTag,
  theme,
  clipPaths,
  setClipPaths,
  forceSetup,
  onSetupComplete,
}) {
  const [panel, setPanel] = useState("list"); // list | view | clip | setup
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(false);
  const [listProgress, setListProgress] = useState({ processed: 0, total: 0 });
  const [selectedGame, setSelectedGame] = useState(null);
  const [listError, setListError] = useState("");
  const [reloadToken, setReloadToken] = useState(0);

  const cachedFolderRef = useRef("");
  const rawGamesRef = useRef([]);
  const loadIdRef = useRef(0);
  const forceReloadRef = useRef(false);

  const needsSetup = forceSetup || !clipPathsConfigured(clipPaths);

  useEffect(() => {
    if (needsSetup) setPanel("setup");
  }, [needsSetup]);

  useEffect(() => {
    const unsub = window.api.onClipListProgress((data) => {
      setListProgress(data || { processed: 0, total: 0 });
    });
    return typeof unsub === "function" ? unsub : undefined;
  }, []);

  // Re-tag cached games when player tag changes (no rescan).
  useEffect(() => {
    if (!rawGamesRef.current.length) return;
    if (cachedFolderRef.current !== folder) return;
    setGames(applyPlayerTagToGames(rawGamesRef.current, playerTag));
  }, [playerTag, folder]);

  useEffect(() => {
    if (needsSetup || !folder) return;

    const folderChanged = cachedFolderRef.current !== folder;
    const forceReload = forceReloadRef.current;
    forceReloadRef.current = false;
    const hasCache = rawGamesRef.current.length > 0 && !folderChanged;

    // Use in-memory cache when returning to clips for the same folder.
    if (hasCache && !forceReload) {
      setGames(applyPlayerTagToGames(rawGamesRef.current, playerTag));
      setLoading(false);
      setListError("");
      return;
    }

    const loadId = ++loadIdRef.current;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setListError("");
      setListProgress({ processed: 0, total: 0 });
      const res = await window.api.listClipGames(folder, playerTag);
      if (cancelled || loadId !== loadIdRef.current) return;

      if (res?.error) {
        setListError(res.error);
        rawGamesRef.current = [];
        cachedFolderRef.current = "";
        setGames([]);
      } else {
        const nextGames = res.games || [];
        rawGamesRef.current = nextGames;
        cachedFolderRef.current = folder;
        setGames(applyPlayerTagToGames(nextGames, playerTag));
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [folder, needsSetup, reloadToken]);

  const finishSetup = () => {
    if (!clipPathsConfigured(clipPaths)) {
      alert("Please set all Clip Creator paths before continuing.");
      return;
    }
    saveClipPaths(clipPaths);
    onSetupComplete?.();
    setPanel("list");
  };

  const refreshGames = () => {
    forceReloadRef.current = true;
    setReloadToken((n) => n + 1);
  };

  if (panel === "setup" || needsSetup) {
    return (
      <ClipSetup
        clipPaths={clipPaths}
        setClipPaths={setClipPaths}
        onContinue={finishSetup}
      />
    );
  }

  if (panel === "view" && selectedGame) {
    return (
      <GameView
        game={selectedGame}
        playerTag={playerTag}
        theme={theme}
        onBack={() => {
          setSelectedGame(null);
          setPanel("list");
        }}
        onClip={(g) => {
          setSelectedGame(g);
          setPanel("clip");
        }}
      />
    );
  }

  if (panel === "clip" && selectedGame) {
    return (
      <ClipEditor
        game={selectedGame}
        clipPaths={clipPaths}
        onBack={() => {
          setSelectedGame(null);
          setPanel("list");
        }}
      />
    );
  }

  return (
    <div className="clip-creator">
      <div className="clip-creator-header">
        <div>
          <h2>Clip Creator</h2>
          <p className="text-muted">
            Games from <code>{folder}</code>
            {games.length > 0 ? ` · ${games.length} loaded` : ""}
          </p>
        </div>
        <button
          type="button"
          className="btn-secondary"
          onClick={refreshGames}
          disabled={loading}
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {listError && <p className="clip-error">{listError}</p>}

      <GameList
        games={games}
        loading={loading}
        listProgress={listProgress}
        theme={theme}
        onView={(game) => {
          setSelectedGame(game);
          setPanel("view");
        }}
        onClip={(game) => {
          setSelectedGame(game);
          setPanel("clip");
        }}
      />
    </div>
  );
}
