import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { Schema } from '@/api/types';
import { geneAttributes, sceneFrame } from './geometry';

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
    catch {
      const fallbackFrame = requestAnimationFrame(() => setError(true));
      return () => cancelAnimationFrame(fallbackFrame);
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    camera.position.z = 10;
    const attributes = geneAttributes(genes);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(attributes.positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(attributes.colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(attributes.sizes, 1));
    const material = new THREE.ShaderMaterial({
      uniforms: { pointScale: { value: 1 } },
      vertexShader: 'uniform float pointScale; attribute float size; varying vec3 vColor; void main(){vColor=color; vec4 p=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*p; gl_PointSize=size*pointScale;}',
      fragmentShader: 'varying vec3 vColor; void main(){if(distance(gl_PointCoord,vec2(.5))>.5) discard; gl_FragColor=vec4(vColor, 1.);}',
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
      const fit = sceneFrame(container.clientWidth, container.clientHeight);
      camera.left = -fit.halfWidth; camera.right = fit.halfWidth;
      camera.top = fit.halfHeight; camera.bottom = -fit.halfHeight;
      material.uniforms.pointScale.value = renderer.getPixelRatio() * Math.min(1.8, Math.max(1, container.clientHeight / 400));
      camera.updateProjectionMatrix();
    });
    resize.observe(container);
    const clock = { frame: 0, last: performance.now(), sample: performance.now(), count: 0, probability: 0, beamStart: 0, previousBeam: null as string | null };
    const ringArray = new Float32Array(129 * 3);
    ringGeometry.setAttribute('position', new THREE.BufferAttribute(ringArray, 3));
    const beamArray = new Float32Array(6);
    beamGeometry.setAttribute('position', new THREE.BufferAttribute(beamArray, 3));

    function draw(now: number) {
      const dt = Math.min((now - clock.last) / 1000, .1); clock.last = now;
      const current = state.current;
      if (!reduced.matches) points.rotation.y += dt * .055;
      const target = current.session?.belief.p_claim_holds ?? 0;
      clock.probability = reduced.matches ? target : THREE.MathUtils.damp(clock.probability, target, 5, dt);
      for (let i = 0; i <= 128; i++) {
        const angle = Math.PI / 2 + i / 128 * Math.PI * 2 * clock.probability;
        ringArray.set([Math.cos(angle) * .85, Math.sin(angle) * .85, 3], i * 3);
      }
      ringGeometry.attributes.position.needsUpdate = true;
      if (current.beam !== clock.previousBeam) { clock.beamStart = now; clock.previousBeam = current.beam; }
      ray.visible = !!current.beam;
      const index = current.session?.contexts.findIndex(c => c.context_id === current.beam) ?? -1;
      const angle = index / Math.max(current.session?.contexts.length ?? 1, 1) * Math.PI * 2 - Math.PI / 2;
      const progress = reduced.matches ? 1 : Math.min((now - clock.beamStart) / 550, 1);
      beamArray.set([0, 0, 3, Math.cos(angle) * camera.right * .66 * progress, -Math.sin(angle) * camera.top * .82 * progress, 3]);
      beamGeometry.attributes.position.needsUpdate = true;
      renderer.render(scene, camera);
      clock.count++;
      if (now - clock.sample >= 2000) { setFps(Math.round(clock.count * 1000 / (now - clock.sample))); clock.sample = now; clock.count = 0; }
      clock.frame = requestAnimationFrame(draw);
    }
    clock.frame = requestAnimationFrame(draw);
    const lost = (event: Event) => { event.preventDefault(); setError(true); cancelAnimationFrame(clock.frame); };
    renderer.domElement.addEventListener('webglcontextlost', lost);
    return () => {
      cancelAnimationFrame(clock.frame); resize.disconnect();
      renderer.domElement.removeEventListener('webglcontextlost', lost);
      [geometry, ringGeometry, beamGeometry].forEach(g => g.dispose());
      [material, ringMaterial, beamMaterial].forEach(m => m.dispose());
      renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    };
  }, [genes]);
  return <><div ref={host} className="expo-canvas" aria-hidden="true" />
    {error ? <p role="alert" className="expo-fallback">WebGL is unavailable. Close expo mode to continue in the standard view.</p> : <output className="expo-fps">{genes.length.toLocaleString()} genes · {fps || '…'} fps</output>}</>;
}
