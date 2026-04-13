// scripts/fix-missing-modnav.cjs  v3
const fs   = require('fs')
const path = require('path')
const SRC  = path.join(__dirname, '..', 'src')

function inject(filePath, moduleNum, insertAfter) {
  const base = path.basename(filePath)
  if (!fs.existsSync(filePath)) { console.log(`  — Not found: ${base}`); return }

  let c = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n')

  // Clean up any accidental prior injections
  c = c.replace(/[ \t]*<ModuleNav moduleNumber=\{[^}]+\} \/>\n?/g, '')

  // Add import if missing
  if (!c.includes("import ModuleNav from")) {
    c = c.replace(/(^import[^\n]+\n)(?!import)/m,
      `$1import ModuleNav from '../components/ModuleNav';\n`)
  }

  // Find the LAST occurrence of insertAfter (the main return's root div opening tag)
  const pos = c.lastIndexOf(insertAfter)
  if (pos === -1) { console.log(`  ⚠️  Pattern not found in ${base}: "${insertAfter}"`); return }

  // Insert ModuleNav immediately after the opening tag
  const insertPos = pos + insertAfter.length
  const navLine = `\n      <ModuleNav moduleNumber={${moduleNum}} />`
  c = c.slice(0, insertPos) + navLine + c.slice(insertPos)

  fs.writeFileSync(filePath, c, 'utf8')
  console.log(`  ✅ ${base.padEnd(36)} → M${String(moduleNum).padStart(2,'0')}`)
}

// Each file identified by the LAST occurrence of its unique root div opening tag
inject(path.join(SRC, 'pages',   'FHAStreamline.jsx'),    11, '<div style={S.container}>')
inject(path.join(SRC, 'modules', 'VAIRRRL.jsx'),           12, '<div style={S.container}>')
inject(path.join(SRC, 'modules', 'LenderMatch.jsx'),        8, '<div style={S.page}>')
inject(path.join(SRC, 'modules', 'USDAIntelligence.jsx'),  13, 'className="min-h-screen bg-slate-900')

console.log('\nDone — restart: taskkill /F /IM node.exe && npm run dev')
