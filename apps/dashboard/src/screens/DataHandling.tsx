/**
 * What this console does with personal data, stated on the screen that does it.
 *
 * This is not boilerplate. An operator here can see where a named older person was
 * when they raised an alert, so the page says what is shown, why it is shown, how
 * long it is kept and what the console does not do. The claims are deliberately
 * narrow: each one is true of the build as it stands, and nothing is promised that
 * the code does not already enforce.
 */
export function DataHandling() {
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Data handling</h1>
          <p>What this console shows, and what it does not collect.</p>
        </div>
      </div>

      <section className="card stack" aria-labelledby="shown-heading">
        <h2 id="shown-heading">What is shown here</h2>
        <ul>
          <li>
            The name of the person who raised an emergency, and the location captured at the moment
            they raised it.
          </li>
          <li>
            The names and roles of the people in their care chain, because the point of the record
            is who was asked and in what order.
          </li>
          <li>
            One location for a responder, captured when they acknowledged. There is no background
            location and no proximity tracking: the responder is located once, at the moment they
            take responsibility.
          </li>
          <li>
            The severity factors behind each decision, so an escalation can be explained afterwards
            rather than taken on trust.
          </li>
        </ul>
        <p className="muted">
          Care level and home address are shown only where they explain a severity decision. Health
          information is not held by this system at all.
        </p>
      </section>

      <section className="card stack" aria-labelledby="storage-heading">
        <h2 id="storage-heading">What this browser stores</h2>
        <p>
          Your sign-in tokens, in this tab&apos;s session storage, so that moving between screens
          does not sign you out. They are discarded when the tab closes.
        </p>
        <p>
          This console sets no cookies, loads nothing from a third party, and contains no analytics
          or tracking of any kind. There is nothing here to consent to, which is why you are not
          asked to.
        </p>
      </section>

      <section className="card stack" aria-labelledby="retention-heading">
        <h2 id="retention-heading">How long records are kept</h2>
        <p>
          Emergency records and their audit trails are retained for the period set by the
          deployment, after which they are deleted. Retention is configured on the server and
          applies whether or not anyone opens this console.
        </p>
      </section>

      <section className="card stack" aria-labelledby="access-heading">
        <h2 id="access-heading">What an administrator can and cannot do</h2>
        <p>
          An administrator can read every emergency record and the reporting figures drawn from
          them. An administrator cannot acknowledge, resolve or redirect a live emergency: those
          belong to the people named in that elder&apos;s care chain, and the server refuses them
          from this account rather than this screen merely hiding the buttons.
        </p>
      </section>
    </>
  );
}
