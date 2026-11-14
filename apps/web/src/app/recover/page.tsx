import type { Metadata } from "next";
import { RecoverAccount } from "@/components/recover/RecoverAccount";

export const metadata: Metadata = {
  title: "Recover your account",
  description: "Lost the passkey for your Mezout account? Move it to a new passkey with your backup.",
  robots: { index: false },
};

export default function RecoverPage() {
  return <RecoverAccount />;
}
