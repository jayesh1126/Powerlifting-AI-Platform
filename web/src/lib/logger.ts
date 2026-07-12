/**
 * Minimal structured logger (pino-style API without the dependency).
 * Pretty lines in dev, single-line JSON in production so log aggregators
 * can parse them. Level via LOG_LEVEL (debug|info|warn|error).
 *
 * Never pass secrets/tokens or raw message content into `meta`.
 */

type Level = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const isProd = process.env.NODE_ENV === "production";
const minLevel: Level =
  (process.env.LOG_LEVEL as Level | undefined) ?? (isProd ? "info" : "debug");

function serializeError(err: unknown) {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  return err;
}

function log(level: Level, msg: string, meta?: Record<string, unknown>) {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;

  const cleanMeta = meta?.err
    ? { ...meta, err: serializeError(meta.err) }
    : meta;

  if (isProd) {
    console[level === "debug" ? "log" : level](
      JSON.stringify({
        level,
        time: new Date().toISOString(),
        msg,
        ...cleanMeta,
      })
    );
  } else {
    console[level === "debug" ? "log" : level](
      `[${level.toUpperCase()}] ${msg}`,
      cleanMeta ?? ""
    );
  }
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) =>
    log("debug", msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => log("info", msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => log("warn", msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) =>
    log("error", msg, meta),
};
