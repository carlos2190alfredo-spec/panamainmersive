'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { CAROUSEL_UNAVAILABLE_ID, useHudStore } from './hud-store';
import styles from './HudCarousel.module.css';
import { useHydrated } from './use-map-url-state';

/** Holgura (px) que se deja entre una tarjeta enfocada y el borde del carrusel: el anillo de foco (contorno + halo) mide ≈ 8 px. */
const FOCUS_MARGIN_PX = 8;

/**
 * Trae a la vista la tarjeta que contiene el elemento enfocado, ENTERA y con holgura para su anillo de foco (r2:F8). El
 * navegador solo desplaza lo justo para que el elemento enfocado «se vea», y con la mitad de una tarjeta a la vista no mueve
 * nada: el foco quedaba en un botón cortado y su anillo, recortado por el borde del carrusel. Solo desplaza el propio
 * carrusel en horizontal (nunca `scrollIntoView`: movería también la página o la hoja móvil) y de golpe (sin animación: el
 * foco por teclado debe llegar a su sitio ya).
 */
function revealFocusedCard(body: HTMLElement, target: EventTarget): void {
  if (!(target instanceof Element)) return;
  const card = target.closest('li');
  if (!card || !body.contains(card)) return;
  const area = body.getBoundingClientRect();
  const box = card.getBoundingClientRect();
  let delta = 0;
  if (box.left < area.left + FOCUS_MARGIN_PX) delta = box.left - area.left - FOCUS_MARGIN_PX;
  else if (box.right > area.right - FOCUS_MARGIN_PX)
    delta = box.right - area.right + FOCUS_MARGIN_PX;
  if (delta !== 0) body.scrollBy({ left: delta, behavior: 'auto' });
}

/**
 * Carrusel inferior de los nueve destinos del HUD de Explorar: la lista (componente de servidor, hijos) más sus
 * controles (anterior, siguiente, ocultar/mostrar), que solo existen con JavaScript y tras hidratar. Sin JavaScript
 * la lista de enlaces sigue ahí, entera: es la alternativa textual equivalente del mapa.
 *
 * Es PLEGABLE (el documento rector pide evitar «un dashboard de tarjetas permanentes»): plegado queda solo la cabecera.
 * Si el mapa no estará disponible (sin WebGL, sin datos, bloqueado por derechos) NO se puede plegar: la lista es
 * entonces lo único que ofrece la pantalla. El desplazamiento nativo y el orden de Tab ya bastan para usarla; las
 * flechas son una comodidad para el ratón (objetivos de 44 px, solo llaman a `scrollBy`).
 */
export function HudCarousel({
  headingId,
  describedBy,
  heading,
  status,
  className,
  children,
}: {
  /** `id` del encabezado que nombra la región; `heading` lo lleva. */
  headingId: string;
  /** `id` de un párrafo (solo para lectores de pantalla) que describe la región. */
  describedBy?: string | undefined;
  heading: ReactNode;
  /** Junto al título: el recuento del filtro y de la búsqueda (isla de cliente que llega tras hidratar; nada sin ella). */
  status?: ReactNode;
  className?: string | undefined;
  children: ReactNode;
}) {
  const t = useTranslations('Map');
  const hydrated = useHydrated();
  const { mapStatus } = useHudStore();
  const [folded, setFolded] = useState(false);
  const bodyId = useId();
  const bodyRef = useRef<HTMLDivElement>(null);
  const unavailable = mapStatus === 'unavailable';
  const open = unavailable || !folded;

  // El destino elegido (su botón «Ver en el mapa» está pulsado) se trae a la vista dentro del carrusel: con la ficha al
  // lado, el carrusel es más estrecho y la tarjeta elegida puede quedar fuera. Solo mueve el desplazamiento del propio
  // carrusel (nunca el de la página). Un observador basta: los botones aparecen al hidratar y cambian `aria-pressed`.
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const reveal = () => {
      const card = body.querySelector('[aria-pressed="true"]')?.closest('li');
      if (!card) return;
      const area = body.getBoundingClientRect();
      const box = card.getBoundingClientRect();
      if (box.left >= area.left && box.right <= area.right) return;
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      body.scrollTo({
        left: body.scrollLeft + (box.left - area.left) - (area.width - box.width) / 2,
        behavior: reduced ? 'auto' : 'smooth',
      });
    };
    reveal();
    const observer = new MutationObserver(reveal);
    observer.observe(body, {
      attributes: true,
      attributeFilter: ['aria-pressed'],
      childList: true,
      subtree: true,
    });
    return () => {
      observer.disconnect();
    };
  }, []);

  function scroll(direction: 1 | -1): void {
    const el = bodyRef.current;
    if (!el) return;
    const rtl = getComputedStyle(el).direction === 'rtl' ? -1 : 1;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({
      left: direction * rtl * el.clientWidth * 0.8,
      behavior: reduced ? 'auto' : 'smooth',
    });
  }

  return (
    <section
      className={[styles.carousel, className].filter(Boolean).join(' ')}
      aria-labelledby={headingId}
      aria-describedby={describedBy}
      data-hud-zone="carousel"
      data-state={open ? 'open' : 'closed'}
    >
      <div className={styles.head}>
        {heading}
        {status}
        {hydrated ? (
          <div className={styles.controls}>
            {open ? (
              <span className={styles.arrows}>
                <button
                  type="button"
                  className={styles.arrow}
                  aria-label={t('carousel.previous')}
                  onClick={() => {
                    scroll(-1);
                  }}
                >
                  <span className={styles.arrowPrev} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={styles.arrow}
                  aria-label={t('carousel.next')}
                  onClick={() => {
                    scroll(1);
                  }}
                >
                  <span className={styles.arrowNext} aria-hidden="true" />
                </button>
              </span>
            ) : null}
            {unavailable ? null : (
              <button
                type="button"
                className={styles.toggle}
                aria-expanded={open}
                aria-controls={bodyId}
                onClick={() => {
                  setFolded((value) => !value);
                }}
              >
                <span>{open ? t('carousel.hide') : t('carousel.show')}</span>
                <span className={styles.chevron} aria-hidden="true" />
              </button>
            )}
          </div>
        ) : null}
      </div>
      {hydrated && unavailable ? (
        <p id={CAROUSEL_UNAVAILABLE_ID} className={styles.reason}>
          {t('hud.mapUnavailable')}
        </p>
      ) : null}
      <div
        id={bodyId}
        ref={bodyRef}
        className={styles.body}
        onFocus={(event) => {
          if (bodyRef.current) revealFocusedCard(bodyRef.current, event.target);
        }}
      >
        {children}
      </div>
    </section>
  );
}
