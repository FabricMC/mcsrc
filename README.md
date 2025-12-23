# [https://mcsrc.dev/](https://mcsrc.dev/)

Note: This project is not affiliated with Mojang or Microsoft in any way. It does NOT redistribute any Minecraft code or compiled bytecode. The minecraft jar is downloaded directly from Mojang's servers to your browser.

## How to build locally

First you must build the wasm indexer using Gradle.

- `cd indexer`
- `./gradlew build`

Then you can run the web app:

- `nvm use` (or ensure you have the correct Node version, see `.nvmrc`)
- `npm install`
- `npm run dev`

## Credits

Libraries and tools used:

- Decompiler: [Vineflower](https://github.com/Vineflower/vineflower)
- Wasm compilation of Vineflower: [@run-slicer/vf](https://www.npmjs.com/package/@run-slicer/vf)