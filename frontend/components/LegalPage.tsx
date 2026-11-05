import Link from "next/link";
import { Logo } from "@/components/brand";
import { Icon } from "@/components/icons";

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-cloud">
      <header className="mx-auto flex w-full max-w-[760px] items-center justify-between gap-4 px-4 py-6">
        <Link href="/" aria-label="TakeFlow home" className="rounded-[8px]">
          <Logo width={132} />
        </Link>
        <Link href="/" className="back">
          <Icon name="arrowLeft" className="icon icon-sm" />
          Back to home
        </Link>
      </header>
      <main className="mx-auto w-full max-w-[760px] px-4 pb-16">
        <article className="card card-body flex flex-col gap-4 pt-8 text-[15px] leading-relaxed text-ink-2">
          <h1 className="text-[28px] font-extrabold text-navy">{title}</h1>
          {children}
        </article>
      </main>
    </div>
  );
}
