const LEVELS = ['error', 'warn', 'info', 'debug'];

function resolveLevel() {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase();
  if (envLevel && LEVELS.includes(envLevel)) {
    return envLevel;
  }
  return 'info';
}

const activeLevel = resolveLevel();
const activeIndex = LEVELS.indexOf(activeLevel);

function serializeMeta(args) {
  if (!args.length) {
    return null;
  }

  const meta = {};

  for (const arg of args) {
    if (arg instanceof Error) {
      meta.error = {
        message: arg.message,
        name: arg.name,
        stack: arg.stack
      };
    } else if (Array.isArray(arg)) {
      meta.data = Array.isArray(meta.data) ? meta.data.concat(arg) : arg;
    } else if (arg && typeof arg === 'object') {
      Object.assign(meta, arg);
    } else if (arg !== undefined) {
      const key = typeof arg;
      if (!meta.values) {
        meta.values = [];
      }
      meta.values.push({ type: key, value: arg });
    }
  }

  return Object.keys(meta).length ? meta : null;
}

function log(level, message, ...args) {
  const levelIndex = LEVELS.indexOf(level);
  if (levelIndex === -1 || levelIndex > activeIndex) {
    return;
  }

  const timestamp = new Date().toISOString();
  const meta = serializeMeta(args);
  const context = meta ? ` ${JSON.stringify(meta)}` : '';
  const output = `[${timestamp}] [${level.toUpperCase()}] ${message}${context}`;

  if (level === 'error') {
    console.error(output);
  } else if (level === 'warn') {
    console.warn(output);
  } else if (level === 'info') {
    console.info(output);
  } else {
    console.debug(output);
  }
}

export const logger = {
  error: (message, ...args) => log('error', message, ...args),
  warn: (message, ...args) => log('warn', message, ...args),
  info: (message, ...args) => log('info', message, ...args),
  debug: (message, ...args) => log('debug', message, ...args)
};
