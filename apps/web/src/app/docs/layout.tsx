import { Container } from "@/components/site/Container";

export default function DocsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <Container>{children}</Container>;
}
