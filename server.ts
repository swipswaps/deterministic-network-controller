import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import sqlite3 from "sqlite3";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Database initialization
  const dbPath = path.join(process.cwd(), "recovery_state.db");
  const db = new sqlite3.Database(dbPath);

  app.use(express.json());

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.get("/api/audit", (req, res) => {
    db.all("SELECT * FROM milestones ORDER BY timestamp DESC LIMIT 50", (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ milestones: rows });
    });
  });

  app.get("/api/commands", (req, res) => {
    db.all("SELECT * FROM commands ORDER BY timestamp DESC LIMIT 50", (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ commands: rows });
    });
  });

  app.post("/api/recover", async (req, res) => {
    try {
      const { stdout, stderr } = await execAsync("sudo /usr/local/bin/fix-wifi --force");
      res.json({ message: "Recovery triggered", stdout, stderr });
    } catch (error: any) {
      res.status(500).json({ error: error.message, stderr: error.stderr });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
