/**
 * SmartDrive-OS integration:
 * After Aurora writes learning materials (deck slides, course index, images, progress.jsonl),
 * ask SmartDrive-OS to update its SQLite FTS5 index for that folder so `smart-drive search --kind slide ...`
 * finds new and edited lessons at once.
 *
 * Best-effort, non-blocking, detached background execution with 60 s timeout and 2 s per-folder coalescing.
 * Disabled when AURORA_SMARTDRIVE=off.
 */
import { spawn, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { errMsg } from "./util.js";

/** Splits a command string into arguments preserving single/double quoted substrings. */
export function splitCommandLine(cmdLine: string): string[] {
  const args: string[] = [];
  let current = "";
  let inDouble = false;
  let inSingle = false;
  for (let i = 0; i < cmdLine.length; i++) {
    const ch = cmdLine[i]!;
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
    } else if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
    } else if (/\s/.test(ch) && !inDouble && !inSingle) {
      if (current.length > 0) {
        args.push(current);
        current = "";
      }
    } else {
      current += ch;
    }
  }
  if (current.length > 0) {
    args.push(current);
  }
  return args;
}

let resolvedCommand: string[] | null | undefined = undefined;

export function resolveSmartDriveCommand(): string[] | null {
  if (resolvedCommand !== undefined) return resolvedCommand;

  const envCmd = process.env.AURORA_SMARTDRIVE_CMD?.trim();
  if (envCmd) {
    const parts = splitCommandLine(envCmd);
    resolvedCommand = parts.length > 0 ? parts : null;
    return resolvedCommand;
  }

  // 1. smart-drive on PATH
  try {
    const res = spawnSync("smart-drive", ["-h"], { stdio: "ignore", windowsHide: true, timeout: 2000 });
    if (!res.error && res.status === 0) {
      resolvedCommand = ["smart-drive"];
      return resolvedCommand;
    }
  } catch {
    // Ignore error
  }

  // 2. Windows: py -3 -m smart_drive
  if (process.platform === "win32") {
    try {
      const res = spawnSync("py", ["-3", "-m", "smart_drive", "-h"], { stdio: "ignore", windowsHide: true, timeout: 2000 });
      if (!res.error && res.status === 0) {
        resolvedCommand = ["py", "-3", "-m", "smart_drive"];
        return resolvedCommand;
      }
    } catch {
      // Ignore error
    }
  }

  // 3. python -m smart_drive (or python3)
  for (const py of ["python", "python3"]) {
    try {
      const res = spawnSync(py, ["-m", "smart_drive", "-h"], { stdio: "ignore", windowsHide: true, timeout: 2000 });
      if (!res.error && res.status === 0) {
        resolvedCommand = [py, "-m", "smart_drive"];
        return resolvedCommand;
      }
    } catch {
      // Ignore error
    }
  }

  resolvedCommand = null;
  return null;
}

let hasLoggedError = false;

function runSmartDriveUpdate(cmd: string[], dir: string): void {
  try {
    const [bin, ...baseArgs] = cmd;
    if (!bin) return;
    const args = [...baseArgs, "update", dir, "--quiet"];
    const child = spawn(bin, args, {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();

    const timeout = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // Ignore kill errors
      }
    }, 60_000);
    timeout.unref?.();

    child.on("error", (err) => {
      clearTimeout(timeout);
      if (!hasLoggedError) {
        hasLoggedError = true;
        console.error(`[aurora:smartdrive] ${errMsg(err)}`);
      }
    });

    child.on("exit", (code) => {
      clearTimeout(timeout);
      if (code !== 0 && code !== null && !hasLoggedError) {
        hasLoggedError = true;
        console.error(`[aurora:smartdrive] update exited with code ${code}`);
      }
    });
  } catch (e) {
    if (!hasLoggedError) {
      hasLoggedError = true;
      console.error(`[aurora:smartdrive] ${errMsg(e)}`);
    }
  }
}

interface DirState {
  timer: NodeJS.Timeout | null;
  pending: boolean;
}

const dirStates = new Map<string, DirState>();

function scheduleCooldown(targetDir: string, cmd: string[]): void {
  const timer = setTimeout(() => {
    const s = dirStates.get(targetDir);
    if (!s) return;
    if (s.pending) {
      s.pending = false;
      runSmartDriveUpdate(cmd, targetDir);
      scheduleCooldown(targetDir, cmd);
    } else {
      dirStates.delete(targetDir);
    }
  }, 2000);
  timer.unref?.();
  const s = dirStates.get(targetDir);
  if (s) {
    s.timer = timer;
  } else {
    dirStates.set(targetDir, { timer, pending: false });
  }
}

/**
 * Notifies SmartDrive-OS to incrementally update its content search index for the given directory.
 * Best effort and never blocking: spawns detached, coalesced per folder within 2 s, 60 s timeout.
 * Disabled when AURORA_SMARTDRIVE=off.
 */
export function notifySmartDrive(dir: string): void {
  if (process.env.AURORA_SMARTDRIVE?.trim().toLowerCase() === "off") return;
  const cmd = resolveSmartDriveCommand();
  if (!cmd || cmd.length === 0) return;

  const targetDir = resolve(dir);
  const state = dirStates.get(targetDir);

  if (!state) {
    // Leading edge: run immediately
    runSmartDriveUpdate(cmd, targetDir);
    scheduleCooldown(targetDir, cmd);
  } else {
    // Coalesce calls within 2s window
    state.pending = true;
  }
}
