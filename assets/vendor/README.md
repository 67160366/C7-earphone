# Vendored demo renderer

Three.js 0.186.1 from https://registry.npmjs.org/three/-/three-0.186.1.tgz (MIT; see three/LICENSE).
Selected build modules, OrbitControls, GLTFLoader and its utilities only. GLTFLoader relative utility imports were adjusted to this flattened directory. No npm install/build step or runtime CDN is required. Existing index/workbench retain their renderer.

Head model and normal map: Infinite, 3D Head Scan by Lee Perry-Smith, based on triplegangers.com, from https://github.com/mrdoob/three.js/tree/dev/examples/models/gltf/LeePerrySmith. CC BY3.0; original license retained in ../models/head/LeePerrySmith_License.txt. Demo attribution is visible in its About details. The demo crops the scan shoulders in memory, rescales, changes material and articulates the head separately from an illustrative torso. This asset is not a subject-specific anatomical model.
