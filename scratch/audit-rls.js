const fs = require('fs');
const path = require('path');

const dir = 'supabase/migrations';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();

let tablesWithoutRLS = [];
let allTables = [];
let rlsTables = new Set();

for (const file of files) {
  const content = fs.readFileSync(path.join(dir, file), 'utf8');

  const tableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:[a-zA-Z0-9_]+\.)?([a-zA-Z0-9_]+)/gi;
  let tableMatch;
  while ((tableMatch = tableRegex.exec(content)) !== null) {
    allTables.push(tableMatch[1].toLowerCase());
  }

  const rlsRegex = /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:[a-zA-Z0-9_]+\.)?([a-zA-Z0-9_]+)\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi;
  let rlsMatch;
  while ((rlsMatch = rlsRegex.exec(content)) !== null) {
    rlsTables.add(rlsMatch[1].toLowerCase());
  }
}

for (const t of allTables) {
  if (!rlsTables.has(t)) {
    tablesWithoutRLS.push(t);
  }
}

console.log(JSON.stringify({ tablesWithoutRLS }, null, 2));
