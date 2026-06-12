// Type stubs for three.js example modules (not in the exports map)
declare module 'three/examples/jsm/controls/OrbitControls.js' {
  import { Camera, EventDispatcher, MOUSE, TOUCH, Vector3 } from 'three';
  export class OrbitControls extends EventDispatcher {
    constructor(object: Camera, domElement: HTMLElement);
    enabled: boolean;
    target: Vector3;
    enableDamping: boolean;
    dampingFactor: number;
    screenSpacePanning: boolean;
    update(): void;
    dispose(): void;
  }
}

declare module 'three/examples/jsm/loaders/3DMLoader.js' {
  import { Loader, LoadingManager, Group } from 'three';
  export class Rhino3dmLoader extends Loader {
    constructor(manager?: LoadingManager);
    setLibraryPath(path: string): this;
    load(
      url: string,
      onLoad: (object: Group) => void,
      onProgress?: (event: ProgressEvent) => void,
      onError?: (event: ErrorEvent) => void,
    ): void;
  }
}
