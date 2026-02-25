"""
fix_engine_import.py
Fixes the hardMoneyLenderMatrix import path in LenderMatchEngine_hardMoney.js
Run from: C:\\Users\\Sherae's Computer\\loanbeacons-app
"""

path = "src/engines/LenderMatchEngine_hardMoney.js"

with open(path, "r", encoding="utf-8") as f:
    c = f.read()

c = c.replace(
    'from "./hardMoneyLenderMatrix"',
    'from "../data/hardMoneyLenderMatrix"'
)

with open(path, "w", encoding="utf-8") as f:
    f.write(c)

print("Engine import path fixed.")
