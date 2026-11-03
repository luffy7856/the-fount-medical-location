/* Toss build stand-in for next/dynamic (client-only lazy component with a loading placeholder). */
import { lazy, Suspense, type ComponentType, type ReactNode } from "react";

export default function dynamic<P extends object>(loader: () => Promise<{ default: ComponentType<P> } | ComponentType<P>>, options?: { loading?: () => ReactNode; ssr?: boolean }) {
  const Lazy = lazy(async () => {
    const mod = await loader();
    return { default: ("default" in (mod as object) ? (mod as { default: ComponentType<P> }).default : mod) as ComponentType<P> };
  });
  return function DynamicComponent(props: P) {
    return <Suspense fallback={options?.loading ? options.loading() : null}><Lazy {...props} /></Suspense>;
  };
}
