import { readFileSync, writeFileSync } from 'node:fs';

// Keep all Three modules in the page's import map so the app opens from file://.
const htmlPath = new URL('../index.html', import.meta.url);
const read = name => readFileSync(new URL(`../vendor/${name}`, import.meta.url), 'utf8');
const dataUri = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const html = readFileSync(htmlPath, 'utf8');
const match = html.match(/<script type="importmap">\s*(\{[^<]*\})\s*<\/script>/);
if (!match) throw Error('Three import map not found');
const imports = JSON.parse(match[1]).imports;
if (!imports.three) throw Error('Three.js core not found');
imports['three/addons/utils/BufferGeometryUtils.js'] = dataUri(read('BufferGeometryUtils.js'));
imports['three/addons/loaders/GLTFLoader.js'] = dataUri(
  read('GLTFLoader.js').replace("from '../utils/BufferGeometryUtils.js'", "from 'three/addons/utils/BufferGeometryUtils.js'")
);
const replacement = `<script type="importmap">\n${JSON.stringify({imports})}\n</script>`;
writeFileSync(htmlPath, html.replace(match[0], replacement));
console.log('Embedded GLTFLoader and BufferGeometryUtils in offline import map');
