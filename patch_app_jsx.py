"""
patch_app_jsx.py
Adds LenderIntakeForm import and route to App.jsx
Run from: C:\\Users\\Sherae's Computer\\loanbeacons-app
"""

path = "src/App.jsx"

with open(path, "r", encoding="utf-8") as f:
    c = f.read()

# Add import
old_import = "import Admin from './pages/Admin';"
new_import = """import Admin from './pages/Admin';
import LenderIntakeForm from './modules/LenderIntakeForm';"""

if old_import not in c:
    print("ERROR: Could not find Admin import. Aborting.")
    import sys; sys.exit(1)

c = c.replace(old_import, new_import, 1)

# Add route
old_route = "        <Route path=\"/admin\" element={<Admin />} />"
new_route = """        <Route path="/admin" element={<Admin />} />
        <Route path="/lender-intake" element={<LenderIntakeForm />} />
        <Route path="/lender-intake/:token" element={<LenderIntakeForm />} />"""

if old_route not in c:
    print("ERROR: Could not find admin route. Aborting.")
    import sys; sys.exit(1)

c = c.replace(old_route, new_route, 1)

with open(path, "w", encoding="utf-8") as f:
    f.write(c)

print("App.jsx patched successfully.")
print("Lender intake form now live at: /lender-intake")
