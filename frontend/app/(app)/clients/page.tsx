import type { Metadata } from "next";
import { ClientsView } from "@/components/views/ClientsView";

export const metadata: Metadata = { title: "Clients" };

export default function ClientsPage() {
  return <ClientsView />;
}
