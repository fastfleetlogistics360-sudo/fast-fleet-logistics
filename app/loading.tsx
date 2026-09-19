import { Skeleton } from "@/components/ui/skeleton";

export default function AppLoading() {
  return (
    <main className="min-h-[calc(100vh-4.5rem)] bg-[linear-gradient(180deg,#f8fafc,#eef3f8)] px-4 py-5 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="mt-5 h-48 w-full rounded-[22px]" />
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-36 rounded-[22px]" />)}
        </div>
      </div>
    </main>
  );
}
