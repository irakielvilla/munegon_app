import json

# Update package.json
with open('package.json', 'r', encoding='utf-8') as f:
    pkg = json.load(f)
pkg['version'] = '1.1.0'
with open('package.json', 'w', encoding='utf-8') as f:
    json.dump(pkg, f, indent=2)

# Update tauri.conf.json
with open('src-tauri/tauri.conf.json', 'r', encoding='utf-8') as f:
    tauri = json.load(f)
tauri['version'] = '1.1.0'
with open('src-tauri/tauri.conf.json', 'w', encoding='utf-8') as f:
    json.dump(tauri, f, indent=2)

# Update LoginScreen.astro
with open('src/components/LoginScreen.astro', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("v1.0.8 &nbsp;", "v1.1.0 &nbsp;")

with open('src/components/LoginScreen.astro', 'w', encoding='utf-8') as f:
    f.write(content)

print("Version updated to 1.1.0 in package.json, tauri.conf.json, and LoginScreen.astro")
