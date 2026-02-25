"""
fix_intake_imports.py
Fixes firebase import path in LenderIntakeForm.jsx
Run from: C:\\Users\\Sherae's Computer\\loanbeacons-app
"""

path = "src/modules/LenderIntakeForm.jsx"

with open(path, "r", encoding="utf-8") as f:
    c = f.read()

c = c.replace(
    'from "../firebase"',
    'from "../firebase/config"'
)

with open(path, "w", encoding="utf-8") as f:
    f.write(c)

print("LenderIntakeForm.jsx firebase import fixed.")
