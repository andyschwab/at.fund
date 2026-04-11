# The Funding Relationship Problem

> at.fund is not a payment platform. It's the missing relationship layer
> between people who create value and people who want to sustain it.

## The problem nobody has solved

The internet has a funding problem, but it's not the one people usually talk
about.

The usual framing: "How do we get people to pay for things?" This leads to
paywalls, subscriptions, tip jars, crypto micropayments, and increasingly
desperate calls to action. Each solution assumes the bottleneck is the
transaction — that if we could just make paying easier, people would pay.

But the actual bottleneck is upstream of payment. It's **relationship
management**.

Consider someone who genuinely wants to support the things they value online.
A working journalist. A few open source tools they rely on. A podcast. A
Bluesky feed that curates their professional domain. A labeler that keeps
their timeline clean. Maybe a newsletter or two.

Right now, supporting all of these means:

- Remembering who you value (across dozens of contexts, over months and years)
- Discovering whether they accept funding (not obvious — many do, buried in bios)
- Navigating to each platform (GitHub Sponsors, Patreon, Ko-fi, Open Collective,
  Stripe, Buy Me a Coffee, direct PayPal...)
- Creating accounts on platforms you don't use for anything else
- Setting up each contribution individually
- Tracking what you're paying, to whom, through which platform
- Reviewing periodically: Am I still using this? Did they stop? Should I
  give more? Less?
- Noticing when a new thing you rely on deserves support

Nobody does all of this. Almost nobody does half. Not because they're cheap —
because it's an unreasonable amount of cognitive overhead. The people who
manage it maintain spreadsheets. Literal spreadsheets of their giving
relationships.

The result: creators and builders have supporters who *want* to give but
don't, because the gap between intent and action is filled with friction that
no single payment platform can solve — because the friction isn't about
payment. It's about awareness, tracking, and cross-platform coordination.

## What at.fund makes possible

at.fund addresses the relationship layer — the space between "I value this"
and "I sustain this" — using ATProto as the substrate.

### For the person who gives

Your endorsement records — stored in your own data repository, signed with
your identity, portable across any ATProto application — become your
**giving portfolio**.

Not a list of subscriptions locked inside Patreon. Not recurring charges
buried in your credit card statement. A unified, self-sovereign record of
"these are the entities I've decided matter to me."

at.fund reads your portfolio and shows you the full picture:

- Who you endorse (your stated intent)
- Who you actively fund (your demonstrated commitment)
- Where the gaps are (endorsed but not yet funding)
- How to close those gaps (grouped by platform, actionable in a few sessions)
- What's changed (new projects worth considering, dormant ones to revisit)

This is not a payment tool. It's a **relationship awareness tool** that
makes payment a natural consequence of clarity.

### For the person who builds

You publish your funding information once — a contribute URL, optionally
structured channels and plans — into your ATProto repository. It's
cryptographically signed, tied to your identity, and readable by any
application that speaks the protocol.

at.fund shows you what no existing platform can:

- How many people publicly endorse your work (not followers — endorsers,
  who've made an active choice to vouch for you)
- How many of those endorsers actively fund you
- Your endorsement-to-funding conversion rate — the gap between latent
  support and realized support
- The network context: who endorses you, who they also endorse, how your
  work sits in the broader ecosystem

This is **legible demand**. It tells you not just that people use your work,
but that people have publicly committed to valuing it. That signal is useful
for your own decisions about sustainability, and it's useful for foundations,
corporate sponsors, and matching programs that need to justify where to
allocate resources.

## How it works: the two-sided attestation

at.fund uses two complementary signals, each stored in the respective
actor's own repository:

```
┌─────────────────┐                    ┌─────────────────┐
│     Giver       │                    │    Steward       │
│                 │   fund.at.graph    │                  │
│  "I endorse     │────.endorse───────▶│                  │
│   this entity"  │                    │  "This person    │
│                 │◀──.supporter───────│   funds me"      │
│  "I gave to     │   (or similar)     │                  │
│   this entity"  │                    │                  │
└─────────────────┘                    └─────────────────┘
```

**The giver's side:**

- `fund.at.graph.endorse` — "I vouch for this entity's work." A public
  statement of intent. This is the portfolio entry.
- `fund.at.graph.gave` — "I contributed to this entity." Not the amount,
  not the platform, just the signed fact. This converts intent into
  demonstrated commitment.

**The steward's side:**

- `fund.at.funding.contribute` — "Here is where you can support me."
- `fund.at.funding.channel` / `plan` — Structured payment endpoints and tiers.
- `fund.at.graph.supporter` — "This person actively funds my work." The
  steward's acknowledgment, closing the loop.

Neither side needs to trust the other's claim. Both records are independently
signed and independently verifiable. Together, they create a **two-sided
attestation** without requiring a cryptographic exchange protocol, an escrow
system, or any shared infrastructure.

The giver says "I gave." The steward says "They support me." If both records
exist, confidence is high. If only one exists, that's information too — maybe
the giver needs to update their records, or maybe the steward hasn't
acknowledged yet.

And critically: **the relationship signals when it's broken.** If you
unendorse but the supporter record remains, you know you have a subscription
to cancel. If you endorse but there's no supporter record, you know you
haven't followed through yet. The mismatch is the actionable signal.

## What at.fund is not

**at.fund is not a payment processor.** It never touches money. It never
holds funds. It never takes a commission. Contributions flow through
whatever platform the steward has chosen — GitHub Sponsors, Open Collective,
Patreon, Ko-fi, direct bank transfer, or anything else. at.fund is the
map, not the territory.

**at.fund is not a subscription manager.** It doesn't start or stop your
payments. It doesn't store your payment methods. It shows you the
relationship picture and helps you act on it. The action happens on
the platforms where money actually moves.

**at.fund is not a social network.** It's infrastructure. The endorsement
and supporter records are ATProto data, readable by any application.
at.fund is one interface — perhaps the canonical one — but the records
belong to the users and can be consumed by any client: a podcast player
that knows you endorse a show, a feed reader that sees you support the
author, a Bluesky client that badges profiles you've vouched for.

## The bigger picture

This isn't just an ATProto story. The funding relationship problem is
universal.

Journalism is in crisis not because people won't pay for news, but because
managing subscriptions to fifteen publications is untenable and nobody has
a unified view of their media support portfolio.

Open source sustainability isn't primarily a payment-rails problem. npm can
pipe money to packages. The problem is that maintainers can't see their
latent support base, and users can't see the full scope of what they
depend on and could sustain.

The creator economy's subscription fatigue isn't about price sensitivity.
It's about cognitive overhead: too many platforms, too many recurring
charges, no coherent picture of "what am I supporting and is it still
what I value?"

at.fund's thesis is that the protocol layer — specifically, ATProto's
model of signed, user-controlled, portable records — makes it possible
to build the relationship layer that all these domains need. Not a new
payment system. A new **awareness** system. One that makes existing
payment systems work better by giving people the clarity to use them
intentionally.

### Why ATProto

The relationship layer needs three properties that most platforms can't
provide:

1. **User sovereignty.** Your endorsements are *your* data, in *your*
   repository. They're not locked inside a platform that might pivot,
   shut down, or change its terms. They survive because they're yours.

2. **Cryptographic provenance.** When someone endorses an entity, that
   endorsement is signed with their DID. It can't be faked, can't be
   inflated, can't be manufactured by the entity being endorsed. This
   is what makes endorsement counts a trustworthy signal for
   institutional funders and matching programs.

3. **Cross-application readability.** Any ATProto application can read
   endorsement and funding records. The data isn't siloed in one app's
   database. A journalism reader, a podcast player, a social client,
   and at.fund itself all see the same relationships — because the
   relationships live in the protocol, not in any single application.

No DNS-based standard (funding.json, FUNDING.yml) can provide
cryptographic provenance. No platform-specific system (Patreon, GitHub
Sponsors) can provide cross-application readability. No centralized
database can provide user sovereignty.

ATProto provides all three. at.fund is the application layer that makes
them useful for funding relationships.

## The path forward

### What exists today

at.fund currently scans a user's ATProto account — their follows, feeds,
labelers, and tools — and discovers which of those services accept
funding. Users can endorse projects, creating signed records in their
repository. Stewards can publish funding information via a simple setup
flow.

The social signal works: "12 people you follow endorse this project" is
information that no static file or platform-specific page can provide.

### What comes next

**The portfolio view.** Endorsements presented not as a list of things
you liked, but as a living document of your giving relationships.
What you intend to support, what you actively support, where the gaps
are, and how to close them.

**The steward dashboard.** Endorsement analytics that show builders
their support base — not just who follows them, but who has publicly
committed to valuing their work, and how that converts to actual
funding.

**The giving attestation.** Records that let givers say "I gave" and
stewards say "they support me," creating a two-sided relationship
signal without intermediating the payment.

**The coordination layer.** Endorsement data as input for matching
programs, foundation grants, and collective giving — where the signed,
verifiable nature of ATProto records provides the trust that
institutional funders need.

**The open protocol.** Lexicon schemas that any ATProto application can
read, so the funding relationship layer isn't locked inside at.fund
but is woven into the fabric of every application that touches the
ecosystem.

## The core belief

People want to sustain the things they value. The obstacle isn't
willingness — it's friction. Not payment friction (that's largely
solved) but **relationship friction**: knowing what you value, tracking
your commitments, seeing the gaps, and acting on them coherently.

at.fund exists to make funding relationships as legible, portable, and
manageable as the social relationships that ATProto already enables.

Humans with relationships, not wallets with graphs.
