import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../catalog.js';
const { validateProduct, eligibleProducts, publicProduct, inspectGlb, renderProductList } = catalog;

const input = {
  merchantId: 'maker-1', merchantName: '合作家具厂', sku: 'SOFA-001',
  name: '三人沙发', category: '沙发', width: 2400, depth: 900, height: 820,
  material: '布艺', note: '可选浅灰色', supplyPrice: 2800, salePrice: 3999,
  styles: ['现代简约', '轻奢'], tiers: ['经济', '标准'],
  modelKind: 'glb', status: 'pending',
};

test('valid product keeps commercial and public fields separate', () => {
  const result = validateProduct(input, []);
  assert.equal(result.ok, true);
  assert.equal(result.product.sku, 'SOFA-001');
  assert.equal(result.product.salePrice, 3999);
  assert.equal(result.product.supplyPrice, 2800);
});

test('duplicate SKU is blocked only for the same merchant', () => {
  assert.equal(validateProduct(input, [{...input, id:'old'}]).ok, false);
  assert.equal(validateProduct(input, [{...input, merchantId:'other'}]).ok, true);
});

test('missing fields and impossible dimensions cannot be approved', () => {
  const result = validateProduct({...input, sku:'', width:0, salePrice:-1}, []);
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes('sku'));
  assert.ok(result.errors.includes('width'));
  assert.ok(result.errors.includes('salePrice'));
});

test('only reviewed products matching category, style and tier are eligible', () => {
  const products = [
    {...input, id:'yes', status:'approved'},
    {...input, id:'wait', sku:'SOFA-002', status:'pending'},
    {...input, id:'other-style', sku:'SOFA-003', status:'approved', styles:['新中式']},
  ];
  assert.deepEqual(
    eligibleProducts(products, {category:'沙发', style:'现代简约', tier:'经济'}).map(p=>p.id),
    ['yes'],
  );
});

test('customer-facing product data excludes internal prices and settlement fields', () => {
  const visible = publicProduct({...input, commissionRate:0.02, entryFee:2000});
  assert.equal(visible.sku, 'SOFA-001');
  assert.equal(visible.salePrice, 3999);
  assert.equal(visible.note, '可选浅灰色');
  assert.equal('supplyPrice' in visible, false);
  assert.equal('commissionRate' in visible, false);
  assert.equal('entryFee' in visible, false);
});

test('GLB inspection rejects a mislabeled or truncated file', () => {
  assert.throws(() => inspectGlb(new Uint8Array([1, 2, 3]).buffer), /GLB/);
  const bad = new ArrayBuffer(12);
  const view = new DataView(bad);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, 200, true);
  assert.throws(() => inspectGlb(bad), /GLB/);
});

test('GLB inspection recognizes glTF 2 and the actual mesh count', () => {
  const json = Buffer.from(JSON.stringify({asset:{version:'2.0'},meshes:[{},{}]}));
  const pad = (4 - json.length % 4) % 4;
  const total = 20 + json.length + pad;
  const bytes = Buffer.alloc(total, 0x20);
  bytes.write('glTF',0,'ascii');bytes.writeUInt32LE(2,4);bytes.writeUInt32LE(total,8);
  bytes.writeUInt32LE(json.length + pad,12);bytes.write('JSON',16,'ascii');json.copy(bytes,20);
  assert.deepEqual(inspectGlb(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)), {assetVersion:'2.0',meshCount:2});
});

test('expanded public SKU list escapes merchant text and excludes wholesale price', () => {
  const html = renderProductList([{...input, id:'product-1', status:'approved', note:'<img src=x onerror=alert(1)>'}]);
  assert.match(html, /SOFA-001/);
  assert.match(html, /3999/);
  assert.match(html, /&lt;img/);
  assert.doesNotMatch(html, /<img/);
  assert.doesNotMatch(html, /2800/);
  assert.match(html, /data-product="product-1"/);
});
