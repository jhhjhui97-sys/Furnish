/* Shared product rules. Loaded as a classic script so file:// installations keep working. */
const FurnishCatalog = (() => {
  const styles = new Set(['现代简约', '轻奢', '新中式']);
  const tiers = new Set(['经济', '标准', '高配']);
  const finite = n => typeof n === 'number' && Number.isFinite(n);

  function validateProduct(input, existing = []) {
    const errors = [];
    const product = {
      ...input,
      merchantId: String(input.merchantId || '').trim(),
      merchantName: String(input.merchantName || '').trim(),
      sku: String(input.sku || '').trim(),
      name: String(input.name || '').trim(),
      category: String(input.category || '').trim(),
      material: String(input.material || '').trim(),
      note: String(input.note || '').trim(),
      styles: Array.isArray(input.styles) ? [...new Set(input.styles)] : [],
      tiers: Array.isArray(input.tiers) ? [...new Set(input.tiers)] : [],
    };
    for (const key of ['merchantId', 'merchantName', 'sku', 'name', 'category']) {
      if (!product[key]) errors.push(key);
    }
    for (const key of ['width', 'depth', 'height']) {
      if (!finite(product[key]) || product[key] < 50 || product[key] > 20000) errors.push(key);
    }
    for (const key of ['supplyPrice', 'salePrice']) {
      if (!finite(product[key]) || product[key] < 0) errors.push(key);
    }
    if (!product.styles.length || product.styles.some(s => !styles.has(s))) errors.push('styles');
    if (!product.tiers.length || product.tiers.some(t => !tiers.has(t))) errors.push('tiers');
    if (existing.some(p => p.merchantId === product.merchantId && p.sku.toLowerCase() === product.sku.toLowerCase() && p.id !== product.id)) errors.push('sku');
    if (!['pending', 'approved', 'rejected'].includes(product.status)) errors.push('status');
    if (!['glb', 'gltf', 'photo'].includes(product.modelKind)) errors.push('modelKind');
    return { ok: errors.length === 0, errors: [...new Set(errors)], product };
  }

  function eligibleProducts(products, { category, style, tier } = {}) {
    return products.filter(p => p.status === 'approved' &&
      (!category || p.category === category) &&
      (!style || p.styles.includes(style)) &&
      (!tier || p.tiers.includes(tier)));
  }

  function publicProduct(product) {
    const keys = ['id', 'merchantName', 'sku', 'name', 'category', 'width', 'depth', 'height', 'material', 'note', 'salePrice', 'styles', 'tiers', 'status'];
    return Object.fromEntries(keys.filter(key => key in product).map(key => [key, product[key]]));
  }

  function inspectGlb(buffer) {
    if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 20) throw new Error('无效 GLB 文件');
    const view = new DataView(buffer);
    if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== buffer.byteLength) throw new Error('无效 GLB 文件');
    const length = view.getUint32(12, true);
    if (view.getUint32(16, true) !== 0x4e4f534a || length < 2 || length > buffer.byteLength - 20) throw new Error('无效 GLB 文件');
    let json;
    try { json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, length))); }
    catch { throw new Error('无效 GLB 文件'); }
    if (json.asset?.version !== '2.0' || !Array.isArray(json.meshes) || !json.meshes.length) throw new Error('GLB 缺少可展示的 glTF 2.0 网格');
    return {assetVersion:'2.0', meshCount:json.meshes.length};
  }

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function renderProductList(products) {
    if (!products.length) return '<div class="sku-empty">该家具暂无已审核商品</div>';
    return products.map(raw => {
      const p = publicProduct(raw), e = escapeHtml;
      return `<div class="sku-row"><b>${e(p.name)}</b><small>SKU ${e(p.sku)} · ${e(p.merchantName)}</small>` +
        `<small>${e(p.width)}×${e(p.depth)}×${e(p.height)} mm · ${e(p.material)}</small>` +
        `<small>${e(p.styles.join(' / '))} · ${e(p.tiers.join(' / '))}</small>` +
        `<span class="sku-note">${e(p.note)}</span><strong>¥${e(p.salePrice)}</strong>` +
        `<button type="button" class="btn chip" data-product="${e(p.id)}">加入方案</button></div>`;
    }).join('');
  }

  return { validateProduct, eligibleProducts, publicProduct, inspectGlb, renderProductList };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = FurnishCatalog;
