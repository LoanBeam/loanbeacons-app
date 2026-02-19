const fs = require('fs');

let detail = fs.readFileSync('src/pages/ScenarioDetail.jsx', 'utf8');
const oldBtn = '<a href={`/rate-buydown?scenarioId=${s.id}`} className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold px-5 py-2.5 rounded-lg text-sm">📉 Rate Buydown™</a>';
const newBtn = oldBtn + '\n          <a href={`/arm-structure?scenarioId=${s.id}`} className="inline-flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white font-semibold px-5 py-2.5 rounded-lg text-sm">📈 ARM Structure™</a>';
detail = detail.replace(oldBtn, newBtn);
fs.writeFileSync('src/pages/ScenarioDetail.jsx', detail);
console.log('Done: ' + detail.includes('arm-structure'));
