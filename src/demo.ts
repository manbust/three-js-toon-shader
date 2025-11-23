import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createToonPostProcessing } from './ToonShader';
import { loadGradientTexture } from './ToonMaterials';

// --- Configuration ---
const BASE = import.meta.env.BASE_URL;
const ASSET_PATH = `${BASE}assets/models/`;
const RAMP_PATH = `${BASE}assets/ramp.png`;

let isToonEnabled = true;
let currentModel: THREE.Group | null = null;
let gradientMap: THREE.Texture;
let isAutoRotating = true;

// 1. Setup Scene
const container = document.getElementById('canvas-container') as HTMLElement;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x888888); 

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(5, 5, 5);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
container.appendChild(renderer.domElement);

// 2. Lights
const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 2);
dirLight.position.set(5, 10, 7);
scene.add(dirLight);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// 3. Initialize Toon Shader
const toon = createToonPostProcessing({
  renderer,
  scene,
  camera,
  width: window.innerWidth,
  height: window.innerHeight,
  outlineThickness: 1.5,
  outlineColor: 0x000000
});

gradientMap = loadGradientTexture(RAMP_PATH);

// 4. Loader Logic
const gltfLoader = new GLTFLoader();

function loadModel(filename: string) {
  if (currentModel) {
    scene.remove(currentModel);
    currentModel = null;
  }

  gltfLoader.load(`${ASSET_PATH}${filename}`, (gltf) => {
      const model = gltf.scene;

      // Auto-Center & Scale
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());

      model.position.sub(center); // Center at 0,0,0
      
      const maxDim = Math.max(size.x, size.y, size.z);
      if (maxDim > 0) {
        const scaleFactor = 4 / maxDim;
        model.scale.setScalar(scaleFactor);
      }
      
      model.position.y = 0; // Center vertically on origin

      model.traverse((node) => {
        if ((node as THREE.Mesh).isMesh) {
          const mesh = node as THREE.Mesh;
          mesh.userData.originalMat = mesh.material;
        }
      });

      currentModel = model;
      scene.add(model);
      
      // Reset rotation logic
      currentModel.rotation.y = 0;
      if (sliderEl) sliderEl.value = "0";

      updateMaterialState();
    }, 
    undefined, 
    (err) => console.error(err)
  );
}

function updateMaterialState() {
  if (!currentModel) return;

  currentModel.traverse((node) => {
    if ((node as THREE.Mesh).isMesh) {
      const mesh = node as THREE.Mesh;
      const original = mesh.userData.originalMat;
      const originalColor = original.color || new THREE.Color(0xffffff);
      const originalMap = original.map || null;

      if (isToonEnabled) {
        const toonMat = new THREE.MeshToonMaterial({
          color: originalColor,
          map: originalMap,
          gradientMap: gradientMap,
          side: THREE.DoubleSide
        });
        if (toonMat.map) toonMat.map.colorSpace = THREE.SRGBColorSpace;
        mesh.material = toonMat;
      } else {
        mesh.material = original;
      }
    }
  });
}

// --- UI Binding ---
const selectEl = document.getElementById('model-select') as HTMLSelectElement;
const btnEl = document.getElementById('toggle-shader') as HTMLButtonElement;
const sliderEl = document.getElementById('rotation-slider') as HTMLInputElement;
const checkboxEl = document.getElementById('auto-rotate') as HTMLInputElement;

// Model Select
if (selectEl && selectEl.options.length > 0) {
    loadModel(selectEl.options[0].value);
}
selectEl?.addEventListener('change', (e) => loadModel((e.target as HTMLSelectElement).value));

// Toggle Shader
btnEl?.addEventListener('click', () => {
  isToonEnabled = !isToonEnabled;
  btnEl.innerText = isToonEnabled ? "Toon Effect: ON" : "Toon Effect: OFF";
  updateMaterialState();
});

// Slider (Stop auto-rotate when user drags)
sliderEl?.addEventListener('input', (e) => {
  isAutoRotating = false;
  if (checkboxEl) checkboxEl.checked = false;
  
  if (currentModel) {
    currentModel.rotation.y = parseFloat((e.target as HTMLInputElement).value);
  }
});

// Auto-Rotate Checkbox
checkboxEl?.addEventListener('change', (e) => {
  isAutoRotating = (e.target as HTMLInputElement).checked;
});

// Resize
window.addEventListener('resize', () => {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  toon.setSize(width, height);
});

// --- Animation Loop ---
function animate() {
  requestAnimationFrame(animate);
  controls.update();

  // Rotation Logic
  if (currentModel) {
    if (isAutoRotating) {
      currentModel.rotation.y += 0.005; 
      if (currentModel.rotation.y > Math.PI * 2) currentModel.rotation.y -= Math.PI * 2;
      
      if (sliderEl) sliderEl.value = currentModel.rotation.y.toString();
    }
  }

  if (isToonEnabled) {
    toon.render();
  } else {
    renderer.render(scene, camera);
  }
}

animate();