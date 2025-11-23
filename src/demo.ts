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

// currentModel will now be our clean "Wrapper Group", not the raw GLTF scene
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
controls.target.set(0, 0, 0);

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

/**
 * Encapsulates the loaded model in a wrapper to normalize position/scale/rotation.
 * Returns the Wrapper Group.
 */
function processModel(rawModel: THREE.Group): THREE.Group {
  // 1. Calculate the Box of the raw model
  // We must update world matrix to get accurate bounds of offsets
  rawModel.updateMatrixWorld(true); 
  const box = new THREE.Box3().setFromObject(rawModel);
  const size = new THREE.Vector3();
  box.getSize(size);
  const center = new THREE.Vector3();
  box.getCenter(center);

  // 2. Create a clean Wrapper
  // This wrapper sits at World (0,0,0) and handles Rotation/Scale
  const wrapper = new THREE.Group();

  // 3. Center the Raw Model
  // We subtract the geometric center from the model's position.
  // This shifts the geometry so it aligns with the Wrapper's (0,0,0) origin.
  rawModel.position.x = -center.x;
  rawModel.position.y = -center.y;
  rawModel.position.z = -center.z;

  // Add raw model to wrapper
  wrapper.add(rawModel);

  // 4. Normalize Scale
  // We scale the Wrapper, not the model. This prevents position/scale matrix conflicts.
  const maxDim = Math.max(size.x, size.y, size.z);
  const TARGET_SIZE = 4; // World units
  
  if (maxDim > 0) {
    const scaleFactor = TARGET_SIZE / maxDim;
    wrapper.scale.setScalar(scaleFactor);
  } else {
    wrapper.scale.setScalar(1);
  }

  // 5. Reset Camera to standard view
  controls.reset();
  camera.position.set(5, 3, 5); 
  camera.lookAt(0, 0, 0);
  controls.target.set(0, 0, 0);
  controls.update();

  return wrapper;
}

function loadModel(urlOrFilename: string, isCustomUpload: boolean = false) {
  const finalPath = isCustomUpload ? urlOrFilename : `${ASSET_PATH}${urlOrFilename}`;
  
  // Cleanup
  if (currentModel) {
    scene.remove(currentModel);
    // Deep dispose
    currentModel.traverse((node) => {
        if((node as THREE.Mesh).isMesh) {
            (node as THREE.Mesh).geometry.dispose();
            const mat = (node as THREE.Mesh).material;
            if(Array.isArray(mat)) mat.forEach(m => m.dispose());
            else (mat as THREE.Material).dispose();
        }
    })
    currentModel = null;
  }

  gltfLoader.load(
    finalPath, 
    (gltf) => {
      // processModel returns the new Wrapper Group containing the centered model
      const wrapper = processModel(gltf.scene);

      // --- Material Prep ---
      wrapper.traverse((node) => {
        if ((node as THREE.Mesh).isMesh) {
          const mesh = node as THREE.Mesh;
          mesh.userData.originalMat = mesh.material;
          // Ensure double side for thin geometry often found in uploads
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach(m => m.side = THREE.DoubleSide);
          } else {
            (mesh.material as THREE.Material).side = THREE.DoubleSide;
          }
        }
      });

      currentModel = wrapper;
      scene.add(wrapper);
      
      // Reset rotation UI
      currentModel.rotation.y = 0;
      if (sliderEl) sliderEl.value = "0";

      if (isCustomUpload) {
        URL.revokeObjectURL(urlOrFilename);
      }

      updateMaterialState();
    }, 
    undefined, 
    (err) => {
      console.error(err);
      alert("Error loading model. Check console.");
    }
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
const fileInputEl = document.getElementById('file-input') as HTMLInputElement;

// 1. Initial Load
if (selectEl && selectEl.options.length > 0) {
    loadModel(selectEl.options[0].value, false);
}

// 2. Dropdown Change
selectEl?.addEventListener('change', (e) => {
  const target = e.target as HTMLSelectElement;
  if (target.value !== 'custom') {
    loadModel(target.value, false);
  }
});

// 3. File Upload Change
fileInputEl?.addEventListener('change', (e) => {
  const target = e.target as HTMLInputElement;
  if (target.files && target.files.length > 0) {
    const file = target.files[0];
    const url = URL.createObjectURL(file);
    
    isAutoRotating = false;
    if (checkboxEl) checkboxEl.checked = false;

    loadModel(url, true);

    let customOption = selectEl.querySelector('option[value="custom"]');
    if (!customOption) {
      customOption = document.createElement('option');
      (customOption as HTMLOptionElement).value = 'custom';
      selectEl.appendChild(customOption);
    }
    customOption.textContent = `Custom: ${file.name.substring(0, 15)}...`;
    selectEl.value = 'custom';
  }
});

// 4. Toggle Shader
btnEl?.addEventListener('click', () => {
  isToonEnabled = !isToonEnabled;
  btnEl.innerText = isToonEnabled ? "Toon Effect: ON" : "Toon Effect: OFF";
  updateMaterialState();
});

// 5. Rotation Logic
sliderEl?.addEventListener('input', (e) => {
  isAutoRotating = false;
  if (checkboxEl) checkboxEl.checked = false;
  
  if (currentModel) {
    currentModel.rotation.y = parseFloat((e.target as HTMLInputElement).value);
  }
});

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