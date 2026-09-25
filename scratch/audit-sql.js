const fs = require('fs');
const path = require('path');

const dir = 'supabase/migrations';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();

let missingSearchPath = [];
let tablesWithoutRLS = [];
let unsafeGrants = [];

const tableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:[a-zA-Z0-9_]+\.)?([a-zA-Z0-9_]+)/gi;
const rlsRegex = /ALTER\s+TABLE\s+(?:[a-zA-Z0-9_]+\.)?([a-zA-Z0-9_]+)\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi;
const funcRegex = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:[a-zA-Z0-9_]+\.)?([a-zA-Z0-9_]+)[^]*?RETURNS[^]*?(?:AS\s+\$\$|LANGUAGE)/gi;

for (const file of files) {
  const content = fs.readFileSync(path.join(dir, file), 'utf8');

  // Check functions for search_path
  let funcMatch;
  while ((funcMatch = funcRegex.exec(content)) !== null) {
    const funcBody = funcMatch[0].toUpperCase();
    if (!funcBody.includes("SET SEARCH_PATH")) {
      missingSearchPath.push({ file, func: funcMatch[1] });
    }
  }

  // Check grants on financial_core
  const lines = content.split('\n');
  for (const line of lines) {
    if (line.toUpperCase().includes('GRANT EXECUTE') && line.includes('financial_core') && line.toUpperCase().includes(' TO ANON')) {
      unsafeGrants.push({ file, line });
    }
  }
  const globalSearchPathFixRegex = /ALTER\s+FUNCTION\s+%I\.\%I\(%s\)\s+SET\s+search_path/gi;
  if (globalSearchPathFixRegex.test(content)) {
    missingSearchPath = []; // Global dynamic fix applied
  }
}

console.log(JSON.stringify({
  missingSearchPath,
  unsafeGrants
}, null, 2));
