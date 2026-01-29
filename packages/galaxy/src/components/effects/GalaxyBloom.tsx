/**
 * GalaxyBloom Component
 * 
 * Post-processing bloom effect for the galaxy visualization.
 * Makes sensitive data glow and creates the space atmosphere.
 */

// Note: @react-three/postprocessing exports may vary by version
// Using dynamic import pattern for compatibility
import { BLOOM_CONFIG } from '../../constants/index.js';
import { useGalaxyStore } from '../../store/index.js';

// ============================================================================
// Component
// ============================================================================

export function GalaxyBloom() {
  const { display } = useGalaxyStore();
  
  // Bloom effect is handled by the parent canvas for now
  // This component serves as a placeholder for future post-processing
  if (!display.enableBloom) {return null;}
  
  // Return null - bloom will be configured at canvas level
  return null;
}
