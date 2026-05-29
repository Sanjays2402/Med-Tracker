#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '..', 'content', 'drugs');
fs.mkdirSync(OUT, { recursive: true });

const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const ROUTES = ['oral tablet', 'oral capsule', 'oral solution', 'injection', 'topical cream', 'inhaler', 'patch'];
const FREQS = ['once daily', 'twice daily', 'three times daily', 'every 8 hours', 'every 12 hours', 'as needed'];

// Compact base set: [generic, brand, class, [dosages], [interactions], [indications]]
const meds = JSON.parse(fs.readFileSync(path.join(__dirname, 'drugs-base.json'), 'utf8'));

let count = 0;
const written = new Set();
for (const m of meds) {
  const [generic, brand, klass, dosages, interactions, indications] = m;
  const id = slug(generic);
  if (written.has(id)) continue;
  written.add(id);
  const obj = {
    id,
    generic,
    brand,
    class: klass,
    rxnormSample: 100000 + (count * 37) % 900000,
    indications: indications || ['see prescriber'],
    dosages,
    routes: [ROUTES[count % ROUTES.length], ROUTES[(count + 2) % ROUTES.length]].filter((v,i,a)=>a.indexOf(v)===i),
    frequencies: [FREQS[count % FREQS.length], FREQS[(count + 1) % FREQS.length]].filter((v,i,a)=>a.indexOf(v)===i),
    interactions,
    warnings: [
      `Tell your prescriber if you take ${interactions[0] || 'any other medication'}.`,
      `Do not stop ${generic} suddenly without medical advice.`,
    ],
    pregnancyCategory: ['A','B','C','D','X'][count % 5],
    storage: 'Store at room temperature, away from moisture and direct light.',
    sourceNote: 'Synthetic seed for Med-Tracker. Not medical advice. Verify with a clinician or RxNorm before clinical use.',
  };
  fs.writeFileSync(path.join(OUT, id + '.json'), JSON.stringify(obj, null, 2) + '\n');
  count++;
}
console.log('Wrote', count, 'drug files');
