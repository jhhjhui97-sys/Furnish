/* 商家商品：保留原页面布局，管理员录入模型，左侧家具卡片下展开 SKU。 */
(() => {
  const { validateProduct, eligibleProducts, renderProductList, inspectGlb } = FurnishCatalog;
  const html = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const catalog = () => store.products ||= [];
  const byId = id => catalog().find(p => p.id === id);
  const dbName = 'furnish-product-models-v1';
  let database;

  function openDB() {
    if (database) return database;
    database = new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('models');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }).catch(error => { database = null; throw error; });
    return database;
  }
  async function modelTxn(mode, action) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('models', mode);
      const request = action(transaction.objectStore('models'));
      transaction.oncomplete = () => resolve(request?.result);
      transaction.onerror = () => reject(transaction.error || request?.error);
      transaction.onabort = () => reject(transaction.error || Error('模型保存失败'));
    });
  }
  const putModel = (id, blob) => modelTxn('readwrite', s => s.put(blob, id));
  const getModel = id => modelTxn('readonly', s => s.get(id));
  const removeModel = id => modelTxn('readwrite', s => s.delete(id));

  const dialog = document.createElement('dialog');
  dialog.id = 'productManager';
  dialog.innerHTML = `<form method="dialog" class="product-form">
    <div class="product-head"><h2>商家商品管理</h2><button type="button" id="closeProductManager" aria-label="关闭">×</button></div>
    <p class="product-help">先选择对应的家具模板，再上传真实 GLB 模型。旋转预览、确认尺寸后才会入库。</p>
    <div class="product-fields">
      <label>家具模板<select name="template" required></select></label>
      <label>商家编号<input name="merchantId" required placeholder="例如 vendor-01"></label>
      <label>商家名称<input name="merchantName" required></label>
      <label>SKU<input name="sku" required></label>
      <label>商品名称<input name="name" required></label>
      <label>材质<input name="material"></label>
      <label>宽 mm<input name="width" type="number" min="50" max="20000" required></label>
      <label>深 mm<input name="depth" type="number" min="50" max="20000" required></label>
      <label>高 mm<input name="height" type="number" min="50" max="20000" required></label>
      <label>供货价 ¥（内部）<input name="supplyPrice" type="number" min="0" step="0.01" required></label>
      <label>业主销售价 ¥<input name="salePrice" type="number" min="0" step="0.01" required></label>
      <label class="full">详细备注<textarea name="note" rows="2" maxlength="1000"></textarea></label>
      <fieldset class="full"><legend>适用风格（可多选）</legend><label><input type="checkbox" name="style" value="现代简约">现代简约</label><label><input type="checkbox" name="style" value="轻奢">轻奢</label><label><input type="checkbox" name="style" value="新中式">新中式</label></fieldset>
      <fieldset class="full"><legend>适用档位（可多选）</legend><label><input type="checkbox" name="tier" value="经济">经济</label><label><input type="checkbox" name="tier" value="标准">标准</label><label><input type="checkbox" name="tier" value="高配">高配</label></fieldset>
      <label class="full">商品模型 GLB<input name="model" type="file" accept=".glb,model/gltf-binary"></label>
    </div>
    <div id="productPreview" aria-label="商品模型预览"></div>
    <div id="productError" role="alert"></div>
    <div class="product-actions"><button type="button" id="previewProduct">预览并校正尺寸</button><button type="button" id="saveProduct" disabled>确认入库</button></div>
    <h3>已审核商品</h3><div id="savedProducts"></div>
  </form>`;
  document.body.append(dialog);
  const form = dialog.querySelector('form');
  const errorBox = dialog.querySelector('#productError');
  const previewBox = dialog.querySelector('#productPreview');
  const saveButton = dialog.querySelector('#saveProduct');
  const templateSelect = form.elements.template;
  let currentFile = null, currentId = null, previewed = false, renderer = null, previewFrame = 0;
  const templates = LIB.flatMap(group => group.items.map(item => ({item, label:`${group.cat} / ${item[1]}`})));
  templateSelect.innerHTML = templates.map((t,i) => `<option value="${i}">${html(t.label)}</option>`).join('');

  function stopPreview() {
    cancelAnimationFrame(previewFrame);
    renderer?.dispose(); renderer?.domElement.remove(); renderer = null;
  }
  const setError = message => errorBox.textContent = message || '';
  function values() {
    const field = name => form.elements[name].value.trim();
    const base = templates[+field('template')].item;
    return {
      id:currentId || `sku-${crypto.randomUUID()}`, merchantId:field('merchantId'), merchantName:field('merchantName'),
      sku:field('sku'), name:field('name'), category:base[0], templateType:base[0], templateName:base[1],
      width:+field('width'), depth:+field('depth'), height:+field('height'), material:field('material'), note:field('note'),
      supplyPrice:+field('supplyPrice'), salePrice:+field('salePrice'),
      styles:[...form.querySelectorAll('[name=style]:checked')].map(el=>el.value),
      tiers:[...form.querySelectorAll('[name=tier]:checked')].map(el=>el.value),
      modelKind:'glb', status:'approved',
    };
  }
  function reset() {
    stopPreview(); form.reset(); currentFile = null; currentId = null; previewed = false;
    saveButton.disabled = true; previewBox.textContent = '选择 GLB 后点击“预览并校正尺寸”'; setError('');
  }
  function refreshSaved() {
    dialog.querySelector('#savedProducts').innerHTML = catalog().map(p => `<div class="saved-product"><span><b>${html(p.name)}</b> · ${html(p.sku)} · ${html(p.merchantName)}<br><small>${p.width}×${p.depth}×${p.height} mm · 供货 ¥${p.supplyPrice} / 销售 ¥${p.salePrice}</small></span><button type="button" data-edit="${html(p.id)}">编辑</button><button type="button" data-remove="${html(p.id)}">删除</button></div>`).join('') || '<p>还没有审核商品</p>';
  }
  function open() { refreshSaved(); dialog.showModal(); }
  document.querySelector('#manageProducts').addEventListener('click', open);
  dialog.querySelector('#closeProductManager').onclick = () => dialog.close();
  dialog.addEventListener('close', reset);
  form.querySelectorAll('input,select,textarea').forEach(el => el.addEventListener('input', () => { previewed = false; saveButton.disabled = true; }));

  function fitModel(object, product, THREE) {
    const width = product.width ?? product.w, depth = product.depth ?? product.d, height = product.height ?? product.h;
    const original = new THREE.Box3().setFromObject(object);
    const size = original.getSize(new THREE.Vector3());
    if ([size.x,size.y,size.z].filter(n => n > 1e-5).length < 2) throw Error('模型缺少有效尺寸');
    object.scale.set(size.x > 1e-5 ? width / 1000 / size.x : 1,
      size.y > 1e-5 ? height / 1000 / size.y : 1,
      size.z > 1e-5 ? depth / 1000 / size.z : 1);
    const scaled = new THREE.Box3().setFromObject(object);
    const center = scaled.getCenter(new THREE.Vector3());
    object.position.sub(new THREE.Vector3(center.x, scaled.min.y, center.z));
    return object;
  }
  async function parseModel(blob, product) {
    const [{GLTFLoader}, THREE] = await Promise.all([import('three/addons/loaders/GLTFLoader.js'), import('three')]);
    const buffer = await blob.arrayBuffer();
    inspectGlb(buffer);
    const gltf = await new GLTFLoader().parseAsync(buffer, '');
    return {object:fitModel(gltf.scene, product, THREE), THREE};
  }
  async function preview() {
    setError(''); stopPreview();
    try {
      const modelInput = form.elements.model;
      currentFile = modelInput.files[0] || (currentId ? await getModel(currentId) : null);
      if (!currentFile) throw Error('请选择 GLB 文件');
      if (currentFile.size > 100 * 1024 * 1024) throw Error('模型超过 100 MB，请先压缩');
      const product = values();
      const checked = validateProduct(product, catalog());
      if (!checked.ok) throw Error('请填写并检查：' + checked.errors.join('、'));
      const {object, THREE} = await parseModel(currentFile, product);
      const scene = new THREE.Scene(); scene.background = new THREE.Color(0xf3f0ea);
      scene.add(object, new THREE.HemisphereLight(0xffffff,0xc8beb0,2));
      const key = new THREE.DirectionalLight(0xffffff,2);key.position.set(2,4,5);scene.add(key);
      const camera = new THREE.PerspectiveCamera(45,1.7,.01,100);
      const longest = Math.max(product.width,product.depth,product.height)/1000;
      camera.position.set(longest*1.8,longest*1.25,longest*1.8);camera.lookAt(0,product.height/2000,0);
      renderer = new THREE.WebGLRenderer({antialias:true});renderer.setSize(510,300);renderer.outputColorSpace=THREE.SRGBColorSpace;
      renderer.toneMapping=THREE.ACESFilmicToneMapping;previewBox.replaceChildren(renderer.domElement);
      let angle=0;const tick=()=>{previewFrame=requestAnimationFrame(tick);angle+=.005;object.rotation.y=angle;renderer.render(scene,camera);};tick();
      previewed = true;saveButton.disabled = false;
    } catch(error) { previewed=false;saveButton.disabled=true;setError('模型预览失败：'+error.message); }
  }
  dialog.querySelector('#previewProduct').onclick = preview;
  async function commitProduct() {
    if (!previewed || !currentFile) return;
    const product = values(), checked = validateProduct(product, catalog());
    if (!checked.ok) return setError('请填写并检查：'+checked.errors.join('、'));
    try {
      const items = catalog(), index = items.findIndex(p=>p.id===product.id);
      const previous = index >= 0 ? items[index] : null;
      const previousModel = index >= 0 ? await getModel(product.id) : null;
      await putModel(product.id,currentFile);
      if (index >= 0) items[index] = checked.product; else items.push(checked.product);
      save();
      if (saveErr) {
        if (index >= 0) items[index] = previous; else items.pop();
        if (previousModel) await putModel(product.id,previousModel); else await removeModel(product.id);
        throw Error('商品资料未能保存，请检查本地存储空间');
      }
      refreshSaved();buildLib();window.View3D?.sync(true);reset();toast('商品已审核入库');
    } catch(error) { setError('入库失败：'+error.message); }
  }
  saveButton.onclick = commitProduct;
  dialog.querySelector('#savedProducts').onclick = async event => {
    const edit = event.target.closest('[data-edit]'), remove = event.target.closest('[data-remove]');
    if (edit) {
      const p = byId(edit.dataset.edit); reset();currentId=p.id;
      const i = templates.findIndex(t=>t.item[0]===p.templateType && t.item[1]===p.templateName);templateSelect.value=String(Math.max(0,i));
      for(const key of ['merchantId','merchantName','sku','name','material','width','depth','height','supplyPrice','salePrice','note'])form.elements[key].value=p[key]??'';
      form.querySelectorAll('[name=style]').forEach(el=>el.checked=p.styles.includes(el.value));
      form.querySelectorAll('[name=tier]').forEach(el=>el.checked=p.tiers.includes(el.value));
      previewBox.textContent='点击“预览并校正尺寸”重新确认';
    }
    if (remove) {
      const p=byId(remove.dataset.remove);
      if(!confirm(`删除商品「${p.name}」？已摆放的商品快照会保留。`))return;
      const old=[...catalog()];store.products=old.filter(x=>x.id!==p.id);save();
      if(saveErr){store.products=old;return setError('删除未保存成功');}
      // Keep the GLB in IndexedDB for older saved design instances using this productId.
      refreshSaved();buildLib();window.View3D?.sync(true);toast('商品已删除');
    }
  };

  function productChoices(item) { return eligibleProducts(catalog(), {category:item[0]}); }
  function hasProducts(item) { return productChoices(item).length > 0; }
  function toggle(element, item) {
    const old=element.nextElementSibling;
    if(old?.classList.contains('sku-list')){old.remove();return;}
    element.parentElement.querySelectorAll('.sku-list').forEach(other => other.remove());
    const panel=document.createElement('div');panel.className='sku-list';panel.innerHTML=renderProductList(productChoices(item));
    element.insertAdjacentElement('afterend',panel);
  }
  document.querySelector('#lib').addEventListener('pointerdown',event=>{
    if(event.target.closest('[data-product]')) { libDrag=null;event.stopPropagation(); }
  },true);
  document.querySelector('#lib').addEventListener('click',event=>{
    const button=event.target.closest('[data-product]');if(!button)return;
    const p=byId(button.dataset.product);if(!p)return;
    const base=templates.find(t=>t.item[0]===p.templateType && t.item[1]===p.templateName)?.item;
    if(!base)return;
    let point;
    if(ui.sel?.kind==='room'){const r=ROOMS.find(x=>x.id===ui.sel.id),b=bbox(r.poly);point={x:(b[0]+b[2])/2,y:(b[1]+b[3])/2};}
    else if(is3D()){const r=document.querySelector('#stage').getBoundingClientRect();point=window.View3D.groundAt(r.left+r.width/2,r.top+r.height/2);}
    if(!point)point={x:view.x0+svg.clientWidth/2/view.s,y:view.y0+svg.clientHeight/2/view.s};
    const placed=F(base[0],p.name,Math.round(point.x/10)*10,Math.round(point.y/10)*10,p.width,p.depth,0,base[4]);
    Object.assign(placed,{productId:p.id,sku:p.sku,merchantId:p.merchantId,merchantName:p.merchantName,material:p.material,note:p.note,price:p.salePrice,h:p.height});
    pushOut(placed);
    mutate(() => state.furniture.push(placed));
    selectIds([placed.id]);
    toast(`已添加「${p.name}」 · SKU ${p.sku}`, {label:'撤销',fn:undo});
  });

  window.FurnishProductUI={hasProducts,toggle,getModel,parseModel};
})();
