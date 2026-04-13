// scripts/fix-titleintel-nav.cjs
// Moves ModuleNav from the no-scenario branch to the main return in TitleIntel.jsx
const fs   = require('fs')
const path = require('path')

const filePath = path.join(__dirname, '..', 'src', 'pages', 'TitleIntel.jsx')
let c = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n')

// 1. Remove ModuleNav from wherever the script put it
c = c.replace(/[ \t]*<ModuleNav moduleNumber=\{[^}]+\} \/>\n?/g, '')

// 2. Re-add as first child of the main component return
//    The main return has 'pb-16' which identifies it uniquely
c = c.replace(
  /(return\s*\(\s*\n\s*<div[^>]*pb-16[^>]*>)/,
  `$1\n      <ModuleNav moduleNumber={17} />`
)

fs.writeFileSync(filePath, c, 'utf8')
console.log('✅ TitleIntel.jsx — ModuleNav moved to main return')
console.log('   NOTE: Hero still says "Module 10" — update moduleNumber prop once you confirm the correct canonical number.')
