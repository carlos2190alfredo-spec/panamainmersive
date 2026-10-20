import { notFound } from 'next/navigation';

// Cualquier ruta desconocida dentro de un idioma válido muestra el 404 LOCALIZADO
// (sin este captador, Next usaría un 404 genérico fuera del layout del idioma).
export default function CatchAll() {
  notFound();
}
