import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { Schema } from '@/api/types';
import { geneAttributes } from './geometry';

type Props = { genes: Schema<'GeneStat'>[]; session: Schema<'AttackSession'> | null; beam: string | null };
export function GeneScene({ genes, session, beam }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const state = useRef({ session, beam });
  const [error, setError] = useState(false);
  const [fps, setFps] = useState(0);
  useEffect(() => { state.current = { session, beam }; }, [session, beam]);
  useEffect(() => {
    const container = host.current!;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); }
    catch { setError(true); return; }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.z = 10;
    const attributes = geneAttributes(genes);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(attributes.positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(attributes.colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(attributes.sizes, 1));
    const material = new THREE.ShaderMaterial({
      vertexShader: 'attribute float size; varying vec3 vColor; void main(){vColor=color; vec4 p=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*p; gl_PointSize=size*(7./-p.z);}',
      fragmentShader: 'varying vec3 vColor; void main(){if(distance(gl_PointCoord,vec2(.5))>.5) discard; gl_FragColor=vec4(vColor, .85);}',
      vertexColors: true, transparent: true, depthWrite: false,
    });
    const points = new THREE.Points(geometry, material);
    scene.add(points);
    const ringGeometry = new THREE.BufferGeometry();
    const ringMaterial = new THREE.LineBasicMaterial({ color: '#56ddd0' });
    const ring = new THREE.Line(ringGeometry, ringMaterial);
    scene.add(ring);
    const beamGeometry = new THREE.BufferGeometry();
    const beamMaterial = new THREE.LineBasicMaterial({ color: '#f2c66d' });
    const ray = new THREE.Line(beamGeometry, beamMaterial);
    scene.add(ray);
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const resize = new ResizeObserver(() => {
      renderer.setSize(container.clientWidth, container.clientHeight);
      camera.aspect = container.clientWidth / Math.max(container.clientHeight, 1);
      camera.updateProjectionMatrix();
    });
    resize.observe(container);
    let frame = 0, last = performance.now(), sample = last, count = 0, probability = 0;
    const ringArray = new Float32Array(129 * 3);
    ringGeometry.setAttribute('position', new THREE.BufferAttribute(ringArray, 3));
    const beamArray = new Float32Array(6);
    beamGeometry.setAttribute('position', new THREE.BufferAttribute(beamArray, 3));
    let beamStart = last, previousBeam: string | null = null;
    function draw(now: number) {
      const dt = Math.min((now - last) / 1000, .1); last = now;
      const current = state.current;
      if (!reduced.matches) points.rotation.y += dt * .055;
      const target = current.session?.belief.p_claim_holds ?? 0;
      probability = reduced.matches ? target : THREE.MathUtils.damp(probability, target, 5, dt);
      for (let i = 0; i <= 128; i++) {
        const angle = Math.PI / 2 + i / 128 * Math.PI * 2 * probability;
        ringArray.set([Math.cos(angle) * .85, Math.sin(angle) * .85, 3], i * 3);
      }
      ringGeometry.attributes.position.needsUpdate = true;
      if (current.beam !== previousBeam) { beamStart = now; previousBeam = current.beam; }
      ray.visible = !!current.beam;
      const index = current.session?.contexts.findIndex(c => c.context_id === current.beam) ?? -1;
      const angle = index / Math.max(current.session?.contexts.length ?? 1, 1) * Math.PI * 2 - Math.PI / 2;
      const progress = reduced.matches ? 1 : Math.min((now - beamStart) / 550, 1);
      beamArray.set([0, 0, 3, Math.cos(angle) * Math.tan(Math.PI / 8) * 7 * camera.aspect * .66 * progress, -Math.sin(angle) * Math.tan(Math.PI / 8) * 7 * .68 * progress, 3]);
      beamGeometry.attributes.position.needsUpdate = true;
      renderer.render(scene, camera);
      count++;
      if (now - sample >= 2000) { setFps(Math.round(count * 1000 / (now - sample))); sample = now; count = 0; }
      frame = requestAnimationFrame(draw);
    }
    frame = requestAnimationFrame(draw);
    const lost = (event: Event) => { event.preventDefault(); setError(true); cancelAnimationFrame(frame); };
    renderer.domElement.addEventListener('webglcontextlost', lost);
    return () => {
      cancelAnimationFrame(frame); resize.disconnect();
      renderer.domElement.removeEventListener('webglcontextlost', lost);
      [geometry, ringGeometry, beamGeometry].forEach(g => g.dispose());
      [material, ringMaterial, beamMaterial].forEach(m => m.dispose());
      renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    };
  }, [genes]);
  return <><div ref={host} className="expo-canvas" aria-hidden="true" />
    {error ? <p role="alert" className="expo-fallback">WebGL is unavailable. Close expo mode to continue in the standard view.</p> : <output className="expo-fps">{genes.length.toLocaleString()} genes · {fps || '…'} fps</output>}</>;
}
