# Funding Relationships

> at.fund is not a payment platform. It's the missing relationship layer
> between people who create value and people who want to sustain it.

## The challenge everyone already feels

You value things online. A working journalist whose coverage you rely on.
Open source tools you use every day. A podcast that shapes how you think
about your field. A Bluesky feed that curates your professional domain.
A labeler that keeps your timeline clean. Maybe a newsletter or two.

You'd support these people if it were straightforward. But it isn't:

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

Nobody does all of this. Almost nobody does half. Not because they're
cheap — because it's an unreasonable amount of cognitive overhead. The
people who manage it maintain spreadsheets. Literal spreadsheets of
their giving relationships.

On the other side, creators and builders know they have supporters who
*want* to give but don't. The gap between intent and action is real, and
no payment platform has closed it — because the problem isn't payment.
Payment is largely solved. The problem is **relationship management**:
knowing what you value, tracking your commitments, seeing the full
picture, and acting on it coherently.

## What at.fund makes possible

at.fund addresses the relationship layer — the space between "I value this"
and "I sustain this" — using ATProto as the substrate.

### For the user

Your endorsement records — stored in your own data repository, signed with
your identity, portable across any ATProto application — become your
**relationship portfolio**.

Not a list of subscriptions locked inside Patreon. Not recurring charges
buried in your credit card statement. A record that belongs to you — in
your repository, under your control, portable across applications — of
"these are the entities I've decided matter to me."

You don't have to be a funder to start. Endorsing something is a
statement of value: "this matters to me." Some of those relationships
will become funding relationships. Some won't. The portfolio tracks
both — and the clarity it provides makes the path from intent to
action visible.

at.fund reads your portfolio and shows you the full picture:

- Who you endorse (your stated intent)
- Who you actively fund (your demonstrated commitment)
- Where the gaps are (endorsed but not yet funding)
- How to close those gaps (grouped by platform, actionable in a few sessions)
- What's changed (new projects worth considering, dormant ones to revisit)

This is not a payment tool. It's a **relationship awareness tool** that
makes support — financial or otherwise — a natural consequence of clarity.

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

## How it works: two unilateral signals

at.fund uses two independent records, each stored in the respective
actor's own repository. Neither depends on the other. Neither requires
the other's cooperation.

```
┌─────────────────┐                    ┌─────────────────┐
│      User       │                    │    Steward       │
│                 │   fund.at.graph    │                  │
│  "I endorse     │────.endorse───────▶│                  │
│   this entity"  │                    │  "I acknowledge  │
│                 │◀──.acknowledge─────│   this person    │
│                 │                    │   as a funder"   │
└─────────────────┘                    └─────────────────┘
```

**The user's side:**

- `fund.at.graph.endorse` — "I vouch for this entity's work." A public
  statement of value. This is the portfolio entry.

**The steward's side:**

- `fund.at.funding.contribute` — "Here is where you can support me."
- `fund.at.funding.channel` / `plan` — Structured payment endpoints and tiers.
- `fund.at.graph.acknowledge` — "I recognize this person as a funder of
  my work."

There is no handshake. Each side speaks only for itself, and each
statement is always true with respect to the person making it. The user
is always right about who they endorse. The steward is always right about
who they acknowledge. The *relationship* is read from the combination —
and the mismatches are the most interesting part:

| Endorse | Acknowledge | What it tells you |
|---------|-------------|-------------------|
| Yes | Yes | Active, healthy funding relationship |
| Yes | No | Intent without action — a gap to close |
| No | Yes | A relationship that's drifted — a subscription to review |
| No | No | No relationship |

Every state is informative. The "endorse but not acknowledged" gap is
where at.fund helps users follow through. The "acknowledged but not
endorsed" state is the quiet signal that you've moved on but haven't
cleaned up — a reminder to cancel, or to reconsider.

No cryptographic exchange protocol. No escrow. No shared state. Just
two people each saying something true about their side of a relationship,
and the overlap (or lack of it) telling the story.

## The deeper graph: dependencies as shared infrastructure

The user-steward relationship is only the first layer. Stewards themselves
depend on other entities — libraries, infrastructure, tools, services —
and they declare those dependencies in their own repositories.

```
┌────────┐  endorses   ┌───────────┐  depends on  ┌────────────┐
│  User  │────────────▶│  Steward  │─────────────▶│ Dependency │
└────────┘             └───────────┘              └────────────┘
                             │                          ▲
                             │                          │
┌────────┐  endorses   ┌───────────┐  depends on        │
│  User  │────────────▶│  Steward  │────────────────────┘
└────────┘             └───────────┘
```

A **dependency** is anything a steward declares their work relies on: an
open source library, a hosting provider, a protocol tool, a shared
service. When multiple stewards that a user endorses share a common
dependency, that tells a story: *this dependency is load-bearing for
your ecosystem.*

You endorse a feed, a labeler, and a bot. All three depend on the same
ATProto SDK. You didn't know that — but now you can see that the thing
holding up three things you care about is itself unfunded. The
relationship graph reveals infrastructure that was previously invisible.

This isn't an npm-style technical dependency tree. It's a **provenance
chain** — each link is an assertion by someone you've chosen to trust.
The steward says "my work depends on this." You decide whether that
matters to you. The dependency isn't computed; it's communicated.

In future, this graph enables questions that no single platform can
answer: Which dependencies are shared across the things I care about?
Which are well-funded and which are fragile? Where does my ecosystem
have single points of failure? The relationships you've already
expressed — through endorsement — become the lens for seeing
infrastructure you never knew you relied on.

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
and acknowledgement records are ATProto data, readable by any application.
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

1. **Your data stays yours.** Your endorsements live in *your*
   repository. They're not locked inside a platform that might pivot,
   shut down, or change its terms. You can move them, back them up,
   or read them with any tool that speaks the protocol.

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
database can give you control of your own records.

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

**The acknowledgement layer.** A record that lets stewards say "I
recognize this person as a funder" — creating a two-sided relationship
signal without intermediating the payment. The match and mismatch
between endorsements and acknowledgements becomes the map of where
relationships are healthy, where they've lapsed, and where intent
hasn't yet become action.

**The coordination layer.** Endorsement data as input for matching
programs, foundation grants, and collective giving — where the signed,
verifiable nature of ATProto records provides the trust that
institutional funders need.

**The open protocol.** Lexicon schemas that any ATProto application can
read, so the funding relationship layer isn't locked inside at.fund
but is woven into the fabric of every application that touches the
ecosystem.

**Lexicon refinement.** The current dependency record is deliberately
simple — a pointer from one entity to another. Over time, there may
be value in an optional type field to distinguish between kinds of
dependencies (a project vs. a contributor vs. an infrastructure
provider). But simplicity is a feature, not a limitation. Each new
field is a decision every implementer must understand and every UI
must account for. We'd rather ship a small, clear vocabulary that
people actually use than a rich taxonomy that fragments adoption.
Refinement will follow real usage patterns, not speculation.

## The core belief

People want to sustain the things they value. The obstacle isn't
willingness — it's friction. Not payment friction (that's largely
solved) but **relationship friction**: knowing what you value, tracking
your commitments, seeing the gaps, and acting on them coherently.

at.fund exists to make funding relationships as legible, portable, and
manageable as the social relationships that ATProto already enables.

Humans with relationships, not wallets with graphs.
