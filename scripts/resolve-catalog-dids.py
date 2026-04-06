#!/usr/bin/env python3
"""
Resolve catalog hostnames to DIDs and update catalog JSON files.

Tries multiple resolution strategies:
  1. Handle resolution via public.api.bsky.app (fastest for .bsky.social handles)
  2. .well-known/atproto-did on the hostname
  3. plc.directory reverse lookup (if we can find the DID)

Usage:
  python3 scripts/resolve-catalog-dids.py          # dry run (show what would change)
  python3 scripts/resolve-catalog-dids.py --write   # update catalog files in place
  python3 scripts/resolve-catalog-dids.py --remove  # also remove unresolvable entries
"""

import json
import os
import sys
import urllib.request
import urllib.error
from pathlib import Path

CATALOG_DIR = Path(__file__).parent.parent / "src" / "data" / "catalog"
TIMEOUT = 8  # seconds per request

def resolve_via_handle(handle: str) -> str | None:
    """Resolve a handle via the Bluesky public API."""
    url = f"https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle={handle}"
    try:
        req = urllib.request.Request(url, headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            data = json.loads(resp.read())
            did = data.get("did")
            if did and did.startswith("did:"):
                return did
    except Exception:
        pass
    return None


def resolve_via_wellknown(hostname: str) -> str | None:
    """Try .well-known/atproto-did on the hostname."""
    url = f"https://{hostname}/.well-known/atproto-did"
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            text = resp.read().decode().strip().strip('"')
            if text.startswith("did:"):
                return text
    except Exception:
        pass
    return None


def resolve_hostname(hostname: str, atproto_handle: str | None = None) -> str | None:
    """Try all resolution strategies for a hostname."""
    # Strategy 1: Use atprotoHandle if provided
    if atproto_handle:
        did = resolve_via_handle(atproto_handle)
        if did:
            return did

    # Strategy 2: Try the hostname as a handle
    did = resolve_via_handle(hostname)
    if did:
        return did

    # Strategy 3: Try .well-known/atproto-did
    did = resolve_via_wellknown(hostname)
    if did:
        return did

    # Strategy 4: If atprotoHandle differs, try well-known on it too
    if atproto_handle and atproto_handle != hostname:
        did = resolve_via_wellknown(atproto_handle)
        if did:
            return did

    return None


def main():
    write_mode = "--write" in sys.argv
    remove_mode = "--remove" in sys.argv

    if not CATALOG_DIR.is_dir():
        print(f"Error: catalog directory not found at {CATALOG_DIR}")
        sys.exit(1)

    files = sorted(CATALOG_DIR.glob("*.json"))
    print(f"Found {len(files)} catalog entries\n")

    resolved = []
    unresolved = []
    already_has_did = []

    for path in files:
        hostname = path.stem
        with open(path) as f:
            data = json.load(f)

        # Skip if already has a DID
        if data.get("did"):
            already_has_did.append((hostname, data["did"]))
            print(f"  ✓ {hostname} → {data['did']} (already set)")
            continue

        atproto_handle = data.get("atprotoHandle")
        did = resolve_hostname(hostname, atproto_handle)

        if did:
            resolved.append((hostname, did))
            via = f" (via {atproto_handle})" if atproto_handle else ""
            print(f"  ✓ {hostname} → {did}{via}")

            if write_mode:
                # Add did as the first field for readability
                new_data = {"did": did, **{k: v for k, v in data.items() if k != "did"}}
                with open(path, "w") as f:
                    json.dump(new_data, f, indent=2)
                    f.write("\n")
        else:
            unresolved.append(hostname)
            print(f"  ✗ {hostname} → UNRESOLVED")

            if write_mode and remove_mode:
                os.remove(path)
                print(f"    → removed {path.name}")

    # Summary
    print(f"\n{'─' * 60}")
    print(f"Already had DID: {len(already_has_did)}")
    print(f"Resolved:        {len(resolved)}")
    print(f"Unresolved:      {len(unresolved)}")
    print(f"Total:           {len(files)}")

    if unresolved:
        print(f"\nUnresolved hostnames:")
        for h in unresolved:
            print(f"  - {h}")

    if not write_mode:
        print(f"\nDry run — no files modified. Use --write to update catalog files.")
        if unresolved:
            print(f"Add --remove to also delete unresolvable entries.")


if __name__ == "__main__":
    main()
