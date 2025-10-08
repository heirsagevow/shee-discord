import { existsSync, mkdirSync } from "node:fs";
import winston from "winston";
import { cfg } from "./config";

const { combine, timestamp, printf, colorize } = winston.format;

const formatLogMessage = printf(({ level, message, timestamp, ...meta }) => {
  const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : "";
  return `${timestamp} [${level}]: ${message} ${metaStr}`;
});

const createConsoleTransport = () =>
  new winston.transports.Console({
    format: combine(
      colorize(),
      timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
      formatLogMessage
    ),
  });

const createFileTransport = (filename: string, level?: string) =>
  new winston.transports.File({
    filename: `logs/${filename}`,
    level,
  });

const ensureLogDirectoryExists = () => {
  if (!existsSync("logs")) {
    mkdirSync("logs");
  }
};

ensureLogDirectoryExists();

export const logger = winston.createLogger({
  level: cfg.LOG_LEVEL,
  format: combine(
    timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    formatLogMessage
  ),
  transports: [
    createConsoleTransport(),
    createFileTransport("error.log", "error"),
    createFileTransport("combined.log"),
  ],
});
