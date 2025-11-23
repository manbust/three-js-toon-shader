import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';

/**
 * Custom Shader for Edge Detection based on Depth and Surface Normals.
 * This provides cleaner internal edges compared to the "Inverted Hull" method.
 */
export const EdgeDetectionShader = {
  uniforms: {
    'tDiffuse': { value: null },
    'tDepth': { value: null },
    'tNormal': { value: null },
    'resolution': { value: new THREE.Vector2() },
    'cameraNear': { value: 0.1 },
    'cameraFar': { value: 1000.0 },
    'outlineThickness': { value: 1.0 },
    'outlineColor': { value: new THREE.Color(0x000000) },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform sampler2D tNormal;
    uniform vec2 resolution;
    uniform float cameraNear;
    uniform float cameraFar;
    uniform float outlineThickness;
    uniform vec3 outlineColor;
    varying vec2 vUv;

    float getLinearDepth(vec2 uv) {
        float z_b = texture2D(tDepth, uv).r;
        float z_n = 2.0 * z_b - 1.0;
        return (2.0 * cameraNear * cameraFar) / (cameraFar + cameraNear - z_n * (cameraFar - cameraNear));
    }

    void main() {
        vec4 originalColor = texture2D(tDiffuse, vUv);
        float rawDepth = texture2D(tDepth, vUv).r;

        // Ignore skybox/background
        if (rawDepth >= 0.9999) {
            gl_FragColor = originalColor;
            return;
        }

        vec2 texel = vec2(1.0 / resolution.x, 1.0 / resolution.y) * outlineThickness;
        float centerDepth = getLinearDepth(vUv);

        // --- DEPTH EDGE DETECTION ---
        float d_t  = getLinearDepth(vUv + vec2(0.0, texel.y));
        float d_b  = getLinearDepth(vUv + vec2(0.0, -texel.y));
        float d_l  = getLinearDepth(vUv + vec2(-texel.x, 0.0));
        float d_r  = getLinearDepth(vUv + vec2(texel.x, 0.0));
        
        float depthDiffX = d_r - d_l;
        float depthDiffY = d_t - d_b;
        float depthEdge = sqrt(depthDiffX*depthDiffX + depthDiffY*depthDiffY);
        float depthThreshold = 0.5;
        float depthIndicator = smoothstep(depthThreshold, depthThreshold + 0.1, depthEdge);

        // --- NORMAL EDGE DETECTION ---
        vec3 n_t  = texture2D(tNormal, vUv + vec2(0.0, texel.y)).rgb;
        vec3 n_b  = texture2D(tNormal, vUv + vec2(0.0, -texel.y)).rgb;
        vec3 n_l  = texture2D(tNormal, vUv + vec2(-texel.x, 0.0)).rgb;
        vec3 n_r  = texture2D(tNormal, vUv + vec2(texel.x, 0.0)).rgb;

        vec3 normalDiffX = n_r - n_l;
        vec3 normalDiffY = n_t - n_b;
        
        float normalEdgeSq = dot(normalDiffX, normalDiffX) + dot(normalDiffY, normalDiffY);
        float normalThresholdSq = 0.08; // Sensitivity to surface curvature
        float normalIndicator = smoothstep(normalThresholdSq, normalThresholdSq + 0.05, normalEdgeSq);

        // Combine
        float edge = max(depthIndicator, normalIndicator);
        
        if (edge > 0.1) {
            // Distance-based attenuation (lines get thinner/lighter far away)
            float lineAlpha = clamp(12.0 / (2.0 + centerDepth), 0.0, 1.0);
            gl_FragColor = mix(originalColor, vec4(outlineColor, 1.0), lineAlpha * edge);
        } else {
            gl_FragColor = originalColor;
        }
    }
  `
};

export interface ToonComposerConfig {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  width: number;
  height: number;
  outlineThickness?: number;
  outlineColor?: number;
}

export function createToonPostProcessing(config: ToonComposerConfig) {
  const { renderer, scene, camera, width, height } = config;
  const pixelRatio = renderer.getPixelRatio();
  const rtWidth = width * pixelRatio;
  const rtHeight = height * pixelRatio;

  // 1. Setup Render Targets for Normals and Depth
  const normalRenderTarget = new THREE.WebGLRenderTarget(rtWidth, rtHeight);
  normalRenderTarget.texture.minFilter = THREE.NearestFilter;
  normalRenderTarget.texture.magFilter = THREE.NearestFilter;
  
  const depthRenderTarget = new THREE.WebGLRenderTarget(rtWidth, rtHeight);
  depthRenderTarget.texture.minFilter = THREE.NearestFilter;
  depthRenderTarget.texture.magFilter = THREE.NearestFilter;
  depthRenderTarget.depthTexture = new THREE.DepthTexture(rtWidth, rtHeight);
  depthRenderTarget.depthTexture.type = THREE.UnsignedShortType;

  const normalMaterial = new THREE.MeshNormalMaterial();

  // 2. Setup Composer
  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  // 3. Setup Edge Detection Pass
  const edgePass = new ShaderPass(EdgeDetectionShader);
  edgePass.uniforms['resolution'].value.set(rtWidth, rtHeight);
  edgePass.uniforms['tNormal'].value = normalRenderTarget.texture;
  edgePass.uniforms['tDepth'].value = depthRenderTarget.depthTexture;
  edgePass.uniforms['outlineThickness'].value = config.outlineThickness ?? 1.0;
  edgePass.uniforms['outlineColor'].value.setHex(config.outlineColor ?? 0x000000);
  edgePass.uniforms['cameraNear'].value = camera.near;
  edgePass.uniforms['cameraFar'].value = camera.far;
  composer.addPass(edgePass);

  // 4. Setup FXAA (Antialiasing)
  const fxaaPass = new ShaderPass(FXAAShader);
  fxaaPass.uniforms['resolution'].value.x = 1 / rtWidth;
  fxaaPass.uniforms['resolution'].value.y = 1 / rtHeight;
  composer.addPass(fxaaPass);

  // 5. Update Function (Must be called in animation loop)
  const render = () => {
    // A. Render Normals
    scene.overrideMaterial = normalMaterial;
    renderer.setRenderTarget(normalRenderTarget);
    renderer.render(scene, camera);
    
    // B. Render Depth
    scene.overrideMaterial = null; // Use original materials to capture depth correctly? No, depth is automatic in WebGL
    renderer.setRenderTarget(depthRenderTarget);
    renderer.render(scene, camera);
    
    // C. Final Composite Render
    renderer.setRenderTarget(null);
    composer.render();
  };

  // 6. Resize Handler
  const setSize = (w: number, h: number) => {
    const newPixelRatio = renderer.getPixelRatio();
    const newRtWidth = w * newPixelRatio;
    const newRtHeight = h * newPixelRatio;

    camera.aspect = w / h;
    camera.updateProjectionMatrix();

    renderer.setSize(w, h);
    composer.setSize(w, h);
    
    normalRenderTarget.setSize(newRtWidth, newRtHeight);
    depthRenderTarget.setSize(newRtWidth, newRtHeight);

    edgePass.uniforms['resolution'].value.set(newRtWidth, newRtHeight);
    edgePass.uniforms['cameraNear'].value = camera.near;
    edgePass.uniforms['cameraFar'].value = camera.far;
    
    fxaaPass.uniforms['resolution'].value.x = 1 / newRtWidth;
    fxaaPass.uniforms['resolution'].value.y = 1 / newRtHeight;
  };

  return {
    composer,
    render,
    setSize,
    edgePass
  };
}