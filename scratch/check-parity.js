const fs = require('fs');

const en = JSON.parse(fs.readFileSync('messages/en.json', 'utf8'));
const fr = JSON.parse(fs.readFileSync('messages/fr.json', 'utf8'));

function getKeys(obj, prefix = '') {
  return Object.keys(obj).reduce((acc, k) => {
    const pre = prefix.length ? prefix + '.' : '';
    if (typeof obj[k] === 'object' && obj[k] !== null && !Array.isArray(obj[k])) {
      Object.assign(acc, getKeys(obj[k], pre + k));
    } else {
      acc[pre + k] = true;
    }
    return acc;
  }, {});
}

const enKeys = getKeys(en);
const frKeys = getKeys(fr);

const missingInFr = Object.keys(enKeys).filter(k => !frKeys[k]);
const missingInEn = Object.keys(frKeys).filter(k => !enKeys[k]);

if (missingInFr.length > 0) {
  console.error("Keys missing in fr.json:", missingInFr);
  process.exit(1);
}

if (missingInEn.length > 0) {
  console.error("Keys missing in en.json:", missingInEn);
  process.exit(1);
}

console.log("AST Check Passed: Bilingual dictionary parity is 100%.");
