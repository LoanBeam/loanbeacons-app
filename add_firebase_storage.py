"""
add_firebase_storage.py
Adds Firebase Storage initialization to src/firebase/config.js
Run from: C:\\Users\\Sherae's Computer\\loanbeacons-app
"""

path = "src/firebase/config.js"

with open(path, "r", encoding="utf-8") as f:
    c = f.read()

# Add storage import
c = c.replace(
    'import { getFirestore } from "firebase/firestore";',
    'import { getFirestore } from "firebase/firestore";\nimport { getStorage } from "firebase/storage";'
)

# Add storage initialization
c = c.replace(
    'const db = getFirestore(app);',
    'const db = getFirestore(app);\nconst storage = getStorage(app);'
)

# Add storage to exports
c = c.replace(
    'export { app, analytics, db };',
    'export { app, analytics, db, storage };'
)

with open(path, "w", encoding="utf-8") as f:
    f.write(c)

print("firebase/config.js updated — storage initialized and exported.")
