import initSqlJs from 'sql.js';
import fs from 'fs';

(async () => {
  const SQL = await initSqlJs();
  const data = fs.readFileSync('apartments.db');
  const db = new SQL.Database(data);
  
  const result = db.exec('SELECT sql FROM sqlite_master WHERE type="table" AND name="apartments"');
  if (result.length > 0) {
    console.log('Table schema:');
    console.log(result[0].values[0][0]);
    
    const count = db.exec('SELECT COUNT(*) as count FROM apartments');
    console.log('\nRow count: ' + count[0].values[0][0]);
    
    const columns = db.exec('PRAGMA table_info(apartments)');
    console.log('\nColumns:');
    if (columns.length > 0) {
      for (const row of columns[0].values) {
        console.log(`  - ${row[1]} (${row[2]})`);
      }
    }
  }
})()
