import { WorldLoader } from '@/core-ui/components/molecules/WorldLoader';

// Shown from the tap on the World tab while the route's chunk (three.js and
// the scene) downloads; the page then keeps the same screen up until the map
// is drawn.
export default function Loading() {
  return <WorldLoader />;
}
