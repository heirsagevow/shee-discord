import winston from "winston";

const { combine, timestamp, printf, colorize } = winston.format;

const customFormat = printf(({ level, message, timestamp, ...meta }) => {
  const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : "";
  return `${timestamp} [${level}]: ${message} ${metaStr}`;
});

export const logger = winston.createLogger({
  level: cfg.LOG_LEVEL,
  format: combine(timestamp({ format: "YYYY-MM-DD HH:mm:ss" }), customFormat),
  transports: [
    new winston.transports.Console({
      format: combine(
        colorize(),
        timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        customFormat
      ),
    }),
    new winston.transports.File({ filename: "logs/error.log", level: "error" }),
    new winston.transports.File({ filename: "logs/combined.log" }),
  ],
});

// Create logs directory if it doesn't exist
import { existsSync, mkdirSync } from "fs";
import { cfg } from "./config";
if (!existsSync("logs")) {
  mkdirSync("logs");
}
