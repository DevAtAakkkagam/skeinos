// Vendored platform brand logos (lobe-icons / simple-icons artwork) as in-bundle
// Preact SVG components — no remote fetch, no <img> (MV3 "no remote code", D2).
// Each mounts inline in the shadow root like the Icon.tsx set. These marks are not
// monochrome — the brand colour *is* the identity at 16px — so the colours are
// baked in rather than inherited via currentColor. The per-PlatformId lookup is the
// single source of truth for which platforms have a brand mark; its keys mirror the
// origin map in `shared/branding` (design D1), and it is consumed by the
// conversation rows and the platform filter chips.

import type { ComponentType, JSX } from 'preact';
import type { PlatformId } from '../../shared/types';

export interface PlatformLogoProps {
  /** Rendered size in px (width = height). */
  size?: number;
  class?: string;
}

/** Shared <svg> frame. Each mark sets its own `viewBox` to frame its artwork — the
 *  vendored brand paths are authored on different canvases (the Claude burst, for
 *  one, fills a ~27×27 box, not 24×24), so a single hard-coded viewBox would clip. */
function Svg({
  size,
  viewBox = '0 0 24 24',
  children,
  ...rest
}: JSX.SVGAttributes<SVGSVGElement> & { size: number; children: JSX.Element | JSX.Element[] }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

/** Anthropic / Claude burst (brand terracotta). The artwork spans ~0–26.3 × 3.3–30,
 *  so it carries a fitted viewBox rather than the default 24×24. */
export function ClaudeLogo({ size = 16, class: cls }: PlatformLogoProps) {
  return (
    <Svg size={size} class={cls} viewBox="0 3 27 27" fill="#D97757">
      <path d="M4.709 15.955l4.72-2.647.079-.23-.08-.128h-.23l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.054-.157-.133-.097-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061 1.273.927 1.341.998 1.752 1.287 1.524 1.123.677.395.092-.066.011-.041-.103-.171-.851-1.532-.911-1.563-.405-.652-.106-.39a1.873 1.873 0 0 1-.066-.46l.748-1.016.413-.134.997.134.42.364.622 1.42 1.005 2.236 1.56 3.044.456.9.243.833.091.255h.158V14.95l.128-1.71.237-2.1.23-2.702.08-.76.376-.91.748-.495.584.28.483.69-.067.448-.286 1.853-.559 2.902-.364 1.942h.212l.243-.242.983-1.304 1.65-2.063.728-.819.85-.904.547-.431h1.033l.76 1.13-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.86-.609 1.544-.28 1.843-.315.833.388.091.395-.327.807-1.967.486-2.307.46-3.439.81-.042.03.049.061 1.549.146.662.036h1.62l3.017.225.79.522.474.638-.079.485-1.215.62-1.64-.388-3.829-.91-1.312-.327h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.748-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.373-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055l-6.36 4.124-1.132.146-.487-.456.06-.746.231-.243 1.908-1.312z" />
    </Svg>
  );
}

/** Google Gemini four-point spark (brand blue → violet gradient). */
export function GeminiLogo({ size = 16, class: cls }: PlatformLogoProps) {
  return (
    <Svg size={size} class={cls} fill="url(#sk-logo-gemini)">
      <defs>
        <linearGradient id="sk-logo-gemini" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#1C7DFF" />
          <stop offset=".52" stop-color="#1C69FF" />
          <stop offset="1" stop-color="#9263FF" />
        </linearGradient>
      </defs>
      <path d="M12 0a12 12 0 0 0 12 12 12 12 0 0 0-12 12A12 12 0 0 0 0 12 12 12 0 0 0 12 0Z" />
    </Svg>
  );
}

/** Perplexity symmetric mark (brand teal). */
export function PerplexityLogo({ size = 16, class: cls }: PlatformLogoProps) {
  return (
    <Svg size={size} class={cls} fill="none" stroke="#20B8CD" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 3.2v17.6" />
      <path d="M12 8 5 3.6v6.9H3v5.5h2v4.4L12 16" />
      <path d="M12 8l7-4.4v6.9h2v5.5h-2v4.4L12 16" />
    </Svg>
  );
}

/** Per-PlatformId brand-logo lookup. Partial: only platforms with a shipped brand
 *  mark appear (grows with the adapter set, alongside `PLATFORM_ORIGINS`). */
export const PLATFORM_LOGOS: Partial<Record<PlatformId, ComponentType<PlatformLogoProps>>> = {
  claude: ClaudeLogo,
  gemini: GeminiLogo,
  perplexity: PerplexityLogo,
};

/** Render a platform's brand logo, or `null` when the platform has no mark yet. */
export function PlatformLogo({
  platform,
  size = 16,
  class: cls,
}: PlatformLogoProps & { platform: PlatformId }) {
  const Logo = PLATFORM_LOGOS[platform];
  return Logo ? <Logo size={size} class={cls} /> : null;
}
