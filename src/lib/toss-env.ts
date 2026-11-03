/* 앱인토스(Toss mini app) build switch.
   NEXT_PUBLIC_TOSS_BUILD is only defined by toss/build.mjs (esbuild define). On the website build it is undefined,
   so IS_TOSS is false and every Toss-only branch is inert; apiBase stays "/location". */
export const IS_TOSS = process.env.NEXT_PUBLIC_TOSS_BUILD === "1";

/* The Toss bundle is served from https://thefount-location.web.tossmini.com, so it calls the live API by absolute URL
   (CORS for the tossmini origins: src/lib/toss-cors.ts). */
export const apiBase = IS_TOSS ? "https://www.thefount.co.kr/location" : "/location";
