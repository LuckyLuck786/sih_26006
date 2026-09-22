/**
 * Footer.
 *
 * Carries the three things a decision tool owes its user and which the
 * first version had none of: where the numbers come from, what the tool
 * does with your data, and what it is not. The disclaimer is not
 * boilerplate — this product recommends commercial commitments, so
 * stating that it is decision support rather than advice matters.
 */

const SOURCES = [
  ['Freight rates', 'Synthetic series, 140 lanes, generated from data/generate_reference_data.py'],
  ['Port restrictions', 'Draft, LOA, beam and handling rates per published port particulars'],
  ['Vessel positions', 'Data Docked AIS when configured, otherwise the tracked fleet'],
  ['Base map', 'OpenStreetMap contributors'],
]

export default function Footer() {
  return (
    <footer className="mt-10 border-t border-rule bg-sunken">
      <div className="mx-auto max-w-[1400px] px-5 py-8 lg:px-8">
        <div className="grid gap-8 md:grid-cols-[1.3fr_1fr_1fr]">
          <div>
            <p className="label">Data sources</p>
            <dl className="mt-3 space-y-2">
              {SOURCES.map(([term, detail]) => (
                <div key={term} className="text-[11px] leading-5">
                  <dt className="inline font-semibold text-ink">{term}: </dt>
                  <dd className="inline text-ink-muted">{detail}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div>
            <p className="label">Privacy</p>
            <p className="mt-3 text-[11px] leading-5 text-ink-muted">
              No account, no cookies, no analytics. Shipment details you enter are computed in your
              browser and are never transmitted or stored. The only outbound request is an optional
              vessel-position lookup, which sends a port coordinate and nothing else.
            </p>
          </div>

          <div>
            <p className="label">Terms</p>
            <p className="mt-3 text-[11px] leading-5 text-ink-muted">
              Decision support, not commercial or financial advice. Forecasts carry the stated error
              and interval coverage; outcomes will differ. Verify port restrictions and vessel
              particulars against current port authority and class records before fixing.
            </p>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-5">
          <p className="text-[11px] text-ink-faint">
            Harborline · Smart India Hackathon PS 26006 · Ministry of Steel / SAIL
          </p>
          <a
            href="https://github.com/LuckyLuck786/sih_26006"
            className="text-[11px] font-medium text-ink-muted underline underline-offset-2 hover:text-ink"
            target="_blank"
            rel="noreferrer"
          >
            Source and methodology
          </a>
        </div>
      </div>
    </footer>
  )
}
