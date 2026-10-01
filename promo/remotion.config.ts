import { Config } from "@remotion/cli/config";

// PNG mellom hvert bilde: JPEG gir synlige trappetrinn i de mørke
// fargeovergangene, og filmen står nesten bare på mørk bakgrunn.
Config.setVideoImageFormat("png");
Config.setOverwriteOutput(true);
Config.setEntryPoint("./src/index.ts");
// Hvert Chrome-vindu tar sitt av minnet. 6 holdt i Techauge-promoen.
Config.setConcurrency(6);
