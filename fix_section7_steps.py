"""
fix_section7_steps.py
Finds and fixes the steps arrays to add doc_uploads step.
Run from: C:\\Users\\Sherae's Computer\\loanbeacons-app
"""

import re, sys

path = "src/modules/LenderIntakeForm.jsx"

with open(path, "r", encoding="utf-8") as f:
    c = f.read()

original = c

# Find the getSteps function and show what's in it for diagnosis
start = c.find("const getSteps")
if start == -1:
    print("ERROR: Could not find getSteps function at all.")
    sys.exit(1)

snippet = c[start:start+600]
print("Found getSteps block:")
print(repr(snippet))
print()

# Try to add doc_uploads before submission in each return statement
# Use regex to handle any quote style
def add_doc_uploads(text):
    # Pattern: any return array that ends with 'submission'] or "submission"]
    # Insert 'doc_uploads' before the final submission entry
    pattern = r"(return \[)(.*?)(['\"]submission['\"])\]"
    def replacer(m):
        inner = m.group(2)
        # Only add if not already present
        if 'doc_uploads' in inner:
            return m.group(0)
        quote = m.group(3)[0]  # detect quote style
        return f"{m.group(1)}{inner}{quote}doc_uploads{quote}, {m.group(3)}]"
    return re.sub(pattern, replacer, text, flags=re.DOTALL)

c_new = add_doc_uploads(c)

if c_new == c:
    print("Regex also failed to match. Showing all 'return [' occurrences:")
    for m in re.finditer(r"return \[.*?\]", c, re.DOTALL):
        if 'submission' in m.group():
            print(repr(m.group()))
    sys.exit(1)

# Count how many replacements were made
count = c_new.count('doc_uploads') - c.count('doc_uploads')
print(f"Added doc_uploads to {count} step arrays.")

with open(path, "w", encoding="utf-8") as f:
    f.write(c_new)

print("Steps arrays updated successfully.")
