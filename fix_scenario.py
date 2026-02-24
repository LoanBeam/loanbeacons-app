f = open('src/components/AddressAutocomplete.jsx', 'r', encoding='utf-8')
c = f.read()
f.close()

c = c.replace(
    "placeElement.addEventListener('gmp-placeselect', async (event) => {",
    "placeElement.addEventListener('gmp-placeselect', async (event) => {\n        console.log('gmp-placeselect fired', event);"
)

c = c.replace(
    "const place = event.place;",
    "const place = event.place;\n        console.log('place object:', place);"
)

f = open('src/components/AddressAutocomplete.jsx', 'w', encoding='utf-8')
f.write(c)
f.close()
print('Debug logging added')