import "dotenv/config";
import { defineConfig } from "drizzle-kit";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export default defineConfig({
  dialect: "mysql",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    host: requireEnv("DATABASE_HOST"),
    port: Number(process.env.DATABASE_PORT ?? "4000"),
    user: requireEnv("DATABASE_USER"),
    password: requireEnv("DATABASE_PASSWORD"),
    database: requireEnv("DATABASE_NAME"),
    ssl: {
      rejectUnauthorized: true,
    },
  },
  verbose: true,
});