export const DEFAULT_CLIP_PATHS = {
  dolphin_path: "",
  dolphin_ini_path: "",
  melee_iso_path: "",
  ffmpeg_path: "",
  dump_directory: "",
  output_directory: "",
};

export const CLIP_PATH_FIELDS = [
  {
    key: "dolphin_path",
    label: "Slippi Dolphin.exe",
    directory: false,
    filters: [{ name: "Executable", extensions: ["exe"] }],
  },
  {
    key: "dolphin_ini_path",
    label: "Dolphin.ini",
    directory: false,
    filters: [{ name: "INI", extensions: ["ini"] }],
  },
  {
    key: "melee_iso_path",
    label: "Melee ISO",
    directory: false,
    filters: [{ name: "ISO", extensions: ["iso"] }],
  },
  {
    key: "ffmpeg_path",
    label: "ffmpeg.exe",
    directory: false,
    filters: [{ name: "Executable", extensions: ["exe"] }],
  },
  {
    key: "dump_directory",
    label: "Dolphin Dump folder",
    directory: true,
  },
  {
    key: "output_directory",
    label: "Clip output folder",
    directory: true,
  },
];

export function loadClipPaths() {
  try {
    const raw = localStorage.getItem("clipPaths");
    if (!raw) return { ...DEFAULT_CLIP_PATHS };
    return { ...DEFAULT_CLIP_PATHS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_CLIP_PATHS };
  }
}

export function saveClipPaths(paths) {
  localStorage.setItem("clipPaths", JSON.stringify(paths));
}

export function clipPathsConfigured(paths) {
  return CLIP_PATH_FIELDS.every((field) => Boolean(paths?.[field.key]));
}

export function iconName(str) {
  return String(str || "")
    .replace(/\./g, "")
    .replace(/&/g, "And")
    .trim()
    .replace(/\s+/g, "_");
}

export function stockIconSrc(characterName, theme) {
  const base = iconName(characterName);
  if (theme === "Sandon05" && base === "Luigi") {
    return "./StockIcons/Luigi_White.png";
  }
  if (!base || base === "Unknown") return "./StockIcons/Placeholder.png";
  return `./StockIcons/${base}.png`;
}

export function stageBackgroundSrc(stageSlug) {
  return `./StageBackgrounds/${stageSlug || "unknown"}.svg`;
}

export function secondsToTimestamp(totalSeconds) {
  const s = Math.max(0, Number(totalSeconds) || 0);
  const mins = Math.floor(s / 60);
  const secs = Math.floor(s % 60);
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export function timestampToSeconds(timestamp) {
  const parts = String(timestamp || "").trim().split(":");
  if (parts.length !== 2) return 0;
  const mins = Number(parts[0]);
  const secs = Number(parts[1]);
  if (Number.isNaN(mins) || Number.isNaN(secs)) return 0;
  return mins * 60 + secs;
}
