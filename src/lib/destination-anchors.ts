import raw from '../../data/anchors/destination-anchors.json';
import { parseAnchors } from '@/domains/geography/anchors';

/** Se valida al cargar el módulo: un documento de anclas incoherente rompe la compilación, no se muestra. */
export const DESTINATION_ANCHORS = parseAnchors(raw);
