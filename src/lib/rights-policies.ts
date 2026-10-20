import raw from '../../data/rights/policies.json';
import { parsePolicies } from '@/domains/geography/rights';

/** Políticas de derechos: UNA fuente (`data/rights/policies.json`) para TypeScript y para el pipeline de Python. */
export const RIGHTS_POLICIES = parsePolicies(raw);
