import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import sqlite3 from "sqlite3";
import { exec } from "child_process";
import { promisify } from "util";

// =============================================================================
// SERVER.TS (v0700 — VERBOSE, LINTED, PRODUCTION-READY)
// =============================================================================
//
// OBJECTIVE:
//   This Express server acts as the bridge between the web dashboard and the
//   system-level network controller (fix-wifi.sh). It provides RESTful API
//   endpoints to query the forensic database and trigger recovery actions.
//
// KEY FEATURES:
//   1. API ENDPOINTS: Health checks, audit logs, command history, and recovery.
//   2. SQLITE INTEGRATION: Direct read access to the recovery_state.db.
//   3. VITE MIDDLEWARE: Seamless development experience with HMR (Hot Module Replacement).
//   4. PRODUCTION SERVING: Serves the compiled React app in production mode.
//
// =============================================================================

// Promisify exec to use async/await for cleaner system command execution.
const execAsync = promisify(exec);

// ES Module compatibility for __dirname.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Main server initialization function.
 */
async function startServer() {
  const app = express();
  const PORT = 3000;

  // ---------------------------------------------------------------------------
  // DATABASE CONNECTION
  // ---------------------------------------------------------------------------
  // Connect to the forensic SQLite database created by the shell script.
  const dbPath = path.join(process.cwd(), "recovery_state.db");
  const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error(`CRITICAL: Failed to connect to database at ${dbPath}:`, err.message);
    } else {
      console.log(`Connected to forensic database at ${dbPath}`);
      
      // ENSURE TABLES EXIST:
      // This prevents "SQLITE_ERROR: no such table" if the server starts before the shell script.
      db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS milestones (
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          name TEXT,
          details TEXT
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS commands (
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          command TEXT,
          exit_code INTEGER,
          output TEXT
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS connection_stats (
          name TEXT PRIMARY KEY,
          success_count INTEGER DEFAULT 0,
          failure_count INTEGER DEFAULT 0
        )`);
      });
    }
  });

  // Middleware to parse JSON request bodies.
  app.use(express.json());

  // ---------------------------------------------------------------------------
  // API ROUTES
  // ---------------------------------------------------------------------------

  /**
   * GET /api/health
   * Simple heartbeat endpoint to verify the server is running.
   */
  app.get("/api/health", (req, res) => {
    res.json({ 
      status: "ok", 
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || "development"
    });
  });

  /**
   * GET /api/audit
   * Retrieves the most recent 50 milestones from the forensic database.
   */
  app.get("/api/audit", (req, res) => {
    const query = "SELECT * FROM milestones ORDER BY timestamp DESC LIMIT 50";
    db.all(query, (err, rows) => {
      if (err) {
        console.error("Database Error (Audit):", err.message);
        return res.status(500).json({ error: "Failed to retrieve audit logs" });
      }
      res.json({ milestones: rows });
    });
  });

  /**
   * GET /api/commands
   * Retrieves the most recent 50 system commands executed by the controller.
   */
  app.get("/api/commands", (req, res) => {
    const query = "SELECT * FROM commands ORDER BY timestamp DESC LIMIT 50";
    db.all(query, (err, rows) => {
      if (err) {
        console.error("Database Error (Commands):", err.message);
        return res.status(500).json({ error: "Failed to retrieve command history" });
      }
      res.json({ commands: rows });
    });
  });

  /**
   * POST /api/recover
   * Triggers a manual "force" recovery by calling the fix-wifi script.
   * 
   * SECURITY & CONCURRENCY:
   * 1. Uses the system-level lock file (fix-wifi.lock) to ensure that only one
   *    recovery process can run at a time. This prevents hardware state
   *    corruption from concurrent nmcli commands.
   * 2. Executes the script via 'sudo'. In a production environment, this
   *    requires the user to configure /etc/sudoers to allow the 'node' user
   *    to run the specific script without a password prompt.
   */
  app.post("/api/recover", async (req, res) => {
    const lockPath = path.join(process.cwd(), "fix-wifi.lock");
    try {
      // Step 1: Check if the controller is already running using flock.
      // We attempt to acquire a non-blocking lock (-n). 
      // If the lock is held by another process, flock returns a non-zero exit code.
      const { stdout: lockCheck } = await execAsync(`flock -n ${lockPath} -c "echo free" || echo busy`);
      
      if (lockCheck.trim() === "busy") {
        console.warn("Recovery Request Denied: Controller is already active.");
        return res.status(409).json({ 
          error: "Recovery already in progress",
          details: "The system controller is currently executing a recovery sequence. Please wait for it to complete."
        });
      }

      // Step 2: Trigger the recovery script with the --force flag.
      // The --force flag bypasses the PID loop and executes the recovery sequence immediately.
      console.log("Triggering manual recovery sequence...");
      const { stdout, stderr } = await execAsync("sudo /usr/local/bin/fix-wifi --force");
      
      res.json({ 
        message: "Recovery triggered successfully", 
        stdout: stdout.trim(), 
        stderr: stderr.trim() 
      });
    } catch (error: any) {
      // Handle execution errors (e.g., script not found, sudo permission denied).
      console.error("Recovery Execution Error:", error.message);
      res.status(500).json({ 
        error: "Failed to trigger recovery", 
        details: error.message,
        stderr: error.stderr 
      });
    }
  });

  // ---------------------------------------------------------------------------
  // FRONTEND SERVING (VITE / STATIC)
  // ---------------------------------------------------------------------------

  if (process.env.NODE_ENV !== "production") {
    // Development Mode: Use Vite's development server as middleware.
    console.log("Initializing Vite middleware (Development Mode)...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production Mode: Serve the pre-compiled static assets from the dist folder.
    console.log("Serving static assets (Production Mode)...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    
    // SPA Fallback: Redirect all non-API requests to index.html.
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // ---------------------------------------------------------------------------
  // START SERVER
  // ---------------------------------------------------------------------------
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`=============================================================================`);
    console.log(`Broadcom Network Controller Dashboard active at:`);
    console.log(`http://localhost:${PORT}`);
    console.log(`=============================================================================`);
  });
}

// Start the server and handle any top-level initialization errors.
startServer().catch((err) => {
  console.error("CRITICAL: Server failed to start:", err);
  process.exit(1);
});
