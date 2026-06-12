import React, { useEffect, useRef, useState } from 'react';

interface Props {
  fileUrl: string;
  height?: number;
}

export default function ThreeDmViewer({ fileUrl, height = 460 }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [msg, setMsg] = useState('Initialising 3D viewer…');

  useEffect(() => {
    let renderer: any;
    let animId: number;
    let disposed = false;
    let onResize: () => void;
    let parseTimeoutId: ReturnType<typeof setTimeout>;

    async function run() {
      try {
        const THREE = await import('three');
        const { OrbitControls } = await import(/* webpackChunkName: "orbit-controls" */ 'three/examples/jsm/controls/OrbitControls.js');
        const { Rhino3dmLoader } = await import(/* webpackChunkName: "rhino3dm-loader" */ 'three/examples/jsm/loaders/3DMLoader.js');

        if (disposed || !mountRef.current) return;

        const el = mountRef.current;
        const w = el.clientWidth || 640;
        const h = height;

        // Light background so Rhino's default dark lines/curves are visible
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0xf4f2ee);

        // Soft lighting for meshes
        scene.add(new THREE.AmbientLight(0xffffff, 3));
        const dir1 = new THREE.DirectionalLight(0xffffff, 2);
        dir1.position.set(5, 10, 7);
        scene.add(dir1);
        const dir2 = new THREE.DirectionalLight(0xffffff, 1);
        dir2.position.set(-5, -4, -5);
        scene.add(dir2);

        const camera = new THREE.PerspectiveCamera(45, w / h, 0.0001, 10000000);
        camera.position.set(0, 0, 500);

        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(w, h);
        el.appendChild(renderer.domElement);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.07;
        controls.screenSpacePanning = true;
        (controls as any).minDistance = 0.001;
        (controls as any).maxDistance = 10000000;

        setMsg('Loading rhino3dm library…');
        const loader = new Rhino3dmLoader();
        loader.setLibraryPath('/rhino3dm/');

        setMsg('Parsing 3DM geometry…');

        // If onLoad hasn't fired within 60s after download completes, show a hint
        parseTimeoutId = setTimeout(() => {
          if (!disposed && phase === 'loading') {
            setMsg('Still processing… complex files can take up to 60s on first open.');
          }
        }, 15000);

        loader.load(
          fileUrl,
          (obj: any) => {
            clearTimeout(parseTimeoutId);
            if (disposed) return;

            // Override every child's material so it's visible on a light background
            obj.traverse((child: any) => {
              if (child.isMesh) {
                child.material = new THREE.MeshStandardMaterial({
                  color: 0xc09b58,      // gold
                  metalness: 0.4,
                  roughness: 0.35,
                  side: THREE.DoubleSide,
                });
              } else if (child.isLine || child.isLineSegments || child.isLineLoop) {
                child.material = new THREE.LineBasicMaterial({
                  color: 0x1a1a2e,      // dark navy — visible on light bg
                  linewidth: 1,
                });
              } else if (child.isPoints) {
                child.material = new THREE.PointsMaterial({
                  color: 0x1a1a2e,
                  size: 2,
                  sizeAttenuation: false,
                });
              }
            });

            scene.add(obj);
            obj.updateMatrixWorld(true);

            // ── Full bounding box (always valid, ignores visibility) ──
            const fullBox = new THREE.Box3();
            fullBox.expandByObject(obj);

            // ── Per direct-child boxes for outlier detection ──
            const topKids: { child: any; maxDim: number }[] = [];
            for (const child of (obj as any).children ?? []) {
              const b = new THREE.Box3();
              b.expandByObject(child);
              if (b.isEmpty()) continue;
              const s = b.getSize(new THREE.Vector3());
              const md = Math.max(s.x, s.y, s.z);
              if (md > 1e-6) topKids.push({ child, maxDim: md });
            }

            // ── Hide layout page borders: direct children > 8× the median ──
            if (topKids.length > 1) {
              const dims = topKids.map(t => t.maxDim).sort((a, b) => a - b);
              const med = dims[Math.floor(dims.length / 2)];
              topKids.forEach(({ child, maxDim }) => {
                if (maxDim > med * 8) child.visible = false;
              });
            }

            // ── Recompute focus box from visible children only ──
            let focusBox = new THREE.Box3();
            for (const { child } of topKids) {
              if (child.visible === false) continue;
              const b = new THREE.Box3();
              b.expandByObject(child);
              focusBox.union(b);
            }
            // Always fall back to full box so we never end up blank
            if (focusBox.isEmpty()) focusBox.copy(fullBox);
            if (focusBox.isEmpty()) { setPhase('ready'); return; }

            // ── Fit camera to bounding sphere ──
            const sphere = new THREE.Sphere();
            focusBox.getBoundingSphere(sphere);
            const center = sphere.center.clone();
            const radius = Math.max(sphere.radius, 0.001);

            const halfFovTan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
            const dist = Math.max((radius / halfFovTan) * 1.5, radius * 2);

            camera.near = dist / 2000;
            camera.far  = dist * 2000;
            camera.updateProjectionMatrix();
            camera.position.set(center.x, center.y + radius * 0.25, center.z + dist);
            camera.lookAt(center);

            controls.target.copy(center);
            (controls as any).minDistance = dist * 0.001;
            (controls as any).maxDistance = dist * 50;
            controls.update();

            setPhase('ready');
          },
          (xhr: any) => {
            if (xhr.total) {
              const pct = Math.round(xhr.loaded / xhr.total * 100);
              if (pct < 100) {
                setMsg(`Downloading… ${pct}%`);
              } else {
                setMsg('Parsing 3D geometry (may take 15–30s)…');
              }
            }
          },
          (err: any) => {
            clearTimeout(parseTimeoutId);
            if (!disposed) {
              setMsg(err.message || 'Could not load 3DM file');
              setPhase('error');
            }
          },
        );

        const animate = () => {
          if (disposed) return;
          animId = requestAnimationFrame(animate);
          controls.update();
          renderer.render(scene, camera);
        };
        animate();

        onResize = () => {
          if (!el || disposed) return;
          const nw = el.clientWidth;
          camera.aspect = nw / h;
          camera.updateProjectionMatrix();
          renderer.setSize(nw, h);
        };
        window.addEventListener('resize', onResize);

      } catch (e: any) {
        if (!disposed) {
          setMsg(e.message || 'Viewer error');
          setPhase('error');
        }
      }
    }

    run();

    return () => {
      disposed = true;
      clearTimeout(parseTimeoutId);
      cancelAnimationFrame(animId);
      if (onResize) window.removeEventListener('resize', onResize);
      if (renderer) {
        renderer.dispose();
        renderer.domElement?.remove();
      }
    };
  }, [fileUrl, height]);

  return (
    <div style={{ position: 'relative', width: '100%', height, background: '#f4f2ee', overflow: 'hidden' }}>
      {phase !== 'ready' && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 2,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: '14px',
          pointerEvents: 'none',
          background: '#f4f2ee',
        }}>
          {phase === 'loading' ? (
            <div style={{ width: '40px', height: '40px', border: '3px solid rgba(0,0,0,0.08)', borderTopColor: '#c09b58', borderRadius: '50%', animation: 'spin 0.9s linear infinite' }} />
          ) : (
            <div style={{ fontSize: '36px', opacity: 0.5 }}>⚠</div>
          )}
          <div style={{ fontSize: '12px', color: phase === 'error' ? '#dc2626' : '#6b7280', textAlign: 'center', maxWidth: '260px', lineHeight: 1.5 }}>
            {msg}
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}
      {phase === 'ready' && (
        <div style={{ position: 'absolute', bottom: '10px', right: '12px', fontSize: '10px', color: 'rgba(0,0,0,0.3)', pointerEvents: 'none', zIndex: 2, letterSpacing: '0.3px' }}>
          Drag to rotate · Scroll to zoom
        </div>
      )}
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
