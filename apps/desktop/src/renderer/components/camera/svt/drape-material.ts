/**
 * Satellite drape for a terrain material, shared by the synthetic-vision scene
 * and the simulator world so both read the same and there is one shader to keep
 * correct.
 *
 * The rings carry their own local-ENU rect, so the lookup is done from world
 * position rather than from mesh UVs: the same mesh can be re-draped, or the
 * imagery re-centred on the aircraft, without rebuilding geometry.
 */

import * as THREE from 'three';
import type { DrapeRing } from './svt-satellite';

export interface DrapeHandle {
  /** Swap the rings; null returns the surface to its vertex colours. Disposes
      the textures of the rings it replaces. */
  setDrape: (rings: DrapeRing[] | null, renderer?: THREE.WebGLRenderer) => void;
  hasDrape: () => boolean;
  /** Drape another material with the same imagery, only where the GLSL `when` holds (e.g. on roofs).
      `before` patches that material's shader first; it may declare what `when` uses. */
  share: (material: THREE.Material, when: string, before?: (shader: THREE.WebGLProgramParametersWithUniforms) => void) => void;
  dispose: () => void;
}

export function attachDrape(material: THREE.MeshStandardMaterial): DrapeHandle {
  // Unused ring slots bind this instead of null: a null sampler is undefined
  // behaviour that some drivers answer with a black or missing surface.
  const blank = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  blank.needsUpdate = true;

  const uniforms = {
    uDrape: { value: 0 },
    uRingCount: { value: 0 },
    uRingRect0: { value: new THREE.Vector4() },
    uRingRect1: { value: new THREE.Vector4() },
    uRingRect2: { value: new THREE.Vector4() },
    uRingRect3: { value: new THREE.Vector4() },
    uRingTex0: { value: blank as THREE.Texture },
    uRingTex1: { value: blank as THREE.Texture },
    uRingTex2: { value: blank as THREE.Texture },
    uRingTex3: { value: blank as THREE.Texture },
  };
  let rings: DrapeRing[] = [];
  const shared: THREE.Material[] = [];

  const inject = (shader: THREE.WebGLProgramParametersWithUniforms, when = 'true') => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSvtWorld;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvSvtWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vSvtWorld;
        uniform float uDrape;
        uniform int uRingCount;
        uniform vec4 uRingRect0;
        uniform vec4 uRingRect1;
        uniform vec4 uRingRect2;
        uniform vec4 uRingRect3;
        uniform sampler2D uRingTex0;
        uniform sampler2D uRingTex1;
        uniform sampler2D uRingTex2;
        uniform sampler2D uRingTex3;
        // rect = (minX, minZ, maxX, maxZ). v flips because the mosaic's first
        // row is north while texture v = 0 is the image bottom.
        vec2 svtRingUv(vec4 rect, vec3 p) {
          return vec2(
            (p.x - rect.x) / max(1e-3, rect.z - rect.x),
            (rect.w - p.z) / max(1e-3, rect.w - rect.y)
          );
        }
        bool svtInRing(vec4 rect, vec3 p) {
          return p.x >= rect.x && p.x <= rect.z && p.z >= rect.y && p.z <= rect.w;
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        if (uDrape > 0.5 && (${when})) {
          if (uRingCount > 0 && svtInRing(uRingRect0, vSvtWorld)) {
            diffuseColor.rgb = texture2D(uRingTex0, svtRingUv(uRingRect0, vSvtWorld)).rgb;
          } else if (uRingCount > 1 && svtInRing(uRingRect1, vSvtWorld)) {
            diffuseColor.rgb = texture2D(uRingTex1, svtRingUv(uRingRect1, vSvtWorld)).rgb;
          } else if (uRingCount > 2 && svtInRing(uRingRect2, vSvtWorld)) {
            diffuseColor.rgb = texture2D(uRingTex2, svtRingUv(uRingRect2, vSvtWorld)).rgb;
          } else if (uRingCount > 3 && svtInRing(uRingRect3, vSvtWorld)) {
            diffuseColor.rgb = texture2D(uRingTex3, svtRingUv(uRingRect3, vSvtWorld)).rgb;
          }
        }`,
      );
  };
  material.onBeforeCompile = (shader) => inject(shader);

  return {
    share(other, when, before) {
      other.onBeforeCompile = (shader) => {
        before?.(shader);
        inject(shader, when);
      };
      shared.push(other);
      other.needsUpdate = true;
    },

    setDrape(next, renderer) {
      for (const ring of rings) ring.texture.dispose();
      rings = next ?? [];
      const maxAniso = renderer?.capabilities.getMaxAnisotropy() ?? 1;
      for (const ring of rings) {
        ring.texture.anisotropy = Math.min(ring.texture.anisotropy, maxAniso);
        ring.texture.needsUpdate = true;
      }
      const rects = [uniforms.uRingRect0, uniforms.uRingRect1, uniforms.uRingRect2, uniforms.uRingRect3];
      const texes = [uniforms.uRingTex0, uniforms.uRingTex1, uniforms.uRingTex2, uniforms.uRingTex3];
      for (let i = 0; i < rects.length; i++) {
        const ring = rings[i];
        texes[i]!.value = ring?.texture ?? blank;
        if (ring) rects[i]!.value.set(ring.minX, ring.minZ, ring.maxX, ring.maxZ);
      }
      uniforms.uRingCount.value = rings.length;
      uniforms.uDrape.value = rings.length > 0 ? 1 : 0;
      material.needsUpdate = true;
      for (const m of shared) m.needsUpdate = true;
    },

    hasDrape() {
      return rings.length > 0;
    },

    dispose() {
      for (const ring of rings) ring.texture.dispose();
      rings = [];
      blank.dispose();
    },
  };
}
