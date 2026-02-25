import { redirect } from "next/navigation";
import { auth } from "@/lib/utils/auth";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar desktop */}
      <Sidebar
        userEmail={session.user.email ?? ""}
        userName={session.user.name}
        userRole={session.user.role}
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <MobileNav
          userEmail={session.user.email ?? ""}
          userName={session.user.name}
          userRole={session.user.role}
        />
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
