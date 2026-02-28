/**
 * fix_app_route.cjs
 * Adds /scenario-creator/:id route to App.jsx
 * Run from: C:\Users\Sherae's Computer\loanbeacons-app
 */
const fs = require('fs');
const path = require('path');
const APP = path.join('src', 'App.jsx');
if (!fs.existsSync(APP)) { console.error('ERROR: Cannot find ' + APP); process.exit(1); }

var src = fs.readFileSync(APP, 'utf8').replace(/\r\n/g, '\n');

src = src.replace(
  '          <Route path="/scenario-creator" element={<ScenarioCreator />} />',
  '          <Route path="/scenario-creator" element={<ScenarioCreator />} />\n          <Route path="/scenario-creator/:id" element={<ScenarioCreator />} />'
);

console.log(src.includes('/scenario-creator/:id') ? 'OK: Added /scenario-creator/:id route' : 'FAILED: route not added');

if (!src.includes('/scenario-creator/:id')) { process.exit(1); }
fs.writeFileSync(APP, src.replace(/\n/g, '\r\n'), 'utf8');
console.log('SAVED: App.jsx');
console.log('\nNEXT STEPS:');
console.log('  1. Ctrl+Shift+R');
console.log('  2. Click Edit on Mary Cox — form loads with all her data');
console.log('  3. git add . && git commit -m "fix: add scenario-creator/:id edit route"');
