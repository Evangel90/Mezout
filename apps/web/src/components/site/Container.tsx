/** The page column used by every route except the landing page, which lays out its own full-width sections. */
export function Container({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="mx-auto w-full max-w-5xl px-4 py-10">{children}</div>;
}
