/* 앱인토스 bundle entry: the website's own location screen (src/components/location-lab.tsx) as a static SPA.
   build.mjs defines process.env.NEXT_PUBLIC_TOSS_BUILD="1", which switches src/lib/toss-env.ts to the Toss mode:
   API calls go to https://www.thefount.co.kr/location/api/*, and the PDF/print, login-save, consultation,
   other-tool and off-app links are left out. The base map is OpenFreeMap (stubs/base-layer.tsx). */
import { createRoot } from "react-dom/client";
import "leaflet/dist/leaflet.css";
import "@/app/globals.css";
import "@/app/fount-brand.css";
import "@/app/fount-upgrade.css";
import LocationLab from "@/components/location-lab";
import "./toss.css";

createRoot(document.getElementById("root")!).render(<LocationLab />);
