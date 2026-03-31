import sqlite3 from 'sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'recovery_state.db');
const db = new sqlite3.Database(dbPath);

db.all('SELECT * FROM milestones ORDER BY timestamp DESC LIMIT 20', (err, rows) => {
  if (err) {
    console.error('Error reading milestones:', err);
    process.exit(1);
  }
  console.log('--- RECENT MILESTONES ---');
  console.log(JSON.stringify(rows, null, 2));
  
  db.all('SELECT * FROM commands ORDER BY timestamp DESC LIMIT 10', (err, rows) => {
    if (err) {
      console.error('Error reading commands:', err);
      process.exit(1);
    }
    console.log('--- RECENT COMMANDS ---');
    console.log(JSON.stringify(rows, null, 2));
    db.close();
  });
});
