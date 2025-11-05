import winston from "winston";
import path from "path";
import fs from "fs";

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), "logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  winston.format.printf((info: any) => {
    const { timestamp, level, message, stack, ...meta } = info;
    let logMessage = `${timestamp} [${level.toUpperCase()}]: ${message}`;

    // Add metadata if present
    if (Object.keys(meta).length > 0) {
      logMessage += ` ${JSON.stringify(meta)}`;
    }

    return stack ? `${logMessage}\n${stack}` : logMessage;
  })
);

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: logFormat,
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), logFormat),
    }),
    new winston.transports.File({
      filename: path.join(logsDir, "error.log"),
      level: "error",
      format: logFormat,
    }),
    new winston.transports.File({
      filename: path.join(logsDir, "combined.log"),
      format: logFormat,
    }),
  ],
});

// Helper function to create context-specific loggers
export const createContextLogger = (context: string) => {
  return {
    debug: (message: string, meta?: any) => {
      logger.debug(`[${context}] ${message}`, meta || {});
    },
    info: (message: string, meta?: any) => {
      logger.info(`[${context}] ${message}`, meta || {});
    },
    warn: (message: string, meta?: any) => {
      logger.warn(`[${context}] ${message}`, meta || {});
    },
    error: (message: string, error?: any) => {
      if (error instanceof Error) {
        logger.error(`[${context}] ${message}`, {
          error: error.message,
          stack: error.stack,
        });
      } else {
        logger.error(`[${context}] ${message}`, { error });
      }
    },
  };
};
