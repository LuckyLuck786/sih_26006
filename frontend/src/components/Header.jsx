export default function Header() {
  return (
    <header className="border-b border-white/10 bg-[#071b2a] text-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 lg:px-8">
        <div className="flex items-center gap-3">
          <div
            className="grid h-10 w-10 place-items-center rounded-xl bg-teal-400 text-[#071b2a]"
            aria-hidden="true"
          >
            <span className="text-xl font-black">⌁</span>
          </div>
          <div>
            <p className="font-display text-lg font-bold tracking-tight">Harborline</p>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
              Charter intelligence
            </p>
          </div>
        </div>
        <div className="hidden items-center gap-3 text-sm text-slate-300 sm:flex">
          <span className="h-2 w-2 rounded-full bg-teal-400 shadow-[0_0_12px_#2dd4bf]" />
          East Coast desk
        </div>
      </div>
    </header>
  )
}
