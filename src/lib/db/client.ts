import { drizzle } from "drizzle-orm/mysql2";
import mysql, { type Pool } from "mysql2/promise";

const globalForDb = globalThis as unknown as {
  __stockpulsePool?: Pool;
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function createPool(): Pool {
  const port = Number(process.env.DATABASE_PORT ?? "4000");
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("DATABASE_PORT must be an integer between 1 and 65535");
  }

  return mysql.createPool({
    host: requireEnv("DATABASE_HOST"),
    port,
    user: requireEnv("DATABASE_USER"),
    password: requireEnv("DATABASE_PASSWORD"),
    database: requireEnv("DATABASE_NAME"),
    waitForConnections: true,
    connectionLimit: 2,
    maxIdle: 2,
    idleTimeout: 60_000,
    queueLimit: 0,
    connectTimeout: 10_000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10_000,
    ssl: {
      minVersion: "TLSv1.2",
      rejectUnauthorized: true,
    },
  });
}

export function getPool(): Pool {
  if (!globalForDb.__stockpulsePool) {
    globalForDb.__stockpulsePool = createPool();
  }
  return globalForDb.__stockpulsePool;
}

export function getDb() {
  return drizzle(getPool());
}