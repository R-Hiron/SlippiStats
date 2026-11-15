const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { BrowserWindow } = require("electron");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sendProgress(message, extra = {}) {
  const win = BrowserWindow.getAllWindows()[0];
  if (win && !win.isDestroyed()) {
    win.webContents.send("clip-progress", { message, ...extra });
  }
}

function timestampToSeconds(timestamp) {
  const parts = String(timestamp).trim().split(":");
  if (parts.length !== 2) {
    throw new Error("Timestamp must use MM:SS format, for example 0:10 or 1:25.500");
  }
  const minutes = Number(parts[0]);
  const seconds = Number(parts[1]);
  if (Number.isNaN(minutes) || Number.isNaN(seconds)) {
    throw new Error("Invalid timestamp values");
  }
  return minutes * 60 + seconds;
}

function timestampToSlippiFrame(timestamp) {
  return -123 + Math.round(timestampToSeconds(timestamp) * 60);
}

function getClipDuration(startTime, endTime) {
  const duration = timestampToSeconds(endTime) - timestampToSeconds(startTime);
  if (duration <= 0) {
    throw new Error("End time must be after start time");
  }
  return duration;
}

function secondsToClock(totalSeconds) {
  const s = Math.max(0, Number(totalSeconds) || 0);
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  const whole = Math.floor(secs);
  const frac = secs - whole;
  if (frac > 0.001) {
    return `${mins}:${String(secs.toFixed(3)).padStart(6, "0")}`;
  }
  return `${mins}:${String(whole).padStart(2, "0")}`;
}

function clearDumpFiles(dumpDirectory) {
  const files = [
    path.join(dumpDirectory, "Frames", "framedump0.avi"),
    path.join(dumpDirectory, "Audio", "dspdump.wav"),
    path.join(dumpDirectory, "Audio", "dtkdump.wav"),
  ];
  for (const filePath of files) {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}

function setDumping(dolphinIniPath, { dumpFrames, dumpAudio }) {
  if (!fs.existsSync(dolphinIniPath)) {
    throw new Error(`Could not find Dolphin.ini:\n${dolphinIniPath}`);
  }

  let content = fs.readFileSync(dolphinIniPath, "utf8");
  const framesVal = dumpFrames ? "True" : "False";
  const audioVal = dumpAudio ? "True" : "False";

  const ensureSection = (text, section) => {
    if (new RegExp(`^\\[${section}\\]`, "m").test(text)) return text;
    return `${text.trimEnd()}\n\n[${section}]\n`;
  };

  const setKey = (text, section, key, value) => {
    let next = ensureSection(text, section);
    const sectionRe = new RegExp(`(\\[${section}\\][\\s\\S]*?)(?=\\n\\[|$)`);
    next = next.replace(sectionRe, (block) => {
      const keyRe = new RegExp(`^${key}\\s*=\\s*.*$`, "m");
      if (keyRe.test(block)) {
        return block.replace(keyRe, `${key} = ${value}`);
      }
      return `${block.trimEnd()}\n${key} = ${value}\n`;
    });
    return next;
  };

  content = setKey(content, "Movie", "DumpFrames", framesVal);
  content = setKey(content, "DSP", "DumpAudio", audioVal);
  fs.writeFileSync(dolphinIniPath, content, "utf8");
}

function createPlaybackJson(replayPath, startTime, endTime, playbackJsonPath) {
  if (!fs.existsSync(replayPath)) {
    throw new Error(`Could not find replay:\n${replayPath}`);
  }
  if (path.extname(replayPath).toLowerCase() !== ".slp") {
    throw new Error("Replay must be a .slp file");
  }

  const startFrame = timestampToSlippiFrame(startTime);
  const endFrame = timestampToSlippiFrame(endTime);
  if (endFrame <= startFrame) {
    throw new Error("End time must be after start time");
  }

  const playbackData = {
    mode: "normal",
    replay: path.resolve(replayPath),
    startFrame,
    endFrame,
    commandId: "1",
    rollbackDisplayMethod: "off",
    shouldResync: false,
  };

  fs.mkdirSync(path.dirname(playbackJsonPath), { recursive: true });
  fs.writeFileSync(playbackJsonPath, JSON.stringify(playbackData, null, 4), "utf8");
  return playbackJsonPath;
}

function launchReplay(dolphinPath, meleeIsoPath, playbackJsonPath) {
  if (!fs.existsSync(dolphinPath)) {
    throw new Error(`Could not find Slippi Dolphin:\n${dolphinPath}`);
  }
  if (!fs.existsSync(meleeIsoPath)) {
    throw new Error(`Could not find Melee ISO:\n${meleeIsoPath}`);
  }

  return spawn(
    dolphinPath,
    ["-e", meleeIsoPath, "-i", path.resolve(playbackJsonPath)],
    { windowsHide: false }
  );
}

function closeDolphin(process) {
  return new Promise((resolve) => {
    if (!process || process.killed || process.exitCode !== null) {
      resolve();
      return;
    }
    process.once("exit", () => resolve());
    process.kill();
    setTimeout(() => {
      try {
        if (process.exitCode === null) process.kill("SIGKILL");
      } catch {
        /* ignore */
      }
      resolve();
    }, 5000);
  });
}

async function waitForDumpToFinish(dumpDirectory, process, checkInterval = 1000, stableChecksRequired = 3) {
  const videoPath = path.join(dumpDirectory, "Frames", "framedump0.avi");
  sendProgress("Waiting for frame dump to begin...");

  while (!fs.existsSync(videoPath)) {
    if (process.exitCode !== null) {
      throw new Error("Dolphin closed before the frame dump was created.");
    }
    await sleep(500);
  }

  sendProgress("Frame dump started.");
  let previousSize = -1;
  let stableChecks = 0;

  while (true) {
    const currentSize = fs.statSync(videoPath).size;
    if (currentSize === previousSize) {
      stableChecks += 1;
    } else {
      stableChecks = 0;
    }

    sendProgress(`Dump size: ${currentSize.toLocaleString()} bytes`, {
      stable: `${stableChecks}/${stableChecksRequired}`,
    });

    if (stableChecks >= stableChecksRequired) {
      sendProgress("Frame dump finished.");
      break;
    }

    previousSize = currentSize;
    await sleep(checkInterval);
  }
}

function runFfmpeg(ffmpegPath, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args, { windowsHide: true });
    let stderr = "";
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg failed (${code}): ${stderr.slice(-500)}`));
    });
  });
}

async function encodeMp4({ ffmpegPath, dumpDirectory, outputPath, clipDuration, includeAudio }) {
  const videoPath = path.join(dumpDirectory, "Frames", "framedump0.avi");
  if (!fs.existsSync(ffmpegPath)) {
    throw new Error(`Could not find FFmpeg:\n${ffmpegPath}`);
  }
  if (!fs.existsSync(videoPath)) {
    throw new Error(`Could not find video dump:\n${videoPath}`);
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const endStamp = String(clipDuration);

  if (includeAudio) {
    const dsp = path.join(dumpDirectory, "Audio", "dspdump.wav");
    const dtk = path.join(dumpDirectory, "Audio", "dtkdump.wav");
    if (!fs.existsSync(dsp) || !fs.existsSync(dtk)) {
      throw new Error("Audio dumps missing. Try exporting without audio, or enable DumpAudio in Dolphin.");
    }
    sendProgress("Encoding MP4 with audio...");
    await runFfmpeg(ffmpegPath, [
      "-i", videoPath,
      "-i", dsp,
      "-i", dtk,
      "-filter_complex", "[1:a][2:a]amix=inputs=2:duration=longest[a]",
      "-map", "0:v",
      "-map", "[a]",
      "-ss", "00:00:00",
      "-to", endStamp,
      "-c:v", "libx264",
      "-preset", "medium",
      "-crf", "18",
      "-c:a", "aac",
      "-b:a", "192k",
      "-y",
      outputPath,
    ]);
  } else {
    sendProgress("Encoding MP4 (video only)...");
    await runFfmpeg(ffmpegPath, [
      "-i", videoPath,
      "-ss", "00:00:00",
      "-to", endStamp,
      "-map", "0:v",
      "-c:v", "libx264",
      "-preset", "medium",
      "-crf", "18",
      "-an",
      "-y",
      outputPath,
    ]);
  }

  return outputPath;
}

function validateClipPaths(config) {
  const required = [
    "dolphin_path",
    "dolphin_ini_path",
    "melee_iso_path",
    "ffmpeg_path",
    "dump_directory",
    "output_directory",
  ];
  const missing = required.filter((key) => !config?.[key]);
  if (missing.length) {
    throw new Error(`Missing clip settings: ${missing.join(", ")}`);
  }
}

async function previewClipRange({ replayPath, startTime, endTime, config }) {
  validateClipPaths(config);
  getClipDuration(startTime, endTime);

  const playbackJsonPath = path.join(config.output_directory, "playback_preview.json");
  setDumping(config.dolphin_ini_path, { dumpFrames: false, dumpAudio: false });
  createPlaybackJson(replayPath, startTime, endTime, playbackJsonPath);

  sendProgress("Launching Dolphin preview...");
  const process = launchReplay(config.dolphin_path, config.melee_iso_path, playbackJsonPath);
  return { pid: process.pid, ok: true };
}

async function generateClip({
  replayPath,
  startTime,
  endTime,
  includeAudio = true,
  config,
}) {
  validateClipPaths(config);
  const clipDuration = getClipDuration(startTime, endTime);

  const dolphinPath = config.dolphin_path;
  const dolphinIniPath = config.dolphin_ini_path;
  const dumpDirectory = config.dump_directory;
  const meleeIsoPath = config.melee_iso_path;
  const ffmpegPath = config.ffmpeg_path;
  const outputDirectory = config.output_directory;

  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.mkdirSync(path.join(dumpDirectory, "Frames"), { recursive: true });
  fs.mkdirSync(path.join(dumpDirectory, "Audio"), { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const replayName = path.basename(replayPath, path.extname(replayPath));
  const outputPath = path.join(outputDirectory, `${replayName}_${stamp}.mp4`);
  const playbackJsonPath = path.join(outputDirectory, "playback.json");

  try {
    sendProgress("Enabling Dolphin frame dump...");
    setDumping(dolphinIniPath, {
      dumpFrames: true,
      dumpAudio: !!includeAudio,
    });

    clearDumpFiles(dumpDirectory);
    createPlaybackJson(replayPath, startTime, endTime, playbackJsonPath);

    sendProgress("Launching Slippi Dolphin...");
    const process = launchReplay(dolphinPath, meleeIsoPath, playbackJsonPath);

    await waitForDumpToFinish(dumpDirectory, process);
    await closeDolphin(process);
    await sleep(2000);

    await encodeMp4({
      ffmpegPath,
      dumpDirectory,
      outputPath,
      clipDuration,
      includeAudio: !!includeAudio,
    });

    sendProgress("Clip ready.", { outputPath });
    return { ok: true, outputPath };
  } finally {
    try {
      setDumping(dolphinIniPath, { dumpFrames: false, dumpAudio: false });
    } catch (err) {
      console.warn("Failed to restore Dolphin dump settings:", err.message);
    }
  }
}

module.exports = {
  generateClip,
  previewClipRange,
  timestampToSeconds,
  secondsToClock,
  getClipDuration,
  validateClipPaths,
};
