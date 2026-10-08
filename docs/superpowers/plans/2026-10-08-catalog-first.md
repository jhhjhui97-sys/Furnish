# 龙梦湾本地商品目录 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有界面左侧家具目录展开真实商品，并完成本地商品资料、GLB 文件、审核后入库的基础流程。

**Architecture:** 保留单页应用和 `huxing-design-v2`，把商品元数据放在现有 `store` 的独立字段，较大的模型文件放 IndexedDB。用独立纯函数模块验证商品、过滤可选 SKU；UI 桥接现有目录和户型实例。照片转 3D、九套方案与商家结算分为后续独立计划。

**Tech Stack:** 原生 HTML/CSS/JS、Three.js r160、IndexedDB、Node 内置测试。

**Spec:** `../specs/2026-10-08-longmengwan-pilot-design.md`

## Global Constraints

- 现有布局、仓库已有的 12 套户型及 `huxing-design-v2` 历史数据保持可读；不加入示例 P13。
- 本阶段商品模型优先使用打包完整的 GLB；外部贴图 glTF 后续支持。商品资料录入由员工负责，发布前需明确确认。
- 客户可见列表显示 SKU、名称、尺寸、材质、销售价、商家和备注；供货价与费率仅内部可见。
- 照片生成默认不运行、不上传；TRELLIS.2 后续单独验证。

## Review Focus

- 同商家重复 SKU：阻止保存且保留已填字段。
- 模型损坏或不支持的纹理：提示错误，不发布商品。
- 浏览器本地存储空间不足：提示并保持上一版本商品。
- 商品被方案引用后删除：实例显示“商品已下架”，历史报价不消失。
- 应用重启：商品资料、模型和审核状态仍可用。

---

### Task 1: 商品规则与存储

**Files:** Create `catalog.js`, `tests/catalog.test.mjs`; modify `index.html` to load the local script.

**Interfaces:** `validateProduct(input, existing) -> {ok,errors,product}`; `eligibleProducts(products, filters) -> Product[]`; `openAssetDB()`, `saveModel(id, Blob)`, `getModel(id)`.

- [ ] Write tests for required fields, dimensions, price, SKU uniqueness within merchant, review state and style matching.
- [ ] Run `node --test --test-isolation=none tests/catalog.test.mjs`; confirm expected failures.
- [ ] Implement minimal pure rules and IndexedDB adapter.
- [ ] Run tests; confirm pass.
- [ ] Re-run `node validate-plans.mjs` and syntax checks.

### Task 2: 保持现有界面的商品管理与左侧目录

**Files:** Modify `index.html`; create `catalog-ui.js` for product form, storage, preview and left-side choices.

**Interfaces:** Existing store gains `products: []`; left catalog cards use `productId`; form submits to validation/storage from Task 1.

- [ ] Test missing product UI and internal price leakage prevention, verify failures.
- [ ] Add top-bar management entry, import/preview/confirm form, and on-card expansion below matching furniture in left panel.
- [ ] Show all public fields in product rows; internal fields only in manager panel.
- [ ] Run tests and plan validator; manually inspect if browser runtime is available.

### Task 3: 已审核 GLB 在 3D 户型中展示

**Files:** Modify `index.html`; vendor matching Three.js r160 loader and its allowed decoders into `vendor/`; create `tests/model-import.test.mjs`.

**Interfaces:** Furniture instance `productId` resolves to product, loads its local GLB blob, applies user-confirmed dimensions and rotation; on import failure it remains unapproved.

- [ ] Test GLB magic/version validation, dimensions and model-to-product linkage; watch failures.
- [ ] Implement model preview and scene integration without breaking existing selection/drag/rotate.
- [ ] Verify with actual furniture GLB and application reload; preserve user data.

## Next working plans

After this independently testable catalog phase: (1) nine方案选择与三档预算；(2)内部/业主报价和商家结算；(3)TRELLIS.2 远程生成适配器。Each receives its own detailed plan and validation before implementation.
