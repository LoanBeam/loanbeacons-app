// scripts/fix-broken-modules.cjs  v2 — handles Windows \r\n line endings
const fs   = require('fs')
const path = require('path')
const SRC  = path.join(__dirname, '..', 'src')

function fixFile(filePath, moduleNum) {
  let raw = fs.readFileSync(filePath, 'utf8')

  // Normalise line endings to \n for processing
  let c = raw.replace(/\r\n/g, '\n')

  // 1. Remove ANY existing <ModuleNav ... /> JSX (wrong position)
  c = c.replace(/[ \t]*<ModuleNav moduleNumber=\{[^}]+\} \/>\n?/g, '')

  // 2. Remove the misplaced import line (wherever it ended up)
  c = c.replace(/^import ModuleNav from ['"]\.\.\/components\/ModuleNav['"];\n/m, '')

  // 3. Re-add import cleanly after the last top-level import line
  if (!c.includes("import ModuleNav from")) {
    // Find the last line that starts with 'import'
    const lines = c.split('\n')
    let lastImportIdx = 0
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('import ') || lines[i].startsWith('import{')) lastImportIdx = i
    }
    lines.splice(lastImportIdx + 1, 0, "import ModuleNav from '../components/ModuleNav';")
    c = lines.join('\n')
  }

  // 4. Inject <ModuleNav> into the MAIN component return
  //    Strategy: find the last `return (` in the file that is followed by
  //    a <div with min-h-screen (the page root wrapper)
  c = c.replace(
    /(return\s*\(\s*\n(\s*)<div[^>]*min-h-screen[^>]*>)/,
    (match, p1, indent) => `${p1}\n${indent}  <ModuleNav moduleNumber={${moduleNum}} />`
  )

  fs.writeFileSync(filePath, c, 'utf8')
  console.log(`✅ Fixed ${path.basename(filePath)} → M${String(moduleNum).padStart(2,'0')}`)
}

try { fixFile(path.join(SRC, 'modules', 'LenderMatch.jsx'), 8)  } catch(e) { console.error('✗ LenderMatch:', e.message) }
try { fixFile(path.join(SRC, 'pages',   'RateIntel.jsx'),   22) } catch(e) { console.error('✗ RateIntel:',  e.message) }

console.log('\nDone — restart: taskkill /F /IM node.exe && npm run dev')
