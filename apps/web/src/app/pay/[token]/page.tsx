import { Checkout } from "@/components/Checkout";

export default function PayPage({ params }: { params: { token: string } }) {
  return <Checkout token={decodeURIComponent(params.token)} />;
}
