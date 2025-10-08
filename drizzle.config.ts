import "dotenv/config";
import { defineConfig } from "drizzle-kit";
import { cfg } from "@/utils/config";

export default defineConfig({
  out: "./src/integrations/drizzle/migrations",
  schema: ["./src/integrations/drizzle/schemas/*"],
  dialect: "postgresql",
  dbCredentials: {
    url: cfg.DATABASE_URL,
  },
});
