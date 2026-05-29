#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'content', 'drugs');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();
const index = files.map(f => {
  const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  return { id: d.id, generic: d.generic, brand: d.brand, class: d.class };
});
fs.writeFileSync(path.join(__dirname, '..', 'content', 'drugs-index.json'), JSON.stringify(index, null, 2) + '\n');
console.log('Index entries:', index.length);
