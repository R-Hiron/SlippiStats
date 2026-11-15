import React, { useEffect, useMemo, useState } from "react";
import {
  secondsToTimestamp,
  timestampToSeconds,
} from "./clipSettings";

export default function ClipEditor({ game, clipPaths, onBack }) {
  const maxSeconds = Math.max(1, game.durationSeconds || 1);
  const [startSec, setStartSec] = useState(0);
  const [endSec, setEndSec] = useState(Math.min(10, maxSeconds));
  const [includeAudio, setIncludeAudio] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [outputPath, setOutputPath] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const unsub = window.api.onClipProgress((data) => {
      if (data?.message) setStatus(data.message);
      if (data?.outputPath) setOutputPath(data.outputPath);
    });
    return typeof unsub === "function" ? unsub : undefined;
  }, []);

  const startStamp = useMemo(() => secondsToTimestamp(startSec), [startSec]);
  const endStamp = useMemo(() => secondsToTimestamp(endSec), [endSec]);

  const setStartFromInput = (value) => {
    const sec = Math.min(Math.max(0, timestampToSeconds(value)), maxSeconds - 0.1);
    setStartSec(sec);
    if (sec >= endSec) setEndSec(Math.min(maxSeconds, sec + 1));
  };

  const setEndFromInput = (value) => {
    const sec = Math.min(Math.max(0.1, timestampToSeconds(value)), maxSeconds);
    setEndSec(sec);
    if (sec <= startSec) setStartSec(Math.max(0, sec - 1));
  };

  const onStartSlider = (value) => {
    const sec = Number(value);
    setStartSec(sec);
    if (sec >= endSec) setEndSec(Math.min(maxSeconds, sec + 0.5));
  };

  const onEndSlider = (value) => {
    const sec = Number(value);
    setEndSec(sec);
    if (sec <= startSec) setStartSec(Math.max(0, sec - 0.5));
  };

  const payload = () => ({
    replayPath: game.file,
    startTime: startStamp,
    endTime: endStamp,
    includeAudio,
    config: clipPaths,
  });

  const preview = async () => {
    setError("");
    setBusy(true);
    setStatus("Starting preview...");
    try {
      const res = await window.api.previewClip(payload());
      if (res?.error) setError(res.error);
      else setStatus("Dolphin preview launched for the selected range.");
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  const exportClip = async () => {
    setError("");
    setOutputPath("");
    setBusy(true);
    setStatus("Exporting clip...");
    try {
      const res = await window.api.exportClip(payload());
      if (res?.error) {
        setError(res.error);
        setStatus("");
      } else {
        setOutputPath(res.outputPath || "");
        setStatus("Clip exported successfully.");
      }
    } catch (err) {
      setError(err.message || String(err));
      setStatus("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="clip-editor">
      <div className="clip-panel-header">
        <button type="button" className="btn-secondary" onClick={onBack} disabled={busy}>
          ← Back to list
        </button>
        <div className="clip-editor-title">
          <strong>Clip</strong>
          <span className="text-muted">{game.fileName}</span>
        </div>
      </div>

      <div className="clip-editor-card">
        <div className="clip-time-inputs">
          <label>
            Start
            <input
              type="text"
              value={startStamp}
              onChange={(e) => setStartFromInput(e.target.value)}
              disabled={busy}
            />
          </label>
          <label>
            End
            <input
              type="text"
              value={endStamp}
              onChange={(e) => setEndFromInput(e.target.value)}
              disabled={busy}
            />
          </label>
          <label className="clip-audio-toggle">
            <input
              type="checkbox"
              checked={includeAudio}
              onChange={(e) => setIncludeAudio(e.target.checked)}
              disabled={busy}
            />
            Include audio
          </label>
        </div>

        <div className="clip-timeline">
          <div className="clip-timeline-track">
            <div
              className="clip-timeline-range"
              style={{
                left: `${(startSec / maxSeconds) * 100}%`,
                width: `${((endSec - startSec) / maxSeconds) * 100}%`,
              }}
            />
          </div>
          <label>
            Start marker
            <input
              type="range"
              min={0}
              max={maxSeconds}
              step={0.1}
              value={startSec}
              onChange={(e) => onStartSlider(e.target.value)}
              disabled={busy}
            />
          </label>
          <label>
            End marker
            <input
              type="range"
              min={0}
              max={maxSeconds}
              step={0.1}
              value={endSec}
              onChange={(e) => onEndSlider(e.target.value)}
              disabled={busy}
            />
          </label>
          <div className="clip-timeline-labels">
            <span>0:00</span>
            <span>
              Selection {secondsToTimestamp(endSec - startSec)} · Game{" "}
              {secondsToTimestamp(maxSeconds)}
            </span>
          </div>
        </div>

        <div className="clip-editor-actions">
          <button type="button" className="btn-secondary" onClick={preview} disabled={busy}>
            Preview range in Dolphin
          </button>
          <button type="button" onClick={exportClip} disabled={busy}>
            {busy ? "Working..." : "Export MP4"}
          </button>
        </div>

        {status && <p className="clip-status">{status}</p>}
        {outputPath && (
          <p className="clip-output">
            Saved to: <code>{outputPath}</code>
          </p>
        )}
        {error && <p className="clip-error">{error}</p>}
      </div>
    </div>
  );
}
