require("dotenv").config();
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const db = new sqlite3.Database("./database.db", (err) => {
  if (err) return console.error(err.message);
  console.log("✅ Base SQLite connectée");
});

// 1️⃣ Création des tables (séquentielle)
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT UNIQUE,
      name TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT,
      day INTEGER,
      used INTEGER DEFAULT 0
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS codes (
      day INTEGER PRIMARY KEY,
      secret TEXT
    )
  `);

  // 2️⃣ Insérer les codes fixes si la table est vide
  db.get("SELECT COUNT(*) as count FROM codes", (err, row) => {
    if (err) return console.error(err.message);

    if (row.count === 0) {
      const fixedCodes = [
        { day: 5, secret: "UH6X" },
        { day: 10, secret: "XBBM" },
        { day: 15, secret: "L3OU" },
        { day: 20, secret: "00VE" },
        { day: 25, secret: "02UD" },
        { day: 30, secret: "LAQQ" },
      ];

      const stmt = db.prepare("INSERT INTO codes(day, secret) VALUES (?, ?)");
      fixedCodes.forEach(({ day, secret }) => {
        stmt.run(day, secret);
        console.log(`Jour ${day} code secret: ${secret}`);
      });
      stmt.finalize();
    }
  });
});

// ----------------- Endpoint /check-bonus -----------------
app.post("/check-bonus", (req, res) => {
  const { phone, day, code } = req.body;
  if (!phone || !day || !code)
    return res.status(400).json({ error: "Paramètres manquants" });

  // Vérifier que l'utilisateur existe
  db.get("SELECT * FROM users WHERE phone = ?", [phone], (err, userRow) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!userRow) return res.json({ status: "unauthorized" });

    // Vérifier le code du jour
    db.get("SELECT * FROM codes WHERE day = ?", [day], (err2, row) => {
      if (err2) return res.status(500).json({ error: err2.message });
      if (!row || row.secret.toUpperCase() !== code.toUpperCase())
        return res.json({ status: "invalid_code" });

      // Vérifier si le bonus a déjà été utilisé
      db.get(
        "SELECT * FROM clients WHERE phone = ? AND day = ?",
        [phone, day],
        (err3, clientRow) => {
          if (err3) return res.status(500).json({ error: err3.message });
          if (clientRow && clientRow.used === 1)
            return res.json({ status: "already_used" });

          // Marquer le bonus comme utilisé
          db.run(
            "INSERT OR REPLACE INTO clients (phone, day, used) VALUES (?, ?, 1)",
            [phone, day],
            () => {
              res.json({ status: "success" }); // frontend gère le message
            },
          );
        },
      );
    });
  });
});

// ----------------- Endpoint /add-user -----------------
app.post("/add-user", (req, res) => {
  const { name, phone, secretKey } = req.body;
  if (secretKey !== process.env.ADMIN_KEY)
    return res.status(403).json({ error: "Non autorisé" });
  if (!name || !phone)
    return res.status(400).json({ error: "Paramètres manquants" });

  db.run(
    "INSERT OR IGNORE INTO users (phone, name) VALUES (?, ?)",
    [phone, name],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    },
  );
});

// ----------------- Lancer le serveur -----------------
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Backend lancé sur le port ${PORT}`);
});
