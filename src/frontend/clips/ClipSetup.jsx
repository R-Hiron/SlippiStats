import React from "react";
import { CLIP_PATH_FIELDS } from "./clipSettings";

export default function ClipSetup({ clipPaths, setClipPaths, onContinue, onCancel }) {
  const pickPath = async (field) => {
    const selected = await window.api.selectPath({
      directory: field.directory,
      filters: field.filters,
      title: `Select ${field.label}`,
    });
    if (!selected) return;
    setClipPaths((prev) => ({ ...prev, [field.key]: selected }));
  };

  return (
    <div className="clip-setup">
      <h2>Set up Clip Creator</h2>
      <p className="clip-setup-blurb">
        Before clipping, point the app at your Slippi Dolphin playback build, Melee ISO,
        ffmpeg, dump folder, and where exported clips should go. You can change these
        anytime in Settings.
      </p>

      <div className="clip-path-fields">
        {CLIP_PATH_FIELDS.map((field) => (
          <div key={field.key} className="clip-path-row">
            <label>{field.label}</label>
            <div className="clip-path-controls">
              <input
                type="text"
                value={clipPaths[field.key] || ""}
                onChange={(e) =>
                  setClipPaths((prev) => ({ ...prev, [field.key]: e.target.value }))
                }
                placeholder={field.directory ? "Folder path..." : "File path..."}
              />
              <button type="button" onClick={() => pickPath(field)}>
                Browse
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="clip-setup-actions">
        {onCancel && (
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="button" onClick={onContinue}>
          Continue to Clip Creator
        </button>
      </div>
    </div>
  );
}
