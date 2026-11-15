import React, { useEffect, useState } from "react";
import ClipSetup from "./ClipSetup";
import GameList from "./GameList";
import GameView from "./GameView";
import ClipEditor from "./ClipEditor";
import { clipPathsConfigured, saveClipPaths } from "./clipSettings";

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

  useEffect(() => {
    if (needsSetup || !folder) return;

    let cancelled = false;
    (async () => {
      setLoading(true);
      setListError("");
      setListProgress({ processed: 0, total: 0 });
      const res = await window.api.listClipGames(folder, playerTag);
      if (cancelled) return;
      if (res?.error) {
        setListError(res.error);
        setGames([]);
      } else {
        setGames(res.games || []);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [folder, playerTag, needsSetup]);

  const finishSetup = () => {
    if (!clipPathsConfigured(clipPaths)) {
      alert("Please set all Clip Creator paths before continuing.");
      return;
    }
    saveClipPaths(clipPaths);
    onSetupComplete?.();
    setPanel("list");
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
          </p>
        </div>
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
