# Funding Relationships

> at.fund is not a payment platform. It's the missing relationship layer
> between people who create value and people who want to sustain it.

## The challenge

I value things online. A journalist whose coverage I rely on. Open source
tools I use every day. A podcast that shapes how I think about my field.
A Bluesky feed that curates my professional domain. A labeler that keeps
my timeline clean. A couple of newsletters.

I'd support these people if it were straightforward. But it isn't:

- Remembering who I value (across dozens of contexts, over months and years)
- Discovering whether they accept funding (not obvious — many do, buried
  in bios)
- Navigating to each platform (GitHub Sponsors, Patreon, Ko-fi, Open
  Collective, Stripe, Buy Me a Coffee, direct PayPal...)
- Creating accounts on platforms I don't use for anything else
- Setting up each contribution individually
- Tracking what I'm paying, to whom, through which platform
- Reviewing periodically: Am I still using this? Did they stop? Should I
  give more? Less?
- Noticing when something new I rely on deserves support

I don't do all of this. Almost nobody does. Not because we're cheap —
because it's an unreasonable amount of cognitive overhead. The people
who manage it maintain spreadsheets. Literal spreadsheets of their
giving relationships.

On the other side, creators and builders know they have supporters who
*want* to give but don't. The gap between intent and action is real, and
no payment platform has closed it — because the problem isn't payment.
Payment is largely solved. The problem is **relationship management**:
knowing what I value, tracking my commitments, seeing the full picture,
and acting on it coherently.

## What at.fund makes possible

at.fund addresses the relationship layer — the space between "I value
this" and "I sustain this" — using ATProto as the substrate.

### For the user

Endorsement records — stored in the user's own data repository, signed
with their identity, portable across any ATProto application — become a
**relationship portfolio**.

Not a list of subscriptions locked inside Patreon. Not recurring charges
buried in a credit card statement. A record that belongs to the user —
in their repository, under their control, portable across applications —
of "these are the entities I've decided matter to me."

A user doesn't have to be a funder to start. Endorsing something is a
statement of value: "this matters to me." Some of those relationships
will become funding relationships. Some won't. The portfolio tracks
both — and the clarity it provides makes the path from intent to
action visible.

at.fund reads the portfolio and shows the full picture:

- Who the user endorses (stated intent)
- Who they actively fund (demonstrated commitment)
- Where the gaps are (endorsed but not yet funding)
- How to close those gaps (grouped by platform, actionable in a few sessions)
- What's changed (new projects worth considering, dormant ones to revisit)

This is not a payment tool. It's a **relationship awareness tool** that
makes support — financial or otherwise — a natural consequence of clarity.

### For the steward

A steward publishes their funding information once — a contribute URL,
optionally structured channels and plans — into their ATProto repository.
It's cryptographically signed, tied to their identity, and readable by
any application that speaks the protocol.

at.fund shows stewards what no existing platform can:

- How many people publicly endorse their work (not followers — endorsers,
  who've made an active choice to vouch for them)
- How many of those endorsers actively fund them
- The endorsement-to-funding conversion rate — the gap between latent
  support and realized support
- The network context: who endorses them, who those people also endorse,
  how their work sits in the broader ecosystem

This is **legible demand**. It tells a steward not just that people use
their work, but that people have publicly committed to valuing it. That
signal is useful for their own decisions about sustainability, and it's
useful for foundations, corporate sponsors, and matching programs that
need to justify where to allocate resources.

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
endorsed" state is the quiet signal that someone has moved on but hasn't
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
the user's ecosystem.*

I endorse a feed, a labeler, and a bot. All three depend on the same
ATProto SDK. I didn't know that — but now I can see that the thing
holding up three things I care about is itself unfunded. The
relationship graph reveals infrastructure that was previously invisible.

This isn't an npm-style technical dependency tree. It's a **provenance
chain** — each link is an assertion by someone I've chosen to trust.
The steward says "my work depends on this." I decide whether that
matters to me. The dependency isn't computed; it's communicated.

In future, this graph enables questions that no single platform can
answer today: Which dependencies are shared across the things I care
about? Which are well-funded and which are fragile? Where does my
ecosystem have single points of failure? The relationships I've
already expressed — through endorsement — become the lens for seeing
infrastructure I never knew I relied on.

## What at.fund is not

**at.fund is not a payment processor.** It never touches money. It never
holds funds. It never takes a commission. Contributions flow through
whatever platform the steward has chosen — GitHub Sponsors, Open
Collective, Patreon, Ko-fi, direct bank transfer, or anything else.
at.fund is the map, not the territory.

**at.fund is not a subscription manager.** It doesn't start or stop
payments. It doesn't store payment methods. It shows the relationship
picture and helps people act on it. The action happens on the platforms
where money actually moves.

**at.fund is not a social network.** It's infrastructure. The endorsement
and acknowledgement records are ATProto data, readable by any application.
at.fund is one interface — perhaps the canonical one — but the records
belong to the users and can be consumed by any client: a podcast player
that knows a listener endorses a show, a feed reader that sees a user
supports the author, a Bluesky client that badges profiles someone has
vouched for.

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

Our thesis is that the protocol layer — specifically, ATProto's model of
signed, portable, user-controlled records — makes it possible to build
the relationship layer that all these domains need. Not a new payment
system. A new **awareness** system. One that makes existing payment
systems work better by giving people the clarity to use them intentionally.

### Why ATProto

The relationship layer needs three properties that most platforms can't
provide:

1. **The data stays with the user.** Endorsements live in the user's own
   repository. They're not locked inside a platform that might pivot,
   shut down, or change its terms. They can be moved, backed up, or read
   with any tool that speaks the protocol.

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
database can keep records under the user's control.

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
someone liked, but as a living document of their giving relationships.
What they intend to support, what they actively support, where the gaps
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

I want to sustain the things I value. The obstacle isn't willingness —
it's friction. Not payment friction (that's largely solved) but
**relationship friction**: knowing what I value, tracking my
commitments, seeing the gaps, and acting on them coherently.

We built at.fund to make funding relationships as legible, portable, and
manageable as the social relationships that ATProto already enables.

Humans with relationships, not wallets with graphs.
