with open("src/pages/ScenarioCreator.jsx", "r", encoding="utf-8") as f:
    c = f.read()

# Remove any leftover runAddressValidation function definition
import re
c = re.sub(
    r'async function runAddressValidation\(addressData\).*?setValidating\(false\);\s*\}',
    '',
    c,
    flags=re.DOTALL
)

# Remove any leftover runAddressValidation call
c = c.replace('runAddressValidation(addr);', '')
c = c.replace('runAddressValidation(addr)', '')

with open("src/pages/ScenarioCreator.jsx", "w", encoding="utf-8") as f:
    f.write(c)

print("Cleaned successfully.")