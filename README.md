# Three.js Post-Processing Toon Shader

A production-grade Toon Shader for Three.js. 

This package provides a robust implementation of **Cel Shading** (via Gradient Maps) and **Edge Detection** (via Post-Processing). Unlike the common "Inverted Hull" technique, this uses Depth and Normal buffers to detect edges, ensuring perfect outlines on complex geometry, internal edges, and intersecting objects without duplicating geometry.

## Features

- 🎨 **Surface Cel Shading:** Helper to apply `MeshToonMaterial` with quantized gradient maps.
- 🖊️ **Advanced Outlines:** Post-processing shader that detects edges using:
  - **Depth Discontinuity:** Detects objects in front of others.
  - **Normal Discontinuity:** Detects sharp edges within a single object (e.g., corners of a cube).
- 📷 **Distance Attenuation:** Lines fade out or thin as objects move further away to reduce noise.
- 🧩 **Composable:** Framework agnostic. Works with Vanilla JS, Vue (Nuxt), React (R3F), etc.

## Installation

This project relies on `three` as a peer dependency.

```bash
npm install three
# or
yarn add three
```

## Running the Demo

1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```