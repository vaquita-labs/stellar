// Estado por defecto del slot `@modal`: en cualquier ruta que no intercepte
// (todo lo que no sea /portafolio con navegación suave), el overlay no pinta
// nada. Sin este archivo, un refresh o una hard-nav rompen el slot.
export default function Default() {
  return null;
}
