import winston from 'winston';

// Setup winston logger with namespace support
const _logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message, namespace }) => {
      const ns = namespace ? `[${namespace}] ` : '';
      return `${timestamp} ${level.toUpperCase()}: ${ns}${message}`;
    })
  ),
  transports: [
    new winston.transports.Console({
      // Only log the namespace if it matches DEBUG env var pattern
      format: winston.format((info: winston.Logform.TransformableInfo & { namespace?: string }) => {
        if (process.env.DEBUG) {
          const debugNamespaces = process.env.DEBUG.split(',');

          // If there's no namespace, always show the log
          if (!info.namespace) {
            return info;
          }

          // Now we know namespace exists, check if it matches any pattern
          const namespace = info.namespace;
          if (
            debugNamespaces.some(
              (pattern) =>
                pattern === '*' ||
                (pattern.endsWith('*') && namespace.startsWith(pattern.slice(0, -1))) ||
                pattern === namespace
            )
          ) {
            return info;
          }
          return false;
        }
        return info;
      })(),
    }),
  ],
});

const log = (namespace: string) => ({
  info: (message: string) => _logger.info(message, { namespace }),
  error: (message: string, error?: any) =>
    _logger.error(`${message}${error ? ': ' + error : ''}`, { namespace }),
  warn: (message: string, error?: any) =>
    _logger.warn(`${message}${error ? ': ' + error : ''}`, { namespace }),
  debug: (message: string) => _logger.debug(message, { namespace }),
});

export { log };
