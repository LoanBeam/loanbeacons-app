# -*- coding: utf-8 -*-
import os, sys

path = os.path.join("src", "pages", "ScenarioCreator.jsx")

if not os.path.exists(path):
    print("ERROR: Could not find " + path)
    sys.exit(1)

with open(path, "r", encoding="utf-8") as f:
    src = f.read()

applied = 0

def patch(src, old, new, label):
    global applied
    if old in src:
        applied += 1
        print("  APPLIED: " + label)
        return src.replace(old, new, 1)
    else:
        print("  SKIPPED: " + label)
        return src

src = patch(src,
    "  const [unit, setUnit] = useState('');",
    "  const [unit, setUnit] = useState('');\n  const [county, setCounty] = useState('');",
    "Add county state var")

src = patch(src,
    "  const [annualHouseholdIncome, setAnnualHouseholdIncome] = useState('');",
    "  const [annualHouseholdIncome, setAnnualHouseholdIncome] = useState('');\n  const [firstTimeBuyer, setFirstTimeBuyer] = useState(false);\n  const [numDependents, setNumDependents] = useState(0);",
    "Add firstTimeBuyer + numDependents state vars")

src = patch(src,
    "        setUnit(d.unit || '');\n        setCensusTract",
    "        setUnit(d.unit || '');\n        setCounty(d.county || '');\n        setCensusTract",
    "Load county in loadScenario")

src = patch(src,
    "        setAnnualHouseholdIncome(d.annualHouseholdIncome || '');",
    "        setAnnualHouseholdIncome(d.annualHouseholdIncome || '');\n        setFirstTimeBuyer(d.firstTimeBuyer || false);\n        setNumDependents(d.numDependents || 0);",
    "Load firstTimeBuyer + numDependents in loadScenario")

src = patch(src,
    "    setUnit(addressData.unit || '');\n    if (addressData.streetAddress",
    "    setUnit(addressData.unit || '');\n    if (addressData.county) {\n      setCounty(addressData.county.replace(/ County$/i, '').trim());\n    }\n    if (addressData.streetAddress",
    "Extract county in handleAddressSelect")

src = patch(src,
    "      streetAddress, city, state, zipCode, unit, censusTract,",
    "      streetAddress, city, state, zipCode, unit, county: county || '', censusTract,",
    "Save county in handleSubmit")

src = patch(src,
    "      householdSize: parseInt(householdSize) || 0,\n      annualHouseholdIncome: parseFloat(annualHouseholdIncome) || 0,",
    "      householdSize: parseInt(householdSize) || 0,\n      annualHouseholdIncome: parseFloat(annualHouseholdIncome) || 0,\n      firstTimeBuyer,\n      numDependents: parseInt(numDependents) || 0,",
    "Save firstTimeBuyer + numDependents in handleSubmit")

with open(path, "w", encoding="utf-8") as f:
    f.write(src)

print("\n" + str(applied) + "/7 patches applied. Restart dev server.")
