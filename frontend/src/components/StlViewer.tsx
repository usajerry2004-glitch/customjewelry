import React, { useEffect, useRef, useState } from 'react';

interface Props {
  fileUrl: string;
  height?: number;
}

export default function StlViewer({ fileUrl, height = 460 }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [msg, setMsg] = useState('Initialising 3D viewer…');

  useEffect(() => {
    let renderer: any;
    let animId: number;
    let disposed = false;
    let onResize: () => void;

    async function run() {
      try {
        const THREE = await import('three');
        const { OrbitControls } = await import(/* webpackChunkName: "orbit-controls" */ 'three/examples/jsm/controls/OrbitControls.js');
        const { STLLoader } = await import(/* webpackChunkName: "stl-loader" */ 'three/examples/jsm/loaders/STLLoader.js');

        if (disposed || !mountRef.current) return;

        const el = mountRef.current;
        const w = el.clientWidth || 640;
        const h = height;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0xf4f2ee);

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

        setMsg('Downloading STL…');
        const loader = new STLLoader();

        loader.load(
          fileUrl,
          (geometry: any) => {
            if (disposed) return;

            geometry.computeVertexNormals();

            const material = new THREE.MeshStandardMaterial({
              color: 0xc09b58,
              metalness: 0.4,
              roughness: 0.35,
              side: THREE.DoubleSide,
            });
            const mesh = new THREE.Mesh(geometry, material);
            scene.add(mesh);

            geometry.computeBoundingSphere();
            const sphere = geometry.boundingSphere;
            const center = sphere?.center ?? new THREE.Vector3();
            const radius = Math.max(sphere?.radius ?? 1, 0.001);

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
              setMsg(pct < 100 ? `Downloading… ${pct}%` : 'Parsing mesh…');
            }
          },
          (err: any) => {
            if (!disposed) {
              setMsg(err?.message || 'Could not load STL file');
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
