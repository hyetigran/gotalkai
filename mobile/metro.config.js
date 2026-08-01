const { getDefaultConfig } = require('expo/metro-config');
const { withUniwindConfig } = require('uniwind/metro');

const config = getDefaultConfig(__dirname);

// Metro's default assetExts doesn't include 3D model formats — needed for
// `require('../../assets/grandma.glb')` (the Converse-screen 3D portrait,
// loaded via @react-three/drei's useGLTF) to resolve as a bundled asset
// instead of erroring as an unrecognized extension.
config.resolver.assetExts.push('glb', 'gltf');

module.exports = withUniwindConfig(config, {
  cssEntryFile: './src/global.css',
});
