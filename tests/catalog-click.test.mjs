import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import catalog from '../catalog.js';

test('clicking a furniture card opens its SKU list even before any product is approved', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const start = html.indexOf('function endLibDrag(e, ok){');
  const end = html.indexOf("addEventListener('pointerup'", start);
  assert.ok(start > 0 && end > start);
  let opened = 0, added = 0;
  const context = {
    libDrag:{id:1,el:{classList:{remove(){}}},ghost:null,it:['sofa','沙发',2400,900]},
    window:{FurnishProductUI:{hasProducts:()=>false,toggle:()=>opened++}},
    ui:{sel:null},is3D:()=>false,view:{x0:0,y0:0,s:1},svg:{clientWidth:100,clientHeight:100},
    addItem:()=>added++,closeDrawers:()=>{},
  };
  vm.runInNewContext(`${html.slice(start,end)}\nendLibDrag({pointerId:1},true);`,context);
  assert.equal(opened,1);
  assert.equal(added,0);
});

test('empty product list explains how to add a SKU and keeps sample furniture available', () => {
  const list = catalog.renderProductList([]);
  assert.match(list,/暂无已审核商品/);
  assert.match(list,/data-manage-products/);
  assert.match(list,/data-add-template/);
});

test('empty-list actions open product manager or place the original sample item', () => {
  const source = readFileSync(new URL('../catalog-ui.js', import.meta.url), 'utf8');
  const start = source.indexOf("document.querySelector('#lib').addEventListener('click'");
  const end = source.indexOf('window.FurnishProductUI=',start);
  assert.ok(start > 0 && end > start);
  let handler, opened=0, added=0;
  const item=['sofa','示意沙发',2400,900], card={};
  const context={
    document:{querySelector:()=>({addEventListener:(_name,fn)=>{handler=fn;}})},
    open:()=>opened++,itemOf:()=>item,addItem:(value,x,y)=>{assert.equal(value,item);assert.equal(x,50);assert.equal(y,50);added++;},
    ui:{sel:null},is3D:()=>false,view:{x0:0,y0:0,s:1},svg:{clientWidth:100,clientHeight:100},
  };
  vm.runInNewContext(source.slice(start,end),context);
  handler({target:{closest:selector=>selector==='[data-manage-products]' ? {} : null}});
  const demo={closest:selector=>selector==='.sku-list' ? {previousElementSibling:card} : null};
  handler({target:{closest:selector=>selector==='[data-add-template]' ? demo : null}});
  assert.equal(opened,1);
  assert.equal(added,1);
});
