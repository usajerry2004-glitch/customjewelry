// Guards against the failure mode where a CAD designer uploads a .3dm saved
// as pure NURBS/Brep geometry with no render mesh baked in. The customer
// portal's viewer (three.js Rhino3dmLoader, via rhino3dm.js/WASM) can only
// display meshes that were cached into the file at save time in Rhino — it
// has no tessellation engine of its own, so such a file renders as a blank
// canvas with an error for the customer. Catching that here, at upload time,
// stops it from ever reaching a customer-facing approval step.
//
// The per-ObjectType mesh extraction below mirrors three.js's
// examples/jsm/loaders/3DMLoader.js decodeObjects()/extractObjectData() so
// "does this object contribute a mesh" matches what the viewer will actually
// draw.
// Plain require: rhino3dm's CJS export is the init function itself (no
// `default` property), so `import rhino3dm from 'rhino3dm'` resolves to
// undefined under this project's esModuleInterop-less tsconfig.
const rhino3dmInit = require('rhino3dm');

let modulePromise: Promise<any> | null = null;
function getRhino(): Promise<any> {
  if (!modulePromise) modulePromise = rhino3dmInit();
  return modulePromise;
}

export interface RenderMeshCheckResult {
  parsed: boolean;
  objectCount: number;
  meshCount: number;
}

export async function checkRenderMesh(buffer: Buffer): Promise<RenderMeshCheckResult> {
  const rhino = await getRhino();
  const doc = rhino.File3dm.fromByteArray(new Uint8Array(buffer));
  if (!doc) return { parsed: false, objectCount: 0, meshCount: 0 };

  try {
    const objs = doc.objects();
    const objectCount = objs.count;
    let meshCount = 0;

    for (let i = 0; i < objectCount; i++) {
      const obj = objs.get(i);
      try {
        const geo = obj.geometry();
        switch (geo.objectType) {
          case rhino.ObjectType.Mesh:
          case rhino.ObjectType.PointSet:
            meshCount++;
            break;

          case rhino.ObjectType.Brep: {
            const faces = geo.faces();
            for (let f = 0; f < faces.count; f++) {
              const face = faces.get(f);
              const mesh = face.getMesh(rhino.MeshType.Any);
              if (mesh) {
                meshCount++;
                mesh.delete();
              }
              face.delete();
            }
            faces.delete();
            break;
          }

          case rhino.ObjectType.Extrusion: {
            const mesh = geo.getMesh(rhino.MeshType.Any);
            if (mesh) {
              meshCount++;
              mesh.delete();
            }
            break;
          }

          // SubD control nets are tessellated by rhino3dm.js on the fly
          // (Mesh.createFromSubDControlNet) — no baked mesh required.
          case rhino.ObjectType.SubD:
            meshCount++;
            break;

          default:
            break;
        }
        geo.delete();
      } finally {
        obj.delete();
      }
    }

    return { parsed: true, objectCount, meshCount };
  } finally {
    doc.delete();
  }
}

export const RENDER_MESH_HELP_MESSAGE =
  'This 3DM file has no viewable render meshes (only NURBS/surface geometry with nothing baked in) — customers would see a blank viewer. ' +
  'In Rhino, select all geometry, run the "Mesh" command (or Document Properties → Mesh, then File → Save) so render meshes are included, and re-upload.';

export const RENDER_MESH_UNREADABLE_MESSAGE =
  'This 3DM file could not be read (it may be corrupted or saved in an unsupported version) — customers would see an error instead of the model. ' +
  'Re-save it from Rhino and re-upload.';
