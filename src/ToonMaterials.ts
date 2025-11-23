import * as THREE from 'three';

/**
 * Loads a gradient ramp texture and configures it for Toon shading.
 * IMPORTANT: NearestFilter is crucial to get hard bands of color.
 */
export function loadGradientTexture(url: string, loadingManager?: THREE.LoadingManager): THREE.Texture {
  const loader = new THREE.TextureLoader(loadingManager);
  const texture = loader.load(url);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}

/**
 * Recursively applies MeshToonMaterial to a model using a gradient map.
 * Preserves original colors and maps.
 */
export function applyToonMaterial(object: THREE.Object3D, gradientMap: THREE.Texture) {
  object.traverse((node) => {
    if ((node as THREE.Mesh).isMesh) {
      const mesh = node as THREE.Mesh;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const newMaterials: THREE.MeshToonMaterial[] = [];

      materials.forEach((mat) => {
        // Cast to standard material to access common properties
        const stdMat = mat as THREE.MeshStandardMaterial;
        
        const toonMat = new THREE.MeshToonMaterial({
          color: stdMat.color || 0xffffff,
          map: stdMat.map || null,
          gradientMap: gradientMap,
          // Copy other properties if needed
          transparent: stdMat.transparent,
          opacity: stdMat.opacity,
          side: stdMat.side,
        });

        if (toonMat.map) toonMat.map.colorSpace = THREE.SRGBColorSpace;
        newMaterials.push(toonMat);
      });

      mesh.material = newMaterials.length === 1 ? newMaterials[0] : newMaterials;
    }
  });
}