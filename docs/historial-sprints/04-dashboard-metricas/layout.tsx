import { redirect } from "next/navigation";
import { getTenantContext, isAdminRole } from "@/lib/tenant";
import Nav from "@/components/nav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getTenantContext();

  // Sin sesión el middleware ya redirige a /login. Aquí falta solo el negocio.
  if (!ctx) redirect("/onboarding");

  return (
    <div className="min-h-screen bg-bg">
      <Nav businessName={ctx.tenant.name} isAdmin={isAdminRole(ctx.role)} />
      <main>{children}</main>
    </div>
  );
}
