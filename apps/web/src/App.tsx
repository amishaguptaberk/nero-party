import { Crown, Radio, Search, Users } from "lucide-react";

const steps = [
  { icon: Radio, label: "Create", copy: "Name the party and set max songs and minutes." },
  { icon: Users, label: "Invite", copy: "Share the room code and watch friends tune in." },
  { icon: Search, label: "Queue", copy: "Search iTunes previews and drop tracks into the room." },
  { icon: Crown, label: "Crown", copy: "Seal standings during the party, reveal the winner at the end." },
];

export function App() {
  return (
    <main className="min-h-screen bg-nero-bg text-nero-ink">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center px-6 py-10">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-nero-pink">
            <Radio className="h-5 w-5" />
          </div>
          <span className="text-2xl font-black tracking-tight">nero</span>
        </div>

        <div className="mt-16 grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.28em] text-nero-pink">Queue it. Cheer it. Crown it.</p>
            <h1 className="mt-5 max-w-3xl text-6xl font-black leading-none tracking-tight md:text-8xl">
              Listening parties with a final reveal.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-nero-dim">
              This scaffold is wired for a clean architecture build: iTunes search, Socket.IO party state, Prisma persistence, and a sealed scoring model.
            </p>
          </div>

          <div className="border border-white/10 bg-white/[0.04] p-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-nero-gold">Architecture slice</p>
                <h2 className="mt-1 text-2xl font-black">Ready for feature wiring</h2>
              </div>
              <Crown className="h-7 w-7 text-nero-gold" />
            </div>
            <div className="mt-4 grid gap-3">
              {steps.map((step) => (
                <div key={step.label} className="flex gap-3 bg-black/25 p-3">
                  <step.icon className="mt-1 h-5 w-5 shrink-0 text-nero-pink" />
                  <div>
                    <p className="font-bold">{step.label}</p>
                    <p className="text-sm leading-6 text-nero-dim">{step.copy}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

