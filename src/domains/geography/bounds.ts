/**
 * Área de trabajo de Panamá (oeste, sur, este, norte; grados). Valor de INGENIERÍA para acotar extracciones y
 * limitar el desplazamiento del mapa; NO es un límite administrativo ni oficial.
 * Debe coincidir con `PANAMA_BBOX` de `pipelines/lib/overture.py` (lo comprueba una prueba).
 */
export const WORKING_BBOX = { west: -83.2, south: 6.9, east: -77.0, north: 9.8 } as const;
