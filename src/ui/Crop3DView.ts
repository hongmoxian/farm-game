import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { CropDefinition } from "../data/CropDefinition";
import type { GameConfig } from "../config/GameConfig";

/**
 * GLB 模型缓存与加载（来源：Quaternius Ultimate Crops 等，CC0 公有领域）。
 * 文件位于 public/models/，由 crops.json 的 gltfFile 字段映射。
 */
const modelCache = new Map<string, Promise<THREE.Group>>();

function loadModel(file: string): Promise<THREE.Group> {
  if (!modelCache.has(file)) {
    const loader = new GLTFLoader();
    modelCache.set(
      file,
      loader.loadAsync(`/models/${file}`).then((g) => g.scene)
    );
  }
  return modelCache.get(file)!;
}

/** 材质词条 -> 果实 3D 材质参数（铸铁/冰晶/青铜/琥珀/璀璨/琉璃/明珠/青玉） */
const MATERIAL_PROPS: Record<string, Partial<THREE.MeshStandardMaterialParameters>> = {
  iron: { color: 0x707a7c, metalness: 0.9, roughness: 0.5 },
  ice: { color: 0xbfe8ff, metalness: 0.2, roughness: 0.1, transparent: true, opacity: 0.78 },
  bronze: { color: 0xb0783c, metalness: 0.85, roughness: 0.35 },
  amber: { color: 0xe8a13d, metalness: 0.3, roughness: 0.2, transparent: true, opacity: 0.88, emissive: 0x3a2500 },
  brilliant: { color: 0xffe066, metalness: 1.0, roughness: 0.05, emissive: 0x554400 },
  glaze: { color: 0x9b7ede, metalness: 0.3, roughness: 0.12, transparent: true, opacity: 0.82 },
  pearl: { color: 0xf2ead9, metalness: 0.5, roughness: 0.25 },
  jade: { color: 0x2fa37a, metalness: 0.3, roughness: 0.25 },
};

/** 卡通叶材（低多边形观感：Toon 材质 + 高饱和绿色） */
const toon = (color: number) => new THREE.MeshToonMaterial({ color });
const stdMat = (params: THREE.MeshStandardMaterialParameters) =>
  new THREE.MeshStandardMaterial({ roughness: 0.55, ...params });

const GREEN_LEAF = 0x58b368;
const GREEN_DARK = 0x3e8e5a;
const TRUNK = 0x8a5a33;
const SOIL = 0x8a5a33;
const SOIL_DARK = 0x6e4526;
const GRASS = 0x7ec850;

/** 3D 视图句柄：update 用于弹窗每秒同步进度/变异；dispose 释放资源 */
export interface Crop3DHandle {
  update: (progress: number, mutations: string[], variants: Record<string, string> | undefined) => void;
  dispose: () => void;
}

/**
 * Crop3DView：低多边形卡通风 3D 作物预览（Three.js，程序化建模）。
 * - 田垄地块：草地基座 + 耕土 + 垄沟 + 小花装饰
 * - 7 种植物原型（crops.json 的 model 字段）：grain/leafy/bush/ground/stalk/tree/cactus
 * - 按成长进度整体长大；颜色变异染果实、材质变异改质感+水晶环绕、巨大化整体放大
 * - 变化通过 update() 实时应用，无需重建 WebGL 上下文
 */
export function mountCrop3D(
  container: HTMLElement,
  def: CropDefinition,
  mutations: string[],
  variants: Record<string, string> | undefined,
  config: GameConfig,
  progress: number
): Crop3DHandle {
  const width = container.clientWidth || 300;
  const height = container.clientHeight || 200;

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch {
    // WebGL 不可用时降级为大号 emoji
    container.textContent = def.icon;
    container.style.fontSize = "72px";
    container.style.textAlign = "center";
    return { update: () => {}, dispose: () => {} };
  }

  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);
  renderer.domElement.style.borderRadius = "12px";

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
  camera.position.set(2.4, 2.9, 3.8);
  camera.lookAt(0, 0.85, 0);

  // 灯光：半球光（天空蓝 + 草地反光）营造卡通明快氛围 + 带阴影的方向光
  scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x9cde7a, 0.95));
  const dir = new THREE.DirectionalLight(0xffffff, 1.15);
  dir.position.set(4, 7, 3);
  dir.castShadow = true;
  dir.shadow.mapSize.set(1024, 1024);
  dir.shadow.camera.left = -3;
  dir.shadow.camera.right = 3;
  dir.shadow.camera.top = 3;
  dir.shadow.camera.bottom = -3;
  scene.add(dir);

  // ---------- 地块：草地 + 耕土 + 垄沟 + 小花 ----------
  const ground = new THREE.Group();
  const grass = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.4, 2.3), toon(GRASS));
  grass.position.y = 0.2;
  grass.receiveShadow = true;
  const soil = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.22, 1.9), toon(SOIL));
  soil.position.y = 0.48;
  soil.receiveShadow = true;
  ground.add(grass, soil);
  for (const z of [-0.55, 0, 0.55]) {
    const furrow = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 0.24), toon(SOIL_DARK));
    furrow.position.set(0, 0.6, z);
    ground.add(furrow);
  }
  // 角落小花与石子装饰
  const deco: Array<[number, number]> = [
    [-1.0, -0.95], [1.0, -0.9], [0.95, 0.95],
  ];
  for (const [x, z] of deco) {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.14), toon(GREEN_DARK));
    stem.position.set(x, 0.47, z);
    const petal = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), toon(0xffffff));
    petal.position.set(x, 0.56, z);
    ground.add(stem, petal);
  }
  scene.add(ground);

  // ---------- 植物：按原型程序化建模（作为 GLB 加载完成前的兜底） ----------
  const fallbackPlant = new THREE.Group();
  /** 会随变异变色的果实/可染色部分 */
  const fruits: THREE.Mesh[] = [];
  const fruitColor = new THREE.Color(def.color).getHex();

  const addFruit = (mesh: THREE.Mesh) => {
    mesh.castShadow = true;
    fruits.push(mesh);
    return mesh;
  };
  const leafBlob = (r: number, x: number, y: number, z: number, color = GREEN_LEAF) => {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), toon(color));
    m.position.set(x, y, z);
    m.castShadow = true;
    return m;
  };

  switch (def.model) {
    case "grain": {
      // 麦丛：多根麦秆 + 穗
      const positions: Array<[number, number]> = [[0, 0], [0.28, 0.15], [-0.26, 0.18], [0.12, -0.26], [-0.18, -0.2]];
      for (const [x, z] of positions) {
        const h = 0.75 + (x + z) * 0.1;
        const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, h, 6), toon(0x9fbf4e));
        stalk.position.set(x, h / 2, z);
        stalk.castShadow = true;
        const ear = addFruit(new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.18, 4, 8), stdMat({ color: fruitColor, roughness: 0.7 })));
        ear.position.set(x, h + 0.1, z);
        fallbackPlant.add(stalk, ear);
      }
      break;
    }
    case "leafy": {
      // 叶菜/根茎：外圈叶片 + 土里冒头的果实
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.55, 6), toon(GREEN_LEAF));
        leaf.position.set(Math.cos(a) * 0.18, 0.28, Math.sin(a) * 0.18);
        leaf.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
        leaf.castShadow = true;
        fallbackPlant.add(leaf);
      }
      const root = addFruit(new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), stdMat({ color: fruitColor })));
      root.position.set(0, 0.08, 0);
      fallbackPlant.add(root);
      break;
    }
    case "bush": {
      // 灌木浆果：绿叶团 + 表面小果
      const blobs: Array<[number, number, number, number]> = [
        [0.3, 0, 0.42, 0], [0.22, 0.24, 0.32, 0.14], [0.2, -0.22, 0.3, -0.12],
      ];
      for (const [r, x, y, z] of blobs) fallbackPlant.add(leafBlob(r, x, y, z));
      const spots: Array<[number, number, number]> = [
        [0.28, 0.5, 0.18], [-0.26, 0.44, 0.1], [0.05, 0.3, 0.3], [0.2, 0.38, -0.24], [-0.18, 0.52, -0.16], [0.0, 0.6, 0.05],
      ];
      for (const [x, y, z] of spots) {
        const f = addFruit(new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 10), stdMat({ color: fruitColor })));
        f.position.set(x, y, z);
        fallbackPlant.add(f);
      }
      break;
    }
    case "stalk": {
      // 玉米：三根高秆 + 叶 + 苞谷棒
      const positions: Array<[number, number]> = [[0, 0], [0.26, 0.18], [-0.24, -0.14]];
      for (const [x, z] of positions) {
        const h = 1.15;
        const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, h, 6), toon(0x6fae4e));
        stalk.position.set(x, h / 2, z);
        stalk.castShadow = true;
        const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.5, 6), toon(GREEN_LEAF));
        leaf.position.set(x + 0.14, h * 0.55, z);
        leaf.rotation.z = -1.1;
        leaf.castShadow = true;
        fallbackPlant.add(stalk, leaf);
        const cob = addFruit(new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.22, 4, 8), stdMat({ color: fruitColor, roughness: 0.7 })));
        cob.position.set(x + 0.1, h * 0.62, z + 0.04);
        cob.rotation.z = 0.5;
        fallbackPlant.add(cob);
      }
      break;
    }
    case "ground": {
      // 坐地瓜果：藤蔓 + 大果子趴在地上
      for (const [x, z] of [[-0.5, 0.3], [-0.15, 0.42], [0.25, 0.36]] as Array<[number, number]>) {
        const vine = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), toon(GREEN_DARK));
        vine.scale.set(1.4, 0.6, 1);
        vine.position.set(x, 0.68, z);
        fallbackPlant.add(vine);
      }
      const big = addFruit(new THREE.Mesh(new THREE.SphereGeometry(0.36, 16, 14), stdMat({ color: fruitColor })));
      big.position.set(0.22, 0.84, -0.1);
      big.scale.y = 0.85;
      const small = addFruit(new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), stdMat({ color: fruitColor })));
      small.position.set(-0.28, 0.76, -0.22);
      fallbackPlant.add(big, small);
      break;
    }
    case "tree": {
      // 乔木果树：树干 + 树冠 + 挂果
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.6, 8), toon(TRUNK));
      trunk.position.y = 0.3;
      trunk.castShadow = true;
      fallbackPlant.add(trunk);
      const canopy: Array<[number, number, number, number]> = [
        [0.34, 0, 0.85, 0], [0.26, 0.26, 0.7, 0.12], [0.24, -0.24, 0.72, -0.1], [0.22, 0.02, 1.05, 0.02],
      ];
      for (const [r, x, y, z] of canopy) fallbackPlant.add(leafBlob(r, x, y, z));
      const spots: Array<[number, number, number]> = [
        [0.3, 0.78, 0.22], [-0.3, 0.72, 0.08], [0.05, 1.12, 0.06], [0.22, 0.68, -0.24], [-0.2, 0.92, -0.2],
      ];
      for (const [x, y, z] of spots) {
        const f = addFruit(new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), stdMat({ color: fruitColor })));
        f.position.set(x, y, z);
        fallbackPlant.add(f);
      }
      break;
    }
    case "cactus": {
      // 仙人掌：柱状身体 + 侧臂 + 顶果
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.6, 4, 10), toon(0x4ea24e));
      body.position.y = 0.42;
      body.castShadow = true;
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.3, 4, 8), toon(0x4ea24e));
      arm.position.set(0.2, 0.5, 0);
      arm.rotation.z = -0.9;
      arm.castShadow = true;
      fallbackPlant.add(body, arm);
      const f = addFruit(new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), stdMat({ color: fruitColor })));
      f.position.set(0, 0.92, 0);
      fallbackPlant.add(f);
      break;
    }
  }
  // 外层 plant 组：统一做成长缩放 / 巨大化 / 摇摆动画
  // 关键：抬到耕土顶面（y≈0.62），否则植物会被土块完全遮住
  const plant = new THREE.Group();
  plant.position.y = 0.62;
  plant.add(fallbackPlant);
  const gltfPlant = new THREE.Group();
  plant.add(gltfPlant);
  scene.add(plant);

  // ---------- 变异表现（可反复应用，支持实时更新） ----------
  // GLB 加载的网格（原始颜色保存用于染色）
  const gltfMeshes: Array<{ mesh: THREE.Mesh; orig: THREE.Color }> = [];
  let disposed = false;
  let lastLook = { progress, mutations, variants };

  if (def.gltfFile) {
    loadModel(def.gltfFile)
      .then((scene2) => {
        if (disposed) return;
        const g = scene2.clone(true);
        g.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.castShadow = true;
          const src = mesh.material as THREE.MeshStandardMaterial;
          const clone = src.clone();
          mesh.material = clone;
          gltfMeshes.push({ mesh, orig: clone.color.clone() });
        });
        // 归一化：最大边 ~1.15，底部贴地、水平居中
        const box = new THREE.Box3().setFromObject(g);
        const size = box.getSize(new THREE.Vector3());
        const s = 1.15 / Math.max(size.x, size.y, size.z, 1e-4);
        g.scale.setScalar(s);
        const box2 = new THREE.Box3().setFromObject(g);
        const c = box2.getCenter(new THREE.Vector3());
        g.position.set(-c.x, -box2.min.y, -c.z);
        gltfPlant.add(g);
        fallbackPlant.visible = false;
        applyLook(lastLook.progress, lastLook.mutations, lastLook.variants);
      })
      .catch(() => {
        /* 加载失败时保留程序化兜底模型 */
      });
  }

  // 环绕水晶碎片：材质变异时可见
  const shards: THREE.Mesh[] = [];
  {
    const shardMat = stdMat({ color: 0xbfe8ff, metalness: 0.6, roughness: 0.15, transparent: true, opacity: 0.92 });
    for (let i = 0; i < 4; i++) {
      const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.1), shardMat);
      shard.castShadow = true;
      shard.visible = false;
      scene.add(shard);
      shards.push(shard);
    }
  }
  // 璀璨词条光晕
  const glow = new THREE.PointLight(0xffe066, 2.0, 5);
  glow.position.set(0, 1.2, 0);
  glow.visible = false;
  scene.add(glow);

  /** 应用当前进度与变异外观（果实颜色/质感、水晶、光晕、巨大化缩放） */
  const applyLook = (curProgress: number, curMutations: string[], curVariants: Record<string, string> | undefined): void => {
    const colorVariant = curVariants?.color
      ? config.mutationMap.get("color")?.variants?.find((v) => v.id === curVariants.color)
      : undefined;
    const materialVariant = curVariants?.material
      ? config.mutationMap.get("material")?.variants?.find((v) => v.id === curVariants.material)
      : undefined;
    const isGiant = curMutations.includes("giant");

    // 果实基础参数（默认作物色），再叠加材质词条
    const params: THREE.MeshStandardMaterialParameters = {
      color: colorVariant?.color ? new THREE.Color(colorVariant.color).getHex() : fruitColor,
      metalness: 0.15,
      roughness: 0.55,
      emissive: 0x000000,
      transparent: false,
      opacity: 1,
    };
    if (materialVariant) Object.assign(params, MATERIAL_PROPS[materialVariant.id] ?? {});
    for (const f of fruits) Object.assign(f.material as THREE.MeshStandardMaterial, params);

    // 水晶碎片随词条色变化
    if (materialVariant) {
      const shardColor = new THREE.Color(materialVariant.color ?? "#bfe8ff");
      for (const s of shards) (s.material as THREE.MeshStandardMaterial).color = shardColor;
    }
    const showShards = !!materialVariant;
    for (const s of shards) s.visible = showShards;
    glow.visible = curVariants?.material === "brilliant";

    // GLB 模型染色：颜色变异 → 词条色；tint3d 作物 → 作物色；其余保持原始贴图色
    const tint = colorVariant?.color ?? (def.tint3d ? def.color : null);
    for (const { mesh, orig } of gltfMeshes) {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (tint) mat.color.copy(orig).multiply(new THREE.Color(tint));
      else mat.color.copy(orig);
      if (materialVariant) Object.assign(mat, MATERIAL_PROPS[materialVariant.id] ?? {});
    }

    // 成长进度 → 整体大小（0% 时也有可见的小苗）；巨大化再放大
    plant.scale.setScalar((0.5 + 0.5 * curProgress) * (isGiant ? 1.45 : 1));
    lastLook = { progress: curProgress, mutations: curMutations, variants: curVariants };
  };
  applyLook(progress, mutations, variants);

  // ---------- 动画：植物轻轻摇摆 + 水晶环绕 ----------
  let raf = 0;
  const clock = new THREE.Clock();
  const animate = () => {
    raf = requestAnimationFrame(animate);
    const t = clock.getElapsedTime();
    plant.rotation.z = Math.sin(t * 1.3) * 0.035;
    plant.rotation.y = Math.sin(t * 0.4) * 0.12;
    shards.forEach((s, i) => {
      const angle = t * 1.0 + (i / shards.length) * Math.PI * 2;
      s.position.set(Math.cos(angle) * 0.85, 0.85 + Math.sin(angle * 2) * 0.15, Math.sin(angle) * 0.85);
      s.rotation.y = t;
    });
    renderer.render(scene, camera);
  };
  animate();

  return {
    update: (curProgress, curMutations, curVariants) => applyLook(curProgress, curMutations, curVariants),
    dispose: () => {
      disposed = true;
      cancelAnimationFrame(raf);
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
