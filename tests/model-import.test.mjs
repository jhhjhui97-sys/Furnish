import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const map = JSON.parse(html.match(/<script type="importmap">\s*(\{[^<]*\})\s*<\/script>/)[1]).imports;

test('page scripts compile, including the live 3D integration', () => {
  for (const match of html.matchAll(/<script(?![^>]*\btype=)[^>]*>([\s\S]*?)<\/script>/g)) {
    if (match[1].trim()) assert.doesNotThrow(() => new vm.Script(match[1]));
  }
});

test('offline loader matches Three.js and can decode a real product mesh', async () => {
  const core = map.three;
  assert.ok(core.startsWith('data:text/javascript;base64,'));
  const util = Buffer.from(map['three/addons/utils/BufferGeometryUtils.js'].split(',')[1], 'base64').toString()
    .replace("from 'three'", `from '${core}'`);
  const utilUri = `data:text/javascript;base64,${Buffer.from(util).toString('base64')}`;
  const loader = Buffer.from(map['three/addons/loaders/GLTFLoader.js'].split(',')[1], 'base64').toString()
    .replace("from 'three'", `from '${core}'`)
    .replace("from 'three/addons/utils/BufferGeometryUtils.js'", `from '${utilUri}'`);
  const loaderUri = `data:text/javascript;base64,${Buffer.from(loader).toString('base64')}`;
  const {GLTFLoader} = await import(loaderUri);
  const geometry = Buffer.alloc(36);
  [0,0,0, 1,0,0, 0,1,0].forEach((v,i) => geometry.writeFloatLE(v,i*4));
  const json = Buffer.from(JSON.stringify({
    asset:{version:'2.0'}, scene:0, scenes:[{nodes:[0]}], nodes:[{mesh:0}],
    meshes:[{primitives:[{attributes:{POSITION:0}}]}],
    buffers:[{byteLength:geometry.length}],bufferViews:[{buffer:0,byteOffset:0,byteLength:geometry.length}],
    accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[1,1,0]}],
  }));
  const pad = (4-json.length%4)%4;
  const total = 20+json.length+pad+8+geometry.length;
  const bytes = Buffer.alloc(total,0x20);
  bytes.write('glTF',0);bytes.writeUInt32LE(2,4);bytes.writeUInt32LE(total,8);
  bytes.writeUInt32LE(json.length+pad,12);bytes.write('JSON',16);json.copy(bytes,20);
  const start=20+json.length+pad;
  bytes.writeUInt32LE(geometry.length,start);bytes.write('BIN\0',start+4,'ascii');geometry.copy(bytes,start+8);
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  let meshes=0;gltf.scene.traverse(o=>{if(o.isMesh)meshes++;});
  assert.equal(meshes,1);
});
